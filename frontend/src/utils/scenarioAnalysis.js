import { buildScenarioNarrative } from "./scenarioNarrativeEngine.js";

function cleanText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  return value
    .replace(/Ã„Â±/g, "ı")
    .replace(/Ã„Â°/g, "İ")
    .replace(/ÃƒÂ¼/g, "ü")
    .replace(/ÃƒÅ“/g, "Ü")
    .replace(/ÃƒÂ¶/g, "ö")
    .replace(/Ãƒâ€“/g, "Ö")
    .replace(/Ã…Å¸/g, "ş")
    .replace(/Ã…Å¾/g, "Ş")
    .replace(/ÃƒÂ§/g, "ç")
    .replace(/Ãƒâ€¡/g, "Ç")
    .replace(/Ã„Å¸/g, "ğ")
    .replace(/Ã„Å¾/g, "Ğ")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Â¢/g, "•")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function normalizeText(value, fallback = "-") {
  return cleanText(value, fallback);
}

const CANONICAL_NAME_REPLACEMENTS = [
  [/Uzak servis istismar[ıi]/gi, "Exploitation of Remote Services"],
  [/komut ve kontrol davran[ıi][şs][ıi]/gi, "Command and Control"],
  [/komut ve kontrol/gi, "Command and Control"],
  [/kimlik bilgisi edinimi/gi, "Credential Access"],
  [/savunma atlatma davran[ıi][şs][ıi]/gi, "Defense Evasion"],
  [/savunma atlatma/gi, "Defense Evasion"],
  [/tetiklenen çal[ıi][şs]t[ıi]rma zinciri/gi, "Execution"],
  [/ke[şs]if faaliyeti/gi, "Discovery"],
  [/yanal yay[ıi]l[ıi]m/gi, "Lateral Movement"],
  [/ayr[ıi]cal[ıi]k y[üu]kseltme/gi, "Privilege Escalation"],
];

function preserveCanonicalNames(value) {
  return CANONICAL_NAME_REPLACEMENTS.reduce(
    (text, [pattern, canonicalName]) => text.replace(pattern, canonicalName),
    cleanText(value)
  );
}

const CANONICAL_NAME_PATTERNS_CONTEXTUAL = {
  "Disable or Modify Tools": [
    /g[üu]venlik ajanlar[ıi]n[ıi]n devre d[ıi][şs][ıi] b[ıi]rak[ıi]lmas[ıi]/gi,
    /telemetrinin kesilmesi/gi,
  ],
  "Pass-the-Hash": [
    /yeniden kullan[ıi]lan kimlik materyali/gi,
    /kimlik materyalinin yeniden kullan[ıi]lmas[ıi]/gi,
  ],
  "Exploitation of Remote Services": [/uzak servis istismar[ıi]/gi],
  "Credential Stuffing": [/tekrarl[ıi] parola tahmini bask[ıi]s[ıi]/gi],
  "Session Hijacking": [/oturum ele ge[çc]irme/gi],
  "Credential Theft": [/kimlik bilgisi if[şs]as[ıi]/gi],
  "Command and Control": [/komut ve kontrol davran[ıi][şs][ıi]/gi, /komut ve kontrol/gi],
  "Credential Access": [/kimlik bilgisi edinimi/gi],
  "Defense Evasion": [/savunma atlatma davran[ıi][şs][ıi]/gi, /savunma atlatma/gi],
  Execution: [/tetiklenen [çc]al[ıi][şs]t[ıi]rma zinciri/gi],
  Discovery: [/ke[şs]if faaliyeti/gi],
  Collection: [/veri toplama ad[ıi]mlar[ıi]/gi],
  Exfiltration: [/veri s[ıi]zd[ıi]rma/gi],
  "Lateral Movement": [/yanal yay[ıi]l[ıi]m/gi],
  "Privilege Escalation": [/ayr[ıi]cal[ıi]k y[üu]kseltme/gi],
  "Connection Attempt Analysis": [
    /uzak servis ba[ğg]lant[ıi] giri[şs]imlerinin ola[ğg]and[ıi][şs][ıi] eri[şs]im desenleri a[çc][ıi]s[ıi]ndan izlenmesi/gi,
  ],
  "Operational Process Monitoring": [
    /i[şs]lem zinciri davran[ıi][şs]lar[ıi]n[ıi]n ve ola[ğg]and[ıi][şs][ıi] s[üu]re[çc] ak[ıi][şs]lar[ıi]n[ıi]n izlenmesi/gi,
  ],
  DCSync: [/domain replikasyon zinciri/gi],
  "Windows Management Instrumentation": [/windows y[öo]netim altyap[ıi]s[ıi]/gi],
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectCanonicalNames(mappedResult, scenarioContext = {}) {
  const canonicalNames = new Set();
  const candidateValues = [
    mappedResult?.matchedAttack,
    mappedResult?.fallbackAttackFamily,
    scenarioContext?.title,
    scenarioContext?.questionText,
    ...titlesOf(mappedResult?.directAttacks),
    ...titlesOf(mappedResult?.mayImpactAttacks),
    ...titlesOf(mappedResult?.directTactics),
    ...titlesOf(mappedResult?.nextTactics),
    ...titlesOf(mappedResult?.defenses),
    ...titlesOf(mappedResult?.extractedAttacks),
    ...titlesOf(mappedResult?.predictions),
  ];

  candidateValues
    .map((value) => cleanText(value))
    .filter(Boolean)
    .forEach((value) => {
      if (CANONICAL_NAME_PATTERNS_CONTEXTUAL[value]) {
        canonicalNames.add(value);
      }
    });

  return canonicalNames;
}

function preserveCanonicalNamesWithContext(value, canonicalNames = new Set()) {
  let text = preserveCanonicalNames(value);

  canonicalNames.forEach((canonicalName) => {
    const patterns = CANONICAL_NAME_PATTERNS_CONTEXTUAL[canonicalName] || [];
    patterns.forEach((pattern) => {
      text = text.replace(pattern, canonicalName);
    });
  });

  canonicalNames.forEach((canonicalName) => {
    const exactPattern = new RegExp(escapeRegExp(canonicalName), "gi");
    text = text.replace(exactPattern, canonicalName);
  });

  return text;
}

function joinNatural(values, maxItems = 3) {
  const items = values.filter(Boolean).slice(0, maxItems);

  if (!items.length) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} ve ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

function toSentence(value) {
  const normalized = cleanText(value);
  if (!normalized) {
    return "";
  }

  const sentence = `${normalized.charAt(0).toLocaleUpperCase("tr-TR")}${normalized.slice(1)}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function formatConfidence(score, label) {
  if (score === undefined || score === null || Number.isNaN(Number(score))) {
    return "-";
  }

  const formattedScore = Number(score).toFixed(2);
  const normalizedLabel = cleanText(label).toLocaleLowerCase("tr-TR");
  const labelMap = {
    high: "yüksek",
    medium: "orta",
    low: "düşük",
  };
  const translatedLabel = labelMap[normalizedLabel] || normalizedLabel;

  return translatedLabel ? `${formattedScore} / ${translatedLabel}` : formattedScore;
}

function formatMappingMethod(value) {
  const labels = {
    explicit_mapping: "Kurallı eşleşme",
    graph_best_match: "Bağlamsal eşleşme",
    lexical_similarity: "Metin benzerliği",
    semantic_similarity: "Anlamsal benzerlik",
    hybrid_context_match: "Birleşik bağlam eşleşmesi",
    fallback_match: "Yedek eşleşme",
  };

  return labels[value] || normalizeText(value);
}

function mapSimpleItems(values) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  return values
    .map((item) => cleanText(String(item || "")))
    .filter(Boolean)
    .map((item) => ({ title: item }));
}

function limitItems(values, maxItems = 5) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.slice(0, maxItems);
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
    description: item.rationale ? cleanText(String(item.rationale)) : null,
  }));
}

function mapDefenses(values) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  return values.map((item) => ({
    title: normalizeText(item.title, "Defense suggestion"),
    description: "",
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

function titlesOf(values) {
  return (values || [])
    .map((item) => cleanText(typeof item === "string" ? item : item?.title || ""))
    .filter(Boolean);
}

function resolvePrimaryAnalysisAttackName(mappedResult, narrative) {
  const interpretationLead = cleanText(narrative?.narrativePlan?.interpretation_lead || "");
  const canonicalLead = interpretationLead.split(",")[0]?.trim();

  return canonicalLead || mappedResult.matchedAttack || mappedResult.fallbackAttackFamily || "ilgili saldırı ailesi";
}

function buildStructuredSections(mappedResult, narrative) {
  const topDirectTactics = (
    narrative?.narrativePlan?.topDirectTactics || titlesOf(mappedResult.directTactics)
  ).slice(0, 3);
  const topNextTactics = (
    narrative?.narrativePlan?.topNextTactics || titlesOf(mappedResult.nextTactics)
  ).slice(0, 3);
  const impactArtifacts = titlesOf(mappedResult.mayImpactArtifacts).slice(0, 3);
  const topDefenses = titlesOf(mappedResult.defenses).slice(0, 2);
  const topPredictions = titlesOf(mappedResult.predictions).slice(0, 3);
  const resolvedPrimaryAttackName = resolvePrimaryAnalysisAttackName(mappedResult, narrative);
  const usesPrimaryAttackIdentity = resolvedPrimaryAttackName !== "ilgili saldırı ailesi";

  const attackFamily =
    mappedResult.matchedAttack || mappedResult.fallbackAttackFamily || "ilgili saldırı ailesi";
  const confidenceLabel = mappedResult.confidence.includes("yüksek")
    ? "yüksek"
    : mappedResult.confidence.includes("orta")
      ? "orta"
      : mappedResult.confidence.includes("düşük")
        ? "düşük"
        : "";

  const sections = [
    {
      title: "Analiz yorumu",
      description: toSentence(
        `${mappedResult.matchedAttackExact || usesPrimaryAttackIdentity ? "Bu senaryo en güçlü biçimde" : "Bu senaryo en yakın saldırı ailesi olan"} ${
          resolvedPrimaryAttackName
        } ${mappedResult.matchedAttackExact || usesPrimaryAttackIdentity ? "ile eşleşmektedir" : "üzerinden yorumlanmıştır"}. ${
          confidenceLabel ? `Güven düzeyi ${confidenceLabel} olarak değerlendirilmiştir` : ""
        }. ${
          topDefenses.length
            ? `Savunma tarafında ilk öncelik, ${joinNatural(topDefenses, 2)} kapsamında öne çıkan erişim ve davranış sinyallerinin değerlendirilmesidir`
            : ""
        }`
      ),
    },
    {
      title: "Olası akış",
      description: toSentence(
        `${
          topDirectTactics.length
            ? `Doğrudan taktik sinyalleri en çok ${joinNatural(topDirectTactics, 3)} etrafında yoğunlaşmaktadır`
            : "Doğrudan taktik sinyalleri sınırlı görünmektedir"
        }. ${
          topNextTactics.length
            ? `Sonraki aşamada saldırının ${joinNatural(topNextTactics, 3)} yönünde genişleme riski değerlendirilmektedir`
            : "Sonraki aşama için ek taktik genişlemesi analist doğrulamasıyla izlenmelidir"
        }`
      ),
    },
    {
      title: "Etki yayılımı",
      description: toSentence(
        impactArtifacts.length
          ? `Etki yayılımı açısından ${joinNatural(impactArtifacts, 3)} gibi ilişkili artifact'lerin de etkilenmesi mümkündür`
          : "Etki yayılımı açısından ilişkili artifact etkisi için mevcut graph sinyallerinin izlenmesi önerilir"
      ),
    },
    {
      title: "Savunma odağı",
      description: toSentence(
        topDefenses.length
          ? `Savunma odağında ${joinNatural(topDefenses, 2)} öncelikli olarak ele alınmalıdır`
          : "Savunma odağında ilgili host, hesap ve süreç bağlamının doğrulanması öncelikli tutulmalıdır"
      ),
    },
    {
      title: "Tahmin özeti",
      description: toSentence(
        topPredictions.length
          ? `ML sıralaması, ${joinNatural(topPredictions, 3)} saldırılarını öne çıkan adaylar arasında göstermektedir`
          : "ML sıralamasında öne çıkan ek saldırı adayı bulunmamaktadır"
      ),
    },
  ];

  return sections.filter((section) => section.description);
}

export function mapScenarioAnalysisResult(result, scenarioContext = {}) {
  if (!result) {
    return null;
  }

  const mappedResult = {
    matchedArtifact: normalizeText(result.matched_artifact, "Eşleşme bulunamadı"),
    matchedAttack: normalizeText(result.matched_attack, ""),
    matchedAttackExact: Boolean(result.matched_attack_exact),
    fallbackAttackFamily: normalizeText(result.fallback_attack_family, ""),
    fallbackAttackExplanation: normalizeText(result.fallback_attack_explanation, ""),
    matchedCategory: normalizeText(result.matched_category, "Kategori bulunamadı"),
    mappingMethod: formatMappingMethod(result.mapping_method),
    analysisRoute: formatAnalysisRouteLabel(normalizeText(result.analysis_route, "artifact_first")),
    confidence: formatConfidence(result.confidence_score, result.confidence_label),
    directAttacks: limitItems(mapSimpleItems(result.direct_attacks)),
    mayImpactArtifacts: limitItems(mapSimpleItems(result.may_impact_artifacts)),
    mayImpactAttacks: limitItems(mapSimpleItems(result.may_impact_attacks)),
    directTactics: limitItems(mapSimpleItems(result.direct_tactics)),
    nextTactics: limitItems(mapSimpleItems(result.next_tactics)),
    predictions: mapPredictions(result.predicted_attacks_top5),
    defenses: limitItems(mapDefenses(result.defense_suggestions)),
    lowConfidenceReason: normalizeText(result.low_confidence_reason, ""),
    extractedArtifacts: limitItems(mapSimpleItems(result.extracted_artifacts)),
    extractedAttacks: mapSimpleItems(result.extracted_attacks),
    keywords: limitItems(mapSimpleItems(result.keywords)),
    intent: formatIntentLabel(normalizeText(result.intent, "general")),
    explanationTitle: "Analiz yorumu",
    explanationText:
      result.explanation_text && result.explanation_text.trim()
        ? cleanText(result.explanation_text)
        : null,
  };

  const canonicalNames = collectCanonicalNames(mappedResult, scenarioContext);
  mappedResult.explanationText = mappedResult.explanationText
    ? preserveCanonicalNamesWithContext(mappedResult.explanationText, canonicalNames)
    : null;

  const narrative = buildScenarioNarrative({
    scenarioId: scenarioContext.id || "",
    scenarioTitle: scenarioContext.title || "",
    questionText: scenarioContext.questionText || "",
    scenarioText: result.scenario_text || "",
    matchedArtifact: mappedResult.matchedArtifact,
    matchedAttack: mappedResult.matchedAttack,
    directAttacks: mappedResult.directAttacks,
    mayImpactArtifacts: mappedResult.mayImpactArtifacts,
    mayImpactAttacks: mappedResult.mayImpactAttacks,
    directTactics: mappedResult.directTactics,
    nextTactics: mappedResult.nextTactics,
    defenses: mappedResult.defenses,
    extractedArtifacts: mappedResult.extractedArtifacts,
    extractedAttacks: mappedResult.extractedAttacks,
    keywords: mappedResult.keywords,
    predictions: mappedResult.predictions,
    explanationText: mappedResult.explanationText,
    explanationSections: [],
    confidence: mappedResult.confidence,
    mappingMethod: mappedResult.mappingMethod,
    lowConfidenceReason: mappedResult.lowConfidenceReason,
  });

  const structuredSections = buildStructuredSections(mappedResult, narrative).map((section) => ({
    ...section,
    description: preserveCanonicalNamesWithContext(section.description, canonicalNames),
  }));

  return {
    ...mappedResult,
    incidentType: narrative.incidentType,
    riskDomain: narrative.riskDomain,
    confidenceMode: narrative.confidenceMode,
    scenarioProfile: narrative.scenarioProfile,
    scenarioProfileResolution: narrative.profileResolution,
    narrativePlan: narrative.narrativePlan,
    shortComment: preserveCanonicalNamesWithContext(narrative.interpretation, canonicalNames),
    summaryIntro: preserveCanonicalNamesWithContext(narrative.interpretation, canonicalNames),
    summaryComment: [narrative.immediateRisk, narrative.likelyNextStep]
      .map((item) => preserveCanonicalNamesWithContext(item, canonicalNames))
      .filter(Boolean)
      .join(" "),
    summaryImmediateActions: (narrative.actions || [])
      .map((item) => preserveCanonicalNamesWithContext(item, canonicalNames))
      .filter(Boolean),
    detailIntroSummary: preserveCanonicalNamesWithContext(
      narrative.detailSummary || narrative.interpretation,
      canonicalNames
    ),
    detailSummaryParagraph: preserveCanonicalNamesWithContext(
      narrative.summaryParagraph || narrative.detailSummary || narrative.interpretation,
      canonicalNames
    ),
    explanationSections: structuredSections,
    summaryNarrative: narrative,
    fallbackSummaryComment: preserveCanonicalNamesWithContext(narrative.immediateRisk, canonicalNames),
    fallbackSummaryIntro: preserveCanonicalNamesWithContext(narrative.interpretation, canonicalNames),
    fallbackImmediateActions: (narrative.actions || [])
      .map((item) => preserveCanonicalNamesWithContext(item, canonicalNames))
      .filter(Boolean),
  };
}
