import type { Enemy, GameState, Zone } from "../types.js";
import { layout, c, bLine, bDiv, zoneColor, bar, hpColor } from "../render.js";
import { createGame } from "../game/state.js";
import { gameTick, processInput, findTarget, getZone, comboMultiplier } from "../game/logic.js";
import type { SceneContext } from "./types.js";

const TICK_MS = 50; // 20fps for smooth movement

let handler: ((key: string) => void) | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

// --- Phase thresholds (must match logic.ts SCROLL_IN) ---
const SCROLL_IN = 0.05; // brief dim fade-in
const INJECTION_START = 0.85;

// --- Matrix wire ---
const HEX = "0123456789abcdef";
const WIRE_MARGIN = 2; // chars of space between wall area and wire start

/** Generate a matrix hex char for a wire position */
function wireChar(tick: number, col: number, reversed: boolean): string {
  const flow = reversed ? -tick : tick;
  // Create clusters of hex chars with gaps
  const phase = ((flow + col * 7) % 5 + 5) % 5;
  if (phase === 0) return " ";
  if (phase === 4) return "·";
  const hexIdx = ((flow * 3 + col * 7) % 16 + 16) % 16;
  return HEX[hexIdx]!;
}

const POWER_UP_LABELS: Record<string, string> = {
  heal: "+HP",
  surge_boost: "+SURGE",
  double_score: "2x SCORE",
  slow: "FREEZE",
};

/**
 * Render the word portion with match highlighting.
 * Returns colored string for the visible word chars.
 */
function renderWordStr(enemy: Enemy, matched: number, zone: Zone, startIdx: number, endIdx: number): string {
  const visiblePart = enemy.word.slice(startIdx, endIdx);
  const visibleMatchCount = Math.min(visiblePart.length, Math.max(0, matched - startIdx));

  if (enemy.powerUp) {
    if (visibleMatchCount === 0) {
      return `${c.magenta}${c.bold}${visiblePart}${c.reset}`;
    }
    const matchedPart = visiblePart.slice(0, visibleMatchCount);
    const remaining = visiblePart.slice(visibleMatchCount);
    return `${c.bgMagenta}${c.black}${c.bold}${matchedPart}${c.reset}${c.magenta}${c.bold}${remaining}${c.reset}`;
  }

  const color = zoneColor(zone);

  if (visibleMatchCount === 0) {
    return `${color}${c.bold}${visiblePart}${c.reset}`;
  }

  const matchedPart = visiblePart.slice(0, visibleMatchCount);
  const remaining = visiblePart.slice(visibleMatchCount);

  let bgColor: string;
  if (zone === "CRITICAL") bgColor = c.bgBrightRed;
  else if (zone === "RISKY") bgColor = c.bgYellow + c.black;
  else bgColor = c.bgGreen + c.black;

  return `${bgColor}${c.bold}${matchedPart}${c.reset}${color}${c.bold}${remaining}${c.reset}`;
}

/**
 * Render a full lane for a living enemy.
 * Three phases: scroll-in → static+wire → elastic injection.
 * Returns raw content string (fieldWidth visual chars) for the lane.
 */
function renderLaneContent(
  enemy: Enemy,
  matched: number,
  zone: Zone,
  tick: number,
): string {
  const { fieldWidth } = layout();
  const len = enemy.word.length;
  const anchorCol = fieldWidth - len; // right-justified

  if (enemy.position <= 0) {
    return " ".repeat(fieldWidth);
  }

  // --- Phase 1: Fade-in (whole word appears at once, dim → bright) ---
  if (enemy.position < SCROLL_IN) {
    const padding = " ".repeat(anchorCol);
    // Show full word immediately, but dim during fade
    const wordStr = `${c.dim}${renderWordStr(enemy, matched, zone, 0, len)}`;
    return padding + wordStr;
  }

  // --- Phase 2: Static word + matrix wire (grows LEFT→RIGHT toward word) ---
  if (enemy.position < INJECTION_START) {
    const wireProgress = (enemy.position - SCROLL_IN) / (INJECTION_START - SCROLL_IN);
    const maxWireLen = Math.max(0, anchorCol - WIRE_MARGIN);
    const wireLen = Math.max(0, Math.round(wireProgress * maxWireLen));
    // Wire starts at left (near wall) and extends rightward toward the word
    const wireStart = WIRE_MARGIN;
    const wireEnd = wireStart + wireLen; // right edge of wire, closing gap with word
    const gap = anchorCol - wireEnd; // space between wire end and word

    // Build wire string
    const wireColor = zoneColor(zone);
    const reversed = matched > 0; // reverse flow when typing
    let wire = "";
    for (let i = 0; i < wireLen; i++) {
      wire += wireChar(tick, wireStart + i, reversed);
    }

    const leftPad = " ".repeat(WIRE_MARGIN);
    const gapPad = " ".repeat(Math.max(0, gap));
    const wordStr = renderWordStr(enemy, matched, zone, 0, len);

    return leftPad + `${wireColor}${c.dim}${wire}${c.reset}` + gapPad + wordStr;
  }

  // --- Phase 3: Elastic injection ---
  const injProgress = Math.min(1, (enemy.position - INJECTION_START) / (1.0 - INJECTION_START));

  // Compute per-letter positions with staggered elastic easing
  const letterCols: number[] = [];
  for (let i = 0; i < len; i++) {
    // Leftmost letters (low i) start moving first
    const delay = len > 1 ? (i * 0.3) / (len - 1) : 0;
    const lp = Math.max(0, Math.min(1, (injProgress - delay) / (1 - delay)));
    const eased = lp * lp * lp; // cubic ease-in for snap feel
    const startCol = anchorCol + i;
    const endCol = i; // letters compress at the wall
    const col = Math.round(startCol + (endCol - startCol) * eased);
    letterCols.push(col);
  }

  // Build character buffer with letter index tracking
  const buf: (number | null)[] = new Array(fieldWidth).fill(null);
  for (let i = 0; i < len; i++) {
    const col = letterCols[i]!;
    if (col >= 0 && col < fieldWidth) {
      buf[col] = i; // store letter index
    }
  }

  // Serialize with proper coloring
  const color = enemy.powerUp ? c.magenta : zoneColor(zone);
  let bgColor: string;
  if (zone === "CRITICAL") bgColor = c.bgBrightRed;
  else if (zone === "RISKY") bgColor = c.bgYellow + c.black;
  else bgColor = c.bgGreen + c.black;

  let result = "";
  let lastMode: "space" | "matched" | "unmatched" | null = null;

  for (let i = 0; i < fieldWidth; i++) {
    const idx = buf[i] ?? null;
    let mode: "space" | "matched" | "unmatched";

    if (idx === null) {
      mode = "space";
    } else if (idx < matched) {
      mode = "matched";
    } else {
      mode = "unmatched";
    }

    if (mode !== lastMode) {
      if (lastMode && lastMode !== "space") result += c.reset;
      if (mode === "matched") result += `${bgColor}${c.bold}`;
      else if (mode === "unmatched") result += `${color}${c.bold}`;
      lastMode = mode;
    }

    result += idx !== null ? enemy.word[idx]! : " ";
  }
  if (lastMode && lastMode !== "space") result += c.reset;

  return result;
}

/** Render a dead enemy — fading ghost on its lane */
function renderDeath(enemy: Enemy, tick: number, fieldWidth: number): string {
  const age = tick - enemy.killedAt;
  const anchorCol = fieldWidth - enemy.word.length;
  const padding = " ".repeat(Math.max(0, anchorCol));

  if (enemy.killedZone === "MISSED") {
    if (enemy.powerUp) {
      if (age < 3) return `${padding}${c.dim}${enemy.word}${c.reset}`;
      return `${c.dim}·${c.reset}`;
    }
    // Missed enemy — show near the wall (it injected into the system)
    if (age < 4) return `${c.red}${c.dim}${c.strikethrough}${enemy.word}${c.reset}`;
    return `${c.dim}·${c.reset}`;
  }

  // Power-up caught
  if (enemy.powerUp) {
    const label = POWER_UP_LABELS[enemy.powerUp] || "+??";
    if (age < 4) return `${padding}${c.magenta}${c.bold}${label}${c.reset}`;
    if (age < 6) return `${padding}${c.dim}${label}${c.reset}`;
    return `${c.dim}·${c.reset}`;
  }

  // Normal kill — show points at anchor
  const color = enemy.killedZone ? zoneColor(enemy.killedZone) : c.dim;
  if (age < 3) return `${padding}${color}${c.bold}+${enemy.killedPoints}${c.reset}`;
  if (age < 5) return `${padding}${c.dim}+${enemy.killedPoints}${c.reset}`;
  return `${c.dim}·${c.reset}`;
}

/** Build the bottom ╚══[ input ]══╝ border with score + combo */
function bottomBorder(state: GameState, target: Enemy | null): string {
  const { width } = layout();
  const input = state.inputBuffer;
  const surgeReady = state.surgeReady;

  let displayText: string;
  let color: string;

  if (surgeReady && !input) {
    displayText = " type surge ";
    color = c.magenta;
  } else if (input) {
    const noMatch = target === null;
    displayText = ` ${input}█ `;
    color = noMatch ? c.red : (surgeReady ? c.magenta : c.cyan);
  } else {
    displayText = " █ ";
    color = "";
  }

  const cm = comboMultiplier(state.combo);
  const scoreStr = state.score.toLocaleString();
  const leftLabel = scoreStr;
  const rightLabel = state.combo > 0 ? `${cm}x` : "";
  const leftBracketLen = leftLabel.length + 2;
  const rightBracketLen = rightLabel ? rightLabel.length + 2 : 0;
  const inputBracketLen = displayText.length + 2;
  const fixedLen = 2 + leftBracketLen + inputBracketLen + rightBracketLen;
  const fillTotal = Math.max(0, width - fixedLen + 2);
  const leftFill = Math.floor(fillTotal / 2);
  const rightFill = fillTotal - leftFill;

  const leftPart = `${c.cyan}╚[${c.reset}${c.bold}${c.yellow}${leftLabel}${c.reset}${c.cyan}]${"═".repeat(leftFill)}`;
  const rightPart = `${"═".repeat(rightFill)}${rightLabel ? `[${c.reset}${c.bold}${c.yellow}${rightLabel}${c.reset}${c.cyan}]` : ""}╝${c.reset}`;

  if (!input && !surgeReady) {
    return `${leftPart}[${c.dim}${displayText}${c.cyan}]${rightPart}`;
  }

  return (
    `${leftPart}[${c.reset}` +
    `${c.bold}${color}${displayText}${c.reset}` +
    `${c.cyan}]${rightPart}`
  );
}

function render(state: GameState): string {
  const { wallMax, rightCol, lanes, compact, barWidth, fieldWidth } = layout();
  const lines: string[] = [];

  // Header
  lines.push(bDiv("═", "╔", "╗"));

  const hpBar = `${hpColor(state.hp, state.maxHp)}${bar(state.hp, state.maxHp, barWidth)}${c.reset}`;
  const surgeBar = state.surgeReady
    ? `${c.magenta}${c.bold}${compact ? "SURGE!" : "▓▓ SURGE ▓▓"}${c.reset}`
    : `${c.blue}${bar(state.surgeMeter, state.surgeThreshold, barWidth)}${c.reset}`;

  if (compact) {
    lines.push(bLine(
      ` ${hpBar} ${surgeBar} ${c.dim}w${c.reset}${c.bold}${state.wave + 1}${c.reset}`
    ));
  } else {
    lines.push(bLine(
      `  ${c.dim}integrity${c.reset} ${hpBar}  ${c.dim}surge${c.reset} ${surgeBar}`
    ));
    lines.push(bLine(
      `  ${c.dim}wave${c.reset} ${c.bold}${state.wave + 1}${c.reset}`
    ));
  }
  lines.push(bDiv("═", "╠", "╣"));

  // Wall — erodes from left as HP drops
  const hpRatio = state.hp / state.maxHp;
  const wallWidth = Math.round(hpRatio * wallMax);
  let wallColor: string;
  if (hpRatio > 0.6) wallColor = c.dim;
  else if (hpRatio > 0.3) wallColor = c.yellow;
  else wallColor = c.red;
  const wallStr = wallWidth > 0
    ? `${wallColor}${"█".repeat(wallWidth)}${c.reset}`
    : `${c.red}${c.bold}|${c.reset}`;
  // Pad wall to wallMax so content area starts at a fixed column
  const wallPad = " ".repeat(Math.max(0, wallMax - wallWidth));

  // Status line (standard only)
  if (!compact) {
    const effects: string[] = [];
    if (state.doubleScoreUntil > state.tick) effects.push(`${c.magenta}${c.bold}2x SCORE${c.reset}`);
    if (state.slowUntil > state.tick) effects.push(`${c.magenta}${c.bold}FREEZE${c.reset}`);
    const statusHint = effects.length > 0
      ? `  ${effects.join("  ")}`
      : `${c.dim}type the word to${c.reset} ${c.red}${c.bold}SQUASH${c.reset}`;
    lines.push(`${c.cyan}║${c.reset}${wallStr}${wallPad}${statusHint}\x1b[K\x1b[${rightCol}G${c.cyan}║${c.reset}`);
  }

  // Build lane map
  const liveLaneMap = new Map<number, Enemy>();
  const deadLaneMap = new Map<number, Enemy>();
  for (const enemy of state.enemies) {
    if (!enemy.dead) {
      liveLaneMap.set(enemy.lane, enemy);
    } else if (!liveLaneMap.has(enemy.lane)) {
      const existing = deadLaneMap.get(enemy.lane);
      if (!existing || enemy.killedAt > existing.killedAt) {
        deadLaneMap.set(enemy.lane, enemy);
      }
    }
  }

  const target = findTarget(state);
  const inputLen = state.inputBuffer.length;

  // Render lanes
  for (let lane = 0; lane < lanes; lane++) {
    const alive = liveLaneMap.get(lane);
    if (alive) {
      const zone = getZone(alive.position);
      const isTarget = target !== null && alive.id === target.id;
      const matched = isTarget ? inputLen : 0;
      const content = renderLaneContent(alive, matched, zone, state.tick);
      lines.push(content);
      continue;
    }

    const dead = deadLaneMap.get(lane);
    if (dead) {
      lines.push(renderDeath(dead, state.tick, fieldWidth));
      continue;
    }

    lines.push(`${c.dim}·${c.reset}`);
  }

  // Stamp left border + wall + right border on each lane line
  for (let i = 0; i < lanes; i++) {
    const lineIdx = lines.length - lanes + i;
    const raw = lines[lineIdx]!;
    lines[lineIdx] = `${c.cyan}║${c.reset}${wallStr}${wallPad}` + raw + `\x1b[K\x1b[${rightCol}G${c.cyan}║${c.reset}`;
  }

  lines.push(bDiv("─", "╟", "╢"));
  lines.push(bottomBorder(state, target));

  return "\x1b[H" + lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = (data as GameState) ?? createGame();
  process.stdout.write("\x1b[?25l"); // hide cursor

  tickInterval = setInterval(() => {
    gameTick(state);

    if (state.gameOver) {
      if (tickInterval) clearInterval(tickInterval);
      tickInterval = null;
      ctx.navigate("gameover", state);
      return;
    }

    ctx.writeFrame(render(state));
  }, TICK_MS);

  handler = (key: string) => {
    if (key === "\x03" || key === "\x1b") {
      ctx.navigate("pause", state);
      return;
    }

    if (key === "\x7f" || key === "\b") {
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      ctx.writeFrame(render(state));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      state.inputBuffer += key;
      processInput(state);
      ctx.writeFrame(render(state));
    }
  };

  ctx.stdin.on("data", handler);
}

export function exit(ctx: SceneContext): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  if (handler) {
    ctx.stdin.removeListener("data", handler);
    handler = null;
  }
  process.stdout.write("\x1b[?25h"); // show cursor
}
