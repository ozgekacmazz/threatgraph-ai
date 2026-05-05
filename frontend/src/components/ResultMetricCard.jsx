function renderStructuredItem(item) {
  if (typeof item === "string") {
    return <span>{item}</span>;
  }

  return (
    <div
      className={`metric-structured-item${
        item.emphasis ? ` metric-structured-item-${item.emphasis}` : ""
      }`}
    >
      <strong>{item.title}</strong>
      {item.meta ? <span className="metric-item-meta">{item.meta}</span> : null}
      {item.description ? <p>{item.description}</p> : null}
    </div>
  );
}

function ResultMetricCard({ title, value, helper, items, tone = "default", className = "" }) {
  return (
    <article className={`result-metric-card result-metric-card-${tone} ${className}`.trim()}>
      <span className="metric-label">{title}</span>
      {value !== undefined && value !== null && value !== "" ? (
        <p className="metric-value">{value}</p>
      ) : null}
      {helper ? <p className="metric-helper">{helper}</p> : null}
      {items?.length ? (
        <ul className="metric-list">
          {items.map((item, index) => (
            <li key={`${title}-${typeof item === "string" ? item : item.title}-${index}`}>
              {renderStructuredItem(item)}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export default ResultMetricCard;
