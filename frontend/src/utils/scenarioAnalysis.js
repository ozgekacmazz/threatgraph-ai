import { buildScenarioNarrative } from "./scenarioNarrativeEngine.js";

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
    .map((item) => String(item || "").trim())
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
    description: item.rationale ? String(item.rationale).trim() : null,
  }));
}

function mapDefenses(values) {
  if (!Array.isArray(values) || !values.length) {
    return [];
  }

  const titleLabels = {
    "Validate graph-linked controls": "İlgili güvenlik kontrollerini doğrulayın",
    "Prepare next-stage monitoring": "Sonraki aşama izlemeyi güçlendirin",
    "Treat output as analyst-assisted context": "Çıktıyı analist destekli değerlendirme olarak ele alın",
    "Complete defense mapping coverage": "Savunma kapsamını gözden geçirin",
    "Token Binding": "Oturum token doğrulama kontrolleri",
    "Authentication Cache Invalidation": "Kimlik doğrulama önbelleğinin temizlenmesi",
    "Domain Account Monitoring": "Domain hesap aktivitelerinin olağandışı erişim açısından yakından izlenmesi",
    "Operational Process Monitoring": "İşlem zinciri davranışlarının ve olağandışı süreç akışlarının izlenmesi",
    "Credential Compromise Scope Analysis": "Ele geçirilmiş kimlik bilgilerinin etki kapsamının hızla belirlenmesi",
    "DNS Traffic Analysis": "DNS sorgu akışlarının derin analizi ve şüpheli çözümleme zincirlerinin izlenmesi",
    "System Daemon Monitoring": "Arka planda çalışan kalıcılık süreçleri ve yetkisiz servis başlatmalarının izlenmesi",
    "Token-based Authentication": "Token tabanlı kimlik doğrulama kontrollerinin sıkılaştırılması",
  };

  const humanizeDefenseTitle = (value) => {
    const normalized = normalizeText(value, "Savunma önerisi");
    if (titleLabels[normalized]) {
      return titleLabels[normalized];
    }

    const lowered = normalized.toLocaleLowerCase("tr-TR");

    if (lowered.includes("token binding")) {
      return "Oturum token doğrulama kontrolleri";
    }

    if (lowered.includes("cache invalidation")) {
      return "Kimlik doğrulama önbelleğinin temizlenmesi";
    }

    if (lowered.includes("domain account monitoring")) {
      return "Domain hesap aktivitelerinin olağandışı erişim açısından yakından izlenmesi";
    }

    if (lowered.includes("process monitoring")) {
      return "İşlem zinciri davranışlarının ve olağandışı süreç akışlarının izlenmesi";
    }

    if (lowered.includes("credential compromise")) {
      return "Ele geçirilmiş kimlik bilgilerinin etki kapsamının hızla belirlenmesi";
    }

    if (lowered.includes("dns traffic analysis")) {
      return "DNS sorgu akışlarının derin analizi ve şüpheli çözümleme zincirlerinin izlenmesi";
    }

    if (lowered.includes("system daemon monitoring")) {
      return "Arka planda çalışan kalıcılık süreçleri ve yetkisiz servis başlatmalarının izlenmesi";
    }

    if (lowered.includes("token-based authentication")) {
      return "Token tabanlı kimlik doğrulama kontrollerinin sıkılaştırılması";
    }

    return normalized;
  };

  const normalizeDefenseDescription = (item) => {
    const title = normalizeText(item.title, "Savunma önerisi");
    const description = normalizeText(item.description, "");

    if (description.startsWith("Graph-derived defense candidate linked to artifact")) {
      return "Bu savunma önerisi, senaryoda öne çıkan erişim ve etki alanı için öncelikli değerlendirme adımı olarak ele alınmalıdır.";
    }

    if (description.includes("Review your real control catalog")) {
      return "İlgili hesap, host veya servis için tanımlı güvenlik kontrollerini doğrulayın ve mevcut risk tablosuna göre önceliklendirin.";
    }

    if (description.includes("Extend detection and review coverage")) {
      return "İzleme kapsamını genişleterek olayın ilerleme ihtimali bulunan alanlarda ek görünürlük sağlayın.";
    }

    if (description.includes("use the artifact and graph context as triage support")) {
      return "Bu öneriyi nihai karar yerine analist değerlendirmesini destekleyen ön inceleme girdisi olarak kullanın.";
    }

    if (description.includes("Add or validate artifact-to-defense relationships")) {
      return "Bu senaryoda daha somut öneriler üretebilmek için ilgili savunma kapsamını ve kontrol eşleşmelerini gözden geçirin.";
    }

    if (description) {
      return description;
    }

    if (titleLabels[title]) {
      return "Bu adım, mevcut senaryoda öne çıkan riskleri kontrol altına almak için öncelikli savunma değerlendirmesi sağlar.";
    }

    return "";
  };

  return values.map((item) => ({
    title: humanizeDefenseTitle(item.title),
    description: normalizeDefenseDescription(item),
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
    explanationSections: mappedResult.explanationSections,
    confidence: mappedResult.confidence,
    mappingMethod: mappedResult.mappingMethod,
    lowConfidenceReason: mappedResult.lowConfidenceReason,
  });

  return {
    ...mappedResult,
    incidentType: narrative.incidentType,
    riskDomain: narrative.riskDomain,
    confidenceMode: narrative.confidenceMode,
    scenarioProfile: narrative.scenarioProfile,
    scenarioProfileResolution: narrative.profileResolution,
    narrativePlan: narrative.narrativePlan,
    shortComment: narrative.interpretation,
    summaryIntro: narrative.interpretation,
    summaryComment: [narrative.immediateRisk, narrative.likelyNextStep].filter(Boolean).join(" "),
    summaryImmediateActions: narrative.actions,
    detailIntroSummary: narrative.detailSummary || narrative.interpretation,
    detailSummaryParagraph: narrative.summaryParagraph || narrative.detailSummary || narrative.interpretation,
    summaryNarrative: narrative,
    fallbackSummaryComment: narrative.immediateRisk,
    fallbackSummaryIntro: narrative.interpretation,
    fallbackImmediateActions: narrative.actions,
  };
}
