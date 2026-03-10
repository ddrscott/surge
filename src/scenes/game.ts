import type { Enemy, GameState, Zone } from "../types.js";
import { layout, c, bLine, bDiv, zoneColor, bar, hpColor } from "../render.js";
import { createGame } from "../game/state.js";
import { gameTick, processInput, findTarget, getZone, comboMultiplier } from "../game/logic.js";
import type { SceneContext } from "./types.js";

const TICK_MS = 50; // 20fps for smooth movement

let handler: ((key: string) => void) | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Render the visible portion of an enemy word.
 * startIdx/endIdx define which slice of the word is on-screen.
 * matched is how many chars from the START of the full word the player has typed.
 */
function renderWord(enemy: Enemy, matched: number, zone: Zone, startIdx: number, endIdx: number): string {
  const visiblePart = enemy.word.slice(startIdx, endIdx);

  // How much of the player's typed prefix overlaps with visible chars
  const visibleMatchCount = Math.min(visiblePart.length, Math.max(0, matched - startIdx));

  // Power-ups always render in magenta
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

const POWER_UP_LABELS: Record<string, string> = {
  heal: "+HP",
  surge_boost: "+SURGE",
  double_score: "2x SCORE",
  slow: "FREEZE",
};

/** Fraction of position travel spent scrolling the word in from the right */
const SCROLL_IN = 0.15;

/**
 * Word scrolls in from the right border (tail first), then slides left.
 * Returns col (on-screen column) and startIdx/endIdx (visible char range).
 */
function wordLayout(enemy: Enemy): { col: number; startIdx: number; endIdx: number } {
  const { fieldWidth } = layout();
  const len = enemy.word.length;
  const maxCol = fieldWidth - len; // word starts at the right border edge

  if (enemy.position <= 0) {
    // Not yet on screen
    return { col: fieldWidth, startIdx: len, endIdx: len };
  }

  if (enemy.position < SCROLL_IN) {
    // Phase 1: scrolling in from right. Tail chars appear first.
    const progress = enemy.position / SCROLL_IN;
    const visibleCount = Math.min(len, Math.max(1, Math.ceil(progress * len)));
    const startIdx = len - visibleCount;
    // Right-align the visible portion near the right edge
    const col = maxCol + (len - visibleCount);
    return { col, startIdx, endIdx: len };
  }

  // Phase 2: fully visible, sliding left toward danger
  const slideProgress = (enemy.position - SCROLL_IN) / (1.0 - SCROLL_IN);
  const col = Math.round(maxCol * (1 - slideProgress));
  if (col < 0) {
    // Word sliding off left edge
    const clip = Math.min(len, -col);
    return { col: 0, startIdx: clip, endIdx: len };
  }
  return { col, startIdx: 0, endIdx: len };
}

/** Render a dead enemy — fading ghost on its lane */
function renderDeath(enemy: Enemy, tick: number): string {
  const age = tick - enemy.killedAt;
  const { col } = wordLayout(enemy);
  const padding = " ".repeat(Math.max(0, col));

  if (enemy.killedZone === "MISSED") {
    // Power-ups that were missed just fade quietly
    if (enemy.powerUp) {
      if (age < 3) return `  ${padding}${c.dim}${enemy.word}${c.reset}`;
      return `  ${c.dim}·${c.reset}`;
    }
    if (age < 4) return `  ${padding}${c.red}${c.dim}${c.strikethrough}${enemy.word}${c.reset}`;
    return `  ${c.dim}·${c.reset}`;
  }

  // Power-up caught — show effect label
  if (enemy.powerUp) {
    const label = POWER_UP_LABELS[enemy.powerUp] || "+??";
    if (age < 4) return `  ${padding}${c.magenta}${c.bold}${label}${c.reset}`;
    if (age < 6) return `  ${padding}${c.dim}${label}${c.reset}`;
    return `  ${c.dim}·${c.reset}`;
  }

  const color = enemy.killedZone ? zoneColor(enemy.killedZone) : c.dim;
  if (age < 3) {
    return `  ${padding}${color}${c.bold}+${enemy.killedPoints}${c.reset}`;
  }
  if (age < 5) {
    return `  ${padding}${c.dim}+${enemy.killedPoints}${c.reset}`;
  }
  return `  ${c.dim}·${c.reset}`;
}

/** Build the bottom ╚══[ input ]══╝ border with score + combo */
function bottomBorder(state: GameState, target: Enemy | null): string {
  const { width, compact } = layout();
  const input = state.inputBuffer;
  const surgeReady = state.surgeReady;

  // Determine display text and color
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

  // Score + combo labels for left/right sides
  const cm = comboMultiplier(state.combo);
  const scoreStr = state.score.toLocaleString();
  const leftLabel = compact ? scoreStr : `${scoreStr}`;
  const rightLabel = state.combo > 0 ? `${cm}x` : "";
  const leftLen = leftLabel.length + 1;  // + space padding
  const rightLen = rightLabel.length > 0 ? rightLabel.length + 1 : 0;

  const bracketLen = displayText.length + 2; // [ and ]
  const fillTotal = Math.max(0, width - bracketLen - leftLen - rightLen);
  const leftFill = Math.floor(fillTotal / 2);
  const rightFill = fillTotal - leftFill;

  const leftPart = `${c.cyan}╚${c.reset}${c.bold}${c.yellow}${leftLabel}${c.reset}${c.cyan}${"═".repeat(Math.max(0, leftFill))}`;
  const rightPart = `${"═".repeat(Math.max(0, rightFill))}${c.reset}${state.combo > 0 ? `${c.bold}${c.yellow}${rightLabel}${c.reset}${c.cyan}` : ""}╝${c.reset}`;

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
  const { wallMax, rightCol, lanes, compact, barWidth } = layout();
  const lines: string[] = [];

  // Header
  lines.push(bDiv("═", "╔", "╗"));

  const hpBar = `${hpColor(state.hp, state.maxHp)}${bar(state.hp, state.maxHp, barWidth)}${c.reset}`;
  const surgeBar = state.surgeReady
    ? `${c.magenta}${c.bold}${compact ? "SURGE!" : "▓▓ SURGE ▓▓"}${c.reset}`
    : `${c.blue}${bar(state.surgeMeter, state.surgeThreshold, barWidth)}${c.reset}`;

  if (compact) {
    // Single header line for small terminals
    const cm = comboMultiplier(state.combo);
    lines.push(bLine(
      ` ${hpBar} ${surgeBar} ${c.dim}w${c.reset}${c.bold}${state.wave + 1}${c.reset} ${c.dim}x${c.reset}${c.bold}${state.combo}${c.reset}${c.yellow}(${cm}x)${c.reset} ${c.bold}${state.score.toLocaleString()}${c.reset}`
    ));
  } else {
    // Two header lines for standard terminals
    lines.push(bLine(
      `  ${c.dim}integrity${c.reset} ${hpBar}  ${c.dim}surge${c.reset} ${surgeBar}`
    ));
    lines.push(bLine(
      `  ${c.dim}wave${c.reset} ${c.bold}${state.wave + 1}${c.reset}    ${c.dim}x${c.reset}${c.bold}${state.combo}${c.reset} ${c.yellow}${c.bold}(${comboMultiplier(state.combo)}x)${c.reset}    ${c.bold}${state.score.toLocaleString()}${c.reset}`
    ));
  }
  lines.push(bDiv("═", "╠", "╣"));

  // Wall — a barrier on the LEFT that erodes as HP drops
  const hpRatio = state.hp / state.maxHp;
  const wallWidth = Math.round(hpRatio * wallMax);
  let wallColor: string;
  if (hpRatio > 0.6) wallColor = c.dim;
  else if (hpRatio > 0.3) wallColor = c.yellow;
  else wallColor = c.red;
  const wallStr = wallWidth > 0
    ? `${wallColor}${"█".repeat(wallWidth)}${c.reset}`
    : `${c.red}${c.bold}|${c.reset}`;

  // Status line (standard only)
  if (!compact) {
    const effects: string[] = [];
    if (state.doubleScoreUntil > state.tick) effects.push(`${c.magenta}${c.bold}2x SCORE${c.reset}`);
    if (state.slowUntil > state.tick) effects.push(`${c.magenta}${c.bold}FREEZE${c.reset}`);
    const statusHint = effects.length > 0
      ? `  ${effects.join("  ")}`
      : `${c.dim}type the word to${c.reset} ${c.red}${c.bold}SQUASH${c.reset}`;
    lines.push(`${c.cyan}║${c.reset}${wallStr}  ${c.dim}·${c.reset}  ${statusHint}\x1b[K\x1b[${rightCol}G${c.cyan}║${c.reset}`);
  }

  // Build lane map — living enemies take priority, dead ones shown as ghosts
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

  // Render fixed lanes (content only, borders added in wall stamp pass)
  for (let lane = 0; lane < lanes; lane++) {
    const alive = liveLaneMap.get(lane);
    if (alive) {
      const { col, startIdx, endIdx } = wordLayout(alive);
      const zone = getZone(alive.position);
      const padding = " ".repeat(Math.max(0, col));
      const isTarget = target !== null && alive.id === target.id;
      const matched = isTarget ? inputLen : 0;
      const wordStr = renderWord(alive, matched, zone, startIdx, endIdx);

      let marker: string;
      if (alive.powerUp) {
        marker = `${c.magenta}${c.bold}*${c.reset}`;
      } else if (alive.position >= 1.0) marker = `${c.red}${c.bold}!!!!${c.reset}`;
      else if (alive.position >= 0.85) marker = `${c.red}!!${c.reset}`;
      else if (alive.position >= 0.5) marker = `${c.yellow}!${c.reset}`;
      else marker = `${c.dim}·${c.reset}`;

      lines.push(`  ${padding}${wordStr} ${marker}`);
      continue;
    }

    const dead = deadLaneMap.get(lane);
    if (dead) {
      lines.push(renderDeath(dead, state.tick));
      continue;
    }

    lines.push(`  ${c.dim}·${c.reset}`);
  }

  // Stamp left border + wall + right border on each lane line
  for (let i = 0; i < lanes; i++) {
    const lineIdx = lines.length - lanes + i;
    const raw = lines[lineIdx]!;
    lines[lineIdx] = `${c.cyan}║${c.reset}${wallStr}` + raw + `\x1b[K\x1b[${rightCol}G${c.cyan}║${c.reset}`;
  }

  lines.push(bDiv("─", "╟", "╢"));

  // Bottom border with embedded input
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
