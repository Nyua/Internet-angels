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

test("lastfm route prefers userloved from recent tracks and enriches discovery data", async () => {
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
                userloved: "1",
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
      if (method === "user.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              {
                name: "WIND CATCHER",
                artist: { name: "Quadeca" },
                playcount: "18",
                "@attr": { rank: "3" }
              }
            ]
          }
        });
      }
      if (method === "track.getsimilar") {
        return Response.json({
          similartracks: {
            track: [
              {
                name: "knowing we'll never know",
                artist: { name: "Quadeca" },
                url: "https://www.last.fm/music/Quadeca/_/knowing+we%27ll+never+know",
                match: "0.91"
              },
              {
                name: "House Settling",
                artist: { name: "Jane Remover" },
                url: "https://www.last.fm/music/Jane+Remover/_/House+Settling",
                match: "0.87"
              }
            ]
          }
        });
      }
      if (method === "track.gettoptags") {
        return Response.json({
          toptags: {
            tag: [
              { name: "digicore", url: "https://www.last.fm/tag/digicore" },
              { name: "glitch pop", url: "https://www.last.fm/tag/glitch+pop" },
              { name: "noise pop", url: "https://www.last.fm/tag/noise+pop" }
            ]
          }
        });
      }
      throw new Error(`Unexpected Last.fm method: ${method}`);
    };

    const response = await onLastFmRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(callUrls.length, 8);
    const recentTrackCalls = callUrls.filter((url) => url.includes("method=user.getrecenttracks"));
    assert.equal(recentTrackCalls.length, 1);
    assert.ok(recentTrackCalls.every((url) => new URL(url).searchParams.get("limit") !== "1"));
    assert.equal(callUrls.filter((url) => url.includes("method=user.gettoptracks")).length, 1);
    assert.equal(callUrls.filter((url) => url.includes("method=track.getsimilar")).length, 1);
    assert.equal(callUrls.filter((url) => url.includes("method=track.gettoptags")).length, 1);
    const trackInfoCalls = callUrls.filter((url) => url.includes("method=track.getInfo"));
    assert.equal(trackInfoCalls.length, 0);
    assert.equal(payload.nowPlaying.nowPlaying, true);
    assert.equal(payload.nowPlaying.track.title, "WIND CATCHER");
    assert.equal(payload.nowPlaying.track.artist, "Quadeca");
    assert.equal(payload.nowPlaying.track.isLoved, true);
    assert.equal(payload.nowPlaying.track.monthlyTopRank, 3);
    assert.equal(payload.nowPlaying.track.monthlyTopPlaycount, "18");
    assert.equal(payload.recenttracks.track[0].isLoved, true);
    assert.equal(payload.recenttracks.track[0].monthlyTopRank, 3);
    assert.equal(payload.toptracks.track[0]["@attr"].rank, "3");
    assert.equal(payload.discovery.referenceTrack.title, "WIND CATCHER");
    assert.deepEqual(payload.discovery.referenceTrack.topTags.map((entry) => entry.name), ["digicore", "glitch pop", "noise pop"]);
    assert.equal(payload.discovery.referenceTrack.similarTracks.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm route falls back to track.getInfo only when userloved is missing", async () => {
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
                image: [],
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
      if (method === "user.gettoptracks") {
        return Response.json({ toptracks: { track: [] } });
      }
      if (method === "track.getsimilar" || method === "track.gettoptags") {
        throw new Error(`Optional enrichment unavailable: ${method}`);
      }
      if (method === "track.getInfo") {
        return Response.json({
          track: {
            name: "WIND CATCHER",
            artist: { name: "Quadeca" },
            userloved: "1"
          }
        });
      }
      throw new Error(`Unexpected Last.fm method: ${method}`);
    };

    const response = await onLastFmRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(callUrls.filter((url) => url.includes("method=track.getInfo")).length, 1);
    assert.equal(payload.recenttracks.track[0].isLoved, true);
    assert.equal(payload.discovery.referenceTrack.title, "WIND CATCHER");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm route enriches top artists with fallback artist photos when Last.fm only returns placeholders", async () => {
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
      if (method === "user.gettoptracks") {
        return Response.json({ toptracks: { track: [] } });
      }
      if (requestUrl.origin === "https://api.deezer.com" && requestUrl.pathname === "/search/artist") {
        const query = requestUrl.searchParams.get("q");
        if (query === "Jane Remover") {
          return Response.json({
            data: [
              {
                name: "Jane Remover",
                picture_big: "https://cdn-images.dzcdn.net/images/artist/jane-remover-photo/500x500-000000-80-0-0.jpg"
              }
            ]
          });
        }
        if (query === "Quadeca") {
          return Response.json({
            data: [
              {
                name: "Quadeca",
                picture_big: "https://cdn-images.dzcdn.net/images/artist/quadeca-photo/500x500-000000-80-0-0.jpg"
              }
            ]
          });
        }
        return Response.json({ data: [] });
      }
      throw new Error(`Unexpected Last.fm method: ${method}`);
    };

    const response = await onLastFmRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(callUrls.filter((url) => url.startsWith("https://api.deezer.com/search/artist")).length, 2);
    assert.equal(payload.topartists.artist[0].artistPhotoUrl, "https://cdn-images.dzcdn.net/images/artist/jane-remover-photo/500x500-000000-80-0-0.jpg");
    assert.equal(payload.topartists.artist[1].artistPhotoUrl, "https://cdn-images.dzcdn.net/images/artist/quadeca-photo/500x500-000000-80-0-0.jpg");
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
