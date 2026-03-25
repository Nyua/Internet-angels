import {
  SPOTIFY_TOKEN_FRESH_TTL_SEC,
  SPOTIFY_TOKEN_RETAIN_TTL_SEC,
  SPOTIFY_TRACK_MATCH_FRESH_TTL_SEC,
  SPOTIFY_TRACK_MATCH_RETAIN_TTL_SEC
} from "./config.js";
import { readCachedPayload, writeCachedPayload } from "./cache.js";
import { fetchWithTimeout } from "./response.js";

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search";
const SPOTIFY_INTERNAL_CACHE_BASE = "https://internet-angel.internal/__spotify";

function buildInternalCacheRequest(parts) {
  const safeParts = (Array.isArray(parts) ? parts : [parts]).map((part) => encodeURIComponent(String(part || "").trim().toLowerCase()));
  return new Request(`${SPOTIFY_INTERNAL_CACHE_BASE}/${safeParts.join("/")}`, { method: "GET" });
}

async function loadCachedValue({
  cacheKeyParts,
  freshTtlSec,
  retainTtlSec,
  nowMs = Date.now(),
  loader
}) {
  const cache = globalThis.caches?.default;
  if (!cache) {
    try {
      return await loader();
    } catch {
      return null;
    }
  }

  const request = buildInternalCacheRequest(cacheKeyParts);
  const cacheState = await readCachedPayload({
    cache,
    request,
    freshTtlSec,
    retainTtlSec,
    nowMs
  });

  if (cacheState.status === "fresh" && cacheState.payload && Object.prototype.hasOwnProperty.call(cacheState.payload, "value")) {
    return cacheState.payload.value;
  }

  try {
    const value = await loader();
    if (value !== undefined) {
      await writeCachedPayload({
        cache,
        request,
        payload: {
          fetchedAt: new Date(nowMs).toISOString(),
          value
        },
        retainTtlSec
      });
    }
    return value;
  } catch {
    if (cacheState.status === "retained" && cacheState.payload && Object.prototype.hasOwnProperty.call(cacheState.payload, "value")) {
      return cacheState.payload.value;
    }
    return null;
  }
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\((feat|ft|with)[^)]+\)/g, " ")
    .replace(/\[(feat|ft|with)[^\]]+\]/g, " ")
    .replace(/\b(feat|ft|with)\.?\s+[^-/,;]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSpotifySearchQuery(trackTitle, artistName) {
  const safeTrack = String(trackTitle || "").trim();
  const safeArtist = String(artistName || "").trim();
  return `track:${safeTrack} artist:${safeArtist}`.trim();
}

export function buildSpotifyTrackSearchUrl(trackTitle, artistName) {
  const terms = [String(trackTitle || "").trim(), String(artistName || "").trim()].filter(Boolean).join(" ");
  return `https://open.spotify.com/search/${encodeURIComponent(terms)}`;
}

export function buildSpotifyTrackEmbedUrl(trackId) {
  const safeId = String(trackId || "").trim();
  if (!safeId) return "";
  return `https://open.spotify.com/embed/track/${safeId}?utm_source=generator`;
}

function buildSpotifyTrackOpenUrl(trackId) {
  const safeId = String(trackId || "").trim();
  if (!safeId) return "";
  return `https://open.spotify.com/track/${safeId}`;
}

function createBasicAuthHeader(clientId, clientSecret) {
  const pair = `${clientId}:${clientSecret}`;
  const encoded = typeof btoa === "function"
    ? btoa(pair)
    : Buffer.from(pair, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

function pickSpotifyImageUrl(images) {
  const list = Array.isArray(images) ? images : [];
  for (const image of list) {
    const candidate = String(image?.url || "").trim();
    if (candidate) return candidate;
  }
  return "";
}

async function loadSpotifyAccessToken(clientId, clientSecret, nowMs = Date.now()) {
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["token", "client-credentials"],
    freshTtlSec: SPOTIFY_TOKEN_FRESH_TTL_SEC,
    retainTtlSec: SPOTIFY_TOKEN_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const response = await fetchWithTimeout(SPOTIFY_ACCOUNTS_URL, {
        method: "POST",
        headers: {
          Authorization: createBasicAuthHeader(clientId, clientSecret),
          "content-type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      }, 10_000);
      if (!response.ok) {
        throw new Error(`Spotify token request failed (${response.status})`);
      }
      const payload = await response.json();
      const token = String(payload?.access_token || "").trim();
      return token || null;
    }
  });
  return String(cachedValue || "").trim() || "";
}

function scoreSpotifyCandidate(candidate, normalizedTrack, normalizedArtist, normalizedAlbum) {
  const candidateTrack = normalizeMatchText(candidate?.name);
  const artistNames = Array.isArray(candidate?.artists) ? candidate.artists.map((artist) => normalizeMatchText(artist?.name)) : [];
  const primaryArtist = artistNames[0] || "";
  const albumName = normalizeMatchText(candidate?.album?.name);
  let score = 0;
  if (candidateTrack && candidateTrack === normalizedTrack) score += 5;
  if (primaryArtist && primaryArtist === normalizedArtist) score += 4;
  if (normalizedArtist && artistNames.includes(normalizedArtist)) score += 2;
  if (candidateTrack && normalizedTrack && (candidateTrack.includes(normalizedTrack) || normalizedTrack.includes(candidateTrack))) score += 1.5;
  if (primaryArtist && normalizedArtist && (primaryArtist.includes(normalizedArtist) || normalizedArtist.includes(primaryArtist))) score += 1;
  if (normalizedAlbum && albumName && albumName === normalizedAlbum) score += 1;
  return score;
}

function formatSpotifyMatch(candidate, searchUrl) {
  const trackId = String(candidate?.id || "").trim();
  const artists = Array.isArray(candidate?.artists) ? candidate.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean) : [];
  const openUrl = String(candidate?.external_urls?.spotify || buildSpotifyTrackOpenUrl(trackId)).trim();
  return {
    matchStatus: "matched",
    embedUrl: buildSpotifyTrackEmbedUrl(trackId),
    openUrl,
    searchUrl,
    title: String(candidate?.name || "").trim(),
    artist: artists.join(", "),
    album: String(candidate?.album?.name || "").trim(),
    artworkUrl: pickSpotifyImageUrl(candidate?.album?.images)
  };
}

export async function findSpotifyTrackMatch({
  artist,
  track,
  album = "",
  env,
  nowMs = Date.now()
}) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  const safeAlbum = String(album || "").trim();
  const searchUrl = buildSpotifyTrackSearchUrl(safeTrack, safeArtist);
  const clientId = String(env?.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env?.SPOTIFY_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    return {
      matchStatus: "not_configured",
      embedUrl: "",
      openUrl: "",
      searchUrl,
      title: "",
      artist: "",
      album: "",
      artworkUrl: ""
    };
  }

  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-match", safeArtist, safeTrack],
    freshTtlSec: SPOTIFY_TRACK_MATCH_FRESH_TTL_SEC,
    retainTtlSec: SPOTIFY_TRACK_MATCH_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const accessToken = await loadSpotifyAccessToken(clientId, clientSecret, nowMs);
      if (!accessToken) {
        throw new Error("Spotify access token unavailable");
      }
      const endpoint = new URL(SPOTIFY_SEARCH_URL);
      endpoint.searchParams.set("q", buildSpotifySearchQuery(safeTrack, safeArtist));
      endpoint.searchParams.set("type", "track");
      endpoint.searchParams.set("limit", "5");
      const response = await fetchWithTimeout(endpoint.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }, 10_000);
      if (!response.ok) {
        throw new Error(`Spotify search request failed (${response.status})`);
      }
      const payload = await response.json();
      const items = Array.isArray(payload?.tracks?.items) ? payload.tracks.items : [];
      if (!items.length) {
        return {
          matchStatus: "unmatched",
          embedUrl: "",
          openUrl: "",
          searchUrl,
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        };
      }
      const normalizedTrack = normalizeMatchText(safeTrack);
      const normalizedArtist = normalizeMatchText(safeArtist);
      const normalizedAlbum = normalizeMatchText(safeAlbum);
      const scored = items.map((candidate) => ({
        candidate,
        score: scoreSpotifyCandidate(candidate, normalizedTrack, normalizedArtist, normalizedAlbum)
      })).sort((left, right) => right.score - left.score);
      const best = scored[0] || null;
      if (!best || best.score < 5) {
        return {
          matchStatus: "unmatched",
          embedUrl: "",
          openUrl: "",
          searchUrl,
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        };
      }
      return formatSpotifyMatch(best.candidate, searchUrl);
    }
  });

  if (!cachedValue || typeof cachedValue !== "object") {
    return {
      matchStatus: "unavailable",
      embedUrl: "",
      openUrl: "",
      searchUrl,
      title: "",
      artist: "",
      album: "",
      artworkUrl: ""
    };
  }

  return {
    matchStatus: String(cachedValue.matchStatus || "unavailable"),
    embedUrl: String(cachedValue.embedUrl || "").trim(),
    openUrl: String(cachedValue.openUrl || "").trim(),
    searchUrl: String(cachedValue.searchUrl || searchUrl).trim() || searchUrl,
    title: String(cachedValue.title || "").trim(),
    artist: String(cachedValue.artist || "").trim(),
    album: String(cachedValue.album || "").trim(),
    artworkUrl: String(cachedValue.artworkUrl || "").trim()
  };
}
