import fs from "node:fs";
import path from "node:path";

const SHUFFLE_AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav"
]);

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createShufflePath(fileName) {
  return `/Shuffle/${String(fileName || "").split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function normalizeShufflePath(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  let pathname = source;
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
    }
  }
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => safeDecodeURIComponent(segment));
  if (segments[0] !== "Shuffle" || segments.length < 2) {
    return "";
  }
  return createShufflePath(segments.slice(1).join("/"));
}

function isSupportedShuffleAudioFile(fileName) {
  return SHUFFLE_AUDIO_EXTENSIONS.has(path.extname(String(fileName || "")).toLowerCase());
}

function parseShuffleDisplayCopy(fileName) {
  const baseName = path.basename(String(fileName || ""), path.extname(String(fileName || ""))).trim();
  if (!baseName) {
    return {
      title: "Untitled Track",
      artist: "Unknown Artist"
    };
  }
  const parts = baseName.split(/\s+-\s+/).map((token) => token.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const artist = parts.pop() || "Unknown Artist";
    const title = parts.join(" - ") || baseName;
    return { title, artist };
  }
  return {
    title: baseName,
    artist: "Unknown Artist"
  };
}

function sortTracks(tracks) {
  return tracks.slice().sort((left, right) => {
    const leftAddedAt = Date.parse(String(left?.addedAt || ""));
    const rightAddedAt = Date.parse(String(right?.addedAt || ""));
    const safeLeftAddedAt = Number.isFinite(leftAddedAt) ? leftAddedAt : 0;
    const safeRightAddedAt = Number.isFinite(rightAddedAt) ? rightAddedAt : 0;
    if (safeRightAddedAt !== safeLeftAddedAt) {
      return safeRightAddedAt - safeLeftAddedAt;
    }
    const leftSegmentIndex = Number.isFinite(Number(left?.segmentIndex)) ? Number(left.segmentIndex) : 0;
    const rightSegmentIndex = Number.isFinite(Number(right?.segmentIndex)) ? Number(right.segmentIndex) : 0;
    if (leftSegmentIndex !== rightSegmentIndex) {
      return leftSegmentIndex - rightSegmentIndex;
    }
    return String(left?.title || "").localeCompare(String(right?.title || ""));
  });
}

function readManualManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return Array.isArray(parsed?.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

function createUniqueId(seedValue, usedIds) {
  const baseId = slugify(seedValue) || "shuffle-track";
  let nextId = baseId;
  let suffix = 2;
  while (usedIds.has(nextId)) {
    nextId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(nextId);
  return nextId;
}

function normalizeManualTrackEntry(entry, normalizedPath, availableFilesByPath) {
  const availableFile = availableFilesByPath.get(normalizedPath);
  if (!availableFile) return null;
  const fallbackCopy = parseShuffleDisplayCopy(availableFile.fileName);
  const id = String(entry?.id || "").trim();
  const groupId = String(entry?.groupId || id || normalizedPath).trim();
  const normalizedEntry = {
    ...entry,
    id,
    groupId,
    path: normalizedPath,
    title: String(entry?.title || "").trim() || fallbackCopy.title,
    displayTitle: String(entry?.displayTitle || "").trim() || String(entry?.title || "").trim() || fallbackCopy.title,
    artist: String(entry?.artist || "").trim() || fallbackCopy.artist,
    displayArtist: String(entry?.displayArtist || "").trim() || String(entry?.artist || "").trim() || fallbackCopy.artist,
    addedAt: String(entry?.addedAt || "").trim() || new Date(availableFile.stats.mtimeMs).toISOString(),
    segmentIndex: Number.isFinite(Number(entry?.segmentIndex)) ? Math.max(0, Math.floor(Number(entry.segmentIndex))) : 0,
    segmentCount: Number.isFinite(Number(entry?.segmentCount)) ? Math.max(1, Math.floor(Number(entry.segmentCount))) : 1,
    segmentStart: Number.isFinite(Number(entry?.segmentStart)) ? Math.max(0, Number(entry.segmentStart)) : 0,
    segmentOffset: Number.isFinite(Number(entry?.segmentOffset)) ? Math.max(0, Number(entry.segmentOffset)) : 0
  };
  if (normalizedEntry.nextTrackId != null && !String(normalizedEntry.nextTrackId).trim()) {
    delete normalizedEntry.nextTrackId;
  }
  if (!(Number.isFinite(Number(normalizedEntry.segmentEnd)) && Number(normalizedEntry.segmentEnd) > 0)) {
    delete normalizedEntry.segmentEnd;
  }
  if (!(Number.isFinite(Number(normalizedEntry.groupDuration)) && Number(normalizedEntry.groupDuration) > 0)) {
    delete normalizedEntry.groupDuration;
  }
  return normalizedEntry;
}

function buildAutoTrackEntry(fileRecord, usedIds) {
  const displayCopy = parseShuffleDisplayCopy(fileRecord.fileName);
  const id = createUniqueId(`${displayCopy.title}-${displayCopy.artist}`, usedIds);
  return {
    id,
    groupId: id,
    title: displayCopy.title,
    displayTitle: displayCopy.title,
    artist: displayCopy.artist,
    displayArtist: displayCopy.artist,
    path: fileRecord.path,
    addedAt: new Date(fileRecord.stats.mtimeMs).toISOString(),
    segmentIndex: 0,
    segmentCount: 1,
    segmentStart: 0,
    segmentOffset: 0
  };
}

export function buildShuffleManifest({
  siteDir,
  shuffleDir = path.join(siteDir, "Shuffle"),
  manifestPath = path.join(siteDir, "assets", "shuffle-manifest.json")
}) {
  const availableFiles = fs.existsSync(shuffleDir)
    ? fs.readdirSync(shuffleDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isSupportedShuffleAudioFile(entry.name))
      .map((entry) => {
        const filePath = path.join(shuffleDir, entry.name);
        return {
          fileName: entry.name,
          filePath,
          path: createShufflePath(entry.name),
          stats: fs.statSync(filePath)
        };
      })
    : [];
  const availableFilesByPath = new Map(availableFiles.map((fileRecord) => [fileRecord.path, fileRecord]));
  const manualGroups = new Map();
  for (const entry of readManualManifest(manifestPath)) {
    const normalizedPath = normalizeShufflePath(entry?.path);
    if (!normalizedPath) continue;
    const groupKey = String(entry?.groupId || entry?.id || normalizedPath).trim();
    const group = manualGroups.get(groupKey) || [];
    group.push({
      entry,
      normalizedPath
    });
    manualGroups.set(groupKey, group);
  }

  const keptManualTracks = [];
  const manualPaths = new Set();
  const usedIds = new Set();
  for (const groupEntries of manualGroups.values()) {
    const everyTrackExists = groupEntries.every((groupEntry) => availableFilesByPath.has(groupEntry.normalizedPath));
    if (!everyTrackExists) continue;
    const normalizedGroupEntries = groupEntries
      .map((groupEntry) => normalizeManualTrackEntry(groupEntry.entry, groupEntry.normalizedPath, availableFilesByPath))
      .filter(Boolean);
    const sortedGroupEntries = normalizedGroupEntries.slice().sort((left, right) => {
      const leftSegmentIndex = Number.isFinite(Number(left?.segmentIndex)) ? Number(left.segmentIndex) : 0;
      const rightSegmentIndex = Number.isFinite(Number(right?.segmentIndex)) ? Number(right.segmentIndex) : 0;
      return leftSegmentIndex - rightSegmentIndex;
    });
    const validIds = new Set(sortedGroupEntries.map((entry) => String(entry?.id || "").trim()).filter(Boolean));
    for (const entry of sortedGroupEntries) {
      if (!entry.id) {
        entry.id = createUniqueId(`${entry.groupId}-${entry.path}`, usedIds);
      } else {
        usedIds.add(entry.id);
      }
      if (entry.nextTrackId && !validIds.has(String(entry.nextTrackId).trim())) {
        delete entry.nextTrackId;
      }
      keptManualTracks.push(entry);
      manualPaths.add(entry.path);
    }
  }

  const autoTracks = availableFiles
    .filter((fileRecord) => !manualPaths.has(fileRecord.path))
    .sort((left, right) => {
      if (right.stats.mtimeMs !== left.stats.mtimeMs) {
        return right.stats.mtimeMs - left.stats.mtimeMs;
      }
      return left.fileName.localeCompare(right.fileName);
    })
    .map((fileRecord) => buildAutoTrackEntry(fileRecord, usedIds));

  return {
    tracks: sortTracks([...keptManualTracks, ...autoTracks])
  };
}

export function writeShuffleManifest({
  siteDir,
  shuffleDir = path.join(siteDir, "Shuffle"),
  manifestPath = path.join(siteDir, "assets", "shuffle-manifest.json"),
  outputPath
}) {
  const manifest = buildShuffleManifest({ siteDir, shuffleDir, manifestPath });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}
