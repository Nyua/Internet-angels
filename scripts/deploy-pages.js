import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
const deployAttempts = Math.max(1, Number.parseInt(process.env.PAGES_DEPLOY_ATTEMPTS || "3", 10));
const retryDelayMs = Math.max(1_000, Number.parseInt(process.env.PAGES_DEPLOY_RETRY_DELAY_MS || "15_000", 10));

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8",
    stdio: options.stdio || "pipe"
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

function isMissingR2BucketFailure(result) {
  const output = `${result?.stdout || ""}\n${result?.stderr || ""}`;
  return /R2 bucket ['"][^'"]+['"] not found/i.test(output);
}

function ensureShuffleMediaBucket() {
  const result = runCommand(process.execPath, ["./scripts/upload-shuffle-media.js", "--ensure-only"], {
    stdio: "inherit"
  });
  return result.status === 0;
}

for (let attempt = 1; attempt <= deployAttempts; attempt += 1) {
  console.log(`Deploying Cloudflare Pages attempt ${attempt}/${deployAttempts}.`);
  const deployResult = runCommand(npxExecutable, [
    "wrangler",
    "pages",
    "deploy",
    "dist",
    "--project-name=internet-angel",
    "--branch=main"
  ]);
  writeOutput(deployResult);

  if (deployResult.status === 0) {
    process.exit(0);
  }

  if (!isMissingR2BucketFailure(deployResult) || attempt >= deployAttempts) {
    process.exit(deployResult.status || 1);
  }

  console.log("Cloudflare Pages could not see the R2 bucket yet; verifying it before retrying.");
  if (!ensureShuffleMediaBucket()) {
    process.exit(1);
  }
  await sleep(retryDelayMs);
}
