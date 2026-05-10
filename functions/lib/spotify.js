import {
  SPOTIFY_CREDENTIALLESS_FETCH_TIMEOUT_MS,
  SPOTIFY_CREDENTIALLESS_LOOKUP_TIMEOUT_MS,
  SPOTIFY_TOKEN_FRESH_TTL_SEC,
  SPOTIFY_TOKEN_RETAIN_TTL_SEC,
  SPOTIFY_TRACK_MATCH_FRESH_TTL_SEC,
  SPOTIFY_TRACK_MATCH_RETAIN_TTL_SEC
} from "./config.js";
import { readCachedPayload, writeCachedPayload } from "./cache.js";
import { fetchWithTimeout, throwIfAborted } from "./response.js";

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_SEARCH_URL = "https://api.spotify.com/v1/search";
const SPOTIFY_OEMBED_URL = "https://open.spotify.com/oembed";
const CREDENTIALLESS_SEARCH_URL = "https://r.jina.ai/http://r.jina.ai/http://au.search.yahoo.com/search";
const SPOTIFY_INTERNAL_CACHE_BASE = "https://internet-angel.internal/__spotify";
const SPOTIFY_CREDENTIALLESS_CACHE_VERSION = "v2";

function buildInternalCacheRequest(parts) {
  const safeParts = (Array.isArray(parts) ? parts : [parts]).map((part) => encodeURIComponent(String(part || "").trim().toLowerCase()));
  return new Request(`${SPOTIFY_INTERNAL_CACHE_BASE}/${safeParts.join("/")}`, { method: "GET" });
}

function remainingBudgetMs(deadlineMs, maxTimeoutMs = SPOTIFY_CREDENTIALLESS_FETCH_TIMEOUT_MS) {
  const remainingMs = Math.max(0, Number(deadlineMs) - Date.now());
  return Math.max(0, Math.min(Math.max(1, Number(maxTimeoutMs) || 1), remainingMs));
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

function buildCredentiallessSearchQueries(trackTitle, artistName, albumName = "") {
  const safeTrack = String(trackTitle || "").trim();
  const safeArtist = String(artistName || "").trim();
  const safeAlbum = String(albumName || "").trim();
  const queries = [
    ["site:open.spotify.com/track", safeTrack, safeArtist, safeAlbum, "Spotify"],
    ["site:open.spotify.com/track", safeTrack, safeArtist, "Spotify"],
    ["site:open.spotify.com/track", safeTrack, safeAlbum, "Spotify"],
    ["site:open.spotify.com/track", safeTrack, "Spotify"]
  ].map((parts) => parts.filter(Boolean).join(" "));
  return Array.from(new Set(queries.filter(Boolean)));
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

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function stripSearchResultHtml(value) {
  return decodeHtmlEntities(String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function extractSpotifyTrackIdFromText(value) {
  const normalized = decodeHtmlEntities(String(value || ""));
  const decodedCandidates = new Set([normalized]);
  try {
    decodedCandidates.add(decodeURIComponent(normalized));
  } catch {
  }
  for (const candidate of decodedCandidates) {
    const match = candidate.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/i);
    if (match?.[1]) return match[1];
  }
  return "";
}

function extractCredentiallessSpotifyCandidates(html) {
  const source = String(html || "");
  const candidates = new Map();
  const patterns = [
    /open\.spotify\.com\/track\/([A-Za-z0-9]+)/gi,
    /open\.spotify\.com%2Ftrack%2F([A-Za-z0-9]+)/gi,
    /open\.spotify\.com\\\/track\\\/([A-Za-z0-9]+)/gi
  ];
  for (const pattern of patterns) {
    let match = pattern.exec(source);
    while (match) {
      const trackId = String(match[1] || "").trim();
      if (trackId && !candidates.has(trackId)) {
        const contextStart = Math.max(0, match.index - 900);
        const contextEnd = Math.min(source.length, match.index + 900);
        candidates.set(trackId, {
          id: trackId,
          context: stripSearchResultHtml(source.slice(contextStart, contextEnd))
        });
      }
      match = pattern.exec(source);
    }
  }
  return Array.from(candidates.values()).slice(0, 8);
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

async function loadSpotifyAccessToken(clientId, clientSecret, nowMs = Date.now(), options = {}) {
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["token", "client-credentials"],
    freshTtlSec: SPOTIFY_TOKEN_FRESH_TTL_SEC,
    retainTtlSec: SPOTIFY_TOKEN_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const response = await fetchWithTimeout(SPOTIFY_ACCOUNTS_URL, {
        method: "POST",
        signal: options?.signal,
        headers: {
          Authorization: createBasicAuthHeader(clientId, clientSecret),
          "content-type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
      }, options?.timeoutMs ?? 10_000);
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
  const hasPreview = Boolean(String(candidate?.preview_url || "").trim());
  let score = 0;
  if (candidateTrack && candidateTrack === normalizedTrack) score += 5;
  if (primaryArtist && primaryArtist === normalizedArtist) score += 4;
  if (normalizedArtist && artistNames.includes(normalizedArtist)) score += 2;
  if (candidateTrack && normalizedTrack && (candidateTrack.includes(normalizedTrack) || normalizedTrack.includes(candidateTrack))) score += 1.5;
  if (primaryArtist && normalizedArtist && (primaryArtist.includes(normalizedArtist) || normalizedArtist.includes(primaryArtist))) score += 1;
  if (normalizedAlbum && albumName && albumName === normalizedAlbum) score += 1;
  if (hasPreview) score += 0.25;
  return score;
}

function formatSpotifyMatch(candidate, searchUrl) {
  const trackId = String(candidate?.id || "").trim();
  const artists = Array.isArray(candidate?.artists) ? candidate.artists.map((artist) => String(artist?.name || "").trim()).filter(Boolean) : [];
  const openUrl = String(candidate?.external_urls?.spotify || buildSpotifyTrackOpenUrl(trackId)).trim();
  const previewUrl = String(candidate?.preview_url || "").trim();
  return {
    matchStatus: "matched",
    embedUrl: buildSpotifyTrackEmbedUrl(trackId),
    openUrl,
    searchUrl,
    title: String(candidate?.name || "").trim(),
    artist: artists.join(", "),
    album: String(candidate?.album?.name || "").trim(),
    artworkUrl: pickSpotifyImageUrl(candidate?.album?.images),
    previewUrl
  };
}

function formatCredentiallessSpotifyMatch(candidate, oembed, searchUrl, fallbackArtist, fallbackAlbum) {
  const trackId = String(candidate?.id || extractSpotifyTrackIdFromText(oembed?.iframe_url)).trim();
  return {
    matchStatus: "matched",
    embedUrl: String(oembed?.iframe_url || buildSpotifyTrackEmbedUrl(trackId)).trim(),
    openUrl: buildSpotifyTrackOpenUrl(trackId),
    searchUrl,
    title: String(oembed?.title || "").trim(),
    artist: String(fallbackArtist || "").trim(),
    album: String(fallbackAlbum || "").trim(),
    artworkUrl: String(oembed?.thumbnail_url || "").trim(),
    previewUrl: ""
  };
}

function scoreCredentiallessSpotifyCandidate(candidate, oembed, normalizedTrack, normalizedArtist, normalizedAlbum) {
  const candidateTitle = normalizeMatchText(oembed?.title);
  const candidateContext = normalizeMatchText(candidate?.context);
  let score = 0;
  if (candidateTitle && candidateTitle === normalizedTrack) score += 5;
  if (candidateTitle && normalizedTrack && (candidateTitle.includes(normalizedTrack) || normalizedTrack.includes(candidateTitle))) score += 1.5;
  if (normalizedArtist && candidateContext.includes(normalizedArtist)) score += 3;
  if (normalizedAlbum && candidateContext.includes(normalizedAlbum)) score += 1;
  if (normalizedTrack && candidateContext.includes(normalizedTrack)) score += 1;
  return score;
}

async function loadSpotifyOEmbed(trackId, options = {}) {
  const safeTrackId = String(trackId || "").trim();
  if (!safeTrackId) return null;
  throwIfAborted(options?.signal);
  const endpoint = new URL(SPOTIFY_OEMBED_URL);
  endpoint.searchParams.set("url", buildSpotifyTrackOpenUrl(safeTrackId));
  const response = await fetchWithTimeout(endpoint.toString(), {
    method: "GET",
    signal: options?.signal,
    headers: {
      Accept: "application/json"
    }
  }, options?.timeoutMs ?? SPOTIFY_CREDENTIALLESS_FETCH_TIMEOUT_MS);
  if (!response.ok) return null;
  return response.json();
}

async function findCredentiallessSpotifyTrackMatch({
  artist,
  track,
  album = "",
  nowMs = Date.now(),
  signal,
  credentiallessBudgetMs = SPOTIFY_CREDENTIALLESS_LOOKUP_TIMEOUT_MS
}) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  const safeAlbum = String(album || "").trim();
  const searchUrl = buildSpotifyTrackSearchUrl(safeTrack, safeArtist);
  if (!safeArtist || !safeTrack) {
    return {
      matchStatus: "unmatched",
      embedUrl: "",
      openUrl: "",
      searchUrl,
      title: "",
      artist: "",
      album: "",
      artworkUrl: "",
      previewUrl: ""
    };
  }

  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-match-public", SPOTIFY_CREDENTIALLESS_CACHE_VERSION, safeArtist, safeTrack, safeAlbum],
    freshTtlSec: SPOTIFY_TRACK_MATCH_FRESH_TTL_SEC,
    retainTtlSec: SPOTIFY_TRACK_MATCH_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      throwIfAborted(signal);
      const normalizedTrack = normalizeMatchText(safeTrack);
      const normalizedArtist = normalizeMatchText(safeArtist);
      const normalizedAlbum = normalizeMatchText(safeAlbum);
      const deadlineMs = Date.now() + Math.max(250, Number(credentiallessBudgetMs) || SPOTIFY_CREDENTIALLESS_LOOKUP_TIMEOUT_MS);
      const scored = [];
      const seenCandidateIds = new Set();
      for (const searchQuery of buildCredentiallessSearchQueries(safeTrack, safeArtist, safeAlbum)) {
        throwIfAborted(signal);
        const searchTimeoutMs = remainingBudgetMs(deadlineMs);
        if (searchTimeoutMs <= 0) break;
        const endpoint = new URL(CREDENTIALLESS_SEARCH_URL);
        endpoint.searchParams.set("p", searchQuery);
        endpoint.searchParams.set("ei", "UTF-8");
        const response = await fetchWithTimeout(endpoint.toString(), {
          method: "GET",
          signal,
          headers: {
            Accept: "text/plain,text/html,application/xhtml+xml",
            "User-Agent": "Mozilla/5.0"
          }
        }, searchTimeoutMs);
        if (!response.ok) continue;
        const html = await response.text();
        const candidates = extractCredentiallessSpotifyCandidates(html)
          .filter((candidate) => {
            if (seenCandidateIds.has(candidate.id)) return false;
            seenCandidateIds.add(candidate.id);
            return true;
          })
          .slice(0, 3);
        const oembedResults = await Promise.allSettled(candidates.map(async (candidate) => {
          const oembedTimeoutMs = remainingBudgetMs(deadlineMs);
          if (oembedTimeoutMs <= 0) {
            return null;
          }
          const oembed = await loadSpotifyOEmbed(candidate.id, {
            signal,
            timeoutMs: oembedTimeoutMs
          });
          return { candidate, oembed };
        }));
        for (const result of oembedResults) {
          const candidate = result.status === "fulfilled" ? result.value?.candidate : null;
          const oembed = result.status === "fulfilled" ? result.value?.oembed : null;
          if (!oembed?.iframe_url) continue;
          scored.push({
            candidate,
            oembed,
            score: scoreCredentiallessSpotifyCandidate(candidate, oembed, normalizedTrack, normalizedArtist, normalizedAlbum)
          });
        }
        scored.sort((left, right) => right.score - left.score);
        if (scored[0]?.score >= 8) {
          break;
        }
      }
      scored.sort((left, right) => right.score - left.score);
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
          artworkUrl: "",
          previewUrl: ""
        };
      }
      return formatCredentiallessSpotifyMatch(best.candidate, best.oembed, searchUrl, safeArtist, safeAlbum);
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
      artworkUrl: "",
      previewUrl: ""
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
    artworkUrl: String(cachedValue.artworkUrl || "").trim(),
    previewUrl: String(cachedValue.previewUrl || "").trim()
  };
}

export async function findSpotifyTrackMatch({
  artist,
  track,
  album = "",
  env,
  nowMs = Date.now(),
  signal,
  credentiallessBudgetMs
}) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  const safeAlbum = String(album || "").trim();
  const searchUrl = buildSpotifyTrackSearchUrl(safeTrack, safeArtist);
  const clientId = String(env?.SPOTIFY_CLIENT_ID || "").trim();
  const clientSecret = String(env?.SPOTIFY_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    return findCredentiallessSpotifyTrackMatch({ artist: safeArtist, track: safeTrack, album: safeAlbum, nowMs, signal, credentiallessBudgetMs });
  }

  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-match", safeArtist, safeTrack],
    freshTtlSec: SPOTIFY_TRACK_MATCH_FRESH_TTL_SEC,
    retainTtlSec: SPOTIFY_TRACK_MATCH_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      throwIfAborted(signal);
      const accessToken = await loadSpotifyAccessToken(clientId, clientSecret, nowMs, { signal });
      if (!accessToken) {
        throw new Error("Spotify access token unavailable");
      }
      const endpoint = new URL(SPOTIFY_SEARCH_URL);
      endpoint.searchParams.set("q", buildSpotifySearchQuery(safeTrack, safeArtist));
      endpoint.searchParams.set("type", "track");
      endpoint.searchParams.set("limit", "5");
      const response = await fetchWithTimeout(endpoint.toString(), {
        method: "GET",
        signal,
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
          artworkUrl: "",
          previewUrl: ""
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
          artworkUrl: "",
          previewUrl: ""
        };
      }
      return formatSpotifyMatch(best.candidate, searchUrl);
    }
  });

  if (!cachedValue || typeof cachedValue !== "object" || String(cachedValue.matchStatus || "") !== "matched") {
    return findCredentiallessSpotifyTrackMatch({ artist: safeArtist, track: safeTrack, album: safeAlbum, nowMs, signal, credentiallessBudgetMs });
  }

  return {
    matchStatus: String(cachedValue.matchStatus || "unavailable"),
    embedUrl: String(cachedValue.embedUrl || "").trim(),
    openUrl: String(cachedValue.openUrl || "").trim(),
    searchUrl: String(cachedValue.searchUrl || searchUrl).trim() || searchUrl,
    title: String(cachedValue.title || "").trim(),
    artist: String(cachedValue.artist || "").trim(),
    album: String(cachedValue.album || "").trim(),
    artworkUrl: String(cachedValue.artworkUrl || "").trim(),
    previewUrl: String(cachedValue.previewUrl || "").trim()
  };
}
