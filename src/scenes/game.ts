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
const WIRE_MARGIN = 2; // breathing room between wire edge and wall/word

/** Generate a matrix hex char for a wire position */
function wireChar(tick: number, col: number, reversed: boolean): string {
  const flow = reversed ? -tick : tick;
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

/** Render word with match highlighting */
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
 * Layout: word LEFT-justified, wire grows from RIGHT toward word, wall on RIGHT.
 */
function renderLaneContent(
  enemy: Enemy,
  matched: number,
  zone: Zone,
  tick: number,
  inHitStun: boolean,
): string {
  const { fieldWidth } = layout();
  const len = enemy.word.length;
  const anchorCol = 1; // left-justified with 1-char margin

  if (enemy.position <= 0) {
    return " ".repeat(fieldWidth);
  }

  // --- Phase 1: Fade-in (whole word appears at once, dim → bright) ---
  if (enemy.position < SCROLL_IN) {
    const padding = " ".repeat(anchorCol);
    const wordStr = `${c.dim}${renderWordStr(enemy, matched, zone, 0, len)}`;
    return padding + wordStr;
  }

  // Wire area constants (shared by Phase 2 and 3)
  const wireAreaStart = anchorCol + len;
  const wireAreaEnd = fieldWidth - WIRE_MARGIN;
  const maxWireLen = Math.max(0, wireAreaEnd - wireAreaStart);

  // --- Phase 2: Static word + matrix wire (grows RIGHT→LEFT toward word) ---
  if (enemy.position < INJECTION_START) {
    const wireProgress = (enemy.position - SCROLL_IN) / (INJECTION_START - SCROLL_IN);
    const wireLen = Math.max(0, Math.round(wireProgress * maxWireLen));
    const wireStart = wireAreaEnd - wireLen;
    const gap = wireStart - wireAreaStart;

    const wireColor = zoneColor(zone);
    const reversed = matched > 0;
    let wire = "";
    for (let i = 0; i < wireLen; i++) {
      const proximity = 1 - i / Math.max(1, wireLen - 1);
      const brightness = proximity * 0.5 + wireProgress * 0.5;
      const bright = brightness > 0.6 ? c.bold : brightness > 0.3 ? "" : c.dim;
      wire += `${wireColor}${bright}${wireChar(tick, wireStart + i, reversed)}${c.reset}`;
    }

    const leftPad = " ".repeat(anchorCol);
    const gapPad = " ".repeat(Math.max(0, gap));
    const wordStr = renderWordStr(enemy, matched, zone, 0, len);

    return leftPad + wordStr + gapPad + wire;
  }

  // --- Hitstun flash: wire at full length + word, both red ---
  if (inHitStun && enemy.hitStunTriggered) {
    const wireStart = wireAreaStart; // full wire, gap = 0
    let wire = "";
    for (let i = 0; i < maxWireLen; i++) {
      wire += `${c.red}${c.bold}${wireChar(tick, wireStart + i, false)}${c.reset}`;
    }
    const leftPad = " ".repeat(anchorCol);
    const wordStr = `${c.red}${c.bold}${enemy.word}${c.reset}`;
    return leftPad + wordStr + wire;
  }

  // --- Phase 3: Elastic injection (word stretches toward RIGHT wall) ---
  // Wire stays visible as background; stretching letters overwrite it
  const injProgress = Math.min(1, (enemy.position - INJECTION_START) / (1.0 - INJECTION_START));

  // Build wire background into buffer first
  const buf: (string | null)[] = new Array(fieldWidth).fill(null);
  for (let i = 0; i < maxWireLen; i++) {
    const col = wireAreaStart + i;
    if (col < fieldWidth) {
      buf[col] = wireChar(tick, col, false);
    }
  }

  // Compute per-letter positions with staggered elastic easing
  const endAnchor = fieldWidth - WIRE_MARGIN - len;
  const letterCols: number[] = [];
  for (let i = 0; i < len; i++) {
    const delay = len > 1 ? ((len - 1 - i) * 0.3) / (len - 1) : 0;
    const lp = Math.max(0, Math.min(1, (injProgress - delay) / (1 - delay)));
    const eased = lp * lp * lp;
    const startCol = anchorCol + i;
    const endCol = endAnchor + i;
    const col = Math.round(startCol + (endCol - startCol) * eased);
    letterCols.push(col);
  }

  // Track which positions are word letters (overwriting wire)
  const letterBuf: (number | null)[] = new Array(fieldWidth).fill(null);
  for (let i = 0; i < len; i++) {
    const col = letterCols[i]!;
    if (col >= 0 && col < fieldWidth) {
      letterBuf[col] = i;
    }
  }

  // Serialize: word letters override wire chars
  const color = enemy.powerUp ? c.magenta : c.red;
  let result = "";
  let lastMode: "space" | "wire" | "letter" | null = null;

  for (let i = 0; i < fieldWidth; i++) {
    const letterIdx = letterBuf[i] ?? null;
    const wireVal = buf[i];
    let mode: "space" | "wire" | "letter";

    if (letterIdx !== null) {
      mode = "letter";
    } else if (wireVal !== null) {
      mode = "wire";
    } else {
      mode = "space";
    }

    if (mode !== lastMode) {
      if (lastMode && lastMode !== "space") result += c.reset;
      if (mode === "letter") result += `${color}${c.bold}`;
      else if (mode === "wire") result += `${c.red}${c.dim}`;
      lastMode = mode;
    }

    if (letterIdx !== null) {
      result += enemy.word[letterIdx]!;
    } else if (wireVal !== null) {
      result += wireVal;
    } else {
      result += " ";
    }
  }
  if (lastMode && lastMode !== "space") result += c.reset;

  return result;
}

/** Render a dead enemy — fading ghost on its lane */
function renderDeath(enemy: Enemy, tick: number, fieldWidth: number): string {
  const age = tick - enemy.killedAt;

  if (enemy.killedZone === "MISSED") {
    if (enemy.powerUp) {
      if (age < 3) return ` ${c.dim}${enemy.word}${c.reset}`;
      return `${c.dim}·${c.reset}`;
    }
    // Missed enemy — show near the right wall (it injected into the system)
    const rightPad = " ".repeat(Math.max(0, fieldWidth - WIRE_MARGIN - enemy.word.length));
    if (age < 4) return `${rightPad}${c.red}${c.dim}${c.strikethrough}${enemy.word}${c.reset}`;
    return `${c.dim}·${c.reset}`;
  }

  // Power-up caught — show at left anchor
  if (enemy.powerUp) {
    const label = POWER_UP_LABELS[enemy.powerUp] || "+??";
    if (age < 4) return ` ${c.magenta}${c.bold}${label}${c.reset}`;
    if (age < 6) return ` ${c.dim}${label}${c.reset}`;
    return `${c.dim}·${c.reset}`;
  }

  // Normal kill — show points at left anchor
  const color = enemy.killedZone ? zoneColor(enemy.killedZone) : c.dim;
  if (age < 3) return ` ${color}${c.bold}+${enemy.killedPoints}${c.reset}`;
  if (age < 5) return ` ${c.dim}+${enemy.killedPoints}${c.reset}`;
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

  // Wall — on the RIGHT side, erodes as HP drops
  const hpRatio = state.hp / state.maxHp;
  const wallWidth = Math.round(hpRatio * wallMax);
  let wallColor: string;
  if (hpRatio > 0.6) wallColor = c.dim;
  else if (hpRatio > 0.3) wallColor = c.yellow;
  else wallColor = c.red;
  const wallVisual = Math.max(1, wallWidth); // `|` marker is 1 char when wall is gone
  const wallStr = wallWidth > 0
    ? `${wallColor}${"█".repeat(wallWidth)}${c.reset}`
    : `${c.red}${c.bold}|${c.reset}`;
  const wallPad = " ".repeat(Math.max(0, wallMax - wallVisual));

  // Status line (standard only)
  if (!compact) {
    const effects: string[] = [];
    if (state.doubleScoreUntil > state.tick) effects.push(`${c.magenta}${c.bold}2x SCORE${c.reset}`);
    if (state.slowUntil > state.tick) effects.push(`${c.magenta}${c.bold}FREEZE${c.reset}`);
    const statusHint = effects.length > 0
      ? `  ${effects.join("  ")}`
      : `${c.dim}type the word to${c.reset} ${c.red}${c.bold}SQUASH${c.reset}`;
    lines.push(bLine(`  ${statusHint}`));
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

  // Detect inter-wave calm period (enemies cleared, waiting for next spawn)
  const isCalm = state.enemies.length === 0 && state.tick < state.nextSpawnTick && state.tick > 0;

  // Build wave toast lines to overlay on the middle of the lane area
  let toastLines: string[] | null = null;
  let toastStartLane = 0;
  if (isCalm) {
    const waveLabel = `WAVE ${state.wave + 1}`;
    const deco = "── ";
    const decoEnd = " ──";
    const toastText = `${c.bold}${c.cyan}${deco}${c.white}${waveLabel}${c.cyan}${decoEnd}${c.reset}`;
    const toastVisualLen = deco.length + waveLabel.length + decoEnd.length;
    const pad = Math.max(0, Math.floor((fieldWidth - toastVisualLen) / 2));
    toastLines = [
      " ".repeat(fieldWidth),
      " ".repeat(pad) + toastText,
      " ".repeat(fieldWidth),
    ];
    toastStartLane = Math.max(0, Math.floor((lanes - toastLines.length) / 2));
  }

  // Render lanes
  for (let lane = 0; lane < lanes; lane++) {
    // Overlay toast if in calm period
    if (toastLines && lane >= toastStartLane && lane < toastStartLane + toastLines.length) {
      lines.push(toastLines[lane - toastStartLane]!);
      continue;
    }

    const alive = liveLaneMap.get(lane);
    if (alive) {
      const zone = getZone(alive.position);
      const isTarget = target !== null && alive.id === target.id;
      const matched = isTarget ? inputLen : 0;
      const hitStun = state.hitStunUntil > state.tick;
      lines.push(renderLaneContent(alive, matched, zone, state.tick, hitStun));
      continue;
    }

    const dead = deadLaneMap.get(lane);
    if (dead) {
      lines.push(renderDeath(dead, state.tick, fieldWidth));
      continue;
    }

    lines.push(`${c.dim}·${c.reset}`);
  }

  // Stamp borders on lane lines: ║{content}{wallPad}{wall}║
  // Wall is on the RIGHT side now
  const wallCol = rightCol - wallMax; // cursor position for wall area
  for (let i = 0; i < lanes; i++) {
    const lineIdx = lines.length - lanes + i;
    const raw = lines[lineIdx]!;
    lines[lineIdx] = `${c.cyan}║${c.reset}` + raw + `\x1b[K\x1b[${wallCol}G${wallPad}${wallStr}${c.cyan}║${c.reset}`;
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
