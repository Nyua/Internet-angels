import {
  DISCORD_TIMEOUT_MS,
  DISCORD_USER_ID
} from "./config.js";
import { fetchWithTimeout } from "./response.js";

export function buildDiscordProxyErrorPayload(nowMs = Date.now(), sourceStatus = "ERROR") {
  return {
    sourceStatus,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    data: {
      discord_user: {},
      activities: [],
      discord_status: "offline"
    }
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
  const hasLiveData = Boolean(
    Object.keys(discordUser).length
    || activities.length
    || Object.prototype.hasOwnProperty.call(data, "discord_status")
  );

  return {
    sourceStatus: hasLiveData ? "OK" : "PARTIAL",
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    data: {
      discord_user: discordUser,
      activities,
      discord_status: discordStatus
    }
  };
}

export async function fetchDiscordPayload(nowMs = Date.now()) {
  const endpoint = buildDiscordLanyardUrl();
  if (!endpoint) {
    return buildDiscordProxyErrorPayload(nowMs);
  }

  const response = await fetchWithTimeout(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  }, DISCORD_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(`Discord upstream failed (${response.status})`);
  }

  const payload = await response.json();
  return normalizeDiscordPayload(payload, nowMs);
}
