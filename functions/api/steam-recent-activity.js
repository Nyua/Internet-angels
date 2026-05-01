import {
  STEAM_FRESH_TTL_SEC,
  STEAM_RETAIN_TTL_SEC,
  STEAM_ROUTE_TIMEOUT_MS
} from "../lib/config.js";
import { buildCacheRequest, readCachedPayload, toStalePayload, writeCachedPayload } from "../lib/cache.js";
import {
  browserCacheControl,
  isSameOriginRequest,
  jsonResponse,
  methodNotAllowedResponse,
  resolveTimeoutMs,
  runWithTimeout
} from "../lib/response.js";
import { fetchSteamRecentActivityPayload } from "../lib/steam.js";

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return methodNotAllowedResponse();
  }
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
  }

  const nowMs = Date.now();
  const cacheRequest = buildCacheRequest(request);
  const cacheState = await readCachedPayload({
    cache: caches.default,
    request: cacheRequest,
    freshTtlSec: STEAM_FRESH_TTL_SEC,
    retainTtlSec: STEAM_RETAIN_TTL_SEC,
    nowMs
  });

  if (cacheState.status === "fresh" && cacheState.payload) {
    return jsonResponse(cacheState.payload, {
      status: 200,
      cacheControl: browserCacheControl(STEAM_FRESH_TTL_SEC)
    });
  }

  try {
    const routeTimeoutMs = resolveTimeoutMs(env?.STEAM_ROUTE_TIMEOUT_MS, STEAM_ROUTE_TIMEOUT_MS, {
      min: 500,
      max: STEAM_ROUTE_TIMEOUT_MS
    });
    const payload = await runWithTimeout(
      (signal) => fetchSteamRecentActivityPayload(nowMs, { signal }),
      routeTimeoutMs,
      "Steam route timed out"
    );
    await writeCachedPayload({
      cache: caches.default,
      request: cacheRequest,
      payload,
      retainTtlSec: STEAM_RETAIN_TTL_SEC
    });
    return jsonResponse(payload, {
      status: 200,
      cacheControl: browserCacheControl(STEAM_FRESH_TTL_SEC)
    });
  } catch (error) {
    if (cacheState.payload && cacheState.status === "retained") {
      return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
        status: 200,
        cacheControl: browserCacheControl(30 * 60)
      });
    }
    return jsonResponse({
      sourceStatus: "ERROR",
      stale: false,
      fetchedAt: new Date(nowMs).toISOString(),
      error: error?.name === "AbortError" ? "Steam upstream timed out" : "Steam recent-activity proxy failed",
      profile: {},
      stats: [],
      items: []
    }, {
      status: error?.name === "AbortError" ? 504 : 502
    });
  }
}
