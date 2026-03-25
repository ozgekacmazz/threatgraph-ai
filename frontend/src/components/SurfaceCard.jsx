function SurfaceCard({ title, subtitle, children, className = "" }) {
  return (
    <article className={`surface-card ${className}`.trim()}>
      {title || subtitle ? (
        <header className="surface-card-header">
          {title ? <h3>{title}</h3> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </article>
  );
}

export default SurfaceCard;
