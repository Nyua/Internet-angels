# internet-angel.net

Static personal site for `internet-angel.net`, deployed on Cloudflare Pages with Pages Functions.

## Stack

- Static site files in `site/`
- Generated deploy output in `dist/`
- Cloudflare Pages Functions in `functions/`
- R2 bucket-backed Shuffle videos discovered from the bucket and served from `/Shuffle/*.mp4`
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

Production R2 binding:

- Binding name: `MEDIA_BUCKET`
- Bucket name: `internet-angel-media`

## API Routes

- `GET /api/discord`
- `GET /api/lastfm`
- `GET /api/lastfm-track-details`
- `GET /api/steam-recent-activity`
- `GET /assets/shuffle-manifest.json`
- `GET /Shuffle/*.mp4`

These are the only dynamic browser-facing endpoints. The client only talks to these first-party routes and never directly to Last.fm or Lanyard. The Shuffle manifest is generated from supported music-video objects in R2, then the same-domain `/Shuffle/*.mp4` route streams those objects from R2 instead of uploading oversized media as Pages static assets.

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
8. Create or let the deploy workflow create the R2 bucket named `internet-angel-media`.
9. Bind that bucket to the Pages project as `MEDIA_BUCKET`.
10. Deploy.
11. Add `internet-angel.net` as the custom domain.
12. Set the apex domain as primary.
13. Optionally add `www.internet-angel.net` and redirect it to the apex.

## Notes

- No Firebase services are used in this repo.
- No client bundle contains API keys.
- Last.fm, Discord, and Steam requests are proxied through first-party endpoints and cached at the edge.
- The site is intended for the Cloudflare Pages custom domain `internet-angel.net`.
- Cloudflare Pages has a 25 MiB limit per static asset, so production builds exclude oversized Shuffle videos from `dist/`; the live Shuffle manifest is generated from R2 objects under `Shuffle/` or root-level supported video files.

## Migration Notes

See [MIGRATION.md](./MIGRATION.md) for:

- the Firebase audit summary
- the updated project structure
- the Firebase pieces removed or replaced
- the Cloudflare secrets and bindings required
- the deploy checklist
- functionality differences from the Firebase version

## GitHub And CI

- GitHub Actions CI workflow: `.github/workflows/ci.yml`
- Runs unit tests on every push and pull request to `main`
- Runs the Playwright smoke suite when a GitHub Actions secret named `LASTFM_API_KEY` is configured
- GitHub Actions deploy workflow: `.github/workflows/deploy.yml`
- Uploads local manifest-seeded Shuffle videos to R2 and deploys `dist/` to Cloudflare Pages production on every push to `main` (and supports manual dispatch)
- Requires repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- The Cloudflare token needs Pages deploy access plus write/edit access to Workers R2 Storage so the workflow can create the media bucket and upload objects
- Production updates only happen from commits that land on `main`
