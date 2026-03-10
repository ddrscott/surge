# D1 Leaderboard API with Per-Kill Checksum

## Problem
Need a server-side leaderboard that's resistant to fake score submissions. Simple POST-a-number APIs are trivially cheatable.

## Anti-Cheat: Per-Kill Checksum
- Client accumulates a rolling hash/checksum of each kill event during gameplay
- Each kill event includes: enemy word, speed, zone, points awarded, timestamp/tick
- On game over, client submits: final score, wave reached, kill log hash, and summary stats
- Server validates: checksum consistency, score vs theoretical max for claimed wave, sanity checks on timing

### Sanity Checks
- Score cannot exceed theoretical maximum for the wave reached
- Kill count must be plausible for the wave/time played
- No two submissions within N seconds from same user
- Points per kill must match the scoring formula (speed × wordLength × 500 × zone × combo multipliers)

## Acceptance Criteria
- D1 database binding enabled in `wrangler.toml`
- Schema: `scores` table with user_id, display_name, score, wave, kills, checksum, created_at
- `POST /api/scores` — submit score (authenticated, checksum validated)
- `GET /api/scores` — fetch top N scores (public)
- `GET /api/scores/me` — fetch current user's best scores (authenticated)
- Rejected submissions return clear error (don't reveal exact validation logic)

## Relevant Files
- `wrangler.toml` — uncomment D1 binding
- `worker/index.ts` — API route handlers
- `src/game/logic.ts` — add checksum accumulation to kill processing
- `src/types.ts` — add checksum field to GameState

## Constraints
- Depends on auth integration
- Keep scoring formula in sync between client and server validation
- Don't expose exact validation thresholds in client code
