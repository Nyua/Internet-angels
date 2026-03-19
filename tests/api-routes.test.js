import test from "node:test";
import assert from "node:assert/strict";

import { onRequest as onDiscordRequest } from "../functions/api/discord.js";
import { onRequest as onLastFmRequest } from "../functions/api/lastfm.js";
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

test("lastfm route derives now playing from recent tracks and only performs five upstream calls", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm");
  const callUrls = [];

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const resourceUrl = String(resource);
      callUrls.push(resourceUrl);
      const requestUrl = new URL(resourceUrl);
      const method = requestUrl.searchParams.get("method");
      if (method === "user.getrecenttracks") {
        return Response.json({
          recenttracks: {
            track: [
              {
                name: "WIND CATCHER",
                artist: { name: "Quadeca" },
                album: { "#text": "Vanisher" },
                image: [
                  { "#text": "" },
                  { "#text": "https://example.com/art.jpg" }
                ],
                url: "https://www.last.fm/music/Quadeca/_/WIND+CATCHER",
                "@attr": { nowplaying: "true" }
              }
            ]
          }
        });
      }
      if (method === "user.gettopartists") {
        return Response.json({ topartists: { artist: [] } });
      }
      if (method === "user.gettopalbums") {
        return Response.json({ topalbums: { album: [] } });
      }
      if (method === "user.getinfo") {
        return Response.json({ user: { playcount: "65188" } });
      }
      if (method === "user.getlovedtracks") {
        return Response.json({ lovedtracks: { "@attr": { total: "1197" } } });
      }
      throw new Error(`Unexpected Last.fm method: ${method}`);
    };

    const response = await onLastFmRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(callUrls.length, 5);
    const recentTrackCalls = callUrls.filter((url) => url.includes("method=user.getrecenttracks"));
    assert.equal(recentTrackCalls.length, 1);
    assert.ok(recentTrackCalls.every((url) => new URL(url).searchParams.get("limit") !== "1"));
    assert.equal(payload.nowPlaying.nowPlaying, true);
    assert.equal(payload.nowPlaying.track.title, "WIND CATCHER");
    assert.equal(payload.nowPlaying.track.artist, "Quadeca");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm route enriches top artists with artist photos from Last.fm image galleries", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm");
  const callUrls = [];

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const resourceUrl = String(resource);
      callUrls.push(resourceUrl);
      const requestUrl = new URL(resourceUrl);
      const method = requestUrl.searchParams.get("method");
      if (method === "user.getrecenttracks") {
        return Response.json({ recenttracks: { track: [] } });
      }
      if (method === "user.gettopartists") {
        return Response.json({
          topartists: {
            artist: [
              {
                name: "Jane Remover",
                playcount: "44",
                image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/34s/2a96cbd8b46e442fc41c2b86b821562f.png", size: "large" }],
                url: "https://www.last.fm/music/Jane+Remover"
              },
              {
                name: "Quadeca",
                playcount: "39",
                image: [{ "#text": "", size: "large" }],
                url: "https://www.last.fm/music/Quadeca"
              }
            ]
          }
        });
      }
      if (method === "user.gettopalbums") {
        return Response.json({ topalbums: { album: [] } });
      }
      if (method === "user.getinfo") {
        return Response.json({ user: { playcount: "65188" } });
      }
      if (method === "user.getlovedtracks") {
        return Response.json({ lovedtracks: { "@attr": { total: "1197" } } });
      }
      if (requestUrl.origin === "https://www.last.fm" && requestUrl.pathname.endsWith("/+images")) {
        const artistName = requestUrl.pathname.split("/").at(-2)?.replace(/\+/g, " ") || "artist";
        const artistHash = artistName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        return new Response(
          `<html><body><a href="${requestUrl.pathname}/03825d251683ecdcac1e427347a2abb0"><img src="https://lastfm.freetls.fastly.net/i/u/avatar170s/${artistHash}-preferred-photo" alt="Preferred image" /></a></body></html>`,
          {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" }
          }
        );
      }
      throw new Error(`Unexpected Last.fm method: ${method}`);
    };

    const response = await onLastFmRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(callUrls.filter((url) => url.startsWith("https://www.last.fm/music/") && url.endsWith("/+images")).length, 2);
    assert.equal(payload.topartists.artist[0].artistPhotoUrl, "https://lastfm.freetls.fastly.net/i/u/avatar170s/jane-remover-preferred-photo");
    assert.equal(payload.topartists.artist[1].artistPhotoUrl, "https://lastfm.freetls.fastly.net/i/u/avatar170s/quadeca-preferred-photo");
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
