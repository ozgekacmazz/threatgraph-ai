import ScenarioCard from "../components/ScenarioCard";
import SectionHeader from "../components/SectionHeader";

const scenarios = [
  {
    title: "Session Hijacking Risk Analysis",
    subtitle: "JWT tabanlı kimlik doğrulama akışında oturum devralma sinyallerini yorumlar",
    input: "Kimlik doğrulama sürecinde gözlenen bearer token izi",
    matchedArtifact: "jwt token",
    whyItMatters: "Yetki devralma, token misuse ve oturum manipülasyonu gibi saldırı yollarına köprü kurar.",
    analysisMode: "known"
  },
  {
    title: "Privilege Context Token Correlation",
    subtitle: "Ek bağlamın eşleşme doğruluğunu ve saldırı önceliklendirmesini nasıl etkilediğini gösterir",
    input: "Token ifadesine ek olarak privilege escalation ve session context açıklaması",
    matchedArtifact: "jwt token",
    whyItMatters: "Bağlamsal açıklamanın mapping doğruluğunu ve saldırı sıralamasını nasıl iyileştirdiğini gösterir.",
    analysisMode: "new"
  },
  {
    title: "Network Reconnaissance via DNS",
    subtitle: "Ağ keşfi ve çözümleme davranışının graph reasoning ile nasıl açıldığını özetler",
    input: "DNS cache kalıntısı ve çözümleme trafiğine dair açıklama",
    matchedArtifact: "dns cache",
    whyItMatters: "Keşif, yönlendirme ve ağ temelli saldırı ilişkilerinin bilgi grafiğinde nasıl açıldığını gösterir.",
    analysisMode: "known"
  },
  {
    title: "PowerShell Execution Trace",
    subtitle: "Komut yürütme ve post-exploitation zincirini görünür hale getiren giriş örneği",
    input: "Komut yürütme içeren script izi ve komut satırı bağlamı",
    matchedArtifact: "powershell script",
    whyItMatters: "Execution ve post-exploitation davranışlarının graph reasoning ile görünür hale geldiği güçlü bir örnektir.",
    analysisMode: "new"
  },
  {
    title: "Low-Confidence Unknown Artifact Review",
    subtitle: "Sistemin belirsiz girişlerde gereksiz kesinlik iddia etmediğini gösterir",
    input: "Graf içinde belirgin karşılığı olmayan belirsiz artifact adı ve sınırlı açıklama",
    matchedArtifact: "belirsiz artifact",
    whyItMatters: "Sistemin her durumda kesinlik iddia etmediğini, düşük güven halinde dürüst abstention uyguladığını gösterir.",
    analysisMode: "new"
  }
];

function ScenariosPage() {
  return (
    <div className="page-section">
      <section className="container page-intro section-panel section-panel-dark">
        <SectionHeader
          eyebrow="ThreatGraph AI Scenarios"
          title="Ürün davranışını anlatan test senaryoları"
          description="Bu kartlar sistemin farklı artifact tiplerinde neyi çözdüğünü, nasıl eşleşme kurduğunu ve neden önemli olduğunu daha güçlü bir hikâye diliyle açıklar."
        />
      </section>

      <section className="container section-panel section-panel-dark">
        <div className="card-grid card-grid-3">
          {scenarios.map((scenario) => (
            <ScenarioCard key={scenario.title} {...scenario} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default ScenariosPage;
