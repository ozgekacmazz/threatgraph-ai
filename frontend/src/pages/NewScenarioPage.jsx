import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import { analyzeScenario } from "../services/api";
import { mapScenarioAnalysisResult } from "../utils/scenarioAnalysis";
import {
  buildCustomScenarioId,
  saveCustomScenarioAnalysis,
} from "../utils/scenarioStorage";

const starterScenario = "Phishing sonrası credential ele geçirilirse ne olur?";
const scenarioSuggestions = [
  "Phishing sonrası kimlik bilgileri ele geçirilirse ne olabilir?",
  "Oturum çerezi çalınırsa saldırgan ne yapabilir?",
  "Zararlı bir dosya çalıştırılırsa hangi aşamalar görülebilir?",
  "Şüpheli DNS trafiği neyin işareti olabilir?",
];

function NewScenarioPage() {
  const navigate = useNavigate();
  const [scenarioText, setScenarioText] = useState(starterScenario);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resultRecord, setResultRecord] = useState(null);
  const resultRef = useRef(null);

  const displayedResult = useMemo(
    () => mapScenarioAnalysisResult(resultRecord?.result || null),
    [resultRecord]
  );

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
        scenarioText: trimmedScenario,
        result: response,
        createdAt: new Date().toISOString(),
      };

      saveCustomScenarioAnalysis(record);
      setResultRecord(record);
      window.requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
          title="Senaryonu yaz, kısa yorumu önce gör"
          description="Mevcut serbest metin deneyimi korunur. Türkçe veya İngilizce bir senaryo yazın; sistem önce kısa bir yorum üretir, tam yapılandırılmış analiz ise detay sayfasında açılır."
        />
      </section>

      <section className="container section-panel section-panel-workspace">
        <div className="analysis-workspace-shell">
          <div className="analysis-main-column">
            <SurfaceCard
              title="Senaryonu anlat"
              subtitle="Türkçe, İngilizce veya karışık dil kullanabilirsiniz. Sistem mevcut analiz hattını kullanarak yorumu üretir."
            >
              <form className="analysis-form-advanced" onSubmit={handleSubmit}>
                <label className="field">
                  <span>Senaryo metni</span>
                  <textarea
                    value={scenarioText}
                    onChange={(event) => setScenarioText(event.target.value)}
                    placeholder="Örnek: Phishing sonrası kimlik bilgileri ele geçirilirse ne olabilir?"
                  />
                </label>
                <p className="field-help">
                  Örneğin kimlik bilgisi ele geçirilmesi, oturum çalınması, zararlı dosya
                  çalıştırılması veya şüpheli ağ trafiği durumunu yazabilirsiniz.
                </p>
                {!resultRecord && !loading ? (
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
                ) : null}
                {error ? <p className="helper-note helper-note-warning">{error}</p> : null}
                <div className="hero-actions">
                  <button className="button button-primary" type="submit" disabled={loading}>
                    {loading ? "Senaryo analiz ediliyor..." : "Senaryoyu analiz et"}
                  </button>
                  <Link className="button button-secondary" to="/senaryolar">
                    Hazır senaryolara dön
                  </Link>
                </div>
              </form>
            </SurfaceCard>
          </div>

          <div className="analysis-side-column">
            <SurfaceCard
              title="Bu akış ne üretir?"
              subtitle="Kısa yorum önde tutulur, detaylı çıktı ayrı rota üzerinden açılır."
            >
              <div className="pill-grid">
                <span className="feature-pill">Artifact çıkarımı</span>
                <span className="feature-pill">Saldırı ipuçları</span>
                <span className="feature-pill">Intent tespiti</span>
                <span className="feature-pill">Graph reasoning</span>
                <span className="feature-pill">ML ranking</span>
                <span className="feature-pill">Savunma önerileri</span>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </section>

      <section className="container section-panel section-panel-dark" ref={resultRef}>
        <SectionHeader
          eyebrow="Kısa Yorum"
          title="Önce yorum, sonra detay"
          description="Analiz tamamlandığında burada kısa özet gösterilir. Tam yapılandırılmış sonuçlar ayrı detay sayfasında açılır."
        />

        {displayedResult && resultRecord ? (
          <div className="card-grid">
            <SurfaceCard
              title={displayedResult.explanationTitle}
              subtitle="Bu özet, uzun sonuçları ilk ekranda yığmadan hızlı yorum almanızı sağlar."
              className="scenario-summary-card"
            >
              <p className="scenario-summary-text">{displayedResult.shortComment}</p>
              <div className="hero-actions">
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() =>
                    navigate(`/senaryolar/ozel/${resultRecord.id}`, {
                      state: { record: resultRecord },
                    })
                  }
                >
                  Detaylı yorumu aç
                </button>
              </div>
            </SurfaceCard>
          </div>
        ) : (
          <SurfaceCard
            title="Henüz analiz yok"
            subtitle="Bir senaryo gönderdiğinizde burada önce kısa yorum görünecek."
          />
        )}
      </section>
    </div>
  );
}

export default NewScenarioPage;
