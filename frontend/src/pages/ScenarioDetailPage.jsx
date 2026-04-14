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
  saveCustomScenarioAnalysis,
  savePredefinedScenarioAnalysis,
} from "../utils/scenarioStorage";

function ScenarioDetailPage() {
  const { scenarioKind, scenarioId } = useParams();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(() => {
    if (location.state?.record) {
      return location.state.record;
    }

    if (scenarioKind === "ozel") {
      return loadCustomScenarioAnalysis(scenarioId);
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
          title: record.title || "Senaryo analizi",
          scenarioText: record.scenarioText,
        }
      : null;
  }, [record, scenarioId, scenarioKind]);

  const displayedResult = useMemo(
    () =>
      mapScenarioAnalysisResult(record?.result || null, {
        id: scenario?.id || record?.id || "",
        title: scenario?.title || record?.title || "",
        questionText: scenario?.questionText || "",
      }),
    [record, scenario]
  );

  const detailSummaryContent = useMemo(() => {
    if (displayedResult) {
      return {
        summaryParagraph:
          displayedResult.detailSummaryParagraph ||
          displayedResult.detailIntroSummary ||
          displayedResult.summaryIntro ||
          "",
        immediateActions: Array.isArray(displayedResult.summaryImmediateActions)
          ? displayedResult.summaryImmediateActions.filter(Boolean)
          : [],
      };
    }

    if (scenarioKind === "hazir" && scenario) {
      return {
        summaryParagraph: [scenario.shortAnalysisIntro, scenario.shortAnalysisRisk]
          .filter(Boolean)
          .join(" "),
        immediateActions: Array.isArray(scenario.shortImmediateActions)
          ? scenario.shortImmediateActions.filter(Boolean)
          : [],
      };
    }

    return {
      summaryParagraph: "",
      immediateActions: [],
    };
  }, [displayedResult, scenario, scenarioKind]);

  useEffect(() => {
    if (!location.state?.record) {
      return;
    }

    if (scenarioKind === "ozel") {
      saveCustomScenarioAnalysis(location.state.record);
    } else if (scenarioKind === "hazir") {
      savePredefinedScenarioAnalysis(location.state.record);
    }
  }, [location.state, scenarioKind]);

  useEffect(() => {
    if (scenarioKind === "ozel") {
      setLoading(false);
      setError(record ? "" : "Bu özel senaryonun detay verisi bulunamadı.");
      return;
    }

    const selectedScenario = getPredefinedScenarioById(scenarioId);
    if (!selectedScenario) {
      setLoading(false);
      setError("İstenen senaryo bulunamadı.");
      return;
    }

    if (record?.result) {
      setLoading(false);
      setError("");
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
          setError(requestError.message || "Detaylı analiz yüklenemedi. Lütfen tekrar deneyin.");
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

  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Senaryo Analizi"
          title={scenario?.title || "Detaylı analiz"}
          description="Bu ekranda özet yorum ile yapısal ThreatGraph AI sonucu aynı veri temeli üzerinden birlikte sunulur."
        />
      </section>

      <section className="container section-panel section-panel-workspace">
        <SurfaceCard title="Senaryo özeti" className="scenario-summary-card">
          {(scenario?.questionText || scenario?.scenarioText) && (
            <div className="scenario-summary-block">
              <p>{scenario.questionText || scenario.scenarioText}</p>
            </div>
          )}
          {detailSummaryContent.summaryParagraph ? (
            <div className="scenario-summary-block">
              <p className="scenario-summary-text">{detailSummaryContent.summaryParagraph}</p>
            </div>
          ) : null}
          {detailSummaryContent.immediateActions.length ? (
            <div className="scenario-summary-actions">
              <strong>İlk yapılması gerekenler</strong>
              <ul>
                {detailSummaryContent.immediateActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="hero-actions">
            <Link className="button button-secondary" to={`/senaryolar/${scenarioKind}/${scenarioId}`}>
              Senaryo analizine dön
            </Link>
            <Link className="button button-secondary" to="/senaryolar">
              Senaryo listesi
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="container section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Kapsamlı Analiz"
          title="Yapılandırılmış sonuçlar"
          description="Açıklama, artifact etkileri, ilişkili saldırılar, tactic akışı, savunma önerileri ve tanısal alanlar bu bölümde birlikte gösterilir."
        />

        {loading ? (
          <SurfaceCard
            title="Kapsamlı analiz hazırlanıyor"
            subtitle="ThreatGraph AI sonuçları bu çalışma alanına yükleniyor."
          />
        ) : error ? (
          <SurfaceCard title="Detay açılamadı" subtitle={error}>
            {scenarioKind === "hazir" ? (
              <p className="support-copy">
                Hazır senaryolar: {predefinedScenarios.length} kayıt üzerinden açılır. İsterseniz
                senaryo listesinden farklı bir kayıt seçebilirsiniz.
              </p>
            ) : (
              <p className="support-copy">
                Bu özel senaryonun detay verisi bulunamadı. Aynı senaryoyu yeniden yorumlayarak
                yeni bir özet ve detay akışı başlatabilirsiniz.
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
