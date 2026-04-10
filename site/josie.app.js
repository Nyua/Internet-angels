// Editable live client source. This is the file the build now promotes to josie.client.js.
(() => {
  var define_import_meta_env_default = {};
  var root = document.querySelector(".corner-shell");
  var osStage = document.querySelector("#os-stage");
  var osAmbientBackdrop = document.querySelector("#os-ambient-backdrop");
  var osAmbientCanvas = document.querySelector("#os-ambient-canvas");
  var osAmbientCanvasBase = document.querySelector("#os-ambient-canvas-base");
  var osAmbientCanvasGlow = document.querySelector("#os-ambient-canvas-glow");
  var socialHubRoot = document.querySelector("#social-hub-root");
  var socialHubProfile = document.querySelector("#social-hub-profile");
  var socialHubShowcases = document.querySelector("#social-hub-showcases");
  var socialHubSidebar = document.querySelector("#social-hub-sidebar");
  var socialHubProfileTagline = document.querySelector("#social-hub-profile-tagline");
  var siteAudioControl = document.querySelector("[data-site-audio-control]");
  var siteVolumeSlider = document.querySelector("[data-site-volume-slider]");
  var mobileSpeakerToggle = document.querySelector("[data-mobile-speaker-toggle]");
  var interactionSfx = window.__internetAngelInteractionSfx || null;
  var CUSTOM_CURSOR_INTERACTIVE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "[role='button']",
    "[data-open-url]",
    "summary",
    "input:not([type='hidden']):not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ].join(", ");
  var socialHubInitialized = false;
  var socialHubRenderer = null;
  var socialHubState = null;
  var ambientBackdropController = null;
  var siteCursorController = null;
  function startDocumentTitleTypewriter(finalTitle = "Josie") {
    const safeTitle = String(finalTitle || "").trim();
    if (!safeTitle) return;
    const chars = Array.from(safeTitle);
    let index = 0;
    let blink = true;
    const writeNext = () => {
      if (index >= chars.length) {
        document.title = safeTitle;
        window.__internetAngelTitleTypewriterDone = true;
        return;
      }
      index += 1;
      document.title = `${chars.slice(0, index).join("")}${blink ? "|" : ""}`;
      blink = !blink;
      window.setTimeout(writeNext, 95);
    };
    window.__internetAngelTitleTypewriterDone = false;
    document.title = "|";
    window.setTimeout(writeNext, 180);
  }
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  function applyPermanentNightTheme() {
    if (!(document.body instanceof HTMLElement)) return;
    document.body.setAttribute("data-theme-resolved", "night");
    document.body.removeAttribute("data-theme-mode");
  }
  // src/josie/social-hub/config.js
  var SOCIAL_HUB_SITES = [
    {
      id: "twitter",
      label: "X / Twitter",
      shortLabel: "X",
      url: "https://x.com/ProbablyLaced",
      refreshIntervalMs: 0,
      bootRefresh: false,
      autoRefresh: false
    },
    {
      id: "steam",
      label: "Steam",
      shortLabel: "ST",
      url: "https://steamcommunity.com/id/foundlifeless/",
      refreshIntervalMs: 24 * 60 * 60 * 1e3,
      visibleOnly: true
    },
    {
      id: "discord",
      label: "Discord",
      shortLabel: "DC",
      url: "https://discord.com/users/331350000154050560",
      refreshIntervalMs: 30 * 60 * 1e3,
      visibleOnly: true
    },
    {
      id: "lastfm",
      label: "Last.fm",
      shortLabel: "FM",
      url: "https://www.last.fm/user/FoundLifeless",
      refreshIntervalMs: 60 * 60 * 1e3,
      visibleOnly: true
    },
    {
      id: "spotify",
      label: "Spotify",
      shortLabel: "SP",
      url: "https://open.spotify.com/playlist/1Cim4pZnFmNXD8N4OtO3wz?si=b75cc9f3073a473b&nd=1&dlsi=49ce9ea61601457a",
      refreshIntervalMs: 0,
      bootRefresh: false,
      autoRefresh: false
    },
    {
      id: "soundcloud",
      label: "SoundCloud",
      shortLabel: "SC",
      url: "https://soundcloud.com/probablylacedwithfentanyl",
      refreshIntervalMs: 0,
      bootRefresh: false,
      autoRefresh: false
    }
  ];
  var LASTFM_PROXY_REFRESH_INTERVAL_MS = 60 * 60 * 1e3;
  var STEAM_PROXY_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1e3;
  var DISCORD_REFRESH_INTERVAL_MS = 30 * 60 * 1e3;
  var COMPACT_MOBILE_LAYOUT_MAX_WIDTH_PX = 820;
  var DISCORD_PROFILE_HANDLE = "foundlifeless";
  var PROFILE_LINK_SITE_IDS = /* @__PURE__ */ new Set(["soundcloud", "spotify", "lastfm", "discord", "steam", "twitter"]);
  var compactMobileLayoutQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(`(max-width: ${COMPACT_MOBILE_LAYOUT_MAX_WIDTH_PX}px)`) : null;
  function isCompactMobileLayout() {
    if (typeof window === "undefined") return false;
    return Boolean(window.matchMedia?.(`(max-width: ${COMPACT_MOBILE_LAYOUT_MAX_WIDTH_PX}px)`)?.matches || window.innerWidth <= COMPACT_MOBILE_LAYOUT_MAX_WIDTH_PX);
  }
  function shouldFetchSitePayload(siteId) {
    const normalizedSiteId = String(siteId || "").trim().toLowerCase();
    if (!normalizedSiteId) return false;
    if (isCompactMobileLayout()) {
      return normalizedSiteId === "steam" || normalizedSiteId === "discord";
    }
    return normalizedSiteId === "steam" || normalizedSiteId === "discord" || normalizedSiteId === "lastfm";
  }
  function resolveSiteAutoRefreshPolicy(site) {
    const source = site && typeof site === "object" ? site : {};
    const siteId = String(source.id || "").trim();
    const compactMobile = isCompactMobileLayout();
    const basePolicy = {
      bootRefresh: source.bootRefresh !== false,
      autoRefresh: source.autoRefresh !== false,
      visibleOnly: Boolean(source.visibleOnly),
      intervalMs: clamp2(Number(source.refreshIntervalMs) || 0, 0, 24 * 60 * 60 * 1e3)
    };
    if (siteId === "steam") {
      return {
        ...basePolicy,
        visibleOnly: true,
        intervalMs: STEAM_PROXY_REFRESH_INTERVAL_MS
      };
    }
    if (siteId === "discord") {
      return {
        ...basePolicy,
        visibleOnly: true,
        intervalMs: DISCORD_REFRESH_INTERVAL_MS
      };
    }
    if (siteId === "lastfm") {
      return {
        ...basePolicy,
        bootRefresh: !compactMobile,
        autoRefresh: !compactMobile,
        visibleOnly: true,
        intervalMs: compactMobile ? 0 : LASTFM_PROXY_REFRESH_INTERVAL_MS
      };
    }
    if (siteId === "twitter" || siteId === "spotify" || siteId === "soundcloud") {
      return {
        ...basePolicy,
        bootRefresh: false,
        autoRefresh: false,
        intervalMs: 0
      };
    }
    return basePolicy;
  }
  var DISCORD_PROFILE_OVERRIDES = {
    bannerUrl: "",
    bio: "",
    decorationUrl: ""
  };
  var HERO_DESCRIPTION_TEXT = "The Internet Angel";
  var BASE_SEED_AT = Date.parse("2026-02-24T00:00:00.000Z");
  function buildTwitterSeed() {
    return {
      siteId: "twitter",
      profile: {
        name: "ProbablyLaced",
        handle: "@ProbablyLaced",
        url: "https://x.com/ProbablyLaced",
        avatarUrl: "",
        bio: "Operator feed mirror for Josie social array."
      },
      stats: [
        { label: "Followers", value: "Live" },
        { label: "Following", value: "Live" },
        { label: "Posts", value: "Live" }
      ],
      items: [
        { id: "seed-twitter-1", title: "Live timeline warming...", meta: "Waiting for extractor signal" },
        { id: "seed-twitter-2", title: "Fallback mode active", meta: "Card remains interactive without redirect" }
      ],
      embeds: {},
      updatedAt: BASE_SEED_AT,
      freshnessStatus: "STATIC",
      sourceStatus: "PARTIAL"
    };
  }
  function buildSteamSeed() {
    return {
      siteId: "steam",
      profile: {
        name: "FoundLifeless",
        handle: "steamcommunity.com/id/foundlifeless",
        url: "https://steamcommunity.com/id/foundlifeless/",
        avatarUrl: "",
        borderImageUrl: "",
        borderVideoUrl: "",
        statusText: "Status pending",
        levelBadgeLabel: "Level --",
        bio: "\u02DA\u208A\u2027\uA4B0\u10D0 \u2661 \u0ED2\uA4B1 \u2027\u208A\u02DA"
      },
      stats: [
        { label: "Level", value: "--" },
        { label: "Status", value: "Pending" },
        { label: "2W Hours", value: "--" },
        { label: "Recent Games", value: "--" }
      ],
      items: [
        { id: "seed-steam-1", title: "Recent activity pending", meta: "Awaiting Steam profile extraction" },
        { id: "seed-steam-2", title: "2-week hours pending", meta: "Live scrape retry queued" }
      ],
      embeds: {},
      updatedAt: BASE_SEED_AT,
      freshnessStatus: "STATIC",
      sourceStatus: "PARTIAL"
    };
  }
  function buildDiscordSeed() {
    const overrideBanner = String(DISCORD_PROFILE_OVERRIDES.bannerUrl || "").trim();
    const overrideBio = String(DISCORD_PROFILE_OVERRIDES.bio || "").trim();
    const overrideDecoration = String(DISCORD_PROFILE_OVERRIDES.decorationUrl || "").trim();
    return {
      siteId: "discord",
      profile: {
        name: "foundlifeless",
        handle: "@foundlifeless",
        url: "https://discord.com/users/331350000154050560",
        avatarUrl: "",
        statusText: "Unknown",
        statusKey: "unknown",
        bannerUrl: overrideBanner,
        decorationUrl: overrideDecoration,
        bio: overrideBio || "Discord profile card synced with Lanyard."
      },
      stats: [
        { label: "Status", value: "Unknown" },
        { label: "Presence Source", value: "Best effort" },
        { label: "Activities", value: "--" }
      ],
      items: [
        { id: "seed-discord-1", title: "Activity unavailable", meta: "Awaiting live presence feed" }
      ],
      activities: [],
      presence: {
        displayName: "foundlifeless",
        username: "foundlifeless",
        statusKey: "unknown",
        statusLabel: "Unknown",
        avatarUrl: "",
        avatarDecorationUrl: overrideDecoration,
        bannerUrl: overrideBanner,
        hasNitro: false,
        nitroBadgeIconUrl: "",
        customStatusText: "",
        primaryActivity: null,
        spotify: {
          isListening: false,
          song: "",
          artist: "",
          album: "",
          albumArtUrl: "",
          trackUrl: ""
        }
      },
      embeds: {},
      updatedAt: BASE_SEED_AT,
      freshnessStatus: "STATIC",
      sourceStatus: "PARTIAL"
    };
  }
  function buildLastFmSeed() {
    const recentTracks = [
      {
        id: "seed-lastfm-recent-1",
        title: "Loading recent songs...",
        subtitle: "Awaiting Last.fm payload",
        countLabel: "--",
        imageUrl: "",
        url: "https://www.last.fm/user/FoundLifeless",
        meta: "Awaiting Last.fm payload | --"
      },
      {
        id: "seed-lastfm-recent-2",
        title: "Fallback active",
        subtitle: "Extractor/API handoff pending",
        countLabel: "--",
        imageUrl: "",
        url: "https://www.last.fm/user/FoundLifeless",
        meta: "Extractor/API handoff pending | --"
      }
    ];
    const topArtists = [
      {
        id: "seed-lastfm-artist-1",
        title: "Top artists loading",
        subtitle: "",
        countLabel: "-- plays",
        imageUrl: "",
        url: "https://www.last.fm/user/FoundLifeless/library/artists"
      }
    ];
    const topAlbums = [
      {
        id: "seed-lastfm-album-1",
        title: "Top albums loading",
        subtitle: "",
        countLabel: "-- plays",
        imageUrl: "",
        url: "https://www.last.fm/user/FoundLifeless/library/albums"
      }
    ];
    const profileTotals = {
      scrobbles: "--",
      artists: "--",
      lovedTracks: "--"
    };
    return {
      siteId: "lastfm",
      profile: {
        name: "FoundLifeless",
        handle: "last.fm/user/FoundLifeless",
        url: "https://www.last.fm/user/FoundLifeless",
        avatarUrl: "",
        bio: "Last.fm compact feed is warming up."
      },
      stats: [
        { label: "Feed", value: "Live+Fallback" },
        { label: "Scrobbles", value: "--" },
        { label: "Artists", value: "--" },
        { label: "Loved Tracks", value: "--" },
        { label: "Recent", value: "--" }
      ],
      items: recentTracks,
      sections: {
        recentTracks,
        topArtists,
        topAlbums,
        profileTotals
      },
      embeds: {},
      updatedAt: BASE_SEED_AT,
      freshnessStatus: "STATIC",
      sourceStatus: "PARTIAL"
    };
  }
  function buildSpotifySeed() {
    return {
      siteId: "spotify",
      profile: {
        name: "Spotify Playlist",
        handle: "open.spotify.com",
        url: "https://open.spotify.com/playlist/1Cim4pZnFmNXD8N4OtO3wz?si=b75cc9f3073a473b&nd=1&dlsi=49ce9ea61601457a",
        avatarUrl: "",
        bio: "Playlist card with in-page embed."
      },
      stats: [
        { label: "Provider", value: "Spotify" },
        { label: "Tracks", value: "Live" },
        { label: "Mode", value: "Embed" }
      ],
      items: [
        { id: "seed-spotify-1", title: "Playlist metadata loading", meta: "Embed is available immediately" },
        { id: "seed-spotify-2", title: "Track list pending", meta: "Live extraction requested in background" }
      ],
      embeds: {
        spotifyEmbedUrl: "https://open.spotify.com/embed/playlist/1Cim4pZnFmNXD8N4OtO3wz?utm_source=generator"
      },
      updatedAt: BASE_SEED_AT,
      freshnessStatus: "STATIC",
      sourceStatus: "PARTIAL"
    };
  }
  function buildSoundCloudSeed() {
    return {
      siteId: "soundcloud",
      profile: {
        name: "probablylacedwithfentanyl",
        handle: "soundcloud.com/probablylacedwithfentanyl",
        url: "https://soundcloud.com/probablylacedwithfentanyl",
        avatarUrl: "",
        bio: "SoundCloud profile with in-page widget."
      },
      stats: [
        { label: "Provider", value: "SoundCloud" },
        { label: "Mode", value: "Widget" },
        { label: "Source", value: "Live+fallback" }
      ],
      items: [
        { id: "seed-soundcloud-1", title: "Profile metadata loading", meta: "Widget is available immediately" },
        { id: "seed-soundcloud-2", title: "Recent tracks pending", meta: "Extractor data will replace fallback" }
      ],
      embeds: {
        soundcloudEmbedUrl: buildSoundCloudEmbedUrl("https://soundcloud.com/probablylacedwithfentanyl")
      },
      updatedAt: BASE_SEED_AT,
      freshnessStatus: "STATIC",
      sourceStatus: "PARTIAL"
    };
  }
  function buildSoundCloudEmbedUrl(url) {
    const encoded = encodeURIComponent(url);
    return `https://w.soundcloud.com/player/?url=${encoded}&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&visual=true`;
  }
  function buildSeedPayloadMap() {
    return {
      twitter: buildTwitterSeed(),
      steam: buildSteamSeed(),
      discord: buildDiscordSeed(),
      lastfm: buildLastFmSeed(),
      spotify: buildSpotifySeed(),
      soundcloud: buildSoundCloudSeed()
    };
  }
  function createSeedPayloadMap() {
    return buildSeedPayloadMap();
  }

  async function fetchWithTimeout(url, init, timeoutMs, signal) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } finally {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  async function fetchJsonWithTimeout(url, timeoutMs, signal, options = {}) {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        cache: options?.cacheMode || "no-store",
        headers: {
          Accept: "application/json"
        }
      },
      timeoutMs,
      signal
    );
    if (!response.ok) {
      throw new Error(`Request failed (${response.status})`);
    }
    return await response.json();
  }
  // src/josie/social-hub/data-sources.js
  var LASTFM_RECENT_TRACK_LIMIT = 10;
  var LASTFM_GRID_LIMIT = 8;
  function firstNonEmpty(...values) {
    for (const value of values) {
      const candidate = String(value ?? "").trim();
      if (candidate) return candidate;
    }
    return "";
  }
  function hashText(value) {
    let hash = 0;
    const source = String(value || "");
    for (let i = 0; i < source.length; i += 1) {
      hash = (hash << 5) - hash + source.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }
  function resolveUrl(raw, baseUrl = window.location.origin) {
    const value = String(raw ?? "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value, baseUrl);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      return "";
    }
    return "";
  }
  function parseSteamHoursLastTwoWeeks(value) {
    const text = String(value || "");
    const match = text.match(/([\d.,]+)\s*(?:hours|hour|hrs|hr)\s+past\s+2\s+weeks/i);
    return match?.[1] ? match[1] : "";
  }
  function parseSteamHoursOnRecord(value) {
    const text = String(value || "");
    const match = text.match(/([\d.,]+)\s*(?:hours|hour|hrs|hr)\s+on\s+record/i);
    return match?.[1] ? match[1] : "";
  }
  function parseSteamLastPlayed(value) {
    const text = String(value || "");
    const onMatch = text.match(/last\s+played\s+on\s+([^\n\r]+)/i);
    if (onMatch?.[1]) return onMatch[1].trim();
    const genericMatch = text.match(/last\s+played\s+([^\n\r]+)/i);
    if (genericMatch?.[1]) return genericMatch[1].trim();
    return "";
  }
  function formatSteamLastPlayedLabel(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (/^last played/i.test(text)) return text;
    return `last played on ${text}`;
  }
  function parseLastFmCountLabel(value, fallbackSuffix = "plays") {
    const raw = String(value || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    if (/play|scrobble/i.test(raw)) return raw;
    return `${raw} ${fallbackSuffix}`;
  }
  function pickLastFmCountValue(value, fallback = "") {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return fallback;
    const match = text.match(/(\d[\d,]*)/);
    return match?.[1] ? match[1] : fallback;
  }
  function pickFirstLastFmCountFromList(values, fallback = "") {
    const entries = Array.isArray(values) ? values : [];
    for (const entry of entries) {
      const picked = pickLastFmCountValue(entry);
      if (picked) return picked;
    }
    return fallback;
  }
  function upscaleLastFmImageUrl(url) {
    const source = String(url || "").trim();
    if (!source) return "";
    try {
      const parsed = new URL(source);
      parsed.pathname = parsed.pathname.replace(/\/i\/u\/avatar\d+s\//i, "/i/u/avatar300s/");
      parsed.pathname = parsed.pathname.replace(/\/i\/u\/\d+s\//i, "/i/u/770x0/");
      parsed.pathname = parsed.pathname.replace(/\/i\/u\/\d+x\d+\//i, "/i/u/770x0/");
      parsed.pathname = parsed.pathname.replace(/\/i\/u\/\d+x0\//i, "/i/u/770x0/");
      return parsed.toString();
    } catch {
      return source;
    }
  }
  function resolveLastFmImageUrl(raw, baseUrl = "https://www.last.fm") {
    const resolved = resolveUrl(raw, baseUrl);
    if (!resolved) return "";
    return upscaleLastFmImageUrl(resolved);
  }
  function pickLastFmImageUrl(images, fallback = "") {
    const list = Array.isArray(images) ? images : [];
    const sizePriority = ["extralarge", "large", "medium", "small"];
    for (const size of sizePriority) {
      const match = list.find((entry) => String(entry?.size || "").toLowerCase() === size);
      const candidate = firstNonEmpty(match?.["#text"], match?.url);
      const resolved = resolveLastFmImageUrl(candidate, "https://www.last.fm");
      if (resolved) return resolved;
    }
    for (const entry of list) {
      const candidate = firstNonEmpty(entry?.["#text"], entry?.url);
      const resolved = resolveLastFmImageUrl(candidate, "https://www.last.fm");
      if (resolved) return resolved;
    }
    return resolveLastFmImageUrl(fallback, "https://www.last.fm");
  }
  function isLastFmGenericImageUrl(url) {
    const normalized = String(url || "").trim().toLowerCase();
    return !normalized || normalized.includes("2a96cbd8b46e442fc41c2b86b821562f");
  }
  function pickUsefulLastFmImageUrl(images, fallback = "") {
    const picked = pickLastFmImageUrl(images, fallback);
    return isLastFmGenericImageUrl(picked) ? "" : picked;
  }
  function formatLastFmAgeLabel(uts, nowMs = Date.now()) {
    const numericUts = Number(uts);
    if (!Number.isFinite(numericUts) || numericUts <= 0) return "";
    const deltaMs = Math.max(0, nowMs - numericUts * 1e3);
    const hour = 60 * 60 * 1e3;
    const day = 24 * hour;
    if (deltaMs < hour) return "<1h ago";
    if (deltaMs < day) return `${Math.round(deltaMs / hour)}h ago`;
    return `${Math.round(deltaMs / day)}d ago`;
  }
  function normalizeLastFmArtistLabel(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const semicolonParts = text.split(";").map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (semicolonParts.length <= 1) return text;
    const unique = [];
    const seen = /* @__PURE__ */ new Set();
    for (const part of semicolonParts) {
      const key = part.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(part);
    }
    if (!unique.length) return text;
    if (unique.length === 1) return unique[0];
    if (unique.length <= 4) return unique.join(", ");
    return `${unique.slice(0, 3).join(", ")} +${unique.length - 3} more`;
  }
  function isLastFmNowPlayingLabel(value) {
    const label = String(value || "").toLowerCase();
    return label.includes("now playing") || label.includes("playing now") || label.includes("currently listening") || label.includes("listening now") || label.includes("scrobbling now");
  }
  function toLastFmRecentTrackItem({
    index,
    title,
    artist,
    album,
    countLabel,
    imageUrl,
    itemUrl,
    isNowPlaying = false,
    isLoved = false,
    monthlyTopRank = null,
    monthlyTopPlaycount = null
  }) {
    const safeTitle = firstNonEmpty(title, "Unknown track");
    const safeArtist = firstNonEmpty(normalizeLastFmArtistLabel(artist), "Unknown artist");
    const safeCountLabel = firstNonEmpty(countLabel, "recent");
    const safeAlbum = String(album || "").replace(/\s+/g, " ").trim();
    const parsedMonthlyRank = Number.parseInt(String(monthlyTopRank ?? "").trim(), 10);
    const meta = [safeArtist, safeCountLabel].filter(Boolean).join(" | ");
    return {
      id: `lastfm-recent-${index}-${hashText(`${safeTitle}-${safeArtist}-${safeCountLabel}`).slice(0, 12)}`,
      title: safeTitle,
      subtitle: safeArtist,
      album: safeAlbum,
      countLabel: safeCountLabel,
      imageUrl: resolveLastFmImageUrl(imageUrl, "https://www.last.fm"),
      url: resolveUrl(itemUrl, "https://www.last.fm"),
      isNowPlaying: Boolean(isNowPlaying),
      isLoved: Boolean(isLoved),
      monthlyTopRank: Number.isFinite(parsedMonthlyRank) ? parsedMonthlyRank : null,
      monthlyTopPlaycount: String(monthlyTopPlaycount || "").trim() || null,
      meta
    };
  }
  function mapLastFmRecentTracksFromApi(response, nowMs = Date.now()) {
    const rawTrack = response?.recenttracks?.track;
    const tracks = Array.isArray(rawTrack) ? rawTrack : rawTrack ? [rawTrack] : [];
    return tracks.slice(0, LASTFM_RECENT_TRACK_LIMIT).map((entry, index) => {
      const nowPlaying = entry?.["@attr"]?.nowplaying === "true";
      const title = firstNonEmpty(entry?.name, "Unknown track");
      const artist = firstNonEmpty(entry?.artist?.name, entry?.artist?.["#text"], "Unknown artist");
      const album = firstNonEmpty(entry?.album?.["#text"], "");
      const playedAtLabel = formatLastFmAgeLabel(entry?.date?.uts, nowMs);
      const fallbackPlayedAt = firstNonEmpty(entry?.date?.["#text"], "");
      const countLabel = nowPlaying ? "now playing" : firstNonEmpty(playedAtLabel, fallbackPlayedAt, "recent");
      return toLastFmRecentTrackItem({
        index,
        title,
        artist,
        album,
        countLabel,
        imageUrl: pickLastFmImageUrl(entry?.image),
        itemUrl: entry?.url,
        isNowPlaying: nowPlaying,
        isLoved: entry?.isLoved === true || String(entry?.userloved || "").trim() === "1",
        monthlyTopRank: entry?.monthlyTopRank,
        monthlyTopPlaycount: entry?.monthlyTopPlaycount
      });
    });
  }
  function mapLastFmNowPlayingTrackFromProxy(payload) {
    if (!payload?.nowPlaying || !payload?.track || typeof payload.track !== "object") {
      return null;
    }
    return toLastFmRecentTrackItem({
      index: "now",
      title: payload.track.title,
      artist: payload.track.artist,
      album: payload.track.album,
      countLabel: "now playing",
      imageUrl: payload.track.artworkUrl,
      itemUrl: payload.track.url,
      isNowPlaying: true,
      isLoved: payload?.track?.isLoved === true || String(payload?.track?.userloved || "").trim() === "1",
      monthlyTopRank: payload?.track?.monthlyTopRank,
      monthlyTopPlaycount: payload?.track?.monthlyTopPlaycount
    });
  }
  function mapLastFmReferenceTrackDiscovery(payload) {
    const referenceTrack = payload && typeof payload === "object" ? payload.referenceTrack : null;
    if (!referenceTrack || typeof referenceTrack !== "object") {
      return null;
    }
    const title = firstNonEmpty(referenceTrack.title, "Unknown track");
    const artist = firstNonEmpty(referenceTrack.artist, "Unknown artist");
    const similarTracks = Array.isArray(referenceTrack.similarTracks) ? referenceTrack.similarTracks.map((entry) => ({
      title: firstNonEmpty(entry?.title, "Unknown track"),
      artist: firstNonEmpty(entry?.artist, "Unknown artist"),
      url: resolveUrl(entry?.url, "https://www.last.fm"),
      match: Number.isFinite(Number(entry?.match)) ? Number(entry.match) : null
    })).filter((entry) => entry.title && entry.artist) : [];
    const topTags = Array.isArray(referenceTrack.topTags) ? referenceTrack.topTags.map((entry) => ({
      name: firstNonEmpty(entry?.name, ""),
      url: resolveUrl(entry?.url, "https://www.last.fm")
    })).filter((entry) => entry.name).slice(0, 3) : [];
    return {
      title,
      artist,
      similarTracks: similarTracks.slice(0, 3),
      topTags
    };
  }
  function normalizeLastFmTrackDetailsPayload(payload, fallbackQuery = {}) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const safeTrack = safePayload.track && typeof safePayload.track === "object" ? safePayload.track : {};
    const safeSpotify = safePayload.spotify && typeof safePayload.spotify === "object" ? safePayload.spotify : {};
    const safeScrobbles = safePayload.scrobbles && typeof safePayload.scrobbles === "object" ? safePayload.scrobbles : {};
    const safeArtistTopTracks = safePayload.artistTopTracks && typeof safePayload.artistTopTracks === "object" ? safePayload.artistTopTracks : {};
    const safeQuery = safePayload.query && typeof safePayload.query === "object" ? safePayload.query : fallbackQuery;
    return {
      sourceStatus: firstNonEmpty(safePayload.sourceStatus, "PARTIAL"),
      stale: Boolean(safePayload.stale),
      fetchedAt: firstNonEmpty(safePayload.fetchedAt, ""),
      query: {
        artist: firstNonEmpty(safeQuery.artist, fallbackQuery.artist, ""),
        track: firstNonEmpty(safeQuery.track, fallbackQuery.track, ""),
        album: firstNonEmpty(safeQuery.album, fallbackQuery.album, "")
      },
      track: {
        title: firstNonEmpty(safeTrack.title, fallbackQuery.track, "Unknown track"),
        artist: firstNonEmpty(safeTrack.artist, fallbackQuery.artist, "Unknown artist"),
        album: firstNonEmpty(safeTrack.album, fallbackQuery.album, ""),
        durationMs: Number.isFinite(Number(safeTrack.durationMs)) ? Number(safeTrack.durationMs) : 0,
        durationLabel: firstNonEmpty(safeTrack.durationLabel, ""),
        artworkUrl: sanitizeUrl(safeTrack.artworkUrl),
        lastfmUrl: sanitizeUrl(safeTrack.lastfmUrl),
        artistLastFmUrl: sanitizeUrl(safeTrack.artistLastFmUrl),
        userPlaycount: Number.isFinite(Number(safeTrack.userPlaycount)) ? Number(safeTrack.userPlaycount) : 0,
        userLoved: Boolean(safeTrack.userLoved),
        globalPlaycount: Number.isFinite(Number(safeTrack.globalPlaycount)) ? Number(safeTrack.globalPlaycount) : 0,
        listeners: Number.isFinite(Number(safeTrack.listeners)) ? Number(safeTrack.listeners) : 0,
        summary: firstNonEmpty(safeTrack.summary, ""),
        summaryHasMore: Boolean(safeTrack.summaryHasMore),
        publishedAt: firstNonEmpty(safeTrack.publishedAt, ""),
        topTags: Array.isArray(safeTrack.topTags) ? safeTrack.topTags.map((entry) => ({
          name: firstNonEmpty(entry?.name, ""),
          url: sanitizeUrl(entry?.url)
        })).filter((entry) => entry.name).slice(0, 3) : [],
        similarTracks: Array.isArray(safeTrack.similarTracks) ? safeTrack.similarTracks.map((entry) => ({
          title: firstNonEmpty(entry?.title, "Unknown track"),
          artist: firstNonEmpty(entry?.artist, "Unknown artist"),
          url: sanitizeUrl(entry?.url),
          match: Number.isFinite(Number(entry?.match)) ? Number(entry.match) : null
        })).filter((entry) => entry.title && entry.artist).slice(0, 3) : []
      },
      spotify: {
        matchStatus: firstNonEmpty(safeSpotify.matchStatus, "unavailable"),
        embedUrl: sanitizeUrl(safeSpotify.embedUrl),
        openUrl: sanitizeUrl(safeSpotify.openUrl),
        searchUrl: sanitizeUrl(safeSpotify.searchUrl),
        title: firstNonEmpty(safeSpotify.title, ""),
        artist: firstNonEmpty(safeSpotify.artist, ""),
        album: firstNonEmpty(safeSpotify.album, ""),
        artworkUrl: sanitizeUrl(safeSpotify.artworkUrl),
        previewUrl: sanitizeUrl(safeSpotify.previewUrl)
      },
      scrobbles: {
        total: Number.isFinite(Number(safeScrobbles.total)) ? Number(safeScrobbles.total) : 0,
        items: Array.isArray(safeScrobbles.items) ? safeScrobbles.items.map((entry, index) => ({
          id: `scrobble-${index}-${hashText(`${entry?.playedAtIso || entry?.playedAtLabel || ""}-${entry?.album || ""}`).slice(0, 10)}`,
          playedAtIso: firstNonEmpty(entry?.playedAtIso, ""),
          playedAtLabel: firstNonEmpty(entry?.playedAtLabel, ""),
          album: firstNonEmpty(entry?.album, ""),
          lastfmUrl: sanitizeUrl(entry?.lastfmUrl)
        })).filter((entry) => entry.playedAtLabel || entry.playedAtIso) : []
      },
      artistTopTracks: {
        artist: firstNonEmpty(safeArtistTopTracks.artist, safeTrack.artist, fallbackQuery.artist, ""),
        items: Array.isArray(safeArtistTopTracks.items) ? safeArtistTopTracks.items.map((entry, index) => ({
          id: `related-track-${index}-${hashText(`${entry?.title || ""}-${entry?.lastfmUrl || ""}`).slice(0, 10)}`,
          title: firstNonEmpty(entry?.title, "Unknown track"),
          lastfmUrl: sanitizeUrl(entry?.lastfmUrl),
          artworkUrl: sanitizeUrl(entry?.artworkUrl),
          userPlaycount: Number.isFinite(Number(entry?.userPlaycount)) ? Number(entry.userPlaycount) : 0,
          userLoved: Boolean(entry?.userLoved),
          globalPlaycount: Number.isFinite(Number(entry?.globalPlaycount)) ? Number(entry.globalPlaycount) : 0,
          listeners: Number.isFinite(Number(entry?.listeners)) ? Number(entry.listeners) : 0
        })).filter((entry) => entry.title) : []
      }
    };
  }
  function normalizeLastFmArtistDetailsPayload(payload, fallbackQuery = {}) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const safeArtist = safePayload.artist && typeof safePayload.artist === "object" ? safePayload.artist : {};
    const safeTopTracks = safePayload.topTracks && typeof safePayload.topTracks === "object" ? safePayload.topTracks : {};
    const safeTopAlbums = safePayload.topAlbums && typeof safePayload.topAlbums === "object" ? safePayload.topAlbums : {};
    const safeQuery = safePayload.query && typeof safePayload.query === "object" ? safePayload.query : fallbackQuery;
    return {
      sourceStatus: firstNonEmpty(safePayload.sourceStatus, "PARTIAL"),
      stale: Boolean(safePayload.stale),
      fetchedAt: firstNonEmpty(safePayload.fetchedAt, ""),
      query: {
        artist: firstNonEmpty(safeQuery.artist, fallbackQuery.artist, "")
      },
      artist: {
        name: firstNonEmpty(safeArtist.name, fallbackQuery.artist, "Unknown artist"),
        artworkUrl: sanitizeUrl(safeArtist.artworkUrl),
        lastfmUrl: sanitizeUrl(safeArtist.lastfmUrl),
        summary: firstNonEmpty(safeArtist.summary, ""),
        summaryHasMore: Boolean(safeArtist.summaryHasMore),
        listeners: Number.isFinite(Number(safeArtist.listeners)) ? Number(safeArtist.listeners) : 0,
        playcount: Number.isFinite(Number(safeArtist.playcount)) ? Number(safeArtist.playcount) : 0,
        topTrackCount: Number.isFinite(Number(safeArtist.topTrackCount)) ? Number(safeArtist.topTrackCount) : 0,
        topTags: Array.isArray(safeArtist.topTags) ? safeArtist.topTags.map((entry) => ({
          name: firstNonEmpty(entry?.name, ""),
          url: sanitizeUrl(entry?.url)
        })).filter((entry) => entry.name).slice(0, 4) : []
      },
      topTracks: {
        artist: firstNonEmpty(safeTopTracks.artist, safeArtist.name, fallbackQuery.artist, ""),
        items: Array.isArray(safeTopTracks.items) ? safeTopTracks.items.map((entry, index) => ({
          id: `artist-top-track-${index}-${hashText(`${entry?.title || ""}-${entry?.lastfmUrl || ""}`).slice(0, 10)}`,
          title: firstNonEmpty(entry?.title, "Unknown track"),
          artist: firstNonEmpty(entry?.artist, safeArtist.name, fallbackQuery.artist, "Unknown artist"),
          lastfmUrl: sanitizeUrl(entry?.lastfmUrl),
          artistLastFmUrl: sanitizeUrl(entry?.artistLastFmUrl),
          artworkUrl: sanitizeUrl(entry?.artworkUrl),
          userPlaycount: Number.isFinite(Number(entry?.userPlaycount)) ? Number(entry.userPlaycount) : 0,
          userLoved: Boolean(entry?.userLoved),
          globalPlaycount: Number.isFinite(Number(entry?.globalPlaycount)) ? Number(entry.globalPlaycount) : 0,
          listeners: Number.isFinite(Number(entry?.listeners)) ? Number(entry.listeners) : 0
        })).filter((entry) => entry.title) : []
      },
      topAlbums: {
        artist: firstNonEmpty(safeTopAlbums.artist, safeArtist.name, fallbackQuery.artist, ""),
        items: Array.isArray(safeTopAlbums.items) ? safeTopAlbums.items.map((entry, index) => ({
          id: `artist-top-album-${index}-${hashText(`${entry?.title || ""}-${entry?.lastfmUrl || ""}`).slice(0, 10)}`,
          title: firstNonEmpty(entry?.title, "Unknown album"),
          artist: firstNonEmpty(entry?.artist, safeArtist.name, fallbackQuery.artist, "Unknown artist"),
          artworkUrl: sanitizeUrl(entry?.artworkUrl),
          lastfmUrl: sanitizeUrl(entry?.lastfmUrl),
          releasedAt: firstNonEmpty(entry?.releasedAt, ""),
          releaseYear: firstNonEmpty(entry?.releaseYear, ""),
          topTags: Array.isArray(entry?.topTags) ? entry.topTags.map((tagEntry) => ({
            name: firstNonEmpty(tagEntry?.name, ""),
            url: sanitizeUrl(tagEntry?.url)
          })).filter((tagEntry) => tagEntry.name).slice(0, 3) : [],
          playcount: Number.isFinite(Number(entry?.playcount)) ? Number(entry.playcount) : 0,
          listeners: Number.isFinite(Number(entry?.listeners)) ? Number(entry.listeners) : 0
        })).filter((entry) => entry.title) : []
      }
    };
  }
  function normalizeLastFmAlbumDetailsPayload(payload, fallbackQuery = {}) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const safeAlbum = safePayload.album && typeof safePayload.album === "object" ? safePayload.album : {};
    const safeSpotify = safePayload.spotify && typeof safePayload.spotify === "object" ? safePayload.spotify : {};
    const safeTracks = safePayload.tracks && typeof safePayload.tracks === "object" ? safePayload.tracks : {};
    const safeRelatedTracks = safePayload.relatedTracks && typeof safePayload.relatedTracks === "object" ? safePayload.relatedTracks : {};
    const safeQuery = safePayload.query && typeof safePayload.query === "object" ? safePayload.query : fallbackQuery;
    return {
      sourceStatus: firstNonEmpty(safePayload.sourceStatus, "PARTIAL"),
      stale: Boolean(safePayload.stale),
      fetchedAt: firstNonEmpty(safePayload.fetchedAt, ""),
      query: {
        artist: firstNonEmpty(safeQuery.artist, fallbackQuery.artist, ""),
        album: firstNonEmpty(safeQuery.album, fallbackQuery.album, "")
      },
      album: {
        title: firstNonEmpty(safeAlbum.title, fallbackQuery.album, "Unknown album"),
        artist: firstNonEmpty(safeAlbum.artist, fallbackQuery.artist, "Unknown artist"),
        artworkUrl: sanitizeUrl(safeAlbum.artworkUrl),
        lastfmUrl: sanitizeUrl(safeAlbum.lastfmUrl),
        artistLastFmUrl: sanitizeUrl(safeAlbum.artistLastFmUrl),
        summary: firstNonEmpty(safeAlbum.summary, ""),
        summaryHasMore: Boolean(safeAlbum.summaryHasMore),
        listeners: Number.isFinite(Number(safeAlbum.listeners)) ? Number(safeAlbum.listeners) : 0,
        playcount: Number.isFinite(Number(safeAlbum.playcount)) ? Number(safeAlbum.playcount) : 0,
        releasedAt: firstNonEmpty(safeAlbum.releasedAt, ""),
        runtimeMs: Number.isFinite(Number(safeAlbum.runtimeMs)) ? Number(safeAlbum.runtimeMs) : 0,
        runtimeLabel: firstNonEmpty(safeAlbum.runtimeLabel, ""),
        trackCount: Number.isFinite(Number(safeAlbum.trackCount)) ? Number(safeAlbum.trackCount) : 0,
        topTags: Array.isArray(safeAlbum.topTags) ? safeAlbum.topTags.map((entry) => ({
          name: firstNonEmpty(entry?.name, ""),
          url: sanitizeUrl(entry?.url)
        })).filter((entry) => entry.name).slice(0, 4) : []
      },
      spotify: {
        matchStatus: firstNonEmpty(safeSpotify.matchStatus, "unavailable"),
        embedUrl: sanitizeUrl(safeSpotify.embedUrl),
        openUrl: sanitizeUrl(safeSpotify.openUrl),
        searchUrl: sanitizeUrl(safeSpotify.searchUrl),
        title: firstNonEmpty(safeSpotify.title, ""),
        artist: firstNonEmpty(safeSpotify.artist, ""),
        album: firstNonEmpty(safeSpotify.album, ""),
        artworkUrl: sanitizeUrl(safeSpotify.artworkUrl),
        previewUrl: sanitizeUrl(safeSpotify.previewUrl)
      },
      tracks: {
        items: Array.isArray(safeTracks.items) ? safeTracks.items.map((entry, index) => ({
          id: `album-track-${index}-${hashText(`${entry?.title || ""}-${entry?.artist || ""}`).slice(0, 10)}`,
          rank: Number.isFinite(Number(entry?.rank)) ? Number(entry.rank) : index + 1,
          title: firstNonEmpty(entry?.title, "Unknown track"),
          artist: firstNonEmpty(entry?.artist, safeAlbum.artist, fallbackQuery.artist, "Unknown artist"),
          artistLastFmUrl: sanitizeUrl(entry?.artistLastFmUrl),
          durationMs: Number.isFinite(Number(entry?.durationMs)) ? Number(entry.durationMs) : 0,
          durationLabel: firstNonEmpty(entry?.durationLabel, ""),
          lastfmUrl: sanitizeUrl(entry?.lastfmUrl),
          userPlaycount: Number.isFinite(Number(entry?.userPlaycount)) ? Number(entry.userPlaycount) : 0,
          userLoved: Boolean(entry?.userLoved),
          globalPlaycount: Number.isFinite(Number(entry?.globalPlaycount)) ? Number(entry.globalPlaycount) : 0,
          listeners: Number.isFinite(Number(entry?.listeners)) ? Number(entry.listeners) : 0
        })).filter((entry) => entry.title) : []
      },
      relatedTracks: {
        artist: firstNonEmpty(safeRelatedTracks.artist, safeAlbum.artist, fallbackQuery.artist, ""),
        items: Array.isArray(safeRelatedTracks.items) ? safeRelatedTracks.items.map((entry, index) => ({
          id: `album-related-track-${index}-${hashText(`${entry?.title || ""}-${entry?.lastfmUrl || ""}`).slice(0, 10)}`,
          title: firstNonEmpty(entry?.title, "Unknown track"),
          artist: firstNonEmpty(entry?.artist, safeAlbum.artist, fallbackQuery.artist, "Unknown artist"),
          lastfmUrl: sanitizeUrl(entry?.lastfmUrl),
          artistLastFmUrl: sanitizeUrl(entry?.artistLastFmUrl),
          artworkUrl: sanitizeUrl(entry?.artworkUrl),
          userPlaycount: Number.isFinite(Number(entry?.userPlaycount)) ? Number(entry.userPlaycount) : 0,
          userLoved: Boolean(entry?.userLoved),
          globalPlaycount: Number.isFinite(Number(entry?.globalPlaycount)) ? Number(entry.globalPlaycount) : 0,
          listeners: Number.isFinite(Number(entry?.listeners)) ? Number(entry.listeners) : 0
        })).filter((entry) => entry.title) : []
      }
    };
  }
  function areLastFmTrackItemsSame(left, right) {
    const leftTitle = String(left?.title || "").trim().toLowerCase();
    const leftArtist = String(left?.subtitle || left?.artist || "").trim().toLowerCase();
    const rightTitle = String(right?.title || "").trim().toLowerCase();
    const rightArtist = String(right?.subtitle || right?.artist || "").trim().toLowerCase();
    return Boolean(leftTitle && leftArtist && rightTitle && rightArtist && leftTitle === rightTitle && leftArtist === rightArtist);
  }
  function mapLastFmTopArtistsFromApi(response) {
    const rawArtist = response?.topartists?.artist;
    const artists = Array.isArray(rawArtist) ? rawArtist : rawArtist ? [rawArtist] : [];
    return artists.slice(0, LASTFM_GRID_LIMIT).map((entry, index) => {
      const title = firstNonEmpty(entry?.name, "Unknown artist");
      const countLabel = parseLastFmCountLabel(entry?.playcount, "plays");
      const artistPhotoUrl = resolveLastFmImageUrl(entry?.artistPhotoUrl, "https://www.last.fm");
      return {
        id: `lastfm-top-artist-${index}-${hashText(`${title}-${countLabel}`).slice(0, 12)}`,
        title,
        artistName: title,
        subtitle: "",
        countLabel: firstNonEmpty(countLabel, "-- plays"),
        imageUrl: artistPhotoUrl || pickLastFmImageUrl(entry?.image),
        url: resolveUrl(entry?.url, "https://www.last.fm")
      };
    });
  }
  function buildLastFmArtistArtworkIndex({ recentTracks, topAlbums }) {
    const imageByArtist = /* @__PURE__ */ new Map();
    const registerImage = (artistName, imageUrl) => {
      const normalizedArtist = String(artistName || "").trim().toLowerCase();
      const normalizedImage = resolveLastFmImageUrl(imageUrl, "https://www.last.fm");
      if (!normalizedArtist || !normalizedImage || isLastFmGenericImageUrl(normalizedImage) || imageByArtist.has(normalizedArtist)) {
        return;
      }
      imageByArtist.set(normalizedArtist, normalizedImage);
    };
    const trackItems = Array.isArray(recentTracks) ? recentTracks : [];
    for (const item of trackItems) {
      registerImage(item?.subtitle, item?.imageUrl);
    }
    const albumItems = Array.isArray(topAlbums) ? topAlbums : [];
    for (const item of albumItems) {
      registerImage(item?.subtitle, item?.imageUrl);
    }
    return imageByArtist;
  }
  function applyLastFmArtistArtworkFallback(items, artworkByArtist) {
    const sourceItems = Array.isArray(items) ? items : [];
    const imageByArtist = artworkByArtist instanceof Map ? artworkByArtist : /* @__PURE__ */ new Map();
    return sourceItems.map((item) => {
      const normalizedArtist = String(item?.title || "").trim().toLowerCase();
      const currentImage = resolveLastFmImageUrl(item?.imageUrl, "https://www.last.fm");
      if (currentImage && !isLastFmGenericImageUrl(currentImage)) {
        return item;
      }
      const fallbackImage = imageByArtist.get(normalizedArtist) || "";
      if (!fallbackImage) {
        return {
          ...item,
          imageUrl: ""
        };
      }
      return {
        ...item,
        imageUrl: fallbackImage
      };
    });
  }
  function mapLastFmTopAlbumsFromApi(response) {
    const rawAlbums = response?.topalbums?.album;
    const albums = Array.isArray(rawAlbums) ? rawAlbums : rawAlbums ? [rawAlbums] : [];
    return albums.slice(0, LASTFM_GRID_LIMIT).map((entry, index) => {
      const title = firstNonEmpty(entry?.name, "Unknown album");
      const subtitle = firstNonEmpty(entry?.artist?.name, entry?.artist?.["#text"], "");
      const countLabel = parseLastFmCountLabel(entry?.playcount, "plays");
      return {
        id: `lastfm-top-album-${index}-${hashText(`${title}-${subtitle}-${countLabel}`).slice(0, 12)}`,
        title,
        albumTitle: title,
        albumArtist: subtitle,
        subtitle,
        countLabel: firstNonEmpty(countLabel, "-- plays"),
        imageUrl: pickLastFmImageUrl(entry?.image),
        url: resolveUrl(entry?.url, "https://www.last.fm")
      };
    });
  }
  function extractLastFmCurrentlyListeningItem(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return {
        currentlyListening: null,
        recentTracks: []
      };
    }
    const index = list.findIndex((item) => {
      if (item?.isNowPlaying) return true;
      return isLastFmNowPlayingLabel(item?.countLabel);
    });
    if (index < 0) {
      return {
        currentlyListening: null,
        recentTracks: list
      };
    }
    const item = list[index];
    const currentlyListening = {
      ...item,
      isNowPlaying: true,
      countLabel: "listening now"
    };
    return {
      currentlyListening,
      recentTracks: list.filter((_, itemIndex) => itemIndex !== index)
    };
  }
  function parseTwitterIdentity(metaTitle, fallbackName, fallbackHandle) {
    const cleanTitle = String(metaTitle || "").replace(/\s*\/\s*X\s*$/i, "").trim();
    if (!cleanTitle) {
      return {
        name: fallbackName,
        handle: fallbackHandle
      };
    }
    const handleMatch = cleanTitle.match(/(@[A-Za-z0-9_]+)/);
    const handle = handleMatch?.[1] || fallbackHandle;
    const name = cleanTitle.split("(@")[0]?.trim() || fallbackName;
    return { name, handle };
  }
  function parseTwitterStats(metaDescription, previousStats = []) {
    const fallback = previousStats.length ? previousStats.map((entry) => ({ ...entry })) : [
      { label: "Followers", value: "Live" },
      { label: "Following", value: "Live" },
      { label: "Posts", value: "Live" }
    ];
    const patterns = [
      { label: "Followers", regex: /([\d.,]+[KMB]?)\s+Followers/i },
      { label: "Following", regex: /([\d.,]+[KMB]?)\s+Following/i },
      { label: "Posts", regex: /([\d.,]+[KMB]?)\s+(Posts|Tweets)/i }
    ];
    for (const pattern of patterns) {
      const match = String(metaDescription || "").match(pattern.regex);
      if (!match?.[1]) continue;
      const target = fallback.find((entry) => entry.label === pattern.label);
      if (target) target.value = match[1];
    }
    return fallback;
  }
  function parsePlaylistId(spotifyUrl) {
    const match = String(spotifyUrl || "").match(/playlist\/([A-Za-z0-9]+)/i);
    return match?.[1] || "";
  }
  function buildSpotifyEmbedUrl(spotifyUrl) {
    const playlistId = parsePlaylistId(spotifyUrl);
    if (!playlistId) return "";
    return `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator`;
  }
  function formatCountNumber(value, fallback = "--") {
    const parsed = Number.parseInt(String(value ?? "").replace(/[^\d-]+/g, ""), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed.toLocaleString();
  }
  function resolveFreshness(sourceStatus) {
    if (sourceStatus === "OK") return "LIVE";
    if (sourceStatus === "PARTIAL") return "UPDATED";
    return "STATIC";
  }
  function mergePayload(previous, now, patch, sourceStatus = "OK") {
    const sectionPatch = patch.sections && typeof patch.sections === "object" ? patch.sections : null;
    return {
      ...previous,
      ...patch,
      profile: {
        ...previous.profile,
        ...patch.profile || {}
      },
      stats: Array.isArray(patch.stats) ? patch.stats : previous.stats,
      items: Array.isArray(patch.items) ? patch.items : previous.items,
      embeds: {
        ...previous.embeds || {},
        ...patch.embeds || {}
      },
      sections: sectionPatch ? {
        ...previous.sections || {},
        ...sectionPatch
      } : previous.sections,
      updatedAt: now,
      freshnessStatus: resolveFreshness(sourceStatus),
      sourceStatus
    };
  }
  var DISCORD_PROFILE_USER_ID = "331350000154050560";
  var PROXY_ENDPOINTS = {
    discord: "/api/discord",
    lastfm: "/api/lastfm",
    lastfmAlbumDetails: "/api/lastfm-album-details",
    lastfmArtistDetails: "/api/lastfm-artist-details",
    lastfmTrackDetails: "/api/lastfm-track-details",
    steam: "/api/steam-recent-activity"
  };
  function buildProxyEndpoint(pathname) {
    return new URL(String(pathname || "/"), window.location.origin).toString();
  }
  function buildLastFmArtistDetailsEndpoint(query) {
    const endpoint = new URL(buildProxyEndpoint(PROXY_ENDPOINTS.lastfmArtistDetails));
    endpoint.searchParams.set("artist", String(query?.artist || "").trim());
    return endpoint.toString();
  }
  function buildLastFmAlbumDetailsEndpoint(query) {
    const endpoint = new URL(buildProxyEndpoint(PROXY_ENDPOINTS.lastfmAlbumDetails));
    endpoint.searchParams.set("artist", String(query?.artist || "").trim());
    endpoint.searchParams.set("album", String(query?.album || "").trim());
    return endpoint.toString();
  }
  function buildLastFmTrackDetailsEndpoint(query) {
    const endpoint = new URL(buildProxyEndpoint(PROXY_ENDPOINTS.lastfmTrackDetails));
    endpoint.searchParams.set("artist", String(query?.artist || "").trim());
    endpoint.searchParams.set("track", String(query?.track || "").trim());
    if (String(query?.album || "").trim()) {
      endpoint.searchParams.set("album", String(query.album).trim());
    }
    return endpoint.toString();
  }
  function resolveProxyFreshnessLabel(isStale) {
    return isStale ? "Cloudflare cache" : "Cloudflare edge";
  }
  function formatDiscordStatus(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "online") return "Online";
    if (normalized === "idle") return "Idle";
    if (normalized === "dnd") return "Do Not Disturb";
    if (normalized === "offline") return "Offline";
    return "Unknown";
  }
  function normalizeDiscordStatusKey(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "online") return "online";
    if (normalized === "idle") return "idle";
    if (normalized === "dnd") return "dnd";
    if (normalized === "offline") return "offline";
    return "unknown";
  }
  function buildDiscordAvatarUrl(userId, avatarHash) {
    const safeUserId = String(userId || "").trim();
    const safeHash = String(avatarHash || "").trim();
    if (!safeUserId || !safeHash) return "";
    const ext = safeHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${safeUserId}/${safeHash}.${ext}?size=256`;
  }
  function buildDiscordBannerUrl(userId, bannerHash) {
    const safeUserId = String(userId || "").trim();
    const safeHash = String(bannerHash || "").trim();
    if (!safeUserId || !safeHash) return "";
    const ext = safeHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/banners/${safeUserId}/${safeHash}.${ext}?size=640`;
  }
  function buildDiscordDecorationUrl(asset) {
    const safeAsset = String(asset || "").trim();
    if (!safeAsset) return "";
    return `https://cdn.discordapp.com/avatar-decoration-presets/${safeAsset}.png?size=160&passthrough=true`;
  }
  function buildDiscordEmojiUrl(emojiId, animated) {
    const safeEmojiId = String(emojiId || "").trim();
    if (!/^\d+$/.test(safeEmojiId)) return "";
    return `https://cdn.discordapp.com/emojis/${safeEmojiId}.${animated ? "gif" : "png"}?size=64&quality=lossless`;
  }
  function mapDiscordPresenceFromProxy(proxyPayload, discordUser, profile, userId) {
    const safePresence = proxyPayload?.presence && typeof proxyPayload.presence === "object" ? proxyPayload.presence : {};
    const safeSpotify = safePresence.spotify && typeof safePresence.spotify === "object" ? safePresence.spotify : {};
    return {
      ...safePresence,
      displayName: firstNonEmpty(safePresence.displayName, profile?.name, discordUser?.display_name, discordUser?.global_name, discordUser?.username, "foundlifeless"),
      username: firstNonEmpty(safePresence.username, discordUser?.username, discordUser?.global_name, discordUser?.display_name, "foundlifeless"),
      statusKey: firstNonEmpty(safePresence.statusKey, profile?.statusKey, "unknown"),
      statusLabel: firstNonEmpty(safePresence.statusLabel, profile?.statusText, "Unknown"),
      avatarUrl: firstNonEmpty(
        safePresence.avatarUrl,
        buildDiscordAvatarUrl(discordUser?.id || userId, discordUser?.avatar),
        profile?.avatarUrl
      ),
      avatarDecorationUrl: firstNonEmpty(
        safePresence.avatarDecorationUrl,
        profile?.decorationUrl
      ),
      bannerUrl: firstNonEmpty(
        safePresence.bannerUrl,
        profile?.bannerUrl
      ),
      spotify: {
        ...safeSpotify,
        isListening: Boolean(safeSpotify.isListening),
        song: firstNonEmpty(safeSpotify.song),
        artist: firstNonEmpty(safeSpotify.artist),
        album: firstNonEmpty(safeSpotify.album),
        albumArtUrl: firstNonEmpty(safeSpotify.albumArtUrl),
        trackUrl: firstNonEmpty(safeSpotify.trackUrl)
      }
    };
  }
  function extractDiscordProfileBio(discordUser, activities, fallbackMetaDescription, previousBio = "") {
    const list = Array.isArray(activities) ? activities : [];
    const custom = list.find((activity) => Number(activity?.type) === 4) || null;
    const customText = firstNonEmpty(custom?.state, custom?.details, custom?.name === "Custom Status" ? "" : custom?.name);
    const customEmoji = custom?.emoji?.name ? `:${custom.emoji.name}:` : "";
    const customBio = [customEmoji, customText].filter(Boolean).join(" ").trim();
    const active = list.find((activity) => Number(activity?.type) !== 4) || null;
    const activeText = firstNonEmpty(active?.details, active?.state, active?.name);
    const activeBio = activeText ? `Active: ${activeText}` : "";
    return firstNonEmpty(
      customBio,
      activeBio,
      fallbackMetaDescription,
      discordUser?.global_name ? `${discordUser.global_name} on Discord` : "",
      previousBio,
      "Discord presence synced from Cloudflare cache."
    );
  }
  function mapLanyardActivities(activities, siteUrl) {
    const entries = Array.isArray(activities) ? activities : [];
    const typeLabel = {
      0: "Playing",
      1: "Streaming",
      2: "Listening",
      3: "Watching",
      4: "Custom Status",
      5: "Competing"
    };
    return entries.slice(0, 5).map((activity, index) => {
      const type = Number(activity?.type);
      const label = typeLabel[type] || "Activity";
      const name = firstNonEmpty(
        activity?.name === "Custom Status" ? "" : activity?.name,
        activity?.details,
        activity?.state,
        "Activity"
      );
      const details = firstNonEmpty(activity?.details, activity?.state, "");
      const emojiName = activity?.emoji?.name ? `:${activity.emoji.name}:` : "";
      const meta = [label, emojiName, details].filter((entry) => String(entry || "").trim().length > 0).join(" | ");
      return {
        id: `discord-activity-${index}-${hashText(`${name}-${meta}`).slice(0, 10)}`,
        title: name,
        meta,
        url: resolveUrl(siteUrl)
      };
    });
  }
  async function loadSteamPayload({ previous, now, signal }) {
    const steamProxyEndpoint = buildProxyEndpoint(PROXY_ENDPOINTS.steam);
    try {
      const proxyPayload = await fetchJsonWithTimeout(steamProxyEndpoint, 12e3, signal, { cacheMode: "default" });
      if (!proxyPayload || typeof proxyPayload !== "object") {
        return previous || null;
      }
      return mergePayload(previous, now, {
        profile: proxyPayload.profile && typeof proxyPayload.profile === "object" ? proxyPayload.profile : {},
        stats: Array.isArray(proxyPayload.stats) ? proxyPayload.stats : previous.stats,
        items: Array.isArray(proxyPayload.items) ? proxyPayload.items : previous.items
      }, String(proxyPayload.sourceStatus || "").trim() || (proxyPayload.stale ? "PARTIAL" : "OK"));
    } catch {
      return previous || null;
    }
  }
  async function loadDiscordPayload({ site, previous, now, signal }) {
    const userId = DISCORD_PROFILE_USER_ID;
    const discordEndpoint = buildProxyEndpoint(PROXY_ENDPOINTS.discord);
    const overrideBio = String(DISCORD_PROFILE_OVERRIDES.bio || "").trim();
    const overrideBannerUrl = resolveUrl(DISCORD_PROFILE_OVERRIDES.bannerUrl, site.url);
    const overrideDecorationUrl = resolveUrl(DISCORD_PROFILE_OVERRIDES.decorationUrl, site.url);
    try {
      const discordPayload = await fetchJsonWithTimeout(discordEndpoint, 8500, signal, { cacheMode: "default" });
      const discordUser = discordPayload?.data?.discord_user && typeof discordPayload.data.discord_user === "object" ? discordPayload.data.discord_user : null;
      const activities = Array.isArray(discordPayload?.data?.activities) ? discordPayload.data.activities : [];
      const statusText = formatDiscordStatus(discordPayload?.data?.discord_status);
      const statusKey = normalizeDiscordStatusKey(discordPayload?.data?.discord_status);
      const sourceStatus = String(discordPayload?.sourceStatus || "").trim() || (discordPayload?.stale ? "PARTIAL" : "OK");
      const presenceSource = resolveProxyFreshnessLabel(discordPayload?.stale);
      const displayName = firstNonEmpty(
        discordUser?.display_name,
        discordUser?.global_name,
        discordUser?.username,
        previous.profile.name,
        "foundlifeless"
      );
      const handle = discordUser?.username ? `@${discordUser.username}` : firstNonEmpty(previous.profile.handle, "@foundlifeless");
      const activityItems = mapLanyardActivities(activities, site.url);
      const statusSource = Boolean(discordUser || activities.length);
      const overrideSource = Boolean(overrideBio || overrideBannerUrl || overrideDecorationUrl);
      const profilePatch = {
        name: displayName,
        handle,
        url: resolveUrl(site.url),
        avatarUrl: firstNonEmpty(
          buildDiscordAvatarUrl(discordUser?.id || userId, discordUser?.avatar),
          previous.profile.avatarUrl
        ),
        statusText: firstNonEmpty(statusText, previous.profile.statusText, "Unknown"),
        statusKey,
        bannerUrl: firstNonEmpty(
          overrideBannerUrl,
          buildDiscordBannerUrl(discordUser?.id || userId, discordUser?.banner),
          previous.profile.bannerUrl
        ),
        decorationUrl: firstNonEmpty(
          overrideDecorationUrl,
          buildDiscordDecorationUrl(discordUser?.avatar_decoration_data?.asset),
          previous.profile.decorationUrl
        ),
        bio: firstNonEmpty(
          overrideBio,
          extractDiscordProfileBio(discordUser, activities, "", previous.profile.bio),
          previous.profile.bio
        )
      };
      return mergePayload(previous, now, {
        profile: profilePatch,
        stats: [
          { label: "Status", value: firstNonEmpty(statusText, "Unknown") },
          { label: "Presence Source", value: statusSource ? presenceSource : "Unavailable" },
          { label: "Activities", value: String(activityItems.length || activities.length || 0) }
        ],
        activities,
        presence: mapDiscordPresenceFromProxy(discordPayload, discordUser, profilePatch, userId),
        items: activityItems.length ? activityItems : [
          {
            id: `discord-item-${hashText(displayName).slice(0, 8)}`,
            title: "Activity unavailable",
            meta: "No live activity exposed right now",
            url: resolveUrl(site.url)
          }
        ]
      }, statusSource || overrideSource ? sourceStatus : "PARTIAL");
    } catch {
      return previous || null;
    }
  }
  async function loadLastFmPayload({ previous, now, signal }) {
    const previousSections = previous.sections && typeof previous.sections === "object" ? previous.sections : {};
    let recentTracks = Array.isArray(previousSections.recentTracks) ? previousSections.recentTracks : [];
    let currentlyListening = previousSections.currentlyListening && typeof previousSections.currentlyListening === "object" ? previousSections.currentlyListening : null;
    let topArtists = Array.isArray(previousSections.topArtists) ? previousSections.topArtists : [];
    let topAlbums = Array.isArray(previousSections.topAlbums) ? previousSections.topAlbums : [];
    let referenceTrackDiscovery = previousSections.referenceTrackDiscovery && typeof previousSections.referenceTrackDiscovery === "object" ? previousSections.referenceTrackDiscovery : null;
    let profileTotals = previousSections.profileTotals && typeof previousSections.profileTotals === "object" ? previousSections.profileTotals : {
      scrobbles: "",
      artists: "",
      lovedTracks: ""
    };
    const proxyEndpoint = buildProxyEndpoint(PROXY_ENDPOINTS.lastfm);
    try {
      const proxyPayload = await fetchJsonWithTimeout(proxyEndpoint, 1e4, signal, { cacheMode: "default" });
      const mappedRecent = mapLastFmRecentTracksFromApi({ recenttracks: proxyPayload?.recenttracks }, now);
      if (mappedRecent.length) {
        recentTracks = mappedRecent;
      }
      const mappedAlbums = mapLastFmTopAlbumsFromApi({ topalbums: proxyPayload?.topalbums });
      if (mappedAlbums.length) {
        topAlbums = mappedAlbums;
      }
      const artistArtworkIndex = buildLastFmArtistArtworkIndex({
        recentTracks,
        topAlbums
      });
      const mappedArtists = applyLastFmArtistArtworkFallback(
        mapLastFmTopArtistsFromApi({ topartists: proxyPayload?.topartists }),
        artistArtworkIndex
      );
      const mappedNowPlaying = mapLastFmNowPlayingTrackFromProxy(proxyPayload?.nowPlaying);
      const mappedReferenceDiscovery = mapLastFmReferenceTrackDiscovery(proxyPayload?.discovery);
      const listeningState = extractLastFmCurrentlyListeningItem(recentTracks);
      currentlyListening = mappedNowPlaying || listeningState.currentlyListening;
      recentTracks = listeningState.recentTracks;
      if (currentlyListening) {
        recentTracks = recentTracks.filter((item) => !areLastFmTrackItemsSame(item, currentlyListening));
      }
      profileTotals = {
        ...profileTotals,
        scrobbles: firstNonEmpty(pickLastFmCountValue(proxyPayload?.user?.playcount), profileTotals.scrobbles),
        artists: firstNonEmpty(pickLastFmCountValue(proxyPayload?.user?.artist_count), profileTotals.artists),
        lovedTracks: firstNonEmpty(pickLastFmCountValue(proxyPayload?.lovedtracks?.["@attr"]?.total), profileTotals.lovedTracks)
      };
      if (mappedArtists.length) {
        topArtists = mappedArtists;
      }
      referenceTrackDiscovery = mappedReferenceDiscovery;
      const sections = {
        currentlyListening,
        recentTracks,
        topArtists,
        topAlbums,
        referenceTrackDiscovery,
        profileTotals
      };
      const items = recentTracks.length ? recentTracks : currentlyListening ? [currentlyListening] : previous.items;
      const sourceStatus = String(proxyPayload?.sourceStatus || "").trim() || (proxyPayload?.stale ? "PARTIAL" : "OK");
      return mergePayload(previous, now, {
        profile: {
          name: firstNonEmpty(
            proxyPayload?.user?.realname,
            proxyPayload?.user?.name,
            previous.profile.name
          ),
          bio: previous.profile.bio,
          avatarUrl: firstNonEmpty(
            pickLastFmImageUrl(proxyPayload?.user?.image, previous.profile.avatarUrl),
            previous.profile.avatarUrl
          )
        },
        stats: [
          {
            label: "Feed",
            value: currentlyListening
              ? `Now Playing: ${resolveProxyFreshnessLabel(proxyPayload?.stale)}`
              : resolveProxyFreshnessLabel(proxyPayload?.stale)
          },
          { label: "Scrobbles", value: profileTotals.scrobbles || "--" },
          { label: "Artists", value: profileTotals.artists || "--" },
          { label: "Loved Tracks", value: profileTotals.lovedTracks || "--" },
          { label: "Recent", value: String(recentTracks.length || 0) }
        ],
        items,
        sections
      }, sourceStatus);
    } catch {
      return previous || null;
    }
  }
  function createSocialHubDataSources() {
    async function loadSitePayload(context) {
      const { site } = context;
      if (!site || !site.id) return null;
      if (!shouldFetchSitePayload(site.id)) return context.previous || null;
      if (site.id === "steam") return await loadSteamPayload(context);
      if (site.id === "discord") return await loadDiscordPayload(context);
      if (site.id === "lastfm") return await loadLastFmPayload(context);
      return context.previous || null;
    }
    return {
      loadSitePayload
    };
  }

  // src/josie/social-hub/render.js
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function sanitizeUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value, window.location.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      return "";
    }
    return "";
  }
  function formatExternalPromptDisplayUrl(raw) {
    const safeUrl = sanitizeUrl(raw);
    if (!safeUrl) return "";
    try {
      const parsed = new URL(safeUrl);
      const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
      return `${parsed.host}${pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return safeUrl.replace(/^https?:\/\//i, "");
    }
  }
  function formatTimestamp(value) {
    if (!Number.isFinite(value) || value <= 0) return "pending";
    const date = new Date(value);
    return new Intl.DateTimeFormat(void 0, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  }
  function formatAudioTimeLeft(currentTime, duration) {
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    if (!safeDuration) return "--:--";
    const safeCurrentTime = Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : 0;
    const remainingSeconds = Math.max(0, Math.ceil(safeDuration - safeCurrentTime));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `-${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  function formatAudioTime(value) {
    const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
    const roundedSeconds = Math.floor(safeValue);
    const minutes = Math.floor(roundedSeconds / 60);
    const seconds = roundedSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }
  function sourceClass(sourceStatus) {
    const normalized = String(sourceStatus || "PARTIAL").toLowerCase();
    if (normalized === "ok") return "chip-source-ok";
    if (normalized === "failed") return "chip-source-failed";
    return "chip-source-partial";
  }
  function freshnessClass(freshnessStatus) {
    const normalized = String(freshnessStatus || "STATIC").toLowerCase();
    if (normalized === "live") return "chip-fresh-live";
    if (normalized === "updated") return "chip-fresh-updated";
    if (normalized === "cached") return "chip-fresh-cached";
    return "chip-fresh-static";
  }
  var SITE_THEME_LABEL = {
    twitter: "X / Twitter",
    steam: "Steam",
    discord: "Discord",
    lastfm: "Last.fm",
    spotify: "Spotify",
    soundcloud: "SoundCloud"
  };
  var NON_SHOWCASE_SITE_IDS = /* @__PURE__ */ new Set(["twitter", "discord", "spotify", "soundcloud"]);
  var AVATAR_MANIFEST_URL = "/assets/avatar-manifest.json";
  var HERO_RANDOM_AVATAR_URLS = [
    "/avatars/avatar_joser.jpg",
    "/avatars/josie-main-profile.jpg",
    "/avatars/josie-main-profile1.jpg",
    "/avatars/josie-main-profile2.jpg",
    "/avatars/josie-main-profile3.jpg",
    "/avatars/josie-main-profile4.jpg"
  ];
  var heroAvatarManifestPromise = null;
  function pickRandomHeroAvatarUrl(entries = HERO_RANDOM_AVATAR_URLS) {
    const pool = (Array.isArray(entries) ? entries : HERO_RANDOM_AVATAR_URLS).filter((entry) => String(entry || "").trim().length > 0);
    if (!pool.length) return "/avatars/josie-main-profile.jpg";
    const index = Math.floor(Math.random() * pool.length);
    return pool[index] || pool[0];
  }
  var HERO_AVATAR_LOCKED_URL = pickRandomHeroAvatarUrl();
  async function ensureHeroAvatarSelection() {
    if (heroAvatarManifestPromise) return heroAvatarManifestPromise;
    heroAvatarManifestPromise = (async () => {
      try {
        const response = await fetch(AVATAR_MANIFEST_URL, { cache: "default" });
        if (!response.ok) {
          throw new Error(`Avatar manifest fetch failed (${response.status})`);
        }
        const data = await response.json();
        HERO_AVATAR_LOCKED_URL = pickRandomHeroAvatarUrl(Array.isArray(data?.avatars) ? data.avatars : HERO_RANDOM_AVATAR_URLS);
      } catch {
        HERO_AVATAR_LOCKED_URL = pickRandomHeroAvatarUrl();
      }
      return HERO_AVATAR_LOCKED_URL;
    })();
    return heroAvatarManifestPromise;
  }
  var DEFAULT_HERO_BIO = "˚₊‧꒰ა ♡ ໒꒱ ‧₊˚";
  var JOSIE_TOP_SHOWCASE_TEXT = "I'm just here, lol.";
  var SHUFFLE_MANIFEST_URL = "/assets/shuffle-manifest.json";
  var SHUFFLE_RECENCY_WEIGHT_STEP = 0.08;
  var SHUFFLE_ANALYSER_FFT_SIZE = 512;
  var SHUFFLE_SCRUB_PREVIEW_INTERVAL_MS = 34;
  var SHUFFLE_SCRUB_PREVIEW_DURATION_SEC = 0.075;
  var SHUFFLE_SCRUB_PREVIEW_GAIN = 0.84;
  function normalizeShuffleArtist(value) {
    const tokens = String(value || "").split(/[;|/]+/).map((token) => token.trim()).filter(Boolean);
    if (!tokens.length) return "";
    const uniqueTokens = [];
    const seen = /* @__PURE__ */ new Set();
    for (const token of tokens) {
      const normalized = token.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      uniqueTokens.push(token);
    }
    return uniqueTokens.join(" / ");
  }
  function normalizeShuffleTrackEntry(entry, index) {
    const source = entry && typeof entry === "object" ? entry : {};
    const addedAt = Date.parse(String(source.addedAt || ""));
    const path = String(source.path || "").trim();
    if (!path) return null;
    const fileName = decodeURIComponent(path.split("/").pop() || "").replace(/\.[^/.]+$/, "");
    const sourceTitle = String(source.title || "").trim() || fileName || `Track ${index + 1}`;
    const sourceArtist = normalizeShuffleArtist(source.artist || source.albumArtist || "");
    return {
      id: `shuffle-track-${index}-${hashText(path).slice(0, 10)}`,
      title: sourceTitle,
      artist: sourceArtist || "Unknown Artist",
      path,
      addedAt: Number.isFinite(addedAt) ? addedAt : 0
    };
  }
  function sortShuffleTracksByRecency(tracks) {
    return tracks.slice().sort((a, b) => {
      if (b.addedAt !== a.addedAt) return b.addedAt - a.addedAt;
      return a.title.localeCompare(b.title);
    });
  }
  function normalizeShuffleTrackLookup(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function findPreferredInitialShuffleTrack(tracks) {
    const safeTracks = Array.isArray(tracks) ? tracks : [];
    const preferredTitle = "begging the witness";
    return safeTracks.find((track) => normalizeShuffleTrackLookup(track?.title) === preferredTitle) || null;
  }
  function pickWeightedShuffleTrack(tracks, excludeId = "") {
    const safeTracks = sortShuffleTracksByRecency(Array.isArray(tracks) ? tracks : []);
    const candidates = safeTracks.filter((track) => !excludeId || track.id !== excludeId);
    const pool = candidates.length ? candidates : safeTracks;
    if (!pool.length) return null;
    let totalWeight = 0;
    const weighted = pool.map((track, index) => {
      const weight = 1 + Math.max(0, pool.length - index - 1) * SHUFFLE_RECENCY_WEIGHT_STEP;
      totalWeight += weight;
      return { track, weight };
    });
    let target = Math.random() * totalWeight;
    for (const entry of weighted) {
      target -= entry.weight;
      if (target <= 0) {
        return entry.track;
      }
    }
    return weighted[weighted.length - 1]?.track || pool[0];
  }
  function createReversedAudioBuffer(audioContext, buffer) {
    const reversed = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex += 1) {
      const source = buffer.getChannelData(channelIndex);
      const target = reversed.getChannelData(channelIndex);
      for (let i = 0, j = source.length - 1; i < source.length; i += 1, j -= 1) {
        target[i] = source[j];
      }
    }
    return reversed;
  }
  function createShufflePlayerController() {
    const SITE_LOAD_COMPLETE_EVENT = "josie:site-load-complete";
    let disposed = false;
    let playerRoot = null;
    let waveSurface = null;
    let wavePortal = null;
    let waveCanvas = null;
    let waveCtx = null;
    let titleEl = null;
    let artistEl = null;
    let copyRootEl = null;
    let progressFillEl = null;
    let timeRemainingEl = null;
    let compactPlayerMode = false;
    let resizeObserver = null;
    let viewportGeometryListener = null;
    let cachedWaveLayout = null;
    let manifestPromise = null;
    let previewCtx = null;
    let mediaSourceNode = null;
    let analyserNode = null;
    let outputGainNode = null;
    let analyserSamples = new Float32Array(0);
    let waveformTracks = [];
    let currentTrack = null;
    let traceValues = new Float32Array(0);
    let traceSmoothingValues = new Float32Array(0);
    let rafId = 0;
    let loadState = "loading";
    let playbackUnlocked = !document.body?.classList.contains("site-load-playing") && !Boolean(window.__josieHandoffPending);
    let siteLoadWaitPromise = null;
    let siteLoadClassObserver = null;
    let initialTrackQueued = false;
    let visualizerCopyHideTimer = 0;
    let visualizerCopyEnterRafId = 0;
    let visualizerCopyTrackKey = "";
    let visualizerCopyState = "visible";
    let reactiveBeat = 0;
    let reactiveFlash = 0;
    let reactiveVisualSignature = "";
    let lastVisualizerFrameMs = 0;
    const stateSubscribers = /* @__PURE__ */ new Set();
    const audioEl = new Audio();
    const SHUFFLE_STAGE_BOTTOM_OFFSET_PX = 0;
    const SHUFFLE_TRACE_OPACITY_SCALE = 1;
    const SHUFFLE_MAX_CANVAS_DPR = 1;
    const SHUFFLE_TRACE_POINT_LIMIT = 320;
    const SHUFFLE_ACTIVE_FRAME_INTERVAL_MS = 1e3 / 40;
    const SHUFFLE_IDLE_FRAME_INTERVAL_MS = 1e3 / 16;
    const SHUFFLE_COPY_HOLD_MS = 5e3;
    const SHUFFLE_MAX_VOLUME = 0.077;
    audioEl.preload = "auto";
    audioEl.playsInline = true;
    audioEl.crossOrigin = "anonymous";
    audioEl.volume = SHUFFLE_MAX_VOLUME;
    function resolveTrackUrl(track) {
      if (!track?.path) return "";
      return resolveUrl(track.path, window.location.origin);
    }
    function getReactiveTargets() {
      const targets = [];
      if (playerRoot instanceof HTMLElement) {
        targets.push(playerRoot);
      }
      if (waveSurface instanceof HTMLElement && !targets.includes(waveSurface)) {
        targets.push(waveSurface);
      }
      return targets;
    }
    function resolveShuffleTheme(track) {
      const themeSeed = hashText(`${track?.title || "Shuffle"}|${track?.artist || "Unknown Artist"}`).padStart(8, "0");
      const primaryBase = parseInt(themeSeed.slice(0, 2), 16) || 120;
      const secondaryBase = parseInt(themeSeed.slice(2, 4), 16) || 188;
      const sparkleBase = parseInt(themeSeed.slice(4, 6), 16) || 236;
      const primaryHue = Math.round(primaryBase / 255 * 360);
      const secondaryHue = (primaryHue + 28 + Math.round(secondaryBase / 255 * 84)) % 360;
      const sparkleHue = (secondaryHue + 12 + Math.round(sparkleBase / 255 * 42)) % 360;
      return {
        accent: `${primaryHue} 90% 72%`,
        accentStrong: `${(primaryHue + 10) % 360} 96% 80%`,
        secondary: `${secondaryHue} 88% 76%`,
        sparkle: `${sparkleHue} 96% 92%`
      };
    }
    function applyShuffleTheme(track) {
      const theme = resolveShuffleTheme(track);
      getReactiveTargets().forEach((target) => {
        target.style.setProperty("--shuffle-accent", theme.accent);
        target.style.setProperty("--shuffle-accent-strong", theme.accentStrong);
        target.style.setProperty("--shuffle-secondary", theme.secondary);
        target.style.setProperty("--shuffle-sparkle", theme.sparkle);
      });
    }
    function buildPublicState() {
      return {
        muted: Boolean(audioEl.muted),
        volumeRatio: SHUFFLE_MAX_VOLUME > 0 ? clamp2(audioEl.volume / SHUFFLE_MAX_VOLUME, 0, 1) : 0,
        playing: Boolean(currentTrack) && !audioEl.paused,
        blocked: loadState === "blocked",
        hasTrack: Boolean(currentTrack)
      };
    }
    function clearVisualizerCopyTimers() {
      if (visualizerCopyHideTimer) {
        window.clearTimeout(visualizerCopyHideTimer);
        visualizerCopyHideTimer = 0;
      }
      if (visualizerCopyEnterRafId) {
        window.cancelAnimationFrame(visualizerCopyEnterRafId);
        visualizerCopyEnterRafId = 0;
      }
    }
    function applyVisualizerCopyState() {
      if (!(copyRootEl instanceof HTMLElement)) return;
      copyRootEl.setAttribute("data-shuffle-copy-state", visualizerCopyState);
    }
    function setVisualizerCopyState(nextState) {
      visualizerCopyState = nextState === "hidden" ? "hidden" : "visible";
      applyVisualizerCopyState();
    }
    function getVisualizerCopyTrackKey(track) {
      if (!track || typeof track !== "object") return "";
      return firstNonEmpty(track.id, `${track.title || ""}|${track.artist || ""}`);
    }
    function restartVisualizerCopyCycle() {
      clearVisualizerCopyTimers();
      if (!(copyRootEl instanceof HTMLElement)) {
        visualizerCopyState = "visible";
        return;
      }
      setVisualizerCopyState("hidden");
      void copyRootEl.getBoundingClientRect();
      visualizerCopyEnterRafId = window.requestAnimationFrame(() => {
        visualizerCopyEnterRafId = 0;
        setVisualizerCopyState("visible");
        visualizerCopyHideTimer = window.setTimeout(() => {
          setVisualizerCopyState("hidden");
          visualizerCopyHideTimer = 0;
        }, SHUFFLE_COPY_HOLD_MS);
      });
    }
    function syncVisualizerCopyCycle() {
      const nextTrackKey = getVisualizerCopyTrackKey(currentTrack);
      if (!nextTrackKey) {
        visualizerCopyTrackKey = "";
        clearVisualizerCopyTimers();
        setVisualizerCopyState("visible");
        return;
      }
      if (nextTrackKey === visualizerCopyTrackKey) {
        applyVisualizerCopyState();
        return;
      }
      visualizerCopyTrackKey = nextTrackKey;
      restartVisualizerCopyCycle();
    }
    function syncAudioOutputGain() {
      const gainNode = outputGainNode;
      if (!gainNode || !gainNode.gain) return;
      const nextValue = audioEl.muted ? 0 : 1;
      try {
        const ctxTime = previewCtx && typeof previewCtx.currentTime === "number" ? previewCtx.currentTime : 0;
        gainNode.gain.cancelScheduledValues(ctxTime);
        gainNode.gain.setValueAtTime(nextValue, ctxTime);
      } catch {
        gainNode.gain.value = nextValue;
      }
    }
    function notifyStateSubscribers() {
      const state = buildPublicState();
      stateSubscribers.forEach((listener) => {
        try {
          listener(state);
        } catch {
        }
      });
    }
    function syncReactiveVisuals(rawBeat = 0, rawFlash = 0) {
      const targetBeat = clamp2(rawBeat, 0, 1);
      const beatAttack = targetBeat > reactiveBeat ? 0.34 : 0.14;
      reactiveBeat = clamp2(reactiveBeat + (targetBeat - reactiveBeat) * beatAttack, 0, 1);
      reactiveBeat *= targetBeat > 0.008 ? 0.998 : 0.948;
      reactiveFlash = clamp2(Math.max(rawFlash, reactiveFlash * 0.86), 0, 1);
      const glowOpacity = Math.min(0.46, 0.16 + reactiveBeat * 0.24 + reactiveFlash * 0.06);
      const frostOpacity = Math.min(0.96, 0.76 + reactiveBeat * 0.18 + reactiveFlash * 0.04);
      const auraBlur = 30 + reactiveBeat * 22 + reactiveFlash * 18;
      const drift = reactiveBeat * 14 + reactiveFlash * 8;
      const beatValue = reactiveBeat.toFixed(2);
      const flashValue = reactiveFlash.toFixed(2);
      const glowOpacityValue = glowOpacity.toFixed(2);
      const frostOpacityValue = frostOpacity.toFixed(2);
      const auraBlurValue = `${auraBlur.toFixed(0)}px`;
      const driftValue = `${drift.toFixed(1)}px`;
      const nextSignature = [
        beatValue,
        flashValue,
        glowOpacityValue,
        frostOpacityValue,
        auraBlurValue,
        driftValue
      ].join("|");
      if (nextSignature === reactiveVisualSignature) {
        return;
      }
      reactiveVisualSignature = nextSignature;
      getReactiveTargets().forEach((target) => {
        target.style.setProperty("--shuffle-beat", beatValue);
        target.style.setProperty("--shuffle-flash", flashValue);
        target.style.setProperty("--shuffle-glow-opacity", glowOpacityValue);
        target.style.setProperty("--shuffle-frost-opacity", frostOpacityValue);
        target.style.setProperty("--shuffle-aura-blur", auraBlurValue);
        target.style.setProperty("--shuffle-drift", driftValue);
      });
    }
    function measureReactivePulse() {
      if (audioEl.paused || !(analyserNode instanceof AnalyserNode) || !analyserSamples.length) {
        return { beat: 0, flash: 0, sampled: false };
      }
      analyserNode.getFloatTimeDomainData(analyserSamples);
      let peak = 0;
      let transientPeak = 0;
      let sumSquares = 0;
      let sampleCount = 0;
      let previousSample = 0;
      for (let index = 0; index < analyserSamples.length; index += 6) {
        const sample = analyserSamples[index] || 0;
        const magnitude = Math.abs(sample);
        peak = Math.max(peak, magnitude);
        transientPeak = Math.max(transientPeak, Math.abs(sample - previousSample));
        sumSquares += sample * sample;
        previousSample = sample;
        sampleCount += 1;
      }
      const rms = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
      return {
        beat: clamp2(
          rms * 3.9 +
          Math.max(0, peak - 0.16) * 1.8 +
          Math.max(0, transientPeak - 0.04) * 6.4,
          0,
          1
        ),
        flash: clamp2(
          Math.max(0, peak - 0.26) * 2.4 +
          Math.max(0, transientPeak - 0.075) * 9.6,
          0,
          1
        ),
        sampled: true
      };
    }
    function syncUi() {
      if (titleEl instanceof HTMLElement) {
        titleEl.textContent = currentTrack?.title || (loadState === "error" ? "Shuffle unavailable" : "Loading Shuffle...");
      }
      if (artistEl instanceof HTMLElement) {
        artistEl.textContent = currentTrack?.artist || (loadState === "error" ? "No artist data" : "Unknown Artist");
      }
      syncVisualizerCopyCycle();
      applyShuffleTheme(currentTrack);
      const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
      const currentTime = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;
      const progress = duration > 0 ? clamp2(currentTime / duration, 0, 1) : 0;
      if (progressFillEl instanceof HTMLElement) {
        progressFillEl.style.transform = `scaleX(${progress.toFixed(4)})`;
      }
      if (timeRemainingEl instanceof HTMLElement) {
        timeRemainingEl.textContent = formatAudioTimeLeft(currentTime, duration);
      }
      if (playerRoot instanceof HTMLElement) {
        playerRoot.classList.toggle("is-compact", compactPlayerMode);
        playerRoot.classList.toggle("is-loading", loadState === "loading");
        playerRoot.classList.toggle("is-error", loadState === "error");
        playerRoot.classList.toggle("is-blocked", loadState === "blocked");
        playerRoot.classList.toggle("is-playing", Boolean(currentTrack) && !audioEl.paused);
      }
      if (waveSurface instanceof HTMLElement) {
        waveSurface.classList.toggle("is-blocked", loadState === "blocked");
        waveSurface.classList.toggle("is-playing", Boolean(currentTrack) && !audioEl.paused);
      }
      notifyStateSubscribers();
    }
    function isSiteLoadPending() {
      return Boolean(document.body?.classList.contains("site-load-playing") || window.__josieHandoffPending);
    }
    function finalizePlaybackUnlock() {
      playbackUnlocked = true;
      if (siteLoadClassObserver) {
        siteLoadClassObserver.disconnect();
        siteLoadClassObserver = null;
      }
    }
    function waitForSiteLoadCompletion() {
      if (disposed) return Promise.resolve();
      if (playbackUnlocked || window.__amesSiteLoadComplete || !isSiteLoadPending()) {
        finalizePlaybackUnlock();
        return Promise.resolve();
      }
      if (siteLoadWaitPromise) return siteLoadWaitPromise;
      siteLoadWaitPromise = new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.removeEventListener(SITE_LOAD_COMPLETE_EVENT, finish);
          if (siteLoadClassObserver) {
            siteLoadClassObserver.disconnect();
            siteLoadClassObserver = null;
          }
          siteLoadWaitPromise = null;
          finalizePlaybackUnlock();
          resolve();
        };
        window.addEventListener(SITE_LOAD_COMPLETE_EVENT, finish, { once: true });
        if ("MutationObserver" in window && document.body) {
          siteLoadClassObserver = new MutationObserver(() => {
            if (!isSiteLoadPending()) {
              finish();
            }
          });
          siteLoadClassObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        }
      });
      return siteLoadWaitPromise;
    }
    async function queueInitialTrackPlayback() {
      if (initialTrackQueued || disposed || currentTrack || !waveformTracks.length) return;
      initialTrackQueued = true;
      await waitForSiteLoadCompletion();
      if (disposed || currentTrack || !waveformTracks.length) return;
      const preferredTrack = findPreferredInitialShuffleTrack(waveformTracks);
      if (preferredTrack) {
        await chooseAndLoadTrack(preferredTrack, { autoplay: true });
        return;
      }
      await chooseNextTrack({ autoplay: true, excludeCurrent: false });
    }
    function ensureWavePortal() {
      const layerHost = document.getElementById("os-shuffle-visualizer-layer");
      if (!(layerHost instanceof HTMLDivElement)) return null;
      if (!(wavePortal instanceof HTMLDivElement) || wavePortal.parentElement !== layerHost) {
        wavePortal = document.createElement("div");
        wavePortal.className = "josie-audio-player-bleed-layer";
        wavePortal.setAttribute("aria-hidden", "true");
        wavePortal.hidden = true;
        layerHost.insertBefore(wavePortal, layerHost.firstChild);
      }
      if (!(waveCanvas instanceof HTMLCanvasElement)) {
        waveCanvas = document.createElement("canvas");
        waveCanvas.className = "josie-audio-player-wave";
        waveCanvas.setAttribute("aria-hidden", "true");
        wavePortal.appendChild(waveCanvas);
      }
      if (!(waveCtx instanceof CanvasRenderingContext2D)) {
        waveCtx = waveCanvas.getContext("2d");
      }
      return wavePortal;
    }
    function invalidateWaveLayout() {
      cachedWaveLayout = null;
    }
    function hideWavePortal() {
      if (wavePortal instanceof HTMLElement) {
        wavePortal.hidden = true;
      }
    }
    function syncWavePortalLayout() {
      const portal = ensureWavePortal();
      if (!(portal instanceof HTMLElement) || !(waveSurface instanceof HTMLElement)) return null;
      const surfaceRect = waveSurface.getBoundingClientRect();
      const viewportWidth = Math.max(1, Math.round(window.innerWidth || document.documentElement?.clientWidth || surfaceRect.width));
      const viewportHeight = Math.max(1, Math.round(window.innerHeight || document.documentElement?.clientHeight || surfaceRect.height));
      const drawHeight = Math.max(1, Math.round(surfaceRect.height || waveSurface.offsetHeight || 0));
      if (surfaceRect.width < 1 || drawHeight < 1 || viewportWidth < 1 || viewportHeight < 1) {
        hideWavePortal();
        invalidateWaveLayout();
        return null;
      }
      const drawTop = clamp2(
        Math.round(viewportHeight - drawHeight - SHUFFLE_STAGE_BOTTOM_OFFSET_PX),
        0,
        Math.max(0, viewportHeight - drawHeight)
      );
      portal.hidden = false;
      portal.style.left = "0px";
      portal.style.top = `${drawTop}px`;
      portal.style.width = `${viewportWidth}px`;
      portal.style.height = `${drawHeight}px`;
      cachedWaveLayout = {
        canvasWidth: viewportWidth,
        canvasHeight: drawHeight,
        drawLeft: 0,
        drawTop: 0,
        drawWidth: viewportWidth,
        drawHeight
      };
      return cachedWaveLayout;
    }
    function ensureWaveCanvasSize() {
      const layout = cachedWaveLayout || syncWavePortalLayout();
      if (!(waveCanvas instanceof HTMLCanvasElement) || !(waveCtx instanceof CanvasRenderingContext2D) || !layout) {
        return {
          canvasWidth: 0,
          canvasHeight: 0,
          drawLeft: 0,
          drawTop: 0,
          drawWidth: 0,
          drawHeight: 0,
          dpr: 1
        };
      }
      const cssWidth = Math.max(1, layout.canvasWidth);
      const cssHeight = Math.max(1, layout.canvasHeight);
      const dpr = Math.min(SHUFFLE_MAX_CANVAS_DPR, Math.max(1, window.devicePixelRatio || 1));
      const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
      const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
      if (waveCanvas.width !== pixelWidth || waveCanvas.height !== pixelHeight) {
        waveCanvas.width = pixelWidth;
        waveCanvas.height = pixelHeight;
      }
      waveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      waveCtx.imageSmoothingEnabled = false;
      return {
        canvasWidth: cssWidth,
        canvasHeight: cssHeight,
        drawLeft: layout.drawLeft,
        drawTop: layout.drawTop,
        drawWidth: layout.drawWidth,
        drawHeight: layout.drawHeight,
        dpr
      };
    }
    async function ensurePreviewContext(shouldResume = false) {
      if (previewCtx) {
        if (shouldResume && previewCtx.state === "suspended") {
          try {
            await previewCtx.resume();
          } catch {
          }
        }
        return previewCtx;
      }
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return null;
      try {
        previewCtx = new AudioContextCtor();
      } catch {
        previewCtx = null;
      }
      if (previewCtx && shouldResume && previewCtx.state === "suspended") {
        try {
          await previewCtx.resume();
        } catch {
        }
      }
      return previewCtx;
    }
    async function ensureAnalysisGraph(shouldResume = false) {
      const ctx = await ensurePreviewContext(shouldResume);
      if (!ctx) return null;
      if (!(analyserNode instanceof AnalyserNode)) {
        try {
          mediaSourceNode = ctx.createMediaElementSource(audioEl);
        } catch {
          mediaSourceNode = null;
        }
        if (!mediaSourceNode) return null;
        analyserNode = ctx.createAnalyser();
        outputGainNode = ctx.createGain();
        analyserNode.fftSize = SHUFFLE_ANALYSER_FFT_SIZE;
        analyserNode.smoothingTimeConstant = 0.62;
        mediaSourceNode.connect(analyserNode);
        analyserNode.connect(outputGainNode);
        outputGainNode.connect(ctx.destination);
        syncAudioOutputGain();
      }
      if (!(analyserSamples instanceof Float32Array) || analyserSamples.length !== analyserNode.fftSize) {
        analyserSamples = new Float32Array(analyserNode.fftSize);
      }
      return analyserNode;
    }
    function drawTrace(reuseCurrentFrameSamples = false) {
      const metrics = ensureWaveCanvasSize();
      if (!(waveCtx instanceof CanvasRenderingContext2D) || !metrics.drawWidth || !metrics.drawHeight) return;
      const canvasWidth = metrics.canvasWidth;
      const canvasHeight = metrics.canvasHeight;
      const originX = metrics.drawLeft;
      const originY = metrics.drawTop;
      const width = metrics.drawWidth;
      const height = metrics.drawHeight;
      const pointCount = Math.max(2, Math.min(width, SHUFFLE_TRACE_POINT_LIMIT));
      const pointSpacing = (width - 1) / Math.max(pointCount - 1, 1);
      if (!(traceValues instanceof Float32Array) || traceValues.length !== pointCount) {
        traceValues = new Float32Array(pointCount);
      }
      if (!(traceSmoothingValues instanceof Float32Array) || traceSmoothingValues.length !== pointCount) {
        traceSmoothingValues = new Float32Array(pointCount);
      }
      const shouldSampleLive = Boolean(!audioEl.paused && analyserNode instanceof AnalyserNode);
      let peak = 0;
      let transientPeak = 0;
      if (shouldSampleLive && analyserSamples.length) {
        if (!reuseCurrentFrameSamples) {
          analyserNode.getFloatTimeDomainData(analyserSamples);
        }
        let filteredValue = 0;
        for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
          const sampleIndex = Math.min(analyserSamples.length - 1, Math.floor(pointIndex / Math.max(pointCount - 1, 1) * (analyserSamples.length - 1)));
          const currentSample = analyserSamples[sampleIndex] || 0;
          const previousSample = analyserSamples[Math.max(0, sampleIndex - 6)] || currentSample;
          const nextSample = analyserSamples[Math.min(analyserSamples.length - 1, sampleIndex + 6)] || currentSample;
          const transient = (nextSample - previousSample) * 4.8;
          const rawValue = currentSample * 0.72 + transient;
          filteredValue = filteredValue * 0.22 + rawValue * 0.78;
          const magnitude = Math.abs(filteredValue);
          peak = Math.max(peak, magnitude);
          transientPeak = Math.max(transientPeak, Math.abs(transient));
          let shapedMagnitude = magnitude;
          if (magnitude > 0.2) {
            const excess = magnitude - 0.2;
            shapedMagnitude = 0.2 + excess / (1 + excess * 1.9);
          }
          if (magnitude > 0.46) {
            const surgeExcess = magnitude - 0.46;
            shapedMagnitude += surgeExcess / (1 + surgeExcess * 0.42) * 0.82;
          }
          if (magnitude > 0.68) {
            const absoluteExcess = magnitude - 0.68;
            shapedMagnitude += absoluteExcess / (1 + absoluteExcess * 0.18) * 1.05;
          }
          traceValues[pointIndex] = clamp2(Math.sign(filteredValue) * Math.tanh(shapedMagnitude * 2.35), -1, 1);
        }
      }
      const structureHold = clamp2(
        Math.max(0, peak - 0.46) * 1.08 +
        Math.max(0, transientPeak - 0.24) * 1.42,
        0,
        1
      );
      if (structureHold > 0.01 && pointCount > 4) {
        const blend = structureHold * 0.76;
        for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
          const center = traceValues[pointIndex] || 0;
          const left = traceValues[Math.max(0, pointIndex - 1)] || center;
          const right = traceValues[Math.min(pointCount - 1, pointIndex + 1)] || center;
          const farLeft = traceValues[Math.max(0, pointIndex - 3)] || left;
          const farRight = traceValues[Math.min(pointCount - 1, pointIndex + 3)] || right;
          const spine = (left + center + right) / 3;
          const structure = (farLeft * 0.8 + left * 1.15 + center * 1.5 + right * 1.15 + farRight * 0.8) / 5.4;
          traceSmoothingValues[pointIndex] = center * (1 - blend) + (spine * 0.42 + structure * 0.58) * blend;
        }
        traceValues.set(traceSmoothingValues);
      }
      let rms = 0;
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const value = traceValues[pointIndex] || 0;
        rms += value * value;
      }
      rms = Math.sqrt(rms / Math.max(pointCount, 1));
      const loudnessBoost = clamp2(
        Math.max(0, peak - 0.42) * 0.88 +
        Math.max(0, rms - 0.18) * 1.55 +
        Math.max(0, transientPeak - 0.34) * 0.1,
        0,
        1
      );
      const peakSurge = clamp2(
        Math.max(0, peak - 0.5) * 1.9 +
        Math.max(0, transientPeak - 0.32) * 0.28,
        0,
        1
      );
      const absolutePeakSurge = clamp2(
        Math.max(0, peak - 0.68) * 3.15 +
        Math.max(0, transientPeak - 0.44) * 0.52,
        0,
        1
      );
      const impact = clamp2(
        rms * 1.08 +
        Math.max(0, peak - 0.18) * 0.72 +
        Math.max(0, transientPeak - 0.16) * 0.12 +
        peakSurge * 0.34 +
        absolutePeakSurge * 0.22,
        0,
        1
      );
      const structureDamping = 1 - structureHold * 0.42;
      let baselineY = Math.round(height * (0.49 + loudnessBoost * 0.02 + structureHold * 0.008)) + 0.5;
      const desiredAmplitude = Math.max(
        16,
        height * (
          0.31 +
          loudnessBoost * (0.095 - structureHold * 0.02) +
          peakSurge * (0.12 * structureDamping) +
          absolutePeakSurge * (0.13 * structureDamping)
        )
      );
      const overscanPad = Math.max(14, height * 0.08);
      const maxAmplitude = Math.max(
        14,
        Math.min(baselineY - overscanPad, height - baselineY - overscanPad)
      );
      const amplitude = Math.min(desiredAmplitude * 2, maxAmplitude);
      baselineY = clamp2(baselineY, overscanPad + amplitude, height - overscanPad - amplitude);
      waveCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      waveCtx.strokeStyle = `rgba(248, 253, 255, ${(0.08 * SHUFFLE_TRACE_OPACITY_SCALE).toFixed(3)})`;
      waveCtx.lineWidth = 1;
      waveCtx.beginPath();
      waveCtx.moveTo(originX, baselineY + originY);
      waveCtx.lineTo(originX + width, baselineY + originY);
      waveCtx.stroke();
      const tracePath = typeof Path2D === "function" ? new Path2D() : null;
      if (tracePath) {
        tracePath.moveTo(originX, baselineY + originY);
      } else {
        waveCtx.beginPath();
        waveCtx.moveTo(originX, baselineY + originY);
      }
      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const value = traceValues[pointIndex] || 0;
        const x = originX + pointIndex * pointSpacing;
        const y = originY + baselineY - value * amplitude;
        if (tracePath) {
          tracePath.lineTo(x, y);
        } else {
          waveCtx.lineTo(x, y);
        }
      }
      if (tracePath) {
        tracePath.lineTo(originX + width - 1, baselineY + originY);
      } else {
        waveCtx.lineTo(originX + width - 1, baselineY + originY);
      }
      waveCtx.lineWidth = 2.2 + impact * 1.5 + peakSurge * (0.42 * structureDamping) + absolutePeakSurge * (0.34 * structureDamping);
      waveCtx.lineCap = "round";
      waveCtx.lineJoin = "round";
      waveCtx.strokeStyle = `rgba(229, 248, 255, ${(Math.min(0.18 + impact * 0.18 + peakSurge * 0.02 + absolutePeakSurge * 0.02, 0.36) * SHUFFLE_TRACE_OPACITY_SCALE).toFixed(3)})`;
      if (tracePath) {
        waveCtx.stroke(tracePath);
      } else {
        waveCtx.stroke();
      }
      waveCtx.lineWidth = 1.12;
      waveCtx.strokeStyle = `rgba(248, 253, 255, ${SHUFFLE_TRACE_OPACITY_SCALE.toFixed(3)})`;
      if (tracePath) {
        waveCtx.stroke(tracePath);
      } else {
        waveCtx.stroke();
      }
      const edgeMarkerHeight = Math.max(2, Math.round(Math.min(height * 0.22, amplitude * 0.32)));
      const edgeMarkerTop = Math.round(originY + baselineY - edgeMarkerHeight / 2);
      waveCtx.fillStyle = `rgba(248, 253, 255, ${(0.16 * SHUFFLE_TRACE_OPACITY_SCALE).toFixed(3)})`;
      waveCtx.fillRect(originX, edgeMarkerTop, 1, edgeMarkerHeight);
      waveCtx.fillRect(originX + width - 1, edgeMarkerTop, 1, edgeMarkerHeight);
    }
    function renderLoop(nowMs) {
      if (disposed) return;
      const shouldRenderDesktopWave = Boolean(playerRoot && playbackUnlocked && !compactPlayerMode && !document.hidden);
      const frameIntervalMs = shouldRenderDesktopWave && !audioEl.paused ? SHUFFLE_ACTIVE_FRAME_INTERVAL_MS : SHUFFLE_IDLE_FRAME_INTERVAL_MS;
      if (nowMs - lastVisualizerFrameMs < frameIntervalMs) {
        rafId = window.requestAnimationFrame(renderLoop);
        return;
      }
      lastVisualizerFrameMs = nowMs;
      const pulseMetrics = measureReactivePulse();
      syncReactiveVisuals(pulseMetrics.beat, pulseMetrics.flash);
      if (shouldRenderDesktopWave) {
        drawTrace(pulseMetrics.sampled);
      } else {
        hideWavePortal();
      }
      rafId = window.requestAnimationFrame(renderLoop);
    }
    async function attemptPlay() {
      await waitForSiteLoadCompletion();
      if (disposed) return;
      if (!audioEl.src) return;
      await ensureAnalysisGraph(true);
      try {
        await audioEl.play();
        loadState = currentTrack ? "ready" : loadState;
      } catch {
        loadState = "blocked";
      }
      syncUi();
    }
    async function chooseAndLoadTrack(track, options = {}) {
      if (!track) return;
      currentTrack = track;
      loadState = "loading";
      traceValues = new Float32Array(0);
      traceSmoothingValues = new Float32Array(0);
      audioEl.pause();
      audioEl.src = resolveTrackUrl(track);
      audioEl.load();
      void ensureAnalysisGraph(false);
      syncUi();
      if (options.autoplay !== false) {
        await attemptPlay();
      }
    }
    async function chooseNextTrack(options = {}) {
      const nextTrack = pickWeightedShuffleTrack(waveformTracks, options.excludeCurrent === false ? "" : currentTrack?.id || "");
      if (!nextTrack) return;
      await chooseAndLoadTrack(nextTrack, options);
    }
    async function ensureManifest() {
      if (manifestPromise) return manifestPromise;
      manifestPromise = (async () => {
        const response = await fetch(SHUFFLE_MANIFEST_URL, { cache: "default" });
        if (!response.ok) {
          throw new Error(`Manifest fetch failed (${response.status})`);
        }
        const data = await response.json();
        const tracks = (Array.isArray(data?.tracks) ? data.tracks : []).map(normalizeShuffleTrackEntry).filter(Boolean);
        waveformTracks = sortShuffleTracksByRecency(tracks);
        return waveformTracks;
      })().catch(() => {
        waveformTracks = [];
        loadState = "error";
        syncUi();
        return [];
      });
      return manifestPromise;
    }
    function bindRoot(root2) {
      if (!(root2 instanceof HTMLElement)) return;
      playerRoot = root2;
      compactPlayerMode = root2.getAttribute("data-shuffle-mode") === "compact";
      waveSurface = root2.matches("[data-shuffle-surface]") ? root2 : root2.querySelector("[data-shuffle-surface]");
      titleEl = root2.querySelector("[data-shuffle-title]");
      artistEl = root2.querySelector("[data-shuffle-artist]");
      copyRootEl = root2.querySelector("[data-shuffle-copy]");
      progressFillEl = root2.querySelector("[data-shuffle-progress-fill]");
      timeRemainingEl = root2.querySelector("[data-shuffle-time]");
      applyVisualizerCopyState();
      if (waveSurface instanceof HTMLElement) {
        waveSurface.addEventListener("pointerdown", async (event) => {
          if (!(event instanceof PointerEvent) || event.button !== 0) return;
          if (!currentTrack) {
            await ensureManifest();
            await queueInitialTrackPlayback();
            return;
          }
          if (loadState === "blocked" || audioEl.paused) {
            await attemptPlay();
          }
        });
      }
      if ("ResizeObserver" in window && playerRoot) {
        resizeObserver = new ResizeObserver(() => {
          invalidateWaveLayout();
          ensureWaveCanvasSize();
        });
        resizeObserver.observe(playerRoot);
        if (waveSurface instanceof HTMLElement) {
          resizeObserver.observe(waveSurface);
        }
      }
      viewportGeometryListener = () => {
        invalidateWaveLayout();
        if (playbackUnlocked && !compactPlayerMode) {
          ensureWaveCanvasSize();
          return;
        }
        hideWavePortal();
      };
      window.addEventListener("resize", viewportGeometryListener, { passive: true });
      window.visualViewport?.addEventListener("resize", viewportGeometryListener, { passive: true });
      window.visualViewport?.addEventListener("scroll", viewportGeometryListener, { passive: true });
      if (playbackUnlocked && !compactPlayerMode) {
        ensureWaveCanvasSize();
      } else {
        hideWavePortal();
      }
      syncUi();
    }
    function unbindRoot() {
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (viewportGeometryListener) {
        window.removeEventListener("resize", viewportGeometryListener);
        window.visualViewport?.removeEventListener("resize", viewportGeometryListener);
        window.visualViewport?.removeEventListener("scroll", viewportGeometryListener);
        viewportGeometryListener = null;
      }
      playerRoot = null;
      waveSurface = null;
      hideWavePortal();
      invalidateWaveLayout();
      traceValues = new Float32Array(0);
      traceSmoothingValues = new Float32Array(0);
      titleEl = null;
      artistEl = null;
      copyRootEl = null;
      progressFillEl = null;
      timeRemainingEl = null;
      compactPlayerMode = false;
    }
    function attach(root2) {
      if (disposed) return;
      if (playerRoot === root2) {
        syncUi();
        return;
      }
      unbindRoot();
      if (root2 instanceof HTMLElement) {
        bindRoot(root2);
      }
    }
    function setMuted(nextMuted) {
      audioEl.muted = Boolean(nextMuted);
      syncAudioOutputGain();
      syncUi();
    }
    function setVolumeRatio(nextRatio) {
      const numericRatio = Number(nextRatio);
      const ratio = clamp2(Number.isFinite(numericRatio) ? numericRatio : 1, 0, 1);
      audioEl.volume = clamp2(SHUFFLE_MAX_VOLUME * ratio, 0, 1);
      if (ratio > 0 && audioEl.muted) {
        audioEl.muted = false;
      }
      syncAudioOutputGain();
      syncUi();
    }
    function toggleMuted() {
      setMuted(!audioEl.muted);
      return audioEl.muted;
    }
    function isMuted() {
      return Boolean(audioEl.muted);
    }
    async function ensureStarted() {
      if (disposed) return;
      await ensureManifest();
      if (disposed) return;
      if (!currentTrack) {
        await queueInitialTrackPlayback();
        if (!currentTrack && waveformTracks.length) {
          await chooseNextTrack({ autoplay: true, excludeCurrent: false });
        }
        syncUi();
        return;
      }
      if (audioEl.paused || loadState === "blocked") {
        await attemptPlay();
        return;
      }
      syncUi();
    }
    function pauseForExternalAudio() {
      if (disposed || !currentTrack || audioEl.paused) return false;
      audioEl.pause();
      return true;
    }
    async function resumeAfterExternalAudio() {
      if (disposed || !currentTrack || !audioEl.paused || loadState === "error") return false;
      await attemptPlay();
      return !audioEl.paused;
    }
    function isPlaying() {
      return Boolean(!disposed && currentTrack && !audioEl.paused);
    }
    function subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {
        };
      }
      stateSubscribers.add(listener);
      try {
        listener(buildPublicState());
      } catch {
      }
      return () => {
        stateSubscribers.delete(listener);
      };
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      clearVisualizerCopyTimers();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (previewCtx && previewCtx.state !== "closed") {
        void previewCtx.close().catch(() => {
        });
      }
      audioEl.pause();
      audioEl.src = "";
      audioEl.load();
      mediaSourceNode = null;
      analyserNode = null;
      outputGainNode = null;
      analyserSamples = new Float32Array(0);
      traceSmoothingValues = new Float32Array(0);
      unbindRoot();
      if (wavePortal instanceof HTMLElement) {
        wavePortal.remove();
      }
      wavePortal = null;
      waveCanvas = null;
      waveCtx = null;
    }
    audioEl.addEventListener("timeupdate", syncUi);
    audioEl.addEventListener("loadedmetadata", () => {
      loadState = loadState === "blocked" ? "blocked" : "ready";
      syncUi();
    });
    audioEl.addEventListener("play", () => {
      loadState = "ready";
      syncUi();
    });
    audioEl.addEventListener("pause", syncUi);
    audioEl.addEventListener("volumechange", syncUi);
    audioEl.addEventListener("seeked", syncUi);
    audioEl.addEventListener("ended", () => {
      void chooseNextTrack({ autoplay: true });
    });
    audioEl.addEventListener("error", () => {
      loadState = "error";
      syncUi();
    });
    rafId = window.requestAnimationFrame(renderLoop);
    void ensureManifest().then((tracks) => {
      if (disposed || !tracks.length || currentTrack) return;
      void queueInitialTrackPlayback();
    });
    return {
      attach,
      dispose,
      debugAdvanceTrack: () => chooseNextTrack({ autoplay: true }),
      isPlaying,
      ensureStarted,
      toggleMuted,
      setMuted,
      setVolumeRatio,
      isMuted,
      getState: buildPublicState,
      subscribe,
      pauseForExternalAudio,
      resumeAfterExternalAudio
    };
  }
  function ensurePayload(site, payload) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const safeProfile = safePayload.profile && typeof safePayload.profile === "object" ? safePayload.profile : {};
    return {
      siteId: site.id,
      ...safePayload,
      profile: {
        name: site.label,
        handle: site.url,
        url: site.url,
        avatarUrl: "",
        bio: "",
        ...safeProfile
      },
      stats: Array.isArray(safePayload.stats) ? safePayload.stats : [],
      items: Array.isArray(safePayload.items) ? safePayload.items : [],
      freshnessStatus: safePayload.freshnessStatus || "STATIC",
      sourceStatus: safePayload.sourceStatus || "PARTIAL"
    };
  }
  function statMapFromList(stats) {
    const map = /* @__PURE__ */ new Map();
    for (const stat of Array.isArray(stats) ? stats : []) {
      const label = String(stat?.label || "").trim();
      if (!label) continue;
      map.set(label.toLowerCase(), String(stat?.value || "").trim());
    }
    return map;
  }
  function renderStats(stats, limit = 6) {
    const entries = Array.isArray(stats) ? stats.slice(0, limit) : [];
    if (!entries.length) {
      return '<p class="social-card-empty">No stats available.</p>';
    }
    return `
    <div class="steam-showcase-stats">
      ${entries.map((entry) => `
        <div class="steam-stat">
          <span class="steam-stat-label">${escapeHtml(entry.label)}</span>
          <span class="steam-stat-value">${escapeHtml(entry.value)}</span>
        </div>
      `).join("")}
    </div>
  `;
  }
  function renderItems(items, maxCount = 10) {
    const entries = Array.isArray(items) ? items.slice(0, maxCount) : [];
    if (!entries.length) {
      return '<p class="social-card-empty">No recent activity.</p>';
    }
    return `
    <ul class="steam-showcase-items">
      ${entries.map((item) => {
      const itemUrl = sanitizeUrl(item.url);
      return `
          <li class="steam-showcase-item">
            <button class="social-item-button" type="button" ${itemUrl ? `data-item-url="${escapeHtml(itemUrl)}"` : ""}>
              <span class="social-item-title">${escapeHtml(item.title)}</span>
              <span class="social-item-meta">${escapeHtml(item.meta)}</span>
            </button>
          </li>
        `;
    }).join("")}
    </ul>
  `;
  }
  function renderShowcaseHead(site, payload, title, subtitle) {
    const source = escapeHtml(payload.sourceStatus || "PARTIAL");
    const freshness = escapeHtml(payload.freshnessStatus || "STATIC");
    const openUrl = sanitizeUrl(payload.profile?.url || site.url);
    return `
    <header class="steam-showcase-head">
      <div class="steam-showcase-title-wrap">
        <h3 class="steam-showcase-title">${escapeHtml(title)}</h3>
        <span class="steam-showcase-subtitle">${escapeHtml(subtitle)}</span>
      </div>
      <div class="steam-showcase-head-actions">
        <span class="social-chip ${freshnessClass(payload.freshnessStatus)}">${freshness}</span>
        <span class="social-chip ${sourceClass(payload.sourceStatus)}">${source}</span>
        <button class="social-open-original" type="button" ${openUrl ? `data-open-url="${escapeHtml(openUrl)}"` : ""}>Open Original</button>
      </div>
    </header>
  `;
  }
  function resolveDiscordStatusKey(profileStatusKey, statusText) {
    const fromProfile = String(profileStatusKey || "").toLowerCase();
    if (fromProfile === "online" || fromProfile === "idle" || fromProfile === "dnd" || fromProfile === "offline") {
      return fromProfile;
    }
    const normalized = String(statusText || "").toLowerCase();
    if (normalized.includes("do not disturb") || normalized === "dnd") return "dnd";
    if (normalized.includes("online")) return "online";
    if (normalized.includes("idle")) return "idle";
    if (normalized.includes("offline")) return "offline";
    return "unknown";
  }
  function resolveLinkOnlineState(siteId, payload) {
    if (!payload || typeof payload !== "object") return null;
    if (siteId === "steam") {
      const statMap = statMapFromList(payload.stats);
      const statusText = String(payload.profile?.statusText || statMap.get("status") || "").toLowerCase();
      if (!statusText) return false;
      if (statusText.includes("offline")) return false;
      return statusText.includes("online") || statusText.includes("in-game") || statusText.includes("away") || statusText.includes("busy");
    }
    if (siteId === "discord") {
      const statMap = statMapFromList(payload.stats);
      const statusText = String(payload.profile?.statusText || statMap.get("status") || "").trim();
      const statusKey = resolveDiscordStatusKey(payload.profile?.statusKey, statusText);
      return statusKey === "online" || statusKey === "idle" || statusKey === "dnd";
    }
    return null;
  }
  function pickHeroPayload(payloadById, sites) {
    return payloadById.get("steam") || payloadById.get("twitter") || payloadById.get("discord") || payloadById.get(sites?.[0]?.id || "") || null;
  }
  function renderHeroOrnamentMarkup() {
    return `
      <span class="steam-hero-bio-sparkle steam-hero-bio-sparkle--left" aria-hidden="true">˚₊‧</span>
      <span class="steam-hero-bio-wing steam-hero-bio-wing--left" aria-hidden="true">꒰ა</span>
      <span class="steam-hero-bio-heart" aria-hidden="true">♡</span>
      <span class="steam-hero-bio-wing steam-hero-bio-wing--right" aria-hidden="true">໒꒱</span>
      <span class="steam-hero-bio-sparkle steam-hero-bio-sparkle--right" aria-hidden="true">‧₊˚</span>
    `;
  }
  function renderHeroDescriptionMarkup() {
    return escapeHtml(HERO_DESCRIPTION_TEXT);
  }
  function extractDiscordCustomStatusEmojiData(activities) {
    const list = Array.isArray(activities) ? activities : [];
    const customStatus = list.find((activity) => Number(activity?.type) === 4) || null;
    const emoji = customStatus?.emoji && typeof customStatus.emoji === "object" ? customStatus.emoji : null;
    if (!emoji) {
      return {
        url: "",
        alt: ""
      };
    }
    const alt = firstNonEmpty(emoji.name, "Discord custom emoji");
    return {
      url: sanitizeUrl(buildDiscordEmojiUrl(emoji.id, Boolean(emoji.animated))),
      alt
    };
  }
  function normalizeDiscordCustomStatusToken(value) {
    return String(value || "").trim().toLowerCase().replace(/^:+|:+$/g, "").replace(/[\s_-]+/g, "");
  }
  function stripLeadingDiscordCustomStatusToken(text, emojiAlt) {
    const rawText = firstNonEmpty(text);
    const rawEmojiAlt = firstNonEmpty(emojiAlt);
    if (!rawText || !rawEmojiAlt) return rawText;
    const normalizedEmoji = normalizeDiscordCustomStatusToken(rawEmojiAlt);
    if (!normalizedEmoji) return rawText;
    const baseToken = rawEmojiAlt.trim().replace(/^:+|:+$/g, "");
    const candidateTokens = new Set([
      baseToken,
      `:${baseToken}:`,
      baseToken.replace(/[_-]+/g, " "),
      baseToken.replace(/[\s-]+/g, "_"),
      baseToken.replace(/[\s_]+/g, "-")
    ]);
    for (const candidate of candidateTokens) {
      const safeCandidate = String(candidate || "").trim();
      if (!safeCandidate) continue;
      const escapedCandidate = safeCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`^\\s*${escapedCandidate}(?=$|[\\s:.,!?;\\-])`, "i");
      if (!pattern.test(rawText)) continue;
      const stripped = rawText.replace(pattern, "").replace(/^[\\s:._,-]+/, "").trim();
      if (!stripped || normalizeDiscordCustomStatusToken(stripped) === normalizedEmoji) {
        return "";
      }
      return stripped;
    }
    return rawText;
  }
  function buildDiscordPresenceCardModel(payload) {
    const safePayload = payload && typeof payload === "object" ? payload : null;
    const presence = safePayload?.presence && typeof safePayload.presence === "object" ? safePayload.presence : null;
    const profile = safePayload?.profile && typeof safePayload.profile === "object" ? safePayload.profile : {};
    const activities = Array.isArray(safePayload?.activities) ? safePayload.activities : [];
    const displayName = firstNonEmpty(presence?.displayName, profile.name, "foundlifeless");
    const username = firstNonEmpty(presence?.username, displayName, "foundlifeless");
    const statusKey = resolveDiscordStatusKey(presence?.statusKey, profile.statusText);
    const avatarUrl = sanitizeUrl(firstNonEmpty(presence?.avatarUrl, profile.avatarUrl));
    const avatarDecorationUrl = sanitizeUrl(firstNonEmpty(presence?.avatarDecorationUrl, profile.decorationUrl));
    const hasNitro = Boolean(presence?.hasNitro);
    const nitroBadgeIconUrl = sanitizeUrl(hasNitro ? presence?.nitroBadgeIconUrl : "");
    const spotify = presence?.spotify && typeof presence.spotify === "object" ? presence.spotify : {};
    const isListeningToSpotify = Boolean(spotify?.isListening);
    const albumArtUrl = sanitizeUrl(spotify?.albumArtUrl);
    const customEmoji = extractDiscordCustomStatusEmojiData(activities);
    const normalizedEmojiName = normalizeDiscordCustomStatusToken(customEmoji.alt);
    const customStatusText = stripLeadingDiscordCustomStatusToken(presence?.customStatusText, customEmoji.alt);
    const normalizedCustomStatusText = normalizeDiscordCustomStatusToken(customStatusText);
    let headline = isListeningToSpotify
      ? `Listening to ${firstNonEmpty(spotify?.song, "Unknown track")}`
      : firstNonEmpty(
        customStatusText,
        presence?.primaryActivity?.name ? `${firstNonEmpty(presence?.primaryActivity?.label, "Active in")} ${presence.primaryActivity.name}` : "",
        presence?.statusLabel,
        profile.statusText,
        "Discord presence unavailable"
      );
    if (!customEmoji.url && customEmoji.alt && normalizedCustomStatusText !== normalizedEmojiName) {
      headline = `${customEmoji.alt} ${headline}`.trim();
    }
    return {
      displayName,
      username,
      hasNitro,
      nitroBadgeIconUrl,
      avatarUrl,
      avatarDecorationUrl,
      statusKey,
      headline,
      meta: isListeningToSpotify
        ? firstNonEmpty(spotify?.artist ? `by ${spotify.artist}` : "", spotify?.album)
        : firstNonEmpty(
          presence?.primaryActivity?.subtitle,
          presence?.statusLabel,
          profile.statusText
        ),
      showAlbumArt: Boolean(isListeningToSpotify && albumArtUrl),
      albumArtUrl,
      customStatusEmojiUrl: customEmoji.url,
      customStatusEmojiAlt: customEmoji.url ? customEmoji.alt : ""
    };
  }
  function renderDiscordPresencePanel(payload, options = {}) {
    const model = buildDiscordPresenceCardModel(payload);
    const compact = Boolean(options?.compact);
    const mobileRevealState = compact ? String(options?.mobileRevealState || "pending") : "";
    return `
      <section class="steam-sidebar-panel discord-presence-panel" aria-label="Discord presence">
        <div class="discord-presence-shell">
          <div class="discord-presence-reveal"${compact ? ` data-mobile-discord-reveal="${escapeHtml(mobileRevealState)}"` : ""}>
            <article class="discord-presence-card discord-presence-card--foundlifeless" data-spotify-active="${model.showAlbumArt ? "true" : "false"}">
              <div class="discord-presence-body">
                <div class="discord-presence-avatar-stack">
                  <div class="discord-presence-avatar-wrap discord-presence-avatar-wrap--${escapeHtml(model.statusKey || "offline")}">
                    ${model.avatarUrl ? `<img class="discord-presence-avatar" src="${escapeHtml(model.avatarUrl)}" alt="" loading="lazy" decoding="async" />` : '<div class="discord-presence-avatar discord-presence-avatar--fallback">D</div>'}
                    ${model.avatarDecorationUrl ? `<img class="discord-presence-avatar-decoration" src="${escapeHtml(model.avatarDecorationUrl)}" alt="" loading="lazy" decoding="async" aria-hidden="true" />` : ""}
                    <span class="discord-presence-status-badge" data-status="${escapeHtml(model.statusKey || "offline")}" aria-hidden="true"></span>
                  </div>
                </div>
                <div class="discord-presence-main">
                  <div class="discord-presence-copy">
                    <div class="discord-presence-identity-row">
                      <span class="discord-presence-name">${escapeHtml(model.displayName)}</span>
                      ${model.nitroBadgeIconUrl ? `<img class="discord-presence-nitro-badge" src="${escapeHtml(model.nitroBadgeIconUrl)}" alt="Discord Nitro" loading="lazy" decoding="async" />` : ""}
                    </div>
                    <div class="discord-presence-subline">
                      ${model.customStatusEmojiUrl ? `<img class="discord-presence-custom-emoji" src="${escapeHtml(model.customStatusEmojiUrl)}" alt="${escapeHtml(model.customStatusEmojiAlt || "")}" loading="lazy" decoding="async" />` : ""}
                      <p class="discord-presence-headline">${escapeHtml(model.headline)}</p>
                    </div>
                    ${model.meta ? `<p class="discord-presence-meta">${escapeHtml(model.meta)}</p>` : ""}
                  </div>
                  ${model.showAlbumArt ? `<div class="discord-presence-album-art-wrap"><img class="discord-presence-album-art" src="${escapeHtml(model.albumArtUrl)}" alt="" loading="lazy" decoding="async" /></div>` : ""}
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>
    `;
  }
  function renderHero(payloadById, sites, options = {}) {
    const compact = Boolean(options?.compact);
    const hero = pickHeroPayload(payloadById, sites);
    const avatarUrl = sanitizeUrl(HERO_AVATAR_LOCKED_URL) || sanitizeUrl(hero?.profile?.avatarUrl || payloadById.get("steam")?.profile?.avatarUrl || "");
    const decorationUrl = sanitizeUrl(
      payloadById.get("discord")?.profile?.decorationUrl || hero?.profile?.decorationUrl || ""
    );
    const heroName = escapeHtml(hero?.profile?.name || "FoundLifeless");
    const heroOrnament = renderHeroOrnamentMarkup();
    const heroDescription = compact ? "" : renderHeroDescriptionMarkup();
    return `
    <section class="steam-hero-shell${compact ? " steam-hero-shell--compact-mobile" : ""}" aria-label="Profile hero">
      <div class="steam-hero-content${compact ? " steam-hero-content--compact-mobile" : ""}">
        <div class="steam-hero-avatar-wrap${decorationUrl ? " steam-hero-avatar-wrap--decorated" : ""}">
          ${avatarUrl ? `<img class="steam-hero-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" decoding="async" />` : '<div class="steam-hero-avatar steam-hero-avatar--fallback">A</div>'}
          ${decorationUrl ? `<img class="steam-hero-avatar-decoration" src="${escapeHtml(decorationUrl)}" alt="" loading="eager" decoding="async" aria-hidden="true" />` : ""}
        </div>
        <div class="steam-hero-copy${compact ? " steam-hero-copy--compact-mobile" : ""}">
          <h2 class="steam-hero-name${compact ? " steam-hero-name--compact-mobile" : ""}">${heroName}</h2>
          <div class="steam-hero-ornament${compact ? " steam-hero-ornament--compact-mobile" : ""}" aria-hidden="true">${heroOrnament}</div>
          ${heroDescription ? `<p class="steam-hero-description">${heroDescription}</p>` : ""}
        </div>
      </div>
    </section>
  `;
  }
  function renderSteamRecentGames(items) {
    const entries = Array.isArray(items) ? items.slice(0, 8) : [];
    if (!entries.length) {
      return '<p class="social-card-empty">No recently played games available.</p>';
    }
    return `
    <ul class="steam-activity-list">
      ${entries.map((item) => {
      const itemUrl = sanitizeUrl(item.url);
      const imageUrl = sanitizeUrl(item.artworkUrl || item.imageUrl);
      const hoursOnRecord = String(item.hoursOnRecord || "").trim();
      const lastPlayed = String(item.lastPlayed || "").trim();
      const hoursLabel = hoursOnRecord ? `${hoursOnRecord} hrs on record` : "hours on record unavailable";
      const playedLabel = lastPlayed || "last played recently";
      return `
          <li class="steam-activity-row">
            <button class="steam-activity-row-button" type="button" ${itemUrl ? `data-item-url="${escapeHtml(itemUrl)}"` : ""}>
              <span class="steam-activity-capsule">
                ${imageUrl ? `<img class="steam-activity-capsule-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" />` : '<span class="steam-activity-capsule-fallback">No Art</span>'}
              </span>
              <span class="steam-activity-main">
                <span class="steam-activity-game-title">${escapeHtml(item.title || "Unknown game")}</span>
              </span>
              <span class="steam-activity-side">
                <span class="steam-activity-hours">${escapeHtml(hoursLabel)}</span>
                <span class="steam-activity-last-played">${escapeHtml(playedLabel)}</span>
              </span>
            </button>
          </li>
        `;
    }).join("")}
    </ul>
  `;
  }
  function renderSteamShowcase(site, payload) {
    const statMap = statMapFromList(payload.stats);
    const twoWeekHoursRaw = String(statMap.get("2w hours") || "").trim();
    const twoWeekHours = twoWeekHoursRaw.match(/([\d.,]+)/)?.[1] || "--";
    const twoWeekLabel = `${twoWeekHours} hours past 2 weeks`;
    return `
    <article class="steam-showcase steam-showcase--${escapeHtml(site.id)} steam-showcase--steam-activity" data-site-id="${escapeHtml(site.id)}" data-showcase-variant="steam-recent-activity">
      <div class="steam-activity-header">
        <h3 class="steam-activity-header-title">Recent Activity</h3>
        <span class="steam-activity-header-hours">${escapeHtml(twoWeekLabel)}</span>
      </div>
      <div class="steam-activity-body">
        ${renderSteamRecentGames(payload.items)}
      </div>
    </article>
  `;
  }
  function renderLastFmRecentTrackRow(item, options = {}) {
    const row = item && typeof item === "object" ? item : {};
    const isNowPlaying = Boolean(options?.isNowPlaying || row.isNowPlaying);
    const isLoved = Boolean(row.isLoved);
    const monthlyTopRank = Number.parseInt(String(row.monthlyTopRank ?? "").trim(), 10);
    const itemUrl = sanitizeUrl(row.url);
    const imageUrl = sanitizeUrl(row.imageUrl);
    const buttonAttrs = [
      itemUrl ? `data-item-url="${escapeHtml(itemUrl)}"` : "",
      `data-lastfm-track-title="${escapeHtml(row.title || "")}"`,
      `data-lastfm-track-artist="${escapeHtml(row.subtitle || row.meta || "")}"`,
      row.album ? `data-lastfm-track-album="${escapeHtml(row.album)}"` : "",
      itemUrl ? `data-lastfm-track-url="${escapeHtml(itemUrl)}"` : ""
    ].filter(Boolean).join(" ");
    const itemClass = isNowPlaying ? "lastfm-recent-item lastfm-recent-item--now-playing" : "lastfm-recent-item";
    const ageLabel = firstNonEmpty(row.countLabel, "--");
    const lovedIconMarkup = isLoved ? '<span class="lastfm-loved-indicator" aria-label="Loved track" title="Loved track"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1 3.58 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : "";
    const monthlyBadgeMarkup = monthlyTopRank ? `<span class="lastfm-monthly-rank-badge" aria-label="Monthly top rank #${escapeHtml(monthlyTopRank)}">#${escapeHtml(monthlyTopRank)} month</span>` : "";
    const statusMarkup = isNowPlaying ? '<span class="lastfm-now-playing-badge" aria-label="Now Playing"><span class="lastfm-now-playing-bars" aria-hidden="true"><span class="lastfm-now-playing-bar"></span><span class="lastfm-now-playing-bar"></span><span class="lastfm-now-playing-bar"></span></span><span class="lastfm-now-playing-label">Now Playing</span></span>' : `<span class="lastfm-recent-age">${escapeHtml(ageLabel)}</span>`;
    return `
        <li class="${itemClass}">
            <button class="social-item-button lastfm-recent-button" type="button" ${buttonAttrs}>
              <span class="lastfm-recent-art">
                ${imageUrl ? `<img class="lastfm-recent-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" />` : '<span class="lastfm-recent-note" aria-hidden="true">\u266A</span>'}
              </span>
              <span class="lastfm-recent-title">${escapeHtml(row.title || "Unknown track")}</span>
              <span class="lastfm-recent-meta">${escapeHtml(row.subtitle || row.meta || "Unknown artist")}</span>
              <span class="lastfm-recent-side">
                <span class="lastfm-recent-status-row">
                  ${statusMarkup}
                  ${lovedIconMarkup}
                  ${monthlyBadgeMarkup}
                </span>
              </span>
            </button>
          </li>
        `;
  }
  function renderLastFmReferenceTrackDiscovery(discovery) {
    const safeDiscovery = discovery && typeof discovery === "object" ? discovery : null;
    if (!safeDiscovery) {
      return "";
    }
    const similarTracks = Array.isArray(safeDiscovery.similarTracks) ? safeDiscovery.similarTracks : [];
    const topTags = Array.isArray(safeDiscovery.topTags) ? safeDiscovery.topTags : [];
    if (!similarTracks.length && !topTags.length) {
      return "";
    }
    const similarTrackLabels = similarTracks.map((entry) => firstNonEmpty(entry?.title, "Unknown track")).filter(Boolean);
    return `
      <li class="lastfm-recent-discovery" aria-label="Track discovery">
        ${similarTrackLabels.length ? `<p class="lastfm-discovery-line"><span class="lastfm-discovery-label">Sounds like:</span><span class="lastfm-discovery-value">${escapeHtml(similarTrackLabels.join(" · "))}</span></p>` : ""}
        ${topTags.length ? `<div class="lastfm-track-tags" aria-label="Track tags">${topTags.map((tag) => `<span class="lastfm-track-tag">${escapeHtml(tag.name)}</span>`).join("")}</div>` : ""}
      </li>
    `;
  }
  function renderLastFmRecentTracks(items, currentlyListening = null) {
    const maxVisibleRows = 10;
    const entries = Array.isArray(items) ? items.slice(0, maxVisibleRows) : [];
    const nowPlaying = currentlyListening && typeof currentlyListening === "object" ? currentlyListening : null;
    const filteredEntries = nowPlaying ? entries.filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.id && nowPlaying.id && entry.id === nowPlaying.id) return false;
      const sameTitle = String(entry.title || "").trim() === String(nowPlaying.title || "").trim();
      const sameArtist = String(entry.subtitle || "").trim() === String(nowPlaying.subtitle || "").trim();
      return !(sameTitle && sameArtist);
    }) : entries;
    const visibleEntries = filteredEntries.slice(0, Math.max(0, maxVisibleRows - (nowPlaying ? 1 : 0)));
    if (!filteredEntries.length && !nowPlaying) {
      return '<p class="social-card-empty">No recent Last.fm songs available.</p>';
    }
    let listMarkup = "";
    if (nowPlaying) {
      listMarkup += renderLastFmRecentTrackRow(nowPlaying, { isNowPlaying: true });
      listMarkup += visibleEntries.map((item) => renderLastFmRecentTrackRow(item)).join("");
    } else {
      visibleEntries.forEach((item) => {
        listMarkup += renderLastFmRecentTrackRow(item);
      });
    }
    return `
    <ul class="lastfm-recent-list">
      ${listMarkup}
    </ul>
  `;
  }
  function renderLastFmProfileTotals(totals) {
    const safeTotals = totals && typeof totals === "object" ? totals : {};
    const entries = [
      { label: "Scrobbles", value: String(safeTotals.scrobbles || "--") },
      { label: "Artists", value: String(safeTotals.artists || "--") },
      { label: "Loved Tracks", value: String(safeTotals.lovedTracks || "--") }
    ];
    return `
    <div class="lastfm-profile-totals" role="list" aria-label="Last.fm totals">
      ${entries.map((entry) => `
        <div class="lastfm-profile-total" role="listitem">
          <span class="lastfm-profile-total-label">${escapeHtml(entry.label)}</span>
          <span class="lastfm-profile-total-value">${escapeHtml(entry.value)}</span>
        </div>
      `).join("")}
    </div>
  `;
  }
  function renderLastFmMediaGrid(items, kind) {
    const entries = Array.isArray(items) ? items.slice(0, 8) : [];
    if (!entries.length) {
      return '<p class="social-card-empty">No chart entries available.</p>';
    }
    return `
    <ul class="lastfm-media-grid lastfm-media-grid--${escapeHtml(kind)}">
      ${entries.map((item) => {
      const itemUrl = sanitizeUrl(item.url);
      const imageUrl = sanitizeUrl(item.imageUrl);
      const buttonAttrs = [
        itemUrl ? `data-item-url="${escapeHtml(itemUrl)}"` : "",
        item.artistName ? `data-lastfm-artist-name="${escapeHtml(item.artistName)}"` : "",
        item.albumTitle ? `data-lastfm-album-title="${escapeHtml(item.albumTitle)}"` : "",
        item.albumArtist ? `data-lastfm-album-artist="${escapeHtml(item.albumArtist)}"` : ""
      ].filter(Boolean).join(" ");
      return `
          <li class="lastfm-media-item">
            <button class="social-item-button lastfm-media-button" type="button"${buttonAttrs ? ` ${buttonAttrs}` : ""}>
              <span class="lastfm-media-image-wrap">
                ${imageUrl ? `<img class="lastfm-media-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" />` : '<span class="lastfm-media-image lastfm-media-image--fallback">No Art</span>'}
                <span class="lastfm-media-count">${escapeHtml(item.countLabel || "--")}</span>
              </span>
              <span class="lastfm-media-copy">
                <span class="lastfm-media-title">${escapeHtml(item.title || "Unknown")}</span>
                ${item.subtitle ? `<span class="lastfm-media-subtitle">${escapeHtml(item.subtitle)}</span>` : ""}
              </span>
            </button>
          </li>
        `;
    }).join("")}
    </ul>
  `;
  }
  function renderLastFmShowcase(site, payload) {
    const sections = payload.sections && typeof payload.sections === "object" ? payload.sections : {};
    const currentlyListening = sections.currentlyListening && typeof sections.currentlyListening === "object" ? sections.currentlyListening : null;
    const recentTracks = Array.isArray(sections.recentTracks) && sections.recentTracks.length ? sections.recentTracks : payload.items;
    const topArtists = Array.isArray(sections.topArtists) ? sections.topArtists : [];
    const topAlbums = Array.isArray(sections.topAlbums) ? sections.topAlbums : [];
    return `
    <article class="steam-showcase steam-showcase--${escapeHtml(site.id)} steam-showcase--lastfm-chart steam-showcase--lastfm-minimal" data-site-id="${escapeHtml(site.id)}" data-showcase-variant="lastfm-sections">
      <div class="steam-showcase-body steam-showcase-body--single steam-showcase-body--lastfm-minimal">
        <section class="steam-showcase-content steam-showcase-content--full steam-showcase-content--lastfm-minimal">
          <div class="lastfm-sections">
            <section class="lastfm-section">
              <h4 class="lastfm-section-title">Recent Tracks</h4>
              ${renderLastFmRecentTracks(recentTracks, currentlyListening)}
            </section>
            <section class="lastfm-section">
              <h4 class="lastfm-section-title">Top Artists</h4>
              ${renderLastFmMediaGrid(topArtists, "artists")}
            </section>
            <section class="lastfm-section">
              <h4 class="lastfm-section-title">Top Albums</h4>
              ${renderLastFmMediaGrid(topAlbums, "albums")}
            </section>
          </div>
        </section>
      </div>
    </article>
  `;
  }
  function renderShufflePlayerMarkup(options = {}) {
    const playerClassName = firstNonEmpty(options.playerClassName, "josie-audio-player");
    const surfaceClassName = firstNonEmpty(options.surfaceClassName, "josie-audio-player-wave-shell");
    return `
    <div class="${escapeHtml(playerClassName)}" data-shuffle-player>
        <div class="${escapeHtml(surfaceClassName)}" data-shuffle-surface aria-label="Audio visualizer">
          <div class="josie-audio-player-overlay">
          <div class="josie-audio-player-copy" data-shuffle-copy data-shuffle-copy-state="visible">
            <p class="josie-audio-player-title" data-shuffle-title>Loading Shuffle...</p>
            <p class="josie-audio-player-artist" data-shuffle-artist>Unknown Artist</p>
          </div>
        </div>
      </div>
    </div>
  `;
  }
  function renderCompactMobileAudioPlayer() {
    return `
    <div class="josie-mobile-audio-player">
      ${renderShufflePlayerMarkup({
        playerClassName: "josie-audio-player josie-audio-player--mobile-dock"
      })}
    </div>
  `;
  }
  function renderLastFmTrackPanelStat(label, value, options = {}) {
    const valueClass = options?.valueClass ? ` ${escapeHtml(options.valueClass)}` : "";
    return `
      <div class="lastfm-track-panel-stat">
        <span class="lastfm-track-panel-stat-label">${escapeHtml(label)}</span>
        <span class="lastfm-track-panel-stat-value${valueClass}">${escapeHtml(value)}</span>
      </div>
    `;
  }
  function renderLastFmTrackPanelSpotifyDisabled(title = "Unavailable", meta = "Spotify player unavailable for this track.") {
    return `
      <div class="lastfm-track-panel-spotify-disabled" aria-hidden="true">
        <span class="lastfm-track-panel-spotify-disabled-icon">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M12 1.5A10.5 10.5 0 1 0 22.5 12 10.51 10.51 0 0 0 12 1.5Zm4.83 15.15a.78.78 0 0 1-1.08.26 9.54 9.54 0 0 0-8.92-.77.78.78 0 1 1-.62-1.44 11.1 11.1 0 0 1 10.42.91.78.78 0 0 1 .2 1.04Zm1.54-3.19a.98.98 0 0 1-1.33.35 11.83 11.83 0 0 0-11.33-.93.98.98 0 1 1-.83-1.77 13.8 13.8 0 0 1 13.23 1.08.98.98 0 0 1 .26 1.27Zm.13-3.46a1.18 1.18 0 0 1-1.6.39 14.21 14.21 0 0 0-13.91-1.04 1.18 1.18 0 1 1-.95-2.15 16.57 16.57 0 0 1 16.19 1.24 1.18 1.18 0 0 1 .27 1.56Z" fill="currentColor"></path>
          </svg>
        </span>
        <span class="lastfm-track-panel-spotify-disabled-copy">
          <span class="lastfm-track-panel-spotify-disabled-title">${escapeHtml(title)}</span>
          <span class="lastfm-track-panel-spotify-disabled-meta">${escapeHtml(meta)}</span>
        </span>
      </div>
    `;
  }
  function renderLastFmPanelAmbientAttributes(imageUrl) {
    const safeImageUrl = sanitizeUrl(imageUrl);
    if (!safeImageUrl) return "";
    return ` data-has-ambient-light="true" style="--lastfm-track-panel-ambient-image: url('${escapeHtml(safeImageUrl)}');"`;
  }
  function renderLastFmSummarySection(title, summary, sourceUrl, hasMore) {
    const safeSummary = firstNonEmpty(summary, "");
    if (!safeSummary) return "";
    const safeSourceUrl = sanitizeUrl(sourceUrl);
    const readMoreMarkup = hasMore && safeSourceUrl ? `
        <button class="lastfm-track-panel-summary-link" type="button" data-open-url="${escapeHtml(safeSourceUrl)}">Read More</button>
      ` : "";
    return `
      <section class="lastfm-track-panel-summary">
        <h4 class="lastfm-track-panel-section-title">${escapeHtml(title)}</h4>
        <p class="lastfm-track-panel-summary-text">${escapeHtml(safeSummary)}${readMoreMarkup}</p>
      </section>
    `;
  }
  function buildSpotifyTrackEmbedUrlFromUrl(rawUrl) {
    const safeUrl = sanitizeUrl(rawUrl);
    if (!safeUrl) return "";
    try {
      const parsed = new URL(safeUrl);
      const match = parsed.pathname.match(/\/(?:embed\/)?track\/([A-Za-z0-9_-]+)(?:\/|$)/i);
      return match?.[1] ? `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator` : "";
    } catch {
      return "";
    }
  }
  function buildSpotifyTrackAppUrlFromUrl(rawUrl) {
    const safeUrl = sanitizeUrl(rawUrl);
    if (!safeUrl) return "";
    try {
      const parsed = new URL(safeUrl);
      const match = parsed.pathname.match(/\/(?:embed\/)?track\/([A-Za-z0-9_-]+)(?:\/|$)/i);
      return match?.[1] ? `spotify:track:${match[1]}` : "";
    } catch {
      return "";
    }
  }
  function resolveSpotifyTrackAppUrl(spotify) {
    return firstNonEmpty(
      buildSpotifyTrackAppUrlFromUrl(spotify?.embedUrl),
      buildSpotifyTrackAppUrlFromUrl(spotify?.openUrl)
    );
  }
  function canRenderSpotifyEmbedSlot(spotify) {
    const matchStatus = String(spotify?.matchStatus || "").trim().toLowerCase();
    return matchStatus === "matched" && Boolean(firstNonEmpty(
      sanitizeUrl(spotify?.embedUrl),
      sanitizeUrl(spotify?.openUrl)
    ));
  }
  function renderLastFmTrackPanelSpotifySlot(spotify, options = {}) {
    const label = firstNonEmpty(options.label, "Spotify preview");
    const unavailableTitle = firstNonEmpty(options.unavailableTitle, "Unavailable");
    const unavailableMeta = firstNonEmpty(options.unavailableMeta, "Spotify player unavailable for this track.");
    if (!canRenderSpotifyEmbedSlot(spotify)) {
      return `
        <div class="lastfm-track-panel-spotify-slot is-disabled" data-spotify-track-embed-slot>
          <div class="lastfm-track-panel-spotify-slot-head">
            <span class="lastfm-track-panel-spotify-slot-label">${escapeHtml(label)}</span>
          </div>
          <div class="lastfm-track-panel-spotify-slot-body">
            ${renderLastFmTrackPanelSpotifyDisabled(unavailableTitle, unavailableMeta)}
          </div>
        </div>
      `;
    }
    return `
      <div class="lastfm-track-panel-spotify-slot" data-spotify-track-embed-slot>
        <div class="lastfm-track-panel-spotify-slot-head">
          <span class="lastfm-track-panel-spotify-slot-label">${escapeHtml(label)}</span>
        </div>
        <div class="lastfm-track-panel-spotify-slot-body">
          <div class="lastfm-track-panel-spotify-embed-host" data-spotify-track-embed-target></div>
        </div>
      </div>
    `;
  }
  function renderLastFmPanelArtFlip(options = {}) {
    const artworkUrl = sanitizeUrl(options.artworkUrl);
    const fallbackGlyph = firstNonEmpty(options.fallbackGlyph, "♫");
    const toggleLabel = firstNonEmpty(options.toggleLabel, "Show panel actions");
    const backLabel = firstNonEmpty(options.backLabel, "Panel actions");
    const actions = Array.isArray(options.actions) ? options.actions.filter(Boolean) : [];
    return `
      <div class="lastfm-track-panel-art lastfm-track-panel-art--flip" data-panel-face="front">
        <div class="lastfm-track-panel-art-flipper">
          <div class="lastfm-track-panel-art-face lastfm-track-panel-art-face--front">
            <button
              class="lastfm-track-panel-art-toggle"
              type="button"
              data-lastfm-panel-art-toggle
              aria-label="${escapeHtml(toggleLabel)}"
              aria-pressed="false"
            >
              ${artworkUrl ? `<img class="lastfm-track-panel-art-image" src="${escapeHtml(artworkUrl)}" alt="" loading="eager" decoding="async" />` : `<span class="lastfm-track-panel-art-fallback" aria-hidden="true">${escapeHtml(fallbackGlyph)}</span>`}
            </button>
          </div>
          <div class="lastfm-track-panel-art-face lastfm-track-panel-art-face--back">
            <div class="lastfm-track-panel-art-back" data-lastfm-panel-art-back aria-hidden="true" aria-label="${escapeHtml(backLabel)}">
              <div class="lastfm-track-panel-art-action-stack">
                ${actions.join("")}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  function renderLastFmPanelViewModel(viewModel) {
    const safeViewModel = viewModel && typeof viewModel === "object" ? viewModel : {};
    const panelType = firstNonEmpty(safeViewModel.panelType, "track");
    const panelLayoutKey = firstNonEmpty(safeViewModel.panelLayoutKey, "default");
    const layoutClassName = firstNonEmpty(safeViewModel.layoutClassName, "lastfm-track-panel-layout");
    const stackClassName = firstNonEmpty(safeViewModel.stackClassName, "lastfm-track-panel-stack");
    const ambientAttrs = renderLastFmPanelAmbientAttributes(safeViewModel.ambientImageUrl);
    const titleText = firstNonEmpty(safeViewModel.title, "Last.fm details");
    if (safeViewModel.state === "error") {
      return `
      <div class="lastfm-track-panel-window lastfm-track-panel-window--error" role="dialog" aria-modal="true" aria-labelledby="lastfm-track-panel-title" data-panel-type="${escapeHtml(panelType)}" data-panel-layout="${escapeHtml(panelLayoutKey)}">
        <button class="lastfm-track-panel-close" type="button" aria-label="Close this dialog" data-track-panel-close>&times;</button>
        <div class="lastfm-track-panel-error">
          <p class="lastfm-track-panel-kicker">${escapeHtml(firstNonEmpty(safeViewModel.kicker, "Details unavailable"))}</p>
          <h3 class="lastfm-track-panel-title" id="lastfm-track-panel-title">${escapeHtml(titleText)}</h3>
          <p class="lastfm-track-panel-empty">${escapeHtml(firstNonEmpty(safeViewModel.errorMessage, "This panel could not be loaded right now. Try again in a moment."))}</p>
        </div>
      </div>
    `;
    }
    const metaMarkup = firstNonEmpty(safeViewModel.metaMarkup, "");
    const metaText = firstNonEmpty(safeViewModel.metaText, "");
    const badgesMarkup = firstNonEmpty(safeViewModel.badgesMarkup, "");
    const primaryMarkup = firstNonEmpty(safeViewModel.primaryMarkup, "");
    const statsMarkup = firstNonEmpty(safeViewModel.statsMarkup, "");
    const tagsMarkup = firstNonEmpty(safeViewModel.tagsMarkup, "");
    const actionsMarkup = firstNonEmpty(safeViewModel.actionsMarkup, "");
    const stackMarkup = firstNonEmpty(safeViewModel.stackMarkup, "");
    const loadingClassName = safeViewModel.state === "loading" ? " is-loading" : "";
    return `
      <div class="lastfm-track-panel-window${loadingClassName}" role="dialog" aria-modal="true" aria-labelledby="lastfm-track-panel-title" data-panel-type="${escapeHtml(panelType)}" data-panel-layout="${escapeHtml(panelLayoutKey)}"${ambientAttrs}>
        <button class="lastfm-track-panel-close" type="button" aria-label="Close this dialog" data-track-panel-close>&times;</button>
        <div class="lastfm-track-panel-body">
          <div class="${escapeHtml(layoutClassName)}">
            <div class="lastfm-track-panel-primary">
              ${primaryMarkup}
            </div>
            <div class="lastfm-track-panel-secondary">
              <header class="lastfm-track-panel-header">
                <p class="lastfm-track-panel-kicker">${escapeHtml(firstNonEmpty(safeViewModel.kicker, "Last.fm details"))}</p>
                <h3 class="lastfm-track-panel-title" id="lastfm-track-panel-title">${escapeHtml(titleText)}</h3>
                ${metaMarkup ? `<p class="lastfm-track-panel-meta">${metaMarkup}</p>` : metaText ? `<p class="lastfm-track-panel-meta">${escapeHtml(metaText)}</p>` : ""}
                ${badgesMarkup}
              </header>
              ${statsMarkup}
              ${tagsMarkup}
              ${actionsMarkup}
            </div>
          </div>
          <div class="${escapeHtml(stackClassName)}">
            ${stackMarkup}
          </div>
        </div>
      </div>
    `;
  }
  function renderLastFmTrackPanelSkeleton(query = {}) {
    return renderLastFmPanelViewModel({
      state: "loading",
      panelType: "track",
      panelLayoutKey: "top-heavy",
      layoutClassName: "lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy",
      stackClassName: "lastfm-track-panel-stack lastfm-track-panel-stack--split",
      kicker: "loading track details",
      title: firstNonEmpty(query.track, "Track details"),
      metaText: firstNonEmpty(query.artist, "Last.fm"),
      primaryMarkup: '<div class="lastfm-track-panel-art lastfm-track-panel-skeleton" aria-hidden="true"></div>',
      statsMarkup: `
        <div class="lastfm-track-panel-stats lastfm-track-panel-stats--with-spotify" aria-hidden="true">
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
          <div class="lastfm-track-panel-spotify-slot lastfm-track-panel-skeleton"></div>
        </div>
      `,
      stackMarkup: `
        <div class="lastfm-track-panel-history lastfm-track-panel-skeleton" aria-hidden="true"></div>
        <div class="lastfm-track-panel-related lastfm-track-panel-skeleton" aria-hidden="true"></div>
      `
    });
  }
  function renderLastFmTrackPanelError(query = {}) {
    return renderLastFmPanelViewModel({
      state: "error",
      panelType: "track",
      panelLayoutKey: "top-heavy",
      kicker: "Track details unavailable",
      title: firstNonEmpty(query.track, "Track details"),
      errorMessage: "This track could not be loaded right now. Try again in a moment."
    });
  }
  function renderLastFmTrackPanelContent(detail) {
    const track = detail?.track || {};
    const spotify = detail?.spotify || {};
    const scrobbles = detail?.scrobbles || {};
    const artistTopTracks = detail?.artistTopTracks || {};
    const artworkUrl = sanitizeUrl(track.artworkUrl || spotify.artworkUrl);
    const spotifyButtonLabel = spotify.matchStatus === "matched" ? "Open in Spotify" : "Open Spotify Search";
    const spotifyButtonUrl = sanitizeUrl(spotify.matchStatus === "matched" ? spotify.openUrl : spotify.searchUrl);
    const spotifyButtonAppUrl = spotify.matchStatus === "matched" ? resolveSpotifyTrackAppUrl(spotify) : "";
    const scrobbleItems = Array.isArray(scrobbles.items) ? scrobbles.items.slice(0, 3) : [];
    const relatedItems = Array.isArray(artistTopTracks.items)
      ? [...artistTopTracks.items].sort((left, right) => {
        const userPlayDelta = Number(right?.userPlaycount || 0) - Number(left?.userPlaycount || 0);
        if (userPlayDelta !== 0) return userPlayDelta;
        const globalPlayDelta = Number(right?.globalPlaycount || 0) - Number(left?.globalPlaycount || 0);
        if (globalPlayDelta !== 0) return globalPlayDelta;
        return String(left?.title || "").localeCompare(String(right?.title || ""));
      }).slice(0, 3)
      : [];
    const tagsMarkup = Array.isArray(track.topTags) && track.topTags.length ? `
      <div class="lastfm-track-panel-tags" aria-label="Track tags">
        ${track.topTags.map((tag) => `<span class="lastfm-track-tag">${escapeHtml(tag.name)}</span>`).join("")}
      </div>
    ` : "";
    const spotifySlotMarkup = renderLastFmTrackPanelSpotifySlot(spotify, {
      unavailableMeta: "Spotify player unavailable for this track."
    });
    const artMarkup = renderLastFmPanelArtFlip({
      artworkUrl,
      fallbackGlyph: "♫",
      toggleLabel: "Show track actions",
      backLabel: "Track actions",
      actions: [
        track.lastfmUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(track.lastfmUrl)}">Open Track on Last.fm</button>` : "",
        track.artistLastFmUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--ghost lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(track.artistLastFmUrl)}">Open Artist on Last.fm</button>` : "",
        spotifyButtonUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--ghost lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(spotifyButtonUrl)}"${spotifyButtonAppUrl ? ` data-open-app-url="${escapeHtml(spotifyButtonAppUrl)}"` : ""}>${escapeHtml(spotifyButtonLabel)}</button>` : ""
      ]
    });
    const summaryMarkup = renderLastFmSummarySection("About this track", track.summary, track.lastfmUrl, track.summaryHasMore);
    const historyMarkup = `
      <section class="lastfm-track-panel-history">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">My recent plays</h4>
          <span class="lastfm-track-panel-section-meta">${escapeHtml(formatCountNumber(scrobbles.total || track.userPlaycount, "0"))} total</span>
        </div>
        ${scrobbleItems.length ? `
          <ul class="lastfm-track-panel-history-list">
            ${scrobbleItems.map((entry) => `
              <li class="lastfm-track-panel-history-item">
                <span class="lastfm-track-panel-history-time">${escapeHtml(entry.playedAtLabel || entry.playedAtIso)}</span>
                <span class="lastfm-track-panel-history-album">${escapeHtml(firstNonEmpty(entry.album, "Album unknown"))}</span>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">Recent scrobble history is unavailable right now.</p>`}
      </section>
    `;
    const relatedMarkup = `
      <section class="lastfm-track-panel-related">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">From ${escapeHtml(firstNonEmpty(artistTopTracks.artist, track.artist, "this artist"))}</h4>
        </div>
        ${relatedItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${relatedItems.map((entry) => `
              <li class="lastfm-track-panel-related-item">
                <button
                  class="lastfm-track-panel-related-button"
                  type="button"
                  data-lastfm-track-title="${escapeHtml(entry.title)}"
                  data-lastfm-track-artist="${escapeHtml(firstNonEmpty(artistTopTracks.artist, track.artist))}"
                  ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                >
                  <span class="lastfm-track-panel-related-copy">
                    <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                    <span class="lastfm-track-panel-related-meta">
                      ${escapeHtml(formatCountNumber(entry.userPlaycount, "0"))} plays
                      <span class="lastfm-track-panel-related-separator">&bull;</span>
                      ${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global
                    </span>
                  </span>
                  <span class="lastfm-track-panel-related-status">
                    ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1 3.58 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                  </span>
                </button>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No artist top tracks available right now.</p>`}
      </section>
    `;
    return renderLastFmPanelViewModel({
      state: "content",
      panelType: "track",
      panelLayoutKey: "top-heavy",
      ambientImageUrl: artworkUrl,
      layoutClassName: "lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy",
      stackClassName: "lastfm-track-panel-stack lastfm-track-panel-stack--split",
      kicker: "Track details",
      title: track.title || "Unknown track",
      metaMarkup: `
        <span>${escapeHtml(track.artist || "Unknown artist")}</span>
        ${track.album ? `<span class="lastfm-track-panel-meta-separator">&bull;</span><span>${escapeHtml(track.album)}</span>` : ""}
        ${track.durationLabel ? `<span class="lastfm-track-panel-meta-separator">&bull;</span><span>${escapeHtml(track.durationLabel)}</span>` : ""}
      `,
      badgesMarkup: track.userLoved ? '<div class="lastfm-track-panel-badges"><span class="lastfm-track-panel-badge lastfm-track-panel-badge--loved" aria-label="Loved track" title="Loved track"><span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1 3.58 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span></span></div>' : "",
      primaryMarkup: artMarkup,
      statsMarkup: `
        <div class="lastfm-track-panel-stats lastfm-track-panel-stats--with-spotify">
          ${renderLastFmTrackPanelStat("Scrobbles", formatCountNumber(scrobbles.total || track.userPlaycount))}
          ${spotifySlotMarkup}
        </div>
      `,
      tagsMarkup,
      stackMarkup: `${summaryMarkup}${historyMarkup}${relatedMarkup}`
    });
  }
  function renderLastFmDetailTagMarkup(tags, label = "Detail tags") {
    return Array.isArray(tags) && tags.length ? `
      <div class="lastfm-track-panel-tags" aria-label="${escapeHtml(label)}">
        ${tags.map((tag) => `<span class="lastfm-track-tag">${escapeHtml(tag.name)}</span>`).join("")}
      </div>
    ` : "";
  }
  function renderLastFmArtistLinkButton(artistName, artistUrl, options = {}) {
    const safeArtistName = firstNonEmpty(artistName, "");
    if (!safeArtistName) return "";
    const className = firstNonEmpty(options.className, "lastfm-track-panel-inline-link");
    const openUrlAttr = sanitizeUrl(artistUrl) ? ` data-open-url="${escapeHtml(artistUrl)}"` : "";
    return `<button class="${escapeHtml(className)}" type="button" data-lastfm-artist-name="${escapeHtml(safeArtistName)}"${openUrlAttr}>${escapeHtml(safeArtistName)}</button>`;
  }
  function renderLastFmArtistPanelSkeleton(query = {}) {
    return renderLastFmPanelViewModel({
      state: "loading",
      panelType: "artist",
      panelLayoutKey: "compact-primary",
      layoutClassName: "lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy lastfm-track-panel-layout--compact-primary",
      stackClassName: "lastfm-track-panel-stack",
      kicker: "loading artist details",
      title: firstNonEmpty(query.artist, "Artist details"),
      metaText: "Last.fm artist profile",
      primaryMarkup: '<div class="lastfm-track-panel-art lastfm-track-panel-skeleton" aria-hidden="true"></div>',
      statsMarkup: `
        <div class="lastfm-track-panel-stats" aria-hidden="true">
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
        </div>
      `,
      stackMarkup: '<div class="lastfm-track-panel-related lastfm-track-panel-skeleton" aria-hidden="true"></div>'
    });
  }
  function renderLastFmArtistPanelError(query = {}) {
    return renderLastFmPanelViewModel({
      state: "error",
      panelType: "artist",
      panelLayoutKey: "compact-primary",
      kicker: "Artist details unavailable",
      title: firstNonEmpty(query.artist, "Artist details"),
      errorMessage: "This artist could not be loaded right now. Try again in a moment."
    });
  }
  function renderLastFmArtistPanelContent(detail) {
    const artist = detail?.artist || {};
    const topTracks = detail?.topTracks || {};
    const topAlbums = detail?.topAlbums || {};
    const topTrackItems = Array.isArray(topTracks.items) ? topTracks.items.slice(0, 4) : [];
    const topAlbumItems = Array.isArray(topAlbums.items) ? topAlbums.items.slice(0, 4) : [];
    const artworkUrl = sanitizeUrl(artist.artworkUrl);
    const ambientPanelAttrs = renderLastFmPanelAmbientAttributes(artworkUrl);
    const tagsMarkup = renderLastFmDetailTagMarkup(artist.topTags, "Artist genres");
    const summaryMarkup = renderLastFmSummarySection("About this artist", artist.summary, artist.lastfmUrl, artist.summaryHasMore);
    const topTracksMarkup = `
      <section class="lastfm-track-panel-related">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Popular tracks</h4>
        </div>
        ${topTrackItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${topTrackItems.map((entry) => `
              <li class="lastfm-track-panel-related-item">
                <button
                  class="lastfm-track-panel-related-button"
                  type="button"
                  data-lastfm-track-title="${escapeHtml(entry.title)}"
                  data-lastfm-track-artist="${escapeHtml(firstNonEmpty(entry.artist, artist.name))}"
                  ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                >
                  <span class="lastfm-track-panel-related-copy">
                    <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                    <span class="lastfm-track-panel-related-meta">
                      ${escapeHtml(formatCountNumber(entry.userPlaycount, "0"))} scrobbles
                      <span class="lastfm-track-panel-related-separator">•</span>
                      ${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global
                    </span>
                  </span>
                  <span class="lastfm-track-panel-related-status">
                    ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1 3.58 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                  </span>
                </button>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No popular tracks available right now.</p>`}
      </section>
    `;
    const albumCatalogMarkup = `
      <section class="lastfm-track-panel-related lastfm-track-panel-related--albums">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Albums</h4>
        </div>
        ${topAlbumItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${topAlbumItems.map((entry) => {
              const genreLabel = Array.isArray(entry.topTags) && entry.topTags.length ? entry.topTags.map((tag) => tag.name).join(" • ") : "Genre unknown";
              const releaseLabel = firstNonEmpty(entry.releaseYear, entry.releasedAt, "Year unknown");
              return `
                <li class="lastfm-track-panel-related-item">
                  <button
                    class="lastfm-track-panel-related-button lastfm-track-panel-related-button--album"
                    type="button"
                    data-lastfm-album-title="${escapeHtml(entry.title)}"
                    data-lastfm-album-artist="${escapeHtml(firstNonEmpty(entry.artist, artist.name))}"
                    ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                  >
                    <span class="lastfm-track-panel-related-copy">
                      <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                      <span class="lastfm-track-panel-related-meta">
                        ${escapeHtml(releaseLabel)}
                        <span class="lastfm-track-panel-related-separator">•</span>
                        ${escapeHtml(genreLabel)}
                      </span>
                    </span>
                    <span class="lastfm-track-panel-related-status">
                      ${escapeHtml(`${formatCountNumber(entry.playcount, "--")} plays`)}
                    </span>
                  </button>
                </li>
              `;
            }).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No albums available right now.</p>`}
      </section>
    `;
    return `
      <div class="lastfm-track-panel-window" role="dialog" aria-modal="true" aria-labelledby="lastfm-track-panel-title"${ambientPanelAttrs}>
        <button class="lastfm-track-panel-close" type="button" aria-label="Close this dialog" data-track-panel-close>&times;</button>
        <div class="lastfm-track-panel-body">
          <div class="lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy lastfm-track-panel-layout--compact-primary">
            <div class="lastfm-track-panel-primary">
              <div class="lastfm-track-panel-art">
                ${artworkUrl ? `<img class="lastfm-track-panel-art-image" src="${escapeHtml(artworkUrl)}" alt="" loading="eager" decoding="async" />` : '<span class="lastfm-track-panel-art-fallback" aria-hidden="true">★</span>'}
              </div>
            </div>
            <div class="lastfm-track-panel-secondary">
              <header class="lastfm-track-panel-header">
                <p class="lastfm-track-panel-kicker">Artist details</p>
                <h3 class="lastfm-track-panel-title" id="lastfm-track-panel-title">${escapeHtml(artist.name || "Unknown artist")}</h3>
                <p class="lastfm-track-panel-meta">Last.fm artist profile</p>
              </header>
              <div class="lastfm-track-panel-stats">
                ${renderLastFmTrackPanelStat("Global plays", formatCountNumber(artist.playcount))}
                ${renderLastFmTrackPanelStat("Listeners", formatCountNumber(artist.listeners))}
                ${renderLastFmTrackPanelStat("Popular tracks", formatCountNumber(artist.topTrackCount || topTrackItems.length, "0"))}
              </div>
              ${tagsMarkup}
              <div class="lastfm-track-panel-actions">
                ${artist.lastfmUrl ? `<button class="lastfm-track-panel-cta" type="button" data-open-url="${escapeHtml(artist.lastfmUrl)}">Open Artist on Last.fm</button>` : ""}
              </div>
            </div>
          </div>
          <div class="lastfm-track-panel-stack">
            ${summaryMarkup}
            ${albumCatalogMarkup}
            ${topTracksMarkup}
          </div>
        </div>
      </div>
    `;
  }
  function renderLastFmAlbumPanelSkeleton(query = {}) {
    return `
      <div class="lastfm-track-panel-window is-loading" role="dialog" aria-modal="true" aria-labelledby="lastfm-track-panel-title">
        <button class="lastfm-track-panel-close" type="button" aria-label="Close this dialog" data-track-panel-close>&times;</button>
        <div class="lastfm-track-panel-layout lastfm-track-panel-layout--compact-primary">
          <div class="lastfm-track-panel-primary">
            <div class="lastfm-track-panel-art lastfm-track-panel-skeleton" aria-hidden="true"></div>
          </div>
          <div class="lastfm-track-panel-secondary">
            <header class="lastfm-track-panel-header">
              <p class="lastfm-track-panel-kicker">loading album details</p>
              <h3 class="lastfm-track-panel-title" id="lastfm-track-panel-title">${escapeHtml(firstNonEmpty(query.album, "Album details"))}</h3>
              <p class="lastfm-track-panel-meta">${escapeHtml(firstNonEmpty(query.artist, "Last.fm"))}</p>
            </header>
            <div class="lastfm-track-panel-stats" aria-hidden="true">
              <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
              <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
              <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
            </div>
            <div class="lastfm-track-panel-history lastfm-track-panel-skeleton" aria-hidden="true"></div>
          </div>
        </div>
      </div>
    `;
  }
  function renderLastFmAlbumPanelError(query = {}) {
    return `
      <div class="lastfm-track-panel-window lastfm-track-panel-window--error" role="dialog" aria-modal="true" aria-labelledby="lastfm-track-panel-title">
        <button class="lastfm-track-panel-close" type="button" aria-label="Close this dialog" data-track-panel-close>&times;</button>
        <div class="lastfm-track-panel-error">
          <p class="lastfm-track-panel-kicker">Album details unavailable</p>
          <h3 class="lastfm-track-panel-title" id="lastfm-track-panel-title">${escapeHtml(firstNonEmpty(query.album, "Album details"))}</h3>
          <p class="lastfm-track-panel-empty">This album could not be loaded right now. Try again in a moment.</p>
        </div>
      </div>
    `;
  }
  function renderLastFmAlbumPanelContent(detail) {
    const album = detail?.album || {};
    const spotify = detail?.spotify || {};
    const trackSection = detail?.tracks || {};
    const relatedTracks = detail?.relatedTracks || {};
    const trackItems = Array.isArray(trackSection.items) ? trackSection.items : [];
    const relatedItems = Array.isArray(relatedTracks.items) ? relatedTracks.items.slice(0, 3) : [];
    const artworkUrl = sanitizeUrl(album.artworkUrl || spotify.artworkUrl);
    const ambientPanelAttrs = renderLastFmPanelAmbientAttributes(artworkUrl);
    const albumArtistInline = renderLastFmArtistLinkButton(album.artist, album.artistLastFmUrl);
    const spotifySlotMarkup = renderLastFmTrackPanelSpotifySlot(spotify, {
      unavailableMeta: "Spotify player unavailable for this album."
    });
    const spotifyButtonLabel = spotify.matchStatus === "matched" ? "Open in Spotify" : "Open Spotify Search";
    const spotifyButtonUrl = sanitizeUrl(spotify.matchStatus === "matched" ? spotify.openUrl : spotify.searchUrl);
    const spotifyButtonAppUrl = spotify.matchStatus === "matched" ? resolveSpotifyTrackAppUrl(spotify) : "";
    const artMarkup = renderLastFmPanelArtFlip({
      artworkUrl,
      fallbackGlyph: "♫",
      toggleLabel: "Show album actions",
      backLabel: "Album actions",
      actions: [
        album.lastfmUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(album.lastfmUrl)}">Open Album on Last.fm</button>` : "",
        album.artistLastFmUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--ghost lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(album.artistLastFmUrl)}">Open Artist on Last.fm</button>` : "",
        spotifyButtonUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--ghost lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(spotifyButtonUrl)}"${spotifyButtonAppUrl ? ` data-open-app-url="${escapeHtml(spotifyButtonAppUrl)}"` : ""}>${escapeHtml(spotifyButtonLabel)}</button>` : ""
      ]
    });
    const tagsMarkup = renderLastFmDetailTagMarkup(album.topTags, "Album genres");
    const summaryMarkup = renderLastFmSummarySection("About this album", album.summary, album.lastfmUrl, album.summaryHasMore);
    const trackListMarkup = `
      <section class="lastfm-track-panel-history lastfm-track-panel-history--album">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Track list</h4>
          <span class="lastfm-track-panel-section-meta">${escapeHtml(formatCountNumber(trackItems.length, "0"))} songs</span>
        </div>
        ${trackItems.length ? `
          <ol class="lastfm-track-panel-tracklist">
            ${trackItems.map((entry) => `
              <li class="lastfm-track-panel-track-item">
                <span class="lastfm-track-panel-track-rank">${escapeHtml(String(entry.rank).padStart(2, "0"))}</span>
                <div class="lastfm-track-panel-track-main">
                  <button
                    class="lastfm-track-panel-track-title-button"
                    type="button"
                    data-lastfm-track-title="${escapeHtml(entry.title)}"
                    data-lastfm-track-artist="${escapeHtml(firstNonEmpty(entry.artist, album.artist))}"
                    data-lastfm-track-album="${escapeHtml(album.title || detail?.query?.album || "")}"
                    ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                  >
                    ${escapeHtml(entry.title)}
                  </button>
                  <div class="lastfm-track-panel-track-meta">
                    ${renderLastFmArtistLinkButton(entry.artist, entry.artistLastFmUrl)}
                    ${entry.durationLabel ? `<span class="lastfm-track-panel-meta-separator">•</span><span>${escapeHtml(entry.durationLabel)}</span>` : ""}
                    <span class="lastfm-track-panel-meta-separator">•</span>
                    <span>${escapeHtml(formatCountNumber(entry.userPlaycount, "0"))} scrobbles</span>
                    <span class="lastfm-track-panel-meta-separator">•</span>
                    <span>${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global</span>
                  </div>
                </div>
                <span class="lastfm-track-panel-track-status">
                  ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1 3.58 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                </span>
              </li>
            `).join("")}
          </ol>
        ` : `<p class="lastfm-track-panel-empty">No track list is available right now.</p>`}
      </section>
    `;
    const relatedMarkup = `
      <section class="lastfm-track-panel-related">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Similar tracks</h4>
        </div>
        ${relatedItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${relatedItems.map((entry) => `
              <li class="lastfm-track-panel-related-item">
                <button
                  class="lastfm-track-panel-related-button"
                  type="button"
                  data-lastfm-track-title="${escapeHtml(entry.title)}"
                  data-lastfm-track-artist="${escapeHtml(firstNonEmpty(entry.artist, relatedTracks.artist, album.artist))}"
                  ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                >
                  <span class="lastfm-track-panel-related-copy">
                    <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                    <span class="lastfm-track-panel-related-meta">
                      ${escapeHtml(firstNonEmpty(entry.artist, relatedTracks.artist, album.artist, "Unknown artist"))}
                      <span class="lastfm-track-panel-related-separator">•</span>
                      ${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global
                    </span>
                  </span>
                  <span class="lastfm-track-panel-related-status">
                    ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1 3.58 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                  </span>
                </button>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No similar tracks are available right now.</p>`}
      </section>
    `;
    return `
      <div class="lastfm-track-panel-window" role="dialog" aria-modal="true" aria-labelledby="lastfm-track-panel-title"${ambientPanelAttrs}>
        <button class="lastfm-track-panel-close" type="button" aria-label="Close this dialog" data-track-panel-close>&times;</button>
        <div class="lastfm-track-panel-body">
          <div class="lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy lastfm-track-panel-layout--compact-primary">
            <div class="lastfm-track-panel-primary">
              ${artMarkup}
            </div>
            <div class="lastfm-track-panel-secondary">
              <header class="lastfm-track-panel-header">
                <p class="lastfm-track-panel-kicker">Album details</p>
                <h3 class="lastfm-track-panel-title" id="lastfm-track-panel-title">${escapeHtml(album.title || "Unknown album")}</h3>
                <p class="lastfm-track-panel-meta">
                  ${albumArtistInline || `<span>${escapeHtml(album.artist || "Unknown artist")}</span>`}
                  ${album.releasedAt ? `<span class="lastfm-track-panel-meta-separator">•</span><span>${escapeHtml(album.releasedAt)}</span>` : ""}
                  ${album.runtimeLabel ? `<span class="lastfm-track-panel-meta-separator">•</span><span>${escapeHtml(album.runtimeLabel)}</span>` : ""}
                </p>
              </header>
              <div class="lastfm-track-panel-stats lastfm-track-panel-stats--with-spotify">
                ${renderLastFmTrackPanelStat("Tracks", formatCountNumber(album.trackCount || trackItems.length, "0"))}
                ${spotifySlotMarkup}
              </div>
              ${tagsMarkup}
            </div>
          </div>
          <div class="lastfm-track-panel-stack">
            ${summaryMarkup}
            ${trackListMarkup}
            ${relatedMarkup}
          </div>
        </div>
      </div>
    `;
  }
  function renderLastFmArtistPanelContentShared(detail) {
    const artist = detail?.artist || {};
    const topTracks = detail?.topTracks || {};
    const topAlbums = detail?.topAlbums || {};
    const topTrackItems = Array.isArray(topTracks.items) ? topTracks.items.slice(0, 4) : [];
    const topAlbumItems = Array.isArray(topAlbums.items) ? topAlbums.items.slice(0, 4) : [];
    const artworkUrl = sanitizeUrl(artist.artworkUrl);
    const tagsMarkup = renderLastFmDetailTagMarkup(artist.topTags, "Artist genres");
    const summaryMarkup = renderLastFmSummarySection("About this artist", artist.summary, artist.lastfmUrl, artist.summaryHasMore);
    const topTracksMarkup = `
      <section class="lastfm-track-panel-related">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Popular tracks</h4>
        </div>
        ${topTrackItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${topTrackItems.map((entry) => `
              <li class="lastfm-track-panel-related-item">
                <button
                  class="lastfm-track-panel-related-button"
                  type="button"
                  data-lastfm-track-title="${escapeHtml(entry.title)}"
                  data-lastfm-track-artist="${escapeHtml(firstNonEmpty(entry.artist, artist.name))}"
                  ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                >
                  <span class="lastfm-track-panel-related-copy">
                    <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                    <span class="lastfm-track-panel-related-meta">
                      ${escapeHtml(formatCountNumber(entry.userPlaycount, "0"))} scrobbles
                      <span class="lastfm-track-panel-related-separator">&bull;</span>
                      ${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global
                    </span>
                  </span>
                  <span class="lastfm-track-panel-related-status">
                    ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1.58 2.51 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                  </span>
                </button>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No popular tracks available right now.</p>`}
      </section>
    `;
    const albumCatalogMarkup = `
      <section class="lastfm-track-panel-related lastfm-track-panel-related--albums">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Albums</h4>
        </div>
        ${topAlbumItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${topAlbumItems.map((entry) => {
              const genreLabel = Array.isArray(entry.topTags) && entry.topTags.length ? entry.topTags.map((tag) => tag.name).join(" / ") : "Genre unknown";
              const releaseLabel = firstNonEmpty(entry.releaseYear, entry.releasedAt, "Year unknown");
              return `
                <li class="lastfm-track-panel-related-item">
                  <button
                    class="lastfm-track-panel-related-button lastfm-track-panel-related-button--album"
                    type="button"
                    data-lastfm-album-title="${escapeHtml(entry.title)}"
                    data-lastfm-album-artist="${escapeHtml(firstNonEmpty(entry.artist, artist.name))}"
                    ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                  >
                    <span class="lastfm-track-panel-related-copy">
                      <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                      <span class="lastfm-track-panel-related-meta">
                        ${escapeHtml(releaseLabel)}
                        <span class="lastfm-track-panel-related-separator">&bull;</span>
                        ${escapeHtml(genreLabel)}
                      </span>
                    </span>
                    <span class="lastfm-track-panel-related-status">
                      ${escapeHtml(`${formatCountNumber(entry.playcount, "--")} plays`)}
                    </span>
                  </button>
                </li>
              `;
            }).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No albums available right now.</p>`}
      </section>
    `;
    return renderLastFmPanelViewModel({
      state: "content",
      panelType: "artist",
      panelLayoutKey: "compact-primary",
      ambientImageUrl: artworkUrl,
      layoutClassName: "lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy lastfm-track-panel-layout--compact-primary",
      stackClassName: "lastfm-track-panel-stack",
      kicker: "Artist details",
      title: artist.name || "Unknown artist",
      metaText: "Last.fm artist profile",
      primaryMarkup: `
        <div class="lastfm-track-panel-art">
          ${artworkUrl ? `<img class="lastfm-track-panel-art-image" src="${escapeHtml(artworkUrl)}" alt="" loading="eager" decoding="async" />` : '<span class="lastfm-track-panel-art-fallback" aria-hidden="true">&#9733;</span>'}
        </div>
      `,
      statsMarkup: `
        <div class="lastfm-track-panel-stats">
          ${renderLastFmTrackPanelStat("Global plays", formatCountNumber(artist.playcount))}
          ${renderLastFmTrackPanelStat("Listeners", formatCountNumber(artist.listeners))}
          ${renderLastFmTrackPanelStat("Popular tracks", formatCountNumber(artist.topTrackCount || topTrackItems.length, "0"))}
        </div>
      `,
      tagsMarkup,
      actionsMarkup: artist.lastfmUrl ? `<div class="lastfm-track-panel-actions"><button class="lastfm-track-panel-cta" type="button" data-open-url="${escapeHtml(artist.lastfmUrl)}">Open Artist on Last.fm</button></div>` : "",
      stackMarkup: `${summaryMarkup}${albumCatalogMarkup}${topTracksMarkup}`
    });
  }
  function renderLastFmAlbumPanelSkeletonShared(query = {}) {
    return renderLastFmPanelViewModel({
      state: "loading",
      panelType: "album",
      panelLayoutKey: "compact-primary",
      layoutClassName: "lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy lastfm-track-panel-layout--compact-primary",
      stackClassName: "lastfm-track-panel-stack",
      kicker: "loading album details",
      title: firstNonEmpty(query.album, "Album details"),
      metaText: firstNonEmpty(query.artist, "Last.fm"),
      primaryMarkup: '<div class="lastfm-track-panel-art lastfm-track-panel-skeleton" aria-hidden="true"></div>',
      statsMarkup: `
        <div class="lastfm-track-panel-stats" aria-hidden="true">
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
          <div class="lastfm-track-panel-stat lastfm-track-panel-skeleton"></div>
        </div>
      `,
      stackMarkup: '<div class="lastfm-track-panel-history lastfm-track-panel-skeleton" aria-hidden="true"></div>'
    });
  }
  function renderLastFmAlbumPanelErrorShared(query = {}) {
    return renderLastFmPanelViewModel({
      state: "error",
      panelType: "album",
      panelLayoutKey: "compact-primary",
      kicker: "Album details unavailable",
      title: firstNonEmpty(query.album, "Album details"),
      errorMessage: "This album could not be loaded right now. Try again in a moment."
    });
  }
  function renderLastFmAlbumPanelContentShared(detail) {
    const album = detail?.album || {};
    const spotify = detail?.spotify || {};
    const trackSection = detail?.tracks || {};
    const relatedTracks = detail?.relatedTracks || {};
    const trackItems = Array.isArray(trackSection.items) ? trackSection.items : [];
    const relatedItems = Array.isArray(relatedTracks.items) ? relatedTracks.items.slice(0, 3) : [];
    const artworkUrl = sanitizeUrl(album.artworkUrl || spotify.artworkUrl);
    const albumArtistInline = renderLastFmArtistLinkButton(album.artist, album.artistLastFmUrl);
    const spotifySlotMarkup = renderLastFmTrackPanelSpotifySlot(spotify, {
      unavailableMeta: "Spotify player unavailable for this album."
    });
    const spotifyButtonLabel = spotify.matchStatus === "matched" ? "Open in Spotify" : "Open Spotify Search";
    const spotifyButtonUrl = sanitizeUrl(spotify.matchStatus === "matched" ? spotify.openUrl : spotify.searchUrl);
    const spotifyButtonAppUrl = spotify.matchStatus === "matched" ? resolveSpotifyTrackAppUrl(spotify) : "";
    const artMarkup = renderLastFmPanelArtFlip({
      artworkUrl,
      fallbackGlyph: "♫",
      toggleLabel: "Show album actions",
      backLabel: "Album actions",
      actions: [
        album.lastfmUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(album.lastfmUrl)}">Open Album on Last.fm</button>` : "",
        album.artistLastFmUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--ghost lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(album.artistLastFmUrl)}">Open Artist on Last.fm</button>` : "",
        spotifyButtonUrl ? `<button class="lastfm-track-panel-cta lastfm-track-panel-cta--ghost lastfm-track-panel-cta--stacked" type="button" tabindex="-1" data-open-url="${escapeHtml(spotifyButtonUrl)}"${spotifyButtonAppUrl ? ` data-open-app-url="${escapeHtml(spotifyButtonAppUrl)}"` : ""}>${escapeHtml(spotifyButtonLabel)}</button>` : ""
      ]
    });
    const tagsMarkup = renderLastFmDetailTagMarkup(album.topTags, "Album genres");
    const summaryMarkup = renderLastFmSummarySection("About this album", album.summary, album.lastfmUrl, album.summaryHasMore);
    const trackListMarkup = `
      <section class="lastfm-track-panel-history lastfm-track-panel-history--album">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Track list</h4>
          <span class="lastfm-track-panel-section-meta">${escapeHtml(formatCountNumber(trackItems.length, "0"))} songs</span>
        </div>
        ${trackItems.length ? `
          <ol class="lastfm-track-panel-tracklist">
            ${trackItems.map((entry) => `
              <li class="lastfm-track-panel-track-item">
                <span class="lastfm-track-panel-track-rank">${escapeHtml(String(entry.rank).padStart(2, "0"))}</span>
                <div class="lastfm-track-panel-track-main">
                  <button
                    class="lastfm-track-panel-track-title-button"
                    type="button"
                    data-lastfm-track-title="${escapeHtml(entry.title)}"
                    data-lastfm-track-artist="${escapeHtml(firstNonEmpty(entry.artist, album.artist))}"
                    data-lastfm-track-album="${escapeHtml(album.title || detail?.query?.album || "")}"
                    ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                  >
                    ${escapeHtml(entry.title)}
                  </button>
                  <div class="lastfm-track-panel-track-meta">
                    ${renderLastFmArtistLinkButton(entry.artist, entry.artistLastFmUrl)}
                    ${entry.durationLabel ? `<span class="lastfm-track-panel-meta-separator">&bull;</span><span>${escapeHtml(entry.durationLabel)}</span>` : ""}
                    <span class="lastfm-track-panel-meta-separator">&bull;</span>
                    <span>${escapeHtml(formatCountNumber(entry.userPlaycount, "0"))} scrobbles</span>
                    <span class="lastfm-track-panel-meta-separator">&bull;</span>
                    <span>${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global</span>
                  </div>
                </div>
                <span class="lastfm-track-panel-track-status">
                  ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1.58 2.51 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                </span>
              </li>
            `).join("")}
          </ol>
        ` : `<p class="lastfm-track-panel-empty">No track list is available right now.</p>`}
      </section>
    `;
    const relatedMarkup = `
      <section class="lastfm-track-panel-related">
        <div class="lastfm-track-panel-section-head">
          <h4 class="lastfm-track-panel-section-title">Similar tracks</h4>
        </div>
        ${relatedItems.length ? `
          <ul class="lastfm-track-panel-related-list">
            ${relatedItems.map((entry) => `
              <li class="lastfm-track-panel-related-item">
                <button
                  class="lastfm-track-panel-related-button"
                  type="button"
                  data-lastfm-track-title="${escapeHtml(entry.title)}"
                  data-lastfm-track-artist="${escapeHtml(firstNonEmpty(entry.artist, relatedTracks.artist, album.artist))}"
                  ${entry.lastfmUrl ? `data-item-url="${escapeHtml(entry.lastfmUrl)}"` : ""}
                >
                  <span class="lastfm-track-panel-related-copy">
                    <span class="lastfm-track-panel-related-title">${escapeHtml(entry.title)}</span>
                    <span class="lastfm-track-panel-related-meta">
                      ${escapeHtml(firstNonEmpty(entry.artist, relatedTracks.artist, album.artist, "Unknown artist"))}
                      <span class="lastfm-track-panel-related-separator">&bull;</span>
                      ${escapeHtml(formatCountNumber(entry.globalPlaycount, "0"))} global
                    </span>
                  </span>
                  <span class="lastfm-track-panel-related-status">
                    ${entry.userLoved ? '<span class="lastfm-loved-indicator" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M8 14.2 6.84 13.15C3.12 9.8 1 7.88 1 5.5 1.58 2.51 2.51 2 4.4 2c1.07 0 2.09.5 2.75 1.3C7.81 2.5 8.83 2 9.9 2 11.79 2 13.3 3.58 13.3 5.5c0 2.38-2.12 4.3-5.84 7.66L8 14.2Z"/></svg></span>' : ""}
                  </span>
                </button>
              </li>
            `).join("")}
          </ul>
        ` : `<p class="lastfm-track-panel-empty">No similar tracks are available right now.</p>`}
      </section>
    `;
    return renderLastFmPanelViewModel({
      state: "content",
      panelType: "album",
      panelLayoutKey: "compact-primary",
      ambientImageUrl: artworkUrl,
      layoutClassName: "lastfm-track-panel-layout lastfm-track-panel-layout--top-heavy lastfm-track-panel-layout--compact-primary",
      stackClassName: "lastfm-track-panel-stack",
      kicker: "Album details",
      title: album.title || "Unknown album",
      metaMarkup: `
        ${albumArtistInline || `<span>${escapeHtml(album.artist || "Unknown artist")}</span>`}
        ${album.releasedAt ? `<span class="lastfm-track-panel-meta-separator">&bull;</span><span>${escapeHtml(album.releasedAt)}</span>` : ""}
        ${album.runtimeLabel ? `<span class="lastfm-track-panel-meta-separator">&bull;</span><span>${escapeHtml(album.runtimeLabel)}</span>` : ""}
      `,
      primaryMarkup: artMarkup,
      statsMarkup: `
        <div class="lastfm-track-panel-stats lastfm-track-panel-stats--with-spotify">
          ${renderLastFmTrackPanelStat("Tracks", formatCountNumber(album.trackCount || trackItems.length, "0"))}
          ${spotifySlotMarkup}
        </div>
      `,
      tagsMarkup,
      stackMarkup: `${summaryMarkup}${trackListMarkup}${relatedMarkup}`
    });
  }
  function renderSiteShowcase(site, payload) {
    const safePayload = ensurePayload(site, payload);
    if (site.id === "steam") return renderSteamShowcase(site, safePayload);
    if (site.id === "discord") return "";
    if (site.id === "lastfm") return renderLastFmShowcase(site, safePayload);
    return "";
  }
  function renderSidebarSiteIcon(siteId) {
    const safeSiteId = escapeHtml(siteId || "");
    const iconMarkupById = {
      twitter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.954 4.569c-.885.389-1.83.654-2.825.775 1.014-.611 1.794-1.574 2.163-2.723-.951.555-2.005.959-3.127 1.184-.897-.959-2.178-1.559-3.594-1.559-2.717 0-4.924 2.206-4.924 4.923 0 .39.045.765.127 1.124C7.691 8.095 4.066 6.13 1.64 3.161c-.427.722-.666 1.561-.666 2.475 0 1.71.87 3.213 2.188 4.096-.807-.026-1.566-.248-2.228-.616v.06c0 2.385 1.693 4.374 3.946 4.827-.413.111-.849.171-1.296.171-.314 0-.615-.03-.916-.086.631 1.953 2.445 3.377 4.6 3.419-1.68 1.319-3.809 2.105-6.102 2.105-.39 0-.779-.023-1.17-.067 2.189 1.394 4.768 2.209 7.548 2.209 9.142 0 14.307-7.721 13.995-14.646.962-.689 1.797-1.56 2.46-2.548l-.047-.02z" fill="currentColor"/></svg>',
      steam: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z" fill="currentColor"/></svg>',
      discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" fill="currentColor"/></svg>',
      lastfm: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.584 17.21l-.88-2.392s-1.43 1.594-3.573 1.594c-1.897 0-3.244-1.649-3.244-4.288 0-3.382 1.704-4.591 3.381-4.591 2.42 0 3.189 1.567 3.849 3.574l.88 2.749c.88 2.666 2.529 4.81 7.285 4.81 3.409 0 5.718-1.044 5.718-3.793 0-2.227-1.265-3.381-3.63-3.931l-1.758-.385c-1.21-.275-1.567-.77-1.567-1.595 0-.934.742-1.484 1.952-1.484 1.32 0 2.034.495 2.144 1.677l2.749-.33c-.22-2.474-1.924-3.492-4.729-3.492-2.474 0-4.893.935-4.893 3.932 0 1.87.907 3.051 3.189 3.601l1.87.44c1.402.33 1.869.907 1.869 1.704 0 1.017-.99 1.43-2.86 1.43-2.776 0-3.93-1.457-4.59-3.464l-.907-2.75c-1.155-3.573-2.997-4.893-6.653-4.893C2.144 5.333 0 7.89 0 12.233c0 4.18 2.144 6.434 5.993 6.434 3.106 0 4.591-1.457 4.591-1.457z" fill="currentColor"/></svg>',
      spotify: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.2 9.8c3.3-1 6.5-.8 9.6.7M8.1 12.6c2.6-.7 5-.5 7.4.6M9 15.2c1.7-.4 3.4-.3 5 .4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      soundcloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.999 14.165c-.052 1.796-1.612 3.169-3.4 3.169h-8.18a.68.68 0 0 1-.675-.683V7.862a.747.747 0 0 1 .452-.724s.75-.513 2.333-.513a5.364 5.364 0 0 1 2.763.755 5.433 5.433 0 0 1 2.57 3.54c.282-.08.574-.121.868-.12.884 0 1.73.358 2.347.992s.948 1.49.922 2.373ZM10.721 8.421c.247 2.98.427 5.697 0 8.672a.264.264 0 0 1-.53 0c-.395-2.946-.22-5.718 0-8.672a.264.264 0 0 1 .53 0ZM9.072 9.448c.285 2.659.37 4.986-.006 7.655a.277.277 0 0 1-.55 0c-.331-2.63-.256-5.02 0-7.655a.277.277 0 0 1 .556 0Zm-1.663-.257c.27 2.726.39 5.171 0 7.904a.266.266 0 0 1-.532 0c-.38-2.69-.257-5.21 0-7.904a.266.266 0 0 1 .532 0Zm-1.647.77a26.108 26.108 0 0 1-.008 7.147.272.272 0 0 1-.542 0 27.955 27.955 0 0 1 0-7.147.275.275 0 0 1 .55 0Zm-1.67 1.769c.421 1.865.228 3.5-.029 5.388a.257.257 0 0 1-.514 0c-.21-1.858-.398-3.549 0-5.389a.272.272 0 0 1 .543 0Zm-1.655-.273c.388 1.897.26 3.508-.01 5.412-.026.28-.514.283-.54 0-.244-1.878-.347-3.54-.01-5.412a.283.283 0 0 1 .56 0Zm-1.668.911c.4 1.268.257 2.292-.026 3.572a.257.257 0 0 1-.514 0c-.241-1.262-.354-2.312-.023-3.572a.283.283 0 0 1 .563 0Z" fill="currentColor"/></svg>'
    };
    return `<span class="steam-sidebar-site-icon steam-sidebar-site-icon--${safeSiteId}" aria-hidden="true">${iconMarkupById[siteId] || ""}</span>`;
  }
  var cinnaGifAssetCache = /* @__PURE__ */ new Map();
  function skipGifSubBlocks2(data, offset) {
    let cursor = offset;
    while (cursor < data.length) {
      const size = data[cursor];
      cursor += 1;
      if (size === 0) break;
      cursor += size;
    }
    return cursor;
  }
  function parseGifTimingData(data) {
    if (!(data instanceof Uint8Array) || data.length < 14) {
      return { frameDelaysMs: [], totalDurationMs: 2200 };
    }
    const signature = String.fromCharCode(data[0], data[1], data[2], data[3], data[4], data[5]);
    if (signature !== "GIF87a" && signature !== "GIF89a") {
      return { frameDelaysMs: [], totalDurationMs: 2200 };
    }
    let offset = 13;
    const packed = data[10];
    if (packed & 128) {
      offset += 3 * (1 << ((packed & 7) + 1));
    }
    let frameDelay = 10;
    const frameDelaysMs = [];
    while (offset < data.length) {
      const token = data[offset];
      if (token === 59) break;
      if (token === 33) {
        const label = data[offset + 1];
        if (label === 249 && offset + 7 < data.length) {
          const rawDelay = data[offset + 4] | data[offset + 5] << 8;
          frameDelay = rawDelay <= 1 ? 10 : rawDelay;
          offset += 8;
          continue;
        }
        offset += 2;
        offset = skipGifSubBlocks2(data, offset);
        continue;
      }
      if (token === 44) {
        if (offset + 9 >= data.length) break;
        const localPacked = data[offset + 9];
        offset += 10;
        if (localPacked & 128) {
          offset += 3 * (1 << ((localPacked & 7) + 1));
        }
        offset += 1;
        offset = skipGifSubBlocks2(data, offset);
        frameDelaysMs.push(frameDelay * 10);
        frameDelay = 10;
        continue;
      }
      break;
    }
    const totalDurationMs = frameDelaysMs.reduce((sum, delay) => sum + delay, 0);
    return {
      frameDelaysMs,
      totalDurationMs: totalDurationMs > 0 ? totalDurationMs : 2200
    };
  }
  async function ensureCinnaGifAsset(url) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return null;
    if (cinnaGifAssetCache.has(safeUrl)) {
      return cinnaGifAssetCache.get(safeUrl);
    }
    const assetPromise = (async () => {
      const response = await fetch(safeUrl, { cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Cinna GIF fetch failed (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const timing = parseGifTimingData(new Uint8Array(buffer));
      const asset = {
        frameDelaysMs: timing.frameDelaysMs,
        totalDurationMs: timing.totalDurationMs,
        frames: [],
        objectUrl: "",
        width: 0,
        height: 0
      };
      if (typeof ImageDecoder === "function" && typeof createImageBitmap === "function") {
        const decoder = new ImageDecoder({ data: buffer, type: "image/gif" });
        await decoder.tracks.ready;
        const frameCount = decoder.tracks.selectedTrack?.frameCount || timing.frameDelaysMs.length || 1;
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
          const decoded = await decoder.decode({ frameIndex, completeFramesOnly: true });
          const bitmap = await createImageBitmap(decoded.image);
          decoded.image.close();
          asset.frames.push(bitmap);
        }
        decoder.close();
        if (asset.frames[0]) {
          asset.width = asset.frames[0].width;
          asset.height = asset.frames[0].height;
        }
      } else {
        asset.objectUrl = URL.createObjectURL(new Blob([buffer], { type: "image/gif" }));
      }
      return asset;
    })();
    cinnaGifAssetCache.set(safeUrl, assetPromise);
    return assetPromise;
  }
  function createCinnaMobileGifController(sidebarRoot) {
    let disposed = false;
    let restartTimerId = 0;
    let rafId = 0;
    let frameStartedAt = 0;
    let frameIndex = 0;
    const gifImage = sidebarRoot?.querySelector(".cinna-mobile-gif");
    if (!(gifImage instanceof HTMLImageElement)) {
      return { dispose() {
      } };
    }
    const safeUrl = sanitizeUrl(gifImage.getAttribute("data-cinna-gif-src") || gifImage.getAttribute("src") || "");
    if (!safeUrl) {
      return { dispose() {
      } };
    }
    let canvas = null;
    let ctx = null;
    function cleanupTimers() {
      if (restartTimerId) {
        window.clearInterval(restartTimerId);
        restartTimerId = 0;
      }
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      cleanupTimers();
      if (canvas instanceof HTMLCanvasElement) {
        canvas.remove();
      }
      gifImage.hidden = false;
      gifImage.classList.remove("cinna-mobile-gif--enhanced");
    }
    ensureCinnaGifAsset(safeUrl).then((asset) => {
      if (disposed || !asset) return;
      if (Array.isArray(asset.frames) && asset.frames.length) {
        canvas = document.createElement("canvas");
        canvas.className = "cinna-mobile-gif cinna-mobile-gif--canvas";
        canvas.width = asset.width || asset.frames[0].width || 1;
        canvas.height = asset.height || asset.frames[0].height || 1;
        canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
        ctx = canvas.getContext("2d", { alpha: true });
        if (!ctx) {
          canvas.remove();
          canvas = null;
          gifImage.hidden = false;
          return;
        }
        gifImage.hidden = true;
        gifImage.classList.add("cinna-mobile-gif--enhanced");
        gifImage.after(canvas);
        const frameDelays = asset.frameDelaysMs.length ? asset.frameDelaysMs : asset.frames.map(() => Math.round(asset.totalDurationMs / Math.max(1, asset.frames.length)));
        const drawFrame = (nextIndex) => {
          if (!ctx || !canvas || disposed) return;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const frame = asset.frames[nextIndex] || asset.frames[0];
          if (frame) {
            ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
          }
        };
        const animate = (now) => {
          if (disposed) return;
          if (!frameStartedAt) frameStartedAt = now;
          const frameDelay = Math.max(16, frameDelays[frameIndex] || frameDelays[0] || 100);
          if (now - frameStartedAt >= frameDelay) {
            frameStartedAt = now;
            frameIndex = (frameIndex + 1) % asset.frames.length;
            drawFrame(frameIndex);
          }
          rafId = window.requestAnimationFrame(animate);
        };
        drawFrame(frameIndex);
        rafId = window.requestAnimationFrame(animate);
        return;
      }
      if (asset.objectUrl) {
        gifImage.loading = "eager";
        gifImage.decoding = "sync";
        gifImage.src = asset.objectUrl;
        restartTimerId = window.setInterval(() => {
          if (disposed) return;
          gifImage.src = "";
          window.requestAnimationFrame(() => {
            if (!disposed) {
              gifImage.src = asset.objectUrl;
            }
          });
        }, Math.max(900, asset.totalDurationMs + 64));
      }
    }).catch(() => {
    });
    return { dispose };
  }
  function renderSidebar(payloadById, sites, options = {}) {
    const compact = Boolean(options?.compact);
    const mobileLinksRevealState = compact ? String(options?.mobileLinksRevealState || "pending") : "";
    const renderSites = compact ? ["soundcloud", "spotify", "lastfm", "discord", "steam", "twitter"].map((siteId) => sites.find((site) => site.id === siteId)).filter(Boolean) : sites;
    const rows = renderSites.map((site) => {
      const payload = ensurePayload(site, payloadById.get(site.id));
      const openUrl = sanitizeUrl(payload.profile?.url || site.url);
      const onlineState = resolveLinkOnlineState(site.id, payload);
      const statusDot = onlineState === null ? "" : `<span class="steam-link-status-dot steam-link-status-dot--${onlineState ? "online" : "offline"}" data-status="${onlineState ? "online" : "offline"}" aria-hidden="true" title="${onlineState ? "Online" : "Offline"}"></span>`;
      const siteLabel = escapeHtml(SITE_THEME_LABEL[site.id] || site.label);
      const iconMarkup = `<span class="steam-sidebar-site-icon-shell${onlineState === null ? "" : " steam-sidebar-site-icon-shell--status"}">${renderSidebarSiteIcon(site.id)}${statusDot}</span>`;
      const copyHandle = site.id === "discord" ? DISCORD_PROFILE_HANDLE : "";
      if (compact) {
        const mobileSiteId = escapeHtml(site.id);
        const iconLinkMarkup = copyHandle
          ? `<button class="steam-sidebar-link steam-sidebar-link--icon-only steam-sidebar-link--copy" type="button" data-mobile-site-id="${mobileSiteId}" data-profile-site-id="${mobileSiteId}" data-profile-copy-handle="${escapeHtml(copyHandle)}" data-mobile-selection-phase="idle" aria-label="Copy Discord handle ${escapeHtml(copyHandle)}" title="Copy Discord handle">${iconMarkup}</button>`
          : openUrl ? `<a class="steam-sidebar-link steam-sidebar-link--icon-only" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer" data-mobile-site-id="${mobileSiteId}" data-profile-site-id="${mobileSiteId}" data-mobile-selection-phase="idle" aria-label="${siteLabel}" title="${siteLabel}">${iconMarkup}</a>` : `<span class="steam-sidebar-link steam-sidebar-link--icon-only is-disabled" data-mobile-site-id="${mobileSiteId}" data-profile-site-id="${mobileSiteId}" data-mobile-selection-phase="idle" aria-label="${siteLabel}" title="${siteLabel}">${iconMarkup}</span>`;
        return `
      <li class="steam-sidebar-row steam-sidebar-row--${escapeHtml(site.id)}" data-profile-site-id="${mobileSiteId}">
        ${iconLinkMarkup}
      </li>
    `;
      }
      const profileSiteId = escapeHtml(site.id);
      const linkMarkup = copyHandle
        ? `<button class="steam-sidebar-link steam-sidebar-link--copy" type="button" data-profile-site-id="${profileSiteId}" data-profile-copy-handle="${escapeHtml(copyHandle)}" aria-label="Copy Discord handle ${escapeHtml(copyHandle)}">${siteLabel}</button>`
        : openUrl ? `<a class="steam-sidebar-link" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer" data-profile-site-id="${profileSiteId}">${siteLabel}</a>` : `<span class="steam-sidebar-link" data-profile-site-id="${profileSiteId}">${siteLabel}</span>`;
      return `
      <li class="steam-sidebar-row steam-sidebar-row--${escapeHtml(site.id)}" data-profile-site-id="${profileSiteId}"${openUrl && !copyHandle ? ` data-open-url="${escapeHtml(openUrl)}"` : ""}>
        <div class="steam-sidebar-row-main">
          <p class="steam-sidebar-row-title">
            <span class="steam-sidebar-row-title-wrap">
              <span class="steam-sidebar-link-shell">
                ${iconMarkup}
                ${linkMarkup}
              </span>
            </span>
          </p>
        </div>
      </li>
    `;
    }).join("");
    const cinnaGifs = ['cinna_sleep.gif', 'cinna_wink.gif'];
    const randomCinna = cinnaGifs[Math.floor(Math.random() * cinnaGifs.length)];
    return `
    <section class="steam-sidebar-panel${compact ? " steam-sidebar-panel--mobile-home" : ""}">
      ${compact ? "" : '<h3 class="steam-sidebar-title">Profile Links:</h3>'}
      <ul class="steam-sidebar-list${compact ? " steam-sidebar-list--mobile-icons" : ""}"${compact ? ` data-mobile-links-reveal="${escapeHtml(mobileLinksRevealState)}"` : ""}>
        ${rows}
      </ul>
      <div class="cinna-mobile-gif-wrap" aria-hidden="true">
        <img class="cinna-mobile-gif" src="/${randomCinna}" data-cinna-gif-src="/${randomCinna}" alt="" loading="eager" decoding="async" />
      </div>
    </section>
  `;
  }
  function createSocialHubRenderer({
    sites,
    root: root2,
    profile,
    showcases,
    sidebar,
    profileTagline,
    lastRefreshLabel,
    refreshButton,
    onRefreshRequested
  }) {
    let disposed = false;
    const shufflePlayerController = createShufflePlayerController();
    const shuffleDebugController = {
      advanceTrack: () => shufflePlayerController.debugAdvanceTrack?.()
    };
    window.__internetAngelShuffleDebug = shuffleDebugController;
    let externalPromptRoot = null;
    let externalPromptUrlEl = null;
    let externalPromptCancelButton = null;
    let externalPromptAcceptButton = null;
    let pendingExternalUrl = "";
    let lastFocusedTrigger = null;
    let mobileAudioDock = null;
    let cinnaMobileGifController = null;
    let lastFmTrackPanelRoot = null;
    let lastFmTrackPanelContent = null;
    let lastFmTrackPanelActiveKey = "";
    let lastFmTrackPanelOriginTrigger = null;
    let lastFmTrackPanelAbortController = null;
    const lastFmTrackDetailsCache = /* @__PURE__ */ new Map();
    let lastFmTrackPreviewAudio = null;
    let lastFmTrackPreviewPausedShuffle = false;
    let lastFmTrackPreviewSyncQueued = false;
    let lastFmTrackPreviewSuppressAutoResume = false;
    let lastFmTrackPanelFitRaf = 0;
    let lastFmTrackPanelSceneTimer = 0;
    let spotifyIframeApiPromise = null;
    let lastFmSpotifyEmbedController = null;
    let lastFmSpotifyEmbedLoadToken = 0;
    let mobileSpeakerToggleUnsubscribe = null;
    let mobileDiscordRevealPlayed = false;
    let mobileDiscordRevealTimer = 0;
    let mobileLinksRevealPlayed = false;
    let mobileLinksRevealTimer = 0;
    const PROFILE_LINK_LAUNCH_DELAY_MS = 380;
    const MOBILE_PROFILE_ICON_LAUNCH_DELAY_MS = PROFILE_LINK_LAUNCH_DELAY_MS;
    const MOBILE_GENERIC_EXTERNAL_LAUNCH_DELAY_MS = 120;
    const MOBILE_PROFILE_SELECTION_CLEAR_DELAY_MS = 1200;
    const LASTFM_PANEL_SCENE_TRANSITION_MS = 320;
    const LASTFM_PANEL_SCENE_SETTLE_MS = 220;
    const LASTFM_PANEL_SCENE_LOADING_INTRO_MS = 960;
    const LASTFM_PANEL_SCENE_LOADING_SPIN_MS = 1840;
    const LASTFM_PANEL_SCENE_HUNG_SPIN_MS = 4200;
    const LASTFM_PANEL_MORPH_VEIL_FADE_MS = 120;
    const LASTFM_PANEL_MORPH_MIN_HOLD_MS = 180;
    const LASTFM_PANEL_MORPH_CONTENT_MS = 280;
    const LASTFM_PANEL_MORPH_SIZE_MS = 320;
    const LASTFM_PANEL_SCENE_HUNG_AFTER_SPINS = 5;
    const LASTFM_PANEL_SCENE_EXPLOSION_AFTER_HUNG_SPINS = 1;
    const LASTFM_PANEL_SCENE_EXPLOSION_OVERLAY_MS = 1400;
    const LASTFM_PANEL_SCENE_EXPLOSION_GIF_URL = "/assets/Deltarune_explosion.gif";
    const LASTFM_PANEL_SCENE_EXPLOSION_SOUND_URL = "/assets/deltarune-explosion.mp3";
    const LASTFM_PANEL_AFTER_RENDER_TIMEOUT_MS = 1800;
    const SPOTIFY_EMBED_CONTROLLER_TIMEOUT_MS = 1500;
    const lastFmTrackPanelSceneRuntime = new WeakMap();
    let mobileLinkSelectionTimer = 0;
    let mobileLinkSelectedKey = "";
    let mobileLinkSelectionPhase = "idle";
    let mobileLinkAnimationTimer = 0;
    let pendingMobileExternalLaunchTimer = 0;
    let pendingMobileExternalPopup = null;
    let profileCopyToastTimer = 0;
    let desktopProfilePromptTimer = 0;
    let lastFmTrackPanelSceneSettleTimer = 0;
    const mobileSpeakerButton = mobileSpeakerToggle instanceof HTMLButtonElement ? mobileSpeakerToggle : null;
    const audioControlShell = siteAudioControl instanceof HTMLElement ? siteAudioControl : null;
    const shuffleVolumeSlider = siteVolumeSlider instanceof HTMLInputElement ? siteVolumeSlider : null;
    const desktopShuffleVisualizerLayer = document.getElementById("os-shuffle-visualizer-layer");
    const desktopShuffleVisualizerPlayer = document.getElementById("os-shuffle-visualizer-player");
    const interactionSfxController = interactionSfx && typeof interactionSfx.play === "function" ? interactionSfx : null;
    const interactionSfxCleanup = interactionSfxController?.bindDelegatedRoot?.(document);
    function primeInteractionSfx(source) {
      if (!interactionSfxController) return;
      void interactionSfxController.initFromGesture(source);
    }
    function playInteractionSfx(soundId, source, meta = {}) {
      if (!interactionSfxController) return;
      interactionSfxController.play({ soundId, source, meta });
    }
    async function copyTextToClipboard(text) {
      const safeText = String(text || "").trim();
      if (!safeText) return false;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
          await navigator.clipboard.writeText(safeText);
          return true;
        } catch {
        }
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = safeText;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, safeText.length);
        const copied = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
        textarea.remove();
        return copied;
      } catch {
        return false;
      }
    }
    function ensureProfileCopyToast() {
      let toast = document.querySelector("[data-profile-copy-toast]");
      if (toast instanceof HTMLElement) return toast;
      toast = document.createElement("div");
      toast.className = "profile-copy-toast";
      toast.setAttribute("data-profile-copy-toast", "");
      toast.setAttribute("data-profile-copy-toast-state", "idle");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      toast.innerHTML = `
        <span class="profile-copy-toast-icon" aria-hidden="true">${renderSidebarSiteIcon("discord")}</span>
        <span class="profile-copy-toast-text" data-profile-copy-toast-text></span>
      `;
      document.body.appendChild(toast);
      return toast;
    }
    function showProfileCopyToast(message) {
      const toast = ensureProfileCopyToast();
      const textEl = toast.querySelector("[data-profile-copy-toast-text]");
      if (textEl instanceof HTMLElement) {
        textEl.textContent = firstNonEmpty(message, "Copied");
      }
      if (profileCopyToastTimer) {
        window.clearTimeout(profileCopyToastTimer);
        profileCopyToastTimer = 0;
      }
      toast.setAttribute("data-profile-copy-toast-state", "idle");
      void toast.offsetWidth;
      toast.setAttribute("data-profile-copy-toast-state", "visible");
      profileCopyToastTimer = window.setTimeout(() => {
        profileCopyToastTimer = 0;
        toast.setAttribute("data-profile-copy-toast-state", "idle");
      }, 1400);
    }
    async function handleProfileHandleCopy(trigger) {
      if (!(trigger instanceof HTMLElement)) return;
      const handle = firstNonEmpty(trigger.getAttribute("data-profile-copy-handle"), DISCORD_PROFILE_HANDLE);
      if (!handle) return;
      const selectedLink = resolveMobileProfileIconLink(trigger);
      if (selectedLink instanceof HTMLElement && isCompactMobileLayout()) {
        markMobileLinkSelected(selectedLink);
      }
      primeInteractionSfx("profileHandleCopy");
      const copied = await copyTextToClipboard(handle);
      playInteractionSfx(copied ? "confirm_soft" : "cancel_soft", copied ? "profileHandleCopied" : "profileHandleCopyFailed");
      showProfileCopyToast(copied ? `Copied ${handle}` : `Copy ${handle}`);
    }
    function setInteractionSfxExternalAudioActive(active) {
      interactionSfxController?.setExternalAudioActive?.(Boolean(active));
    }
    function sanitizeProfileLinkSiteId(siteId) {
      const normalizedSiteId = String(siteId || "").trim().toLowerCase();
      return PROFILE_LINK_SITE_IDS.has(normalizedSiteId) ? normalizedSiteId : "";
    }
    function resolveProfileLinkSiteId(trigger) {
      if (!(trigger instanceof HTMLElement)) return "";
      const candidate = trigger.closest("[data-profile-site-id]");
      if (!(candidate instanceof HTMLElement)) return "";
      return sanitizeProfileLinkSiteId(candidate.getAttribute("data-profile-site-id"));
    }
    function clearDesktopProfilePromptTimer() {
      if (!desktopProfilePromptTimer) return;
      window.clearTimeout(desktopProfilePromptTimer);
      desktopProfilePromptTimer = 0;
    }
    function openExternalPromptDialog(url, trigger = null) {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return;
      const dialog = ensureExternalPrompt();
      playInteractionSfx("open_soft", "externalConfirmOpen");
      pendingExternalUrl = safeUrl;
      lastFocusedTrigger = trigger instanceof HTMLElement ? trigger : null;
      if (externalPromptUrlEl instanceof HTMLElement) {
        externalPromptUrlEl.textContent = formatExternalPromptDisplayUrl(safeUrl);
        externalPromptUrlEl.setAttribute("title", safeUrl);
      }
      dialog.hidden = false;
      dialog.setAttribute("aria-hidden", "false");
      dialog.classList.add("is-open");
      const focusTarget = externalPromptCancelButton instanceof HTMLButtonElement ? externalPromptCancelButton : externalPromptAcceptButton;
      focusTarget?.focus({ preventScroll: true });
    }
    function clearMobileDiscordRevealTimer() {
      if (!mobileDiscordRevealTimer) return;
      window.clearTimeout(mobileDiscordRevealTimer);
      mobileDiscordRevealTimer = 0;
    }
    function getMobileDiscordReveal() {
      if (!(profileTagline instanceof HTMLElement)) return null;
      return profileTagline.querySelector(".discord-presence-reveal");
    }
    function setMobileDiscordRevealState(nextState) {
      const reveal = getMobileDiscordReveal();
      if (!(reveal instanceof HTMLElement)) return;
      reveal.dataset.mobileDiscordReveal = nextState;
      reveal.classList.toggle("is-mobile-discord-visible", nextState === "visible");
    }
    function clearMobileLinksRevealTimer() {
      if (!mobileLinksRevealTimer) return;
      window.clearTimeout(mobileLinksRevealTimer);
      mobileLinksRevealTimer = 0;
    }
    function getMobileLinksRow() {
      if (!(sidebar instanceof HTMLElement)) return null;
      return sidebar.querySelector(".steam-sidebar-list--mobile-icons");
    }
    function setMobileLinksRevealState(nextState) {
      const row = getMobileLinksRow();
      if (!(row instanceof HTMLElement)) return;
      row.dataset.mobileLinksReveal = nextState;
      row.classList.toggle("is-mobile-links-visible", nextState === "visible");
    }
    function scheduleMobileLinksReveal() {
      if (!isCompactMobileLayout()) return;
      if (mobileLinksRevealPlayed) {
        setMobileLinksRevealState("visible");
        return;
      }
      setMobileLinksRevealState("pending");
      clearMobileLinksRevealTimer();
      mobileLinksRevealTimer = window.setTimeout(() => {
        mobileLinksRevealTimer = 0;
        mobileLinksRevealPlayed = true;
        setMobileLinksRevealState("visible");
      }, 320);
    }
    function scheduleMobileDiscordReveal() {
      if (!isCompactMobileLayout()) return;
      if (mobileDiscordRevealPlayed) {
        setMobileDiscordRevealState("visible");
        scheduleMobileLinksReveal();
        return;
      }
      setMobileDiscordRevealState("pending");
      clearMobileDiscordRevealTimer();
      mobileDiscordRevealTimer = window.setTimeout(() => {
        mobileDiscordRevealTimer = 0;
        mobileDiscordRevealPlayed = true;
        setMobileDiscordRevealState("visible");
        scheduleMobileLinksReveal();
      }, 120);
    }
    function clearMobileLinkSelectionTimer() {
      if (!mobileLinkSelectionTimer) return;
      window.clearTimeout(mobileLinkSelectionTimer);
      mobileLinkSelectionTimer = 0;
    }
    function clearMobileLinkAnimationTimer() {
      if (!mobileLinkAnimationTimer) return;
      window.clearTimeout(mobileLinkAnimationTimer);
      mobileLinkAnimationTimer = 0;
    }
    function getMobileLinkSelectedKey(link) {
      if (!(link instanceof HTMLElement)) return "";
      const mobileSiteId = link.getAttribute("data-mobile-site-id");
      if (mobileSiteId) {
        return mobileSiteId.trim();
      }
      const siteLabel = link.getAttribute("aria-label") || link.getAttribute("title") || link.getAttribute("href") || "";
      return siteLabel.trim();
    }
    function setMobileLinksLaunchPending(active) {
      const row = getMobileLinksRow();
      if (!(row instanceof HTMLElement)) return;
      row.classList.toggle("is-mobile-launch-pending", Boolean(active));
      row.dataset.mobileLaunchPending = active ? "true" : "false";
    }
    function resolveMobileProfileIconLink(trigger) {
      const candidate = trigger instanceof HTMLElement ? trigger.closest(".steam-sidebar-link--icon-only[data-mobile-site-id]") : null;
      return candidate instanceof HTMLElement && !candidate.classList.contains("is-disabled") ? candidate : null;
    }
    function clearMobileLinkSelectedState() {
      clearMobileLinkSelectionTimer();
      clearMobileLinkAnimationTimer();
      mobileLinkSelectedKey = "";
      mobileLinkSelectionPhase = "idle";
      if (!(sidebar instanceof HTMLElement)) return;
      sidebar.querySelectorAll(".steam-sidebar-link--icon-only.is-mobile-selected").forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        node.classList.remove("is-mobile-selected");
        node.dataset.mobileSelected = "false";
        node.dataset.mobileSelectionPhase = "idle";
        const row = node.closest(".steam-sidebar-row");
        if (row instanceof HTMLElement) {
          row.dataset.mobileSelected = "false";
          row.dataset.mobileSelectionPhase = "idle";
        }
      });
    }
    function syncMobileLinkSelectedState() {
      if (!(sidebar instanceof HTMLElement)) return;
      const selectedKey = mobileLinkSelectedKey;
      sidebar.querySelectorAll(".steam-sidebar-link--icon-only").forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const isSelected = Boolean(selectedKey) && getMobileLinkSelectedKey(node) === selectedKey;
        node.classList.toggle("is-mobile-selected", isSelected);
        node.dataset.mobileSelected = isSelected ? "true" : "false";
        node.dataset.mobileSelectionPhase = isSelected ? mobileLinkSelectionPhase : "idle";
        const row = node.closest(".steam-sidebar-row");
        if (row instanceof HTMLElement) {
          row.dataset.mobileSelected = isSelected ? "true" : "false";
          row.dataset.mobileSelectionPhase = isSelected ? mobileLinkSelectionPhase : "idle";
        }
      });
    }
    function finishMobileLinkSelectionAnimation() {
      if (!mobileLinkSelectedKey) return;
      mobileLinkSelectionPhase = "idle";
      syncMobileLinkSelectedState();
    }
    function markMobileLinkSelected(link) {
      if (!(link instanceof HTMLElement)) {
        clearMobileLinkSelectedState();
        return;
      }
      mobileLinkSelectedKey = getMobileLinkSelectedKey(link);
      mobileLinkSelectionPhase = "animating";
      syncMobileLinkSelectedState();
      clearMobileLinkAnimationTimer();
      mobileLinkAnimationTimer = window.setTimeout(() => {
        mobileLinkAnimationTimer = 0;
        finishMobileLinkSelectionAnimation();
      }, MOBILE_PROFILE_ICON_LAUNCH_DELAY_MS);
      clearMobileLinkSelectionTimer();
      mobileLinkSelectionTimer = window.setTimeout(() => {
        clearMobileLinkSelectedState();
      }, MOBILE_PROFILE_SELECTION_CLEAR_DELAY_MS);
    }
    function clearPendingMobileExternalLaunch() {
      if (pendingMobileExternalLaunchTimer) {
        window.clearTimeout(pendingMobileExternalLaunchTimer);
        pendingMobileExternalLaunchTimer = 0;
      }
      if (pendingMobileExternalPopup && !pendingMobileExternalPopup.closed) {
        try {
          pendingMobileExternalPopup.close();
        } catch {
        }
      }
      pendingMobileExternalPopup = null;
      setMobileLinksLaunchPending(false);
    }
    function resolveExternalLaunchTarget(trigger, fallback = "_blank") {
      if (trigger instanceof HTMLAnchorElement) {
        const targetAttr = (trigger.getAttribute("target") || "").trim();
        return targetAttr || "_self";
      }
      return fallback;
    }
    function showDesktopProfilePromptWithEffect(url, trigger = null) {
      const safeUrl = sanitizeUrl(url);
      const triggerElement = trigger instanceof HTMLElement ? trigger : null;
      const siteId = resolveProfileLinkSiteId(triggerElement);
      if (!safeUrl || !siteId || isCompactMobileLayout()) return false;
      openExternalPromptDialog(safeUrl, triggerElement);
      return true;
    }
    function launchMobileExternalWithSelection(url, { trigger = null, target = "_blank" } = {}) {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return;
      const triggerElement = trigger instanceof HTMLElement ? trigger : null;
      const resolvedTarget = resolveExternalLaunchTarget(triggerElement instanceof HTMLAnchorElement ? triggerElement : null, target || "_blank");
      const selectedLink = resolveMobileProfileIconLink(triggerElement);
      const useProfileIconAura = Boolean(selectedLink);
      if (useProfileIconAura && pendingMobileExternalLaunchTimer) {
        return;
      }
      clearPendingMobileExternalLaunch();
      if (selectedLink instanceof HTMLElement) {
        markMobileLinkSelected(selectedLink);
        setMobileLinksLaunchPending(true);
      } else {
        clearMobileLinkSelectedState();
      }
      let popupWindow = null;
      if (resolvedTarget === "_blank") {
        try {
          popupWindow = window.open("", "_blank");
          if (popupWindow && "opener" in popupWindow) {
            popupWindow.opener = null;
          }
        } catch {
          popupWindow = null;
        }
      }
      pendingMobileExternalPopup = popupWindow;
      const launchDelayMs = useProfileIconAura ? MOBILE_PROFILE_ICON_LAUNCH_DELAY_MS : MOBILE_GENERIC_EXTERNAL_LAUNCH_DELAY_MS;
      pendingMobileExternalLaunchTimer = window.setTimeout(() => {
        pendingMobileExternalLaunchTimer = 0;
        setMobileLinksLaunchPending(false);
        if (resolvedTarget === "_blank") {
          let launched = false;
          if (popupWindow && !popupWindow.closed) {
            try {
              popupWindow.location.replace(safeUrl);
              launched = true;
            } catch {
            }
          }
          if (!launched) {
            launchExternal(safeUrl, useProfileIconAura ? "_self" : "_blank");
          }
          pendingMobileExternalPopup = null;
          return;
        }
        launchExternal(safeUrl, "_self");
      }, launchDelayMs);
    }
    function ensureMobileAudioDock() {
      if (mobileAudioDock instanceof HTMLElement) return mobileAudioDock;
      const dock = document.createElement("div");
      dock.className = "josie-mobile-audio-dock";
      dock.hidden = true;
      (document.body || root2)?.appendChild(dock);
      mobileAudioDock = dock;
      return dock;
    }
    function syncMobileAudioDock(enabled) {
      const dock = ensureMobileAudioDock();
      dock.hidden = !enabled;
      if (!enabled) {
        dock.innerHTML = "";
        return null;
      }
      dock.innerHTML = renderCompactMobileAudioPlayer();
      return dock.querySelector("[data-shuffle-player]");
    }
    function syncCinnaMobileGif(enabled) {
      cinnaMobileGifController?.dispose?.();
      cinnaMobileGifController = null;
      if (!enabled || !(sidebar instanceof HTMLElement)) return;
      cinnaMobileGifController = createCinnaMobileGifController(sidebar);
    }
    function syncMobileSpeakerToggle(enabled) {
      if (!(mobileSpeakerButton instanceof HTMLButtonElement)) return;
      mobileSpeakerButton.hidden = !enabled;
      if (audioControlShell instanceof HTMLElement) {
        audioControlShell.hidden = !enabled;
      }
      mobileSpeakerButton.setAttribute("aria-hidden", enabled ? "false" : "true");
      if (!enabled) return;
      const state = shufflePlayerController.getState();
      const idleState = !state.hasTrack || state.blocked || !state.playing;
      const label = idleState ? "Enable audio" : state.muted ? "Unmute audio" : "Mute audio";
      mobileSpeakerButton.dataset.audioMuted = String(state.muted);
      mobileSpeakerButton.dataset.audioPlaying = String(state.playing);
      mobileSpeakerButton.dataset.audioBlocked = String(state.blocked);
      mobileSpeakerButton.dataset.audioHasTrack = String(state.hasTrack);
      mobileSpeakerButton.dataset.audioVolume = String(clamp2(Number(state.volumeRatio) || 0, 0, 1).toFixed(2));
      if (audioControlShell instanceof HTMLElement) {
        audioControlShell.dataset.audioMuted = String(state.muted);
        audioControlShell.dataset.audioVolume = mobileSpeakerButton.dataset.audioVolume;
      }
      mobileSpeakerButton.setAttribute("aria-label", label);
      mobileSpeakerButton.setAttribute("title", label);
      if (shuffleVolumeSlider instanceof HTMLInputElement) {
        const volumePercent = Math.round(clamp2(Number(state.volumeRatio) || 0, 0, 1) * 100);
        shuffleVolumeSlider.value = String(volumePercent);
        shuffleVolumeSlider.setAttribute("aria-valuetext", `${volumePercent}%`);
      }
    }
    async function onMobileSpeakerToggleClick(event) {
      if (!(event.currentTarget instanceof HTMLButtonElement)) return;
      event.preventDefault();
      primeInteractionSfx("mobileSpeakerToggle");
      playInteractionSfx("toggle_soft", "mobileSpeakerToggle");
      const state = shufflePlayerController.getState();
      if (!state.hasTrack || state.blocked || !state.playing) {
        shufflePlayerController.setMuted(false);
        await shufflePlayerController.ensureStarted();
        return;
      }
      shufflePlayerController.toggleMuted();
    }
    function onShuffleVolumeInput(event) {
      const slider = event.currentTarget;
      if (!(slider instanceof HTMLInputElement)) return;
      const volumeRatio = clamp2(Number(slider.value) / 100, 0, 1);
      shufflePlayerController.setVolumeRatio(volumeRatio);
    }
    function launchExternal(url, target = "_blank") {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return;
      if (target === "_blank") {
        window.open(safeUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = safeUrl;
      }
    }
    function launchPanelExternal(url, { appUrl = "" } = {}) {
      const safeUrl = sanitizeUrl(url);
      const safeAppUrl = typeof appUrl === "string" && /^spotify:track:[A-Za-z0-9_-]+$/i.test(appUrl.trim())
        ? appUrl.trim()
        : "";
      if (safeAppUrl) {
        window.open(safeAppUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (safeUrl) {
        window.open(safeUrl, "_blank", "noopener,noreferrer");
      }
    }
    function ensureExternalPrompt() {
      if (externalPromptRoot instanceof HTMLElement) return externalPromptRoot;
      const dialog = document.createElement("div");
      dialog.className = "external-link-confirm";
      dialog.hidden = true;
      dialog.setAttribute("aria-hidden", "true");
      dialog.innerHTML = `
      <div class="external-link-confirm-backdrop" data-external-confirm-cancel></div>
      <div class="external-link-confirm-window" role="dialog" aria-modal="true" aria-labelledby="external-link-confirm-title">
        <button class="external-link-confirm-close" type="button" aria-label="Close this dialog" data-external-confirm-cancel>&times;</button>
        <h3 class="external-link-confirm-title" id="external-link-confirm-title">Are you sure?</h3>
        <p class="external-link-confirm-copy">You are going to visit</p>
        <p class="external-link-confirm-url" data-external-confirm-url></p>
        <div class="external-link-confirm-actions">
          <button class="external-link-confirm-button external-link-confirm-button--accept" type="button" data-external-confirm-accept>Visit</button>
          <button class="external-link-confirm-button external-link-confirm-button--new-tab" type="button" data-external-confirm-new-tab>New Tab</button>
          <button class="external-link-confirm-button external-link-confirm-button--cancel" type="button" data-external-confirm-cancel>Cancel</button>
        </div>
      </div>
    `;
      document.body.appendChild(dialog);
      externalPromptRoot = dialog;
      externalPromptUrlEl = dialog.querySelector("[data-external-confirm-url]");
      externalPromptCancelButton = dialog.querySelector("[data-external-confirm-cancel].external-link-confirm-button");
      externalPromptAcceptButton = dialog.querySelector("[data-external-confirm-accept]");
      dialog.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest("[data-external-confirm-cancel]")) {
          primeInteractionSfx(describeTargetForPrompt(target));
          playInteractionSfx("cancel_soft", describeTargetForPrompt(target));
          hideExternalPrompt("silent");
          return;
        }
        if (target.closest("[data-external-confirm-accept]")) {
          const targetUrl = pendingExternalUrl;
          primeInteractionSfx("externalConfirmAccept");
          playInteractionSfx("confirm_soft", "externalConfirmAccept");
          hideExternalPrompt("silent");
          launchExternal(targetUrl, "_self");
        }
        if (target.closest("[data-external-confirm-new-tab]")) {
          const targetUrl = pendingExternalUrl;
          primeInteractionSfx("externalConfirmNewTab");
          playInteractionSfx("confirm_soft", "externalConfirmNewTab");
          hideExternalPrompt("silent");
          launchExternal(targetUrl, "_blank");
        }
      });
      dialog.addEventListener("keydown", (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key === "Escape") {
          event.preventDefault();
          playInteractionSfx("cancel_soft", "externalConfirmEscape");
          hideExternalPrompt("silent");
          return;
        }
        if (event.key === "Enter") {
          const targetUrl = pendingExternalUrl;
          if (!targetUrl) return;
          event.preventDefault();
          playInteractionSfx("confirm_soft", "externalConfirmEnter");
          hideExternalPrompt("silent");
          launchExternal(targetUrl, "_self");
        }
      });
      return dialog;
    }
    function describeTargetForPrompt(target) {
      if (!(target instanceof HTMLElement)) return "externalConfirm";
      if (target.closest(".external-link-confirm-backdrop")) return "externalConfirmBackdrop";
      if (target.closest(".external-link-confirm-close")) return "externalConfirmClose";
      if (target.closest(".external-link-confirm-button--cancel")) return "externalConfirmCancel";
      if (target.closest(".external-link-confirm-button--accept")) return "externalConfirmAccept";
      if (target.closest(".external-link-confirm-button--new-tab")) return "externalConfirmNewTab";
      return "externalConfirm";
    }
    function hideExternalPrompt(reason = "cancel") {
      clearDesktopProfilePromptTimer();
      if (!(externalPromptRoot instanceof HTMLElement)) return;
      const wasOpen = externalPromptRoot.classList.contains("is-open");
      if (wasOpen && reason === "cancel") {
        playInteractionSfx("cancel_soft", "externalConfirmDismiss");
      }
      pendingExternalUrl = "";
      externalPromptRoot.classList.remove("is-open");
      externalPromptRoot.hidden = true;
      externalPromptRoot.setAttribute("aria-hidden", "true");
      if (lastFocusedTrigger instanceof HTMLElement) {
        lastFocusedTrigger.focus({ preventScroll: true });
      }
      lastFocusedTrigger = null;
    }
    function showExternalPrompt(url, trigger = null) {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return;
      if (isCompactMobileLayout()) {
        launchMobileExternalWithSelection(safeUrl, {
          trigger: trigger instanceof HTMLElement ? trigger : null,
          target: resolveExternalLaunchTarget(trigger instanceof HTMLAnchorElement ? trigger : null, "_blank")
        });
        return;
      }
      if (showDesktopProfilePromptWithEffect(safeUrl, trigger)) {
        return;
      }
      openExternalPromptDialog(safeUrl, trigger);
    }
    function normalizeTrackDetailsQuery(query) {
      return {
        artist: String(query?.artist || "").replace(/\s+/g, " ").trim(),
        track: String(query?.track || "").replace(/\s+/g, " ").trim(),
        album: String(query?.album || "").replace(/\s+/g, " ").trim(),
        url: sanitizeUrl(query?.url)
      };
    }
    function normalizeArtistDetailsQuery(query) {
      return {
        artist: String(query?.artist || "").replace(/\s+/g, " ").trim(),
        url: sanitizeUrl(query?.url)
      };
    }
    function normalizeAlbumDetailsQuery(query) {
      return {
        artist: String(query?.artist || "").replace(/\s+/g, " ").trim(),
        album: String(query?.album || "").replace(/\s+/g, " ").trim(),
        url: sanitizeUrl(query?.url)
      };
    }
    function buildTrackDetailsCacheKey(query) {
      const normalized = normalizeTrackDetailsQuery(query);
      return `${normalized.artist.toLowerCase()}::${normalized.track.toLowerCase()}`;
    }
    function buildArtistDetailsCacheKey(query) {
      const normalized = normalizeArtistDetailsQuery(query);
      return `artist::${normalized.artist.toLowerCase()}`;
    }
    function buildAlbumDetailsCacheKey(query) {
      const normalized = normalizeAlbumDetailsQuery(query);
      return `album::${normalized.artist.toLowerCase()}::${normalized.album.toLowerCase()}`;
    }
    const LASTFM_PANEL_DEFINITIONS = {
      track: {
        panelType: "track",
        normalizeQuery: normalizeTrackDetailsQuery,
        hasRequiredQuery: (query) => Boolean(query?.artist && query?.track),
        buildCacheKey: buildTrackDetailsCacheKey,
        buildEndpoint: buildLastFmTrackDetailsEndpoint,
        normalizePayload: normalizeLastFmTrackDetailsPayload,
        renderSkeleton: renderLastFmTrackPanelSkeleton,
        renderError: renderLastFmTrackPanelError,
        renderContent: renderLastFmTrackPanelContent,
        openSoundSource: "lastfmTrackPanelOpen",
        afterRender(detail, cacheKey) {
          return mountSpotifyEmbedController(detail, cacheKey);
        }
      },
      artist: {
        panelType: "artist",
        normalizeQuery: normalizeArtistDetailsQuery,
        hasRequiredQuery: (query) => Boolean(query?.artist),
        buildCacheKey: buildArtistDetailsCacheKey,
        buildEndpoint: buildLastFmArtistDetailsEndpoint,
        normalizePayload: normalizeLastFmArtistDetailsPayload,
        renderSkeleton: renderLastFmArtistPanelSkeleton,
        renderError: renderLastFmArtistPanelError,
        renderContent: renderLastFmArtistPanelContentShared,
        openSoundSource: "lastfmArtistPanelOpen",
        afterRender() {
          return Promise.resolve();
        }
      },
      album: {
        panelType: "album",
        normalizeQuery: normalizeAlbumDetailsQuery,
        hasRequiredQuery: (query) => Boolean(query?.artist && query?.album),
        buildCacheKey: buildAlbumDetailsCacheKey,
        buildEndpoint: buildLastFmAlbumDetailsEndpoint,
        normalizePayload: normalizeLastFmAlbumDetailsPayload,
        renderSkeleton: renderLastFmAlbumPanelSkeletonShared,
        renderError: renderLastFmAlbumPanelErrorShared,
        renderContent: renderLastFmAlbumPanelContentShared,
        openSoundSource: "lastfmAlbumPanelOpen",
        afterRender(detail, cacheKey) {
          return mountSpotifyEmbedController(detail, cacheKey);
        }
      }
    };
    function getLastFmPanelDefinition(panelType) {
      const definition = LASTFM_PANEL_DEFINITIONS[String(panelType || "").trim().toLowerCase()];
      return definition && typeof definition === "object" ? definition : null;
    }
    function buildSpotifyTrackUriFromUrl(rawUrl) {
      const safeUrl = sanitizeUrl(rawUrl);
      if (!safeUrl) return "";
      try {
        const parsed = new URL(safeUrl);
        const match = parsed.pathname.match(/\/(?:embed\/)?track\/([A-Za-z0-9_-]+)(?:\/|$)/i);
        return match?.[1] ? `spotify:track:${match[1]}` : "";
      } catch {
        return "";
      }
    }
    function buildSpotifyEmbedUrlFromUrl(rawUrl) {
      const safeUrl = sanitizeUrl(rawUrl);
      if (!safeUrl) return "";
      try {
        const parsed = new URL(safeUrl);
        const match = parsed.pathname.match(/\/(?:embed\/)?track\/([A-Za-z0-9_-]+)(?:\/|$)/i);
        return match?.[1] ? `https://open.spotify.com/embed/track/${match[1]}?utm_source=generator` : "";
      } catch {
        return "";
      }
    }
    function resolveTrackDetailsSpotifyUri(spotify) {
      return firstNonEmpty(
        buildSpotifyTrackUriFromUrl(spotify?.embedUrl),
        buildSpotifyTrackUriFromUrl(spotify?.openUrl)
      );
    }
    function ensureSpotifyIframeApi() {
      if (window.__internetAngelSpotifyIframeApi?.createController) {
        return Promise.resolve(window.__internetAngelSpotifyIframeApi);
      }
      if (spotifyIframeApiPromise) {
        return spotifyIframeApiPromise;
      }
      spotifyIframeApiPromise = new Promise((resolve, reject) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          spotifyIframeApiPromise = null;
          reject(new Error("Spotify iFrame API timed out"));
        }, 15_000);
        const finish = (api) => {
          if (settled || !api?.createController) return;
          settled = true;
          window.clearTimeout(timeoutId);
          window.__internetAngelSpotifyIframeApi = api;
          resolve(api);
        };
        const fail = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          spotifyIframeApiPromise = null;
          reject(new Error("Spotify iFrame API failed to load"));
        };
        const previousReady = typeof window.onSpotifyIframeApiReady === "function" ? window.onSpotifyIframeApiReady : null;
        window.onSpotifyIframeApiReady = (api) => {
          try {
            previousReady?.(api);
          } catch {
          }
          finish(api);
        };
        const existingScript = document.querySelector("script[data-spotify-iframe-api]");
        if (existingScript instanceof HTMLScriptElement) {
          existingScript.addEventListener("error", fail, { once: true });
        } else {
          const script = document.createElement("script");
          script.src = "https://open.spotify.com/embed/iframe-api/v1";
          script.async = true;
          script.dataset.spotifyIframeApi = "true";
          script.addEventListener("error", fail, { once: true });
          document.body.appendChild(script);
        }
        if (window.__internetAngelSpotifyIframeApi?.createController) {
          finish(window.__internetAngelSpotifyIframeApi);
        }
      });
      return spotifyIframeApiPromise;
    }
    function getLastFmTrackPanelCurrentScene() {
      if (!(lastFmTrackPanelContent instanceof HTMLElement)) return null;
      const currentScene = lastFmTrackPanelContent.querySelector('.lastfm-track-panel-scene[data-panel-scene-state="current"]');
      return currentScene instanceof HTMLElement ? currentScene : null;
    }
    function getTrackPreviewPlayer() {
      const currentScene = getLastFmTrackPanelCurrentScene();
      if (!(currentScene instanceof HTMLElement)) return null;
      const currentLayer = getLastFmTrackPanelSceneCurrentLayer(currentScene);
      const player = currentLayer instanceof HTMLElement
        ? currentLayer.querySelector("[data-track-preview-player]")
        : currentScene.querySelector("[data-track-preview-player]");
      return player instanceof HTMLElement ? player : null;
    }
    function getSpotifyEmbedTarget() {
      const currentScene = getLastFmTrackPanelCurrentScene();
      if (!(currentScene instanceof HTMLElement)) return null;
      const nextLayer = getLastFmTrackPanelSceneNextLayer(currentScene);
      if (nextLayer instanceof HTMLElement && ["loading", "morphing"].includes(currentScene.dataset.panelScenePhase || "")) {
        const nextTarget = nextLayer.querySelector("[data-spotify-track-embed-target]");
        if (nextTarget instanceof HTMLElement) {
          return nextTarget;
        }
      }
      const currentLayer = getLastFmTrackPanelSceneCurrentLayer(currentScene);
      const target = currentLayer instanceof HTMLElement
        ? currentLayer.querySelector("[data-spotify-track-embed-target]")
        : currentScene.querySelector("[data-spotify-track-embed-target]");
      return target instanceof HTMLElement ? target : null;
    }
    function queueTrackPreviewUiSync() {
      if (lastFmTrackPreviewSyncQueued) return;
      lastFmTrackPreviewSyncQueued = true;
      window.requestAnimationFrame(() => {
        lastFmTrackPreviewSyncQueued = false;
        syncTrackPreviewUi();
      });
    }
    function syncTrackPreviewUi() {
      const player = getTrackPreviewPlayer();
      if (!(player instanceof HTMLElement)) return;
      const audio = lastFmTrackPreviewAudio instanceof HTMLAudioElement ? lastFmTrackPreviewAudio : null;
      const sourceUrl = sanitizeUrl(player.getAttribute("data-track-preview-url"));
      const activeSource = sanitizeUrl(audio?.currentSrc || audio?.src);
      const isBoundToPlayer = Boolean(audio && sourceUrl && activeSource === sourceUrl);
      const isPlaying = Boolean(isBoundToPlayer && !audio.paused && !audio.ended);
      const currentTime = isBoundToPlayer && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      const duration = isBoundToPlayer && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
      const progress = duration > 0 ? clamp2(currentTime / duration, 0, 1) : 0;
      player.classList.toggle("is-playing", isPlaying);
      player.dataset.trackPreviewState = isPlaying ? "playing" : "paused";
      const toggleButton = player.querySelector("[data-track-preview-toggle]");
      if (toggleButton instanceof HTMLButtonElement) {
        toggleButton.setAttribute("aria-label", `${isPlaying ? "Pause" : "Play"} Spotify preview`);
        toggleButton.disabled = !sourceUrl;
      }
      const toggleIcon = player.querySelector("[data-track-preview-toggle-icon]");
      if (toggleIcon instanceof HTMLElement) {
        toggleIcon.textContent = isPlaying ? "II" : "▶";
      }
      const progressFill = player.querySelector("[data-track-preview-progress]");
      if (progressFill instanceof HTMLElement) {
        progressFill.style.transform = `scaleX(${progress.toFixed(4)})`;
      }
      const timeLabel = player.querySelector("[data-track-preview-time]");
      if (timeLabel instanceof HTMLElement) {
        timeLabel.textContent = `${formatAudioTime(currentTime)} / ${formatAudioTime(duration)}`;
      }
      const volumeSlider = player.querySelector("[data-track-preview-volume]");
      if (volumeSlider instanceof HTMLInputElement) {
        const targetVolume = audio ? clamp2(audio.volume, 0, 1) : 0.20;
        volumeSlider.value = targetVolume.toFixed(2);
        player.dataset.trackPreviewVolumeValue = targetVolume.toFixed(2);
      }
    }
    function pauseShuffleForTrackPreview() {
      if (lastFmTrackPreviewPausedShuffle) return;
      lastFmTrackPreviewPausedShuffle = Boolean(shufflePlayerController?.pauseForExternalAudio?.());
    }
    async function resumeShuffleAfterTrackPreview() {
      if (!lastFmTrackPreviewPausedShuffle) return;
      lastFmTrackPreviewPausedShuffle = false;
      setInteractionSfxExternalAudioActive(false);
      try {
        await shufflePlayerController?.resumeAfterExternalAudio?.();
      } catch {
      }
    }
    function ensureTrackPreviewAudio() {
      if (lastFmTrackPreviewAudio instanceof HTMLAudioElement) {
        return lastFmTrackPreviewAudio;
      }
      const audio = new Audio();
      audio.preload = "metadata";
      audio.crossOrigin = "anonymous";
      audio.playsInline = true;
      audio.volume = 0.20;
      audio.addEventListener("loadedmetadata", queueTrackPreviewUiSync);
      audio.addEventListener("durationchange", queueTrackPreviewUiSync);
      audio.addEventListener("timeupdate", queueTrackPreviewUiSync);
      audio.addEventListener("volumechange", queueTrackPreviewUiSync);
      audio.addEventListener("play", queueTrackPreviewUiSync);
      audio.addEventListener("pause", () => {
        queueTrackPreviewUiSync();
        if (!lastFmTrackPreviewSuppressAutoResume && !audio.ended) {
          void resumeShuffleAfterTrackPreview();
        }
      });
      audio.addEventListener("ended", () => {
        queueTrackPreviewUiSync();
        if (!lastFmTrackPreviewSuppressAutoResume) {
          void resumeShuffleAfterTrackPreview();
        }
      });
      audio.addEventListener("emptied", queueTrackPreviewUiSync);
      audio.addEventListener("error", () => {
        queueTrackPreviewUiSync();
        if (!lastFmTrackPreviewSuppressAutoResume) {
          void resumeShuffleAfterTrackPreview();
        }
      });
      lastFmTrackPreviewAudio = audio;
      return audio;
    }
    async function stopTrackPreview({ resumeShuffle = true, resetSource = false } = {}) {
      const audio = lastFmTrackPreviewAudio instanceof HTMLAudioElement ? lastFmTrackPreviewAudio : null;
      if (audio) {
        lastFmTrackPreviewSuppressAutoResume = true;
        audio.pause();
        if (resetSource) {
          audio.removeAttribute("src");
          audio.load();
        }
        lastFmTrackPreviewSuppressAutoResume = false;
      }
      setInteractionSfxExternalAudioActive(false);
      if (resumeShuffle) {
        await resumeShuffleAfterTrackPreview();
      }
      queueTrackPreviewUiSync();
    }
    async function playTrackPreview(sourceUrl) {
      const safeSourceUrl = sanitizeUrl(sourceUrl);
      if (!safeSourceUrl) return;
      const audio = ensureTrackPreviewAudio();
      const currentSource = sanitizeUrl(audio.currentSrc || audio.src);
      if (currentSource !== safeSourceUrl) {
        lastFmTrackPreviewSuppressAutoResume = true;
        audio.pause();
        audio.src = safeSourceUrl;
        audio.load();
        lastFmTrackPreviewSuppressAutoResume = false;
      }
      pauseShuffleForTrackPreview();
      try {
        await audio.play();
        setInteractionSfxExternalAudioActive(true);
      } catch {
        setInteractionSfxExternalAudioActive(false);
        await resumeShuffleAfterTrackPreview();
      }
      queueTrackPreviewUiSync();
    }
    async function toggleTrackPreview(player) {
      const previewPlayer = player instanceof HTMLElement ? player : getTrackPreviewPlayer();
      if (!(previewPlayer instanceof HTMLElement)) return;
      const sourceUrl = sanitizeUrl(previewPlayer.getAttribute("data-track-preview-url"));
      if (!sourceUrl) return;
      const audio = ensureTrackPreviewAudio();
      const currentSource = sanitizeUrl(audio.currentSrc || audio.src);
      const isSameSource = currentSource === sourceUrl;
      if (isSameSource && !audio.paused && !audio.ended) {
        await stopTrackPreview({ resumeShuffle: true, resetSource: false });
        return;
      }
      await playTrackPreview(sourceUrl);
    }
    function setTrackPreviewVolume(value) {
      const audio = ensureTrackPreviewAudio();
      const numericValue = Number(value);
      audio.volume = clamp2(Number.isFinite(numericValue) ? numericValue : 0.20, 0, 1);
      queueTrackPreviewUiSync();
    }
    function hydrateTrackPreview(detail) {
      const previewUrl = sanitizeUrl(detail?.spotify?.previewUrl);
      if (!previewUrl) {
        void stopTrackPreview({ resumeShuffle: true, resetSource: true });
        return;
      }
      const audio = ensureTrackPreviewAudio();
      const currentSource = sanitizeUrl(audio.currentSrc || audio.src);
      if (currentSource !== previewUrl) {
        lastFmTrackPreviewSuppressAutoResume = true;
        audio.pause();
        audio.src = previewUrl;
        audio.load();
        lastFmTrackPreviewSuppressAutoResume = false;
      }
      queueTrackPreviewUiSync();
    }
    async function destroySpotifyEmbedController({ resumeShuffle = true } = {}) {
      const controller = lastFmSpotifyEmbedController;
      lastFmSpotifyEmbedController = null;
      lastFmSpotifyEmbedLoadToken += 1;
      setInteractionSfxExternalAudioActive(false);
      if (controller?.pause instanceof Function) {
        try {
          controller.pause();
        } catch {
        }
      }
      if (controller?.destroy instanceof Function) {
        try {
          controller.destroy();
        } catch {
        }
      }
      if (resumeShuffle) {
        await resumeShuffleAfterTrackPreview();
      }
    }
    function mountFallbackSpotifyEmbed(spotify, embedTarget, trackTitle) {
      const safeEmbedUrl = sanitizeUrl(firstNonEmpty(
        spotify?.embedUrl,
        buildSpotifyEmbedUrlFromUrl(spotify?.openUrl)
      ));
      const embedSlot = embedTarget instanceof HTMLElement ? embedTarget.closest(".lastfm-track-panel-spotify-slot") : null;
      if (!(embedTarget instanceof HTMLElement)) return;
      if (!safeEmbedUrl) {
        embedSlot?.classList.add("is-disabled");
        embedTarget.innerHTML = renderLastFmTrackPanelSpotifyDisabled();
        scheduleLastFmTrackPanelFit();
        return false;
      }
      embedSlot?.classList.remove("is-disabled");
      embedTarget.innerHTML = `
        <iframe
          class="lastfm-track-panel-spotify-embed"
          src="${escapeHtml(safeEmbedUrl)}"
          title="Spotify preview for ${escapeHtml(trackTitle || "track")}"
          loading="lazy"
          allow="autoplay; clipboard-write; fullscreen; picture-in-picture"
        ></iframe>
      `;
      scheduleLastFmTrackPanelFit();
      return true;
    }
    async function mountSpotifyEmbedController(detail, cacheKey) {
      const spotify = detail?.spotify || {};
      const embedTarget = getSpotifyEmbedTarget();
      if (String(spotify.matchStatus || "").trim().toLowerCase() !== "matched" || !(embedTarget instanceof HTMLElement)) {
        await destroySpotifyEmbedController({ resumeShuffle: true });
        return;
      }
      const spotifyUri = resolveSpotifyTrackAppUrl(spotify);
      const fallbackEmbedUrl = sanitizeUrl(firstNonEmpty(
        spotify?.embedUrl,
        buildSpotifyEmbedUrlFromUrl(spotify?.openUrl)
      ));
      if (!spotifyUri && !fallbackEmbedUrl) {
        await destroySpotifyEmbedController({ resumeShuffle: true });
        return;
      }
      if (!spotifyUri) {
        await destroySpotifyEmbedController({ resumeShuffle: true });
        mountFallbackSpotifyEmbed(spotify, embedTarget, detail?.track?.title || spotify.title);
        return;
      }
      embedTarget.closest(".lastfm-track-panel-spotify-slot")?.classList.remove("is-disabled");
      await destroySpotifyEmbedController({ resumeShuffle: true });
      const loadToken = ++lastFmSpotifyEmbedLoadToken;
      try {
        const iframeApi = await ensureSpotifyIframeApi();
        if (disposed || lastFmTrackPanelActiveKey !== cacheKey || !(embedTarget instanceof HTMLElement) || !embedTarget.isConnected) {
          return;
        }
        embedTarget.innerHTML = "";
        await new Promise((resolve, reject) => {
          let settled = false;
          const timeoutId = window.setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error("Spotify embed controller timed out"));
          }, SPOTIFY_EMBED_CONTROLLER_TIMEOUT_MS);
          try {
            iframeApi.createController(embedTarget, {
              uri: spotifyUri,
              width: "100%",
              height: 80
            }, (controller) => {
              if (settled) {
                try {
                  controller?.destroy?.();
                } catch {
                }
                return;
              }
              settled = true;
              window.clearTimeout(timeoutId);
              if (loadToken !== lastFmSpotifyEmbedLoadToken) {
                try {
                  controller?.destroy?.();
                } catch {
                }
                resolve();
                return;
              }
              lastFmSpotifyEmbedController = controller;
              controller?.addListener?.("playback_started", () => {
                if (loadToken !== lastFmSpotifyEmbedLoadToken) return;
                pauseShuffleForTrackPreview();
                setInteractionSfxExternalAudioActive(true);
              });
              controller?.addListener?.("playback_update", (event) => {
                if (loadToken !== lastFmSpotifyEmbedLoadToken) return;
                if (Boolean(event?.data?.isPaused)) {
                  setInteractionSfxExternalAudioActive(false);
                  void resumeShuffleAfterTrackPreview();
                  return;
                }
                pauseShuffleForTrackPreview();
                setInteractionSfxExternalAudioActive(true);
              });
              scheduleLastFmTrackPanelFit();
              resolve();
            });
          } catch (error) {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            reject(error);
          }
        });
      } catch {
        if (loadToken !== lastFmSpotifyEmbedLoadToken) return;
        mountFallbackSpotifyEmbed(spotify, embedTarget, detail?.track?.title || spotify.title);
      }
    }
    function getTrackPanelFocusableElements() {
      const currentScene = getLastFmTrackPanelCurrentScene();
      if (!(currentScene instanceof HTMLElement)) return [];
      const currentLayer = getLastFmTrackPanelSceneCurrentLayer(currentScene);
      const scope = currentLayer instanceof HTMLElement ? currentLayer : currentScene;
      return Array.from(scope.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], iframe, [tabindex]:not([tabindex="-1"])')).filter((element) => element instanceof HTMLElement);
    }
    function applyLastFmTrackPanelFit() {
      const currentScene = getLastFmTrackPanelCurrentScene();
      if (!(currentScene instanceof HTMLElement)) return;
      const panelWindow = getLastFmTrackPanelSceneLayerWindow(currentScene, "current");
      if (!(panelWindow instanceof HTMLElement)) return;
      delete panelWindow.dataset.panelDensity;
      panelWindow.getBoundingClientRect();
      const needsMoreRoom = () => panelWindow.scrollHeight - panelWindow.clientHeight > 2 || panelWindow.scrollWidth - panelWindow.clientWidth > 2;
      if (!needsMoreRoom()) return;
      panelWindow.dataset.panelDensity = "dense";
      panelWindow.getBoundingClientRect();
      if (!needsMoreRoom()) return;
      panelWindow.dataset.panelDensity = "ultra";
    }
    function scheduleLastFmTrackPanelFit() {
      if (lastFmTrackPanelFitRaf) {
        cancelAnimationFrame(lastFmTrackPanelFitRaf);
      }
      lastFmTrackPanelFitRaf = requestAnimationFrame(() => {
        lastFmTrackPanelFitRaf = 0;
        applyLastFmTrackPanelFit();
        requestAnimationFrame(() => {
          applyLastFmTrackPanelFit();
        });
      });
    }
    function clearLastFmTrackPanelSceneTimer() {
      if (!lastFmTrackPanelSceneTimer) return;
      window.clearTimeout(lastFmTrackPanelSceneTimer);
      lastFmTrackPanelSceneTimer = 0;
    }
    function clearLastFmTrackPanelSceneSettleTimer() {
      if (!lastFmTrackPanelSceneSettleTimer) return;
      window.clearTimeout(lastFmTrackPanelSceneSettleTimer);
      lastFmTrackPanelSceneSettleTimer = 0;
    }
    function getLastFmTrackPanelSceneRotator(scene) {
      if (!(scene instanceof HTMLElement)) return null;
      const rotator = scene.querySelector("[data-lastfm-track-panel-scene-rotator]");
      return rotator instanceof HTMLElement ? rotator : null;
    }
    function getLastFmTrackPanelSceneStack(scene) {
      if (!(scene instanceof HTMLElement)) return null;
      const stack = scene.querySelector("[data-lastfm-track-panel-scene-stack]");
      return stack instanceof HTMLElement ? stack : null;
    }
    function getLastFmTrackPanelSceneFront(scene) {
      if (!(scene instanceof HTMLElement)) return null;
      const face = scene.querySelector('[data-lastfm-track-panel-scene-face="front"]');
      return face instanceof HTMLElement ? face : null;
    }
    function getLastFmTrackPanelSceneLayer(scene, name) {
      if (!(scene instanceof HTMLElement)) return null;
      const layer = scene.querySelector(`[data-lastfm-track-panel-scene-layer="${name}"]`);
      return layer instanceof HTMLElement ? layer : null;
    }
    function getLastFmTrackPanelSceneCurrentLayer(scene) {
      return getLastFmTrackPanelSceneLayer(scene, "current");
    }
    function getLastFmTrackPanelSceneNextLayer(scene) {
      return getLastFmTrackPanelSceneLayer(scene, "next");
    }
    function getLastFmTrackPanelSceneLayerWindow(scene, layerName = "current") {
      const layer = getLastFmTrackPanelSceneLayer(scene, layerName);
      if (!(layer instanceof HTMLElement)) return null;
      const panelWindow = layer.querySelector(".lastfm-track-panel-window");
      return panelWindow instanceof HTMLElement ? panelWindow : null;
    }
    function setLastFmTrackPanelScenePhase(scene, phase = "stable") {
      if (!(scene instanceof HTMLElement)) return;
      scene.dataset.panelScenePhase = firstNonEmpty(phase, "stable");
    }
    function getLastFmTrackPanelSceneExplosionImage(scene) {
      if (!(scene instanceof HTMLElement)) return null;
      const image = scene.querySelector("[data-lastfm-track-panel-scene-explosion-image]");
      return image instanceof HTMLImageElement ? image : null;
    }
    function getLastFmTrackPanelExplosionOverlay() {
      if (!(lastFmTrackPanelRoot instanceof HTMLElement)) return null;
      const overlay = lastFmTrackPanelRoot.querySelector("[data-lastfm-track-panel-explosion-overlay]");
      return overlay instanceof HTMLElement ? overlay : null;
    }
    function getLastFmTrackPanelExplosionOverlayImage() {
      const overlay = getLastFmTrackPanelExplosionOverlay();
      if (!(overlay instanceof HTMLElement)) return null;
      const image = overlay.querySelector("[data-lastfm-track-panel-explosion-overlay-image]");
      return image instanceof HTMLImageElement ? image : null;
    }
    function getLastFmTrackPanelSceneRuntime(scene) {
      if (!(scene instanceof HTMLElement)) return null;
      let runtime = lastFmTrackPanelSceneRuntime.get(scene);
      if (runtime) return runtime;
      runtime = {
        phase: "idle",
        introTimer: 0,
        hungTimer: 0,
        explosionTimer: 0,
        explosionHideTimer: 0,
        morphFallbackTimer: 0,
        morphHoldTimer: 0,
        morphCompleteTimer: 0,
        morphNonce: 0,
        morphStartedAt: 0,
        explosionAudio: null,
        explosionNonce: 0
      };
      lastFmTrackPanelSceneRuntime.set(scene, runtime);
      return runtime;
    }
    function getLastFmTrackPanelSceneDebugConfig() {
      const debug = window.__internetAngelLastFmPanelSceneDebug || {};
      const readPositiveNumber = (value, fallback) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
      };
      const readPositiveInteger = (value, fallback) => {
        const parsed = Math.floor(Number(value));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
      };
      return {
        loadingIntroMs: readPositiveNumber(debug.loadingIntroMs, LASTFM_PANEL_SCENE_LOADING_INTRO_MS),
        loadingSpinMs: readPositiveNumber(debug.loadingSpinMs, LASTFM_PANEL_SCENE_LOADING_SPIN_MS),
        hungSpinMs: readPositiveNumber(debug.hungSpinMs, LASTFM_PANEL_SCENE_HUNG_SPIN_MS),
        hungAfterSpins: readPositiveInteger(debug.hungAfterSpins, LASTFM_PANEL_SCENE_HUNG_AFTER_SPINS),
        explosionAfterHungSpins: readPositiveInteger(debug.explosionAfterHungSpins, LASTFM_PANEL_SCENE_EXPLOSION_AFTER_HUNG_SPINS),
        explosionOverlayMs: readPositiveNumber(debug.explosionOverlayMs, LASTFM_PANEL_SCENE_EXPLOSION_OVERLAY_MS),
        muteExplosionAudio: Boolean(debug.muteExplosionAudio)
      };
    }
    function applyLastFmTrackPanelSceneTiming(scene) {
      if (!(scene instanceof HTMLElement)) return;
      const timing = getLastFmTrackPanelSceneDebugConfig();
      scene.style.setProperty("--lastfm-track-panel-scene-loading-intro-ms", `${timing.loadingIntroMs}ms`);
      scene.style.setProperty("--lastfm-track-panel-scene-loading-spin-ms", `${timing.loadingSpinMs}ms`);
      scene.style.setProperty("--lastfm-track-panel-scene-hung-spin-ms", `${timing.hungSpinMs}ms`);
    }
    function clearLastFmTrackPanelSceneEscalationTimers(scene) {
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return;
      if (runtime.introTimer) {
        window.clearTimeout(runtime.introTimer);
        runtime.introTimer = 0;
      }
      if (runtime.hungTimer) {
        window.clearTimeout(runtime.hungTimer);
        runtime.hungTimer = 0;
      }
      if (runtime.explosionTimer) {
        window.clearTimeout(runtime.explosionTimer);
        runtime.explosionTimer = 0;
      }
      if (runtime.explosionHideTimer) {
        window.clearTimeout(runtime.explosionHideTimer);
        runtime.explosionHideTimer = 0;
      }
      if (runtime.morphFallbackTimer) {
        window.clearTimeout(runtime.morphFallbackTimer);
        runtime.morphFallbackTimer = 0;
      }
      if (runtime.morphHoldTimer) {
        window.clearTimeout(runtime.morphHoldTimer);
        runtime.morphHoldTimer = 0;
      }
      if (runtime.morphCompleteTimer) {
        window.clearTimeout(runtime.morphCompleteTimer);
        runtime.morphCompleteTimer = 0;
      }
    }
    function stopLastFmTrackPanelSceneExplosion(scene, { resetImage = false } = {}) {
      if (!(scene instanceof HTMLElement)) return;
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return;
      if (runtime.explosionHideTimer) {
        window.clearTimeout(runtime.explosionHideTimer);
        runtime.explosionHideTimer = 0;
      }
      scene.dataset.panelSceneExplosionState = "idle";
      if (lastFmTrackPanelRoot instanceof HTMLElement) {
        lastFmTrackPanelRoot.dataset.panelExplosionState = "idle";
      }
      const explosionImage = getLastFmTrackPanelExplosionOverlayImage();
      if (resetImage) {
        if (explosionImage instanceof HTMLImageElement) {
          explosionImage.removeAttribute("src");
        }
        const sceneExplosionImage = getLastFmTrackPanelSceneExplosionImage(scene);
        if (sceneExplosionImage instanceof HTMLImageElement) {
          sceneExplosionImage.removeAttribute("src");
        }
      }
      const explosionAudio = runtime.explosionAudio;
      if (explosionAudio instanceof HTMLAudioElement) {
        try {
          explosionAudio.pause();
          explosionAudio.currentTime = 0;
        } catch {
        }
      }
      runtime.explosionAudio = null;
      if (runtime.phase === "exploding") {
        runtime.phase = "hung";
      }
    }
    function finalizeLastFmTrackPanelSceneExplosion(scene) {
      if (!(scene instanceof HTMLElement)) return;
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (runtime?.explosionHideTimer) {
        window.clearTimeout(runtime.explosionHideTimer);
        runtime.explosionHideTimer = 0;
      }
      if (runtime) {
        runtime.phase = "idle";
      }
      if (scene.isConnected) {
        scene.dataset.panelSceneExplosionState = "complete";
      }
      if (Array.isArray(window.__internetAngelLastFmPanelExplosionLog)) {
        window.__internetAngelLastFmPanelExplosionLog.push({
          timestamp: Date.now(),
          panelType: scene.dataset.panelType || "",
          source: "lastfmPanelLoadingExplosionClose"
        });
        if (window.__internetAngelLastFmPanelExplosionLog.length > 20) {
          window.__internetAngelLastFmPanelExplosionLog.splice(0, window.__internetAngelLastFmPanelExplosionLog.length - 20);
        }
      }
      hideLastFmTrackDetails("silent");
    }
    function teardownLastFmTrackPanelScene(scene) {
      if (!(scene instanceof HTMLElement)) return;
      clearLastFmTrackPanelSceneEscalationTimers(scene);
      stopLastFmTrackPanelSceneExplosion(scene, { resetImage: true });
      lastFmTrackPanelSceneRuntime.delete(scene);
    }
    function triggerLastFmTrackPanelSceneExplosion(scene) {
      if (!(scene instanceof HTMLElement) || !scene.isConnected) return;
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return;
      const timing = getLastFmTrackPanelSceneDebugConfig();
      runtime.explosionTimer = 0;
      if (scene.dataset.panelSceneLoading !== "true" || scene.dataset.panelSceneSpin !== "hung") return;
      runtime.phase = "exploding";
      scene.dataset.panelSceneHangState = "hung";
      scene.dataset.panelSceneExplosionState = "active";
      if (lastFmTrackPanelRoot instanceof HTMLElement) {
        lastFmTrackPanelRoot.dataset.panelExplosionState = "active";
      }
      const explosionImage = getLastFmTrackPanelExplosionOverlayImage();
      if (explosionImage instanceof HTMLImageElement) {
        runtime.explosionNonce += 1;
        explosionImage.src = `${LASTFM_PANEL_SCENE_EXPLOSION_GIF_URL}?scene-explosion=${runtime.explosionNonce}`;
      }
      window.__internetAngelLastFmPanelExplosionLog = Array.isArray(window.__internetAngelLastFmPanelExplosionLog)
        ? window.__internetAngelLastFmPanelExplosionLog
        : [];
      const explosionLogEntry = {
        timestamp: Date.now(),
        panelType: scene.dataset.panelType || "",
        source: "lastfmPanelLoadingExplosion"
      };
      window.__internetAngelLastFmPanelExplosionLog.push(explosionLogEntry);
      if (window.__internetAngelLastFmPanelExplosionLog.length > 20) {
        window.__internetAngelLastFmPanelExplosionLog.splice(0, window.__internetAngelLastFmPanelExplosionLog.length - 20);
      }
      window.dispatchEvent(new CustomEvent("internet-angel:lastfm-panel-explosion", {
        detail: explosionLogEntry
      }));
      if (!timing.muteExplosionAudio) {
        try {
          const explosionAudio = new Audio(LASTFM_PANEL_SCENE_EXPLOSION_SOUND_URL);
          explosionAudio.preload = "auto";
          explosionAudio.volume = 0.36;
          runtime.explosionAudio = explosionAudio;
          const playPromise = explosionAudio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => {});
          }
        } catch {
        }
      }
      runtime.explosionHideTimer = window.setTimeout(() => {
        finalizeLastFmTrackPanelSceneExplosion(scene);
      }, timing.explosionOverlayMs);
    }
    function syncLastFmTrackPanelSceneEscalation(scene) {
      if (!(scene instanceof HTMLElement)) return;
      applyLastFmTrackPanelSceneTiming(scene);
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return;
      if (runtime.phase === "exploding") {
        scene.dataset.panelSceneHangState = "hung";
        scene.dataset.panelSceneExplosionState = "active";
        if (lastFmTrackPanelRoot instanceof HTMLElement) {
          lastFmTrackPanelRoot.dataset.panelExplosionState = "active";
        }
        return;
      }
      if (scene.dataset.panelSceneLoading !== "true") {
        clearLastFmTrackPanelSceneEscalationTimers(scene);
        stopLastFmTrackPanelSceneExplosion(scene, { resetImage: true });
        runtime.phase = "idle";
        scene.dataset.panelSceneHangState = "idle";
        scene.dataset.panelSceneExplosionState = "idle";
        return;
      }
      const sceneSpin = scene.dataset.panelSceneSpin || "idle";
      if (sceneSpin === "loading-intro") {
        if (runtime.phase === "loading-intro") return;
        clearLastFmTrackPanelSceneEscalationTimers(scene);
        stopLastFmTrackPanelSceneExplosion(scene, { resetImage: true });
        runtime.phase = "loading-intro";
        scene.dataset.panelSceneHangState = "loading";
        scene.dataset.panelSceneExplosionState = "idle";
        const timing = getLastFmTrackPanelSceneDebugConfig();
        runtime.introTimer = window.setTimeout(() => {
          runtime.introTimer = 0;
          if (!(scene.isConnected && scene.dataset.panelSceneLoading === "true" && scene.dataset.panelSceneSpin === "loading-intro")) return;
          scene.dataset.panelSceneSpin = "loading";
          syncLastFmTrackPanelSceneEscalation(scene);
        }, timing.loadingIntroMs);
        return;
      }
      if (sceneSpin === "loading") {
        if (runtime.phase === "loading") return;
        clearLastFmTrackPanelSceneEscalationTimers(scene);
        stopLastFmTrackPanelSceneExplosion(scene, { resetImage: true });
        runtime.phase = "loading";
        scene.dataset.panelSceneHangState = "loading";
        scene.dataset.panelSceneExplosionState = "idle";
        const timing = getLastFmTrackPanelSceneDebugConfig();
        runtime.hungTimer = window.setTimeout(() => {
          runtime.hungTimer = 0;
          if (!(scene.isConnected && scene.dataset.panelSceneLoading === "true" && scene.dataset.panelSceneSpin === "loading")) return;
          scene.dataset.panelSceneSpin = "hung";
          syncLastFmTrackPanelSceneEscalation(scene);
        }, timing.loadingSpinMs * timing.hungAfterSpins);
        return;
      }
      if (sceneSpin === "hung") {
        if (runtime.phase === "hung" || runtime.phase === "exploding") return;
        clearLastFmTrackPanelSceneEscalationTimers(scene);
        runtime.phase = "hung";
        scene.dataset.panelSceneHangState = "hung";
        scene.dataset.panelSceneExplosionState = "idle";
        const timing = getLastFmTrackPanelSceneDebugConfig();
        runtime.explosionTimer = window.setTimeout(() => {
          triggerLastFmTrackPanelSceneExplosion(scene);
        }, timing.hungSpinMs * timing.explosionAfterHungSpins);
        return;
      }
      clearLastFmTrackPanelSceneEscalationTimers(scene);
      stopLastFmTrackPanelSceneExplosion(scene, { resetImage: true });
      runtime.phase = "idle";
      scene.dataset.panelSceneHangState = scene.dataset.panelSceneLoading === "true" ? "loading" : "idle";
      scene.dataset.panelSceneExplosionState = "idle";
    }
    function renderLastFmTrackPanelSceneShell(markup, options = {}) {
      return `
        <div class="lastfm-track-panel-scene-explosion" data-lastfm-track-panel-scene-explosion aria-hidden="true">
          <img class="lastfm-track-panel-scene-explosion-image" data-lastfm-track-panel-scene-explosion-image alt="" />
        </div>
        <div class="lastfm-track-panel-scene-rotator" data-lastfm-track-panel-scene-rotator>
          <div class="lastfm-track-panel-scene-face lastfm-track-panel-scene-face--front" data-lastfm-track-panel-scene-face="front">
            <div class="lastfm-track-panel-scene-stack" data-lastfm-track-panel-scene-stack>
              <div class="lastfm-track-panel-scene-layer lastfm-track-panel-scene-layer--current" data-lastfm-track-panel-scene-layer="current">
                ${markup}
              </div>
              <div class="lastfm-track-panel-scene-layer lastfm-track-panel-scene-layer--next" data-lastfm-track-panel-scene-layer="next" aria-hidden="true"></div>
              <div class="lastfm-track-panel-scene-veil" data-lastfm-track-panel-scene-veil aria-hidden="true">
                <div class="lastfm-track-panel-scene-veil-wash"></div>
              </div>
            </div>
          </div>
          <div class="lastfm-track-panel-scene-face lastfm-track-panel-scene-face--back" data-lastfm-track-panel-scene-face="back" aria-hidden="true">
            <div class="lastfm-track-panel-scene-back-card" aria-hidden="true">
              <span class="lastfm-track-panel-scene-back-cat">
                <span class="lastfm-track-panel-scene-back-cat-face">(=^･ω･^=)</span>
                <span class="lastfm-track-panel-scene-back-cat-paw">ﾉ</span>
              </span>
              <div class="lastfm-track-panel-scene-back-hung">
                <span class="lastfm-track-panel-scene-back-sad-cat">
                  <span class="lastfm-track-panel-scene-back-sad-cat-text">ฅ^•</span>
                  <span class="lastfm-track-panel-scene-back-sad-cat-mouth">︵</span>
                  <span class="lastfm-track-panel-scene-back-sad-cat-text">•^ฅ</span>
                </span>
                <p class="lastfm-track-panel-scene-back-copy">Loading has hung due to an api issue probably :c</p>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    function createLastFmTrackPanelScene(markup, options = {}) {
      const scene = document.createElement("div");
      scene.className = "lastfm-track-panel-scene";
      scene.dataset.panelSceneState = firstNonEmpty(options?.state, "current");
      scene.dataset.panelSceneSpin = "idle";
      scene.dataset.panelSceneLoading = options?.loading ? "true" : "false";
      scene.dataset.panelSceneHangState = options?.loading ? "loading" : "idle";
      scene.dataset.panelSceneExplosionState = "idle";
      scene.dataset.panelScenePhase = "stable";
      const panelType = firstNonEmpty(options?.panelType, "");
      if (panelType) {
        scene.dataset.panelType = panelType;
      }
      scene.innerHTML = renderLastFmTrackPanelSceneShell(markup, options);
      applyLastFmTrackPanelSceneTiming(scene);
      syncLastFmTrackPanelSceneEscalation(scene);
      return scene;
    }
    function syncLastFmTrackPanelSceneChrome(scene, options = {}) {
      if (!(scene instanceof HTMLElement)) return;
      const panelType = firstNonEmpty(options?.panelType, scene.dataset.panelType || "");
      if (panelType) {
        scene.dataset.panelType = panelType;
      }
      if (Object.prototype.hasOwnProperty.call(options, "loading")) {
        scene.dataset.panelSceneLoading = options.loading ? "true" : "false";
      }
      syncLastFmTrackPanelSceneEscalation(scene);
    }
    function lockLastFmTrackPanelSceneHeight(scene, height) {
      const stack = getLastFmTrackPanelSceneStack(scene);
      if (!(stack instanceof HTMLElement)) return;
      if (!(Number.isFinite(height) && height > 0)) {
        stack.dataset.panelSceneHeightLocked = "false";
        stack.style.removeProperty("height");
        return;
      }
      stack.dataset.panelSceneHeightLocked = "true";
      stack.style.height = `${height}px`;
    }
    function clearLastFmTrackPanelSceneMorph(scene) {
      if (!(scene instanceof HTMLElement)) return;
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return;
      if (runtime.morphFallbackTimer) {
        window.clearTimeout(runtime.morphFallbackTimer);
        runtime.morphFallbackTimer = 0;
      }
      if (runtime.morphHoldTimer) {
        window.clearTimeout(runtime.morphHoldTimer);
        runtime.morphHoldTimer = 0;
      }
      if (runtime.morphCompleteTimer) {
        window.clearTimeout(runtime.morphCompleteTimer);
        runtime.morphCompleteTimer = 0;
      }
      const nextLayer = getLastFmTrackPanelSceneNextLayer(scene);
      if (nextLayer instanceof HTMLElement) {
        nextLayer.innerHTML = "";
      }
      lockLastFmTrackPanelSceneHeight(scene, NaN);
      setLastFmTrackPanelScenePhase(scene, "stable");
    }
    function swapLastFmTrackPanelSceneLayers(scene) {
      const currentLayer = getLastFmTrackPanelSceneCurrentLayer(scene);
      const nextLayer = getLastFmTrackPanelSceneNextLayer(scene);
      if (!(currentLayer instanceof HTMLElement && nextLayer instanceof HTMLElement)) {
        return false;
      }
      currentLayer.classList.remove("lastfm-track-panel-scene-layer--current");
      currentLayer.classList.add("lastfm-track-panel-scene-layer--next");
      currentLayer.setAttribute("data-lastfm-track-panel-scene-layer", "next");
      currentLayer.setAttribute("aria-hidden", "true");
      currentLayer.innerHTML = "";
      nextLayer.classList.remove("lastfm-track-panel-scene-layer--next");
      nextLayer.classList.add("lastfm-track-panel-scene-layer--current");
      nextLayer.setAttribute("data-lastfm-track-panel-scene-layer", "current");
      nextLayer.removeAttribute("aria-hidden");
      return true;
    }
    function isLastFmTrackPanelSceneMorphActive(scene, nonce) {
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return false;
      return scene.isConnected
        && scene.dataset.panelScenePhase === "loading"
        && runtime.morphNonce === nonce;
    }
    function prepareLastFmTrackPanelSceneMorph(scene, skeletonMarkup, options = {}) {
      if (!(scene instanceof HTMLElement)) return 0;
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      const nextLayer = getLastFmTrackPanelSceneNextLayer(scene);
      const currentWindow = getLastFmTrackPanelSceneLayerWindow(scene, "current");
      if (!(runtime && nextLayer instanceof HTMLElement && currentWindow instanceof HTMLElement)) {
        return 0;
      }
      runtime.morphNonce += 1;
      runtime.morphStartedAt = Date.now();
      clearLastFmTrackPanelSceneMorph(scene);
      scene.dataset.panelSceneSpin = "idle";
      syncLastFmTrackPanelSceneChrome(scene, { loading: false });
      nextLayer.innerHTML = skeletonMarkup;
      setLastFmTrackPanelScenePhase(scene, "loading");
      lockLastFmTrackPanelSceneHeight(scene, currentWindow.getBoundingClientRect().height);
      hydrateLastFmTrackPanelScene(scene);
      const timing = getLastFmTrackPanelSceneDebugConfig();
      const fallbackMs = timing.loadingSpinMs * timing.hungAfterSpins;
      const fallbackMarkup = skeletonMarkup;
      const morphNonce = runtime.morphNonce;
      runtime.morphFallbackTimer = window.setTimeout(() => {
        runtime.morphFallbackTimer = 0;
        if (!isLastFmTrackPanelSceneMorphActive(scene, morphNonce)) return;
        clearLastFmTrackPanelSceneMorph(scene);
        setLastFmTrackPanelSceneMarkup(fallbackMarkup, {
          animate: false,
          panelType: firstNonEmpty(options?.panelType, scene.dataset.panelType || ""),
          loading: true
        });
        const fallbackScene = getLastFmTrackPanelCurrentScene();
        if (fallbackScene instanceof HTMLElement) {
          fallbackScene.dataset.panelSceneSpin = "loading-intro";
          syncLastFmTrackPanelSceneEscalation(fallbackScene);
        }
      }, fallbackMs);
      return morphNonce;
    }
    function setLastFmTrackPanelSceneMorphNextMarkup(scene, markup) {
      const nextLayer = getLastFmTrackPanelSceneNextLayer(scene);
      if (!(nextLayer instanceof HTMLElement)) return null;
      nextLayer.innerHTML = markup;
      hydrateLastFmTrackPanelScene(scene);
      return getLastFmTrackPanelSceneLayerWindow(scene, "next");
    }
    async function waitForLastFmTrackPanelSceneMorphHold(scene, nonce) {
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      if (!runtime) return false;
      const elapsed = Date.now() - runtime.morphStartedAt;
      const remaining = Math.max(0, LASTFM_PANEL_MORPH_MIN_HOLD_MS - elapsed);
      if (!remaining) {
        return isLastFmTrackPanelSceneMorphActive(scene, nonce);
      }
      await new Promise((resolve) => {
        runtime.morphHoldTimer = window.setTimeout(() => {
          runtime.morphHoldTimer = 0;
          resolve();
        }, remaining);
      });
      return isLastFmTrackPanelSceneMorphActive(scene, nonce);
    }
    async function finishLastFmTrackPanelSceneMorph(scene, options = {}) {
      if (!(scene instanceof HTMLElement)) return false;
      const runtime = getLastFmTrackPanelSceneRuntime(scene);
      const stack = getLastFmTrackPanelSceneStack(scene);
      const currentLayer = getLastFmTrackPanelSceneCurrentLayer(scene);
      const nextLayer = getLastFmTrackPanelSceneNextLayer(scene);
      const currentWindow = getLastFmTrackPanelSceneLayerWindow(scene, "current");
      const nextWindow = getLastFmTrackPanelSceneLayerWindow(scene, "next");
      const morphNonce = Number(options?.nonce || 0);
      if (!(runtime && stack instanceof HTMLElement && currentLayer instanceof HTMLElement && nextLayer instanceof HTMLElement && currentWindow instanceof HTMLElement && nextWindow instanceof HTMLElement)) {
        return false;
      }
      if (runtime.morphFallbackTimer) {
        window.clearTimeout(runtime.morphFallbackTimer);
        runtime.morphFallbackTimer = 0;
      }
      const holdFinished = await waitForLastFmTrackPanelSceneMorphHold(scene, morphNonce);
      if (!holdFinished) return false;
      const currentHeight = currentWindow.getBoundingClientRect().height || stack.getBoundingClientRect().height;
      const nextHeight = nextWindow.getBoundingClientRect().height || currentHeight;
      lockLastFmTrackPanelSceneHeight(scene, currentHeight);
      setLastFmTrackPanelScenePhase(scene, "morphing");
      if (firstNonEmpty(options?.panelType, "")) {
        scene.dataset.panelType = firstNonEmpty(options?.panelType, scene.dataset.panelType || "");
      }
      requestAnimationFrame(() => {
        if (!(scene.isConnected && stack.isConnected)) return;
        lockLastFmTrackPanelSceneHeight(scene, nextHeight);
      });
      await new Promise((resolve) => {
        runtime.morphCompleteTimer = window.setTimeout(() => {
          runtime.morphCompleteTimer = 0;
          resolve();
        }, Math.max(LASTFM_PANEL_MORPH_CONTENT_MS, LASTFM_PANEL_MORPH_SIZE_MS) + 48);
      });
      if (!(scene.isConnected && currentLayer.isConnected && nextLayer.isConnected)) return false;
      if (!swapLastFmTrackPanelSceneLayers(scene)) {
        currentLayer.replaceChildren(...Array.from(nextLayer.childNodes));
        nextLayer.innerHTML = "";
      }
      clearLastFmTrackPanelSceneMorph(scene);
      scene.dataset.panelSceneLoading = "false";
      scene.dataset.panelSceneSpin = "idle";
      syncLastFmTrackPanelSceneEscalation(scene);
      setLastFmTrackPanelScrollTop();
      scheduleLastFmTrackPanelFit();
      return true;
    }
    function resetLastFmTrackPanelSceneTransform(scene) {
      const rotator = getLastFmTrackPanelSceneRotator(scene);
      if (!(rotator instanceof HTMLElement)) return;
      rotator.style.transform = "";
    }
    function settleLastFmTrackPanelScene(scene) {
      if (!(scene instanceof HTMLElement)) return;
      clearLastFmTrackPanelSceneSettleTimer();
      syncLastFmTrackPanelSceneChrome(scene, { loading: false });
      const rotator = getLastFmTrackPanelSceneRotator(scene);
      if (!(rotator instanceof HTMLElement)) {
        scene.dataset.panelSceneSpin = "idle";
        syncLastFmTrackPanelSceneEscalation(scene);
        return;
      }
      if (!["loading-intro", "loading", "hung"].includes(scene.dataset.panelSceneSpin || "")) {
        scene.dataset.panelSceneSpin = scene.dataset.panelSceneSpin === "handoff-in" ? "handoff-in" : "idle";
        if (scene.dataset.panelSceneSpin === "idle") {
          resetLastFmTrackPanelSceneTransform(scene);
        }
        syncLastFmTrackPanelSceneEscalation(scene);
        return;
      }
      const frozenTransform = window.getComputedStyle(rotator).transform;
      rotator.style.transform = frozenTransform === "none" ? "rotateY(0deg)" : frozenTransform;
      rotator.getBoundingClientRect();
      scene.dataset.panelSceneSpin = "settling";
      syncLastFmTrackPanelSceneEscalation(scene);
      requestAnimationFrame(() => {
        if (!(scene.isConnected && rotator.isConnected) || scene.dataset.panelSceneSpin !== "settling") return;
        rotator.style.transform = "rotateY(-360deg)";
      });
      lastFmTrackPanelSceneSettleTimer = window.setTimeout(() => {
        lastFmTrackPanelSceneSettleTimer = 0;
        if (!(scene.isConnected && rotator.isConnected)) return;
        scene.dataset.panelSceneSpin = "idle";
        resetLastFmTrackPanelSceneTransform(scene);
        syncLastFmTrackPanelSceneEscalation(scene);
        scheduleLastFmTrackPanelFit();
      }, LASTFM_PANEL_SCENE_SETTLE_MS + 48);
    }
    async function waitForLastFmPanelAfterRender(work, options = {}) {
      let timeoutId = 0;
      let activeCheckTimer = 0;
      const hasTimeoutOverride = Object.prototype.hasOwnProperty.call(options, "timeoutMs");
      const timeoutMs = hasTimeoutOverride
        ? Math.max(0, Number(options?.timeoutMs) || 0)
        : LASTFM_PANEL_AFTER_RENDER_TIMEOUT_MS;
      const isStillActive = typeof options?.isStillActive === "function" ? options.isStillActive : null;
      try {
        const pending = [
          Promise.resolve(work).catch(() => {}).then(() => true)
        ];
        if (timeoutMs > 0) {
          pending.push(new Promise((resolve) => {
            timeoutId = window.setTimeout(() => resolve(false), timeoutMs);
          }));
        }
        if (isStillActive) {
          pending.push(new Promise((resolve) => {
            if (!isStillActive()) {
              resolve(false);
              return;
            }
            activeCheckTimer = window.setInterval(() => {
              if (!isStillActive()) {
                if (activeCheckTimer) {
                  window.clearInterval(activeCheckTimer);
                  activeCheckTimer = 0;
                }
                resolve(false);
              }
            }, 50);
          }));
        }
        return Boolean(await Promise.race(pending));
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        if (activeCheckTimer) {
          window.clearInterval(activeCheckTimer);
        }
      }
    }
    function hydrateLastFmTrackPanelScene(scene) {
      if (!(scene instanceof HTMLElement)) return;
      Array.from(scene.querySelectorAll("img")).forEach((image) => {
        if (!(image instanceof HTMLImageElement) || image.complete) return;
        image.addEventListener("load", scheduleLastFmTrackPanelFit, { once: true });
        image.addEventListener("error", scheduleLastFmTrackPanelFit, { once: true });
      });
      scheduleLastFmTrackPanelFit();
    }
    function setLastFmTrackPanelScrollTop() {
      const currentScene = getLastFmTrackPanelCurrentScene();
      const panelWindow = currentScene instanceof HTMLElement ? getLastFmTrackPanelSceneLayerWindow(currentScene, "current") : null;
      if (panelWindow instanceof HTMLElement) {
        panelWindow.scrollTop = 0;
      }
      if (lastFmTrackPanelContent instanceof HTMLElement) {
        lastFmTrackPanelContent.scrollTop = 0;
      }
    }
    function setLastFmTrackPanelSceneMarkup(markup, options = {}) {
      ensureLastFmTrackDetailsOverlay();
      if (!(lastFmTrackPanelContent instanceof HTMLElement)) return;
      const shouldAnimate = Boolean(options?.animate);
      const panelType = firstNonEmpty(options?.panelType, "");
      const isLoading = Boolean(options?.loading);
      const currentScene = getLastFmTrackPanelCurrentScene();
      clearLastFmTrackPanelSceneTimer();
      clearLastFmTrackPanelSceneSettleTimer();
      Array.from(lastFmTrackPanelContent.querySelectorAll(".lastfm-track-panel-scene")).forEach((scene) => {
        if (scene instanceof HTMLElement && scene !== currentScene) {
          teardownLastFmTrackPanelScene(scene);
          scene.remove();
        }
      });
      if (!shouldAnimate || !(currentScene instanceof HTMLElement)) {
        const nextScene = createLastFmTrackPanelScene(markup, {
          state: "current",
          panelType,
          loading: isLoading
        });
        if (currentScene instanceof HTMLElement) {
          teardownLastFmTrackPanelScene(currentScene);
        }
        lastFmTrackPanelContent.innerHTML = "";
        lastFmTrackPanelContent.appendChild(nextScene);
        const nextCurrentScene = getLastFmTrackPanelCurrentScene();
        hydrateLastFmTrackPanelScene(nextCurrentScene);
        setLastFmTrackPanelScrollTop();
        return;
      }
      const incomingScene = createLastFmTrackPanelScene(markup, {
        state: "incoming",
        panelType,
        loading: isLoading
      });
        lastFmTrackPanelContent.appendChild(incomingScene);
        hydrateLastFmTrackPanelScene(incomingScene);
        requestAnimationFrame(() => {
          if (!(currentScene.isConnected && incomingScene.isConnected)) return;
          currentScene.dataset.panelSceneState = "outgoing";
          currentScene.dataset.panelSceneSpin = "handoff-out";
          incomingScene.dataset.panelSceneState = "current";
          incomingScene.dataset.panelSceneSpin = "handoff-in";
          syncLastFmTrackPanelSceneEscalation(currentScene);
          syncLastFmTrackPanelSceneEscalation(incomingScene);
          setLastFmTrackPanelScrollTop();
          scheduleLastFmTrackPanelFit();
        });
        lastFmTrackPanelSceneTimer = window.setTimeout(() => {
          lastFmTrackPanelSceneTimer = 0;
          if (currentScene.isConnected) {
            teardownLastFmTrackPanelScene(currentScene);
            currentScene.remove();
          }
          Array.from(lastFmTrackPanelContent.querySelectorAll('.lastfm-track-panel-scene[data-panel-scene-state="outgoing"]')).forEach((scene) => {
            if (scene instanceof HTMLElement) {
              teardownLastFmTrackPanelScene(scene);
              scene.remove();
            }
        });
        if (incomingScene.isConnected && incomingScene.dataset.panelSceneSpin === "handoff-in") {
          incomingScene.dataset.panelSceneSpin = incomingScene.dataset.panelSceneLoading === "true" ? "loading-intro" : "idle";
          syncLastFmTrackPanelSceneEscalation(incomingScene);
          if (incomingScene.dataset.panelSceneSpin === "idle") {
            resetLastFmTrackPanelSceneTransform(incomingScene);
          }
        }
          scheduleLastFmTrackPanelFit();
      }, LASTFM_PANEL_SCENE_TRANSITION_MS + 48);
    }
    function updateLastFmTrackPanelCurrentSceneMarkup(markup, options = {}) {
      const currentScene = getLastFmTrackPanelCurrentScene();
      if (!(currentScene instanceof HTMLElement)) {
        setLastFmTrackPanelSceneMarkup(markup, options);
        return;
      }
      syncLastFmTrackPanelSceneChrome(currentScene, {
        panelType: firstNonEmpty(options?.panelType, ""),
        loading: Object.prototype.hasOwnProperty.call(options, "loading") ? options.loading : undefined
      });
      const currentLayer = getLastFmTrackPanelSceneCurrentLayer(currentScene);
      if (currentLayer instanceof HTMLElement) {
        currentLayer.innerHTML = markup;
      } else {
        currentScene.innerHTML = renderLastFmTrackPanelSceneShell(markup, {
          panelType: currentScene.dataset.panelType || "",
          loading: currentScene.dataset.panelSceneLoading === "true"
        });
      }
      hydrateLastFmTrackPanelScene(currentScene);
    }
    function setLastFmPanelArtFace(artShell, nextFace, options = {}) {
      if (!(artShell instanceof HTMLElement)) return;
      const face = nextFace === "back" ? "back" : "front";
      if ((artShell.dataset.panelFace || "front") === face) return;
      const isBack = face === "back";
      playInteractionSfx("flip_soft", isBack ? "lastfmPanelArtFlipBack" : "lastfmPanelArtFlipFront");
      artShell.classList.toggle("is-flipped", isBack);
      artShell.dataset.panelFace = face;
      const toggle = artShell.querySelector("[data-lastfm-panel-art-toggle]");
      if (toggle instanceof HTMLButtonElement) {
        toggle.setAttribute("aria-pressed", isBack ? "true" : "false");
        toggle.tabIndex = isBack ? -1 : 0;
      }
      artShell.querySelectorAll(".lastfm-track-panel-cta").forEach((button) => {
        if (button instanceof HTMLButtonElement) {
          button.tabIndex = isBack ? 0 : -1;
        }
      });
      const backFace = artShell.querySelector("[data-lastfm-panel-art-back]");
      if (backFace instanceof HTMLElement) {
        backFace.setAttribute("aria-hidden", isBack ? "false" : "true");
      }
      if (!options.focusTarget) return;
      if (isBack) {
        const firstCta = artShell.querySelector(".lastfm-track-panel-cta");
        if (firstCta instanceof HTMLElement) {
          firstCta.focus({ preventScroll: true });
        }
        return;
      }
      if (toggle instanceof HTMLElement) {
        toggle.focus({ preventScroll: true });
      }
    }
    function setTrackPanelOpenState(isOpen) {
      document.body?.classList.toggle("lastfm-track-panel-open", isOpen);
    }
    function ensureLastFmTrackDetailsOverlay() {
      if (lastFmTrackPanelRoot instanceof HTMLElement) return lastFmTrackPanelRoot;
      const overlay = document.createElement("div");
      overlay.className = "lastfm-track-panel";
      overlay.hidden = true;
      overlay.setAttribute("aria-hidden", "true");
      overlay.innerHTML = `
        <div class="lastfm-track-panel-backdrop" data-track-panel-close></div>
        <div class="lastfm-track-panel-shell">
          <div class="lastfm-track-panel-explosion-overlay" data-lastfm-track-panel-explosion-overlay aria-hidden="true">
            <img class="lastfm-track-panel-explosion-overlay-image" data-lastfm-track-panel-explosion-overlay-image alt="" />
          </div>
          <div class="lastfm-track-panel-scene-host" data-lastfm-track-panel-content></div>
        </div>
      `;
      document.body.appendChild(overlay);
      lastFmTrackPanelRoot = overlay;
      overlay.dataset.panelExplosionState = "idle";
      lastFmTrackPanelContent = overlay.querySelector("[data-lastfm-track-panel-content]");
      overlay.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("[data-track-panel-close]")) {
          hideLastFmTrackDetails("close");
          return;
        }
        const previewToggle = target.closest("[data-track-preview-toggle]");
        if (previewToggle instanceof HTMLElement) {
          event.preventDefault();
          playInteractionSfx("preview_soft", "trackPreviewToggle");
          void toggleTrackPreview(previewToggle.closest("[data-track-preview-player]"));
          return;
        }
        const artToggle = target.closest("[data-lastfm-panel-art-toggle]");
        if (artToggle instanceof HTMLElement) {
          event.preventDefault();
          setLastFmPanelArtFace(artToggle.closest(".lastfm-track-panel-art--flip"), "back", { focusTarget: true });
          return;
        }
        const artBack = target.closest("[data-lastfm-panel-art-back]");
        if (artBack instanceof HTMLElement && !target.closest(".lastfm-track-panel-cta")) {
          event.preventDefault();
          setLastFmPanelArtFace(artBack.closest(".lastfm-track-panel-art--flip"), "front", { focusTarget: true });
          return;
        }
        const artistButton = target.closest("[data-lastfm-artist-name]");
        if (artistButton instanceof HTMLElement) {
          event.preventDefault();
          showLastFmArtistDetails({
            artist: artistButton.getAttribute("data-lastfm-artist-name") || "",
            url: artistButton.getAttribute("data-open-url") || artistButton.getAttribute("data-item-url") || ""
          }, artistButton);
          return;
        }
        const albumButton = target.closest("[data-lastfm-album-title]");
        if (albumButton instanceof HTMLElement) {
          event.preventDefault();
          showLastFmAlbumDetails({
            artist: albumButton.getAttribute("data-lastfm-album-artist") || "",
            album: albumButton.getAttribute("data-lastfm-album-title") || "",
            url: albumButton.getAttribute("data-item-url") || ""
          }, albumButton);
          return;
        }
        const relatedTrackButton = target.closest("[data-lastfm-track-title]");
        if (relatedTrackButton instanceof HTMLElement) {
          event.preventDefault();
          showLastFmTrackDetails({
            artist: relatedTrackButton.getAttribute("data-lastfm-track-artist") || "",
            track: relatedTrackButton.getAttribute("data-lastfm-track-title") || "",
            album: relatedTrackButton.getAttribute("data-lastfm-track-album") || "",
            url: relatedTrackButton.getAttribute("data-item-url") || relatedTrackButton.getAttribute("data-lastfm-track-url") || ""
          }, relatedTrackButton);
          return;
        }
        const openButton = target.closest("[data-open-url]");
        if (openButton instanceof HTMLElement) {
          event.preventDefault();
          playInteractionSfx("confirm_soft", "lastfmTrackPanelOpen");
          launchPanelExternal(
            openButton.getAttribute("data-open-url") || "",
            { appUrl: openButton.getAttribute("data-open-app-url") || "" }
          );
          return;
        }
      });
      overlay.addEventListener("pointerdown", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.matches("[data-track-preview-volume]")) return;
        primeInteractionSfx("trackPreviewVolumePointerDown");
        playInteractionSfx("toggle_soft", "trackPreviewVolumePointerDown");
      }, true);
      overlay.addEventListener("pointerup", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (!target.matches("[data-track-preview-volume]")) return;
        playInteractionSfx("toggle_soft", "trackPreviewVolumePointerUp");
      }, true);
      overlay.addEventListener("input", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.matches("[data-track-preview-volume]")) {
          setTrackPreviewVolume(target.value);
        }
      });
      overlay.addEventListener("keydown", (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key === "Escape") {
          event.preventDefault();
          hideLastFmTrackDetails("close");
          return;
        }
        if (event.key !== "Tab") return;
        const focusable = getTrackPanelFocusableElements();
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || !overlay.contains(active)) {
            event.preventDefault();
            last.focus({ preventScroll: true });
          }
          return;
        }
        if (active === last || !overlay.contains(active)) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      });
      window.addEventListener("resize", () => {
        if (overlay.classList.contains("is-open")) {
          scheduleLastFmTrackPanelFit();
        }
      });
      return overlay;
    }
    function setLastFmTrackDetailsContent(markup) {
      setLastFmTrackPanelSceneMarkup(markup);
    }
    function hideLastFmTrackDetails(reason = "close") {
      lastFmTrackPanelAbortController?.abort();
      lastFmTrackPanelAbortController = null;
      clearLastFmTrackPanelSceneTimer();
      clearLastFmTrackPanelSceneSettleTimer();
      if (lastFmTrackPanelFitRaf) {
        cancelAnimationFrame(lastFmTrackPanelFitRaf);
        lastFmTrackPanelFitRaf = 0;
      }
      void destroySpotifyEmbedController({ resumeShuffle: true });
      void stopTrackPreview({ resumeShuffle: true, resetSource: true });
      if (!(lastFmTrackPanelRoot instanceof HTMLElement)) return;
      if (lastFmTrackPanelRoot.classList.contains("is-open") && reason === "close") {
        playInteractionSfx("close_soft", "lastfmTrackPanelClose");
      }
      lastFmTrackPanelActiveKey = "";
      lastFmTrackPanelRoot.classList.remove("is-open");
      lastFmTrackPanelRoot.dataset.panelExplosionState = "idle";
      lastFmTrackPanelRoot.hidden = true;
      lastFmTrackPanelRoot.setAttribute("aria-hidden", "true");
      if (lastFmTrackPanelContent instanceof HTMLElement) {
        Array.from(lastFmTrackPanelContent.querySelectorAll(".lastfm-track-panel-scene")).forEach((scene) => {
          if (scene instanceof HTMLElement) {
            teardownLastFmTrackPanelScene(scene);
          }
        });
        lastFmTrackPanelContent.innerHTML = "";
      }
      setTrackPanelOpenState(false);
      if (lastFmTrackPanelOriginTrigger instanceof HTMLElement) {
        lastFmTrackPanelOriginTrigger.focus({ preventScroll: true });
      }
      lastFmTrackPanelOriginTrigger = null;
    }
    async function loadLastFmPanelDetails(panelType, query) {
      const definition = getLastFmPanelDefinition(panelType);
      if (!definition) {
        throw new Error("Unknown Last.fm panel type");
      }
      const normalizedQuery = definition.normalizeQuery(query);
      const cacheKey = definition.buildCacheKey(normalizedQuery);
      if (lastFmTrackDetailsCache.has(cacheKey)) {
        return { cacheKey, normalizedQuery, payload: lastFmTrackDetailsCache.get(cacheKey) };
      }
      lastFmTrackPanelAbortController?.abort();
      const controller = new AbortController();
      lastFmTrackPanelAbortController = controller;
      try {
        const payload = await fetchJsonWithTimeout(
          definition.buildEndpoint(normalizedQuery),
          15_000,
          controller.signal,
          { cacheMode: "default" }
        );
        const normalizedPayload = definition.normalizePayload(payload, normalizedQuery);
        lastFmTrackDetailsCache.set(cacheKey, normalizedPayload);
        return { cacheKey, normalizedQuery, payload: normalizedPayload };
      } finally {
        if (lastFmTrackPanelAbortController === controller) {
          lastFmTrackPanelAbortController = null;
        }
      }
    }
    async function showLastFmPanel(panelType, query, trigger = null) {
      const definition = getLastFmPanelDefinition(panelType);
      if (!definition) return;
      const normalizedQuery = definition.normalizeQuery(query);
      if (!definition.hasRequiredQuery(normalizedQuery)) return;
      const panel = ensureLastFmTrackDetailsOverlay();
      if (!(panel instanceof HTMLElement)) return;
      const cacheKey = definition.buildCacheKey(normalizedQuery);
      const shouldUseMorphSwap = panel.classList.contains("is-open") && trigger instanceof HTMLElement && panel.contains(trigger);
      if (trigger instanceof HTMLElement && !panel.contains(trigger)) {
        lastFmTrackPanelOriginTrigger = trigger;
      }
      lastFmTrackPanelActiveKey = cacheKey;
      void destroySpotifyEmbedController({ resumeShuffle: true });
      void stopTrackPreview({ resumeShuffle: true, resetSource: true });
      const skeletonMarkup = definition.renderSkeleton(normalizedQuery);
      let morphScene = null;
      let morphNonce = 0;
      if (shouldUseMorphSwap) {
        morphScene = getLastFmTrackPanelCurrentScene();
        if (morphScene instanceof HTMLElement) {
          morphNonce = prepareLastFmTrackPanelSceneMorph(morphScene, skeletonMarkup, {
            panelType: definition.panelType
          });
        }
      }
      if (!morphNonce) {
        setLastFmTrackPanelSceneMarkup(skeletonMarkup, {
          animate: false,
          panelType: definition.panelType,
          loading: true
        });
      }
      if (!panel.classList.contains("is-open")) {
        panel.hidden = false;
        panel.setAttribute("aria-hidden", "false");
        panel.classList.add("is-open");
      }
      playInteractionSfx("open_soft", definition.openSoundSource);
      setTrackPanelOpenState(true);
      const initialFocusTarget = getLastFmTrackPanelCurrentScene()?.querySelector(".lastfm-track-panel-close");
      if (initialFocusTarget instanceof HTMLElement) {
        initialFocusTarget.focus({ preventScroll: true });
      }
      try {
        const loadState = await loadLastFmPanelDetails(panelType, normalizedQuery);
        if (lastFmTrackPanelActiveKey !== loadState.cacheKey) return;
        const contentMarkup = definition.renderContent(loadState.payload);
        if (morphScene instanceof HTMLElement && isLastFmTrackPanelSceneMorphActive(morphScene, morphNonce)) {
          setLastFmTrackPanelSceneMorphNextMarkup(morphScene, contentMarkup);
          const afterRenderFinished = await waitForLastFmPanelAfterRender(
            definition.afterRender?.(loadState.payload, loadState.cacheKey),
            {
              timeoutMs: 0,
              isStillActive: () => isLastFmTrackPanelSceneMorphActive(morphScene, morphNonce)
            }
          );
          if (!afterRenderFinished || lastFmTrackPanelActiveKey !== loadState.cacheKey) return;
          if (lastFmTrackPanelActiveKey !== loadState.cacheKey) return;
          const morphFinished = await finishLastFmTrackPanelSceneMorph(morphScene, {
            nonce: morphNonce,
            panelType: definition.panelType
          });
          if (!morphFinished) return;
        } else {
          updateLastFmTrackPanelCurrentSceneMarkup(contentMarkup, {
            panelType: definition.panelType,
            loading: true
          });
          await waitForLastFmPanelAfterRender(definition.afterRender?.(loadState.payload, loadState.cacheKey));
          if (lastFmTrackPanelActiveKey !== loadState.cacheKey) return;
          settleLastFmTrackPanelScene(getLastFmTrackPanelCurrentScene());
        }
        const nextFocusTarget = getLastFmTrackPanelCurrentScene()?.querySelector(".lastfm-track-panel-close");
        if (nextFocusTarget instanceof HTMLElement) {
          nextFocusTarget.focus({ preventScroll: true });
        }
      } catch {
        if (lastFmTrackPanelActiveKey !== cacheKey) return;
        void destroySpotifyEmbedController({ resumeShuffle: true });
        void stopTrackPreview({ resumeShuffle: true, resetSource: true });
        const errorMarkup = definition.renderError(normalizedQuery);
        if (morphScene instanceof HTMLElement && isLastFmTrackPanelSceneMorphActive(morphScene, morphNonce)) {
          const runtime = getLastFmTrackPanelSceneRuntime(morphScene);
          if (runtime?.morphFallbackTimer) {
            window.clearTimeout(runtime.morphFallbackTimer);
            runtime.morphFallbackTimer = 0;
          }
          setLastFmTrackPanelSceneMorphNextMarkup(morphScene, errorMarkup);
          await finishLastFmTrackPanelSceneMorph(morphScene, {
            nonce: morphNonce,
            panelType: definition.panelType
          });
        } else {
          updateLastFmTrackPanelCurrentSceneMarkup(errorMarkup, {
            panelType: definition.panelType,
            loading: false
          });
          settleLastFmTrackPanelScene(getLastFmTrackPanelCurrentScene());
        }
      }
    }
    async function showLastFmTrackDetails(query, trigger = null) {
      await showLastFmPanel("track", query, trigger);
    }
    async function showLastFmArtistDetails(query, trigger = null) {
      await showLastFmPanel("artist", query, trigger);
    }
    async function showLastFmAlbumDetails(query, trigger = null) {
      await showLastFmPanel("album", query, trigger);
    }
    function onRootClick(event) {
      if (disposed) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const lastFmArtistButton = target.closest(".lastfm-media-button[data-lastfm-artist-name]");
      if (lastFmArtistButton instanceof HTMLElement) {
        event.preventDefault();
        showLastFmArtistDetails({
          artist: lastFmArtistButton.getAttribute("data-lastfm-artist-name") || "",
          url: lastFmArtistButton.getAttribute("data-item-url") || ""
        }, lastFmArtistButton);
        return;
      }
      const lastFmAlbumButton = target.closest(".lastfm-media-button[data-lastfm-album-title]");
      if (lastFmAlbumButton instanceof HTMLElement) {
        event.preventDefault();
        showLastFmAlbumDetails({
          artist: lastFmAlbumButton.getAttribute("data-lastfm-album-artist") || "",
          album: lastFmAlbumButton.getAttribute("data-lastfm-album-title") || "",
          url: lastFmAlbumButton.getAttribute("data-item-url") || ""
        }, lastFmAlbumButton);
        return;
      }
      const lastFmTrackButton = target.closest(".lastfm-recent-button[data-lastfm-track-title]");
      if (lastFmTrackButton instanceof HTMLElement) {
        event.preventDefault();
        showLastFmTrackDetails({
          artist: lastFmTrackButton.getAttribute("data-lastfm-track-artist") || "",
          track: lastFmTrackButton.getAttribute("data-lastfm-track-title") || "",
          album: lastFmTrackButton.getAttribute("data-lastfm-track-album") || "",
          url: lastFmTrackButton.getAttribute("data-lastfm-track-url") || lastFmTrackButton.getAttribute("data-item-url") || ""
        }, lastFmTrackButton);
        return;
      }
      const copyHandleButton = target.closest("[data-profile-copy-handle]");
      if (copyHandleButton instanceof HTMLElement) {
        event.preventDefault();
        void handleProfileHandleCopy(copyHandleButton);
        return;
      }
      const anchor = target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        const anchorUrl = sanitizeUrl(anchor.href);
        if (anchorUrl) {
          event.preventDefault();
          showExternalPrompt(anchorUrl, anchor);
          return;
        }
      }
      const openButton = target.closest("[data-open-url]");
      if (openButton instanceof HTMLElement) {
        event.preventDefault();
        showExternalPrompt(openButton.getAttribute("data-open-url") || "", openButton);
        return;
      }
      const itemButton = target.closest("[data-item-url]");
      if (itemButton instanceof HTMLElement) {
        event.preventDefault();
        showExternalPrompt(itemButton.getAttribute("data-item-url") || "", itemButton);
      }
    }
    function onRefreshClick() {
      if (typeof onRefreshRequested !== "function") return;
      playInteractionSfx("activate_soft", "refreshButton");
      onRefreshRequested();
    }
    function render(snapshot) {
      if (disposed) return;
      if (!(showcases instanceof HTMLElement)) return;
      if (!(profile instanceof HTMLElement)) return;
      if (!(sidebar instanceof HTMLElement)) return;
      const compactMobile = isCompactMobileLayout();
      const payloadById = new Map((snapshot?.payloads || []).map((payloadEntry) => [payloadEntry.siteId, payloadEntry]));
      const showcaseSites = sites.filter((site) => !NON_SHOWCASE_SITE_IDS.has(site.id));
      root2?.classList.toggle("social-hub--compact-mobile", compactMobile);
      if (compactMobile) {
        hideLastFmTrackDetails("silent");
      } else {
        clearMobileDiscordRevealTimer();
        clearMobileLinksRevealTimer();
        clearMobileLinkSelectedState();
        clearPendingMobileExternalLaunch();
      }
      profile.innerHTML = renderHero(payloadById, sites, { compact: compactMobile });
      if (profileTagline instanceof HTMLElement) {
        const discordPayload = ensurePayload(
          sites.find((site) => site.id === "discord") || { id: "discord", label: "Discord", url: "https://discord.com/users/331350000154050560" },
          payloadById.get("discord")
        );
        profileTagline.innerHTML = renderDiscordPresencePanel(discordPayload, {
          compact: compactMobile,
          mobileRevealState: compactMobile ? mobileDiscordRevealPlayed ? "visible" : "pending" : ""
        });
      }
      if (compactMobile) {
        showcases.innerHTML = "";
        showcases.hidden = true;
      } else {
        showcases.hidden = false;
        showcases.innerHTML = showcaseSites.map((site) => renderSiteShowcase(site, payloadById.get(site.id))).join("");
      }
      if (desktopShuffleVisualizerLayer instanceof HTMLElement) {
        desktopShuffleVisualizerLayer.hidden = compactMobile;
      }
      const shuffleRoot = compactMobile ? (syncMobileAudioDock(false), null) : (syncMobileAudioDock(false), desktopShuffleVisualizerPlayer instanceof HTMLElement ? desktopShuffleVisualizerPlayer : null);
      shufflePlayerController?.attach(shuffleRoot);
      sidebar.innerHTML = renderSidebar(payloadById, sites, {
        compact: compactMobile,
        mobileLinksRevealState: compactMobile ? mobileLinksRevealPlayed ? "visible" : "pending" : ""
      });
      if (compactMobile) {
        syncMobileLinkSelectedState();
        scheduleMobileDiscordReveal();
      }
      syncCinnaMobileGif(compactMobile);
      syncMobileSpeakerToggle(true);
      if (lastRefreshLabel instanceof HTMLElement) {
        lastRefreshLabel.textContent = "";
        lastRefreshLabel.hidden = true;
      }
      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.disabled = Boolean(snapshot?.refreshAllInProgress);
        refreshButton.textContent = snapshot?.refreshAllInProgress ? "Refreshing..." : "Refresh All";
      }
    }
    if (root2 instanceof HTMLElement) {
      root2.setAttribute("data-social-hub-ready", "true");
    }
    if (mobileSpeakerButton instanceof HTMLButtonElement) {
      mobileSpeakerButton.addEventListener("click", onMobileSpeakerToggleClick);
      mobileSpeakerToggleUnsubscribe = shufflePlayerController.subscribe(() => {
        syncMobileSpeakerToggle(true);
      });
    }
    if (shuffleVolumeSlider instanceof HTMLInputElement) {
      shuffleVolumeSlider.addEventListener("input", onShuffleVolumeInput);
    }
    const handleMobileSelectionVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        clearMobileLinkSelectedState();
      }
    };
    const handleMobileSelectionPageHide = () => {
      clearMobileLinkSelectedState();
    };
    document.addEventListener("visibilitychange", handleMobileSelectionVisibilityChange);
    window.addEventListener("pagehide", handleMobileSelectionPageHide);
    root2?.addEventListener("click", onRootClick);
    refreshButton?.addEventListener("click", onRefreshClick);
    function dispose() {
      if (disposed) return;
      disposed = true;
      interactionSfxCleanup?.();
      setInteractionSfxExternalAudioActive(false);
      hideExternalPrompt("silent");
      mobileSpeakerButton?.removeEventListener("click", onMobileSpeakerToggleClick);
      shuffleVolumeSlider?.removeEventListener("input", onShuffleVolumeInput);
      mobileSpeakerToggleUnsubscribe?.();
      mobileSpeakerToggleUnsubscribe = null;
      if (window.__internetAngelShuffleDebug === shuffleDebugController) {
        delete window.__internetAngelShuffleDebug;
      }
      if (mobileSpeakerButton instanceof HTMLButtonElement) {
        mobileSpeakerButton.hidden = true;
      }
      if (audioControlShell instanceof HTMLElement) {
        audioControlShell.hidden = true;
      }
      externalPromptRoot?.remove();
      externalPromptRoot = null;
      externalPromptUrlEl = null;
      externalPromptCancelButton = null;
      externalPromptAcceptButton = null;
      clearMobileDiscordRevealTimer();
      clearMobileLinksRevealTimer();
      clearMobileLinkSelectedState();
      clearPendingMobileExternalLaunch();
      if (profileCopyToastTimer) {
        window.clearTimeout(profileCopyToastTimer);
        profileCopyToastTimer = 0;
      }
      document.querySelector("[data-profile-copy-toast]")?.remove();
      document.removeEventListener("visibilitychange", handleMobileSelectionVisibilityChange);
      window.removeEventListener("pagehide", handleMobileSelectionPageHide);
      hideLastFmTrackDetails("silent");
      lastFmTrackPanelRoot?.remove();
      lastFmTrackPanelRoot = null;
      lastFmTrackPanelContent = null;
      lastFmTrackPanelOriginTrigger = null;
      lastFmTrackPanelAbortController = null;
      void destroySpotifyEmbedController({ resumeShuffle: false });
      spotifyIframeApiPromise = null;
      lastFmTrackDetailsCache.clear();
      if (lastFmTrackPreviewAudio instanceof HTMLAudioElement) {
        lastFmTrackPreviewSuppressAutoResume = true;
        lastFmTrackPreviewAudio.pause();
        lastFmTrackPreviewAudio.removeAttribute("src");
        lastFmTrackPreviewAudio.load();
        lastFmTrackPreviewSuppressAutoResume = false;
      }
      lastFmTrackPreviewAudio = null;
      lastFmTrackPreviewPausedShuffle = false;
      lastFmTrackPreviewSyncQueued = false;
      lastFmTrackPreviewSuppressAutoResume = false;
      cinnaMobileGifController?.dispose?.();
      cinnaMobileGifController = null;
      mobileAudioDock?.remove();
      mobileAudioDock = null;
      shufflePlayerController?.dispose();
      root2?.removeEventListener("click", onRootClick);
      refreshButton?.removeEventListener("click", onRefreshClick);
    }
    return {
      render,
      dispose
    };
  }

  // src/josie/social-hub/state.js
  function clamp2(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }
  function isValidNumber(value) {
    return Number.isFinite(value);
  }
  function resolveFreshnessStatus2(updatedAt, now = Date.now(), sourceStatus = "OK") {
    if (!isValidNumber(updatedAt)) return "STATIC";
    if (sourceStatus === "FAILED") return "STATIC";
    const ageMs = Math.max(0, now - updatedAt);
    if (ageMs <= 6e4) return "LIVE";
    if (ageMs <= 10 * 6e4) return "UPDATED";
    if (ageMs <= 60 * 6e4) return "CACHED";
    return "STATIC";
  }
  function carryForwardPayload(previous, now = Date.now(), sourceStatus = "PARTIAL") {
    if (!previous) return null;
    const safeSourceStatus = sourceStatus === "FAILED" ? "FAILED" : "PARTIAL";
    return {
      ...previous,
      updatedAt: previous.updatedAt,
      freshnessStatus: resolveFreshnessStatus2(previous.updatedAt, now, safeSourceStatus),
      sourceStatus: safeSourceStatus
    };
  }
  function normalizePayload(payload, now) {
    const safeUpdatedAt = isValidNumber(payload?.updatedAt) ? payload.updatedAt : now;
    const sourceStatus = (() => {
      const value = String(payload?.sourceStatus || "OK").toUpperCase();
      if (value === "FAILED") return "FAILED";
      if (value === "PARTIAL") return "PARTIAL";
      return "OK";
    })();
    const providedFreshness = String(payload?.freshnessStatus || "").toUpperCase();
    const freshnessStatus = providedFreshness === "LIVE" || providedFreshness === "UPDATED" || providedFreshness === "CACHED" || providedFreshness === "STATIC" ? providedFreshness : resolveFreshnessStatus2(safeUpdatedAt, now, sourceStatus);
    return {
      ...payload,
      updatedAt: safeUpdatedAt,
      sourceStatus,
      freshnessStatus
    };
  }
  function clonePayload(payload) {
    return JSON.parse(JSON.stringify(payload));
  }
  function toStatusSummary(payloads) {
    const summary = {
      ok: 0,
      partial: 0,
      failed: 0
    };
    for (const payload of payloads) {
      const status = String(payload?.sourceStatus || "OK").toUpperCase();
      if (status === "FAILED") summary.failed += 1;
      else if (status === "PARTIAL") summary.partial += 1;
      else summary.ok += 1;
    }
    return summary;
  }
  function createSocialHubState({
    sites,
    seedPayloads,
    loadSitePayload,
    onStateChange
  }) {
    const payloadBySite = /* @__PURE__ */ new Map();
    const inflightBySite = /* @__PURE__ */ new Map();
    const intervalBySite = /* @__PURE__ */ new Map();
    const lastAttemptAtBySite = /* @__PURE__ */ new Map();
    const siteById = new Map((sites || []).map((site) => [site.id, site]));
    let lastRefreshAt = 0;
    let disposed = false;
    let refreshAllInProgress = false;
    function resolveRefreshPolicy(siteId) {
      return resolveSiteAutoRefreshPolicy(siteById.get(siteId));
    }
    for (const site of sites) {
      const seedPayload = seedPayloads?.[site.id];
      if (!seedPayload) continue;
      payloadBySite.set(site.id, clonePayload(seedPayload));
    }
    function snapshot(now = Date.now()) {
      const orderedPayloads = sites.map((site) => {
        const payload = payloadBySite.get(site.id) || seedPayloads?.[site.id];
        if (!payload) return null;
        return normalizePayload(payload, now);
      }).filter(Boolean);
      return {
        payloads: orderedPayloads,
        lastRefreshAt,
        refreshAllInProgress,
        summary: toStatusSummary(orderedPayloads)
      };
    }
    function publish(now = Date.now()) {
      if (typeof onStateChange !== "function") return;
      onStateChange(snapshot(now));
    }
    function commitPayload(payload, now = Date.now()) {
      if (!payload || !payload.siteId) return;
      const normalized = normalizePayload(payload, now);
      payloadBySite.set(normalized.siteId, normalized);
      lastRefreshAt = Math.max(lastRefreshAt, now);
    }
    async function refreshSite(siteId, options = {}) {
      if (disposed) return;
      if (!siteById.has(siteId)) return;
      if (inflightBySite.has(siteId)) return;
      const now = Date.now();
      const site = siteById.get(siteId);
      const policy = resolveRefreshPolicy(siteId);
      const reason = String(options.reason || "auto");
      const bypassVisibilityGate = reason === "manual" || reason === "boot";
      if (!bypassVisibilityGate && policy.visibleOnly && document.hidden) {
        return;
      }
      const previous = payloadBySite.get(siteId) || seedPayloads?.[siteId] || null;
      const controller = new AbortController();
      lastAttemptAtBySite.set(siteId, now);
      inflightBySite.set(siteId, controller);
      try {
        const nextPayload = await loadSitePayload({
          site,
          previous,
          now,
          signal: controller.signal,
          reason
        });
        if (disposed) return;
        if (nextPayload && nextPayload.siteId === siteId) {
          commitPayload(nextPayload, now);
        } else {
          const carried = carryForwardPayload(previous, now, previous ? "PARTIAL" : "FAILED");
          if (carried) commitPayload(carried, now);
        }
      } catch {
        if (disposed) return;
        const carried = carryForwardPayload(previous, now, previous ? "PARTIAL" : "FAILED");
        if (carried) commitPayload(carried, now);
      } finally {
        inflightBySite.delete(siteId);
        publish(now);
      }
    }
    async function refreshAll(reason = "manual") {
      if (disposed) return;
      if (refreshAllInProgress) return;
      refreshAllInProgress = true;
      publish(Date.now());
      try {
        await Promise.all(
          sites.map((site) => refreshSite(site.id, { reason }))
        );
      } finally {
        refreshAllInProgress = false;
        publish(Date.now());
      }
    }
    function onVisibilityChange() {
      if (disposed) return;
      if (document.hidden) {
        stopAutoRefresh();
        return;
      }
      startAutoRefresh();
    }
    function startAutoRefresh() {
      if (disposed) return;
      stopAutoRefresh();
      for (const site of sites) {
        const policy = resolveRefreshPolicy(site.id);
        if (policy.bootRefresh && !lastAttemptAtBySite.has(site.id) && (!policy.visibleOnly || !document.hidden)) {
          void refreshSite(site.id, { reason: "boot" });
        }
        if (!policy.autoRefresh || policy.intervalMs <= 0) continue;
        const lastAttemptAt = lastAttemptAtBySite.get(site.id) || 0;
        const elapsedMs = lastAttemptAt > 0 ? Date.now() - lastAttemptAt : Number.POSITIVE_INFINITY;
        if (!document.hidden && (!policy.visibleOnly || !document.hidden) && lastAttemptAt > 0 && elapsedMs >= policy.intervalMs) {
          void refreshSite(site.id, { reason: "resume" });
        }
        const timerId = window.setInterval(() => {
          if (disposed) return;
          if (policy.visibleOnly && document.hidden) return;
          void refreshSite(site.id, { reason: "interval" });
        }, policy.intervalMs);
        intervalBySite.set(site.id, timerId);
      }
    }
    function stopAutoRefresh() {
      for (const timerId of intervalBySite.values()) {
        window.clearInterval(timerId);
      }
      intervalBySite.clear();
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      stopAutoRefresh();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      for (const controller of inflightBySite.values()) {
        controller.abort();
      }
      inflightBySite.clear();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    publish(Date.now());
    return {
      refreshSite,
      refreshAll,
      startAutoRefresh,
      stopAutoRefresh,
      snapshot,
      dispose
    };
  }

  function createAmbientBackdropController() {
    if (!(document.body instanceof HTMLElement)) return null;
    if (!(osAmbientBackdrop instanceof HTMLElement)) return null;
    const ambientCanvas = osAmbientCanvas instanceof HTMLCanvasElement ? osAmbientCanvas : osAmbientCanvasBase instanceof HTMLCanvasElement ? osAmbientCanvasBase : null;
    if (!(ambientCanvas instanceof HTMLCanvasElement)) return null;
    const ctx = ambientCanvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return null;
    let disposed = false;
    let rafId = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    let renderWidth = 0;
    let renderHeight = 0;
    let dpr = 1;
    let stars = [];
    let glints = [];
    let flares = [];
    let pointerTargetX = 0;
    let pointerTargetY = 0;
    let pointerCurrentX = 0;
    let pointerCurrentY = 0;
    let pointerStrength = 0;
    let pointerTargetStrength = 0;
    let ambientDeltaSec = 1 / 60;
    let lastAmbientFrameMs = 0;
    const prefersReducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const compactMobileLayout = isCompactMobileLayout();
    const enableAmbientPointerResponse = !compactMobileLayout && Boolean(window.matchMedia?.("(pointer: fine)")?.matches && window.matchMedia?.("(hover: hover)")?.matches);
    const bodyObserver = new MutationObserver(() => {
      sync();
    });
    const TAU = Math.PI * 2;
    function createSeededRandom(seed) {
      let state = seed >>> 0;
      return () => {
        state += 1831565813;
        let value = Math.imul(state ^ state >>> 15, 1 | state);
        value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
      };
    }
    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }
    function smoothstep(value) {
      const clamped = clamp(value, 0, 1);
      return clamped * clamped * (3 - 2 * clamped);
    }
    function easeInOutCubic(value) {
      const clamped = clamp(value, 0, 1);
      return clamped < 0.5 ? 4 * clamped * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    }
    function evaluateCycleEnvelope(progress, fadeInRatio, fadeOutRatio) {
      const fadeIn = clamp(fadeInRatio, 0.05, 0.28);
      const fadeOut = clamp(fadeOutRatio, 0.08, 0.3);
      const fadeOutStart = clamp(1 - fadeOut, fadeIn + 0.08, 0.92);
      if (progress < fadeIn) {
        return easeInOutCubic(progress / fadeIn);
      }
      if (progress > fadeOutStart) {
        return easeInOutCubic((1 - progress) / Math.max(1e-4, 1 - fadeOutStart));
      }
      return 1;
    }
    function hashCycleSeed(seed, cycleIndex, salt) {
      return (seed ^ Math.imul(cycleIndex + 1, salt)) >>> 0;
    }
    function updatePointerState() {
      if (!enableAmbientPointerResponse) {
        pointerCurrentX = renderWidth * 0.5;
        pointerCurrentY = renderHeight * 0.5;
        pointerStrength = 0;
        return;
      }
      pointerCurrentX += (pointerTargetX - pointerCurrentX) * 0.16;
      pointerCurrentY += (pointerTargetY - pointerCurrentY) * 0.16;
      pointerStrength += (pointerTargetStrength - pointerStrength) * (pointerTargetStrength > pointerStrength ? 0.18 : 0.11);
    }
    function resolvePointerRepulsion(x, y, radius, shift, seed) {
      if (!enableAmbientPointerResponse) {
        return { offsetX: 0, offsetY: 0, influence: 0 };
      }
      if (pointerStrength < 0.002) {
        return { offsetX: 0, offsetY: 0, influence: 0 };
      }
      const dx = x - pointerCurrentX;
      const dy = y - pointerCurrentY;
      let distance = Math.hypot(dx, dy);
      let dirX = 0;
      let dirY = 0;
      if (distance < 1e-3) {
        const angle = ((seed % 360) / 360 + pointerCurrentX * 0.0003 + pointerCurrentY * 0.0002) * TAU;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
        distance = 0;
      } else {
        dirX = dx / distance;
        dirY = dy / distance;
      }
      if (distance >= radius) {
        return { offsetX: 0, offsetY: 0, influence: 0 };
      }
      const influence = smoothstep(1 - distance / radius) * pointerStrength;
      const repel = shift * influence;
      return {
        offsetX: dirX * repel,
        offsetY: dirY * repel,
        influence
      };
    }
    function createAmbientMotionState(rng, options) {
      return {
        offsetX: 0,
        offsetY: 0,
        repelEase: options.repelEaseMin + rng() * options.repelEaseSpan,
        returnEase: options.returnEaseMin + rng() * options.returnEaseSpan,
        lastCycleIndex: -1
      };
    }
    function updateAmbientMotion(subject, cycleIndex, anchorX, anchorY, radius, shift, seed) {
      const motion = subject.motion;
      if (motion.lastCycleIndex !== cycleIndex) {
        motion.lastCycleIndex = cycleIndex;
        motion.offsetX *= 0.22;
        motion.offsetY *= 0.22;
      }
      const repulsion = resolvePointerRepulsion(anchorX + motion.offsetX, anchorY + motion.offsetY, radius, shift, seed);
      const targetOffsetX = repulsion.offsetX;
      const targetOffsetY = repulsion.offsetY;
      const easePerSecond = repulsion.influence > 0.001 ? motion.repelEase : motion.returnEase;
      const blend = 1 - Math.exp(-ambientDeltaSec * easePerSecond);
      motion.offsetX += (targetOffsetX - motion.offsetX) * blend;
      motion.offsetY += (targetOffsetY - motion.offsetY) * blend;
      return {
        x: anchorX + motion.offsetX,
        y: anchorY + motion.offsetY,
        influence: repulsion.influence
      };
    }
    function buildStarPrototype(rng, index) {
      return {
        seed: (Math.floor(rng() * 4294967295) ^ Math.imul(index + 1, 1597334677)) >>> 0,
        cycleOffset: rng() * 24,
        cycleDuration: 11 + rng() * 22,
        largeChance: rng() < 0.18 ? 0.22 : 0.1,
        alphaMin: 0.18 + rng() * 0.16,
        alphaSpan: 0.16 + rng() * 0.26,
        twinkleAmountMin: rng() < 0.34 ? 0.03 : 0,
        twinkleAmountSpan: 0.08 + rng() * 0.12,
        twinkleSpeedMin: 0.35 + rng() * 0.4,
        twinkleSpeedSpan: 0.4 + rng() * 1.2,
        driftAmpMin: 0.25 + rng() * 0.6,
        driftAmpSpan: 0.45 + rng() * 1.35,
        driftSpeedMin: 0.05 + rng() * 0.05,
        driftSpeedSpan: 0.04 + rng() * 0.16,
        repelRadiusMin: 64 + rng() * 34,
        repelRadiusSpan: 24 + rng() * 44,
        repelShiftMin: 0.7 + rng() * 0.7,
        repelShiftSpan: 0.55 + rng() * 1.1,
        motion: createAmbientMotionState(rng, {
          repelEaseMin: 7.4,
          repelEaseSpan: 2.2,
          returnEaseMin: 0.55,
          returnEaseSpan: 0.45
        })
      };
    }
    function buildGlintPrototype(rng, index) {
      return {
        seed: (Math.floor(rng() * 4294967295) ^ Math.imul(index + 1, 2246822519)) >>> 0,
        cycleOffset: rng() * 42,
        cycleDuration: 16 + rng() * 28,
        radiusMin: 10 + rng() * 6,
        radiusSpan: 9 + rng() * 16,
        alphaMin: 0.16 + rng() * 0.12,
        alphaSpan: 0.1 + rng() * 0.18,
        pulseSpeedMin: 0.14 + rng() * 0.2,
        pulseSpeedSpan: 0.1 + rng() * 0.36,
        driftAmpMin: 1.4 + rng() * 1.9,
        driftAmpSpan: 1.8 + rng() * 3.8,
        driftSpeedMin: 0.045 + rng() * 0.04,
        driftSpeedSpan: 0.03 + rng() * 0.08,
        repelRadiusMin: 104 + rng() * 56,
        repelRadiusSpan: 42 + rng() * 64,
        repelShiftMin: 2.4 + rng() * 1.6,
        repelShiftSpan: 1.8 + rng() * 2.8,
        armScaleMin: 0.48 + rng() * 0.2,
        armScaleSpan: 0.3 + rng() * 0.34,
        diagonalChance: 0.34 + rng() * 0.26,
        motion: createAmbientMotionState(rng, {
          repelEaseMin: 6.4,
          repelEaseSpan: 2,
          returnEaseMin: 0.42,
          returnEaseSpan: 0.36
        })
      };
    }
    function buildFlarePrototype(rng, index) {
      return {
        seed: (Math.floor(rng() * 4294967295) ^ Math.imul(index + 1, 3266489917)) >>> 0,
        cycleOffset: rng() * (95 + rng() * 125),
        cycleDuration: 95 + rng() * 125,
        visibleDuration: 15,
        radiusMin: 30 + rng() * 14,
        radiusSpan: 18 + rng() * 26,
        alphaMin: 0.34 + rng() * 0.16,
        alphaSpan: 0.18 + rng() * 0.22,
        pulseSpeedMin: 0.28 + rng() * 0.18,
        pulseSpeedSpan: 0.16 + rng() * 0.22,
        driftAmpMin: 1.8 + rng() * 2.2,
        driftAmpSpan: 2.2 + rng() * 4.6,
        driftSpeedMin: 0.028 + rng() * 0.024,
        driftSpeedSpan: 0.018 + rng() * 0.032,
        repelRadiusMin: 160 + rng() * 64,
        repelRadiusSpan: 42 + rng() * 84,
        repelShiftMin: 4.2 + rng() * 2.4,
        repelShiftSpan: 2.4 + rng() * 3.6,
        motion: createAmbientMotionState(rng, {
          repelEaseMin: 5.6,
          repelEaseSpan: 1.8,
          returnEaseMin: 0.34,
          returnEaseSpan: 0.26
        })
      };
    }
    function resolveStarState(star, timeSec) {
      const localTime = timeSec + star.cycleOffset;
      const cycleIndex = Math.floor(localTime / star.cycleDuration);
      const cycleProgress = localTime / star.cycleDuration - cycleIndex;
      const rng = createSeededRandom(hashCycleSeed(star.seed, cycleIndex, 1013904223));
      const anchorX = Math.round(rng() * (renderWidth - 1));
      const anchorY = Math.round(rng() * (renderHeight - 1));
      const size = rng() < star.largeChance ? 2 : 1;
      const alphaBase = star.alphaMin + rng() * star.alphaSpan;
      const twinkleAmount = star.twinkleAmountMin > 0 ? star.twinkleAmountMin + rng() * star.twinkleAmountSpan : 0;
      const twinkleSpeed = star.twinkleSpeedMin + rng() * star.twinkleSpeedSpan;
      const twinklePhase = rng() * TAU;
      const driftAmplitude = star.driftAmpMin + rng() * star.driftAmpSpan;
      const driftSpeed = star.driftSpeedMin + rng() * star.driftSpeedSpan;
      const driftPhaseX = rng() * TAU;
      const driftPhaseY = rng() * TAU;
      const fadeInRatio = 0.08 + rng() * 0.12;
      const fadeOutRatio = 0.12 + rng() * 0.18;
      const repelRadius = star.repelRadiusMin + rng() * star.repelRadiusSpan;
      const repelShift = star.repelShiftMin + rng() * star.repelShiftSpan;
      const lifeAlpha = evaluateCycleEnvelope(cycleProgress, fadeInRatio, fadeOutRatio);
      const twinkle = twinkleAmount > 0 ? Math.sin(timeSec * twinkleSpeed + twinklePhase) * twinkleAmount : 0;
      const driftX = Math.sin(timeSec * driftSpeed + driftPhaseX) * driftAmplitude;
      const driftY = Math.cos(timeSec * (driftSpeed * 0.84) + driftPhaseY) * driftAmplitude;
      const repelled = updateAmbientMotion(star, cycleIndex, anchorX + driftX, anchorY + driftY, repelRadius, repelShift, star.seed);
      return {
        x: repelled.x,
        y: repelled.y,
        size,
        alpha: clamp(alphaBase + twinkle, 0.06, 0.96) * lifeAlpha,
        pointerInfluence: repelled.influence
      };
    }
    function resolveGlintState(glint, timeSec) {
      const localTime = timeSec + glint.cycleOffset;
      const cycleIndex = Math.floor(localTime / glint.cycleDuration);
      const cycleProgress = localTime / glint.cycleDuration - cycleIndex;
      const rng = createSeededRandom(hashCycleSeed(glint.seed, cycleIndex, 1664525));
      const anchorX = Math.round(rng() * (renderWidth - 1));
      const anchorY = Math.round(rng() * (renderHeight - 1));
      const radius = glint.radiusMin + rng() * glint.radiusSpan;
      const alpha = glint.alphaMin + rng() * glint.alphaSpan;
      const pulseSpeed = glint.pulseSpeedMin + rng() * glint.pulseSpeedSpan;
      const pulsePhase = rng() * TAU;
      const driftAmplitude = glint.driftAmpMin + rng() * glint.driftAmpSpan;
      const driftSpeed = glint.driftSpeedMin + rng() * glint.driftSpeedSpan;
      const driftPhaseX = rng() * TAU;
      const driftPhaseY = rng() * TAU;
      const fadeInRatio = 0.12 + rng() * 0.12;
      const fadeOutRatio = 0.18 + rng() * 0.18;
      const repelRadius = glint.repelRadiusMin + rng() * glint.repelRadiusSpan;
      const repelShift = glint.repelShiftMin + rng() * glint.repelShiftSpan;
      const lifeAlpha = evaluateCycleEnvelope(cycleProgress, fadeInRatio, fadeOutRatio);
      const driftX = Math.sin(timeSec * driftSpeed + driftPhaseX) * driftAmplitude;
      const driftY = Math.cos(timeSec * (driftSpeed * 0.76) + driftPhaseY) * driftAmplitude;
      const repelled = updateAmbientMotion(glint, cycleIndex, anchorX + driftX, anchorY + driftY, repelRadius, repelShift, glint.seed);
      return {
        x: repelled.x,
        y: repelled.y,
        radius,
        alpha: alpha * lifeAlpha,
        coreSize: rng() < 0.52 ? 1 : 2,
        pulseSpeed,
        pulsePhase,
        pointerInfluence: repelled.influence,
        armScale: glint.armScaleMin + rng() * glint.armScaleSpan,
        diagonalAlpha: rng() < glint.diagonalChance ? 0.06 + rng() * 0.11 : 0
      };
    }
    function resolveFlareState(flare, timeSec) {
      const localTime = timeSec + flare.cycleOffset;
      const cycleIndex = Math.floor(localTime / flare.cycleDuration);
      const elapsed = localTime - cycleIndex * flare.cycleDuration;
      if (elapsed < 0 || elapsed > flare.visibleDuration) {
        return null;
      }
      const rng = createSeededRandom(hashCycleSeed(flare.seed, cycleIndex, 747796405));
      const anchorX = Math.round(rng() * (renderWidth - 1));
      const anchorY = Math.round(rng() * (renderHeight - 1));
      const radius = flare.radiusMin + rng() * flare.radiusSpan;
      const alpha = flare.alphaMin + rng() * flare.alphaSpan;
      const pulseSpeed = flare.pulseSpeedMin + rng() * flare.pulseSpeedSpan;
      const pulsePhase = rng() * TAU;
      const driftAmplitude = flare.driftAmpMin + rng() * flare.driftAmpSpan;
      const driftSpeed = flare.driftSpeedMin + rng() * flare.driftSpeedSpan;
      const driftPhaseX = rng() * TAU;
      const driftPhaseY = rng() * TAU;
      const repelRadius = flare.repelRadiusMin + rng() * flare.repelRadiusSpan;
      const repelShift = flare.repelShiftMin + rng() * flare.repelShiftSpan;
      const progress = elapsed / flare.visibleDuration;
      const lifeAlpha = progress < 0.14 ? easeInOutCubic(progress / 0.14) : progress < 0.66 ? 1 : easeInOutCubic((1 - progress) / 0.34);
      const driftX = Math.sin(timeSec * driftSpeed + driftPhaseX) * driftAmplitude;
      const driftY = Math.cos(timeSec * (driftSpeed * 0.7) + driftPhaseY) * driftAmplitude;
      const repelled = updateAmbientMotion(flare, cycleIndex, anchorX + driftX, anchorY + driftY, repelRadius, repelShift, flare.seed);
      return {
        x: repelled.x,
        y: repelled.y,
        radius,
        alpha: alpha * clamp(lifeAlpha, 0, 1),
        pulseSpeed,
        pulsePhase,
        coreSize: 2 + Math.round(rng() * 2),
        pointerInfluence: repelled.influence,
        progress
      };
    }
    function clearCanvas() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ambientCanvas.width, ambientCanvas.height);
    }
    function rebuildField() {
      const area = cssWidth * cssHeight;
      const rng = createSeededRandom((cssWidth * 73856093 ^ cssHeight * 19349663 ^ 2654435761) >>> 0);
      const starCount = compactMobileLayout ? Math.max(34, Math.min(72, Math.round(area / 42e3))) : Math.max(54, Math.min(168, Math.round(area / 28e3)));
      const glintCount = compactMobileLayout ? Math.max(0, Math.min(4, Math.round(area / 34e4))) : Math.max(7, Math.min(16, Math.round(area / 19e4)));
      const flareCount = compactMobileLayout ? 0 : Math.max(1, Math.min(2, Math.round(area / 14e5)));
      stars = Array.from({ length: starCount }, (_, index) => buildStarPrototype(rng, index));
      glints = Array.from({ length: glintCount }, (_, index) => buildGlintPrototype(rng, index));
      flares = Array.from({ length: flareCount }, (_, index) => buildFlarePrototype(rng, index));
      pointerTargetX = renderWidth * 0.5;
      pointerTargetY = renderHeight * 0.5;
      pointerCurrentX = pointerTargetX;
      pointerCurrentY = pointerTargetY;
    }
    function resize() {
      cssWidth = Math.max(1, Math.round(window.innerWidth));
      cssHeight = Math.max(1, Math.round(window.innerHeight));
      dpr = Math.max(1, Math.min(compactMobileLayout ? 1.25 : 2, window.devicePixelRatio || 1));
      renderWidth = Math.max(1, Math.round(cssWidth * dpr));
      renderHeight = Math.max(1, Math.round(cssHeight * dpr));
      if (ambientCanvas.width !== renderWidth || ambientCanvas.height !== renderHeight) {
        ambientCanvas.width = renderWidth;
        ambientCanvas.height = renderHeight;
      }
      rebuildField();
      drawStaticFrame(0);
    }
    function drawBurstArms(x, y, radius, thickness, alpha, diagonalAlpha = 0) {
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x - thickness / 2, y - radius, thickness, radius * 2);
      ctx.fillRect(x - radius, y - thickness / 2, radius * 2, thickness);
      if (diagonalAlpha > 0.002) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = `rgba(255,255,255,${diagonalAlpha})`;
        ctx.fillRect(-thickness / 2, -radius * 0.82, thickness, radius * 1.64);
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(-thickness / 2, -radius * 0.82, thickness, radius * 1.64);
        ctx.restore();
      }
    }
    function drawGlint(glintState, timeSec) {
      const pulseBase = 0.5 + Math.sin(timeSec * glintState.pulseSpeed + glintState.pulsePhase) * 0.5;
      const pulse = Math.pow(pulseBase, 4.2);
      const interactionLift = 1 + glintState.pointerInfluence * 0.45;
      const haloAlpha = glintState.alpha * (0.34 + pulse * 0.88) * interactionLift;
      const gradient = ctx.createRadialGradient(glintState.x, glintState.y, 0, glintState.x, glintState.y, glintState.radius * 1.08);
      gradient.addColorStop(0, `rgba(255,255,255,${haloAlpha * 0.9})`);
      gradient.addColorStop(0.18, `rgba(255,255,255,${haloAlpha * 0.28})`);
      gradient.addColorStop(0.46, `rgba(255,255,255,${haloAlpha * 0.1})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(glintState.x - glintState.radius * 1.08, glintState.y - glintState.radius * 1.08, glintState.radius * 2.16, glintState.radius * 2.16);
      const armAlpha = (0.1 + pulse * 0.26) * interactionLift;
      drawBurstArms(
        glintState.x,
        glintState.y,
        glintState.radius * glintState.armScale,
        1.5,
        armAlpha,
        glintState.diagonalAlpha * (0.7 + pulse * 0.4) * interactionLift
      );
      ctx.fillStyle = `rgba(255,255,255,${(0.52 + pulse * 0.4) * (1 + glintState.pointerInfluence * 0.22)})`;
      ctx.fillRect(glintState.x - glintState.coreSize / 2, glintState.y - glintState.coreSize / 2, glintState.coreSize, glintState.coreSize);
    }
    function drawFlare(flareState, timeSec) {
      const pulseBase = 0.5 + Math.sin(timeSec * flareState.pulseSpeed + flareState.pulsePhase) * 0.5;
      const pulse = 0.38 + Math.pow(pulseBase, 2.4) * 0.92;
      const interactionLift = 1 + flareState.pointerInfluence * 0.3;
      const outerRadius = flareState.radius * (1.55 + pulse * 0.22);
      const outerGradient = ctx.createRadialGradient(flareState.x, flareState.y, 0, flareState.x, flareState.y, outerRadius);
      const haloAlpha = flareState.alpha * (0.52 + pulse * 0.74) * interactionLift;
      outerGradient.addColorStop(0, `rgba(255,255,255,${haloAlpha * 0.48})`);
      outerGradient.addColorStop(0.18, `rgba(255,255,255,${haloAlpha * 0.18})`);
      outerGradient.addColorStop(0.44, `rgba(255,255,255,${haloAlpha * 0.07})`);
      outerGradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = outerGradient;
      ctx.fillRect(flareState.x - outerRadius, flareState.y - outerRadius, outerRadius * 2, outerRadius * 2);
      const innerRadius = flareState.radius * (0.96 + pulse * 0.16);
      const innerGradient = ctx.createRadialGradient(flareState.x, flareState.y, 0, flareState.x, flareState.y, innerRadius);
      innerGradient.addColorStop(0, `rgba(255,255,255,${haloAlpha * 0.9})`);
      innerGradient.addColorStop(0.26, `rgba(255,255,255,${haloAlpha * 0.24})`);
      innerGradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = innerGradient;
      ctx.fillRect(flareState.x - innerRadius, flareState.y - innerRadius, innerRadius * 2, innerRadius * 2);
      drawBurstArms(
        flareState.x,
        flareState.y,
        flareState.radius * (0.86 + pulse * 0.18),
        2.2,
        (0.22 + pulse * 0.26) * interactionLift,
        (0.16 + pulse * 0.2) * interactionLift
      );
      ctx.fillStyle = `rgba(255,255,255,${(0.76 + pulse * 0.24) * interactionLift})`;
      ctx.fillRect(flareState.x - flareState.coreSize / 2, flareState.y - flareState.coreSize / 2, flareState.coreSize, flareState.coreSize);
    }
    function drawStaticFrame(timeMs) {
      clearCanvas();
      const timeSec = timeMs * 0.001;
      updatePointerState();
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      for (const star of stars) {
        const starState = resolveStarState(star, prefersReducedMotion ? 0 : timeSec);
        const alpha = clamp(starState.alpha * (1 + starState.pointerInfluence * 0.12), 0, 0.96);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(starState.x, starState.y, starState.size, starState.size);
      }
      for (const glint of glints) {
        drawGlint(resolveGlintState(glint, prefersReducedMotion ? 0 : timeSec), prefersReducedMotion ? 0 : timeSec);
      }
      for (const flare of flares) {
        const flareState = resolveFlareState(flare, prefersReducedMotion ? 0 : timeSec);
        if (flareState) {
          drawFlare(flareState, prefersReducedMotion ? 0 : timeSec);
        }
      }
      ctx.restore();
    }
    function shouldAnimate() {
      return !prefersReducedMotion && !document.hidden && !document.body.classList.contains("site-load-playing") && Boolean(root?.classList.contains("state-os-ready"));
    }
    function handlePointerMove(event) {
      if (disposed || event.pointerType === "touch") return;
      pointerTargetX = clamp(event.clientX * dpr, 0, renderWidth);
      pointerTargetY = clamp(event.clientY * dpr, 0, renderHeight);
      pointerTargetStrength = 1;
      if (!rafId && shouldAnimate()) {
        start();
      }
    }
    function handlePointerOut(event) {
      if (event.relatedTarget == null) {
        pointerTargetStrength = 0;
      }
    }
    function handleWindowBlur() {
      pointerTargetStrength = 0;
    }
    function renderFrame(timeMs) {
      rafId = 0;
      if (disposed) return;
      ambientDeltaSec = lastAmbientFrameMs ? Math.min(0.05, Math.max(1 / 240, (timeMs - lastAmbientFrameMs) * 0.001)) : 1 / 60;
      lastAmbientFrameMs = timeMs;
      if (!shouldAnimate()) {
        drawStaticFrame(0);
        return;
      }
      if (ambientCanvas.width !== renderWidth || ambientCanvas.height !== renderHeight) {
        resize();
      }
      drawStaticFrame(timeMs);
      rafId = window.requestAnimationFrame(renderFrame);
    }
    function stop() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      lastAmbientFrameMs = 0;
      clearCanvas();
    }
    function start() {
      if (rafId || !shouldAnimate()) return;
      rafId = window.requestAnimationFrame(renderFrame);
    }
    function sync() {
      if (disposed) return;
      if (shouldAnimate()) {
        start();
      } else {
        stop();
        if (!document.body.classList.contains("site-load-playing") && root?.classList.contains("state-os-ready")) {
          drawStaticFrame(0);
        }
      }
    }
    window.addEventListener("resize", resize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", sync);
    if (enableAmbientPointerResponse) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerout", handlePointerOut, { passive: true });
      window.addEventListener("blur", handleWindowBlur);
    }
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (root instanceof HTMLElement) {
      bodyObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    }
    resize();
    sync();
    return {
      sync,
      resize,
      dispose() {
        if (disposed) return;
        disposed = true;
        stop();
        bodyObserver.disconnect();
        window.removeEventListener("resize", resize);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", resize);
        }
        document.removeEventListener("visibilitychange", sync);
        if (enableAmbientPointerResponse) {
          window.removeEventListener("pointermove", handlePointerMove);
          window.removeEventListener("pointerout", handlePointerOut);
          window.removeEventListener("blur", handleWindowBlur);
        }
      }
    };
  }
  function createAdaptiveAmbientBackdropController() {
    if (!(document.body instanceof HTMLElement)) return null;
    if (!(osAmbientBackdrop instanceof HTMLElement)) return null;
    document.body.setAttribute("data-theme-resolved", "night");
    document.body.removeAttribute("data-theme-mode");
    osAmbientBackdrop.setAttribute("data-ambient-variant", "night");
    osAmbientBackdrop.setAttribute("data-ambient-renderer", "legacy");
    osAmbientBackdrop.setAttribute(
      "data-ambient-motion",
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "frozen" : "running"
    );
    document.querySelector("#os-ambient-overlay")?.remove?.();
    return createAmbientBackdropController();
  }
  function createDayWispFallbackController(rendererLabel = "wisps-fallback") {
    if (!(document.body instanceof HTMLElement)) return null;
    if (!(osAmbientBackdrop instanceof HTMLElement)) return null;
    if (!(osAmbientCanvasBase instanceof HTMLCanvasElement)) return null;
    const baseCanvas = osAmbientCanvasBase;
    const baseCtx = baseCanvas.getContext("2d", { alpha: true, desynchronized: true });
    const glowCanvas = osAmbientCanvasGlow instanceof HTMLCanvasElement ? osAmbientCanvasGlow : null;
    const glowCtx = glowCanvas?.getContext("2d", { alpha: true, desynchronized: true }) || null;
    if (!baseCtx) return null;
    let disposed = false;
    let rafId = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    let renderWidth = 0;
    let renderHeight = 0;
    let dpr = 1;
    let startTimeMs = 0;
    const prefersReducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const fixedSeed = 0.6180339887;
    const frozenTimeSeconds = 18.6180339887;
    const bodyObserver = new MutationObserver(() => {
      sync();
    });
    const wisps = createWisps();
    function setRendererState(renderer, motion) {
      osAmbientBackdrop.setAttribute("data-ambient-variant", "day");
      osAmbientBackdrop.setAttribute("data-ambient-renderer", renderer);
      osAmbientBackdrop.setAttribute("data-ambient-motion", motion);
    }
    function seededValue(seed) {
      const x = Math.sin(seed * 127.1 + fixedSeed * 311.7) * 43758.5453123;
      return x - Math.floor(x);
    }
    function createWisps() {
      return Array.from({ length: 8 }, (_, index) => {
        const row = index / 7;
        return {
          y: 0.16 + row * 0.1 + (seededValue(index + 1) - 0.5) * 0.04,
          amplitudeA: 8 + seededValue(index + 7) * 12,
          amplitudeB: 4 + seededValue(index + 19) * 10,
          frequencyA: 1.1 + seededValue(index + 31) * 1.8,
          frequencyB: 2.2 + seededValue(index + 43) * 2.6,
          speedA: 0.6 + seededValue(index + 55) * 0.55,
          speedB: 0.35 + seededValue(index + 67) * 0.35,
          phaseA: seededValue(index + 79) * Math.PI * 2,
          phaseB: seededValue(index + 91) * Math.PI * 2,
          drift: (seededValue(index + 103) - 0.5) * 22,
          alpha: 0.12 + seededValue(index + 115) * 0.09,
          width: 0.9 + seededValue(index + 127) * 1.4,
          glowWidth: 10 + seededValue(index + 139) * 16
        };
      });
    }
    function clearCanvas(ctx, canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) return;
      if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
        canvas.width = renderWidth;
        canvas.height = renderHeight;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    function drawWisp(ctx, wisp, timeSeconds, { glow = false } = {}) {
      const segments = 72;
      const startX = -cssWidth * 0.08;
      const endX = cssWidth * 1.08;
      ctx.beginPath();
      for (let index = 0; index <= segments; index += 1) {
        const progress = index / segments;
        const x = startX + (endX - startX) * progress;
        const drift = Math.sin(progress * Math.PI * 2 * wisp.frequencyA + timeSeconds * wisp.speedA + wisp.phaseA) * wisp.amplitudeA;
        const flutter = Math.sin(progress * Math.PI * 2 * wisp.frequencyB - timeSeconds * wisp.speedB + wisp.phaseB) * wisp.amplitudeB;
        const taper = 0.35 + 0.65 * Math.sin(progress * Math.PI);
        const y = cssHeight * wisp.y + drift * taper + flutter * (0.25 + progress * 0.75) + wisp.drift;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.lineWidth = glow ? wisp.glowWidth : wisp.width;
      ctx.strokeStyle = glow
        ? `rgba(160, 160, 160, ${Math.min(0.11, wisp.alpha * 0.72)})`
        : `rgba(116, 116, 116, ${wisp.alpha})`;
      ctx.stroke();
    }
    function drawFrame(nowMs, { frozen = false } = {}) {
      if (disposed) return;
      if (!startTimeMs) {
        startTimeMs = nowMs;
      }
      const elapsedSeconds = frozen ? frozenTimeSeconds : Math.max(0, (nowMs - startTimeMs) * 0.001);
      clearCanvas(baseCtx, baseCanvas);
      if (glowCtx && glowCanvas) {
        clearCanvas(glowCtx, glowCanvas);
      }
      baseCtx.save();
      baseCtx.scale(dpr, dpr);
      baseCtx.lineCap = "round";
      baseCtx.lineJoin = "round";
      if (glowCtx) {
        glowCtx.save();
        glowCtx.scale(dpr, dpr);
        glowCtx.lineCap = "round";
        glowCtx.lineJoin = "round";
      }
      wisps.forEach((wisp) => {
        if (glowCtx) {
          drawWisp(glowCtx, wisp, elapsedSeconds, { glow: true });
        }
        drawWisp(baseCtx, wisp, elapsedSeconds, { glow: false });
      });
      baseCtx.restore();
      if (glowCtx) {
        glowCtx.restore();
      }
    }
    function resize() {
      cssWidth = Math.max(1, Math.round(window.innerWidth));
      cssHeight = Math.max(1, Math.round(window.innerHeight));
      const compactMobile = isCompactMobileLayout();
      dpr = Math.max(1, Math.min(compactMobile ? 1 : 1.5, window.devicePixelRatio || 1));
      renderWidth = Math.max(1, Math.round(cssWidth * dpr));
      renderHeight = Math.max(1, Math.round(cssHeight * dpr));
      drawFrame(performance.now(), { frozen: prefersReducedMotion });
    }
    function shouldAnimate() {
      return !prefersReducedMotion
        && !document.hidden
        && !document.body.classList.contains("site-load-playing")
        && Boolean(root?.classList.contains("state-os-ready"));
    }
    function tick(nowMs) {
      rafId = 0;
      if (disposed) return;
      drawFrame(nowMs, { frozen: false });
      if (shouldAnimate()) {
        rafId = window.requestAnimationFrame(tick);
      }
    }
    function stop() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
    function start() {
      if (rafId || !shouldAnimate()) return;
      rafId = window.requestAnimationFrame(tick);
    }
    function sync() {
      if (disposed) return;
      const motionState = prefersReducedMotion ? "frozen" : "running";
      setRendererState(rendererLabel, motionState);
      if (prefersReducedMotion) {
        stop();
        drawFrame(performance.now(), { frozen: true });
        return;
      }
      if (shouldAnimate()) {
        start();
      } else {
        stop();
      }
    }
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
    if (root instanceof HTMLElement) {
      bodyObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
    window.addEventListener("resize", resize, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resize);
    }
    document.addEventListener("visibilitychange", sync);
    resize();
    sync();
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        stop();
        bodyObserver.disconnect();
        window.removeEventListener("resize", resize);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", resize);
        }
        document.removeEventListener("visibilitychange", sync);
        clearCanvas(baseCtx, baseCanvas);
        if (glowCtx && glowCanvas) {
          clearCanvas(glowCtx, glowCanvas);
        }
      }
    };
  }
  function ensureDayAmbientOverlayCanvas() {
    if (!(osStage instanceof HTMLElement)) return null;
    let overlay = document.querySelector("#os-ambient-overlay");
    let canvas = overlay instanceof HTMLElement ? overlay.querySelector("#os-ambient-canvas-front") : null;
    if (!(overlay instanceof HTMLElement)) {
      overlay = document.createElement("div");
      overlay.id = "os-ambient-overlay";
      overlay.className = "os-ambient-overlay";
      overlay.setAttribute("aria-hidden", "true");
      canvas = document.createElement("canvas");
      canvas.id = "os-ambient-canvas-front";
      canvas.className = "os-ambient-canvas os-ambient-canvas--front";
      canvas.setAttribute("aria-hidden", "true");
      overlay.appendChild(canvas);
      osStage.appendChild(overlay);
    }
    if (!(canvas instanceof HTMLCanvasElement)) return null;
    overlay.setAttribute("data-ambient-variant", "day");
    return { overlay, canvas };
  }
  function createDayWispBackdropController() {
    if (!(document.body instanceof HTMLElement)) return null;
    if (!(osAmbientBackdrop instanceof HTMLElement)) return null;
    if (!(osAmbientCanvasBase instanceof HTMLCanvasElement)) return null;
    const overlayParts = ensureDayAmbientOverlayCanvas();
    if (!overlayParts) {
      return createDayWispFallbackController();
    }
    const baseCanvas = osAmbientCanvasBase;
    const glowCanvas = osAmbientCanvasGlow instanceof HTMLCanvasElement ? osAmbientCanvasGlow : null;
    const frontOverlay = overlayParts.overlay;
    const frontCanvas = overlayParts.canvas;
    const prefersReducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const contextAttributes = {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    };
    function createGlContext(canvas) {
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      return canvas.getContext("webgl2", contextAttributes)
        || canvas.getContext("webgl", contextAttributes)
        || canvas.getContext("experimental-webgl", contextAttributes);
    }
    const baseGl = createGlContext(baseCanvas);
    const frontGl = createGlContext(frontCanvas);
    if (!baseGl || !frontGl) {
      frontOverlay.remove();
      return createDayWispFallbackController();
    }
    const glow2d = glowCanvas?.getContext("2d", { alpha: true, desynchronized: true }) || null;
    let disposed = false;
    let rafId = 0;
    let cssWidth = 0;
    let cssHeight = 0;
    let renderWidth = 0;
    let renderHeight = 0;
    let dpr = 1;
    let startedAt = 0;
    let lastFrameAt = 0;
    let lastObstacleSample = 0;
    let obstaclesDirty = true;
    let obstacleRects = [];
    const bodyObserver = new MutationObserver(() => {
      obstaclesDirty = true;
      sync();
    });
    const obstacleSelectors = [
      "#social-hub-profile .steam-hero-shell",
      "#social-hub-profile .steam-hero-avatar-wrap",
      "#social-hub-profile .steam-hero-avatar",
      "#social-hub-profile-tagline",
      "#social-hub-sidebar .steam-sidebar-panel",
      "#social-hub-showcases .steam-showcase:not(.steam-showcase--lastfm-minimal)",
      "#social-hub-showcases .steam-showcase--lastfm-minimal .lastfm-section",
      ".discord-presence-panel",
      ".lastfm-track-panel-window",
      ".lastfm-artist-panel-window",
      ".lastfm-album-panel-window",
      ".external-link-confirm-window"
    ].join(", ");
    const defaultTrailLength = 16;
    const backWashCount = 22;
    const backLineCount = 16;
    const frontWashCount = 6;
    const frontLineCount = 12;
    const wisps = [];
    const bursts = [];
    function clamp01(value) {
      return clamp(value, 0, 1);
    }
    function seededValue(seed) {
      const raw = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
      return raw - Math.floor(raw);
    }
    function createGlProgram(gl, vertexSource, fragmentSource) {
      function compileShader(type, source) {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
          gl.deleteShader(shader);
          throw new Error(message);
        }
        return shader;
      }
      const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      if (!program || !vertexShader || !fragmentShader) {
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        throw new Error("Unable to create WebGL program");
      }
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) || "Unknown program link error";
        gl.deleteProgram(program);
        throw new Error(message);
      }
      return program;
    }
    function createWispLayerRenderer(gl, canvas) {
      const sharedVertexSource = `
        attribute vec2 a_position;
        attribute vec2 a_uv;
        attribute float a_alpha;
        attribute vec3 a_color;
        uniform vec2 u_resolution;
        varying vec2 v_uv;
        varying float v_alpha;
        varying vec3 v_color;
        void main() {
          vec2 zeroToOne = a_position / u_resolution;
          vec2 clip = zeroToOne * 2.0 - 1.0;
          gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
          v_uv = a_uv;
          v_alpha = a_alpha;
          v_color = a_color;
        }
      `;
      const trailFragmentSource = `
        precision mediump float;
        varying vec2 v_uv;
        varying float v_alpha;
        varying vec3 v_color;
        void main() {
          float edge = 1.0 - smoothstep(0.32, 1.0, abs(v_uv.x));
          float head = smoothstep(0.0, 0.16, v_uv.y);
          float tail = 1.0 - smoothstep(0.78, 1.0, v_uv.y);
          float core = edge * head * tail;
          float haze = (1.0 - smoothstep(0.65, 1.35, abs(v_uv.x))) * 0.36 * head;
          float alpha = clamp((core * 1.18 + haze) * v_alpha, 0.0, 1.0);
          if (alpha <= 0.003) discard;
          gl_FragColor = vec4(v_color, alpha);
        }
      `;
      const burstFragmentSource = `
        precision mediump float;
        varying vec2 v_uv;
        varying float v_alpha;
        varying vec3 v_color;
        void main() {
          float radius = length(v_uv);
          float haze = 1.0 - smoothstep(0.0, 1.0, radius);
          float ring = smoothstep(0.92, 0.48, radius) * (1.0 - smoothstep(0.48, 0.14, radius));
          float alpha = clamp((haze * 0.42 + ring * 0.92) * v_alpha, 0.0, 1.0);
          if (alpha <= 0.003) discard;
          gl_FragColor = vec4(v_color, alpha);
        }
      `;
      const trailProgram = createGlProgram(gl, sharedVertexSource, trailFragmentSource);
      const burstProgram = createGlProgram(gl, sharedVertexSource, burstFragmentSource);
      const trailBuffer = gl.createBuffer();
      const burstBuffer = gl.createBuffer();
      const trailResolution = gl.getUniformLocation(trailProgram, "u_resolution");
      const burstResolution = gl.getUniformLocation(burstProgram, "u_resolution");
      const stride = Float32Array.BYTES_PER_ELEMENT * 8;
      function configureAttributes(program) {
        const positionLocation = gl.getAttribLocation(program, "a_position");
        const uvLocation = gl.getAttribLocation(program, "a_uv");
        const alphaLocation = gl.getAttribLocation(program, "a_alpha");
        const colorLocation = gl.getAttribLocation(program, "a_color");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(uvLocation);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, stride, Float32Array.BYTES_PER_ELEMENT * 2);
        gl.enableVertexAttribArray(alphaLocation);
        gl.vertexAttribPointer(alphaLocation, 1, gl.FLOAT, false, stride, Float32Array.BYTES_PER_ELEMENT * 4);
        gl.enableVertexAttribArray(colorLocation);
        gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, stride, Float32Array.BYTES_PER_ELEMENT * 5);
      }
      function resizeLayer(nextWidth, nextHeight, nextDpr) {
        const targetWidth = Math.max(1, Math.round(nextWidth * nextDpr));
        const targetHeight = Math.max(1, Math.round(nextHeight * nextDpr));
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
        }
        canvas.style.width = `${nextWidth}px`;
        canvas.style.height = `${nextHeight}px`;
        gl.viewport(0, 0, targetWidth, targetHeight);
      }
      function clearLayer() {
        gl.viewport(0, 0, canvas.width || 1, canvas.height || 1);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      function drawVertices(program, buffer, resolutionLocation, data) {
        if (!(data instanceof Float32Array) || !data.length) return;
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        configureAttributes(program);
        gl.uniform2f(resolutionLocation, Math.max(1, canvas.width), Math.max(1, canvas.height));
        gl.drawArrays(gl.TRIANGLES, 0, data.length / 8);
      }
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      return {
        resize: resizeLayer,
        clear: clearLayer,
        render(trailVertices, burstVertices) {
          clearLayer();
          drawVertices(trailProgram, trailBuffer, trailResolution, trailVertices);
          drawVertices(burstProgram, burstBuffer, burstResolution, burstVertices);
        },
        dispose() {
          gl.deleteBuffer(trailBuffer);
          gl.deleteBuffer(burstBuffer);
          gl.deleteProgram(trailProgram);
          gl.deleteProgram(burstProgram);
        }
      };
    }
    let baseRenderer = null;
    let frontRenderer = null;
    try {
      baseRenderer = createWispLayerRenderer(baseGl, baseCanvas);
      frontRenderer = createWispLayerRenderer(frontGl, frontCanvas);
    } catch (error) {
      frontOverlay.remove();
      baseRenderer?.dispose?.();
      frontRenderer?.dispose?.();
      return createDayWispFallbackController();
    }
    function setRendererState(renderer, motion) {
      osAmbientBackdrop.setAttribute("data-ambient-variant", "day");
      osAmbientBackdrop.setAttribute("data-ambient-renderer", renderer);
      osAmbientBackdrop.setAttribute("data-ambient-motion", motion);
      frontOverlay.setAttribute("data-ambient-variant", "day");
      frontOverlay.setAttribute("data-ambient-renderer", renderer);
      frontOverlay.setAttribute("data-ambient-motion", motion);
    }
    function createHistoryPoint(x, y) {
      return { x, y };
    }
    function wrapAngle(angle) {
      let nextAngle = angle;
      while (nextAngle <= -Math.PI) nextAngle += Math.PI * 2;
      while (nextAngle > Math.PI) nextAngle -= Math.PI * 2;
      return nextAngle;
    }
    function steerAngle(current, target, maxDelta) {
      const delta = wrapAngle(target - current);
      return wrapAngle(current + clamp(delta, -maxDelta, maxDelta));
    }
    function createWisp(index, layer, kind) {
      const seed = seededValue(index + 1.73) + index * 0.037;
      const isLine = kind === "line";
      const historyLength = isLine ? 22 : defaultTrailLength;
      return {
        id: index,
        layer,
        kind,
        seed,
        widthBase: isLine
          ? 1.08 + seededValue(index + 31) * (layer === "front" ? 1.52 : 1.72)
          : 5.4 + seededValue(index + 31) * (layer === "front" ? 3.4 : 4.6),
        alphaBase: isLine
          ? (layer === "front" ? 0.24 : 0.19) + seededValue(index + 71) * 0.07
          : (layer === "front" ? 0.05 : 0.072) + seededValue(index + 71) * 0.026,
        speed: isLine
          ? 132 + seededValue(index + 103) * 92
          : 48 + seededValue(index + 103) * 24,
        sway: isLine
          ? 28 + seededValue(index + 131) * 48
          : 14 + seededValue(index + 131) * 32,
        frequencyA: isLine
          ? 1.12 + seededValue(index + 173) * 1.52
          : 0.56 + seededValue(index + 173) * 0.72,
        frequencyB: isLine
          ? 1.38 + seededValue(index + 211) * 1.44
          : 0.38 + seededValue(index + 211) * 0.46,
        driftSign: seededValue(index + 251) > 0.5 ? 1 : -1,
        routeBias: seededValue(index + 271) > 0.5 ? 1 : -1,
        autonomy: isLine ? 0.44 + seededValue(index + 281) * 0.68 : 0,
        turnRate: isLine ? 2.1 + seededValue(index + 293) * 2.4 : 0,
        heading: -Math.PI / 2,
        targetHeading: -Math.PI / 2,
        currentSpeed: 0,
        targetSpeed: 0,
        nextIntentAt: 0,
        wanderPhase: seededValue(index + 307) * Math.PI * 2,
        originSide: "left",
        targetX: 0,
        targetY: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        lastCollisionMs: 0,
        lastInteractionMs: 0,
        lastLayerSwapMs: 0,
        history: Array.from({ length: historyLength }, () => createHistoryPoint(0, 0))
      };
    }
    function setWispHistory(wisp, x, y) {
      for (let index = 0; index < wisp.history.length; index += 1) {
        wisp.history[index].x = x;
        wisp.history[index].y = y;
      }
    }
    function retargetLineGoal(wisp, nowMs, reason = "autonomy") {
      if (wisp.kind !== "line") return;
      const rollA = seededValue(wisp.id * 17.17 + nowMs * 0.00031 + wisp.seed * 41.2);
      const rollB = seededValue(wisp.id * 23.41 + nowMs * 0.00017 + wisp.seed * 19.4);
      const interiorMinX = cssWidth * 0.18;
      const interiorMaxX = cssWidth * 0.82;
      const travelDepth = reason === "collision" ? 0.52 : 0.68;
      if (wisp.originSide === "left") {
        wisp.targetX = interiorMinX + (interiorMaxX - interiorMinX) * (travelDepth + rollA * (1 - travelDepth));
      } else {
        wisp.targetX = interiorMinX + (interiorMaxX - interiorMinX) * (rollA * (1 - travelDepth));
      }
      wisp.targetY = cssHeight * (0.12 + rollB * 0.72);
    }
    function retargetWisp(wisp, nowMs, reason = "autonomy") {
      if (wisp.kind !== "line") return;
      retargetLineGoal(wisp, nowMs, reason);
      const baseRoll = seededValue(wisp.id * 17.17 + nowMs * 0.00031 + wisp.seed * 41.2);
      const sweepRoll = seededValue(wisp.id * 23.41 + nowMs * 0.00017 + wisp.seed * 19.4);
      const towardGoal = Math.atan2(wisp.targetY - wisp.y, wisp.targetX - wisp.x);
      const lateralBias = wisp.routeBias * (0.08 + sweepRoll * 0.24);
      const sweep = (baseRoll - 0.5) * (reason === "collision" ? 1.42 : 0.96);
      const curl = Math.sin(nowMs * 0.0012 + wisp.seed * 29.1 + wisp.y * 0.004) * (0.18 + wisp.autonomy * 0.42);
      wisp.targetHeading = wrapAngle(towardGoal + lateralBias + sweep + curl);
      wisp.targetSpeed = wisp.speed * (reason === "collision"
        ? 0.88 + sweepRoll * 0.62
        : 0.56 + sweepRoll * 0.86);
      wisp.turnRate = (reason === "collision" ? 3.9 : 2.1) + baseRoll * 2.6;
      wisp.nextIntentAt = nowMs + (reason === "collision"
        ? 220 + baseRoll * 260
        : 300 + sweepRoll * 980);
    }
    function resetWisp(wisp, preserveSeed = false) {
      if (!cssWidth || !cssHeight) return;
      const laneSeed = seededValue(wisp.id * 3.7 + (preserveSeed ? 19 : performance.now() * 0.0001));
      const spawnBand = wisp.layer === "front" ? 0.24 : 0.12;
      const spawnMargin = 42 + seededValue(wisp.id + 389) * 48;
      if (wisp.kind === "line") {
        const edgeRoll = seededValue(wisp.id + (preserveSeed ? 421 : performance.now() * 0.0003));
        if (edgeRoll < 0.5) {
          wisp.originSide = "left";
          wisp.x = -spawnMargin;
          wisp.y = cssHeight * (0.08 + laneSeed * 0.78);
          wisp.vx = wisp.speed * (0.76 + seededValue(wisp.id + 467) * 0.22);
          wisp.vy = (seededValue(wisp.id + 479) - 0.5) * 28;
        } else {
          wisp.originSide = "right";
          wisp.x = cssWidth + spawnMargin;
          wisp.y = cssHeight * (0.08 + laneSeed * 0.78);
          wisp.vx = -wisp.speed * (0.76 + seededValue(wisp.id + 491) * 0.22);
          wisp.vy = (seededValue(wisp.id + 503) - 0.5) * 28;
        }
        wisp.heading = Math.atan2(wisp.vy, wisp.vx);
        wisp.targetHeading = wisp.heading;
        wisp.currentSpeed = Math.hypot(wisp.vx, wisp.vy);
        wisp.targetSpeed = wisp.currentSpeed;
        wisp.nextIntentAt = 0;
        retargetLineGoal(wisp, performance.now() + wisp.id * 23, "reset");
      } else {
        wisp.x = cssWidth * (0.08 + laneSeed * 0.84);
        wisp.y = cssHeight * (1.02 + seededValue(wisp.id + 401) * 0.16 + spawnBand);
        wisp.vx = (seededValue(wisp.id + 433) - 0.5) * 16;
        wisp.vy = -(wisp.speed * 0.85);
      }
      wisp.age = 0;
      wisp.lastCollisionMs = 0;
      wisp.lastInteractionMs = 0;
      wisp.lastLayerSwapMs = 0;
      setWispHistory(wisp, wisp.x, wisp.y);
    }
    function seedWisps() {
      wisps.length = 0;
      let index = 0;
      for (let count = 0; count < backWashCount; count += 1, index += 1) {
        wisps.push(createWisp(index, "back", "wash"));
      }
      for (let count = 0; count < backLineCount; count += 1, index += 1) {
        wisps.push(createWisp(index, "back", "line"));
      }
      for (let count = 0; count < frontWashCount; count += 1, index += 1) {
        wisps.push(createWisp(index, "front", "wash"));
      }
      for (let count = 0; count < frontLineCount; count += 1, index += 1) {
        wisps.push(createWisp(index, "front", "line"));
      }
      wisps.forEach((wisp) => {
        resetWisp(wisp, true);
        if (wisp.kind === "line") {
          retargetWisp(wisp, performance.now() + wisp.id * 31, "reset");
        }
      });
    }
    function spawnBurst(x, y, layer, kind = "collision", strength = 1) {
      const isInteraction = kind.includes("interaction");
      const isLine = kind.includes("line");
      bursts.push({
        x,
        y,
        layer,
        kind,
        radius: isInteraction ? (isLine ? 14 : 18) : (isLine ? 8 : 12),
        growth: (isInteraction ? (isLine ? 42 : 68) : (isLine ? 26 : 42)) * (0.72 + strength * 0.5),
        alpha: (isInteraction ? (isLine ? 0.14 : 0.18) : (isLine ? 0.1 : 0.12)) * (0.74 + strength * 0.36),
        age: 0,
        maxAge: isInteraction ? (isLine ? 0.36 : 0.58) : (isLine ? 0.24 : 0.42),
        seed: seededValue(x * 0.017 + y * 0.021 + performance.now() * 0.0008)
      });
      while (bursts.length > 120) {
        bursts.shift();
      }
    }
    function clearGlowCanvas() {
      if (!(glowCanvas instanceof HTMLCanvasElement) || !glow2d) return;
      const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
      const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
      if (glowCanvas.width !== targetWidth || glowCanvas.height !== targetHeight) {
        glowCanvas.width = targetWidth;
        glowCanvas.height = targetHeight;
      }
      glowCanvas.style.width = `${cssWidth}px`;
      glowCanvas.style.height = `${cssHeight}px`;
      glow2d.setTransform(1, 0, 0, 1, 0, 0);
      glow2d.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    }
    function drawGlowLayer() {
      if (!(glowCanvas instanceof HTMLCanvasElement) || !glow2d) return;
      glow2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      glow2d.clearRect(0, 0, cssWidth, cssHeight);
      glow2d.globalCompositeOperation = "source-over";
      wisps.forEach((wisp) => {
        if (wisp.layer !== "back" || wisp.kind !== "wash") return;
        const head = wisp.history[0];
        const rise = clamp01(1 - head.y / Math.max(1, cssHeight));
        const radius = (34 + rise * 88) * (0.9 + seededValue(wisp.id + 509) * 0.4);
        const gradient = glow2d.createRadialGradient(head.x, head.y, radius * 0.08, head.x, head.y, radius);
        gradient.addColorStop(0, "rgba(180, 186, 196, 0.035)");
        gradient.addColorStop(0.4, "rgba(170, 176, 188, 0.022)");
        gradient.addColorStop(1, "rgba(170, 176, 188, 0)");
        glow2d.fillStyle = gradient;
        glow2d.beginPath();
        glow2d.arc(head.x, head.y, radius, 0, Math.PI * 2);
        glow2d.fill();
      });
    }
    function collectObstacles(nowMs) {
      if (!obstaclesDirty && nowMs - lastObstacleSample < 120) return obstacleRects;
      lastObstacleSample = nowMs;
      obstaclesDirty = false;
      obstacleRects = [];
      const nodes = document.querySelectorAll(obstacleSelectors);
      nodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number.parseFloat(style.opacity || "1") <= 0.03) {
          return;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width < 46 || rect.height < 24) return;
        const padding = 12;
        obstacleRects.push({
          left: rect.left - padding,
          right: rect.right + padding,
          top: rect.top - padding,
          bottom: rect.bottom + padding
        });
      });
      return obstacleRects;
    }
    function nearestPointOnRect(x, y, rect) {
      return {
        x: clamp(x, rect.left, rect.right),
        y: clamp(y, rect.top, rect.bottom)
      };
    }
    function updateSimulation(deltaSeconds, nowMs) {
      if (!cssWidth || !cssHeight) return;
      const obstacles = collectObstacles(nowMs);
      wisps.forEach((wisp) => {
        const isLine = wisp.kind === "line";
        const rise = clamp01(1 - wisp.y / Math.max(1, cssHeight));
        const swayA = Math.sin(nowMs * (isLine ? 0.0026 : 0.00125) * wisp.frequencyA + wisp.seed * 12 + wisp.y * (isLine ? 0.013 : 0.006)) * (wisp.sway * (isLine ? 0.82 + rise * 0.84 : 0.4 + rise * 0.9));
        const swayB = Math.cos(nowMs * (isLine ? 0.0032 : 0.00175) * wisp.frequencyB - wisp.x * (isLine ? 0.01 : 0.003) + wisp.seed * 19) * (isLine ? 16 + rise * 34 : 8 + rise * 18);
        const swayC = Math.sin(nowMs * (isLine ? 0.0019 : 0.00085) + wisp.seed * 27 + rise * 5.4) * (isLine ? 12 + rise * 22 : 6 + rise * 16) * wisp.driftSign;
        const routeLift = isLine ? Math.sin(nowMs * 0.0015 + wisp.seed * 33 + wisp.y * 0.002) * (16 + rise * 38) * wisp.routeBias : 0;
        if (isLine) {
          if (nowMs >= wisp.nextIntentAt) {
            retargetWisp(wisp, nowMs, "autonomy");
          }
          const wanderA = Math.sin(nowMs * 0.0024 + wisp.wanderPhase + wisp.seed * 43 + wisp.y * 0.007);
          const wanderB = Math.cos(nowMs * 0.0018 - wisp.wanderPhase * 0.7 + wisp.seed * 31 + wisp.x * 0.004);
          const desiredHeading = wrapAngle(
            wisp.targetHeading
            + wanderA * (0.18 + wisp.autonomy * 0.42)
            + wanderB * (0.08 + wisp.autonomy * 0.26)
            + routeLift * 0.012
          );
          wisp.heading = steerAngle(wisp.heading, desiredHeading, wisp.turnRate * deltaSeconds);
          const speedPulse = 0.78 + (Math.sin(nowMs * 0.0013 + wisp.seed * 57 + wisp.age * 0.7) * 0.5 + 0.5) * (0.54 + wisp.autonomy * 0.26);
          const desiredSpeed = wisp.targetSpeed * speedPulse;
          wisp.currentSpeed += (desiredSpeed - wisp.currentSpeed) * Math.min(1, deltaSeconds * (1.8 + wisp.autonomy * 1.6));
          const dirX = Math.cos(wisp.heading);
          const dirY = Math.sin(wisp.heading);
          wisp.vx += (dirX * wisp.currentSpeed - wisp.vx) * deltaSeconds * (2.2 + wisp.autonomy * 1.4);
          wisp.vy += (dirY * wisp.currentSpeed - wisp.vy) * deltaSeconds * (2.2 + wisp.autonomy * 1.4);
          wisp.vx += (swayA + swayB + swayC + routeLift) * deltaSeconds * 0.58;
        } else {
          wisp.vx += (swayA + swayB + swayC + routeLift) * deltaSeconds * 0.68;
          wisp.vy = -(wisp.speed + rise * 42);
        }
        const influenceBase = (wisp.layer === "front" ? (isLine ? 88 : 56) : (isLine ? 102 : 72)) + rise * (isLine ? 62 : 72);
        for (let index = 0; index < obstacles.length; index += 1) {
          const obstacle = obstacles[index];
          const nearest = nearestPointOnRect(wisp.x, wisp.y, obstacle);
          let dx = wisp.x - nearest.x;
          let dy = wisp.y - nearest.y;
          let distance = Math.hypot(dx, dy);
          if (distance < 1) {
            const distancesToEdges = [
              { axis: "x", value: Math.abs(wisp.x - obstacle.left), sign: -1 },
              { axis: "x", value: Math.abs(obstacle.right - wisp.x), sign: 1 },
              { axis: "y", value: Math.abs(wisp.y - obstacle.top), sign: -1 },
              { axis: "y", value: Math.abs(obstacle.bottom - wisp.y), sign: 1 }
            ].sort((left, right) => left.value - right.value);
            const nearestEdge = distancesToEdges[0];
            if (nearestEdge.axis === "x") {
              dx = nearestEdge.sign;
              dy = 0.12;
            } else {
              dx = 0.12 * wisp.driftSign;
              dy = nearestEdge.sign;
            }
            distance = Math.hypot(dx, dy);
          }
          if (distance >= influenceBase) continue;
          const strength = Math.pow(1 - distance / influenceBase, 2);
          const invDistance = 1 / Math.max(1, distance);
          const awayX = dx * invDistance;
          const awayY = dy * invDistance;
          const tangentX = -awayY * (isLine ? wisp.routeBias : wisp.driftSign);
          const tangentY = awayX * (isLine ? wisp.routeBias : wisp.driftSign);
          wisp.vx += (awayX * (isLine ? 246 : 146) + tangentX * (isLine ? 182 : 84)) * strength * deltaSeconds;
          if (awayY > -0.24) {
            wisp.vy += awayY * (isLine ? 96 : 24) * strength;
          }
          if (isLine) {
            wisp.vx += tangentY * 12 * strength;
            wisp.targetHeading = Math.atan2(tangentY + awayY * 0.45, tangentX + awayX * 0.45);
          }
          if (nowMs - wisp.lastCollisionMs > 160 && strength > 0.54) {
            const collisionKind = isLine ? "collision-line" : "collision";
            spawnBurst(nearest.x, nearest.y, wisp.layer, collisionKind, strength);
            wisp.lastCollisionMs = nowMs;
            if (isLine) {
              wisp.driftSign *= -1;
              wisp.routeBias *= -1;
              wisp.vx += tangentX * 120 * strength;
              wisp.heading = Math.atan2(wisp.vy + tangentY * 22, wisp.vx + tangentX * 22);
              retargetWisp(wisp, nowMs, "collision");
              if (nowMs - wisp.lastLayerSwapMs > 540 && strength > 0.72 && seededValue(wisp.id * 17.3 + nowMs * 0.0013) > 0.56) {
                wisp.layer = wisp.layer === "front" ? "back" : "front";
                wisp.lastLayerSwapMs = nowMs;
              }
            }
          }
        }
        wisp.vx *= Math.exp(-deltaSeconds * (isLine ? 1.36 : 2.2));
        wisp.age += deltaSeconds;
        wisp.x += wisp.vx * deltaSeconds;
        wisp.y += wisp.vy * deltaSeconds;
        for (let index = wisp.history.length - 1; index > 0; index -= 1) {
          wisp.history[index].x = wisp.history[index - 1].x;
          wisp.history[index].y = wisp.history[index - 1].y;
        }
        wisp.history[0].x = wisp.x;
        wisp.history[0].y = wisp.y;
        if (wisp.y < -cssHeight * 0.22 || wisp.x < -cssWidth * 0.28 || wisp.x > cssWidth * 1.28 || wisp.age > (isLine ? 12 : 16)) {
          resetWisp(wisp);
        }
      });
      for (let index = bursts.length - 1; index >= 0; index -= 1) {
        const burst = bursts[index];
        burst.age += deltaSeconds;
        if (burst.age >= burst.maxAge) {
          bursts.splice(index, 1);
        }
      }
    }
    function pushQuad(vertices, x0, y0, x1, y1, x2, y2, x3, y3, alpha, color, uvMinX, uvMaxX, uvMinY, uvMaxY) {
      vertices.push(
        x0, y0, uvMinX, uvMinY, alpha, color[0], color[1], color[2],
        x1, y1, uvMaxX, uvMinY, alpha, color[0], color[1], color[2],
        x2, y2, uvMinX, uvMaxY, alpha, color[0], color[1], color[2],
        x2, y2, uvMinX, uvMaxY, alpha, color[0], color[1], color[2],
        x1, y1, uvMaxX, uvMinY, alpha, color[0], color[1], color[2],
        x3, y3, uvMaxX, uvMaxY, alpha, color[0], color[1], color[2]
      );
    }
    function buildGeometryForLayer(layer) {
      const trailVertices = [];
      const burstVertices = [];
      wisps.forEach((wisp) => {
        if (wisp.layer !== layer) return;
        const wispColor = wisp.kind === "line"
          ? (layer === "front" ? [0.07, 0.07, 0.09] : [0.12, 0.12, 0.14])
          : (layer === "front" ? [0.42, 0.42, 0.46] : [0.48, 0.49, 0.53]);
        for (let index = 0; index < wisp.history.length - 1; index += 1) {
          const pointA = wisp.history[index];
          const pointB = wisp.history[index + 1];
          const dx = pointB.x - pointA.x;
          const dy = pointB.y - pointA.y;
          const length = Math.hypot(dx, dy);
          if (length < 0.9) continue;
          const ageT = index / Math.max(1, wisp.history.length - 2);
          const rise = clamp01(1 - (pointA.y + pointB.y) * 0.5 / Math.max(1, cssHeight));
          const width = wisp.kind === "line"
            ? wisp.widthBase * (0.92 + rise * 0.42) * (1 - ageT * 0.18)
            : wisp.widthBase * (0.22 + rise * 1.2) * (1 - ageT * 0.42);
          const alpha = wisp.kind === "line"
            ? wisp.alphaBase * (1.08 + rise * 0.56) * (1 - ageT * 0.24)
            : wisp.alphaBase * (0.42 + rise * 0.9) * (1 - ageT * 0.5);
          const nx = -dy / length;
          const ny = dx / length;
          const x0 = pointA.x + nx * width;
          const y0 = pointA.y + ny * width;
          const x1 = pointA.x - nx * width;
          const y1 = pointA.y - ny * width;
          const x2 = pointB.x + nx * width * 1.08;
          const y2 = pointB.y + ny * width * 1.08;
          const x3 = pointB.x - nx * width * 1.08;
          const y3 = pointB.y - ny * width * 1.08;
          pushQuad(trailVertices, x0, y0, x1, y1, x2, y2, x3, y3, alpha, wispColor, -1, 1, 0, 1);
        }
      });
      bursts.forEach((burst) => {
        if (burst.layer !== layer) return;
        const lifeT = clamp01(burst.age / burst.maxAge);
        const size = burst.radius + burst.growth * lifeT;
        const alpha = burst.alpha * (1 - lifeT);
        const burstColor = burst.kind.includes("interaction") ? [0.3, 0.3, 0.34] : [0.34, 0.34, 0.38];
        pushQuad(
          burstVertices,
          burst.x - size, burst.y - size,
          burst.x + size, burst.y - size,
          burst.x - size, burst.y + size,
          burst.x + size, burst.y + size,
          alpha,
          burstColor,
          -1,
          1,
          -1,
          1
        );
        if (burst.kind === "collision-line" || burst.kind === "interaction-line") {
          const streakCount = burst.kind === "interaction-line" ? 5 : 3;
          const baseAngle = burst.seed * Math.PI * 2 + lifeT * 0.92;
          for (let index = 0; index < streakCount; index += 1) {
            const angle = baseAngle + index * (Math.PI * 2 / streakCount);
            const halfLength = (burst.kind === "interaction-line" ? 20 : 14) + lifeT * (burst.kind === "interaction-line" ? 22 : 14);
            const halfWidth = 0.7 + (1 - lifeT) * 1.1;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const nx = -dirY * halfWidth;
            const ny = dirX * halfWidth;
            const x0 = burst.x - dirX * halfLength + nx;
            const y0 = burst.y - dirY * halfLength + ny;
            const x1 = burst.x - dirX * halfLength - nx;
            const y1 = burst.y - dirY * halfLength - ny;
            const x2 = burst.x + dirX * halfLength + nx;
            const y2 = burst.y + dirY * halfLength + ny;
            const x3 = burst.x + dirX * halfLength - nx;
            const y3 = burst.y + dirY * halfLength - ny;
            const streakAlpha = alpha * (burst.kind === "interaction-line" ? 0.95 : 0.82);
            pushQuad(trailVertices, x0, y0, x1, y1, x2, y2, x3, y3, streakAlpha, burstColor, -1, 1, 0, 1);
          }
        }
      });
      return {
        trail: trailVertices.length ? new Float32Array(trailVertices) : new Float32Array(0),
        bursts: burstVertices.length ? new Float32Array(burstVertices) : new Float32Array(0)
      };
    }
    function drawFrame(nowMs, { frozen = false } = {}) {
      if (disposed) return;
      if (!startedAt) {
        startedAt = nowMs;
      }
      const deltaSeconds = frozen ? 0 : clamp((nowMs - (lastFrameAt || nowMs)) * 0.001, 0.001, 0.04);
      lastFrameAt = nowMs;
      if (!frozen) {
        updateSimulation(deltaSeconds, nowMs);
      }
      baseRenderer.resize(cssWidth, cssHeight, dpr);
      frontRenderer.resize(cssWidth, cssHeight, dpr);
      clearGlowCanvas();
      drawGlowLayer();
      const backGeometry = buildGeometryForLayer("back");
      const frontGeometry = buildGeometryForLayer("front");
      baseRenderer.render(backGeometry.trail, backGeometry.bursts);
      frontRenderer.render(frontGeometry.trail, frontGeometry.bursts);
    }
    function resize() {
      cssWidth = Math.max(1, Math.round(window.innerWidth));
      cssHeight = Math.max(1, Math.round(window.innerHeight));
      const compactMobile = isCompactMobileLayout();
      dpr = Math.max(1, Math.min(compactMobile ? 1 : 1.25, window.devicePixelRatio || 1));
      renderWidth = Math.max(1, Math.round(cssWidth * dpr));
      renderHeight = Math.max(1, Math.round(cssHeight * dpr));
      obstaclesDirty = true;
      if (!wisps.length) {
        seedWisps();
      } else {
        wisps.forEach((wisp) => resetWisp(wisp, true));
      }
      drawFrame(performance.now(), { frozen: prefersReducedMotion });
    }
    function shouldAnimate() {
      return !prefersReducedMotion
        && !document.hidden
        && !document.body.classList.contains("site-load-playing")
        && Boolean(root?.classList.contains("state-os-ready"));
    }
    function stop() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
    function tick(nowMs) {
      rafId = 0;
      if (disposed) return;
      drawFrame(nowMs, { frozen: false });
      if (shouldAnimate()) {
        rafId = window.requestAnimationFrame(tick);
      }
    }
    function start() {
      if (rafId || !shouldAnimate()) return;
      rafId = window.requestAnimationFrame(tick);
    }
    function sync() {
      if (disposed) return;
      const motionState = prefersReducedMotion ? "frozen" : "running";
      setRendererState("webgl-wisps", motionState);
      if (prefersReducedMotion) {
        stop();
        drawFrame(performance.now(), { frozen: true });
        return;
      }
      if (shouldAnimate()) {
        start();
      } else {
        stop();
      }
    }
    function markObstaclesDirty() {
      obstaclesDirty = true;
    }
    bodyObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"]
    });
    if (root instanceof HTMLElement) {
      bodyObserver.observe(root, {
        attributes: true,
        attributeFilter: ["class"]
      });
    }
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("scroll", markObstaclesDirty, { passive: true, capture: true });
    osStage?.addEventListener("scroll", markObstaclesDirty, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resize);
      window.visualViewport.addEventListener("scroll", markObstaclesDirty);
    }
    document.addEventListener("visibilitychange", sync);
    resize();
    sync();
    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        stop();
        bodyObserver.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("scroll", markObstaclesDirty, true);
        osStage?.removeEventListener("scroll", markObstaclesDirty);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", resize);
          window.visualViewport.removeEventListener("scroll", markObstaclesDirty);
        }
        document.removeEventListener("visibilitychange", sync);
        baseRenderer.clear();
        frontRenderer.clear();
        clearGlowCanvas();
        baseRenderer.dispose();
        frontRenderer.dispose();
        frontOverlay.remove();
      }
    };
  }
  function shouldEnableCustomCursor() {
    return Boolean(window.matchMedia?.("(pointer: fine)")?.matches && window.matchMedia?.("(hover: hover)")?.matches);
  }
  function resolveCustomCursorInteractiveTarget(target) {
    if (!(target instanceof Element)) return null;
    return target.closest(CUSTOM_CURSOR_INTERACTIVE_SELECTOR);
  }
  function createSiteCursorController() {
    if (!shouldEnableCustomCursor()) return null;
    if (!(document.body instanceof HTMLElement)) return null;
    const tailPointCount = 10;
    const tailLifetimeMs = 148;
    const trailCanvasSize = 110;
    const trailSegmentSizePx = 11;
    const maxTrailSegmentsPerMove = 4;
    const trailSubdivisionCount = 1;
    const scrollMorphHoldMs = 170;
    const selectionAnimationDurationMs = 180;
    const cursorEl = document.createElement("div");
    cursorEl.className = "site-pointer";
    cursorEl.setAttribute("aria-hidden", "true");
    cursorEl.innerHTML = `
      <span class="site-pointer-trail" aria-hidden="true">
        <canvas class="site-pointer-trail-canvas" width="${trailCanvasSize}" height="${trailCanvasSize}"></canvas>
      </span>
      <span class="site-pointer-head">
        <span class="site-pointer-pool"></span>
        <span class="site-pointer-ring"></span>
        <span class="site-pointer-hand" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path class="site-pointer-hand-outline" d="M3.4 1.2v18.6l4.9-4.52 2.94 7.06 4.05-1.7-2.93-7.01h5.46Z"></path>
            <path class="site-pointer-hand-fill" d="M5.2 5.1v10.53l3.16-2.9 2.76 6.61 1.05-.44-2.76-6.61h3.9Z"></path>
          </svg>
        </span>
        <span class="site-pointer-cross" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path class="site-pointer-cross-shape" d="M6 6 18 18 M18 6 6 18"></path>
          </svg>
        </span>
        <span class="site-pointer-core"></span>
        <span class="site-pointer-arrow"></span>
      </span>
    `;
    document.body.appendChild(cursorEl);
    document.body.classList.add("has-custom-cursor");
    document.body.classList.remove("has-system-pointer");
    cursorEl.dataset.cursorMorph = "orb";
    cursorEl.dataset.cursorContrast = "light";
    const trailCanvas = cursorEl.querySelector(".site-pointer-trail-canvas");
    const trailContext = trailCanvas instanceof HTMLCanvasElement ? trailCanvas.getContext("2d") : null;
    if (!(trailCanvas instanceof HTMLCanvasElement) || !trailContext) {
      document.body.classList.remove("has-custom-cursor");
      cursorEl.remove();
      return null;
    }
    let trailCanvasDpr = 1;
    function resizeTrailCanvas() {
      trailCanvasDpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
      trailCanvas.width = Math.round(trailCanvasSize * trailCanvasDpr);
      trailCanvas.height = Math.round(trailCanvasSize * trailCanvasDpr);
      trailCanvas.style.width = `${trailCanvasSize}px`;
      trailCanvas.style.height = `${trailCanvasSize}px`;
      trailContext.setTransform(1, 0, 0, 1, 0, 0);
      trailContext.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailContext.imageSmoothingEnabled = true;
    }
    function clearTrailCanvas() {
      trailContext.setTransform(1, 0, 0, 1, 0, 0);
      trailContext.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
    }
    resizeTrailCanvas();
    let visible = false;
    let pressed = false;
    let disposed = false;
    let rafId = 0;
    let lastFrameMs = performance.now();
    let lastMoveMs = 0;
    let scrollUntilMs = 0;
    let scrollDirection = 0;
    let lastX = -120;
    let lastY = -120;
    let targetX = -120;
    let targetY = -120;
    let headX = -120;
    let headY = -120;
    let pointerEnergy = 0;
    let currentInteractiveTarget = null;
    let currentMorphToken = "orb";
    let currentContrastMode = "light";
    let selectionAnimationTimer = 0;
    let lastSelectionAnimationAt = 0;
    const trailHistory = [];
    const pointerMoveEventName = "pointermove";
    function parseCssColor(value) {
      if (typeof value !== "string" || !value) return null;
      const match = value.trim().match(/^rgba?\(([^)]+)\)$/i);
      if (!match) return null;
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length < 3) return null;
      const r = Number.parseFloat(parts[0]);
      const g = Number.parseFloat(parts[1]);
      const b = Number.parseFloat(parts[2]);
      const a = parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
      if (![r, g, b, a].every(Number.isFinite)) return null;
      return {
        r: Math.min(255, Math.max(0, Math.round(r))),
        g: Math.min(255, Math.max(0, Math.round(g))),
        b: Math.min(255, Math.max(0, Math.round(b))),
        a: Math.min(1, Math.max(0, a))
      };
    }
    function resolveColorLuminance(color) {
      if (!color) return 0;
      const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b);
    }
    function resolveCursorBackdropColor(target, x, y) {
      const candidates = [];
      if (Number.isFinite(x) && Number.isFinite(y) && typeof document.elementsFromPoint === "function") {
        candidates.push(...document.elementsFromPoint(x, y));
      }
      if (target instanceof Element && !candidates.includes(target)) {
        candidates.unshift(target);
      }
      const visited = /* @__PURE__ */ new Set();
      for (const candidate of candidates) {
        let current = candidate instanceof Element ? candidate : null;
        while (current instanceof HTMLElement && current !== document.body && !visited.has(current)) {
          visited.add(current);
          const color = parseCssColor(window.getComputedStyle(current).backgroundColor);
          if (color && color.a > 0.08) {
            return color;
          }
          current = current.parentElement;
        }
      }
      return parseCssColor(window.getComputedStyle(document.body).backgroundColor) || {
        r: 8,
        g: 8,
        b: 10,
        a: 1
      };
    }
    function syncCursorContrast(target, x = lastX, y = lastY) {
      const backdropColor = resolveCursorBackdropColor(target, x, y);
      const nextMode = resolveColorLuminance(backdropColor) >= 0.58 ? "dark" : "light";
      if (nextMode === currentContrastMode) return;
      currentContrastMode = nextMode;
      cursorEl.dataset.cursorContrast = nextMode;
    }
    function applyCursorMorph(token) {
      const safeToken = typeof token === "string" && token ? token : "orb";
      currentMorphToken = safeToken;
      cursorEl.dataset.cursorMorph = safeToken;
    }
    function trimTrailHistory(nowMs = performance.now()) {
      while (trailHistory.length > tailPointCount) {
        trailHistory.pop();
      }
      while (trailHistory.length > 2) {
        const oldestPoint = trailHistory[trailHistory.length - 1];
        if (nowMs - oldestPoint.t <= tailLifetimeMs) break;
        trailHistory.pop();
      }
    }
    function pushTrailPoint(x, y, nowMs = performance.now(), force = false) {
      const latestPoint = trailHistory[0];
      if (!latestPoint) {
        trailHistory.unshift({
          x,
          y,
          t: nowMs
        });
        return;
      }
      const dx = x - latestPoint.x;
      const dy = y - latestPoint.y;
      const distance = Math.hypot(dx, dy);
      if (!force && distance < 0.75) {
        latestPoint.x = x;
        latestPoint.y = y;
        latestPoint.t = nowMs;
        return;
      }
      const segmentCount = Math.min(maxTrailSegmentsPerMove, Math.max(1, Math.ceil(distance / trailSegmentSizePx)));
      const inserts = [];
      for (let step = 1; step <= segmentCount; step += 1) {
        const t = step / segmentCount;
        inserts.push({
          x: latestPoint.x + dx * t,
          y: latestPoint.y + dy * t,
          t: nowMs - (1 - t) * 12
        });
      }
      trailHistory.unshift(...inserts.reverse());
      trimTrailHistory(nowMs);
    }
    function sampleTrailPoints(points, subdivisionCount = 3) {
      if (points.length < 2) return points.slice();
      const sampled = [points[0]];
      for (let index = 0; index < points.length - 1; index += 1) {
        const p0 = points[Math.max(0, index - 1)];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[Math.min(points.length - 1, index + 2)];
        for (let step = 1; step <= subdivisionCount; step += 1) {
          const t = step / subdivisionCount;
          const t2 = t * t;
          const t3 = t2 * t;
          sampled.push({
            x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
          });
        }
      }
      return sampled;
    }
    function drawTrailRibbon(points, baseWidth, baseAlpha, glowBlur, glowAlpha) {
      if (points.length < 2) return;
      trailContext.save();
      trailContext.setTransform(trailCanvasDpr, 0, 0, trailCanvasDpr, trailCanvas.width * 0.5, trailCanvas.height * 0.5);
      trailContext.lineCap = "round";
      trailContext.lineJoin = "round";
      trailContext.globalCompositeOperation = "source-over";
      for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const progress = index / Math.max(1, points.length - 2);
        const taper = Math.pow(1 - progress, 0.74);
        const alpha = baseAlpha * taper;
        if (alpha <= 0.002) continue;
        trailContext.beginPath();
        trailContext.moveTo(start.x, start.y);
        trailContext.lineTo(end.x, end.y);
        trailContext.lineWidth = Math.max(0.35, baseWidth * taper);
        trailContext.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(4)})`;
        trailContext.shadowBlur = glowBlur * Math.max(0.24, taper);
        trailContext.shadowColor = `rgba(255, 255, 255, ${(glowAlpha * taper).toFixed(4)})`;
        trailContext.stroke();
      }
      trailContext.restore();
    }
    function primeCursor(x, y) {
      targetX = x;
      targetY = y;
      headX = x;
      headY = y;
      trailHistory.length = 0;
      pushTrailPoint(x, y, performance.now(), true);
      cursorEl.style.setProperty("--cursor-x", `${Math.round(x)}px`);
      cursorEl.style.setProperty("--cursor-y", `${Math.round(y)}px`);
      cursorEl.style.setProperty("--cursor-tail-opacity", "0");
      clearTrailCanvas();
    }
    function clearSelectionAnimationTimer() {
      if (!selectionAnimationTimer) return;
      window.clearTimeout(selectionAnimationTimer);
      selectionAnimationTimer = 0;
    }
    function triggerSelectionAnimation(force = false) {
      if (!visible || (!force && !(currentInteractiveTarget instanceof HTMLElement))) return;
      const now = performance.now();
      if (now - lastSelectionAnimationAt < 90) return;
      lastSelectionAnimationAt = now;
      clearSelectionAnimationTimer();
      cursorEl.classList.remove("is-selecting");
      void cursorEl.offsetWidth;
      cursorEl.classList.add("is-selecting");
      selectionAnimationTimer = window.setTimeout(() => {
        selectionAnimationTimer = 0;
        cursorEl.classList.remove("is-selecting");
      }, selectionAnimationDurationMs);
    }
    function syncPosition(x, y) {
      if (!visible) {
        primeCursor(x, y);
      }
      const now = performance.now();
      const dx = x - targetX;
      const dy = y - targetY;
      const dt = Math.max(8, now - (lastMoveMs || now - 16));
      pointerEnergy = Math.max(pointerEnergy, Math.min(1.65, Math.hypot(dx, dy) / dt));
      lastMoveMs = now;
      lastX = x;
      lastY = y;
      targetX = x;
      targetY = y;
      headX = x;
      headY = y;
      pushTrailPoint(x, y, now, true);
      cursorEl.style.setProperty("--cursor-x", `${headX.toFixed(2)}px`);
      cursorEl.style.setProperty("--cursor-y", `${headY.toFixed(2)}px`);
      if (!visible) {
        visible = true;
        cursorEl.classList.add("is-visible");
      }
    }
    function syncInteractiveTarget(target, x = lastX, y = lastY) {
      const nextTarget = resolveCustomCursorInteractiveTarget(target);
      if (nextTarget === currentInteractiveTarget) {
        if (nextTarget instanceof HTMLElement) {
          syncCursorContrast(nextTarget, x, y);
        }
        return;
      }
      currentInteractiveTarget = nextTarget instanceof HTMLElement ? nextTarget : null;
      const interactive = currentInteractiveTarget instanceof HTMLElement;
      applyCursorMorph(interactive ? "x" : "orb");
      cursorEl.classList.toggle("is-interactive", interactive);
      if (interactive) {
        syncCursorContrast(currentInteractiveTarget, x, y);
      } else if (currentContrastMode !== "light") {
        currentContrastMode = "light";
        cursorEl.dataset.cursorContrast = "light";
      }
    }
    function resolvePointerTargetAt(x, y, fallbackTarget = null) {
      if (fallbackTarget instanceof Element && fallbackTarget !== document.body && fallbackTarget !== document.documentElement) {
        return fallbackTarget;
      }
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const hitTarget = document.elementFromPoint(x, y);
        if (hitTarget) return hitTarget;
      }
      return fallbackTarget;
    }
    function refreshFromPoint() {
      if (!visible) return;
      const target = document.elementFromPoint(lastX, lastY);
      syncInteractiveTarget(target, lastX, lastY);
    }
    function syncScrollState(now = performance.now()) {
      const active = scrollDirection !== 0 && now < scrollUntilMs;
      cursorEl.classList.toggle("is-scroll", active);
      cursorEl.classList.toggle("is-scroll-up", active && scrollDirection < 0);
      cursorEl.classList.toggle("is-scroll-down", active && scrollDirection > 0);
      if (!active) {
        scrollDirection = 0;
      }
    }
    function setScrollDirectionFromWheel(deltaY) {
      if (!Number.isFinite(deltaY) || deltaY === 0) return;
      scrollDirection = deltaY > 0 ? 1 : -1;
      scrollUntilMs = performance.now() + scrollMorphHoldMs;
      pointerEnergy = Math.max(pointerEnergy, 0.48);
      syncScrollState();
    }
    function renderTrail(nowMs, deltaMs) {
      headX = targetX;
      headY = targetY;
      cursorEl.style.setProperty("--cursor-x", `${headX.toFixed(2)}px`);
      cursorEl.style.setProperty("--cursor-y", `${headY.toFixed(2)}px`);
      pointerEnergy *= Math.exp(-deltaMs * 0.018);
      syncScrollState(nowMs);
      const idleMs = Math.max(0, nowMs - lastMoveMs);
      const idleFade = clamp(Math.max(0, idleMs - 38) / 320, 0, 1);
      const motionStrength = clamp(pointerEnergy * 1.2 + (pressed ? 0.14 : 0), 0, 1);
      const suppressTail = Boolean(currentInteractiveTarget);
      if (suppressTail) {
        cursorEl.style.setProperty("--cursor-tail-opacity", "0");
        clearTrailCanvas();
        return;
      }
      if (trailHistory.length > 0) {
        trailHistory[0].x = headX;
        trailHistory[0].y = headY;
      }
      const settleStrength = clamp((idleFade * 0.1 + (pressed ? 0.01 : 0)) * deltaMs, 0, 0.24);
      if (settleStrength > 0) {
        for (let index = 1; index < trailHistory.length; index += 1) {
          const point = trailHistory[index];
          point.x += (headX - point.x) * settleStrength;
          point.y += (headY - point.y) * settleStrength;
        }
      }
      trimTrailHistory(nowMs);
      const relativePoints = trailHistory.map((point) => ({
        x: point.x - headX,
        y: point.y - headY
      }));
      const tailOpacity = clamp((0.22 + motionStrength * 0.84) * (1 - idleFade * 0.96), 0, 1);
      const coreWidth = 3.6 + motionStrength * 2.2 + (scrollDirection !== 0 ? 0.4 : 0);
      const glowWidth = 11 + motionStrength * 6 + (scrollDirection !== 0 ? 1.2 : 0);
      const sampledPoints = sampleTrailPoints(relativePoints, trailSubdivisionCount);
      cursorEl.style.setProperty("--cursor-tail-opacity", tailOpacity.toFixed(3));
      clearTrailCanvas();
      drawTrailRibbon(sampledPoints, glowWidth, tailOpacity * 0.28, 11 + motionStrength * 4, 0.24);
      drawTrailRibbon(sampledPoints, coreWidth, tailOpacity * 0.72, 5 + motionStrength * 2, 0.12);
    }
    function tick(nowMs) {
      if (disposed) return;
      const deltaMs = Math.min(34, Math.max(10, nowMs - lastFrameMs || 16.67));
      lastFrameMs = nowMs;
      if (visible) {
        renderTrail(nowMs, deltaMs);
      }
      rafId = requestAnimationFrame(tick);
    }
    function hideCursor() {
      visible = false;
      pressed = false;
      scrollDirection = 0;
      scrollUntilMs = 0;
      currentInteractiveTarget = null;
      pointerEnergy = 0;
      clearSelectionAnimationTimer();
      cursorEl.classList.remove("is-visible", "is-pressed", "is-interactive", "is-scroll", "is-scroll-up", "is-scroll-down", "is-selecting");
      applyCursorMorph("orb");
      currentContrastMode = "light";
      cursorEl.dataset.cursorContrast = "light";
    }
    function isTouchLikeCursorEvent(event) {
      return event instanceof PointerEvent && event.pointerType === "touch";
    }
    function readCursorEventPoint(event) {
      if (!(event instanceof MouseEvent || event instanceof PointerEvent)) {
        return null;
      }
      return {
        x: event.clientX,
        y: event.clientY,
        target: event.target
      };
    }
    function onPointerMove(event) {
      if (isTouchLikeCursorEvent(event)) return;
      const point = readCursorEventPoint(event);
      if (!point) return;
      syncPosition(point.x, point.y);
      syncInteractiveTarget(resolvePointerTargetAt(point.x, point.y, point.target), point.x, point.y);
    }
    function onPointerOver(event) {
      if (isTouchLikeCursorEvent(event)) return;
      const point = readCursorEventPoint(event);
      if (!point) return;
      syncInteractiveTarget(resolvePointerTargetAt(point.x, point.y, point.target), point.x, point.y);
    }
    function onPointerDown(event) {
      if (isTouchLikeCursorEvent(event)) return;
      if (!(event instanceof MouseEvent || event instanceof PointerEvent) || event.button !== 0) return;
      syncPosition(event.clientX, event.clientY);
      syncInteractiveTarget(resolvePointerTargetAt(event.clientX, event.clientY, event.target), event.clientX, event.clientY);
      pressed = true;
      cursorEl.classList.add("is-pressed");
    }
    function onPointerUp(event) {
      if (isTouchLikeCursorEvent(event)) return;
      const point = readCursorEventPoint(event);
      if (pressed) {
        pressed = false;
        cursorEl.classList.remove("is-pressed");
      }
      if (point) {
        syncInteractiveTarget(resolvePointerTargetAt(point.x, point.y, point.target), point.x, point.y);
      }
    }
    function onClick(event) {
      const actionable = resolveCustomCursorInteractiveTarget(event.target);
      if (!(actionable instanceof HTMLElement)) return;
      if (event instanceof MouseEvent && event.detail > 0) {
        syncPosition(event.clientX, event.clientY);
        syncInteractiveTarget(resolvePointerTargetAt(event.clientX, event.clientY, event.target), event.clientX, event.clientY);
      } else {
        syncInteractiveTarget(actionable, lastX, lastY);
      }
      triggerSelectionAnimation(true);
    }
    function onKeyDown(event) {
      if (!(event instanceof KeyboardEvent) || event.repeat) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      const actionable = resolveCustomCursorInteractiveTarget(event.target);
      if (!(actionable instanceof HTMLElement)) return;
      syncInteractiveTarget(actionable, lastX, lastY);
      triggerSelectionAnimation(true);
    }
    function onWheel(event) {
      setScrollDirectionFromWheel(event.deltaY);
    }
    function onWindowMouseOut(event) {
      if (event.relatedTarget) return;
      hideCursor();
    }
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") {
        hideCursor();
      }
    }
    window.addEventListener(pointerMoveEventName, onPointerMove, { passive: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true, capture: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    window.addEventListener("pointerup", onPointerUp, { passive: true, capture: true });
    window.addEventListener("pointercancel", onPointerUp, { passive: true, capture: true });
    window.addEventListener("click", onClick, { passive: true, capture: true });
    window.addEventListener("keydown", onKeyDown, { passive: true, capture: true });
    window.addEventListener("wheel", onWheel, { passive: true, capture: true });
    window.addEventListener("resize", resizeTrailCanvas, { passive: true });
    window.addEventListener("mouseout", onWindowMouseOut);
    window.addEventListener("blur", hideCursor);
    document.addEventListener("visibilitychange", onVisibilityChange);
    rafId = requestAnimationFrame(tick);
    return {
      refresh: refreshFromPoint,
      dispose() {
        if (disposed) return;
        disposed = true;
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        window.removeEventListener(pointerMoveEventName, onPointerMove);
        window.removeEventListener("pointerover", onPointerOver, true);
        window.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("pointerup", onPointerUp, true);
        window.removeEventListener("pointercancel", onPointerUp, true);
        window.removeEventListener("click", onClick, true);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("wheel", onWheel, true);
        window.removeEventListener("resize", resizeTrailCanvas);
        window.removeEventListener("mouseout", onWindowMouseOut);
        window.removeEventListener("blur", hideCursor);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        currentInteractiveTarget = null;
        clearSelectionAnimationTimer();
        document.body.classList.remove("has-system-pointer");
        document.body.classList.remove("has-custom-cursor");
        cursorEl.remove();
      }
    };
  }
  function setReadyState() {
    if (root instanceof HTMLElement) {
      root.classList.add("state-os-ready");
    }
    osStage?.setAttribute("aria-hidden", "false");
  }
  function initializeSocialHubIfNeeded() {
    if (socialHubInitialized) return;
    if (!(socialHubRoot instanceof HTMLElement)) return;
    if (!(socialHubProfile instanceof HTMLElement)) return;
    if (!(socialHubProfileTagline instanceof HTMLElement)) return;
    if (!(socialHubShowcases instanceof HTMLElement)) return;
    if (!(socialHubSidebar instanceof HTMLElement)) return;
    const dataSources = createSocialHubDataSources();
    socialHubRenderer = createSocialHubRenderer({
      sites: SOCIAL_HUB_SITES,
      root: socialHubRoot,
      profile: socialHubProfile,
      showcases: socialHubShowcases,
      sidebar: socialHubSidebar,
      profileTagline: socialHubProfileTagline,
      onRefreshRequested: () => {
        if (!socialHubState) return;
        void socialHubState.refreshAll("manual");
      }
    });
    socialHubState = createSocialHubState({
      sites: SOCIAL_HUB_SITES,
      seedPayloads: createSeedPayloadMap(),
      loadSitePayload: dataSources.loadSitePayload,
      onStateChange: (snapshot) => {
        socialHubRenderer?.render(snapshot);
        siteCursorController?.refresh?.();
      }
    });
    socialHubState.startAutoRefresh();
    socialHubInitialized = true;
  }
  function destroySocialHub() {
    socialHubState?.dispose?.();
    socialHubState = null;
    socialHubRenderer?.dispose?.();
    socialHubRenderer = null;
    socialHubInitialized = false;
  }
  function syncLayoutMode() {
    if (!socialHubInitialized || !socialHubState || !socialHubRenderer) return;
    socialHubState.startAutoRefresh();
    socialHubRenderer.render(socialHubState.snapshot(Date.now()));
    siteCursorController?.refresh?.();
  }
  async function bootstrap() {
    if (!(root instanceof HTMLElement)) return;
    applyPermanentNightTheme();
    startDocumentTitleTypewriter("Josie");
    setReadyState();
    ambientBackdropController = createAdaptiveAmbientBackdropController();
    siteCursorController = createSiteCursorController();
    await ensureHeroAvatarSelection();
    initializeSocialHubIfNeeded();
    if (compactMobileLayoutQuery) {
      if (typeof compactMobileLayoutQuery.addEventListener === "function") {
        compactMobileLayoutQuery.addEventListener("change", syncLayoutMode);
      } else if (typeof compactMobileLayoutQuery.addListener === "function") {
        compactMobileLayoutQuery.addListener(syncLayoutMode);
      }
    }
    siteCursorController?.refresh?.();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
  window.addEventListener("pagehide", () => {
    destroySocialHub();
    if (compactMobileLayoutQuery) {
      if (typeof compactMobileLayoutQuery.removeEventListener === "function") {
        compactMobileLayoutQuery.removeEventListener("change", syncLayoutMode);
      } else if (typeof compactMobileLayoutQuery.removeListener === "function") {
        compactMobileLayoutQuery.removeListener(syncLayoutMode);
      }
    }
    ambientBackdropController?.dispose?.();
    ambientBackdropController = null;
    siteCursorController?.dispose?.();
    siteCursorController = null;
  });
})();
