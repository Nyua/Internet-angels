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
import { fetchSteamRecentActivityPayload, normalizeSteamProfileUrl } from "../lib/steam.js";

function getSteamRouteProfileUrl(env) {
  return normalizeSteamProfileUrl(env?.STEAM_PROFILE_URL || "");
}

function getComparableSteamProfileUrl(value) {
  const source = String(value || "").trim();
  return source ? normalizeSteamProfileUrl(source).replace(/\/$/, "") : "";
}

function hasUsableSteamProfileCache(payload, profileUrl) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  if (/^error$/i.test(String(payload.profile?.name || "").trim())) {
    return false;
  }
  const avatarUrl = String(payload.profile?.avatarUrl || "").trim();
  if (!/^https:\/\/avatars\.fastly\.steamstatic\.com\//i.test(avatarUrl)) {
    return false;
  }
  const expectedProfileUrl = getComparableSteamProfileUrl(profileUrl);
  if (!expectedProfileUrl) {
    return true;
  }
  const cachedProfileUrl = getComparableSteamProfileUrl(payload.profile?.url || payload.profileUrl || "");
  return Boolean(cachedProfileUrl && cachedProfileUrl === expectedProfileUrl);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return methodNotAllowedResponse();
  }
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
  }

  const nowMs = Date.now();
  const profileUrl = getSteamRouteProfileUrl(env);
  const cacheRequest = buildCacheRequest(request);
  const cacheState = await readCachedPayload({
    cache: caches.default,
    request: cacheRequest,
    freshTtlSec: STEAM_FRESH_TTL_SEC,
    retainTtlSec: STEAM_RETAIN_TTL_SEC,
    nowMs
  });

  if (cacheState.status === "fresh" && hasUsableSteamProfileCache(cacheState.payload, profileUrl)) {
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
      (signal) => fetchSteamRecentActivityPayload(nowMs, { signal, profileUrl }),
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
