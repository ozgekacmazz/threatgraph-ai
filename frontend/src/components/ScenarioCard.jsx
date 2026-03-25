import { Link } from "react-router-dom";
import SurfaceCard from "./SurfaceCard";

function ScenarioCard({ title, subtitle, input, matchedArtifact, whyItMatters, analysisMode = "known" }) {
  const query = new URLSearchParams({
    artifact_name: matchedArtifact,
    description: input,
    mode: analysisMode
  }).toString();

  return (
    <SurfaceCard className="scenario-card" title={title} subtitle={subtitle}>
      <div className="scenario-meta">
        <span>Girdi</span>
        <p>{input}</p>
      </div>
      <div className="scenario-meta">
        <span>Eşleşen Artifact</span>
        <p>{matchedArtifact}</p>
      </div>
      <div className="scenario-meta">
        <span>Neden Önemli?</span>
        <p>{whyItMatters}</p>
      </div>
      <Link className="button button-secondary scenario-card-cta" to={`/analiz?${query}`}>
        Bu senaryoyu analiz et
      </Link>
    </SurfaceCard>
  );
}

export default ScenarioCard;
