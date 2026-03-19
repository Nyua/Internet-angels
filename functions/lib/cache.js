export function buildCacheRequest(request) {
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return new Request(url.toString(), { method: "GET" });
}

export function isFresh(fetchedAt, ttlSec, nowMs = Date.now()) {
  const fetchedAtMs = Date.parse(String(fetchedAt || ""));
  if (!Number.isFinite(fetchedAtMs)) {
    return false;
  }
  return nowMs - fetchedAtMs <= Math.max(0, Number(ttlSec) || 0) * 1000;
}

export function isRetained(fetchedAt, retainTtlSec, nowMs = Date.now()) {
  const fetchedAtMs = Date.parse(String(fetchedAt || ""));
  if (!Number.isFinite(fetchedAtMs)) {
    return false;
  }
  return nowMs - fetchedAtMs <= Math.max(0, Number(retainTtlSec) || 0) * 1000;
}

export async function readCachedPayload({
  cache,
  request,
  freshTtlSec,
  retainTtlSec,
  nowMs = Date.now()
}) {
  const response = await cache.match(request);
  if (!response) {
    return {
      status: "miss",
      payload: null
    };
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return {
      status: "invalid",
      payload: null
    };
  }

  if (!payload || typeof payload !== "object") {
    return {
      status: "invalid",
      payload: null
    };
  }

  if (isFresh(payload.fetchedAt, freshTtlSec, nowMs)) {
    return {
      status: "fresh",
      payload
    };
  }

  if (isRetained(payload.fetchedAt, retainTtlSec, nowMs)) {
    return {
      status: "retained",
      payload
    };
  }

  return {
    status: "expired",
    payload
  };
}

export async function writeCachedPayload({
  cache,
  request,
  payload,
  retainTtlSec
}) {
  const serialized = JSON.stringify({
    ...payload,
    stale: false
  });
  const response = new Response(serialized, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${Math.max(0, Math.floor(Number(retainTtlSec) || 0))}`
    }
  });
  await cache.put(request, response.clone());
}

export function toStalePayload(payload, sourceStatus = "PARTIAL") {
  return {
    ...payload,
    stale: true,
    sourceStatus
  };
}

