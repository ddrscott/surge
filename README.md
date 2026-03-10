# SURGE

A cyberpunk terminal typing game. Bugs are crawling through memory. Name them to squash them.

```
╔══════════════════════════════════════════════════════════════════╗
║  integrity ████████████  surge ░░░░░░░░░░░░                      ║
║  wave 3                                                          ║
╠══════════════════════════════════════════════════════════════════╣
║ hornet        ··a4··0b··f2··e8··3d··c7··1a··95··b3·             █║
║ mantis                  ··7e··d1··a6··4f··c3··82··              █║
║·                                                               ██║
║ cricket                                                        ██║
║·                                                               ██║
╟──────────────────────────────────────────────────────────────────╢
╚[ $ rm ho█ ]═════════════════════════════════════════[1,250][1.5x]╝
```

## Install & Run

```sh
npm install
npm run dev         # terminal version (Node.js + tsx)
npm run dev:web     # browser version (Vite + xterm.js)
npm run build       # compile Node.js version
npm run build:web   # build browser version to web/dist/
npm run deploy      # build + deploy to Cloudflare Workers
```

**Terminal version** requires Node.js 18+ and an interactive terminal (min 30x10).
**Browser version** runs at [surge.ljs.app](https://surge.ljs.app) or locally on `localhost:5173`.

## How to Play

You are a process inside a dying machine. Bugs crawl from the left toward your firewall on the right. Type their name to delete them.

- **Type the bug name** to lock on and squash it
- **Wait for the kill zone** for bigger scores: `far(1x)` ... `close(2x)` ... `SQUASH(3x)`
- **Build combos** for score multipliers: `1 + floor(combo/3) * 0.5`
- **Fill the surge meter**, then type `surge` to fumigate everything
- **Catch power-ups** (magenta, fast-moving): `patch` heals, `freeze` slows bugs, `optimize` doubles score

If a bug reaches your firewall, it corrupts memory. Lose all integrity, game over.

## Design Philosophy

### Risk / Reward Timing

The core tension: every word has three scoring zones based on how close the bug is to your firewall when you kill it.

| Zone | Position | Multiplier | Feel |
|------|----------|------------|------|
| SAFE | 0 - 50% | 1x | Comfortable, no pressure |
| RISKY | 50 - 85% | 2x | Wire approaching, tension builds |
| CRITICAL | 85 - 105% | 3x | Wire touching, hitstun imminent |
| MISSED | > 105% | 0x + damage | System corruption |

The wire is the visual countdown. It grows from the right edge toward the word at a constant visual speed. When it touches the word's last letter, the system freezes for a beat (hitstun) to let you feel the impact. Then the word stretches elastically toward the wall as the bug injects itself.

Skilled players learn to let bugs get dangerously close before typing, chasing 3x critical kills to build score and surge meter faster. But if you wait too long, you take damage and lose your combo.

### Nintendo-Style Hitstun

Borrowed from classic game design: a brief freeze frame (400ms) when a bug's wire makes contact. This micro-pause serves three purposes:

1. **Communicates impact** - the player feels the collision
2. **Creates urgency** - you see the damage coming
3. **Rewards attention** - skilled players type during the freeze to kill the bug before injection completes

### Three-Phase Enemy Lifecycle

Each bug goes through a visual journey that communicates its threat level:

1. **Fade-in** (position 0-5%): Word appears dimly on the left, giving you time to read it
2. **Wire approach** (5% - contact): The word sits static while a matrix hex wire grows from the right toward it. The wire brightens as it gets closer. This is your window to type.
3. **Elastic injection** (contact - death): The word stretches toward the right wall with staggered cubic easing. The wire stays visible underneath as a red backdrop. The bug is injecting itself into memory.

### The Wall Bleeds

When integrity drops below 30%, red matrix wires start bleeding through the firewall on the right. The lower your health, the further they creep. This creates escalating visual anxiety without any UI text telling you "danger." At game over, the wires flood the entire screen in a 2.5-second death animation.

### Command Prompt Input

The input prompt reads `$ rm bugname█` - you're typing terminal commands to delete files. This anchors the cyberpunk fantasy: you're not just typing words, you're a sysadmin fighting for survival inside a terminal.

## Architecture

```
src/                    Platform-agnostic game code (no Node.js deps except main.ts)
  main.ts               Node.js entry point (terminal setup, fs reads)
  types.ts              Core types: Enemy, GameState, Zone, WaveConfig
  render.ts             Layout engine, ANSI colors, UI primitives
  game/
    state.ts            Initial game state factory
    logic.ts            Tick loop, spawning, input processing, scoring
    words.ts            Dictionary loader, power-up definitions
    facts.ts            Fun facts for game over screen
  scenes/
    types.ts            SceneContext + InputEmitter interfaces
    title.ts            Title screen with ASCII logo
    help.ts             Briefing / how-to-play
    game.ts             Main gameplay rendering and input
    pause.ts            Pause menu
    gameover.ts         Final stats and fun fact display
web/                    Browser build
  index.html            Minimal dark page with xterm.js terminal
  main.ts               Browser entry: bridges xterm.js to scene system
  vite.config.ts        Vite build config
worker/                 Cloudflare Worker
  index.ts              Worker entry: serves static assets + API routes
  tsconfig.json         Worker-specific TypeScript config
bugs.txt                340-word bug dictionary
facts.txt               85 fun facts about bugs
wrangler.toml           Cloudflare Workers deployment config
```

### Scene System

Five scenes managed by a simple navigator in `main.ts`. Each scene exports `enter(ctx)` and `exit(ctx)`. The context provides `writeFrame()`, `navigate()`, `stdin`, and `cleanup()`.

### Rendering Pipeline

The game renders at 20 FPS (50ms ticks). Each frame:

1. Compute responsive layout from terminal dimensions
2. Build header (HP bar, surge meter, wave number)
3. Render each lane (live enemy, dead enemy, or empty)
4. Stamp wall and borders using ANSI cursor positioning
5. Apply creep overlay if HP is low
6. Build bottom border with input prompt, score, combo

The wall is on the right side, rendered via `\x1b[${col}G` cursor positioning so it doesn't affect content layout. Wall width is proportional to HP.

### Wave System

8 hand-tuned waves with auto-scaling beyond wave 8. Enemies spawn in **phrases** (bursts of 2-4 with short gaps, then a longer rest). This creates rhythm: type-type-type-breathe-type-type-type-breathe.

| Wave | Enemies | Speed (sw/s) | Word Length | Phrase |
|------|---------|--------------|-------------|--------|
| 1 | 6 | 0.10 - 0.15 | 3-4 | 2 per burst |
| 2 | 8 | 0.15 - 0.22 | 3-5 | 2 per burst |
| 3 | 10 | 0.25 - 0.40 | 3-6 | 3 per burst |
| 4 | 12 | 0.28 - 0.45 | 4-7 | 3 per burst |
| 5 | 14 | 0.30 - 0.50 | 4-8 | 3 per burst |
| 6 | 16 | 0.35 - 0.55 | 4-9 | 4 per burst |
| 7 | 19 | 0.40 - 0.65 | 5-10 | 4 per burst |
| 8 | 22 | 0.45 - 0.75 | 5-11 | 4 per burst |

Speed is in screen widths per second - a bug at 0.25 sw/s crosses the screen in 4 seconds regardless of terminal width.

### Per-Enemy Wire Contact

The wire grows at a constant visual rate (`fieldWidth` columns per 1.0 position unit). This means longer words (which take up more space on the left) have a shorter gap for the wire to cross, so they get contacted sooner. A 3-letter word might not get touched until position ~0.97, while a 9-letter word gets touched at ~0.89. Longer words are both harder to type AND arrive faster.

## Future Vision

### Multiplayer Battle Royale via xterm

The endgame vision: multiplayer Surge over SSH, styled as a BBS door game. Players connect to a shared server and compete in real-time typing battles.

**Concept:**
- Players SSH into a server running Surge
- Each player gets their own xterm session
- Shared wave of bugs attacks all players simultaneously
- Last player standing wins the round
- Spectators can watch live feeds of other players

**BBS Aesthetic:**
- ANSI art login screen with modem sound effects
- Player handles and leaderboards
- "Calling..." connection animation
- Chat between rounds via terminal split
- Tournament brackets displayed in ASCII

**Technical Direction:**
- Node.js SSH server (ssh2 library) serving xterm sessions
- Shared game state broadcast to all connected players
- Per-player input streams with server-side tick synchronization
- Redis or in-memory pub/sub for real-time state sync
- Spectator mode: multiplex any player's frame buffer to watchers

**Gameplay Additions for Multiplayer:**
- **Steal kills**: Type another player's bug to steal their points
- **Send bugs**: Combo streaks send bonus bugs to opponents (Tetris-style)
- **Shared surge**: All players contribute to a collective surge meter
- **Elimination rounds**: Fixed HP, no healing, last one alive wins
- **Ranked ladder**: ELO-based matchmaking by typing speed tier

This preserves the single-player core while adding competitive pressure through shared resources and direct interference. The terminal-native approach means it works over any SSH connection - no browser, no client install, just `ssh surge.example.com`.

## Authentication

Surge integrates with [auth.ljs.app](https://auth.ljs.app) for email-based authentication via magic links. Auth is **optional** - anyone can play without signing in. Authentication is required for leaderboard score submission.

### How It Works

1. Player visits `surge.ljs.app` - game loads, web client checks `/api/auth/me`
2. If logged in, title screen shows email; game over screen shows leaderboard status
3. If not logged in, screens show a hint to sign in at `auth.ljs.app`
4. Login redirects through `auth.ljs.app/login` → magic link email → callback with signed token
5. Worker validates HMAC-SHA256 token using shared `JWT_SECRET`, sets httpOnly session cookie

### Worker Auth Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/login` | Redirect to auth.ljs.app with returnTo |
| `GET` | `/api/auth/callback` | Receive token, set session cookie, redirect |
| `GET` | `/api/auth/me` | Return current user info from session cookie |
| `POST` | `/api/auth/logout` | Clear session cookie |

### Leaderboard API Routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/scores` | Submit score (authenticated, checksum validated) |
| `GET` | `/api/scores` | Global top scores (public, `?limit=N` up to 100) |
| `GET` | `/api/scores/me` | Current user's top 10 scores (authenticated) |

Score submissions include a rolling checksum accumulated during gameplay (per-kill hash of word, speed, zone, and points). The server validates field sanity and rate-limits submissions. Exact validation thresholds are server-side only.

### Setup

```sh
# Set the shared JWT secret (must match auth.ljs.app)
wrangler secret put JWT_SECRET

# For local dev, add to .dev.vars:
# JWT_SECRET=your-shared-jwt-secret
# DEV_ORIGIN=http://localhost:8788
```

## Deployment

Surge runs as a Cloudflare Worker with static assets. The Worker serves the Vite-built web app and provides API routes for auth and future features.

```sh
# First time: create the Worker
npx wrangler deploy

# Set up custom domain (surge.ljs.app)
# In CF dashboard: Workers & Pages > surge > Settings > Domains & Routes

# Set auth secret
wrangler secret put JWT_SECRET

# Create D1 database for leaderboards
npx wrangler d1 create surge-db
# Update database_id in wrangler.toml with the returned ID
# Apply schema migrations
npx wrangler d1 migrations apply surge-db
```

The Worker uses D1 for the leaderboard. Migrations live in `migrations/`. The score submission API validates a per-kill rolling checksum accumulated during gameplay to resist fake submissions.

## License

ISC
