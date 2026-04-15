import ResultMetricCard from "./ResultMetricCard";

function ScenarioAnalysisResults({ displayedResult }) {
  if (!displayedResult) {
    return null;
  }

  return (
    <>
      {displayedResult.explanationSections.length ? (
        <article className="result-metric-card result-metric-card-accent analysis-explanation-card">
          <span className="metric-label">Yapılandırılmış değerlendirme</span>
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
        </article>
      ) : null}

      <div className="result-grid result-grid-visible">
        {displayedResult.mayImpactArtifacts.length ? (
          <ResultMetricCard
            title="Etkilenebilecek artifact'ler"
            items={displayedResult.mayImpactArtifacts}
          />
        ) : null}
        {displayedResult.mayImpactAttacks.length ? (
          <ResultMetricCard
            title="Olası sonraki saldırılar"
            items={displayedResult.mayImpactAttacks}
          />
        ) : null}
        <ResultMetricCard
          title="Doğrudan saldırılar"
          items={displayedResult.directAttacks}
          value={displayedResult.directAttacks.length ? null : "Sinyal bulunamadı"}
        />
        <ResultMetricCard
          title="Doğrudan taktikler"
          items={displayedResult.directTactics}
          value={displayedResult.directTactics.length ? null : "Sinyal bulunamadı"}
        />
        <ResultMetricCard
          title="Olası sonraki taktikler"
          items={displayedResult.nextTactics}
          value={displayedResult.nextTactics.length ? null : "Sinyal bulunamadı"}
        />
        <ResultMetricCard
          title="Önerilen savunma öncelikleri"
          items={displayedResult.defenses}
          value={displayedResult.defenses.length ? null : "Öneri üretilmedi"}
        />
      </div>
    </>
  );
}

export default ScenarioAnalysisResults;
