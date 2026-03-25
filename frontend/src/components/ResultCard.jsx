function ResultCard({ title, value, list, code }) {
  return (
    <article className="result-card">
      <h2>{title}</h2>
      {value !== undefined ? <p>{value}</p> : null}
      {list ? (
        <ul>
          {list.map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : null}
      {code ? <pre>{code}</pre> : null}
    </article>
  );
}

export default ResultCard;
