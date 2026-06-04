import test from "node:test";
import assert from "node:assert/strict";

import { findSpotifyTrackMatch } from "../functions/lib/spotify.js";

test("findSpotifyTrackMatch prefers a preview-capable spotify result when textual scores tie", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (resource, init = {}) => {
      const resourceUrl = String(resource);
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
                id: "no-preview-id",
                name: "One Time",
                preview_url: "",
                artists: [{ name: "beabadoobee" }],
                album: {
                  name: "This Is How Tomorrow Moves",
                  images: [{ url: "https://i.scdn.co/image/no-preview.jpg" }]
                },
                external_urls: {
                  spotify: "https://open.spotify.com/track/no-preview-id"
                }
              },
              {
                id: "preview-id",
                name: "One Time",
                preview_url: "https://p.scdn.co/mp3-preview/one-time-preview.mp3",
                artists: [{ name: "beabadoobee" }],
                album: {
                  name: "This Is How Tomorrow Moves",
                  images: [{ url: "https://i.scdn.co/image/with-preview.jpg" }]
                },
                external_urls: {
                  spotify: "https://open.spotify.com/track/preview-id"
                }
              }
            ]
          }
        });
      }
      throw new Error(`Unexpected request: ${resourceUrl}`);
    };

    const match = await findSpotifyTrackMatch({
      artist: "beabadoobee",
      track: "One Time",
      album: "This Is How Tomorrow Moves",
      env: {
        SPOTIFY_CLIENT_ID: "spotify-client",
        SPOTIFY_CLIENT_SECRET: "spotify-secret"
      }
    });

    assert.equal(match.matchStatus, "matched");
    assert.equal(match.previewUrl, "https://p.scdn.co/mp3-preview/one-time-preview.mp3");
    assert.equal(match.openUrl, "https://open.spotify.com/track/preview-id");
    assert.equal(match.artworkUrl, "https://i.scdn.co/image/with-preview.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("findSpotifyTrackMatch resolves a spotify embed without client credentials", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (resource) => {
      const resourceUrl = String(resource);
      const requestUrl = new URL(resourceUrl);
      if (requestUrl.origin === "https://r.jina.ai" && requestUrl.pathname === "/http://au.search.yahoo.com/search") {
        assert.match(requestUrl.searchParams.get("p") || "", /site:open\.spotify\.com\/track/);
        return new Response(`
          <html>
            <body>
              <a class="result__a" href="https://open.spotify.com/track/credentiallessid">One Time - song by beabadoobee | Spotify</a>
              <a class="result__snippet">One Time by beabadoobee from This Is How Tomorrow Moves on Spotify.</a>
            </body>
          </html>
        `, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (requestUrl.origin === "https://open.spotify.com" && requestUrl.pathname === "/oembed") {
        assert.equal(requestUrl.searchParams.get("url"), "https://open.spotify.com/track/credentiallessid");
        return Response.json({
          iframe_url: "https://open.spotify.com/embed/track/credentiallessid?utm_source=oembed",
          title: "One Time",
          thumbnail_url: "https://i.scdn.co/image/credentialless.jpg"
        });
      }
      throw new Error(`Unexpected request: ${resourceUrl}`);
    };

    const match = await findSpotifyTrackMatch({
      artist: "beabadoobee",
      track: "One Time",
      album: "This Is How Tomorrow Moves",
      env: {}
    });

    assert.equal(match.matchStatus, "matched");
    assert.equal(match.embedUrl, "https://open.spotify.com/embed/track/credentiallessid?utm_source=oembed");
    assert.equal(match.openUrl, "https://open.spotify.com/track/credentiallessid");
    assert.equal(match.artworkUrl, "https://i.scdn.co/image/credentialless.jpg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("findSpotifyTrackMatch stops credentialless spotify lookup when validation hangs", async () => {
  const originalFetch = globalThis.fetch;
  const startedAt = Date.now();

  try {
    globalThis.fetch = async (resource, init = {}) => {
      const requestUrl = new URL(String(resource));
      if (requestUrl.origin === "https://r.jina.ai" && requestUrl.pathname === "/http://au.search.yahoo.com/search") {
        return new Response(`
          <a href="https://open.spotify.com/track/slowcredentiallessid">One Time - song by beabadoobee | Spotify</a>
        `, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" }
        });
      }
      if (requestUrl.origin === "https://open.spotify.com" && requestUrl.pathname === "/oembed") {
        return await new Promise((resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(init.signal.reason || new Error("aborted"));
          }, { once: true });
        });
      }
      throw new Error(`Unexpected request: ${resource}`);
    };

    const match = await findSpotifyTrackMatch({
      artist: "beabadoobee",
      track: "One Time",
      album: "This Is How Tomorrow Moves",
      env: {},
      credentiallessBudgetMs: 30
    });

    assert.equal(match.matchStatus, "unmatched");
    assert.ok(Date.now() - startedAt < 1_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
