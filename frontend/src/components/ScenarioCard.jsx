import { Link } from "react-router-dom";
import SurfaceCard from "./SurfaceCard";

function ScenarioCard({
  title,
  subtitle,
  input,
  matchedArtifact,
  whyItMatters,
  previewComment,
  to,
  ctaLabel = "Bu senaryoyu aç",
  analysisMode = "known",
}) {
  const query =
    !to && matchedArtifact
      ? new URLSearchParams({
          artifact_name: matchedArtifact,
          description: input,
          mode: analysisMode,
        }).toString()
      : null;
  const targetRoute = to || (query ? `/analiz?${query}` : "/senaryolar");

  return (
    <SurfaceCard className="scenario-card" title={title} subtitle={subtitle}>
      {input ? (
        <div className="scenario-meta">
          <span>Senaryo</span>
          <p>{input}</p>
        </div>
      ) : null}
      {previewComment ? (
        <div className="scenario-meta">
          <span>Kısa yorum</span>
          <p>{previewComment}</p>
        </div>
      ) : null}
      {matchedArtifact ? (
        <div className="scenario-meta">
          <span>Eşleşen Artifact</span>
          <p>{matchedArtifact}</p>
        </div>
      ) : null}
      {whyItMatters ? (
        <div className="scenario-meta">
          <span>Neden Önemli?</span>
          <p>{whyItMatters}</p>
        </div>
      ) : null}
      <Link className="button button-secondary scenario-card-cta" to={targetRoute}>
        {ctaLabel}
      </Link>
    </SurfaceCard>
  );
}

export default ScenarioCard;
