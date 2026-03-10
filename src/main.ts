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

const cols = process.stdout.columns || 80;
const rows = process.stdout.rows || 24;

if (cols < MIN_COLS || rows < MIN_ROWS) {
  console.error(
    `Terminal too small: ${cols}x${rows}. Surge requires at least ${MIN_COLS}x${MIN_ROWS}.`
  );
  process.exit(1);
}

if (!process.stdin.isTTY) {
  console.error("Surge requires an interactive terminal.");
  process.exit(1);
}

// Initialize data
const bugsRaw = readFileSync(join(process.cwd(), "bugs.txt"), "utf-8");
const factsRaw = readFileSync(join(process.cwd(), "facts.txt"), "utf-8");
initWords(bugsRaw);
initFacts(factsRaw);

// Initialize terminal size and listen for resize
setTermSize(cols, rows);
process.stdout.on("resize", () => {
  setTermSize(process.stdout.columns || 80, process.stdout.rows || 24);
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
