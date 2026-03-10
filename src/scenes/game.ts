import type { Enemy, GameState, Zone } from "../types.js";
import { NUM_LANES } from "../types.js";
import { c, bLine, bDiv, WIDTH, WALL_MAX, FIELD_WIDTH, RIGHT_COL, zoneColor, bar, hpColor } from "../render.js";
import { createGame } from "../game/state.js";
import { gameTick, processInput, findTarget, getZone } from "../game/logic.js";
import type { SceneContext } from "./types.js";

const TICK_MS = 50; // 20fps for smooth movement

let handler: ((key: string) => void) | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;

/** Render a living enemy word with bg highlight on matched letters */
function renderWord(enemy: Enemy, matched: number, zone: Zone): string {
  const color = zoneColor(zone);

  if (matched === 0) {
    return `${color}${c.bold}${enemy.word}${c.reset}`;
  }

  const matchedPart = enemy.word.slice(0, matched);
  const remaining = enemy.word.slice(matched);

  let bgColor: string;
  if (zone === "CRITICAL") bgColor = c.bgBrightRed;
  else if (zone === "RISKY") bgColor = c.bgYellow + c.black;
  else bgColor = c.bgGreen + c.black;

  return `${bgColor}${c.bold}${matchedPart}${c.reset}${color}${c.bold}${remaining}${c.reset}`;
}

/** Render a dead enemy — fading ghost on its lane */
function renderDeath(enemy: Enemy, tick: number): string {
  const age = tick - enemy.killedAt;
  const col = Math.floor(enemy.position * FIELD_WIDTH);
  const padding = " ".repeat(Math.max(0, col));

  if (enemy.killedZone === "MISSED") {
    if (age < 4) return `  ${padding}${c.red}${c.dim}${c.strikethrough}${enemy.word}${c.reset}`;
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
    `  ${c.dim}wave${c.reset} ${c.bold}${state.wave + 1}${c.reset}    ${c.dim}x${c.reset}${c.bold}${state.combo}${c.reset}    ${c.bold}${state.score.toLocaleString()}${c.reset}`
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

  // Zone markers — manual border + wall
  lines.push(`${c.cyan}║${c.reset}  ${c.dim}·${c.reset}         ${c.dim}far${c.reset}           ${c.dim}·${c.reset}     ${c.yellow}close${c.reset}    ${c.dim}·${c.reset}  ${c.red}${c.bold}SQUASH${c.reset}\x1b[K\x1b[${wallCol}G${wallStr}\x1b[${RIGHT_COL}G${c.cyan}║${c.reset}`);

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
      const col = Math.floor(alive.position * FIELD_WIDTH);
      const zone = getZone(alive.position);
      const padding = " ".repeat(Math.max(0, col));
      const isTarget = target !== null && alive.id === target.id;
      const matched = isTarget ? inputLen : 0;
      const wordStr = renderWord(alive, matched, zone);

      let marker: string;
      if (alive.position > 0.9) marker = `${c.red}${c.bold}>>>>${c.reset}`;
      else if (alive.position > 0.75) marker = `${c.red}>>${c.reset}`;
      else if (alive.position > 0.5) marker = `${c.yellow}>${c.reset}`;
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

  // Status line
  if (state.wave === 0 && state.tick < 20 && state.enemies.length === 0) {
    lines.push(bLine(`${c.dim}  they're crawling in. name them to squash them.${c.reset}`));
  } else if (state.surgeReady) {
    lines.push(bLine(`  ${c.magenta}${c.bold}fumigate. type "surge".${c.reset}`));
  } else {
    lines.push(bLine(""));
  }

  // Input line
  lines.push(bDiv("─", "╟", "╢"));
  if (state.inputBuffer) {
    const noMatch = target === null;
    const inputColor = noMatch ? c.red : c.cyan;
    lines.push(bLine(`  ${c.bold}${inputColor}${state.inputBuffer}${c.reset}${c.dim}█${c.reset}`));
  } else {
    lines.push(bLine(`  ${c.dim}█${c.reset}`));
  }
  lines.push(bDiv("═", "╚", "╝"));

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
