const legendItems = [
  { label: "Artifact", type: "artifact" },
  { label: "Attack", type: "attack" },
  { label: "Tactic", type: "tactic" },
  { label: "Defense", type: "defense" }
];

function GraphLegend() {
  return (
    <div className="graph-legend">
      {legendItems.map((item) => (
        <div key={item.type} className="graph-legend-item">
          <span className={`graph-legend-swatch graph-legend-swatch-${item.type}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export default GraphLegend;
