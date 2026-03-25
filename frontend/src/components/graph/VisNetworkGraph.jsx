import { useEffect, useMemo, useRef } from "react";
import { DataSet } from "vis-data";
import { Network } from "vis-network/standalone";
import "vis-network/styles/vis-network.css";
import { buildVisNetworkData } from "./visNetworkAdapter";

function buildOptions(mode) {
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
        iterations: 1200,
        updateInterval: 40,
        fit: true
      },
      barnesHut: {
        gravitationalConstant: mode === "summary" ? -2600 : -3000,
        centralGravity: mode === "summary" ? 0.012 : 0.01,
        springLength: mode === "summary" ? 190 : 220,
        springConstant: 0.04,
        damping: 0.6,
        avoidOverlap: 1.5
      },
      minVelocity: 0.65,
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
          min: 12,
          max: 22
        }
      }
    },
    edges: {
      color: {
        inherit: false
      },
      chosen: {
        edge(values) {
          values.width += 0.5;
        }
      }
    }
  };
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

    const frameGraph = () => {
      network.redraw();
      network.fit({
        nodes: prepared.nodes.map((node) => node.id),
        padding: 32,
        animation: false
      });
    };

    const scheduleRefit = () => {
      if (refitTimeoutRef.current) {
        clearTimeout(refitTimeoutRef.current);
      }

      refitTimeoutRef.current = window.setTimeout(() => {
        network.redraw();
        frameGraph();
        refitTimeoutRef.current = null;
      }, 120);
    };

    network.redraw();
    frameGraph();

    network.once("stabilizationIterationsDone", () => {
      network.redraw();
      frameGraph();
      scheduleRefit();
      network.setOptions({ physics: { stabilization: { enabled: false } } });
    });

    network.on("doubleClick", () => {
      frameGraph();
    });

    const handleResize = () => {
      network.setSize("100%", "100%");
      network.redraw();
      frameGraph();
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
