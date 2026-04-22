import { Link } from "react-router-dom";
import GraphCanvasPlaceholder from "../components/GraphCanvasPlaceholder";
import ScenarioCard from "../components/ScenarioCard";
import SectionHeader from "../components/SectionHeader";
import SurfaceCard from "../components/SurfaceCard";

const capabilityCards = [
  {
    title: "Artifact sinyalini bağlamsal olarak çözümler",
    text: "ThreatGraph AI yalnızca isim eşleşmesine bakmaz; girişteki operasyonel bağlamı da kullanarak daha güçlü artifact karşılığı üretir."
  },
  {
    title: "Neo4j üzerinde ilişkisel saldırı resmi kurar",
    text: "Artifact, attack, tactic ve defense düğümleri arasındaki ilişki akışını görünür hale getirerek neden-sonuç zincirini okunabilir kılar."
  },
  {
    title: "ML ile aksiyon önceliğini netleştirir",
    text: "Knowledge graph çıkarımlarını olasılıksal sıralama ile birleştirir; ekiplerin önce hangi saldırı ihtimaline bakması gerektiğini öne çıkarır."
  }
];

const flowSteps = [
  {
    key: "INPUT",
    title: "powershell script",
    text: "Operasyonel bağlamı olan artifact girişi alınır."
  },
  {
    key: "MAPPING",
    title: "Hybrid context match",
    text: "Yeni ya da mevcut artifact için en uygun karşılık bulunur."
  },
  {
    key: "REASONING",
    title: "Attack & tactic ilişkileri",
    text: "Neo4j üzerinde doğrudan ve zincirsel ilişkiler açılır."
  },
  {
    key: "ETKİ YAYILIMI",
    title: "Zincirleme risk görünümü",
    text: "Bir artifact’in etkileyebileceği bağlı varlıklar ve bu yayılımdan doğabilecek ek saldırı yüzeyi görünür hale gelir."
  },
  {
    key: "ML RANKING",
    title: "Top-5 saldırı tahmini",
    text: "Model, en kritik saldırı adaylarını olasılıkla sıralar."
  },
  {
    key: "CONFIDENCE",
    title: "Yüksek güvenle aksiyon",
    text: "Çıktı güven düzeyi net biçimde belirtilir."
  }
];

const pipelineSteps = [
  "Input artifact ve açıklama alınır, metin normalize edilir.",
  "Hybrid mapping katmanı artifact'i yeni veya mevcut örnek olarak konumlandırır.",
  "Neo4j reasoning ile saldırı ilişkileri, tactic akışı ve savunma bağlantıları görünür hale gelir.",
  "Etki yayılımı katmanı bağlı varlıklara sıçrayabilecek zincirleme riski ve ek saldırı yüzeyini açığa çıkarır.",
  "ML ranking katmanı Top-5 saldırı tahminini olasılıksal sırayla üretir.",
  "Defense recommendation motoru savunma aksiyonlarını ilişkiye dayalı olarak hazırlar.",
  "Confidence katmanı düşük güvenli çıktılarda dürüst abstention davranışını devreye alır."
];

const features = [
  "Açıklanabilir analiz",
  "Canlı graph reasoning",
  "Top-5 saldırı önceliklendirmesi",
  "Savunma öneri motoru",
  "Low-confidence dürüstlüğü"
];

const scenarios = [
  {
    title: "Phishing Sonrası Kimlik Bilgisi veya MFA Token Ele Geçirilirse Ne Olabilir?",
    input: "Phishing sonrası kimlik bilgisi veya MFA token ele geçirilirse ne olabilir?",
    previewComment:
      "Ele geçirilen oturum bilgileri ve doğrulama materyali üzerinden hesap kötüye kullanımı, yetkisiz erişim ve hızlı yayılım riski ürün düzeyinde incelenir."
  },
  {
    title: "Pass-the-Hash Sonrası Hangi Sistemlere Yayılım Olabilir?",
    input: "Pass-the-Hash sonrası hangi sistemlere yayılım olabilir?",
    previewComment:
      "Kimlik doğrulama materyalinin yeniden kullanımı sonrasında uzak erişim yüzeyleri, etkilenecek host'lar ve yanal hareket ihtimali kısa ve net biçimde özetlenir."
  },
  {
    title: "Kerberos Ticket Ele Geçirilirse Sonraki Saldırılar Neler Olabilir?",
    input: "Kerberos ticket ele geçirilirse sonraki saldırılar neler olabilir?",
    previewComment:
      "Ticket tekrar kullanımı, servis erişimi, ayrıcalık kötüye kullanımı ve takip eden saldırı yolları karar desteği odağında görünür hale gelir."
  },
  {
    title: "DNS Tunneling Tespit Edilirse Hangi Artifact'ler Risk Altındadır?",
    input: "DNS tunneling tespit edilirse hangi artifact'ler risk altındadır?",
    previewComment:
      "Şüpheli DNS iletişimi görüldüğünde risk altındaki host, süreç, oturum ve ağ artifact'leri ürün senaryosu olarak hızlıca çerçevelenir."
  },
  {
    title: "Domain Hesabı Compromise Olduysa Sonraki Riskler Neler Olabilir?",
    input: "Domain hesabı compromise olduysa sonraki riskler neler olabilir?",
    previewComment:
      "Compromise olmuş bir domain hesabının erişebileceği sistemler, servisler ve olası zincir riskler kısa, anlaşılır ve ürün odaklı bir özetle sunulur."
  }
];

function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy-block">
            <p className="section-eyebrow">ThreatGraph AI</p>
            <h1>Siber saldırıları bilgi grafiği üzerinden anlayın, tahmin edin ve yönetin</h1>
            <p className="hero-description">
              Knowledge graph ve makine öğrenmesi ile saldırı davranışını çözümleyen karar
              destek sistemi. ThreatGraph AI, yeni gelen artifact&apos;leri ve graf içinde zaten
              bilinen sinyalleri tek bir ürün akışında analiz eder.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/analiz">
                Analizi Dene
              </Link>
            </div>
            <div className="hero-highlights">
              <div>
                <strong>Çift analiz modu</strong>
                <span>Yeni artifact ve mevcut artifact akışları aynı çalışma alanında.</span>
              </div>
              <div>
                <strong>Knowledge graph + ML</strong>
                <span>İlişki çıkarımı ile saldırı önceliklendirmesi birlikte çalışır.</span>
              </div>
              <div>
                <strong>Dürüst karar desteği</strong>
                <span>Düşük güven durumunda sistem sonucu zorlamaz, nedeniyle açıklar.</span>
              </div>
            </div>
          </div>

          <SurfaceCard
            className="hero-panel hero-pipeline-panel"
            title="Ürün akışı"
            subtitle="ThreatGraph AI analiz zinciri karar desteğine bu sıralı iş akışıyla ulaşır."
          >
            <div className="hero-pipeline-grid">
              {flowSteps.map((step) => (
                <div key={step.key} className="flow-step-card">
                  <span className="flow-step-key">{step.key}</span>
                  <strong>{step.title}</strong>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="content-section">
        <div className="container section-panel section-panel-dark">
          <SectionHeader
            eyebrow="Sistem ne yapar?"
            title="ThreatGraph AI artifact merkezli saldırı yorumlamasını tek üründe toplar"
            description="Backend analiz zinciri zaten çalışırken arayüz; attack ilişkileri, tactic akışı, savunma önerileri, etki yayılımı ve confidence çıktısını kurumsal kullanıma uygun bir karar deneyimine dönüştürür."
          />
          <div className="card-grid card-grid-3">
            {capabilityCards.map((item) => (
              <SurfaceCard key={item.title} title={item.title}>
                <p>{item.text}</p>
              </SurfaceCard>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section subtle-section">
        <div className="container section-panel section-panel-light">
          <SectionHeader
            eyebrow="Yeni ve mevcut artifact"
            title="Aynı sistem, iki farklı analiz ihtiyacını aynı karar modelinde karşılar"
            description="ThreatGraph AI dışarıdan gelen yeni bir artifact ile bilgi grafiğinde zaten temsil edilen bir artifact arasında net bir ayrım kurar; ancak kullanıcı deneyimini bölmeden bunu tek ürün akışında sunar."
          />
          <div className="split-grid">
            <SurfaceCard
              title="Yeni artifact analizi"
              subtitle="Henüz graf içinde net karşılığı olmayan veya bağlamla gelen girişler için"
            >
              <p>
                Sistem isim ve açıklamayı birlikte değerlendirir, en uygun eşleşmeyi üretir,
                confidence düzeyini ölçer ve sonuç yeterince güçlü değilse bunu dürüstçe belirtir.
              </p>
            </SurfaceCard>
            <SurfaceCard
              title="Mevcut artifact analizi"
              subtitle="Bilgi grafiğinde zaten tanımlı bir sinyal için doğrulayıcı ve açıklanabilir akış"
            >
              <p>
                Bilinen artifact doğrudan graph reasoning katmanına bağlanır; direct attack,
                tactic akışı, savunma ilişkileri ve etki yayılımı daha hızlı ve daha net şekilde açılır.
              </p>
            </SurfaceCard>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="container section-panel section-panel-dark">
          <SectionHeader
            eyebrow="Neden Hibrit KG + ML?"
            title="Tek yöntem değil, birbirini tamamlayan iki karar katmanı"
            description="Knowledge graph ilişki şeffaflığı sağlar; makine öğrenmesi ise olasılıksal önceliklendirme üretir. ThreatGraph AI bu iki katmanı aynı ürün yüzeyinde birleştirir."
          />
          <div className="comparison-panel">
            <SurfaceCard title="Knowledge graph katkısı">
              <p>
                Artifact&apos;ten attack zincirine giden ilişki katmanını açıklanabilir biçimde
                sunar; ekipler yalnızca sonucu değil, sonucun nedenini de görür.
              </p>
            </SurfaceCard>
            <SurfaceCard title="Makine öğrenmesi katkısı">
              <p>
                Birden fazla saldırı adayının bulunduğu anlarda karar yükünü azaltır ve Top-5
                tahmin listesiyle öncelikli riskleri öne çıkarır.
              </p>
            </SurfaceCard>
          </div>
        </div>
      </section>

      <section className="content-section subtle-section">
        <div className="container section-panel section-panel-light">
          <SectionHeader
            eyebrow="Nasıl çalışır?"
            title="Uçtan uca analiz hattı"
            description="Artifact girişinden confidence değerlendirmesine kadar bütün pipeline tek bir operasyonel akışta ilerler."
          />
          <div className="timeline-grid">
            {pipelineSteps.map((step, index) => (
              <SurfaceCard
                key={step}
                className="timeline-card"
                title={`0${index + 1}`}
                subtitle={step}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="container section-panel section-panel-dark">
          <SectionHeader
            eyebrow="Öne çıkan özellikler"
            title="Kurumsal kullanım senaryolarına uygun güvenlik ürünü özellikleri"
          />
          <div className="pill-grid">
            {features.map((feature) => (
              <span key={feature} className="feature-pill">
                {feature}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="content-section subtle-section">
        <div className="container section-panel section-panel-light">
          <SectionHeader
            eyebrow="Test senaryoları"
            title="Farklı artifact tiplerinde ürün davranışı gözlemlendi"
            description="Aşağıdaki örnekler, metinsel girişlerin ve bağlamsal ipuçlarının eşleşme kalitesini ve karar desteğini nasıl etkilediğini özetler."
          />
          <div className="card-grid card-grid-3">
            {scenarios.map((scenario) => (
              <ScenarioCard key={scenario.title} {...scenario} buttonVariant="home" />
            ))}
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="container section-panel section-panel-dark graph-teaser-grid">
          <div>
            <SectionHeader
              eyebrow="Neo4j graph"
              title="İlişki katmanını yalnızca sonuç olarak değil, canlı karar yüzeyi olarak sunar"
              description="Graf sayfası ve analiz ekranı, canlı Neo4j görselleştirmesi büyüdüğünde büyük refactor gerektirmeyecek şekilde aynı ürün tasarım sisteminde hazırlanmıştır."
            />
            <p className="support-copy">
              Artifact düğümleri, attack ilişkileri, tactic akışı, savunma bağlantıları ve etki
              yayılımı için ayrı görsel katmanlar hazır. Bu alan, karar verirken ilişki zincirini
              doğal ve okunabilir biçimde izlemeyi kolaylaştırır.
            </p>
            <Link className="button button-secondary" to="/graf">
              Graph Alanını Aç
            </Link>
          </div>
          <GraphCanvasPlaceholder
            title="ThreatGraph AI"
            description="Canlı düğüm-ilişki görünümü, odak geçişleri ve ilişki filtreleri için ayrılmış ürün alanı."
          />
        </div>
      </section>

      <section className="content-section">
        <div className="container section-panel section-panel-dark final-cta">
          <SectionHeader
            align="center"
            eyebrow="Karar ekranına geçin"
            title="ThreatGraph AI analiz akışını canlı ürün deneyiminde inceleyin"
            description="Analiz ekranı yeni ve mevcut artifact modlarını aynı workspace içinde sunar; graph ekranı ise canlı ilişki görünümünü genişletmek için hazırdır."
          />
          <div className="hero-actions hero-actions-centered">
            <Link className="button button-primary" to="/analiz">
              Analizi Dene
            </Link>
            <Link className="button button-secondary" to="/senaryolar">
              Senaryoları Gör
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default HomePage;
