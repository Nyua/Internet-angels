import {
  LASTFM_API_BASE,
  LASTFM_TIMEOUT_MS,
  LASTFM_USER
} from "./config.js";
import { fetchWithTimeout } from "./response.js";

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

export async function fetchLastFmText(url) {
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml"
    }
  }, LASTFM_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Last.fm upstream failed (${response.status})`);
  }

  return await response.text();
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

async function enrichTopArtistsWithArtistPhotos(topartistsSection) {
  const rawArtists = topartistsSection?.artist;
  const artists = Array.isArray(rawArtists) ? rawArtists : rawArtists ? [rawArtists] : [];
  if (!artists.length) {
    return topartistsSection;
  }

  const decodeHtmlAttribute = (value) => String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const buildArtistImagesUrl = (artistEntry) => {
    const artistUrl = String(artistEntry?.url || "").trim();
    if (!artistUrl) {
      return "";
    }
    try {
      const url = new URL(artistUrl);
      url.pathname = `${url.pathname.replace(/\/+$/, "")}/+images`;
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  };
  const extractArtistPhotoUrl = (markup, pageUrl) => {
    const source = String(markup || "");
    if (!source) {
      return "";
    }
    const resolvePhotoUrl = (rawImageUrl) => {
      const candidate = decodeHtmlAttribute(rawImageUrl);
      if (!candidate) {
        return "";
      }
      try {
        return new URL(candidate, pageUrl).toString();
      } catch {
        return "";
      }
    };
    const itemPattern = /<li[^>]*class="[^"]*image-list-item-wrapper[^"]*"[\s\S]*?<\/li>/gi;
    let firstPhotoUrl = "";
    let match;
    while ((match = itemPattern.exec(source))) {
      const itemMarkup = match[0];
      const imageMatch = itemMarkup.match(/<img[^>]+src="([^"]+)"/i);
      const resolvedPhotoUrl = resolvePhotoUrl(imageMatch?.[1] || "");
      if (!resolvedPhotoUrl) {
        continue;
      }
      if (!firstPhotoUrl) {
        firstPhotoUrl = resolvedPhotoUrl;
      }
      if (/image-list-item-preferred-icon/i.test(itemMarkup)) {
        return resolvedPhotoUrl;
      }
    }
    if (firstPhotoUrl) {
      return firstPhotoUrl;
    }
    const galleryAnchorMatch = source.match(/<a[^>]+href="[^"]*\/\+images\/[a-f0-9]{8,}[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/i);
    if (galleryAnchorMatch?.[1]) {
      return resolvePhotoUrl(galleryAnchorMatch[1]);
    }
    const ogImageMatch = source.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    return resolvePhotoUrl(ogImageMatch?.[1] || "");
  };
  const artistPhotoResults = await Promise.allSettled(
    artists.map(async (artistEntry) => {
      const artistImagesUrl = buildArtistImagesUrl(artistEntry);
      if (!artistImagesUrl) {
        return "";
      }
      const markup = await fetchLastFmText(artistImagesUrl);
      return extractArtistPhotoUrl(markup, artistImagesUrl);
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
