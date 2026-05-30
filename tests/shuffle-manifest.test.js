import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MOBILE_LOCAL_SHUFFLE_VIDEO_FILE,
  buildShuffleManifest,
  __test as shuffleManifestTest
} from "../scripts/shuffle-manifest.js";

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
    channelUrl: "https://www.youtube.com/@WispVEVO",
    width: 200,
    height: 150
  });
  assert.equal(enrichedExplicit.title, "Cool Song");
  assert.equal(enrichedExplicit.artist, "WispVEVO");
  assert.equal(enrichedExplicit.youtubeChannelUrl, "https://www.youtube.com/@WispVEVO");
  assert.equal(enrichedExplicit.youtubeAspectRatio, "4:3");
  assert.equal(enrichedExplicit.youtubeAspectRatioValue, 1.333333);

  const fallbackTrack = shuffleManifestTest.parseTrackLine("https://youtu.be/dQw4w9WgXcQ", 1);
  const enrichedFallback = shuffleManifestTest.applyYouTubeMetadata(fallbackTrack, {
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    youtubeEmbedWidth: 200,
    youtubeEmbedHeight: 113
  });
  assert.equal(enrichedFallback.title, "Never Gonna Give You Up");
  assert.equal(enrichedFallback.artist, "Rick Astley");
  assert.equal(enrichedFallback.youtubeAspectRatio, "16:9");
});

test("shuffle YouTube metadata carries presentation aspect ratios", () => {
  const aspectTrack = shuffleManifestTest.parseTrackLine(
    "Aspect Song | Aspect Artist | https://www.youtube.com/watch?v=r-6lO_UN3NY | 4:3 | 142",
    0
  );
  assert.equal(aspectTrack.title, "Aspect Song");
  assert.equal(aspectTrack.artist, "Aspect Artist");
  assert.equal(aspectTrack.duration, 142);
  assert.equal(aspectTrack.youtubeAspectRatio, "4:3");
  assert.equal(aspectTrack.youtubeAspectRatioValue, 1.333333);

  const fallbackTitleTrack = shuffleManifestTest.parseTrackLine(
    "https://youtu.be/dQw4w9WgXcQ | 4:3",
    1
  );
  assert.equal(fallbackTitleTrack.title, "YouTube Video dQw4w9WgXcQ");
  assert.equal(fallbackTitleTrack.artist, "YouTube");
  assert.equal(fallbackTitleTrack.youtubeAspectRatio, "4:3");
});

test("buildShuffleManifest exposes the committed mobile local video fallback", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internet-angel-shuffle-"));
  const siteDir = path.join(tempRoot, "site");
  const shuffleDir = path.join(siteDir, "Shuffle");
  fs.mkdirSync(shuffleDir, { recursive: true });
  fs.writeFileSync(path.join(shuffleDir, "youtube-links.txt"), [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  ].join("\n"));
  fs.writeFileSync(path.join(shuffleDir, MOBILE_LOCAL_SHUFFLE_VIDEO_FILE), "mobile fallback video");

  const manifest = await buildShuffleManifest({
    siteDir,
    metadataLookup: null
  });

  assert.equal(manifest.tracks.length, 1);
  assert.equal(manifest.mobileFallbackTrack.mediaType, "video");
  assert.equal(manifest.mobileFallbackTrack.mobileOnly, true);
  assert.equal(manifest.mobileFallbackTrack.path, "/Shuffle/How%20to%20Pretend%20-%20Lucy%20Bedroque.mp4");
  assert.equal(manifest.mobileFallbackTrack.title, "How to Pretend");
  assert.equal(manifest.mobileFallbackTrack.artist, "Lucy Bedroque");
});

test("shuffle metadata is normalized as UTF-8 clean text", () => {
  assert.equal(
    shuffleManifestTest.cleanMetadataValue("caf\u0065\u0301 &amp; cr\u00e8me \u200e \ud800"),
    "café & crème �"
  );

  const fallbackTrack = shuffleManifestTest.parseTrackLine("https://youtu.be/C78R3s3zeB0", 0);
  const enrichedFallback = shuffleManifestTest.applyYouTubeMetadata(fallbackTrack, {
    title: "ericdoa – goddamn &#39;extended&#39;",
    artist: "𐂯",
    channelUrl: "https://www.youtube.com/@artist"
  });
  assert.equal(enrichedFallback.title, "ericdoa – goddamn 'extended'");
  assert.equal(enrichedFallback.artist, "𐂯");
  assert.equal(enrichedFallback.displayArtist, "𐂯");
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
