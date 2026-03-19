import {
  LASTFM_NOW_PLAYING_FRESH_TTL_SEC,
  LASTFM_NOW_PLAYING_RETAIN_TTL_SEC
} from "../lib/config.js";
import { buildCacheRequest, readCachedPayload, toStalePayload, writeCachedPayload } from "../lib/cache.js";
import { buildEmptyLastFmNowPlayingPayload, fetchLastFmNowPlayingPayload } from "../lib/lastfm.js";
import { browserCacheControl, isSameOriginRequest, jsonResponse, methodNotAllowedResponse } from "../lib/response.js";

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
      ...buildEmptyLastFmNowPlayingPayload(nowMs, "ERROR"),
      error: "LASTFM_API_KEY secret is not configured"
    }, { status: 500 });
  }

  const cacheRequest = buildCacheRequest(request);
  const cacheState = await readCachedPayload({
    cache: caches.default,
    request: cacheRequest,
    freshTtlSec: LASTFM_NOW_PLAYING_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_NOW_PLAYING_RETAIN_TTL_SEC,
    nowMs
  });

  if (cacheState.status === "fresh" && cacheState.payload) {
    return jsonResponse(cacheState.payload, {
      status: 200,
      cacheControl: browserCacheControl(LASTFM_NOW_PLAYING_FRESH_TTL_SEC)
    });
  }

  try {
    const payload = await fetchLastFmNowPlayingPayload(apiKey, nowMs);
    await writeCachedPayload({
      cache: caches.default,
      request: cacheRequest,
      payload,
      retainTtlSec: LASTFM_NOW_PLAYING_RETAIN_TTL_SEC
    });
    return jsonResponse(payload, {
      status: 200,
      cacheControl: browserCacheControl(LASTFM_NOW_PLAYING_FRESH_TTL_SEC)
    });
  } catch (error) {
    if (cacheState.payload && cacheState.status === "retained") {
      return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
        status: 200,
        cacheControl: browserCacheControl(LASTFM_NOW_PLAYING_FRESH_TTL_SEC)
      });
    }

    return jsonResponse({
      ...buildEmptyLastFmNowPlayingPayload(nowMs, "ERROR"),
      error: error?.name === "AbortError" ? "Last.fm now-playing upstream timed out" : "Last.fm now-playing upstream unavailable"
    }, {
      status: error?.name === "AbortError" ? 504 : 502
    });
  }
}
