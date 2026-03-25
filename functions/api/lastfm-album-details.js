import {
  LASTFM_ALBUM_DETAILS_FRESH_TTL_SEC,
  LASTFM_ALBUM_DETAILS_RETAIN_TTL_SEC
} from "../lib/config.js";
import { readCachedPayload, toStalePayload, writeCachedPayload } from "../lib/cache.js";
import { buildEmptyLastFmAlbumDetailsPayload, fetchLastFmAlbumDetails } from "../lib/lastfm-details.js";
import { browserCacheControl, isSameOriginRequest, jsonResponse, methodNotAllowedResponse } from "../lib/response.js";

const MAX_QUERY_LENGTH = 160;

function normalizeQueryValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildAlbumDetailsCacheRequest(request, query) {
  const requestUrl = new URL(request.url);
  const cacheUrl = new URL(requestUrl.origin);
  cacheUrl.pathname = requestUrl.pathname;
  cacheUrl.searchParams.set("artist", query.artist.toLowerCase());
  cacheUrl.searchParams.set("album", query.album.toLowerCase());
  return new Request(cacheUrl.toString(), { method: "GET" });
}

function validateQuery(query) {
  if (!query.artist || !query.album) {
    return "artist and album are required";
  }
  if (query.artist.length > MAX_QUERY_LENGTH || query.album.length > MAX_QUERY_LENGTH) {
    return `artist and album must be ${MAX_QUERY_LENGTH} characters or fewer`;
  }
  return "";
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== "GET") {
    return methodNotAllowedResponse();
  }
  if (!isSameOriginRequest(request)) {
    return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const query = {
    artist: normalizeQueryValue(requestUrl.searchParams.get("artist")),
    album: normalizeQueryValue(requestUrl.searchParams.get("album"))
  };
  const validationError = validateQuery(query);
  if (validationError) {
    return jsonResponse({
      ...buildEmptyLastFmAlbumDetailsPayload(Date.now(), "ERROR", query),
      error: validationError
    }, { status: 400 });
  }

  const apiKey = String(env.LASTFM_API_KEY || "").trim();
  const nowMs = Date.now();
  if (!apiKey) {
    return jsonResponse({
      ...buildEmptyLastFmAlbumDetailsPayload(nowMs, "ERROR", query),
      error: "LASTFM_API_KEY secret is not configured"
    }, { status: 500 });
  }

  const cacheRequest = buildAlbumDetailsCacheRequest(request, query);
  const cacheState = await readCachedPayload({
    cache: caches.default,
    request: cacheRequest,
    freshTtlSec: LASTFM_ALBUM_DETAILS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_ALBUM_DETAILS_RETAIN_TTL_SEC,
    nowMs
  });

  if (cacheState.status === "fresh" && cacheState.payload) {
    return jsonResponse(cacheState.payload, {
      status: 200,
      cacheControl: browserCacheControl(LASTFM_ALBUM_DETAILS_FRESH_TTL_SEC)
    });
  }

  try {
    const payload = await fetchLastFmAlbumDetails({
      apiKey,
      artist: query.artist,
      album: query.album,
      nowMs
    });
    await writeCachedPayload({
      cache: caches.default,
      request: cacheRequest,
      payload,
      retainTtlSec: LASTFM_ALBUM_DETAILS_RETAIN_TTL_SEC
    });
    return jsonResponse(payload, {
      status: 200,
      cacheControl: browserCacheControl(LASTFM_ALBUM_DETAILS_FRESH_TTL_SEC)
    });
  } catch (error) {
    if (cacheState.payload && cacheState.status === "retained") {
      return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
        status: 200,
        cacheControl: browserCacheControl(5 * 60)
      });
    }
    return jsonResponse({
      ...buildEmptyLastFmAlbumDetailsPayload(nowMs, "ERROR", query),
      error: error?.name === "AbortError" ? "Last.fm album details timed out" : "Last.fm album details unavailable"
    }, {
      status: error?.name === "AbortError" ? 504 : 502
    });
  }
}
