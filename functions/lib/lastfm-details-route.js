import { readCachedPayload, toStalePayload, writeCachedPayload } from "./cache.js";
import {
  browserCacheControl,
  isSameOriginRequest,
  jsonResponse,
  methodNotAllowedResponse,
  resolveTimeoutMs,
  runWithTimeout
} from "./response.js";

const LASTFM_DETAILS_CACHE_VERSION = "spotify-credentialless-v3";
const pendingLastFmDetailsPayloads = new Map();

export function normalizeLastFmDetailsQueryValue(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function buildLastFmDetailsCacheRequest(request, query, keys) {
  const requestUrl = new URL(request.url);
  const cacheUrl = new URL(requestUrl.origin);
  cacheUrl.pathname = requestUrl.pathname;
  for (const key of Array.isArray(keys) ? keys : []) {
    const value = String(query?.[key] || "").trim();
    if (!value) continue;
    cacheUrl.searchParams.set(key, value.toLowerCase());
  }
  cacheUrl.searchParams.set("__v", LASTFM_DETAILS_CACHE_VERSION);
  return new Request(cacheUrl.toString(), { method: "GET" });
}

export function createLastFmDetailsRouteHandler(options) {
  const config = options && typeof options === "object" ? options : {};
  async function fetchAndCachePayload({ apiKey, env, query, nowMs, cacheRequest }) {
    const pendingKey = cacheRequest?.url || "";
    if (pendingKey && pendingLastFmDetailsPayloads.has(pendingKey)) {
      return await pendingLastFmDetailsPayloads.get(pendingKey);
    }
    const routeTimeoutMs = resolveTimeoutMs(env?.LASTFM_DETAILS_ROUTE_TIMEOUT_MS, config.routeTimeoutMs, {
      min: 500,
      max: config.routeTimeoutMs
    });
    const payloadPromise = (async () => {
      const payload = await runWithTimeout(
        (signal) => config.fetchPayload({
          apiKey,
          env,
          query,
          nowMs,
          signal
        }),
        routeTimeoutMs,
        config.timeoutError
      );
      await writeCachedPayload({
        cache: caches.default,
        request: cacheRequest,
        payload,
        retainTtlSec: config.retainTtlSec
      });
      return payload;
    })();
    if (pendingKey) {
      pendingLastFmDetailsPayloads.set(pendingKey, payloadPromise);
    }
    try {
      return await payloadPromise;
    } finally {
      if (pendingKey && pendingLastFmDetailsPayloads.get(pendingKey) === payloadPromise) {
        pendingLastFmDetailsPayloads.delete(pendingKey);
      }
    }
  }

  return async function onRequest(context) {
    const { request, env } = context;
    if (request.method !== "GET") {
      return methodNotAllowedResponse();
    }
    if (!isSameOriginRequest(request)) {
      return jsonResponse({ error: "Origin not allowed" }, { status: 403 });
    }

    const nowMs = Date.now();
    const requestUrl = new URL(request.url);
    const query = config.readQuery(requestUrl);
    const validationError = config.validateQuery(query);
    if (validationError) {
      return jsonResponse({
        ...config.buildEmptyPayload(nowMs, "ERROR", query),
        error: validationError
      }, { status: 400 });
    }

    const apiKey = String(env.LASTFM_API_KEY || "").trim();
    if (!apiKey) {
      return jsonResponse({
        ...config.buildEmptyPayload(nowMs, "ERROR", query),
        error: "LASTFM_API_KEY secret is not configured"
      }, { status: 500 });
    }

    const cacheRequest = config.buildCacheRequest(request, query);
    const cacheState = await readCachedPayload({
      cache: caches.default,
      request: cacheRequest,
      freshTtlSec: config.freshTtlSec,
      retainTtlSec: config.retainTtlSec,
      nowMs
    });

    if (cacheState.status === "fresh" && cacheState.payload) {
      return jsonResponse(cacheState.payload, {
        status: 200,
        cacheControl: browserCacheControl(config.freshTtlSec)
      });
    }

    if (cacheState.status === "retained" && cacheState.payload) {
      if (typeof context.waitUntil === "function") {
        context.waitUntil(fetchAndCachePayload({
          apiKey,
          env,
          query,
          nowMs,
          cacheRequest
        }).catch(() => {}));
      }
      return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
        status: 200,
        cacheControl: browserCacheControl(5 * 60)
      });
    }

    try {
      const payload = await fetchAndCachePayload({
        apiKey,
        env,
        query,
        nowMs,
        cacheRequest
      });
      return jsonResponse(payload, {
        status: 200,
        cacheControl: browserCacheControl(config.freshTtlSec)
      });
    } catch (error) {
      if (cacheState.payload && cacheState.status === "retained") {
        return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
          status: 200,
          cacheControl: browserCacheControl(5 * 60)
        });
      }
      return jsonResponse({
        ...config.buildEmptyPayload(nowMs, "ERROR", query),
        error: error?.name === "AbortError" ? config.timeoutError : config.unavailableError
      }, {
        status: error?.name === "AbortError" ? 504 : 502
      });
    }
  };
}
