export function jsonResponse(payload, {
  status = 200,
  cacheControl = "no-store, max-age=0, must-revalidate",
  headers = {}
} = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      ...headers
    }
  });
}

export function methodNotAllowedResponse() {
  return jsonResponse({ error: "Method not allowed" }, { status: 405 });
}

export function isSameOriginRequest(request) {
  const requestUrl = new URL(request.url);
  const host = String(request.headers.get("host") || requestUrl.host || "").trim();
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function browserCacheControl(maxAgeSec) {
  const safeMaxAge = Math.max(0, Math.floor(Number(maxAgeSec) || 0));
  return `public, max-age=${safeMaxAge}, must-revalidate`;
}

export async function fetchWithTimeout(resource, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || 1));
  try {
    return await fetch(resource, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

