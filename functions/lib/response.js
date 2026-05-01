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

export function createTimeoutError(message = "Request timed out") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

export function throwIfAborted(signal, message = "Request aborted") {
  if (!signal?.aborted) {
    return;
  }
  const reason = signal.reason;
  if (reason instanceof Error) {
    throw reason;
  }
  throw createTimeoutError(reason ? String(reason) : message);
}

export function resolveTimeoutMs(value, fallback, { min = 1, max = 60_000 } = {}) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 60_000;
  const safeFallback = Math.max(min, Math.min(safeMax, Number.parseInt(String(fallback ?? min), 10) || min));
  if (!Number.isFinite(parsed)) {
    return safeFallback;
  }
  return Math.max(min, Math.min(safeMax, parsed));
}

export async function runWithTimeout(task, timeoutMs = 10_000, message = "Request timed out") {
  const controller = new AbortController();
  const safeTimeoutMs = Math.max(1, Number(timeoutMs) || 1);
  let timeoutId = 0;
  const taskPromise = Promise.resolve().then(() => task(controller.signal));
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = createTimeoutError(message);
      controller.abort(error);
      reject(error);
    }, safeTimeoutMs);
  });
  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted && error?.name !== "AbortError") {
      throwIfAborted(controller.signal, message);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    taskPromise.catch(() => {});
  }
}

export async function fetchWithTimeout(resource, init = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const upstreamSignal = init?.signal;
  const abortFromUpstream = () => {
    const reason = upstreamSignal?.reason;
    controller.abort(reason instanceof Error ? reason : createTimeoutError(reason ? String(reason) : "Request aborted"));
  };
  if (upstreamSignal?.aborted) {
    abortFromUpstream();
  } else {
    upstreamSignal?.addEventListener?.("abort", abortFromUpstream, { once: true });
  }
  const timeoutId = setTimeout(() => {
    controller.abort(createTimeoutError("Request timed out"));
  }, Math.max(1, Number(timeoutMs) || 1));
  const { signal: _signal, ...fetchInit } = init || {};
  try {
    return await fetch(resource, {
      ...fetchInit,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
    upstreamSignal?.removeEventListener?.("abort", abortFromUpstream);
  }
}
