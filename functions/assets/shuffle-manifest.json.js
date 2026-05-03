const CACHE_CONTROL = "public, max-age=120, stale-while-revalidate=600";
const SHUFFLE_PREFIX = "Shuffle/";
const VIDEO_EXTENSIONS = new Set([
  ".m4v",
  ".mov",
  ".mp4",
  ".webm"
]);
const RAW_SOURCE_VIDEO_PATTERN = /\(\s*1080p\s*,\s*h264\s*\)/i;
const R2_LIST_LIMIT = 1000;

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

function getExtension(value) {
  const match = String(value || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function isSupportedVideoFile(fileName) {
  return VIDEO_EXTENSIONS.has(getExtension(fileName)) && !RAW_SOURCE_VIDEO_PATTERN.test(String(fileName || ""));
}

function createShufflePath(fileName) {
  return `/${SHUFFLE_PREFIX}${String(fileName || "").split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function createMediaPath(record) {
  const basePath = createShufflePath(record.fileName);
  const canonicalShuffleKey = `${SHUFFLE_PREFIX}${record.fileName}`;
  const canonicalRootKey = record.fileName;
  if (record.key === canonicalShuffleKey || record.key === canonicalRootKey) {
    return basePath;
  }
  return `${basePath}?key=${encodeURIComponent(record.key)}`;
}

function parseDisplayCopy(fileName) {
  const baseName = String(fileName || "").replace(/\.[^/.]+$/, "").trim();
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

function getObjectFileRecord(object) {
  const key = String(object?.key || "").trim();
  if (!key || key.endsWith("/")) return null;

  const keySegments = key.split("/").filter(Boolean);
  let fileName = keySegments[keySegments.length - 1] || "";
  fileName = safeDecodeURIComponent(fileName).trim();
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || /[\x00-\x1F\x7F]/.test(fileName)) {
    return null;
  }
  if (!isSupportedVideoFile(fileName)) {
    return null;
  }

  return {
    key,
    fileName,
    isPreferredPrefix: key === `${SHUFFLE_PREFIX}${fileName}`,
    isRootFile: key === fileName,
    uploaded: object?.uploaded || object?.uploadedAt || object?.created || ""
  };
}

function getRecordDedupeKey(record) {
  const fileNameKey = String(record?.fileName || "").toLowerCase();
  if (record?.isPreferredPrefix || record?.isRootFile) {
    return `canonical:${fileNameKey}`;
  }
  return `key:${String(record?.key || "").toLowerCase()}`;
}

function summarizeR2Objects(objects, manifest) {
  const objectKeys = Array.isArray(objects)
    ? objects.map((object) => String(object?.key || "").trim()).filter(Boolean)
    : [];
  return {
    objectCount: objectKeys.length,
    supportedCount: Array.isArray(manifest?.tracks) ? manifest.tracks.length : 0,
    sampleKeys: objectKeys.slice(0, 6)
  };
}

async function listR2Objects(bucket) {
  const objects = [];
  let cursor = undefined;
  do {
    const result = await bucket.list({
      cursor,
      limit: R2_LIST_LIMIT
    });
    if (Array.isArray(result?.objects)) {
      objects.push(...result.objects);
    }
    cursor = result?.truncated ? result?.cursor : undefined;
  } while (cursor);
  return objects;
}

function buildManifestFromObjects(objects) {
  const recordsByDedupeKey = new Map();
  for (const object of objects) {
    const record = getObjectFileRecord(object);
    if (!record) continue;
    const recordKey = getRecordDedupeKey(record);
    const existing = recordsByDedupeKey.get(recordKey);
    if (
      !existing
      || (!existing.isPreferredPrefix && record.isPreferredPrefix)
      || (!existing.isPreferredPrefix && !existing.isRootFile && record.isRootFile)
    ) {
      recordsByDedupeKey.set(recordKey, record);
    }
  }

  const usedIds = new Set();
  const tracks = [...recordsByDedupeKey.values()]
    .sort((left, right) => {
      const leftUploaded = Date.parse(String(left.uploaded || ""));
      const rightUploaded = Date.parse(String(right.uploaded || ""));
      const safeLeftUploaded = Number.isFinite(leftUploaded) ? leftUploaded : 0;
      const safeRightUploaded = Number.isFinite(rightUploaded) ? rightUploaded : 0;
      if (safeRightUploaded !== safeLeftUploaded) {
        return safeRightUploaded - safeLeftUploaded;
      }
      return left.fileName.localeCompare(right.fileName);
    })
    .map((record) => {
      const displayCopy = parseDisplayCopy(record.fileName);
      const id = createUniqueId(`${displayCopy.title}-${displayCopy.artist}-${record.key}`, usedIds);
      const mediaPath = createMediaPath(record);
      const uploadedDate = Date.parse(String(record.uploaded || ""));
      return {
        id,
        groupId: id,
        mediaType: "video",
        videoPath: mediaPath,
        title: displayCopy.title,
        displayTitle: displayCopy.title,
        artist: displayCopy.artist,
        displayArtist: displayCopy.artist,
        path: mediaPath,
        addedAt: Number.isFinite(uploadedDate) ? new Date(uploadedDate).toISOString() : new Date(0).toISOString(),
        segmentIndex: 0,
        segmentCount: 1,
        segmentStart: 0,
        segmentOffset: 0
      };
    });

  return { tracks };
}

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", init.cacheControl || CACHE_CONTROL);
  return new Response(JSON.stringify(payload, null, 2), {
    status: init.status || 200,
    headers
  });
}

function addManifestHeaders(response, { source, count, reason, r2Summary } = {}) {
  const headers = new Headers(response.headers);
  if (source) headers.set("X-Shuffle-Manifest-Source", source);
  if (Number.isFinite(count)) headers.set("X-Shuffle-Manifest-Count", String(count));
  if (reason) headers.set("X-Shuffle-Manifest-Fallback", reason);
  if (r2Summary) {
    headers.set("X-Shuffle-R2-Object-Count", String(r2Summary.objectCount || 0));
    headers.set("X-Shuffle-R2-Supported-Count", String(r2Summary.supportedCount || 0));
    if (Array.isArray(r2Summary.sampleKeys) && r2Summary.sampleKeys.length) {
      headers.set("X-Shuffle-R2-Sample-Keys", r2Summary.sampleKeys.join(" | ").slice(0, 480));
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function fallbackToStaticAsset(context, reason = "unavailable", r2Summary = null) {
  if (typeof context.next === "function") {
    const response = await context.next();
    return addManifestHeaders(response, {
      source: "static-fallback",
      reason,
      r2Summary
    });
  }
  return addManifestHeaders(jsonResponse({ tracks: [] }), {
    source: "static-fallback",
    count: 0,
    reason,
    r2Summary
  });
}

export async function onRequest(context) {
  const method = String(context.request.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: {
        Allow: "GET, HEAD"
      }
    });
  }

  const bucket = context.env?.MEDIA_BUCKET;
  if (!bucket || typeof bucket.list !== "function") {
    return fallbackToStaticAsset(context, "missing-media-bucket-binding");
  }

  try {
    const objects = await listR2Objects(bucket);
    const manifest = buildManifestFromObjects(objects);
    const r2Summary = summarizeR2Objects(objects, manifest);
    if (!manifest.tracks.length) {
      return fallbackToStaticAsset(context, "no-supported-r2-videos", r2Summary);
    }
    if (method === "HEAD") {
      const response = addManifestHeaders(jsonResponse(manifest), {
        source: "r2",
        count: manifest.tracks.length,
        r2Summary
      });
      return new Response(null, {
        status: response.status,
        headers: response.headers
      });
    }
    return addManifestHeaders(jsonResponse(manifest), {
      source: "r2",
      count: manifest.tracks.length,
      r2Summary
    });
  } catch {
    return fallbackToStaticAsset(context, "r2-list-failed");
  }
}

export const __test = {
  buildManifestFromObjects,
  getObjectFileRecord
};
