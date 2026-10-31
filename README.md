# internet-angel.net

My personal website deployed @ `internet-angel.net`, and hosted on Cloudflare Pages. A bit of a messy project that's undergone several rewrites and migrated over from Firebase hosting because Firebase sux. 

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

## Caching so your users aren't hitting a services api 10,000x every time they refresh (these timings might be a little overkill)
- `GET /api/lastfm`: fresh for 15 minutes, retained for 24 hours
- `GET /api/discord`: fresh for 10 minutes, retained for 6 hours
- `GET /api/steam-recent-activity`: fresh for 12 hours, retained for 7 days

Cloudflare dashboard path:
1. Workers & Pages
2. Select the `internet-angel` project
3. Settings
4. Variables and Secrets
5. Add `LASTFM_API_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` as encrypted secrets
   
## Notes
- No client bundle contains API keys.
- Last.fm, Discord, and Steam requests are proxied through first-party endpoints and cached at the edge.
- Deploys run `npm run refresh:snapshots` before build so the bundled Steam first-paint snapshot and Last.fm cold-cache fallback are refreshed from live data.
  
## The project started out on Firebase but was moved to Cloudflare because of reliability issues, See [MIGRATION.md](./MIGRATION.md) for:
- the Firebase audit.
- the updated project structure.
- the Firebase pieces removed/replaced.
- the Cloudflare secrets requirements.
- functionality differences from the Firebase version.
