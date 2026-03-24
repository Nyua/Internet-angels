// Editable live client source. This is the file the build now promotes to josie.client.js.
(() => {
  var define_import_meta_env_default = {};
  var root = document.querySelector(".corner-shell");
  var osStage = document.querySelector("#os-stage");
  var osAmbientBackdrop = document.querySelector("#os-ambient-backdrop");
  var osAmbientCanvas = document.querySelector("#os-ambient-canvas");
  var socialHubRoot = document.querySelector("#social-hub-root");
  var socialHubProfile = document.querySelector("#social-hub-profile");
  var socialHubShowcases = document.querySelector("#social-hub-showcases");
  var socialHubSidebar = document.querySelector("#social-hub-sidebar");
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
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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
    isNowPlaying = false
  }) {
    const safeTitle = firstNonEmpty(title, "Unknown track");
    const safeArtist = firstNonEmpty(normalizeLastFmArtistLabel(artist), "Unknown artist");
    const safeCountLabel = firstNonEmpty(countLabel, "recent");
    const safeAlbum = String(album || "").replace(/\s+/g, " ").trim();
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
        isNowPlaying: nowPlaying
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
      isNowPlaying: true
    });
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
    steam: "/api/steam-recent-activity"
  };
  function buildProxyEndpoint(pathname) {
    return new URL(String(pathname || "/"), window.location.origin).toString();
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
      return mergePayload(previous, now, {
        profile: {
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
        },
        stats: [
          { label: "Status", value: firstNonEmpty(statusText, "Unknown") },
          { label: "Presence Source", value: statusSource ? presenceSource : "Unavailable" },
          { label: "Activities", value: String(activityItems.length || activities.length || 0) }
        ],
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
      const sections = {
        currentlyListening,
        recentTracks,
        topArtists,
        topAlbums,
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
  var SHUFFLE_ANALYSER_FFT_SIZE = 2048;
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
    const preferredTitle = "touch the sky";
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
    let progressFillEl = null;
    let timeRemainingEl = null;
    let compactPlayerMode = false;
    let resizeObserver = null;
    let manifestPromise = null;
    let previewCtx = null;
    let mediaSourceNode = null;
    let analyserNode = null;
    let analyserSamples = new Float32Array(0);
    let waveformTracks = [];
    let currentTrack = null;
    let traceValues = new Float32Array(0);
    let traceSmoothingValues = new Float32Array(0);
    let rafId = 0;
    let loadState = "loading";
    let playbackUnlocked = !document.body?.classList.contains("site-load-playing");
    let siteLoadWaitPromise = null;
    let siteLoadClassObserver = null;
    let initialTrackQueued = false;
    let reactiveBeat = 0;
    let reactiveFlash = 0;
    const audioEl = new Audio();
    const WAVE_BLEED_X = 72;
    const WAVE_BLEED_TOP = 48;
    const WAVE_BLEED_BOTTOM = 72;
    audioEl.preload = "auto";
    audioEl.playsInline = true;
    audioEl.crossOrigin = "anonymous";
    audioEl.volume = 0.92;
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
      getReactiveTargets().forEach((target) => {
        target.style.setProperty("--shuffle-beat", reactiveBeat.toFixed(3));
        target.style.setProperty("--shuffle-flash", reactiveFlash.toFixed(3));
        target.style.setProperty("--shuffle-glow-opacity", glowOpacity.toFixed(3));
        target.style.setProperty("--shuffle-frost-opacity", frostOpacity.toFixed(3));
        target.style.setProperty("--shuffle-aura-blur", `${auraBlur.toFixed(1)}px`);
        target.style.setProperty("--shuffle-drift", `${drift.toFixed(2)}px`);
      });
    }
    function measureReactivePulse() {
      if (audioEl.paused || !(analyserNode instanceof AnalyserNode) || !analyserSamples.length) {
        return { beat: 0, flash: 0 };
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
        )
      };
    }
    function syncUi() {
      if (titleEl instanceof HTMLElement) {
        titleEl.textContent = currentTrack?.title || (loadState === "error" ? "Shuffle unavailable" : "Loading Shuffle...");
      }
      if (artistEl instanceof HTMLElement) {
        artistEl.textContent = currentTrack?.artist || (loadState === "error" ? "No artist data" : "Unknown Artist");
      }
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
    }
    function isSiteLoadPending() {
      return Boolean(document.body?.classList.contains("site-load-playing"));
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
      if (!(wavePortal instanceof HTMLDivElement)) {
        wavePortal = document.createElement("div");
        wavePortal.className = "josie-audio-player-bleed-layer";
        wavePortal.setAttribute("aria-hidden", "true");
        wavePortal.hidden = true;
      }
      if (!(waveCanvas instanceof HTMLCanvasElement)) {
        waveCanvas = document.createElement("canvas");
        waveCanvas.className = "josie-audio-player-wave";
        waveCanvas.setAttribute("aria-hidden", "true");
        wavePortal.appendChild(waveCanvas);
      }
      if (!wavePortal.isConnected) {
        document.body.appendChild(wavePortal);
      }
      if (!(waveCtx instanceof CanvasRenderingContext2D)) {
        waveCtx = waveCanvas.getContext("2d");
      }
    }
    function hideWavePortal() {
      if (wavePortal instanceof HTMLElement) {
        wavePortal.hidden = true;
      }
    }
    function syncWavePortalLayout() {
      ensureWavePortal();
      if (!(wavePortal instanceof HTMLElement) || !(waveSurface instanceof HTMLElement)) return null;
      const rect = waveSurface.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {
        hideWavePortal();
        return null;
      }
      const bleedX = Math.max(WAVE_BLEED_X, Math.round(rect.width * 0.055));
      const bleedTop = Math.max(WAVE_BLEED_TOP, Math.round(rect.height * 0.34));
      const bleedBottom = Math.max(WAVE_BLEED_BOTTOM, Math.round(rect.height * 0.5));
      const canvasWidth = Math.round(rect.width + bleedX * 2);
      const canvasHeight = Math.round(rect.height + bleedTop + bleedBottom);
      wavePortal.hidden = false;
      wavePortal.style.left = `${Math.round(rect.left - bleedX)}px`;
      wavePortal.style.top = `${Math.round(rect.top - bleedTop)}px`;
      wavePortal.style.width = `${canvasWidth}px`;
      wavePortal.style.height = `${canvasHeight}px`;
      return {
        canvasWidth,
        canvasHeight,
        drawLeft: bleedX,
        drawTop: bleedTop,
        drawWidth: Math.round(rect.width),
        drawHeight: Math.round(rect.height)
      };
    }
    function ensureWaveCanvasSize() {
      const layout = syncWavePortalLayout();
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
      const dpr = Math.max(1, window.devicePixelRatio || 1);
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
        analyserNode.fftSize = SHUFFLE_ANALYSER_FFT_SIZE;
        analyserNode.smoothingTimeConstant = 0.34;
        mediaSourceNode.connect(analyserNode);
        analyserNode.connect(ctx.destination);
      }
      if (!(analyserSamples instanceof Float32Array) || analyserSamples.length !== analyserNode.fftSize) {
        analyserSamples = new Float32Array(analyserNode.fftSize);
      }
      return analyserNode;
    }
    function drawTrace() {
      const metrics = ensureWaveCanvasSize();
      if (!(waveCtx instanceof CanvasRenderingContext2D) || !metrics.drawWidth || !metrics.drawHeight) return;
      const canvasWidth = metrics.canvasWidth;
      const canvasHeight = metrics.canvasHeight;
      const originX = metrics.drawLeft;
      const originY = metrics.drawTop;
      const width = metrics.drawWidth;
      const height = metrics.drawHeight;
      if (!(traceValues instanceof Float32Array) || traceValues.length !== width) {
        traceValues = new Float32Array(width);
      }
      if (!(traceSmoothingValues instanceof Float32Array) || traceSmoothingValues.length !== width) {
        traceSmoothingValues = new Float32Array(width);
      }
      const shouldSampleLive = Boolean(!audioEl.paused && analyserNode instanceof AnalyserNode);
      let peak = 0;
      let transientPeak = 0;
      if (shouldSampleLive && analyserSamples.length) {
        analyserNode.getFloatTimeDomainData(analyserSamples);
        let filteredValue = 0;
        for (let x = 0; x < width; x += 1) {
          const sampleIndex = Math.min(analyserSamples.length - 1, Math.floor(x / Math.max(width - 1, 1) * (analyserSamples.length - 1)));
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
          traceValues[x] = clamp2(Math.sign(filteredValue) * Math.tanh(shapedMagnitude * 2.35), -1, 1);
        }
      }
      const structureHold = clamp2(
        Math.max(0, peak - 0.46) * 1.08 +
        Math.max(0, transientPeak - 0.24) * 1.42,
        0,
        1
      );
      if (structureHold > 0.01 && width > 4) {
        const blend = structureHold * 0.76;
        for (let x = 0; x < width; x += 1) {
          const center = traceValues[x] || 0;
          const left = traceValues[Math.max(0, x - 1)] || center;
          const right = traceValues[Math.min(width - 1, x + 1)] || center;
          const farLeft = traceValues[Math.max(0, x - 3)] || left;
          const farRight = traceValues[Math.min(width - 1, x + 3)] || right;
          const spine = (left + center + right) / 3;
          const structure = (farLeft * 0.8 + left * 1.15 + center * 1.5 + right * 1.15 + farRight * 0.8) / 5.4;
          traceSmoothingValues[x] = center * (1 - blend) + (spine * 0.42 + structure * 0.58) * blend;
        }
        traceValues.set(traceSmoothingValues);
      }
      let rms = 0;
      for (let x = 0; x < width; x += 1) {
        const value = traceValues[x] || 0;
        rms += value * value;
      }
      rms = Math.sqrt(rms / Math.max(width, 1));
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
      const amplitude = Math.min(desiredAmplitude, maxAmplitude);
      baselineY = clamp2(baselineY, overscanPad + amplitude, height - overscanPad - amplitude);
      const edgeFadeWidth = Math.max(16, Math.round(width * 0.065));
      const resolveEdgeFade = (index) => {
        if (edgeFadeWidth <= 0) return 1;
        const left = clamp2(index / edgeFadeWidth, 0, 1);
        const right = clamp2((width - 1 - index) / edgeFadeWidth, 0, 1);
        const leftSmooth = left * left * (3 - 2 * left);
        const rightSmooth = right * right * (3 - 2 * right);
        return Math.min(leftSmooth, rightSmooth);
      };
      waveCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      waveCtx.strokeStyle = "rgba(248, 253, 255, 0.08)";
      waveCtx.lineWidth = 1;
      waveCtx.beginPath();
      waveCtx.moveTo(originX, baselineY + originY);
      waveCtx.lineTo(originX + width, baselineY + originY);
      waveCtx.stroke();
      waveCtx.save();
      waveCtx.shadowColor = "rgba(228, 248, 255, 0.95)";
      waveCtx.shadowBlur = 16 + impact * 18 + peakSurge * (8 * structureDamping) + absolutePeakSurge * (6 * structureDamping);
      waveCtx.lineWidth = 2.1 + impact * 1.9 + peakSurge * (0.7 * structureDamping) + absolutePeakSurge * (0.58 * structureDamping);
      waveCtx.lineCap = "round";
      waveCtx.lineJoin = "round";
      waveCtx.strokeStyle = `rgba(229, 248, 255, ${Math.min(0.44 + impact * 0.56 + peakSurge * 0.04 + absolutePeakSurge * 0.03, 0.98)})`;
      waveCtx.beginPath();
      waveCtx.moveTo(originX, baselineY + originY);
      for (let x = 0; x < width; x += 1) {
        const value = (traceValues[x] || 0) * resolveEdgeFade(x);
        const y = originY + baselineY - value * amplitude;
        waveCtx.lineTo(originX + x, y);
      }
      waveCtx.lineTo(originX + width - 1, baselineY + originY);
      waveCtx.stroke();
      waveCtx.restore();
      waveCtx.lineWidth = 1.2;
      waveCtx.lineCap = "round";
      waveCtx.lineJoin = "round";
      waveCtx.strokeStyle = "#f8fdff";
      waveCtx.beginPath();
      waveCtx.moveTo(originX, baselineY + originY);
      for (let x = 0; x < width; x += 1) {
        const value = (traceValues[x] || 0) * resolveEdgeFade(x);
        const y = originY + baselineY - value * amplitude;
        waveCtx.lineTo(originX + x, y);
      }
      waveCtx.lineTo(originX + width - 1, baselineY + originY);
      waveCtx.stroke();
    }
    function renderLoop(nowMs) {
      if (disposed) return;
      const pulseMetrics = measureReactivePulse();
      syncReactiveVisuals(pulseMetrics.beat, pulseMetrics.flash);
      if (playerRoot && playbackUnlocked && !compactPlayerMode) {
        drawTrace();
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
      progressFillEl = root2.querySelector("[data-shuffle-progress-fill]");
      timeRemainingEl = root2.querySelector("[data-shuffle-time]");
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
          ensureWaveCanvasSize();
        });
        resizeObserver.observe(playerRoot);
        if (waveSurface instanceof HTMLElement) {
          resizeObserver.observe(waveSurface);
        }
      }
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
      playerRoot = null;
      waveSurface = null;
      hideWavePortal();
      traceValues = new Float32Array(0);
      traceSmoothingValues = new Float32Array(0);
      titleEl = null;
      artistEl = null;
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
    function dispose() {
      if (disposed) return;
      disposed = true;
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
      dispose
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
  function renderHeroDescriptionMarkup(bioText) {
    return escapeHtml(HERO_DESCRIPTION_TEXT);
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
    const heroDescription = compact ? "" : renderHeroDescriptionMarkup(hero?.profile?.bio);
    return `
    <section class="steam-hero-shell" aria-label="Profile hero">
      <div class="steam-hero-content">
        <div class="steam-hero-avatar-wrap${decorationUrl ? " steam-hero-avatar-wrap--decorated" : ""}">
          ${avatarUrl ? `<img class="steam-hero-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" decoding="async" />` : '<div class="steam-hero-avatar steam-hero-avatar--fallback">A</div>'}
          ${decorationUrl ? `<img class="steam-hero-avatar-decoration" src="${escapeHtml(decorationUrl)}" alt="" loading="eager" decoding="async" aria-hidden="true" />` : ""}
        </div>
        <div class="steam-hero-copy">
          <h2 class="steam-hero-name">${heroName}</h2>
          <div class="steam-hero-ornament" aria-hidden="true">${heroOrnament}</div>
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
    const itemUrl = sanitizeUrl(row.url);
    const imageUrl = sanitizeUrl(row.imageUrl);
    const buttonAttrs = itemUrl ? ` data-item-url="${escapeHtml(itemUrl)}"` : "";
    const itemClass = isNowPlaying ? "lastfm-recent-item lastfm-recent-item--now-playing" : "lastfm-recent-item";
    const ageLabel = firstNonEmpty(row.countLabel, "--");
    return `
        <li class="${itemClass}">
            <button class="social-item-button lastfm-recent-button" type="button"${buttonAttrs}>
              <span class="lastfm-recent-art">
                ${imageUrl ? `<img class="lastfm-recent-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" />` : '<span class="lastfm-recent-note" aria-hidden="true">\u266A</span>'}
              </span>
              <span class="lastfm-recent-title">${escapeHtml(row.title || "Unknown track")}</span>
              <span class="lastfm-recent-meta">${escapeHtml(row.subtitle || row.meta || "Unknown artist")}</span>
              <span class="lastfm-recent-side">
                ${isNowPlaying ? '<span class="lastfm-now-playing-badge" aria-label="Now Playing"><span class="lastfm-now-playing-bars" aria-hidden="true"><span class="lastfm-now-playing-bar"></span><span class="lastfm-now-playing-bar"></span><span class="lastfm-now-playing-bar"></span></span><span class="lastfm-now-playing-label">Now Playing</span></span>' : `<span class="lastfm-recent-age">${escapeHtml(ageLabel)}</span>`}
              </span>
            </button>
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
    return `
    <ul class="lastfm-recent-list">
      ${nowPlaying ? renderLastFmRecentTrackRow(nowPlaying, { isNowPlaying: true }) : ""}
      ${visibleEntries.map((item) => renderLastFmRecentTrackRow(item)).join("")}
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
      const buttonAttrs = itemUrl ? ` data-item-url="${escapeHtml(itemUrl)}"` : "";
      return `
          <li class="lastfm-media-item">
            <button class="social-item-button lastfm-media-button" type="button"${buttonAttrs}>
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
    const profileTotals = sections.profileTotals && typeof sections.profileTotals === "object" ? sections.profileTotals : {};
    return `
    <article class="steam-showcase steam-showcase--${escapeHtml(site.id)} steam-showcase--lastfm-chart steam-showcase--lastfm-minimal" data-site-id="${escapeHtml(site.id)}" data-showcase-variant="lastfm-sections">
      <div class="steam-showcase-body steam-showcase-body--single steam-showcase-body--lastfm-minimal">
        <section class="steam-showcase-content steam-showcase-content--full steam-showcase-content--lastfm-minimal">
          <div class="lastfm-sections">
            <section class="lastfm-section">
              ${renderLastFmProfileTotals(profileTotals)}
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
          <div class="josie-audio-player-copy">
            <p class="josie-audio-player-title" data-shuffle-title>Loading Shuffle...</p>
            <p class="josie-audio-player-artist" data-shuffle-artist>Unknown Artist</p>
          </div>
        </div>
      </div>
    </div>
  `;
  }
  function renderJosieDescriptionShowcase() {
    return `
    <article class="steam-showcase steam-showcase--josie-intro steam-showcase--shuffle-player" data-site-id="josie" data-showcase-variant="josie-description">
      <div class="steam-showcase-body steam-showcase-body--single">
        <section class="steam-showcase-content steam-showcase-content--full josie-intro-content">
          ${renderShufflePlayerMarkup()}
        </section>
      </div>
    </article>
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
  function renderSidebar(payloadById, sites) {
    const rows = sites.map((site) => {
      const payload = ensurePayload(site, payloadById.get(site.id));
      const openUrl = sanitizeUrl(payload.profile?.url || site.url);
      const onlineState = resolveLinkOnlineState(site.id, payload);
      const statusDot = onlineState === null ? "" : `<span class="steam-link-status-dot steam-link-status-dot--${onlineState ? "online" : "offline"}" aria-hidden="true" title="${onlineState ? "Online" : "Offline"}"></span>`;
      const siteLabel = escapeHtml(SITE_THEME_LABEL[site.id] || site.label);
      const iconMarkup = `<span class="steam-sidebar-site-icon-shell${onlineState === null ? "" : " steam-sidebar-site-icon-shell--status"}">${renderSidebarSiteIcon(site.id)}${statusDot}</span>`;
      const linkMarkup = openUrl ? `<a class="steam-sidebar-link" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer">${siteLabel}</a>` : `<span class="steam-sidebar-link">${siteLabel}</span>`;
      return `
      <li class="steam-sidebar-row steam-sidebar-row--${escapeHtml(site.id)}"${openUrl ? ` data-open-url="${escapeHtml(openUrl)}"` : ""}>
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
    <section class="steam-sidebar-panel">
      <h3 class="steam-sidebar-title">Profile Links:</h3>
      <ul class="steam-sidebar-list">
        ${rows}
      </ul>
      <div class="cinna-mobile-gif-wrap" aria-hidden="true">
        <img class="cinna-mobile-gif" src="/${randomCinna}" alt="" loading="lazy" decoding="async" />
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
    lastRefreshLabel,
    refreshButton,
    onRefreshRequested
  }) {
    let disposed = false;
    const shufflePlayerController = createShufflePlayerController();
    let externalPromptRoot = null;
    let externalPromptUrlEl = null;
    let externalPromptCancelButton = null;
    let externalPromptAcceptButton = null;
    let pendingExternalUrl = "";
    let lastFocusedTrigger = null;
    let mobileAudioDock = null;
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
    function launchExternal(url, target = "_blank") {
      const safeUrl = sanitizeUrl(url);
      if (!safeUrl) return;
      if (target === "_blank") {
        window.open(safeUrl, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = safeUrl;
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
          hideExternalPrompt();
          return;
        }
        if (target.closest("[data-external-confirm-accept]")) {
          const targetUrl = pendingExternalUrl;
          hideExternalPrompt();
          launchExternal(targetUrl, "_self");
        }
        if (target.closest("[data-external-confirm-new-tab]")) {
          const targetUrl = pendingExternalUrl;
          hideExternalPrompt();
          launchExternal(targetUrl, "_blank");
        }
      });
      dialog.addEventListener("keydown", (event) => {
        if (!(event instanceof KeyboardEvent)) return;
        if (event.key === "Escape") {
          event.preventDefault();
          hideExternalPrompt();
          return;
        }
        if (event.key === "Enter") {
          const targetUrl = pendingExternalUrl;
          if (!targetUrl) return;
          event.preventDefault();
          hideExternalPrompt();
          launchExternal(targetUrl, "_self");
        }
      });
      return dialog;
    }
    function hideExternalPrompt() {
      if (!(externalPromptRoot instanceof HTMLElement)) return;
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
      const dialog = ensureExternalPrompt();
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
    function onRootClick(event) {
      if (disposed) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
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
      profile.innerHTML = renderHero(payloadById, sites, { compact: compactMobile });
      if (compactMobile) {
        showcases.innerHTML = "";
        showcases.hidden = true;
      } else {
        showcases.hidden = false;
        showcases.innerHTML = [
          renderJosieDescriptionShowcase(),
          ...showcaseSites.map((site) => renderSiteShowcase(site, payloadById.get(site.id)))
        ].join("");
      }
      const shuffleRoot = compactMobile ? syncMobileAudioDock(true) : (syncMobileAudioDock(false), showcases.querySelector("[data-shuffle-player]"));
      shufflePlayerController?.attach(shuffleRoot);
      sidebar.innerHTML = renderSidebar(payloadById, sites);
      if (lastRefreshLabel instanceof HTMLElement) {
        const refreshText = formatTimestamp(snapshot?.lastRefreshAt);
        const summary = snapshot?.summary || { ok: 0, partial: 0, failed: 0 };
        lastRefreshLabel.textContent = `Last refresh: ${refreshText} | OK ${summary.ok} | Partial ${summary.partial} | Failed ${summary.failed}`;
      }
      if (refreshButton instanceof HTMLButtonElement) {
        refreshButton.disabled = Boolean(snapshot?.refreshAllInProgress);
        refreshButton.textContent = snapshot?.refreshAllInProgress ? "Refreshing..." : "Refresh All";
      }
    }
    if (root2 instanceof HTMLElement) {
      root2.setAttribute("data-social-hub-ready", "true");
    }
    root2?.addEventListener("click", onRootClick);
    refreshButton?.addEventListener("click", onRefreshClick);
    function dispose() {
      if (disposed) return;
      disposed = true;
      hideExternalPrompt();
      externalPromptRoot?.remove();
      externalPromptRoot = null;
      externalPromptUrlEl = null;
      externalPromptCancelButton = null;
      externalPromptAcceptButton = null;
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
    if (!(osAmbientCanvas instanceof HTMLCanvasElement)) return null;
    const ctx = osAmbientCanvas.getContext("2d", { alpha: true, desynchronized: true });
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
      ctx.clearRect(0, 0, osAmbientCanvas.width, osAmbientCanvas.height);
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
      if (osAmbientCanvas.width !== renderWidth || osAmbientCanvas.height !== renderHeight) {
        osAmbientCanvas.width = renderWidth;
        osAmbientCanvas.height = renderHeight;
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
      if (osAmbientCanvas.width !== renderWidth || osAmbientCanvas.height !== renderHeight) {
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
        <span class="site-pointer-core"></span>
        <span class="site-pointer-arrow"></span>
      </span>
    `;
    document.body.appendChild(cursorEl);
    document.body.classList.add("has-custom-cursor");
    const trailCanvas = cursorEl.querySelector(".site-pointer-trail-canvas");
    const trailContext = trailCanvas instanceof HTMLCanvasElement ? trailCanvas.getContext("2d") : null;
    if (!(trailCanvas instanceof HTMLCanvasElement) || !trailContext) {
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
    const trailHistory = [];
    const pointerMoveEventName = "pointermove";
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
      trailContext.globalCompositeOperation = "lighter";
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
    function syncInteractiveTarget(target) {
      const nextTarget = resolveCustomCursorInteractiveTarget(target);
      if (nextTarget === currentInteractiveTarget) return;
      currentInteractiveTarget = nextTarget;
      cursorEl.classList.toggle("is-interactive", Boolean(currentInteractiveTarget));
      document.body.classList.toggle("has-system-pointer", Boolean(currentInteractiveTarget));
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
      syncInteractiveTarget(target);
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
      const tailOpacity = clamp((0.12 + motionStrength * 0.72) * (1 - idleFade * 0.98), 0, 0.88);
      const coreWidth = 3.6 + motionStrength * 2.2 + (scrollDirection !== 0 ? 0.4 : 0);
      const glowWidth = 11 + motionStrength * 6 + (scrollDirection !== 0 ? 1.2 : 0);
      const sampledPoints = sampleTrailPoints(relativePoints, trailSubdivisionCount);
      cursorEl.style.setProperty("--cursor-tail-opacity", tailOpacity.toFixed(3));
      clearTrailCanvas();
      drawTrailRibbon(sampledPoints, glowWidth, tailOpacity * 0.14, 8 + motionStrength * 3, 0.08);
      drawTrailRibbon(sampledPoints, coreWidth, tailOpacity * 0.4, 3 + motionStrength * 1.5, 0.04);
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
      cursorEl.classList.remove("is-visible", "is-pressed", "is-interactive", "is-scroll", "is-scroll-up", "is-scroll-down");
      document.body.classList.remove("has-system-pointer");
    }
    function onPointerMove(event) {
      if (!(event instanceof PointerEvent)) return;
      if (event.pointerType === "touch") return;
      syncPosition(event.clientX, event.clientY);
      syncInteractiveTarget(resolvePointerTargetAt(event.clientX, event.clientY, event.target));
    }
    function onPointerOver(event) {
      if (!(event instanceof PointerEvent)) return;
      if (event.pointerType === "touch") return;
      syncInteractiveTarget(resolvePointerTargetAt(event.clientX, event.clientY, event.target));
    }
    function onPointerDown(event) {
      if (!(event instanceof PointerEvent)) return;
      if (event.pointerType === "touch" || event.button !== 0) return;
      syncPosition(event.clientX, event.clientY);
      syncInteractiveTarget(resolvePointerTargetAt(event.clientX, event.clientY, event.target));
      pressed = true;
      cursorEl.classList.add("is-pressed");
    }
    function onPointerUp(event) {
      if (!(event instanceof PointerEvent)) return;
      if (event.pointerType === "touch") return;
      if (pressed) {
        pressed = false;
        cursorEl.classList.remove("is-pressed");
      }
      syncInteractiveTarget(resolvePointerTargetAt(event.clientX, event.clientY, event.target));
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
        window.removeEventListener("wheel", onWheel, true);
        window.removeEventListener("resize", resizeTrailCanvas);
        window.removeEventListener("mouseout", onWindowMouseOut);
        window.removeEventListener("blur", hideCursor);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.body.classList.remove("has-custom-cursor");
        document.body.classList.remove("has-system-pointer");
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
    if (!(socialHubShowcases instanceof HTMLElement)) return;
    if (!(socialHubSidebar instanceof HTMLElement)) return;
    const dataSources = createSocialHubDataSources();
    socialHubRenderer = createSocialHubRenderer({
      sites: SOCIAL_HUB_SITES,
      root: socialHubRoot,
      profile: socialHubProfile,
      showcases: socialHubShowcases,
      sidebar: socialHubSidebar,
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
    setReadyState();
    ambientBackdropController = createAmbientBackdropController();
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
