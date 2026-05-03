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

  let fileName = "";
  let isPreferredPrefix = false;
  if (key.startsWith(SHUFFLE_PREFIX)) {
    fileName = key.slice(SHUFFLE_PREFIX.length);
    isPreferredPrefix = true;
  } else if (!key.includes("/")) {
    fileName = key;
  }

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
    isPreferredPrefix,
    uploaded: object?.uploaded || object?.uploadedAt || object?.created || ""
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
  const recordsByFileName = new Map();
  for (const object of objects) {
    const record = getObjectFileRecord(object);
    if (!record) continue;
    const recordKey = record.fileName.toLowerCase();
    const existing = recordsByFileName.get(recordKey);
    if (!existing || (!existing.isPreferredPrefix && record.isPreferredPrefix)) {
      recordsByFileName.set(recordKey, record);
    }
  }

  const usedIds = new Set();
  const tracks = [...recordsByFileName.values()]
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
      const id = createUniqueId(`${displayCopy.title}-${displayCopy.artist}`, usedIds);
      const mediaPath = createShufflePath(record.fileName);
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

async function fallbackToStaticAsset(context) {
  if (typeof context.next === "function") {
    return context.next();
  }
  return jsonResponse({ tracks: [] });
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
    return fallbackToStaticAsset(context);
  }

  try {
    const manifest = buildManifestFromObjects(await listR2Objects(bucket));
    if (!manifest.tracks.length) {
      return fallbackToStaticAsset(context);
    }
    if (method === "HEAD") {
      const response = jsonResponse(manifest);
      return new Response(null, {
        status: response.status,
        headers: response.headers
      });
    }
    return jsonResponse(manifest);
  } catch {
    return fallbackToStaticAsset(context);
  }
}

export const __test = {
  buildManifestFromObjects,
  getObjectFileRecord
};
