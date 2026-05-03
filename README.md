# internet-angel.net

Static personal site for `internet-angel.net`, deployed on Cloudflare Pages with Pages Functions.

## Stack

- Static site files in `site/`
- Generated deploy output in `dist/`
- Cloudflare Pages Functions in `functions/`
- Shuffle playback driven by editable YouTube links in `site/Shuffle/youtube-links.txt`
- Local secrets in `.dev.vars`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.dev.vars` from `.dev.vars.example` and set:

```bash
LASTFM_API_KEY=your_lastfm_api_key
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

3. Build the site:

```bash
npm run build
```

4. Start local Pages dev:

```bash
npm run dev:serve
```

Or build and serve in one command:

```bash
npm run dev
```

5. Run tests:

```bash
npm run test:unit
npm run test:e2e
```

## Cloudflare Setup

Pages project defaults:

- Project name: `internet-angel`
- GitHub repository name: `Internet-angel`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Recommended Node version: `20`

Production secret to add in Cloudflare Pages:

- `LASTFM_API_KEY`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

## API Routes

- `GET /api/discord`
- `GET /api/lastfm`
- `GET /api/lastfm-track-details`
- `GET /api/steam-recent-activity`
- `GET /assets/shuffle-manifest.json`

These are the only dynamic browser-facing endpoints. The client only talks to these first-party routes for Last.fm, Discord, Steam, and Spotify enrichment. Shuffle tracks are generated at build time from `site/Shuffle/youtube-links.txt` and played through YouTube's iframe player.

## Caching

- `GET /api/lastfm`: fresh for 15 minutes, retained for 24 hours
- `GET /api/discord`: fresh for 10 minutes, retained for 6 hours
- `GET /api/steam-recent-activity`: fresh for 12 hours, retained for 7 days

Cloudflare `caches.default` stores normalized JSON responses. If an upstream request fails, the function returns the last retained payload as `stale: true` when one exists. No KV, D1, Durable Objects, or database is used.

Cloudflare dashboard path:

1. Workers & Pages
2. Select the `internet-angel` project
3. Settings
4. Variables and Secrets
5. Add `LASTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` as encrypted secrets

## Deploy Checklist

1. Create a GitHub repository named `Internet-angel`.
2. Push the local `main` branch to that repo.
3. Connect the GitHub repo to a Cloudflare Pages project named `internet-angel`.
4. Set the build command to `npm run build`.
5. Set the build output directory to `dist`.
6. Set Node version to `20` in Pages build configuration if needed.
7. Add the `LASTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` secrets before the first production deploy.
8. Edit `site/Shuffle/youtube-links.txt` when you want to add or remove Shuffle tracks.
9. Deploy.
10. Add `internet-angel.net` as the custom domain.
11. Set the apex domain as primary.
12. Optionally add `www.internet-angel.net` and redirect it to the apex.

## Notes

- No Firebase services are used in this repo.
- No client bundle contains API keys.
- Last.fm, Discord, and Steam requests are proxied through first-party endpoints and cached at the edge.
- The site is intended for the Cloudflare Pages custom domain `internet-angel.net`.
- Cloudflare Pages has a 25 MiB limit per static asset, so production builds exclude local downloaded Shuffle media from `dist/`; the live Shuffle manifest uses YouTube links instead.
- YouTube must allow embedding for a Shuffle link to play inside the site. Links that are blocked from embedding can still appear as tracks, but YouTube will show its own unavailable embed state.

## Migration Notes

See [MIGRATION.md](./MIGRATION.md) for:

- the Firebase audit summary
- the updated project structure
- the Firebase pieces removed or replaced
- the Cloudflare secrets required
- the deploy checklist
- functionality differences from the Firebase version

## GitHub And CI

- GitHub Actions CI workflow: `.github/workflows/ci.yml`
- Runs unit tests on every push and pull request to `main`
- Runs the Playwright smoke suite when a GitHub Actions secret named `LASTFM_API_KEY` is configured
- GitHub Actions deploy workflow: `.github/workflows/deploy.yml`
- Deploys `dist/` to Cloudflare Pages production on every push to `main` (and supports manual dispatch)
- Requires repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- The Cloudflare token needs Pages deploy access
- Production updates only happen from commits that land on `main`
