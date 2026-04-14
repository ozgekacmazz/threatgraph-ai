const CUSTOM_SCENARIO_PREFIX = "custom-scenario-analysis:";
const PREDEFINED_SCENARIO_PREFIX = "predefined-scenario-analysis:";

function safeRead(key) {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.sessionStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function safeWrite(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(key, JSON.stringify(value));
}

export function buildCustomScenarioId() {
  return `scenario-${Date.now()}`;
}

export function saveCustomScenarioAnalysis(record) {
  safeWrite(`${CUSTOM_SCENARIO_PREFIX}${record.id}`, record);
}

export function loadCustomScenarioAnalysis(id) {
  return safeRead(`${CUSTOM_SCENARIO_PREFIX}${id}`);
}

export function savePredefinedScenarioAnalysis(record) {
  safeWrite(`${PREDEFINED_SCENARIO_PREFIX}${record.id}`, record);
}

export function loadPredefinedScenarioAnalysis(id) {
  return safeRead(`${PREDEFINED_SCENARIO_PREFIX}${id}`);
}
