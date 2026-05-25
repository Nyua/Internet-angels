import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { writeShuffleManifest } from "./shuffle-manifest.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const siteDir = path.join(rootDir, "site");
const distDir = path.join(rootDir, "dist");
const appSourcePath = path.join(siteDir, "josie.app.js");
const clientOutputPath = path.join(distDir, "josie.client.js");
const appOutputPath = path.join(distDir, "josie.app.js");
const headersPath = path.join(distDir, "_headers");
const avatarManifestPath = path.join(distDir, "assets", "avatar-manifest.json");
const shuffleManifestPath = path.join(distDir, "assets", "shuffle-manifest.json");
const steamRecentActivitySnapshotPath = path.join(siteDir, "assets", "steam-recent-activity-snapshot.json");
const josieHtmlPath = path.join(distDir, "josie.html");
const josieDirectoryIndexPath = path.join(distDir, "josie", "index.html");
const maxPagesAssetBytes = 25 * 1024 * 1024;
const allowOversizedAssets = process.argv.includes("--allow-oversized-assets");
const rawSourceVideoPattern = /\(\s*1080p\s*,\s*h264\s*\)/i;
const deployMediaExtensions = /* @__PURE__ */ new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".m4v",
  ".mov",
  ".mp4",
  ".webm"
]);
const avatarExtensions = /* @__PURE__ */ new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp"
]);

const headersFile = `/*.html
  Cache-Control: no-cache, max-age=0, must-revalidate

/assets/shuffle-manifest.json
  Cache-Control: no-cache, max-age=0, must-revalidate

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.json
  Cache-Control: public, max-age=3600, stale-while-revalidate=86400

/*.ttf
  Access-Control-Allow-Origin: *

/*.otf
  Access-Control-Allow-Origin: *

/*.woff
  Access-Control-Allow-Origin: *

/*.woff2
  Access-Control-Allow-Origin: *
`;

if (!fs.existsSync(siteDir)) {
  throw new Error(`Missing site directory: ${siteDir}`);
}
if (!fs.existsSync(appSourcePath)) {
  throw new Error(`Missing app source file: ${appSourcePath}`);
}

function collectOversizedFiles(rootPath, currentPath = rootPath, oversized = []) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      collectOversizedFiles(rootPath, entryPath, oversized);
      continue;
    }
    const stats = fs.statSync(entryPath);
    if (stats.size > maxPagesAssetBytes) {
      oversized.push({
        path: path.relative(rootPath, entryPath).replaceAll("\\", "/"),
        size: stats.size
      });
    }
  }
  return oversized;
}

function shouldExcludeDeployPath(relativePath, sourcePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if (relativePath.startsWith("Shuffle/") && deployMediaExtensions.has(extension)) {
    return true;
  }
  if (!deployMediaExtensions.has(extension)) {
    return false;
  }
  if (rawSourceVideoPattern.test(path.basename(relativePath))) {
    return true;
  }
  if (allowOversizedAssets) {
    return false;
  }
  try {
    return fs.statSync(sourcePath).size > maxPagesAssetBytes;
  } catch {
    return false;
  }
}

function buildAvatarManifest() {
  const avatarsDir = path.join(distDir, "avatars");
  if (!fs.existsSync(avatarsDir)) {
    return { avatars: [] };
  }
  const avatars = fs.readdirSync(avatarsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => avatarExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => `/avatars/${fileName}`);
  return { avatars };
}

function hashFileVersion(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 10);
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid JSON at ${filePath}: ${error.message}`);
  }
}

function rewriteHtmlAssetVersions() {
  const assetVersionCache = new Map();
  const htmlFiles = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".html")
    .map((entry) => path.join(distDir, entry.name));
  const assetPattern = /(["'])(\/[^"'?#]+\.(?:css|js|gif|png|jpe?g|webp|svg))(?:\?v=[^"'#]*)?\1/g;
  for (const htmlPath of htmlFiles) {
    const original = fs.readFileSync(htmlPath, "utf8");
    const rewritten = original.replace(assetPattern, (match, quote, assetPath) => {
      const normalizedAssetPath = String(assetPath || "").trim();
      if (!normalizedAssetPath) {
        return match;
      }
      let version = assetVersionCache.get(normalizedAssetPath);
      if (!version) {
        const assetFsPath = path.join(distDir, normalizedAssetPath.replace(/^\//, "").replaceAll("/", path.sep));
        version = hashFileVersion(assetFsPath);
        if (!version) {
          return match;
        }
        assetVersionCache.set(normalizedAssetPath, version);
      }
      return `${quote}${normalizedAssetPath}?v=${version}${quote}`;
    });
    if (rewritten !== original) {
      fs.writeFileSync(htmlPath, rewritten, "utf8");
    }
  }
}

function injectClientBuildVersions(source, versions = {}) {
  let output = String(source || "");
  if (versions.shuffleManifest) {
    output = output.replace(
      /var SHUFFLE_MANIFEST_BUILD_VERSION = ".*?";/,
      `var SHUFFLE_MANIFEST_BUILD_VERSION = "${versions.shuffleManifest}";`
    );
  }
  if (versions.steamRecentActivitySnapshot) {
    output = output.replace(
      /var STEAM_RECENT_ACTIVITY_SNAPSHOT = null;/,
      `var STEAM_RECENT_ACTIVITY_SNAPSHOT = ${JSON.stringify(versions.steamRecentActivitySnapshot)};`
    );
  }
  return output;
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(siteDir, distDir, {
  recursive: true,
  force: true,
  filter(sourcePath) {
    const relativePath = path.relative(siteDir, sourcePath).replaceAll("\\", "/");
    if (!relativePath || relativePath === ".") {
      return true;
    }
    return !shouldExcludeDeployPath(relativePath, sourcePath);
  }
});

fs.writeFileSync(headersPath, headersFile, "utf8");
fs.mkdirSync(path.dirname(avatarManifestPath), { recursive: true });
fs.writeFileSync(avatarManifestPath, JSON.stringify(buildAvatarManifest(), null, 2), "utf8");
await writeShuffleManifest({ siteDir, outputPath: shuffleManifestPath });
const appSource = fs.readFileSync(appSourcePath, "utf8");
const appClientSource = injectClientBuildVersions(appSource, {
  shuffleManifest: hashFileVersion(shuffleManifestPath),
  steamRecentActivitySnapshot: readJsonFile(steamRecentActivitySnapshotPath)
});
fs.writeFileSync(clientOutputPath, appClientSource, "utf8");
if (fs.existsSync(appOutputPath)) {
  fs.rmSync(appOutputPath, { force: true });
}
rewriteHtmlAssetVersions();
if (fs.existsSync(josieHtmlPath)) {
  fs.mkdirSync(path.dirname(josieDirectoryIndexPath), { recursive: true });
  fs.copyFileSync(josieHtmlPath, josieDirectoryIndexPath);
}

const oversizedFiles = collectOversizedFiles(distDir);
if (oversizedFiles.length && !allowOversizedAssets) {
  const details = oversizedFiles
    .map((file) => `- ${file.path} (${file.size} bytes)`)
    .join("\n");
  throw new Error(
    `Static assets must stay below ${maxPagesAssetBytes} bytes (25 MiB). Remove or external-host oversized media before deploying.\n${details}`
  );
}

console.log(`Built site into ${distDir}`);
