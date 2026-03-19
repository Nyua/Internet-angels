import test from "node:test";
import assert from "node:assert/strict";

import { onRequest as onDiscordRequest } from "../functions/api/discord.js";
import { onRequest as onLastFmRequest } from "../functions/api/lastfm.js";
import { onRequest as onLastFmNowPlayingRequest } from "../functions/api/lastfm-now-playing.js";
import { onRequest as onSteamRequest } from "../functions/api/steam-recent-activity.js";
import { writeCachedPayload } from "../functions/lib/cache.js";
import { normalizeDiscordPayload } from "../functions/lib/discord.js";

class MockCache {
  constructor() {
    this.store = new Map();
  }

  async match(request) {
    const key = request instanceof Request ? request.url : String(request);
    const response = this.store.get(key);
    return response ? response.clone() : undefined;
  }

  async put(request, response) {
    const key = request instanceof Request ? request.url : String(request);
    this.store.set(key, response.clone());
  }
}

function createSameOriginRequest(pathname) {
  return new Request(`https://internet-angel.net${pathname}`, {
    method: "GET",
    headers: {
      host: "internet-angel.net",
      origin: "https://internet-angel.net"
    }
  });
}

async function primeCache(cache, request, payload, retainTtlSec) {
  await writeCachedPayload({
    cache,
    request,
    payload,
    retainTtlSec
  });
}

test("normalizeDiscordPayload returns PARTIAL for empty upstream data", () => {
  const payload = normalizeDiscordPayload({ data: {} }, Date.parse("2026-03-19T00:00:00.000Z"));
  assert.equal(payload.sourceStatus, "PARTIAL");
  assert.equal(payload.data.discord_status, "offline");
});

test("lastfm route returns retained stale payload when upstream fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      throw new Error("boom");
    };

    await primeCache(cache, request, {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      recenttracks: { track: [] },
      topartists: { artist: [] },
      topalbums: { album: [] },
      user: { playcount: "65111" },
      lovedtracks: { "@attr": { total: "3872" } },
      nowPlaying: {
        nowPlaying: false,
        stale: false,
        fetchedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
        track: null
      }
    }, 24 * 60 * 60);

    const response = await onLastFmRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.user.playcount, "65111");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm-now-playing route returns retained stale payload when upstream fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-now-playing");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      throw new Error("boom");
    };

    await primeCache(cache, request, {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      nowPlaying: true,
      track: {
        title: "WIND CATCHER",
        artist: "Quadeca",
        album: "Vanisher",
        artworkUrl: "https://example.com/art.jpg",
        url: "https://www.last.fm/music/Quadeca/_/WIND+CATCHER"
      }
    }, 15 * 60);

    const response = await onLastFmNowPlayingRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.track.title, "WIND CATCHER");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("discord route returns retained stale payload when upstream fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/discord");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      throw new Error("boom");
    };

    await primeCache(cache, request, {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      data: {
        discord_user: { id: "331350000154050560", username: "foundlifeless" },
        activities: [],
        discord_status: "online"
      }
    }, 6 * 60 * 60);

    const response = await onDiscordRequest({ request, env: {} });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.data.discord_user.username, "foundlifeless");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("steam route returns retained stale payload when upstream fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/steam-recent-activity");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      throw new Error("boom");
    };

    await primeCache(cache, request, {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString(),
      profile: { name: "Josie" },
      stats: [{ label: "Recent Games", value: "1" }],
      items: [{ id: "steam-1", title: "Synthetik 2", meta: "84.2h / 2 wks" }]
    }, 7 * 24 * 60 * 60);

    const response = await onSteamRequest({ request, env: {} });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.profile.name, "Josie");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});
