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
  direct_attacks: [{ title: "Doğrudan saldırılar", description: "Analiz henüz başlatılmadı." }],
  direct_tactics: [{ title: "Doğrudan tactic'ler", description: "Analiz henüz başlatılmadı." }],
  next_tactics: [{ title: "Olası sonraki tactic'ler", description: "Analiz henüz başlatılmadı." }],
  predicted_attacks_top5: [{ title: "Top-5 saldırı tahmini", description: "Analiz henüz başlatılmadı." }],
  defense_suggestions: [{ title: "Savunma önerileri", description: "Analiz henüz başlatılmadı." }],
  technical_details: null,
  low_confidence_reason: null
};

const loadingStages = [
  "Eşleşme hazırlanıyor",
  "Graph reasoning çalışıyor",
  "ML sıralaması üretiliyor",
  "Savunma önerileri hazırlanıyor"
];

const skeletonCards = [
  { title: "Eşleşen artifact", emphasis: "primary" },
  { title: "Güven düzeyi", emphasis: "highlight" },
  { title: "Top-5 saldırı tahmini", emphasis: "highlight", lines: 4 },
  { title: "Teknik detaylar", lines: 3 }
];

const modes = [
  {
    id: "new",
    label: "Yeni artifact analizi",
    helper: "Yeni veya serbest biçimli giriş, bağlamıyla birlikte en uygun eşleşmeye yönlendirilir."
  },
  {
    id: "known",
    label: "Mevcut artifact analizi",
    helper: "Bilinen canonical artifact için doğrudan graph bağlamı kullanılır."
  }
];

const graphEmptyTags = ["Artifact", "Attack", "Tactic", "Defense", "Etki yayılımı"];

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

function formatMappingMethod(value) {
  const method = normalizeText(value, "Belirtilmedi");
  const labels = {
    explicit_mapping: "Açık kural eşleşmesi",
    graph_best_match: "Graph eşleşmesi",
    lexical_similarity: "Metin benzerliği",
    semantic_similarity: "Anlamsal benzerlik",
    hybrid_context_match: "Hibrit bağlam eşleşmesi",
    fallback_match: "Yedek eşleşme"
  };

  return labels[method] || method.replace(/_/g, " ");
}

function formatThresholdLabel(key) {
  const labels = {
    low_confidence_threshold: "Düşük güven eşiği",
    strict_prediction_threshold: "Kesin tahmin eşiği"
  };

  return labels[key] || key.replace(/_/g, " ");
}

function formatProcessingStep(step) {
  const labels = {
    normalize_input: "Girdi normalize edildi",
    load_graph_artifacts_and_mapping_rules: "Graph artifact ve eşleşme kuralları yüklendi",
    resolve_best_artifact: "En uygun artifact eşleşmesi seçildi",
    persist_best_match: "Eşleşme graph üzerinde kaydedildi",
    skip_best_match_persistence_for_known_mode: "Mevcut artifact modunda ek kayıt atlandı",
    fetch_reasoning_summary: "Reasoning özeti çıkarıldı",
    rank_attacks_with_ml: "ML saldırı sıralaması üretildi",
    fetch_defense_suggestions: "Savunma önerileri hazırlandı"
  };

  return labels[step] || step.replace(/_/g, " ");
}

function formatDataSourceLabel(key) {
  const labels = {
    analysis_mode: "Analiz modu",
    neo4j: "Neo4j durumu",
    ml_model: "ML model durumu",
    ml_encoders: "Encoder durumu",
    analysis_csv: "Analiz veri seti",
    candidate_match_count: "Aday eşleşme sayısı",
    matched_rules_count: "Eşleşen kural sayısı",
    explicit_mapping_used: "Açık kural kullanıldı",
    graph_signals_found: "Graph sinyali bulundu",
    ml_candidate_count: "ML aday sayısı",
    ml_prediction_count: "ML tahmin sayısı",
    abstention_triggered: "Abstention devrede",
    abstention_reason_count: "Abstention nedeni",
    artifact_record_count: "Artifact kaydı sayısı",
    mapping_rule_count: "Mapping kuralı sayısı",
    mapping_dominant_source: "Baskın eşleşme kaynağı",
    direct_attack_count: "Doğrudan saldırı sayısı",
    may_impact_artifact_count: "Etkilenebilecek varlık sayısı",
    may_impact_attack_count: "Yayılım kaynaklı saldırı sayısı",
    direct_tactic_count: "Doğrudan tactic sayısı",
    next_tactic_count: "Sonraki tactic sayısı",
    defense_suggestion_count: "Savunma önerisi sayısı"
  };

  return labels[key] || key.replace(/_/g, " ");
}

function formatDataSourceValue(value) {
  const normalized = String(value ?? "").trim();
  const labels = {
    true: "Evet",
    false: "Hayır",
    configured: "Hazır",
    not_configured: "Hazır değil",
    loaded: "Yüklü",
    not_loaded: "Yüklü değil",
    new: "Yeni artifact",
    known: "Mevcut artifact"
  };

  return labels[normalized] || normalized || "-";
}

function buildTechnicalPairs(entries, labelFormatter, valueFormatter = (value) => String(value)) {
  return entries.map(([key, value]) => ({
    label: labelFormatter(key),
    value: valueFormatter(value)
  }));
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
    ? "Açıklama analize dahil edilecek ve bağlamsal eşleşmeyi güçlendirecek."
    : "Açıklama zorunlu değildir; ancak bağlam eklemek eşleşme ve sıralama kalitesini artırabilir.";

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

    const processingSteps = result.diagnostics?.processing_steps || [];
    const warnings = result.diagnostics?.warnings || [];
    const thresholds = Object.entries(result.diagnostics?.thresholds || {});
    const dataSources = Object.entries(result.diagnostics?.data_sources || {});

    return {
      matched_artifact: normalizeText(result.matched_artifact, "Eşleşme bulunamadı"),
      matched_category: normalizeText(result.matched_category, "Kategori bilgisi üretilemedi"),
      mapping_method: formatMappingMethod(result.mapping_method),
      confidence_score: formatConfidence(result.confidence_score, result.confidence_label),
      direct_attacks: result.direct_attacks?.length
        ? result.direct_attacks.map((attack) => ({ title: normalizeText(attack, "Bilinmeyen saldırı") }))
        : [{ title: "Doğrudan saldırı sinyali bulunamadı" }],
      may_impact_artifacts: result.may_impact_artifacts?.length
        ? result.may_impact_artifacts.map((artifact) => ({
            title: normalizeText(artifact, "Bilinmeyen varlık")
          }))
        : [],
      may_impact_attacks: result.may_impact_attacks?.length
        ? result.may_impact_attacks.map((attack) => ({
            title: normalizeText(attack, "Bilinmeyen saldırı")
          }))
        : [],
      direct_tactics: result.direct_tactics?.length
        ? result.direct_tactics.map((tactic) => ({ title: normalizeText(tactic, "Bilinmeyen tactic") }))
        : [{ title: "Doğrudan tactic sinyali bulunamadı" }],
      next_tactics: result.next_tactics?.length
        ? result.next_tactics.map((tactic) => ({ title: normalizeText(tactic, "Bilinmeyen tactic") }))
        : [{ title: "Sonraki tactic sinyali bulunamadı" }],
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
              "Model bu saldırıyı graph kaynaklı adaylar arasından öncelikli risk olarak öne çıkardı."
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
      technical_details: {
        normalized_input:
          result.diagnostics?.normalized_artifact || result.diagnostics?.normalized_description
            ? [
                { label: "Artifact", value: result.diagnostics?.normalized_artifact || "-" },
                { label: "Açıklama", value: result.diagnostics?.normalized_description || "-" }
              ]
            : [],
        warnings,
        processing_steps: processingSteps.map(formatProcessingStep),
        thresholds: buildTechnicalPairs(thresholds, formatThresholdLabel, (value) => String(value)),
        data_sources: buildTechnicalPairs(dataSources, formatDataSourceLabel, formatDataSourceValue)
      },
      low_confidence_reason:
        result.low_confidence_reason && result.low_confidence_reason.trim()
          ? result.low_confidence_reason
          : null
    };
  }, [result]);

  const compactGraphSummary = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      inputArtifact: normalizeText(result.input_artifact, artifactName || "Belirtilmedi"),
      matchedArtifact: normalizeText(result.matched_artifact, "Eşleşme bulunamadı"),
      matchedCategory: normalizeText(result.matched_category, "Kategori bilgisi üretilmedi"),
      directAttacks: result.direct_attacks || [],
      directTactics: result.direct_tactics || [],
      nextTactics: result.next_tactics || [],
      defenses: (result.defense_suggestions || []).map((item) => item.title).filter(Boolean),
      mayImpactArtifacts: result.may_impact_artifacts || [],
      mayImpactAttacks: result.may_impact_attacks || [],
      lowConfidenceReason: result.low_confidence_reason || null,
      mode
    };
  }, [artifactName, mode, result]);

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
          title="Artifact analizi, graph reasoning ve ML karar desteğini tek ekranda yönetin"
          description="Bu ekran; eşleşme, doğrudan saldırılar, etki yayılımı, tactic akışı, savunma önerileri ve güven düzeyini tek bir operasyonel çalışma alanında bir araya getirir."
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
            subtitle="Yeni artifact ve mevcut artifact akışları aynı ekranda, farklı analiz davranışlarıyla çalışır."
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
            subtitle="İsim ve açıklama birlikte verildiğinde ThreatGraph AI daha güçlü ve daha bağlamsal bir eşleşme üretir."
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
                  ? "Mevcut artifact modunda, doğruluğu korumak için canonical artifact listesinden seçim yapmanız önerilir."
                  : "İngilizce teknik terimler genellikle daha tutarlı canonical eşleşme verir; ancak Türkçe açıklamalar da çok dilli normalizasyon katmanında yorumlanır."}
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
                    "Analizi başlat"
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
            title="Analiz özeti"
            subtitle="Eşleşme, graph reasoning, etki yayılımı, ML sıralaması ve savunma önerileri burada okunabilir bir karar özeti olarak sunulur."
          >
            <div ref={resultsRef} className="results-anchor">
              {!hasSubmitted && !loading ? (
                <div className="analysis-status-card analysis-status-card-ready">
                  <div className="analysis-ready-copy">
                    <strong>Analiz alanı hazır</strong>
                    <p>
                      Bir artifact analizi başlattığınızda eşleşme, doğrudan saldırılar, etki
                      yayılımı, tactic akışı, savunma önerileri ve güven notları burada özetlenecek.
                    </p>
                  </div>
                  <div className="analysis-ready-pills">
                    <span>Eşleşen artifact</span>
                    <span>Etki yayılımı</span>
                    <span>Top-5 tahmin</span>
                    <span>Savunma odağı</span>
                    <span>Güven düzeyi</span>
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
                title="Eşleşen artifact"
                value={displayedResult.matched_artifact}
                tone="accent"
                className="result-card-primary"
              />
              <ResultMetricCard title="Kategori" value={displayedResult.matched_category} />
              <ResultMetricCard title="Eşleme yöntemi" value={displayedResult.mapping_method} />
              <ResultMetricCard
                title="Güven düzeyi"
                value={displayedResult.confidence_score}
                tone="accent"
                className={`result-card-highlight ${getConfidenceClass(result?.confidence_score)}`.trim()}
              />
              <ResultMetricCard title="Doğrudan saldırılar" items={displayedResult.direct_attacks} />
              {displayedResult.may_impact_artifacts?.length ? (
                <ResultMetricCard
                  title="Etkilenebilecek varlıklar"
                  items={displayedResult.may_impact_artifacts}
                />
              ) : null}
              {displayedResult.may_impact_attacks?.length ? (
                <ResultMetricCard
                  title="Yayılım kaynaklı saldırılar"
                  items={displayedResult.may_impact_attacks}
                />
              ) : null}
              <ResultMetricCard title="Doğrudan tactic'ler" items={displayedResult.direct_tactics} />
              <ResultMetricCard title="Olası sonraki tactic'ler" items={displayedResult.next_tactics} />
              <ResultMetricCard
                title="Top-5 saldırı tahmini"
                items={displayedResult.predicted_attacks_top5}
                tone="accent"
                className="result-card-highlight"
              />
              <ResultMetricCard title="Savunma önerileri" items={displayedResult.defense_suggestions} />
              {displayedResult.low_confidence_reason ? (
                <ResultMetricCard
                  title="Düşük güven açıklaması"
                  value={displayedResult.low_confidence_reason}
                  tone="accent"
                />
              ) : null}
            </div>

            {result && !loading ? (
              <details className="technical-details">
                <summary>
                  <div>
                    <strong>Teknik detaylar</strong>
                    <p>İşlem adımları ve sistem notları</p>
                  </div>
                  <span className="technical-details-toggle">Aç / Kapat</span>
                </summary>

                <div className="technical-details-body">
                  {displayedResult.technical_details?.warnings?.length ? (
                    <section className="technical-details-group">
                      <h4>Uyarılar</h4>
                      <ul className="technical-details-list">
                        {displayedResult.technical_details.warnings.map((warning, index) => (
                          <li key={`warning-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {displayedResult.technical_details?.processing_steps?.length ? (
                    <section className="technical-details-group">
                      <h4>İşlem adımları</h4>
                      <ol className="technical-details-list technical-details-list-ordered">
                        {displayedResult.technical_details.processing_steps.map((step, index) => (
                          <li key={`step-${index}`}>{step}</li>
                        ))}
                      </ol>
                    </section>
                  ) : null}

                  {displayedResult.technical_details?.normalized_input?.length ? (
                    <section className="technical-details-group">
                      <h4>Normalize giriş</h4>
                      <div className="technical-pair-grid">
                        {displayedResult.technical_details.normalized_input.map((item) => (
                          <div key={item.label} className="technical-pair-card">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {displayedResult.technical_details?.thresholds?.length ? (
                    <section className="technical-details-group">
                      <h4>Karar eşikleri</h4>
                      <div className="technical-pair-grid">
                        {displayedResult.technical_details.thresholds.map((item) => (
                          <div key={item.label} className="technical-pair-card">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {displayedResult.technical_details?.data_sources?.length ? (
                    <section className="technical-details-group">
                      <h4>Sistem verileri</h4>
                      <div className="technical-pair-grid">
                        {displayedResult.technical_details.data_sources.map((item) => (
                          <div key={item.label} className="technical-pair-card">
                            <span>{item.label}</span>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              </details>
            ) : null}
          </SurfaceCard>
        </div>

        <aside className="analysis-side-column">
          <SurfaceCard
            className={`analysis-graph-panel analysis-graph-panel-emphasis${
              graphLoading ? " analysis-graph-panel-loading" : ""
            }`}
            title="Canlı graph özeti"
            subtitle="Analiz sonrası bilgi grafiği bağlamı burada daha okunabilir bir operasyon özeti olarak görünür."
          >
            <LiveGraphPanel
              compact
              viewMode="summary"
              graph={graphData}
              compactSummary={compactGraphSummary}
              loading={graphLoading}
              error={graphError}
              emptyTitle="Henüz analiz başlatılmadı"
              emptyDescription="Bir artifact analizi başlattığınızda canlı graph görünümü burada oluşur. Bu alan saldırı, tactic, savunma ve etki yayılımı ilişkilerini özetler."
              emptyTags={graphEmptyTags}
            />
            {!description.trim() ? (
              <p className="helper-note helper-note-warning graph-preview-note">
                Açıklama zorunlu değildir; ancak bağlam eklediğinizde eşleşme ve ML sıralaması daha tutarlı hale gelebilir.
              </p>
            ) : null}
          </SurfaceCard>

          <SurfaceCard title="Bu panel ne gösterir?">
            <ul className="metric-list">
              <li>Girdi artifact'i ve eşleşen varlığı</li>
              <li>Doğrudan saldırılar ile tactic akışını</li>
              <li>Savunma odağını ve güven bağlamını</li>
              <li>Varsa etki yayılımı sinyallerini</li>
              <li>Graph sayfasıyla paylaşılan son bağlamı</li>
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
