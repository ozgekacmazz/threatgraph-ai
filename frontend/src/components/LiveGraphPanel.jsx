import { useMemo } from "react";
import GraphLegend from "./GraphLegend";
import GraphCanvasPlaceholder from "./GraphCanvasPlaceholder";
import SummaryGraphRenderer from "./graph/SummaryGraphRenderer";
import FullGraphRenderer from "./graph/FullGraphRenderer";
import { buildPreviewSections } from "./graph/graphModel";
import { buildSummaryGraph } from "./graph/visNetworkAdapter";

function CompactGraphPreview({ graph }) {
  const sections = buildPreviewSections(graph);

  return (
    <div className="graph-preview-card">
      <div className="graph-preview-head">
        <strong>{graph.focus?.matched_artifact || graph.focus?.artifact || "ThreatGraph Preview"}</strong>
        <p>Dar panel için sadeleştirilmiş karar zinciri ön izlemesi</p>
      </div>
      <div className="graph-preview-flow">
        {sections.map((section) => (
          <div key={section.label} className={`graph-preview-step graph-preview-step-${section.type}`}>
            <span>{section.label}</span>
            <strong>{section.items.join(" • ")}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveGraphPanel({
  graph,
  loading,
  error,
  compact = false,
  emptyTitle,
  emptyDescription,
  viewMode
}) {
  const resolvedViewMode = viewMode || (compact ? "summary" : "full");
  const preparedGraph = useMemo(() => (compact ? buildSummaryGraph(graph) : graph), [compact, graph]);

  if (loading) {
    return (
      <div className={`graph-live-shell${compact ? " graph-live-shell-compact" : ""}`}>
        <div className="analysis-status-card analysis-status-card-loading graph-live-status graph-live-status-loading">
          <span className="panel-spinner" aria-hidden="true" />
          <div>
            <strong>Graph hazırlanıyor...</strong>
            <p>ThreatGraph AI, Neo4j tabanlı ilişkisel görünümü karar odaklı biçimde hazırlıyor.</p>
          </div>
        </div>
        <GraphCanvasPlaceholder
          compact={compact}
          title="Görselleştirme hazırlanıyor"
          description="Düğümler ve ilişkiler yüklenirken graph yüzeyi canlı olarak hazırlanıyor."
          processing
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`graph-live-shell${compact ? " graph-live-shell-compact" : ""}`}>
        <div className="error-box graph-live-status">{error}</div>
      </div>
    );
  }

  if (!preparedGraph?.nodes?.length) {
    return <GraphCanvasPlaceholder compact={compact} title={emptyTitle} description={emptyDescription} />;
  }

  if (compact) {
    return <CompactGraphPreview graph={preparedGraph} />;
  }

  return (
    <div className="graph-live-shell graph-live-shell-enter">
      <div className="graph-live-header">
        <div>
          <strong>{preparedGraph.focus?.matched_artifact || preparedGraph.focus?.artifact || "ThreatGraph Focus"}</strong>
          <p>
            {preparedGraph.focus?.analysis_mode === "known"
              ? "Mevcut artifact için canlı attack intelligence görünümü"
              : "Yeni artifact akışından türetilen canlı graph bağlamı"}
          </p>
        </div>
        <GraphLegend />
      </div>

      <div
        className={`graph-flow-container graph-flow-container-live${
          resolvedViewMode === "full" ? " graph-flow-container-full" : " graph-flow-container-summary"
        }`}
      >
        {resolvedViewMode === "summary" ? (
          <SummaryGraphRenderer graph={preparedGraph} />
        ) : (
          <FullGraphRenderer graph={preparedGraph} />
        )}
      </div>
    </div>
  );
}

export default LiveGraphPanel;
