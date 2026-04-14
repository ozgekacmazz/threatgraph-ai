const CUSTOM_SCENARIO_PREFIX = "custom-scenario-analysis:";
const PREDEFINED_SCENARIO_PREFIX = "predefined-scenario-analysis:";

function isValidScenarioRecord(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      typeof value.scenarioText === "string" &&
      value.scenarioText.trim()
  );
}

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
  if (!isValidScenarioRecord(record)) {
    return;
  }

  safeWrite(`${CUSTOM_SCENARIO_PREFIX}${record.id}`, record);
}

export function loadCustomScenarioAnalysis(id) {
  const record = safeRead(`${CUSTOM_SCENARIO_PREFIX}${id}`);
  return isValidScenarioRecord(record) ? record : null;
}

export function savePredefinedScenarioAnalysis(record) {
  if (!isValidScenarioRecord(record)) {
    return;
  }

  safeWrite(`${PREDEFINED_SCENARIO_PREFIX}${record.id}`, record);
}

export function loadPredefinedScenarioAnalysis(id) {
  const record = safeRead(`${PREDEFINED_SCENARIO_PREFIX}${id}`);
  return isValidScenarioRecord(record) ? record : null;
}
