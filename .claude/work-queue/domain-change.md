# Change Domain to surge.ljs.app

## Problem
The game needs to share a parent domain (`ljs.app`) with `auth.ljs.app` so cookies/tokens can be shared for authentication.

## Acceptance Criteria
- `wrangler.toml` updated with `surge.ljs.app` route/custom domain
- Any hardcoded URLs in the codebase point to `surge.ljs.app`
- Deployment via `npm run deploy` targets the new domain
- Existing functionality works identically on the new domain

## Relevant Files
- `wrangler.toml` — worker config, routes, custom domain
- `worker/index.ts` — check for any hardcoded origins/URLs
- `web/index.html` — check for any absolute URLs

## Constraints
- This should be done first before auth integration (dependency)
