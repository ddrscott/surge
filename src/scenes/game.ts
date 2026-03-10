import type { Enemy, GameState, Zone } from "../types.js";
import { layout, c, bLine, bDiv, zoneColor, bar, hpColor } from "../render.js";
import { createGame } from "../game/state.js";
import { gameTick, processInput, findTarget, getZone, comboMultiplier, contactPosition } from "../game/logic.js";
import type { SceneContext } from "./types.js";

const TICK_MS = 50; // 20fps for smooth movement

let handler: ((key: string) => void) | null = null;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let deathAnimStart: number | null = null;

// --- Phase thresholds (must match logic.ts SCROLL_IN) ---
const SCROLL_IN = 0.05; // brief dim fade-in

// --- Matrix wire ---
const HEX = "0123456789abcdef";
const WIRE_MARGIN = 2; // breathing room between wire edge and wall/word

/** Generate a matrix hex char for a wire position.
 *  `seed` varies the pattern per-wire so each lane looks distinct. */
function wireChar(tick: number, col: number, reversed: boolean, seed: number): string {
  const flow = reversed ? -tick : tick;
  const h = flow * 3 + col * 7 + seed * 13;
  const phase = ((h + seed * 11) % 5 + 5) % 5;
  if (phase === 0) return " ";
  if (phase === 4) return "·";
  const hexIdx = ((h) % 16 + 16) % 16;
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
  const injStart = contactPosition(enemy.word.length);
  if (enemy.position < injStart) {
    const wireLen = Math.min(maxWireLen, Math.max(0, Math.round((enemy.position - SCROLL_IN) * fieldWidth)));
    const wireStart = wireAreaEnd - wireLen;
    const gap = wireStart - wireAreaStart;

    const wireColor = zoneColor(zone);
    const reversed = matched > 0;
    let wire = "";
    for (let i = 0; i < wireLen; i++) {
      const proximity = 1 - i / Math.max(1, wireLen - 1);
      const overallProgress = wireLen / Math.max(1, maxWireLen);
      const brightness = proximity * 0.5 + overallProgress * 0.5;
      const bright = brightness > 0.6 ? c.bold : brightness > 0.3 ? "" : c.dim;
      wire += `${wireColor}${bright}${wireChar(tick, wireStart + i, reversed, enemy.lane)}${c.reset}`;
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
      wire += `${c.red}${c.bold}${wireChar(tick, wireStart + i, false, enemy.lane)}${c.reset}`;
    }
    const leftPad = " ".repeat(anchorCol);
    const wordStr = `${c.red}${c.bold}${enemy.word}${c.reset}`;
    return leftPad + wordStr + wire;
  }

  // --- Phase 3: Elastic injection (word stretches toward RIGHT wall) ---
  // Wire stays visible as background; stretching letters overwrite it
  const injProgress = Math.min(1, (enemy.position - injStart) / (1.0 - injStart));

  // Build wire background into buffer first
  const buf: (string | null)[] = new Array(fieldWidth).fill(null);
  for (let i = 0; i < maxWireLen; i++) {
    const col = wireAreaStart + i;
    if (col < fieldWidth) {
      buf[col] = wireChar(tick, col, false, enemy.lane);
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

/** Build the bottom ╚[ $ rm input█ ]═══[score]══[combo]╝ border */
function bottomBorder(state: GameState, target: Enemy | null): string {
  const { width } = layout();
  const input = state.inputBuffer;
  const surgeReady = state.surgeReady;

  const prompt = "$ rm ";
  const MIN_PROMPT = Math.max(15, Math.floor(width * 0.3));
  let inputDisplay: string;
  let contentLen: number;
  let color: string;

  if (surgeReady && !input) {
    contentLen = prompt.length + "type surge".length + 1;
    const padLen = Math.max(0, MIN_PROMPT - contentLen);
    inputDisplay = `${c.dim}${prompt}${c.reset}${c.magenta}${c.bold}type surge${c.reset}${" ".repeat(padLen + 1)}`;
  } else if (input) {
    const noMatch = target === null;
    color = noMatch ? c.red : (surgeReady ? c.magenta : c.cyan);
    contentLen = prompt.length + input.length + 1;
    const padLen = Math.max(0, MIN_PROMPT - contentLen);
    inputDisplay = `${c.dim}${prompt}${c.reset}${c.bold}${color}${input}${c.reset}${" ".repeat(padLen + 1)}`;
  } else {
    contentLen = prompt.length + 1;
    const padLen = Math.max(0, MIN_PROMPT - contentLen);
    inputDisplay = `${c.dim}${prompt}${c.reset}${" ".repeat(padLen + 1)}`;
  }

  const inputVisualLen = Math.max(MIN_PROMPT, contentLen);

  const cm = comboMultiplier(state.combo);
  const scoreStr = state.score.toLocaleString();
  const scoreLabel = scoreStr;
  const comboLabel = state.combo > 0 ? `${cm}x` : "";
  const scoreBracketLen = scoreLabel.length + 2;
  const comboBracketLen = comboLabel ? comboLabel.length + 2 : 0;
  const inputBracketLen = inputVisualLen + 2;
  const fixedLen = 2 + inputBracketLen + scoreBracketLen + comboBracketLen;
  const fillTotal = Math.max(0, width - fixedLen + 2);

  const leftPart = `${c.cyan}╚[${c.reset}${inputDisplay}${c.cyan}]`;
  const rightPart =
    `[${c.reset}${c.bold}${c.yellow}${scoreLabel}${c.reset}${c.cyan}]` +
    (comboLabel ? `[${c.reset}${c.bold}${c.yellow}${comboLabel}${c.reset}${c.cyan}]` : "") +
    `╝${c.reset}`;

  return `${leftPart}${"═".repeat(fillTotal)}${rightPart}`;
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
      const frozenTick = hitStun ? state.hitStunUntil : state.tick;
      lines.push(renderLaneContent(alive, matched, zone, frozenTick, hitStun));
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

  // Creep effect: wires bleed through the wall when HP is low
  const CREEP_THRESHOLD = 0.3;
  const MAX_CREEP = Math.round(fieldWidth * 0.3);
  if (hpRatio < CREEP_THRESHOLD && hpRatio > 0) {
    const creepProgress = 1 - hpRatio / CREEP_THRESHOLD; // 0 at 30%, 1 at 0%
    const creepCols = Math.max(0, Math.round(creepProgress * MAX_CREEP));
    if (creepCols > 0) {
      for (let i = 0; i < lanes; i++) {
        const lineIdx = lines.length - lanes + i;
        // Stagger: vary creep per lane for organic look
        const jitter = Math.round(Math.sin(i * 2.3 + state.tick * 0.05) * 2);
        const laneCols = Math.max(0, Math.min(creepCols + jitter, rightCol - 2));
        if (laneCols <= 0) continue;
        let wire = "";
        for (let col = 0; col < laneCols; col++) {
          const brightness = col / Math.max(1, laneCols - 1);
          const bright = brightness > 0.7 ? c.bold : brightness > 0.3 ? "" : c.dim;
          wire += `${c.red}${bright}${wireChar(state.tick, col + i * 7, false, i)}${c.reset}`;
        }
        const startCol = rightCol - laneCols;
        lines[lineIdx] = lines[lineIdx]! + `\x1b[${startCol}G${wire}`;
      }
    }
  }

  lines.push(bDiv("─", "╟", "╢"));
  lines.push(bottomBorder(state, target));

  const { rows } = layout();
  const cursorCol = 2 + "$ rm ".length + state.inputBuffer.length + 1;
  return "\x1b[H" + lines.join("\n") + `\x1b[J\x1b[${rows};${cursorCol}H`;
}

const DEATH_ANIM_TICKS = 50; // ~2.5s at 50ms/tick

/** Overlay matrix wires flooding from right to left at game over.
 *  Continues from the creep that was already visible at low HP.
 *  Protects the bottom border score/combo brackets. */
function renderDeathOverlay(frame: string, animTick: number, state: GameState): string {
  const { fieldWidth, lanes, rightCol, wallMax, width } = layout();
  const lines = frame.split("\n");

  // Lane lines: last `lanes` lines before divider + bottom border
  const laneEndIdx = lines.length - 2;
  const laneStartIdx = laneEndIdx - lanes;

  // Creep was at ~30% of fieldWidth when HP hit 0 — death anim continues from there
  const CREEP_START = Math.round(fieldWidth * 0.3);
  const progress = Math.min(1, animTick / DEATH_ANIM_TICKS);

  // Lanes: flood from CREEP_START to full width
  for (let i = 0; i < lanes; i++) {
    const lineIdx = laneStartIdx + i;
    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    // Per-lane stagger: outer lanes get eaten first (wave front)
    const center = lanes / 2;
    const dist = Math.abs(i - center) / center;
    const laneDelay = (1 - dist) * 0.15;
    const laneProgress = Math.max(0, Math.min(1, (progress - laneDelay) / (1 - laneDelay)));
    const totalWidth = fieldWidth + wallMax;
    const laneCols = CREEP_START + Math.round(laneProgress * laneProgress * (totalWidth - CREEP_START));

    if (laneCols <= 0) continue;

    let wire = "";
    for (let col = 0; col < laneCols; col++) {
      const brightness = col / Math.max(1, laneCols - 1);
      const bright = brightness > 0.7 ? c.bold : brightness > 0.3 ? "" : c.dim;
      wire += `${c.red}${bright}${wireChar(animTick, col + i * 7, false, i)}${c.reset}`;
    }

    const startCol = rightCol - laneCols + 1;
    if (startCol > 0) {
      lines[lineIdx] = lines[lineIdx]! + `\x1b[${startCol}G${wire}`;
    } else {
      lines[lineIdx] = `${c.cyan}║${c.reset}${wire}\x1b[${rightCol}G${c.cyan}║${c.reset}`;
    }
  }

  // Header overflow (after 60% progress)
  if (progress > 0.6) {
    const overflowProgress = (progress - 0.6) / 0.4;
    const overflowCols = Math.round(overflowProgress * overflowProgress * rightCol);
    if (overflowCols > 0) {
      for (let i = 0; i < laneStartIdx; i++) {
        let wire = "";
        for (let col = 0; col < overflowCols; col++) {
          const bright = col > overflowCols * 0.7 ? c.bold : col > overflowCols * 0.3 ? "" : c.dim;
          wire += `${c.red}${bright}${wireChar(animTick, col + i * 13, false, i + 100)}${c.reset}`;
        }
        const startCol = rightCol - overflowCols + 1;
        if (startCol > 0) {
          lines[i] = lines[i]! + `\x1b[${startCol}G${wire}`;
        }
      }

      // Bottom border: flood the fill area but protect score/combo brackets on the right
      // Bottom layout: ╚[ $ rm ...█ ]═══════[score][combo]╝
      // Protect from the first [ of score onward
      const cm = comboMultiplier(state.combo);
      const scoreStr = state.score.toLocaleString();
      const comboLabel = state.combo > 0 ? `${cm}x` : "";
      const protectedLen = scoreStr.length + 2 + (comboLabel ? comboLabel.length + 2 : 0) + 1; // brackets + ╝
      const safeCol = width + 2 - protectedLen; // 1-based column where protection starts
      const bottomCols = Math.min(overflowCols, Math.max(0, safeCol - 2)); // don't eat past score

      if (bottomCols > 0) {
        // Divider line
        const divIdx = laneEndIdx;
        let divWire = "";
        for (let col = 0; col < bottomCols; col++) {
          const bright = col > bottomCols * 0.7 ? c.bold : col > bottomCols * 0.3 ? "" : c.dim;
          divWire += `${c.red}${bright}${wireChar(animTick, col + 99, false, 99)}${c.reset}`;
        }
        const divStart = safeCol - bottomCols;
        if (divStart > 0 && divIdx >= 0 && divIdx < lines.length) {
          lines[divIdx] = lines[divIdx]! + `\x1b[${divStart}G${divWire}`;
        }

        // Bottom border line
        const botIdx = lines.length - 1;
        let botWire = "";
        for (let col = 0; col < bottomCols; col++) {
          const bright = col > bottomCols * 0.7 ? c.bold : col > bottomCols * 0.3 ? "" : c.dim;
          botWire += `${c.red}${bright}${wireChar(animTick, col + 77, false, 77)}${c.reset}`;
        }
        const botStart = safeCol - bottomCols;
        if (botStart > 0 && botIdx >= 0) {
          lines[botIdx] = lines[botIdx]! + `\x1b[${botStart}G${botWire}`;
        }
      }
    }
  }

  return lines.join("\n");
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = (data as GameState) ?? createGame();
  deathAnimStart = null;
  function renderFrame(): void {
    const frame = render(state);
    if (deathAnimStart !== null) {
      const animTick = state.tick - deathAnimStart;
      ctx.writeFrame(renderDeathOverlay(frame, animTick, state));
    } else {
      ctx.writeFrame(frame);
    }
  }

  tickInterval = setInterval(() => {
    gameTick(state);

    // Start death animation when HP hits 0
    if (state.hp <= 0 && deathAnimStart === null) {
      deathAnimStart = state.tick;
    }

    // Cancel death animation if player recovers HP (heal power-up, etc.)
    if (state.hp > 0 && deathAnimStart !== null) {
      deathAnimStart = null;
    }

    if (deathAnimStart !== null) {
      const animTick = state.tick - deathAnimStart;
      if (animTick > DEATH_ANIM_TICKS + 10) {
        state.gameOver = true;
        if (tickInterval) clearInterval(tickInterval);
        tickInterval = null;
        ctx.navigate("gameover", state);
        return;
      }
    }

    renderFrame();
  }, TICK_MS);

  handler = (key: string) => {
    if (key === "\x03" || key === "\x1b") {
      ctx.navigate("pause", state);
      return;
    }

    if (key === "\x7f" || key === "\b") {
      state.inputBuffer = state.inputBuffer.slice(0, -1);
      renderFrame();
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      state.inputBuffer += key;
      processInput(state);
      renderFrame();
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
}
