import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import { analyzeScenario } from "../services/api";
import {
  buildCustomScenarioId,
  saveCustomScenarioAnalysis,
} from "../utils/scenarioStorage";

const scenarioSuggestions = [
  "Phishing sonrası kimlik bilgileri ele geçirilirse ne olabilir?",
  "Oturum çerezi çalınırsa saldırgan ne yapabilir?",
  "Zararlı bir dosya çalıştırılırsa hangi aşamalar görülebilir?",
  "Şüpheli DNS trafiği neyin işareti olabilir?",
];

function buildCustomScenarioTitle(text) {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) {
    return "Senaryo analizi";
  }

  const firstSentence = normalizedText.match(/.+?[.!?](?=\s|$)/)?.[0] || normalizedText;
  const trimmedSentence = firstSentence.trim();

  if (trimmedSentence.length <= 90) {
    return trimmedSentence;
  }

  return "Senaryo analizi";
}

function NewScenarioPage() {
  const navigate = useNavigate();
  const [scenarioText, setScenarioText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();

    const trimmedScenario = scenarioText.trim();
    if (!trimmedScenario) {
      setError("Lütfen analiz etmek istediğiniz senaryoyu yazın.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await analyzeScenario({ text: trimmedScenario });
      const record = {
        id: buildCustomScenarioId(),
        type: "custom",
        title: buildCustomScenarioTitle(trimmedScenario),
        scenarioText: trimmedScenario,
        result: response && typeof response === "object" ? response : {},
        createdAt: new Date().toISOString(),
      };

      saveCustomScenarioAnalysis(record);
      navigate(`/senaryolar/ozel/${record.id}`, {
        state: { record },
      });
    } catch (requestError) {
      setError(
        requestError.message ||
          "Senaryo analizi tamamlanamadı. Lütfen metni gözden geçirip tekrar deneyin."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Yeni Senaryo"
          title="Senaryonu yaz"
          description="Türkçe veya İngilizce bir senaryo girin. Analiz tamamlandığında önce senaryo analizi ekranına yönlendirilirsiniz; kapsamlı değerlendirme ayrı çalışma alanında açılır."
        />
      </section>

      <section className="container section-panel section-panel-workspace">
        <div className="analysis-workspace-shell">
          <div className="analysis-main-column">
            <SurfaceCard
              title="Senaryo metni"
              subtitle="Doğal dilde yazılmış senaryo mevcut analiz hattına bağlanır ve önce okunabilir bir değerlendirme üretilir."
            >
              <form className="analysis-form-advanced" onSubmit={handleSubmit}>
                <label className="field">
                  <span>Senaryoyu anlat</span>
                  <textarea
                    value={scenarioText}
                    onChange={(event) => setScenarioText(event.target.value)}
                    placeholder="Örnek: Phishing sonrası kimlik bilgileri ele geçirilirse ne olabilir?"
                  />
                </label>
                <p className="field-help">
                  Kimlik bilgisi ele geçirilmesi, oturum devralma, zararlı dosya çalıştırılması
                  veya şüpheli ağ davranışı gibi olayları serbest metinle yazabilirsiniz.
                </p>
                <div className="scenario-suggestion-strip">
                  {scenarioSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="button button-secondary button-small scenario-suggestion-chip"
                      onClick={() => {
                        setScenarioText(suggestion);
                        setError("");
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                {error ? <p className="helper-note helper-note-warning">{error}</p> : null}
                <div className="hero-actions">
                  <button className="button button-primary" type="submit" disabled={loading}>
                    {loading ? "Senaryo analizi hazırlanıyor..." : "Senaryo analizini oluştur"}
                  </button>
                  <Link className="button button-secondary" to="/senaryolar">
                    Hazır senaryolara dön
                  </Link>
                </div>
              </form>
            </SurfaceCard>
          </div>
        </div>
      </section>
    </div>
  );
}

export default NewScenarioPage;
