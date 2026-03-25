import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ArtifactPickerModal from "../components/ArtifactPickerModal";
import LiveGraphPanel from "../components/LiveGraphPanel";
import ResultMetricCard from "../components/ResultMetricCard";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import { analyzeArtifact, fetchArtifacts, fetchGraphContext } from "../services/api";

const emptyResult = {
  matched_artifact: "Henüz analiz edilmedi",
  matched_category: "Kategori bilgisi analizden sonra burada gösterilecek.",
  mapping_method: "İşlem bekleniyor",
  confidence_score: "-",
  direct_attacks: [{ title: "Doğrudan saldırı ilişkileri", description: "Analiz henüz başlatılmadı." }],
  direct_tactics: [{ title: "Direct tactic ilişkileri", description: "Analiz henüz başlatılmadı." }],
  next_tactics: [{ title: "Sonraki tactic akışı", description: "Analiz henüz başlatılmadı." }],
  predicted_attacks_top5: [{ title: "ML sıralaması", description: "Analiz henüz başlatılmadı." }],
  defense_suggestions: [{ title: "Savunma önerileri", description: "Analiz henüz başlatılmadı." }],
  diagnostics: [{ title: "Tanılama bilgileri", description: "İşlem adımları analizden sonra gösterilecek." }],
  low_confidence_reason: null
};

const loadingStages = [
  "Mapping hazırlanıyor",
  "Graph reasoning çalışıyor",
  "ML ranking üretiliyor",
  "Savunma önerileri hazırlanıyor"
];

const skeletonCards = [
  { title: "Eşleşen Artifact", emphasis: "primary" },
  { title: "Güven Skoru", emphasis: "highlight" },
  { title: "Top-5 Saldırı Tahmini", emphasis: "highlight", lines: 4 },
  { title: "Diagnostics", lines: 3 }
];

const modes = [
  {
    id: "new",
    label: "Yeni artifact analizi",
    helper: "Yeni veya serbest biçimli giriş mapping ile en uygun eşleşmeye yönlendirilir."
  },
  {
    id: "known",
    label: "Mevcut artifact analizi",
    helper: "Bilinen canonical artifact için doğrudan graph bağlamı kullanılır."
  }
];

function persistLatestGraph(graphPayload) {
  if (!graphPayload) {
    return;
  }

  window.localStorage.setItem("latestGraphContext", JSON.stringify(graphPayload));
}

function normalizeMode(value) {
  return value === "known" ? "known" : "new";
}

function normalizeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s/_-]+/g, " ");
}

function formatConfidence(score, label) {
  if (score === undefined || score === null || Number.isNaN(Number(score))) {
    return "-";
  }

  const formattedScore = Number(score).toFixed(2);
  return label ? `${formattedScore} / ${label}` : formattedScore;
}

function normalizeText(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function getConfidenceClass(score) {
  const numericScore = Number(score);
  if (Number.isNaN(numericScore)) {
    return "";
  }

  if (numericScore >= 0.75) {
    return "result-card-confidence-high";
  }

  if (numericScore >= 0.55) {
    return "result-card-confidence-medium";
  }

  return "result-card-confidence-low";
}

function AnalysisPage() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState("new");
  const [artifactName, setArtifactName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStageIndex, setLoadingStageIndex] = useState(0);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");
  const [modeNotice, setModeNotice] = useState("");
  const [result, setResult] = useState(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [artifacts, setArtifacts] = useState([]);
  const [artifactsError, setArtifactsError] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showArtifactModal, setShowArtifactModal] = useState(false);
  const resultsRef = useRef(null);
  const suggestionsRef = useRef(null);

  const currentLoadingStage = loadingStages[loadingStageIndex] || loadingStages[0];
  const loadingProgress = ((loadingStageIndex + 1) / loadingStages.length) * 100;
  const descriptionHint = description.trim()
    ? "Açıklama analize dahil edilecek."
    : "Açıklama olmadan analiz yapılabilir; bağlam eksik olduğunda eşleşme doğruluğu düşebilir.";

  useEffect(() => {
    const presetArtifact = searchParams.get("artifact_name");
    const presetDescription = searchParams.get("description");
    const presetMode = searchParams.get("mode");

    if (presetArtifact) {
      setArtifactName(presetArtifact);
    }

    if (presetDescription) {
      setDescription(presetDescription);
    }

    if (presetMode) {
      setMode(normalizeMode(presetMode));
    }
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    const loadArtifacts = async () => {
      try {
        const response = await fetchArtifacts();
        if (!isMounted) {
          return;
        }
        setArtifacts(response);
        setArtifactsError("");
      } catch (requestError) {
        if (!isMounted) {
          return;
        }
        setArtifacts([]);
        setArtifactsError(
          requestError.message ||
            "Artifact listesi alınamadı. Lütfen backend bağlantısını kontrol edin."
        );
      }
    };

    void loadArtifacts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      setLoadingStageIndex(0);
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setLoadingStageIndex((currentIndex) =>
        currentIndex < loadingStages.length - 1 ? currentIndex + 1 : currentIndex
      );
    }, 1100);

    return () => window.clearInterval(intervalId);
  }, [loading]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!suggestionsRef.current?.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const artifactLookup = useMemo(() => {
    const lookup = new Map();
    artifacts.forEach((artifact) => {
      lookup.set(normalizeKey(artifact.name), artifact);
    });
    return lookup;
  }, [artifacts]);

  const filteredArtifacts = useMemo(() => {
    if (mode !== "known") {
      return [];
    }

    const normalizedQuery = normalizeKey(artifactName);
    if (!normalizedQuery) {
      return artifacts.slice(0, 8);
    }

    return artifacts
      .filter((artifact) => normalizeKey(artifact.name).includes(normalizedQuery))
      .slice(0, 8);
  }, [artifacts, artifactName, mode]);

  const displayedResult = useMemo(() => {
    if (!result) {
      return emptyResult;
    }

    const diagnosticItems = [];
    const processingSteps = result.diagnostics?.processing_steps || [];
    const warnings = result.diagnostics?.warnings || [];
    const thresholds = Object.entries(result.diagnostics?.thresholds || {});
    const dataSources = Object.entries(result.diagnostics?.data_sources || {});

    if (result.diagnostics?.normalized_artifact || result.diagnostics?.normalized_description) {
      diagnosticItems.push({
        title: "Normalize giriş",
        description: `Artifact: ${result.diagnostics?.normalized_artifact || "-"} | Açıklama: ${
          result.diagnostics?.normalized_description || "-"
        }`
      });
    }

    if (processingSteps.length) {
      diagnosticItems.push({
        title: "İşlem adımları",
        description: processingSteps.join(" → ")
      });
    }

    if (thresholds.length) {
      diagnosticItems.push({
        title: "Karar eşikleri",
        description: thresholds.map(([key, value]) => `${key}: ${value}`).join(" | ")
      });
    }

    if (dataSources.length) {
      diagnosticItems.push({
        title: "Veri kaynakları",
        description: dataSources.map(([key, value]) => `${key}: ${value}`).join(" | ")
      });
    }

    if (warnings.length) {
      diagnosticItems.push(
        ...warnings.map((warning, index) => ({
          title: `Tanılama notu ${index + 1}`,
          description: warning
        }))
      );
    }

    return {
      matched_artifact: normalizeText(result.matched_artifact, "Eşleşme bulunamadı"),
      matched_category: normalizeText(result.matched_category, "Kategori bilgisi üretilemedi"),
      mapping_method: normalizeText(result.mapping_method, "Belirtilmedi"),
      confidence_score: formatConfidence(result.confidence_score, result.confidence_label),
      direct_attacks: result.direct_attacks?.length
        ? result.direct_attacks.map((attack) => ({ title: normalizeText(attack, "Bilinmeyen attack") }))
        : [{ title: "Doğrudan saldırı bulunamadı" }],
      direct_tactics: result.direct_tactics?.length
        ? result.direct_tactics.map((tactic) => ({ title: normalizeText(tactic, "Bilinmeyen tactic") }))
        : [{ title: "Doğrudan tactic bulunamadı" }],
      next_tactics: result.next_tactics?.length
        ? result.next_tactics.map((tactic) => ({ title: normalizeText(tactic, "Bilinmeyen tactic") }))
        : [{ title: "Sonraki tactic bulunamadı" }],
      predicted_attacks_top5: result.predicted_attacks_top5?.length
        ? result.predicted_attacks_top5.map((item, index) => ({
            title: normalizeText(item.attack_name, `Saldırı adayı ${index + 1}`),
            meta:
              item.probability !== undefined &&
              item.probability !== null &&
              !Number.isNaN(Number(item.probability))
                ? `Olasılık: ${Number(item.probability).toFixed(3)}`
                : null,
            description: normalizeText(
              item.rationale,
              "Model bu saldırıyı graph-türetilmiş adaylar arasından öncelikli risk olarak öne çıkardı."
            ),
            emphasis: index === 0 ? "top" : undefined
          }))
        : [{ title: "Top-5 saldırı tahmini üretilemedi" }],
      defense_suggestions: result.defense_suggestions?.length
        ? result.defense_suggestions.map((item, index) => ({
            title: normalizeText(item.title, `Savunma önerisi ${index + 1}`),
            meta: item.source ? `Kaynak: ${item.source}` : null,
            description: normalizeText(item.description, "Açıklama sağlanmadı")
          }))
        : [{ title: "Savunma önerisi üretilemedi" }],
      diagnostics: diagnosticItems.length ? diagnosticItems : [{ title: "Tanılama bilgisi üretilemedi" }],
      low_confidence_reason:
        result.low_confidence_reason && result.low_confidence_reason.trim()
          ? result.low_confidence_reason
          : null
    };
  }, [result]);

  useEffect(() => {
    if (!hasSubmitted || loading || !resultsRef.current) {
      return;
    }

    resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasSubmitted, loading, result, error, modeNotice]);

  const applyKnownArtifactSelection = (artifact) => {
    setArtifactName(artifact.name);
    setMode("known");
    setShowSuggestions(false);
    setShowArtifactModal(false);
    setValidationError("");
    setModeNotice("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) {
      return;
    }

    const trimmedArtifactName = artifactName.trim();
    const trimmedDescription = description.trim();

    if (!trimmedArtifactName) {
      setValidationError("Artifact adı zorunludur.");
      return;
    }

    if (mode === "known") {
      if (!artifacts.length) {
        setValidationError(
          artifactsError ||
            "Artifact listesi henüz yüklenemedi. Lütfen listeden seçim yapmak için tekrar deneyin."
        );
        return;
      }

      if (!artifactLookup.has(normalizeKey(trimmedArtifactName))) {
        setValidationError(
          "Girilen değer mevcut artifact listesinde bulunamadı. Lütfen listeden seçin veya 'Yeni artifact analizi' kullanın."
        );
        return;
      }
    }

    setHasSubmitted(true);
    setLoading(true);
    setGraphLoading(true);
    setError("");
    setGraphError("");
    setValidationError("");
    setModeNotice("");

    try {
      const payload = {
        artifact_name: trimmedArtifactName,
        description: trimmedDescription || null,
        analysis_mode: mode
      };

      const analysisResponse = await analyzeArtifact(payload);
      setResult(analysisResponse);

      const graphResponse = await fetchGraphContext({
        artifact_name: analysisResponse.input_artifact || trimmedArtifactName,
        matched_artifact: analysisResponse.matched_artifact,
        analysis_mode: mode
      });
      setGraphData(graphResponse);
      persistLatestGraph(graphResponse);
    } catch (submissionError) {
      setError(
        submissionError.message ||
          "Analiz sırasında beklenmeyen bir hata oluştu. Lütfen yeniden deneyin."
      );
      setResult(null);
      setGraphData(null);
      setGraphError("Graph bağlamı yüklenemedi.");
    } finally {
      setLoading(false);
      setGraphLoading(false);
    }
  };

  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="ThreatGraph AI Workspace"
          title="Canlı attack intelligence akışını tek çalışma alanında yönetin"
          description="Bu ekran analiz formunu, sonuç kartlarını ve canlı Neo4j graph görünümünü tek bir operasyonel workspace içinde birleştirir."
        />
      </section>

      <section
        className={`container analysis-workspace analysis-workspace-shell section-panel section-panel-workspace${
          loading ? " analysis-workspace-processing" : ""
        }`}
      >
        <div className="analysis-main-column">
          <SurfaceCard
            title="Analiz modu seçimi"
            subtitle="Yeni artifact ve mevcut artifact akışları aynı ürün ekranında farklı davranış kurallarıyla çalışır."
          >
            <div className="mode-toggle" role="tablist" aria-label="Analiz modu">
              {modes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`mode-button${mode === item.id ? " mode-button-active" : ""}`}
                  onClick={() => {
                    setMode(item.id);
                    setModeNotice("");
                    setValidationError("");
                    if (item.id !== "known") {
                      setShowSuggestions(false);
                    }
                  }}
                >
                  <strong>{item.label}</strong>
                  <span>{item.helper}</span>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard
            title="Artifact girişi"
            subtitle="İsim ve açıklama birlikte verildiğinde ThreatGraph AI daha güçlü hibrit eşleme üretir."
          >
            <form className="analysis-form-advanced" onSubmit={handleSubmit}>
              <div className="artifact-picker-shell" ref={suggestionsRef}>
                <label className="field">
                  <span>Artifact adı</span>
                  <input
                    type="text"
                    value={artifactName}
                    onChange={(event) => {
                      setArtifactName(event.target.value);
                      setValidationError("");
                      setModeNotice("");
                      if (mode === "known") {
                        setShowSuggestions(true);
                      }
                    }}
                    onFocus={() => {
                      if (mode === "known") {
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder='Örnek: "dns cache", "access token", "powershell script"'
                    required
                  />
                </label>

                {mode === "known" ? (
                  <div className="artifact-picker-actions">
                    <button
                      type="button"
                      className="button button-secondary button-small"
                      onClick={() => setShowArtifactModal(true)}
                    >
                      Artifact seç
                    </button>
                  </div>
                ) : null}

                {mode === "known" && showSuggestions && filteredArtifacts.length ? (
                  <div className="artifact-suggestion-dropdown">
                    {filteredArtifacts.map((artifact) => (
                      <button
                        key={`${artifact.category}-${artifact.name}`}
                        type="button"
                        className="artifact-suggestion-item"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => applyKnownArtifactSelection(artifact)}
                      >
                        <strong>{artifact.name}</strong>
                        <span>{artifact.category}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="field-help">
                {mode === "known"
                  ? "Mevcut artifact modunda canonical artifact listesinden seçim yapmanız önerilir."
                  : "Daha doğru analiz için İngilizce terimler önerilir (örn: dns cache, access token)"}
              </div>

              <label className="field">
                <span>Açıklama</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows="6"
                  placeholder="Observed DNS cache anomalies indicating possible exfiltration"
                />
              </label>

              <p className={`helper-note${description.trim() ? "" : " helper-note-warning"}`}>
                {descriptionHint}
              </p>

              <div className="form-actions">
                <button
                  className={`button button-primary button-live${loading ? " button-loading-live" : ""}`}
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="button-spinner" aria-hidden="true" />
                      Analiz başlatılıyor...
                    </>
                  ) : (
                    "Analizi Başlat ve Graph Oluştur"
                  )}
                </button>
                <span className="inline-status">
                  {loading
                    ? currentLoadingStage
                    : mode === "new"
                      ? "Mod: Yeni artifact analizi"
                      : "Mod: Mevcut artifact analizi"}
                </span>
              </div>
            </form>
            {artifactsError && mode === "known" ? <div className="notice-box">{artifactsError}</div> : null}
            {modeNotice ? <div className="notice-box">{modeNotice}</div> : null}
            {validationError ? <div className="error-box">{validationError}</div> : null}
            {error ? <div className="error-box">{error}</div> : null}
          </SurfaceCard>

          <SurfaceCard
            className="analysis-results-panel"
            title="Karar paneli"
            subtitle="Gerçek backend çıktısı geldikçe kritik kartlar öne çıkar; graph alanı da aynı analiz bağlamından canlı olarak beslenir."
          >
            <div ref={resultsRef} className="results-anchor">
              {!hasSubmitted && !loading ? (
                <div className="analysis-status-card analysis-status-card-ready">
                  <div className="analysis-ready-copy">
                    <strong>Analiz çalışma yüzeyi hazır</strong>
                    <p>
                      Bir artifact analizi başlattığınızda eşleşme, confidence, saldırı tahmini,
                      tanılama ve savunma çıktıları burada ürün kartları olarak oluşacak.
                    </p>
                  </div>
                  <div className="analysis-ready-pills">
                    <span>Eşleşen artifact</span>
                    <span>Top-5 tahmin</span>
                    <span>Diagnostics</span>
                    <span>Confidence</span>
                  </div>
                </div>
              ) : null}

              {loading ? (
                <>
                  <div className="analysis-live-indicator">
                    <span className="analysis-live-dot" aria-hidden="true" />
                    ThreatGraph AI analiz çalıştırıyor
                  </div>
                  <div className="analysis-status-card analysis-status-card-loading analysis-status-card-loading-rich">
                    <span className="panel-spinner" aria-hidden="true" />
                    <div className="loading-stage-block">
                      <strong>{currentLoadingStage}</strong>
                      <div className="loading-progress-rail" aria-hidden="true">
                        <span style={{ width: `${loadingProgress}%` }} />
                      </div>
                      <div className="loading-stage-list">
                        {loadingStages.map((stage, index) => (
                          <span
                            key={stage}
                            className={`loading-stage-chip${index <= loadingStageIndex ? " loading-stage-chip-active" : ""}`}
                          >
                            {stage}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {loading ? (
              <div className="result-skeleton-grid" aria-hidden="true">
                {skeletonCards.map((card, index) => (
                  <article
                    key={card.title}
                    className={`result-metric-card result-skeleton-card result-skeleton-card-visible${
                      card.emphasis === "primary"
                        ? " result-card-primary"
                        : card.emphasis === "highlight"
                          ? " result-card-highlight"
                          : ""
                    }`}
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <span className="metric-label">{card.title}</span>
                    <span className="skeleton-line skeleton-line-title" />
                    <span className="skeleton-line" />
                    <span className="skeleton-line skeleton-line-short" />
                    {card.lines && card.lines > 2
                      ? Array.from({ length: card.lines - 2 }).map((_, lineIndex) => (
                          <span key={`${card.title}-${lineIndex}`} className="skeleton-line" />
                        ))
                      : null}
                  </article>
                ))}
              </div>
            ) : null}

            <div className={`result-grid${result && !loading ? " result-grid-visible result-grid-enter" : ""}`}>
              <ResultMetricCard
                title="Eşleşen Artifact"
                value={displayedResult.matched_artifact}
                tone="accent"
                className="result-card-primary"
              />
              <ResultMetricCard title="Kategori" value={displayedResult.matched_category} />
              <ResultMetricCard title="Eşleme Yöntemi" value={displayedResult.mapping_method} />
              <ResultMetricCard
                title="Güven Skoru"
                value={displayedResult.confidence_score}
                tone="accent"
                className={`result-card-highlight ${getConfidenceClass(result?.confidence_score)}`.trim()}
              />
              <ResultMetricCard title="Direct Attacks" items={displayedResult.direct_attacks} />
              <ResultMetricCard title="Direct Tactics" items={displayedResult.direct_tactics} />
              <ResultMetricCard title="Next Tactics" items={displayedResult.next_tactics} />
              <ResultMetricCard
                title="Top-5 Saldırı Tahmini"
                items={displayedResult.predicted_attacks_top5}
                tone="accent"
                className="result-card-highlight"
              />
              <ResultMetricCard title="Savunma Önerileri" items={displayedResult.defense_suggestions} />
              <ResultMetricCard title="Diagnostics" items={displayedResult.diagnostics} />
              {displayedResult.low_confidence_reason ? (
                <ResultMetricCard
                  title="Low-confidence açıklaması"
                  value={displayedResult.low_confidence_reason}
                  tone="accent"
                />
              ) : null}
            </div>
          </SurfaceCard>
        </div>

        <aside className="analysis-side-column">
          <SurfaceCard
            className={`analysis-graph-panel analysis-graph-panel-emphasis${
              graphLoading ? " analysis-graph-panel-loading" : ""
            }`}
            title="Canlı graph paneli"
            subtitle="Son analiz bağlamı görüntüleniyor. En son analiz edilen artifact için Neo4j tabanlı node-edge görünümü."
          >
            <LiveGraphPanel
              compact
              viewMode="summary"
              graph={graphData}
              loading={graphLoading}
              error={graphError}
              emptyTitle="Henüz graph bağlamı oluşturulmadı"
              emptyDescription="Bir artifact analizi başlatarak ilişkisel görünümü oluşturun."
            />
            {!description.trim() ? (
              <p className="helper-note helper-note-warning graph-preview-note">
                Açıklama olmadan analiz yapılabilir; bağlam eksik olduğunda eşleşme doğruluğu düşebilir.
              </p>
            ) : null}
          </SurfaceCard>

          <SurfaceCard title="Workspace odakları">
            <ul className="metric-list">
              <li>Artifact merkezli odak görünümü</li>
              <li>Node etiketleri ve ilişki isimleri</li>
              <li>Tür bazlı renk ayrımı</li>
              <li>Match, tactic ve savunma akışı</li>
              <li>Graph sayfasıyla paylaşılan son bağlam</li>
            </ul>
          </SurfaceCard>
        </aside>
      </section>

      <ArtifactPickerModal
        open={showArtifactModal}
        artifacts={artifacts}
        onClose={() => setShowArtifactModal(false)}
        onSelect={applyKnownArtifactSelection}
      />
    </div>
  );
}

export default AnalysisPage;
