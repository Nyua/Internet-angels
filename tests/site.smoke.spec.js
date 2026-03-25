import { test, expect } from "@playwright/test";

function createSilentWavBuffer(durationSeconds = 4, sampleRate = 8_000) {
  const sampleCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = sampleCount;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return buffer;
}

const SPOTIFY_PREVIEW_AUDIO_BUFFER = createSilentWavBuffer();

test("root loads the intro page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/BloomToDeath/);
});

test("mobile root skips the intro and redirects to josie", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page).toHaveURL(/\/josie(?:\.html)?$/);
  await expect(page).toHaveTitle(/Josie/);
});

test("next page redirects to josie", async ({ page }) => {
  await page.goto("/next.html");
  await expect(page).toHaveURL(/\/josie(?:\.html)?$/);
  await expect(page).toHaveTitle(/Josie/);
});

test("josie renders and dynamic endpoints respond", async ({ page, request }) => {
  const avatarManifestResponse = await request.get("/assets/avatar-manifest.json");
  expect(avatarManifestResponse.status()).toBe(200);
  const avatarManifest = await avatarManifestResponse.json();
  expect(Array.isArray(avatarManifest.avatars)).toBe(true);
  expect(avatarManifest.avatars.length).toBeGreaterThan(0);

  const lastfmResponse = await request.get("/api/lastfm");
  expect(lastfmResponse.status()).toBe(200);
  const lastfmPayload = await lastfmResponse.json();
  expect(lastfmPayload).toHaveProperty("nowPlaying");
  expect(lastfmPayload).toHaveProperty("toptracks");
  expect(lastfmPayload).toHaveProperty("discovery");

  const discordResponse = await request.get("/api/discord");
  expect(discordResponse.status()).toBe(200);

  const steamResponse = await request.get("/api/steam-recent-activity");
  expect(steamResponse.status()).toBe(200);

  await page.addInitScript(() => {
    const originalSetInterval = window.setInterval.bind(window);
    window.__codexIntervalCalls = [];
    window.setInterval = (handler, timeout, ...args) => {
      window.__codexIntervalCalls.push(Number(timeout));
      return originalSetInterval(handler, timeout, ...args);
    };
  });

  const apiRequests = [];
  page.on("request", (outboundRequest) => {
    const url = new URL(outboundRequest.url());
    if (url.origin === "http://127.0.0.1:8788" && url.pathname.startsWith("/api/")) {
      apiRequests.push(url.pathname);
    }
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", {
    timeout: 30_000
  });

  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true");
  await expect(page.locator(".steam-hero-name")).toHaveText("Josie");
  await expect(page.locator(".steam-hero-ornament")).toHaveCount(1);
  const heroAvatarSrc = await page.locator(".steam-hero-avatar").first().getAttribute("src");
  expect(heroAvatarSrc).toBeTruthy();
  expect(avatarManifest.avatars).toContain(new URL(heroAvatarSrc, "http://127.0.0.1:8788").pathname);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-heart")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-wing--left")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-wing--right")).toHaveCount(1);
  await expect(page.locator(".steam-hero-description")).toContainText("The Internet Angel");
  await expect(page.locator(".steam-hero-avatar-decoration")).toHaveCount(1);
  await expect(page.locator(".lastfm-section-title").first()).toHaveText("Recent Tracks");
  await expect(page.locator(".lastfm-media-grid--artists .lastfm-media-image").first()).toBeVisible();
  const topArtistImageUrls = await page.locator(".lastfm-media-grid--artists .lastfm-media-image").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || ""));
  expect(topArtistImageUrls.some((url) => url && !url.includes("2a96cbd8b46e442fc41c2b86b821562f"))).toBe(true);
  const smallCopyStyles = await page.locator(".steam-sidebar-row-title").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color
    };
  });
  expect(smallCopyStyles.color).toBe("rgb(255, 0, 122)");
  const firstProfileLinkWeight = await page.locator(".steam-sidebar-link").first().evaluate((node) => window.getComputedStyle(node).fontWeight);
  expect(Number.parseInt(firstProfileLinkWeight, 10)).toBeGreaterThanOrEqual(700);
  const lastFmVisualStyles = await page.evaluate(() => {
    const recentTitle = document.querySelector(".lastfm-recent-title");
    const artistTitle = document.querySelector(".lastfm-media-grid--artists .lastfm-media-title");
    const albumTitle = document.querySelector(".lastfm-media-grid--albums .lastfm-media-title");
    const lastFmSection = document.querySelector(".lastfm-section");
    const lastFmShowcaseContent = document.querySelector(".steam-showcase-content--lastfm-minimal");
    const lastFmShowcaseShell = document.querySelector(".steam-showcase--lastfm-minimal");
    const steamActivityShell = document.querySelector(".steam-showcase--steam-activity");
    const steamHours = document.querySelector(".steam-activity-header-hours");
    const steamHoursOnRecord = document.querySelector(".steam-activity-hours");
    const steamLastPlayed = document.querySelector(".steam-activity-last-played");
    const colorOf = (node) => node ? window.getComputedStyle(node).color : null;
    const backgroundOf = (node) => node ? window.getComputedStyle(node).backgroundColor : null;
    const pseudoDisplayOf = (node, pseudo) => node ? window.getComputedStyle(node, pseudo).display : null;
    return {
      recentTitleColor: colorOf(recentTitle),
      artistTitleColor: colorOf(artistTitle),
      albumTitleColor: colorOf(albumTitle),
      lastFmSectionBackground: backgroundOf(lastFmSection),
      lastFmShowcaseContentBackground: backgroundOf(lastFmShowcaseContent),
      lastFmShowcaseBeforeDisplay: pseudoDisplayOf(lastFmShowcaseShell, "::before"),
      steamActivityBackground: backgroundOf(steamActivityShell),
      steamActivityBeforeDisplay: pseudoDisplayOf(steamActivityShell, "::before"),
      steamHoursColor: colorOf(steamHours),
      steamHoursOnRecordColor: colorOf(steamHoursOnRecord),
      steamLastPlayedColor: colorOf(steamLastPlayed)
    };
  });
  expect(lastFmVisualStyles.recentTitleColor).toBe("rgb(255, 255, 255)");
  expect(lastFmVisualStyles.artistTitleColor).toBe("rgb(255, 255, 255)");
  expect(lastFmVisualStyles.albumTitleColor).toBe("rgb(255, 255, 255)");
  expect(lastFmVisualStyles.lastFmSectionBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.lastFmShowcaseContentBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.lastFmShowcaseBeforeDisplay).toBe("none");
  expect(lastFmVisualStyles.steamActivityBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.steamActivityBeforeDisplay).toBe("none");
  expect(lastFmVisualStyles.steamHoursColor).toBe("rgb(255, 0, 122)");
  expect(lastFmVisualStyles.steamHoursOnRecordColor).toBe("rgb(255, 0, 122)");
  expect(lastFmVisualStyles.steamLastPlayedColor).toBe("rgb(255, 0, 122)");
  const totalAlignment = await page.locator(".lastfm-profile-total").first().evaluate((node) => {
    const card = node.getBoundingClientRect();
    const label = node.querySelector(".lastfm-profile-total-label")?.getBoundingClientRect();
    const value = node.querySelector(".lastfm-profile-total-value")?.getBoundingClientRect();
    const centerOffset = (box) => box ? Math.abs((box.left + box.width / 2) - (card.left + card.width / 2)) : null;
    return {
      labelOffset: centerOffset(label),
      valueOffset: centerOffset(value)
    };
  });
  const totalLabelStyles = await page.locator(".lastfm-profile-total-label").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight
    };
  });
  expect(totalAlignment.labelOffset).not.toBeNull();
  expect(totalAlignment.valueOffset).not.toBeNull();
  expect(totalAlignment.labelOffset).toBeLessThan(2);
  expect(totalAlignment.valueOffset).toBeLessThan(2);
  expect(totalLabelStyles.fontSize).toBe("18px");
  expect(Number.parseInt(totalLabelStyles.fontWeight, 10)).toBeGreaterThanOrEqual(700);
  const heroShellStyles = await page.locator(".steam-hero-shell").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow
    };
  });
  expect(heroShellStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(heroShellStyles.boxShadow).not.toContain("120vmax");
  await page.locator(".steam-sidebar-row--discord").evaluate((node) => node.click());
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);

  expect(apiRequests).toEqual(expect.arrayContaining([
    "/api/steam-recent-activity",
    "/api/discord",
    "/api/lastfm"
  ]));
  expect(apiRequests).not.toContain("/api/lastfm-now-playing");
  expect(apiRequests).not.toContain("/api/lastfm-track-details");

  const intervalCalls = await page.evaluate(() => window.__codexIntervalCalls || []);
  expect(intervalCalls).toEqual(expect.arrayContaining([
    30 * 60 * 1000,
    60 * 60 * 1000,
    24 * 60 * 60 * 1000
  ]));
  expect(intervalCalls).not.toContain(10 * 60 * 1000);
  expect(intervalCalls).not.toContain(15 * 60 * 1000);
  expect(intervalCalls).not.toContain(12 * 60 * 60 * 1000);
});

test("josie mobile uses the docked desktop player shell", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });

  const apiRequests = [];
  page.on("request", (outboundRequest) => {
    const url = new URL(outboundRequest.url());
    if (url.origin === "http://127.0.0.1:8788" && url.pathname.startsWith("/api/")) {
      apiRequests.push(url.pathname);
    }
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", {
    timeout: 30_000
  });

  await expect(page.locator(".josie-mobile-audio-player .josie-audio-player")).toHaveCount(1);
  await expect(page.locator(".josie-mobile-audio-player .josie-audio-player-wave-shell--mobile-dock")).toHaveCount(0);
  await expect(page.locator(".josie-mobile-audio-chip")).toHaveCount(0);
  await expect(page.locator(".josie-mobile-audio-player [data-shuffle-title]")).toBeVisible();
  await expect(page.locator(".josie-mobile-audio-player [data-shuffle-artist]")).toBeVisible();
  await expect(page.locator(".steam-sidebar-list")).toBeVisible();
  await expect(page.locator(".cinna-mobile-gif--canvas")).toBeVisible();
  await expect(page.locator(".cinna-mobile-gif[hidden]")).toBeHidden();
  await expect(page.locator(".cinna-mobile-gif:visible")).toHaveCount(1);
  const mobileCentering = await page.evaluate(() => {
    const viewportCenter = window.innerWidth / 2;
    const heroAvatar = document.querySelector(".steam-hero-avatar-wrap");
    const sidebarPanel = document.querySelector(".steam-sidebar-panel");
    const centerOffset = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - viewportCenter);
    };
    return {
      heroOffset: centerOffset(heroAvatar),
      sidebarOffset: centerOffset(sidebarPanel)
    };
  });
  expect(mobileCentering.heroOffset).not.toBeNull();
  expect(mobileCentering.sidebarOffset).not.toBeNull();
  expect(mobileCentering.heroOffset).toBeLessThan(4);
  expect(mobileCentering.sidebarOffset).toBeLessThan(4);
  await page.locator(".steam-sidebar-row--discord .steam-sidebar-site-icon svg").evaluate((node) => node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);

  expect(apiRequests).toEqual(expect.arrayContaining([
    "/api/steam-recent-activity",
    "/api/discord"
  ]));
  expect(apiRequests).not.toContain("/api/lastfm");
});

test("josie shows loved, monthly rank, and discovery context for Last.fm tracks", async ({ page }) => {
  const nowIso = new Date().toISOString();
  const oneHourAgoUts = String(Math.floor(Date.now() / 1000) - 60 * 60);

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: nowIso,
        recenttracks: {
          track: [
            {
              name: "Loved Track",
              artist: { name: "Quadeca" },
              album: { "#text": "Vanisher" },
              image: [
                { "#text": "", size: "small" },
                { "#text": "https://example.com/loved-track-art.jpg", size: "large" }
              ],
              url: "https://www.last.fm/music/Quadeca/_/Loved+Track",
              date: { uts: oneHourAgoUts },
              isLoved: true,
              monthlyTopRank: 3,
              monthlyTopPlaycount: "18"
            },
            {
              name: "Regular Track",
              artist: { name: "Jane Remover" },
              album: { "#text": "Ghostholding" },
              image: [
                { "#text": "", size: "small" },
                { "#text": "https://example.com/regular-track-art.jpg", size: "large" }
              ],
              url: "https://www.last.fm/music/Jane+Remover/_/Regular+Track",
              date: { uts: oneHourAgoUts }
            }
          ]
        },
        toptracks: {
          track: [
            {
              name: "Loved Track",
              artist: { name: "Quadeca" },
              playcount: "18",
              "@attr": { rank: "3" }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        user: {
          playcount: "65188",
          artist_count: "1234"
        },
        lovedtracks: {
          "@attr": { total: "1197" }
        },
        discovery: {
          referenceTrack: {
            title: "Loved Track",
            artist: "Quadeca",
            similarTracks: [
              {
                title: "knowing we'll never know",
                artist: "Quadeca",
                url: "https://www.last.fm/music/Quadeca/_/knowing+we%27ll+never+know",
                match: 0.91
              },
              {
                title: "House Settling",
                artist: "Jane Remover",
                url: "https://www.last.fm/music/Jane+Remover/_/House+Settling",
                match: 0.87
              }
            ],
            topTags: [
              { name: "digicore", url: "https://www.last.fm/tag/digicore" },
              { name: "glitch pop", url: "https://www.last.fm/tag/glitch+pop" },
              { name: "noise pop", url: "https://www.last.fm/tag/noise+pop" }
            ]
          }
        },
        nowPlaying: {
          nowPlaying: false,
          stale: false,
          fetchedAt: nowIso,
          track: null
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", {
    timeout: 30_000
  });

  const lovedRow = page.locator(".lastfm-recent-item", {
    has: page.locator(".lastfm-loved-indicator")
  }).first();
  await expect(lovedRow).toContainText("Loved Track");
  await expect(page.locator(".lastfm-loved-indicator")).toHaveCount(1);
  await expect(page.locator(".lastfm-monthly-rank-badge")).toHaveText("#3 month");
  await expect(page.locator(".lastfm-recent-discovery")).toContainText("Sounds like:");
  await expect(page.locator(".lastfm-recent-discovery")).toContainText("knowing we'll never know");
  await expect(page.locator(".lastfm-recent-discovery")).toContainText("House Settling");
  await expect(page.locator(".lastfm-track-tag")).toHaveCount(3);
  const heartStyles = await page.locator(".lastfm-loved-indicator").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow
    };
  });
  const monthlyBadgeStyles = await page.locator(".lastfm-monthly-rank-badge").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color,
      backgroundColor: styles.backgroundColor
    };
  });
  expect(heartStyles.color).toBe("rgb(255, 0, 122)");
  expect(heartStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(heartStyles.boxShadow).toBe("none");
  expect(monthlyBadgeStyles.color).toBe("rgb(255, 255, 255)");
  expect(monthlyBadgeStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("josie opens a track details panel for Last.fm rows and reuses it for related tracks", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (request) => {
    const url = request.url();
    apiRequests.push(url);
  });

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [{ "#text": "https://example.com/one-time-art.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    const url = new URL(route.request().url());
    const track = url.searchParams.get("track");
    const artist = url.searchParams.get("artist");
    if (track === "One Time") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceStatus: "OK",
          stale: false,
          fetchedAt: new Date().toISOString(),
          query: { artist, track, album: "This Is How Tomorrow Moves" },
          track: {
            title: "One Time",
            artist: "beabadoobee",
            album: "This Is How Tomorrow Moves",
            durationMs: 184000,
            durationLabel: "3:04",
            artworkUrl: "",
            lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
            artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
            userPlaycount: 3,
            userLoved: true,
            globalPlaycount: 2740015,
            listeners: 285055,
            summary: "A bright and clipped single.",
            publishedAt: null,
            topTags: [
              { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
              { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
            ]
          },
          spotify: {
            matchStatus: "matched",
            embedUrl: "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator",
            openUrl: "https://open.spotify.com/track/spotify-track-1",
            searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
            previewUrl: "https://p.scdn.co/mp3-preview/one-time-preview.mp3",
            title: "One Time",
            artist: "beabadoobee",
            album: "This Is How Tomorrow Moves",
            artworkUrl: "https://i.scdn.co/image/one-time.jpg"
          },
          scrobbles: {
            total: 3,
            items: [
              {
                playedAtIso: "2026-03-23T07:21:00.000Z",
                playedAtLabel: "23 Mar 2026, 07:21",
                album: "This Is How Tomorrow Moves",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time"
              }
            ]
          },
          artistTopTracks: {
            artist: "beabadoobee",
            items: [
              {
                title: "the perfect pair",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
                artworkUrl: "https://example.com/perfect-pair.jpg",
                userPlaycount: 0,
                userLoved: false,
                globalPlaycount: 29424507,
                listeners: 1452743
              }
            ]
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "PARTIAL",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist, track, album: "" },
        track: {
          title: "the perfect pair",
          artist: "beabadoobee",
          album: "Beatopia",
          durationMs: 193000,
          durationLabel: "3:13",
          artworkUrl: "https://example.com/perfect-pair.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: 0,
          userLoved: false,
          globalPlaycount: 29424507,
          listeners: 1452743,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "unmatched",
          embedUrl: "",
          openUrl: "",
          searchUrl: "https://open.spotify.com/search/the%20perfect%20pair%20beabadoobee",
          previewUrl: "",
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        },
        scrobbles: { total: 0, items: [] },
        artistTopTracks: { artist: "beabadoobee", items: [] }
      })
    });
  });
  await page.route("https://p.scdn.co/mp3-preview/one-time-preview.mp3", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: SPOTIFY_PREVIEW_AUDIO_BUFFER
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.locator("[data-shuffle-surface]").first().click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });

  const sourceRow = page.locator(".lastfm-recent-button").first();
  await sourceRow.click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("One Time");
  await expect(page.locator(".lastfm-track-panel-stat-label")).toContainText(["Scrobbles", "Global plays", "Listeners"]);
  await expect(page.locator(".lastfm-track-panel-stat-label", { hasText: "Your plays" })).toHaveCount(0);
  const panelTypography = await page.evaluate(() => {
    const title = document.querySelector(".lastfm-track-panel-title");
    const meta = document.querySelector(".lastfm-track-panel-meta");
    const relatedTitle = document.querySelector(".lastfm-track-panel-related-title");
    return {
      titleFont: title ? window.getComputedStyle(title).fontFamily : "",
      metaFont: meta ? window.getComputedStyle(meta).fontFamily : "",
      relatedTitleFont: relatedTitle ? window.getComputedStyle(relatedTitle).fontFamily : ""
    };
  });
  expect(panelTypography.metaFont.toLowerCase()).toContain("open sans");
  expect(panelTypography.titleFont).not.toBe(panelTypography.metaFont);
  expect(panelTypography.relatedTitleFont).not.toBe(panelTypography.metaFont);
  await expect(page.locator(".lastfm-track-panel-cta", { hasText: "Open Artist on Last.fm" })).toBeVisible();
  const previewPlayer = page.locator("[data-track-preview-player]");
  await expect(previewPlayer).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-primary [data-track-preview-player]")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-secondary [data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(0);
  await expect(page.locator("[data-track-preview-volume]")).toHaveValue("0.39");
  await expect(page.locator(".lastfm-track-panel-art-image")).toHaveAttribute("src", /https:\/\/i\.scdn\.co\/image\/one-time\.jpg/);
  const previewToggle = page.locator("[data-track-preview-toggle]");
  await previewToggle.click();
  await expect(previewPlayer).toHaveAttribute("data-track-preview-state", "playing");
  await expect(page.locator("[data-shuffle-player].is-playing")).toHaveCount(0);
  const previewVolume = page.locator("[data-track-preview-volume]");
  await previewVolume.evaluate((element) => {
    element.value = "0.35";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(previewPlayer).toHaveAttribute("data-track-preview-volume-value", "0.35");
  await previewToggle.click();
  await expect(previewPlayer).toHaveAttribute("data-track-preview-state", "paused");
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 10_000 });
  const trackCta = page.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" });
  const artistCta = page.locator(".lastfm-track-panel-cta", { hasText: "Open Artist on Last.fm" });
  const spotifyCta = page.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" });
  const cancelPrompt = page.locator("[data-external-confirm-cancel].external-link-confirm-button");
  await trackCta.click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  const zLayers = await page.evaluate(() => {
    const prompt = document.querySelector(".external-link-confirm");
    const panel = document.querySelector(".lastfm-track-panel");
    return {
      prompt: Number.parseInt(window.getComputedStyle(prompt).zIndex || "0", 10),
      panel: Number.parseInt(window.getComputedStyle(panel).zIndex || "0", 10)
    };
  });
  expect(zLayers.prompt).toBeGreaterThan(zLayers.panel);
  await cancelPrompt.click();
  await expect(page.locator(".external-link-confirm")).not.toHaveClass(/is-open/);
  await artistCta.click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await cancelPrompt.click();
  await expect(page.locator(".external-link-confirm")).not.toHaveClass(/is-open/);
  await spotifyCta.click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await cancelPrompt.click();
  await expect(page.locator(".external-link-confirm")).not.toHaveClass(/is-open/);
  await expect(page.locator(".lastfm-track-panel-related-button")).toHaveCount(1);
  await page.locator(".lastfm-track-panel-related-button").click();
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("the perfect pair");
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);
  await expect(sourceRow).toBeFocused();

  expect(apiRequests.filter((url) => url.includes("/api/lastfm-track-details")).length).toBe(2);
  expect(apiRequests.some((url) => url.includes("ws.audioscrobbler.com"))).toBe(false);
  expect(apiRequests.some((url) => url.includes("api.spotify.com"))).toBe(false);
});

test("josie track details panel falls back to spotify search when no preview match exists", async ({ page }) => {
  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "glue trap",
              artist: { name: "Monty.Pk" },
              album: { "#text": "deadbeat" },
              image: [],
              url: "https://www.last.fm/music/Monty.Pk/_/glue+trap",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "PARTIAL",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "Monty.Pk", track: "glue trap", album: "deadbeat" },
        track: {
          title: "glue trap",
          artist: "Monty.Pk",
          album: "deadbeat",
          durationMs: 0,
          durationLabel: "",
          artworkUrl: "",
          lastfmUrl: "https://www.last.fm/music/Monty.Pk/_/glue+trap",
          artistLastFmUrl: "https://www.last.fm/music/Monty.Pk",
          userPlaycount: 1,
          userLoved: false,
          globalPlaycount: 10,
          listeners: 5,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "unmatched",
          embedUrl: "",
          openUrl: "",
          searchUrl: "https://open.spotify.com/search/glue%20trap%20Monty.Pk",
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        },
        scrobbles: { total: 1, items: [] },
        artistTopTracks: { artist: "Monty.Pk", items: [] }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.locator(".lastfm-recent-button").first().click();

  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-cta", { hasText: "Open Spotify Search" })).toBeVisible();
  await page.locator(".lastfm-track-panel-cta", { hasText: "Open Spotify Search" }).click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
});

test("josie does not mount a spotify player when the detail track has no preview clip", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (outboundRequest) => {
    const url = outboundRequest.url();
    if (url.startsWith("http://127.0.0.1:8788/api/")) {
      apiRequests.push(url);
    }
  });

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", track: "One Time", album: "This Is How Tomorrow Moves" },
        track: {
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          durationMs: 184000,
          durationLabel: "3:04",
          artworkUrl: "https://example.com/one-time-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: 3,
          userLoved: false,
          globalPlaycount: 2740015,
          listeners: 285055,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "matched",
          embedUrl: "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator",
          openUrl: "https://open.spotify.com/track/spotify-track-1",
          searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
          previewUrl: "",
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          artworkUrl: "https://i.scdn.co/image/one-time.jpg"
        },
        scrobbles: { total: 3, items: [] },
        artistTopTracks: { artist: "beabadoobee", items: [] }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.locator("[data-shuffle-surface]").first().click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });

  await page.locator(".lastfm-recent-button").first().click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed-host")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(0);
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 10_000 });
  await page.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" }).click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);

  expect(apiRequests.some((url) => url.includes("/api/lastfm-track-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("api.spotify.com"))).toBe(false);
});
