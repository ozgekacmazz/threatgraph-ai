import { useMemo, useRef, useState } from "react";
import ResultMetricCard from "../components/ResultMetricCard";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import { analyzeScenario } from "../services/api";

const starterScenario = "Phishing sonrası credential ele geçirilirse ne olur?";
const scenarioSuggestions = [
  "Phishing sonrası kimlik bilgileri ele geçirilirse ne olabilir?",
  "Oturum çerezi çalınırsa saldırgan ne yapabilir?",
  "Zararlı bir dosya çalıştırılırsa hangi aşamalar görülebilir?",
  "Şüpheli DNS trafiği neyin işareti olabilir?",
];

function normalizeText(value, fallback = "-") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function formatConfidence(score, label) {
  if (score === undefined || score === null || Number.isNaN(Number(score))) {
    return "-";
  }

  const formattedScore = Number(score).toFixed(2);
  return label ? `${formattedScore} / ${label}` : formattedScore;
}

function formatMappingMethod(value) {
  const labels = {
    explicit_mapping: "Açık kural eşleşmesi",
    graph_best_match: "Graph eşleşmesi",
    lexical_similarity: "Metin benzerliği",
    semantic_similarity: "Anlamsal benzerlik",
    hybrid_context_match: "Hibrit bağlam eşleşmesi",
    fallback_match: "Yedek eşleşme",
  };

  return labels[value] || normalizeText(value);
}

function mapSimpleItems(values) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => ({ title: item }));
}

function mapPredictions(values) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  return values.map((item) => ({
    title: normalizeText(item.attack_name, "Bilinmeyen saldırı"),
    meta:
      item.probability !== undefined && item.probability !== null
        ? `Olasılık ${(Number(item.probability) * 100).toFixed(1)}%`
        : null,
    description: item.rationale ? String(item.rationale).trim() : null,
  }));
}

function mapDefenses(values) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  return values.map((item) => ({
    title: normalizeText(item.title, "Savunma önerisi"),
    meta: item.source ? `Kaynak: ${item.source}` : null,
    description: normalizeText(item.description, ""),
  }));
}

function formatIntentLabel(value) {
  const labels = {
    attack_flow: "Saldırı akışı sorusu",
    defense: "Savunma odaklı soru",
    prediction: "Olası risk / sonraki adım sorusu",
    general: "Genel senaryo analizi",
  };

  return labels[value] || labels.general;
}

function formatAnalysisRouteLabel(value) {
  const labels = {
    artifact_first: "Artifact odaklı analiz",
    attack_first: "Saldırı odaklı analiz",
    hybrid: "Hibrit analiz",
  };

  return labels[value] || labels.artifact_first;
}

function ScenarioPage() {
  const [scenarioText, setScenarioText] = useState(starterScenario);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);

  const displayedResult = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      matchedArtifact: normalizeText(result.matched_artifact, "Eşleşme bulunamadı"),
      matchedAttack: normalizeText(result.matched_attack, ""),
      matchedAttackExact: Boolean(result.matched_attack_exact),
      fallbackAttackFamily: normalizeText(result.fallback_attack_family, ""),
      fallbackAttackExplanation: normalizeText(result.fallback_attack_explanation, ""),
      matchedCategory: normalizeText(result.matched_category, "Kategori bulunamadı"),
      mappingMethod: formatMappingMethod(result.mapping_method),
      analysisRoute: formatAnalysisRouteLabel(normalizeText(result.analysis_route, "artifact_first")),
      confidence: formatConfidence(result.confidence_score, result.confidence_label),
      directAttacks: mapSimpleItems(result.direct_attacks),
      mayImpactArtifacts: mapSimpleItems(result.may_impact_artifacts),
      mayImpactAttacks: mapSimpleItems(result.may_impact_attacks),
      directTactics: mapSimpleItems(result.direct_tactics),
      nextTactics: mapSimpleItems(result.next_tactics),
      predictions: mapPredictions(result.predicted_attacks_top5),
      defenses: mapDefenses(result.defense_suggestions),
      lowConfidenceReason: normalizeText(result.low_confidence_reason, ""),
      extractedArtifacts: mapSimpleItems(result.extracted_artifacts),
      extractedAttacks: mapSimpleItems(result.extracted_attacks),
      keywords: mapSimpleItems(result.keywords),
      intent: formatIntentLabel(normalizeText(result.intent, "general")),
      explanationTitle:
        result.explanation_title && result.explanation_title.trim()
          ? result.explanation_title
          : "Senaryo yorumu",
      explanationText:
        result.explanation_text && result.explanation_text.trim()
          ? result.explanation_text
          : null,
      explanationSections: result.explanation_sections?.length
        ? result.explanation_sections
            .map((section) => ({
              title: normalizeText(section.label, "Özet"),
              description: normalizeText(section.text, ""),
            }))
            .filter((section) => section.description)
        : [],
    };
  }, [result]);

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
      setResult(response);
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
          eyebrow="Scenario Analysis"
          title="Senaryonu yaz, sistemi yorumlasın"
          description="Bir saldırı veya şüpheli güvenlik durumunu doğal dille anlatın. Sistem metindeki ipuçlarını yorumlar, uygun artifact eşleşmesini çıkarır ve ThreatGraph AI analiz hattı üzerinden saldırı akışı, savunma önerileri ve risk sinyallerini üretir."
        />
      </section>

      <section className="container section-panel section-panel-workspace">
        <div className="analysis-workspace-shell">
          <div className="analysis-main-column">
            <SurfaceCard
              title="Senaryonu anlat"
              subtitle="Türkçe, İngilizce veya karışık dil kullanabilirsiniz. Sistem serbest metni yorumlar ve mevcut analiz hattına güvenli şekilde bağlar."
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
                  Örneğin bir kimlik bilgisi ele geçirilmesi, oturum çalınması, zararlı dosya çalıştırılması veya şüpheli ağ trafiği durumunu yazabilirsiniz.
                </p>
                {!result && !loading ? (
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
                </div>
              </form>
            </SurfaceCard>
          </div>

          <div className="analysis-side-column">
            <SurfaceCard
              title="Bu akış ne üretir?"
              subtitle="Serbest metin önce yorumlanır, ardından mevcut artifact analizi tetiklenir."
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
          eyebrow="Senaryo çıktısı"
          title="Senaryo yorumu ve yapılandırılmış sonuçlar"
          description="Önce kısa yorum üretilir, ardından niyet, çıkarılan kavramlar ve ThreatGraph AI analiz çıktısı yapılandırılmış kartlar halinde gösterilir."
        />

        {displayedResult ? (
          <>
            {!displayedResult.matchedAttackExact && displayedResult.matchedAttack ? (
              <div className="notice-box scenario-fallback-notice">
                <strong>Yaklaşık saldırı eşleşmesi</strong>
                <p>
                  {displayedResult.fallbackAttackExplanation ||
                    "Girilen saldırı adı graph'ta doğrudan bulunamadı. Sonuçlar en yakın saldırı ailesi üzerinden yorumlandı."}
                </p>
                {displayedResult.fallbackAttackFamily ? (
                  <span>Yakın saldırı ailesi: {displayedResult.fallbackAttackFamily}</span>
                ) : null}
              </div>
            ) : null}

            {displayedResult.explanationText ? (
              <article className="result-metric-card result-metric-card-accent analysis-explanation-card">
                <span className="metric-label">{displayedResult.explanationTitle}</span>
                <p className="metric-value">{displayedResult.explanationText}</p>
                {displayedResult.explanationSections.length ? (
                  <div className="analysis-explanation-sections">
                    {displayedResult.explanationSections.map((section) => (
                      <div
                        key={`${section.title}-${section.description}`}
                        className="analysis-explanation-section"
                      >
                        <strong>{section.title}</strong>
                        <p>{section.description}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ) : null}

            <div className="result-grid result-grid-visible">
              <ResultMetricCard title="Analiz rotası" value={displayedResult.analysisRoute} tone="accent" />
              <ResultMetricCard title="Niyet" value={displayedResult.intent} tone="accent" />
              {displayedResult.matchedAttack ? (
                <ResultMetricCard
                  title={
                    displayedResult.matchedAttackExact
                      ? "Eşleşen saldırı / teknik"
                      : "Eşleşen saldırı / teknik (yaklaşık)"
                  }
                  value={displayedResult.matchedAttack}
                />
              ) : null}
              <ResultMetricCard title="Eşleşen artifact" value={displayedResult.matchedArtifact} />
              <ResultMetricCard title="Kategori" value={displayedResult.matchedCategory} />
              <ResultMetricCard title="Eşleşme yöntemi" value={displayedResult.mappingMethod} />
              <ResultMetricCard title="Güven düzeyi" value={displayedResult.confidence} />

              {displayedResult.extractedArtifacts.length ? (
                <ResultMetricCard
                  title="Çıkarılan artifact'ler"
                  items={displayedResult.extractedArtifacts}
                />
              ) : null}
              {displayedResult.extractedAttacks.length ? (
                <ResultMetricCard
                  title="Çıkarılan saldırılar"
                  items={displayedResult.extractedAttacks}
                />
              ) : null}
              {displayedResult.keywords.length ? (
                <ResultMetricCard title="Anahtar kelimeler" items={displayedResult.keywords} />
              ) : null}

              <ResultMetricCard
                title="Doğrudan saldırılar"
                items={displayedResult.directAttacks}
                value={displayedResult.directAttacks.length ? null : "Sinyal bulunamadı"}
              />
              {displayedResult.mayImpactArtifacts.length ? (
                <ResultMetricCard
                  title="Etkilenebilecek varlıklar"
                  items={displayedResult.mayImpactArtifacts}
                />
              ) : null}
              {displayedResult.mayImpactAttacks.length ? (
                <ResultMetricCard
                  title="Yayılım kaynaklı saldırılar"
                  items={displayedResult.mayImpactAttacks}
                />
              ) : null}
              <ResultMetricCard
                title="Doğrudan tactic'ler"
                items={displayedResult.directTactics}
                value={displayedResult.directTactics.length ? null : "Sinyal bulunamadı"}
              />
              <ResultMetricCard
                title="Olası sonraki tactic'ler"
                items={displayedResult.nextTactics}
                value={displayedResult.nextTactics.length ? null : "Sinyal bulunamadı"}
              />
              <ResultMetricCard
                title="Top-5 saldırı tahmini"
                items={displayedResult.predictions}
                value={displayedResult.predictions.length ? null : "Tahmin üretilmedi"}
              />
              <ResultMetricCard
                title="Savunma önerileri"
                items={displayedResult.defenses}
                value={displayedResult.defenses.length ? null : "Öneri üretilmedi"}
              />
              {displayedResult.lowConfidenceReason ? (
                <ResultMetricCard
                  title="Düşük güven açıklaması"
                  value={displayedResult.lowConfidenceReason}
                />
              ) : null}
            </div>
          </>
        ) : (
          <SurfaceCard
            title="Henüz senaryo analizi yok"
            subtitle="Bir senaryo gönderdiğinizde önce kısa yorum, ardından niyet, çıkarılan kavramlar ve analiz kartları burada görünür."
          />
        )}
      </section>
    </div>
  );
}

export default ScenarioPage;
