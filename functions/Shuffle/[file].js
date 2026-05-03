const CACHE_CONTROL = "public, max-age=31536000, immutable";
const SHUFFLE_PREFIX = "Shuffle/";
const VIDEO_CONTENT_TYPES = new Map([
  [".m4v", "video/x-m4v"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"]
]);

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function getExtension(value) {
  const match = String(value || "").toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : "";
}

function normalizeRequestedFileName(value) {
  const rawFileName = Array.isArray(value) ? value.join("/") : String(value || "");
  const fileName = safeDecodeURIComponent(rawFileName).trim();
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || /[\x00-\x1F\x7F]/.test(fileName)) {
    return "";
  }
  return VIDEO_CONTENT_TYPES.has(getExtension(fileName)) ? fileName : "";
}

function parseRangeHeader(rangeHeader, totalSize) {
  const size = Number(totalSize);
  if (!Number.isSafeInteger(size) || size < 1) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader || "").trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength < 1) return null;
    const start = Math.max(size - suffixLength, 0);
    return {
      start,
      end: size - 1,
      length: size - start
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0) return null;
  if (start >= size || requestedEnd < start) return null;

  const end = Math.min(requestedEnd, size - 1);
  return {
    start,
    end,
    length: end - start + 1
  };
}

function createMediaHeaders(object, fileName, contentLength) {
  const headers = new Headers();
  if (typeof object?.writeHttpMetadata === "function") {
    object.writeHttpMetadata(headers);
  }
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", VIDEO_CONTENT_TYPES.get(getExtension(fileName)) || "application/octet-stream");
  }
  if (object?.httpEtag) {
    headers.set("ETag", object.httpEtag);
  }
  if (Number.isFinite(contentLength)) {
    headers.set("Content-Length", String(contentLength));
  }
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", CACHE_CONTROL);
  return headers;
}

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function getMediaKeys(fileName) {
  return [
    `${SHUFFLE_PREFIX}${fileName}`,
    fileName
  ];
}

async function headMediaObject(bucket, fileName) {
  for (const key of getMediaKeys(fileName)) {
    const object = await bucket.head(key);
    if (object) {
      return { key, object };
    }
  }
  return null;
}

async function getMediaObject(bucket, fileName, options) {
  for (const key of getMediaKeys(fileName)) {
    const object = await bucket.get(key, options);
    if (object) {
      return { key, object };
    }
  }
  return null;
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
  if (!bucket || typeof bucket.get !== "function" || typeof bucket.head !== "function") {
    return new Response("Shuffle media bucket is not configured", {
      status: 503,
      headers: {
        "Cache-Control": "no-store"
      }
    });
  }

  const fileName = normalizeRequestedFileName(context.params?.file);
  if (!fileName) return notFound();

  const rangeHeader = context.request.headers.get("Range");
  if (rangeHeader) {
    const metadataResult = await headMediaObject(bucket, fileName);
    if (!metadataResult) return notFound();
    const metadata = metadataResult.object;

    const range = parseRangeHeader(rangeHeader, metadata.size);
    if (!range) {
      const headers = createMediaHeaders(metadata, fileName, 0);
      headers.set("Content-Range", `bytes */${metadata.size}`);
      headers.delete("Content-Length");
      return new Response(null, {
        status: 416,
        headers
      });
    }

    const object = method === "HEAD"
      ? metadata
      : (await getMediaObject(bucket, fileName, { range: { offset: range.start, length: range.length } }))?.object;
    if (!object) return notFound();

    const headers = createMediaHeaders(object, fileName, range.length);
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${metadata.size}`);
    return new Response(method === "HEAD" ? null : object.body, {
      status: 206,
      headers
    });
  }

  const object = method === "HEAD"
    ? (await headMediaObject(bucket, fileName))?.object
    : (await getMediaObject(bucket, fileName))?.object;
  if (!object) return notFound();

  const headers = createMediaHeaders(object, fileName, object.size);
  return new Response(method === "HEAD" ? null : object.body, {
    status: 200,
    headers
  });
}
