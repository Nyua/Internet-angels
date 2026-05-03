import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const siteDir = path.join(rootDir, "site");
const distManifestPath = path.join(rootDir, "dist", "assets", "shuffle-manifest.json");
const sourceManifestPath = path.join(siteDir, "assets", "shuffle-manifest.json");
const shuffleDir = path.join(siteDir, "Shuffle");
const bucketName = process.env.SHUFFLE_MEDIA_BUCKET || "internet-angel-media";
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
const cacheControl = "public, max-age=31536000, immutable";
const ensureOnly = process.argv.includes("--ensure-only");
const bucketReadyAttempts = Math.max(1, Number.parseInt(process.env.SHUFFLE_MEDIA_BUCKET_READY_ATTEMPTS || "12", 10));
const bucketReadyDelayMs = Math.max(1_000, Number.parseInt(process.env.SHUFFLE_MEDIA_BUCKET_READY_DELAY_MS || "5_000", 10));

const contentTypes = new Map([
  [".m4v", "video/x-m4v"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"]
]);

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value || "");
  }
}

function runWrangler(args, options = {}) {
  const result = spawnSync(npxExecutable, ["wrangler", ...args], {
    cwd: rootDir,
    env: process.env,
    encoding: options.encoding || "utf8",
    stdio: options.stdio || "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  return result;
}

function writeOutput(result) {
  if (result?.stdout) process.stdout.write(result.stdout);
  if (result?.stderr) process.stderr.write(result.stderr);
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function getBucketInfo() {
  return runWrangler(["r2", "bucket", "info", bucketName, "--json"], {
    stdio: "pipe"
  });
}

async function waitForBucketReady() {
  let lastResult = null;
  for (let attempt = 1; attempt <= bucketReadyAttempts; attempt += 1) {
    const infoResult = getBucketInfo();
    if (infoResult.status === 0) {
      console.log(`R2 bucket ${bucketName} is ready.`);
      return;
    }
    lastResult = infoResult;
    if (attempt < bucketReadyAttempts) {
      console.log(`Waiting for R2 bucket ${bucketName} to become visible (${attempt}/${bucketReadyAttempts}).`);
      await sleep(bucketReadyDelayMs);
    }
  }
  writeOutput(lastResult);
  throw new Error(`R2 bucket ${bucketName} was created but is still not visible to Wrangler.`);
}

async function ensureBucketExists() {
  if (process.env.SKIP_SHUFFLE_MEDIA_BUCKET_CREATE === "1") {
    return;
  }

  const infoResult = getBucketInfo();
  if (infoResult.status === 0) {
    console.log(`R2 bucket ${bucketName} is ready.`);
    return;
  }

  console.log(`R2 bucket ${bucketName} was not found; creating it.`);
  const createResult = runWrangler(["r2", "bucket", "create", bucketName], {
    stdio: "pipe"
  });
  const createOutput = `${createResult.stdout || ""}${createResult.stderr || ""}`;
  if (createResult.status === 0 || /already\s+exists|already\s+created/i.test(createOutput)) {
    writeOutput(createResult);
    await waitForBucketReady();
    return;
  }

  writeOutput(infoResult);
  writeOutput(createResult);
  throw new Error(`Unable to create R2 bucket ${bucketName}.`);
}

function readManifest() {
  const manifestPath = fs.existsSync(distManifestPath) ? distManifestPath : sourceManifestPath;
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing shuffle manifest: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!Array.isArray(manifest?.tracks)) {
    throw new Error(`Shuffle manifest does not contain a tracks array: ${manifestPath}`);
  }
  return manifest;
}

function normalizeShuffleVideoPath(value) {
  const source = String(value || "").trim();
  if (!source) return null;

  const pathname = /^https?:\/\//i.test(source)
    ? new URL(source).pathname
    : source;
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => safeDecodeURIComponent(segment));
  if (segments[0] !== "Shuffle" || segments.length !== 2) {
    throw new Error(`Unsupported shuffle media path: ${source}`);
  }

  const fileName = segments[1].trim();
  const extension = path.extname(fileName).toLowerCase();
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || /[\x00-\x1F\x7F]/.test(fileName)) {
    throw new Error(`Unsafe shuffle media file name: ${source}`);
  }
  if (!contentTypes.has(extension)) {
    throw new Error(`Unsupported shuffle video extension: ${source}`);
  }

  return {
    fileName,
    key: `Shuffle/${fileName}`,
    filePath: path.join(shuffleDir, fileName),
    contentType: contentTypes.get(extension)
  };
}

function collectVideoRecords(manifest) {
  const recordsByKey = new Map();
  for (const track of manifest.tracks) {
    const paths = [
      track?.mediaType === "video" ? track?.path : "",
      track?.videoPath
    ].filter(Boolean);
    for (const shufflePath of paths) {
      const record = normalizeShuffleVideoPath(shufflePath);
      if (record) {
        recordsByKey.set(record.key, record);
      }
    }
  }
  return [...recordsByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
}

function uploadRecord(record) {
  if (!fs.existsSync(record.filePath)) {
    throw new Error(`Missing local shuffle video for R2 upload: ${record.filePath}`);
  }

  console.log(`Uploading ${record.key} to R2 bucket ${bucketName}.`);
  const result = runWrangler([
    "r2",
    "object",
    "put",
    `${bucketName}/${record.key}`,
    "--file",
    record.filePath,
    "--content-type",
    record.contentType,
    "--cache-control",
    cacheControl
  ]);
  if (result.status !== 0) {
    throw new Error(`Failed to upload ${record.key} to R2.`);
  }
}

if (ensureOnly) {
  await ensureBucketExists();
  process.exit(0);
}

const manifest = readManifest();
const videoRecords = collectVideoRecords(manifest);
if (!videoRecords.length) {
  console.log("No shuffle videos found in the manifest.");
  process.exit(0);
}

await ensureBucketExists();
for (const record of videoRecords) {
  uploadRecord(record);
}
await waitForBucketReady();

console.log(`Uploaded ${videoRecords.length} shuffle video${videoRecords.length === 1 ? "" : "s"} to ${bucketName}.`);
