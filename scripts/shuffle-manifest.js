import fs from "node:fs";
import path from "node:path";

const DEFAULT_TRACK_DURATION_SECONDS = 0;
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

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
  const artist = metadataParts[1] || "YouTube";
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

export function buildShuffleManifest({
  siteDir,
  linksPath = path.join(siteDir, "Shuffle", "youtube-links.txt")
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

  return { tracks };
}

export function writeShuffleManifest({
  siteDir,
  linksPath = path.join(siteDir, "Shuffle", "youtube-links.txt"),
  outputPath
}) {
  const manifest = buildShuffleManifest({ siteDir, linksPath });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export const __test = {
  extractYouTubeVideoId,
  parseTrackLine
};
