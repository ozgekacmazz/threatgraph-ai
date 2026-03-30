import { useMemo } from "react";
import GraphLegend from "./GraphLegend";
import GraphCanvasPlaceholder from "./GraphCanvasPlaceholder";
import SummaryGraphRenderer from "./graph/SummaryGraphRenderer";
import FullGraphRenderer from "./graph/FullGraphRenderer";
import { buildSummaryGraph } from "./graph/visNetworkAdapter";

function formatList(values, fallback) {
  if (!values?.length) {
    return fallback;
  }

  return values.slice(0, 3).join(", ");
}

function CompactGraphEmptyState({ title, description, tags = [] }) {
  return (
    <div className="graph-empty-state">
      <div className="graph-empty-state-copy">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {tags.length ? (
        <div className="graph-empty-state-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactGraphPreview({ graph, summary }) {
  const matchedArtifact = summary?.matchedArtifact || graph.focus?.matched_artifact || graph.focus?.artifact;
  const modeLabel = summary?.mode === "known" ? "Mevcut artifact analizi" : "Yeni artifact analizi";
  const summaryBlocks = [
    {
      label: "Girdi",
      value: summary?.inputArtifact || graph.focus?.artifact || "Belirtilmedi"
    },
    {
      label: "Eşleşme",
      value: summary?.matchedCategory
        ? `${matchedArtifact} • ${summary.matchedCategory}`
        : matchedArtifact || "Eşleşme bulunamadı"
    },
    {
      label: "Öncelikli saldırılar",
      value: formatList(summary?.directAttacks, "Doğrudan saldırı sinyali bulunamadı")
    },
    {
      label: "Doğrudan tactic",
      value: formatList(summary?.directTactics, "Doğrudan tactic sinyali bulunamadı")
    },
    {
      label: "Olası sonraki tactic",
      value: formatList(summary?.nextTactics, "Sonraki tactic sinyali bulunamadı")
    },
    {
      label: "Savunma odağı",
      value: formatList(summary?.defenses, "Öne çıkan savunma önerisi bulunamadı")
    }
  ];

  if (summary?.mayImpactArtifacts?.length || summary?.mayImpactAttacks?.length) {
    summaryBlocks.push({
      label: "Etki yayılımı",
      value: summary?.mayImpactArtifacts?.length
        ? `${formatList(summary.mayImpactArtifacts, "")}${
            summary?.mayImpactAttacks?.length
              ? ` • ${formatList(summary.mayImpactAttacks, "Ek saldırı sinyali yok")}`
              : ""
          }`
        : formatList(summary?.mayImpactAttacks, "Ek yayılım sinyali yok")
    });
  }

  return (
    <div className="graph-preview-card graph-preview-card-summary">
      <div className="graph-preview-head">
        <strong>{matchedArtifact || "ThreatGraph özeti"}</strong>
        <p>
          {summary?.lowConfidenceReason
            ? "Karar desteği düşük güven notuyla birlikte sunuluyor."
            : `${modeLabel} için saldırı, tactic, savunma ve etki yayılımı sinyalleri özetleniyor.`}
        </p>
      </div>
      <div className="graph-summary-grid">
        {summaryBlocks.map((block) => (
          <div key={block.label} className="graph-summary-block">
            <span>{block.label}</span>
            <strong>{block.value}</strong>
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
  emptyTags,
  compactSummary,
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
    if (compact) {
      return <CompactGraphEmptyState title={emptyTitle} description={emptyDescription} tags={emptyTags} />;
    }

    return <GraphCanvasPlaceholder compact={compact} title={emptyTitle} description={emptyDescription} />;
  }

  if (compact) {
    return <CompactGraphPreview graph={preparedGraph} summary={compactSummary} />;
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
