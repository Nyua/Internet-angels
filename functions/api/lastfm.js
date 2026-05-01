import {
  LASTFM_FRESH_TTL_SEC,
  LASTFM_RETAIN_TTL_SEC,
  LASTFM_ROUTE_TIMEOUT_MS
} from "../lib/config.js";
import { buildCacheRequest, readCachedPayload, toStalePayload, writeCachedPayload } from "../lib/cache.js";
import { buildEmptyLastFmPayload, fetchLastFmPayload } from "../lib/lastfm.js";
import {
  browserCacheControl,
  isSameOriginRequest,
  jsonResponse,
  methodNotAllowedResponse,
  resolveTimeoutMs,
  runWithTimeout
} from "../lib/response.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return methodNotAllowedResponse();
  }
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
  }

  const apiKey = String(env.LASTFM_API_KEY || "").trim();
  const nowMs = Date.now();
  if (!apiKey) {
    return jsonResponse({
      ...buildEmptyLastFmPayload(nowMs, "ERROR"),
      error: "LASTFM_API_KEY secret is not configured"
    }, { status: 500 });
  }

  const cacheRequest = buildCacheRequest(request);
  const cacheState = await readCachedPayload({
    cache: caches.default,
    request: cacheRequest,
    freshTtlSec: LASTFM_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_RETAIN_TTL_SEC,
    nowMs
  });

  if (cacheState.status === "fresh" && cacheState.payload) {
    return jsonResponse(cacheState.payload, {
      status: 200,
      cacheControl: browserCacheControl(LASTFM_FRESH_TTL_SEC)
    });
  }

  try {
    const routeTimeoutMs = resolveTimeoutMs(env.LASTFM_ROUTE_TIMEOUT_MS, LASTFM_ROUTE_TIMEOUT_MS, {
      min: 500,
      max: LASTFM_ROUTE_TIMEOUT_MS
    });
    const payload = await runWithTimeout(
      (signal) => fetchLastFmPayload(apiKey, nowMs, { signal }),
      routeTimeoutMs,
      "Last.fm route timed out"
    );
    await writeCachedPayload({
      cache: caches.default,
      request: cacheRequest,
      payload,
      retainTtlSec: LASTFM_RETAIN_TTL_SEC
    });
    return jsonResponse(payload, {
      status: 200,
      cacheControl: browserCacheControl(LASTFM_FRESH_TTL_SEC)
    });
  } catch (error) {
    if (cacheState.payload && cacheState.status === "retained") {
      return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
        status: 200,
        cacheControl: browserCacheControl(5 * 60)
      });
    }

    return jsonResponse({
      ...buildEmptyLastFmPayload(nowMs, "ERROR"),
      error: error?.name === "AbortError" ? "Last.fm upstream timed out" : "Last.fm upstream unavailable"
    }, {
      status: error?.name === "AbortError" ? 504 : 502
    });
  }
}
