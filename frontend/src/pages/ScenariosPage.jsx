import { Link } from "react-router-dom";
import ScenarioCard from "../components/ScenarioCard";
import SectionHeader from "../components/SectionHeader";
import { predefinedScenarios } from "../data/predefinedScenarios";

function ScenariosPage() {
  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Senaryolar"
          title="Hazır senaryoları inceleyin veya yeni bir senaryo yazın"
          description="Her senaryo önce kısa ve anlaşılır bir analizle açılır. Dilerseniz ardından kapsamlı ThreatGraph AI değerlendirmesine geçebilirsiniz."
        />
        <div className="page-intro-actions">
          <Link className="button button-primary" to="/senaryolar/yeni">
            Senaryo ekle
          </Link>
        </div>
      </section>

      <section className="container section-panel section-panel-dark">
        <div className="card-grid card-grid-3">
          {predefinedScenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              title={scenario.title}
              input={scenario.questionText}
              previewComment={scenario.shortPreview}
              to={`/senaryolar/hazir/${scenario.id}`}
              ctaLabel="Senaryo analizi"
              buttonVariant="scenarios"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default ScenariosPage;
