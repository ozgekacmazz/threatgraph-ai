function GraphCanvasPlaceholder({
  title,
  description,
  compact = false,
  graphData,
  processing = false
}) {
  const artifactLabel = graphData?.artifactLabel || title;
  const attackCount = graphData?.attackCount ?? 0;
  const tacticCount = graphData?.tacticCount ?? 0;
  const defenseCount = graphData?.defenseCount ?? 0;

  return (
    <div
      className={`graph-canvas${compact ? " graph-canvas-compact" : ""}${
        processing ? " graph-canvas-processing" : ""
      }`}
    >
      <div className="graph-orbit graph-orbit-a" />
      <div className="graph-orbit graph-orbit-b" />
      <div className="graph-node graph-node-core">{artifactLabel}</div>
      <div className="graph-node graph-node-a">Artifact</div>
      <div className="graph-node graph-node-b">Attack</div>
      <div className="graph-node graph-node-c">Tactic</div>
      <div className="graph-node graph-node-d">Defense</div>
      {graphData ? (
        <div className="graph-status-strip">
          <span>{attackCount} attack</span>
          <span>{tacticCount} tactic</span>
          <span>{defenseCount} savunma</span>
        </div>
      ) : (
        <div className="graph-status-strip graph-status-strip-empty">
          <span>{processing ? "Graph hazırlanıyor" : "Hazır graph yüzeyi"}</span>
          <span>{processing ? "İlişkiler akıyor" : "Canlı bağlam bekleniyor"}</span>
        </div>
      )}
      <div className="graph-caption">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default GraphCanvasPlaceholder;
