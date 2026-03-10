# Integrate auth.ljs.app Email Authentication

## Problem
Need authenticated users for the leaderboard so scores are tied to real identities and harder to fake.

## Acceptance Criteria
- Web client can redirect to auth.ljs.app for email-based login
- Auth token/cookie is readable on surge.ljs.app (shared `.ljs.app` parent domain)
- Worker can validate the auth token on API requests
- Unauthenticated users can still play — auth only required for leaderboard submission
- Login/logout UI integrated into title screen or game over screen

## Relevant Files
- `worker/index.ts` — token validation middleware
- `src/scenes/title.ts` — login prompt or status display
- `src/scenes/gameover.ts` — "submit score" requires auth
- `../auth.ljs.app/` — reference for auth flow and token format

## Constraints
- Depends on domain change task being complete first
- Don't block gameplay on auth — it's optional for playing
