# Match Game Over Scene to Title Screen Aesthetic

## Problem
The game over scene doesn't match the visual style of the title/opening screen. Text should be centered and styled consistently with the title screen aesthetic.

## Acceptance Criteria
- Game over scene text is centered like the title screen
- Visual styling (colors, spacing, typography) matches the title screen aesthetic
- Red border is preserved — user explicitly likes it
- Layout works in both standard and compact modes

## Relevant Files
- `src/scenes/gameover.ts` — game over scene (modify)
- `src/scenes/title.ts` — title screen (reference for aesthetic)
- `src/render.ts` — layout/centering utilities

## Constraints
- Keep the red border — do not remove or change it
- Match title screen's centering approach, not invent a new one
