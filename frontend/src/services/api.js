const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const API_BASE_URL = rawApiBaseUrl.replace(/\/+$/, "");

function formatValidationPath(location) {
  if (!Array.isArray(location) || !location.length) {
    return "girdi alanı";
  }

  return location
    .filter((segment) => segment !== "body" && segment !== "query")
    .map((segment) => String(segment))
    .join(" > ");
}

function normalizeErrorPayload(payload) {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (Array.isArray(payload)) {
    const normalizedItems = payload.map((item) => normalizeErrorPayload(item)).filter(Boolean);
    return normalizedItems.length
      ? normalizedItems.join(" | ")
      : "İşlem tamamlanamadı. Lütfen girdiyi kontrol edip tekrar deneyin.";
  }

  if (typeof payload === "object") {
    if (Array.isArray(payload.detail)) {
      const validationErrors = payload.detail
        .map((item) => {
          if (typeof item === "string") {
            return item;
          }

          if (item && typeof item === "object") {
            const fieldPath = formatValidationPath(item.loc);
            const message = item.msg || item.message || "Geçersiz değer";
            return `${fieldPath}: ${message}`;
          }

          return null;
        })
        .filter(Boolean);

      if (validationErrors.length) {
        return `Gönderilen veri doğrulanamadı: ${validationErrors.join(" | ")}`;
      }
    }

    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    if (typeof payload.message === "string") {
      return payload.message;
    }

    if (typeof payload.error === "string") {
      return payload.error;
    }

    const flatValues = Object.values(payload)
      .map((value) => normalizeErrorPayload(value))
      .filter(Boolean);

    if (flatValues.length) {
      return flatValues.join(" | ");
    }
  }

  return "İşlem tamamlanamadı. Lütfen girdiyi kontrol edip tekrar deneyin.";
}

async function parseApiError(response) {
  try {
    const errorPayload = await response.json();
    return normalizeErrorPayload(errorPayload);
  } catch {
    return "İşlem tamamlanamadı. Sunucu beklenmeyen bir yanıt döndü.";
  }
}

async function requestJson(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        `Backend'e ulaşılamadı. ${API_BASE_URL}${path} adresini doğrulayın, FastAPI sunucusunun çalıştığını ve CORS ayarlarının frontend origin'ini izin verdiğini kontrol edin.`
      );
    }

    throw error;
  }

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  return response.json();
}

async function postJson(path, payload) {
  return requestJson(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function analyzeArtifact(payload) {
  return postJson("/analyze", payload);
}

export async function analyzeScenario(payload) {
  return postJson("/analyze-scenario", payload);
}

export async function fetchGraphContext(payload) {
  return postJson("/graph/context", payload);
}

export async function fetchArtifacts() {
  return requestJson("/artifacts");
}
