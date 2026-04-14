import {
  PREDEFINED_PROFILE_MAP,
  PROFILE_IDS,
  getScenarioProfile,
  scenarioProfiles,
} from "./scenarioProfiles.js";
import { normalizeForMatch, normalizeText } from "./scenarioNarrativeShared.js";

function findProfileByAlias(text) {
  const normalizedText = normalizeForMatch(text);
  for (const profile of Object.values(scenarioProfiles)) {
    if (profile.id === PROFILE_IDS.GENERIC) {
      continue;
    }

    for (const alias of [...profile.aliases, ...profile.backendAttackNames]) {
      const normalizedAlias = normalizeForMatch(alias);
      if (normalizedAlias && normalizedText.includes(normalizedAlias)) {
        return {
          profileId: profile.id,
          confidence: 0.98,
          strategy: "explicit_text_attack_match",
          matchedPhrase: alias,
          reasoning: `Metinde açık saldırı ifadesi bulundu: ${alias}`,
        };
      }
    }
  }

  return null;
}

function findProfileByBackendSignals(evidence) {
  const signals = [
    evidence.matchedAttack,
    ...evidence.directAttacks,
    ...evidence.extractedAttacks,
    ...evidence.predictions,
    ...evidence.mayImpactAttacks,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  for (const signal of signals) {
    const normalizedSignal = normalizeForMatch(signal);
    const match = Object.values(scenarioProfiles).find((profile) => {
      if (profile.id === PROFILE_IDS.GENERIC) {
        return false;
      }

      return [...profile.aliases, ...profile.backendAttackNames]
        .map((value) => normalizeForMatch(value))
        .some((value) => value && (normalizedSignal.includes(value) || value.includes(normalizedSignal)));
    });

    if (match) {
      return {
        profileId: match.id,
        confidence: signal === evidence.matchedAttack ? 0.9 : 0.78,
        strategy: "backend_attack_signal",
        matchedPhrase: signal,
        reasoning: `Backend saldırı sinyali profil ile eşleşti: ${signal}`,
      };
    }
  }

  return null;
}

function findProfileBySemanticFallback(evidence) {
  const normalizedSignals = normalizeForMatch(
    [
      evidence.combinedSignalText,
      evidence.matchedArtifact,
      ...evidence.allArtifacts,
      ...evidence.directTactics,
      ...evidence.nextTactics,
      ...evidence.defenses,
      ...evidence.defenseDescriptions,
    ].join(" ")
  );

  const scoredProfiles = Object.values(scenarioProfiles)
    .filter((profile) => profile.id !== PROFILE_IDS.GENERIC)
    .map((profile) => ({
      profileId: profile.id,
      score: profile.semanticFallbackHints.reduce((total, hint) => {
        const normalizedHint = normalizeForMatch(hint);
        return normalizedHint && normalizedSignals.includes(normalizedHint) ? total + 1 : total;
      }, 0),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!scoredProfiles.length) {
    return null;
  }

  return {
    profileId: scoredProfiles[0].profileId,
    confidence: Math.min(0.65, 0.45 + scoredProfiles[0].score * 0.08),
    strategy: "semantic_fallback",
    matchedPhrase: "",
    reasoning: "Metindeki bağlam ipuçları en güçlü şekilde bu saldırı ailesine yakın duruyor.",
  };
}

function resolveScenarioProfile(input, evidence) {
  const scenarioId = normalizeText(input.scenarioId || evidence.scenarioId);
  if (scenarioId && PREDEFINED_PROFILE_MAP[scenarioId]) {
    const profileId = PREDEFINED_PROFILE_MAP[scenarioId];
    return {
      profileId,
      profile: getScenarioProfile(profileId),
      confidence: 1,
      strategy: "predefined_scenario_id",
      matchedPhrase: scenarioId,
      reasoning: "Hazır senaryo kimliği doğrudan profile eşlendi.",
    };
  }

  const explicitMatch = findProfileByAlias(evidence.combinedText);
  if (explicitMatch) {
    return { ...explicitMatch, profile: getScenarioProfile(explicitMatch.profileId) };
  }

  const backendMatch = findProfileByBackendSignals(evidence);
  if (backendMatch) {
    return { ...backendMatch, profile: getScenarioProfile(backendMatch.profileId) };
  }

  const semanticMatch = findProfileBySemanticFallback(evidence);
  if (semanticMatch) {
    return { ...semanticMatch, profile: getScenarioProfile(semanticMatch.profileId) };
  }

  return {
    profileId: PROFILE_IDS.GENERIC,
    profile: getScenarioProfile(PROFILE_IDS.GENERIC),
    confidence: 0.35,
    strategy: "generic_fallback",
    matchedPhrase: "",
    reasoning: "Açık saldırı ailesi çözümlenemedi; yorum mevcut graph sinyalleriyle dengelendi.",
  };
}

export { resolveScenarioProfile };
