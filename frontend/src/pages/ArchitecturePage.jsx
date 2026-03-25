import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";

const architectureItems = [
  {
    title: "Frontend",
    text: "ThreatGraph AI arayüzü; landing, analiz, mimari, graph ve senaryo sayfalarını tek tasarım dili altında birleştirir."
  },
  {
    title: "FastAPI backend",
    text: "POST /api/analyze uç noktası üzerinden artifact adı ve açıklamayı alır, birleşik analiz zincirini çalıştırır ve tek cevap modeli döner."
  },
  {
    title: "Mapping service",
    text: "Gelen artifact'i normalize eder, eşleme stratejisini belirler ve yeni girişler ile mevcut düğümler arasındaki en uygun karşılığı üretir."
  },
  {
    title: "Neo4j graph reasoning",
    text: "Artifact, attack, tactic ve defense düğümleri arasındaki ilişkileri izleyerek doğrudan ve sonraki adımları açıklar."
  },
  {
    title: "ML ranking",
    text: "Graph reasoning katmanından gelen sinyalleri olasılıksal sıralama ile tamamlar ve Top-5 saldırı tahmini üretir."
  },
  {
    title: "Defense recommendation",
    text: "Tespit edilen saldırı ve tactic ilişkilerine göre savunma önerilerini karar destek çıktısı haline getirir."
  },
  {
    title: "Confidence / abstention",
    text: "Sonuç yeterince güçlü değilse bunu saklamaz; düşük güven nedenini yazar ve gereksiz kesinlik iddiasından kaçınır."
  }
];

function ArchitecturePage() {
  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="ThreatGraph AI Architecture"
          title="Frontend'den karar motoruna uzanan net sistem akışı"
          description="Bu sayfa ürünün arayüz katmanı ile çekirdek siber analiz bileşenleri arasındaki görev paylaşımını daha diyagramik ve ürün odaklı biçimde özetler."
        />
      </section>

      <section className="container section-panel section-panel-dark">
        <div className="card-grid card-grid-2">
          {architectureItems.map((item) => (
            <SurfaceCard key={item.title} title={item.title}>
              <p>{item.text}</p>
            </SurfaceCard>
          ))}
        </div>
      </section>

      <section className="container content-section-inner section-panel section-panel-dark">
        <SurfaceCard
          title="Veri akışı özeti"
          subtitle="Artifact girişi, reasoning ve karar desteği ardışık fakat birbirini besleyen sistem blokları halinde ilerler."
        >
          <div className="architecture-flow">
            <span>Kullanıcı Girdisi</span>
            <span>Mapping</span>
            <span>Graph Reasoning</span>
            <span>ML Ranking</span>
            <span>Defense</span>
            <span>Confidence</span>
            <span>Ürün Çıktısı</span>
          </div>
        </SurfaceCard>
      </section>
    </div>
  );
}

export default ArchitecturePage;
