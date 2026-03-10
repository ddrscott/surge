# Surge - Development Guide

## Quick Reference

```sh
npm run dev          # terminal version (Node.js + tsx)
npm run dev:web      # browser version (Vite dev server)
npm run build        # validate data + compile Node.js
npm run build:web    # Vite build to web/dist/
npm run deploy       # build:web + wrangler deploy
npm start            # run compiled Node.js version
```

## Project Structure

- `src/main.ts` - Entry point, terminal setup, scene navigator
- `src/types.ts` - All game types (Enemy, GameState, Zone, WaveConfig, HitResult)
- `src/render.ts` - Layout engine, ANSI color codes, UI primitives (bLine, bDiv, bar)
- `src/game/logic.ts` - Core game loop: spawning, movement, input processing, scoring
- `src/game/state.ts` - `createGame()` factory for initial GameState
- `src/game/words.ts` - Dictionary loader from bugs.txt, power-up word definitions
- `src/game/facts.ts` - Fun facts loader from facts.txt
- `src/scenes/game.ts` - Main gameplay rendering (most complex file, ~600 lines)
- `src/scenes/title.ts` - Title screen with ASCII logo and menu
- `src/scenes/help.ts` - Briefing/how-to-play screen
- `src/scenes/pause.ts` - Pause menu (resume/quit)
- `src/scenes/gameover.ts` - Game over stats + fun fact
- `bugs.txt` - Word dictionary (340 words, validated at build time)
- `facts.txt` - Fun facts (85 entries, validated at build time)

## Key Constants (keep in sync)

These constants are duplicated across files and must match:

| Constant | Value | Files |
|----------|-------|-------|
| `SCROLL_IN` | 0.05 | logic.ts, game.ts |
| `ANCHOR_COL` | 1 | logic.ts, game.ts |
| `WIRE_MARGIN` | 2 | logic.ts, game.ts |
| `FPS` | 20 | logic.ts |
| `TICK_MS` | 50 | game.ts |

## Rendering Architecture

The game runs at 20 FPS. The render pipeline in `game.ts`:

1. Header: HP bar, surge meter, wave counter
2. Status line (standard mode only): active effects or help text
3. Lane rendering: one row per lane, showing live/dead enemies
4. Wall stamp: ANSI cursor positioning (`\x1b[${col}G`) places wall on right side
5. Creep overlay: red wires bleed through wall when HP < 30%
6. Bottom border: `╚[ $ rm input█ ]═══[score][combo]╝`

### Three-Phase Enemy Rendering

`renderLaneContent()` handles live enemies:
- **Phase 1** (pos < SCROLL_IN): Dim fade-in, whole word appears
- **Phase 2** (SCROLL_IN ≤ pos < contactPosition): Static word + matrix wire growing right→left
- **Phase 3** (pos ≥ contactPosition): Elastic injection with cubic easing, wire as red backdrop

`contactPosition(wordLen)` computes per-enemy wire contact based on actual gap distance.

### Wall & Borders

Wall is on the RIGHT side. Lane lines are stamped with borders:
```
║{content}\x1b[K\x1b[${wallCol}G{wallPad}{wallStr}║
```

`fieldWidth = width - wallMax` gives the content area width. wallMax is 2 (compact) or 4 (standard).

## Game Logic

### Spawning
- Phrase-based: bursts of N enemies with short gaps, then a longer rest
- Lane locking: `pickLane()` returns -1 when all lanes occupied, retries in 5 ticks
- Power-ups: 15% chance per spawn, wave 1+, move 1.5-2.5x max speed

### Scoring
- `points = speed * wordLength * 500` (base)
- Zone multiplier: SAFE(1x), RISKY(2x), CRITICAL(3x)
- Combo multiplier: `1 + floor(combo/3) * 0.5`
- Double score power-up stacks on top

### Hitstun
- Triggers per-enemy when wire touches word's last letter
- 8 ticks (400ms) freeze - `state.hitStunUntil`
- Matrix animation freezes too (frozen tick passed to wireChar)
- Wire + word render in bold red during freeze

### Death Animation
- `deathAnimStart` tracks when game over began
- 50-tick animation: wires flood lanes from right, then header
- Bottom border score/combo protected from overlay
- Continues from the creep that was already visible at low HP

## Conventions

- ES modules (`"type": "module"` in package.json, `.js` extensions in imports)
- Strict TypeScript, no `any`
- ANSI escape sequences for all rendering (no curses/blessed dependencies)
- Zero runtime dependencies - only Node.js built-ins
- Data files (bugs.txt, facts.txt) validated at build time
- Responsive layout: compact mode for terminals < 60 cols or < 18 rows

## Adding Words

Edit `bugs.txt` (one word per line, `#` comments allowed). Run `npm run build` to validate:
- No duplicates
- No empty lines (excluding comments)
- Warns on prefix collisions with existing words

## Adding Facts

Edit `facts.txt` (one fact per line). Validated at build time for duplicates and length.

## Deployment (Cloudflare Workers)

- `wrangler.toml` - Worker config with static assets binding
- `worker/index.ts` - Worker entry point (serves assets + API routes)
- `worker/tsconfig.json` - Worker-specific TS config (uses `@cloudflare/workers-types`)
- Static assets served from `web/dist/` via `ASSETS` binding
- D1 database binding commented out, ready to uncomment when needed
- API routes under `/api/*` go to Worker, everything else serves static assets

## Future: Multiplayer & Leaderboards

The architecture is designed to support multiplayer and global leaderboards:
- Game state is a pure data structure (GameState), no global mutation
- Rendering is a pure function of state (render returns a string)
- Input processing returns results without side effects on rendering
- Scene system can be instantiated per-connection
- Worker is D1-ready for leaderboards (`wrangler.toml` has commented binding)
- API route skeleton in `worker/index.ts` for scores, matchmaking
