import { Link } from "react-router-dom";
import SurfaceCard from "./SurfaceCard";

function clampPreview(value, maxLength = 150) {
  const normalizedValue = String(value || "").replace(/\s+/g, " ").trim();
  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, maxLength).trimEnd()}...`;
}

function ScenarioCard({
  title,
  input,
  previewComment,
  to,
  ctaLabel = "Analizi g\u00F6r\u00FCnt\u00FCle",
  buttonVariant,
}) {
  const targetRoute = to || "/senaryolar";
  const ctaClassName = ["button", "button-secondary", "scenario-card-cta"];

  if (buttonVariant === "home") {
    ctaClassName.push("scenario-card-cta-home");
  }

  if (buttonVariant === "scenarios") {
    ctaClassName.push("scenario-card-cta-scenarios");
  }

  return (
    <SurfaceCard className="scenario-card" title={title}>
      {input ? <p className="scenario-card-copy">{clampPreview(input, 160)}</p> : null}
      {previewComment ? (
        <p className="scenario-card-preview">{clampPreview(previewComment, 140)}</p>
      ) : null}
      <Link className={ctaClassName.join(" ")} to={targetRoute}>
        {ctaLabel}
      </Link>
    </SurfaceCard>
  );
}

export default ScenarioCard;
