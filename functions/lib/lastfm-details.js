import {
  LASTFM_ALBUM_INFO_FRESH_TTL_SEC,
  LASTFM_ALBUM_INFO_RETAIN_TTL_SEC,
  LASTFM_ARTIST_INFO_FRESH_TTL_SEC,
  LASTFM_ARTIST_INFO_RETAIN_TTL_SEC,
  LASTFM_ARTIST_TOP_ALBUMS_FRESH_TTL_SEC,
  LASTFM_ARTIST_TOP_ALBUMS_RETAIN_TTL_SEC,
  LASTFM_ARTIST_TOP_TRACKS_FRESH_TTL_SEC,
  LASTFM_ARTIST_TOP_TRACKS_RETAIN_TTL_SEC,
  LASTFM_TRACK_DETAILS_CORE_FRESH_TTL_SEC,
  LASTFM_TRACK_DETAILS_CORE_RETAIN_TTL_SEC,
  LASTFM_TRACK_INFO_FRESH_TTL_SEC,
  LASTFM_TRACK_INFO_RETAIN_TTL_SEC,
  LASTFM_SIMILAR_TRACKS_FRESH_TTL_SEC,
  LASTFM_SIMILAR_TRACKS_RETAIN_TTL_SEC,
  LASTFM_TRACK_SCROBBLES_FRESH_TTL_SEC,
  LASTFM_TRACK_SCROBBLES_RETAIN_TTL_SEC,
  LASTFM_TRACK_TAGS_FRESH_TTL_SEC,
  LASTFM_TRACK_TAGS_RETAIN_TTL_SEC,
  LASTFM_USER
} from "./config.js";
import { readCachedPayload, writeCachedPayload } from "./cache.js";
import {
  fetchLastFmJson,
  findArtistPhotoUrlViaDeezer,
  getTrackArtistName,
  getTrackTitle,
  isLastFmGenericImageUrl,
  normalizeTrackKey,
  pickLastFmImageUrl
} from "./lastfm.js";
import { findSpotifyTrackMatch } from "./spotify.js";

const LASTFM_INTERNAL_CACHE_BASE = "https://internet-angel.internal/__lastfm-details";

function buildInternalCacheRequest(parts) {
  const safeParts = (Array.isArray(parts) ? parts : [parts]).map((part) => encodeURIComponent(String(part || "").trim().toLowerCase()));
  return new Request(`${LASTFM_INTERNAL_CACHE_BASE}/${safeParts.join("/")}`, { method: "GET" });
}

function readUsableCachedValue(cacheState) {
  if (!cacheState?.payload || !Object.prototype.hasOwnProperty.call(cacheState.payload, "value")) {
    return { hasValue: false, value: null };
  }
  const value = cacheState.payload.value;
  if (value === null || value === undefined) {
    return { hasValue: false, value: null };
  }
  return { hasValue: true, value };
}

async function loadCachedValue({
  cacheKeyParts,
  freshTtlSec,
  retainTtlSec,
  nowMs = Date.now(),
  loader,
  throwOnLoaderError = false
}) {
  const cache = globalThis.caches?.default;
  if (!cache) {
    try {
      return await loader();
    } catch (error) {
      if (throwOnLoaderError) {
        throw error;
      }
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
  const cachedValueState = readUsableCachedValue(cacheState);

  if (cacheState.status === "fresh" && cachedValueState.hasValue) {
    return cachedValueState.value;
  }

  try {
    const value = await loader();
    if (value !== undefined && value !== null) {
      await writeCachedPayload({
        cache,
        request,
        payload: {
          fetchedAt: new Date(nowMs).toISOString(),
          value
        },
        retainTtlSec
      });
      return value;
    }
    if (cacheState.status === "retained" && cachedValueState.hasValue) {
      return cachedValueState.value;
    }
    return null;
  } catch (error) {
    if (cacheState.status === "retained" && cachedValueState.hasValue) {
      return cachedValueState.value;
    }
    if (throwOnLoaderError) {
      throw error;
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

function normalizeDurationMsValue(value) {
  const parsed = parseInteger(value);
  if (!parsed) {
    return 0;
  }
  return parsed < 1000 ? parsed * 1000 : parsed;
}

function formatDurationLabel(durationMs) {
  const safeMs = normalizeDurationMsValue(durationMs);
  if (!safeMs || safeMs < 1000) return "";
  const totalSeconds = Math.max(0, Math.round(safeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeReleaseLabel(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/,\s*00:00$/i, "")
    .trim();
}

function extractReleaseYear(value) {
  const match = normalizeReleaseLabel(value).match(/\b(19|20)\d{2}\b/);
  return match?.[0] || "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<a\b[^>]*>.*?<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*Read more on Last\.fm\s*$/i, "")
    .trim();
}

function normalizeWikiExcerpt(summary, content) {
  const rawSummary = String(summary || "");
  const rawContent = String(content || "");
  const summaryText = stripHtml(rawSummary);
  const contentText = stripHtml(rawContent);
  const hasReadMoreMarker = /Read more on Last\.fm/i.test(rawSummary) || /Read more on Last\.fm/i.test(rawContent);
  const normalizedText = summaryText || contentText || "";
  const hasMore = Boolean(
    normalizedText && (
      hasReadMoreMarker ||
      (contentText && contentText !== normalizedText && contentText.length > normalizedText.length)
    )
  );
  return {
    text: normalizedText || null,
    hasMore
  };
}

function getTrackAlbumName(trackEntry) {
  return String(trackEntry?.album?.title || trackEntry?.album?.["#text"] || trackEntry?.album || "").trim();
}

function getArtistName(entry) {
  return String(entry?.name || "").trim();
}

function getArtistUrlFromEntry(entry) {
  return String(entry?.url || "").trim();
}

function getAlbumTitle(entry) {
  return String(entry?.name || entry?.title || "").trim();
}

function getAlbumArtistName(entry) {
  return String(entry?.artist?.name || entry?.artist || "").trim();
}

function getAlbumUrl(entry) {
  return String(entry?.url || "").trim();
}

function getTrackUrl(trackEntry) {
  return String(trackEntry?.url || "").trim();
}

function getArtistUrl(trackEntry) {
  return String(trackEntry?.artist?.url || "").trim();
}

function buildLastFmMusicUrl(...segments) {
  const safeSegments = segments
    .map((segment) => String(segment || "").trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  if (!safeSegments.length) {
    return "";
  }
  return `https://www.last.fm/music/${safeSegments.join("/")}`;
}

function buildLastFmArtistUrl(artist) {
  return buildLastFmMusicUrl(artist);
}

function buildLastFmAlbumUrl(artist, album) {
  return buildLastFmMusicUrl(artist, album);
}

function buildLastFmTrackUrl(artist, track) {
  return buildLastFmMusicUrl(artist, "_", track);
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
    throwOnLoaderError: Boolean(options.throwOnUpstreamError),
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

async function loadTrackSimilar(apiKey, artist, track, nowMs = Date.now()) {
  const safeArtist = String(artist || "").trim();
  const safeTrack = String(track || "").trim();
  if (!safeArtist || !safeTrack) {
    return [];
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["track-similar", safeArtist, safeTrack],
    freshTtlSec: LASTFM_SIMILAR_TRACKS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_SIMILAR_TRACKS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("track.getsimilar", apiKey, {
        artist: safeArtist,
        track: safeTrack,
        autocorrect: 1,
        limit: 4
      });
      return toList(payload?.similartracks?.track).map((trackEntry) => ({
        title: getTrackTitle(trackEntry),
        artist: getTrackArtistName(trackEntry),
        url: getTrackUrl(trackEntry),
        match: Number.parseFloat(String(trackEntry?.match || "").trim())
      })).filter((entry) => entry.title && entry.artist);
    }
  });
  return Array.isArray(cachedValue) ? cachedValue : [];
}

function normalizeTrackScrobbleEntry(trackEntry) {
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
        limit: 30
      });
      const section = payload?.trackscrobbles;
      const items = toList(section?.track).map(normalizeTrackScrobbleEntry);
      const total = parseInteger(section?.["@attr"]?.total);
      let firstRecorded = items.length ? items[items.length - 1] : null;
      if (total > items.length) {
        try {
          const firstPayload = await fetchLastFmJson("user.gettrackscrobbles", apiKey, {
            artist: safeArtist,
            track: safeTrack,
            limit: 1,
            page: total
          });
          const firstEntry = toList(firstPayload?.trackscrobbles?.track)[0];
          if (firstEntry) {
            firstRecorded = normalizeTrackScrobbleEntry(firstEntry);
          }
        } catch {
          firstRecorded = items.length ? items[items.length - 1] : null;
        }
      }
      return {
        total,
        items,
        firstRecorded
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

async function loadArtistTopAlbums(apiKey, artist, nowMs = Date.now()) {
  const safeArtist = String(artist || "").trim();
  if (!safeArtist) {
    return [];
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["artist-top-albums", safeArtist],
    freshTtlSec: LASTFM_ARTIST_TOP_ALBUMS_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_ARTIST_TOP_ALBUMS_RETAIN_TTL_SEC,
    nowMs,
    loader: async () => {
      const payload = await fetchLastFmJson("artist.gettopalbums", apiKey, {
        artist: safeArtist,
        autocorrect: 1,
        limit: 24
      });
      return toList(payload?.topalbums?.album).map((albumEntry) => ({
        title: getAlbumTitle(albumEntry),
        artist: getAlbumArtistName(albumEntry) || safeArtist,
        artworkUrl: pickLastFmImageUrl(albumEntry?.image),
        lastfmUrl: getAlbumUrl(albumEntry),
        playcount: parseInteger(albumEntry?.playcount)
      })).filter((entry) => entry.title);
    }
  });
  return Array.isArray(cachedValue) ? cachedValue : [];
}

async function loadArtistInfo(apiKey, artist, nowMs = Date.now(), options = {}) {
  const safeArtist = String(artist || "").trim();
  if (!safeArtist) {
    return null;
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["artist-info", safeArtist],
    freshTtlSec: LASTFM_ARTIST_INFO_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_ARTIST_INFO_RETAIN_TTL_SEC,
    nowMs,
    throwOnLoaderError: Boolean(options.throwOnUpstreamError),
    loader: async () => {
      const payload = await fetchLastFmJson("artist.getinfo", apiKey, {
        artist: safeArtist,
        username: LASTFM_USER,
        autocorrect: 1
      });
      return payload?.artist && typeof payload.artist === "object" ? payload.artist : null;
    }
  });
  return cachedValue && typeof cachedValue === "object" ? cachedValue : null;
}

async function loadAlbumInfo(apiKey, artist, album, nowMs = Date.now(), options = {}) {
  const safeArtist = String(artist || "").trim();
  const safeAlbum = String(album || "").trim();
  if (!safeArtist || !safeAlbum) {
    return null;
  }
  const cachedValue = await loadCachedValue({
    cacheKeyParts: ["album-info", safeArtist, safeAlbum],
    freshTtlSec: LASTFM_ALBUM_INFO_FRESH_TTL_SEC,
    retainTtlSec: LASTFM_ALBUM_INFO_RETAIN_TTL_SEC,
    nowMs,
    throwOnLoaderError: Boolean(options.throwOnUpstreamError),
    loader: async () => {
      const payload = await fetchLastFmJson("album.getinfo", apiKey, {
        artist: safeArtist,
        album: safeAlbum,
        username: LASTFM_USER,
        autocorrect: 1
      });
      return payload?.album && typeof payload.album === "object" ? payload.album : null;
    }
  });
  return cachedValue && typeof cachedValue === "object" ? cachedValue : null;
}

async function resolveArtistArtworkUrl(artistInfo) {
  const lastFmImageUrl = pickLastFmImageUrl(artistInfo?.image);
  if (lastFmImageUrl && !isLastFmGenericImageUrl(lastFmImageUrl)) {
    return lastFmImageUrl;
  }
  const deezerImageUrl = await findArtistPhotoUrlViaDeezer(getArtistName(artistInfo)).catch(() => "");
  return deezerImageUrl || lastFmImageUrl || "";
}

async function buildArtistTopTracksDetailed(apiKey, artist, nowMs = Date.now(), options = {}) {
  const safeArtist = String(artist || "").trim();
  if (!safeArtist) {
    return [];
  }
  const excludeTrackKey = String(options.excludeTrackKey || "").trim().toLowerCase();
  const limit = Math.max(1, Number.parseInt(String(options.limit || 5), 10) || 5);
  const topTracks = await loadArtistTopTracks(apiKey, safeArtist, nowMs);
  const filteredTracks = topTracks
    .filter((entry) => normalizeTrackKey(entry.artist, entry.title) !== excludeTrackKey)
    .slice(0, Math.max(limit, 8));
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
      artist: entry.artist,
      lastfmUrl: getTrackUrl(trackInfo) || entry.lastfmUrl,
      artistLastFmUrl: getArtistUrl(trackInfo),
      artworkUrl: pickLastFmImageUrl(trackInfo?.album?.image),
      userPlaycount: parseInteger(trackInfo?.userplaycount),
      userLoved: parseUserLoved(trackInfo?.userloved),
      globalPlaycount: parseInteger(trackInfo?.playcount) || entry.globalPlaycount,
      listeners: parseInteger(trackInfo?.listeners) || entry.listeners
    };
  }));
  return enrichedTracks.sort((left, right) => {
    const userPlayDelta = parseInteger(right?.userPlaycount) - parseInteger(left?.userPlaycount);
    if (userPlayDelta !== 0) return userPlayDelta;
    const globalPlayDelta = parseInteger(right?.globalPlaycount) - parseInteger(left?.globalPlaycount);
    if (globalPlayDelta !== 0) return globalPlayDelta;
    return String(left?.title || "").localeCompare(String(right?.title || ""));
  }).slice(0, limit);
}

async function buildArtistTopAlbumsDetailed(apiKey, artist, nowMs = Date.now(), options = {}) {
  const safeArtist = String(artist || "").trim();
  if (!safeArtist) {
    return [];
  }
  const limit = Math.max(1, Number.parseInt(String(options.limit || 12), 10) || 12);
  const topAlbums = await loadArtistTopAlbums(apiKey, safeArtist, nowMs);
  const filteredAlbums = topAlbums.slice(0, limit);
  if (!filteredAlbums.length) {
    return [];
  }
  const enrichedAlbums = await Promise.all(filteredAlbums.map(async (entry) => {
    const albumInfo = await loadAlbumInfo(apiKey, entry.artist, entry.title, nowMs);
    const releasedAt = normalizeReleaseLabel(albumInfo?.releasedate || albumInfo?.wiki?.published);
    const topTags = normalizeTagList(albumInfo?.tags?.tag, 3);
    const trackCount = toList(albumInfo?.tracks?.track).length;
    return {
      title: entry.title,
      artist: entry.artist,
      artworkUrl: pickLastFmImageUrl(albumInfo?.image) || entry.artworkUrl,
      lastfmUrl: getAlbumUrl(albumInfo) || entry.lastfmUrl,
      releasedAt,
      releaseYear: extractReleaseYear(releasedAt),
      topTags,
      trackCount,
      userPlaycount: parseInteger(albumInfo?.userplaycount),
      playcount: parseInteger(albumInfo?.playcount) || entry.playcount,
      listeners: parseInteger(albumInfo?.listeners)
    };
  }));
  return enrichedAlbums.filter((entry) => entry.trackCount !== 1).slice(0, limit);
}

function buildTrackSummary(trackInfo, fallbackArtworkUrl, topTags, scrobbleTotal, spotifyMatch, similarTracks = []) {
  const artworkUrl = pickLastFmImageUrl(trackInfo?.album?.image) || String(spotifyMatch?.artworkUrl || "").trim() || fallbackArtworkUrl;
  const userPlaycount = Math.max(parseInteger(trackInfo?.userplaycount), parseInteger(scrobbleTotal));
  const wikiExcerpt = normalizeWikiExcerpt(trackInfo?.wiki?.summary, trackInfo?.wiki?.content);
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
    summary: wikiExcerpt.text,
    summaryHasMore: wikiExcerpt.hasMore,
    publishedAt: String(trackInfo?.wiki?.published || "").trim() || null,
    topTags,
    similarTracks: Array.isArray(similarTracks) ? similarTracks.slice(0, 3) : []
  };
}

async function buildRelatedArtistTracks(apiKey, artist, selectedTrackKey, nowMs = Date.now()) {
  return await buildArtistTopTracksDetailed(apiKey, artist, nowMs, {
    excludeTrackKey: selectedTrackKey,
    limit: 5
  });
}

function normalizeTagList(tagSection, limit = 4) {
  return toList(tagSection).map((tagEntry) => ({
    name: String(tagEntry?.name || "").trim(),
    url: String(tagEntry?.url || "").trim()
  })).filter((entry) => entry.name).slice(0, limit);
}

function buildArtistSummary(artistInfo, artworkUrl, topTracks = []) {
  const wikiExcerpt = normalizeWikiExcerpt(artistInfo?.bio?.summary, artistInfo?.bio?.content);
  return {
    name: getArtistName(artistInfo),
    artworkUrl: String(artworkUrl || "").trim(),
    lastfmUrl: getArtistUrlFromEntry(artistInfo),
    summary: wikiExcerpt.text,
    summaryHasMore: wikiExcerpt.hasMore,
    listeners: parseInteger(artistInfo?.stats?.listeners),
    playcount: parseInteger(artistInfo?.stats?.playcount),
    userPlaycount: parseInteger(artistInfo?.stats?.userplaycount) || parseInteger(artistInfo?.userplaycount),
    topTags: normalizeTagList(artistInfo?.tags?.tag, 4),
    topTrackCount: Array.isArray(topTracks) ? topTracks.length : 0
  };
}

async function buildAlbumTrackItems(apiKey, artist, rawTracks, artistLastFmUrl, nowMs = Date.now()) {
  const tracks = toList(rawTracks).map((trackEntry, index) => ({
    rank: parseInteger(trackEntry?.["@attr"]?.rank) || index + 1,
    title: getTrackTitle(trackEntry),
    artist: getTrackArtistName(trackEntry) || String(artist || "").trim(),
    durationMs: normalizeDurationMsValue(trackEntry?.duration),
    durationLabel: formatDurationLabel(trackEntry?.duration)
  })).filter((entry) => entry.title);
  if (!tracks.length) {
    return [];
  }
  return await Promise.all(tracks.map(async (entry) => {
    const trackInfo = await loadTrackInfo(apiKey, entry.artist, entry.title, nowMs, {
      cachePrefix: "album-track-info",
      freshTtlSec: LASTFM_TRACK_INFO_FRESH_TTL_SEC,
      retainTtlSec: LASTFM_TRACK_INFO_RETAIN_TTL_SEC
    });
    const durationMs = normalizeDurationMsValue(trackInfo?.duration) || entry.durationMs;
    return {
      rank: entry.rank,
      title: entry.title,
      artist: entry.artist,
      artistLastFmUrl: getArtistUrl(trackInfo) || artistLastFmUrl,
      durationMs,
      durationLabel: formatDurationLabel(durationMs),
      lastfmUrl: getTrackUrl(trackInfo),
      userPlaycount: parseInteger(trackInfo?.userplaycount),
      userLoved: parseUserLoved(trackInfo?.userloved),
      globalPlaycount: parseInteger(trackInfo?.playcount),
      listeners: parseInteger(trackInfo?.listeners)
    };
  }));
}

function buildAlbumSummary(albumInfo, artistInfo, trackItems) {
  const runtimeMs = trackItems.reduce((total, entry) => total + normalizeDurationMsValue(entry?.durationMs), 0);
  const wikiExcerpt = normalizeWikiExcerpt(albumInfo?.wiki?.summary, albumInfo?.wiki?.content);
  return {
    title: getAlbumTitle(albumInfo),
    artist: getAlbumArtistName(albumInfo),
    artworkUrl: pickLastFmImageUrl(albumInfo?.image),
    lastfmUrl: getAlbumUrl(albumInfo),
    artistLastFmUrl: getArtistUrlFromEntry(artistInfo),
    summary: wikiExcerpt.text,
    summaryHasMore: wikiExcerpt.hasMore,
    listeners: parseInteger(albumInfo?.listeners),
    playcount: parseInteger(albumInfo?.playcount),
    userPlaycount: parseInteger(albumInfo?.userplaycount),
    releasedAt: normalizeReleaseLabel(albumInfo?.releasedate || albumInfo?.wiki?.published),
    runtimeMs,
    runtimeLabel: formatDurationLabel(runtimeMs),
    trackCount: trackItems.length,
    topTags: normalizeTagList(albumInfo?.tags?.tag, 4)
  };
}

function buildFallbackTrackInfo(query = {}) {
  const artist = String(query.artist || "").trim();
  const track = String(query.track || "").trim();
  const album = String(query.album || "").trim();
  if (!artist && !track && !album) {
    return null;
  }
  return {
    name: track,
    artist: artist ? {
      name: artist,
      url: buildLastFmArtistUrl(artist)
    } : {},
    album: album ? { title: album } : {},
    url: buildLastFmTrackUrl(artist, track)
  };
}

function buildFallbackArtistInfo(query = {}) {
  const artist = String(query.artist || "").trim();
  if (!artist) {
    return null;
  }
  return {
    name: artist,
    url: buildLastFmArtistUrl(artist)
  };
}

function buildFallbackAlbumInfo(query = {}) {
  const artist = String(query.artist || "").trim();
  const album = String(query.album || "").trim();
  if (!artist && !album) {
    return null;
  }
  return {
    name: album,
    artist,
    url: buildLastFmAlbumUrl(artist, album)
  };
}

function buildEmptySpotifyTrackMatch() {
  return {
    matchStatus: "unavailable",
    embedUrl: "",
    openUrl: "",
    searchUrl: "",
    title: "",
    artist: "",
    album: "",
    artworkUrl: "",
    previewUrl: ""
  };
}

function pickAlbumSpotifySeedTrack(trackItems) {
  const items = Array.isArray(trackItems) ? trackItems : [];
  if (!items.length) {
    return null;
  }
  const sortedItems = [...items].sort((left, right) => {
    const userPlayDelta = parseInteger(right?.userPlaycount) - parseInteger(left?.userPlaycount);
    if (userPlayDelta !== 0) return userPlayDelta;
    const rankDelta = parseInteger(left?.rank) - parseInteger(right?.rank);
    if (rankDelta !== 0) return rankDelta;
    return String(left?.title || "").localeCompare(String(right?.title || ""));
  });
  const chosenItem = sortedItems.find((entry) => String(entry?.title || "").trim()) || null;
  return chosenItem ? {
    title: String(chosenItem.title || "").trim(),
    artist: String(chosenItem.artist || "").trim()
  } : null;
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
    spotify: buildEmptySpotifyTrackMatch(),
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

export function buildEmptyLastFmArtistDetailsPayload(nowMs = Date.now(), sourceStatus = "ERROR", query = {}) {
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    query: {
      artist: String(query.artist || "").trim()
    },
    artist: null,
    topTracks: {
      artist: "",
      items: []
    },
    topAlbums: {
      artist: "",
      items: []
    }
  };
}

export function buildEmptyLastFmAlbumDetailsPayload(nowMs = Date.now(), sourceStatus = "ERROR", query = {}) {
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    query: {
      artist: String(query.artist || "").trim(),
      album: String(query.album || "").trim()
    },
    album: null,
    spotify: buildEmptySpotifyTrackMatch(),
    tracks: {
      items: []
    },
    relatedTracks: {
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
    retainTtlSec: LASTFM_TRACK_DETAILS_CORE_RETAIN_TTL_SEC,
    throwOnUpstreamError: true
  });
  const baseTrackInfo = selectedTrackInfo || buildFallbackTrackInfo(rawQuery);
  if (!baseTrackInfo) {
    return buildEmptyLastFmTrackDetailsPayload(nowMs, "PARTIAL", rawQuery);
  }

  const canonicalArtist = getTrackArtistName(baseTrackInfo) || rawQuery.artist;
  const canonicalTrack = getTrackTitle(baseTrackInfo) || rawQuery.track;
  const canonicalAlbum = getTrackAlbumName(baseTrackInfo) || rawQuery.album;

  const [topTags, similarTracks, scrobbles, spotifyMatch] = await Promise.all([
    loadTrackTopTags(apiKey, canonicalArtist, canonicalTrack, nowMs),
    loadTrackSimilar(apiKey, canonicalArtist, canonicalTrack, nowMs),
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
  const trackSummary = buildTrackSummary(baseTrackInfo, fallbackArtworkUrl, topTags, scrobbleTotal, spotifyMatch, similarTracks);
  const artistTopTracks = await buildRelatedArtistTracks(apiKey, canonicalArtist, normalizeTrackKey(canonicalArtist, canonicalTrack), nowMs);
  const hasTrackSignals = Boolean(
    artistTopTracks.length ||
    topTags.length ||
    similarTracks.length ||
    scrobbleItems.length ||
    spotifyMatch.matchStatus === "matched" ||
    trackSummary.summary
  );
  const sourceStatus = selectedTrackInfo && hasTrackSignals ? "OK" : "PARTIAL";

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
      })),
      firstRecorded: scrobbles?.firstRecorded ? {
        playedAtIso: String(scrobbles.firstRecorded?.playedAtIso || "").trim(),
        playedAtLabel: String(scrobbles.firstRecorded?.playedAtLabel || "").trim(),
        album: String(scrobbles.firstRecorded?.album || "").trim(),
        lastfmUrl: String(scrobbles.firstRecorded?.lastfmUrl || "").trim()
      } : null
    },
    artistTopTracks: {
      artist: canonicalArtist,
      items: artistTopTracks
    }
  };
}

export async function fetchLastFmArtistDetails({
  apiKey,
  artist,
  nowMs = Date.now()
}) {
  const rawQuery = {
    artist: String(artist || "").trim()
  };
  const artistInfo = await loadArtistInfo(apiKey, rawQuery.artist, nowMs, {
    throwOnUpstreamError: true
  });
  const baseArtistInfo = artistInfo || buildFallbackArtistInfo(rawQuery);
  if (!baseArtistInfo) {
    return buildEmptyLastFmArtistDetailsPayload(nowMs, "PARTIAL", rawQuery);
  }
  const canonicalArtist = getArtistName(baseArtistInfo) || rawQuery.artist;
  const [artworkUrl, topTracks, topAlbums] = await Promise.all([
    resolveArtistArtworkUrl(baseArtistInfo),
    buildArtistTopTracksDetailed(apiKey, canonicalArtist, nowMs, { limit: 5 }),
    buildArtistTopAlbumsDetailed(apiKey, canonicalArtist, nowMs, { limit: 12 })
  ]);
  const artistSummary = buildArtistSummary(baseArtistInfo, artworkUrl, topTracks);
  const hasArtistSignals = Boolean(
    artistSummary.summary ||
    artistSummary.topTags.length ||
    topTracks.length ||
    topAlbums.length ||
    artistSummary.lastfmUrl ||
    artistSummary.artworkUrl ||
    artistSummary.listeners ||
    artistSummary.playcount
  );
  const sourceStatus = artistInfo && hasArtistSignals ? "OK" : "PARTIAL";
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    query: {
      artist: canonicalArtist
    },
    artist: artistSummary,
    topTracks: {
      artist: canonicalArtist,
      items: topTracks
    },
    topAlbums: {
      artist: canonicalArtist,
      items: topAlbums
    }
  };
}

export async function fetchLastFmAlbumDetails({
  apiKey,
  env,
  artist,
  album,
  nowMs = Date.now()
}) {
  const rawQuery = {
    artist: String(artist || "").trim(),
    album: String(album || "").trim()
  };
  const albumInfo = await loadAlbumInfo(apiKey, rawQuery.artist, rawQuery.album, nowMs, {
    throwOnUpstreamError: true
  });
  const baseAlbumInfo = albumInfo || buildFallbackAlbumInfo(rawQuery);
  if (!baseAlbumInfo) {
    return buildEmptyLastFmAlbumDetailsPayload(nowMs, "PARTIAL", rawQuery);
  }
  const canonicalArtist = getAlbumArtistName(baseAlbumInfo) || rawQuery.artist;
  const canonicalAlbum = getAlbumTitle(baseAlbumInfo) || rawQuery.album;
  const artistInfo = await loadArtistInfo(apiKey, canonicalArtist, nowMs);
  const summaryArtistInfo = artistInfo || buildFallbackArtistInfo({ artist: canonicalArtist });
  const trackItems = await buildAlbumTrackItems(
    apiKey,
    canonicalArtist,
    baseAlbumInfo?.tracks?.track,
    getArtistUrlFromEntry(summaryArtistInfo),
    nowMs
  );
  const spotifySeedTrack = pickAlbumSpotifySeedTrack(trackItems);
  const spotifyMatch = spotifySeedTrack
    ? await findSpotifyTrackMatch({
      artist: spotifySeedTrack.artist || canonicalArtist,
      track: spotifySeedTrack.title,
      album: canonicalAlbum,
      env,
      nowMs
    }).catch(() => buildEmptySpotifyTrackMatch())
    : buildEmptySpotifyTrackMatch();
  const albumTrackKeys = new Set(trackItems.map((entry) => normalizeTrackKey(entry.artist, entry.title)));
  const relatedTracks = (await buildArtistTopTracksDetailed(apiKey, canonicalArtist, nowMs, { limit: 8 }))
    .filter((entry) => !albumTrackKeys.has(normalizeTrackKey(entry.artist, entry.title)))
    .slice(0, 4);
  const albumSummary = buildAlbumSummary(baseAlbumInfo, summaryArtistInfo, trackItems);
  const hasAlbumSignals = Boolean(
    trackItems.length ||
    relatedTracks.length ||
    albumSummary.summary ||
    albumSummary.topTags.length ||
    albumSummary.lastfmUrl ||
    albumSummary.artistLastFmUrl ||
    albumSummary.artworkUrl ||
    albumSummary.listeners ||
    albumSummary.playcount ||
    albumSummary.releasedAt
  );
  const sourceStatus = albumInfo && hasAlbumSignals ? "OK" : "PARTIAL";
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    query: {
      artist: canonicalArtist,
      album: canonicalAlbum
    },
    album: albumSummary,
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
    tracks: {
      items: trackItems
    },
    relatedTracks: {
      artist: canonicalArtist,
      items: relatedTracks
    }
  };
}
