import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { setTermSize } from "../src/render.js";
import { initWords } from "../src/game/words.js";
import { initFacts } from "../src/game/facts.js";
import type { SceneContext, InputEmitter } from "../src/scenes/types.js";

import * as titleScene from "../src/scenes/title.js";
import * as helpScene from "../src/scenes/help.js";
import * as gameScene from "../src/scenes/game.js";
import * as gameoverScene from "../src/scenes/gameover.js";
import * as pauseScene from "../src/scenes/pause.js";

// @ts-ignore - Vite raw import
import bugsRaw from "../bugs.txt?raw";
// @ts-ignore - Vite raw import
import factsRaw from "../facts.txt?raw";

// --- Initialize data ---
initWords(bugsRaw);
initFacts(factsRaw);

// --- Create terminal ---
const term = new Terminal({
  cursorBlink: false,
  cursorStyle: "block",
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
  fontSize: 16,
  theme: {
    background: "#0a0a0a",
    foreground: "#c0c0c0",
    cursor: "#00ffff",
    cursorAccent: "#0a0a0a",
    black: "#0a0a0a",
    red: "#ff3333",
    green: "#33ff33",
    yellow: "#ffff33",
    blue: "#3333ff",
    magenta: "#ff33ff",
    cyan: "#33ffff",
    white: "#c0c0c0",
    brightBlack: "#666666",
    brightRed: "#ff6666",
    brightGreen: "#66ff66",
    brightYellow: "#ffff66",
    brightBlue: "#6666ff",
    brightMagenta: "#ff66ff",
    brightCyan: "#66ffff",
    brightWhite: "#ffffff",
  },
  allowTransparency: false,
  scrollback: 0,
  convertEol: true,
});

const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal")!);
fitAddon.fit();

// Set initial terminal size
setTermSize(term.cols, term.rows);

// Handle resize
const resizeObserver = new ResizeObserver(() => {
  fitAddon.fit();
  setTermSize(term.cols, term.rows);
});
resizeObserver.observe(document.getElementById("terminal")!);

// --- Input emitter (bridges xterm.js onData to scene system) ---
type DataListener = (key: string) => void;

class WebInputEmitter implements InputEmitter {
  private listeners: DataListener[] = [];

  on(_event: "data", listener: DataListener): void {
    this.listeners.push(listener);
  }

  removeListener(_event: "data", listener: DataListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  emit(data: string): void {
    // Fire a copy of the listener list (scene changes may modify it mid-iteration)
    const current = [...this.listeners];
    for (const listener of current) {
      listener(data);
    }
  }
}

const inputEmitter = new WebInputEmitter();

// Wire xterm.js keyboard input to the emitter
term.onData((data) => {
  inputEmitter.emit(data);
});

// --- Scene system ---
const scenes = {
  title: titleScene,
  help: helpScene,
  game: gameScene,
  gameover: gameoverScene,
  pause: pauseScene,
} as const;

type SceneName = keyof typeof scenes;
let currentScene: { exit: (ctx: SceneContext) => void } | null = null;

function writeFrame(data: string): void {
  term.write(data);
}

function navigate(scene: SceneName, data?: unknown): void {
  currentScene?.exit(ctx);
  writeFrame("\x1b[2J\x1b[H");
  const target = scenes[scene];
  currentScene = target;
  target.enter(ctx, data);
}

function cleanup(): void {
  writeFrame("\x1b[?25h");
}

function exit(): void {
  cleanup();
  // In browser, navigate back to title instead of closing
  navigate("title");
}

const ctx: SceneContext = { writeFrame, stdin: inputEmitter, navigate, cleanup, exit };

// --- Start ---
navigate("title");

// Focus terminal
term.focus();

// Re-focus on click
document.addEventListener("click", () => term.focus());
