import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as titleScene from "./scenes/title.js";
import * as helpScene from "./scenes/help.js";
import * as gameScene from "./scenes/game.js";
import * as gameoverScene from "./scenes/gameover.js";
import * as pauseScene from "./scenes/pause.js";
import type { SceneContext } from "./scenes/types.js";
import { setTermSize } from "./render.js";
import { initWords } from "./game/words.js";
import { initFacts } from "./game/facts.js";

const MIN_COLS = 30;
const MIN_ROWS = 10;

// Fixed game sizes — pick the largest that fits the terminal.
// 80x24 = landscape reference, 40x15 = compact/square reference.
const TIERS = [
  { cols: 80, rows: 25 },
  { cols: 70, rows: 22 },
  { cols: 60, rows: 18 },
  { cols: 50, rows: 16 },
  { cols: 40, rows: 15 },
] as const;

function pickGameSize(termCols: number, termRows: number): { cols: number; rows: number } {
  for (const tier of TIERS) {
    if (termCols >= tier.cols && termRows >= tier.rows) {
      return { cols: tier.cols, rows: tier.rows };
    }
  }
  // Terminal is smaller than all tiers — use what we have
  return { cols: Math.max(MIN_COLS, termCols), rows: Math.max(MIN_ROWS, termRows) };
}

const termCols = process.stdout.columns || 80;
const termRows = process.stdout.rows || 24;

if (termCols < MIN_COLS || termRows < MIN_ROWS) {
  console.error(
    `Terminal too small: ${termCols}x${termRows}. Surge requires at least ${MIN_COLS}x${MIN_ROWS}.`
  );
  process.exit(1);
}

const { cols, rows } = pickGameSize(termCols, termRows);

if (!process.stdin.isTTY) {
  console.error("Surge requires an interactive terminal.");
  process.exit(1);
}

// Initialize data
const bugsRaw = readFileSync(join(process.cwd(), "bugs.txt"), "utf-8");
const factsRaw = readFileSync(join(process.cwd(), "facts.txt"), "utf-8");
initWords(bugsRaw);
initFacts(factsRaw);

// Initialize game size and listen for resize
setTermSize(cols, rows);
process.stdout.on("resize", () => {
  const size = pickGameSize(process.stdout.columns || 80, process.stdout.rows || 24);
  setTermSize(size.cols, size.rows);
});

function writeFrame(data: string) {
  process.stdout.cork();
  process.stdout.write(data);
  process.stdout.uncork();
}

function cleanup() {
  process.stdin.setRawMode(false);
  process.stdout.write("\x1b[?25h");   // show cursor
  process.stdout.write("\x1b[?1049l"); // exit alternate screen buffer
}

const scenes = {
  title: titleScene,
  help: helpScene,
  game: gameScene,
  gameover: gameoverScene,
  pause: pauseScene,
} as const;

type SceneName = keyof typeof scenes;

let currentScene: { exit: (ctx: SceneContext) => void } | null = null;

function navigate(scene: SceneName, data?: unknown) {
  currentScene?.exit(ctx);
  writeFrame("\x1b[2J\x1b[H"); // full clear between scenes
  const target = scenes[scene];
  currentScene = target;
  target.enter(ctx, data);
}

function exit() {
  cleanup();
  process.exit(0);
}

const ctx: SceneContext = { writeFrame, stdin: process.stdin, navigate, cleanup, exit };

// Setup terminal
process.stdout.write("\x1b[?1049h"); // enter alternate screen buffer
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

navigate("title");
