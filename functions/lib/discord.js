import {
  DISCORD_TIMEOUT_MS,
  DISCORD_USER_ID
} from "./config.js";
import { fetchWithTimeout } from "./response.js";

const DISCORD_NITRO_BADGE_ICON_URL = "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeDiscordStatusKey(status) {
  const normalized = normalizeText(status).toLowerCase();
  if (normalized === "online" || normalized === "idle" || normalized === "dnd" || normalized === "offline") {
    return normalized;
  }
  return "offline";
}

function formatDiscordStatusLabel(status) {
  const key = normalizeDiscordStatusKey(status);
  if (key === "dnd") return "Do Not Disturb";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function normalizeSpotifyArtist(value) {
  if (Array.isArray(value)) {
    return firstNonEmpty(value.join(", "));
  }
  return normalizeText(value);
}

function buildSpotifyTrackUrl(trackId) {
  const safeTrackId = normalizeText(trackId);
  return safeTrackId ? `https://open.spotify.com/track/${encodeURIComponent(safeTrackId)}` : "";
}

function buildDiscordAvatarUrl(userId, avatarHash) {
  const safeUserId = normalizeText(userId);
  const safeHash = normalizeText(avatarHash);
  if (!safeUserId || !safeHash) return "";
  const ext = safeHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${safeUserId}/${safeHash}.${ext}?size=256`;
}

function buildDiscordBannerUrl(userId, bannerHash) {
  const safeUserId = normalizeText(userId);
  const safeHash = normalizeText(bannerHash);
  if (!safeUserId || !safeHash) return "";
  const ext = safeHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/banners/${safeUserId}/${safeHash}.${ext}?size=640`;
}

function buildDiscordDecorationUrl(asset) {
  const safeAsset = normalizeText(asset);
  return safeAsset ? `https://cdn.discordapp.com/avatar-decoration-presets/${safeAsset}.png?size=160&passthrough=true` : "";
}

function buildCustomStatusText(activity) {
  const safeActivity = activity && typeof activity === "object" ? activity : null;
  if (!safeActivity) return "";
  const text = firstNonEmpty(safeActivity.state, safeActivity.details);
  return text;
}

function buildPrimaryActivity(activities, spotifyData, listeningToSpotify) {
  if (listeningToSpotify && spotifyData && typeof spotifyData === "object") {
    const song = firstNonEmpty(spotifyData.song);
    const artist = normalizeSpotifyArtist(spotifyData.artist);
    if (song || artist) {
      return {
        type: "listening",
        label: "Listening to",
        name: song,
        subtitle: artist ? `by ${artist}` : ""
      };
    }
  }

  const safeActivities = Array.isArray(activities) ? activities : [];
  const primary = safeActivities.find((activity) => {
    const type = Number(activity?.type);
    return type !== 4;
  }) || null;
  if (!primary) return null;

  const typeLabelMap = {
    0: "Playing",
    1: "Streaming",
    2: "Listening",
    3: "Watching",
    5: "Competing"
  };
  return {
    type: String(primary?.type ?? ""),
    label: typeLabelMap[Number(primary?.type)] || "Active in",
    name: firstNonEmpty(primary?.details, primary?.name),
    subtitle: firstNonEmpty(primary?.state)
  };
}

function buildDiscordPresence({ discordUser, activities, discordStatus, listeningToSpotify, spotifyData }) {
  const safeUser = discordUser && typeof discordUser === "object" ? discordUser : {};
  const safeActivities = Array.isArray(activities) ? activities : [];
  const safeSpotify = spotifyData && typeof spotifyData === "object" ? spotifyData : null;
  const displayName = firstNonEmpty(safeUser.display_name, safeUser.global_name, safeUser.username, "foundlifeless");
  const username = firstNonEmpty(safeUser.username, safeUser.global_name, safeUser.display_name, "foundlifeless");
  const statusKey = normalizeDiscordStatusKey(discordStatus);
  const statusLabel = formatDiscordStatusLabel(discordStatus);
  const customStatus = buildCustomStatusText(safeActivities.find((activity) => Number(activity?.type) === 4) || null);
  const hasNitro = Number(safeUser?.premium_type || 0) > 0;
  const spotifyArtist = normalizeSpotifyArtist(safeSpotify?.artist);

  return {
    displayName,
    username,
    statusKey,
    statusLabel,
    avatarUrl: buildDiscordAvatarUrl(safeUser.id, safeUser.avatar),
    avatarDecorationUrl: buildDiscordDecorationUrl(safeUser.avatar_decoration_data?.asset),
    bannerUrl: buildDiscordBannerUrl(safeUser.id, safeUser.banner),
    hasNitro,
    nitroBadgeIconUrl: hasNitro ? DISCORD_NITRO_BADGE_ICON_URL : "",
    customStatusText: customStatus,
    primaryActivity: buildPrimaryActivity(safeActivities, safeSpotify, listeningToSpotify),
    spotify: {
      isListening: Boolean(listeningToSpotify && safeSpotify),
      song: firstNonEmpty(safeSpotify?.song),
      artist: spotifyArtist,
      album: firstNonEmpty(safeSpotify?.album),
      albumArtUrl: firstNonEmpty(safeSpotify?.album_art_url),
      trackUrl: buildSpotifyTrackUrl(safeSpotify?.track_id)
    }
  };
}

export function buildDiscordProxyErrorPayload(nowMs = Date.now(), sourceStatus = "ERROR") {
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    data: {
      discord_user: {},
      activities: [],
      discord_status: "offline",
      listening_to_spotify: false,
      spotify: {},
      active_on_discord_web: false,
      active_on_discord_desktop: false,
      active_on_discord_mobile: false,
      kv: {}
    },
    presence: buildDiscordPresence({
      discordUser: {},
      activities: [],
      discordStatus: "offline",
      listeningToSpotify: false,
      spotifyData: {}
    })
  };
}

export function buildDiscordLanyardUrl(userId = DISCORD_USER_ID) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return "";
  }
  return `https://api.lanyard.rest/v1/users/${safeUserId}`;
}

export function normalizeDiscordPayload(rawPayload, nowMs = Date.now()) {
  const data = rawPayload?.data && typeof rawPayload.data === "object" ? rawPayload.data : {};
  const discordUser = data.discord_user && typeof data.discord_user === "object" ? data.discord_user : {};
  const activities = Array.isArray(data.activities) ? data.activities : [];
  const discordStatus = typeof data.discord_status === "string" ? data.discord_status : "offline";
  const listeningToSpotify = Boolean(data.listening_to_spotify);
  const spotifyData = data.spotify && typeof data.spotify === "object" ? data.spotify : {};
  const activeOnDiscordWeb = Boolean(data.active_on_discord_web);
  const activeOnDiscordDesktop = Boolean(data.active_on_discord_desktop);
  const activeOnDiscordMobile = Boolean(data.active_on_discord_mobile);
  const kv = data.kv && typeof data.kv === "object" ? data.kv : {};
  const hasLiveData = Boolean(
    Object.keys(discordUser).length
    || activities.length
    || Object.prototype.hasOwnProperty.call(data, "discord_status")
    || listeningToSpotify
    || Object.keys(spotifyData).length
  );

  return {
    sourceStatus: hasLiveData ? "OK" : "PARTIAL",
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    data: {
      discord_user: discordUser,
      activities,
      discord_status: discordStatus,
      listening_to_spotify: listeningToSpotify,
      spotify: spotifyData,
      active_on_discord_web: activeOnDiscordWeb,
      active_on_discord_desktop: activeOnDiscordDesktop,
      active_on_discord_mobile: activeOnDiscordMobile,
      kv
    },
    presence: buildDiscordPresence({
      discordUser,
      activities,
      discordStatus,
      listeningToSpotify,
      spotifyData
    })
  };
}

export async function fetchDiscordPayload(nowMs = Date.now(), options = {}) {
  const endpoint = buildDiscordLanyardUrl();
  if (!endpoint) {
    return buildDiscordProxyErrorPayload(nowMs);
  }

  const response = await fetchWithTimeout(endpoint, {
    method: "GET",
    signal: options?.signal,
    headers: {
      Accept: "application/json"
    }
  }, options?.timeoutMs ?? DISCORD_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Discord upstream failed (${response.status})`);
  }

  const payload = await response.json();
  return normalizeDiscordPayload(payload, nowMs);
}
