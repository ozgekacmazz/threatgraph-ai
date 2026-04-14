import { getScenarioProfile } from "./scenarioProfiles.js";
import { joinNatural, normalizeForMatch, normalizeText, toSentence, unique } from "./scenarioNarrativeShared.js";

const ARTIFACT_CATEGORY_RULES = [
  { id: "dns", phrases: ["dns", "domain name", "lookup", "resolver", "fqdn"] },
  { id: "network", phrases: ["network", "traffic", "connection", "flow", "packet", "outbound", "inbound"] },
  { id: "credential", phrases: ["credential", "password", "hash", "secret"] },
  { id: "authentication", phrases: ["authentication", "auth", "login", "logon", "signin"] },
  { id: "account", phrases: ["user account", "account", "identity", "username", "domain account"] },
  { id: "session", phrases: ["session", "cookie", "ticket", "logon session"] },
  { id: "token", phrases: ["token", "refresh token", "access token", "mfa"] },
  { id: "process", phrases: ["process", "operating system process", "command", "service process"] },
  { id: "host", phrases: ["host", "endpoint", "device", "system", "workstation", "server"] },
  { id: "remote_service", phrases: ["remote service", "smb", "rdp", "winrm", "psexec", "service access"] },
  { id: "service", phrases: ["service", "application", "resource", "shared service"] },
  { id: "security_tool", phrases: ["defender", "edr", "av", "security tool", "sensor", "monitoring"] },
  { id: "control", phrases: ["policy", "control", "logging", "telemetry", "monitoring"] },
  { id: "scheduled_task", phrases: ["scheduled task", "scheduled job", "task scheduler", "cron"] },
];

const ARTIFACT_CATEGORY_PHRASES = {
  dns: "DNS trafiği ve sorgu bağlamı",
  network: "ağ trafiği ve bağlantı izleri",
  credential: "kimlik bilgisi materyali",
  authentication: "kimlik doğrulama izleri",
  account: "hesap bağlamı",
  session: "oturum ilişkileri",
  token: "token ve MFA bağlamı",
  process: "süreç zinciri",
  host: "host etkisi",
  remote_service: "uzak erişim yüzeyi",
  service: "servis erişim izi",
  security_tool: "güvenlik aracı süreçleri",
  control: "izleme ve kontrol yüzeyi",
  scheduled_task: "zamanlanmış görev bağlamı",
};

const TACTIC_FRIENDLY_LABELS = {
  "command and control": "komut ve kontrol davranışı",
  exfiltration: "veri çıkışı riski",
  collection: "veri toplama adımları",
  discovery: "keşif faaliyeti",
  "credential access": "kimlik bilgisi edinimi",
  "defense evasion": "savunma atlatma davranışı",
  persistence: "kalıcılık davranışı",
  execution: "tetiklenen çalıştırma zinciri",
  "lateral movement": "yanal yayılım",
  "privilege escalation": "ayrıcalık yükseltme",
  impact: "hizmet etkisi ve bozucu adımlar",
  "initial access": "ilk erişim baskısı",
};

const DEFENSE_SUMMARY_LABELS = {
  "Validate graph-linked controls": "ilgili güvenlik kontrollerini hızla doğrulamak",
  "Prepare next-stage monitoring": "ilerleme ihtimali olan aşamalar için izlemeyi sıkılaştırmak",
  "Treat output as analyst-assisted context": "çıktıyı analist doğrulamasıyla birlikte ele almak",
  "Complete defense mapping coverage": "eksik savunma kapsamını tamamlamak",
  "İlgili güvenlik kontrollerini doğrulayın": "ilgili güvenlik kontrollerini hızla doğrulamak",
  "Sonraki aşama izlemeyi güçlendirin": "ilerleme ihtimali olan aşamalar için izlemeyi sıkılaştırmak",
  "Çıktıyı analist destekli değerlendirme olarak ele alın": "çıktıyı analist doğrulamasıyla birlikte ele almak",
  "Savunma kapsamını gözden geçirin": "eksik savunma kapsamını tamamlamak",
  "Token Binding": "oturum token doğrulama kontrollerinin sıkılaştırılması",
  "Authentication Cache Invalidation": "kimlik doğrulama önbelleğinin temizlenmesi",
  "Domain Account Monitoring": "domain hesap aktivitelerinin olağandışı erişim açısından yakından izlenmesi",
  "Operational Process Monitoring": "işlem zinciri davranışlarının ve olağandışı süreç akışlarının izlenmesi",
  "Credential Compromise Scope Analysis": "ele geçirilmiş kimlik bilgilerinin etki kapsamının hızla belirlenmesi",
  "Connection Attempt Analysis": "uzak servis bağlantı girişimlerinin olağandışı erişim desenleri açısından izlenmesi",
  "DNS Traffic Analysis": "paket akış korelasyonu, mirrored traffic analizi ve packet anomaly inspection uygulanması",
  "System Daemon Monitoring": "telemetri kesintisi yaşayan ajanların, devre dışı bırakılmış EDR/AV servislerinin ve log akış boşluklarının izlenmesi",
  "Token-based Authentication": "token tabanlı kimlik doğrulama kontrollerinin sıkılaştırılması",
  "Oturum token doğrulama kontrolleri": "oturum token doğrulama kontrollerinin sıkılaştırılması",
  "Kimlik doğrulama önbelleğinin temizlenmesi": "kimlik doğrulama önbelleğinin temizlenmesi",
  "Domain hesap aktivitelerinin yakından izlenmesi": "domain hesap aktivitelerinin olağandışı erişim açısından yakından izlenmesi",
  "Operasyonel süreç ve işlem zinciri izlemesi": "işlem zinciri davranışlarının ve olağandışı süreç akışlarının izlenmesi",
  "Kimlik bilgisi etkisinin kapsam analizi": "ele geçirilmiş kimlik bilgilerinin etki kapsamının hızla belirlenmesi",
};

const CONTINUATION_PATTERNS = [
  (theme) => `Sonraki aşamada saldırgan ${theme}`,
  (theme) => `Bunun devamında ${theme}`,
  (theme) => `Aynı erişim zinciri üzerinden ${theme}`,
  (theme) => `Bu durum ilerleyen aşamada ${theme}`,
  (theme) => `Zincirin bir sonraki adımında ${theme}`,
  (theme) => `Bu erişim modeli devam ederse ${theme}`,
];

const ACTION_BUILDERS = {
  dns_contain_and_trace: ({ focusArtifacts }) => [
    `Anormal DNS sorgularını üreten ${focusArtifacts.hostProcessSourcePhrase} eşleştirerek kaynağı doğrulayın`,
    "Şüpheli alan adları ve sorgu desenleri için engelleme uygulayın; eş zamanlı ağ bağlantıları ve olası veri çıkışını inceleyin",
    "Aynı uç noktadaki tekrar eden DNS davranışlarını komut aktarımı veya veri sızdırma işaretleriyle birlikte değerlendirin",
  ],
  resolution_validation: ({ focusArtifacts }) => [
    "İsim çözümleme yolunda değişiklik oluşturan süreçleri, sorgulanan alan adlarını ve geri çağrı noktalarını doğrulayın",
    `Şüpheli çözümleme hareketlerinin görüldüğü ${focusArtifacts.primarySurface} üzerinde yönlendirme zincirini ve eşlik eden bağlantıları inceleyin`,
    "Dış alan adı yönlendirmelerini doğrulayın; geri çağrı trafiği veya gizli komut kanalı olasılığı için izlemeyi genişletin",
  ],
  network_segment_and_rotate: () => [
    "Etkilenmiş olabilecek ağ segmentini izole edin ve şüpheli yansıtılmış veya kopyalanmış trafiğin hangi noktadan toplandığını doğrulayın",
    "Yakalanmış olabilecek kimlik bilgileri için parola sıfırlama başlatın; risk altındaki oturum belirteçlerini ve aktif oturumları iptal edin",
    "Şüpheli mirrored traffic akışlarını, session interception izlerini ve packet anomaly inspection bulgularını birlikte inceleyin",
  ],
  credential_reset_and_scope: () => [
    "Kırılmış olabilecek parola ve hash’lere bağlı hesaplar için sıfırlama ve yeniden kullanım taraması başlatın",
    "Aynı sırların kullanıldığı servisleri, VPN girişlerini ve ayrıcalıklı hesapları kapsam incelemesine alın",
    "Kırılan kimlik bilgilerinin ardından gelen başarılı girişler veya beklenmeyen oturumlar için olay zincirini doğrulayın",
  ],
  guessing_triage: ({ focusArtifacts }) => [
    "Hedeflenen hesaplar için başarısız ve başarılı kimlik doğrulama denemelerini birlikte inceleyin",
    `Parola tahmini baskısı görülen ${focusArtifacts.primarySurface} üzerinde kaynak kısıtlama, hız limitleme veya geçici engelleme uygulayın`,
    "Başarılı giriş oluştuysa bu hesaplarla açılan yeni oturumları ve servis erişimlerini öncelikli olarak doğrulayın",
  ],
  spraying_scope_and_protect: () => [
    "Düşük frekanslı çoklu giriş denemelerinden etkilenen hesap kümesini çıkarın ve ortak kaynağı belirleyin",
    "Kurumsal giriş yüzeyinde geçici koruma, MFA güçlendirmesi ve koşullu erişim sıkılaştırması uygulayın",
    "Başarılı olmuş girişler varsa bu hesapların yeni cihaz, yeni oturum ve uzak servis kullanımını detaylı inceleyin",
  ],
  restore_controls_and_hunt: ({ focusArtifacts }) => [
    "Güvenlik aracının ne zaman ve hangi süreç veya hesap bağlamında devre dışı bırakıldığını doğrulayın",
    `İzleme kaybına yol açan ${focusArtifacts.primarySurface} değişikliklerini geri alın ve aynı zaman aralığındaki işlem zincirlerini inceleyin`,
    "Devre dışı bırakılmış savunma yüzeyinden faydalanmış olabilecek ek saldırı aktivitelerini avcılığa alın",
  ],
  scheduled_task_cleanup: ({ focusArtifacts }) => [
    "Şüpheli görev veya zamanlanmış iş kayıtlarını ve bunların hangi kullanıcı ya da süreç tarafından oluşturulduğunu doğrulayın",
    `Tekrarlayan çalıştırma zincirini ve ${focusArtifacts.primarySurface} üzerindeki kalıcılık izlerini inceleyin`,
    "Yetkisiz görevleri kaldırın, ilişkili hesapları gözden geçirin ve aynı kalıcılık modelinin başka sistemlerde görülüp görülmediğini kontrol edin",
  ],
  ticket_session_containment: () => [
    "Ticket ile ilişkili oturumları, servis erişimlerini ve ayrıcalıklı kaynak kullanımını birlikte inceleyin",
    "Beklenmeyen Kerberos taleplerini ve ticket yeniden kullanımını hızla sınırlandırın; etkilenen hesap veya servisleri izole edin",
    "Gerekli durumlarda parola rotasyonu, oturum sonlandırma ve hassas servislerde erişim daraltması uygulayın",
  ],
  remote_reuse_containment: () => [
    "SMB, RDP, WinRM veya PsExec benzeri uzak yönetim izlerinde aynı kimlik materyalinin tekrar kullanımını doğrulayın",
    "Kaynak hostu izole edin, paralel logon izlerini çıkarın ve etkilenen kimlikler için rotasyon başlatın",
    "Yanal yayılım riskini azaltmak için uzak yönetim yüzeylerinde geçici kısıtlama uygulayıp ek host sıçramalarını izlemeye alın",
  ],
  account_and_token_response: () => [
    "Etkilenen hesaplarda parola sıfırlama, aktif oturum sonlandırma ve token veya çerez geçersiz kılma adımlarını hemen uygulayın",
    "Kimlik sağlayıcısı, yeni cihaz kayıtları ve beklenmeyen servis erişimleri üzerinden hesap devralma kapsamını doğrulayın",
    "Olası takip erişimleri için aynı kullanıcıya bağlı uzak servisler, yeni oturumlar ve yetki genişlemelerini inceleyin",
  ],
  account_scope_containment: () => [
    "Ele geçirilmiş domain hesabını hızla kontrol altına alın; oturumları sonlandırın ve parolasını döndürün",
    "Bu hesapla erişilen servisleri, hostları ve yönetim yüzeylerini kapsamlı olarak gözden geçirin",
    "Aynı hesapla açılmış çapraz host oturumları, paylaşımlı servis erişimleri ve ayrıcalıklı hareketleri araştırın",
  ],
  dns_tunnel_response: ({ focusArtifacts }) => [
    `Uzun veya kodlanmış DNS sorgularını üreten ${focusArtifacts.hostProcessSourcePhrase} doğrulayın`,
    "Şüpheli DNS hedefleri için engelleme uygulayın; aynı anda görülen outbound trafik ve veri çıkışı belirtilerini inceleyin",
    "DNS tünelleme modelinin başka uç noktalarda da görülüp görülmediğini izleyerek yayılım veya veri toplama riskini araştırın",
  ],
  contain_validate_hunt: ({ focusArtifacts }) => [
    `${focusArtifacts.primarySurface} üzerinde son erişim, oturum ve yapılandırma değişikliklerini doğrulayın`,
    "İlişkili saldırı ve tactic sinyallerini aynı zaman aralığında korele ederek olayın yayılım yönünü netleştirin",
    "Erişim daraltma, oturum sonlandırma ve hedefli izleme adımlarını etki alanına göre önceliklendirin",
  ],
};

function categorizeArtifact(name) {
  const normalized = normalizeForMatch(name);
  const rule = ARTIFACT_CATEGORY_RULES.find((item) =>
    item.phrases.some((phrase) => normalized.includes(normalizeForMatch(phrase)))
  );
  return rule?.id || "host";
}

function categorizeTactic(name) {
  const normalized = normalizeForMatch(name);
  return Object.keys(TACTIC_FRIENDLY_LABELS).find((key) => normalized.includes(normalizeForMatch(key))) || normalized;
}

function pickTopArtifacts(evidence, profile) {
  const artifactItems = unique([evidence.matchedArtifact, ...evidence.mayImpactArtifacts, ...evidence.extractedArtifacts])
    .map((name) => {
      const category = categorizeArtifact(name);
      let score = 1;
      if (name === evidence.matchedArtifact) {
        score += 4;
      }
      const preferenceIndex = profile.preferredArtifactCategories.indexOf(category);
      if (preferenceIndex >= 0) {
        score += 8 - preferenceIndex;
      }
      return { name, category, score };
    })
    .sort((left, right) => right.score - left.score);

  const topItems = artifactItems.slice(0, 3);
  const categories = unique(topItems.map((item) => item.category));

  return {
    items: topItems,
    categories,
    primarySurface: joinNatural(categories.map((category) => ARTIFACT_CATEGORY_PHRASES[category] || category), 2) || "teknik etki yüzeyi",
    hostProcessSourcePhrase:
      categories.includes("host") || categories.includes("process")
        ? "host, süreç ve kullanıcı oturumunu"
        : "kaynak host ve bağlantı bağlamını",
    technicalLabels: topItems.map((item) => item.name),
  };
}

function pickTopTactics(values, preferences) {
  const preferredKeys = preferences.map((value) => normalizeForMatch(value));
  return unique(values)
    .map((name) => {
      const category = categorizeTactic(name);
      const preferenceIndex = preferredKeys.findIndex((value) => category.includes(value));
      return { name, category, score: preferenceIndex >= 0 ? 10 - preferenceIndex : 1 };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
}

function humanizeDefenseSummaryLabel(label) {
  const normalized = normalizeText(label);
  if (DEFENSE_SUMMARY_LABELS[normalized]) {
    return DEFENSE_SUMMARY_LABELS[normalized];
  }

  const lowered = normalized.toLocaleLowerCase("tr-TR");

  if (lowered.includes("connection attempt analysis")) {
    return "uzak servis bağlantı girişimlerinin olağandışı erişim desenleri açısından izlenmesi";
  }

  if (lowered.includes("dns traffic analysis")) {
    return "paket akış korelasyonu, mirrored traffic analizi ve packet anomaly inspection uygulanması";
  }

  if (lowered.includes("system daemon monitoring")) {
    return "telemetri kesintisi yaşayan ajanların, devre dışı bırakılmış EDR/AV servislerinin ve log akış boşluklarının izlenmesi";
  }

  if (lowered.includes("token-based authentication")) {
    return "token tabanlı kimlik doğrulama kontrollerinin sıkılaştırılması";
  }

  if (lowered.includes("token binding")) {
    return "oturum token doğrulama kontrollerinin sıkılaştırılması";
  }

  if (lowered.includes("cache invalidation")) {
    return "kimlik doğrulama önbelleğinin temizlenmesi";
  }

  if (lowered.includes("domain account monitoring")) {
    return "domain hesap aktivitelerinin olağandışı erişim açısından yakından izlenmesi";
  }

  if (lowered.includes("process monitoring")) {
    return "işlem zinciri davranışlarının ve olağandışı süreç akışlarının izlenmesi";
  }

  if (lowered.includes("credential compromise")) {
    return "ele geçirilmiş kimlik bilgilerinin etki kapsamının hızla belirlenmesi";
  }

  return normalized;
}

function buildDefenseTheme(profile, evidence) {
  if (evidence.defenses.length) {
    const concepts = evidence.defenses.map((label) => humanizeDefenseSummaryLabel(label)).slice(0, 2);
    return `${joinNatural(concepts, 2)} savunma tarafında ilk odak olmalıdır`;
  }

  switch (profile.defenseEmphasisStrategy) {
    case "network_control_and_visibility":
      return "paket akış korelasyonu kurmak, mirrored traffic analizi yapmak ve session interception izlerini doğrulamak savunma tarafında ilk önceliktir";
    case "control_recovery":
      return "telemetri kesintisi yaşayan ajanları geri kazanmak, devre dışı bırakılmış EDR/AV servislerini doğrulamak ve log akış boşluklarını kapatmak ilk savunma adımıdır";
    case "persistence_control":
      return "Kalıcılık oluşturan görev ve çalıştırma yüzeylerini temizlemek ilk savunma önceliğidir";
    case "identity_containment":
      return "Hesap, token ve oturum tabanlı kimlik kontrollerini daraltmak ilk savunma odağıdır";
    case "remote_auth_control":
      return "Uzak kimlik doğrulama yüzeylerinde sıkı kontrol ve segmentasyon uygulamak ilk savunma adımıdır";
    case "trusted_auth_control":
      return "Güvenilen kimlik doğrulama akışlarını daraltmak ve servis erişimlerini doğrulamak ilk savunma odağıdır";
    default:
      return "Mevcut güvenlik kontrollerini olayın ilk etkisini sınırlayacak şekilde yeniden sıralamak gerekir";
  }
}

function buildContinuationSentence(theme, seedText) {
  if (!theme) {
    return "";
  }

  const normalizedSeed = normalizeText(seedText || "generic");
  const seedValue = [...normalizedSeed].reduce((total, character) => total + character.charCodeAt(0), 0);
  const pattern = CONTINUATION_PATTERNS[seedValue % CONTINUATION_PATTERNS.length];
  return pattern(theme);
}

function buildPlanThemes(profile, evidence, focusArtifacts, directTactics, nextTactics) {
  const directTacticLabels = directTactics.map((item) => TACTIC_FRIENDLY_LABELS[item.category] || item.name).slice(0, 2);
  const nextTacticLabels = nextTactics.map((item) => TACTIC_FRIENDLY_LABELS[item.category] || item.name).slice(0, 2);
  const spreadAttackLabels = unique(evidence.mayImpactAttacks).slice(0, 2);

  const defaults = {
    dominant_risk_theme: `${profile.displayCategory} bağlamında risk, ${joinNatural(profile.riskPriorities, 2) || "ilgili saldırı etkileri"} etrafında yoğunlaşıyor`,
    spread_theme: spreadAttackLabels.length
      ? `${joinNatural(spreadAttackLabels, 2)} gibi takip eden saldırı adımlarına zemin hazırlayabilir`
      : nextTacticLabels.length
        ? `${joinNatural(nextTacticLabels, 2)} yönünde ilerleyebilecek bir baskı oluşturabilir`
        : "ek host, hesap veya servis yüzeylerine sıçrama baskısı yaratabilir",
    likely_affected_artifact_theme: `İlk risk odağı ${focusArtifacts.primarySurface} üzerindedir`,
    likely_follow_on_theme: nextTacticLabels.length
      ? `${joinNatural(nextTacticLabels, 2)} ile ilişkili davranışlar derinleşebilir`
      : directTacticLabels.length
        ? `${joinNatural(directTacticLabels, 2)} ile ilişkili sinyaller belirginleşebilir`
        : "ek davranışın yayılıp yayılmadığı mevcut graph sinyalleriyle doğrulanmalıdır",
    defense_priority_theme: buildDefenseTheme(profile, evidence),
    concrete_action_focus: focusArtifacts.primarySurface,
  };

  switch (profile.summaryStrategy) {
    case "credential_exposure":
      return {
        ...defaults,
        dominant_risk_theme:
          "Ağ dinleme veya paket yakalama faaliyeti, iletim halindeki veriyi görünür kılarak açık iletişim sızıntısı, oturum ele geçirme ve kimlik bilgisi ifşası riskini yükseltir",
        spread_theme:
          "Yakalanan trafik içinde kimlik bilgileri veya oturum materyali varsa aynı erişim zinciri farklı sistemlere taşınabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan yakalanmış paketler, müdahale edilmiş trafik akışları, oturum belirteçleri ve açık taşınan kimlik bilgileridir",
      };
    case "session_token_replay":
      return {
        ...defaults,
        dominant_risk_theme:
          "Ele geçirilmiş oturum belirteçleri ve tarayıcı oturumları, parola bilinmeden mevcut erişimin yeniden kullanılmasına izin verebilir",
        spread_theme:
          "Token tekrar kullanımı sürerse aynı kullanıcı bağlamında yeni oturum açılışları ve servis erişimleri görülebilir",
        likely_affected_artifact_theme:
          "İlk risk odağı tarayıcı oturumları, çalınmış çerezler, token tekrar kullanımı ve ilişkili hesap hareketleridir",
      };
    case "stolen_identity_chain":
      return {
        ...defaults,
        dominant_risk_theme:
          "Çalınmış kimlik bilgileri, birden fazla sistemde yeniden kullanılabilecek güvenilir bir erişim zemini oluşturarak ayrıcalık yükseltme zincirini besleyebilir",
        spread_theme:
          "Aynı kimlik bilgileri başka servislerde de geçerliyse yayılım hızlı biçimde genişleyebilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan ele geçirilmiş hesaplar, kimlik bilgisi depoları, oturum izleri ve yeniden kullanılan kimlik ilişkileridir",
      };
    case "remote_service_compromise":
      return {
        ...defaults,
        dominant_risk_theme:
          "Uzak servis istismarı, zafiyetli uç noktalar üzerinden ilk erişim sağlayıp servis bağlamında daha derin bir ele geçirilme zinciri oluşturabilir",
        spread_theme:
          "İstismar edilen servisler aynı kimlik veya bağlantı modeli üzerinden başka sistemlere yanal geçiş açabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan internale açık uzak servisler, zafiyetli uç noktalar ve bu servislerle ilişkili host erişimleridir",
      };
    case "internet_facing_remote_access":
      return {
        ...defaults,
        dominant_risk_theme:
          "Dışa açık uzak erişim yüzeyleri, internete açık VPN, RDP veya benzeri servisler üzerinden yetkisiz erişim için doğrudan giriş noktası sağlayabilir",
        spread_theme:
          "İnternete açık girişler başarılı olursa aynı erişim modeli iç sistemlere doğru genişleyebilir",
        likely_affected_artifact_theme:
          "İlk risk odağı dışa açık uzak servisler, internet üzerinden erişilen uç noktalar ve bu girişlerle açılan oturumlardır",
      };
    case "deceptive_process_branching":
      return {
        ...defaults,
        dominant_risk_theme:
          "Kaynak çatallama davranışı, süreç zincirini aldatıcı dallara bölerek gizli yürütme kolları ve iz bırakmayan çoğaltılmış çalıştırmalar üretebilir",
        spread_theme:
          "Çatallanmış yürütme kolları devam ederse aynı host üzerinde gizli dallar çoğalabilir ve olayın izlenmesi zorlaşabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan çoğaltılmış süreç zincirleri, beklenmeyen çocuk süreçler ve gizlenmiş yürütme dallarıdır",
      };
    case "dns_signal_chain":
      return {
        ...defaults,
        dominant_risk_theme:
          "DNS sorgu davranışı arka planda gizli haberleşme, komut aktarımı veya veri çıkışı için kullanılabilecek bir kanal oluşturabilir",
        spread_theme:
          "aynı kaynaktan üretilen bağlantılar üzerinden komut ve kontrol ya da veri sızdırma yönüne ilerleyebilir",
        likely_affected_artifact_theme:
          "İlk risk odağı DNS trafiği, sorgu kaynağı ve ilişkili süreç zinciri üzerindedir",
      };
    case "resolution_indirection":
      return {
        ...defaults,
        dominant_risk_theme:
          "isim çözümleme yolunun kötüye kullanılması dış altyapıya yönlendirme, geri çağrı trafiği ve gizlenmiş erişim zincirleri oluşturabilir",
        spread_theme:
          "şüpheli alan adı çözümleme zinciri farklı süreçler veya hostlar üzerinden yeni bağlantı noktaları açabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan çözümleme trafiği, sorgulanan alan adları ve bu trafiği üreten süreçlerdir",
      };
    case "authentication_pressure":
      return {
        ...defaults,
        dominant_risk_theme:
          "tekrarlı parola tahmini baskısı hedeflenen hesaplarda zayıf kimlik doğrulama noktalarını istismar etmeye çalışır",
        spread_theme:
          "başarılı giriş oluşursa aynı kimliklerle yeni oturumlar ve servis erişimleri üzerinden yayılım görülebilir",
        likely_affected_artifact_theme:
          "İlk risk odağı hedeflenen hesaplar, kimlik doğrulama kayıtları ve başarılı giriş sonrası açılan oturumlardır",
      };
    case "broad_auth_surface":
      return {
        ...defaults,
        dominant_risk_theme:
          "parola spraying girişimi geniş bir hesap kümesini düşük frekansta baskılayarak kurumsal giriş yüzeyinde sessiz bir risk üretir",
        spread_theme:
          "başarılı olmuş girişler yeni servis erişimlerine ve daha geniş hesap kötüye kullanımına dönüşebilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan çoklu hesap giriş kayıtları, kimlik doğrulama yüzeyi ve yeni oturum açılışlarıdır",
      };
    case "defense_visibility_loss":
      return {
        ...defaults,
        dominant_risk_theme:
          "Güvenlik ajanlarının devre dışı bırakılması veya telemetrinin kesilmesi, saldırganın daha az görünür hareket etmesine ve izleme kör noktaları oluşturmasına yol açar",
        spread_theme:
          "EDR veya AV kapanış izleriyle başlayan bu boşluk, aynı zaman aralığında ek kötüye kullanım adımlarının daha az fark edilerek ilerlemesine neden olabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan kapatılmış güvenlik ajanları, telemetri kesintisi yaşayan hostlar ve ilişkili işlem zinciridir",
      };
    case "persistence_reentry":
      return {
        ...defaults,
        dominant_risk_theme:
          "zamanlanmış görev bağlamı saldırgana tekrar eden çalıştırma ve sistemde kalıcı yeniden giriş imkânı sağlayabilir",
        spread_theme:
          "aynı görev modeli başka hostlara taşınarak kalıcılık ve takip eden yürütme zincirleri oluşturabilir",
        likely_affected_artifact_theme:
          "Bu olayda en kritik etki zamanlanmış görev kayıtları, çalıştırma bağlamı ve ilişkili host kalıcılığı üzerinde görülür",
      };
    case "trusted_auth_reuse":
      return {
        ...defaults,
        dominant_risk_theme:
          "Kerberos ticket kötüye kullanımı güvenilen kimlik bağlamını yeniden kullanarak servis erişimini meşru görünüm altında genişletebilir",
        spread_theme:
          "ticket tabanlı oturumlar ayrıcalıklı servisler ve çapraz sistem erişimleri üzerinden yayılabilir",
        likely_affected_artifact_theme:
          "İlk risk odağı ticket ile açılan oturumlar, servis erişimleri ve ayrıcalıklı kaynak kullanımıdır",
      };
    case "remote_auth_reuse":
      return {
        ...defaults,
        dominant_risk_theme:
          "yeniden kullanılan kimlik materyali uzak yönetim yüzeylerinde parola gerektirmeden yanal yayılım başlatabilir",
        spread_theme:
          "paralel logon ve uzak servis kullanımı üzerinden aynı kimlik başka host zincirlerine taşınabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan uzak yönetim izleri, paralel oturumlar ve kimlik materyalinin yeniden kullanıldığı hostlardır",
      };
    case "account_takeover":
      return {
        ...defaults,
        dominant_risk_theme:
          "ele geçirilen kimlik bilgisi veya MFA bağlamı hesap devralma ve yetkisiz servis erişimi riskini hızla yükseltir",
        spread_theme:
          "aktif oturumlar, tokenlar ve yeni cihaz kayıtları üzerinden kurumsal servislere sıçrama oluşabilir",
        likely_affected_artifact_theme:
          "İlk risk odağı aktif oturumlar, tokenlar, kimlik sağlayıcısı kayıtları ve kritik servis erişimleridir",
      };
    case "shared_service_spread":
      return {
        ...defaults,
        dominant_risk_theme:
          "ele geçirilmiş domain hesabı paylaşımlı servisler ve çapraz host erişimleri üzerinden geniş bir etki yüzeyi yaratır",
        spread_theme:
          "aynı hesapla açılan yeni oturumlar servisler arası yayılım ve ayrıcalık yüzeyi genişlemesi doğurabilir",
        likely_affected_artifact_theme:
          "İlk dikkat edilmesi gereken alan domain hesap oturumları, paylaşımlı servis erişimleri ve çapraz host hareketleridir",
      };
    case "dns_exfiltration":
      return {
        ...defaults,
        dominant_risk_theme:
          "DNS tünelleme sinyali veri sızdırma ve düşük görünürlüklü komut aktarımı olasılığını doğrudan yükseltir",
        spread_theme:
          "aynı DNS deseni başka uç noktalarda da görülüyorsa yaygın haberleşme veya veri toplama zinciri olabilir",
        likely_affected_artifact_theme:
          "İlk risk odağı DNS trafiği, outbound ilişki zinciri ve veri çıkışı şüphesi taşıyan uç noktalardır",
      };
    default:
      return defaults;
  }
}

function buildConfidenceQualifier(input, evidence, resolution) {
  const mappingMethod = normalizeText(input.mappingMethod).toLocaleLowerCase("tr-TR");
  const lowConfidenceReason = normalizeText(input.lowConfidenceReason);

  if (resolution.strategy === "semantic_fallback") {
    return "Profil çözümlemesi semantik bağlamla yapıldığı için sonuçlar analist doğrulamasıyla birlikte okunmalıdır.";
  }

  if (evidence.confidenceMode === "low" && lowConfidenceReason) {
    return `Bu yorum, ${lowConfidenceReason.toLocaleLowerCase("tr-TR")} nedeniyle daha temkinli okunmalıdır.`;
  }

  if (mappingMethod.includes("yaklaşık") || mappingMethod.includes("yedek") || mappingMethod.includes("benzerlik")) {
    return "Bu değerlendirme kesin eşleşmeden çok mevcut sinyallerin birlikte yorumlanmasına dayanıyor.";
  }

  if (evidence.confidenceMode === "low") {
    return "Bu değerlendirme sınırlı sinyaller üzerine kurulduğu için temkinli yorumlanmalıdır.";
  }

  return "";
}

function planScenarioNarrative(input, evidence, resolution) {
  const profile = getScenarioProfile(resolution.profileId);
  const focusArtifacts = pickTopArtifacts(evidence, profile);
  const directTactics = pickTopTactics(evidence.directTactics, profile.preferredTacticEmphasis);
  const nextTactics = pickTopTactics(evidence.nextTactics, profile.preferredNextTacticEmphasis);
  const themes = buildPlanThemes(profile, evidence, focusArtifacts, directTactics, nextTactics);
  const confidenceQualifier = buildConfidenceQualifier(input, evidence, resolution);
  const actionBuilder = ACTION_BUILDERS[profile.immediateActionStrategy] || ACTION_BUILDERS.contain_validate_hunt;
  const actions = actionBuilder({ evidence, profile, focusArtifacts, directTactics, nextTactics })
    .map((action) => toSentence(action))
    .slice(0, 3);

  const continuationSentence = buildContinuationSentence(themes.likely_follow_on_theme, `${resolution.profileId}:${themes.spread_theme}`);
  const interpretation = toSentence(`${themes.dominant_risk_theme}. ${themes.likely_affected_artifact_theme}`);
  const immediateRisk = toSentence(`${themes.spread_theme}. ${continuationSentence}`);
  const likelyNextStep = toSentence(
    `${themes.defense_priority_theme}. ${
      confidenceQualifier || `İlk müdahale ${themes.concrete_action_focus} üzerinde doğrulama ve sınırlama adımlarını birlikte yürütmelidir`
    }`
  );

  return {
    profileId: resolution.profileId,
    profileCategory: profile.displayCategory,
    resolution,
    plan: {
      dominant_risk_theme: themes.dominant_risk_theme,
      spread_theme: themes.spread_theme,
      likely_affected_artifact_theme: themes.likely_affected_artifact_theme,
      likely_follow_on_theme: continuationSentence,
      defense_priority_theme: themes.defense_priority_theme,
      concrete_action_focus: themes.concrete_action_focus,
      topTechnicalArtifacts: focusArtifacts.technicalLabels,
      topDirectTactics: directTactics.map((item) => item.name),
      topNextTactics: nextTactics.map((item) => item.name),
    },
    interpretation,
    immediateRisk,
    likelyNextStep,
    actions,
    detailSummary: [interpretation, immediateRisk, likelyNextStep].filter(Boolean).join(" "),
    confidenceQualifier,
  };
}

export { planScenarioNarrative };
