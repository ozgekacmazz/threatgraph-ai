import { resolveScenarioProfile } from "./scenarioAttackResolver.js";
import { planScenarioNarrative } from "./scenarioNarrativePlanner.js";
import { buildEvidence } from "./scenarioNarrativeShared.js";

function normalizeQuestionText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

function detectQuestionIntents(questionText) {
  const text = normalizeQuestionText(questionText);
  const has = (patterns) => patterns.some((pattern) => text.includes(pattern));

  const intents = {
    nextSteps: has([
      "sonraki aşama",
      "sonraki adım",
      "ardından",
      "bundan sonra",
      "devamında",
      "neler olabilir",
      "ne olabilir",
      "what could happen next",
    ]),
    prevention: has([
      "nasıl önlenir",
      "nasıl engellenir",
      "nasıl azaltılır",
      "nasıl korunur",
      "önlemek",
      "savunma",
      "mitig",
      "prevent",
    ]),
    affectedArtifacts: has([
      "hangi artifact",
      "hangi artifact'ler",
      "hangi artifactler",
      "hangi varlık",
      "hangi sistem",
      "hangi host",
      "etkilenebilir",
      "risk altındadır",
      "risk altına",
      "risk altında",
    ]),
    followOnAttacks: has([
      "hangi saldırı",
      "hangi saldırılar",
      "saldırılar gelebilir",
      "lead to",
      "olur mu",
      "gelebilir mi",
      "yol açabilir mi",
    ]),
    nextTactics: has([
      "hangi tactic",
      "hangi tactic'ler",
      "hangi taktik",
      "hangi taktikler",
      "next tactic",
      "sonraki tactic",
      "sonraki taktik",
    ]),
    risks: has([
      "hangi risk",
      "hangi riskler",
      "riskler neler",
      "ne olur",
      "risk doğurur",
      "risk oluşur",
      "compromise",
      "ele geçirilirse",
      "kompromize",
    ]),
    spread: has([
      "yayılım",
      "sıçrama",
      "hangi sistemlere",
      "nasıl yayılır",
      "spread",
      "nereye yayılabilir",
      "nereye ilerleyebilir",
    ]),
    firstChecks: has([
      "ilk ne",
      "ilk yapılması gereken",
      "ilk kontrol",
      "ne kontrol edilmeli",
      "what should be checked first",
    ]),
  };

  if (!Object.values(intents).some(Boolean)) {
    intents.risks = true;
  }

  return intents;
}

function deriveIntentOrder(intents) {
  const ordered = [];

  if (intents.followOnAttacks) ordered.push("followOnAttacks");
  if (intents.affectedArtifacts) ordered.push("affectedArtifacts");
  if (intents.nextTactics) ordered.push("nextTactics");
  if (intents.nextSteps) ordered.push("nextSteps");
  if (intents.risks) ordered.push("risks");
  if (intents.spread) ordered.push("spread");
  if (intents.prevention) ordered.push("prevention");
  if (intents.firstChecks) ordered.push("firstChecks");

  return ordered;
}

function composeSummary(input, evidence, intents) {
  const requestedIntents = deriveIntentOrder(intents);
  const resolution = resolveScenarioProfile(input, evidence);
  const narrative = planScenarioNarrative(input, evidence, resolution);

  return {
    interpretation: narrative.interpretation,
    immediateRisk: narrative.immediateRisk,
    likelyNextStep: narrative.likelyNextStep,
    actions: narrative.actions,
    detailSummary: narrative.detailSummary,
    mixedSignals: requestedIntents.length > 1,
    primaryIntent: requestedIntents[0] || "risks",
    requestedIntents,
    profile: resolution.profileId,
    confidenceQualifier: narrative.confidenceQualifier,
    resolution,
    narrativePlan: narrative.plan,
  };
}

function detectRiskDomain(primaryIntent) {
  switch (primaryIntent) {
    case "prevention":
      return "defense_guidance";
    case "affectedArtifacts":
      return "artifact_impact";
    case "followOnAttacks":
      return "follow_on_attacks";
    case "nextTactics":
      return "tactic_progression";
    case "spread":
      return "spread_risk";
    case "firstChecks":
      return "triage_checks";
    default:
      return "scenario_risk";
  }
}

export function buildScenarioNarrative(input) {
  const evidence = buildEvidence(input);
  const intents = detectQuestionIntents(input.scenarioText || input.questionText || "");
  const summary = composeSummary(input, evidence, intents);

  return {
    incidentType: summary.primaryIntent,
    riskDomain: detectRiskDomain(summary.primaryIntent),
    confidenceMode: evidence.confidenceMode,
    scenarioProfile: summary.profile,
    interpretation: summary.interpretation,
    immediateRisk: summary.immediateRisk,
    likelyNextStep: summary.likelyNextStep,
    actions: summary.actions,
    summaryParagraph: [summary.interpretation, summary.immediateRisk, summary.likelyNextStep]
      .filter(Boolean)
      .join(" "),
    detailSummary: summary.detailSummary,
    classificationScores: Object.fromEntries(summary.requestedIntents.map((intent) => [intent, 1])),
    classificationScoreGap: 0,
    mixedSignals: summary.mixedSignals,
    profileResolution: summary.resolution,
    narrativePlan: summary.narrativePlan,
  };
}
