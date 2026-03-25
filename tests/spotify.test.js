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
