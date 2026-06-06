import {
  LASTFM_API_BASE,
  LASTFM_SIMILAR_TRACKS_FRESH_TTL_SEC,
  LASTFM_SIMILAR_TRACKS_RETAIN_TTL_SEC,
  LASTFM_SECONDARY_TIMEOUT_MS,
  LASTFM_TIMEOUT_MS,
  LASTFM_TOP_TRACKS_FRESH_TTL_SEC,
  LASTFM_TOP_TRACKS_RETAIN_TTL_SEC,
  LASTFM_TRACK_INFO_FRESH_TTL_SEC,
  LASTFM_TRACK_INFO_RETAIN_TTL_SEC,
  LASTFM_TRACK_TAGS_FRESH_TTL_SEC,
  LASTFM_TRACK_TAGS_RETAIN_TTL_SEC,
  LASTFM_USER
} from "./config.js";
import { readCachedPayload, writeCachedPayload } from "./cache.js";
import { fetchWithTimeout, throwIfAborted } from "./response.js";

const LASTFM_GENERIC_IMAGE_TOKEN = "2a96cbd8b46e442fc41c2b86b821562f";
const DEEZER_ARTIST_SEARCH_BASE = "https://api.deezer.com/search/artist";
const LASTFM_INTERNAL_CACHE_BASE = "https://internet-angel.internal/__lastfm";

export function normalizeArtistSearchName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

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

function getSecondaryFetchOptions(options = {}) {
  return {
    signal: options?.signal,
    timeoutMs: options?.secondaryTimeoutMs ?? LASTFM_SECONDARY_TIMEOUT_MS
  };
}

export async function fetchLastFmJson(method, apiKey, extraParams = {}, options = {}) {
  const fetchOptions = typeof options === "number" ? { timeoutMs: options } : (options || {});
  throwIfAborted(fetchOptions.signal);
  const response = await fetchWithTimeout(buildLastFmEndpoint(method, apiKey, extraParams), {
    method: "GET",
    signal: fetchOptions.signal,
    headers: {
      Accept: "application/json"
    }
  }, fetchOptions.timeoutMs ?? LASTFM_TIMEOUT_MS);

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

export function upscaleLastFmImageUrl(url) {
  const source = String(url || "").trim();
  if (!source) {
    return "";
  }
  try {
    const parsed = new URL(source);
    parsed.pathname = parsed.pathname.replace(/\/i\/u\/avatar\d+s\//i, "/i/u/avatar300s/");
    parsed.pathname = parsed.pathname.replace(/\/i\/u\/\d+s\//i, "/i/u/770x0/");
    parsed.pathname = parsed.pathname.replace(/\/i\/u\/\d+x\d+\//i, "/i/u/770x0/");
    parsed.pathname = parsed.pathname.replace(/\/i\/u\/\d+x0\//i, "/i/u/770x0/");
    return parsed.toString();
  } catch {
    return source;
  }
}

export function collectLastFmImageUrls(images, fallback = "") {
  const list = Array.isArray(images) ? images : [];
  const candidates = [];
  const seen = new Set();
  const register = (value) => {
    const candidate = upscaleLastFmImageUrl(String(value || "").trim());
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };
  const sizePriority = ["mega", "extralarge", "large", "medium", "small"];
  for (const size of sizePriority) {
    const match = list.find((entry) => String(entry?.size || "").trim().toLowerCase() === size);
    register(match?.["#text"] || match?.url);
  }
  for (const entry of list) {
    register(entry?.["#text"] || entry?.url);
  }
  register(fallback);
  return candidates;
}

export function pickLastFmImageUrl(images) {
  return collectLastFmImageUrls(images)[0] || "";
}

export function isLastFmGenericImageUrl(url) {
  return String(url || "").includes(LASTFM_GENERIC_IMAGE_TOKEN);
}

export async function findArtistPhotoUrlViaDeezer(artistName, options = {}) {
  const query = String(artistName || "").trim();
  if (!query) {
    return "";
  }
  throwIfAborted(options?.signal);
  const endpoint = new URL(DEEZER_ARTIST_SEARCH_BASE);
  endpoint.searchParams.set("q", query);
  const response = await fetchWithTimeout(endpoint.toString(), {
    method: "GET",
    signal: options?.signal,
    headers: {
      Accept: "application/json"
    }
  }, options?.timeoutMs ?? LASTFM_SECONDARY_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Deezer upstream failed (${response.status})`);
  }
  const payload = await response.json();
  const candidates = Array.isArray(payload?.data) ? payload.data : [];
  if (!candidates.length) {
    return "";
  }
  const normalizedQuery = normalizeArtistSearchName(query);
  const exactMatch = candidates.find((entry) => normalizeArtistSearchName(entry?.name) === normalizedQuery) || null;
  const closeMatch = exactMatch || candidates.find((entry) => {
    const normalizedCandidate = normalizeArtistSearchName(entry?.name);
    return normalizedCandidate && (
      normalizedCandidate.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedCandidate)
    );
  }) || null;
  const match = closeMatch || candidates[0] || null;
  return String(
    match?.picture_xl ||
    match?.picture_big ||
    match?.picture_medium ||
    match?.picture ||
    ""
  ).trim();
}

function toLastFmTrackArray(section) {
  const rawTrack = section?.track;
  if (Array.isArray(rawTrack)) {
    return rawTrack;
  }
  return rawTrack ? [rawTrack] : [];
}

function toLastFmList(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

export function normalizeTrackKey(artist, title) {
  const safeArtist = String(artist || "").trim().toLowerCase();
  const safeTitle = String(title || "").trim().toLowerCase();
  if (!safeArtist || !safeTitle) {
    return "";
  }
  return `${safeArtist}::${safeTitle}`;
}

export function getTrackArtistName(trackEntry) {
  return String(trackEntry?.artist?.name || trackEntry?.artist?.["#text"] || trackEntry?.artist || "").trim();
}

export function getTrackTitle(trackEntry) {
  return String(trackEntry?.name || "").trim();
}

function parseTrackUserLoved(trackEntry) {
  const value = String(trackEntry?.userloved ?? "").trim();
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

function buildInternalCacheRequest(parts) {
  const safeParts = (Array.isArray(parts) ? parts : [parts]).map((part) => encodeURIComponent(String(part || "").trim().toLowerCase()));
  return new Request(`${LASTFM_INTERNAL_CACHE_BASE}/${safeParts.join("/")}`, { method: "GET" });
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

function buildTopTracksIndex(topTracksSection) {
  const tracks = toLastFmList(topTracksSection?.track);
  const index = new Map();
  for (const trackEntry of tracks) {
    const trackTitle = getTrackTitle(trackEntry);
    const artistName = getTrackArtistName(trackEntry);
    const key = normalizeTrackKey(artistName, trackTitle);
    if (!key || index.has(key)) {
      continue;
    }
    const rankText = String(trackEntry?.["@attr"]?.rank || "").trim();
    const rank = Number.parseInt(rankText, 10);
    index.set(key, {
      monthlyTopRank: Number.isFinite(rank) ? rank : null,
      monthlyTopPlaycount: String(trackEntry?.playcount || "").trim() || null
    });
  }
  return index;
}

function enrichRecentTracksWithMonthlyContext(recenttracksSection, topTracksSection) {
  const rawTrack = recenttracksSection?.track;
  const tracks = toLastFmTrackArray(recenttracksSection);
  if (!tracks.length) {
    return recenttracksSection;
  }

  const topTracksIndex = buildTopTracksIndex(topTracksSection);
  const enrichedTracks = tracks.map((trackEntry) => {
    const match = topTracksIndex.get(normalizeTrackKey(getTrackArtistName(trackEntry), getTrackTitle(trackEntry))) || null;
    return {
      ...trackEntry,
      monthlyTopRank: match?.monthlyTopRank ?? null,
      monthlyTopPlaycount: match?.monthlyTopPlaycount ?? null
    };
  });

  return {
    ...recenttracksSection,
    track: Array.isArray(rawTrack) ? enrichedTracks : enrichedTracks[0] || {}
  };
}

async function loadTrackLovedStateFallback(apiKey, trackEntry, nowMs = Date.now(), options = {}) {
  const artist = getTrackArtistName(trackEntry);
  const title = getTrackTitle(trackEntry);
  if (!artist || !title) {
    return false;
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-info", artist, title],
    freshTtlSec: LASTFM_TRACK_INFO_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_TRACK_INFO_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("track.getInfo", apiKey, {
        artist,
        track: title,
        username: LASTFM_USER,
        autocorrect: 1
      }, getSecondaryFetchOptions(options));
      return String(payload?.track?.userloved || "").trim() === "1";
    }
  });
  return cachedValue === true;
}

async function enrichRecentTracksWithLovedState(recenttracksSection, apiKey, nowMs = Date.now(), options = {}) {
  const rawTrack = recenttracksSection?.track;
  const tracks = toLastFmTrackArray(recenttracksSection);
  if (!tracks.length) {
    return recenttracksSection;
  }

  const enrichedTracks = await Promise.all(
    tracks.map(async (trackEntry) => {
      const directLovedState = parseTrackUserLoved(trackEntry);
      const isLoved = directLovedState !== null
        ? directLovedState
        : await loadTrackLovedStateFallback(apiKey, trackEntry, nowMs, options);
      return {
        ...trackEntry,
        userloved: directLovedState !== null ? (directLovedState ? "1" : "0") : (isLoved ? "1" : "0"),
        isLoved
      };
    })
  );

  return {
    ...recenttracksSection,
    track: Array.isArray(rawTrack) ? enrichedTracks : enrichedTracks[0] || {}
  };
}

function pickReferenceTrack(recenttracksSection) {
  const tracks = toLastFmTrackArray(recenttracksSection);
  if (!tracks.length) {
    return null;
  }
  return tracks.find((trackEntry) => trackEntry?.["@attr"]?.nowplaying === "true") || tracks[0] || null;
}

async function loadTopTracksSection(apiKey, nowMs = Date.now(), options = {}) {
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["top-tracks", LASTFM_USER, "1month", "12"],
    freshTtlSec: LASTFM_TOP_TRACKS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_TOP_TRACKS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("user.gettoptracks", apiKey, {
        period: "1month",
        limit: 12
      }, getSecondaryFetchOptions(options));
      return payload?.toptracks && typeof payload.toptracks === "object" ? payload.toptracks : { track: [] };
    }
  });
  return cachedValue && typeof cachedValue === "object" ? cachedValue : { track: [] };
}

async function loadReferenceTrackSimilar(apiKey, referenceTrack, nowMs = Date.now(), options = {}) {
  const artist = getTrackArtistName(referenceTrack);
  const title = getTrackTitle(referenceTrack);
  if (!artist || !title) {
    return [];
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["similar-tracks", artist, title],
    freshTtlSec: LASTFM_SIMILAR_TRACKS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_SIMILAR_TRACKS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("track.getsimilar", apiKey, {
        artist,
        track: title,
        autocorrect: 1,
        limit: 3
      }, getSecondaryFetchOptions(options));
      const similarTracks = toLastFmList(payload?.similartracks?.track);
      return similarTracks.slice(0, 3).map((trackEntry) => ({
        title: String(trackEntry?.name || "").trim(),
        artist: String(trackEntry?.artist?.name || trackEntry?.artist || "").trim(),
        url: String(trackEntry?.url || "").trim(),
        match: Number.isFinite(Number(trackEntry?.match)) ? Number(trackEntry.match) : null
      })).filter((entry) => entry.title && entry.artist);
    }
  });
  return Array.isArray(cachedValue) ? cachedValue : [];
}

async function loadReferenceTrackTopTags(apiKey, referenceTrack, nowMs = Date.now(), options = {}) {
  const artist = getTrackArtistName(referenceTrack);
  const title = getTrackTitle(referenceTrack);
  if (!artist || !title) {
    return [];
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-tags", artist, title],
    freshTtlSec: LASTFM_TRACK_TAGS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_TRACK_TAGS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("track.gettoptags", apiKey, {
        artist,
        track: title,
        autocorrect: 1
      }, getSecondaryFetchOptions(options));
      const tags = toLastFmList(payload?.toptags?.tag);
      return tags.slice(0, 3).map((tagEntry) => ({
        name: String(tagEntry?.name || "").trim(),
        url: String(tagEntry?.url || "").trim()
      })).filter((entry) => entry.name);
    }
  });
  return Array.isArray(cachedValue) ? cachedValue : [];
}

async function buildReferenceTrackDiscovery(apiKey, recenttracksSection, nowMs = Date.now(), options = {}) {
  const referenceTrack = pickReferenceTrack(recenttracksSection);
  if (!referenceTrack) {
    return { referenceTrack: null };
  }

  const [similarTracks, topTags] = await Promise.all([
    loadReferenceTrackSimilar(apiKey, referenceTrack, nowMs, options),
    loadReferenceTrackTopTags(apiKey, referenceTrack, nowMs, options)
  ]);

  return {
    referenceTrack: {
      title: getTrackTitle(referenceTrack),
      artist: getTrackArtistName(referenceTrack),
      similarTracks,
      topTags
    }
  };
}

export function normalizeLastFmNowPlayingPayload(upstreamPayload, nowMs = Date.now()) {
  const rawTrack = upstreamPayload?.recenttracks?.track;
  const track = Array.isArray(rawTrack) ? rawTrack[0] : rawTrack || null;
  const nowPlaying = track?.["@attr"]?.nowplaying === "true";
  const parsedMonthlyRank = Number.parseInt(String(track?.monthlyTopRank ?? "").trim(), 10);
  return {
    nowPlaying,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    track: nowPlaying ? {
      title: getTrackTitle(track),
      artist: getTrackArtistName(track),
      album: String(track?.album?.["#text"] || "").trim(),
      artworkUrl: pickLastFmImageUrl(track?.image),
      url: String(track?.url || "").trim(),
      isLoved: track?.isLoved === true || String(track?.userloved || "").trim() === "1",
      monthlyTopRank: Number.isFinite(parsedMonthlyRank) ? parsedMonthlyRank : null,
      monthlyTopPlaycount: String(track?.monthlyTopPlaycount || "").trim() || null
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
    toptracks: { track: [] },
    user: {},
    lovedtracks: { "@attr": { total: "0" } },
    discovery: {
      referenceTrack: null
    },
    nowPlaying: {
      nowPlaying: false,
      stale: false,
      fetchedAt: new Date(nowMs).toISOString(),
      track: null
    }
  };
}

async function enrichTopArtistsWithArtistPhotos(topartistsSection, options = {}) {
  const rawArtists = topartistsSection?.artist;
  const artists = Array.isArray(rawArtists) ? rawArtists : rawArtists ? [rawArtists] : [];
  if (!artists.length) {
    return topartistsSection;
  }
  const artistPhotoResults = await Promise.allSettled(
    artists.map(async (artistEntry) => {
      const existingImageUrl = pickLastFmImageUrl(artistEntry?.image);
      if (existingImageUrl && !isLastFmGenericImageUrl(existingImageUrl)) {
        return "";
      }
      return await findArtistPhotoUrlViaDeezer(artistEntry?.name, getSecondaryFetchOptions(options));
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

export async function fetchLastFmPayload(apiKey, nowMs = Date.now(), options = {}) {
  throwIfAborted(options?.signal);
  const settled = await Promise.allSettled([
    fetchLastFmJson("user.getrecenttracks", apiKey, { limit: 10, extended: 1 }, { signal: options?.signal }),
    fetchLastFmJson("user.gettopartists", apiKey, { period: "1month", limit: 8 }, { signal: options?.signal }),
    fetchLastFmJson("user.gettopalbums", apiKey, { period: "1month", limit: 8 }, { signal: options?.signal }),
    fetchLastFmJson("user.getinfo", apiKey, {}, { signal: options?.signal }),
    fetchLastFmJson("user.getlovedtracks", apiKey, { limit: 1 }, { signal: options?.signal })
  ]);

  const fulfilledCount = settled.filter((entry) => entry.status === "fulfilled").length;
  if (!fulfilledCount) {
    throwIfAborted(options?.signal, "Last.fm route timed out");
    throw new Error("Last.fm upstream unavailable");
  }

  const [
    recenttracksResult,
    topartistsResult,
    topalbumsResult,
    userInfoResult,
    lovedtracksResult
  ] = settled;

  const topTracksSection = await loadTopTracksSection(apiKey, nowMs, options);
  const rawRecentTracksSection = pickSettledSection(recenttracksResult, "recenttracks", { track: [] });
  const lovedRecentTracksSection = recenttracksResult.status === "fulfilled"
    ? await enrichRecentTracksWithLovedState(rawRecentTracksSection, apiKey, nowMs, options)
    : rawRecentTracksSection;
  const recentTracksSection = recenttracksResult.status === "fulfilled"
    ? enrichRecentTracksWithMonthlyContext(lovedRecentTracksSection, topTracksSection)
    : lovedRecentTracksSection;
  const topArtistsSection = pickSettledSection(topartistsResult, "topartists", { artist: [] });
  const enrichedTopArtistsSection = topartistsResult.status === "fulfilled"
    ? await enrichTopArtistsWithArtistPhotos(topArtistsSection, options)
    : topArtistsSection;
  const discovery = recenttracksResult.status === "fulfilled"
    ? await buildReferenceTrackDiscovery(apiKey, recentTracksSection, nowMs, options)
    : { referenceTrack: null };

  return {
    sourceStatus: fulfilledCount === settled.length ? "OK" : "PARTIAL",
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    recenttracks: recentTracksSection,
    topartists: enrichedTopArtistsSection,
    topalbums: pickSettledSection(topalbumsResult, "topalbums", { album: [] }),
    toptracks: topTracksSection,
    user: pickSettledSection(userInfoResult, "user", {}),
    lovedtracks: pickSettledSection(lovedtracksResult, "lovedtracks", { "@attr": { total: "0" } }),
    discovery,
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
