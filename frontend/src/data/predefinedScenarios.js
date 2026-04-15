import { buildScenarioNarrative } from "../utils/scenarioNarrativeEngine.js";

function buildPredefinedNarrativeContent(scenario) {
  const narrative = buildScenarioNarrative({
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    questionText: scenario.questionText,
    scenarioText: scenario.scenarioText,
    matchedArtifact: "",
    matchedAttack: "",
    directAttacks: [],
    mayImpactArtifacts: [],
    mayImpactAttacks: [],
    directTactics: [],
    nextTactics: [],
    defenses: [],
    extractedArtifacts: [],
    extractedAttacks: [],
    predictions: [],
    explanationText: "",
    explanationSections: [],
    confidence: "",
    mappingMethod: "",
    lowConfidenceReason: "",
  });

  return {
    shortPreview: narrative.interpretation,
    shortAnalysisIntro: narrative.interpretation,
    shortAnalysisRisk: narrative.immediateRisk,
    shortImmediateActions: narrative.actions,
  };
}

const basePredefinedScenarios = [
  {
    id: "credential-theft-risk-chain",
    title: "Phishing Sonrası Kimlik Bilgisi veya MFA Token Ele Geçirilirse Ne Olabilir?",
    questionText: "Phishing sonrası kimlik bilgisi veya MFA token ele geçirilirse ne olabilir?",
    shortPreview:
      "Ele geçirilen oturum bilgisi veya MFA doğrulaması; hesap kötüye kullanımı, yetkisiz servis erişimi ve kısa sürede yeni oturumların açılması gibi zincir etkiler doğurabilir.",
    shortAnalysisIntro:
      "Bu senaryo, phishing sonrası ele geçirilen kimlik bilgileri veya MFA token'larının hangi hesapları, oturumları ve uzak erişim yollarını riske atabileceğini değerlendirmek için hazırlanmıştır.",
    shortAnalysisRisk:
      "Odak noktası; hesap ve oturum kötüye kullanımı, yeni servis erişimleri, kalıcılık denemeleri ve aynı kimlikle başka sistemlere geçiş ihtimalidir.",
    shortImmediateActions: [
      "Etkilenen hesaplarda parola sıfırlama ve aktif oturum sonlandırma adımlarını hemen başlatın.",
      "MFA token veya oturum çerezi geçersiz kılma işlemlerini uygulayın ve yeniden kayıt gereksinimini değerlendirin.",
      "Şüpheli girişler, yeni cihaz kayıtları ve beklenmeyen servis erişimleri için yakın dönem log incelemesi yapın.",
    ],
    scenarioText:
      "Phishing sonrası kimlik bilgisi veya MFA token ele geçirildiyse hangi hesaplar, oturumlar, servis erişimleri ve takip eden saldırılar risk altına girer? Olası yayılımı, etkilenen artifact'leri ve acil savunma önceliklerini analiz et.",
  },
  {
    id: "pass-the-hash-spread",
    title: "Pass-the-Hash Sonrası Hangi Sistemlere Yayılım Olabilir?",
    questionText: "Pass-the-Hash sonrası hangi sistemlere yayılım olabilir?",
    shortPreview:
      "Yeniden kullanılan kimlik doğrulama materyali; uzak servisler, yönetim oturumları ve aynı erişim zincirindeki ek host'lar üzerinden yanal hareket başlatabilir.",
    shortAnalysisIntro:
      "Bu senaryo, Pass-the-Hash sonrasında hangi host'ların, uzak yönetim servislerinin ve kimlik ilişkilerinin hızla etkilenebileceğini ortaya koymak için tasarlanmıştır.",
    shortAnalysisRisk:
      "Öne çıkan riskler; yanal hareket, yetkisiz yönetim erişimi, paylaşımlı kimliklerle yeni sistemlere sıçrama ve ayrıcalıklı hesapların kötüye kullanılmasıdır.",
    shortImmediateActions: [
      "İlgili hesap için görülen uzak oturumları, SMB/RDP/WinRM gibi erişim izlerini ve hedef host'ları doğrulayın.",
      "Şüpheli kaynağı ağdan izole edin ve etkilenen kimlikler için parola rotasyonu başlatın.",
      "Uzak yönetim yüzeylerini geçici olarak kısıtlayın ve benzer kimlik tekrar kullanımını izlemeye alın.",
    ],
    scenarioText:
      "Pass-the-Hash sonrasında hangi sistemlere yayılım olabilir? Etkilenebilecek host'ları, kimlik ve oturum artifact'lerini, olası takip saldırılarını ve acil savunma önceliklerini analiz et.",
  },
  {
    id: "kerberos-ticket-follow-on",
    title: "Kerberos Ticket Ele Geçirilirse Sonraki Saldırılar Neler Olabilir?",
    questionText: "Kerberos ticket ele geçirilirse sonraki saldırılar neler olabilir?",
    shortPreview:
      "Ele geçirilen Kerberos ticket'ı; servis hesapları adına erişim, yeni oturum açma girişimleri ve yüksek ayrıcalıklı kaynaklara yetkisiz ulaşım için kullanılabilir.",
    shortAnalysisIntro:
      "Bu senaryo, ele geçirilmiş Kerberos ticket'ının hangi servisleri, oturumları ve kimlik doğrulama akışlarını etkileyebileceğini teknik olarak anlamaya yöneliktir.",
    shortAnalysisRisk:
      "Ana riskler; ticket tekrar kullanımı, servis yetkilerinin kötüye kullanılması, ayrıcalık yükseltme denemeleri ve aynı etki alanı içinde yeni erişim yollarının açılmasıdır.",
    shortImmediateActions: [
      "İlgili hesap ve servisler için ticket geçerlilik durumunu gözden geçirin, gerekiyorsa oturumları sonlandırın.",
      "Şüpheli Kerberos isteklerini, servis bileti kullanımını ve beklenmeyen erişim örüntülerini izleyin.",
      "Hassas servis hesaplarında parola rotasyonu, erişim gözden geçirmesi ve ek kısıtlama adımlarını uygulayın.",
    ],
    scenarioText:
      "Kerberos ticket ele geçirildiyse hangi servisler, oturumlar, kimlik doğrulama artifact'leri ve takip eden saldırılar gündeme gelebilir? Yetkisiz erişim risklerini, olası yayılımı ve acil savunma önceliklerini analiz et.",
  },
  {
    id: "dns-tunneling-artifact-risk",
    title: "DNS Tunneling Tespit Edilirse Hangi Artifact'ler Risk Altındadır?",
    questionText: "DNS tunneling tespit edilirse hangi artifact'ler risk altındadır?",
    shortPreview:
      "Olağandışı DNS trafiği; veri sızdırma, komut aktarımı veya gizli haberleşme amacıyla kullanılan host, süreç, oturum ve ağ artifact'lerini işaret edebilir.",
    shortAnalysisIntro:
      "Bu senaryo, DNS tunneling şüphesinde hangi sistemlerin, süreçlerin, ağ oturumlarının ve ilişkili kimliklerin öncelikli inceleme gerektirdiğini göstermek için hazırlanmıştır.",
    shortAnalysisRisk:
      "Değerlendirme; şüpheli DNS sorguları, arka planda çalışan süreçler, olası komuta-kontrol iletişimi ve aynı kaynaktan gelişebilecek ek ağ aktivitelerine odaklanır.",
    shortImmediateActions: [
      "Anormal sorgu üreten host'ları, süreçleri ve kullanıcı oturumlarını hızlıca eşleştirip doğrulayın.",
      "Şüpheli DNS isteklerini engelleyin, ilgili uç noktayı kısıtlayın ve eşlik eden ağ bağlantılarını inceleyin.",
      "DNS görünürlüğünü artırın; aynı deseni gösteren diğer sistemler için avcılık ve sürekli izleme başlatın.",
    ],
    scenarioText:
      "DNS tunneling tespit edildiyse hangi host, süreç, ağ oturumu, kimlik veya diğer artifact'ler risk altında olabilir? Olası veri sızdırma, takip eden saldırılar ve acil savunma önceliklerini analiz et.",
  },
  {
    id: "domain-account-compromise-risk",
    title: "Domain Hesabı Compromise Olduysa Sonraki Riskler Neler Olabilir?",
    questionText: "Domain hesabı compromise olduysa sonraki riskler neler olabilir?",
    shortPreview:
      "Ele geçirilen bir domain hesabı; paylaşımlı servis erişimleri, yeni oturumlar, ayrıcalıklı kaynaklara yönelim ve kısa sürede yanal hareket riskini artırır.",
    shortAnalysisIntro:
      "Bu senaryo, compromise olmuş bir domain hesabının hangi kimlikleri, host'ları, uzak servisleri ve oturum ilişkilerini etkileyebileceğini netleştirmek için kurgulanmıştır.",
    shortAnalysisRisk:
      "Temel riskler; hesap kötüye kullanımı, yetkisiz servis erişimi, ayrıcalık genişlemesi, yeni kimlik doğrulama denemeleri ve etki alanı içinde yayılımdır.",
    shortImmediateActions: [
      "Hesabı hızla kontrol altına alın; parola sıfırlama, aktif oturum sonlandırma ve gerekiyorsa geçici devre dışı bırakma uygulayın.",
      "Hesabın erişebildiği sunucu, servis ve yönetim yüzeylerinde yetki gözden geçirmesi yapın.",
      "Yakın dönem kimlik doğrulama loglarında yeni host erişimleri, servis oturumları ve şüpheli ayrıcalık kullanımını inceleyin.",
    ],
    scenarioText:
      "Domain hesabı compromise olduysa hangi kimlikler, host'lar, servisler ve kimlik doğrulama artifact'leri etkilenebilir? Takip eden saldırıları, olası yayılımı ve öncelikli savunma adımlarını analiz et.",
  },
];

export const predefinedScenarios = basePredefinedScenarios.map((scenario) => ({
  ...scenario,
  ...buildPredefinedNarrativeContent(scenario),
}));

export function getPredefinedScenarioById(scenarioId) {
  return predefinedScenarios.find((scenario) => scenario.id === scenarioId) || null;
}
