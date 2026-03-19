import { test, expect } from "@playwright/test";

test("root loads the intro page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/BloomToDeath ASCII Timelapse/);
});

test("next page redirects to josie", async ({ page }) => {
  await page.goto("/next.html");
  await expect(page).toHaveURL(/\/josie(?:\.html)?$/);
  await expect(page).toHaveTitle(/Josie/);
});

test("josie renders and dynamic endpoints respond", async ({ page, request }) => {
  const lastfmResponse = await request.get("/api/lastfm");
  expect(lastfmResponse.status()).toBe(200);

  const nowPlayingResponse = await request.get("/api/lastfm-now-playing");
  expect(nowPlayingResponse.status()).toBe(200);

  const discordResponse = await request.get("/api/discord");
  expect(discordResponse.status()).toBe(200);

  const steamResponse = await request.get("/api/steam-recent-activity");
  expect(steamResponse.status()).toBe(200);

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", {
    timeout: 30_000
  });

  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true");
  await expect(page.locator(".steam-hero-name")).toHaveText("Josie");
  await expect(page.locator(".steam-hero-ornament")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-heart")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-wing--left")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-wing--right")).toHaveCount(1);
  await expect(page.locator(".steam-hero-description")).toContainText("The Internet Angel");
  await expect(page.locator(".steam-hero-avatar-decoration")).toHaveCount(1);
  await expect(page.locator(".lastfm-profile-total-value").first()).not.toHaveText("--");
});
