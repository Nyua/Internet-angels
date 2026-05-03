import { spawnSync } from "node:child_process";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";

const result = spawnSync(npxExecutable, [
  "wrangler",
  "pages",
  "deploy",
  "dist",
  "--project-name=internet-angel",
  "--branch=main"
], {
  cwd: rootDir,
  env: process.env,
  encoding: "utf8",
  stdio: "pipe"
});

if (result.error) {
  throw result.error;
}
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status || 0);
