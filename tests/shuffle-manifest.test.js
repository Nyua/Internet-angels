import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildShuffleManifest } from "../scripts/shuffle-manifest.js";

test("buildShuffleManifest drops missing manual tracks and adds new files from site/Shuffle", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internet-angel-shuffle-"));
  const siteDir = path.join(tempRoot, "site");
  const shuffleDir = path.join(siteDir, "Shuffle");
  const assetsDir = path.join(siteDir, "assets");
  fs.mkdirSync(shuffleDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(shuffleDir, "Backdoor.mp3"), "");
  fs.writeFileSync(path.join(shuffleDir, "New Song - Artist.mp3"), "");
  fs.writeFileSync(path.join(assetsDir, "shuffle-manifest.json"), JSON.stringify({
    tracks: [
      {
        id: "backdoor-manual",
        groupId: "backdoor-manual",
        title: "Backdoor",
        displayTitle: "Backdoor",
        artist: "Unknown Artist",
        displayArtist: "Unknown Artist",
        path: "/Shuffle/Backdoor.mp3",
        addedAt: "2026-04-10T11:55:00.000Z",
        segmentIndex: 0,
        segmentCount: 1,
        segmentStart: 0,
        segmentOffset: 0
      },
      {
        id: "missing-part-1",
        groupId: "missing-group",
        title: "Missing Track",
        displayTitle: "Missing Track",
        artist: "Missing Artist",
        displayArtist: "Missing Artist",
        path: "/Shuffle/Missing%20Track%20(part%201).mp3",
        addedAt: "2026-04-09T00:00:00.000Z",
        segmentIndex: 0,
        segmentCount: 2,
        segmentStart: 0,
        segmentOffset: 0,
        nextTrackId: "missing-part-2"
      },
      {
        id: "missing-part-2",
        groupId: "missing-group",
        title: "Missing Track",
        displayTitle: "Missing Track",
        artist: "Missing Artist",
        displayArtist: "Missing Artist",
        path: "/Shuffle/Missing%20Track%20(part%202).mp3",
        addedAt: "2026-04-09T00:00:00.000Z",
        segmentIndex: 1,
        segmentCount: 2,
        segmentStart: 0,
        segmentOffset: 120
      }
    ]
  }, null, 2), "utf8");

  const manifest = buildShuffleManifest({ siteDir });
  const manifestPaths = manifest.tracks.map((track) => track.path).sort();
  assert.deepEqual(manifestPaths, [
    "/Shuffle/Backdoor.mp3",
    "/Shuffle/New%20Song%20-%20Artist.mp3"
  ]);

  const backdoorTrack = manifest.tracks.find((track) => track.path === "/Shuffle/Backdoor.mp3");
  const newTrack = manifest.tracks.find((track) => track.path === "/Shuffle/New%20Song%20-%20Artist.mp3");
  assert.equal(backdoorTrack?.id, "backdoor-manual");
  assert.equal(newTrack?.title, "New Song");
  assert.equal(newTrack?.artist, "Artist");
  assert.equal(newTrack?.segmentCount, 1);
});

test("buildShuffleManifest can exclude files above a deploy media size limit", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "internet-angel-shuffle-size-"));
  const siteDir = path.join(tempRoot, "site");
  const shuffleDir = path.join(siteDir, "Shuffle");
  const assetsDir = path.join(siteDir, "assets");
  fs.mkdirSync(shuffleDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  fs.writeFileSync(path.join(shuffleDir, "Tiny Track - Artist.mp3"), "audio");
  const largeVideoPath = path.join(shuffleDir, "Large Video - Artist.mp4");
  fs.writeFileSync(largeVideoPath, "video");
  fs.truncateSync(largeVideoPath, 26 * 1024 * 1024);
  fs.writeFileSync(path.join(assetsDir, "shuffle-manifest.json"), JSON.stringify({
    tracks: [
      {
        id: "large-video",
        groupId: "large-video",
        title: "Large Video",
        displayTitle: "Large Video",
        artist: "Artist",
        displayArtist: "Artist",
        path: "/Shuffle/Large%20Video%20-%20Artist.mp4",
        addedAt: "2026-05-02T00:00:00.000Z",
        segmentIndex: 0,
        segmentCount: 1,
        segmentStart: 0,
        segmentOffset: 0
      }
    ]
  }, null, 2), "utf8");

  const productionManifest = buildShuffleManifest({ siteDir, maxMediaBytes: 25 * 1024 * 1024 });
  assert.deepEqual(productionManifest.tracks.map((track) => track.path), [
    "/Shuffle/Tiny%20Track%20-%20Artist.mp3"
  ]);

  const localManifest = buildShuffleManifest({ siteDir });
  assert.ok(localManifest.tracks.some((track) => track.path === "/Shuffle/Large%20Video%20-%20Artist.mp4"));
});
