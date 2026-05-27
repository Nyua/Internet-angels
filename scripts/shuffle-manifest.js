import fs from "node:fs";
import path from "node:path";

const DEFAULT_TRACK_DURATION_SECONDS = 0;
const YOUTUBE_DEFAULT_ARTIST = "YouTube";
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_METADATA_TIMEOUT_MS = 3_500;
const HTML_ENTITY_PATTERN = /&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi;
const UNICODE_FORMAT_CONTROL_PATTERN = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const ASCII_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const LONE_SURROGATE_PATTERN = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractYouTubeVideoId(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  if (YOUTUBE_ID_PATTERN.test(source)) return source;

  try {
    const url = new URL(source);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return YOUTUBE_ID_PATTERN.test(id) ? id : "";
    }
    if (host === "youtube.com" || host === "music.youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const watchId = url.searchParams.get("v") || "";
      if (YOUTUBE_ID_PATTERN.test(watchId)) return watchId;
      const segments = url.pathname.split("/").filter(Boolean);
      const candidate = segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live"
        ? segments[1] || ""
        : "";
      return YOUTUBE_ID_PATTERN.test(candidate) ? candidate : "";
    }
  } catch {
  }

  const looseMatch = source.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return looseMatch ? looseMatch[1] : "";
}

function normalizeYouTubeUrl(value) {
  const videoId = extractYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
}

function decodeHtmlEntity(entity) {
  const source = String(entity || "").toLowerCase();
  if (source === "&amp;") return "&";
  if (source === "&lt;") return "<";
  if (source === "&gt;") return ">";
  if (source === "&quot;") return "\"";
  if (source === "&apos;") return "'";
  const decimalMatch = source.match(/^&#(\d{1,7});$/);
  const hexMatch = source.match(/^&#x([0-9a-f]{1,6});$/);
  const codePoint = decimalMatch
    ? Number(decimalMatch[1])
    : hexMatch ? Number.parseInt(hexMatch[1], 16) : NaN;
  if (!Number.isFinite(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) {
    return entity;
  }
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return entity;
  }
}

function toWellFormedText(value) {
  const source = String(value || "");
  if (typeof source.toWellFormed === "function") {
    return source.toWellFormed();
  }
  return source.replace(LONE_SURROGATE_PATTERN, "\ufffd");
}

function cleanMetadataValue(value) {
  return toWellFormedText(value)
    .replace(HTML_ENTITY_PATTERN, decodeHtmlEntity)
    .replace(UNICODE_FORMAT_CONTROL_PATTERN, "")
    .replace(ASCII_CONTROL_PATTERN, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

function isFallbackYouTubeTitle(track) {
  const title = cleanMetadataValue(track?.title);
  const videoId = cleanMetadataValue(track?.youtubeVideoId);
  return Boolean(videoId && (!title || title === `YouTube Video ${videoId}`));
}

function isFallbackYouTubeArtist(track) {
  const artist = cleanMetadataValue(track?.artist).toLowerCase();
  return !artist || artist === "youtube" || artist === "youtube video";
}

export async function fetchYouTubeOEmbedMetadata(videoUrl, options = {}) {
  const normalizedUrl = normalizeYouTubeUrl(videoUrl);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (!normalizedUrl || typeof fetchImpl !== "function") {
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(500, Number(options.timeoutMs) || YOUTUBE_METADATA_TIMEOUT_MS));
  try {
    const endpoint = new URL("https://www.youtube.com/oembed");
    endpoint.searchParams.set("url", normalizedUrl);
    endpoint.searchParams.set("format", "json");
    const response = await fetchImpl(endpoint, {
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });
    if (!response?.ok) return null;
    const responseBuffer = await response.arrayBuffer();
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: false }).decode(responseBuffer));
    return {
      title: cleanMetadataValue(data?.title),
      artist: cleanMetadataValue(data?.author_name),
      channelUrl: cleanMetadataValue(data?.author_url)
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function applyYouTubeMetadata(track, metadata) {
  if (!track || typeof track !== "object") return track;
  const title = cleanMetadataValue(metadata?.title);
  const artist = cleanMetadataValue(metadata?.artist);
  const channelUrl = cleanMetadataValue(metadata?.channelUrl);
  const nextTitle = title && isFallbackYouTubeTitle(track) ? title : track.title;
  const nextArtist = artist && isFallbackYouTubeArtist(track) ? artist : track.artist;
  return {
    ...track,
    title: nextTitle,
    displayTitle: title && isFallbackYouTubeTitle(track) ? title : track.displayTitle,
    artist: nextArtist,
    displayArtist: artist && isFallbackYouTubeArtist(track) ? artist : track.displayArtist,
    youtubeChannelUrl: channelUrl || track.youtubeChannelUrl || ""
  };
}

function parseTrackLine(line, index) {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const parts = trimmed.split("|").map((part) => part.trim()).filter(Boolean);
  const urlPartIndex = parts.findIndex((part) => extractYouTubeVideoId(part));
  const sourceUrl = urlPartIndex >= 0 ? parts[urlPartIndex] : trimmed;
  const videoId = extractYouTubeVideoId(sourceUrl);
  if (!videoId) return null;

  const metadataParts = urlPartIndex >= 0
    ? parts.filter((_, partIndex) => partIndex !== urlPartIndex)
    : [];
  const title = metadataParts[0] || `YouTube Video ${videoId}`;
  const artist = metadataParts[1] || YOUTUBE_DEFAULT_ARTIST;
  const duration = Number(metadataParts[2]);
  const normalizedUrl = normalizeYouTubeUrl(sourceUrl);
  const id = slugify(`youtube-${videoId}`) || `youtube-${index + 1}`;

  return {
    id,
    groupId: id,
    queueId: id,
    mediaType: "youtube",
    youtubeVideoId: videoId,
    youtubeUrl: normalizedUrl,
    youtubeChannelUrl: "",
    videoPath: normalizedUrl,
    path: normalizedUrl,
    title,
    displayTitle: title,
    artist,
    displayArtist: artist,
    addedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    sortOrder: index,
    duration: Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_TRACK_DURATION_SECONDS,
    segmentIndex: 0,
    segmentCount: 1,
    segmentStart: 0,
    segmentOffset: 0
  };
}

export async function buildShuffleManifest({
  siteDir,
  linksPath = path.join(siteDir, "Shuffle", "youtube-links.txt"),
  metadataLookup = fetchYouTubeOEmbedMetadata
}) {
  const source = fs.existsSync(linksPath) ? fs.readFileSync(linksPath, "utf8") : "";
  let trackIndex = 0;
  const usedIds = new Set();
  const tracks = source
    .split(/\r?\n/)
    .map((line) => {
      const track = parseTrackLine(line, trackIndex);
      if (track) trackIndex += 1;
      return track;
    })
    .filter(Boolean)
    .map((track) => {
      let id = track.id;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${track.id}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      return {
        ...track,
        id,
        groupId: id,
        queueId: id
      };
    });

  const enrichedTracks = await Promise.all(tracks.map(async (track) => {
    if (typeof metadataLookup !== "function") return track;
    const metadata = await metadataLookup(track.youtubeUrl, track);
    return applyYouTubeMetadata(track, metadata);
  }));
  const orderedTracks = enrichedTracks.slice().sort((a, b) => {
    const orderA = Number(a?.sortOrder);
    const orderB = Number(b?.sortOrder);
    if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
      return orderB - orderA;
    }
    return 0;
  });

  return { tracks: orderedTracks };
}

export async function writeShuffleManifest({
  siteDir,
  linksPath = path.join(siteDir, "Shuffle", "youtube-links.txt"),
  outputPath,
  metadataLookup = fetchYouTubeOEmbedMetadata
}) {
  const manifest = await buildShuffleManifest({ siteDir, linksPath, metadataLookup });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export const __test = {
  extractYouTubeVideoId,
  cleanMetadataValue,
  fetchYouTubeOEmbedMetadata,
  applyYouTubeMetadata,
  parseTrackLine
};
