# Make Combo a Live Score Multiplier

## Problem
The combo counter increments on kill and resets on miss, but has zero mechanical effect on gameplay. It's a vanity stat. All three non-casual personas (Kai, Jordan, Sam) flagged this independently as the single highest-impact missing system.

## Acceptance Criteria
- Combo count feeds into a multiplier: `comboMultiplier = 1 + Math.floor(state.combo / 5) * 0.5`
- All point calculations in `processInput()` use `points = target.points * zoneMultiplier * comboMultiplier`
- Combo multiplier is visible in the HUD (e.g., `x3 (1.5x)` showing streak count and current multiplier)
- Missing an enemy (position >= 1.0) still resets combo to 0
- Surge kills should also benefit from the current combo multiplier

## Relevant Files
- `src/game.ts` — `processInput()` around line 171, surge kill block around line 140
- `src/renderer.ts` — HUD line around line 108

## Constraints
- Don't change the zone multiplier values (1x/2x/3x) — combo stacks on top
- Keep combo reset on miss (don't soften it yet — that's a separate task)

## Source
- Persona feedback: Kai (competitive typist), Jordan (game designer), Alex (casual gamer noted combo feels pointless)
