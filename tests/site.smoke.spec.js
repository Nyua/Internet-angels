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

async function waitForLastFmPanelSourceArtStateCleared(page, sourceSelector, options = {}) {
  await page.waitForFunction((selector) => {
    const source = document.querySelector(selector);
    return source instanceof HTMLElement && !source.hasAttribute("data-lastfm-art-source-state");
  }, sourceSelector, { timeout: options.timeout ?? 8_000 });
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

async function installGraphicsAccelerationOverride(page, override = {}) {
  await page.addInitScript((nextOverride) => {
    window.__internetAngelGraphicsAccelerationOverride = {
      accelerated: nextOverride?.accelerated !== false,
      reason: String(nextOverride?.reason || ""),
      renderer: String(nextOverride?.renderer || ""),
      vendor: String(nextOverride?.vendor || "")
    };
  }, override);
}

async function installWindowFocusOverride(page) {
  await page.addInitScript(() => {
    const originalHasFocus = Document.prototype.hasFocus;
    window.__codexWindowFocusState = true;
    Document.prototype.hasFocus = function hasFocusOverride() {
      if (typeof window.__codexWindowFocusState === "boolean") {
        return window.__codexWindowFocusState;
      }
      return originalHasFocus.call(this);
    };
    window.__setCodexWindowFocus = (nextFocus) => {
      window.__codexWindowFocusState = Boolean(nextFocus);
      window.dispatchEvent(new Event(nextFocus ? "focus" : "blur"));
      document.dispatchEvent(new Event("visibilitychange"));
    };
  });
}

async function installShuffleAudioMock(page, options = {}) {
  await page.addInitScript((nextOptions) => {
    const NativeAudio = window.Audio;
    const missingPathTokens = Array.isArray(nextOptions?.missingPathTokens)
      ? nextOptions.missingPathTokens.map((token) => String(token || "")).filter(Boolean)
      : [];
    window.Audio = function(...args) {
      const audio = new NativeAudio(...args);
      let paused = true;
      let ended = false;
      let currentTime = 0;
      let duration = 30;
      let assignedSrc = "";
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
      Object.defineProperty(audio, "src", {
        configurable: true,
        get() {
          return assignedSrc;
        },
        set(value) {
          assignedSrc = String(value || "");
        }
      });
      Object.defineProperty(audio, "currentSrc", {
        configurable: true,
        get() {
          return assignedSrc;
        }
      });
      audio.load = () => {
        paused = true;
        ended = false;
        currentTime = 0;
        duration = 30;
        const source = String(assignedSrc || "");
        window.setTimeout(() => {
          if (missingPathTokens.some((token) => source.includes(token))) {
            audio.dispatchEvent(new Event("error"));
            return;
          }
          audio.dispatchEvent(new Event("loadedmetadata"));
          audio.dispatchEvent(new Event("durationchange"));
          audio.dispatchEvent(new Event("loadeddata"));
          audio.dispatchEvent(new Event("timeupdate"));
        }, 0);
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
  }, options);
}

async function readFirstSelectableShuffleTrack(page) {
  return page.evaluate(async () => {
    try {
      const response = await fetch("/assets/shuffle-manifest.json", { cache: "no-store" });
      if (!response.ok) return null;
      const data = await response.json();
      const track = (Array.isArray(data?.tracks) ? data.tracks : []).find((entry) => Number(entry?.segmentIndex || 0) === 0);
      if (!track) return null;
      return {
        title: String(track.displayTitle || track.title || "").trim(),
        artist: String(track.displayArtist || track.artist || "").trim()
      };
    } catch {
      return null;
    }
  });
}

test.beforeEach(async ({ page }) => {
  await setDesktopPerformanceOverride(page, "full");
  await installShuffleAudioMock(page);
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

  await expect.poll(async () => page.locator("#introVideo").evaluate((node) => ({
    paused: node.paused,
    muted: node.muted
  }))).toEqual({ paused: true, muted: true });
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

test("root hard-fallbacks to josie when handoff readiness stalls past the boot timeout", async ({ page }) => {
  await page.addInitScript(() => {
    window.__internetAngelBootTimeoutMs = 250;
  });
  await page.route(/\/josie(?:\.html)?\?handoff=1$/, async (route) => {
    await route.abort();
  });

  await page.goto("/");
  await page.locator("#introStartButton").click();
  await expect(page).toHaveURL(/\/josie$/, { timeout: 5_000 });
  await expect(page).toHaveTitle(/Josie/);
});

test("josie clears the site-load curtain when bootstrap stalls", async ({ page }) => {
  await page.addInitScript(() => {
    window.__internetAngelBootTimeoutMs = 250;
  });
  await page.route(/\/josie\.client\.js(?:\?.*)?$/, async (route) => {
    await route.abort();
  });

  await page.goto("/josie.html");
  await expect.poll(async () => page.evaluate(() => ({
    siteLoadPlaying: document.body?.classList.contains("site-load-playing") ?? false,
    siteLoadComplete: Boolean(window.__amesSiteLoadComplete),
    siteLoadFallback: document.body?.dataset?.siteLoadFallback || ""
  })), { timeout: 5_000 }).toMatchObject({
    siteLoadPlaying: false,
    siteLoadComplete: true
  });
  const stalledState = await page.evaluate(() => ({
    siteLoadPlaying: document.body?.classList.contains("site-load-playing") ?? false,
    siteLoadComplete: Boolean(window.__amesSiteLoadComplete),
    siteLoadFallback: document.body?.dataset?.siteLoadFallback || ""
  }));
  expect(["error", "timeout"]).toContain(stalledState.siteLoadFallback);
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

test("desktop BloomToDeath ignores the deprecated degraded performance override", async ({ page }) => {
  await setDesktopPerformanceOverride(page, "degraded");
  await page.goto("/");
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");
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

test("desktop Josie ignores the deprecated degraded performance override and keeps full rendering", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await setDesktopPerformanceOverride(page, "degraded");
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  const expectedTrack = await readFirstSelectableShuffleTrack(page);

  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");
  await expect(page.locator(".os-ambient-backdrop")).toHaveAttribute("data-ambient-motion", "running");
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-visualizer-mode", "full");

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
  expect(degradedCursorState.degraded).toBe(false);
  expect(degradedCursorState.trailDisplay).not.toBe("none");

  await clearInteractionSfxLog(page);
  await page.locator("[data-mobile-speaker-toggle]").click();
  await waitForInteractionSfx(page, { soundId: "toggle_soft", source: "mobileSpeakerToggle", ownerMode: "top", page: "josie" });
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  const degradedVisualizerState = await page.evaluate(() => {
    const layer = document.querySelector("#os-shuffle-visualizer-layer");
    const title = document.querySelector("[data-shuffle-title]");
    const artist = document.querySelector("[data-shuffle-artist]");
    const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
    const readAlpha = () => {
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return 0;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    };
    return {
      layerMode: layer instanceof HTMLElement ? layer.getAttribute("data-visualizer-mode") : "",
      wavePortal: document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-bleed-layer") instanceof HTMLElement,
      waveCanvas: canvas instanceof HTMLCanvasElement,
      regionAlpha: readAlpha(),
      title: title?.textContent?.trim() || "",
      artist: artist?.textContent?.trim() || ""
    };
  });
  expect(degradedVisualizerState.layerMode).toBe("full");
  expect(degradedVisualizerState.wavePortal).toBe(true);
  expect(degradedVisualizerState.waveCanvas).toBe(true);
  expect(degradedVisualizerState.regionAlpha).toBeGreaterThan(0);
  expect(degradedVisualizerState.title).toBe(expectedTrack?.title || "");
  expect(degradedVisualizerState.artist).toBe(expectedTrack?.artist || "");
});

test("desktop Josie optimizes rendering only when graphics acceleration is unavailable", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await installGraphicsAccelerationOverride(page, {
    accelerated: false,
    reason: "software-renderer",
    renderer: "ANGLE (Google, SwiftShader)",
    vendor: "Google Inc. (Google)"
  });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "degraded");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "software-renderer");
  await expect(page.locator("body")).toHaveAttribute("data-graphics-acceleration", "software");
  await expect(page.locator(".os-ambient-backdrop")).toHaveAttribute("data-ambient-motion", "frozen");
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-visualizer-mode", "degraded");
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-shuffle-device-profile", "software-desktop");

  await page.locator(".steam-sidebar-link").first().hover();
  const softwareCursorState = await page.evaluate(() => {
    const cursor = document.querySelector(".site-pointer");
    const trailCanvas = document.querySelector(".site-pointer-trail-canvas");
    return {
      degraded: cursor instanceof HTMLElement ? cursor.classList.contains("is-degraded") : null,
      trailDisplay: trailCanvas instanceof HTMLCanvasElement ? window.getComputedStyle(trailCanvas).display : ""
    };
  });
  expect(softwareCursorState.degraded).toBe(true);
  expect(softwareCursorState.trailDisplay).toBe("none");

  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  const softwareVisualizerState = await page.evaluate(() => {
    const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
    const rect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
    const performanceState = window.__internetAngelPerformanceState?.getState?.() || null;
    return {
      canvasProfile: canvas instanceof HTMLCanvasElement ? canvas.getAttribute("data-shuffle-device-profile") || "" : "",
      canvasDpr: canvas instanceof HTMLCanvasElement && rect && rect.width > 0 ? canvas.width / rect.width : 0,
      performanceState
    };
  });
  expect(softwareVisualizerState.canvasProfile).toBe("software-desktop");
  expect(softwareVisualizerState.canvasDpr).toBeLessThanOrEqual(1.05);
  expect(softwareVisualizerState.performanceState?.tier).toBe("degraded");
  expect(softwareVisualizerState.performanceState?.graphicsAcceleration).toBe("software");
  expect(softwareVisualizerState.performanceState?.graphicsRenderer).toContain("SwiftShader");
});

test("desktop Josie ignores legacy frame-budget downgrade requests", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");
  await page.evaluate(() => {
    const badWindow = Array.from({ length: 80 }, () => 45);
    window.__internetAngelPerformanceState?.__debugPushFrameDeltas?.([...badWindow, ...badWindow]);
  });
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");

  await page.evaluate(() => {
    const healthyWindow = Array.from({ length: 220 }, () => 16);
    window.__internetAngelPerformanceState?.__debugPushFrameDeltas?.(healthyWindow);
  });
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
});

test("desktop Josie no longer background-throttles rendering when the window loses focus", async ({ page }) => {
  await installWindowFocusOverride(page);
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");

  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return 0;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(0);

  await page.evaluate(() => {
    window.__setCodexWindowFocus?.(false);
  });
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");
  await expect(page.locator(".os-ambient-backdrop")).toHaveAttribute("data-ambient-motion", "running");
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-visualizer-mode", "full");
  const backgroundState = await page.evaluate(() => {
    const performanceState = window.__internetAngelPerformanceState?.getState?.() || null;
    const portal = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-bleed-layer");
    return {
      performanceState,
      portalHidden: portal instanceof HTMLElement ? portal.hidden : null
    };
  });
  expect(backgroundState.performanceState?.backgroundThrottled).toBe(false);

  await page.evaluate(() => {
    window.__setCodexWindowFocus?.(true);
  });
  await expect(page.locator("body")).toHaveAttribute("data-performance-tier", "full");
  await expect(page.locator("body")).toHaveAttribute("data-performance-reason", "disabled");
  await expect(page.locator(".os-ambient-backdrop")).toHaveAttribute("data-ambient-motion", "running");
  const resumedState = await page.evaluate(() => ({
    performanceState: window.__internetAngelPerformanceState?.getState?.() || null,
    layerMode: (() => {
      const layer = document.querySelector("#os-shuffle-visualizer-layer");
      return layer instanceof HTMLElement ? layer.getAttribute("data-visualizer-mode") || "" : "";
    })(),
    portalHidden: (() => {
      const portal = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-bleed-layer");
      return portal instanceof HTMLElement ? portal.hidden : null;
    })()
  }));
  expect(resumedState.performanceState?.backgroundThrottled).toBe(false);
  expect(resumedState.layerMode).toBe("full");
});

test("josie keeps the desktop shuffle visualizer as a full-width ascii waveform layer", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get: () => 2
    });
  });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return 0;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(0);
  const visualizerLayout = await page.evaluate(() => {
    const layer = document.querySelector("#os-shuffle-visualizer-layer");
    const surface = document.querySelector("#os-shuffle-visualizer-surface");
    const portal = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-bleed-layer");
    const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
    const copy = document.querySelector("#os-shuffle-visualizer-copy");
    const rectOf = (node) => node instanceof HTMLElement ? node.getBoundingClientRect() : null;
    const styleOf = (node) => node instanceof HTMLElement ? window.getComputedStyle(node) : null;
    const canvasRegionAlpha = () => {
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return null;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    };
    return {
      pointerEvents: styleOf(layer)?.pointerEvents || "",
      portalOpacity: Number.parseFloat(styleOf(portal)?.opacity || "0"),
      surfaceVisualStyle: surface instanceof HTMLElement ? surface.getAttribute("data-shuffle-visual-style") || "" : "",
      surfaceAsciiOverlay: surface instanceof HTMLElement ? surface.getAttribute("data-shuffle-ascii-overlay") || "" : "",
      canvasVisualStyle: canvas instanceof HTMLCanvasElement ? canvas.getAttribute("data-shuffle-visual-style") || "" : "",
      canvasAsciiOverlay: canvas instanceof HTMLCanvasElement ? canvas.getAttribute("data-shuffle-ascii-overlay") || "" : "",
      canvasImageRendering: canvas instanceof HTMLCanvasElement ? window.getComputedStyle(canvas).imageRendering : "",
      canvasFilter: canvas instanceof HTMLCanvasElement ? window.getComputedStyle(canvas).filter : "",
      canvasDpr: canvas instanceof HTMLCanvasElement && canvas.getBoundingClientRect().width > 0
        ? canvas.width / canvas.getBoundingClientRect().width
        : 0,
      surfaceRect: rectOf(surface),
      canvasRect: rectOf(canvas),
      copyRect: rectOf(copy),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      regionAlpha: canvasRegionAlpha()
    };
  });

  expect(visualizerLayout.pointerEvents).toBe("none");
  expect(visualizerLayout.portalOpacity).toBeGreaterThanOrEqual(0.55);
  expect(visualizerLayout.surfaceVisualStyle).toBe("ascii");
  expect(visualizerLayout.surfaceAsciiOverlay).toBe("glyph");
  expect(visualizerLayout.canvasVisualStyle).toBe("ascii");
  expect(visualizerLayout.canvasAsciiOverlay).toBe("glyph");
  expect(["pixelated", "crisp-edges"]).toContain(visualizerLayout.canvasImageRendering);
  expect(visualizerLayout.canvasFilter).toBe("none");
  expect(visualizerLayout.canvasDpr).toBeLessThanOrEqual(1.35);
  expect(Math.round(visualizerLayout.surfaceRect.width)).toBe(visualizerLayout.viewportWidth);
  expect(visualizerLayout.surfaceRect.height).toBeGreaterThanOrEqual(224);
  expect(Math.abs(visualizerLayout.surfaceRect.bottom - visualizerLayout.viewportHeight)).toBeLessThanOrEqual(1);
  expect(Math.round(visualizerLayout.canvasRect.width)).toBe(visualizerLayout.viewportWidth);
  expect(Math.abs(visualizerLayout.copyRect.left - visualizerLayout.surfaceRect.left)).toBeLessThanOrEqual(24);
  expect(Math.abs(visualizerLayout.copyRect.top - visualizerLayout.surfaceRect.top)).toBeLessThanOrEqual(24);
  expect(visualizerLayout.regionAlpha).toBeGreaterThan(0);
});

test("josie exposes a keyboard skip link into the social hub", async ({ page }) => {
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await expect(page.locator(".skip-link")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#social-hub-root$/);
});

test("josie keeps the fullscreen visualizer open while the angel link text expands", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const surface = document.getElementById("os-shuffle-visualizer-surface");
    surface?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  });
  await expect(page.locator("body")).toHaveAttribute("data-visualizer-focus-mode", "active");
  await expect(page.locator("#os-shuffle-visualizer-angel-link")).toHaveText("Internet-Angel.net");

  await page.locator("#os-shuffle-visualizer-angel-link").click();
  await expect(page.locator("body")).toHaveAttribute("data-visualizer-focus-mode", "active");
  await expect(page.locator("#os-shuffle-visualizer-angel-link")).toHaveText("A place where I spend my time making random stuff waiting for my partner to wake up :3");
  await expect(page.locator("#os-shuffle-visualizer-angel-link")).toHaveAttribute("data-angel-link-expanded", "true");

  await page.mouse.click(24, 24);
  await expect(page.locator("body")).toHaveAttribute("data-visualizer-focus-mode", "idle");
});

test("josie skips a missing shuffle file and falls through to another available song", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await installShuffleAudioMock(page, {
    missingPathTokens: ["missing-track.mp3"]
  });
  await page.route(/\/assets\/shuffle-manifest\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracks: [
          {
            id: "missing-track",
            groupId: "missing-track",
            title: "Missing Song",
            displayTitle: "Missing Song",
            artist: "Broken Artist",
            displayArtist: "Broken Artist",
            path: "/Shuffle/missing-track.mp3",
            addedAt: "2026-04-23T02:00:00.000Z",
            segmentIndex: 0,
            segmentCount: 1,
            segmentStart: 0,
            segmentOffset: 0
          },
          {
            id: "working-track",
            groupId: "working-track",
            title: "Working Song",
            displayTitle: "Working Song",
            artist: "Working Artist",
            displayArtist: "Working Artist",
            path: "/Shuffle/working-track.mp3",
            addedAt: "2026-04-22T02:00:00.000Z",
            segmentIndex: 0,
            segmentCount: 1,
            segmentStart: 0,
            segmentOffset: 0
          }
        ]
      })
    });
  });

  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.waitForFunction(() => {
    const track = window.__internetAngelShuffleDebug?.getTrack?.();
    const state = window.__internetAngelShuffleDebug?.getState?.();
    return track?.id === "working-track"
      && state?.hasTrack === true
      && state?.playing === true
      && state?.title === "Working Song";
  }, null, { timeout: 15_000 });

  const recoveredState = await page.evaluate(() => ({
    track: window.__internetAngelShuffleDebug?.getTrack?.() || null,
    state: window.__internetAngelShuffleDebug?.getState?.() || null
  }));
  expect(recoveredState.track?.id).toBe("working-track");
  expect(recoveredState.track?.title).toBe("Working Song");
  expect(recoveredState.track?.artist).toBe("Working Artist");
  expect(recoveredState.state?.hasTrack).toBe(true);
  expect(recoveredState.state?.playing).toBe(true);
  expect(recoveredState.state?.title).toBe("Working Song");
});

test("josie shifts the visualizer into panel mode while a Last.fm details card is open", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  await page.locator(".lastfm-recent-button").first().click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator("body")).toHaveClass(/lastfm-track-panel-open/);
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-visualizer-mode", "panel");

  await page.locator(".lastfm-track-panel-close").click();
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);
  await expect(page.locator("#os-shuffle-visualizer-layer")).toHaveAttribute("data-visualizer-mode", "full");
});
test("josie hands segmented shuffle tracks across the midpoint without resetting visible playback", async ({ page }) => {
  await mockClientTime(page, { year: 2026, monthIndex: 2, day: 25, hour: 22 });
  await installShuffleAudioMock(page);
  await page.route(/\/assets\/shuffle-manifest\.json(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tracks: [
          {
            id: "segment-track-part-1",
            groupId: "segment-track",
            title: "Segment Track",
            displayTitle: "Segment Track",
            artist: "Segment Artist",
            displayArtist: "Segment Artist",
            path: "/Shuffle/segment-track-part-1.mp3",
            addedAt: "2026-04-23T02:00:00.000Z",
            segmentIndex: 0,
            segmentCount: 2,
            segmentStart: 0,
            segmentOffset: 0,
            groupDuration: 1678,
            nextTrackId: "segment-track-part-2"
          },
          {
            id: "segment-track-part-2",
            groupId: "segment-track",
            title: "Segment Track",
            displayTitle: "Segment Track",
            artist: "Segment Artist",
            displayArtist: "Segment Artist",
            path: "/Shuffle/segment-track-part-2.mp3",
            addedAt: "2026-04-23T02:00:00.000Z",
            segmentIndex: 1,
            segmentCount: 2,
            segmentStart: 0,
            segmentOffset: 932,
            groupDuration: 1678
          }
        ]
      })
    });
  });
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });

  await page.locator("[data-mobile-speaker-toggle]").click();
  await expect(page.locator("[data-shuffle-player].is-playing").first()).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => window.__internetAngelShuffleDebug?.getTrack?.()?.segmentIndex === 0, null, { timeout: 15_000 });

  const firstSegment = await page.evaluate(() => {
    return {
      track: window.__internetAngelShuffleDebug?.getTrack?.(),
      state: window.__internetAngelShuffleDebug?.getState?.()
    };
  });
  expect(firstSegment.track?.segmentCount).toBe(2);
  expect(firstSegment.state?.title).toBe("Segment Track");
  expect(firstSegment.state?.artist).toBe("Segment Artist");
  expect(firstSegment.state?.duration).toBeCloseTo(1678, 0);

  await page.evaluate(() => window.__internetAngelShuffleDebug?.advanceSegment?.());

  await expect.poll(async () => {
    const track = await page.evaluate(() => window.__internetAngelShuffleDebug?.getTrack?.());
    return track?.segmentIndex ?? -1;
  }, { timeout: 5_000 }).toBe(1);

  const secondSegment = await page.evaluate(() => {
    return {
      track: window.__internetAngelShuffleDebug?.getTrack?.(),
      state: window.__internetAngelShuffleDebug?.getState?.()
    };
  });
  expect(secondSegment.track?.segmentOffset).toBeCloseTo(932, 0);
  expect(secondSegment.state?.title).toBe("Segment Track");
  expect(secondSegment.state?.artist).toBe("Segment Artist");
  expect(secondSegment.state?.duration).toBeCloseTo(1678, 0);
  expect(secondSegment.state?.currentTime).toBeGreaterThan(931);
  expect(secondSegment.state?.progress).toBeGreaterThan(0.49);
});

test("josie retries Last.fm and Steam boot APIs after first-load failures", async ({ page }) => {
  await page.addInitScript(() => {
    window.__internetAngelApiBootRetryDelaysMs = [50, 100, 150];
  });

  let lastfmRequests = 0;
  let steamRequests = 0;
  const nowIso = new Date().toISOString();
  const recentUts = String(Math.floor(Date.now() / 1000) - 120);

  await page.route("**/api/discord", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        data: {
          discord_user: {
            id: "331350000154050560",
            username: "foundlifeless",
            display_name: "foundlifeless"
          },
          discord_status: "online",
          activities: []
        }
      })
    });
  });

  await page.route("**/api/lastfm", async (route) => {
    lastfmRequests += 1;
    if (lastfmRequests === 1) {
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated cold-start timeout", sourceStatus: "FAILED" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: nowIso,
        user: {
          name: "FoundLifeless",
          realname: "FoundLifeless",
          playcount: "12345",
          artist_count: "321",
          image: []
        },
        lovedtracks: {
          "@attr": { total: "77" }
        },
        recenttracks: {
          track: [
            {
              name: "Retry Song",
              artist: { name: "Retry Artist" },
              album: { "#text": "Retry Album" },
              image: [],
              date: { uts: recentUts, "#text": "2 minutes ago" },
              url: "https://www.last.fm/music/Retry+Artist/_/Retry+Song",
              userloved: "1"
            }
          ]
        },
        topalbums: {
          album: [
            {
              name: "Retry Album",
              artist: { name: "Retry Artist" },
              playcount: "42",
              image: [],
              url: "https://www.last.fm/music/Retry+Artist/Retry+Album"
            }
          ]
        },
        topartists: {
          artist: [
            {
              name: "Retry Artist",
              playcount: "99",
              image: [],
              url: "https://www.last.fm/music/Retry+Artist"
            }
          ]
        },
        nowPlaying: null,
        discovery: null
      })
    });
  });

  await page.route("**/api/steam-recent-activity", async (route) => {
    steamRequests += 1;
    if (steamRequests === 1) {
      await route.fulfill({
        status: 504,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated cold-start timeout", sourceStatus: "FAILED" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sourceStatus: "OK",
        stale: false,
        fetchedAt: nowIso,
        profile: {
          name: "FoundLifeless",
          handle: "steamcommunity.com/id/foundlifeless",
          url: "https://steamcommunity.com/id/foundlifeless/",
          statusText: "Online"
        },
        stats: [
          { label: "2W Hours", value: "12.3 hours" },
          { label: "Recent Games", value: "1" }
        ],
        items: [
          {
            id: "retry-game",
            title: "Retry Game",
            meta: "12.3 hrs past 2 weeks",
            url: "https://store.steampowered.com/app/123456/Retry_Game/",
            artworkUrl: "",
            hoursOnRecord: "99 hrs on record",
            lastPlayed: "Played today"
          }
        ]
      })
    });
  });

  await page.goto("/josie.html");
  await expect(page.locator("#social-hub-root")).toHaveAttribute("data-social-hub-ready", "true", {
    timeout: 30_000
  });

  await expect.poll(() => lastfmRequests, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => steamRequests, { timeout: 5_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".lastfm-recent-title").first()).toHaveText("Retry Song", { timeout: 5_000 });
  await expect(page.locator(".steam-activity-game-title").first()).toHaveText("Retry Game", { timeout: 5_000 });
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
  const expectedTrack = await readFirstSelectableShuffleTrack(page);
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

  const readDesktopSpotifyIcon = async () => page.locator(".steam-sidebar-row--spotify .steam-sidebar-site-icon").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    const colorChannels = (styles.color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const shell = node.closest(".steam-sidebar-site-icon-shell");
    const shellBefore = shell instanceof Element ? window.getComputedStyle(shell, "::before") : null;
    const shellAfter = shell instanceof Element ? window.getComputedStyle(shell, "::after") : null;
    return {
      color: styles.color,
      colorChannels,
      filter: styles.filter,
      shellBeforeContent: shellBefore?.content || "",
      shellBeforeBoxShadow: shellBefore?.boxShadow || "",
      shellAfterContent: shellAfter?.content || "",
      shellAfterBoxShadow: shellAfter?.boxShadow || ""
    };
  });
  await page.mouse.move(4, 4);
  await expect.poll(async () => (await readDesktopSpotifyIcon()).colorChannels[0], { timeout: 1_000 }).toBeGreaterThanOrEqual(240);
  const desktopSpotifyIconResting = await readDesktopSpotifyIcon();
  expect(desktopSpotifyIconResting.colorChannels[0]).toBeGreaterThanOrEqual(240);
  expect(desktopSpotifyIconResting.colorChannels[1]).toBeGreaterThanOrEqual(240);
  expect(desktopSpotifyIconResting.colorChannels[2]).toBeGreaterThanOrEqual(240);
  expect(desktopSpotifyIconResting.filter).toContain("drop-shadow");
  await page.locator(".steam-sidebar-row--spotify").hover();
  await expect.poll(async () => (await readDesktopSpotifyIcon()).color, { timeout: 1_000 }).toBe("rgb(155, 241, 191)");
  const desktopSpotifyIconHover = await readDesktopSpotifyIcon();
  expect(desktopSpotifyIconHover.filter).toContain("drop-shadow");
  expect(desktopSpotifyIconHover.shellBeforeContent).toBe("none");
  expect(desktopSpotifyIconHover.shellBeforeBoxShadow).toBe("none");
  expect(desktopSpotifyIconHover.shellAfterContent).toBe("none");
  expect(desktopSpotifyIconHover.shellAfterBoxShadow).toBe("none");

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
  expect(initialAudioControlWidth).toBeLessThanOrEqual(90);
  await audioControl.hover();
  await expect.poll(async () => audioControl.evaluate((node) => node.getBoundingClientRect().width), { timeout: 2_000 }).toBeGreaterThan(190);
  await page.locator("[data-site-volume-slider]").evaluate((node) => {
    if (!(node instanceof HTMLInputElement)) return;
    node.value = "42";
    node.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("[data-mobile-speaker-toggle]")).toHaveAttribute("data-audio-volume", "0.42");
  await page.mouse.move(420, 420);
  await expect.poll(async () => audioControl.evaluate((node) => node.getBoundingClientRect().width), { timeout: 2_500 }).toBeLessThanOrEqual(90);
  await page.locator("[data-mobile-speaker-toggle]").click();
  await waitForInteractionSfx(page, { soundId: "toggle_soft", source: "mobileSpeakerToggle", ownerMode: "top", page: "josie" });
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement
      && button.dataset.audioHasTrack === "true"
      && button.dataset.audioPlaying === "true";
  });
  await expect(page.locator("[data-site-video-toggle]")).toBeVisible();
  await page.locator("[data-site-video-toggle]").click({ force: true });
  await page.waitForFunction(() => {
    const layer = document.querySelector("#shuffle-video-background");
    const video = document.querySelector("[data-shuffle-background-video]");
    return document.body.classList.contains("shuffle-video-background-active")
      && layer instanceof HTMLElement
      && video instanceof HTMLVideoElement
      && video.preload === "auto"
      && (video.currentSrc || video.src).includes("/Shuffle/");
  });
  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return 0;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(0);
  const videoBackgroundState = await page.evaluate(() => {
    const layer = document.querySelector("#shuffle-video-background");
    const frame = document.querySelector(".social-hub-scale-frame");
    const showcases = document.querySelector("#social-hub-showcases");
    const showcase = document.querySelector("#social-hub-showcases > .steam-showcase");
    const video = document.querySelector("[data-shuffle-background-video]");
    const grain = layer instanceof HTMLElement ? window.getComputedStyle(layer, "::after") : null;
    const frameStyles = frame instanceof HTMLElement ? window.getComputedStyle(frame) : null;
    const showcaseStyles = showcase instanceof HTMLElement ? window.getComputedStyle(showcase) : null;
    const showcasesStyles = showcases instanceof HTMLElement ? window.getComputedStyle(showcases) : null;
    return {
      videoSrc: video instanceof HTMLVideoElement ? video.currentSrc || video.src : "",
      videoPreload: video instanceof HTMLVideoElement ? video.preload : "",
      grainImage: grain?.backgroundImage || "",
      grainSize: grain?.backgroundSize || "",
      frameBackdrop: frameStyles?.backdropFilter || frameStyles?.webkitBackdropFilter || "",
      showcaseBackdrop: showcaseStyles?.backdropFilter || showcaseStyles?.webkitBackdropFilter || "",
      showcaseRadius: showcaseStyles?.borderRadius || "",
      showcaseClipPath: showcaseStyles?.clipPath || "",
      showcasesGap: Number.parseFloat(showcasesStyles?.gap || "0")
    };
  });
  expect(videoBackgroundState.videoSrc).toContain("/Shuffle/");
  expect(videoBackgroundState.videoPreload).toBe("auto");
  expect(videoBackgroundState.grainImage).toContain("svg");
  expect(videoBackgroundState.grainSize).not.toBe("auto");
  expect(videoBackgroundState.frameBackdrop.toLowerCase()).not.toContain("blur");
  expect(videoBackgroundState.showcaseBackdrop.toLowerCase()).toContain("blur");
  expect(videoBackgroundState.showcaseRadius).toBe("2px");
  expect(videoBackgroundState.showcaseClipPath).toContain("round 2px");
  expect(videoBackgroundState.showcasesGap).toBeGreaterThanOrEqual(20);
  await page.locator("[data-site-video-toggle]").click({ force: true });
  await expect(page.locator("body")).not.toHaveClass(/shuffle-video-background-active/);
  await expect(page.locator("#os-shuffle-visualizer-title")).toHaveText(expectedTrack?.title || "");
  await expect(page.locator("#os-shuffle-visualizer-artist")).toHaveText(expectedTrack?.artist || "");
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-panel][data-sidebar-shuffle-mode='desktop']")).toHaveCount(1);
  const desktopCurrentlyPlayingLayout = await page.evaluate(() => {
    const panel = document.querySelector("#social-hub-sidebar [data-sidebar-shuffle-panel][data-sidebar-shuffle-mode='desktop']");
    const shell = panel?.closest(".steam-sidebar-panel");
    const title = panel?.querySelector("[data-sidebar-shuffle-title]");
    const artist = panel?.querySelector("[data-sidebar-shuffle-artist]");
    const timeRow = panel?.querySelector(".steam-sidebar-currently-playing-time");
    const thumb = panel?.querySelector("[data-sidebar-shuffle-progress-thumb]");
    const progressTrack = panel?.querySelector("[data-sidebar-shuffle-progress-track]");
    const progressFill = panel?.querySelector("[data-sidebar-shuffle-progress-fill]");
    const readPx = (node) => node instanceof HTMLElement ? Number.parseFloat(window.getComputedStyle(node).fontSize || "0") : 0;
    const readBoxPx = (node, property) => node instanceof HTMLElement ? Number.parseFloat(window.getComputedStyle(node)[property] || "0") : 0;
    const readStyleValue = (node, property) => node instanceof HTMLElement ? String(window.getComputedStyle(node)[property] || "") : "";
    return {
      labelCount: panel instanceof HTMLElement ? panel.querySelectorAll(".steam-sidebar-currently-playing-label").length : 0,
      titleFontSize: readPx(title),
      artistFontSize: readPx(artist),
      timeFontSize: readPx(timeRow),
      thumbVisible: thumb instanceof HTMLElement && Number.parseFloat(window.getComputedStyle(thumb).opacity || "0") > 0.9,
      thumbWidth: readBoxPx(thumb, "width"),
      trackHeight: readBoxPx(progressTrack, "height"),
      trackBoxShadow: readStyleValue(progressTrack, "boxShadow"),
      fillBoxShadow: readStyleValue(progressFill, "boxShadow"),
      thumbBoxShadow: readStyleValue(thumb, "boxShadow"),
      panelBottomLeftRadius: readBoxPx(panel, "borderBottomLeftRadius"),
      shellBottomLeftRadius: readBoxPx(shell, "borderBottomLeftRadius"),
      shellOverflow: shell instanceof HTMLElement ? window.getComputedStyle(shell).overflow : "",
      panelClipPath: panel instanceof HTMLElement ? window.getComputedStyle(panel).clipPath : "",
      shellClipPath: shell instanceof HTMLElement ? window.getComputedStyle(shell).clipPath : ""
    };
  });
  expect(desktopCurrentlyPlayingLayout.labelCount).toBe(0);
  expect(desktopCurrentlyPlayingLayout.titleFontSize).toBeGreaterThanOrEqual(26);
  expect(desktopCurrentlyPlayingLayout.artistFontSize).toBeGreaterThanOrEqual(11);
  expect(desktopCurrentlyPlayingLayout.timeFontSize).toBeGreaterThanOrEqual(10);
  expect(desktopCurrentlyPlayingLayout.thumbVisible).toBe(true);
  expect(desktopCurrentlyPlayingLayout.thumbWidth).toBeGreaterThanOrEqual(7.5);
  expect(desktopCurrentlyPlayingLayout.trackHeight).toBeGreaterThanOrEqual(3.5);
  expect(desktopCurrentlyPlayingLayout.trackBoxShadow).toContain("rgba(255, 255, 255");
  expect(desktopCurrentlyPlayingLayout.fillBoxShadow).toContain("rgba(255, 255, 255");
  expect(desktopCurrentlyPlayingLayout.thumbBoxShadow).toContain("rgba(255, 255, 255");
  expect(desktopCurrentlyPlayingLayout.thumbBoxShadow).not.toContain("rgba(6, 10, 18");
  expect(desktopCurrentlyPlayingLayout.panelBottomLeftRadius).toBe(0);
  expect(desktopCurrentlyPlayingLayout.shellBottomLeftRadius).toBe(0);
  expect(desktopCurrentlyPlayingLayout.shellOverflow).toBe("visible");
  expect(desktopCurrentlyPlayingLayout.panelClipPath).not.toContain("round");
  expect(desktopCurrentlyPlayingLayout.shellClipPath).toBe("none");
  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return 0;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(0);
  await page.waitForFunction(() => {
    const copy = document.querySelector("#social-hub-sidebar [data-sidebar-shuffle-panel][data-sidebar-shuffle-mode='desktop'] .steam-sidebar-currently-playing-copy");
    if (!(copy instanceof HTMLElement)) return false;
    return copy.dataset.shuffleCopyState === "visible"
      && Number.parseFloat(window.getComputedStyle(copy).opacity || "0") > 0.85;
  });
  await page.waitForFunction(() => {
    const copy = document.querySelector("#social-hub-sidebar [data-sidebar-shuffle-panel][data-sidebar-shuffle-mode='desktop'] .steam-sidebar-currently-playing-copy");
    if (!(copy instanceof HTMLElement)) return false;
    const styles = window.getComputedStyle(copy);
    return copy.dataset.shuffleCopyState === "visible"
      && Number.parseFloat(styles.opacity || "0") > 0.85
      && ["none", "blur(0px)"].includes(styles.filter);
  }, null, { timeout: 7000 });
  const firstVisualizerTrackState = await page.evaluate(async () => {
    const title = document.querySelector("#os-shuffle-visualizer-title");
    let selectableQueueCount = 0;
    try {
      const response = await fetch("/assets/shuffle-manifest.json", { cache: "no-store" });
      const data = response.ok ? await response.json() : null;
      const selectableQueueIds = new Set(
        (Array.isArray(data?.tracks) ? data.tracks : [])
          .filter((track) => Number(track?.segmentIndex || 0) === 0)
          .map((track) => String(track?.groupId || track?.id || track?.path || "").trim())
          .filter(Boolean)
      );
      selectableQueueCount = selectableQueueIds.size;
    } catch {
      selectableQueueCount = 0;
    }
    return {
      title: title instanceof HTMLElement ? title.textContent.trim() : "",
      trackId: window.__internetAngelShuffleDebug?.getTrack?.()?.id || "",
      selectableQueueCount
    };
  });
  await page.evaluate(() => window.__internetAngelShuffleDebug?.advanceTrack?.());
  if (firstVisualizerTrackState.selectableQueueCount > 1) {
    await page.waitForFunction((previousTitle) => {
      const title = document.querySelector("#os-shuffle-visualizer-title");
      const copy = document.querySelector("#social-hub-sidebar [data-sidebar-shuffle-panel][data-sidebar-shuffle-mode='desktop'] .steam-sidebar-currently-playing-copy");
      if (!(title instanceof HTMLElement) || !(copy instanceof HTMLElement)) return false;
      return title.textContent.trim() !== previousTitle
        && copy.dataset.shuffleCopyState === "visible"
        && Number.parseFloat(window.getComputedStyle(copy).opacity || "0") > 0.85;
    }, firstVisualizerTrackState.title);
  } else {
    await page.waitForFunction((baseline) => {
      const title = document.querySelector("#os-shuffle-visualizer-title");
      const currentTrackId = window.__internetAngelShuffleDebug?.getTrack?.()?.id || "";
      return title instanceof HTMLElement
        && title.textContent.trim() === baseline.title
        && currentTrackId === baseline.trackId;
    }, firstVisualizerTrackState);
  }
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-panel][data-sidebar-shuffle-mode='desktop']")).toHaveCount(1);
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
  const heroDecorationLayering = await page.evaluate(() => {
    const leftRail = document.querySelector("#social-hub-left-rail");
    const profile = document.querySelector("#social-hub-profile");
    const showcases = document.querySelector("#social-hub-showcases");
    const wrap = document.querySelector("#social-hub-profile .steam-hero-avatar-wrap");
    const avatar = document.querySelector("#social-hub-profile .steam-hero-avatar");
    const decoration = document.querySelector("#social-hub-profile .steam-hero-avatar-decoration");
    if (
      !(leftRail instanceof HTMLElement)
      || !(profile instanceof HTMLElement)
      || !(showcases instanceof HTMLElement)
      || !(wrap instanceof HTMLElement)
      || !(avatar instanceof HTMLElement)
      || !(decoration instanceof HTMLElement)
    ) {
      return null;
    }
    const zIndexNumber = (element) => {
      const value = Number.parseInt(window.getComputedStyle(element).zIndex, 10);
      return Number.isFinite(value) ? value : 0;
    };
    return {
      leftRailZ: zIndexNumber(leftRail),
      profileZ: zIndexNumber(profile),
      showcasesZ: zIndexNumber(showcases),
      wrapZ: zIndexNumber(wrap),
      avatarZ: zIndexNumber(avatar),
      decorationZ: zIndexNumber(decoration)
    };
  });
  expect(heroDecorationLayering).not.toBeNull();
  expect(heroDecorationLayering.leftRailZ).toBeGreaterThan(heroDecorationLayering.showcasesZ);
  expect(heroDecorationLayering.profileZ).toBeGreaterThan(heroDecorationLayering.showcasesZ);
  expect(heroDecorationLayering.wrapZ).toBeGreaterThan(heroDecorationLayering.avatarZ);
  expect(heroDecorationLayering.decorationZ).toBeGreaterThan(heroDecorationLayering.wrapZ);
  const profileDecorationScrollGuard = await page.evaluate(async () => {
    const stage = document.querySelector("#os-stage");
    const decoration = document.querySelector("#social-hub-profile .steam-hero-avatar-decoration");
    if (!(stage instanceof HTMLElement && decoration instanceof HTMLElement)) return null;
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const readShift = () => window.getComputedStyle(decoration).getPropertyValue("--steam-avatar-decoration-scroll-y").trim();
    stage.scrollTop = 0;
    window.scrollTo(0, 0);
    stage.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    await waitFrame();
    const initialShift = readShift();
    const scrollTop = Math.min(160, Math.max(0, stage.scrollHeight - stage.clientHeight));
    if (scrollTop > 0) {
      stage.scrollTop = scrollTop;
      stage.dispatchEvent(new Event("scroll", { bubbles: true }));
    } else {
      window.scrollTo(0, 80);
      window.dispatchEvent(new Event("scroll"));
    }
    await waitFrame();
    const shiftedScrollTop = Math.max(stage.scrollTop, window.scrollY || 0);
    const shiftedShift = readShift();
    const activeAfterScroll = document.body.classList.contains("steam-profile-decoration-scroll-guard");
    stage.scrollTop = 0;
    window.scrollTo(0, 0);
    stage.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.dispatchEvent(new Event("scroll"));
    await waitFrame();
    return {
      initialShift,
      shiftedScrollTop,
      shiftedShift,
      activeAfterScroll,
      restoredShift: readShift(),
      activeAfterRestore: document.body.classList.contains("steam-profile-decoration-scroll-guard")
    };
  });
  expect(profileDecorationScrollGuard).not.toBeNull();
  expect(profileDecorationScrollGuard.shiftedScrollTop).toBeGreaterThan(6);
  expect(profileDecorationScrollGuard.initialShift).toBe("0px");
  expect(profileDecorationScrollGuard.activeAfterScroll).toBe(true);
  expect(profileDecorationScrollGuard.shiftedShift).toBe("22px");
  expect(profileDecorationScrollGuard.activeAfterRestore).toBe(false);
  expect(profileDecorationScrollGuard.restoredShift).toBe("0px");
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
    const canvasRegionAlpha = () => {
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return null;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
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
      portalOpacity: Number.parseFloat(styleOf(portal)?.opacity || "0"),
      surfaceVisualStyle: surface instanceof HTMLElement ? surface.getAttribute("data-shuffle-visual-style") || "" : "",
      canvasVisualStyle: canvas instanceof HTMLCanvasElement ? canvas.getAttribute("data-shuffle-visual-style") || "" : "",
      canvasImageRendering: canvas instanceof HTMLCanvasElement ? window.getComputedStyle(canvas).imageRendering : "",
      canvasFilter: canvas instanceof HTMLCanvasElement ? window.getComputedStyle(canvas).filter : "",
      surfaceRect: initialSurfaceRect,
      canvasRect: initialCanvasRect,
      copyRect: rectOf(copy),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      firstShowcaseTitle: firstShowcaseTitle instanceof HTMLElement ? firstShowcaseTitle.textContent.trim() : "",
      regionAlpha: canvasRegionAlpha(),
      scrolledSurfaceTop: scrolledSurfaceRect?.top ?? null,
      scrolledCanvasTop: scrolledCanvasRect?.top ?? null
    };
  });
  expect(visualizerLayout.pointerEvents).toBe("none");
  expect(visualizerLayout.portalOpacity).toBeGreaterThanOrEqual(0.55);
  expect(visualizerLayout.surfaceVisualStyle).toBe("ascii");
  expect(visualizerLayout.canvasVisualStyle).toBe("ascii");
  expect(["pixelated", "crisp-edges"]).toContain(visualizerLayout.canvasImageRendering);
  expect(visualizerLayout.canvasFilter).toBe("none");
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
  expect(visualizerLayout.regionAlpha).toBeGreaterThan(0);
  const topArtistImageUrls = await page.locator(".lastfm-media-grid--artists .lastfm-media-image").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") || ""));
  expect(topArtistImageUrls.some((url) => url && !url.includes("2a96cbd8b46e442fc41c2b86b821562f"))).toBe(true);
  const imageLoadingHints = await page.evaluate(() => {
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name) || "";
    return {
      heroAvatarLoading: attr(".steam-hero-avatar", "loading"),
      heroAvatarPriority: attr(".steam-hero-avatar", "fetchpriority"),
      recentLoadings: Array.from(document.querySelectorAll("img.lastfm-recent-image")).map((node) => node.getAttribute("loading") || ""),
      mediaLoadings: Array.from(document.querySelectorAll("img.lastfm-media-image")).map((node) => node.getAttribute("loading") || "")
    };
  });
  expect(imageLoadingHints.heroAvatarLoading).toBe("eager");
  expect(imageLoadingHints.heroAvatarPriority).toBe("high");
  expect(imageLoadingHints.recentLoadings[0]).toBe("eager");
  if (imageLoadingHints.recentLoadings.length > 3) {
    expect(imageLoadingHints.recentLoadings.slice(3).every((loading) => loading === "lazy")).toBe(true);
  }
  expect(imageLoadingHints.mediaLoadings.length).toBeGreaterThan(0);
  expect(imageLoadingHints.mediaLoadings.every((loading) => loading === "lazy")).toBe(true);
  const smallCopyStyles = await page.locator(".steam-sidebar-row-title").first().evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      color: styles.color
    };
  });
  expect(smallCopyStyles.color).toBe("rgb(240, 144, 194)");
  const firstProfileLinkWeight = await page.locator(".steam-sidebar-link").first().evaluate((node) => window.getComputedStyle(node).fontWeight);
  expect(Number.parseInt(firstProfileLinkWeight, 10)).toBeGreaterThanOrEqual(700);
  const firstProfileLinkHitTarget = await page.locator(".steam-sidebar-link").first().evaluate((node) => {
    const link = node instanceof HTMLElement ? node : null;
    const shell = link?.closest(".steam-sidebar-link-shell");
    return {
      linkPointerEvents: link ? window.getComputedStyle(link).pointerEvents : "",
      shellPointerEvents: shell instanceof HTMLElement ? window.getComputedStyle(shell).pointerEvents : "",
      linkTouchAction: link ? window.getComputedStyle(link).touchAction : ""
    };
  });
  expect(firstProfileLinkHitTarget.linkPointerEvents).toBe("auto");
  expect(firstProfileLinkHitTarget.shellPointerEvents).toBe("none");
  expect(firstProfileLinkHitTarget.linkTouchAction).toBe("manipulation");
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
  expect(apiRequests).toContain("/api/lastfm-track-details");

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

test("josie animates the Angels footer dagger on click", async ({ page }) => {
  await page.goto("/josie.html");
  await page.waitForSelector("#social-hub-root[data-social-hub-ready='true']", { timeout: 30_000 });
  await page.evaluate(() => {
    window.__angelsFooterCollisionEvents = [];
    window.addEventListener("internet-angel:angels-footer-collision", (event) => {
      window.__angelsFooterCollisionEvents.push(event.detail);
    });
  });

  const angelsFooter = page.locator("[data-angels-footer]");
  const angelsTrigger = page.locator("[data-angels-footer-trigger]");
  const angelsDagger = page.locator(".lastfm-angel-dagger");
  await angelsTrigger.scrollIntoViewIfNeeded();
  await expect(angelsFooter).toHaveAttribute("data-angels-dagger-state", "idle");
  await expect(angelsDagger).toBeHidden();
  await expect(angelsTrigger).toHaveText("Internet-angel.net");
  await angelsTrigger.hover();
  await expect(angelsDagger).toBeVisible();
  const daggerHoverMetrics = await page.evaluate(() => {
    const trigger = document.querySelector("[data-angels-footer-trigger]");
    const dagger = document.querySelector(".lastfm-angel-dagger");
    const connectors = document.querySelector(".lastfm-angel-dagger-connectors");
    const frontPlane = document.querySelector(".lastfm-angel-dagger-plane--front");
    if (!(trigger instanceof HTMLElement) || !(dagger instanceof HTMLElement) || !(connectors instanceof HTMLElement) || !(frontPlane instanceof HTMLElement)) {
      return null;
    }
    const triggerRect = trigger.getBoundingClientRect();
    const daggerRect = dagger.getBoundingClientRect();
    const connectorsStyle = window.getComputedStyle(connectors);
    const planeStyle = window.getComputedStyle(frontPlane);
    return {
      gap: Math.round(triggerRect.left - daggerRect.right),
      connectorsDisplay: connectorsStyle.display,
      backgroundImage: planeStyle.backgroundImage
    };
  });
  expect(daggerHoverMetrics).not.toBeNull();
  expect(daggerHoverMetrics.gap).toBeGreaterThanOrEqual(12);
  expect(daggerHoverMetrics.connectorsDisplay).toBe("none");
  expect(daggerHoverMetrics.backgroundImage).toBe("none");
  await angelsTrigger.click();
  await expect(angelsFooter).toHaveAttribute("data-angels-dagger-state", "lunging");
  await expect.poll(async () => page.evaluate(() => window.__angelsFooterCollisionEvents.length), { timeout: 2_000 }).toBe(1);
  const collisionEvent = await page.evaluate(() => window.__angelsFooterCollisionEvents[0]);
  expect(collisionEvent).toMatchObject({
    label: "Internet-angel.net",
    source: "angelsFooter",
    collisionTarget: "first-letter",
    destinationUrl: ""
  });
  await expect.poll(() => angelsFooter.getAttribute("data-angels-dagger-state"), { timeout: 2_000 }).toBe("idle");
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
  expect(cursorStateAfterSteamHover.ringOpacity).toBeGreaterThan(0.7);
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
  expect(lightContrastState.mode).toBe("dark");
  expect(lightContrastState.stroke).toBe("rgb(16, 16, 18)");

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
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      get() {
        return 3;
      }
    });
  });
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
  const expectedTrack = await readFirstSelectableShuffleTrack(page);

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
  await expect(page.locator(".steam-sidebar-link--icon-only")).toHaveCount(5);
  await expect(page.locator(".steam-sidebar-link--icon-only").nth(0)).toHaveAttribute("data-mobile-site-id", "soundcloud");
  await expect(page.locator(".steam-sidebar-link--icon-only").nth(1)).toHaveAttribute("data-mobile-site-id", "spotify");
  await expect(page.locator(".steam-sidebar-link--icon-only").nth(2)).toHaveAttribute("data-mobile-site-id", "discord");
  await expect(page.locator('.steam-sidebar-link--icon-only[data-mobile-site-id="lastfm"]')).toHaveCount(0);
  await expect(page.locator("#social-hub-showcases")).toBeHidden();
  await expect(page.locator("#social-hub-showcases")).not.toHaveClass(/social-hub-showcases--mobile-lastfm/);
  await expect(page.locator("#social-hub-showcases .steam-showcase--lastfm-mobile")).toHaveCount(0);
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
  expect(new Set(mobileAuraVariables).size).toBe(5);
  await expect(page.locator(".discord-presence-card--foundlifeless")).toBeVisible();
  await expect(page.locator(".cinna-mobile-gif--canvas")).toBeVisible();
  await expect(page.locator("#os-shuffle-visualizer-layer")).toBeVisible();
  await expect(page.locator(".cinna-mobile-gif[hidden]")).toBeHidden();
  await expect(page.locator(".cinna-mobile-gif:visible")).toHaveCount(1);
  await page.locator("[data-mobile-speaker-toggle]").click();
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-mobile-speaker-toggle]");
    return button instanceof HTMLElement && button.dataset.audioHasTrack === "true" && button.dataset.audioPlaying === "true";
  });
  await expect(page.locator("#social-hub-sidebar .steam-sidebar-currently-playing-panel--minimal")).toBeVisible();
  await expect(page.locator("#social-hub-sidebar .steam-sidebar-currently-playing-label")).toHaveText("Currently playing");
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-title]")).toHaveText(expectedTrack?.title || "");
  await expect(page.locator("#social-hub-sidebar [data-sidebar-shuffle-artist]")).toHaveText(expectedTrack?.artist || "");
  await expect.poll(async () => {
    return page.evaluate(() => {
      const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
      if (!(canvas instanceof HTMLCanvasElement)) return 0;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!(ctx instanceof CanvasRenderingContext2D)) return 0;
      const sampleArea = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let alpha = 0;
      for (let index = 3; index < sampleArea.length; index += 4) {
        alpha = Math.max(alpha, sampleArea[index]);
      }
      return alpha;
    });
  }, { timeout: 5_000 }).toBeGreaterThan(0);
  const mobileVisualizerProfile = await page.evaluate(() => {
    const layer = document.querySelector("#os-shuffle-visualizer-layer");
    const surface = document.querySelector("#os-shuffle-visualizer-surface");
    const canvas = document.querySelector("#os-shuffle-visualizer-layer .josie-audio-player-wave");
    const surfaceRect = surface instanceof HTMLElement ? surface.getBoundingClientRect() : null;
    const canvasRect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
    return {
      layerProfile: layer instanceof HTMLElement ? layer.getAttribute("data-shuffle-device-profile") || "" : "",
      surfaceProfile: surface instanceof HTMLElement ? surface.getAttribute("data-shuffle-device-profile") || "" : "",
      canvasProfile: canvas instanceof HTMLCanvasElement ? canvas.getAttribute("data-shuffle-device-profile") || "" : "",
      surfaceWidth: surfaceRect?.width || 0,
      surfaceHeight: surfaceRect?.height || 0,
      canvasWidth: canvasRect?.width || 0,
      canvasHeight: canvasRect?.height || 0,
      viewportWidth: window.innerWidth,
      canvasDpr: canvas instanceof HTMLCanvasElement && canvasRect && canvasRect.width > 0 ? canvas.width / canvasRect.width : 0
    };
  });
  expect(mobileVisualizerProfile.layerProfile).toBe("touch-mobile");
  expect(mobileVisualizerProfile.surfaceProfile).toBe("touch-mobile");
  expect(mobileVisualizerProfile.canvasProfile).toBe("touch-mobile");
  expect(Math.round(mobileVisualizerProfile.surfaceWidth)).toBe(mobileVisualizerProfile.viewportWidth);
  expect(Math.round(mobileVisualizerProfile.canvasWidth)).toBe(mobileVisualizerProfile.viewportWidth);
  expect(mobileVisualizerProfile.surfaceHeight).toBeGreaterThanOrEqual(208);
  expect(mobileVisualizerProfile.canvasHeight).toBeGreaterThanOrEqual(208);
  expect(mobileVisualizerProfile.canvasDpr).toBeLessThanOrEqual(1.35);
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
    && window.__codexExternalLaunchLog.some((entry) => /open|replace|href/.test(entry.type) && /soundcloud|spotify|discord|steamcommunity|x\.com|twitter/i.test(entry.url || "")));
  const iconLaunchState = await page.evaluate(() => ({
    baseline: window.__codexExternalLaunchBaseline || 0,
    log: window.__codexExternalLaunchLog.slice()
  }));
  const iconLaunchEvent = iconLaunchState.log.find((entry) => /open|replace|href/.test(entry.type) && /soundcloud|spotify|discord|steamcommunity|x\.com|twitter/i.test(entry.url || ""));
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
    "/api/discord"
  ]));
  expect(apiRequests).not.toContain("/api/lastfm");
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

  let oneTimeDetailsFulfilled = false;
  const trackScrobbleItems = Array.from({ length: 31 }, (_, index) => ({
    playedAtIso: `2026-03-23T${String(Math.max(0, 23 - index)).padStart(2, "0")}:21:00.000Z`,
    playedAtLabel: `Recent play ${String(index + 1).padStart(2, "0")}`,
    album: index % 2 === 0 ? "This Is How Tomorrow Moves" : "Beatopia",
    lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time"
  }));
  const trackFirstRecorded = {
    playedAtIso: "2023-11-14T22:13:20.000Z",
    playedAtLabel: "14 Nov 2023, 22:13",
    album: "This Is How Tomorrow Moves",
    lastfmUrl: "https://www.last.fm/music/beabadoobee/_/One+Time"
  };

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
      await new Promise((resolve) => setTimeout(resolve, 1200));
      oneTimeDetailsFulfilled = true;
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
            total: 31,
            items: trackScrobbleItems,
            firstRecorded: trackFirstRecorded
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
              },
              {
                title: "Care",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Care",
                artworkUrl: "https://example.com/care.jpg",
                userPlaycount: 7,
                userLoved: false,
                globalPlaycount: 1120011,
                listeners: 642304
              },
              {
                title: "10:36",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/10:36",
                artworkUrl: "https://example.com/1036.jpg",
                userPlaycount: 6,
                userLoved: false,
                globalPlaycount: 1220011,
                listeners: 742304
              },
              {
                title: "See you Soon",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/See+you+Soon",
                artworkUrl: "https://example.com/see-you-soon.jpg",
                userPlaycount: 4,
                userLoved: false,
                globalPlaycount: 541102,
                listeners: 301204
              },
              {
                title: "Cologne",
                lastfmUrl: "https://www.last.fm/music/beabadoobee/_/Cologne",
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
  await page.evaluate(() => {
    const surface = document.getElementById("os-shuffle-visualizer-surface");
    surface?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  });
  await expect(page.locator("body")).toHaveAttribute("data-visualizer-focus-mode", "active");
  await page.waitForTimeout(700);
  const visualizerFocus = await page.evaluate(() => {
    const surface = document.getElementById("os-shuffle-visualizer-surface");
    const portal = document.querySelector(".josie-audio-player-bleed-layer");
    const link = document.getElementById("os-shuffle-visualizer-angel-link");
    const frame = document.getElementById("social-hub-scale-frame");
    const surfaceRect = surface instanceof HTMLElement ? surface.getBoundingClientRect() : null;
    const portalRect = portal instanceof HTMLElement ? portal.getBoundingClientRect() : null;
    const focusRect = portalRect || surfaceRect;
    const linkRect = link instanceof HTMLElement ? link.getBoundingClientRect() : null;
    return {
      layerMode: document.getElementById("os-shuffle-visualizer-layer")?.getAttribute("data-visualizer-focus-mode") || "",
      linkText: link instanceof HTMLElement ? link.textContent?.trim() : "",
      linkAriaHidden: link instanceof HTMLElement ? link.getAttribute("aria-hidden") : "",
      linkOpacity: link instanceof HTMLElement ? window.getComputedStyle(link).opacity : "",
      frameOpacity: frame instanceof HTMLElement ? window.getComputedStyle(frame).opacity : "",
      portalHidden: portal instanceof HTMLElement ? portal.hidden : true,
      centerDelta: focusRect ? Math.abs((focusRect.top + focusRect.height / 2) - window.innerHeight / 2) : 999,
      linkGap: focusRect && linkRect ? linkRect.top - focusRect.bottom : 0
    };
  });
  expect(visualizerFocus.layerMode).toBe("active");
  expect(visualizerFocus.linkText).toBe("Internet-Angel.net");
  expect(visualizerFocus.linkAriaHidden).toBe("false");
  expect(Number.parseFloat(visualizerFocus.linkOpacity)).toBeGreaterThan(0.4);
  expect(Number.parseFloat(visualizerFocus.frameOpacity)).toBeLessThan(0.05);
  expect(visualizerFocus.portalHidden).toBe(false);
  expect(visualizerFocus.centerDelta).toBeLessThanOrEqual(3);
  expect(visualizerFocus.linkGap).toBeGreaterThan(40);
  await page.evaluate(() => {
    const surface = document.getElementById("os-shuffle-visualizer-surface");
    surface?.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true
    }));
  });
  await expect(page.locator("body")).toHaveAttribute("data-visualizer-focus-mode", "idle");

  const sourceRow = page.locator(".lastfm-recent-button").first();
  const trackSourceArtSelector = ".lastfm-recent-button [data-lastfm-art-source]";
  await expect(sourceRow.locator(".lastfm-recent-title")).toHaveText("One Time", { timeout: 5_000 });
  const recentArtShapeBefore = await sourceRow.locator(".lastfm-recent-art").evaluate((node) => window.getComputedStyle(node).borderRadius);
  expect(recentArtShapeBefore).toBe("0px");
  await sourceRow.hover();
  const recentArtShapeAfter = await sourceRow.locator(".lastfm-recent-art").evaluate((node) => window.getComputedStyle(node).borderRadius);
  expect(recentArtShapeAfter).toBe("0px");
  await clearInteractionSfxLog(page);
  const panelOpenStartedAt = Date.now();
  await sourceRow.click({ force: true });
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible", { timeout: 500 });
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("aria-hidden", "false");
  expect(Date.now() - panelOpenStartedAt).toBeLessThan(700);
  expect(oneTimeDetailsFulfilled).toBe(false);
  await page.waitForFunction(() => {
    const clone = document.querySelector(".lastfm-track-panel-art-launch");
    return clone instanceof HTMLElement && window.getComputedStyle(clone).borderRadius === "0px";
  });
  await page.waitForFunction((selector) => {
    const source = document.querySelector(selector);
    return source instanceof HTMLElement
      && (source.dataset.lastfmArtSourceState === "launching" || source.dataset.lastfmArtSourceState === "hidden");
  }, trackSourceArtSelector);
  await waitForInteractionSfx(page, { soundId: "open_soft", source: "lastfmTrackPanelOpen", ownerMode: "top", page: "josie" });
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await page.waitForFunction(() => {
    const clone = document.querySelector(".lastfm-track-panel-art-launch");
    const panelArt = document.querySelector(".lastfm-track-panel-art");
    if (!(panelArt instanceof HTMLElement)) {
      return false;
    }
    const panelRect = panelArt.getBoundingClientRect();
    const panelRadius = window.getComputedStyle(panelArt).borderRadius;
    if (!(clone instanceof HTMLElement)) {
      return panelRect.width >= 220 && panelRect.height >= 220 && panelRadius === "0px";
    }
    const cloneRect = clone.getBoundingClientRect();
    const cloneRadius = window.getComputedStyle(clone).borderRadius;
    return Math.abs(cloneRect.left - panelRect.left) <= 2
      && Math.abs(cloneRect.top - panelRect.top) <= 2
      && Math.abs(cloneRect.width - panelRect.width) <= 2
      && Math.abs(cloneRect.height - panelRect.height) <= 2
      && cloneRadius === "0px"
      && panelRadius === "0px";
  }, { timeout: 2_000 });
  await page.waitForTimeout(900);
  await waitForLastFmPanelSourceArtState(page, trackSourceArtSelector, "hidden", {
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
  expect(panelBox.width).toBeLessThanOrEqual(1040);
  expect(panelBox.scrollbarWidth).toBe("none");
  expect(panelBox.overflowY).toBe("auto");
  expect(panelBox.bodyHeight).toBeGreaterThan(0);
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
    const lovedTitle = document.querySelector(".lastfm-track-panel-loved-title");
    return {
      titleFont: title ? window.getComputedStyle(title).fontFamily : "",
      titleSize: title ? window.getComputedStyle(title).fontSize : "",
      metaFont: meta ? window.getComputedStyle(meta).fontFamily : "",
      relatedTitleFont: relatedTitle ? window.getComputedStyle(relatedTitle).fontFamily : "",
      relatedTitleSize: relatedTitle ? window.getComputedStyle(relatedTitle).fontSize : "",
      sectionHeadJustify: document.querySelector(".lastfm-track-panel-section-head") ? window.getComputedStyle(document.querySelector(".lastfm-track-panel-section-head")).justifyContent : "",
      lovedTitleText: lovedTitle ? lovedTitle.textContent.trim() : "",
      lovedTitleIconCount: lovedTitle ? lovedTitle.querySelectorAll(".lastfm-loved-indicator").length : 0,
      lovedTitleIconWidth: lovedTitle ? window.getComputedStyle(lovedTitle.querySelector(".lastfm-loved-indicator")).width : ""
    };
  });
  expect(panelTypography.metaFont.toLowerCase()).toContain("open sans");
  expect(panelTypography.titleFont).not.toBe(panelTypography.metaFont);
  expect(panelTypography.relatedTitleFont).not.toBe(panelTypography.metaFont);
  expect(Number.parseFloat(panelTypography.titleSize)).toBeGreaterThanOrEqual(60);
  expect(panelTypography.relatedTitleSize).toBe("22px");
  expect(panelTypography.sectionHeadJustify).toBe("space-between");
  expect(panelTypography.lovedTitleText).toBe("Loved");
  expect(panelTypography.lovedTitleIconCount).toBe(1);
  expect(Number.parseFloat(panelTypography.lovedTitleIconWidth)).toBeGreaterThanOrEqual(24);
  await expect(page.locator(".lastfm-track-panel-badge--loved")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-meta-genres")).toContainText("indie pop");
  await expect(page.locator(".lastfm-track-panel-meta-genres")).toContainText("bedroom pop");
  await expect(page.locator(".lastfm-track-panel-tags", { hasText: "indie pop" })).toHaveCount(0);
  await expect(page.locator("[data-track-preview-player]")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-primary .lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-secondary .lastfm-track-panel-spotify-slot")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  const trackMediaPlacement = await page.evaluate(() => {
    const primary = document.querySelector(".lastfm-track-panel-primary");
    const art = document.querySelector(".lastfm-track-panel-art");
    const media = document.querySelector(".lastfm-track-panel-media-control .lastfm-track-panel-spotify-slot");
    if (!(primary instanceof HTMLElement) || !(art instanceof HTMLElement) || !(media instanceof HTMLElement)) {
      return null;
    }
    const artRect = art.getBoundingClientRect();
    const mediaRect = media.getBoundingClientRect();
    return {
      primaryContainsArt: primary.contains(art),
      primaryContainsMedia: primary.contains(media),
      mediaUnderArt: mediaRect.top >= artRect.bottom - 2
    };
  });
  expect(trackMediaPlacement).toEqual({
    primaryContainsArt: true,
    primaryContainsMedia: true,
    mediaUnderArt: true
  });
  await expect(page.locator(".lastfm-track-panel-focus--track .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-value")).toHaveText("31");
  await expect(page.locator(".lastfm-track-panel-focus--track .lastfm-track-panel-history")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-focus--track .lastfm-track-panel-history-item")).toHaveCount(30);
  await expect(page.locator(".lastfm-track-panel-first-play")).toContainText("First recorded play");
  await expect(page.locator(".lastfm-track-panel-first-play")).toContainText("14 Nov 2023, 22:13");
  const historyScroll = await page.locator(".lastfm-track-panel-history-scroll").evaluate((node) => {
    const styles = window.getComputedStyle(node);
    return {
      overflowY: styles.overflowY,
      scrollbarWidth: styles.getPropertyValue("scrollbar-width").trim(),
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight
    };
  });
  expect(historyScroll.overflowY).toBe("auto");
  expect(historyScroll.scrollbarWidth).toBe("none");
  expect(historyScroll.scrollHeight).toBeGreaterThan(historyScroll.clientHeight);
  const historyJumpButton = page.locator(".lastfm-track-panel-history-jump");
  await expect(historyJumpButton).toHaveAttribute("data-lastfm-history-jump-state", "first");
  await expect(historyJumpButton).toHaveAttribute("aria-label", "Jump to first recorded play");
  await historyJumpButton.click();
  await expect(historyJumpButton).toHaveAttribute("data-lastfm-history-jump-state", "top");
  await expect(historyJumpButton).toHaveAttribute("aria-label", "Jump to recent plays");
  await expect.poll(async () => page.locator(".lastfm-track-panel-history-scroll").evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await historyJumpButton.click();
  await expect(historyJumpButton).toHaveAttribute("data-lastfm-history-jump-state", "first");
  await expect.poll(async () => page.locator(".lastfm-track-panel-history-scroll").evaluate((node) => Math.round(node.scrollTop))).toBe(0);
  await expect(page.locator(".lastfm-track-panel-stat-note")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-kicker")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-similar")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "My recent plays" })).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-related .lastfm-track-panel-related-button")).toHaveCount(6);
  await expect(page.locator(".lastfm-track-panel-related")).not.toContainText("global");
  const summaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(summaryLink).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-art-image")).toHaveAttribute("src", /https:\/\/i\.scdn\.co\/image\/one-time\.jpg/);
  const trackArtHoverBefore = await readLastFmPanelArtHoverState(page);
  await page.locator(".lastfm-track-panel-art").hover();
  const trackArtHoverAfter = await readLastFmPanelArtHoverState(page);
  expect(trackArtHoverBefore).not.toBeNull();
  expect(trackArtHoverAfter).not.toBeNull();
  expect(trackArtHoverBefore.overlayOpacity).toBe("0");
  expect(trackArtHoverAfter.overlayOpacity).toBe("0");
  expect(trackArtHoverAfter.shellTransform).toBe(trackArtHoverBefore.shellTransform);
  expect(trackArtHoverAfter.imageTransform).toBe(trackArtHoverBefore.imageTransform);
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
  await expect(page.locator(".lastfm-track-panel-related-button")).toHaveCount(6);
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
    const currentTitleText = scene.querySelector('[data-lastfm-track-panel-scene-layer="current"] .lastfm-track-panel-title-text');
    const nextLayer = scene.querySelector('[data-lastfm-track-panel-scene-layer="next"]');
    const nextLayerStyle = nextLayer instanceof HTMLElement ? window.getComputedStyle(nextLayer) : null;
    return {
      phase: scene.getAttribute("data-panel-scene-phase"),
      spin: scene.getAttribute("data-panel-scene-spin"),
      title: currentTitleText instanceof HTMLElement ? currentTitleText.textContent.trim() : currentTitle instanceof HTMLElement ? currentTitle.textContent.trim() : "",
      nextOpacity: nextLayerStyle?.opacity || "",
      nextVisibility: nextLayerStyle?.visibility || ""
    };
  });
  expect(["loading", "morphing"]).toContain(midMorphState.phase);
  expect(midMorphState.spin).toBe("idle");
  expect(midMorphState.title).toBe("One Time");
  if (midMorphState.phase === "loading") {
    expect(midMorphState.nextOpacity).toBe("0");
    expect(midMorphState.nextVisibility).toBe("hidden");
  } else {
    expect(midMorphState.nextVisibility).toBe("visible");
  }
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
  await waitForLastFmPanelSourceArtStateCleared(page, trackSourceArtSelector);
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
          userPlaycount: 128,
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
              trackCount: 14,
              userPlaycount: 21,
              playcount: 1200456,
              listeners: 500123
            },
            {
              title: "This Is How Tomorrow Moves",
              artist: "beabadoobee",
              artworkUrl: "https://example.com/tih-tomorrow-detail.jpg",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/This+Is+How+Tomorrow+Moves",
              releasedAt: "16 Aug 2024",
              releaseYear: "2024",
              topTags: [
                { name: "indie rock", url: "https://www.last.fm/tag/indie+rock" }
              ],
              trackCount: 14,
              userPlaycount: 12,
              playcount: 860456,
              listeners: 300123
            },
            {
              title: "Glue Song",
              artist: "beabadoobee",
              artworkUrl: "https://example.com/glue-song-detail.jpg",
              lastfmUrl: "https://www.last.fm/music/beabadoobee/Glue+Song",
              releasedAt: "14 Feb 2023",
              releaseYear: "2023",
              topTags: [],
              trackCount: 1,
              userPlaycount: 8,
              playcount: 220456,
              listeners: 140123
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
          userPlaycount: 21,
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
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("aria-hidden", "false");
  await waitForLastFmPanelSourceArtState(page, artistSourceArtSelector, "hidden", {
    panelVisibility: "visible",
    ariaHidden: "false"
  });
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await page.waitForTimeout(900);
  await waitForLastFmPanelSourceArtState(page, artistSourceArtSelector, "hidden", {
    panelVisibility: "visible",
    ariaHidden: "false",
    minWindowOpacity: 0.05
  });
  await expect(page.locator(".lastfm-track-panel-art-launch")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-kicker")).toHaveCount(0);
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
      artBorderWidth: art instanceof HTMLElement ? window.getComputedStyle(art).borderTopWidth : "",
      primaryPaddingLeft: primary instanceof HTMLElement ? window.getComputedStyle(primary).paddingLeft : ""
    };
  });
  expect(artistPanelLayout.className).toContain("lastfm-track-panel-layout--compact-primary");
  expect(artistPanelLayout.primaryWidth).toBeGreaterThan(220);
  expect(artistPanelLayout.artWidth).toBeGreaterThanOrEqual(220);
  expect(artistPanelLayout.artHeight).toBeGreaterThanOrEqual(220);
  expect(artistPanelLayout.artBackground).toBe("rgba(0, 0, 0, 0)");
  expect(artistPanelLayout.artBorderWidth).toBe("0px");
  expect(Number.parseFloat(artistPanelLayout.primaryPaddingLeft)).toBeGreaterThan(0);
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
  expect(artistPanelFit.overflowY).toBe("auto");
  expect(artistPanelFit.bodyHeight).toBeGreaterThan(0);
  const artistArtHoverBefore = await readLastFmPanelArtHoverState(page);
  await page.locator(".lastfm-track-panel-art").hover();
  const artistArtHoverAfter = await readLastFmPanelArtHoverState(page);
  expect(artistArtHoverBefore).not.toBeNull();
  expect(artistArtHoverAfter).not.toBeNull();
  expect(artistArtHoverBefore.overlayOpacity).toBe("0");
  expect(artistArtHoverAfter.overlayOpacity).toBe("0");
  expect(artistArtHoverAfter.shellTransform).toBe(artistArtHoverBefore.shellTransform);
  expect(artistArtHoverAfter.imageTransform).toBe(artistArtHoverBefore.imageTransform);
  await page.locator(".lastfm-track-panel-close").hover();
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Popular tracks" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Albums" })).toBeVisible();
  await expect(page.locator(".lastfm-track-panel-actions")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-primary .lastfm-track-panel-actions")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-focus--artist .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-label")).toContainText("My scrobbles");
  await expect(page.locator(".lastfm-track-panel-focus--artist .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-value")).toHaveText("128");
  await expect(page.locator(".lastfm-track-panel-stat-label", { hasText: "Listeners" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-stat-label", { hasText: "Global plays" })).toHaveCount(0);
  const artistSummaryLink = page.locator(".lastfm-track-panel-summary-link", { hasText: "Read More" });
  await expect(artistSummaryLink).toBeVisible();
  await artistSummaryLink.click();
  await expect(page.locator(".external-link-confirm.is-open")).toHaveCount(0);
  let windowOpenCalls = await drainWindowOpenCalls(page);
  expect(windowOpenCalls.at(-1)).toMatchObject({
    url: "https://www.last.fm/music/beabadoobee",
    target: "_blank"
  });
  await expect(page.locator(".lastfm-track-panel-related-button--album")).toHaveCount(2);
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("14 tracks");
  await expect(page.locator(".lastfm-track-panel-related-button--album").first()).toContainText("21 scrobbles");
  await expect(page.locator(".lastfm-track-panel-related-button--album", { hasText: "Glue Song" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-album-card-image")).toHaveCount(2);
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
  await expect(page.locator(".lastfm-track-panel-primary .lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-secondary .lastfm-track-panel-spotify-slot")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-focus--album .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-label")).toContainText("Album scrobbles");
  await expect(page.locator(".lastfm-track-panel-focus--album .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-value")).toHaveText("21");
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-track-meta").filter({ hasText: "global" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-tracklist-head")).toContainText("Title");
  await expect(page.locator(".lastfm-track-panel-tracklist-head")).toContainText("Scrobbles");
  await expect(page.locator(".lastfm-track-panel-track-scrobbles").first()).toHaveText("9 scrobbles");
  await expect(page.locator(".lastfm-track-panel-track-duration").first()).toHaveText("2:24");
  const spotifyTracklistLayout = await page.locator(".lastfm-track-panel-track-item").first().evaluate((node) => ({
    columns: window.getComputedStyle(node).gridTemplateColumns,
    borderTopWidth: window.getComputedStyle(node).borderTopWidth
  }));
  expect(spotifyTracklistLayout.columns.split(" ").length).toBeGreaterThanOrEqual(5);
  expect(spotifyTracklistLayout.borderTopWidth).toBe("0px");
  await page.keyboard.press("Escape");
  await expect(page.locator(".lastfm-track-panel.is-open")).toHaveCount(0);
  await waitForLastFmPanelSourceArtStateCleared(page, artistSourceArtSelector);

  const albumSourceArtSelector = ".lastfm-media-grid--albums .lastfm-media-button [data-lastfm-art-source]";
  await page.locator(".lastfm-media-grid--albums .lastfm-media-button").first().click();
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await waitForLastFmPanelSourceArtState(page, albumSourceArtSelector, "hidden", {
    panelVisibility: "visible",
    ariaHidden: "false"
  });
  await expect(page.locator(".lastfm-track-panel-title")).toContainText("Beatopia");
  await expect(page.locator(".lastfm-track-panel")).toHaveAttribute("data-panel-visibility", "visible");
  await page.waitForTimeout(900);
  await waitForLastFmPanelSourceArtState(page, albumSourceArtSelector, "hidden", {
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
  await expect(page.locator(".lastfm-track-panel-primary .lastfm-track-panel-spotify-slot")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-secondary .lastfm-track-panel-spotify-slot")).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-focus--album .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-label")).toContainText("Album scrobbles");
  await expect(page.locator(".lastfm-track-panel-focus--album .lastfm-track-panel-stat--scrobble-focus .lastfm-track-panel-stat-value")).toHaveText("21");
  await expect(page.locator(".lastfm-track-panel-spotify-embed")).toHaveCount(1);
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toHaveCount(0);
  await expect(page.locator(".lastfm-track-panel-track-meta").filter({ hasText: "global" })).toHaveCount(0);
  const albumArtHoverBefore = await readLastFmPanelArtHoverState(page);
  await page.locator(".lastfm-track-panel-art").hover();
  const albumArtHoverAfter = await readLastFmPanelArtHoverState(page);
  expect(albumArtHoverBefore).not.toBeNull();
  expect(albumArtHoverAfter).not.toBeNull();
  expect(albumArtHoverBefore.overlayOpacity).toBe("0");
  expect(albumArtHoverAfter.overlayOpacity).toBe("0");
  expect(albumArtHoverAfter.shellTransform).toBe(albumArtHoverBefore.shellTransform);
  expect(albumArtHoverAfter.imageTransform).toBe(albumArtHoverBefore.imageTransform);
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
  expect(albumPanelFit.overflowY).toBe("auto");
  expect(albumPanelFit.bodyHeight).toBeGreaterThan(0);
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
  await expect(page.locator(".lastfm-track-panel-section-title", { hasText: "Similar tracks" })).toHaveCount(0);
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
  await waitForLastFmPanelSourceArtStateCleared(page, albumSourceArtSelector);

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
  const spotifyEmbedScrollbarState = await page.locator(".lastfm-track-panel-spotify-embed").evaluate((iframe) => {
    const iframeStyles = window.getComputedStyle(iframe);
    const host = iframe.closest(".lastfm-track-panel-spotify-embed-host");
    const hostStyles = host instanceof Element ? window.getComputedStyle(host) : null;
    return {
      hostOverflow: hostStyles?.overflow,
      hostScrollbarWidth: hostStyles?.getPropertyValue("scrollbar-width").trim(),
      iframeOverflow: iframeStyles.overflow,
      iframeScrollbarWidth: iframeStyles.getPropertyValue("scrollbar-width").trim(),
      iframeScrolling: iframe.getAttribute("scrolling")
    };
  });
  expect(spotifyEmbedScrollbarState.hostOverflow).toBe("hidden");
  expect(spotifyEmbedScrollbarState.hostScrollbarWidth).toBe("none");
  expect(["hidden", "clip"]).toContain(spotifyEmbedScrollbarState.iframeOverflow);
  expect(spotifyEmbedScrollbarState.iframeScrollbarWidth).toBe("none");
  expect(spotifyEmbedScrollbarState.iframeScrolling).toBe("no");
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

test.skip("josie shows a Last.fm-only compact mobile showcase and opens track details", async ({ page }) => {
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

test.skip("josie stacks the compact mobile track panel cleanly and plays the Spotify preview clip", async ({ page }) => {
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
