# Migration Notes

## Audit Summary

Static frontend moved into `site/`:

- `index.html`
- `next.html`
- `josie.html`
- `josie.css`
- `josie.app.js`
- `assets/`
- `avatars/`
- `fonts/`
- `Shuffle/`
- `Timelapse/`

Firebase-only pieces from the old project are not used in this repo:

- Firebase Hosting config
- Firebase Functions
- Firebase emulator scripts
- generated `public/` hosting output
- legacy `ames-corner.local.js`

Not used and therefore not migrated:

- Firestore
- Realtime Database
- Storage
- Auth

## Updated Structure

```text
internet-angel-site/
  .dev.vars.example
  .gitignore
  MIGRATION.md
  README.md
  package.json
  playwright.config.js
  wrangler.toml
  scripts/
    build-site.js
  site/
    index.html
    next.html
    josie.html
    josie.css
    josie.app.js
    assets/
    avatars/
    fonts/
    Shuffle/
    Timelapse/
  functions/
    api/
      discord.js
      lastfm.js
      lastfm-now-playing.js
      steam-recent-activity.js
    lib/
      cache.js
      config.js
      discord.js
      lastfm.js
      response.js
      steam.js
  tests/
    api-routes.test.js
    cache.test.js
    site.smoke.spec.js
    steam-parser.test.js
    fixtures/
      steam-private.md
      steam-profile.md
```

## Firebase Pieces Removed Or Replaced

Removed:

- `.firebaserc`
- `firebase.json`
- Firebase functions source and package metadata
- `public/`
- emulator start/stop scripts
- runtime config injection for proxy toggles

Replaced:

- Firebase Hosting -> Cloudflare Pages
- Firebase Functions -> Cloudflare Pages Functions
- local Firebase secret wiring -> `.dev.vars`
- browser-side Lanyard fetch -> `GET /api/discord`
- full Last.fm fetch -> cached `GET /api/lastfm`
- now-playing fetch -> short-lived cached `GET /api/lastfm-now-playing`

## Cloudflare Secrets

Production secret:

- `LASTFM_API_KEY`

Local development file:

- `.dev.vars`

Example:

```bash
LASTFM_API_KEY=replace-me
```

## Deploy Checklist

1. Push this repo to a new remote.
2. Create a Cloudflare Pages project named `internet-angel`.
3. Set build command to `npm run build`.
4. Set output directory to `dist`.
5. Add `LASTFM_API_KEY` in Pages Settings -> Variables and Secrets.
6. Deploy.
7. Attach `internet-angel.net`.
8. Set the apex domain as primary.
9. Optionally add `www.internet-angel.net` and redirect it to the apex.

## Functionality Changes

- Last.fm full profile data comes from `GET /api/lastfm` with a 15 minute fresh cache.
- Last.fm now-playing is checked separately through `GET /api/lastfm-now-playing` with a 60 second fresh cache so page loads can feel more live without forcing full refreshes.
- Discord presence is served through Cloudflare and no longer hits Lanyard directly from the browser.
- Steam recent activity is locked to the configured profile and no longer accepts a query parameter.
- Edge cache fallback returns stale JSON with `sourceStatus: "PARTIAL"` when upstream services fail.

## How Caching Works

- Each API route checks `caches.default` first.
- If the cached payload is still inside the fresh TTL, it is returned immediately.
- If the payload is stale but still retained, the function tries one upstream refresh.
- If refresh succeeds, the cache is overwritten and the fresh payload is returned.
- If refresh fails and retained data exists, the retained payload is returned with `stale: true`.
- If no cached payload exists and upstream fails, the route returns a non-breaking error response.

Configured TTLs:

- Last.fm: fresh 15 minutes, retained 24 hours
- Last.fm now-playing: fresh 60 seconds, retained 15 minutes
- Discord: fresh 10 minutes, retained 6 hours
- Steam: fresh 12 hours, retained 7 days
