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
    explicit_mapping: "Açık kural eşleşmesi",
    graph_best_match: "Graph eşleşmesi",
    lexical_similarity: "Metin benzerliği",
    semantic_similarity: "Anlamsal benzerlik",
    hybrid_context_match: "Hibrit bağlam eşleşmesi",
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

  return values.map((item) => ({
    title: normalizeText(item.title, "Savunma önerisi"),
    meta: item.source ? `Kaynak: ${item.source}` : null,
    description: normalizeText(item.description, ""),
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

function buildShortComment(result) {
  if (result.explanationText) {
    return result.explanationText;
  }

  if (result.explanationSections.length) {
    return result.explanationSections[0].description;
  }

  if (result.matchedAttack && result.matchedArtifact) {
    return `${result.matchedArtifact} için ${result.matchedAttack} ilişkili bir risk sinyali olarak yorumlandı.`;
  }

  if (result.matchedArtifact) {
    return `${result.matchedArtifact} için yapılandırılmış analiz üretildi.`;
  }

  return "Senaryo için yapılandırılmış analiz üretildi.";
}

export function mapScenarioAnalysisResult(result) {
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
    directAttacks: mapSimpleItems(result.direct_attacks),
    mayImpactArtifacts: mapSimpleItems(result.may_impact_artifacts),
    mayImpactAttacks: mapSimpleItems(result.may_impact_attacks),
    directTactics: mapSimpleItems(result.direct_tactics),
    nextTactics: mapSimpleItems(result.next_tactics),
    predictions: mapPredictions(result.predicted_attacks_top5),
    defenses: mapDefenses(result.defense_suggestions),
    lowConfidenceReason: normalizeText(result.low_confidence_reason, ""),
    extractedArtifacts: mapSimpleItems(result.extracted_artifacts),
    extractedAttacks: mapSimpleItems(result.extracted_attacks),
    keywords: mapSimpleItems(result.keywords),
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

  return {
    ...mappedResult,
    shortComment: buildShortComment(mappedResult),
  };
}
