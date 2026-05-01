(() => {
  const DESKTOP_BREAKPOINT_PX = 820;
  const CHANGE_EVENT_NAME = "internet-angel:performance-tier-change";
  const LEGACY_STORAGE_KEYS = [
    "internetAngelPerformanceTier",
    "internetAngelPerformanceReason",
    "internetAngelPerformanceOverride"
  ];
  const SOFTWARE_RENDERER_PATTERN = /\b(swiftshader|llvmpipe|softpipe|software rasterizer|software renderer|microsoft basic render driver|warp|gdi generic|mesa offscreen)\b/i;
  const state = {
    eligible: false,
    ready: false,
    tier: "full",
    reason: "disabled",
    graphicsAcceleration: "unknown",
    graphicsRenderer: "",
    graphicsVendor: "",
    graphicsChecked: false
  };
  let cachedGraphicsDetail = null;
  const desktopQuery = typeof window.matchMedia === "function"
    ? window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX + 1}px)`)
    : null;
  function canUseDesktopPerformanceTier() {
    const finePointer = Boolean(window.matchMedia?.("(pointer: fine)")?.matches);
    const canHover = Boolean(window.matchMedia?.("(hover: hover)")?.matches);
    const desktopWidth = desktopQuery ? desktopQuery.matches : window.innerWidth > DESKTOP_BREAKPOINT_PX;
    return finePointer && canHover && desktopWidth;
  }
  function clearLegacySessionState() {
    try {
      LEGACY_STORAGE_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
    } catch {
    }
  }
  function getBody() {
    return document.body instanceof HTMLElement ? document.body : null;
  }
  function normalizeRendererText(value) {
    return typeof value === "string" ? value.trim() : "";
  }
  function readGraphicsOverride() {
    const override = window.__internetAngelGraphicsAccelerationOverride;
    if (!override || typeof override !== "object") return null;
    const accelerated = override.accelerated !== false && override.tier !== "degraded";
    return {
      degraded: !accelerated,
      reason: !accelerated
        ? normalizeRendererText(override.reason) || "software-renderer"
        : "disabled",
      acceleration: accelerated ? "hardware" : "software",
      renderer: normalizeRendererText(override.renderer),
      vendor: normalizeRendererText(override.vendor),
      checked: true
    };
  }
  function createWebGlContext(canvas) {
    const contextOptions = {
      alpha: false,
      antialias: false,
      depth: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "high-performance",
      stencil: false
    };
    return canvas.getContext("webgl2", contextOptions)
      || canvas.getContext("webgl", contextOptions)
      || canvas.getContext("experimental-webgl", contextOptions);
  }
  function inspectGraphicsAcceleration() {
    const override = readGraphicsOverride();
    if (override) return override;
    const isAutomation = Boolean(navigator.webdriver);
    const canvas = document.createElement("canvas");
    let gl = null;
    try {
      gl = createWebGlContext(canvas);
    } catch {
      gl = null;
    }
    if (!gl) {
      return {
        degraded: !isAutomation,
        reason: isAutomation ? "disabled" : "webgl-unavailable",
        acceleration: isAutomation ? "unknown" : "software",
        renderer: "",
        vendor: "",
        checked: true
      };
    }
    let renderer = "";
    let vendor = "";
    try {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    } catch {
    }
    const rendererText = `${normalizeRendererText(vendor)} ${normalizeRendererText(renderer)}`;
    const softwareRenderer = SOFTWARE_RENDERER_PATTERN.test(rendererText);
    return {
      degraded: softwareRenderer && !isAutomation,
      reason: softwareRenderer && !isAutomation ? "software-renderer" : "disabled",
      acceleration: softwareRenderer && !isAutomation ? "software" : softwareRenderer ? "unknown" : "hardware",
      renderer: normalizeRendererText(renderer),
      vendor: normalizeRendererText(vendor),
      checked: true
    };
  }
  function getGraphicsDetail() {
    if (!cachedGraphicsDetail) {
      cachedGraphicsDetail = inspectGraphicsAcceleration();
    }
    return cachedGraphicsDetail;
  }
  function getDetail() {
    return {
      eligible: state.eligible,
      tier: state.tier,
      reason: state.reason,
      graphicsAcceleration: state.graphicsAcceleration,
      graphicsRenderer: state.graphicsRenderer,
      graphicsVendor: state.graphicsVendor,
      graphicsChecked: state.graphicsChecked,
      backgroundThrottled: false
    };
  }
  function applyBodyState() {
    const body = getBody();
    if (!body) return;
    if (!state.eligible) {
      body.removeAttribute("data-performance-tier");
      body.removeAttribute("data-performance-reason");
      body.removeAttribute("data-graphics-acceleration");
      return;
    }
    body.setAttribute("data-performance-tier", state.tier);
    body.setAttribute("data-performance-reason", state.reason);
    body.setAttribute("data-graphics-acceleration", state.graphicsAcceleration);
  }
  function emitChange() {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT_NAME, {
      detail: getDetail()
    }));
  }
  function updateWindowGlobal() {
    window.__internetAngelPerformanceState = api;
  }
  function syncEligibility(options = {}) {
    const nextEligible = canUseDesktopPerformanceTier();
    const graphics = nextEligible ? getGraphicsDetail() : {
      degraded: false,
      reason: "disabled",
      acceleration: "unknown",
      renderer: "",
      vendor: "",
      checked: false
    };
    const nextTier = nextEligible && graphics.degraded ? "degraded" : "full";
    const nextReason = nextTier === "degraded" ? graphics.reason : "disabled";
    const changed = state.eligible !== nextEligible
      || state.tier !== nextTier
      || state.reason !== nextReason
      || state.graphicsAcceleration !== graphics.acceleration;
    state.eligible = nextEligible;
    state.tier = nextTier;
    state.reason = nextReason;
    state.graphicsAcceleration = graphics.acceleration;
    state.graphicsRenderer = graphics.renderer;
    state.graphicsVendor = graphics.vendor;
    state.graphicsChecked = graphics.checked;
    applyBodyState();
    updateWindowGlobal();
    if (!options.silent && changed) {
      emitChange();
    }
  }
  const api = {
    getState() {
      return {
        eligible: state.eligible,
        ready: state.ready,
        monitoring: false,
        tier: state.tier,
        reason: state.reason,
        baseTier: state.tier,
        baseReason: state.reason,
        graphicsAcceleration: state.graphicsAcceleration,
        graphicsRenderer: state.graphicsRenderer,
        graphicsVendor: state.graphicsVendor,
        graphicsChecked: state.graphicsChecked,
        backgroundThrottled: false,
        consecutiveBadWindows: 0
      };
    },
    isEligible() {
      return state.eligible;
    },
    isDegraded() {
      return state.eligible && state.tier === "degraded";
    },
    isBackgroundThrottled() {
      return false;
    },
    markReady() {
      state.ready = true;
    },
    __debugPushFrameDeltas() {
    }
  };
  clearLegacySessionState();
  updateWindowGlobal();
  syncEligibility({ silent: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyBodyState();
      emitChange();
    }, { once: true });
  } else {
    applyBodyState();
    emitChange();
  }
  if (typeof desktopQuery?.addEventListener === "function") {
    desktopQuery.addEventListener("change", () => syncEligibility());
  } else if (typeof desktopQuery?.addListener === "function") {
    desktopQuery.addListener(() => syncEligibility());
  } else {
    window.addEventListener("resize", () => syncEligibility(), { passive: true });
  }
})();
