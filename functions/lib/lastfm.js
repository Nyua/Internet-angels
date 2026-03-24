import {
  LASTFM_API_BASE,
  LASTFM_TIMEOUT_MS,
  LASTFM_USER
} from "./config.js";
import { fetchWithTimeout } from "./response.js";

const LASTFM_GENERIC_IMAGE_TOKEN = "2a96cbd8b46e442fc41c2b86b821562f";
const DEEZER_ARTIST_SEARCH_BASE = "https://api.deezer.com/search/artist";

export function buildLastFmEndpoint(method, apiKey, extraParams = {}) {
  const endpoint = new URL(LASTFM_API_BASE);
  endpoint.searchParams.set("method", method);
  endpoint.searchParams.set("api_key", apiKey);
  endpoint.searchParams.set("format", "json");
  const hasCustomUser = Object.prototype.hasOwnProperty.call(extraParams, "user");
  if (method.startsWith("user.") || hasCustomUser) {
    endpoint.searchParams.set("user", String(hasCustomUser ? extraParams.user : LASTFM_USER));
  }
  for (const [key, value] of Object.entries(extraParams)) {
    if (key === "user") continue;
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

function isLastFmGenericImageUrl(url) {
  return String(url || "").includes(LASTFM_GENERIC_IMAGE_TOKEN);
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

async function enrichTopArtistsWithArtistPhotos(topartistsSection) {
  const rawArtists = topartistsSection?.artist;
  const artists = Array.isArray(rawArtists) ? rawArtists : rawArtists ? [rawArtists] : [];
  if (!artists.length) {
    return topartistsSection;
  }

  const normalizeArtistName = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const fetchArtistPhotoFromDeezer = async (artistName) => {
    const query = String(artistName || "").trim();
    if (!query) {
      return "";
    }
    const endpoint = new URL(DEEZER_ARTIST_SEARCH_BASE);
    endpoint.searchParams.set("q", query);
    const response = await fetchWithTimeout(endpoint.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }, LASTFM_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`Deezer upstream failed (${response.status})`);
    }
    const payload = await response.json();
    const candidates = Array.isArray(payload?.data) ? payload.data : [];
    if (!candidates.length) {
      return "";
    }
    const normalizedQuery = normalizeArtistName(query);
    const exactMatch = candidates.find((entry) => normalizeArtistName(entry?.name) === normalizedQuery) || null;
    const closeMatch = exactMatch || candidates.find((entry) => {
      const normalizedCandidate = normalizeArtistName(entry?.name);
      return normalizedCandidate && (
        normalizedCandidate.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedCandidate)
      );
    }) || null;
    const match = closeMatch || candidates[0] || null;
    return String(
      match?.picture_big ||
      match?.picture_medium ||
      match?.picture_xl ||
      match?.picture ||
      ""
    ).trim();
  };
  const artistPhotoResults = await Promise.allSettled(
    artists.map(async (artistEntry) => {
      const existingImageUrl = pickLastFmImageUrl(artistEntry?.image);
      if (existingImageUrl && !isLastFmGenericImageUrl(existingImageUrl)) {
        return "";
      }
      return await fetchArtistPhotoFromDeezer(artistEntry?.name);
    })
  );

  const enrichedArtists = artists.map((artistEntry, index) => {
    const photoResult = artistPhotoResults[index];
    const artistPhotoUrl = photoResult?.status === "fulfilled" ? String(photoResult.value || "").trim() : "";
    if (!artistPhotoUrl) {
      return artistEntry;
    }
    return {
      ...artistEntry,
      artistPhotoUrl
    };
  });

  return {
    ...topartistsSection,
    artist: Array.isArray(rawArtists) ? enrichedArtists : enrichedArtists[0] || {}
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
  const topArtistsSection = pickSettledSection(topartistsResult, "topartists", { artist: [] });
  const enrichedTopArtistsSection = topartistsResult.status === "fulfilled"
    ? await enrichTopArtistsWithArtistPhotos(topArtistsSection)
    : topArtistsSection;

  return {
    sourceStatus: fulfilledCount === settled.length ? "OK" : "PARTIAL",
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    recenttracks: recentTracksSection,
    topartists: enrichedTopArtistsSection,
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
