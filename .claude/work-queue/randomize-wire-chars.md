# Randomize Matrix Wire Characters Per-Wire

## Problem
The `wireChar()` function in `src/scenes/game.ts` generates characters using only `tick` and `col` — no per-wire seed. Every wire on screen shows the identical repeating hex pattern (`4•29 7•5c a•8f d•b2 ...`), which looks artificial and uniform instead of chaotic/matrix-like.

## Root Cause
```ts
function wireChar(tick: number, col: number, reversed: boolean): string {
  const flow = reversed ? -tick : tick;
  const phase = ((flow + col * 7) % 5 + 5) % 5;
  // ...
  const hexIdx = ((flow * 3 + col * 7) % 16 + 16) % 16;
  return HEX[hexIdx]!;
}
```
The multipliers (7, 3) and moduli (5, 16) are fixed constants — no per-wire variation.

## Acceptance Criteria
- Each wire on screen has visually distinct character sequences
- Wires still animate (flow with tick) but look independently random
- No `Math.random()` in the render loop — keep it deterministic for consistency
- Death animation wires should also vary (they use offset seeds like `col + i * 7`)
- Performance: no noticeable frame drops (avoid allocations in hot path)

## Approach
Add a `seed` parameter to `wireChar(tick, col, reversed, seed)`. Use the seed to vary both the phase pattern and hex character selection. Each call site already has a natural per-wire identifier:
- Lane enemies: `enemy` index or lane index
- Death animation: already uses `i` (lane index)
- Creep overlay: lane index

A simple approach: mix `seed` into the hash with different prime multipliers:
```ts
function wireChar(tick: number, col: number, reversed: boolean, seed: number): string {
  const flow = reversed ? -tick : tick;
  const h = flow * 3 + col * 7 + seed * 13;
  const phase = ((h + seed * 11) % 5 + 5) % 5;
  if (phase === 0) return " ";
  if (phase === 4) return "·";
  const hexIdx = ((h) % 16 + 16) % 16;
  return HEX[hexIdx]!;
}
```

## Relevant Files
- `src/scenes/game.ts` — `wireChar()` function (line ~21) and all call sites (~8 locations)

## Constraints
- Keep deterministic (no `Math.random()` in render path)
- Don't break hitstun frozen-tick behavior
- Minimal changes — just add seed parameter threading
