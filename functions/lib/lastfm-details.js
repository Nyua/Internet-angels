import {
  LASTFM_ARTIST_TOP_TRACKS_FRESH_TTL_SEC,
  LASTFM_ARTIST_TOP_TRACKS_RETAIN_TTL_SEC,
  LASTFM_TRACK_DETAILS_CORE_FRESH_TTL_SEC,
  LASTFM_TRACK_DETAILS_CORE_RETAIN_TTL_SEC,
  LASTFM_TRACK_INFO_FRESH_TTL_SEC,
  LASTFM_TRACK_INFO_RETAIN_TTL_SEC,
  LASTFM_TRACK_SCROBBLES_FRESH_TTL_SEC,
  LASTFM_TRACK_SCROBBLES_RETAIN_TTL_SEC,
  LASTFM_TRACK_TAGS_FRESH_TTL_SEC,
  LASTFM_TRACK_TAGS_RETAIN_TTL_SEC,
  LASTFM_USER
} from "./config.js";
import { readCachedPayload, writeCachedPayload } from "./cache.js";
import {
  fetchLastFmJson,
  getTrackArtistName,
  getTrackTitle,
  normalizeTrackKey,
  pickLastFmImageUrl
} from "./lastfm.js";
import { findSpotifyTrackMatch } from "./spotify.js";

const LASTFM_INTERNAL_CACHE_BASE = "https://internet-angel.internal/__lastfm-details";

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

function toList(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDurationLabel(durationMs) {
  const safeMs = Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0;
  if (!safeMs || safeMs < 1000) return "";
  const totalSeconds = Math.max(0, Math.round(safeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<a\b[^>]*>.*?<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*Read more on Last\.fm\s*$/i, "")
    .trim();
}

function getTrackAlbumName(trackEntry) {
  return String(trackEntry?.album?.title || trackEntry?.album?.["#text"] || "").trim();
}

function getTrackUrl(trackEntry) {
  return String(trackEntry?.url || "").trim();
}

function getArtistUrl(trackEntry) {
  return String(trackEntry?.artist?.url || "").trim();
}

function parseUserLoved(value) {
  const loved = String(value ?? "").trim();
  if (loved === "1") return true;
  if (loved === "0") return false;
  return false;
}

function normalizeTrackInfoPayload(payload) {
  const track = payload?.track;
  if (!track || typeof track !== "object") {
    return null;
  }
  return track;
}

async function loadTrackInfo(apiKey, artist, track, nowMs = Date.now(), options = {}) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  if (!safeArtist || !safeTrack) {
    return null;
  }
  const cachePrefix = String(options.cachePrefix || "track-core").trim() || "track-core";
  const cachedValue = await loadCachedValue({
    cacheKeyParts: [cachePrefix, safeArtist, safeTrack],
    freshTtlSec: options.freshTtlSec ?? LASTFM_TRACK_DETAILS_CORE_FRESH_TTL_SEC,
    retainTtlSec: options.retainTtlSec ?? LASTFM_TRACK_DETAILS_CORE_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => normalizeTrackInfoPayload(await fetchLastFmJson("track.getInfo", apiKey, {
      artist: safeArtist,
      track: safeTrack,
      username: LASTFM_USER,
      autocorrect: 1
    }))
  });
  return cachedValue && typeof cachedValue === "object" ? cachedValue : null;
}

async function loadTrackTopTags(apiKey, artist, track, nowMs = Date.now()) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  if (!safeArtist || !safeTrack) {
    return [];
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-tags", safeArtist, safeTrack],
    freshTtlSec: LASTFM_TRACK_TAGS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_TRACK_TAGS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("track.gettoptags", apiKey, {
        artist: safeArtist,
        track: safeTrack,
        autocorrect: 1
      });
      return toList(payload?.toptags?.tag).slice(0, 3).map((tagEntry) => ({
        name: String(tagEntry?.name || "").trim(),
        url: String(tagEntry?.url || "").trim()
      })).filter((entry) => entry.name);
    }
  });
  return Array.isArray(cachedValue) ? cachedValue : [];
}

async function loadTrackScrobbles(apiKey, artist, track, nowMs = Date.now()) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  if (!safeArtist || !safeTrack) {
    return null;
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-scrobbles", safeArtist, safeTrack],
    freshTtlSec: LASTFM_TRACK_SCROBBLES_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_TRACK_SCROBBLES_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("user.gettrackscrobbles", apiKey, {
        artist: safeArtist,
        track: safeTrack,
        limit: 8
      });
      const section = payload?.trackscrobbles;
      const items = toList(section?.track).map((trackEntry) => {
        const playedAtText = String(trackEntry?.date?.["#text"] || "").trim();
        const playedAtIso = (() => {
          const uts = Number.parseInt(String(trackEntry?.date?.uts || "").trim(), 10);
          if (!Number.isFinite(uts)) return "";
          return new Date(uts * 1000).toISOString();
        })();
        return {
          playedAtIso,
          playedAtLabel: playedAtText,
          album: getTrackAlbumName(trackEntry),
          artworkUrl: pickLastFmImageUrl(trackEntry?.image),
          lastfmUrl: getTrackUrl(trackEntry)
        };
      });
      return {
        total: parseInteger(section?.["@attr"]?.total),
        items
      };
    }
  });
  return cachedValue && typeof cachedValue === "object" ? cachedValue : null;
}

async function loadArtistTopTracks(apiKey, artist, nowMs = Date.now()) {
  const safeArtist = String(artist || "").trim();
  if (!safeArtist) {
    return [];
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["artist-top-tracks", safeArtist],
    freshTtlSec: LASTFM_ARTIST_TOP_TRACKS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_ARTIST_TOP_TRACKS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("artist.gettoptracks", apiKey, {
        artist: safeArtist,
        autocorrect: 1,
        limit: 8
      });
      return toList(payload?.toptracks?.track).map((trackEntry) => ({
        title: String(trackEntry?.name || "").trim(),
        artist: getTrackArtistName(trackEntry) || safeArtist,
        globalPlaycount: parseInteger(trackEntry?.playcount),
        listeners: parseInteger(trackEntry?.listeners),
        lastfmUrl: getTrackUrl(trackEntry)
      })).filter((entry) => entry.title);
    }
  });
  return Array.isArray(cachedValue) ? cachedValue : [];
}

function buildTrackSummary(trackInfo, fallbackArtworkUrl, topTags, scrobbleTotal, spotifyMatch) {
  const artworkUrl = pickLastFmImageUrl(trackInfo?.album?.image) || String(spotifyMatch?.artworkUrl || "").trim() || fallbackArtworkUrl;
  const userPlaycount = Math.max(parseInteger(trackInfo?.userplaycount), parseInteger(scrobbleTotal));
  return {
    title: getTrackTitle(trackInfo),
    artist: getTrackArtistName(trackInfo),
    album: getTrackAlbumName(trackInfo),
    durationMs: parseInteger(trackInfo?.duration),
    durationLabel: formatDurationLabel(trackInfo?.duration),
    artworkUrl,
    lastfmUrl: getTrackUrl(trackInfo),
    artistLastFmUrl: getArtistUrl(trackInfo),
    userPlaycount,
    userLoved: parseUserLoved(trackInfo?.userloved),
    globalPlaycount: parseInteger(trackInfo?.playcount),
    listeners: parseInteger(trackInfo?.listeners),
    summary: stripHtml(trackInfo?.wiki?.summary) || null,
    publishedAt: String(trackInfo?.wiki?.published || "").trim() || null,
    topTags
  };
}

async function buildRelatedArtistTracks(apiKey, artist, selectedTrackKey, nowMs = Date.now()) {
  const topTracks = await loadArtistTopTracks(apiKey, artist, nowMs);
  const filteredTracks = topTracks.filter((entry) => normalizeTrackKey(entry.artist, entry.title) !== selectedTrackKey).slice(0, 5);
  if (!filteredTracks.length) {
    return [];
  }

  const enrichedTracks = await Promise.all(filteredTracks.map(async (entry) => {
    const trackInfo = await loadTrackInfo(apiKey, entry.artist, entry.title, nowMs, {
      cachePrefix: "track-related-info",
      freshTtlSec: LASTFM_TRACK_INFO_FRESH_TTL_SEC,
      retainTtlSec: LASTFM_TRACK_INFO_RETAIN_TTL_SEC
    });
    return {
      title: entry.title,
      lastfmUrl: getTrackUrl(trackInfo) || entry.lastfmUrl,
      artworkUrl: pickLastFmImageUrl(trackInfo?.album?.image),
      userPlaycount: parseInteger(trackInfo?.userplaycount),
      userLoved: parseUserLoved(trackInfo?.userloved),
      globalPlaycount: parseInteger(trackInfo?.playcount) || entry.globalPlaycount,
      listeners: parseInteger(trackInfo?.listeners) || entry.listeners
    };
  }));

  return enrichedTracks;
}

export function buildEmptyLastFmTrackDetailsPayload(nowMs = Date.now(), sourceStatus = "ERROR", query = {}) {
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    query: {
      artist: String(query.artist || "").trim(),
      track: String(query.track || "").trim(),
      album: String(query.album || "").trim()
    },
    track: null,
    spotify: {
      matchStatus: "unavailable",
      embedUrl: "",
      openUrl: "",
      searchUrl: "",
      title: "",
      artist: "",
      album: "",
      artworkUrl: "",
      previewUrl: ""
    },
    scrobbles: {
      total: 0,
      items: []
    },
    artistTopTracks: {
      artist: "",
      items: []
    }
  };
}

export async function fetchLastFmTrackDetails({
  apiKey,
  env,
  artist,
  track,
  album = "",
  nowMs = Date.now()
}) {
  const rawQuery = {
    artist: String(artist || "").trim(),
    track: String(track || "").trim(),
    album: String(album || "").trim()
  };

  const selectedTrackInfo = await loadTrackInfo(apiKey, rawQuery.artist, rawQuery.track, nowMs, {
    cachePrefix: "track-core",
    freshTtlSec: LASTFM_TRACK_DETAILS_CORE_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_TRACK_DETAILS_CORE_RETAIN_TTL_SEC
  });
  if (!selectedTrackInfo) {
    throw new Error("Track details unavailable");
  }

  const canonicalArtist = getTrackArtistName(selectedTrackInfo) || rawQuery.artist;
  const canonicalTrack = getTrackTitle(selectedTrackInfo) || rawQuery.track;
  const canonicalAlbum = getTrackAlbumName(selectedTrackInfo) || rawQuery.album;

  const [topTags, scrobbles, spotifyMatch] = await Promise.all([
    loadTrackTopTags(apiKey, canonicalArtist, canonicalTrack, nowMs),
    loadTrackScrobbles(apiKey, canonicalArtist, canonicalTrack, nowMs),
    findSpotifyTrackMatch({
      artist: canonicalArtist,
      track: canonicalTrack,
      album: canonicalAlbum,
      env,
      nowMs
    }).catch(() => ({
      matchStatus: "unavailable",
      embedUrl: "",
      openUrl: "",
      searchUrl: "",
      title: "",
      artist: "",
      album: "",
      artworkUrl: "",
      previewUrl: ""
    }))
  ]);

  const scrobbleItems = Array.isArray(scrobbles?.items) ? scrobbles.items : [];
  const scrobbleTotal = parseInteger(scrobbles?.total);
  const fallbackArtworkUrl = String(scrobbleItems[0]?.artworkUrl || "").trim();
  const trackSummary = buildTrackSummary(selectedTrackInfo, fallbackArtworkUrl, topTags, scrobbleTotal, spotifyMatch);
  const artistTopTracks = await buildRelatedArtistTracks(apiKey, canonicalArtist, normalizeTrackKey(canonicalArtist, canonicalTrack), nowMs);
  const sourceStatus = artistTopTracks.length || topTags.length || scrobbleItems.length || spotifyMatch.matchStatus === "matched"
    ? "OK"
    : "PARTIAL";

  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    query: rawQuery,
    track: trackSummary,
    spotify: {
      matchStatus: String(spotifyMatch?.matchStatus || "unavailable"),
      embedUrl: String(spotifyMatch?.embedUrl || "").trim(),
      openUrl: String(spotifyMatch?.openUrl || "").trim(),
      searchUrl: String(spotifyMatch?.searchUrl || "").trim(),
      title: String(spotifyMatch?.title || "").trim(),
      artist: String(spotifyMatch?.artist || "").trim(),
      album: String(spotifyMatch?.album || "").trim(),
      artworkUrl: String(spotifyMatch?.artworkUrl || "").trim(),
      previewUrl: String(spotifyMatch?.previewUrl || "").trim()
    },
    scrobbles: {
      total: scrobbleTotal || trackSummary.userPlaycount,
      items: scrobbleItems.map((entry) => ({
        playedAtIso: String(entry?.playedAtIso || "").trim(),
        playedAtLabel: String(entry?.playedAtLabel || "").trim(),
        album: String(entry?.album || "").trim(),
        lastfmUrl: String(entry?.lastfmUrl || "").trim()
      }))
    },
    artistTopTracks: {
      artist: canonicalArtist,
      items: artistTopTracks
    }
  };
}
