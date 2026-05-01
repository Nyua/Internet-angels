import {
  DISCORD_FRESH_TTL_SEC,
  DISCORD_RETAIN_TTL_SEC,
  DISCORD_ROUTE_TIMEOUT_MS
} from "../lib/config.js";
import { buildCacheRequest, readCachedPayload, toStalePayload, writeCachedPayload } from "../lib/cache.js";
import { buildDiscordProxyErrorPayload, fetchDiscordPayload } from "../lib/discord.js";
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

  const nowMs = Date.now();
  const cacheRequest = buildCacheRequest(request);
  const cacheState = await readCachedPayload({
    cache: caches.default,
    request: cacheRequest,
    freshTtlSec: DISCORD_FRESH_TTL_SEC,
    retainTtlSec: DISCORD_RETAIN_TTL_SEC,
    nowMs
  });

  if (cacheState.status === "fresh" && cacheState.payload) {
    return jsonResponse(cacheState.payload, {
      status: 200,
      cacheControl: browserCacheControl(DISCORD_FRESH_TTL_SEC)
    });
  }

  try {
    const routeTimeoutMs = resolveTimeoutMs(env?.DISCORD_ROUTE_TIMEOUT_MS, DISCORD_ROUTE_TIMEOUT_MS, {
      min: 500,
      max: DISCORD_ROUTE_TIMEOUT_MS
    });
    const payload = await runWithTimeout(
      (signal) => fetchDiscordPayload(nowMs, { signal }),
      routeTimeoutMs,
      "Discord route timed out"
    );
    await writeCachedPayload({
      cache: caches.default,
      request: cacheRequest,
      payload,
      retainTtlSec: DISCORD_RETAIN_TTL_SEC
    });
    return jsonResponse(payload, {
      status: 200,
      cacheControl: browserCacheControl(DISCORD_FRESH_TTL_SEC)
    });
  } catch (error) {
    if (cacheState.payload && cacheState.status === "retained") {
      return jsonResponse(toStalePayload(cacheState.payload, "PARTIAL"), {
        status: 200,
        cacheControl: browserCacheControl(5 * 60)
      });
    }

    return jsonResponse({
      ...buildDiscordProxyErrorPayload(nowMs, "ERROR"),
      error: error?.name === "AbortError" ? "Discord upstream timed out" : "Discord proxy failed"
    }, {
      status: error?.name === "AbortError" ? 504 : 502
    });
  }
}
