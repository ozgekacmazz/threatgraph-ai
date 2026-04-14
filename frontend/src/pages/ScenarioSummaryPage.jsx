import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import { getPredefinedScenarioById } from "../data/predefinedScenarios";
import { analyzeScenario } from "../services/api";
import { mapScenarioAnalysisResult } from "../utils/scenarioAnalysis";
import {
  loadCustomScenarioAnalysis,
  loadPredefinedScenarioAnalysis,
  saveCustomScenarioAnalysis,
  savePredefinedScenarioAnalysis,
} from "../utils/scenarioStorage";

function ScenarioSummaryPage() {
  const { scenarioKind, scenarioId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isCustomScenario = scenarioKind === "ozel";
  const isPredefinedScenario = scenarioKind === "hazir";
  const [loading, setLoading] = useState(scenarioKind === "hazir");
  const [error, setError] = useState("");
  const [record, setRecord] = useState(() => {
    const routeRecord =
      location.state?.record && typeof location.state.record === "object"
        ? location.state.record
        : null;

    if (isCustomScenario) {
      return routeRecord || loadCustomScenarioAnalysis(scenarioId);
    }

    if (isPredefinedScenario) {
      return routeRecord || loadPredefinedScenarioAnalysis(scenarioId);
    }

    return null;
  });

  useEffect(() => {
    if (isCustomScenario && location.state?.record) {
      saveCustomScenarioAnalysis(location.state.record);
      setRecord(location.state.record);
    }
  }, [isCustomScenario, location.state]);

  useEffect(() => {
    if (isPredefinedScenario && location.state?.record) {
      savePredefinedScenarioAnalysis(location.state.record);
      setRecord(location.state.record);
    }
  }, [isPredefinedScenario, location.state]);

  useEffect(() => {
    if (!scenarioId || (!isCustomScenario && !isPredefinedScenario)) {
      setLoading(false);
      setError("Senaryo bulunamadı.");
      return;
    }

    if (isCustomScenario) {
      setLoading(false);
      setError(record ? "" : "Senaryo bulunamadı.");
      return;
    }

    const scenario = getPredefinedScenarioById(scenarioId);
    if (!scenario) {
      setLoading(false);
      setError("Senaryo bulunamadı.");
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
        const response = await analyzeScenario({ text: scenario.scenarioText });
        if (cancelled) {
          return;
        }

        const nextRecord = {
          id: scenario.id,
          type: "predefined",
          title: scenario.title,
          scenarioText: scenario.scenarioText,
          result: response,
          createdAt: new Date().toISOString(),
        };

        savePredefinedScenarioAnalysis(nextRecord);
        setRecord(nextRecord);
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError.message || "Senaryo özeti hazırlanamadı. Lütfen tekrar deneyin.");
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
  }, [isCustomScenario, isPredefinedScenario, record, scenarioId]);

  const scenario = useMemo(() => {
    if (isPredefinedScenario) {
      return getPredefinedScenarioById(scenarioId);
    }

    return record
      ? {
          id: record.id || scenarioId || "custom-scenario",
          title:
            typeof record.title === "string" && record.title.trim()
              ? record.title
              : "Senaryo analizi",
          scenarioText:
            typeof record.scenarioText === "string" && record.scenarioText.trim()
              ? record.scenarioText
              : "Senaryo metni bulunamadı.",
        }
      : null;
  }, [isPredefinedScenario, record, scenarioId]);

  const displayedResult = useMemo(() => {
    try {
      return mapScenarioAnalysisResult(record?.result || null, {
        id: scenario?.id || record?.id || "",
        title: scenario?.title || record?.title || "",
        questionText: scenario?.questionText || "",
      });
    } catch {
      return null;
    }
  }, [record, scenario]);

  const summaryContent = useMemo(() => {
    if (displayedResult) {
      return {
        intro: displayedResult.summaryIntro || displayedResult.shortComment || "",
        whatMayHappen: displayedResult.summaryComment || "",
        immediateActions: displayedResult.summaryImmediateActions || [],
      };
    }

    if (isPredefinedScenario && scenario) {
      return {
        intro: scenario.shortAnalysisIntro || "",
        whatMayHappen: scenario.shortAnalysisRisk || "",
        immediateActions: scenario.shortImmediateActions || [],
      };
    }

    return {
      intro: "",
      whatMayHappen: "",
      immediateActions: [],
    };
  }, [displayedResult, isPredefinedScenario, scenario]);

  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="Senaryo Analizi"
          title={scenario?.title || "Senaryo analizi"}
          description="Bu ekranda senaryonun sorduğu soruya kısa ama veri temelli bir yanıt görürsünüz. İsterseniz ardından detaylı analize geçebilirsiniz."
        />
      </section>

      <section className="container section-panel section-panel-workspace">
        {loading ? (
          <SurfaceCard
            title="Senaryo özeti hazırlanıyor"
            subtitle="ThreatGraph AI sonucu kullanılarak kısa değerlendirme oluşturuluyor."
          />
        ) : error ? (
          <SurfaceCard title="Senaryo bulunamadı" subtitle={error}>
            <div className="hero-actions">
              <Link className="button button-secondary" to="/senaryolar">
                Senaryolara dön
              </Link>
            </div>
          </SurfaceCard>
        ) : !scenario ? (
          <SurfaceCard title="Senaryo bulunamadı" subtitle="Özet verisi yüklenemedi.">
            <div className="hero-actions">
              <Link className="button button-secondary" to="/senaryolar">
                Senaryolara dön
              </Link>
            </div>
          </SurfaceCard>
        ) : (
          <SurfaceCard title={scenario.title || "Senaryo analizi"} className="scenario-summary-card">
            {(scenario.questionText || scenario.scenarioText) && (
              <div className="scenario-summary-block">
                <p>{scenario.questionText || scenario.scenarioText}</p>
              </div>
            )}

            {summaryContent.intro ? (
              <div className="scenario-summary-block">
                <p>{summaryContent.intro}</p>
              </div>
            ) : null}

            {summaryContent.whatMayHappen ? (
              <div className="scenario-summary-block">
                <p className="scenario-summary-text">{summaryContent.whatMayHappen}</p>
              </div>
            ) : null}

            {summaryContent.immediateActions.length ? (
              <div className="scenario-summary-actions">
                <strong>İlk yapılması gerekenler</strong>
                <ul>
                  {summaryContent.immediateActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="hero-actions">
              <button
                className="button button-primary"
                type="button"
                onClick={() =>
                  navigate(`/senaryolar/${scenarioKind || "ozel"}/${scenarioId || scenario.id}/detay`, {
                    state: { record },
                  })
                }
              >
                Detaylı analizi aç
              </button>
              <Link className="button button-secondary" to="/senaryolar">
                Senaryolara dön
              </Link>
            </div>
          </SurfaceCard>
        )}
      </section>
    </div>
  );
}

export default ScenarioSummaryPage;
