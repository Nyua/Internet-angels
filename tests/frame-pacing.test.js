import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function loadFramePacingHelpers() {
  const sourcePath = path.join(process.cwd(), "site", "josie.app.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const startMarker = "  var ANIMATION_FRAME_PACING_TOLERANCE_MS = 1.25;";
  const endMarker = "  function getCanvas2DContext";
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex);
  assert.notEqual(startIndex, -1, "frame pacing helper should exist in josie.app.js");
  assert.notEqual(endIndex, -1, "frame pacing helper should end before getCanvas2DContext");
  const snippet = source.slice(startIndex, endIndex);
  return vm.runInNewContext(`(() => {${snippet}; return { createAnimationFrameGate, ANIMATION_FRAME_PACING_TOLERANCE_MS }; })()`);
}

function buildTimes(deltaMs, sampleCount) {
  const times = [];
  let nowMs = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    nowMs += deltaMs;
    times.push(Number(nowMs.toFixed(4)));
  }
  return times;
}

test("createAnimationFrameGate keeps 60 Hz-like frames flowing without alternating skips", () => {
  const { createAnimationFrameGate, ANIMATION_FRAME_PACING_TOLERANCE_MS } = loadFramePacingHelpers();
  const gate = createAnimationFrameGate(1000 / 60);
  const frames = buildTimes(16.4, 6).map((timeMs) => gate.shouldRender(timeMs));
  assert.equal(ANIMATION_FRAME_PACING_TOLERANCE_MS > 0, true);
  assert.deepEqual(frames, [true, true, true, true, true, true]);
});

test("createAnimationFrameGate caps high-refresh frame streams near the target budget", () => {
  const { createAnimationFrameGate } = loadFramePacingHelpers();
  const gate = createAnimationFrameGate(1000 / 60);
  const frames = buildTimes(1000 / 144, 24).map((timeMs) => gate.shouldRender(timeMs));
  const renderedFrameCount = frames.filter(Boolean).length;
  assert.equal(frames[0], true);
  assert.equal(renderedFrameCount >= 9, true);
  assert.equal(renderedFrameCount <= 11, true);
});

test("createAnimationFrameGate reset clears accumulated pacing debt", () => {
  const { createAnimationFrameGate } = loadFramePacingHelpers();
  const gate = createAnimationFrameGate(1000 / 60);
  gate.shouldRender(6.94);
  gate.shouldRender(13.88);
  gate.reset();
  assert.equal(gate.shouldRender(6.94), true);
});
