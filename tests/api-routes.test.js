import test from "node:test";
import assert from "node:assert/strict";

import { onRequest as onDiscordRequest } from "../functions/api/discord.js";
import { onRequest as onLastFmAlbumDetailsRequest } from "../functions/api/lastfm-album-details.js";
import { onRequest as onLastFmArtistDetailsRequest } from "../functions/api/lastfm-artist-details.js";
import { onRequest as onLastFmRequest } from "../functions/api/lastfm.js";
import { onRequest as onLastFmTrackDetailsRequest } from "../functions/api/lastfm-track-details.js";
import { onRequest as onSteamRequest } from "../functions/api/steam-recent-activity.js";
import { writeCachedPayload } from "../functions/lib/cache.js";
import { normalizeDiscordPayload } from "../functions/lib/discord.js";
import { buildLastFmDetailsCacheRequest } from "../functions/lib/lastfm-details-route.js";

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
  assert.equal(payload.presence.statusKey, "offline");
  assert.equal(payload.presence.spotify.isListening, false);
});

test("normalizeDiscordPayload preserves spotify and nitro presence fields", () => {
  const payload = normalizeDiscordPayload({
    data: {
      discord_user: {
        id: "331350000154050560",
        username: "foundlifeless",
        global_name: "FoundLifeless",
        avatar: "avatar-hash",
        banner: "a_banner-hash",
        avatar_decoration_data: {
          asset: "a_decoration-asset"
        },
        premium_type: 2
      },
      discord_status: "online",
      listening_to_spotify: true,
      spotify: {
        song: "up + down",
        artist: "idkwhyy",
        album: "Crush",
        album_art_url: "https://i.scdn.co/image/example",
        track_id: "spotify-track-123"
      },
      activities: [
        { type: 4, state: "existing" }
      ]
    }
  }, Date.parse("2026-03-25T00:00:00.000Z"));
  assert.equal(payload.sourceStatus, "OK");
  assert.equal(payload.data.listening_to_spotify, true);
  assert.equal(payload.presence.hasNitro, true);
  assert.equal(payload.presence.displayName, "FoundLifeless");
  assert.equal(payload.presence.avatarUrl, "https://cdn.discordapp.com/avatars/331350000154050560/avatar-hash.png?size=256");
  assert.equal(payload.presence.avatarDecorationUrl, "https://cdn.discordapp.com/avatar-decoration-presets/a_decoration-asset.png?size=160&passthrough=true");
  assert.equal(payload.presence.bannerUrl, "https://cdn.discordapp.com/banners/331350000154050560/a_banner-hash.gif?size=640");
  assert.equal(payload.presence.primaryActivity.label, "Listening to");
  assert.equal(payload.presence.spotify.albumArtUrl, "https://i.scdn.co/image/example");
  assert.equal(payload.presence.spotify.trackUrl, "https://open.spotify.com/track/spotify-track-123");
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

test("lastfm route aborts hung upstreams before the browser request timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm");
  const startedAt = Date.now();

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (_resource, init = {}) => {
      return await new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(init.signal.reason || new Error("aborted"));
        }, { once: true });
      });
    };

    const response = await onLastFmRequest({
      request,
      env: {
        LASTFM_API_KEY: "test-key",
        LASTFM_ROUTE_TIMEOUT_MS: "25"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 504);
    assert.equal(payload.error, "Last.fm upstream timed out");
    assert.ok(Date.now() - startedAt < 1_000);
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

test("lastfm track details route enforces same-origin and validates required query params", async () => {
  const badOriginRequest = new Request("https://internet-angel.net/api/lastfm-track-details?artist=beabadoobee&track=One%20Time", {
    method: "GET",
    headers: {
      host: "internet-angel.net",
      origin: "https://example.com"
    }
  });
  const missingTrackRequest = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee");

  const badOriginResponse = await onLastFmTrackDetailsRequest({
    request: badOriginRequest,
    env: { LASTFM_API_KEY: "test-key" }
  });
  const missingTrackResponse = await onLastFmTrackDetailsRequest({
    request: missingTrackRequest,
    env: { LASTFM_API_KEY: "test-key" }
  });

  assert.equal(badOriginResponse.status, 403);
  assert.equal(missingTrackResponse.status, 400);
  assert.equal((await missingTrackResponse.json()).error, "artist and track are required");
});

test("lastfm track details route reuses cached details across album query variants", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const cacheSeedRequest = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time&album=This%20Is%20How%20Tomorrow%20Moves");
  const cacheRequest = buildLastFmDetailsCacheRequest(cacheSeedRequest, {
    artist: "beabadoobee",
    track: "One Time",
    album: ""
  }, ["artist", "track"]);

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      throw new Error("cache hit should not fetch upstream details");
    };

    await primeCache(cache, cacheRequest, {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: new Date().toISOString(),
      query: { artist: "beabadoobee", track: "One Time", album: "This Is How Tomorrow Moves" },
      track: {
        title: "One Time",
        artist: "beabadoobee",
        album: "This Is How Tomorrow Moves",
        userPlaycount: 3
      },
      spotify: { matchStatus: "matched" },
      scrobbles: { total: 3, items: [] },
      artistTopTracks: { artist: "beabadoobee", items: [] }
    }, 24 * 60 * 60);

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, false);
    assert.equal(payload.track.title, "One Time");
    assert.equal(payload.track.album, "This Is How Tomorrow Moves");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route dedupes simultaneous cache misses for the same track", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const firstRequest = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time&album=First");
  const secondRequest = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time&album=Second");
  let coreTrackInfoCalls = 0;

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const requestUrl = new URL(String(resource));
      if (requestUrl.origin === "https://accounts.spotify.com") {
        return Response.json({ access_token: "spotify-token" });
      }
      if (requestUrl.origin === "https://api.spotify.com") {
        return Response.json({ tracks: { items: [] } });
      }

      const method = requestUrl.searchParams.get("method");
      if (method === "track.getInfo") {
        const trackName = requestUrl.searchParams.get("track");
        if (trackName === "One Time") {
          coreTrackInfoCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 40));
          return Response.json({
            track: {
              name: "One Time",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              album: { title: "This Is How Tomorrow Moves" },
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              duration: "184000",
              playcount: "2740015",
              listeners: "285055",
              userplaycount: "3",
              userloved: "1"
            }
          });
        }
      }
      if (method === "track.gettoptags") {
        return Response.json({ toptags: { tag: [] } });
      }
      if (method === "track.getsimilar") {
        return Response.json({ similartracks: { track: [] } });
      }
      if (method === "user.gettrackscrobbles") {
        return Response.json({ trackscrobbles: { "@attr": { total: "3" }, track: [] } });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({ toptracks: { track: [] } });
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const [firstResponse, secondResponse] = await Promise.all([
      onLastFmTrackDetailsRequest({
        request: firstRequest,
        env: {
          LASTFM_API_KEY: "test-key",
          SPOTIFY_CLIENT_ID: "spotify-client",
          SPOTIFY_CLIENT_SECRET: "spotify-secret"
        }
      }),
      onLastFmTrackDetailsRequest({
        request: secondRequest,
        env: {
          LASTFM_API_KEY: "test-key",
          SPOTIFY_CLIENT_ID: "spotify-client",
          SPOTIFY_CLIENT_SECRET: "spotify-secret"
        }
      })
    ]);
    const firstPayload = await firstResponse.json();
    const secondPayload = await secondResponse.json();

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(firstPayload.track.title, "One Time");
    assert.equal(secondPayload.track.title, "One Time");
    assert.equal(coreTrackInfoCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route gives credentialless spotify lookup room while capping latency", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");
  let credentiallessCalls = 0;

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource, init = {}) => {
      const requestUrl = new URL(String(resource));
      if (requestUrl.origin === "https://r.jina.ai") {
        credentiallessCalls += 1;
        return await new Promise((resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal.reason || new Error("aborted"));
          }, { once: true });
        });
      }

      const method = requestUrl.searchParams.get("method");
      if (method === "track.getInfo") {
        return Response.json({
          track: {
            name: "One Time",
            artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
            album: { title: "This Is How Tomorrow Moves" },
            url: "https://www.last.fm/music/beabadoobee/_/One+Time",
            duration: "184000",
            playcount: "2740015",
            listeners: "285055",
            userplaycount: "3",
            userloved: "1",
            wiki: {
              summary: "A bright and clipped single."
            }
          }
        });
      }
      if (method === "track.gettoptags") {
        return Response.json({ toptags: { tag: [] } });
      }
      if (method === "track.getsimilar") {
        return Response.json({ similartracks: { track: [] } });
      }
      if (method === "user.gettrackscrobbles") {
        return Response.json({ trackscrobbles: { "@attr": { total: "3" }, track: [] } });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({ toptracks: { track: [] } });
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const startedAt = Date.now();
    const response = await onLastFmTrackDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.track.title, "One Time");
    assert.equal(payload.spotify.matchStatus, "unavailable");
    assert.equal(credentiallessCalls, 1);
    assert.ok(Date.now() - startedAt < 3_500);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route assembles track, scrobble, related-track, and spotify data", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time&album=This%20Is%20How%20Tomorrow%20Moves");
  const callUrls = [];

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource, init = {}) => {
      const resourceUrl = String(resource);
      callUrls.push(resourceUrl);
      if (resourceUrl === "https://accounts.spotify.com/api/token") {
        assert.equal(init.method, "POST");
        return Response.json({ access_token: "spotify-token" });
      }
      const requestUrl = new URL(resourceUrl);
      if (requestUrl.origin === "https://api.spotify.com" && requestUrl.pathname === "/v1/search") {
        return Response.json({
          tracks: {
            items: [
              {
                id: "spotify-track-1",
                name: "One Time",
                preview_url: "https://p.scdn.co/mp3-preview/one-time-preview.mp3",
                artists: [{ name: "beabadoobee" }],
                album: {
                  name: "This Is How Tomorrow Moves",
                  images: [{ url: "https://i.scdn.co/image/spotify-track-art.jpg" }]
                },
                external_urls: {
                  spotify: "https://open.spotify.com/track/spotify-track-1"
                }
              }
            ]
          }
        });
      }
      const method = requestUrl.searchParams.get("method");
      if (method === "track.getInfo") {
        const trackName = requestUrl.searchParams.get("track");
        if (trackName === "One Time") {
          return Response.json({
            track: {
              name: "One Time",
              artist: {
                name: "beabadoobee",
                url: "https://www.last.fm/music/beabadoobee"
              },
              album: {
                title: "This Is How Tomorrow Moves [Explicit]",
                image: [{ "#text": "" }]
              },
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              duration: "184000",
              playcount: "2740015",
              listeners: "285055",
              userplaycount: "3",
              userloved: "1",
              wiki: {
                summary: "A bright and clipped single.<a href=\"https://www.last.fm/music/beabadoobee/_/One+Time\">Read more on Last.fm</a>",
                content: "A bright and clipped single with a fuller write-up beyond the summary."
              }
            }
          });
        }
        if (trackName === "the perfect pair") {
          return Response.json({
            track: {
              name: "the perfect pair",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              album: {
                title: "Beatopia",
                image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/perfect-pair.jpg" }]
              },
              url: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
              playcount: "29424507",
              listeners: "1452743",
              userplaycount: "0",
              userloved: "0"
            }
          });
        }
        if (trackName === "Talk") {
          return Response.json({
            track: {
              name: "Talk",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              album: {
                title: "Beatopia",
                image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/talk.jpg" }]
              },
              url: "https://www.last.fm/music/beabadoobee/_/Talk",
              playcount: "1820011",
              listeners: "942304",
              userplaycount: "9",
              userloved: "1"
            }
          });
        }
        throw new Error(`Unexpected track.getInfo track ${trackName}`);
      }
      if (method === "track.gettoptags") {
        return Response.json({
          toptags: {
            tag: [
              { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
              { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
            ]
          }
        });
      }
      if (method === "track.getsimilar") {
        return Response.json({
          similartracks: {
            track: [
              {
                name: "California",
                artist: { name: "beabadoobee" },
                url: "https://www.last.fm/music/beabadoobee/_/California",
                match: "0.82"
              },
              {
                name: "Glue Song",
                artist: { name: "beabadoobee" },
                url: "https://www.last.fm/music/beabadoobee/_/Glue+Song",
                match: "0.79"
              }
            ]
          }
        });
      }
      if (method === "user.gettrackscrobbles") {
        const page = requestUrl.searchParams.get("page");
        if (page === "3") {
          return Response.json({
            trackscrobbles: {
              track: [
                {
                  name: "One Time",
                  artist: { "#text": "beabadoobee" },
                  album: { "#text": "This Is How Tomorrow Moves" },
                  url: "https://www.last.fm/music/beabadoobee/_/One+Time",
                  image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/scrobble-art.jpg" }],
                  date: {
                    uts: "1700000000",
                    "#text": "14 Nov 2023, 22:13"
                  }
                }
              ],
              "@attr": {
                total: "3"
              }
            }
          });
        }
        return Response.json({
          trackscrobbles: {
            track: [
              {
                name: "One Time",
                artist: { "#text": "beabadoobee" },
                album: { "#text": "This Is How Tomorrow Moves" },
                url: "https://www.last.fm/music/beabadoobee/_/One+Time",
                image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/scrobble-art.jpg" }],
                date: {
                  uts: "1774250489",
                  "#text": "23 Mar 2026, 07:21"
                }
              }
            ],
            "@attr": {
              total: "3"
            }
          }
        });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              {
                name: "One Time",
                artist: { name: "beabadoobee" },
                playcount: "2740015",
                listeners: "285055",
                url: "https://www.last.fm/music/beabadoobee/_/One+Time"
              },
              {
                name: "the perfect pair",
                artist: { name: "beabadoobee" },
                playcount: "29424507",
                listeners: "1452743",
                url: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair"
              },
              {
                name: "Talk",
                artist: { name: "beabadoobee" },
                playcount: "1820011",
                listeners: "942304",
                url: "https://www.last.fm/music/beabadoobee/_/Talk"
              }
            ]
          }
        });
      }
      throw new Error(`Unexpected request: ${resourceUrl}`);
    };

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: {
        LASTFM_API_KEY: "test-key",
        SPOTIFY_CLIENT_ID: "spotify-client",
        SPOTIFY_CLIENT_SECRET: "spotify-secret"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.track.title, "One Time");
    assert.equal(payload.track.artist, "beabadoobee");
    assert.equal(payload.track.durationLabel, "3:04");
    assert.equal(payload.track.userPlaycount, 3);
    assert.equal(payload.track.userLoved, true);
    assert.equal(payload.track.artworkUrl, "https://i.scdn.co/image/spotify-track-art.jpg");
    assert.equal(payload.track.similarTracks.length, 2);
    assert.equal(payload.track.similarTracks[0].title, "California");
    assert.equal(payload.track.topTags.length, 2);
    assert.equal(payload.track.summary, "A bright and clipped single.");
    assert.equal(payload.track.summaryHasMore, true);
    assert.equal(payload.spotify.matchStatus, "matched");
    assert.equal(payload.spotify.embedUrl, "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator");
    assert.equal(payload.spotify.previewUrl, "https://p.scdn.co/mp3-preview/one-time-preview.mp3");
    assert.equal(payload.scrobbles.total, 3);
    assert.equal(payload.scrobbles.items[0].playedAtLabel, "23 Mar 2026, 07:21");
    assert.equal(payload.scrobbles.firstRecorded.playedAtLabel, "14 Nov 2023, 22:13");
    assert.equal(payload.artistTopTracks.artist, "beabadoobee");
    assert.equal(payload.artistTopTracks.items.length, 2);
    assert.equal(payload.artistTopTracks.items[0].title, "Talk");
    assert.equal(payload.artistTopTracks.items[0].userPlaycount, 9);
    assert.equal(payload.artistTopTracks.items[1].title, "the perfect pair");
    assert.equal(payload.artistTopTracks.items[1].globalPlaycount, 29424507);
    assert.equal(callUrls.filter((url) => url === "https://accounts.spotify.com/api/token").length, 1);
    assert.equal(callUrls.filter((url) => url.includes("method=track.getsimilar")).length, 1);
    assert.equal(callUrls.filter((url) => url.includes("method=user.gettrackscrobbles")).length, 2);
    assert.equal(callUrls.filter((url) => url.includes("method=artist.gettoptracks")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route returns partial data when scrobble and spotify enrichment fail", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const requestUrl = new URL(String(resource));
      if (requestUrl.origin === "https://accounts.spotify.com") {
        throw new Error("spotify down");
      }
      const method = requestUrl.searchParams.get("method");
      if (method === "track.getInfo") {
        return Response.json({
          track: {
            name: "One Time",
            artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
            album: { title: "This Is How Tomorrow Moves" },
            url: "https://www.last.fm/music/beabadoobee/_/One+Time",
            duration: "184000",
            playcount: "2740015",
            listeners: "285055",
            userplaycount: "3",
            userloved: "0"
          }
        });
      }
      if (method === "track.gettoptags") {
        return Response.json({ toptags: { tag: [] } });
      }
      if (method === "track.getsimilar") {
        return Response.json({ similartracks: { track: [] } });
      }
      if (method === "user.gettrackscrobbles") {
        throw new Error("scrobbles down");
      }
      if (method === "artist.gettoptracks") {
        throw new Error("artist top tracks down");
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: {
        LASTFM_API_KEY: "test-key",
        SPOTIFY_CLIENT_ID: "spotify-client",
        SPOTIFY_CLIENT_SECRET: "spotify-secret"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.track.title, "One Time");
    assert.equal(payload.spotify.matchStatus, "unavailable");
    assert.equal(payload.scrobbles.total, 3);
    assert.deepEqual(payload.scrobbles.items, []);
    assert.deepEqual(payload.artistTopTracks.items, []);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route falls back to partial query data when core track info is missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time&album=This%20Is%20How%20Tomorrow%20Moves");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const requestUrl = new URL(String(resource));
      const method = requestUrl.searchParams.get("method");
      if (method === "track.getInfo") {
        return Response.json({});
      }
      if (method === "track.gettoptags") {
        return Response.json({
          toptags: {
            tag: [
              { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" }
            ]
          }
        });
      }
      if (method === "track.getsimilar") {
        return Response.json({ similartracks: { track: [] } });
      }
      if (method === "user.gettrackscrobbles") {
        return Response.json({ trackscrobbles: { "@attr": { total: "0" }, track: [] } });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              {
                name: "Talk",
                artist: { name: "beabadoobee" },
                playcount: "1820011",
                listeners: "942304",
                url: "https://www.last.fm/music/beabadoobee/_/Talk"
              }
            ]
          }
        });
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.track.title, "One Time");
    assert.equal(payload.track.artist, "beabadoobee");
    assert.equal(payload.track.album, "This Is How Tomorrow Moves");
    assert.equal(payload.track.lastfmUrl, "https://www.last.fm/music/beabadoobee/_/One%20Time");
    assert.equal(payload.track.artistLastFmUrl, "https://www.last.fm/music/beabadoobee");
    assert.equal(payload.track.topTags.length, 1);
    assert.equal(payload.artistTopTracks.artist, "beabadoobee");
    assert.equal(payload.artistTopTracks.items.length, 1);
    assert.equal(payload.spotify.matchStatus, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route keeps a retained internal core cache when upstream returns an empty track payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");
  const retainedTrackInfoRequest = new Request("https://internet-angel.internal/__lastfm-details/track-core/beabadoobee/one%20time", {
    method: "GET"
  });

  try {
    globalThis.caches = { default: cache };
    await primeCache(cache, retainedTrackInfoRequest, {
      fetchedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      value: {
        name: "One Time",
        artist: {
          name: "beabadoobee",
          url: "https://www.last.fm/music/beabadoobee"
        },
        album: {
          title: "This Is How Tomorrow Moves"
        },
        url: "https://www.last.fm/music/beabadoobee/_/One+Time",
        duration: "184000",
        playcount: "2740015",
        listeners: "285055",
        userplaycount: "3",
        userloved: "1"
      }
    }, 7 * 24 * 60 * 60);

    globalThis.fetch = async (resource) => {
      const requestUrl = new URL(String(resource));
      const method = requestUrl.searchParams.get("method");
      if (method === "track.getInfo") {
        return Response.json({});
      }
      if (method === "track.gettoptags") {
        return Response.json({ toptags: { tag: [] } });
      }
      if (method === "track.getsimilar") {
        return Response.json({ similartracks: { track: [] } });
      }
      if (method === "user.gettrackscrobbles") {
        return Response.json({ trackscrobbles: { "@attr": { total: "0" }, track: [] } });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({ toptracks: { track: [] } });
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.track.title, "One Time");
    assert.equal(payload.track.artist, "beabadoobee");
    assert.equal(payload.track.userPlaycount, 3);
    assert.equal(payload.track.userLoved, true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route returns retained stale payload when upstream fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");
  const cacheRequest = new Request("https://internet-angel.net/api/lastfm-track-details?artist=beabadoobee&track=one+time&__v=spotify-credentialless-v3", { method: "GET" });
  const cachedPayload = {
    sourceStatus: "OK",
    stale: false,
    fetchedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    query: { artist: "beabadoobee", track: "One Time", album: "" },
    track: {
      title: "One Time",
      artist: "beabadoobee",
      album: "This Is How Tomorrow Moves",
      userPlaycount: 3
    },
    spotify: { matchStatus: "matched" },
    scrobbles: { total: 3, items: [] },
    artistTopTracks: { artist: "beabadoobee", items: [] }
  };

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      throw new Error("boom");
    };

    await primeCache(cache, cacheRequest, cachedPayload, 24 * 60 * 60);
    await primeCache(cache, request, cachedPayload, 24 * 60 * 60);

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.track.title, "One Time");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route serves retained details immediately while refreshing in the background", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");
  const cacheRequest = new Request("https://internet-angel.net/api/lastfm-track-details?artist=beabadoobee&track=one+time&__v=spotify-credentialless-v3", { method: "GET" });
  const waitUntilPromises = [];
  let fetchCalls = 0;
  const cachedPayload = {
    sourceStatus: "OK",
    stale: false,
    fetchedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    query: { artist: "beabadoobee", track: "One Time", album: "" },
    track: {
      title: "One Time",
      artist: "beabadoobee",
      album: "This Is How Tomorrow Moves",
      userPlaycount: 3
    },
    spotify: { matchStatus: "matched" },
    scrobbles: { total: 3, items: [] },
    artistTopTracks: { artist: "beabadoobee", items: [] }
  };

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("background refresh failed");
    };

    await primeCache(cache, cacheRequest, cachedPayload, 24 * 60 * 60);

    const startedAt = Date.now();
    const response = await onLastFmTrackDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" },
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.track.title, "One Time");
    assert.ok(Date.now() - startedAt < 200);
    assert.equal(waitUntilPromises.length, 1);
    await Promise.all(waitUntilPromises);
    assert.ok(fetchCalls >= 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm track details route returns retained stale payload when upstream hangs", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-track-details?artist=beabadoobee&track=One%20Time");
  const cacheRequest = new Request("https://internet-angel.net/api/lastfm-track-details?artist=beabadoobee&track=one+time&__v=spotify-credentialless-v3", { method: "GET" });
  const cachedPayload = {
    sourceStatus: "OK",
    stale: false,
    fetchedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    query: { artist: "beabadoobee", track: "One Time", album: "" },
    track: {
      title: "One Time",
      artist: "beabadoobee",
      album: "This Is How Tomorrow Moves",
      userPlaycount: 3
    },
    spotify: { matchStatus: "matched" },
    scrobbles: { total: 3, items: [] },
    artistTopTracks: { artist: "beabadoobee", items: [] }
  };

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (_resource, init = {}) => {
      return await new Promise((resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(init.signal.reason || new Error("aborted"));
        }, { once: true });
      });
    };

    await primeCache(cache, cacheRequest, cachedPayload, 24 * 60 * 60);

    const response = await onLastFmTrackDetailsRequest({
      request,
      env: {
        LASTFM_API_KEY: "test-key",
        LASTFM_DETAILS_ROUTE_TIMEOUT_MS: "25"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.stale, true);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.track.title, "One Time");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm artist details route validates query params and assembles artist detail data", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const missingArtistRequest = createSameOriginRequest("/api/lastfm-artist-details");
  const request = createSameOriginRequest("/api/lastfm-artist-details?artist=beabadoobee");

  try {
    globalThis.caches = { default: cache };
    const missingArtistResponse = await onLastFmArtistDetailsRequest({
      request: missingArtistRequest,
      env: { LASTFM_API_KEY: "test-key" }
    });
    assert.equal(missingArtistResponse.status, 400);
    assert.equal((await missingArtistResponse.json()).error, "artist is required");

    globalThis.fetch = async (resource) => {
      const resourceUrl = String(resource);
      if (resourceUrl.startsWith("https://api.deezer.com/search/artist")) {
        return Response.json({
          data: [
            {
              name: "beabadoobee",
              picture_big: "https://cdn-images.dzcdn.net/images/artist/bea-photo.jpg"
            }
          ]
        });
      }
      const requestUrl = new URL(resourceUrl);
      const method = requestUrl.searchParams.get("method");
      if (method === "artist.getinfo") {
        return Response.json({
          artist: {
            name: "beabadoobee",
            url: "https://www.last.fm/music/beabadoobee",
            image: [{ "#text": "" }],
            bio: {
              summary: "Filipino-British indie artist.<a href=\"https://www.last.fm/music/beabadoobee\">Read more on Last.fm</a>",
              content: "Filipino-British indie artist with a much longer article body."
            },
            stats: {
              listeners: "285055",
              playcount: "2740015",
              userplaycount: "128"
            },
            tags: {
              tag: [
                { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
                { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
              ]
            }
          }
        });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              {
                name: "Talk",
                artist: { name: "beabadoobee" },
                playcount: "1820011",
                listeners: "942304",
                url: "https://www.last.fm/music/beabadoobee/_/Talk"
              },
              {
                name: "the perfect pair",
                artist: { name: "beabadoobee" },
                playcount: "29424507",
                listeners: "1452743",
                url: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair"
              }
            ]
          }
        });
      }
      if (method === "artist.gettopalbums") {
        return Response.json({
          topalbums: {
            album: [
              {
                name: "Beatopia",
                artist: { name: "beabadoobee" },
                playcount: "1200456",
                url: "https://www.last.fm/music/beabadoobee/Beatopia",
                image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/beatopia.jpg" }]
              }
            ]
          }
        });
      }
      if (method === "album.getinfo") {
        return Response.json({
          album: {
            name: "Beatopia",
            artist: "beabadoobee",
            url: "https://www.last.fm/music/beabadoobee/Beatopia",
            image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/beatopia.jpg" }],
            playcount: "1200456",
            userplaycount: "21",
            listeners: "500123",
            releasedate: "15 Jul 2022, 00:00",
            tracks: {
              track: [
                { name: "Talk", duration: "144", artist: { name: "beabadoobee" } },
                { name: "the perfect pair", duration: "164", artist: { name: "beabadoobee" } }
              ]
            },
            tags: {
              tag: [
                { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
                { name: "dream pop", url: "https://www.last.fm/tag/dream+pop" }
              ]
            }
          }
        });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              { name: "Talk", artist: { name: "beabadoobee" }, url: "https://www.last.fm/music/beabadoobee/_/Talk", playcount: "1820011", listeners: "942304" },
              { name: "the perfect pair", artist: { name: "beabadoobee" }, url: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair", playcount: "29424507", listeners: "1452743" },
              { name: "See you Soon", artist: { name: "beabadoobee" }, url: "https://www.last.fm/music/beabadoobee/_/See+you+Soon", playcount: "541102", listeners: "301204" },
              { name: "Cologne", artist: { name: "beabadoobee" }, url: "https://www.last.fm/music/beabadoobee/_/Cologne", playcount: "902210", listeners: "411002" }
            ]
          }
        });
      }
      if (method === "track.getInfo") {
        const trackName = requestUrl.searchParams.get("track");
        if (trackName === "Talk") {
          return Response.json({
            track: {
              name: "Talk",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              album: { title: "Beatopia", image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/talk.jpg" }] },
              url: "https://www.last.fm/music/beabadoobee/_/Talk",
              playcount: "1820011",
              listeners: "942304",
              userplaycount: "9",
              userloved: "1"
            }
          });
        }
        if (trackName === "See you Soon") {
          return Response.json({
            track: {
              name: "See you Soon",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              url: "https://www.last.fm/music/beabadoobee/_/See+you+Soon",
              duration: "181000",
              playcount: "541102",
              listeners: "301204",
              userplaycount: "4",
              userloved: "0"
            }
          });
        }
        if (trackName === "Cologne") {
          return Response.json({
            track: {
              name: "Cologne",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              url: "https://www.last.fm/music/beabadoobee/_/Cologne",
              duration: "206000",
              playcount: "902210",
              listeners: "411002",
              userplaycount: "3",
              userloved: "1"
            }
          });
        }
        return Response.json({
          track: {
            name: "the perfect pair",
            artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
            album: { title: "Beatopia", image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/perfect-pair.jpg" }] },
            url: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
            playcount: "29424507",
            listeners: "1452743",
            userplaycount: "2",
            userloved: "0"
          }
        });
      }
      throw new Error(`Unexpected request: ${resourceUrl}`);
    };

    const response = await onLastFmArtistDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.artist.name, "beabadoobee");
    assert.equal(payload.artist.artworkUrl, "https://cdn-images.dzcdn.net/images/artist/bea-photo.jpg");
    assert.equal(payload.artist.summary, "Filipino-British indie artist.");
    assert.equal(payload.artist.summaryHasMore, true);
    assert.equal(payload.artist.userPlaycount, 128);
    assert.equal(payload.artist.topTags.length, 2);
    assert.equal(payload.topTracks.items[0].title, "Talk");
    assert.equal(payload.topTracks.items[0].userPlaycount, 9);
    assert.equal(payload.topAlbums.items.length, 1);
    assert.equal(payload.topAlbums.items[0].title, "Beatopia");
    assert.equal(payload.topAlbums.items[0].releaseYear, "2022");
    assert.equal(payload.topAlbums.items[0].topTags[0].name, "indie pop");
    assert.equal(payload.topAlbums.items[0].trackCount, 2);
    assert.equal(payload.topAlbums.items[0].userPlaycount, 21);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm artist details route falls back to partial query data when artist info is missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-artist-details?artist=beabadoobee");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const resourceUrl = String(resource);
      if (resourceUrl.startsWith("https://api.deezer.com/search/artist")) {
        return Response.json({
          data: [
            {
              name: "beabadoobee",
              picture_big: "https://cdn-images.dzcdn.net/images/artist/bea-photo.jpg"
            }
          ]
        });
      }
      const requestUrl = new URL(resourceUrl);
      const method = requestUrl.searchParams.get("method");
      if (method === "artist.getinfo") {
        return Response.json({});
      }
      if (method === "artist.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              {
                name: "Talk",
                artist: { name: "beabadoobee" },
                playcount: "1820011",
                listeners: "942304",
                url: "https://www.last.fm/music/beabadoobee/_/Talk"
              }
            ]
          }
        });
      }
      if (method === "artist.gettopalbums") {
        return Response.json({
          topalbums: {
            album: [
              {
                name: "Beatopia",
                artist: { name: "beabadoobee" },
                playcount: "1200456",
                url: "https://www.last.fm/music/beabadoobee/Beatopia"
              }
            ]
          }
        });
      }
      if (method === "track.getInfo" || method === "album.getinfo") {
        return Response.json({});
      }
      throw new Error(`Unexpected request: ${resourceUrl}`);
    };

    const response = await onLastFmArtistDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.artist.name, "beabadoobee");
    assert.equal(payload.artist.lastfmUrl, "https://www.last.fm/music/beabadoobee");
    assert.equal(payload.artist.artworkUrl, "https://cdn-images.dzcdn.net/images/artist/bea-photo.jpg");
    assert.equal(payload.topTracks.artist, "beabadoobee");
    assert.equal(payload.topTracks.items.length, 1);
    assert.equal(payload.topAlbums.artist, "beabadoobee");
    assert.equal(payload.topAlbums.items.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm album details route assembles album detail data and track popularity", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-album-details?artist=beabadoobee&album=Beatopia");
  const callUrls = [];

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const resourceUrl = String(resource);
      callUrls.push(resourceUrl);
      if (resourceUrl === "https://accounts.spotify.com/api/token") {
        return Response.json({ access_token: "spotify-token" });
      }
      const requestUrl = new URL(resourceUrl);
      if (requestUrl.origin === "https://api.spotify.com" && requestUrl.pathname === "/v1/search") {
        return Response.json({
          tracks: {
            items: [
              {
                id: "spotify-talk-1",
                name: "Talk",
                preview_url: "https://p.scdn.co/mp3-preview/talk-preview.mp3",
                artists: [{ name: "beabadoobee" }],
                album: {
                  name: "Beatopia",
                  images: [{ url: "https://i.scdn.co/image/spotify-beatopia.jpg" }]
                },
                external_urls: {
                  spotify: "https://open.spotify.com/track/spotify-talk-1"
                }
              }
            ]
          }
        });
      }
      const method = requestUrl.searchParams.get("method");
      if (method === "album.getinfo") {
        return Response.json({
          album: {
            name: "Beatopia",
            artist: "beabadoobee",
            url: "https://www.last.fm/music/beabadoobee/Beatopia",
            image: [{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/beatopia.jpg" }],
            playcount: "1200456",
            userplaycount: "21",
            listeners: "500123",
            releasedate: "15 Jul 2022, 00:00",
            wiki: {
              summary: "A dreamy sophomore album.<a href=\"https://www.last.fm/music/beabadoobee/Beatopia\">Read more on Last.fm</a>",
              content: "A dreamy sophomore album with a much longer article body."
            },
            tags: {
              tag: [
                { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
                { name: "dream pop", url: "https://www.last.fm/tag/dream+pop" }
              ]
            },
            tracks: {
              track: [
                { name: "Talk", duration: "144", "@attr": { rank: "1" } },
                { name: "the perfect pair", duration: "164", "@attr": { rank: "2" } }
              ]
            }
          }
        });
      }
      if (method === "artist.getinfo") {
        return Response.json({
          artist: {
            name: "beabadoobee",
            url: "https://www.last.fm/music/beabadoobee",
            stats: {
              listeners: "285055",
              playcount: "2740015"
            }
          }
        });
      }
      if (method === "track.getInfo") {
        const trackName = requestUrl.searchParams.get("track");
        if (trackName === "Talk") {
          return Response.json({
            track: {
              name: "Talk",
              artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
              url: "https://www.last.fm/music/beabadoobee/_/Talk",
              duration: "144000",
              playcount: "1820011",
              listeners: "942304",
              userplaycount: "9",
              userloved: "1"
            }
          });
        }
        return Response.json({
          track: {
            name: "the perfect pair",
            artist: { name: "beabadoobee", url: "https://www.last.fm/music/beabadoobee" },
            url: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
            duration: "164000",
            playcount: "29424507",
            listeners: "1452743",
            userplaycount: "2",
            userloved: "0"
          }
        });
      }
      throw new Error(`Unexpected request: ${resourceUrl}`);
    };

    const response = await onLastFmAlbumDetailsRequest({
      request,
      env: {
        LASTFM_API_KEY: "test-key",
        SPOTIFY_CLIENT_ID: "spotify-client",
        SPOTIFY_CLIENT_SECRET: "spotify-secret"
      }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.album.title, "Beatopia");
    assert.equal(payload.album.artist, "beabadoobee");
    assert.equal(payload.album.summary, "A dreamy sophomore album.");
    assert.equal(payload.album.summaryHasMore, true);
    assert.equal(payload.album.userPlaycount, 21);
    assert.equal(payload.album.releasedAt, "15 Jul 2022");
    assert.equal(payload.album.runtimeLabel, "5:08");
    assert.equal(payload.album.topTags.length, 2);
    assert.equal(payload.tracks.items.length, 2);
    assert.equal(payload.tracks.items[0].title, "Talk");
    assert.equal(payload.tracks.items[0].userPlaycount, 9);
    assert.equal(payload.tracks.items[0].artistLastFmUrl, "https://www.last.fm/music/beabadoobee");
    assert.equal(payload.tracks.items[1].globalPlaycount, 29424507);
    assert.equal(payload.spotify.matchStatus, "matched");
    assert.equal(payload.spotify.title, "Talk");
    assert.equal(payload.spotify.embedUrl, "https://open.spotify.com/embed/track/spotify-talk-1?utm_source=generator");
    assert.equal(payload.spotify.previewUrl, "https://p.scdn.co/mp3-preview/talk-preview.mp3");
    assert.equal(payload.relatedTracks.artist, "beabadoobee");
    assert.ok(Array.isArray(payload.relatedTracks.items));
    assert.equal(callUrls.filter((url) => url === "https://accounts.spotify.com/api/token").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});

test("lastfm album details route falls back to partial query data when album info is missing", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/lastfm-album-details?artist=beabadoobee&album=Beatopia");

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const requestUrl = new URL(String(resource));
      const method = requestUrl.searchParams.get("method");
      if (method === "album.getinfo") {
        return Response.json({});
      }
      if (method === "artist.getinfo") {
        return Response.json({
          artist: {
            name: "beabadoobee",
            url: "https://www.last.fm/music/beabadoobee",
            stats: {
              listeners: "285055",
              playcount: "2740015"
            }
          }
        });
      }
      if (method === "artist.gettoptracks") {
        return Response.json({
          toptracks: {
            track: [
              {
                name: "Talk",
                artist: { name: "beabadoobee" },
                playcount: "1820011",
                listeners: "942304",
                url: "https://www.last.fm/music/beabadoobee/_/Talk"
              }
            ]
          }
        });
      }
      if (method === "track.getInfo") {
        return Response.json({});
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const response = await onLastFmAlbumDetailsRequest({
      request,
      env: { LASTFM_API_KEY: "test-key" }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.sourceStatus, "PARTIAL");
    assert.equal(payload.album.title, "Beatopia");
    assert.equal(payload.album.artist, "beabadoobee");
    assert.equal(payload.album.lastfmUrl, "https://www.last.fm/music/beabadoobee/Beatopia");
    assert.equal(payload.album.artistLastFmUrl, "https://www.last.fm/music/beabadoobee");
    assert.deepEqual(payload.tracks.items, []);
    assert.equal(payload.relatedTracks.artist, "beabadoobee");
    assert.equal(payload.relatedTracks.items.length, 1);
    assert.equal(payload.spotify.matchStatus, "unavailable");
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

test("steam route refreshes a fresh cache entry without a usable profile avatar", async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const cache = new MockCache();
  const request = createSameOriginRequest("/api/steam-recent-activity");
  const liveAvatarUrl = "https://avatars.fastly.steamstatic.com/377fab253c8b880c72d11ff7524e636c1894256e_full.jpg";
  const profileUrl = "https://steamcommunity.com/id/HalfTwo/";
  const callUrls = [];

  try {
    globalThis.caches = { default: cache };
    globalThis.fetch = async (resource) => {
      const url = String(resource);
      callUrls.push(url);
      if (url.includes("?xml=1")) {
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<profile>
  <steamID><![CDATA[josie]]></steamID>
  <profileURL><![CDATA[${profileUrl}]]></profileURL>
  <onlineState><![CDATA[online]]></onlineState>
  <stateMessage><![CDATA[Currently Online]]></stateMessage>
  <avatarFull><![CDATA[${liveAvatarUrl}]]></avatarFull>
</profile>`, {
          status: 200,
          headers: { "content-type": "text/xml; charset=utf-8" }
        });
      }
      if (url.startsWith("https://r.jina.ai/")) {
        return new Response(`Title: Steam Community :: josie

URL Source: http://steamcommunity.com/id/HalfTwo/

Markdown Content:
# Steam Community :: josie

[![Image 6](${liveAvatarUrl})](${profileUrl})

josie

50

Currently Online
`, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" }
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    };

    await primeCache(cache, request, {
      sourceStatus: "OK",
      stale: false,
      fetchedAt: new Date().toISOString(),
      profileUrl,
      profile: {
        name: "Error",
        url: profileUrl,
        avatarUrl: "",
        statusText: "Unknown"
      },
      stats: [],
      items: []
    }, 7 * 24 * 60 * 60);

    const response = await onSteamRequest({
      request,
      env: { STEAM_PROFILE_URL: profileUrl }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.profile.name, "josie");
    assert.equal(payload.profile.url, profileUrl);
    assert.equal(payload.profile.avatarUrl, liveAvatarUrl);
    assert.ok(callUrls.some((url) => url.includes("?xml=1")));
    assert.ok(callUrls.some((url) => url.startsWith("https://r.jina.ai/")));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
  }
});
