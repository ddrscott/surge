# Leaderboard UI Scene

## Problem
Players need to view global high scores and see where they rank.

## Acceptance Criteria
- New leaderboard scene accessible from title screen menu and game over screen
- Displays top 10-20 global scores with rank, name, score, wave reached
- Current user's score highlighted if present
- "Submit Score" option on game over screen (if authenticated and score is valid)
- Loading/error states handled gracefully
- Works in both standard and compact display modes
- Matches the game's ANSI/terminal aesthetic

## Relevant Files
- `src/scenes/leaderboard.ts` — new file
- `src/scenes/title.ts` — add "Leaderboard" menu option
- `src/scenes/gameover.ts` — add "Submit Score" / "View Leaderboard" options
- `src/main.ts` — register new scene in navigator
- `src/render.ts` — reuse existing layout utilities

## Constraints
- Depends on leaderboard API being complete
- Should feel native to the terminal aesthetic, not like a web overlay
- Compact mode needs to work (fewer rows available)
