import type { Zone } from "./types.js";

export const WIDTH = 60;
export const WALL_MAX = 4;
export const FIELD_WIDTH = WIDTH - WALL_MAX - 6; // leave room for padding + wall
export const RIGHT_COL = WIDTH + 2; // column for right border (1 left + WIDTH content + 1 right)

export const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgMagenta: "\x1b[45m",
  bgBrightRed: "\x1b[101m",
  black: "\x1b[30m",
  strikethrough: "\x1b[9m",
};

/** Wrap content line with left/right box borders */
export function bLine(content: string, color = c.cyan): string {
  return `${color}║${c.reset}${content}\x1b[K\x1b[${RIGHT_COL}G${color}║${c.reset}`;
}

/** Create a full-width divider with box corners */
export function bDiv(fill: string, left: string, right: string, color = c.cyan): string {
  return `${color}${left}${fill.repeat(WIDTH)}${right}${c.reset}`;
}

export function zoneColor(zone: Zone): string {
  switch (zone) {
    case "SAFE": return c.green;
    case "RISKY": return c.yellow;
    case "CRITICAL": return c.red;
    case "MISSED": return c.dim;
  }
}

export function bar(value: number, max: number, width: number, fillChar = "█", emptyChar = "░"): string {
  const filled = Math.round((value / max) * width);
  return fillChar.repeat(Math.max(0, filled)) + emptyChar.repeat(Math.max(0, width - filled));
}

export function hpColor(hp: number, maxHp: number): string {
  const pct = hp / maxHp;
  if (pct > 0.6) return c.green;
  if (pct > 0.3) return c.yellow;
  return c.red;
}

/** Render a prompt word with bg highlight on matched letters */
export function renderTitleWord(typed: string, word: string): string {
  const matched = typed.length;
  if (matched === 0) {
    return `${c.cyan}${c.bold}${word}${c.reset}`;
  }

  const matchedPart = word.slice(0, Math.min(matched, word.length));
  const remaining = word.slice(matched);

  return `${c.bgGreen}${c.black}${c.bold}${matchedPart}${c.reset}${c.cyan}${c.bold}${remaining}${c.reset}`;
}
