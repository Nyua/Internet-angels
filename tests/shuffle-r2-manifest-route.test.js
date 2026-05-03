import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as onShuffleManifestRequest, __test as shuffleManifestRouteTest } from "../functions/assets/shuffle-manifest.json.js";

class MockListBucket {
  constructor(pages) {
    this.pages = pages;
    this.listCalls = [];
  }

  async list(options = {}) {
    this.listCalls.push(options);
    const pageIndex = options.cursor ? Number(options.cursor) : 0;
    const page = this.pages[pageIndex] || { objects: [] };
    return {
      objects: page.objects,
      truncated: page.truncated || false,
      cursor: page.cursor
    };
  }
}

function createContext({ bucket, next } = {}) {
  return {
    request: new Request("https://internet-angel.net/assets/shuffle-manifest.json"),
    env: bucket ? { MEDIA_BUCKET: bucket } : {},
    next
  };
}

test("shuffle R2 manifest route lists all supported music videos from the bucket", async () => {
  const bucket = new MockListBucket([
    {
      objects: [
        { key: "Shuffle/Thailand - Malcolm Todd.mp4", uploaded: "2026-05-02T03:27:49.404Z" },
        { key: "notes.txt", uploaded: "2026-05-03T00:00:00.000Z" },
        { key: "Shuffle/Raw Clip (1080p, h264).mp4", uploaded: "2026-05-03T00:00:00.000Z" }
      ],
      truncated: true,
      cursor: "1"
    },
    {
      objects: [
        { key: "Root Video - Artist.webm", uploaded: "2026-05-03T01:00:00.000Z" },
        { key: "Nested/Video - Artist.mp4", uploaded: "2026-05-03T02:00:00.000Z" },
        { key: "Shuffle/Root Video - Artist.webm", uploaded: "2026-05-03T03:00:00.000Z" }
      ]
    }
  ]);

  const response = await onShuffleManifestRequest(createContext({ bucket }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("X-Shuffle-Manifest-Source"), "r2");
  assert.equal(response.headers.get("X-Shuffle-Manifest-Count"), "4");
  assert.equal(response.headers.get("X-Shuffle-R2-Object-Count"), "6");
  assert.equal(response.headers.get("X-Shuffle-R2-Supported-Count"), "4");

  const manifest = await response.json();
  assert.deepEqual(manifest.tracks.map((track) => track.path), [
    "/Shuffle/Root%20Video%20-%20Artist.webm",
    "/Shuffle/Video%20-%20Artist.mp4?key=Nested%2FVideo%20-%20Artist.mp4",
    "/Shuffle/Raw%20Clip%20(1080p%2C%20h264).mp4",
    "/Shuffle/Thailand%20-%20Malcolm%20Todd.mp4"
  ]);
  assert.equal(manifest.tracks[0].title, "Root Video");
  assert.equal(manifest.tracks[0].artist, "Artist");
  assert.equal(manifest.tracks[0].mediaType, "video");
  assert.equal(bucket.listCalls.length, 2);
});

test("shuffle R2 manifest route falls back to the static asset when R2 has no tracks", async () => {
  const fallbackResponse = new Response(JSON.stringify({ tracks: [{ id: "static-track" }] }), {
    headers: {
      "Content-Type": "application/json"
    }
  });
  const response = await onShuffleManifestRequest(createContext({
    bucket: new MockListBucket([{ objects: [] }]),
    next: () => fallbackResponse
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Shuffle-Manifest-Source"), "static-fallback");
  assert.equal(response.headers.get("X-Shuffle-Manifest-Fallback"), "no-supported-r2-videos");
  assert.equal(response.headers.get("X-Shuffle-R2-Object-Count"), "0");
  assert.equal(response.headers.get("X-Shuffle-R2-Supported-Count"), "0");
  assert.deepEqual(await response.json(), { tracks: [{ id: "static-track" }] });
});

test("shuffle R2 manifest builder prefers Shuffle-prefixed duplicates", () => {
  const manifest = shuffleManifestRouteTest.buildManifestFromObjects([
    { key: "Same Name - Artist.mp4", uploaded: "2026-05-04T00:00:00.000Z" },
    { key: "Shuffle/Same Name - Artist.mp4", uploaded: "2026-05-03T00:00:00.000Z" }
  ]);

  assert.equal(manifest.tracks.length, 1);
  assert.equal(manifest.tracks[0].path, "/Shuffle/Same%20Name%20-%20Artist.mp4");
  assert.equal(manifest.tracks[0].addedAt, "2026-05-03T00:00:00.000Z");
});

test("shuffle R2 manifest builder keeps nested duplicate basenames addressable", () => {
  const manifest = shuffleManifestRouteTest.buildManifestFromObjects([
    { key: "First/Same Name - Artist.mp4", uploaded: "2026-05-04T00:00:00.000Z" },
    { key: "Second/Same Name - Artist.mp4", uploaded: "2026-05-03T00:00:00.000Z" }
  ]);

  assert.equal(manifest.tracks.length, 2);
  assert.deepEqual(manifest.tracks.map((track) => track.path), [
    "/Shuffle/Same%20Name%20-%20Artist.mp4?key=First%2FSame%20Name%20-%20Artist.mp4",
    "/Shuffle/Same%20Name%20-%20Artist.mp4?key=Second%2FSame%20Name%20-%20Artist.mp4"
  ]);
});
