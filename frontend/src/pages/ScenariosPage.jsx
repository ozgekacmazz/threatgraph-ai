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
          title="Hazır senaryoları açın veya yeni bir senaryo yazın"
          description="Bu sayfa ana senaryo giriş noktasıdır. Dört hazır senaryoyu doğrudan açabilir ya da mevcut analiz akışını kullanarak kendi senaryonuzu oluşturabilirsiniz."
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
              subtitle="Hazır senaryo"
              input={scenario.scenarioText}
              previewComment={scenario.previewComment}
              to={`/senaryolar/hazir/${scenario.id}`}
              ctaLabel="Detay sayfasını aç"
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default ScenariosPage;
