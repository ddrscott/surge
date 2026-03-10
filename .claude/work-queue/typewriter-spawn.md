# Words appear letter-by-letter instead of sliding

## Problem
Currently enemies spawn with their full word visible and slide across the field. This feels flat — the reveal should build tension as letters appear one at a time at a fixed column position.

## Acceptance Criteria
- Enemy words appear at a fixed position (right side, near the wall) and reveal one letter at a time (typewriter effect)
- Each enemy has a unique constant speed (letters-per-tick rate) with good variation between enemies
- Words do NOT slide/move across the field — they stay in place and "grow"
- Points are proportional to `speed × word.length` (faster + longer = more rewarding)
- The player can start typing as soon as enough letters are visible to match
- Existing zone/kill mechanics adapt: position concept may become "reveal progress" or time-based urgency
- Power-ups use the same typewriter mechanic

## Relevant Files
- `src/game/logic.ts` — `spawnEnemy`, `gameTick` (movement → reveal), `processInput` (partial match)
- `src/scenes/game.ts` — `render`, `renderWord`, `renderDeath` (display partial words)
- `src/types.ts` — `Enemy` type (add reveal progress, remove/repurpose position)
- `src/game/state.ts` — if scoring formula changes

## Constraints
- Keep the 8-lane (now 14-lane) layout — words appear in lanes
- Wall/border rendering stays the same
- Surge mechanic unchanged
- Must still feel urgent — faster reveal = less time to react
