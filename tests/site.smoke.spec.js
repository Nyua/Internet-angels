import { test, expect } from "@playwright/test";

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
  expect(totalAlignment.labelOffset).not.toBeNull();
  expect(totalAlignment.valueOffset).not.toBeNull();
  expect(totalAlignment.labelOffset).toBeLessThan(2);
  expect(totalAlignment.valueOffset).toBeLessThan(2);
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
