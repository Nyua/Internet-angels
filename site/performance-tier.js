(() => {
  const DESKTOP_BREAKPOINT_PX = 820;
  const CHANGE_EVENT_NAME = "internet-angel:performance-tier-change";
  const LEGACY_STORAGE_KEYS = [
    "internetAngelPerformanceTier",
    "internetAngelPerformanceReason",
    "internetAngelPerformanceOverride"
  ];
  const state = {
    eligible: false,
    ready: false
  };
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
  function getDetail() {
    return {
      eligible: state.eligible,
      tier: "full",
      reason: "disabled",
      backgroundThrottled: false
    };
  }
  function applyBodyState() {
    const body = getBody();
    if (!body) return;
    if (!state.eligible) {
      body.removeAttribute("data-performance-tier");
      body.removeAttribute("data-performance-reason");
      return;
    }
    body.setAttribute("data-performance-tier", "full");
    body.setAttribute("data-performance-reason", "disabled");
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
    const changed = state.eligible !== nextEligible;
    state.eligible = nextEligible;
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
        tier: "full",
        reason: "disabled",
        baseTier: "full",
        baseReason: "disabled",
        backgroundThrottled: false,
        consecutiveBadWindows: 0
      };
    },
    isEligible() {
      return state.eligible;
    },
    isDegraded() {
      return false;
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
