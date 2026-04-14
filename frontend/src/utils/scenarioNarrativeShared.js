function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))];
}

function normalizeForMatch(value) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectTitles(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return unique(
    values.map((item) =>
      typeof item === "string"
        ? item
        : item?.title || item?.description || item?.label || item?.text || ""
    )
  );
}

function collectPredictionTitles(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return unique(values.map((item) => item?.title || item?.attack_name || ""));
}

function collectDefenseDescriptions(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return unique(values.map((item) => item?.description || ""));
}

function joinNatural(values, maxItems = 3) {
  const items = unique(values).slice(0, maxItems);

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
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  const sentence = `${normalized.charAt(0).toLocaleUpperCase("tr-TR")}${normalized.slice(1)}`;
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function parseConfidenceMode(confidenceText) {
  const normalized = normalizeText(confidenceText).toLocaleLowerCase("tr-TR");
  const match = normalized.match(/\d+(\.\d+)?/);
  const score = match ? Number(match[0]) : null;

  if ((score !== null && score >= 0.8) || normalized.includes("yüksek") || normalized.includes("high")) {
    return "high";
  }

  if ((score !== null && score >= 0.55) || normalized.includes("orta") || normalized.includes("medium")) {
    return "medium";
  }

  return "low";
}

function buildEvidence(input) {
  const matchedArtifact = normalizeText(input.matchedArtifact);
  const matchedAttack = normalizeText(input.matchedAttack);
  const directAttacks = collectTitles(input.directAttacks);
  const mayImpactAttacks = collectTitles(input.mayImpactAttacks);
  const mayImpactArtifacts = collectTitles(input.mayImpactArtifacts);
  const directTactics = collectTitles(input.directTactics);
  const nextTactics = collectTitles(input.nextTactics);
  const extractedArtifacts = collectTitles(input.extractedArtifacts);
  const extractedAttacks = collectTitles(input.extractedAttacks);
  const predictions = collectPredictionTitles(input.predictions);
  const defenses = collectTitles(input.defenses);
  const defenseDescriptions = collectDefenseDescriptions(input.defenses);
  const explanationText = normalizeText(input.explanationText);
  const explanationSections = Array.isArray(input.explanationSections)
    ? input.explanationSections
        .map((section) => `${normalizeText(section?.title)} ${normalizeText(section?.description)}`)
        .filter(Boolean)
    : [];
  const confidenceMode = parseConfidenceMode(input.confidence);
  const questionText = normalizeText(input.questionText);
  const scenarioText = normalizeText(input.scenarioText);
  const scenarioTitle = normalizeText(input.scenarioTitle);
  const explanationCorpus = [explanationText, ...explanationSections].join(" ").toLocaleLowerCase("tr-TR");

  return {
    scenarioId: normalizeText(input.scenarioId),
    scenarioTitle,
    questionText,
    scenarioText,
    matchedArtifact,
    matchedAttack,
    directAttacks,
    mayImpactAttacks,
    mayImpactArtifacts,
    directTactics,
    nextTactics,
    extractedArtifacts,
    extractedAttacks,
    predictions,
    defenses,
    defenseDescriptions,
    explanationText,
    explanationSections,
    explanationCorpus,
    confidenceMode,
    allArtifacts: unique([matchedArtifact, ...mayImpactArtifacts, ...extractedArtifacts]),
    allAttacks: unique([matchedAttack, ...directAttacks, ...mayImpactAttacks, ...predictions, ...extractedAttacks]),
    combinedText: [scenarioTitle, questionText, scenarioText].filter(Boolean).join(" "),
    combinedSignalText: [
      scenarioTitle,
      questionText,
      scenarioText,
      matchedAttack,
      ...directAttacks,
      ...mayImpactAttacks,
      ...extractedAttacks,
      ...predictions,
      explanationText,
      ...explanationSections,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export {
  buildEvidence,
  collectDefenseDescriptions,
  collectPredictionTitles,
  collectTitles,
  joinNatural,
  normalizeForMatch,
  normalizeText,
  parseConfidenceMode,
  toSentence,
  unique,
};
