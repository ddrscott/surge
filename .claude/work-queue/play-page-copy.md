# Add Editorial Copy Around xterm on /play Page

## Problem
The `/play` page (`web/play/index.html`) is a bare fullscreen terminal with no surrounding context. Users arriving directly at `/play` have no idea what they're looking at or how to interact. The landing page (`web/index.html`) has great copy and design language that should be echoed here.

## Acceptance Criteria
- Add minimal editorial copy around the xterm terminal (header, footer, or sidebar text)
- Match the landing page's design language: JetBrains Mono, cyan accents, dark bg, monospace aesthetic
- Include brief context: game name, a one-liner about what to do, maybe keyboard hint
- Include a link back to `/` (landing page)
- Show auth status if signed in (similar to landing page pattern)
- **Do NOT touch the xterm terminal output or `main.ts`** — only the HTML/CSS wrapper
- Keep it minimal — the terminal is the star, copy is supporting context
- Must not break the existing responsive/mobile layout (safe-area insets, dvh, etc.)

## Relevant Files
- `web/play/index.html` — the file to modify
- `web/index.html` — reference for design language and styling patterns
- `web/play/main.ts` — do NOT modify

## Constraints
- Don't add heavy layout that competes with the terminal
- Keep the terminal as the dominant visual element
- Copy should feel like a thin HUD/frame, not a full page
