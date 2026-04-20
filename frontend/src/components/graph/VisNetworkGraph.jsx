import { useEffect, useMemo, useRef } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network/standalone";
import "vis-network/styles/vis-network.css";
import { buildVisNetworkData } from "./visNetworkAdapter";

function buildOptions(mode, options = {}) {
  const { forExport = false } = options;
  return {
    autoResize: true,
    layout: {
      improvedLayout: true,
      randomSeed: 17
    },
    physics: {
      enabled: true,
      solver: "barnesHut",
      stabilization: {
        enabled: true,
        iterations: forExport ? 1500 : 1200,
        updateInterval: forExport ? 30 : 40,
        fit: true
      },
      barnesHut: {
        gravitationalConstant:
          mode === "summary" ? (forExport ? -2150 : -2600) : (forExport ? -2700 : -3000),
        centralGravity: mode === "summary" ? (forExport ? 0.02 : 0.012) : forExport ? 0.012 : 0.01,
        springLength: mode === "summary" ? (forExport ? 175 : 190) : forExport ? 200 : 220,
        springConstant: 0.04,
        damping: forExport ? 0.7 : 0.6,
        avoidOverlap: forExport ? 2.2 : 1.5
      },
      minVelocity: forExport ? 0.45 : 0.65,
      maxVelocity: 32,
      timestep: 0.45
    },
    interaction: {
      hover: true,
      tooltipDelay: 120,
      dragNodes: true,
      dragView: true,
      zoomView: true,
      navigationButtons: false,
      keyboard: false
    },
    nodes: {
      font: {
        multi: "html"
      },
      scaling: {
        label: {
          enabled: true,
          min: forExport ? 15 : 12,
          max: forExport ? 28 : 22
        }
      },
      margin: forExport ? 20 : 10
    },
    edges: {
      color: {
        inherit: false
      },
      font: {
        align: "middle"
      },
      chosen: {
        edge(values) {
          values.width += 0.5;
        }
      }
    }
  };
}

function frameGraph(network, prepared, options = {}) {
  const { padding = 32, scale = 1 } = options;
  network.redraw();
  network.fit({
    nodes: prepared.nodes.map((node) => node.id),
    padding,
    animation: false
  });

  if (scale !== 1) {
    network.moveTo({
      position: network.getViewPosition(),
      scale: network.getScale() * scale,
      animation: false
    });
  }
}

function applyExportStyling(prepared) {
  return {
    ...prepared,
    nodes: prepared.nodes.map((node) => {
      const fontSize = Number(node.font?.size || 14);
      const isLargeFocus = fontSize >= 18;

      return {
        ...node,
        margin: 20,
        size: Math.round((node.size || 24) * (isLargeFocus ? 1.1 : 1.15)),
        font: {
          ...node.font,
          size: Math.max(fontSize + (isLargeFocus ? 3 : 4), 17),
          face: isLargeFocus ? "Segoe UI Semibold" : "Segoe UI",
          color: "#ffffff",
          vadjust: -2,
          strokeColor: "rgba(7, 18, 31, 0.96)",
          strokeWidth: 5
        },
        shadow: {
          ...node.shadow,
          enabled: true,
          size: isLargeFocus ? 30 : 20,
          color: isLargeFocus ? "rgba(124, 213, 255, 0.42)" : "rgba(6, 15, 28, 0.4)"
        }
      };
    }),
    edges: prepared.edges.map((edge) => {
      const fontSize = Number(edge.font?.size || 10);
      return {
        ...edge,
        width: (edge.width || 2) + 0.55,
        smooth: {
          ...edge.smooth,
          roundness: 0.2
        },
        arrows: {
          ...edge.arrows,
          to: {
            ...edge.arrows?.to,
            scaleFactor: (edge.arrows?.to?.scaleFactor || 0.7) + 0.08
          }
        },
        font: {
          ...edge.font,
          size: Math.max(fontSize + 3, 13),
          face: "Segoe UI Semibold",
          color: "#ffffff",
          background: "rgba(6, 17, 30, 0.96)",
          strokeColor: "rgba(6, 17, 30, 0.96)",
          strokeWidth: 6
        }
      };
    })
  };
}

export async function exportGraphAsPng(graph, options = {}) {
  const { mode = "summary", width = 1480, height = 900 } = options;
  const prepared = applyExportStyling(buildVisNetworkData(graph, mode));

  if (!prepared.nodes.length) {
    throw new Error("Graph görseli oluşturulamadı.");
  }

  const container = document.createElement("div");
  container.className = `vis-network-shell vis-network-shell-${mode}`;
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  container.style.pointerEvents = "none";
  container.style.opacity = "0";
  container.style.background = "#09131f";
  container.style.borderRadius = "20px";
  container.style.overflow = "hidden";

  document.body.appendChild(container);

  const nodes = new DataSet(prepared.nodes);
  const edges = new DataSet(prepared.edges);
  const network = new Network(container, { nodes, edges }, buildOptions(mode, { forExport: true }));

  try {
    await new Promise((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      network.once("stabilizationIterationsDone", () => {
        frameGraph(network, prepared, { padding: 8, scale: 1.14 });
        network.setOptions({ physics: { stabilization: { enabled: false } } });
        window.setTimeout(finish, 280);
      });

      window.setTimeout(finish, 3600);
    });

    frameGraph(network, prepared, { padding: 6, scale: 1.16 });
    await new Promise((resolve) => window.setTimeout(resolve, 220));

    const canvas = container.querySelector("canvas");
    if (!canvas) {
      throw new Error("Graph yüzeyi yakalanamadı.");
    }

    return canvas.toDataURL("image/png");
  } finally {
    network.destroy();
    container.remove();
  }
}

function VisNetworkGraph({ graph, mode }) {
  const containerRef = useRef(null);
  const networkRef = useRef(null);
  const refitTimeoutRef = useRef(null);
  const prepared = useMemo(() => buildVisNetworkData(graph, mode), [graph, mode]);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const nodes = new DataSet(prepared.nodes);
    const edges = new DataSet(prepared.edges);
    const network = new Network(
      containerRef.current,
      { nodes, edges },
      buildOptions(mode)
    );

    networkRef.current = network;

    const scheduleRefit = () => {
      if (refitTimeoutRef.current) {
        clearTimeout(refitTimeoutRef.current);
      }

      refitTimeoutRef.current = window.setTimeout(() => {
        network.redraw();
        frameGraph(network, prepared);
        refitTimeoutRef.current = null;
      }, 120);
    };

    network.redraw();
    frameGraph(network, prepared);

    network.once("stabilizationIterationsDone", () => {
      network.redraw();
      frameGraph(network, prepared);
      scheduleRefit();
      network.setOptions({ physics: { stabilization: { enabled: false } } });
    });

    network.on("doubleClick", () => {
      frameGraph(network, prepared);
    });

    const handleResize = () => {
      network.setSize("100%", "100%");
      network.redraw();
      frameGraph(network, prepared);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (refitTimeoutRef.current) {
        clearTimeout(refitTimeoutRef.current);
        refitTimeoutRef.current = null;
      }

      window.removeEventListener("resize", handleResize);
      network.destroy();
      networkRef.current = null;
    };
  }, [prepared, mode]);

  return (
    <div className={`vis-network-shell vis-network-shell-${mode}`}>
      <div ref={containerRef} className="vis-network-surface" />
    </div>
  );
}

export default VisNetworkGraph;
