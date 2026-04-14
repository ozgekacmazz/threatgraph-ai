import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import ScenarioAnalysisResults from "../components/ScenarioAnalysisResults";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import {
  getPredefinedScenarioById,
  predefinedScenarios,
} from "../data/predefinedScenarios";
import { analyzeScenario } from "../services/api";
import { mapScenarioAnalysisResult } from "../utils/scenarioAnalysis";
import {
  loadCustomScenarioAnalysis,
  loadPredefinedScenarioAnalysis,
  savePredefinedScenarioAnalysis,
} from "../utils/scenarioStorage";

function ScenarioDetailPage() {
  const { scenarioKind, scenarioId } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(scenarioKind === "hazir");
  const [error, setError] = useState("");
  const [record, setRecord] = useState(() => {
    if (scenarioKind === "ozel") {
      return location.state?.record || loadCustomScenarioAnalysis(scenarioId);
    }

    return loadPredefinedScenarioAnalysis(scenarioId);
  });

  const scenario = useMemo(() => {
    if (scenarioKind === "hazir") {
      return getPredefinedScenarioById(scenarioId);
    }

    return record
      ? {
          id: record.id,
          title: "Oluşturulan Senaryo",
          scenarioText: record.scenarioText,
          previewComment: null,
        }
      : null;
  }, [record, scenarioId, scenarioKind]);

  const displayedResult = useMemo(
    () => mapScenarioAnalysisResult(record?.result || null),
    [record]
  );

  useEffect(() => {
    if (scenarioKind === "ozel") {
      setLoading(false);
      setError(record ? "" : "Bu özel senaryonun detay verisi bulunamadı.");
      return;
    }

    if (scenarioKind !== "hazir") {
      setLoading(false);
      return;
    }

    const selectedScenario = getPredefinedScenarioById(scenarioId);
    if (!selectedScenario) {
      setLoading(false);
      setError("İstenen hazır senaryo bulunamadı.");
      return;
    }

    if (record?.result) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadAnalysis() {
      setLoading(true);
      setError("");

      try {
        const response = await analyzeScenario({ text: selectedScenario.scenarioText });
        if (cancelled) {
          return;
        }

        const nextRecord = {
          id: selectedScenario.id,
          type: "predefined",
          title: selectedScenario.title,
          scenarioText: selectedScenario.scenarioText,
          result: response,
          createdAt: new Date().toISOString(),
        };

        savePredefinedScenarioAnalysis(nextRecord);
        setRecord(nextRecord);
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError.message ||
              "Hazır senaryo analizi alınamadı. Lütfen tekrar deneyin."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalysis();

    return () => {
      cancelled = true;
    };
  }, [record, scenarioId, scenarioKind]);

  const detailTitle =
    scenarioKind === "hazir" ? "Hazır senaryo analizi" : "Senaryo detay analizi";

  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Senaryo Detayı"
          title={scenario?.title || detailTitle}
          description={
            scenario?.scenarioText ||
            "Bu sayfa uzun açıklama, analiz kartları, artifact çıkarımları, saldırılar, tactic'ler, savunmalar ve ML sıralamasını gösterir."
          }
        />
      </section>

      <section className="container section-panel section-panel-workspace">
        <div className="analysis-workspace-shell">
          <div className="analysis-main-column">
            <SurfaceCard
              title="Senaryo özeti"
              subtitle="Detay görünümü her iki senaryo türü için de aynı kapsamlı analiz bileşenini kullanır."
            >
              <div className="scenario-meta">
                <span>Senaryo tipi</span>
                <p>{scenarioKind === "hazir" ? "Hazır senaryo" : "Kullanıcı tarafından oluşturuldu"}</p>
              </div>
              {scenario?.previewComment ? (
                <div className="scenario-meta">
                  <span>Kısa yorum</span>
                  <p>{scenario.previewComment}</p>
                </div>
              ) : null}
              {displayedResult?.shortComment ? (
                <div className="scenario-meta">
                  <span>Analiz özeti</span>
                  <p>{displayedResult.shortComment}</p>
                </div>
              ) : null}
              <div className="hero-actions">
                <Link className="button button-secondary" to="/senaryolar">
                  Senaryo listesine dön
                </Link>
                <Link className="button button-secondary" to="/senaryolar/yeni">
                  Yeni senaryo yaz
                </Link>
              </div>
            </SurfaceCard>
          </div>

          <div className="analysis-side-column">
            <SurfaceCard
              title="Kapsam"
              subtitle="Uzun yapılandırılmış çıktı bu sayfada bir araya getirilir."
            >
              <div className="pill-grid">
                <span className="feature-pill">Uzun açıklama</span>
                <span className="feature-pill">Artifact'ler</span>
                <span className="feature-pill">Saldırılar</span>
                <span className="feature-pill">Tactic akışı</span>
                <span className="feature-pill">Savunmalar</span>
                <span className="feature-pill">ML ranking</span>
              </div>
            </SurfaceCard>
          </div>
        </div>
      </section>

      <section className="container section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Kapsamlı Analiz"
          title="Yapılandırılmış sonuçlar"
          description="Bu alan mevcut backend analiz mantığını kullanır ve sonuçları detaylı kartlar halinde sunar."
        />

        {loading ? (
          <SurfaceCard
            title="Senaryo analiz ediliyor"
            subtitle={
              scenarioKind === "hazir"
                ? "Hazır senaryo için backend'den kapsamlı sonuçlar alınıyor."
                : "Detay verisi hazırlanıyor."
            }
          />
        ) : error ? (
          <SurfaceCard title="Detay açılamadı" subtitle={error}>
            {scenarioKind === "hazir" ? (
              <p className="support-copy">
                Hazır senaryolar: {predefinedScenarios.length} adet kayıtlı seçenek üzerinden
                yüklenir. İsterseniz farklı bir senaryo deneyebilirsiniz.
              </p>
            ) : (
              <p className="support-copy">
                Bu özel senaryonun geçici analiz verisi bulunamadı. Aynı metni yeniden analiz
                ederek yeni bir detay kaydı oluşturabilirsiniz.
              </p>
            )}
          </SurfaceCard>
        ) : (
          <ScenarioAnalysisResults displayedResult={displayedResult} />
        )}
      </section>
    </div>
  );
}

export default ScenarioDetailPage;
