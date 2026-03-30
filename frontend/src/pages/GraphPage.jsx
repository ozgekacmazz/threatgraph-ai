import { useEffect, useState } from "react";
import LiveGraphPanel from "../components/LiveGraphPanel";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";
import { fetchGraphContext } from "../services/api";

const graphSections = [
  {
    title: "Artifact düğümleri",
    text: "Analiz edilen giriş artifact'i ve varsa eşleşen canonical artifact düğümü aynı graph odak alanında gösterilir."
  },
  {
    title: "Attack ilişkileri",
    text: "Neo4j reasoning sonucu ortaya çıkan doğrudan saldırılar ve varsa yayılım kaynaklı saldırılar graph üzerinde okunabilir biçimde açılır."
  },
  {
    title: "Tactic akışı",
    text: "Doğrudan tactic ilişkileri `HAS_TACTIC`, sonraki genişleme hattı ise `NEXT_TACTIC` kenarlarıyla ayrıştırılır."
  },
  {
    title: "Savunma ilişkileri",
    text: "Defense düğümleri mevcut olduğunda `DEFENDED_BY` ilişkileriyle aynı görünümde karar desteğine eklenir."
  },
  {
    title: "Etki yayılımı",
    text: "Bağlı varlıklara doğru genişleyen risk hattı, zincirleme etkileri ve ek saldırı yüzeyini aynı keşif akışında görünür kılar."
  }
];

const exampleQueries = ["access token", "powershell script", "dns cache"];

function GraphPage() {
  const [artifactName, setArtifactName] = useState("");
  const [analysisMode, setAnalysisMode] = useState("known");
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("summary");

  useEffect(() => {
    const rawLatestGraph = window.localStorage.getItem("latestGraphContext");
    if (!rawLatestGraph) {
      return;
    }

    try {
      const parsed = JSON.parse(rawLatestGraph);
      setGraphData(parsed);
      setArtifactName(parsed.focus?.artifact || "");
      setAnalysisMode(parsed.focus?.analysis_mode || "known");
    } catch {
      window.localStorage.removeItem("latestGraphContext");
    }
  }, []);

  const loadGraphContext = async (artifact, mode) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetchGraphContext({
        artifact_name: artifact.trim(),
        analysis_mode: mode
      });
      setGraphData(response);
      setArtifactName(artifact.trim());
      setAnalysisMode(mode);
      window.localStorage.setItem("latestGraphContext", JSON.stringify(response));
    } catch (requestError) {
      setError(
        requestError.message ||
          "Graph bağlamı alınamadı. Lütfen artifact adını kontrol edip yeniden deneyin."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGraphSearch = async (event) => {
    event.preventDefault();
    await loadGraphContext(artifactName, analysisMode);
  };

  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="ThreatGraph AI Graph"
          title="Canlı node-edge görünümü ile saldırı ilişkilerini keşfedin"
          description="Bu alan statik bir mock değil, backend'den gelen graph-ready veriyi işler. Varsayılan özet görünüm; attack ilişkileri, tactic akışı, savunma bağlantıları ve etki yayılımını ilk bakışta takip etmeyi kolaylaştırır."
        />
      </section>

      <section className="container graph-page-grid section-panel section-panel-workspace">
        <SurfaceCard
          className="graph-query-panel"
          title="Graph odağı"
          subtitle="Son analiz edilen artifact'i inceleyin veya yeni bir odak sorgusu başlatın."
        >
          <p>
            Graph endpoint'i; artifact, eşleşen artifact, attack ilişkileri, tactic akışı,
            savunma bağlantıları, etki yayılımı ve yayılım kaynaklı saldırı sinyallerini
            normalize edilmiş ilişki yapısıyla frontend'e taşır.
          </p>

          <div className="query-helper-strip">
            <span>Örnek sorgular</span>
            <div className="query-helper-chips">
              {exampleQueries.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="mode-chip query-helper-chip"
                  onClick={() => {
                    setArtifactName(example);
                    void loadGraphContext(example, analysisMode);
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <form className="graph-query-form" onSubmit={handleGraphSearch}>
            <label className="field">
              <span>Artifact odağı</span>
              <input
                type="text"
                value={artifactName}
                onChange={(event) => setArtifactName(event.target.value)}
                placeholder='Örnek: "access token"'
                required
              />
            </label>

            <div className="graph-field-help">
              Daha doğru analiz için İngilizce terimler önerilir (örn: dns cache, access token)
            </div>

            <div className="graph-view-mode">
              <span>Görünüm modu</span>
              <div className="graph-view-toggle">
                <button
                  type="button"
                  className={`mode-chip${viewMode === "summary" ? " mode-chip-active" : ""}`}
                  onClick={() => setViewMode("summary")}
                >
                  Özet görünüm
                </button>
                <button
                  type="button"
                  className={`mode-chip${viewMode === "full" ? " mode-chip-active" : ""}`}
                  onClick={() => setViewMode("full")}
                >
                  Tam görünüm
                </button>
              </div>
            </div>

            <div className="graph-mode-row">
              <button
                type="button"
                className={`mode-chip${analysisMode === "new" ? " mode-chip-active" : ""}`}
                onClick={() => setAnalysisMode("new")}
              >
                Yeni artifact
              </button>
              <button
                type="button"
                className={`mode-chip${analysisMode === "known" ? " mode-chip-active" : ""}`}
                onClick={() => setAnalysisMode("known")}
              >
                Mevcut artifact
              </button>
            </div>

            <div className="form-actions">
              <button className="button button-primary" type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <span className="button-spinner" aria-hidden="true" />
                    Graph hazırlanıyor...
                  </>
                ) : (
                  "Graph Görünümünü Yükle"
                )}
              </button>
            </div>
          </form>
          {error ? <div className="error-box">{error}</div> : null}
        </SurfaceCard>

        <div className="graph-visual-column">
          <LiveGraphPanel
            graph={graphData}
            loading={loading}
            error={error}
            viewMode={viewMode}
            emptyTitle="Henüz graph bağlamı oluşturulmadı"
            emptyDescription="Bir analiz çalıştırın veya bilinen bir artifact odağı yükleyerek canlı graph görünümünü başlatın."
          />
        </div>
      </section>

      <section className="container content-section-inner section-panel section-panel-dark">
        <div className="card-grid card-grid-2">
          {graphSections.map((item) => (
            <SurfaceCard key={item.title} title={item.title}>
              <p>{item.text}</p>
            </SurfaceCard>
          ))}
        </div>
      </section>
    </div>
  );
}

export default GraphPage;
