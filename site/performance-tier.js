(() => {
  const DESKTOP_BREAKPOINT_PX = 820;
  const TIER_STORAGE_KEY = "internetAngelPerformanceTier";
  const REASON_STORAGE_KEY = "internetAngelPerformanceReason";
  const OVERRIDE_STORAGE_KEY = "internetAngelPerformanceOverride";
  const CHANGE_EVENT_NAME = "internet-angel:performance-tier-change";
  const WINDOW_DURATION_MS = 3000;
  const MIN_AVERAGE_FPS = 46;
  const MAX_P95_FRAME_MS = 40;
  const MAX_FRAME_DELTA_MS = 250;
  const state = {
    eligible: false,
    ready: false,
    monitoring: false,
    tier: "full",
    reason: "boot-probe",
    backgroundThrottled: false,
    consecutiveBadWindows: 0
  };
  let frameWindow = [];
  let frameWindowDurationMs = 0;
  let monitorRafId = 0;
  let lastMonitorFrameMs = 0;
  const desktopQuery = typeof window.matchMedia === "function"
    ? window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX + 1}px)`)
    : null;
  function canUseDesktopPerformanceTier() {
    const finePointer = Boolean(window.matchMedia?.("(pointer: fine)")?.matches);
    const canHover = Boolean(window.matchMedia?.("(hover: hover)")?.matches);
    const desktopWidth = desktopQuery ? desktopQuery.matches : window.innerWidth > DESKTOP_BREAKPOINT_PX;
    return finePointer && canHover && desktopWidth;
  }
  function readSessionItem(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function writeSessionItem(key, value) {
    try {
      if (value == null || value === "") {
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, String(value));
      }
    } catch {
    }
  }
  function readOverride() {
    const globalOverride = typeof window.__internetAngelPerformanceOverride === "string"
      ? window.__internetAngelPerformanceOverride
      : "";
    const storedOverride = readSessionItem(OVERRIDE_STORAGE_KEY) || "";
    const value = String(globalOverride || storedOverride || "").trim().toLowerCase();
    return value === "degraded" || value === "full" ? value : "";
  }
  function getBody() {
    return document.body instanceof HTMLElement ? document.body : null;
  }
  function applyBodyState() {
    const body = getBody();
    if (!body) return;
    if (!state.eligible) {
      body.removeAttribute("data-performance-tier");
      body.removeAttribute("data-performance-reason");
      return;
    }
    body.setAttribute("data-performance-tier", getEffectiveTier());
    body.setAttribute("data-performance-reason", getEffectiveReason());
  }
  function emitChange() {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT_NAME, {
      detail: {
        eligible: state.eligible,
        tier: getEffectiveTier(),
        reason: getEffectiveReason(),
        backgroundThrottled: state.backgroundThrottled
      }
    }));
  }
  function updateWindowGlobal() {
    window.__internetAngelPerformanceState = api;
  }
  function getEffectiveTier() {
    return state.backgroundThrottled && state.tier !== "degraded" ? "degraded" : state.tier;
  }
  function getEffectiveReason() {
    return state.backgroundThrottled && state.tier !== "degraded" ? "background" : state.reason;
  }
  function computeBackgroundThrottle() {
    const hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
    return Boolean(document.hidden || !hasFocus);
  }
  function stopMonitor() {
    state.monitoring = false;
    if (monitorRafId) {
      window.cancelAnimationFrame(monitorRafId);
      monitorRafId = 0;
    }
    frameWindow = [];
    frameWindowDurationMs = 0;
    lastMonitorFrameMs = 0;
  }
  function finalizeTier(tier, reason) {
    const previousTier = getEffectiveTier();
    const previousReason = getEffectiveReason();
    const nextTier = tier === "degraded" ? "degraded" : "full";
    const nextReason = reason === "frame-budget" || reason === "override" ? reason : "boot-probe";
    state.tier = nextTier;
    state.reason = nextReason;
    if (state.eligible) {
      if (nextReason === "override") {
        writeSessionItem(TIER_STORAGE_KEY, nextTier);
        writeSessionItem(REASON_STORAGE_KEY, nextReason);
      } else {
        writeSessionItem(TIER_STORAGE_KEY, null);
        writeSessionItem(REASON_STORAGE_KEY, null);
      }
    }
    applyBodyState();
    updateWindowGlobal();
    if (getEffectiveTier() === "degraded") {
      stopMonitor();
    } else if (state.ready) {
      startMonitor();
    }
    if (previousTier !== getEffectiveTier() || previousReason !== getEffectiveReason()) {
      emitChange();
    }
  }
  function syncAttentionThrottle(options = {}) {
    if (!state.eligible) return;
    const nextBackgroundThrottled = computeBackgroundThrottle();
    const previousTier = getEffectiveTier();
    const previousReason = getEffectiveReason();
    if (state.backgroundThrottled === nextBackgroundThrottled) return;
    state.backgroundThrottled = nextBackgroundThrottled;
    applyBodyState();
    updateWindowGlobal();
    if (getEffectiveTier() === "degraded") {
      stopMonitor();
    } else if (state.ready) {
      startMonitor();
    }
    if (!options.silent && (previousTier !== getEffectiveTier() || previousReason !== getEffectiveReason())) {
      emitChange();
    }
  }
  function sampleWindowMetrics(samples) {
    if (!samples.length) {
      return { averageFps: 60, p95: 0 };
    }
    const sorted = samples.slice().sort((left, right) => left - right);
    const totalMs = sorted.reduce((sum, sample) => sum + sample, 0);
    const averageMs = totalMs / sorted.length;
    const p95Index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.95)));
    return {
      averageFps: averageMs > 0 ? 1000 / averageMs : 60,
      p95: sorted[p95Index] || 0
    };
  }
  function evaluateFrameWindow() {
    const metrics = sampleWindowMetrics(frameWindow);
    const badWindow = metrics.averageFps < MIN_AVERAGE_FPS || metrics.p95 > MAX_P95_FRAME_MS;
    state.consecutiveBadWindows = badWindow ? state.consecutiveBadWindows + 1 : 0;
    frameWindow = [];
    frameWindowDurationMs = 0;
    if (state.consecutiveBadWindows >= 2) {
      finalizeTier("degraded", "frame-budget");
    }
  }
  function ingestFrameDelta(deltaMs) {
    if (!state.eligible || !state.ready || state.tier === "degraded") return;
    const numericDelta = Number(deltaMs);
    if (!Number.isFinite(numericDelta) || numericDelta <= 0 || numericDelta > MAX_FRAME_DELTA_MS) return;
    frameWindow.push(numericDelta);
    frameWindowDurationMs += numericDelta;
    if (frameWindowDurationMs >= WINDOW_DURATION_MS) {
      evaluateFrameWindow();
    }
  }
  function monitorTick(nowMs) {
    monitorRafId = 0;
    if (!state.monitoring || getEffectiveTier() === "degraded") return;
    if (!document.hidden && !state.backgroundThrottled) {
      const deltaMs = lastMonitorFrameMs ? nowMs - lastMonitorFrameMs : 0;
      lastMonitorFrameMs = nowMs;
      ingestFrameDelta(deltaMs);
    } else {
      lastMonitorFrameMs = nowMs;
    }
    if (state.monitoring && state.tier !== "degraded") {
      monitorRafId = window.requestAnimationFrame(monitorTick);
    }
  }
  function startMonitor() {
    if (!state.eligible || !state.ready || state.monitoring || getEffectiveTier() === "degraded") return;
    state.monitoring = true;
    lastMonitorFrameMs = 0;
    monitorRafId = window.requestAnimationFrame(monitorTick);
  }
  function probeBootCapability() {
    const probeCanvas = document.createElement("canvas");
    const attributes = {
      alpha: true,
      antialias: false,
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance"
    };
    const context = probeCanvas.getContext("webgl2", attributes)
      || probeCanvas.getContext("webgl", attributes)
      || probeCanvas.getContext("experimental-webgl", attributes);
    if (!context) {
      return false;
    }
    const extension = context.getExtension?.("WEBGL_lose_context");
    extension?.loseContext?.();
    return true;
  }
  function syncFromStorage() {
    const override = readOverride();
    if (override) {
      finalizeTier(override, "override");
      return true;
    }
    const storedTier = readSessionItem(TIER_STORAGE_KEY);
    const storedReason = readSessionItem(REASON_STORAGE_KEY);
    if ((storedTier === "degraded" || storedTier === "full") && storedReason === "override") {
      finalizeTier(storedTier, storedReason || "boot-probe");
      return true;
    }
    if (storedTier != null || storedReason != null) {
      writeSessionItem(TIER_STORAGE_KEY, null);
      writeSessionItem(REASON_STORAGE_KEY, null);
    }
    return false;
  }
  function initialize() {
    state.eligible = canUseDesktopPerformanceTier();
    if (!state.eligible) {
      applyBodyState();
      updateWindowGlobal();
      return;
    }
    if (syncFromStorage()) {
      return;
    }
    finalizeTier(probeBootCapability() ? "full" : "degraded", "boot-probe");
    syncAttentionThrottle({ silent: true });
  }
  function handleStorage(event) {
    if (!event || event.storageArea !== window.sessionStorage) return;
    if (![TIER_STORAGE_KEY, REASON_STORAGE_KEY, OVERRIDE_STORAGE_KEY].includes(event.key || "")) return;
    if (!state.eligible) return;
    syncFromStorage();
  }
  function handleAttentionChange() {
    syncAttentionThrottle();
  }
  const api = {
    getState() {
      return {
        eligible: state.eligible,
        ready: state.ready,
        monitoring: state.monitoring,
        tier: getEffectiveTier(),
        reason: getEffectiveReason(),
        baseTier: state.tier,
        baseReason: state.reason,
        backgroundThrottled: state.backgroundThrottled,
        consecutiveBadWindows: state.consecutiveBadWindows
      };
    },
    isEligible() {
      return state.eligible;
    },
    isDegraded() {
      return state.eligible && getEffectiveTier() === "degraded";
    },
    isBackgroundThrottled() {
      return state.eligible && state.backgroundThrottled;
    },
    markReady() {
      state.ready = true;
      startMonitor();
    },
    __debugPushFrameDeltas(samples) {
      if (!Array.isArray(samples)) return;
      state.ready = true;
      samples.forEach((sample) => ingestFrameDelta(sample));
    }
  };
  updateWindowGlobal();
  initialize();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBodyState, { once: true });
  } else {
    applyBodyState();
  }
  window.addEventListener("storage", handleStorage);
  window.addEventListener("blur", handleAttentionChange);
  window.addEventListener("focus", handleAttentionChange);
  document.addEventListener("visibilitychange", handleAttentionChange);
})();
