import { test, expect } from "@playwright/test";

function createSilentWavBuffer(durationSeconds = 4, sampleRate = 8_000) {
  const sampleCount = Math.max(1, Math.floor(durationSeconds * sampleRate));
  const dataSize = sampleCount;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  buffer.fill(128, 44);
  return buffer;
}

const SPOTIFY_PREVIEW_AUDIO_BUFFER = createSilentWavBuffer();

async function stubSpotifyIframeApi(page) {
  await page.addInitScript(() => {
    window.__spotifyEmbedControllers = [];
    window.__spotifyEmbedControllerMode = { hangNext: false, delayNextMs: 0 };
    const createController = (target, options, callback) => {
      if (window.__spotifyEmbedControllerMode?.hangNext) {
        window.__spotifyEmbedControllerMode.hangNext = false;
        window.__spotifyEmbedControllers.push({ controller: null, options, hung: true });
        return;
      }
      const delayMs = Math.max(0, Number(window.__spotifyEmbedControllerMode?.delayNextMs) || 0);
      if (delayMs > 0) {
        window.__spotifyEmbedControllerMode.delayNextMs = 0;
      }
      const realizeController = () => {
        const listeners = new Map();
        if (target instanceof HTMLElement) {
          target.innerHTML = "";
          const iframe = document.createElement("iframe");
          iframe.className = "lastfm-track-panel-spotify-embed";
          iframe.src = "about:blank";
          iframe.title = "Stub Spotify embed";
          iframe.setAttribute("aria-hidden", "true");
          target.appendChild(iframe);
        }
        const emit = (eventName, payload) => {
          const handlers = listeners.get(eventName) || [];
          handlers.forEach((handler) => {
            try {
              handler(payload);
            } catch {
            }
          });
        };
        const controller = {
          addListener(eventName, handler) {
            const handlers = listeners.get(eventName) || [];
            handlers.push(handler);
            listeners.set(eventName, handlers);
          },
          pause() {
            emit("playback_update", { data: { isPaused: true } });
          },
          destroy() {
            if (target instanceof HTMLElement) {
              target.innerHTML = "";
            }
          },
          __emit: emit
        };
        window.__spotifyEmbedControllers.push({ controller, options, delayed: delayMs > 0 });
        callback?.(controller);
      };
      if (delayMs > 0) {
        window.setTimeout(realizeController, delayMs);
        return;
      }
      realizeController();
    };
    window.__internetAngelSpotifyIframeApi = { createController };
    window.__setSpotifyEmbedControllerMode = (nextMode = {}) => {
      window.__spotifyEmbedControllerMode = {
        ...(window.__spotifyEmbedControllerMode || {}),
        ...nextMode
      };
    };
    window.__emitSpotifyIframeEvent = (index, eventName, payload) => {
      const entry = window.__spotifyEmbedControllers?.[index];
      entry?.controller?.__emit?.(eventName, payload);
    };
  });
}

async function setLastFmPanelSceneDebug(page, nextDebug = {}) {
  await page.evaluate((debug) => {
    window.__internetAngelLastFmPanelSceneDebug = debug;
    window.__internetAngelLastFmPanelExplosionLog = [];
  }, nextDebug);
}

async function stubWindowOpen(page) {
  await page.addInitScript(() => {
    window.__windowOpenCalls = [];
    window.open = (url, target, features) => {
      window.__windowOpenCalls.push({
        url: String(url ?? ""),
        target: String(target ?? ""),
        features: String(features ?? "")
      });
      return {
        closed: false,
        close() {},
        focus() {},
        location: { href: String(url ?? "") }
      };
    };
  });
}

async function drainWindowOpenCalls(page) {
  return page.evaluate(() => {
    const calls = Array.isArray(window.__windowOpenCalls) ? window.__windowOpenCalls.slice() : [];
    window.__windowOpenCalls = [];
    return calls;
  });
}

async function readInteractionSfxLog(page) {
  return page.evaluate(() => Array.isArray(window.__internetAngelInteractionSfxLog) ? window.__internetAngelInteractionSfxLog.slice() : []);
}

async function clearInteractionSfxLog(page) {
  await page.evaluate(() => {
    window.__internetAngelInteractionSfxLog = [];
  });
}

async function waitForInteractionSfx(page, predicate, timeout = 10_000) {
  const handle = await page.waitForFunction((matcher) => {
    const log = Array.isArray(window.__internetAngelInteractionSfxLog) ? window.__internetAngelInteractionSfxLog : [];
    return log.find((entry) => {
      return Object.entries(matcher).every(([key, value]) => entry?.[key] === value);
    }) || null;
  }, predicate, { timeout, polling: 50 });
  return handle.jsonValue();
}

async function showLastFmPanelArtActions(page, options = {}) {
  const scope = options.scope ?? page;
  const artShell = scope.locator(".lastfm-track-panel-art--flip").first();
  await expect(artShell).toBeVisible({ timeout: options.timeout ?? 10_000 });
  await artShell.locator("[data-lastfm-panel-art-toggle]").click();
  await expect(artShell).toHaveAttribute("data-panel-face", "back");
  return artShell;
}

async function readLastFmPanelArtHoverState(page) {
  return page.evaluate(() => {
    const artShell = document.querySelector(".lastfm-track-panel-art");
    const artImage = document.querySelector(".lastfm-track-panel-art-image");
    if (!(artShell instanceof HTMLElement)) {
      return null;
    }
    const shellStyles = window.getComputedStyle(artShell);
    const imageStyles = artImage instanceof HTMLElement ? window.getComputedStyle(artImage) : null;
    const beforeStyles = window.getComputedStyle(artShell, "::before");
    return {
      shellTransform: shellStyles.transform,
      imageTransform: imageStyles?.transform || "",
      imageFilter: imageStyles?.filter || "",
      overlayOpacity: beforeStyles.opacity
    };
  });
}

async function waitForLastFmPanelSourceArtState(page, sourceSelector, expectedState, options = {}) {
  await page.waitForFunction(({ selector, state, panelVisibility, ariaHidden, minWindowOpacity }) => {
    const source = document.querySelector(selector);
    if (!(source instanceof HTMLElement)) {
      return false;
    }
    if (source.dataset.lastfmArtSourceState !== state) {
      return false;
    }
    if (!panelVisibility && ariaHidden == null && minWindowOpacity == null) {
      return true;
    }
    const panel = document.querySelector(".lastfm-track-panel");
    if (!(panel instanceof HTMLElement)) {
      return false;
    }
    if (panelVisibility && panel.getAttribute("data-panel-visibility") !== panelVisibility) {
      return false;
    }
    if (ariaHidden != null && panel.getAttribute("aria-hidden") !== ariaHidden) {
      return false;
    }
    if (minWindowOpacity == null) {
      return true;
    }
    const windowEl = panel.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return false;
    }
    return Number.parseFloat(window.getComputedStyle(windowEl).opacity || "0") > minWindowOpacity;
  }, {
    selector: sourceSelector,
    state: expectedState,
    panelVisibility: options.panelVisibility ?? null,
    ariaHidden: options.ariaHidden ?? null,
    minWindowOpacity: options.minWindowOpacity ?? null
  }, { timeout: options.timeout ?? 8_000 });
}

async function emitCustomCursorHover(page, selector) {
  await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (!(target instanceof HTMLElement)) return;
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const init = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      view: window
    };
    target.dispatchEvent(new MouseEvent("mouseover", init));
    target.dispatchEvent(new MouseEvent("mousemove", init));
    window.dispatchEvent(new MouseEvent("mousemove", init));
  }, selector);
}

async function mockClientTime(page, parts) {
  await page.addInitScript((value) => {
    const RealDate = Date;
    const fixedMs = new RealDate(
      value.year,
      value.monthIndex,
      value.day,
      value.hour,
      value.minute ?? 0,
      value.second ?? 0,
      value.ms ?? 0
    ).valueOf();
    class MockDate extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedMs);
          return;
        }
        super(...args);
      }
      static now() {
        return fixedMs;
      }
    }
    Object.setPrototypeOf(MockDate, RealDate);
    window.Date = MockDate;
  }, parts);
}

async function setDesktopPerformanceOverride(page, tier = "full") {
  await page.addInitScript((nextTier) => {
    try {
      window.sessionStorage.setItem("internetAngelPerformanceOverride", String(nextTier || "full"));
    } catch {
    }
  }, tier);
}

test.beforeEach(async ({ page }) => {
  await setDesktopPerformanceOverride(page, "full");
});

test("root loads the Wings intro page centered on black with no intro ASCII overlay", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/BloomToDeath/);
  await expect(page.locator("#introVideo")).toHaveCount(1);
  await expect(page.locator("#introStartButton")).toBeVisible();
  await expect(page.locator("#handoffFrame")).toHaveCount(1);
  await expect(page.locator("#asciiCanvas")).toHaveCount(0);
  await expect(page.locator("#introVideo")).toHaveClass(/is-ready/, { timeout: 15_000 });
  const introState = await page.locator("#introVideo").evaluate((node) => ({
    src: node.currentSrc || node.src,
    muted: node.muted,
    hasControls: node.controls,
    paused: node.paused,
    rect: node.getBoundingClientRect().toJSON(),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    bodyBackground: window.getComputedStyle(document.body).backgroundColor
  }));
  expect(introState.src).toMatch(/Wings\.mp4/);
  expect(introState.muted).toBe(false);
  expect(introState.hasControls).toBe(false);
  expect(introState.paused).toBe(true);
  expect(introState.bodyBackground).toBe("rgb(0, 0, 0)");
  expect(Math.abs(introState.rect.left - (introState.viewportWidth - introState.rect.width) / 2)).toBeLessThan(2);
  expect(Math.abs(introState.rect.top - (introState.viewportHeight - introState.rect.height) / 2)).toBeLessThan(2);
});

test("root still plays the intro movie even when the old repeat-visit flag exists", async ({ page }) => {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "1");
  }, "internetAngelBloomToDeathIntroSeen");
  await page.goto("/");
  await expect(page).toHaveTitle(/BloomToDeath/);
  await expect(page.locator("#introStartButton")).toBeVisible();
  await expect(page.locator("#introVideo")).toHaveClass(/is-ready/, { timeout: 15_000 });
  const repeatVisitState = await page.evaluate(() => {
    const video = document.querySelector("#introVideo");
    return {
      repeatVisit: document.body?.dataset?.bloomToDeathRepeatVisit || "",
      state: document.body?.dataset?.bloomToDeathState || "",
      videoHidden: video instanceof HTMLVideoElement ? video.classList.contains("is-hidden") : false,
      videoSrcAttr: video instanceof HTMLVideoElement ? video.getAttribute("src") : null
    };
  });
  expect(repeatVisitState.repeatVisit).toBe("false");
  expect(repeatVisitState.state).toBe("idle");
  expect(repeatVisitState.videoHidden).toBe(false);
  expect(repeatVisitState.videoSrcAttr).toBe("Timelapse/Wings.mp4");

  await clearInteractionSfxLog(page);
  await page.locator("#introStartButton").click();
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => ({
    paused: node.paused,
    muted: node.muted
  }))).toEqual({ paused: false, muted: false });
  await expect(page.locator("#handoffFrame")).toHaveAttribute("src", /handoff=1/);
  await expect(page.locator("body")).toHaveAttribute("data-bloom-to-death-state", "playing_intro");
  const repeatVisitSfxLog = await readInteractionSfxLog(page);
  expect(repeatVisitSfxLog.filter((entry) => /introStartButton|introHandoffVisible/.test(String(entry?.source || "")))).toEqual([]);
});

test("root starts the Josie handoff about two seconds before the intro video ends", async ({ page }) => {
  await page.goto("/");
  await clearInteractionSfxLog(page);
  await page.locator("#introStartButton").click();
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => ({
    paused: node.paused,
    muted: node.muted
  }))).toEqual({ paused: false, muted: false });
  await expect(page.locator("body")).toHaveAttribute("data-bloom-to-death-state", /preloading_josie|playing_intro|handoff_pending/);
  await expect(page.locator("#handoffFrame")).toHaveAttribute("src", /handoff=1/);

  const handoffFrame = page.frameLocator("#handoffFrame");
  await handoffFrame.locator("#social-hub-root[data-social-hub-ready='true']").waitFor({ timeout: 30_000 });

  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);
  await page.locator("#introVideo").evaluate((node) => {
    const targetTime = Math.max(0, (Number.isFinite(node.duration) ? node.duration : 18) - 2.2);
    Object.defineProperty(node, "currentTime", {
      configurable: true,
      get() {
        return targetTime;
      },
      set() {
      }
    });
    Object.defineProperty(node, "ended", {
      configurable: true,
      get() {
        return false;
      }
    });
    node.dispatchEvent(new Event("seeking"));
    node.dispatchEvent(new Event("seeked"));
    node.dispatchEvent(new Event("timeupdate"));
  });
  await page.waitForFunction(() => {
    const video = document.querySelector("#introVideo");
    return video instanceof HTMLVideoElement
      && Number.isFinite(video.duration)
      && video.duration > 0
      && video.currentTime >= Math.max(0, video.duration - 2.25);
  });
  await expect(page.locator("body")).not.toHaveAttribute("data-bloom-to-death-state", "handoff_visible");
  await page.locator("#introVideo").evaluate((node) => {
    node.currentTime = Math.max(0, node.duration - 1.8);
    node.dispatchEvent(new Event("seeking"));
    node.dispatchEvent(new Event("seeked"));
    node.dispatchEvent(new Event("timeupdate"));
  });
  const duringHandoffHandle = await page.waitForFunction(() => {
    const video = document.querySelector("#introVideo");
    const frameWrap = document.querySelector("#handoffFrameWrap");
    if (
      !(video instanceof HTMLVideoElement)
      || !(frameWrap instanceof HTMLElement)
      || document.body?.dataset?.bloomToDeathState !== "handoff_visible"
      || !document.body.classList.contains("is-handoff-visible")
    ) {
      return null;
    }
    return {
      href: window.location.href,
      title: document.title,
      state: document.body?.dataset?.bloomToDeathState || "",
      hiddenClass: video.classList.contains("is-hidden"),
      pointerEvents: window.getComputedStyle(frameWrap).pointerEvents
    };
  }, null, { timeout: 25_000, polling: 50 });
  const duringHandoff = await duringHandoffHandle.jsonValue();
  expect(duringHandoff).not.toBeNull();
  expect(duringHandoff.href).toMatch(/\/josie$/);
  expect(duringHandoff.title).toMatch(/^\|?$|^J|^Jo|^Jos|^Josi|^Josie$/);
  expect(duringHandoff.state).toBe("handoff_visible");
  expect(duringHandoff.hiddenClass).toBe(false);
  expect(duringHandoff.pointerEvents).toBe("none");
  const bloomToDeathSfxLog = await readInteractionSfxLog(page);
  expect(bloomToDeathSfxLog.filter((entry) => /introStartButton|introHandoffVisible/.test(String(entry?.source || "")))).toEqual([]);

  await page.locator("#introVideo").evaluate((node) => {
    node.currentTime = node.duration;
    node.dispatchEvent(new Event("seeking"));
    node.dispatchEvent(new Event("seeked"));
    node.dispatchEvent(new Event("timeupdate"));
    node.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator("body")).toHaveAttribute("data-bloom-to-death-state", "handoff_complete");
  await expect(page.locator("body")).toHaveClass(/is-handoff-complete/);
  await expect(page).toHaveTitle("Josie");
  const completedHandoff = await page.evaluate(() => {
    const video = document.querySelector("#introVideo");
    const frameWrap = document.querySelector("#handoffFrameWrap");
    if (!(video instanceof HTMLVideoElement) || !(frameWrap instanceof HTMLElement)) return null;
    return {
      hiddenClass: video.classList.contains("is-hidden"),
      pointerEvents: window.getComputedStyle(frameWrap).pointerEvents
    };
  });
  expect(completedHandoff).not.toBeNull();
  expect(completedHandoff.hiddenClass).toBe(true);
  expect(completedHandoff.pointerEvents).toBe("auto");

  await handoffFrame.locator("[data-mobile-speaker-toggle]").click();
  await waitForInteractionSfx(page, { soundId: "toggle_soft", source: "mobileSpeakerToggle", ownerMode: "top" });
});

test("root skips the BloomToDeath video when the user clicks during playback", async ({ page }) => {
  await page.goto("/");
  await page.locator("#introStartButton").click();
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => ({
    paused: node.paused,
    muted: node.muted
  }))).toEqual({ paused: false, muted: false });

  const handoffFrame = page.frameLocator("#handoffFrame");
  await handoffFrame.locator("#social-hub-root[data-social-hub-ready='true']").waitFor({ timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-bloom-to-death-state", /playing_intro|handoff_pending/);

  await page.locator("#introVideo").click({ position: { x: 24, y: 24 } });

  await expect(page.locator("body")).toHaveAttribute("data-bloom-to-death-state", "handoff_complete");
  await expect(page.locator("body")).toHaveClass(/is-handoff-complete/);
  await expect(page).toHaveTitle("Josie");
});

test("root falls back to a hard josie navigation if the handoff iframe never becomes ready", async ({ page }) => {
  await page.route(/\/josie(?:\.html)?\?handoff=1$/, async (route) => {
    await route.abort();
  });

  await page.goto("/");
  await page.locator("#introStartButton").click();
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);
  await page.locator("#introVideo").evaluate((node) => {
    node.currentTime = Math.max(0, node.duration - 0.2);
    node.dispatchEvent(new Event("ended"));
  });
  await expect(page).toHaveURL(/\/josie$/);
  await expect(page).toHaveTitle(/Josie/);
  await expect(page.locator("#introVideo")).toHaveCount(0);
});

test("mobile root plays Wings centered in the viewport instead of skipping the intro", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await expect(page).toHaveTitle(/BloomToDeath/);
  await expect(page.locator("#introStartButton")).toBeVisible();
  await expect(page.locator("#introVideo")).toHaveClass(/is-ready/, { timeout: 15_000 });
  const mobileState = await page.evaluate(() => {
    const video = document.querySelector("#introVideo");
    return {
      skipMovie: document.body?.dataset?.bloomToDeathSkipMovie || "",
      repeatVisit: document.body?.dataset?.bloomToDeathRepeatVisit || "",
      state: document.body?.dataset?.bloomToDeathState || "",
      videoHidden: video instanceof HTMLVideoElement ? video.classList.contains("is-hidden") : false,
      videoSrcAttr: video instanceof HTMLVideoElement ? video.getAttribute("src") : null
    };
  });
  expect(mobileState.skipMovie).toBe("false");
  expect(mobileState.repeatVisit).toBe("false");
  expect(mobileState.state).toBe("idle");
  expect(mobileState.videoHidden).toBe(false);
  expect(mobileState.videoSrcAttr).toBe("Timelapse/Wings.mp4");

  await clearInteractionSfxLog(page);
  await page.locator("#introStartButton").click();
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => ({
    paused: node.paused,
    muted: node.muted
  }))).toEqual({ paused: false, muted: false });
  const mobileLayout = await page.locator("#introVideo").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      objectFit: window.getComputedStyle(node).objectFit
    };
  });
  expect(mobileLayout.bodyBackground).toBe("rgb(0, 0, 0)");
  expect(mobileLayout.objectFit).toBe("contain");
  expect(mobileLayout.width).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  expect(mobileLayout.height).toBeLessThanOrEqual(mobileLayout.viewportHeight + 1);
  expect(Math.abs(mobileLayout.left - (mobileLayout.viewportWidth - mobileLayout.width) / 2)).toBeLessThan(2);
  expect(Math.abs(mobileLayout.top - (mobileLayout.viewportHeight - mobileLayout.height) / 2)).toBeLessThan(2);
  const mobileIntroSfxLog = await readInteractionSfxLog(page);
  expect(mobileIntroSfxLog.filter((entry) => /introStartButton|introHandoffVisible/.test(String(entry?.source || "")))).toEqual([]);
});

test("desktop degraded performance mode keeps BloomToDeath handoff behavior without an intro ASCII overlay", async ({ page }) => {
  await setDesktopPerformanceOverride(page, "degraded");
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "degraded");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "override");
  await expect(page.locator("#asciiCanvas")).toHaveCount(0);

  await page.locator("#introStartButton").click();
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => Number.isFinite(node.duration) && node.duration > 0)).toBe(true);
  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => ({
    paused: node.paused,
    muted: node.muted
  }))).toEqual({ paused: false, muted: false });
  const degradedHandoffFrame = page.frameLocator("#handoffFrame");
  await degradedHandoffFrame.locator("#social-hub-root[data-social-hub-ready='true']").waitFor({ timeout: 30_000 });
  const degradedHandoffState = await page.locator("#introVideo").evaluate((node) => {
    const targetTime = Math.max(0, (Number.isFinite(node.duration) ? node.duration : 18) - 1.8);
    Object.defineProperty(node, "currentTime", {
      configurable: true,
      get() {
        return targetTime;
      },
      set() {
      }
    });
    Object.defineProperty(node, "ended", {
      configurable: true,
      get() {
        return false;
      }
    });
    node.dispatchEvent(new Event("seeking"));
    node.dispatchEvent(new Event("seeked"));
    node.dispatchEvent(new Event("timeupdate"));
    return {
      state: document.body?.dataset?.bloomToDeathState || "",
      handoffVisible: document.body.classList.contains("is-handoff-visible")
    };
  });
  expect(degradedHandoffState.state).toBe("handoff_visible");
  expect(degradedHandoffState.handoffVisible).toBe(true);
  const degradedIntroSfxLog = await readInteractionSfxLog(page);
  expect(degradedIntroSfxLog.filter((entry) => /introStartButton|introHandoffVisible/.test(String(entry?.source || "")))).toEqual([]);
});

test("next page redirects to josie", async ({ page }) => {
  await page.goto("/next.html");
  await expect(page).toHaveURL(/\/josie(?:\.html)?$/);
  await expect(page).toHaveTitle(/Josie/);
});

test("desktop degraded performance mode softens Josie rendering while keeping playback and interaction online", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await setDesktopPerformanceOverride(page, "degraded");
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "degraded");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "override");
  await expect(page.locator(".os-ambient-backdrop")).toHaveAttribute("data-ambient-motion", "frozen");
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-visualizer-mode", "degraded");

  await page.locator(".steam-sidebar-link").first().hover();
  await page.mouse.wheel(0, 180);
  const degradedCursorState = await page.evaluate(() => {
    const cursor = document.querySelector(".site-pointer");
    const trailCanvas = document.querySelector(".site-pointer-trail-canvas");
    if (!(cursor instanceof HTMLElement) || !(trailCanvas instanceof HTMLCanvasElement)) {
      return null;
    }
    return {
      morph: cursor.dataset.cursorMorph || "",
      degraded: cursor.classList.contains("is-degraded"),
      scroll: cursor.classList.contains("is-scroll"),
      trailDisplay: window.getComputedStyle(trailCanvas).display
    };
  });
  expect(degradedCursorState).not.toBeNull();
  expect(degradedCursorState.morph).toBe("orb");
  expect(degradedCursorState.degraded).toBe(true);
  expect(degradedCursorState.scroll).toBe(false);
  expect(degradedCursorState.trailDisplay).toBe("none");

  await clearInteractionSfxLog(page);
  await page.locator("[data-mobile-speaker-toggle]").click();
  await waitForInteractionSfx(page, { soundId: "toggle_soft", source: "mobileSpeakerToggle", ownerMode: "top", page: "josie" });
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  const degradedVisualizerState = await page.evaluate(() => {
    const layer = document.querySelector("#os-shuffle-visualizer-layer");
    const title = document.querySelector("[data-shuffle-title]");
    const artist = document.querySelector("[data-shuffle-artist]");
    return {
      layerMode: layer instanceof HTMLElement ? layer.getAttribute("data-visualizer-mode") : "",
      wavePortal: document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-bleed-layer") instanceof HTMLElement,
      waveCanvas: document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave") instanceof HTMLCanvasElement,
      title: title?.textContent?.trim() || "",
      artist: artist?.textContent?.trim() || ""
    };
  });
  expect(degradedVisualizerState.layerMode).toBe("degraded");
  expect(degradedVisualizerState.wavePortal).toBe(false);
  expect(degradedVisualizerState.waveCanvas).toBe(false);
  expect(degradedVisualizerState.title).toBe("fiesta (feat. bunii)");
  expect(degradedVisualizerState.artist).toBe("ayowitty");
});

test("desktop Josie can live-downgrade once on sustained bad frame windows", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "override");
  await page.evaluate(() => {
    const badWindow = Array.from({ length: 80 }, () => 45);
    window.__internetAngelPerformanceState?.__debugPushFrameDeltas?.([...badWindow, ...badWindow]);
  });
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "degraded");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "frame-budget");

  await page.evaluate(() => {
    const healthyWindow = Array.from({ length: 220 }, () => 16);
    window.__internetAngelPerformanceState?.__debugPushFrameDeltas?.(healthyWindow);
  });
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "degraded");
});

test("josie renders and dynamic endpoints respond", async ({ page, request }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  const avatarManifestResponse = await request.get("/assets/avatar-manifest.json");
  expect(avatarManifestResponse.status()).toBe(200);
  const avatarManifest = await avatarManifestResponse.json();
  expect(Array.isArray(avatarManifest.avatars)).toBe(true);
  expect(avatarManifest.avatars.length).toBeGreaterThan(0);

  const lastfmResponse = await request.get("/api/lastfm");
  expect(lastfmResponse.status()).toBe(200);
  const lastfmPayload = await lastfmResponse.json();
  expect(lastfmPayload).toHaveProperty("nowPlaying");
  expect(lastfmPayload).toHaveProperty("toptracks");
  expect(lastfmPayload).toHaveProperty("discovery");

  const discordResponse = await request.get("/api/discord");
  expect(discordResponse.status()).toBe(200);

  const steamResponse = await request.get("/api/steam-recent-activity");
  expect(steamResponse.status()).toBe(200);

  await page.addInitScript(() => {
    const originalSetInterval = window.setInterval.bind(window);
    window.__codexIntervalCalls = [];
    window.__clipboardWrites = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__clipboardWrites.push(String(text));
        }
      }
    });
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
  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true", {
    timeout: 30_000
  });
  await expect.poll(() => page.title(), { timeout: 2_000 }).toBe("Josie");
  await expect.poll(() => page.evaluate(() => Boolean(window.__internetAngelTitleTypewriterDone)), { timeout: 2_000 }).toBe(true);
  const stageScrollbarState = await page.locator(".os-stage").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      scrollbarWidth: styles.getPropertyValue("scrollbar-width").trim(),
      overflowY: styles.overflowY
    };
  });
  expect(stageScrollbarState.scrollbarWidth).toBe("none");
  expect(stageScrollbarState.overflowY).toBe("auto");

  await clearInteractionSfxLog(page);
  await page.locator(".steam-sidebar-link").first().hover();
  expect(await readInteractionSfxLog(page)).toEqual([]);

  await expect(page.locator("[data-mobile-speaker-toggle]")).toBeVisible();
  const desktopSpeakerRect = await page.locator("[data-mobile-speaker-toggle]").evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  });
  expect(desktopSpeakerRect.left).toBeLessThan(28);
  expect(desktopSpeakerRect.top).toBeLessThan(28);
  expect(desktopSpeakerRect.width).toBeGreaterThanOrEqual(40);
  expect(desktopSpeakerRect.height).toBeGreaterThanOrEqual(40);
  const audioControl = page.locator("[data-site-audio-control]");
  await expect(audioControl).toBeVisible();
  await expect(page.locator(".site-audio-volume-label")).toHaveCount(0);
  const initialAudioControlWidth = await audioControl.evaluate((node) => node.getBoundingClientRect().width);
  expect(initialAudioControlWidth).toBeLessThanOrEqual(46);
  await audioControl.hover();
  await expect.poll(async () => audioControl.evaluate((node) => node.getBoundingClientRect().width), { timeout: 2_000 }).toBeGreaterThan(150);
  await page.locator("[data-site-volume-slider]").evaluate((node) => {
    if (!(node instanceof HTMLInputElement)) return;
    node.value = "42";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("[data-mobile-speaker-toggle]")).toHaveAttribute("data-audio-volume", "0.42");
  await page.mouse.move(420, 420);
  await expect.poll(async () => audioControl.evaluate((node) => node.getBoundingClientRect().width), { timeout: 2_500 }).toBeLessThanOrEqual(48);
  await page.locator("[data-mobile-speaker-toggle]").click();
  await waitForInteractionSfx(page, { soundId: "toggle_soft", source: "mobileSpeakerToggle", ownerMode: "top", page: "josie" });
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement
      && button.dataset.audioHasTrack === "true"
      && button.dataset.audioPlaying === "true";
  });
  await expect(page.locator("#os-shuffle-visualizer-title")).toHaveText("fiesta (feat. bunii)");
  await expect(page.locator("#os-shuffle-visualizer-artist")).toHaveText("ayowitty");
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-panel]")).toHaveCount(0);
  await page.waitForFunction(() => {
    const copy = document.querySelector("#os-shuffle-visualizer-copy");
    if (!(copy instanceof HTMLElement)) return false;
    return copy.dataset.shuffleCopyState === "visible"
      && Number.parseFloat(window.getComputedStyle(copy).opacity || "0") > 0.85;
  });
  await page.waitForFunction(() => {
    const copy = document.querySelector("#os-shuffle-visualizer-copy");
    if (!(copy instanceof HTMLElement)) return false;
    return copy.dataset.shuffleCopyState === "hidden"
      && Number.parseFloat(window.getComputedStyle(copy).opacity || "1") < 0.2;
  }, null, { timeout: 7000 });
  const firstVisualizerTrackTitle = (await page.locator("#os-shuffle-visualizer-title").textContent())?.trim() || "";
  await page.evaluate(() => window.__internetAngelShuffleDebug?.advanceTrack?.());
  await page.waitForFunction((previousTitle) => {
    const title = document.querySelector("#os-shuffle-visualizer-title");
    const copy = document.querySelector("#os-shuffle-visualizer-copy");
    if (!(title instanceof HTMLElement) || !(copy instanceof HTMLElement)) return false;
    return title.textContent.trim() !== previousTitle
      && copy.dataset.shuffleCopyState === "visible"
      && Number.parseFloat(window.getComputedStyle(copy).opacity || "0") > 0.85;
  }, firstVisualizerTrackTitle);
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-panel]")).toHaveCount(0);
  const firstDesktopMuteState = await page.locator("[data-mobile-speaker-toggle]").getAttribute("data-audio-muted");
  await page.locator("[data-mobile-speaker-toggle]").click();
  await page.waitForFunction((expectedState) => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement
      && button.dataset.audioHasTrack === "true"
      && button.dataset.audioPlaying === "true"
      && button.dataset.audioMuted !== expectedState;
  }, firstDesktopMuteState);
  const secondDesktopMuteState = await page.locator("[data-mobile-speaker-toggle]").getAttribute("data-audio-muted");
  await page.locator("[data-mobile-speaker-toggle]").click();
  await page.waitForFunction((expectedState) => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement
      && button.dataset.audioHasTrack === "true"
      && button.dataset.audioPlaying === "true"
      && button.dataset.audioMuted !== expectedState;
  }, secondDesktopMuteState);
  await clearInteractionSfxLog(page);
  await page.locator(".steam-sidebar-link").first().hover();
  await waitForInteractionSfx(page, { soundId: "hover_soft", source: "sidebarLink", ownerMode: "top", page: "josie" });
  await clearInteractionSfxLog(page);
  await page.locator(".steam-sidebar-link").first().click({ force: true });
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await waitForInteractionSfx(page, { soundId: "open_soft", source: "externalConfirmOpen", ownerMode: "top", page: "josie" });
  await page.locator(".external-link-confirm-button--cancel").click();
  await waitForInteractionSfx(page, { soundId: "cancel_soft", source: "externalConfirmCancel", ownerMode: "top", page: "josie" });

  await expect(page.locator("body")).toHaveAttribute("data-theme-resolved", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-variant", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-renderer", "legacy");
  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true");
  await expect(page.locator(".steam-hero-name")).toHaveText("Josie");
  await expect(page.locator(".steam-hero-name")).toHaveCSS("animation-name", /heroNameDrift/);
  await expect(page.locator(".steam-hero-ornament")).toHaveCount(1);
  const heroAvatarSrc = await page.locator(".steam-hero-avatar").first().getAttribute("src");
  expect(heroAvatarSrc).toBeTruthy();
  expect(avatarManifest.avatars).toContain(new URL(heroAvatarSrc, "http://127.0.0.1:8788").pathname);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-heart")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-wing--left")).toHaveCount(1);
  await expect(page.locator(".steam-hero-ornament .steam-hero-bio-wing--right")).toHaveCount(1);
  await expect(page.locator(".steam-hero-description")).toContainText("The Internet Angel");
  await expect(page.locator("#site-theme-toggle-anchor")).toHaveCount(0);
  await expect(page.locator(".discord-presence-panel")).toHaveCount(1);
  await expect(page.locator("#os-ambient-backdrop canvas")).toHaveCount(2);
  await expect(page.locator(".steam-showcase--josie-intro")).toHaveCount(0);
  await expect(page.locator("#os-shuffle-visualizer-layer")).toBeVisible();
  await expect(page.locator("#os-shuffle-visualizer-player")).toHaveCount(1);
  await expect(page.locator(".steam-hero-avatar-decoration")).toHaveCount(1);
  const heroDecorationOverflow = await page.evaluate(() => {
    const profile = document.querySelector(".social-hub-profile");
    const shell = document.querySelector(".steam-hero-shell");
    const wrap = document.querySelector(".steam-hero-avatar-wrap");
    const decoration = document.querySelector(".steam-hero-avatar-decoration");
    if (!(profile instanceof HTMLElement && shell instanceof HTMLElement && wrap instanceof HTMLElement && decoration instanceof HTMLElement)) {
      return null;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const decorationRect = decoration.getBoundingClientRect();
    return {
      profileOverflow: window.getComputedStyle(profile).overflow,
      shellOverflow: window.getComputedStyle(shell).overflow,
      extendsPastWrapTop: decorationRect.top < wrapRect.top,
      extendsPastWrapLeft: decorationRect.left < wrapRect.left,
      extendsPastWrapRight: decorationRect.right > wrapRect.right
    };
  });
  expect(heroDecorationOverflow).not.toBeNull();
  expect(heroDecorationOverflow.profileOverflow).toBe("visible");
  expect(heroDecorationOverflow.shellOverflow).toBe("visible");
  expect(heroDecorationOverflow.extendsPastWrapTop).toBe(true);
  expect(heroDecorationOverflow.extendsPastWrapLeft).toBe(true);
  expect(heroDecorationOverflow.extendsPastWrapRight).toBe(true);
  await expect(page.locator(".lastfm-section-title").first()).toHaveText("Recent Tracks");
  await expect(page.locator(".lastfm-section-title", { hasText: "Top Albums" })).toBeVisible();
  await expect(page.locator(".lastfm-media-grid--artists .lastfm-media-image").first()).toBeVisible();
  const visualizerLayout = await page.evaluate(() => {
    const layer = document.querySelector("#os-shuffle-visualizer-layer");
    const backdrop = document.querySelector("#os-ambient-backdrop");
    const frame = document.querySelector("#social-hub-scale-frame");
    const surface = document.querySelector("#os-shuffle-visualizer-surface");
    const portal = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-bleed-layer");
    const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
    const copy = document.querySelector("#os-shuffle-visualizer-copy");
    const firstShowcaseTitle = document.querySelector(".social-hub-showcases article h3, .social-hub-showcases article h4");
    const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : null;
    const styleOf = (node) => node instanceof HTMLElement ? window.getComputedStyle(node) : null;
    const canvasEdgeAlpha = () => {
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return null;
      const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.round(canvas.height / 2)));
      const leftPixels = ctx.getImageData(0, sampleY, Math.min(8, canvas.width), 1).data;
      const rightWidth = Math.min(8, canvas.width);
      const rightPixels = ctx.getImageData(Math.max(0, canvas.width - rightWidth), sampleY, rightWidth, 1).data;
      const maxAlpha = (pixels) => {
        let alpha = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          alpha = Math.max(alpha, pixels[index]);
        }
        return alpha;
      };
      return {
        left: maxAlpha(leftPixels),
        right: maxAlpha(rightPixels)
      };
    };
    const initialSurfaceRect = rectOf(surface);
    const initialCanvasRect = rectOf(canvas);
    const scrollBaseline = window.scrollY;
    window.scrollTo(0, Math.min(window.scrollY + 640, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)));
    const scrolledSurfaceRect = rectOf(surface);
    const scrolledCanvasRect = rectOf(canvas);
    window.scrollTo(0, scrollBaseline);
    return {
      layerZ: styleOf(layer)?.zIndex || "",
      frameZ: styleOf(frame)?.zIndex || "",
      backdropZ: styleOf(backdrop)?.zIndex || "",
      pointerEvents: styleOf(layer)?.pointerEvents || "",
      portalOpacity: styleOf(portal)?.opacity || "",
      surfaceVisualStyle: surface instanceof HTMLElement ? surface.getAttribute("data-shuffle-visual-style") || "" : "",
      canvasVisualStyle: canvas instanceof HTMLCanvasElement ? canvas.getAttribute("data-shuffle-visual-style") || "" : "",
      canvasImageRendering: canvas instanceof HTMLCanvasElement ? window.getComputedStyle(canvas).imageRendering : "",
      surfaceRect: initialSurfaceRect,
      canvasRect: initialCanvasRect,
      copyRect: rectOf(copy),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      firstShowcaseTitle: firstShowcaseTitle instanceof HTMLElement ? firstShowcaseTitle.textContent.trim() : "",
      edgeAlpha: canvasEdgeAlpha(),
      scrolledSurfaceTop: scrolledSurfaceRect?.top ?? null,
      scrolledCanvasTop: scrolledCanvasRect?.top ?? null
    };
  });
  expect(visualizerLayout.pointerEvents).toBe("none");
  expect(visualizerLayout.portalOpacity).toBe("0.4");
  expect(visualizerLayout.surfaceVisualStyle).toBe("ascii");
  expect(visualizerLayout.canvasVisualStyle).toBe("ascii");
  expect(["pixelated", "crisp-edges"]).toContain(visualizerLayout.canvasImageRendering);
  expect(Number.parseInt(visualizerLayout.layerZ, 10)).toBeGreaterThan(Number.parseInt(visualizerLayout.backdropZ, 10));
  expect(Number.parseInt(visualizerLayout.frameZ, 10)).toBeGreaterThan(Number.parseInt(visualizerLayout.layerZ, 10));
  expect(Math.round(visualizerLayout.surfaceRect.width)).toBe(visualizerLayout.viewportWidth);
  expect(visualizerLayout.surfaceRect.height).toBeGreaterThanOrEqual(224);
  expect(Math.abs(visualizerLayout.surfaceRect.bottom - visualizerLayout.viewportHeight)).toBeLessThanOrEqual(1);
  expect(Math.round(visualizerLayout.canvasRect.width)).toBe(visualizerLayout.viewportWidth);
  expect(Math.abs(visualizerLayout.scrolledSurfaceTop - visualizerLayout.surfaceRect.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualizerLayout.scrolledCanvasTop - visualizerLayout.canvasRect.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(visualizerLayout.copyRect.left - visualizerLayout.surfaceRect.left)).toBeLessThanOrEqual(24);
  expect(Math.abs(visualizerLayout.copyRect.top - visualizerLayout.surfaceRect.top)).toBeLessThanOrEqual(24);
  expect(visualizerLayout.firstShowcaseTitle).toBe("Recent Activity");
  expect(visualizerLayout.edgeAlpha.left).toBeGreaterThan(0);
  expect(visualizerLayout.edgeAlpha.right).toBeGreaterThan(0);
  const topArtistImageUrls = await page.locator(".lastfm-media-grid--artists .lastfm-media-image").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || ""));
  expect(topArtistImageUrls.some((url) => url && !url.includes("2a96cbd8b46e442fc41c2b86b821562f"))).toBe(true);
  const smallCopyStyles = await page.locator(".steam-sidebar-row-title").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color
    };
  });
  expect(smallCopyStyles.color).toBe("rgb(240, 144, 194)");
  const firstProfileLinkWeight = await page.locator(".steam-sidebar-link").first().evaluate((node) => window.getComputedStyle(node).fontWeight);
  expect(Number.parseInt(firstProfileLinkWeight, 10)).toBeGreaterThanOrEqual(700);
  const lastFmVisualStyles = await page.evaluate(() => {
    const recentTitle = document.querySelector(".lastfm-recent-title");
    const artistTitle = document.querySelector(".lastfm-media-grid--artists .lastfm-media-title");
    const albumTitle = document.querySelector(".lastfm-media-grid--albums .lastfm-media-title");
    const lastFmSection = document.querySelector(".lastfm-section");
    const secondLastFmSection = document.querySelectorAll(".lastfm-section")[1];
    const lastFmShowcaseContent = document.querySelector(".steam-showcase-content--lastfm-minimal");
    const lastFmShowcaseShell = document.querySelector(".steam-showcase--lastfm-minimal");
    const recentList = document.querySelector(".lastfm-recent-list");
    const mediaImageWrap = document.querySelector(".lastfm-media-image-wrap");
    const steamActivityShell = document.querySelector(".steam-showcase--steam-activity");
    const steamHours = document.querySelector(".steam-activity-header-hours");
    const steamHoursOnRecord = document.querySelector(".steam-activity-hours");
    const steamLastPlayed = document.querySelector(".steam-activity-last-played");
    const nowPlayingBadgeProbe = document.createElement("span");
    nowPlayingBadgeProbe.className = "lastfm-now-playing-badge";
    nowPlayingBadgeProbe.textContent = "Now Playing";
    document.body.appendChild(nowPlayingBadgeProbe);
    const colorOf = (node) => node ? window.getComputedStyle(node).color : null;
    const backgroundOf = (node) => node ? window.getComputedStyle(node).backgroundColor : null;
    const pseudoDisplayOf = (node, pseudo) => node ? window.getComputedStyle(node, pseudo).display : null;
    const borderOf = (node) => node ? {
      topWidth: window.getComputedStyle(node).borderTopWidth,
      topColor: window.getComputedStyle(node).borderTopColor,
      bottomWidth: window.getComputedStyle(node).borderBottomWidth,
      bottomColor: window.getComputedStyle(node).borderBottomColor
    } : null;
    const nowPlayingBadgeStyles = window.getComputedStyle(nowPlayingBadgeProbe);
    const result = {
      recentTitleColor: colorOf(recentTitle),
      artistTitleColor: colorOf(artistTitle),
      albumTitleColor: colorOf(albumTitle),
      lastFmSectionBackground: backgroundOf(lastFmSection),
      lastFmShowcaseContentBackground: backgroundOf(lastFmShowcaseContent),
      lastFmShowcaseBeforeDisplay: pseudoDisplayOf(lastFmShowcaseShell, "::before"),
      lastFmShowcaseShellBorderTopWidth: lastFmShowcaseShell ? window.getComputedStyle(lastFmShowcaseShell).borderTopWidth : null,
      secondLastFmSectionBorder: borderOf(secondLastFmSection),
      recentListBorder: borderOf(recentList),
      mediaImageWrapBorder: borderOf(mediaImageWrap),
      nowPlayingBadgeBorderWidth: nowPlayingBadgeStyles.borderTopWidth,
      nowPlayingBadgeBackground: nowPlayingBadgeStyles.backgroundColor,
      steamActivityBackground: backgroundOf(steamActivityShell),
      steamActivityBeforeDisplay: pseudoDisplayOf(steamActivityShell, "::before"),
      steamHoursColor: colorOf(steamHours),
      steamHoursOnRecordColor: colorOf(steamHoursOnRecord),
      steamLastPlayedColor: colorOf(steamLastPlayed)
    };
    nowPlayingBadgeProbe.remove();
    return result;
  });
  expect(lastFmVisualStyles.recentTitleColor).toBe("rgb(210, 214, 223)");
  expect(lastFmVisualStyles.artistTitleColor).toBe("rgb(210, 214, 223)");
  expect(lastFmVisualStyles.albumTitleColor).toBe("rgb(210, 214, 223)");
  expect(lastFmVisualStyles.lastFmSectionBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.lastFmShowcaseContentBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.lastFmShowcaseBeforeDisplay).toBe("none");
  expect(lastFmVisualStyles.lastFmShowcaseShellBorderTopWidth).toBe("0px");
  expect(Number.parseFloat(lastFmVisualStyles.secondLastFmSectionBorder?.topWidth || "0")).toBeGreaterThan(1.5);
  expect(Number.parseFloat(lastFmVisualStyles.recentListBorder?.topWidth || "0")).toBeGreaterThan(1.5);
  expect(Number.parseFloat(lastFmVisualStyles.mediaImageWrapBorder?.bottomWidth || "0")).toBeGreaterThan(1.5);
  expect(lastFmVisualStyles.nowPlayingBadgeBorderWidth).toBe("0px");
  expect(lastFmVisualStyles.nowPlayingBadgeBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.steamActivityBackground).toBe("rgba(0, 0, 0, 0)");
  expect(lastFmVisualStyles.steamActivityBeforeDisplay).toBe("none");
  expect(lastFmVisualStyles.steamHoursColor).toBe("rgb(240, 144, 194)");
  expect(lastFmVisualStyles.steamHoursOnRecordColor).toBe("rgb(240, 144, 194)");
  expect(lastFmVisualStyles.steamLastPlayedColor).toBe("rgb(240, 144, 194)");
  await expect(page.locator(".lastfm-profile-total")).toHaveCount(0);
  const heroShellStyles = await page.locator(".steam-hero-shell").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow
    };
  });
  expect(heroShellStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(heroShellStyles.boxShadow).not.toContain("120vmax");
  await page.locator(".steam-sidebar-row--discord").click({ force: true });
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  await expect(page.locator(".steam-sidebar-row--discord [data-profile-copy-control]")).toHaveAttribute("data-profile-copy-state", "copied");
  await expect(page.locator(".steam-sidebar-row--discord [data-profile-copy-feedback]")).toContainText("Copied");
  await expect(page.locator("[data-profile-copy-toast]")).toHaveCount(0);
  const discordCopyPromptStyles = await page.evaluate(() => {
    const feedback = document.querySelector(".steam-sidebar-row--discord [data-profile-copy-feedback]");
    const label = document.querySelector(".steam-sidebar-row--discord .steam-sidebar-link");
    if (!(feedback instanceof HTMLElement) || !(label instanceof HTMLElement)) {
      return null;
    }
    const styles = window.getComputedStyle(feedback);
    const beforeStyles = window.getComputedStyle(feedback, "::before");
    const feedbackRect = feedback.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    return {
      borderTopWidth: styles.borderTopWidth,
      backgroundColor: styles.backgroundColor,
      opacity: styles.opacity,
      beforeContent: beforeStyles.content,
      feedbackLeft: feedbackRect.left,
      labelRight: labelRect.right
    };
  });
  expect(discordCopyPromptStyles).not.toBeNull();
  expect(discordCopyPromptStyles.borderTopWidth).toBe("0px");
  expect(discordCopyPromptStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(discordCopyPromptStyles.opacity)).toBeLessThan(0.91);
  expect(discordCopyPromptStyles.beforeContent).toContain("-");
  expect(discordCopyPromptStyles.feedbackLeft).toBeGreaterThanOrEqual(discordCopyPromptStyles.labelRight - 3);
  const discordCopyState = await page.evaluate(() => ({
    clipboardWrites: window.__clipboardWrites || [],
    discordHref: document.querySelector(".steam-sidebar-row--discord [data-profile-copy-control]")?.getAttribute("href") || "",
    discordCopyHandle: document.querySelector(".steam-sidebar-row--discord")?.getAttribute("data-profile-copy-handle") || ""
  }));
  expect(discordCopyState.clipboardWrites).toContain("foundlifeless");
  expect(discordCopyState.discordHref).toBe("");
  expect(discordCopyState.discordCopyHandle).toBe("foundlifeless");

  expect(apiRequests).toEqual(expect.arrayContaining([
    "/api/steam-recent-activity",
    "/api/discord",
    "/api/lastfm"
  ]));
  expect(apiRequests).not.toContain("/api/lastfm-now-playing");
  expect(apiRequests).not.toContain("/api/lastfm-track-details");

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

test("desktop profile links open the confirm prompt immediately with no full-screen flash", async ({ page }) => {
  await stubWindowOpen(page);
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.waitForSelector(".steam-sidebar-row--spotify .steam-sidebar-link");
  await clearInteractionSfxLog(page);
  await page.locator(".steam-sidebar-row--spotify .steam-sidebar-link").click({ force: true });
  await expect(page.locator("#social-link-effect-layer")).toHaveCount(0);
  const earlyCalls = await drainWindowOpenCalls(page);
  expect(earlyCalls.some((entry) => /open\.spotify/i.test(entry.url || ""))).toBe(false);
  await waitForInteractionSfx(page, { soundId: "open_soft", source: "externalConfirmOpen", ownerMode: "top", page: "josie" });
  await expect(page.locator(".external-link-confirm")).toHaveClass(/is-open/);
  await page.locator(".external-link-confirm-button--new-tab").click();
  await waitForInteractionSfx(page, { soundId: "confirm_soft", source: "externalConfirmNewTab", ownerMode: "top", page: "josie" });
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  await page.waitForFunction(() => Array.isArray(window.__windowOpenCalls) && window.__windowOpenCalls.some((entry) => /open\.spotify/i.test(entry.url || "")), null, { timeout: 2_000 });
  const finalCalls = await drainWindowOpenCalls(page);
  const delayedOpen = finalCalls.find((entry) => /open\.spotify/i.test(entry.url || ""));
  expect(delayedOpen).toBeDefined();
  expect(delayedOpen?.target).toBe("_blank");
});

test("josie stays in night mode and keeps the Discord presence under the hero tagline", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 13 });

  const requests = [];
  page.on("request", (request) => {
    requests.push(request.url());
  });

  await page.route("**/api/discord", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        data: {
          discord_user: {
            id: "331350000154050560",
            username: "foundlifeless",
            display_name: "foundlifeless",
            global_name: "FoundLifeless",
            avatar: "avatar-hash",
            premium_type: 2
          },
          activities: [
            {
              type: 4,
              name: "Custom Status",
              state: "ame_jam",
              emoji: {
                id: "123456789012345678",
                name: "ameheart",
                animated: false
              }
            }
          ],
          discord_status: "online",
          listening_to_spotify: true,
          spotify: {
            song: "up + down",
            artist: "idkwhyy",
            album: "example album",
            album_art_url: "https://i.scdn.co/image/example-up-down",
            track_id: "spotify-track-up-down"
          },
          active_on_discord_web: true,
          active_on_discord_desktop: true,
          active_on_discord_mobile: false,
          kv: {}
        },
        presence: {
          displayName: "foundlifeless",
          username: "foundlifeless",
          statusKey: "online",
          statusLabel: "Online",
          avatarUrl: "https://cdn.discordapp.com/avatars/331350000154050560/avatar-hash.png?size=256",
          avatarDecorationUrl: "",
          bannerUrl: "",
          hasNitro: true,
          nitroBadgeIconUrl: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
          customStatusText: "",
          primaryActivity: {
            type: "listening",
            label: "Listening to",
            name: "up + down",
            subtitle: "by idkwhyy"
          },
          spotify: {
            isListening: true,
            song: "up + down",
            artist: "idkwhyy",
            album: "example album",
            albumArtUrl: "https://i.scdn.co/image/example-up-down",
            trackUrl: "https://open.spotify.com/track/spotify-track-up-down"
          }
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator("body")).not.toHaveAttribute("data-theme-mode", /.*/);
  await expect(page.locator("body")).toHaveAttribute("data-theme-resolved", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-variant", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-renderer", "legacy");
  await expect(page.locator(".discord-presence-card--foundlifeless")).toHaveCount(1);
  await expect(page.locator(".discord-presence-name")).toContainText("foundlifeless");
  await expect(page.locator(".discord-presence-headline")).toContainText("Listening to up + down");
  await expect(page.locator(".discord-presence-meta")).toHaveCount(0);
  await expect(page.locator(".discord-presence-nitro-badge")).toHaveCount(1);
  await expect(page.locator(".discord-presence-album-art")).toHaveAttribute("src", /example-up-down/);
  await expect(page.locator(".discord-presence-custom-emoji")).toHaveAttribute("src", /cdn\.discordapp\.com\/emojis\/123456789012345678\.png/);
  await expect(page.locator(".discord-presence-status-dot")).toHaveCount(0);
  await expect(page.locator("#site-theme-toggle-anchor")).toHaveCount(0);

  const layoutPositions = await page.evaluate(() => {
    const heroDescription = document.querySelector(".steam-hero-description");
    const discordPanel = document.querySelector(".discord-presence-panel");
    const topOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect().top : null;
    return {
      heroDescriptionTop: topOf(heroDescription),
      discordPanelTop: topOf(discordPanel),
      profileLinksTop: topOf(document.querySelector("#social-hub-sidebar .steam-sidebar-panel"))
    };
  });
  expect(layoutPositions.heroDescriptionTop).not.toBeNull();
  expect(layoutPositions.discordPanelTop).not.toBeNull();
  expect(layoutPositions.profileLinksTop).not.toBeNull();
  expect(layoutPositions.heroDescriptionTop).toBeLessThan(layoutPositions.discordPanelTop);
  expect(layoutPositions.discordPanelTop).toBeLessThan(layoutPositions.profileLinksTop);

  const discordCardStyles = await page.evaluate(() => {
    const card = document.querySelector(".discord-presence-card--foundlifeless");
    const avatar = document.querySelector(".discord-presence-avatar-wrap");
    const decoration = document.querySelector(".discord-presence-avatar-decoration");
    const albumArt = document.querySelector(".discord-presence-album-art-wrap");
    const badge = document.querySelector(".discord-presence-status-badge");
    const name = document.querySelector(".discord-presence-name");
    const sizeOf = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const style = window.getComputedStyle(node);
      return {
        width: style.width,
        height: style.height
      };
    };
    return {
      cardRadius: card instanceof HTMLElement ? window.getComputedStyle(card).borderRadius : "",
      cardBackground: card instanceof HTMLElement ? window.getComputedStyle(card).backgroundColor : "",
      cardBorderWidth: card instanceof HTMLElement ? window.getComputedStyle(card).borderTopWidth : "",
      cardBorderColor: card instanceof HTMLElement ? window.getComputedStyle(card).borderTopColor : "",
      cardOverflow: card instanceof HTMLElement ? window.getComputedStyle(card).overflow : "",
      hasDecoration: decoration instanceof HTMLElement,
      avatarRect: sizeOf(avatar),
      decorationRect: sizeOf(decoration),
      albumArtRect: sizeOf(albumArt),
      badgeRect: sizeOf(badge),
      badgeBackground: badge instanceof HTMLElement ? window.getComputedStyle(badge).backgroundColor : "",
      badgeBorderWidth: badge instanceof HTMLElement ? window.getComputedStyle(badge).borderTopWidth : "",
      badgeBoxShadow: badge instanceof HTMLElement ? window.getComputedStyle(badge).boxShadow : "",
      badgeInnerColor: badge instanceof HTMLElement ? window.getComputedStyle(badge, "::before").backgroundColor : "",
      nameFontFamily: name instanceof HTMLElement ? window.getComputedStyle(name).fontFamily : "",
      headlineFontFamily: document.querySelector(".discord-presence-headline") instanceof HTMLElement ? window.getComputedStyle(document.querySelector(".discord-presence-headline")).fontFamily : "",
      metaFontFamily: document.querySelector(".discord-presence-meta") instanceof HTMLElement ? window.getComputedStyle(document.querySelector(".discord-presence-meta")).fontFamily : "",
      nameColor: name instanceof HTMLElement ? window.getComputedStyle(name).color : ""
    };
  });
  expect(discordCardStyles.cardRadius).toBe("25px");
  expect(discordCardStyles.cardBackground).toBe("rgba(190, 190, 190, 0.1)");
  expect(Number.parseFloat(discordCardStyles.cardBorderWidth)).toBeGreaterThan(1.5);
  expect(Number.parseFloat(discordCardStyles.cardBorderWidth)).toBeLessThanOrEqual(2.1);
  expect(discordCardStyles.cardBorderColor).toBe("rgba(190, 190, 190, 0.06)");
  expect(discordCardStyles.cardOverflow).toBe("visible");
  expect(Number.parseFloat(discordCardStyles.avatarRect?.width || "0")).toBeGreaterThan(69);
  expect(Number.parseFloat(discordCardStyles.avatarRect?.height || "0")).toBeGreaterThan(69);
  if (discordCardStyles.hasDecoration) {
    expect(Number.parseFloat(discordCardStyles.decorationRect?.width || "0")).toBeGreaterThan(Number.parseFloat(discordCardStyles.avatarRect?.width || "0"));
    expect(Number.parseFloat(discordCardStyles.decorationRect?.height || "0")).toBeGreaterThan(Number.parseFloat(discordCardStyles.avatarRect?.height || "0"));
  }
  expect(Number.parseFloat(discordCardStyles.albumArtRect?.width || "0")).toBeGreaterThan(69);
  expect(Number.parseFloat(discordCardStyles.albumArtRect?.height || "0")).toBeGreaterThan(69);
  expect(Number.parseFloat(discordCardStyles.badgeRect?.width || "0")).toBeGreaterThan(16);
  expect(Number.parseFloat(discordCardStyles.badgeRect?.height || "0")).toBeGreaterThan(16);
  expect(discordCardStyles.badgeBackground).toBe("rgba(0, 0, 0, 0)");
  expect(Number.parseFloat(discordCardStyles.badgeBorderWidth)).toBe(0);
  expect(discordCardStyles.badgeBoxShadow).toBe("none");
  expect(discordCardStyles.badgeInnerColor).toBe("rgb(66, 179, 107)");
  expect(discordCardStyles.nameFontFamily.toLowerCase()).toContain("pixelmplus12");
  expect(discordCardStyles.headlineFontFamily.toLowerCase()).toContain("gg sans");
  expect(discordCardStyles.metaFontFamily).toBe("");
  expect(discordCardStyles.nameColor).toBe("rgb(190, 186, 189)");

  const nightThemeColors = await page.evaluate(() => {
    const heroName = document.querySelector(".steam-hero-name");
    const activityTitle = document.querySelector(".steam-activity-header-title");
    const accentTitle = document.querySelector(".steam-sidebar-row-title");
    const ambientBackdrop = document.querySelector("#os-ambient-backdrop");
    const colorOf = (node) => node ? window.getComputedStyle(node).color : null;
    return {
      heroName: colorOf(heroName),
      activityTitle: colorOf(activityTitle),
      accentTitle: colorOf(accentTitle),
      pageBg: window.getComputedStyle(document.body).getPropertyValue("--page-bg").trim(),
      ambientRenderer: ambientBackdrop?.getAttribute("data-ambient-renderer") || "",
      ambientMotion: ambientBackdrop?.getAttribute("data-ambient-motion") || ""
    };
  });
  expect(nightThemeColors.heroName).toBe("rgb(210, 214, 223)");
  expect(nightThemeColors.activityTitle).toBe("rgb(240, 246, 255)");
  expect(nightThemeColors.accentTitle).toBe("rgb(240, 144, 194)");
  expect(nightThemeColors.pageBg).toBe("#000000");
  expect(nightThemeColors.ambientRenderer).toBe("legacy");
  expect(["running", "frozen"]).toContain(nightThemeColors.ambientMotion);

  expect(requests.some((url) => url.includes("/api/discord"))).toBe(true);
  expect(requests.some((url) => url.includes("api.lanyard.rest"))).toBe(false);
});

test("josie discord presence collapses the spotify art slot when spotify is inactive", async ({ page }) => {
  await page.route("**/api/discord", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        data: {
          discord_user: {
            id: "331350000154050560",
            username: "foundlifeless",
            display_name: "foundlifeless",
            global_name: "FoundLifeless",
            avatar: "avatar-hash",
            premium_type: 2
          },
          activities: [
            {
              type: 0,
              name: "Balatro",
              details: "Balatro",
              state: "Deep in endless mode"
            }
          ],
          discord_status: "online",
          listening_to_spotify: false,
          spotify: {},
          active_on_discord_web: true,
          active_on_discord_desktop: true,
          active_on_discord_mobile: false,
          kv: {}
        },
        presence: {
          displayName: "foundlifeless",
          username: "foundlifeless",
          statusKey: "online",
          statusLabel: "Online",
          avatarUrl: "https://cdn.discordapp.com/avatars/331350000154050560/avatar-hash.png?size=256",
          avatarDecorationUrl: "",
          bannerUrl: "",
          hasNitro: true,
          nitroBadgeIconUrl: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
          customStatusText: "",
          primaryActivity: {
            type: "0",
            label: "Playing",
            name: "Balatro",
            subtitle: "Deep in endless mode"
          },
          spotify: {
            isListening: false,
            song: "",
            artist: "",
            album: "",
            albumArtUrl: "",
            trackUrl: ""
          }
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator(".discord-presence-card--foundlifeless")).toBeVisible();
  await expect(page.locator(".discord-presence-album-art-wrap")).toHaveCount(0);
  await expect(page.locator(".discord-presence-headline")).toContainText("Playing Balatro");
  await expect(page.locator(".discord-presence-meta")).toHaveCount(0);
  await expect(page.locator(".discord-presence-custom-emoji")).toHaveCount(0);
});

test("josie suppresses duplicate emoji-name custom status text in the Discord card", async ({ page }) => {
  await page.route("**/api/discord", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        data: {
          discord_user: {
            id: "331350000154050560",
            username: "foundlifeless",
            display_name: "foundlifeless",
            global_name: "FoundLifeless",
            avatar: "avatar-hash",
            premium_type: 2
          },
          activities: [
            {
              type: 4,
              name: "Custom Status",
              state: "Ame_jam",
              emoji: {
                id: "123456789012345678",
                name: "ame_jam",
                animated: false
              }
            }
          ],
          discord_status: "online",
          listening_to_spotify: false,
          spotify: {},
          active_on_discord_web: true,
          active_on_discord_desktop: true,
          active_on_discord_mobile: false,
          kv: {}
        },
        presence: {
          displayName: "foundlifeless",
          username: "foundlifeless",
          statusKey: "online",
          statusLabel: "Online",
          avatarUrl: "https://cdn.discordapp.com/avatars/331350000154050560/avatar-hash.png?size=256",
          avatarDecorationUrl: "",
          bannerUrl: "",
          hasNitro: true,
          nitroBadgeIconUrl: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
          customStatusText: ":ame_jam:",
          primaryActivity: null,
          spotify: {
            isListening: false,
            song: "",
            artist: "",
            album: "",
            albumArtUrl: "",
            trackUrl: ""
          }
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator(".discord-presence-custom-emoji")).toHaveAttribute("src", /cdn\.discordapp\.com\/emojis\/123456789012345678\.png/);
  await expect(page.locator(".discord-presence-headline")).toHaveText("Online");
  await expect(page.locator(".discord-presence-headline")).not.toContainText("ame_jam");
  await expect(page.locator(".discord-presence-headline")).not.toContainText("Ame_jam");
});

test("josie keeps real custom status text when it differs from the emoji name", async ({ page }) => {
  await page.route("**/api/discord", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        data: {
          discord_user: {
            id: "331350000154050560",
            username: "foundlifeless",
            display_name: "foundlifeless",
            global_name: "FoundLifeless",
            avatar: "avatar-hash",
            premium_type: 2
          },
          activities: [
            {
              type: 4,
              name: "Custom Status",
              state: "holding on",
              emoji: {
                id: "123456789012345678",
                name: "ame_jam",
                animated: false
              }
            }
          ],
          discord_status: "online",
          listening_to_spotify: false,
          spotify: {},
          active_on_discord_web: true,
          active_on_discord_desktop: true,
          active_on_discord_mobile: false,
          kv: {}
        },
        presence: {
          displayName: "foundlifeless",
          username: "foundlifeless",
          statusKey: "online",
          statusLabel: "Online",
          avatarUrl: "https://cdn.discordapp.com/avatars/331350000154050560/avatar-hash.png?size=256",
          avatarDecorationUrl: "",
          bannerUrl: "",
          hasNitro: true,
          nitroBadgeIconUrl: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
          customStatusText: "holding on",
          primaryActivity: null,
          spotify: {
            isListening: false,
            song: "",
            artist: "",
            album: "",
            albumArtUrl: "",
            trackUrl: ""
          }
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator(".discord-presence-custom-emoji")).toHaveAttribute("src", /cdn\.discordapp\.com\/emojis\/123456789012345678\.png/);
  await expect(page.locator(".discord-presence-headline")).toContainText("holding on");
  await expect(page.locator(".discord-presence-headline")).not.toContainText("ame_jam");
});

test("josie strips a leading emoji token from custom status text and keeps the real message", async ({ page }) => {
  await page.route("**/api/discord", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        data: {
          discord_user: {
            id: "331350000154050560",
            username: "foundlifeless",
            display_name: "foundlifeless",
            global_name: "FoundLifeless",
            avatar: "avatar-hash",
            premium_type: 2
          },
          activities: [
            {
              type: 4,
              name: "Custom Status",
              state: "Ame_Jam bunii fans are eating GOOD",
              emoji: {
                id: "123456789012345678",
                name: "ame_jam",
                animated: false
              }
            }
          ],
          discord_status: "online",
          listening_to_spotify: false,
          spotify: {},
          active_on_discord_web: true,
          active_on_discord_desktop: true,
          active_on_discord_mobile: false,
          kv: {}
        },
        presence: {
          displayName: "foundlifeless",
          username: "foundlifeless",
          statusKey: "online",
          statusLabel: "Online",
          avatarUrl: "https://cdn.discordapp.com/avatars/331350000154050560/avatar-hash.png?size=256",
          avatarDecorationUrl: "",
          bannerUrl: "",
          hasNitro: true,
          nitroBadgeIconUrl: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png",
          customStatusText: "Ame_Jam bunii fans are eating GOOD",
          primaryActivity: null,
          spotify: {
            isListening: false,
            song: "",
            artist: "",
            album: "",
            albumArtUrl: "",
            trackUrl: ""
          }
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator(".discord-presence-custom-emoji")).toHaveAttribute("src", /cdn\.discordapp\.com\/emojis\/123456789012345678\.png/);
  await expect(page.locator(".discord-presence-headline")).toHaveText("bunii fans are eating GOOD");
  await expect(page.locator(".discord-presence-headline")).not.toContainText("Ame_Jam");
  await expect(page.locator(".discord-presence-headline")).not.toContainText("ame_jam");
});

test("josie night ambient reports frozen motion for reduced motion users", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 13 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-theme-resolved", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-variant", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-renderer", "legacy");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-motion", "frozen");
  await expect(page.locator(".steam-hero-name")).toHaveCSS("animation-name", "none");
});

test("josie night ambient renders on mobile without overflow", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 13 });
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-theme-resolved", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-variant", "night");
  await expect(page.locator("#os-ambient-backdrop")).toHaveAttribute("data-ambient-renderer", "legacy");
  await expect(page.locator("#os-ambient-overlay")).toHaveCount(0);

  const overflowState = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth
  }));
  expect(overflowState.scrollWidth).toBeLessThanOrEqual(overflowState.viewportWidth + 1);
});

test("josie animates track and steam rows on hover and applies ambient artwork to track panels", async ({ page }) => {
  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [{ "#text": "https://example.com/one-time-grid.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) },
              userloved: "1"
            }
          ]
        },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "128",
              image: [{ "#text": "https://example.com/artist-1.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee"
            },
            {
              name: "Slow Pulp",
              playcount: "96",
              image: [{ "#text": "https://example.com/artist-2.jpg", size: "large" }],
              url: "https://www.last.fm/music/Slow+Pulp"
            },
            {
              name: "Wisp",
              playcount: "74",
              image: [{ "#text": "https://example.com/artist-3.jpg", size: "large" }],
              url: "https://www.last.fm/music/Wisp"
            }
          ]
        },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/steam-recent-activity", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        profile: { name: "Josie", statusText: "Online" },
        stats: [{ label: "2w hours", value: "6.2" }],
        items: [
          {
            id: "steam-1",
            title: "Neon White",
            artworkUrl: "https://example.com/neon-white.jpg",
            hoursOnRecord: "48.6",
            lastPlayed: "2 days ago",
            url: "https://store.steampowered.com/app/1533420/Neon_White/"
          }
        ]
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", track: "One Time", album: "This Is How Tomorrow Moves" },
        track: {
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          durationMs: 184000,
          durationLabel: "3:04",
          artworkUrl: "https://example.com/one-time-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: 3,
          userLoved: true,
          globalPlaycount: 2740015,
          listeners: 285055,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "matched",
          embedUrl: "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator",
          openUrl: "https://open.spotify.com/track/spotify-track-1",
          searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
          previewUrl: "",
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          artworkUrl: "https://i.scdn.co/image/one-time.jpg"
        },
        scrobbles: { total: 3, items: [] },
        artistTopTracks: { artist: "beabadoobee", items: [] }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  const recentRow = page.locator(".lastfm-recent-button").first();
  const steamRow = page.locator(".steam-activity-row-button").first();

  await recentRow.hover();
  await emitCustomCursorHover(page, ".lastfm-recent-button");
  await expect.poll(async () => page.locator(".lastfm-recent-art").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);
  await expect.poll(async () => page.locator(".lastfm-recent-image").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);
  const cursorStateAfterRecentHover = await page.evaluate(() => {
    const recentButton = document.querySelector(".lastfm-recent-button");
    const cursor = document.querySelector(".site-pointer");
    return {
      targetCursor: recentButton instanceof HTMLElement ? window.getComputedStyle(recentButton).cursor : "",
      hasSystemPointer: document.body.classList.contains("has-system-pointer"),
      hasCustomCursor: cursor instanceof HTMLElement,
      cursorMorph: cursor instanceof HTMLElement ? cursor.dataset.cursorMorph || "" : "",
      cursorUsesSystemPointer: cursor instanceof HTMLElement ? cursor.classList.contains("is-system-pointer") : false
    };
  });

  await steamRow.hover();
  await emitCustomCursorHover(page, ".steam-activity-row-button");
  await expect.poll(async () => page.locator(".steam-activity-capsule").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);
  await expect.poll(async () => page.locator(".steam-activity-capsule-image").first().evaluate((node) => window.getComputedStyle(node).transform)).toMatch(/^matrix/);
  const cursorStateAfterSteamHover = await page.evaluate(() => {
    const steamButton = document.querySelector(".steam-activity-row-button");
    const cursor = document.querySelector(".site-pointer");
    const crossSvg = document.querySelector(".site-pointer-cross svg");
    const crossShape = document.querySelector(".site-pointer-cross-shape");
    const core = document.querySelector(".site-pointer-core");
    const ring = document.querySelector(".site-pointer-ring");
    const pool = document.querySelector(".site-pointer-pool");
    return {
      targetCursor: steamButton instanceof HTMLElement ? window.getComputedStyle(steamButton).cursor : "",
      hasSystemPointer: document.body.classList.contains("has-system-pointer"),
      hasCustomCursor: cursor instanceof HTMLElement,
      cursorMorph: cursor instanceof HTMLElement ? cursor.dataset.cursorMorph || "" : "",
      cursorContrast: cursor instanceof HTMLElement ? cursor.dataset.cursorContrast || "" : "",
      cursorUsesSystemPointer: cursor instanceof HTMLElement ? cursor.classList.contains("is-system-pointer") : false,
      crossSvgHeight: crossSvg instanceof SVGElement ? Number.parseFloat(window.getComputedStyle(crossSvg).height) : 0,
      crossSvgWidth: crossSvg instanceof SVGElement ? Number.parseFloat(window.getComputedStyle(crossSvg).width) : 0,
      crossStrokeWidth: crossShape instanceof SVGElement ? Number.parseFloat(window.getComputedStyle(crossShape).strokeWidth) : 0,
      coreOpacity: core instanceof HTMLElement ? Number.parseFloat(window.getComputedStyle(core).opacity) : 0,
      ringOpacity: ring instanceof HTMLElement ? Number.parseFloat(window.getComputedStyle(ring).opacity) : 0,
      poolOpacity: pool instanceof HTMLElement ? Number.parseFloat(window.getComputedStyle(pool).opacity) : 0
    };
  });
  expect(cursorStateAfterRecentHover.targetCursor).toBe("none");
  expect(cursorStateAfterRecentHover.hasSystemPointer).toBe(false);
  expect(cursorStateAfterRecentHover.hasCustomCursor).toBe(true);
  expect(cursorStateAfterRecentHover.cursorMorph).toBe("orb");
  expect(cursorStateAfterRecentHover.cursorUsesSystemPointer).toBe(false);
  expect(cursorStateAfterSteamHover.targetCursor).toBe("none");
  expect(cursorStateAfterSteamHover.hasSystemPointer).toBe(false);
  expect(cursorStateAfterSteamHover.hasCustomCursor).toBe(true);
  expect(cursorStateAfterSteamHover.cursorMorph).toBe("orb");
  expect(["", "light"]).toContain(cursorStateAfterSteamHover.cursorContrast);
  expect(cursorStateAfterSteamHover.cursorUsesSystemPointer).toBe(false);
  expect(cursorStateAfterSteamHover.crossSvgHeight).toBeGreaterThan(0);
  expect(cursorStateAfterSteamHover.crossSvgWidth).toBeGreaterThan(0);
  expect(cursorStateAfterSteamHover.crossStrokeWidth).toBeGreaterThan(0);
  expect(cursorStateAfterSteamHover.coreOpacity).toBeGreaterThan(0.2);
  expect(cursorStateAfterSteamHover.ringOpacity).toBeLessThanOrEqual(0.02);
  expect(cursorStateAfterSteamHover.poolOpacity).toBeGreaterThan(0.05);

  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.id = "codex-cursor-contrast-fixture";
    fixture.innerHTML = `
      <button type="button" class="codex-cursor-contrast-target codex-cursor-contrast-target--dark" style="position:fixed;left:24px;top:180px;width:84px;height:84px;background:#000;color:#fff;border:1px solid #fff;z-index:50;">Dark</button>
      <button type="button" class="codex-cursor-contrast-target codex-cursor-contrast-target--light" style="position:fixed;left:124px;top:180px;width:84px;height:84px;background:#fff;color:#000;border:1px solid #000;z-index:50;">Light</button>
    `;
    document.body.appendChild(fixture);
  });
  await page.locator(".codex-cursor-contrast-target--dark").hover();
  await emitCustomCursorHover(page, ".codex-cursor-contrast-target--dark");
  const darkContrastState = await page.evaluate(() => {
    const cursor = document.querySelector(".site-pointer");
    const crossShape = document.querySelector(".site-pointer-cross-shape");
    return {
      mode: cursor instanceof HTMLElement ? cursor.dataset.cursorContrast || "" : "",
      stroke: crossShape instanceof SVGElement ? window.getComputedStyle(crossShape).stroke : ""
    };
  });
  expect(darkContrastState.mode).toBe("light");
  expect(darkContrastState.stroke).toBe("rgb(255, 255, 255)");
  await page.locator(".codex-cursor-contrast-target--light").hover();
  await emitCustomCursorHover(page, ".codex-cursor-contrast-target--light");
  const lightContrastState = await page.evaluate(() => {
    const cursor = document.querySelector(".site-pointer");
    const crossShape = document.querySelector(".site-pointer-cross-shape");
    return {
      mode: cursor instanceof HTMLElement ? cursor.dataset.cursorContrast || "" : "",
      stroke: crossShape instanceof SVGElement ? window.getComputedStyle(crossShape).stroke : ""
    };
  });
  expect(lightContrastState.mode).toBe("light");
  expect(lightContrastState.stroke).toBe("rgb(255, 255, 255)");

  const selectionStarted = page.waitForFunction(() => {
    const cursor = document.querySelector(".site-pointer");
    return cursor instanceof HTMLElement && cursor.classList.contains("is-selecting");
  });
  await recentRow.click();
  await selectionStarted;
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await page.waitForFunction(() => {
    const cursor = document.querySelector(".site-pointer");
    return !(cursor instanceof HTMLElement) || !cursor.classList.contains("is-selecting");
  });
  await expect(page.locator(".lastfm-track-panel-art--flip")).toHaveCount(1);
  const artShell = await showLastFmPanelArtActions(page);
  await expect(artShell.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" })).toBeVisible();
  await clearInteractionSfxLog(page);
  const hoverAudioState = await page.evaluate(() => {
    const ctas = Array.from(document.querySelectorAll(".lastfm-track-panel-cta"));
    const ordered = ctas.filter((node) => node instanceof HTMLElement).sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top);
    const [upper, middle, lower] = ordered;
    if (!(upper instanceof HTMLElement) || !(middle instanceof HTMLElement) || !(lower instanceof HTMLElement)) {
      return { centers: [], hoverCount: 0, hoverLog: [] };
    }
    function emitHover(target, relatedTarget = null) {
      const rect = target.getBoundingClientRect();
      const event = new PointerEvent("pointerover", {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        pointerType: "mouse",
        relatedTarget
      });
      target.dispatchEvent(event);
    }
    emitHover(upper, null);
    emitHover(lower, upper);
    emitHover(middle, lower);
    emitHover(lower, middle);
    const hoverLog = (Array.isArray(window.__internetAngelInteractionSfxLog) ? window.__internetAngelInteractionSfxLog : []).filter((entry) => entry?.soundId === "hover_soft" && entry?.source === "lastfmTrackPanelCta");
    return {
      centers: [upper.getBoundingClientRect().top, middle.getBoundingClientRect().top, lower.getBoundingClientRect().top],
      hoverCount: hoverLog.length,
      hoverLog
    };
  });
  expect(hoverAudioState.centers[1]).toBeGreaterThan(hoverAudioState.centers[0]);
  expect(hoverAudioState.centers[2]).toBeGreaterThan(hoverAudioState.centers[1]);
  expect(hoverAudioState.hoverCount).toBe(3);
  expect(hoverAudioState.hoverLog[1]?.pointerDirection).toBe("down");
  expect(hoverAudioState.hoverLog[1]?.pitchShift).toBeLessThan(0);
  expect(Math.abs(hoverAudioState.hoverLog[1]?.pitchShift || 0)).toBeGreaterThan(0.035);
  expect(hoverAudioState.hoverLog[2]?.pointerDirection).toBe("up");
  expect(hoverAudioState.hoverLog[2]?.pitchShift).toBeGreaterThan(0);
  expect(Math.abs(hoverAudioState.hoverLog[2]?.pitchShift || 0)).toBeGreaterThan(0.035);
  expect(hoverAudioState.hoverLog[1]?.pitchShift).not.toBe(hoverAudioState.hoverLog[2]?.pitchShift);
  const ambientPanel = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity
    };
  });
  expect(ambientPanel).not.toBeNull();
  expect(ambientPanel.hasAmbient).toBe("true");
  expect(ambientPanel.backgroundImage).toContain("one-time-detail.jpg");
  expect(Number.parseFloat(ambientPanel.opacity)).toBeGreaterThan(0.2);
});

test("josie mobile uses the speaker toggle, icon row links, and cinna over the Discord card", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = String(query || "");
      if (media === "(pointer: coarse)" || media === "(hover: none)") {
        return {
          matches: true,
          media,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          }
        };
      }
      return originalMatchMedia(query);
    };
  });
  await page.addInitScript(() => {
    const launchLog = [];
    window.__codexExternalLaunchLog = launchLog;
    window.__clipboardWrites = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__clipboardWrites.push(String(text));
        }
      }
    });
    window.open = (url = "", target = "", features = "") => {
      const popup = {
        closed: false,
        opener: null,
        lastUrl: String(url || ""),
        close() {
          this.closed = true;
          launchLog.push({ type: "close", target: String(target || ""), timestamp: performance.now() });
        },
        location: {
          replace(nextUrl) {
            popup.lastUrl = String(nextUrl || "");
            launchLog.push({ type: "replace", url: popup.lastUrl, target: String(target || ""), timestamp: performance.now() });
          },
          set href(nextUrl) {
            popup.lastUrl = String(nextUrl || "");
            launchLog.push({ type: "href", url: popup.lastUrl, target: String(target || ""), timestamp: performance.now() });
          },
          get href() {
            return popup.lastUrl;
          }
        }
      };
      launchLog.push({
        type: "open",
        url: String(url || ""),
        target: String(target || ""),
        features: String(features || ""),
        timestamp: performance.now()
      });
      return popup;
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
  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true", {
    timeout: 30_000
  });

  await expect(page.locator("[data-mobile-speaker-toggle]")).toBeVisible();
  await expect(page.locator(".josie-mobile-audio-player")).toHaveCount(0);
  await expect(page.locator(".josie-mobile-audio-chip")).toHaveCount(0);
  await expect(page.locator(".steam-sidebar-title")).toBeHidden();
  await page.waitForSelector(".discord-presence-reveal", { state: "attached" });
  await expect(page.locator(".discord-presence-reveal")).toHaveAttribute("data-mobile-discord-reveal", /pending|visible/);
  await page.waitForSelector(".steam-sidebar-list--mobile-icons", { state: "attached" });
  await expect(page.locator(".steam-sidebar-list--mobile-icons")).toHaveAttribute("data-mobile-links-reveal", /pending|visible/);
  await page.waitForFunction(() => {
    const card = document.querySelector(".discord-presence-reveal");
    return card instanceof HTMLElement && card.dataset.mobileDiscordReveal === "visible";
  });
  await expect(page.locator(".discord-presence-card--foundlifeless")).toBeVisible();
  await page.waitForFunction(() => {
    const row = document.querySelector(".steam-sidebar-list--mobile-icons");
    return row instanceof HTMLElement && row.dataset.mobileLinksReveal === "visible";
  });
  await expect(page.locator(".steam-sidebar-list--mobile-icons")).toBeVisible();
  await expect(page.locator(".steam-sidebar-link--icon-only")).toHaveCount(6);
  await expect(page.locator(".steam-sidebar-link--icon-only").nth(0)).toHaveAttribute("data-mobile-site-id", "soundcloud");
  await expect(page.locator(".steam-sidebar-link--icon-only").nth(1)).toHaveAttribute("data-mobile-site-id", "spotify");
  const mobileIconRowShell = await page.locator(".steam-sidebar-list--mobile-icons").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      clipPath: styles.clipPath,
      paddingTop: Number.parseFloat(styles.paddingTop),
      paddingBottom: Number.parseFloat(styles.paddingBottom)
    };
  });
  expect(mobileIconRowShell.clipPath === "none" || mobileIconRowShell.clipPath === "").toBe(true);
  expect(mobileIconRowShell.paddingTop).toBeGreaterThanOrEqual(10);
  expect(mobileIconRowShell.paddingBottom).toBeGreaterThanOrEqual(10);
  const mobileAuraVariables = await page.locator(".steam-sidebar-link--icon-only").evaluateAll((nodes) => nodes.map((node) => window.getComputedStyle(node).getPropertyValue("--mobile-link-aura-rgb").trim()));
  expect(new Set(mobileAuraVariables).size).toBe(6);
  await expect(page.locator(".discord-presence-card--foundlifeless")).toBeVisible();
  await expect(page.locator(".cinna-mobile-gif--canvas")).toBeVisible();
  await expect(page.locator("#os-shuffle-visualizer-layer")).toBeHidden();
  await expect(page.locator(".cinna-mobile-gif[hidden]")).toBeHidden();
  await expect(page.locator(".cinna-mobile-gif:visible")).toHaveCount(1);
  await page.locator("[data-mobile-speaker-toggle]").click();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement && button.dataset.audioHasTrack === "true" && button.dataset.audioPlaying === "true";
  });
  await expect(page.locator("#social-hub-sidebar .steam-sidebar-currently-playing-panel--minimal")).toBeVisible();
  await expect(page.locator("#social-hub-sidebar .steam-sidebar-currently-playing-label")).toHaveText("Currently playing");
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-title]")).toHaveText("fiesta (feat. bunii)");
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-artist]")).toHaveText("ayowitty");
  await page.waitForFunction(() => {
    const panel = document.querySelector("#social-hub-sidebar .steam-sidebar-currently-playing-panel--minimal");
    const track = document.querySelector("#social-hub-sidebar .steam-sidebar-currently-playing-progress-track");
    const fill = document.querySelector("#social-hub-sidebar [data-sidebar-shuffle-progress-fill]");
    const duration = document.querySelector("#social-hub-sidebar [data-sidebar-shuffle-duration]");
    if (!(panel instanceof HTMLElement) || !(track instanceof HTMLElement) || !(fill instanceof HTMLElement) || !(duration instanceof HTMLElement)) {
      return false;
    }
    const transformMatch = (fill.style.transform || "").match(/scaleX\(([^)]+)\)/);
    const progress = transformMatch ? Number.parseFloat(transformMatch[1]) : 0;
    const trackRect = track.getBoundingClientRect();
    const fillStyle = window.getComputedStyle(fill);
    return panel.dataset.sidebarShuffleState === "playing"
      && panel.dataset.mobileCurrentlyPlayingReveal === "visible"
      && duration.textContent.trim() !== "--:--"
      && trackRect.width > 0
      && trackRect.height >= 2
      && fillStyle.boxShadow !== "none"
      && progress >= 0;
  });
  const firstMuteState = await page.locator("[data-mobile-speaker-toggle]").getAttribute("data-audio-muted");
  await page.locator("[data-mobile-speaker-toggle]").click();
  await page.waitForFunction((expectedState) => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement && button.dataset.audioMuted !== expectedState;
  }, firstMuteState);
  const secondMuteState = await page.locator("[data-mobile-speaker-toggle]").getAttribute("data-audio-muted");
  await page.locator("[data-mobile-speaker-toggle]").click();
  await page.waitForFunction((expectedState) => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement && button.dataset.audioMuted !== expectedState;
  }, secondMuteState);
  const mobileCentering = await page.evaluate(() => {
    const viewportCenter = window.innerWidth / 2;
    const heroShell = document.querySelector(".steam-hero-shell--compact-mobile");
    const presencePanel = document.querySelector(".discord-presence-panel");
    const presenceCardStack = document.querySelector(".discord-presence-card-stack");
    const presenceCard = document.querySelector(".discord-presence-card--foundlifeless");
    const presenceAvatar = document.querySelector(".discord-presence-avatar-wrap");
    const iconLinks = Array.from(document.querySelectorAll(".steam-sidebar-link--icon-only"));
    const cinnaWrap = document.querySelector(".cinna-mobile-gif-wrap");
    const cinna = document.querySelector(".cinna-mobile-gif--canvas");
    const speakerButton = document.querySelector("[data-mobile-speaker-toggle]");
    const mobileCurrentlyPlaying = document.querySelector("#social-hub-sidebar .steam-sidebar-currently-playing-panel--minimal");
    const iconCenters = iconLinks.map((node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return rect.left + rect.width / 2;
    }).filter((value) => typeof value === "number");
    const gaps = iconCenters.slice(1).map((center, index) => center - iconCenters[index]);
    const centerOffset = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - viewportCenter);
    };
    const rectSnapshot = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height
      };
    };
    return {
      heroOffset: centerOffset(heroShell),
      presenceOffset: centerOffset(presencePanel),
      presencePanelRect: rectSnapshot(presencePanel),
      presenceCardStackRect: rectSnapshot(presenceCardStack),
      presenceCardRect: rectSnapshot(presenceCard),
      presenceCardWidth: presenceCard instanceof HTMLElement ? Math.round(presenceCard.getBoundingClientRect().width) : null,
      presenceAvatarWidth: presenceAvatar instanceof HTMLElement ? Math.round(presenceAvatar.getBoundingClientRect().width) : null,
      speakerRect: rectSnapshot(speakerButton),
      cinnaWrapRect: rectSnapshot(cinnaWrap),
      cinnaRect: rectSnapshot(cinna),
      iconRowRect: rectSnapshot(document.querySelector(".steam-sidebar-list--mobile-icons")),
      mobileCurrentlyPlayingRect: rectSnapshot(mobileCurrentlyPlaying),
      minGap: gaps.length ? Math.min(...gaps) : null,
      maxGap: gaps.length ? Math.max(...gaps) : null
    };
  });
  expect(mobileCentering.heroOffset).not.toBeNull();
  expect(mobileCentering.presenceOffset).not.toBeNull();
  expect(mobileCentering.heroOffset).toBeLessThan(4);
  expect(mobileCentering.presenceOffset).toBeLessThan(4);
  expect(mobileCentering.presencePanelRect).not.toBeNull();
  expect(mobileCentering.presenceCardStackRect).not.toBeNull();
  expect(mobileCentering.presenceCardRect).not.toBeNull();
  expect(mobileCentering.presenceCardWidth).toBeLessThanOrEqual(320);
  expect(mobileCentering.presenceAvatarWidth).toBe(56);
  expect(mobileCentering.speakerRect).not.toBeNull();
  expect(mobileCentering.speakerRect.left).toBeLessThan(24);
  expect(mobileCentering.speakerRect.top).toBeLessThan(32);
  expect(mobileCentering.cinnaWrapRect).not.toBeNull();
  expect(mobileCentering.cinnaRect).not.toBeNull();
  expect(mobileCentering.iconRowRect).not.toBeNull();
  expect(mobileCentering.mobileCurrentlyPlayingRect).not.toBeNull();
  expect(Math.abs(mobileCentering.maxGap - mobileCentering.minGap)).toBeLessThan(12);
  expect(mobileCentering.cinnaRect.width).toBeLessThanOrEqual(184);
  expect(mobileCentering.cinnaRect.height).toBeLessThanOrEqual(196);
  expect(Math.abs(mobileCentering.cinnaWrapRect.top - mobileCentering.presenceCardStackRect.top)).toBeLessThanOrEqual(3);
  expect(mobileCentering.cinnaRect.bottom).toBeLessThanOrEqual(mobileCentering.presenceCardRect.top + 2);
  expect(mobileCentering.iconRowRect.top - mobileCentering.presencePanelRect.bottom).toBeGreaterThanOrEqual(8);
  expect(mobileCentering.mobileCurrentlyPlayingRect.top - mobileCentering.iconRowRect.bottom).toBeGreaterThanOrEqual(0);
  await expect(page.locator(".external-link-confirm")).toHaveCount(0);

  await page.evaluate(() => {
    window.__codexExternalLaunchLog.length = 0;
    window.__clipboardWrites.length = 0;
  });
  const discordMobileIconLink = page.locator('.steam-sidebar-link--icon-only[data-mobile-site-id="discord"]');
  await discordMobileIconLink.click({ force: true });
  await expect(discordMobileIconLink).toHaveClass(/is-mobile-selected/);
  await expect(discordMobileIconLink).toHaveAttribute("data-mobile-selection-phase", "animating");
  await expect(discordMobileIconLink).toHaveAttribute("data-profile-copy-state", "copied");
  await expect(discordMobileIconLink.locator("[data-profile-copy-feedback]")).toContainText("Copied");
  await expect(page.locator("[data-profile-copy-toast]")).toHaveCount(0);
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  await page.waitForTimeout(520);
  const mobileDiscordCopyState = await page.evaluate(() => ({
    clipboardWrites: window.__clipboardWrites.slice(),
    launchLog: window.__codexExternalLaunchLog.slice(),
    href: document.querySelector('.steam-sidebar-link--icon-only[data-mobile-site-id="discord"]')?.getAttribute("href") || "",
    copyHandle: document.querySelector('.steam-sidebar-link--icon-only[data-mobile-site-id="discord"]')?.getAttribute("data-profile-copy-handle") || ""
  }));
  expect(mobileDiscordCopyState.clipboardWrites).toContain("foundlifeless");
  expect(mobileDiscordCopyState.launchLog).toEqual([]);
  expect(mobileDiscordCopyState.href).toBe("");
  expect(mobileDiscordCopyState.copyHandle).toBe("foundlifeless");
  await page.waitForFunction(() => !document.querySelector(".steam-sidebar-link--icon-only.is-mobile-selected"), { timeout: 2_000 });

  await page.evaluate(() => {
    window.__codexExternalLaunchLog.length = 0;
    window.__codexExternalLaunchBaseline = performance.now();
  });
  const firstMobileIconLink = page.locator(".steam-sidebar-link--icon-only").first();
  await firstMobileIconLink.evaluate((node) => {
    if (node instanceof HTMLAnchorElement) {
      node.setAttribute("target", "_blank");
    }
  });
  await firstMobileIconLink.click({ force: true });
  await expect(firstMobileIconLink).toHaveClass(/is-mobile-selected/);
  await expect(firstMobileIconLink).toHaveAttribute("data-mobile-selection-phase", "animating");
  await expect(page.locator("#social-link-effect-layer")).toHaveCount(0);
  const selectedMobileLinkCount = await page.locator(".steam-sidebar-link--icon-only.is-mobile-selected").count();
  expect(selectedMobileLinkCount).toBe(1);
  await page.waitForTimeout(80);
  const selectedAuraState = await page.evaluate(() => {
    const node = document.querySelector(".steam-sidebar-link--icon-only");
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const styles = window.getComputedStyle(node);
    const before = window.getComputedStyle(node, "::before");
    const after = window.getComputedStyle(node, "::after");
    return {
      auraRgb: styles.getPropertyValue("--mobile-link-aura-rgb").trim(),
      beforeOpacity: Number.parseFloat(before.opacity),
      afterOpacity: Number.parseFloat(after.opacity),
      afterAnimationName: after.animationName
    };
  });
  expect(selectedAuraState).not.toBeNull();
  expect(selectedAuraState.auraRgb).toBe("255, 148, 84");
  expect(selectedAuraState.beforeOpacity).toBeGreaterThan(0.3);
  expect(selectedAuraState.afterOpacity).toBeGreaterThan(0.2);
  expect(selectedAuraState.afterAnimationName).toContain("mobileSidebarSoundcloudPlume");
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  await page.waitForTimeout(100);
  const earlyIconLaunchLog = await page.evaluate(() => window.__codexExternalLaunchLog.slice());
  expect(earlyIconLaunchLog.some((entry) => entry.type === "replace")).toBe(false);
  expect(earlyIconLaunchLog.some((entry) => entry.type === "href")).toBe(false);
  await page.waitForFunction(() => Array.isArray(window.__codexExternalLaunchLog)
    && window.__codexExternalLaunchLog.some((entry) => /open|replace|href/.test(entry.type) && /soundcloud|spotify|last\.fm|discord|steamcommunity|x\.com|twitter/i.test(entry.url || "")));
  const iconLaunchState = await page.evaluate(() => ({
    baseline: window.__codexExternalLaunchBaseline || 0,
    log: window.__codexExternalLaunchLog.slice()
  }));
  const iconLaunchEvent = iconLaunchState.log.find((entry) => /open|replace|href/.test(entry.type) && /soundcloud|spotify|last\.fm|discord|steamcommunity|x\.com|twitter/i.test(entry.url || ""));
  expect(iconLaunchEvent).toBeDefined();
  expect(iconLaunchEvent.timestamp - iconLaunchState.baseline).toBeGreaterThanOrEqual(340);
  await page.waitForFunction(() => {
    const target = document.querySelector(".steam-sidebar-link--icon-only.is-mobile-selected");
    return !(target instanceof HTMLElement) || target.dataset.mobileSelectionPhase === "idle";
  });
  await page.waitForFunction(() => !document.querySelector(".steam-sidebar-link--icon-only.is-mobile-selected"), { timeout: 2_000 });

  await page.evaluate(() => {
    window.__codexExternalLaunchLog.length = 0;
    const fixture = document.createElement("div");
    fixture.id = "codex-mobile-external-fixture";
    fixture.innerHTML = `
      <a class="codex-mobile-anchor" href="https://example.com/mobile-anchor" target="_blank">Anchor</a>
      <button type="button" class="codex-mobile-open-button" data-open-url="https://example.com/mobile-open">Open Button</button>
      <button type="button" class="codex-mobile-item-button" data-item-url="https://example.com/mobile-item">Item Button</button>
    `;
    document.querySelector("#social-hub-root")?.appendChild(fixture);
  });

  await page.locator(".codex-mobile-anchor").click();
  await page.waitForFunction(() => Array.isArray(window.__codexExternalLaunchLog)
    && window.__codexExternalLaunchLog.some((entry) => entry.type === "replace" && entry.url === "https://example.com/mobile-anchor"));
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);

  await page.evaluate(() => {
    window.__codexExternalLaunchLog.length = 0;
  });
  await page.locator(".codex-mobile-open-button").click();
  await page.waitForFunction(() => Array.isArray(window.__codexExternalLaunchLog)
    && window.__codexExternalLaunchLog.some((entry) => entry.type === "replace" && entry.url === "https://example.com/mobile-open"));
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);

  await page.evaluate(() => {
    window.__codexExternalLaunchLog.length = 0;
  });
  await page.locator(".codex-mobile-item-button").click();
  await page.waitForFunction(() => Array.isArray(window.__codexExternalLaunchLog)
    && window.__codexExternalLaunchLog.some((entry) => entry.type === "replace" && entry.url === "https://example.com/mobile-item"));
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);

  expect(apiRequests).toEqual(expect.arrayContaining([
    "/api/steam-recent-activity",
    "/api/lastfm",
    "/api/discord"
  ]));
});

test("josie shows loved, monthly rank, and discovery context for Last.fm tracks", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  const nowIso = new Date().toISOString();
  const oneHourAgoUts = String(Math.floor(Date.now() / 1000) - 60 * 60);

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: nowIso,
        recenttracks: {
          track: [
            {
              name: "Loved Track",
              artist: { name: "Quadeca" },
              album: { "#text": "Vanisher" },
              image: [
                { "#text": "", size: "small" },
                { "#text": "https://example.com/loved-track-art.jpg", size: "large" }
              ],
              url: "https://www.last.fm/music/Quadeca/_/Loved+Track",
              date: { uts: oneHourAgoUts },
              isLoved: true,
              monthlyTopRank: 3,
              monthlyTopPlaycount: "18"
            },
            {
              name: "Regular Track",
              artist: { name: "Jane Remover" },
              album: { "#text": "Ghostholding" },
              image: [
                { "#text": "", size: "small" },
                { "#text": "https://example.com/regular-track-art.jpg", size: "large" }
              ],
              url: "https://www.last.fm/music/Jane+Remover/_/Regular+Track",
              date: { uts: oneHourAgoUts }
            }
          ]
        },
        toptracks: {
          track: [
            {
              name: "Loved Track",
              artist: { name: "Quadeca" },
              playcount: "18",
              "@attr": { rank: "3" }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        user: {
          playcount: "65188",
          artist_count: "1234"
        },
        lovedtracks: {
          "@attr": { total: "1197" }
        },
        discovery: {
          referenceTrack: {
            title: "Loved Track",
            artist: "Quadeca",
            similarTracks: [
              {
                title: "knowing we'll never know",
                artist: "Quadeca",
                url: "https://www.last.fm/music/Quadeca/_/knowing+we%27ll+never+know",
                match: 0.91
              },
              {
                title: "House Settling",
                artist: "Jane Remover",
                url: "https://www.last.fm/music/Jane+Remover/_/House+Settling",
                match: 0.87
              }
            ],
            topTags: [
              { name: "digicore", url: "https://www.last.fm/tag/digicore" },
              { name: "glitch pop", url: "https://www.last.fm/tag/glitch+pop" },
              { name: "noise pop", url: "https://www.last.fm/tag/noise+pop" }
            ]
          }
        },
        nowPlaying: {
          nowPlaying: false,
          stale: false,
          fetchedAt: nowIso,
          track: null
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", {
    timeout: 30_000
  });

  const lovedRow = page.locator(".lastfm-recent-item", {
    has: page.locator(".lastfm-loved-indicator")
  }).first();
  await expect(lovedRow).toContainText("Loved Track");
  await expect(page.locator(".lastfm-loved-indicator")).toHaveCount(1);
  await expect(page.locator(".lastfm-monthly-rank-badge")).toHaveText("#3 month");
  await expect(page.locator(".lastfm-recent-discovery")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-tag")).toHaveCount(0);
  const heartStyles = await page.locator(".lastfm-loved-indicator").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color,
      backgroundColor: styles.backgroundColor,
      boxShadow: styles.boxShadow
    };
  });
  const monthlyBadgeStyles = await page.locator(".lastfm-monthly-rank-badge").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color,
      backgroundColor: styles.backgroundColor
    };
  });
  expect(heartStyles.color).toBe("rgb(240, 144, 194)");
  expect(heartStyles.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(heartStyles.boxShadow).toBe("none");
  expect(monthlyBadgeStyles.color).toBe("rgb(210, 214, 223)");
  expect(monthlyBadgeStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
});

test("josie opens a track details panel for Last.fm rows and reuses it for related tracks", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  const apiRequests = [];
  page.on("request", (request) => {
    const url = request.url();
    apiRequests.push(url);
  });

  await stubWindowOpen(page);
  await stubSpotifyIframeApi(page);

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [{ "#text": "https://example.com/one-time-art.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    const url = new URL(route.request().url());
    const track = url.searchParams.get("track");
    const artist = url.searchParams.get("artist");
    if (track === "One Time") {
      await new Promise((resolve) => setTimeout(resolve, 140));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sourceStatus: "OK",
          stale: false,
          fetchedAt: new Date().toISOString(),
          query: { artist, track, album: "This Is How Tomorrow Moves" },
          track: {
            title: "One Time",
            artist: "beabadoobee",
            album: "This Is How Tomorrow Moves",
            durationMs: 184000,
            durationLabel: "3:04",
            artworkUrl: "",
            lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
            artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
            userPlaycount: 3,
            userLoved: true,
            globalPlaycount: 2740015,
            listeners: 285055,
            summary: "A bright and clipped single.",
            summaryHasMore: true,
            publishedAt: null,
            topTags: [
              { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
              { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
            ],
            similarTracks: [
              { title: "California", artist: "beabadoobee", url: "https://www.last.fm/music/beabadoobee/_/California", match: 0.82 },
              { title: "Glue Song", artist: "beabadoobee", url: "https://www.last.fm/music/beabadoobee/_/Glue+Song", match: 0.79 }
            ]
          },
          spotify: {
            matchStatus: "matched",
            embedUrl: "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator",
            openUrl: "https://open.spotify.com/track/spotify-track-1",
            searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
            previewUrl: "https://p.scdn.co/mp3-preview/one-time-preview.mp3",
            title: "One Time",
            artist: "beabadoobee",
            album: "This Is How Tomorrow Moves",
            artworkUrl: "https://i.scdn.co/image/one-time.jpg"
          },
          scrobbles: {
            total: 3,
            items: [
              {
                playedAtIso: "2026-03-23T07:21:00.000Z",
                playedAtLabel: "23 Mar 2026, 07:21",
                album: "This Is How Tomorrow Moves",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time"
              }
            ]
          },
          artistTopTracks: {
            artist: "beabadoobee",
            items: [
              {
                title: "the perfect pair",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
                artworkUrl: "https://example.com/perfect-pair.jpg",
                userPlaycount: 2,
                userLoved: false,
                globalPlaycount: 29424507,
                listeners: 1452743
              },
              {
                title: "Talk",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
                artworkUrl: "https://example.com/talk.jpg",
                userPlaycount: 9,
                userLoved: true,
                globalPlaycount: 1820011,
                listeners: 942304
              }
            ]
          }
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "PARTIAL",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist, track, album: "" },
        track: {
          title: track || "the perfect pair",
          artist: "beabadoobee",
          album: "Beatopia",
          durationMs: 193000,
          durationLabel: "3:13",
          artworkUrl: track === "Talk" ? "https://example.com/talk.jpg" : "https://example.com/perfect-pair.jpg",
          lastfmUrl: track === "Talk" ? "https://www.last.fm/music/beabadoobee/_/Talk" : "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: track === "Talk" ? 9 : 2,
          userLoved: track === "Talk",
          globalPlaycount: track === "Talk" ? 1820011 : 29424507,
          listeners: track === "Talk" ? 942304 : 1452743,
          summary: "",
          publishedAt: null,
          topTags: [],
          similarTracks: []
        },
        spotify: {
          matchStatus: track === "Talk" ? "matched" : "unmatched",
          embedUrl: "",
          openUrl: track === "Talk" ? "https://open.spotify.com/track/spotify-talk" : "",
          searchUrl: track === "Talk" ? "https://open.spotify.com/search/Talk%20beabadoobee" : "https://open.spotify.com/search/the%20perfect%20pair%20beabadoobee",
          previewUrl: track === "Talk" ? "https://p.scdn.co/mp3-preview/talk-preview.mp3" : "",
          title: track === "Talk" ? "Talk" : "",
          artist: track === "Talk" ? "beabadoobee" : "",
          album: track === "Talk" ? "Beatopia" : "",
          artworkUrl: track === "Talk" ? "https://i.scdn.co/image/talk.jpg" : ""
        },
        scrobbles: { total: track === "Talk" ? 9 : 2, items: [] },
        artistTopTracks: { artist: "beabadoobee", items: [] }
      })
    });
  });
  await page.route("https://p.scdn.co/mp3-preview/one-time-preview.mp3", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      body: SPOTIFY_PREVIEW_AUDIO_BUFFER
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });

  const sourceRow = page.locator(".lastfm-recent-button").first();
  const trackSourceArtSelector = ".lastfm-recent-button [data-lastfm-art-source]";
  await clearInteractionSfxLog(page);
  await sourceRow.click();
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "staged");
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("aria-hidden", "true");
  await page.waitForFunction(() => {
    const clone = document.querySelector(".lastfm-track-panel-art-launch");
    return clone instanceof HTMLElement && window.getComputedStyle(clone).borderRadius === "0px";
  });
  await waitForLastFmPanelSourceArtState(page, trackSourceArtSelector, "launching", {
    panelVisibility: "staged",
    ariaHidden: "true"
  });
  await waitForInteractionSfx(page, { soundId: "open_soft", source: "lastfmTrackPanelOpen", ownerMode: "top", page: "josie" });
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await page.waitForTimeout(900);
  await expect(page.locator(trackSourceArtSelector)).toHaveAttribute("data-lastfm-art-source-state", "launching");
  await waitForLastFmPanelSourceArtState(page, trackSourceArtSelector, "retiring", {
    panelVisibility: "visible",
    ariaHidden: "false",
    minWindowOpacity: 0.05
  });
  await expect(page.locator(".lastfm-track-panel-art-launch")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-art--flip")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("One Time");
  await expect(page.locator(".lastfm-track-panel-stat-label").first()).toContainText(/Scrobbles/i);
  await expect(page.locator(".lastfm-track-panel-stat-label", { hasText: "Global plays" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-stat-label", { hasText: "Listeners" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-stat-label", { hasText: "Your plays" })).toHaveCount(0);
  const panelBox = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const bodyEl = document.querySelector(".lastfm-track-panel-body");
    const backdropEl = document.querySelector(".lastfm-track-panel-backdrop");
    const artEl = document.querySelector(".lastfm-track-panel-art");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const rect = windowEl.getBoundingClientRect();
    const styles = window.getComputedStyle(windowEl);
    return {
      width: rect.width,
      scrollbarWidth: styles.getPropertyValue("scrollbar-width").trim(),
      overflowY: styles.overflowY,
      bodyHeight: bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0,
      clientHeight: windowEl.clientHeight,
      artWidth: artEl instanceof HTMLElement ? artEl.getBoundingClientRect().width : 0,
      artHeight: artEl instanceof HTMLElement ? artEl.getBoundingClientRect().height : 0,
      backgroundColor: styles.backgroundColor,
      backdropFilter: backdropEl instanceof HTMLElement ? window.getComputedStyle(backdropEl).backdropFilter : "",
      compactDebugBadgeCount: document.querySelectorAll(".lastfm-track-panel-badge").length
    };
  });
  expect(panelBox).not.toBeNull();
  expect(panelBox.width).toBeLessThanOrEqual(1000);
  expect(panelBox.scrollbarWidth).toBe("none");
  expect(panelBox.overflowY).toBe("hidden");
  expect(panelBox.bodyHeight).toBeLessThanOrEqual(panelBox.clientHeight + 2);
  expect(panelBox.artWidth).toBeGreaterThanOrEqual(220);
  expect(panelBox.artHeight).toBeGreaterThanOrEqual(220);
  expect(panelBox.backgroundColor).toBe("rgb(0, 0, 0)");
  expect(panelBox.backdropFilter).toContain("blur");
  expect(panelBox.compactDebugBadgeCount).toBeLessThanOrEqual(1);
  await expect(page.locator(".lastfm-track-panel-badge", { hasText: "Cloudflare" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-badge", { hasText: "Live" })).toHaveCount(0);
  await expect(page.getByText(/Last refresh:/)).toHaveCount(0);
  const panelTypography = await page.evaluate(() => {
    const title = document.querySelector(".lastfm-track-panel-title");
    const meta = document.querySelector(".lastfm-track-panel-meta");
    const relatedTitle = document.querySelector(".lastfm-track-panel-related-title");
    const lovedBadge = document.querySelector(".lastfm-track-panel-badge--loved");
    return {
      titleFont: title ? window.getComputedStyle(title).fontFamily : "",
      titleSize: title ? window.getComputedStyle(title).fontSize : "",
      metaFont: meta ? window.getComputedStyle(meta).fontFamily : "",
      relatedTitleFont: relatedTitle ? window.getComputedStyle(relatedTitle).fontFamily : "",
      relatedTitleSize: relatedTitle ? window.getComputedStyle(relatedTitle).fontSize : "",
      sectionHeadJustify: document.querySelector(".lastfm-track-panel-section-head") ? window.getComputedStyle(document.querySelector(".lastfm-track-panel-section-head")).justifyContent : "",
      lovedBadgeText: lovedBadge ? lovedBadge.textContent.trim() : "",
      lovedBadgeIconCount: lovedBadge ? lovedBadge.querySelectorAll(".lastfm-loved-indicator").length : 0
    };
  });
  expect(panelTypography.metaFont.toLowerCase()).toContain("open sans");
  expect(panelTypography.titleFont).not.toBe(panelTypography.metaFont);
  expect(panelTypography.relatedTitleFont).not.toBe(panelTypography.metaFont);
  expect(panelTypography.titleSize).toBe("64px");
  expect(panelTypography.relatedTitleSize).toBe("32px");
  expect(panelTypography.sectionHeadJustify).not.toBe("space-between");
  expect(panelTypography.lovedBadgeText).toBe("");
  expect(panelTypography.lovedBadgeIconCount).toBe(1);
  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-similar")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "My recent plays" })).toHaveCount(1);
  const summaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(summaryLink).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-art-image")).toHaveAttribute("src", /https:\/\/i\.scdn\.co\/image\/one-time\.jpg/);
  const trackArtHoverBefore = await readLastFmPanelArtHoverState(page);
  await page.locator(".lastfm-track-panel-art").hover();
  await page.waitForFunction(() => {
    const art = document.querySelector(".lastfm-track-panel-art");
    return art instanceof HTMLElement && Number.parseFloat(window.getComputedStyle(art, "::before").opacity) > 0.2;
  });
  const trackArtHoverAfter = await readLastFmPanelArtHoverState(page);
  expect(trackArtHoverBefore).not.toBeNull();
  expect(trackArtHoverAfter).not.toBeNull();
  expect(trackArtHoverBefore.overlayOpacity).toBe("0");
  expect(Number.parseFloat(trackArtHoverAfter.overlayOpacity)).toBeGreaterThan(0.2);
  expect(trackArtHoverAfter.shellTransform).not.toBe(trackArtHoverBefore.shellTransform);
  expect(trackArtHoverAfter.imageTransform).not.toBe(trackArtHoverBefore.imageTransform);
  await page.locator(".lastfm-track-panel-close").hover();
  await clearInteractionSfxLog(page);
  const artShell = await showLastFmPanelArtActions(page);
  await waitForInteractionSfx(page, { soundId: "flip_soft", source: "lastfmPanelArtFlipBack", ownerMode: "top", page: "josie" });
  await page.evaluate(() => window.__emitSpotifyIframeEvent?.(0, "playback_started", { data: { isPaused: false } }));
  await expect(page.locator("[data-shuffle-player].is-playing")).toHaveCount(0);
  await page.evaluate(() => window.__emitSpotifyIframeEvent?.(0, "playback_update", { data: { isPaused: true } }));
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 10_000 });
  const trackCta = artShell.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" });
  const artistCta = artShell.locator(".lastfm-track-panel-cta", { hasText: "Open Artist on Last.fm" });
  const spotifyCta = artShell.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" });
  await summaryLink.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  let windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee/_/One+Time",
    target: "_blank"
  });
  await trackCta.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  await waitForInteractionSfx(page, { soundId: "confirm_soft", source: "lastfmTrackPanelOpen", ownerMode: "top", page: "josie" });
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee/_/One+Time",
    target: "_blank"
  });
  await artistCta.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee",
    target: "_blank"
  });
  await spotifyCta.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "spotify:track:spotify-track-1",
    target: "_blank"
  });
  await expect(page.locator(".lastfm-track-panel-related-button")).toHaveCount(2);
  await expect(page.locator(".lastfm-track-panel-related-button").first()).toContainText("Talk");
  await page.evaluate(() => window.__setSpotifyEmbedControllerMode?.({ delayNextMs: 2400 }));
  await page.locator(".lastfm-track-panel-related-button").first().click();
  await page.waitForFunction(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const title = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-title') : null;
    const nextWindow = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-window') : null;
    return currentScene instanceof HTMLElement
      && currentScene.getAttribute("data-panel-scene-phase") === "loading"
      && currentScene.getAttribute("data-panel-scene-spin") === "idle"
      && nextWindow instanceof HTMLElement
      && title instanceof HTMLElement
      && title.textContent.includes("One Time");
  });
  await page.waitForTimeout(1_600);
  const midMorphState = await page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"]').evaluate((scene) => {
    const currentTitle = scene.querySelector('[data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-title');
    const nextLayer = scene.querySelector('[data-lastfm-track-panel-scene-layer="next"]');
    const nextLayerStyle = nextLayer instanceof HTMLElement ? window.getComputedStyle(nextLayer) : null;
    return {
      phase: scene.getAttribute("data-panel-scene-phase"),
      spin: scene.getAttribute("data-panel-scene-spin"),
      title: currentTitle instanceof HTMLElement ? currentTitle.textContent.trim() : "",
      nextOpacity: nextLayerStyle?.opacity || "",
      nextVisibility: nextLayerStyle?.visibility || ""
    };
  });
  expect(midMorphState).toEqual({
    phase: "loading",
    spin: "idle",
    title: "One Time",
    nextOpacity: "0",
    nextVisibility: "hidden"
  });
  await page.evaluate(() => {
    const scene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    if (!(scene instanceof HTMLElement)) return;
    window.__codexPanelMorphLayers = {
      current: scene.querySelector('[data-lastfm-track-panel-scene-layer="current"]'),
      next: scene.querySelector('[data-lastfm-track-panel-scene-layer="next"]')
    };
  });
  await expect(page.locator('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-window')).toHaveCount(1);
  await expect(page.locator('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-title')).toContainText("Talk");
  await expect.poll(async () => {
    return page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"]').evaluate((scene) => ({
      loading: scene.getAttribute("data-panel-scene-loading"),
      spin: scene.getAttribute("data-panel-scene-spin"),
      phase: scene.getAttribute("data-panel-scene-phase")
    }));
  }, { timeout: 5_000 }).toEqual({ loading: "false", spin: "idle", phase: "stable" });
  const settledMorphLayerState = await page.evaluate(() => {
    const scene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const tracked = window.__codexPanelMorphLayers || {};
    if (!(scene instanceof HTMLElement)) {
      return null;
    }
    return {
      currentWasStagedNext: scene.querySelector('[data-lastfm-track-panel-scene-layer="current"]') === tracked.next,
      nextWasPreviousCurrent: scene.querySelector('[data-lastfm-track-panel-scene-layer="next"]') === tracked.current,
      nextChildElementCount: scene.querySelector('[data-lastfm-track-panel-scene-layer="next"]')?.children.length ?? -1
    };
  });
  expect(settledMorphLayerState).toEqual({
    currentWasStagedNext: true,
    nextWasPreviousCurrent: true,
    nextChildElementCount: 0
  });
  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  const relatedArtShell = await showLastFmPanelArtActions(page);
  await expect(relatedArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" })).toBeVisible();
  await clearInteractionSfxLog(page);
  await page.keyboard.press("Escape");
  await waitForInteractionSfx(page, { soundId: "close_soft", source: "lastfmTrackPanelClose", ownerMode: "top", page: "josie" });
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);
  await expect(sourceRow).toBeFocused();

  expect(apiRequests.filter((url) => url.includes("/api/lastfm-track-details")).length).toBe(2);
  expect(apiRequests.some((url) => url.includes("ws.audioscrobbler.com"))).toBe(false);
  expect(apiRequests.some((url) => url.includes("api.spotify.com"))).toBe(false);
});

test("josie track details panel skips the spotify player when no spotify match exists", async ({ page }) => {
  await stubWindowOpen(page);
  await stubSpotifyIframeApi(page);
  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "glue trap",
              artist: { name: "Monty.Pk" },
              album: { "#text": "deadbeat" },
              image: [],
              url: "https://www.last.fm/music/Monty.Pk/_/glue+trap",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "128",
              image: [{ "#text": "https://example.com/artist-1.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee"
            },
            {
              name: "Slow Pulp",
              playcount: "96",
              image: [{ "#text": "https://example.com/artist-2.jpg", size: "large" }],
              url: "https://www.last.fm/music/Slow+Pulp"
            },
            {
              name: "Wisp",
              playcount: "74",
              image: [{ "#text": "https://example.com/artist-3.jpg", size: "large" }],
              url: "https://www.last.fm/music/Wisp"
            }
          ]
        },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "PARTIAL",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "Monty.Pk", track: "glue trap", album: "deadbeat" },
        track: {
          title: "glue trap",
          artist: "Monty.Pk",
          album: "deadbeat",
          durationMs: 0,
          durationLabel: "",
          artworkUrl: "",
          lastfmUrl: "https://www.last.fm/music/Monty.Pk/_/glue+trap",
          artistLastFmUrl: "https://www.last.fm/music/Monty.Pk",
          userPlaycount: 1,
          userLoved: false,
          globalPlaycount: 10,
          listeners: 5,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "unmatched",
          embedUrl: "",
          openUrl: "",
          searchUrl: "https://open.spotify.com/search/glue%20trap%20Monty.Pk",
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        },
        scrobbles: { total: 1, items: [] },
        artistTopTracks: { artist: "Monty.Pk", items: [] }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.locator(".lastfm-recent-button").first().click();

  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-slot.is-disabled")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(0);
  const unmatchedArtShell = await showLastFmPanelArtActions(page);
  await expect(unmatchedArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open Track on Last.fm" })).toBeVisible();
  await expect(unmatchedArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open Spotify Search" })).toBeVisible();
  await unmatchedArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open Spotify Search" }).click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  const windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://open.spotify.com/search/glue%20trap%20Monty.Pk",
    target: "_blank"
  });
});

test("josie opens artist and album detail panels from top charts and follows album artist links", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (request) => {
    apiRequests.push(request.url());
  });

  await stubWindowOpen(page);
  await stubSpotifyIframeApi(page);

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: { track: [] },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "33",
              url: "https://www.last.fm/music/beabadoobee",
              image: [{ "#text": "https://example.com/bea-grid.jpg", size: "large" }]
            }
          ]
        },
        topalbums: {
          album: [
            {
              name: "Beatopia",
              artist: { name: "beabadoobee" },
              playcount: "21",
              url: "https://www.last.fm/music/beabadoobee/Beatopia",
              image: [{ "#text": "https://example.com/beatopia-grid.jpg", size: "large" }]
            }
          ]
        },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-artist-details**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 140));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee" },
        artist: {
          name: "beabadoobee",
          artworkUrl: "https://example.com/bea-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee",
          summary: "A dreamy indie artist.",
          summaryHasMore: true,
          listeners: 285055,
          playcount: 2740015,
          topTrackCount: 2,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
            { name: "bedroom pop", url: "https://www.last.fm/tag/bedroom+pop" }
          ]
        },
        topTracks: {
          artist: "beabadoobee",
          items: [
            {
              title: "Talk",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/talk.jpg",
              userPlaycount: 9,
              userLoved: true,
              globalPlaycount: 1820011,
              listeners: 942304
            },
            {
              title: "the perfect pair",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/perfect-pair.jpg",
              userPlaycount: 2,
              userLoved: false,
              globalPlaycount: 29424507,
              listeners: 1452743
            }
          ]
        },
        topAlbums: {
          artist: "beabadoobee",
          items: [
            {
              title: "Beatopia",
              artist: "beabadoobee",
              artworkUrl: "https://example.com/beatopia-detail.jpg",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/Beatopia",
              releasedAt: "15 Jul 2022",
              releaseYear: "2022",
              topTags: [
                { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
                { name: "dream pop", url: "https://www.last.fm/tag/dream+pop" }
              ],
              playcount: 1200456,
              listeners: 500123
            }
          ]
        }
      })
    });
  });

  await page.route("**/api/lastfm-album-details**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 640));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", album: "Beatopia" },
        album: {
          title: "Beatopia",
          artist: "beabadoobee",
          artworkUrl: "https://example.com/beatopia-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/Beatopia",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          summary: "A dreamy sophomore album.",
          summaryHasMore: true,
          listeners: 500123,
          playcount: 1200456,
          releasedAt: "15 Jul 2022",
          runtimeMs: 308000,
          runtimeLabel: "5:08",
          trackCount: 2,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" },
            { name: "dream pop", url: "https://www.last.fm/tag/dream+pop" }
          ]
        },
        spotify: {
          matchStatus: "matched",
          embedUrl: "https://open.spotify.com/embed/track/spotify-talk-1?utm_source=generator",
          openUrl: "https://open.spotify.com/track/spotify-talk-1",
          searchUrl: "https://open.spotify.com/search/Talk%20beabadoobee",
          previewUrl: "",
          title: "Talk",
          artist: "beabadoobee",
          album: "Beatopia",
          artworkUrl: "https://i.scdn.co/image/spotify-beatopia.jpg"
        },
        tracks: {
          items: [
            {
              rank: 1,
              title: "Talk",
              artist: "beabadoobee",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              durationMs: 144000,
              durationLabel: "2:24",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
              userPlaycount: 9,
              userLoved: true,
              globalPlaycount: 1820011,
              listeners: 942304
            },
            {
              rank: 2,
              title: "the perfect pair",
              artist: "beabadoobee",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              durationMs: 164000,
              durationLabel: "2:44",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/the+perfect+pair",
              userPlaycount: 2,
              userLoved: false,
              globalPlaycount: 29424507,
              listeners: 1452743
            }
          ]
        },
        relatedTracks: {
          artist: "beabadoobee",
          items: [
            {
              title: "See you Soon",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/See+you+Soon",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/see-you-soon.jpg",
              userPlaycount: 4,
              userLoved: false,
              globalPlaycount: 541102,
              listeners: 301204
            },
            {
              title: "Cologne",
              artist: "beabadoobee",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Cologne",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              artworkUrl: "https://example.com/cologne.jpg",
              userPlaycount: 3,
              userLoved: true,
              globalPlaycount: 902210,
              listeners: 411002
            }
          ]
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  const artistSourceArtSelector = ".lastfm-media-grid--artists .lastfm-media-button [data-lastfm-art-source]";
  await page.locator(".lastfm-media-grid--artists .lastfm-media-button").first().click();
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "staged");
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("aria-hidden", "true");
  await waitForLastFmPanelSourceArtState(page, artistSourceArtSelector, "launching", {
    panelVisibility: "staged",
    ariaHidden: "true"
  });
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await page.waitForTimeout(900);
  await expect(page.locator(artistSourceArtSelector)).toHaveAttribute("data-lastfm-art-source-state", "launching");
  await waitForLastFmPanelSourceArtState(page, artistSourceArtSelector, "retiring", {
    panelVisibility: "visible",
    ariaHidden: "false",
    minWindowOpacity: 0.05
  });
  await expect(page.locator(".lastfm-track-panel-art-launch")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-kicker")).toContainText("Artist details");
  await expect(page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"] .lastfm-track-panel-title')).toContainText("beabadoobee");
  const artistAmbient = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity
    };
  });
  expect(artistAmbient).not.toBeNull();
  expect(artistAmbient.hasAmbient).toBe("true");
  expect(artistAmbient.backgroundImage).toContain("bea-detail.jpg");
  expect(Number.parseFloat(artistAmbient.opacity)).toBeGreaterThan(0.2);
  const artistPanelLayout = await page.evaluate(() => {
    const layout = document.querySelector(".lastfm-track-panel-layout");
    const primary = document.querySelector(".lastfm-track-panel-primary");
    const art = document.querySelector(".lastfm-track-panel-art");
    return {
      className: layout instanceof HTMLElement ? layout.className : "",
      primaryWidth: primary instanceof HTMLElement ? primary.getBoundingClientRect().width : 0,
      artWidth: art instanceof HTMLElement ? art.getBoundingClientRect().width : 0,
      artHeight: art instanceof HTMLElement ? art.getBoundingClientRect().height : 0,
      artBackground: art instanceof HTMLElement ? window.getComputedStyle(art).backgroundColor : "",
      artBorderWidth: art instanceof HTMLElement ? window.getComputedStyle(art).borderTopWidth : ""
    };
  });
  expect(artistPanelLayout.className).toContain("lastfm-track-panel-layout--compact-primary");
  expect(artistPanelLayout.primaryWidth).toBeGreaterThan(220);
  expect(artistPanelLayout.artWidth).toBeGreaterThanOrEqual(220);
  expect(artistPanelLayout.artHeight).toBeGreaterThanOrEqual(220);
  expect(artistPanelLayout.artBackground).toBe("rgba(0, 0, 0, 0)");
  expect(artistPanelLayout.artBorderWidth).toBe("0px");
  const artistPanelFit = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const bodyEl = document.querySelector(".lastfm-track-panel-body");
    return windowEl instanceof HTMLElement ? {
      bodyHeight: bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0,
      clientHeight: windowEl.clientHeight,
      overflowY: window.getComputedStyle(windowEl).overflowY
    } : null;
  });
  expect(artistPanelFit).not.toBeNull();
  expect(artistPanelFit.overflowY).toBe("hidden");
  expect(artistPanelFit.bodyHeight).toBeLessThanOrEqual(artistPanelFit.clientHeight + 2);
  const artistArtHoverBefore = await readLastFmPanelArtHoverState(page);
  await page.locator(".lastfm-track-panel-art").hover();
  await page.waitForFunction(() => {
    const art = document.querySelector(".lastfm-track-panel-art");
    return art instanceof HTMLElement && Number.parseFloat(window.getComputedStyle(art, "::before").opacity) > 0.2;
  });
  const artistArtHoverAfter = await readLastFmPanelArtHoverState(page);
  expect(artistArtHoverBefore).not.toBeNull();
  expect(artistArtHoverAfter).not.toBeNull();
  expect(artistArtHoverBefore.overlayOpacity).toBe("0");
  expect(Number.parseFloat(artistArtHoverAfter.overlayOpacity)).toBeGreaterThan(0.2);
  expect(artistArtHoverAfter.shellTransform).not.toBe(artistArtHoverBefore.shellTransform);
  expect(artistArtHoverAfter.imageTransform).not.toBe(artistArtHoverBefore.imageTransform);
  await page.locator(".lastfm-track-panel-close").hover();
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Popular tracks" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Albums" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(1);
  const artistSummaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(artistSummaryLink).toBeVisible();
  await artistSummaryLink.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  let windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee",
    target: "_blank"
  });
  const artistPopularTracksSection = page.locator(".lastfm-track-panel-related").filter({
    has: page.locator(".lastfm-track-panel-section-title", { hasText: "Popular tracks" })
  });
  await expect(artistPopularTracksSection.locator(".lastfm-track-panel-related-button").first()).toContainText("Talk");
  await expect(page.locator(".lastfm-track-panel-related-button--album")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("2022");
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("indie pop");
  const artistWindowBeforeAlbumJump = await page.evaluate(() => {
    const currentWindow = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"] [data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-window');
    return currentWindow instanceof HTMLElement ? currentWindow.getBoundingClientRect() : null;
  });
  await page.locator(".lastfm-track-panel-related-button--album").first().click();
  await page.waitForFunction(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const currentWindow = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-window') : null;
    const nextWindow = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-window') : null;
    const title = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-title') : null;
    return currentScene instanceof HTMLElement
      && currentScene.getAttribute("data-panel-scene-phase") === "loading"
      && currentScene.getAttribute("data-panel-scene-spin") === "idle"
      && currentWindow instanceof HTMLElement
      && nextWindow instanceof HTMLElement
      && nextWindow.classList.contains("is-loading")
      && title instanceof HTMLElement
      && title.textContent.includes("beabadoobee");
  });
  const panelSceneState = await page.evaluate(() => {
    const host = document.querySelector(".lastfm-track-panel-scene-host");
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const currentWindow = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-window') : null;
    const nextWindow = currentScene instanceof HTMLElement ? currentScene.querySelector('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-window') : null;
    const stack = currentScene instanceof HTMLElement ? currentScene.querySelector("[data-lastfm-track-panel-scene-stack]") : null;
    const currentRect = currentWindow instanceof HTMLElement ? currentWindow.getBoundingClientRect() : null;
    const nextRect = nextWindow instanceof HTMLElement ? nextWindow.getBoundingClientRect() : null;
    const hostRect = host instanceof HTMLElement ? host.getBoundingClientRect() : null;
    return {
      hasHost: host instanceof HTMLElement,
      currentType: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-type") : "",
      currentLoading: currentWindow instanceof HTMLElement ? currentWindow.classList.contains("is-loading") : false,
      nextLoading: nextWindow instanceof HTMLElement ? nextWindow.classList.contains("is-loading") : false,
      currentLoadingState: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-loading") : "",
      currentPhase: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-phase") : "",
      currentSpin: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-spin") : "",
      heightLocked: stack instanceof HTMLElement ? stack.getAttribute("data-panel-scene-height-locked") : "",
      widthDelta: currentRect && hostRect ? Math.abs(currentRect.width - hostRect.width) : 0,
      nextWidthDelta: nextRect && hostRect ? Math.abs(nextRect.width - hostRect.width) : 0
    };
  });
  expect(panelSceneState.hasHost).toBe(true);
  expect(panelSceneState.currentType).toBe("artist");
  expect(panelSceneState.currentLoading).toBe(false);
  expect(panelSceneState.currentLoadingState).toBe("false");
  expect(panelSceneState.nextLoading).toBe(true);
  /*
  expect(panelSceneState.currentPhase).toBe("loading");
  expect(panelSceneState.backCatText).toContain("(=^･ω･^=)");
  expect(panelSceneState.backCatText).toContain("ﾉ");
  expect(panelSceneState.backCatPawAnimationName).toContain("lastfmTrackPanelSceneCatWave");
  expect(panelSceneState.currentSpin).toBe("idle");
  expect(panelSceneState.heightLocked).toBe("true");
  */
  expect(panelSceneState.currentPhase).toBe("loading");
  expect(panelSceneState.currentSpin).toBe("idle");
  expect(panelSceneState.heightLocked).toBe("true");
  expect(panelSceneState.widthDelta).toBeLessThan(2);
  expect(panelSceneState.nextWidthDelta).toBeLessThan(8);
  expect(artistWindowBeforeAlbumJump).not.toBeNull();
  await expect(page.locator('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-title')).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel-scene")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-window:not(.is-loading)")).toHaveCount(1);
  await expect.poll(async () => {
    return page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"]').evaluate((scene) => ({
      loading: scene.getAttribute("data-panel-scene-loading"),
      spin: scene.getAttribute("data-panel-scene-spin"),
      phase: scene.getAttribute("data-panel-scene-phase"),
      type: scene.getAttribute("data-panel-type")
    }));
  }).toEqual({ loading: "false", spin: "idle", phase: "stable", type: "album" });
  const albumAmbientFromArtistPopup = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const artEl = document.querySelector(".lastfm-track-panel-art");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity,
      artWidth: artEl instanceof HTMLElement ? artEl.getBoundingClientRect().width : 0,
      artHeight: artEl instanceof HTMLElement ? artEl.getBoundingClientRect().height : 0
    };
  });
  expect(albumAmbientFromArtistPopup).not.toBeNull();
  expect(albumAmbientFromArtistPopup.hasAmbient).toBe("true");
  expect(albumAmbientFromArtistPopup.backgroundImage).toContain("beatopia-detail.jpg");
  expect(Number.parseFloat(albumAmbientFromArtistPopup.opacity)).toBeGreaterThan(0.2);
  expect(albumAmbientFromArtistPopup.artWidth).toBeGreaterThanOrEqual(220);
  expect(albumAmbientFromArtistPopup.artHeight).toBeGreaterThanOrEqual(220);
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(0);
  const albumArtShellFromArtistPopup = await showLastFmPanelArtActions(page);
  await expect(albumArtShellFromArtistPopup.locator(".lastfm-track-panel-cta", { hasText: "Open Album on Last.fm" })).toBeVisible();
  await expect(albumArtShellFromArtistPopup.locator(".lastfm-track-panel-cta", { hasText: "Open Artist on Last.fm" })).toBeVisible();
  await expect(albumArtShellFromArtistPopup.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);

  const albumSourceArtSelector = ".lastfm-media-grid--albums .lastfm-media-button [data-lastfm-art-source]";
  await page.locator(".lastfm-media-grid--albums .lastfm-media-button").first().click();
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "staged");
  await waitForLastFmPanelSourceArtState(page, albumSourceArtSelector, "launching", {
    panelVisibility: "staged",
    ariaHidden: "true"
  });
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await page.waitForTimeout(900);
  await expect(page.locator(albumSourceArtSelector)).toHaveAttribute("data-lastfm-art-source-state", "launching");
  await waitForLastFmPanelSourceArtState(page, albumSourceArtSelector, "retiring", {
    panelVisibility: "visible",
    ariaHidden: "false",
    minWindowOpacity: 0.05
  });
  await expect(page.locator(".lastfm-track-panel-art-launch")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-window:not(.is-loading)")).toHaveCount(1);
  const albumAmbient = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const artEl = document.querySelector(".lastfm-track-panel-art");
    if (!(windowEl instanceof HTMLElement)) {
      return null;
    }
    const before = window.getComputedStyle(windowEl, "::before");
    return {
      hasAmbient: windowEl.getAttribute("data-has-ambient-light"),
      backgroundImage: before.backgroundImage,
      opacity: before.opacity,
      artWidth: artEl instanceof HTMLElement ? artEl.getBoundingClientRect().width : 0,
      artHeight: artEl instanceof HTMLElement ? artEl.getBoundingClientRect().height : 0
    };
  });
  expect(albumAmbient).not.toBeNull();
  expect(albumAmbient.hasAmbient).toBe("true");
  expect(albumAmbient.backgroundImage).toContain("beatopia-detail.jpg");
  expect(Number.parseFloat(albumAmbient.opacity)).toBeGreaterThan(0.2);
  expect(albumAmbient.artWidth).toBeGreaterThanOrEqual(220);
  expect(albumAmbient.artHeight).toBeGreaterThanOrEqual(220);
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  const albumArtHoverBefore = await readLastFmPanelArtHoverState(page);
  await page.locator(".lastfm-track-panel-art").hover();
  await page.waitForFunction(() => {
    const art = document.querySelector(".lastfm-track-panel-art");
    return art instanceof HTMLElement && Number.parseFloat(window.getComputedStyle(art, "::before").opacity) > 0.2;
  });
  const albumArtHoverAfter = await readLastFmPanelArtHoverState(page);
  expect(albumArtHoverBefore).not.toBeNull();
  expect(albumArtHoverAfter).not.toBeNull();
  expect(albumArtHoverBefore.overlayOpacity).toBe("0");
  expect(Number.parseFloat(albumArtHoverAfter.overlayOpacity)).toBeGreaterThan(0.2);
  expect(albumArtHoverAfter.shellTransform).not.toBe(albumArtHoverBefore.shellTransform);
  expect(albumArtHoverAfter.imageTransform).not.toBe(albumArtHoverBefore.imageTransform);
  await page.locator(".lastfm-track-panel-close").hover();
  const albumPanelFit = await page.evaluate(() => {
    const windowEl = document.querySelector(".lastfm-track-panel-window");
    const bodyEl = document.querySelector(".lastfm-track-panel-body");
    return windowEl instanceof HTMLElement ? {
      bodyHeight: bodyEl instanceof HTMLElement ? bodyEl.scrollHeight : 0,
      clientHeight: windowEl.clientHeight,
      overflowY: window.getComputedStyle(windowEl).overflowY
    } : null;
  });
  expect(albumPanelFit).not.toBeNull();
  expect(albumPanelFit.overflowY).toBe("hidden");
  expect(albumPanelFit.bodyHeight).toBeLessThanOrEqual(albumPanelFit.clientHeight + 2);
  const albumSummaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(albumSummaryLink).toBeVisible();
  await albumSummaryLink.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee/Beatopia",
    target: "_blank"
  });
  const directAlbumArtShell = await showLastFmPanelArtActions(page);
  await directAlbumArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open Album on Last.fm" }).click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee/Beatopia",
    target: "_blank"
  });
  await directAlbumArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open Artist on Last.fm" }).click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee",
    target: "_blank"
  });
  await directAlbumArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" }).click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "spotify:track:spotify-talk-1",
    target: "_blank"
  });
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Track list" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-track-item")).toHaveCount(2);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-related-button")).toContainText(["See you Soon", "Cologne"]);
  const headerArtistLink = page.locator(".lastfm-track-panel-meta .lastfm-track-panel-inline-link").first();
  await expect(headerArtistLink).toHaveText("beabadoobee");
  await headerArtistLink.click();
  await expect(page.locator('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-title')).toContainText("beabadoobee");
  await expect.poll(async () => {
    return page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"]').evaluate((scene) => ({
      phase: scene.getAttribute("data-panel-scene-phase"),
      type: scene.getAttribute("data-panel-type")
    }));
  }).toEqual({ phase: "stable", type: "artist" });
  await page.keyboard.press("Escape");
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);

  await page.locator(".lastfm-media-grid--albums .lastfm-media-button").first().click();
  const trackArtistLink = page.locator(".lastfm-track-panel-track-meta .lastfm-track-panel-inline-link").first();
  await expect(trackArtistLink).toHaveText("beabadoobee");
  await trackArtistLink.click();
  await expect(page.locator('[data-lastfm-track-panel-scene-layer="next"] .lastfm-track-panel-title')).toContainText("beabadoobee");
  await expect.poll(async () => {
    return page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"]').evaluate((scene) => ({
      phase: scene.getAttribute("data-panel-scene-phase"),
      type: scene.getAttribute("data-panel-type")
    }));
  }).toEqual({ phase: "stable", type: "artist" });

  expect(apiRequests.some((url) => url.includes("/api/lastfm-artist-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("/api/lastfm-album-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("ws.audioscrobbler.com"))).toBe(false);
});

test("josie escalates stalled panel loads into the hung cat and explosion overlay before closing the panel", async ({ page }) => {
  await stubSpotifyIframeApi(page);

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: { track: [] },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "33",
              url: "https://www.last.fm/music/beabadoobee",
              image: [{ "#text": "https://example.com/bea-grid.jpg", size: "large" }]
            }
          ]
        },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-artist-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee" },
        artist: {
          name: "beabadoobee",
          artworkUrl: "https://example.com/bea-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee",
          summary: "A dreamy indie artist.",
          summaryHasMore: true,
          listeners: 285055,
          playcount: 2740015,
          topTrackCount: 0,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" }
          ]
        },
        topTracks: {
          artist: "beabadoobee",
          items: []
        },
        topAlbums: {
          artist: "beabadoobee",
          items: [
            {
              title: "Beatopia",
              artist: "beabadoobee",
              artworkUrl: "https://example.com/beatopia-detail.jpg",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/Beatopia",
              releasedAt: "15 Jul 2022",
              releaseYear: "2022",
              topTags: [
                { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" }
              ],
              playcount: 1200456,
              listeners: 500123
            }
          ]
        }
      })
    });
  });

  await page.route("**/api/lastfm-album-details**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2600));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", album: "Beatopia" },
        album: {
          title: "Beatopia",
          artist: "beabadoobee",
          artworkUrl: "https://example.com/beatopia-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/Beatopia",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          summary: "A dreamy sophomore album.",
          summaryHasMore: true,
          listeners: 500123,
          playcount: 1200456,
          releasedAt: "15 Jul 2022",
          runtimeMs: 308000,
          runtimeLabel: "5:08",
          trackCount: 2,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" }
          ]
        },
        spotify: {
          matchStatus: "unmatched",
          embedUrl: "",
          openUrl: "",
          searchUrl: "https://open.spotify.com/search/Talk%20beabadoobee",
          previewUrl: "",
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        },
        tracks: {
          items: [
            {
              rank: 1,
              title: "Talk",
              artist: "beabadoobee",
              artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
              durationMs: 144000,
              durationLabel: "2:24",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
              userPlaycount: 9,
              userLoved: true,
              globalPlaycount: 1820011,
              listeners: 942304
            }
          ]
        },
        relatedTracks: {
          artist: "beabadoobee",
          items: []
        }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await setLastFmPanelSceneDebug(page, {
    loadingIntroMs: 220,
    loadingSpinMs: 70,
    hungSpinMs: 160,
    hungAfterSpins: 5,
    explosionAfterHungSpins: 1,
    explosionOverlayMs: 700,
    muteExplosionAudio: true
  });

  await page.locator(".lastfm-media-grid--artists .lastfm-media-button").first().click();
  await expect(page.locator('.lastfm-track-panel-scene[data-panel-scene-state="current"] .lastfm-track-panel-title')).toContainText("beabadoobee");
  await page.locator(".lastfm-track-panel-related-button--album").first().click();

  await page.waitForFunction(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    return currentScene instanceof HTMLElement
      && currentScene.getAttribute("data-panel-scene-loading") === "true"
      && currentScene.getAttribute("data-panel-scene-spin") === "loading-intro";
  });

  const introSpinState = await page.evaluate(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const rotator = currentScene instanceof HTMLElement ? currentScene.querySelector("[data-lastfm-track-panel-scene-rotator]") : null;
    return {
      spinState: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-spin") : "",
      animationName: rotator instanceof HTMLElement ? window.getComputedStyle(rotator).animationName : "",
      animationDuration: rotator instanceof HTMLElement ? window.getComputedStyle(rotator).animationDuration : ""
    };
  });
  expect(introSpinState.spinState).toBe("loading-intro");
  expect(introSpinState.animationName).toContain("lastfmTrackPanelSceneSpinIntro");
  expect(introSpinState.animationDuration).toBe("0.22s");

  await page.waitForFunction(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    return currentScene instanceof HTMLElement
      && currentScene.getAttribute("data-panel-scene-loading") === "true"
      && currentScene.getAttribute("data-panel-scene-spin") === "loading";
  });

  await page.waitForFunction(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    return currentScene instanceof HTMLElement
      && currentScene.getAttribute("data-panel-scene-hang-state") === "hung";
  });

  const hungState = await page.evaluate(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const hungCopy = currentScene instanceof HTMLElement ? currentScene.querySelector(".lastfm-track-panel-scene-back-copy") : null;
    const sadCat = currentScene instanceof HTMLElement ? currentScene.querySelector(".lastfm-track-panel-scene-back-sad-cat") : null;
    const rotator = currentScene instanceof HTMLElement ? currentScene.querySelector("[data-lastfm-track-panel-scene-rotator]") : null;
    return {
      hangState: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-hang-state") : "",
      spinState: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-spin") : "",
      hungCopy: hungCopy instanceof HTMLElement ? hungCopy.textContent.trim() : "",
      hungCopyFontSize: hungCopy instanceof HTMLElement ? window.getComputedStyle(hungCopy).fontSize : "",
      hungCopyFontWeight: hungCopy instanceof HTMLElement ? window.getComputedStyle(hungCopy).fontWeight : "",
      sadCatText: sadCat instanceof HTMLElement ? sadCat.textContent.trim() : "",
      animationDuration: rotator instanceof HTMLElement ? window.getComputedStyle(rotator).animationDuration : ""
    };
  });
  expect(hungState.hangState).toBe("hung");
  expect(hungState.spinState).toBe("hung");
  expect(hungState.hungCopy).toBe("Loading has hung due to an api issue probably :c");
  expect(Number.parseFloat(hungState.hungCopyFontSize)).toBeGreaterThan(28);
  expect(Number.parseFloat(hungState.hungCopyFontWeight)).toBeGreaterThanOrEqual(700);
  expect(hungState.sadCatText.length).toBeGreaterThan(0);
  expect(hungState.animationDuration).toBe("0.16s");

  await page.waitForFunction(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    return currentScene instanceof HTMLElement
      && currentScene.getAttribute("data-panel-scene-explosion-state") === "active";
  });

  const explosionState = await page.evaluate(() => {
    const currentScene = document.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
    const panelRoot = document.querySelector(".lastfm-track-panel");
    const explosionImage = panelRoot instanceof HTMLElement ? panelRoot.querySelector("[data-lastfm-track-panel-explosion-overlay-image]") : null;
    return {
      explosionState: currentScene instanceof HTMLElement ? currentScene.getAttribute("data-panel-scene-explosion-state") : "",
      panelExplosionState: panelRoot instanceof HTMLElement ? panelRoot.getAttribute("data-panel-explosion-state") : "",
      explosionSrc: explosionImage instanceof HTMLImageElement ? explosionImage.getAttribute("src") || "" : "",
      explosionLogCount: Array.isArray(window.__internetAngelLastFmPanelExplosionLog) ? window.__internetAngelLastFmPanelExplosionLog.length : 0,
      imageRendering: explosionImage instanceof HTMLImageElement ? window.getComputedStyle(explosionImage).imageRendering : ""
    };
  });
  expect(explosionState.explosionState).toBe("active");
  expect(explosionState.panelExplosionState).toBe("active");
  expect(explosionState.explosionSrc).toContain("Deltarune_explosion.gif");
  expect(explosionState.explosionLogCount).toBe(1);
  expect(["pixelated", "crisp-edges"]).toContain(explosionState.imageRendering);

  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0, { timeout: 5_000 });
});

test("josie keeps track details on the inline spotify layout when spotify has no preview clip", async ({ page }) => {
  const apiRequests = [];
  page.on("request", (outboundRequest) => {
    const url = outboundRequest.url();
    if (url.startsWith("http://127.0.0.1:8788/api/")) {
      apiRequests.push(url);
    }
  });

  await stubWindowOpen(page);
  await stubSpotifyIframeApi(page);

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: { artist: [] },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", track: "One Time", album: "This Is How Tomorrow Moves" },
        track: {
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          durationMs: 184000,
          durationLabel: "3:04",
          artworkUrl: "https://example.com/one-time-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: 3,
          userLoved: false,
          globalPlaycount: 2740015,
          listeners: 285055,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "matched",
          embedUrl: "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator",
          openUrl: "https://open.spotify.com/track/spotify-track-1",
          searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
          previewUrl: "",
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          artworkUrl: "https://i.scdn.co/image/one-time.jpg"
        },
        scrobbles: { total: 3, items: [] },
        artistTopTracks: { artist: "beabadoobee", items: [] }
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });

  await page.locator(".lastfm-recent-button").first().click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(0);
  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  const noPreviewArtShell = await showLastFmPanelArtActions(page);
  await expect(noPreviewArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" })).toBeVisible();
  await page.evaluate(() => window.__emitSpotifyIframeEvent?.(0, "playback_started", { data: { isPaused: false } }));
  await expect(page.locator("[data-shuffle-player].is-playing")).toHaveCount(0);
  await page.evaluate(() => window.__emitSpotifyIframeEvent?.(0, "playback_update", { data: { isPaused: true } }));
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 10_000 });
  await noPreviewArtShell.locator(".lastfm-track-panel-cta", { hasText: "Open in Spotify" }).click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  const windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "spotify:track:spotify-track-1",
    target: "_blank"
  });

  expect(apiRequests.some((url) => url.includes("/api/lastfm-track-details"))).toBe(true);
  expect(apiRequests.some((url) => url.includes("api.spotify.com"))).toBe(false);
});

test("josie shows a Last.fm-only compact mobile showcase and opens track details", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = String(query || "");
      if (media === "(pointer: coarse)" || media === "(hover: none)") {
        return {
          matches: true,
          media,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          }
        };
      }
      return originalMatchMedia(query);
    };
  });

  const apiRequests = [];
  page.on("request", (outboundRequest) => {
    const url = outboundRequest.url();
    if (url.startsWith("http://127.0.0.1:8788/api/")) {
      apiRequests.push(url);
    }
  });

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [{ "#text": "https://example.com/one-time-grid.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "128",
              image: [{ "#text": "https://example.com/artist-1.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee"
            },
            {
              name: "Slow Pulp",
              playcount: "96",
              image: [{ "#text": "https://example.com/artist-2.jpg", size: "large" }],
              url: "https://www.last.fm/music/Slow+Pulp"
            },
            {
              name: "Wisp",
              playcount: "74",
              image: [{ "#text": "https://example.com/artist-3.jpg", size: "large" }],
              url: "https://www.last.fm/music/Wisp"
            }
          ]
        },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", track: "One Time", album: "This Is How Tomorrow Moves" },
        track: {
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          durationMs: 184000,
          durationLabel: "3:04",
          artworkUrl: "https://example.com/one-time-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: 3,
          userLoved: false,
          globalPlaycount: 2740015,
          listeners: 285055,
          summary: "",
          publishedAt: null,
          topTags: []
        },
        spotify: {
          matchStatus: "unavailable",
          embedUrl: "",
          openUrl: "",
          searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
          previewUrl: "",
          title: "",
          artist: "",
          album: "",
          artworkUrl: ""
        },
        scrobbles: { total: 3, items: [] },
        artistTopTracks: { artist: "beabadoobee", items: [] }
      })
    });
  });

  await page.goto("/josie.html");
  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true", { timeout: 30_000 });
  await expect.poll(() => apiRequests.some((url) => url.includes("/api/lastfm")), { timeout: 10_000 }).toBe(true);
  await page.waitForSelector(".steam-sidebar-list--mobile-icons");
  await expect(page.locator(".steam-sidebar-list--mobile-icons")).toHaveAttribute("data-mobile-links-reveal", /pending|visible/);
  await page.waitForFunction(() => {
    const row = document.querySelector(".steam-sidebar-list--mobile-icons");
    return row instanceof HTMLElement && row.dataset.mobileLinksReveal === "visible";
  });

  await expect(page.locator("#social-hub-showcases")).toHaveClass(/social-hub-showcases--mobile-lastfm/);
  await expect(page.locator("#social-hub-showcases .steam-showcase")).toHaveCount(1);
  await expect(page.locator("#social-hub-showcases .steam-showcase--lastfm-mobile")).toHaveCount(1);
  await expect(page.locator("#social-hub-showcases [data-mobile-lastfm-dropdown]")).toHaveCount(2);
  await expect(page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown][data-mobile-lastfm-dropdown-key="recent-tracks"]')).toHaveAttribute("data-mobile-lastfm-dropdown-open", "false");
  await expect(page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown][data-mobile-lastfm-dropdown-key="top-artists"]')).toHaveAttribute("data-mobile-lastfm-dropdown-open", "false");
  await expect(page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown-summary][data-mobile-lastfm-dropdown-key="recent-tracks"]')).toBeVisible();
  await expect(page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown-summary][data-mobile-lastfm-dropdown-key="top-artists"]')).toBeVisible();
  await expect(page.locator("#social-hub-showcases .lastfm-mobile-dropdown-summary-meta")).toHaveCount(0);
  await expect(page.locator("#social-hub-showcases .lastfm-section-title").first()).toHaveText("Recent Tracks");
  await expect(page.locator("#social-hub-showcases .lastfm-section-title", { hasText: "Top Artists" })).toBeVisible();
  await expect(page.locator("#social-hub-showcases .lastfm-section-title", { hasText: "Top Albums" })).toHaveCount(0);
  await expect(page.locator("#social-hub-showcases .lastfm-profile-total")).toHaveCount(0);
  await expect(page.locator("#social-hub-showcases .lastfm-media-grid--artists .lastfm-media-button")).toHaveCount(3);
  const mobileDropdownStyles = await page.evaluate(() => {
    const recentDropdown = document.querySelector('#social-hub-showcases [data-mobile-lastfm-dropdown][data-mobile-lastfm-dropdown-key="recent-tracks"]');
    const topArtistsDropdown = document.querySelector('#social-hub-showcases [data-mobile-lastfm-dropdown][data-mobile-lastfm-dropdown-key="top-artists"]');
    const discordCard = document.querySelector(".discord-presence-card--foundlifeless");
    const readStyles = (node) => {
      if (!(node instanceof HTMLElement)) return null;
      const styles = window.getComputedStyle(node);
      return {
        borderRadius: styles.borderRadius,
        backgroundColor: styles.backgroundColor,
        borderTopWidth: styles.borderTopWidth
      };
    };
    return {
      recent: readStyles(recentDropdown),
      topArtists: readStyles(topArtistsDropdown),
      discord: readStyles(discordCard)
    };
  });
  expect(mobileDropdownStyles.recent).not.toBeNull();
  expect(mobileDropdownStyles.topArtists).not.toBeNull();
  expect(mobileDropdownStyles.discord).not.toBeNull();
  expect(mobileDropdownStyles.recent.borderRadius).toBe(mobileDropdownStyles.discord.borderRadius);
  expect(mobileDropdownStyles.topArtists.borderRadius).toBe(mobileDropdownStyles.discord.borderRadius);
  expect(mobileDropdownStyles.recent.backgroundColor).toBe(mobileDropdownStyles.discord.backgroundColor);
  expect(mobileDropdownStyles.topArtists.backgroundColor).toBe(mobileDropdownStyles.discord.backgroundColor);
  expect(mobileDropdownStyles.recent.borderTopWidth).toBe(mobileDropdownStyles.discord.borderTopWidth);
  expect(mobileDropdownStyles.topArtists.borderTopWidth).toBe(mobileDropdownStyles.discord.borderTopWidth);
  const mobileShowcasePosition = await page.evaluate(() => {
    const iconRow = document.querySelector(".steam-sidebar-list--mobile-icons");
    const currentPlaying = document.querySelector("#social-hub-sidebar .steam-sidebar-currently-playing-panel--minimal");
    const showcase = document.querySelector("#social-hub-showcases");
    const stage = document.querySelector("#os-stage");
    if (!(iconRow instanceof HTMLElement) || !(showcase instanceof HTMLElement)) {
      return null;
    }
    const iconRowRect = iconRow.getBoundingClientRect();
    const currentPlayingRect = currentPlaying instanceof HTMLElement ? currentPlaying.getBoundingClientRect() : null;
    const showcaseRect = showcase.getBoundingClientRect();
    const anchorBottom = currentPlayingRect ? currentPlayingRect.bottom : iconRowRect.bottom;
    return {
      gap: showcaseRect.top - anchorBottom,
      iconGap: currentPlayingRect ? currentPlayingRect.top - iconRowRect.bottom : showcaseRect.top - iconRowRect.bottom,
      stageClientHeight: stage instanceof HTMLElement ? stage.clientHeight : 0,
      stageScrollHeight: stage instanceof HTMLElement ? stage.scrollHeight : 0,
      stageOverflowY: stage instanceof HTMLElement ? window.getComputedStyle(stage).overflowY : ""
    };
  });
  expect(mobileShowcasePosition).not.toBeNull();
  expect(mobileShowcasePosition.gap).toBeGreaterThanOrEqual(0);
  expect(mobileShowcasePosition.gap).toBeLessThanOrEqual(110);
  expect(mobileShowcasePosition.iconGap).toBeGreaterThanOrEqual(0);
  expect(mobileShowcasePosition.stageScrollHeight).toBeGreaterThan(mobileShowcasePosition.stageClientHeight);
  expect(["auto", "scroll"]).toContain(mobileShowcasePosition.stageOverflowY);

  const stageScrollResult = await page.evaluate(() => {
    const stage = document.querySelector("#os-stage");
    if (!(stage instanceof HTMLElement)) {
      return null;
    }
    const before = stage.scrollTop;
    stage.scrollTop = Math.min(160, Math.max(0, stage.scrollHeight - stage.clientHeight));
    return {
      before,
      after: stage.scrollTop
    };
  });
  expect(stageScrollResult).not.toBeNull();
  expect(stageScrollResult.after).toBeGreaterThan(stageScrollResult.before);

  await page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown-summary][data-mobile-lastfm-dropdown-key="top-artists"]').click();
  await expect(page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown][data-mobile-lastfm-dropdown-key="top-artists"]')).toHaveAttribute("data-mobile-lastfm-dropdown-open", "true");
  await page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown-summary][data-mobile-lastfm-dropdown-key="recent-tracks"]').click();
  await expect(page.locator('#social-hub-showcases [data-mobile-lastfm-dropdown][data-mobile-lastfm-dropdown-key="recent-tracks"]')).toHaveAttribute("data-mobile-lastfm-dropdown-open", "true");
  const mobileRevealOrder = await page.evaluate(() => {
    const readItems = (selector) => Array.from(document.querySelectorAll(selector)).map((node) => {
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      const animation = node.getAnimations().map((entry) => entry.effect?.getTiming?.()).find((timing) => timing && typeof timing.delay === "number");
      return {
        top: rect.top,
        left: rect.left,
        delay: Number(animation?.delay ?? 0)
      };
    }).filter(Boolean);
    return {
      recent: readItems('#social-hub-showcases [data-mobile-lastfm-dropdown-key="recent-tracks"] .lastfm-recent-item'),
      artists: readItems('#social-hub-showcases [data-mobile-lastfm-dropdown-key="top-artists"] .lastfm-media-item')
    };
  });
  for (const group of [mobileRevealOrder.recent, mobileRevealOrder.artists]) {
    expect(group.length).toBeGreaterThan(0);
    const sorted = [...group].sort((left, right) => {
      const topDelta = left.top - right.top;
      if (Math.abs(topDelta) > 4) {
        return topDelta;
      }
      return left.left - right.left;
    });
    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].delay).toBeGreaterThanOrEqual(sorted[index - 1].delay);
    }
  }
  await page.locator("#social-hub-showcases .lastfm-recent-button").first().click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect.poll(() => apiRequests.some((url) => url.includes("/api/lastfm-track-details")), { timeout: 10_000 }).toBe(true);
});

test("josie stacks the compact mobile track panel cleanly and plays the Spotify preview clip", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      const media = String(query || "");
      if (media === "(pointer: coarse)" || media === "(hover: none)") {
        return {
          matches: true,
          media,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent() {
            return false;
          }
        };
      }
      return originalMatchMedia(query);
    };

    const NativeAudio = window.Audio;
    window.Audio = function(...args) {
      const audio = new NativeAudio(...args);
      let paused = true;
      let ended = false;
      let currentTime = 0;
      let duration = 30;
      Object.defineProperty(audio, "paused", {
        configurable: true,
        get() {
          return paused;
        }
      });
      Object.defineProperty(audio, "ended", {
        configurable: true,
        get() {
          return ended;
        }
      });
      Object.defineProperty(audio, "currentTime", {
        configurable: true,
        get() {
          return currentTime;
        },
        set(value) {
          currentTime = Number(value) || 0;
          audio.dispatchEvent(new Event("timeupdate"));
        }
      });
      Object.defineProperty(audio, "duration", {
        configurable: true,
        get() {
          return duration;
        }
      });
      audio.load = () => {
        paused = true;
        ended = false;
        currentTime = 0;
        duration = 30;
        audio.dispatchEvent(new Event("loadedmetadata"));
        audio.dispatchEvent(new Event("durationchange"));
        audio.dispatchEvent(new Event("timeupdate"));
      };
      audio.play = () => {
        paused = false;
        ended = false;
        audio.dispatchEvent(new Event("play"));
        audio.dispatchEvent(new Event("timeupdate"));
        return Promise.resolve();
      };
      audio.pause = () => {
        const wasPaused = paused;
        paused = true;
        if (!wasPaused) {
          audio.dispatchEvent(new Event("pause"));
        }
      };
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
  });

  const apiRequests = [];
  page.on("request", (outboundRequest) => {
    const url = outboundRequest.url();
    if (url.startsWith("http://127.0.0.1:8788/api/")) {
      apiRequests.push(url);
    }
  });

  await page.route("**/api/lastfm", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        recenttracks: {
          track: [
            {
              name: "One Time",
              artist: { name: "beabadoobee" },
              album: { "#text": "This Is How Tomorrow Moves" },
              image: [{ "#text": "https://example.com/one-time-grid.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee/_/One+Time",
              date: { uts: String(Math.floor(Date.now() / 1000) - 3600) }
            }
          ]
        },
        topartists: {
          artist: [
            {
              name: "beabadoobee",
              playcount: "128",
              image: [{ "#text": "https://example.com/artist-1.jpg", size: "large" }],
              url: "https://www.last.fm/music/beabadoobee"
            }
          ]
        },
        topalbums: { album: [] },
        toptracks: { track: [] },
        user: { playcount: "65188", artist_count: "1234" },
        lovedtracks: { "@attr": { total: "1197" } },
        discovery: { referenceTrack: null },
        nowPlaying: { nowPlaying: false, stale: false, fetchedAt: new Date().toISOString(), track: null }
      })
    });
  });

  await page.route("**/api/lastfm-track-details**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: new Date().toISOString(),
        query: { artist: "beabadoobee", track: "One Time", album: "This Is How Tomorrow Moves" },
        track: {
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          durationMs: 184000,
          durationLabel: "3:04",
          artworkUrl: "https://example.com/one-time-detail.jpg",
          lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time",
          artistLastFmUrl: "https://www.last.fm/music/beabadoobee",
          userPlaycount: 3,
          userLoved: false,
          globalPlaycount: 2740015,
          listeners: 285055,
          summary: "A bright and clipped single.",
          summaryHasMore: true,
          publishedAt: null,
          topTags: [
            { name: "indie pop", url: "https://www.last.fm/tag/indie+pop" }
          ]
        },
        spotify: {
          matchStatus: "matched",
          embedUrl: "https://open.spotify.com/embed/track/spotify-track-1?utm_source=generator",
          openUrl: "https://open.spotify.com/track/spotify-track-1",
          searchUrl: "https://open.spotify.com/search/One%20Time%20beabadoobee",
          previewUrl: "https://p.scdn.co/mp3-preview/one-time-preview.mp3",
          title: "One Time",
          artist: "beabadoobee",
          album: "This Is How Tomorrow Moves",
          artworkUrl: "https://i.scdn.co/image/one-time.jpg"
        },
        scrobbles: {
          total: 3,
          items: [
            {
              playedAtIso: "2026-03-23T07:21:00.000Z",
              playedAtLabel: "23 Mar 2026, 07:21",
              album: "This Is How Tomorrow Moves"
            }
          ]
        },
        artistTopTracks: {
          artist: "beabadoobee",
          items: [
            {
              title: "Talk",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Talk",
              userPlaycount: 9,
              userLoved: true,
              globalPlaycount: 1820011,
              listeners: 942304
            }
          ]
        }
      })
    });
  });

  await page.goto("/josie.html");
  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true", { timeout: 30_000 });
  await expect.poll(() => apiRequests.some((url) => url.includes("/api/lastfm")), { timeout: 10_000 }).toBe(true);

  await page.locator("#social-hub-showcases .lastfm-recent-button").first().click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect.poll(() => apiRequests.some((url) => url.includes("/api/lastfm-track-details")), { timeout: 10_000 }).toBe(true);
  await expect(page.locator(".lastfm-track-panel-window--mobile")).toHaveCount(1);
  await expect(page.locator("[data-track-preview-player]")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(0);

  const mobilePanelMetrics = await page.evaluate(() => {
    const panelWindow = document.querySelector(".lastfm-track-panel-window");
    const art = document.querySelector(".lastfm-track-panel-art");
    const header = document.querySelector(".lastfm-track-panel-header");
    const title = document.querySelector(".lastfm-track-panel-title");
    const preview = document.querySelector("[data-track-preview-player]");
    if (!(panelWindow instanceof HTMLElement) || !(art instanceof HTMLElement) || !(header instanceof HTMLElement) || !(title instanceof HTMLElement) || !(preview instanceof HTMLElement)) {
      return null;
    }
    const artRect = art.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    return {
      overflowY: window.getComputedStyle(panelWindow).overflowY,
      scrollWidth: panelWindow.scrollWidth,
      clientWidth: panelWindow.clientWidth,
      headerBelowArt: headerRect.top >= artRect.bottom - 1,
      titleSize: Number.parseFloat(window.getComputedStyle(title).fontSize) || 0,
      previewWidth: previewRect.width
    };
  });
  expect(mobilePanelMetrics).not.toBeNull();
  expect(mobilePanelMetrics.overflowY).toBe("auto");
  expect(mobilePanelMetrics.scrollWidth).toBeLessThanOrEqual(mobilePanelMetrics.clientWidth + 1);
  expect(mobilePanelMetrics.headerBelowArt).toBe(true);
  expect(mobilePanelMetrics.titleSize).toBeLessThan(50);
  expect(mobilePanelMetrics.previewWidth).toBeGreaterThan(240);

  const previewPlayer = page.locator("[data-track-preview-player]");
  await previewPlayer.locator("[data-track-preview-toggle]").click();
  await expect(previewPlayer).toHaveAttribute("data-track-preview-state", "playing");
  await expect(previewPlayer).toHaveClass(/is-playing/);
  await previewPlayer.locator("[data-track-preview-volume]").evaluate((input) => {
    input.value = "0.65";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => previewPlayer.getAttribute("data-track-preview-volume-value")).toBe("0.65");

  await page.locator(".lastfm-track-panel-related").scrollIntoViewIfNeeded();
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "My recent plays" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "From beabadoobee" })).toBeVisible();
});
