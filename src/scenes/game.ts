import type { Enemy, GameState, Zone } from "../types.js";
import { NUM_LANES } from "../types.js";
import { c, bLine, bDiv, WIDTH, WALL_MAX, FIELD_WIDTH, RIGHT_COL, zoneColor, bar, hpColor } from "../render.js";
import { createGame } from "../game/state.js";
import { gameTick, processInput, findTarget, getZone, comboMultiplier, revealedCount } from "../game/logic.js";
import type { SceneContext } from "./types.js";

const TICK_MS = 50; // 20fps for smooth movement

let handler: ((key: string) => void) | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

/** Render a living enemy word — only revealed letters are shown (typewriter effect) */
function renderWord(enemy: Enemy, matched: number, zone: Zone, revealed: number): string {
  const visiblePart = enemy.word.slice(0, revealed);
  const hiddenCount = enemy.word.length - revealed;
  const hiddenPart = hiddenCount > 0 ? `${c.dim}${"·".repeat(hiddenCount)}${c.reset}` : "";

  // Power-ups always render in magenta
  if (enemy.powerUp) {
    if (matched === 0) {
      return `${c.magenta}${c.bold}${visiblePart}${c.reset}${hiddenPart}`;
    }
    const matchedPart = visiblePart.slice(0, matched);
    const remaining = visiblePart.slice(matched);
    return `${c.bgMagenta}${c.black}${c.bold}${matchedPart}${c.reset}${c.magenta}${c.bold}${remaining}${c.reset}${hiddenPart}`;
  }

  const color = zoneColor(zone);

  if (matched === 0) {
    return `${color}${c.bold}${visiblePart}${c.reset}${hiddenPart}`;
  }

  const matchedPart = visiblePart.slice(0, matched);
  const remaining = visiblePart.slice(matched);

  let bgColor: string;
  if (zone === "CRITICAL") bgColor = c.bgBrightRed;
  else if (zone === "RISKY") bgColor = c.bgYellow + c.black;
  else bgColor = c.bgGreen + c.black;

  return `${bgColor}${c.bold}${matchedPart}${c.reset}${color}${c.bold}${remaining}${c.reset}${hiddenPart}`;
}

const POWER_UP_LABELS: Record<string, string> = {
  heal: "+HP",
  surge_boost: "+SURGE",
  double_score: "2x SCORE",
  slow: "FREEZE",
};

/** Fixed column where words appear (right-aligned in the field) */
function wordCol(enemy: Enemy): number {
  return Math.max(0, FIELD_WIDTH - enemy.word.length - 2);
}

/** Render a dead enemy — fading ghost on its lane */
function renderDeath(enemy: Enemy, tick: number): string {
  const age = tick - enemy.killedAt;
  const col = wordCol(enemy);
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

/** Build the bottom ╚══[ input ]══╝ border with embedded typing */
function bottomBorder(state: GameState, target: Enemy | null): string {
  const input = state.inputBuffer;
  const surgeReady = state.surgeReady;

  // Determine display text and color
  let displayText: string;
  let color: string;

  if (surgeReady && !input) {
    // Pulsing surge prompt when idle
    displayText = " type surge ";
    color = c.magenta;
  } else if (input) {
    const noMatch = target === null;
    displayText = ` ${input}█ `;
    color = noMatch ? c.red : (surgeReady ? c.magenta : c.cyan);
  } else {
    // Idle cursor
    displayText = " █ ";
    color = "";
  }

  const bracketLen = displayText.length + 2; // [ and ]
  const fillTotal = WIDTH - bracketLen;
  const leftFill = Math.floor(fillTotal / 2);
  const rightFill = fillTotal - leftFill;

  if (!input && !surgeReady) {
    // Dim idle cursor
    return `${c.cyan}╚${"═".repeat(leftFill)}[${c.dim}${displayText}${c.cyan}]${"═".repeat(rightFill)}╝${c.reset}`;
  }

  return (
    `${c.cyan}╚${"═".repeat(leftFill)}[${c.reset}` +
    `${c.bold}${color}${displayText}${c.reset}` +
    `${c.cyan}]${"═".repeat(rightFill)}╝${c.reset}`
  );
}

function render(state: GameState): string {
  const lines: string[] = [];

  lines.push("\x1b[H"); // cursor home

  // Header
  lines.push(bDiv("═", "╔", "╗"));

  const hpBar = `${hpColor(state.hp, state.maxHp)}${bar(state.hp, state.maxHp, 12)}${c.reset}`;
  const surgeBar = state.surgeReady
    ? `${c.magenta}${c.bold}▓▓ SURGE ▓▓${c.reset}`
    : `${c.blue}${bar(state.surgeMeter, state.surgeThreshold, 12)}${c.reset}`;

  lines.push(bLine(
    `  ${c.dim}integrity${c.reset} ${hpBar}  ${c.dim}surge${c.reset} ${surgeBar}`
  ));
  lines.push(bLine(
    `  ${c.dim}wave${c.reset} ${c.bold}${state.wave + 1}${c.reset}    ${c.dim}x${c.reset}${c.bold}${state.combo}${c.reset} ${c.yellow}${c.bold}(${comboMultiplier(state.combo)}x)${c.reset}    ${c.bold}${state.score.toLocaleString()}${c.reset}`
  ));
  lines.push(bDiv("═", "╠", "╣"));

  // Wall — a barrier on the right that erodes with HP
  const hpRatio = state.hp / state.maxHp;
  const wallWidth = Math.round(hpRatio * WALL_MAX);
  let wallColor: string;
  if (hpRatio > 0.6) wallColor = c.dim;
  else if (hpRatio > 0.3) wallColor = c.yellow;
  else wallColor = c.red;
  const wallStr = wallWidth > 0
    ? `${wallColor}${"█".repeat(wallWidth)}${c.reset}`
    : `${c.red}${c.bold}|${c.reset}`;
  const wallCol = WIDTH - WALL_MAX + 2; // +1 for left border

  // Zone markers — manual border + wall + status hints
  const effects: string[] = [];
  if (state.doubleScoreUntil > state.tick) effects.push(`${c.magenta}${c.bold}2x SCORE${c.reset}`);
  if (state.slowUntil > state.tick) effects.push(`${c.magenta}${c.bold}FREEZE${c.reset}`);
  const statusHint = effects.length > 0
    ? `  ${effects.join("  ")}`
    : `${c.dim}type the word to${c.reset} ${c.red}${c.bold}SQUASH${c.reset}`;
  lines.push(`${c.cyan}║${c.reset}  ${c.dim}·${c.reset}                                        ${statusHint}\x1b[K\x1b[${wallCol}G${wallStr}\x1b[${RIGHT_COL}G${c.cyan}║${c.reset}`);

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
  for (let lane = 0; lane < NUM_LANES; lane++) {
    const alive = liveLaneMap.get(lane);
    if (alive) {
      const col = wordCol(alive);
      const zone = getZone(alive.position);
      const revealed = revealedCount(alive);
      const padding = " ".repeat(Math.max(0, col));
      const isTarget = target !== null && alive.id === target.id;
      const matched = isTarget ? inputLen : 0;
      const wordStr = renderWord(alive, matched, zone, revealed);

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
  for (let i = 0; i < NUM_LANES; i++) {
    const lineIdx = lines.length - NUM_LANES + i;
    const raw = lines[lineIdx]!;
    lines[lineIdx] = `${c.cyan}║${c.reset}` + raw + `\x1b[K\x1b[${wallCol}G${wallStr}\x1b[${RIGHT_COL}G${c.cyan}║${c.reset}`;
  }

  lines.push(bDiv("─", "╟", "╢"));

  // Bottom border with embedded input
  lines.push(bottomBorder(state, target));

  return lines.join("\n") + "\x1b[J";
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
