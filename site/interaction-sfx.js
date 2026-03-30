(() => {
  const PLAY_MESSAGE_TYPE = "internet-angel:interaction-sfx-play";
  const SOUND_IDS = new Set([
    "hover_soft",
    "activate_soft",
    "open_soft",
    "close_soft",
    "confirm_soft",
    "cancel_soft",
    "flip_soft",
    "toggle_soft",
    "preview_soft"
  ]);
  const DEFAULT_ACTIONABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "[role='button']",
    "[data-open-url]",
    "[data-item-url]",
    "[data-lastfm-artist-name]",
    "[data-lastfm-album-title]",
    "[data-lastfm-track-title]",
    "[data-lastfm-panel-art-toggle]",
    ".steam-activity-row-button",
    ".lastfm-recent-button",
    ".lastfm-media-button",
    ".lastfm-track-panel-related-button",
    ".lastfm-track-panel-cta",
    ".steam-sidebar-link",
    "[tabindex]:not([tabindex='-1'])"
  ].join(", ");
  const MAX_LOG_ENTRIES = 200;
  const MAX_VOICES = 6;
  const ACTIVATE_COOLDOWN_MS = 70;
  const HOVER_COOLDOWN_MS = 120;
  const FOCUS_COOLDOWN_MS = 120;
  const ACTIVATE_FLUSH_DELAY_MS = 0;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function isFinePointerDevice() {
    return Boolean(window.matchMedia?.("(pointer: fine)")?.matches);
  }
  function isDisabledTarget(target) {
    if (!(target instanceof HTMLElement)) return true;
    if (target.hidden) return true;
    if (target.getAttribute("aria-hidden") === "true") return true;
    if (target.hasAttribute("disabled")) return true;
    if (target.getAttribute("aria-disabled") === "true") return true;
    return false;
  }
  function trimText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
  function resolveActionableTarget(sourceTarget) {
    if (!(sourceTarget instanceof Element)) return null;
    const match = sourceTarget.closest(DEFAULT_ACTIONABLE_SELECTOR);
    if (!(match instanceof HTMLElement)) return null;
    if (match.matches("input[type='range']")) return null;
    if (isDisabledTarget(match)) return null;
    return match;
  }
  function describeTarget(target) {
    if (!(target instanceof HTMLElement)) return "interaction";
    const explicitSource = trimText(target.dataset.sfxSource);
    if (explicitSource) return explicitSource;
    if (target.id) return target.id;
    if (target.matches("[data-mobile-speaker-toggle]")) return "mobileSpeakerToggle";
    if (target.matches("[data-lastfm-panel-art-toggle]")) return "lastfmPanelArtToggle";
    if (target.matches("[data-lastfm-panel-art-back]")) return "lastfmPanelArtBack";
    if (target.matches(".lastfm-track-panel-close")) return "lastfmTrackPanelClose";
    if (target.matches(".external-link-confirm-button--accept")) return "externalConfirmAccept";
    if (target.matches(".external-link-confirm-button--new-tab")) return "externalConfirmNewTab";
    if (target.matches(".external-link-confirm-button--cancel")) return "externalConfirmCancel";
    if (target.matches(".external-link-confirm-close")) return "externalConfirmClose";
    if (target.matches(".external-link-confirm-backdrop")) return "externalConfirmBackdrop";
    if (target.matches(".steam-sidebar-link--icon-only")) return "sidebarIconLink";
    if (target.matches(".steam-sidebar-link")) return "sidebarLink";
    if (target.matches(".lastfm-recent-button")) return "lastfmRecentButton";
    if (target.matches(".lastfm-media-button")) return "lastfmMediaButton";
    if (target.matches(".steam-activity-row-button")) return "steamActivityRowButton";
    if (target.matches(".lastfm-track-panel-cta")) return "lastfmTrackPanelCta";
    if (target.matches(".lastfm-track-panel-related-button")) return "lastfmTrackPanelRelatedButton";
    const ariaLabel = trimText(target.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel.slice(0, 64);
    const title = trimText(target.getAttribute("title"));
    if (title) return title.slice(0, 64);
    const text = trimText(target.textContent);
    if (text) return text.slice(0, 64);
    return target.tagName.toLowerCase();
  }
  function getActionableCenterY(target) {
    if (!(target instanceof HTMLElement)) return null;
    const rect = target.getBoundingClientRect();
    if (!Number.isFinite(rect.top) || !Number.isFinite(rect.height)) return null;
    return rect.top + rect.height * 0.5;
  }
  function normalizePointerDirection(deltaY) {
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 6) return "flat";
    return deltaY > 0 ? "down" : "up";
  }
  function resolveDirectionalPitchShift(deltaY) {
    if (!Number.isFinite(deltaY) || Math.abs(deltaY) < 6) return 0;
    const normalized = clamp(deltaY / 150, -1, 1);
    return clamp(-normalized * 0.18, -0.18, 0.18);
  }
  function sanitizePlaybackMeta(meta) {
    const pointerDeltaY = Number(meta?.pointerDeltaY);
    const pointerDirection = meta?.pointerDirection === "up" || meta?.pointerDirection === "down" ? meta.pointerDirection : "flat";
    const pitchShift = clamp(Number(meta?.pitchShift) || 0, -0.24, 0.24);
    return {
      pointerDeltaY: Number.isFinite(pointerDeltaY) ? Number(pointerDeltaY.toFixed(2)) : 0,
      pointerDirection,
      pitchShift: Number(pitchShift.toFixed(4))
    };
  }
  function createNoiseBuffer(audioContext) {
    const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.25, audioContext.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }
  function ensureLogStore() {
    if (!Array.isArray(window.__internetAngelInteractionSfxLog)) {
      window.__internetAngelInteractionSfxLog = [];
    }
    return window.__internetAngelInteractionSfxLog;
  }
  function isAudioContextLike(value) {
    return Boolean(value && typeof value.createGain === "function" && typeof value.createOscillator === "function");
  }
  function isGainNodeLike(value) {
    return Boolean(value && value.gain && typeof value.connect === "function");
  }
  function isAudioBufferLike(value) {
    return Boolean(value && typeof value.getChannelData === "function");
  }
  function createInternetAngelInteractionSfx(options = {}) {
    const page = String(options.page || "josie") === "intro" ? "intro" : "josie";
    const isProxyMode = window.parent !== window && Boolean(window.__josieHandoffMode);
    const state = {
      ready: false,
      unlocked: isProxyMode,
      ownerMode: isProxyMode ? "proxy" : "top",
      page
    };
    let audioContext = null;
    let masterGain = null;
    let noiseBuffer = null;
    let trustedProxyWindow = null;
    let externalAudioActive = false;
    let unlockPromise = null;
    let disposed = false;
    let lastActivateAt = 0;
    let lastPointerIntentAt = 0;
    let pendingActivateTimer = 0;
    let pendingActivateRequest = null;
    let lastHoveredTarget = null;
    let lastHoveredCenterY = null;
    const activeVoices = [];
    const hoverTimestamps = new WeakMap();
    const focusTimestamps = new WeakMap();
    const boundRoots = new WeakMap();
    const pendingBeforeUnlock = [];
    function getBaseGain() {
      return isFinePointerDevice() ? 0.18 : 0.16;
    }
    function getEffectiveMasterGain() {
      return getBaseGain() * (externalAudioActive ? 0.85 : 1);
    }
    function syncMasterGain() {
      if (!isGainNodeLike(masterGain)) return;
      const nextValue = getEffectiveMasterGain();
      try {
        const now = audioContext?.currentTime || 0;
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(nextValue, now);
      } catch {
        masterGain.gain.value = nextValue;
      }
    }
    function ensureAudioGraph() {
      if (isProxyMode) {
        state.ready = true;
        return null;
      }
      if (audioContext) return audioContext;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) {
        state.ready = true;
        return null;
      }
      try {
        audioContext = new AudioContextCtor();
        masterGain = audioContext.createGain();
        masterGain.connect(audioContext.destination);
        noiseBuffer = createNoiseBuffer(audioContext);
        syncMasterGain();
      } catch {
        audioContext = null;
        masterGain = null;
        noiseBuffer = null;
      }
      state.ready = true;
      return audioContext;
    }
    function cleanupVoices(now = performance.now()) {
      for (let index = activeVoices.length - 1; index >= 0; index -= 1) {
        if (now > activeVoices[index].endsAt + 80) {
          activeVoices.splice(index, 1);
        }
      }
    }
    function pushVoice(stop, endsAt) {
      cleanupVoices();
      while (activeVoices.length >= MAX_VOICES) {
        const oldest = activeVoices.shift();
        try {
          oldest?.stop?.();
        } catch {
        }
      }
      activeVoices.push({ stop, endsAt });
    }
    function withRandomSpread(value, spreadFraction) {
      const spread = value * spreadFraction;
      return value + (Math.random() * 2 - 1) * spread;
    }
    function createEnvelopeNode(startTime, attackSeconds, releaseSeconds, gainValue) {
      if (!isAudioContextLike(audioContext) || !isGainNodeLike(masterGain)) {
        return null;
      }
      const gainNode = audioContext.createGain();
      gainNode.connect(masterGain);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, gainValue), startTime + attackSeconds);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + attackSeconds + releaseSeconds);
      return gainNode;
    }
    function playNoiseBurst(startTime, durationSeconds, filterFrequency, gainValue) {
      if (!isAudioContextLike(audioContext) || !isAudioBufferLike(noiseBuffer) || !isGainNodeLike(masterGain)) {
        return;
      }
      const source = audioContext.createBufferSource();
      source.buffer = noiseBuffer;
      const filter = audioContext.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = filterFrequency;
      filter.Q.value = 0.8;
      const gainNode = createEnvelopeNode(startTime, 0.008, durationSeconds, gainValue);
      if (!isGainNodeLike(gainNode)) return;
      source.connect(filter);
      filter.connect(gainNode);
      source.start(startTime);
      source.stop(startTime + durationSeconds + 0.04);
      pushVoice(() => source.stop(), performance.now() + (durationSeconds + 0.05) * 1000);
    }
    function playOscillatorVoice(startTime, shape, fromFrequency, toFrequency, durationSeconds, gainValue) {
      if (!isAudioContextLike(audioContext) || !isGainNodeLike(masterGain)) {
        return;
      }
      const oscillator = audioContext.createOscillator();
      oscillator.type = shape;
      oscillator.frequency.setValueAtTime(fromFrequency, startTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(80, toFrequency), startTime + durationSeconds);
      const gainNode = createEnvelopeNode(startTime, 0.007, durationSeconds, gainValue);
      if (!isGainNodeLike(gainNode)) return;
      oscillator.connect(gainNode);
      oscillator.start(startTime);
      oscillator.stop(startTime + durationSeconds + 0.05);
      pushVoice(() => oscillator.stop(), performance.now() + (durationSeconds + 0.06) * 1000);
    }
    function playPreset(soundId, meta = {}) {
      ensureAudioGraph();
      if (!isAudioContextLike(audioContext) || !isGainNodeLike(masterGain)) {
        return sanitizePlaybackMeta(meta);
      }
      const startTime = Math.max(audioContext.currentTime, audioContext.currentTime + clamp((Math.random() * 2 - 1) * 0.006, -0.006, 0.006));
      const gainScale = getEffectiveMasterGain();
      const resolvedMeta = sanitizePlaybackMeta(meta);
      const hoverPitchJitter = soundId === "hover_soft" ? clamp((Math.random() * 2 - 1) * 0.055, -0.055, 0.055) : 0;
      if (soundId === "hover_soft") {
        resolvedMeta.pitchShift = Number(clamp(resolvedMeta.pitchShift + hoverPitchJitter, -0.24, 0.24).toFixed(4));
      }
      const hoverPitchMultiplier = 1 + resolvedMeta.pitchShift;
      const baseFrequencies = {
        hover_soft: [980 * hoverPitchMultiplier, 1560 * hoverPitchMultiplier],
        activate_soft: [withRandomSpread(760, 0.03), withRandomSpread(1240, 0.03)],
        open_soft: [withRandomSpread(640, 0.03), withRandomSpread(1180, 0.03)],
        close_soft: [withRandomSpread(940, 0.03), withRandomSpread(520, 0.03)],
        confirm_soft: [withRandomSpread(860, 0.03), withRandomSpread(1340, 0.03)],
        cancel_soft: [withRandomSpread(720, 0.03), withRandomSpread(420, 0.03)],
        flip_soft: [withRandomSpread(1320, 0.03), withRandomSpread(760, 0.03)],
        toggle_soft: [withRandomSpread(840, 0.03), withRandomSpread(980, 0.03)],
        preview_soft: [withRandomSpread(920, 0.03), withRandomSpread(1560, 0.03)]
      };
      const [fromFrequency, toFrequency] = baseFrequencies[soundId] || baseFrequencies.activate_soft;
      const gainVariance = soundId === "hover_soft" ? clamp(withRandomSpread(1, 0.08), 0.88, 1.12) : clamp(withRandomSpread(1, 0.08), 0.82, 1.12);
      switch (soundId) {
        case "hover_soft":
          playOscillatorVoice(startTime, "sine", fromFrequency, toFrequency, 0.075, gainScale * 0.18 * gainVariance);
          playOscillatorVoice(startTime + 0.01, "triangle", fromFrequency * 1.16, toFrequency * 1.06, 0.06, gainScale * 0.08 * gainVariance);
          break;
        case "activate_soft":
          playOscillatorVoice(startTime, "triangle", fromFrequency, toFrequency, 0.115, gainScale * 0.24 * gainVariance);
          playOscillatorVoice(startTime + 0.012, "sine", fromFrequency * 1.4, toFrequency * 1.06, 0.09, gainScale * 0.14 * gainVariance);
          break;
        case "open_soft":
          playOscillatorVoice(startTime, "triangle", fromFrequency, toFrequency, 0.16, gainScale * 0.23 * gainVariance);
          playNoiseBurst(startTime + 0.006, 0.12, 1800, gainScale * 0.06 * gainVariance);
          break;
        case "close_soft":
          playOscillatorVoice(startTime, "sine", fromFrequency, toFrequency, 0.14, gainScale * 0.18 * gainVariance);
          playNoiseBurst(startTime, 0.095, 1200, gainScale * 0.05 * gainVariance);
          break;
        case "confirm_soft":
          playOscillatorVoice(startTime, "triangle", fromFrequency, toFrequency, 0.15, gainScale * 0.24 * gainVariance);
          playOscillatorVoice(startTime + 0.028, "sine", fromFrequency * 1.24, toFrequency * 1.08, 0.12, gainScale * 0.13 * gainVariance);
          break;
        case "cancel_soft":
          playOscillatorVoice(startTime, "sine", fromFrequency, toFrequency, 0.11, gainScale * 0.16 * gainVariance);
          playNoiseBurst(startTime, 0.08, 980, gainScale * 0.04 * gainVariance);
          break;
        case "flip_soft":
          playOscillatorVoice(startTime, "triangle", fromFrequency, toFrequency, 0.1, gainScale * 0.17 * gainVariance);
          playNoiseBurst(startTime + 0.01, 0.055, 2200, gainScale * 0.035 * gainVariance);
          break;
        case "toggle_soft":
          playOscillatorVoice(startTime, "sine", fromFrequency, toFrequency, 0.09, gainScale * 0.19 * gainVariance);
          break;
        case "preview_soft":
          playOscillatorVoice(startTime, "triangle", fromFrequency, toFrequency, 0.14, gainScale * 0.22 * gainVariance);
          playOscillatorVoice(startTime + 0.014, "sine", fromFrequency * 1.5, toFrequency * 1.12, 0.1, gainScale * 0.12 * gainVariance);
          break;
        default:
          playOscillatorVoice(startTime, "triangle", fromFrequency, toFrequency, 0.12, gainScale * 0.18 * gainVariance);
          break;
      }
      return resolvedMeta;
    }
    function logPlayback(request) {
      const resolvedMeta = sanitizePlaybackMeta(request?.meta || {});
      const detail = {
        soundId: request.soundId,
        source: request.source,
        ownerMode: state.ownerMode,
        page: state.page,
        timestamp: Date.now(),
        pointerDeltaY: resolvedMeta.pointerDeltaY,
        pointerDirection: resolvedMeta.pointerDirection,
        pitchShift: resolvedMeta.pitchShift
      };
      const log = ensureLogStore();
      log.push(detail);
      if (log.length > MAX_LOG_ENTRIES) {
        log.splice(0, log.length - MAX_LOG_ENTRIES);
      }
      window.dispatchEvent(new CustomEvent("internet-angel:interaction-sfx", {
        detail
      }));
    }
    function normalizeRequest(request) {
      const source = trimText(request?.source) || "interaction";
      const soundId = SOUND_IDS.has(request?.soundId) ? request.soundId : "activate_soft";
      const meta = request?.meta && typeof request.meta === "object" ? request.meta : {};
      return { soundId, source, meta };
    }
    function clearPendingActivate() {
      if (pendingActivateTimer) {
        window.clearTimeout(pendingActivateTimer);
        pendingActivateTimer = 0;
      }
      pendingActivateRequest = null;
    }
    function flushPendingBeforeUnlock() {
      if (!state.unlocked || !pendingBeforeUnlock.length) return;
      const pending = pendingBeforeUnlock.splice(0, pendingBeforeUnlock.length);
      pending.forEach((request) => {
        play(request);
      });
    }
    function dispatchLocalPlayback(request) {
      cleanupVoices();
      let resolvedMeta = request?.meta || {};
      try {
        resolvedMeta = playPreset(request.soundId, request.meta) || request.meta || {};
      } catch {
      }
      logPlayback({
        ...request,
        meta: {
          ...(request?.meta && typeof request.meta === "object" ? request.meta : {}),
          ...(resolvedMeta && typeof resolvedMeta === "object" ? resolvedMeta : {})
        }
      });
    }
    function acceptProxyRequest(event) {
      if (event.origin !== window.location.origin) return;
      if (trustedProxyWindow && event.source !== trustedProxyWindow) return;
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.type !== PLAY_MESSAGE_TYPE) return;
      const request = normalizeRequest(payload);
      if (!state.unlocked) {
        pendingBeforeUnlock.push(request);
        return;
      }
      dispatchLocalPlayback(request);
    }
    function play(request) {
      if (disposed) return;
      const normalized = normalizeRequest(request);
      if (normalized.soundId !== "activate_soft") {
        clearPendingActivate();
      }
      if (isProxyMode) {
        try {
          window.parent.postMessage({
            type: PLAY_MESSAGE_TYPE,
            soundId: normalized.soundId,
            source: normalized.source,
            meta: normalized.meta,
            timestamp: Date.now()
          }, window.location.origin);
        } catch {
        }
        return;
      }
      if (normalized.soundId === "activate_soft") {
        const now = Date.now();
        if (now - lastActivateAt < ACTIVATE_COOLDOWN_MS) return;
        lastActivateAt = now;
      }
      if (!state.unlocked) {
        pendingBeforeUnlock.push(normalized);
        if (pendingBeforeUnlock.length > 24) {
          pendingBeforeUnlock.splice(0, pendingBeforeUnlock.length - 24);
        }
        return;
      }
      dispatchLocalPlayback(normalized);
    }
    async function initFromGesture(source = "interaction") {
      if (disposed) return;
      if (state.ownerMode === "proxy") {
        state.ready = true;
        state.unlocked = true;
        return;
      }
      ensureAudioGraph();
      if (state.unlocked) {
        flushPendingBeforeUnlock();
        return;
      }
      state.ready = true;
      state.unlocked = true;
      if (unlockPromise) {
        await unlockPromise;
        return;
      }
      unlockPromise = (async () => {
        if (audioContext && audioContext.state === "suspended") {
          try {
            await Promise.race([
              audioContext.resume(),
              new Promise((resolve) => window.setTimeout(resolve, 180))
            ]);
          } catch {
          }
        }
        flushPendingBeforeUnlock();
      })().finally(() => {
        unlockPromise = null;
      });
      await unlockPromise;
    }
    function scheduleActivate(source) {
      clearPendingActivate();
      pendingActivateRequest = {
        soundId: "activate_soft",
        source,
        meta: {}
      };
      pendingActivateTimer = window.setTimeout(() => {
        pendingActivateTimer = 0;
        const request = pendingActivateRequest;
        pendingActivateRequest = null;
        if (!request) return;
        play(request);
      }, ACTIVATE_FLUSH_DELAY_MS);
    }
    function bindDelegatedRoot(root) {
      const target = root instanceof Document || root instanceof HTMLElement ? root : null;
      if (!target || boundRoots.has(target)) {
        return () => {
        };
      }
      const onPointerDown = (event) => {
        const actionable = resolveActionableTarget(event.target);
        if (!actionable) return;
        lastPointerIntentAt = Date.now();
        void initFromGesture(describeTarget(actionable));
      };
      const onClick = (event) => {
        const actionable = resolveActionableTarget(event.target);
        if (!actionable) return;
        scheduleActivate(describeTarget(actionable));
      };
      const onKeyDown = (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        const actionable = resolveActionableTarget(event.target);
        if (!actionable) return;
        void initFromGesture(describeTarget(actionable));
      };
      const onPointerOver = (event) => {
        if (!isFinePointerDevice() || !state.unlocked) return;
        const actionable = resolveActionableTarget(event.target);
        if (!actionable) return;
        if (actionable === lastHoveredTarget && Date.now() - (hoverTimestamps.get(actionable) || 0) < HOVER_COOLDOWN_MS) {
          return;
        }
        if (actionable.contains(event.relatedTarget)) return;
        const now = Date.now();
        if (now - (hoverTimestamps.get(actionable) || 0) < HOVER_COOLDOWN_MS) return;
        const centerY = getActionableCenterY(actionable);
        const pointerDeltaY = Number.isFinite(centerY) && Number.isFinite(lastHoveredCenterY) ? centerY - lastHoveredCenterY : 0;
        const pointerDirection = normalizePointerDirection(pointerDeltaY);
        const pitchShift = resolveDirectionalPitchShift(pointerDeltaY);
        hoverTimestamps.set(actionable, now);
        lastHoveredTarget = actionable;
        lastHoveredCenterY = Number.isFinite(centerY) ? centerY : null;
        play({
          soundId: "hover_soft",
          source: describeTarget(actionable),
          meta: {
            pointerDeltaY,
            pointerDirection,
            pitchShift
          }
        });
      };
      const onFocusIn = (event) => {
        if (!state.unlocked) return;
        const actionable = resolveActionableTarget(event.target);
        if (!actionable) return;
        const now = Date.now();
        if (now - lastPointerIntentAt < 160) return;
        if (now - (focusTimestamps.get(actionable) || 0) < FOCUS_COOLDOWN_MS) return;
        focusTimestamps.set(actionable, now);
        play({
          soundId: "hover_soft",
          source: describeTarget(actionable),
          meta: {
            pointerDeltaY: 0,
            pointerDirection: "flat",
            pitchShift: 0
          }
        });
      };
      target.addEventListener("pointerdown", onPointerDown, true);
      target.addEventListener("click", onClick, true);
      target.addEventListener("keydown", onKeyDown, true);
      target.addEventListener("pointerover", onPointerOver, true);
      target.addEventListener("focusin", onFocusIn, true);
      const unbind = () => {
        target.removeEventListener("pointerdown", onPointerDown, true);
        target.removeEventListener("click", onClick, true);
        target.removeEventListener("keydown", onKeyDown, true);
        target.removeEventListener("pointerover", onPointerOver, true);
        target.removeEventListener("focusin", onFocusIn, true);
        boundRoots.delete(target);
      };
      boundRoots.set(target, unbind);
      return unbind;
    }
    function setExternalAudioActive(active) {
      externalAudioActive = Boolean(active);
      syncMasterGain();
    }
    function getState() {
      return {
        ready: state.ready,
        unlocked: state.unlocked,
        ownerMode: state.ownerMode,
        page: state.page
      };
    }
    function setTrustedProxyWindow(nextWindow) {
      trustedProxyWindow = nextWindow || null;
    }
    function setPage(nextPage) {
      state.page = String(nextPage || "josie") === "intro" ? "intro" : "josie";
    }
    if (!isProxyMode) {
      window.addEventListener("message", acceptProxyRequest);
    } else {
      state.ready = true;
    }
    return {
      initFromGesture,
      play,
      bindDelegatedRoot,
      setExternalAudioActive,
      getState,
      setTrustedProxyWindow,
      setPage
    };
  }
  window.__createInternetAngelInteractionSfx = createInternetAngelInteractionSfx;
})();
