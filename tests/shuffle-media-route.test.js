import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as onShuffleMediaRequest } from "../functions/Shuffle/[file].js";

class MockMediaBucket {
  constructor(entries) {
    this.entries = new Map(Object.entries(entries));
    this.getCalls = [];
    this.headCalls = [];
  }

  async head(key) {
    this.headCalls.push(key);
    const entry = this.entries.get(key);
    return entry ? createMockObject(entry, entry.content) : null;
  }

  async get(key, options) {
    this.getCalls.push({ key, options });
    const entry = this.entries.get(key);
    if (!entry) return null;

    const range = options?.range;
    const content = range
      ? entry.content.slice(range.offset, range.offset + range.length)
      : entry.content;
    return createMockObject(entry, content);
  }
}

function createMockObject(entry, body) {
  return {
    body,
    size: entry.content.length,
    httpEtag: '"test-etag"',
    writeHttpMetadata(headers) {
      headers.set("Content-Type", entry.contentType || "video/mp4");
    }
  };
}

function createContext({ file = "Thailand - Malcolm Todd.mp4", headers = {}, env } = {}) {
  return {
    request: new Request(`https://internet-angel.net/Shuffle/${encodeURIComponent(file)}`, {
      method: "GET",
      headers
    }),
    params: { file },
    env
  };
}

test("shuffle media route streams full R2 video objects on the main-domain path", async () => {
  const bucket = new MockMediaBucket({
    "Shuffle/Thailand - Malcolm Todd.mp4": {
      content: "0123456789",
      contentType: "video/mp4"
    }
  });

  const response = await onShuffleMediaRequest(createContext({
    env: { MEDIA_BUCKET: bucket }
  }));

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789");
  assert.equal(response.headers.get("Content-Type"), "video/mp4");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.equal(response.headers.get("Content-Length"), "10");
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.deepEqual(bucket.getCalls, [
    { key: "Shuffle/Thailand - Malcolm Todd.mp4", options: undefined }
  ]);
});

test("shuffle media route supports single byte ranges for video seeking", async () => {
  const bucket = new MockMediaBucket({
    "Shuffle/Thailand - Malcolm Todd.mp4": {
      content: "0123456789",
      contentType: "video/mp4"
    }
  });

  const response = await onShuffleMediaRequest(createContext({
    headers: {
      Range: "bytes=2-5"
    },
    env: { MEDIA_BUCKET: bucket }
  }));

  assert.equal(response.status, 206);
  assert.equal(await response.text(), "2345");
  assert.equal(response.headers.get("Content-Range"), "bytes 2-5/10");
  assert.equal(response.headers.get("Content-Length"), "4");
  assert.deepEqual(bucket.headCalls, ["Shuffle/Thailand - Malcolm Todd.mp4"]);
  assert.deepEqual(bucket.getCalls, [
    {
      key: "Shuffle/Thailand - Malcolm Todd.mp4",
      options: {
        range: {
          offset: 2,
          length: 4
        }
      }
    }
  ]);
});

test("shuffle media route rejects unsafe paths before reaching R2", async () => {
  const bucket = new MockMediaBucket({});

  const response = await onShuffleMediaRequest(createContext({
    file: "../secret.mp4",
    env: { MEDIA_BUCKET: bucket }
  }));

  assert.equal(response.status, 404);
  assert.deepEqual(bucket.headCalls, []);
  assert.deepEqual(bucket.getCalls, []);
});

test("shuffle media route fails closed when the R2 binding is missing", async () => {
  const response = await onShuffleMediaRequest(createContext({
    env: {}
  }));

  assert.equal(response.status, 503);
  assert.equal(await response.text(), "Shuffle media bucket is not configured");
});
