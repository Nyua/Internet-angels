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
          artist: "Rick Astley"
        };
      }
      return null;
    }
  });
  assert.equal(manifest.tracks.length, 2);
  assert.deepEqual(manifest.tracks.map((track) => track.youtubeVideoId), [
    "r-6lO_UN3NY",
    "dQw4w9WgXcQ"
  ]);
  assert.equal(manifest.tracks[0].title, "Cool Song");
  assert.equal(manifest.tracks[0].artist, "Cool Artist");
  assert.equal(manifest.tracks[0].mediaType, "youtube");
  assert.equal(manifest.tracks[0].path, "https://www.youtube.com/watch?v=r-6lO_UN3NY");
  assert.equal(manifest.tracks[1].title, "Never Gonna Give You Up");
  assert.equal(manifest.tracks[1].artist, "Rick Astley");
  assert.equal(manifest.tracks[1].sortOrder, 1);
});

test("shuffle metadata keeps explicit titles and fills YouTube defaults", () => {
  const explicitTrack = shuffleManifestTest.parseTrackLine(
    "Cool Song | https://www.youtube.com/watch?v=r-6lO_UN3NY",
    0
  );
  const enrichedExplicit = shuffleManifestTest.applyYouTubeMetadata(explicitTrack, {
    title: "OEmbed Title",
    artist: "WispVEVO"
  });
  assert.equal(enrichedExplicit.title, "Cool Song");
  assert.equal(enrichedExplicit.artist, "WispVEVO");

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
