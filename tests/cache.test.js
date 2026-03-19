import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCacheRequest,
  isFresh,
  isRetained,
  readCachedPayload,
  toStalePayload,
  writeCachedPayload
} from "../functions/lib/cache.js";

class MockCache {
  constructor() {
    this.store = new Map();
  }

  async match(request) {
    const key = typeof request === "string" ? request : request.url;
    return this.store.get(key);
  }

  async put(request, response) {
    const key = typeof request === "string" ? request : request.url;
    this.store.set(key, response);
  }
}

test("isFresh and isRetained classify cached payload age correctly", () => {
  const nowMs = Date.parse("2026-03-19T03:00:00.000Z");
  assert.equal(isFresh("2026-03-19T02:50:00.000Z", 900, nowMs), true);
  assert.equal(isFresh("2026-03-19T02:30:00.000Z", 900, nowMs), false);
  assert.equal(isRetained("2026-03-19T02:30:00.000Z", 86400, nowMs), true);
  assert.equal(isRetained("2026-03-17T02:30:00.000Z", 86400, nowMs), false);
});

test("buildCacheRequest strips search and hash from cache key", () => {
  const request = new Request("https://internet-angel.net/api/lastfm?x=1#frag");
  const cacheRequest = buildCacheRequest(request);
  assert.equal(cacheRequest.url, "https://internet-angel.net/api/lastfm");
});

test("writeCachedPayload stores a 200 response and readCachedPayload returns fresh state", async () => {
  const cache = new MockCache();
  const request = new Request("https://internet-angel.net/api/discord");
  const payload = {
    sourceStatus: "OK",
    stale: false,
    fetchedAt: "2026-03-19T03:00:00.000Z",
    data: { discord_user: {}, activities: [], discord_status: "online" }
  };

  await writeCachedPayload({
    cache,
    request,
    payload,
    retainTtlSec: 3600
  });

  const cached = await cache.match(request);
  assert.equal(cached.status, 200);

  const state = await readCachedPayload({
    cache,
    request,
    freshTtlSec: 900,
    retainTtlSec: 3600,
    nowMs: Date.parse("2026-03-19T03:10:00.000Z")
  });

  assert.equal(state.status, "fresh");
  assert.equal(state.payload.sourceStatus, "OK");
});

test("readCachedPayload returns retained state when payload is stale but still retained", async () => {
  const cache = new MockCache();
  const request = new Request("https://internet-angel.net/api/lastfm");
  await writeCachedPayload({
    cache,
    request,
    payload: {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: "2026-03-19T00:00:00.000Z",
      recenttracks: { track: [] },
      topartists: { artist: [] },
      topalbums: { album: [] },
      user: {},
      lovedtracks: { "@attr": { total: "0" } },
      nowPlaying: { nowPlaying: false, stale: false, fetchedAt: "2026-03-19T00:00:00.000Z", track: null }
    },
    retainTtlSec: 86400
  });

  const state = await readCachedPayload({
    cache,
    request,
    freshTtlSec: 900,
    retainTtlSec: 86400,
    nowMs: Date.parse("2026-03-19T04:00:00.000Z")
  });

  assert.equal(state.status, "retained");
  assert.equal(toStalePayload(state.payload, "PARTIAL").stale, true);
});

