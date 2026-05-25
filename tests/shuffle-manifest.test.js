import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildShuffleManifest, __test as shuffleManifestTest } from "../scripts/shuffle-manifest.js";

test("buildShuffleManifest creates YouTube tracks from the editable Shuffle link list", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internet-angel-shuffle-"));
  const siteDir = path.join(tempRoot, "site");
  const shuffleDir = path.join(siteDir, "Shuffle");
  fs.mkdirSync(shuffleDir, { recursive: true });
  fs.writeFileSync(path.join(shuffleDir, "youtube-links.txt"), [
    "# title | artist | url",
    "Cool Song | Cool Artist | https://www.youtube.com/watch?v=r-6lO_UN3NY",
    "https://youtu.be/dQw4w9WgXcQ"
  ].join("\n"));

  const manifest = await buildShuffleManifest({
    siteDir,
    metadataLookup: async (url) => {
      if (url.includes("dQw4w9WgXcQ")) {
        return {
          title: "Never Gonna Give You Up",
          artist: "Rick Astley",
          channelUrl: "https://www.youtube.com/@RickAstley"
        };
      }
      return null;
    }
  });
  assert.equal(manifest.tracks.length, 2);
  assert.deepEqual(manifest.tracks.map((track) => track.youtubeVideoId), [
    "dQw4w9WgXcQ",
    "r-6lO_UN3NY"
  ]);
  const explicitTrack = manifest.tracks.find((track) => track.youtubeVideoId === "r-6lO_UN3NY");
  const metadataTrack = manifest.tracks.find((track) => track.youtubeVideoId === "dQw4w9WgXcQ");
  assert.equal(explicitTrack.title, "Cool Song");
  assert.equal(explicitTrack.artist, "Cool Artist");
  assert.equal(explicitTrack.mediaType, "youtube");
  assert.equal(explicitTrack.path, "https://www.youtube.com/watch?v=r-6lO_UN3NY");
  assert.equal(explicitTrack.sortOrder, 0);
  assert.equal(metadataTrack.title, "Never Gonna Give You Up");
  assert.equal(metadataTrack.artist, "Rick Astley");
  assert.equal(metadataTrack.youtubeChannelUrl, "https://www.youtube.com/@RickAstley");
  assert.equal(metadataTrack.sortOrder, 1);
});

test("shuffle metadata keeps explicit titles and fills YouTube defaults", () => {
  const explicitTrack = shuffleManifestTest.parseTrackLine(
    "Cool Song | https://www.youtube.com/watch?v=r-6lO_UN3NY",
    0
  );
  const enrichedExplicit = shuffleManifestTest.applyYouTubeMetadata(explicitTrack, {
    title: "OEmbed Title",
    artist: "WispVEVO",
    channelUrl: "https://www.youtube.com/@WispVEVO"
  });
  assert.equal(enrichedExplicit.title, "Cool Song");
  assert.equal(enrichedExplicit.artist, "WispVEVO");
  assert.equal(enrichedExplicit.youtubeChannelUrl, "https://www.youtube.com/@WispVEVO");

  const fallbackTrack = shuffleManifestTest.parseTrackLine("https://youtu.be/dQw4w9WgXcQ", 1);
  const enrichedFallback = shuffleManifestTest.applyYouTubeMetadata(fallbackTrack, {
    title: "Never Gonna Give You Up",
    artist: "Rick Astley"
  });
  assert.equal(enrichedFallback.title, "Never Gonna Give You Up");
  assert.equal(enrichedFallback.artist, "Rick Astley");
});

test("shuffle YouTube parser accepts common YouTube URL shapes", () => {
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://www.youtube.com/watch?v=r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://youtu.be/r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://www.youtube.com/embed/r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://www.youtube.com/shorts/r-6lO_UN3NY"), "r-6lO_UN3NY");
});

test("project shuffle manifest is generated from site/Shuffle/youtube-links.txt", async () => {
  const siteDir = path.resolve(import.meta.dirname, "..", "site");
  const linksPath = path.join(siteDir, "Shuffle", "youtube-links.txt");
  const expectedVideoIds = fs.readFileSync(linksPath, "utf8")
    .split(/\r?\n/)
    .map((line) => shuffleManifestTest.extractYouTubeVideoId(line))
    .filter(Boolean);

  const manifest = await buildShuffleManifest({
    siteDir,
    metadataLookup: null
  });

  assert.deepEqual(
    manifest.tracks.map((track) => track.youtubeVideoId),
    expectedVideoIds.slice().reverse()
  );
});
