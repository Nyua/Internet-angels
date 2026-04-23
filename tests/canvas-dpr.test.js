import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function loadCanvasDprHelper() {
  const sourcePath = path.join(process.cwd(), "site", "josie.app.js");
  const source = fs.readFileSync(sourcePath, "utf8");
  const startMarker = "  function clamp(value, min, max) {";
  const endMarker = "  function getCanvas2DContext";
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex);
  assert.notEqual(startIndex, -1, "top-level clamp helper should exist in josie.app.js");
  assert.notEqual(endIndex, -1, "canvas DPR helper should end before getCanvas2DContext");
  const snippet = source.slice(startIndex, endIndex);
  return vm.runInNewContext(`(() => {${snippet}; return { resolveCanvasRenderDpr }; })()`);
}

test("resolveCanvasRenderDpr preserves the requested DPR when the surface stays within budget", () => {
  const { resolveCanvasRenderDpr } = loadCanvasDprHelper();
  const dpr = resolveCanvasRenderDpr(1280, 720, 1.6, 68e5);
  assert.equal(dpr, 1.6);
});

test("resolveCanvasRenderDpr scales high-DPI desktop canvases back under the pixel budget", () => {
  const { resolveCanvasRenderDpr } = loadCanvasDprHelper();
  const dpr = resolveCanvasRenderDpr(2560, 1440, 1.6, 68e5);
  assert.equal(Number(dpr.toFixed(2)), 1.36);
});

test("resolveCanvasRenderDpr never drops desktop canvases below 1x", () => {
  const { resolveCanvasRenderDpr } = loadCanvasDprHelper();
  const dpr = resolveCanvasRenderDpr(3840, 2160, 1.6, 68e5);
  assert.equal(dpr, 1);
});
