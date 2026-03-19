# internet-angel.net

Static personal site for `internet-angel.net`, deployed on Cloudflare Pages with Pages Functions.

## Stack

- Static site files in `site/`
- Generated deploy output in `dist/`
- Cloudflare Pages Functions in `functions/`
- Local secrets in `.dev.vars`

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.dev.vars` from `.dev.vars.example` and set:

```bash
LASTFM_API_KEY=your_lastfm_api_key
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

## API Routes

- `GET /api/discord`
- `GET /api/lastfm`
- `GET /api/lastfm-now-playing`
- `GET /api/steam-recent-activity`

These are the only dynamic browser-facing endpoints. The client only talks to these first-party routes and never directly to Last.fm or Lanyard.

## Caching

- `GET /api/lastfm`: fresh for 15 minutes, retained for 24 hours
- `GET /api/lastfm-now-playing`: fresh for 60 seconds, retained for 15 minutes
- `GET /api/discord`: fresh for 10 minutes, retained for 6 hours
- `GET /api/steam-recent-activity`: fresh for 12 hours, retained for 7 days

Cloudflare `caches.default` stores normalized JSON responses. If an upstream request fails, the function returns the last retained payload as `stale: true` when one exists. No KV, D1, Durable Objects, or database is used.

Cloudflare dashboard path:

1. Workers & Pages
2. Select the `internet-angel` project
3. Settings
4. Variables and Secrets
5. Add `LASTFM_API_KEY` as an encrypted secret

## Deploy Checklist

1. Create a GitHub repository named `Internet-angel`.
2. Push the local `main` branch to that repo.
3. Connect the GitHub repo to a Cloudflare Pages project named `internet-angel`.
4. Set the build command to `npm run build`.
5. Set the build output directory to `dist`.
6. Set Node version to `20` in Pages build configuration if needed.
7. Add the `LASTFM_API_KEY` secret before the first production deploy.
8. Deploy.
9. Add `internet-angel.net` as the custom domain.
10. Set the apex domain as primary.
11. Optionally add `www.internet-angel.net` and redirect it to the apex.

## Notes

- No Firebase services are used in this repo.
- No client bundle contains API keys.
- Last.fm, Discord, and Steam requests are proxied through first-party endpoints and cached at the edge.
- The site is intended for the Cloudflare Pages custom domain `internet-angel.net`.
- Cloudflare Pages has a 25 MiB limit per static asset, so oversized media must be compressed, moved off Pages, or excluded from the build.

## Migration Notes

See [MIGRATION.md](./MIGRATION.md) for:

- the Firebase audit summary
- the updated project structure
- the Firebase pieces removed or replaced
- the Cloudflare secrets and bindings required
- the deploy checklist
- functionality differences from the Firebase version

## GitHub And CI

- GitHub Actions workflow: `.github/workflows/ci.yml`
- Runs unit tests on every push and pull request to `main`
- Runs the Playwright smoke suite when a GitHub Actions secret named `LASTFM_API_KEY` is configured
