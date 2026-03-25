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

test("josie animates track and steam rows on hover and applies ambient artwork to track panels", async ({ page }) => {
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
              image: [{ "#text": "https://example.com/one-time-grid.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) },
              userloved: "1"
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

  await page.route("**/api/steam-recent-activity", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        profile: { name: "Josie", statusText: "Online" },
        stats: [{ label: "2w hours", value: "6.2" }],
        items: [
          {
            id: "steam-1",
            title: "Neon White",
            artworkUrl: "https://example.com/neon-white.jpg",
            hoursOnRecord: "48.6",
            lastPlayed: "2 days ago",
            url: "https://store.steampowered.com/app/1533420/Neon_White/"
          }
        ]
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
          userLoved: true,
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

  const recentRow = page.locator(".lastfm-recent-button").first();
  const steamRow = page.locator(".steam-activity-row-button").first();

  await recentRow.hover();
  await expect.poll(async () => page.locator(".lastfm-recent-art").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);
  await expect.poll(async () => page.locator(".lastfm-recent-image").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);

  await steamRow.hover();
  await expect.poll(async () => page.locator(".steam-activity-capsule").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);
  await expect.poll(async () => page.locator(".steam-activity-capsule-image").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);

  await recentRow.click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  const ambientPanel = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity
    };
  });
  expect(ambientPanel).not.toBeNull();
  expect(ambientPanel.hasAmbient).toBe("true");
  expect(ambientPanel.backgroundImage).toContain("one-time-detail.jpg");
  expect(Number.parseFloat(ambientPanel.opacity)).toBeGreaterThan(0.2);
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
  await expect(page.locator(".lastfm-recent-discovery")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-tag")).toHaveCount(0);
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
            summaryHasMore: true,
            publishedAt: null,
            topTags: [
              { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
              { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
            ],
            similarTracks: [
              { title: "California", artist: "beabadoobee", url: "https://www.last.fm/music/beabadoobee/_/California", match: 0.82 },
              { title: "Glue Song", artist: "beabadoobee", url: "https://www.last.fm/music/beabadoobee/_/Glue+Song", match: 0.79 }
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
                userPlaycount: 2,
                userLoved: false,
                globalPlaycount: 29424507,
                listeners: 1452743
              },
              {
                title: "Talk",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
                artworkUrl: "https://example.com/talk.jpg",
                userPlaycount: 9,
                userLoved: true,
                globalPlaycount: 1820011,
                listeners: 942304
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
          title: track || "the perfect pair",
          artist: "beabadoobee",
          album: "Beatopia",
          durationMs: 193000,
          durationLabel: "3:13",
          artworkUrl: track === "Talk" ? "https://example.com/talk.jpg" : "https://example.com/perfect-pair.jpg",
          lastfmUrl: track === "Talk" ? "https://www.last.fm/music/beabadoobee/_/Talk" : "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: track === "Talk" ? 9 : 2,
          userLoved: track === "Talk",
          globalPlaycount: track === "Talk" ? 1820011 : 29424507,
          listeners: track === "Talk" ? 942304 : 1452743,
          summary: "",
          publishedAt: null,
          topTags: [],
          similarTracks: []
        },
        spotify: {
          matchStatus: track === "Talk" ? "matched" : "unmatched",
          embedUrl: "",
          openUrl: track === "Talk" ? "https://open.spotify.com/track/spotify-talk" : "",
          searchUrl: track === "Talk" ? "https://open.spotify.com/search/Talk%20beabadoobee" : "https://open.spotify.com/search/the%20perfect%20pair%20beabadoobee",
          previewUrl: track === "Talk" ? "https://p.scdn.co/mp3-preview/talk-preview.mp3" : "",
          title: track === "Talk" ? "Talk" : "",
          artist: track === "Talk" ? "beabadoobee" : "",
          album: track === "Talk" ? "Beatopia" : "",
          artworkUrl: track === "Talk" ? "https://i.scdn.co/image/talk.jpg" : ""
        },
        scrobbles: { total: track === "Talk" ? 9 : 2, items: [] },
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
  const panelBox = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const bodyEl = document.querySelector(".lastfm-track-panel-body");
    const backdropEl = document.querySelector(".lastfm-track-panel-backdrop");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const rect = windowEl.getBoundingClientRect();
    const styles = window.getComputedStyle(windowEl);
    return {
      width: rect.width,
      scrollbarWidth: styles.getPropertyValue("scrollbar-width").trim(),
      overflowY: styles.overflowY,
      bodyHeight: bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0,
      clientHeight: windowEl.clientHeight,
      backgroundColor: styles.backgroundColor,
      backdropFilter: backdropEl instanceof HTMLElement ? window.getComputedStyle(backdropEl).backdropFilter : "",
      compactDebugBadgeCount: document.querySelectorAll(".lastfm-track-panel-badge").length
    };
  });
  expect(panelBox).not.toBeNull();
  expect(panelBox.width).toBeLessThanOrEqual(900);
  expect(panelBox.scrollbarWidth).toBe("none");
  expect(panelBox.overflowY).toBe("hidden");
  expect(panelBox.bodyHeight).toBeLessThanOrEqual(panelBox.clientHeight + 2);
  expect(panelBox.backgroundColor).toBe("rgb(0, 0, 0)");
  expect(panelBox.backdropFilter).toContain("blur");
  expect(panelBox.compactDebugBadgeCount).toBeLessThanOrEqual(1);
  await expect(page.locator(".lastfm-track-panel-badge", { hasText: "Cloudflare" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-badge", { hasText: "Live" })).toHaveCount(0);
  await expect(page.getByText(/Last refresh:/)).toHaveCount(0);
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
  await expect(page.locator(".lastfm-track-panel-primary .lastfm-track-panel-similar")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-stack .lastfm-track-panel-similar")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-similar")).toContainText("Sounds like");
  await expect(page.locator(".lastfm-track-panel-similar-chip").first()).toContainText("California");
  const summaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(summaryLink).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-spotify")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed-host")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed-host iframe")).toHaveCount(0);
  await expect(page.locator("[data-track-preview-volume]")).toHaveValue("0.2");
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
  await summaryLink.click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await cancelPrompt.click();
  await expect(page.locator(".external-link-confirm")).not.toHaveClass(/is-open/);
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
  await expect(page.locator(".lastfm-track-panel-related-button")).toHaveCount(2);
  await expect(page.locator(".lastfm-track-panel-related-button").first()).toContainText("Talk");
  await page.locator(".lastfm-track-panel-related-button").first().click();
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("Talk");
  await expect(page.locator(".lastfm-track-panel-spotify-embed-host")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed-host iframe")).toHaveCount(0);
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

test("josie opens artist and album detail panels from top charts and follows album artist links", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (request) => {
    apiRequests.push(request.url());
  });

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: { track: [] },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "33",
              url: "https://www.last.fm/music/beabadoobee",
              image: [{ "#text": "https://example.com/bea-grid.jpg", size: "large" }]
            }
          ]
        },
        topalbums: {
          album: [
            {
              name: "Beatopia",
              artist: { name: "beabadoobee" },
              playcount: "21",
              url: "https://www.last.fm/music/beabadoobee/Beatopia",
              image: [{ "#text": "https://example.com/beatopia-grid.jpg", size: "large" }]
            }
          ]
        },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-artist-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee" },
        artist: {
          name: "beabadoobee",
          artworkUrl: "https://example.com/bea-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee",
          summary: "A dreamy indie artist.",
          summaryHasMore: true,
          listeners: 285055,
          playcount: 2740015,
          topTrackCount: 2,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
            { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
          ]
        },
        topTracks: {
          artist: "beabadoobee",
          items: [
            {
              title: "Talk",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/talk.jpg",
              userPlaycount: 9,
              userLoved: true,
              globalPlaycount: 1820011,
              listeners: 942304
            },
            {
              title: "the perfect pair",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/perfect-pair.jpg",
              userPlaycount: 2,
              userLoved: false,
              globalPlaycount: 29424507,
              listeners: 1452743
            }
          ]
        },
        topAlbums: {
          artist: "beabadoobee",
          items: [
            {
              title: "Beatopia",
              artist: "beabadoobee",
              artworkUrl: "https://example.com/beatopia-detail.jpg",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/Beatopia",
              releasedAt: "15 Jul 2022",
              releaseYear: "2022",
              topTags: [
                { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
                { name: "dream pop", url: "https://www.last.fm/tag/dream+pop" }
              ],
              playcount: 1200456,
              listeners: 500123
            }
          ]
        }
      })
    });
  });

  await page.route("**/api/lastfm-album-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", album: "Beatopia" },
        album: {
          title: "Beatopia",
          artist: "beabadoobee",
          artworkUrl: "https://example.com/beatopia-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/Beatopia",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          summary: "A dreamy sophomore album.",
          summaryHasMore: true,
          listeners: 500123,
          playcount: 1200456,
          releasedAt: "15 Jul 2022",
          runtimeMs: 308000,
          runtimeLabel: "5:08",
          trackCount: 2,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
            { name: "dream pop", url: "https://www.last.fm/tag/dream+pop" }
          ]
        },
        tracks: {
          items: [
            {
              rank: 1,
              title: "Talk",
              artist: "beabadoobee",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              durationMs: 144000,
              durationLabel: "2:24",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
              userPlaycount: 9,
              userLoved: true,
              globalPlaycount: 1820011,
              listeners: 942304
            },
            {
              rank: 2,
              title: "the perfect pair",
              artist: "beabadoobee",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              durationMs: 164000,
              durationLabel: "2:44",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
              userPlaycount: 2,
              userLoved: false,
              globalPlaycount: 29424507,
              listeners: 1452743
            }
          ]
        },
        relatedTracks: {
          artist: "beabadoobee",
          items: [
            {
              title: "See you Soon",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/See+you+Soon",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/see-you-soon.jpg",
              userPlaycount: 4,
              userLoved: false,
              globalPlaycount: 541102,
              listeners: 301204
            },
            {
              title: "Cologne",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Cologne",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/cologne.jpg",
              userPlaycount: 3,
              userLoved: true,
              globalPlaycount: 902210,
              listeners: 411002
            }
          ]
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await page.locator(".lastfm-media-grid--artists .lastfm-media-button").first().click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-kicker")).toContainText("Artist details");
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("beabadoobee");
  const artistAmbient = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity
    };
  });
  expect(artistAmbient).not.toBeNull();
  expect(artistAmbient.hasAmbient).toBe("true");
  expect(artistAmbient.backgroundImage).toContain("bea-detail.jpg");
  expect(Number.parseFloat(artistAmbient.opacity)).toBeGreaterThan(0.2);
  const artistPanelLayout = await page.evaluate(() => {
    const layout = document.querySelector(".lastfm-track-panel-layout");
    const primary = document.querySelector(".lastfm-track-panel-primary");
    const art = document.querySelector(".lastfm-track-panel-art");
    return {
      className: layout instanceof HTMLElement ? layout.className : "",
      primaryWidth: primary instanceof HTMLElement ? primary.getBoundingClientRect().width : 0,
      artBackground: art instanceof HTMLElement ? window.getComputedStyle(art).backgroundColor : "",
      artBorderWidth: art instanceof HTMLElement ? window.getComputedStyle(art).borderTopWidth : ""
    };
  });
  expect(artistPanelLayout.className).toContain("lastfm-track-panel-layout--compact-primary");
  expect(artistPanelLayout.primaryWidth).toBeGreaterThan(180);
  expect(artistPanelLayout.artBackground).toBe("rgba(0, 0, 0, 0)");
  expect(artistPanelLayout.artBorderWidth).toBe("0px");
  const artistPanelFit = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const bodyEl = document.querySelector(".lastfm-track-panel-body");
    return windowEl instanceof HTMLElement ? {
      bodyHeight: bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0,
      clientHeight: windowEl.clientHeight,
      overflowY: window.getComputedStyle(windowEl).overflowY
    } : null;
  });
  expect(artistPanelFit).not.toBeNull();
  expect(artistPanelFit.overflowY).toBe("hidden");
  expect(artistPanelFit.bodyHeight).toBeLessThanOrEqual(artistPanelFit.clientHeight + 2);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Popular tracks" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Albums" })).toBeVisible();
  const artistSummaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(artistSummaryLink).toBeVisible();
  await artistSummaryLink.click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await page.locator("[data-external-confirm-cancel].external-link-confirm-button").click();
  await expect(page.locator(".external-link-confirm")).not.toHaveClass(/is-open/);
  const artistPopularTracksSection = page.locator(".lastfm-track-panel-related").filter({
    has: page.locator(".lastfm-track-panel-section-title", { hasText: "Popular tracks" })
  });
  await expect(artistPopularTracksSection.locator(".lastfm-track-panel-related-button").first()).toContainText("Talk");
  await expect(page.locator(".lastfm-track-panel-related-button--album")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("2022");
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("indie pop");
  await page.locator(".lastfm-track-panel-related-button--album").first().click();
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel-window:not(.is-loading)")).toHaveCount(1);
  const albumAmbientFromArtistPopup = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity
    };
  });
  expect(albumAmbientFromArtistPopup).not.toBeNull();
  expect(albumAmbientFromArtistPopup.hasAmbient).toBe("true");
  expect(albumAmbientFromArtistPopup.backgroundImage).toContain("beatopia-detail.jpg");
  expect(Number.parseFloat(albumAmbientFromArtistPopup.opacity)).toBeGreaterThan(0.2);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);

  await page.locator(".lastfm-media-grid--albums .lastfm-media-button").first().click();
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel-window:not(.is-loading)")).toHaveCount(1);
  const albumAmbient = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity
    };
  });
  expect(albumAmbient).not.toBeNull();
  expect(albumAmbient.hasAmbient).toBe("true");
  expect(albumAmbient.backgroundImage).toContain("beatopia-detail.jpg");
  expect(Number.parseFloat(albumAmbient.opacity)).toBeGreaterThan(0.2);
  const albumPanelFit = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const bodyEl = document.querySelector(".lastfm-track-panel-body");
    return windowEl instanceof HTMLElement ? {
      bodyHeight: bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0,
      clientHeight: windowEl.clientHeight,
      overflowY: window.getComputedStyle(windowEl).overflowY
    } : null;
  });
  expect(albumPanelFit).not.toBeNull();
  expect(albumPanelFit.overflowY).toBe("hidden");
  expect(albumPanelFit.bodyHeight).toBeLessThanOrEqual(albumPanelFit.clientHeight + 2);
  const albumSummaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(albumSummaryLink).toBeVisible();
  await albumSummaryLink.click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await page.locator("[data-external-confirm-cancel].external-link-confirm-button").click();
  await expect(page.locator(".external-link-confirm")).not.toHaveClass(/is-open/);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Track list" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-track-item")).toHaveCount(2);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-related-button")).toContainText(["See you Soon", "Cologne"]);
  const headerArtistLink = page.locator(".lastfm-track-panel-meta .lastfm-track-panel-inline-link").first();
  await expect(headerArtistLink).toHaveText("beabadoobee");
  await headerArtistLink.click();
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("beabadoobee");
  await page.keyboard.press("Escape");
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);

  await page.locator(".lastfm-media-grid--albums .lastfm-media-button").first().click();
  const trackArtistLink = page.locator(".lastfm-track-panel-track-meta .lastfm-track-panel-inline-link").first();
  await expect(trackArtistLink).toHaveText("beabadoobee");
  await trackArtistLink.click();
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("beabadoobee");

  expect(apiRequests.some((url) => url.includes("/api/lastfm-artist-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("/api/lastfm-album-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("ws.audioscrobbler.com"))).toBe(false);
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
  await expect(page.locator(".lastfm-track-panel-spotify-embed-host iframe")).toHaveCount(0);
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 10_000 });
  await page.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" }).click();
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);

  expect(apiRequests.some((url) => url.includes("/api/lastfm-track-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("api.spotify.com"))).toBe(false);
});
