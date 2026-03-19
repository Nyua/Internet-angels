import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const siteDir = path.join(rootDir, "site");
const distDir = path.join(rootDir, "dist");
const appSourcePath = path.join(siteDir, "ames-corner.app.js");
const clientOutputPath = path.join(distDir, "ames-corner.client.js");
const appOutputPath = path.join(distDir, "ames-corner.app.js");
const headersPath = path.join(distDir, "_headers");

const headersFile = `/*.html
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

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
fs.cpSync(siteDir, distDir, { recursive: true, force: true });

const appSource = fs.readFileSync(appSourcePath, "utf8");
fs.writeFileSync(clientOutputPath, appSource, "utf8");
if (fs.existsSync(appOutputPath)) {
  fs.rmSync(appOutputPath, { force: true });
}
fs.writeFileSync(headersPath, headersFile, "utf8");

console.log(`Built site into ${distDir}`);
