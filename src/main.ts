import * as titleScene from "./scenes/title.js";
import * as helpScene from "./scenes/help.js";
import * as gameScene from "./scenes/game.js";
import * as gameoverScene from "./scenes/gameover.js";
import * as pauseScene from "./scenes/pause.js";
import type { SceneContext } from "./scenes/types.js";

const MIN_COLS = 62;
const MIN_ROWS = 22;

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
  process.stdout.write("\x1b[2J\x1b[H"); // full clear between scenes
  const target = scenes[scene];
  currentScene = target;
  target.enter(ctx, data);
}

const ctx: SceneContext = { writeFrame, stdin: process.stdin, navigate, cleanup };

// Setup terminal
process.stdout.write("\x1b[?1049h"); // enter alternate screen buffer
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.setEncoding("utf8");

navigate("title");
