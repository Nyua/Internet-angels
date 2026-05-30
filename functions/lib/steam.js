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

export function normalizeSteamProfileUrl(rawValue = STEAM_PROFILE_URL) {
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

function buildSteamProfileHandle(profileUrl) {
  const normalized = normalizeSteamProfileUrl(profileUrl);
  return normalized ? normalized.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "";
}

function buildSteamProfileXmlUrl(profileUrl) {
  const normalized = normalizeSteamProfileUrl(profileUrl);
  if (!normalized) {
    return "";
  }
  const url = new URL(normalized);
  url.searchParams.set("xml", "1");
  return url.toString();
}

function decodeXmlText(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }
  const namedEntities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\""
  };
  return source.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, token) => {
    const key = String(token || "").toLowerCase();
    if (Object.prototype.hasOwnProperty.call(namedEntities, key)) {
      return namedEntities[key];
    }
    if (key.startsWith("#x")) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (key.startsWith("#")) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return match;
  }).trim();
}

function readSteamXmlField(xml, tagName) {
  const safeTag = String(tagName || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!safeTag) {
    return "";
  }
  const pattern = new RegExp(`<${safeTag}\\b[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${safeTag}>`, "i");
  const match = String(xml || "").match(pattern);
  const rawValue = match?.[1] ?? match?.[2] ?? "";
  return decodeXmlText(String(rawValue).replace(/<[^>]+>/g, " "));
}

function normalizeSteamAvatarUrl(value, baseUrl = "") {
  const avatarUrl = resolveUrl(value, baseUrl);
  if (!avatarUrl) {
    return "";
  }
  try {
    const parsed = new URL(avatarUrl);
    return /avatars\.fastly\.steamstatic\.com$/i.test(parsed.hostname) ? parsed.toString() : "";
  } catch {
  }
  return "";
}

function formatSteamXmlOnlineState(state, message = "") {
  const stateMessage = String(message || "").replace(/\s+/g, " ").trim();
  if (stateMessage) {
    return stateMessage;
  }
  const normalized = String(state || "").trim().toLowerCase();
  if (normalized === "online") {
    return "Online";
  }
  if (normalized === "offline") {
    return "Offline";
  }
  if (normalized === "in-game" || normalized === "in game" || normalized === "ingame") {
    return "In-Game";
  }
  if (normalized === "away") {
    return "Away";
  }
  if (normalized === "busy") {
    return "Busy";
  }
  return normalized ? normalized.replace(/\b\w/g, (char) => char.toUpperCase()) : "";
}

export function buildSteamProfilePatchFromXml(xml, profileUrl = STEAM_PROFILE_URL) {
  const source = String(xml || "");
  if (!source.trim() || readSteamXmlField(source, "error")) {
    return null;
  }
  const normalizedProfileUrl = normalizeSteamProfileUrl(profileUrl);
  const xmlProfileUrl = normalizeSteamProfileUrl(readSteamXmlField(source, "profileURL"));
  const resolvedProfileUrl = firstNonEmpty(xmlProfileUrl, normalizedProfileUrl);
  const avatarUrl = normalizeSteamAvatarUrl(firstNonEmpty(
    readSteamXmlField(source, "avatarFull"),
    readSteamXmlField(source, "avatarMedium"),
    readSteamXmlField(source, "avatarIcon")
  ), resolvedProfileUrl);
  const name = firstNonEmpty(readSteamXmlField(source, "steamID"), readSteamXmlField(source, "realname"));
  const statusText = formatSteamXmlOnlineState(
    readSteamXmlField(source, "onlineState"),
    readSteamXmlField(source, "stateMessage")
  );
  const bio = firstNonEmpty(readSteamXmlField(source, "summary"), readSteamXmlField(source, "headline"));
  if (!name && !avatarUrl && !statusText && !resolvedProfileUrl && !bio) {
    return null;
  }
  return {
    name,
    handle: buildSteamProfileHandle(resolvedProfileUrl),
    url: resolvedProfileUrl,
    bio,
    avatarUrl,
    statusText
  };
}

async function fetchSteamProfileXml(profileUrl, options = {}) {
  const xmlUrl = buildSteamProfileXmlUrl(profileUrl);
  if (!xmlUrl) {
    return "";
  }
  const response = await fetchWithTimeout(xmlUrl, {
    method: "GET",
    signal: options?.signal,
    headers: {
      Accept: "application/xml, text/xml;q=0.9, text/html;q=0.8, */*;q=0.5",
      "User-Agent": "Mozilla/5.0 (compatible; InternetAngelBot/1.0)"
    }
  }, options?.profileTimeoutMs ?? options?.timeoutMs ?? STEAM_TIMEOUT_MS);
  if (!response.ok) {
    throw new Error(`Steam profile XML failed (${response.status})`);
  }
  return await response.text();
}

async function fetchSteamProfilePatch(profileUrl, options = {}) {
  const xml = await fetchSteamProfileXml(profileUrl, options);
  return buildSteamProfilePatchFromXml(xml, profileUrl);
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
  const levelLine = profileWindow.find((line) => /^(?:Level\s*)?\d{1,3}$/i.test(line)) || "";
  const level = levelLine.match(/\d{1,3}/)?.[0] || "";
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
  const isSteamErrorPage = /^Error$/i.test(profileName) || /The specified profile could not be found\./i.test(source);
  if (isSteamErrorPage) {
    return null;
  }
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

function buildSteamProfilePayloadFromPatch(profilePatch, profileUrl, nowMs = Date.now()) {
  const safePatch = profilePatch && typeof profilePatch === "object" ? profilePatch : {};
  const resolvedProfileUrl = firstNonEmpty(safePatch.url, normalizeSteamProfileUrl(profileUrl));
  const statusText = firstNonEmpty(safePatch.statusText, "Unknown");
  return {
    profileUrl: resolvedProfileUrl,
    stale: false,
    fetchedAt: new Date(nowMs).toISOString(),
    sourceStatus: safePatch.avatarUrl || safePatch.name ? "PARTIAL" : "ERROR",
    profile: {
      name: firstNonEmpty(safePatch.name, "Steam User"),
      handle: firstNonEmpty(safePatch.handle, buildSteamProfileHandle(resolvedProfileUrl)),
      url: resolvedProfileUrl,
      bio: firstNonEmpty(safePatch.bio),
      avatarUrl: firstNonEmpty(safePatch.avatarUrl),
      borderImageUrl: "",
      statusText,
      levelBadgeLabel: "Level --"
    },
    stats: [
      { label: "Level", value: "--" },
      { label: "Status", value: statusText },
      { label: "2W Hours", value: "--" },
      { label: "Recent Games", value: "0" }
    ],
    items: []
  };
}

function mergeSteamProfilePatch(payload, profilePatch, profileUrl) {
  if (!payload || !profilePatch) {
    return payload;
  }
  const currentProfile = payload.profile && typeof payload.profile === "object" ? payload.profile : {};
  const resolvedProfileUrl = firstNonEmpty(profilePatch.url, currentProfile.url, payload.profileUrl, normalizeSteamProfileUrl(profileUrl));
  const statusText = firstNonEmpty(profilePatch.statusText, currentProfile.statusText, "Unknown");
  const stats = Array.isArray(payload.stats) ? payload.stats.map((stat) => {
    if (!stat || typeof stat !== "object") {
      return stat;
    }
    if (String(stat.label || "").trim().toLowerCase() === "status") {
      return {
        ...stat,
        value: statusText
      };
    }
    return stat;
  }) : [];
  return {
    ...payload,
    profileUrl: resolvedProfileUrl,
    profile: {
      ...currentProfile,
      name: firstNonEmpty(profilePatch.name, currentProfile.name, "Steam User"),
      handle: firstNonEmpty(profilePatch.handle, currentProfile.handle, buildSteamProfileHandle(resolvedProfileUrl)),
      url: resolvedProfileUrl,
      bio: firstNonEmpty(currentProfile.bio, profilePatch.bio),
      avatarUrl: firstNonEmpty(profilePatch.avatarUrl, currentProfile.avatarUrl),
      borderImageUrl: firstNonEmpty(currentProfile.borderImageUrl),
      statusText,
      levelBadgeLabel: firstNonEmpty(currentProfile.levelBadgeLabel, "Level --")
    },
    stats
  };
}

function withSteamRecentGamesStat(stats, itemCount) {
  const safeStats = Array.isArray(stats) ? stats.filter((stat) => stat && typeof stat === "object") : [];
  const recentGamesIndex = safeStats.findIndex((stat) => String(stat.label || "").trim().toLowerCase() === "recent games");
  const value = String(Math.max(0, Number(itemCount) || 0));
  if (recentGamesIndex >= 0) {
    return safeStats.map((stat, index) => index === recentGamesIndex ? { ...stat, value } : stat);
  }
  return [
    ...safeStats,
    { label: "Recent Games", value }
  ];
}

export async function fetchSteamRecentActivityPayload(nowMs = Date.now(), options = {}) {
  const profileUrl = normalizeSteamProfileUrl(options?.profileUrl || STEAM_PROFILE_URL);
  if (!profileUrl) {
    throw new Error("Invalid Steam profile URL");
  }
  const [markdownResult, profilePatchResult] = await Promise.allSettled([
    fetchJinaMirrorMarkdown(profileUrl, options),
    fetchSteamProfilePatch(profileUrl, options)
  ]);
  let payload = null;
  let markdownError = null;
  if (markdownResult.status === "fulfilled") {
    payload = buildSteamRecentActivityPayloadFromMarkdown(markdownResult.value, profileUrl, nowMs);
  } else {
    markdownError = markdownResult.reason;
  }
  const profilePatch = profilePatchResult.status === "fulfilled" ? profilePatchResult.value : null;
  if (!payload && profilePatch) {
    payload = buildSteamProfilePayloadFromPatch(profilePatch, profileUrl, nowMs);
  }
  if (!payload) {
    throw markdownError instanceof Error ? markdownError : new Error("Steam recent-activity parse failed");
  }
  payload = mergeSteamProfilePatch(payload, profilePatch, profileUrl);
  const hydratedItems = await hydrateSteamMirrorRecentGameTitles(payload.items, options);
  return {
    ...payload,
    items: hydratedItems,
    stats: withSteamRecentGamesStat(payload.stats, hydratedItems.length)
  };
}
