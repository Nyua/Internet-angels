import {
  LASTFM_API_BASE,
  LASTFM_TIMEOUT_MS,
  LASTFM_USER
} from "./config.js";
import { fetchWithTimeout } from "./response.js";

export function buildLastFmEndpoint(method, apiKey, extraParams = {}) {
  const endpoint = new URL(LASTFM_API_BASE);
  endpoint.searchParams.set("method", method);
  endpoint.searchParams.set("user", LASTFM_USER);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(extraParams)) {
    endpoint.searchParams.set(key, String(value));
  }
  return endpoint.toString();
}

export async function fetchLastFmJson(method, apiKey, extraParams = {}) {
  const response = await fetchWithTimeout(buildLastFmEndpoint(method, apiKey, extraParams), {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  }, LASTFM_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Last.fm upstream failed (${response.status})`);
  }

  return await response.json();
}

export function pickSettledSection(result, key, fallback) {
  if (result.status !== "fulfilled" || !result.value || typeof result.value !== "object") {
    return fallback;
  }
  const value = result.value[key];
  if (value && typeof value === "object") {
    return value;
  }
  return fallback;
}

export function pickLastFmImageUrl(images) {
  if (!Array.isArray(images)) {
    return "";
  }
  for (let index = images.length - 1; index >= 0; index -= 1) {
    const candidate = String(images[index]?.["#text"] || "").trim();
    if (candidate) {
      return candidate;
    }
  }
  return "";
}

export function normalizeLastFmNowPlayingPayload(upstreamPayload, nowMs = Date.now()) {
  const rawTrack = upstreamPayload?.recenttracks?.track;
  const track = Array.isArray(rawTrack) ? rawTrack[0] : rawTrack || null;
  const nowPlaying = track?.["@attr"]?.nowplaying === "true";
  return {
    nowPlaying,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    track: nowPlaying ? {
      title: String(track?.name || "").trim(),
      artist: String(track?.artist?.name || track?.artist?.["#text"] || "").trim(),
      album: String(track?.album?.["#text"] || "").trim(),
      artworkUrl: pickLastFmImageUrl(track?.image),
      url: String(track?.url || "").trim()
    } : null
  };
}

export function buildEmptyLastFmPayload(nowMs = Date.now(), sourceStatus = "ERROR") {
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    recenttracks: { track: [] },
    topartists: { artist: [] },
    topalbums: { album: [] },
    user: {},
    lovedtracks: { "@attr": { total: "0" } },
    nowPlaying: {
      nowPlaying: false,
      stale: false,
      fetchedAt: new Date(nowMs).toISOString(),
      track: null
    }
  };
}

export async function fetchLastFmPayload(apiKey, nowMs = Date.now()) {
  const settled = await Promise.allSettled([
    fetchLastFmJson("user.getrecenttracks", apiKey, { limit: 10, extended: 1 }),
    fetchLastFmJson("user.gettopartists", apiKey, { period: "1month", limit: 8 }),
    fetchLastFmJson("user.gettopalbums", apiKey, { period: "1month", limit: 8 }),
    fetchLastFmJson("user.getinfo", apiKey),
    fetchLastFmJson("user.getlovedtracks", apiKey, { limit: 1 })
  ]);

  const fulfilledCount = settled.filter((entry) => entry.status === "fulfilled").length;
  if (!fulfilledCount) {
    throw new Error("Last.fm upstream unavailable");
  }

  const [
    recenttracksResult,
    topartistsResult,
    topalbumsResult,
    userInfoResult,
    lovedtracksResult
  ] = settled;

  const recentTracksSection = pickSettledSection(recenttracksResult, "recenttracks", { track: [] });

  return {
    sourceStatus: fulfilledCount === settled.length ? "OK" : "PARTIAL",
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    recenttracks: recentTracksSection,
    topartists: pickSettledSection(topartistsResult, "topartists", { artist: [] }),
    topalbums: pickSettledSection(topalbumsResult, "topalbums", { album: [] }),
    user: pickSettledSection(userInfoResult, "user", {}),
    lovedtracks: pickSettledSection(lovedtracksResult, "lovedtracks", { "@attr": { total: "0" } }),
    nowPlaying: recenttracksResult.status === "fulfilled"
      ? normalizeLastFmNowPlayingPayload({ recenttracks: recentTracksSection }, nowMs)
      : {
          nowPlaying: false,
          stale: false,
          fetchedAt: new Date(nowMs).toISOString(),
          track: null
        }
  };
}
