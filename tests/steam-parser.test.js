import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildSteamRecentActivityPayloadFromMarkdown } from "../functions/lib/steam.js";

const fixturesDir = path.resolve(import.meta.dirname, "fixtures");

test("steam parser extracts profile and recent activity from live-style markdown", () => {
  const source = fs.readFileSync(path.join(fixturesDir, "steam-profile.md"), "utf8");
  const payload = buildSteamRecentActivityPayloadFromMarkdown(
    source,
    "https://steamcommunity.com/id/foundlifeless/",
    Date.parse("2026-03-19T03:00:00.000Z")
  );

  assert.ok(payload);
  assert.equal(payload.profile.name, "Josie");
  assert.equal(payload.profile.statusText, "Currently Online");
  assert.equal(payload.profile.levelBadgeLabel, "Level 22");
  assert.equal(payload.stats[2].value, "84.2h");
  assert.equal(payload.items.length, 3);
  assert.equal(payload.items[0].appId, "3065800");
  assert.match(payload.items[0].meta, /77 hrs on record/i);
});

test("steam parser returns private profile payload for private markdown", () => {
  const source = fs.readFileSync(path.join(fixturesDir, "steam-private.md"), "utf8");
  const payload = buildSteamRecentActivityPayloadFromMarkdown(
    source,
    "https://steamcommunity.com/id/private-user/",
    Date.parse("2026-03-19T03:00:00.000Z")
  );

  assert.ok(payload);
  assert.equal(payload.sourceStatus, "PARTIAL");
  assert.equal(payload.profile.statusText, "Private profile");
  assert.equal(payload.items.length, 0);
});

test("steam parser ignores mirror page heading and keeps the profile bio", () => {
  const source = `Title: Steam Community :: Josie

URL Source: http://steamcommunity.com/id/foundlifeless/

Markdown Content:
# Steam Community :: Josie

[![Image 1](https://avatars.fastly.steamstatic.com/7f56a0dcc6eb91eb84174f52c44cf91aa6d051b5.jpg)](https://steamcommunity.com/id/foundlifeless)

Josie![Image 7](https://community.fastly.steamstatic.com/public/images/skin_1/arrowDn9x5.gif)

This user has also played as:

22

 The Internet Angel

View more info

Currently Online

Recent Activity

84.2 hours past 2 weeks

[![Image 8](https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3065800/capsule_184x69.jpg)](https://steamcommunity.com/app/3065800)

77 hrs on record

 last played on Mar 18
`;
  const payload = buildSteamRecentActivityPayloadFromMarkdown(
    source,
    "https://steamcommunity.com/id/foundlifeless/",
    Date.parse("2026-03-19T03:00:00.000Z")
  );

  assert.ok(payload);
  assert.equal(payload.profile.name, "Josie");
  assert.equal(payload.profile.bio, "The Internet Angel");
  assert.equal(payload.profile.statusText, "Currently Online");
});
