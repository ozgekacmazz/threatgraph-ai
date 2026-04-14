import ResultMetricCard from "./ResultMetricCard";
import SurfaceCard from "./SurfaceCard";

function ScenarioAnalysisResults({ displayedResult }) {
  if (!displayedResult) {
    return (
      <SurfaceCard
        title="Henüz senaryo analizi yok"
        subtitle="Bu alanda uzun açıklama, çıkarılan kavramlar ve yapılandırılmış analiz kartları gösterilir."
      />
    );
  }

  return (
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
          <ResultMetricCard title="Çıkarılan artifact'ler" items={displayedResult.extractedArtifacts} />
        ) : null}
        {displayedResult.extractedAttacks.length ? (
          <ResultMetricCard title="Çıkarılan saldırılar" items={displayedResult.extractedAttacks} />
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
  );
}

export default ScenarioAnalysisResults;
