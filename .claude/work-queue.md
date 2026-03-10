# Work Queue

- [x] Make combo a live score multiplier (`1 + floor(combo/5) * 0.5`) — [detail](work-queue/combo-multiplier.md)
- [x] Words appear letter-by-letter instead of sliding; points = speed × length — [detail](work-queue/typewriter-spawn.md)
- [x] Embed input in bottom border: `══[ $letters ]══` centered, remove separate input/status lines
- [x] Wall erodes rightward as HP drops — bugs travel further as barrier shrinks from the right
- [x] Rest the cursor block `█` in the bottom center of the frame
- [x] Hitstun triggers when wire touches the word (gap=0) instead of on wall impact — `src/game/logic.ts`, `src/scenes/game.ts`
- [x] Show centered "Wave N" toast banner between rounds during the calm period — `src/scenes/game.ts`, `src/game/logic.ts`
- [x] Randomize matrix wire characters per-wire — each wire currently shows the same repeating hex pattern — [detail](work-queue/randomize-wire-chars.md)
- [x] Match game over scene aesthetic to title screen — center text, use title screen styling, keep red border — [detail](work-queue/gameover-aesthetic.md)
- [x] Change deployment domain to `surge.ljs.app` — update wrangler.toml and any hardcoded URLs — [detail](work-queue/domain-change.md)
- [ ] Integrate auth.ljs.app email authentication — shared parent domain cookie/token flow — [detail](work-queue/auth-integration.md)
- [ ] D1 leaderboard API — score submission with per-kill checksum validation — [detail](work-queue/leaderboard-api.md)
- [ ] Leaderboard UI scene — view global top scores from game over or title screen — [detail](work-queue/leaderboard-ui.md)
