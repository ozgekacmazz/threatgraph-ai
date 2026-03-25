function SectionHeader({ eyebrow, title, description, align = "left" }) {
  return (
    <div className={`section-header section-header-${align}`}>
      {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
      <h2>{title}</h2>
      {description ? <p className="section-description">{description}</p> : null}
    </div>
  );
}

export default SectionHeader;
