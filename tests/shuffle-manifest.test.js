import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildShuffleManifest, __test as shuffleManifestTest } from "../scripts/shuffle-manifest.js";

test("buildShuffleManifest creates YouTube tracks from the editable Shuffle link list", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internet-angel-shuffle-"));
  const siteDir = path.join(tempRoot, "site");
  const shuffleDir = path.join(siteDir, "Shuffle");
  fs.mkdirSync(shuffleDir, { recursive: true });
  fs.writeFileSync(path.join(shuffleDir, "youtube-links.txt"), [
    "# title | artist | url",
    "Cool Song | Cool Artist | https://www.youtube.com/watch?v=r-6lO_UN3NY",
    "https://youtu.be/dQw4w9WgXcQ"
  ].join("\n"));

  const manifest = buildShuffleManifest({ siteDir });
  assert.equal(manifest.tracks.length, 2);
  assert.deepEqual(manifest.tracks.map((track) => track.youtubeVideoId), [
    "r-6lO_UN3NY",
    "dQw4w9WgXcQ"
  ]);
  assert.equal(manifest.tracks[0].title, "Cool Song");
  assert.equal(manifest.tracks[0].artist, "Cool Artist");
  assert.equal(manifest.tracks[0].mediaType, "youtube");
  assert.equal(manifest.tracks[0].path, "https://www.youtube.com/watch?v=r-6lO_UN3NY");
  assert.equal(manifest.tracks[1].title, "YouTube Video dQw4w9WgXcQ");
  assert.equal(manifest.tracks[1].sortOrder, 1);
});

test("shuffle YouTube parser accepts common YouTube URL shapes", () => {
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://www.youtube.com/watch?v=r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://youtu.be/r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://www.youtube.com/embed/r-6lO_UN3NY"), "r-6lO_UN3NY");
  assert.equal(shuffleManifestTest.extractYouTubeVideoId("https://www.youtube.com/shorts/r-6lO_UN3NY"), "r-6lO_UN3NY");
});
