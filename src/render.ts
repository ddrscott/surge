import type { Zone } from "./types.js";

export interface Layout {
  width: number;
  wallMax: number;
  fieldWidth: number;
  rightCol: number;
  lanes: number;
  compact: boolean;
  rows: number;
  cols: number;
  barWidth: number;
}

let _cols = 80;
let _rows = 24;

/** Set terminal dimensions (call on init and resize) */
export function setTermSize(cols: number, rows: number): void {
  _cols = cols;
  _rows = rows;
}

/** Compute layout from current terminal size */
export function layout(): Layout {
  const cols = Math.max(30, _cols);
  const rows = Math.max(8, _rows);
  const compact = cols < 60 || rows < 18;
  const width = cols - 2;
  const wallMax = compact ? 2 : 4;
  const fieldWidth = width - wallMax; // full content area after wall
  const rightCol = cols;
  // Standard: top(1) + header(2) + div(1) + status(1) + lanes + div(1) + bottom(1) = lanes + 7
  // Compact:  top(1) + header(1) + div(1) + lanes + div(1) + bottom(1) = lanes + 5
  const overhead = compact ? 5 : 7;
  const lanes = Math.max(3, rows - overhead);
  const barWidth = compact ? 6 : 12;
  return { width, wallMax, fieldWidth, rightCol, lanes, compact, rows, cols, barWidth };
}

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
  brightGreen: "\x1b[92m",
  strikethrough: "\x1b[9m",
};

/** Wrap content line with left/right box borders */
export function bLine(content: string, color = c.cyan): string {
  const { rightCol } = layout();
  return `${color}║${c.reset}${content}\x1b[K\x1b[${rightCol}G${color}║${c.reset}`;
}

/** Create a full-width divider with box corners */
export function bDiv(fill: string, left: string, right: string, color = c.cyan): string {
  const { width, rightCol } = layout();
  return `${color}${left}${fill.repeat(width)}\x1b[${rightCol}G${right}${c.reset}`;
}

/** Decorative bar that scales to terminal width */
export function decorBar(): string {
  const { width } = layout();
  const barWidth = Math.max(4, width - 8);
  return `${c.dim}    ${"░".repeat(barWidth)}${c.reset}`;
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

/** Pad lines array so total output fills `rows`.
 *  Call BEFORE pushing the bottom border line. */
export function padToRows(lines: string[], borderColor = c.cyan): void {
  const { rows } = layout();
  // We still need to add 1 bottom border after this call
  const needed = rows - lines.length - 1;
  for (let i = 0; i < needed; i++) {
    lines.push(bLine("", borderColor));
  }
}

/** Build menu bottom border: ╚[ $ cd input ]════════╝ */
export function menuPromptBorder(input: string, borderColor = c.cyan): string {
  const { width } = layout();
  const prompt = "$ cd ";
  const MIN_PROMPT = Math.max(15, Math.floor(width * 0.3));
  const contentLen = prompt.length + (input ? input.length + 1 : 1); // +space after input
  const padLen = Math.max(0, MIN_PROMPT - contentLen);
  const inputDisplay = input
    ? `${c.dim}${prompt}${c.reset}${c.bold}${c.cyan}${input}${c.reset}${" ".repeat(padLen + 1)}`
    : `${c.dim}${prompt}${c.reset}${" ".repeat(padLen + 1)}`;
  const bracketLen = Math.max(MIN_PROMPT, contentLen) + 2; // [ ... ]
  const { rightCol } = layout();
  const fillLen = Math.max(0, width - bracketLen - 2 + 2); // ╚ + ╝
  return `${borderColor}╚[${c.reset}${inputDisplay}${borderColor}]${"═".repeat(fillLen)}\x1b[${rightCol}G╝${c.reset}`;
}

/** ANSI sequence to park cursor at the prompt input position on the bottom row */
export function cursorToPrompt(input: string, promptStr = "$ cd "): string {
  const { rows } = layout();
  const cursorCol = 2 + promptStr.length + input.length + 1;
  return `\x1b[${rows};${cursorCol}H`;
}

/** Check if adding `ch` to `buffer` still prefixes at least one option */
export function matchesAnyOption(buffer: string, ch: string, options: string[]): boolean {
  const candidate = (buffer + ch).toLowerCase();
  return options.some(opt => opt.startsWith(candidate));
}
