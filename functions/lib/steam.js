import {
  STEAM_APP_TITLE_CACHE_TTL_MS,
  STEAM_PROFILE_URL,
  STEAM_TIMEOUT_MS
} from "./config.js";
import { fetchWithTimeout } from "./response.js";

const steamAppTitleCache = new Map();

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) {
      return text;
    }
  }
  return "";
}

function resolveUrl(value, baseUrl = "") {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return "";
  }
  try {
    const parsed = new URL(candidate, baseUrl || undefined);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
  }
  return "";
}

function buildJinaMirrorUrl(targetUrl) {
  const normalized = String(targetUrl || "").trim();
  if (!normalized) {
    return "";
  }
  return `https://r.jina.ai/http://${normalized.replace(/^https?:\/\//i, "")}`;
}

async function fetchTextWithTimeout(url, timeoutMs = STEAM_TIMEOUT_MS, options = {}) {
  const response = await fetchWithTimeout(url, {
    method: "GET",
    signal: options?.signal,
    headers: {
      Accept: "text/plain, text/markdown;q=0.9, */*;q=0.8"
    }
  }, timeoutMs);
  if (!response.ok) {
    throw new Error(`Steam upstream failed (${response.status})`);
  }
  return await response.text();
}

async function fetchJinaMirrorMarkdown(targetUrl, options = {}) {
  const mirrorUrl = buildJinaMirrorUrl(targetUrl);
  if (!mirrorUrl) {
    return "";
  }
  return await fetchTextWithTimeout(mirrorUrl, options?.timeoutMs ?? STEAM_TIMEOUT_MS, options);
}

function parseMarkdownImageUrl(line) {
  const match = String(line || "").match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
  return match?.[1] ? String(match[1]).trim() : "";
}

function parseMarkdownLastUrl(line) {
  const matches = [...String(line || "").matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)];
  if (!matches.length) {
    return "";
  }
  return String(matches[matches.length - 1]?.[1] || "").trim();
}

function normalizeSteamMirrorTextLine(line) {
  return String(line || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSteamProfileUrl(rawValue = STEAM_PROFILE_URL) {
  const source = String(rawValue || "").trim();
  if (!source) {
    return STEAM_PROFILE_URL;
  }
  try {
    const asUrl = new URL(source);
    const host = asUrl.hostname.toLowerCase();
    if (host !== "steamcommunity.com" && host !== "www.steamcommunity.com") {
      return "";
    }
    const pathname = asUrl.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    if (!/^\/(id|profiles)\/[^/]+$/i.test(pathname)) {
      return "";
    }
    return `https://steamcommunity.com${pathname}/`;
  } catch {
  }
  return "";
}

function parseSteamAppId(value) {
  const match = String(value || "").match(/steamcommunity\.com\/app\/(\d+)/i);
  return match?.[1] ? match[1].trim() : "";
}

function buildSteamCapsuleArtworkUrl(appId) {
  const safeAppId = String(appId || "").trim();
  if (!safeAppId) {
    return "";
  }
  return `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${safeAppId}/capsule_184x69.jpg`;
}

function parseSteamHoursLastTwoWeeks(value) {
  const match = String(value || "").match(/([\d.,]+)\s*(?:hours|hour|hrs|hr)\s+past\s+2\s+weeks/i);
  return match?.[1] ? match[1] : "";
}

function parseSteamHoursOnRecord(value) {
  const match = String(value || "").match(/([\d.,]+)\s*(?:hours|hour|hrs|hr)\s+on\s+record/i);
  return match?.[1] ? match[1] : "";
}

function parseSteamLastPlayed(value) {
  const onMatch = String(value || "").match(/last\s+played\s+on\s+([^\n\r]+)/i);
  if (onMatch?.[1]) {
    return onMatch[1].trim();
  }
  const genericMatch = String(value || "").match(/last\s+played\s+([^\n\r]+)/i);
  if (genericMatch?.[1]) {
    return genericMatch[1].trim();
  }
  return "";
}

function formatSteamLastPlayedLabel(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return /^last played/i.test(text) ? text : `last played on ${text}`;
}

function getSteamRecentGameAppKey(item) {
  return String(item?.appId || "").trim().toLowerCase();
}

function getSteamRecentGameTitleKey(item) {
  return String(item?.title || "").trim().toLowerCase();
}

function mergeSteamRecentGamePair(primary, secondary) {
  const preferred = primary && typeof primary === "object" ? primary : {};
  const fallback = secondary && typeof secondary === "object" ? secondary : {};
  const mergedImageUrl = firstNonEmpty(preferred.imageUrl, preferred.artworkUrl, fallback.imageUrl, fallback.artworkUrl);
  return {
    ...fallback,
    ...preferred,
    id: firstNonEmpty(preferred.id, fallback.id),
    title: firstNonEmpty(preferred.title, fallback.title, "Unknown game"),
    meta: firstNonEmpty(preferred.meta, fallback.meta, "Recently played"),
    url: firstNonEmpty(preferred.url, fallback.url),
    appId: firstNonEmpty(preferred.appId, fallback.appId, parseSteamAppId(preferred.url), parseSteamAppId(fallback.url)),
    imageUrl: mergedImageUrl,
    artworkUrl: mergedImageUrl,
    hoursOnRecord: firstNonEmpty(preferred.hoursOnRecord, fallback.hoursOnRecord),
    lastPlayed: firstNonEmpty(preferred.lastPlayed, fallback.lastPlayed)
  };
}

function dedupeSteamRecentGameItems(items, maxCount = 8) {
  const sourceItems = Array.isArray(items) ? items : [];
  const result = [];
  const indexByAppKey = new Map();
  const indexByTitleKey = new Map();
  for (const rawItem of sourceItems) {
    const item = rawItem && typeof rawItem === "object" ? { ...rawItem } : null;
    if (!item) {
      continue;
    }
    const appKey = getSteamRecentGameAppKey(item);
    const titleKey = getSteamRecentGameTitleKey(item);
    const existingIndex = appKey && indexByAppKey.has(appKey)
      ? indexByAppKey.get(appKey)
      : titleKey && indexByTitleKey.has(titleKey)
        ? indexByTitleKey.get(titleKey)
        : -1;
    if (!Number.isInteger(existingIndex) || existingIndex < 0 || existingIndex >= result.length) {
      const nextIndex = result.length;
      result.push(item);
      if (appKey) {
        indexByAppKey.set(appKey, nextIndex);
      }
      if (titleKey) {
        indexByTitleKey.set(titleKey, nextIndex);
      }
    } else {
      const merged = mergeSteamRecentGamePair(result[existingIndex], item);
      result[existingIndex] = merged;
      if (appKey) {
        indexByAppKey.set(appKey, existingIndex);
      }
      if (titleKey) {
        indexByTitleKey.set(titleKey, existingIndex);
      }
    }
  }
  return result.slice(0, maxCount);
}

function parseSteamMirrorAppTitle(markdown) {
  const titleMatch = String(markdown || "").match(/Title:\s*Steam Community ::\s*(.+)/i);
  return titleMatch?.[1] ? titleMatch[1].trim() : "";
}

async function fetchSteamAppTitleFromMirror(appId, options = {}) {
  const safeAppId = String(appId || "").trim();
  if (!safeAppId) {
    return "";
  }
  const cached = steamAppTitleCache.get(safeAppId) || null;
  const nowMs = Date.now();
  if (cached?.title && nowMs - cached.fetchedAtMs <= STEAM_APP_TITLE_CACHE_TTL_MS) {
    return cached.title;
  }
  const markdown = await fetchJinaMirrorMarkdown(`https://steamcommunity.com/app/${safeAppId}`, options);
  const title = parseSteamMirrorAppTitle(markdown);
  if (title) {
    steamAppTitleCache.set(safeAppId, {
      title,
      fetchedAtMs: nowMs
    });
  }
  return title;
}

async function hydrateSteamMirrorRecentGameTitles(items, options = {}) {
  const sourceItems = Array.isArray(items) ? items : [];
  const unresolvedAppIds = [...new Set(sourceItems.map((item) => String(item?.appId || "").trim()).filter((appId) => {
    if (!appId) {
      return false;
    }
    const title = String(sourceItems.find((entry) => String(entry?.appId || "").trim() === appId)?.title || "").trim();
    return /^Steam App \d+$/i.test(title) || title === "Unknown game";
  }))];
  if (!unresolvedAppIds.length) {
    return sourceItems;
  }

  const resolvedEntries = await Promise.allSettled(
    unresolvedAppIds.map(async (appId) => [appId, await fetchSteamAppTitleFromMirror(appId, options)])
  );
  const titleByAppId = new Map(
    resolvedEntries
      .filter((entry) => entry.status === "fulfilled" && Array.isArray(entry.value) && entry.value[1])
      .map((entry) => entry.value)
  );
  if (!titleByAppId.size) {
    return sourceItems;
  }

  return sourceItems.map((item) => {
    const appId = String(item?.appId || "").trim();
    const resolvedTitle = titleByAppId.get(appId);
    if (!resolvedTitle) {
      return item;
    }
    return {
      ...item,
      title: resolvedTitle
    };
  });
}

function findSteamProfileAvatarFromMarkdown(lines, siteUrl) {
  const normalizedSiteUrl = resolveUrl(siteUrl).replace(/\/$/, "");
  for (const rawLine of lines) {
    const imageUrl = parseMarkdownImageUrl(rawLine);
    if (!/avatars\.fastly\.steamstatic\.com/i.test(imageUrl)) {
      continue;
    }
    const linkedUrl = resolveUrl(parseMarkdownLastUrl(rawLine), siteUrl).replace(/\/$/, "");
    if (linkedUrl === normalizedSiteUrl) {
      return resolveUrl(imageUrl, siteUrl);
    }
  }
  for (const rawLine of lines) {
    const imageUrl = parseMarkdownImageUrl(rawLine);
    if (/avatars\.fastly\.steamstatic\.com/i.test(imageUrl)) {
      return resolveUrl(imageUrl, siteUrl);
    }
  }
  return "";
}

function parseSteamMirrorHeader(lines, profileName, siteUrl) {
  const recentActivityIndex = lines.findIndex((line) => /Recent Activity/i.test(String(line || "").trim()));
  const headerLines = recentActivityIndex > 0 ? lines.slice(0, recentActivityIndex) : lines;
  const normalizedHeaderLines = headerLines.map((line) => normalizeSteamMirrorTextLine(line));
  const profileIndex = normalizedHeaderLines.findIndex((line) => line === profileName);
  const statusText = (
    profileIndex >= 0
      ? normalizedHeaderLines.slice(profileIndex)
      : normalizedHeaderLines
  ).find((line) => /^(Currently|Online|Offline|Away|Busy|In-Game)/i.test(line)) || "";
  const profileWindow = profileIndex >= 0
    ? normalizedHeaderLines.slice(profileIndex, Math.min(normalizedHeaderLines.length, profileIndex + 14))
    : normalizedHeaderLines;
  const level = profileWindow.find((line) => /^\d{1,3}$/.test(line)) || "";
  const bioCandidates = (
    profileIndex >= 0
      ? normalizedHeaderLines.slice(
        profileIndex + 1,
        statusText
          ? Math.max(profileIndex + 1, normalizedHeaderLines.findIndex((line, index) => index > profileIndex && line === statusText))
          : Math.min(normalizedHeaderLines.length, profileIndex + 14)
      )
      : normalizedHeaderLines
  ).filter((line) => {
    if (!line) {
      return false;
    }
    if (line === profileName || line === statusText) {
      return false;
    }
    if (/^\d{1,3}$/.test(line)) {
      return false;
    }
    if (/^#\s*Steam Community ::/i.test(line)) {
      return false;
    }
    if (/^Title:|^URL Source:|^Markdown Content:/i.test(line)) {
      return false;
    }
    if (/^(Featured Artwork Showcase|Recent Activity)$/i.test(line)) {
      return false;
    }
    if (/^(This user has also played as:?|View more info)$/i.test(line)) {
      return false;
    }
    if (/^Level\s+\d+$/i.test(line)) {
      return false;
    }
    if (/^(Badges|Games|Inventory|Screenshots|Reviews|Artwork|Groups)\b/i.test(line)) {
      return false;
    }
    if (/^\d[\d.,]*\s*(?:Members|hours?|hrs?)\b/i.test(line)) {
      return false;
    }
    return true;
  });
  const bio = bioCandidates[0] || "";

  return {
    avatarUrl: findSteamProfileAvatarFromMarkdown(lines, siteUrl),
    bio,
    level,
    statusText
  };
}

function parseSteamMirrorRecentGames(lines, siteUrl) {
  const startIndex = lines.findIndex((line) => /Recent Activity/i.test(String(line || "").trim()));
  if (startIndex < 0) {
    return {
      totalHoursLastTwoWeeks: "",
      items: []
    };
  }

  let totalHoursLastTwoWeeks = "";
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = String(lines[index] || "").trim();
    if (!line) {
      continue;
    }
    totalHoursLastTwoWeeks = parseSteamHoursLastTwoWeeks(line);
    break;
  }

  const items = [];
  let index = startIndex + 1;
  while (index < lines.length && items.length < 8) {
    const line = String(lines[index] || "").trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (/^Comments$/i.test(line)) {
      break;
    }

    const appLinkUrl = parseMarkdownLastUrl(line);
    if (!/steamcommunity\.com\/app\/\d+/i.test(appLinkUrl)) {
      index += 1;
      continue;
    }

    const appId = parseSteamAppId(appLinkUrl);
    const itemUrl = resolveUrl(appLinkUrl, siteUrl);
    const imageUrl = firstNonEmpty(resolveUrl(parseMarkdownImageUrl(line), siteUrl), buildSteamCapsuleArtworkUrl(appId));
    let hoursOnRecord = "";
    let lastPlayed = "";
    index += 1;
    while (index < lines.length) {
      const probe = String(lines[index] || "").trim();
      if (/^Comments$/i.test(probe)) {
        break;
      }
      if (/steamcommunity\.com\/app\/\d+/i.test(parseMarkdownLastUrl(probe))) {
        break;
      }
      if (!hoursOnRecord) {
        hoursOnRecord = parseSteamHoursOnRecord(probe);
      }
      if (!lastPlayed) {
        lastPlayed = formatSteamLastPlayedLabel(parseSteamLastPlayed(probe));
      }
      index += 1;
    }

    const fallbackTitle = appId ? `Steam App ${appId}` : `Steam App ${items.length + 1}`;
    const meta = [hoursOnRecord ? `${hoursOnRecord} hrs on record` : "", lastPlayed].filter(Boolean).join(" | ") || "Recently played";
    items.push({
      id: `steam-mirror-${appId || items.length}`,
      title: fallbackTitle,
      meta,
      url: itemUrl,
      appId,
      imageUrl,
      artworkUrl: imageUrl,
      hoursOnRecord,
      lastPlayed
    });

    if (/^Comments$/i.test(String(lines[index] || "").trim())) {
      break;
    }
  }

  return {
    totalHoursLastTwoWeeks,
    items: dedupeSteamRecentGameItems(items, 8)
  };
}

export function buildSteamRecentActivityPayloadFromMarkdown(markdown, profileUrl = STEAM_PROFILE_URL, nowMs = Date.now()) {
  const source = String(markdown || "");
  if (!source.trim()) {
    return null;
  }
  const lines = source.split(/\r?\n/);
  const titleMatch = source.match(/Title:\s*Steam Community ::\s*(.+)/i);
  const profileName = titleMatch?.[1] ? titleMatch[1].trim() : "";
  const header = parseSteamMirrorHeader(lines, profileName, profileUrl);
  const avatarUrl = header.avatarUrl;
  const isPrivate = /This profile is private\./i.test(source);

  if (!profileName && !avatarUrl && !isPrivate) {
    return null;
  }

  if (isPrivate) {
    return {
      profileUrl,
      stale: false,
      fetchedAt: new Date(nowMs).toISOString(),
      sourceStatus: "PARTIAL",
      profile: {
        name: firstNonEmpty(profileName, "Steam User"),
        handle: profileUrl.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
        bio: "Steam profile is private.",
        avatarUrl,
        borderImageUrl: "",
        statusText: "Private profile",
        levelBadgeLabel: "Level --"
      },
      stats: [
        { label: "Level", value: "Private" },
        { label: "Status", value: "Private profile" },
        { label: "2W Hours", value: "private" },
        { label: "Recent Games", value: "hidden" }
      ],
      items: []
    };
  }

  const recentActivity = parseSteamMirrorRecentGames(lines, profileUrl);
  const statusText = firstNonEmpty(header.statusText, "Unknown");
  const normalizedTwoWeekHours = parseSteamHoursLastTwoWeeks(recentActivity.totalHoursLastTwoWeeks) ||
    String(recentActivity.totalHoursLastTwoWeeks || "").replace(/\s*h(?:ours?|rs?)?$/i, "").trim();

  return {
    profileUrl,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    sourceStatus: profileName || avatarUrl || recentActivity.items.length ? "OK" : "PARTIAL",
    profile: {
      name: firstNonEmpty(profileName, "Steam User"),
      handle: profileUrl.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
      bio: firstNonEmpty(header.bio),
      avatarUrl,
      borderImageUrl: "",
      statusText,
      levelBadgeLabel: header.level ? `Level ${header.level}` : "Level --"
    },
    stats: [
      { label: "Level", value: firstNonEmpty(header.level, "--") },
      { label: "Status", value: statusText },
      { label: "2W Hours", value: normalizedTwoWeekHours ? `${normalizedTwoWeekHours}h` : "--" },
      { label: "Recent Games", value: String(recentActivity.items.length || 0) }
    ],
    items: recentActivity.items
  };
}

export async function fetchSteamRecentActivityPayload(nowMs = Date.now(), options = {}) {
  const profileUrl = normalizeSteamProfileUrl(STEAM_PROFILE_URL);
  if (!profileUrl) {
    throw new Error("Invalid Steam profile URL");
  }
  const markdown = await fetchJinaMirrorMarkdown(profileUrl, options);
  const payload = buildSteamRecentActivityPayloadFromMarkdown(markdown, profileUrl, nowMs);
  if (!payload) {
    throw new Error("Steam recent-activity parse failed");
  }
  const hydratedItems = await hydrateSteamMirrorRecentGameTitles(payload.items, options);
  return {
    ...payload,
    items: hydratedItems,
    stats: [
      payload.stats[0],
      payload.stats[1],
      payload.stats[2],
      { label: "Recent Games", value: String(hydratedItems.length || 0) }
    ]
  };
}
