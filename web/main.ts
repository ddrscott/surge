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

// --- Terminal size tiers ---
// Fixed cols x rows, pick the largest that fits the viewport.
// Font size is computed to fill available space.
const TIERS = [
  { cols: 80, rows: 25 },
  { cols: 70, rows: 22 },
  { cols: 60, rows: 18 },
  { cols: 50, rows: 16 },
  { cols: 40, rows: 15 },
] as const;

interface TermSize {
  cols: number;
  rows: number;
  fontSize: number;
}

function pickTier(): TermSize {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Character aspect ratio: height ≈ 2× width for monospace
  const charRatio = 2.0;

  for (const tier of TIERS) {
    // Calculate font size that would fit this tier in the viewport
    // Leave a small margin (8px each side)
    const margin = 16;
    const availW = vw - margin;
    const availH = vh - margin;

    const fontByWidth = availW / (tier.cols * 0.6); // char width ≈ 0.6 × fontSize
    const fontByHeight = availH / (tier.rows * charRatio * 0.6);
    const fontSize = Math.floor(Math.min(fontByWidth, fontByHeight));

    if (fontSize >= 10) {
      return { cols: tier.cols, rows: tier.rows, fontSize: Math.min(fontSize, 24) };
    }
  }

  // Fallback: smallest tier with minimum font
  const smallest = TIERS[TIERS.length - 1]!;
  return { cols: smallest.cols, rows: smallest.rows, fontSize: 10 };
}

// --- Create terminal ---
const initialSize = pickTier();

const term = new Terminal({
  cursorBlink: false,
  cursorStyle: "block",
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
  fontSize: initialSize.fontSize,
  cols: initialSize.cols,
  rows: initialSize.rows,
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

// Set terminal size
setTermSize(initialSize.cols, initialSize.rows);

// Resize on viewport change (orientation change, window resize)
let resizeTimer: number | null = null;
function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const size = pickTier();
    term.options.fontSize = size.fontSize;
    term.resize(size.cols, size.rows);
    setTermSize(size.cols, size.rows);

    // Re-render current scene by navigating to it again
    if (currentSceneName) {
      navigate(currentSceneName, currentSceneData);
    }
  }, 150);
}

window.addEventListener("resize", handleResize);
window.addEventListener("orientationchange", handleResize);

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
    const current = [...this.listeners];
    for (const listener of current) {
      listener(data);
    }
  }
}

const inputEmitter = new WebInputEmitter();

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
let currentSceneName: SceneName | null = null;
let currentSceneData: unknown = undefined;

function writeFrame(data: string): void {
  term.write(data);
}

function navigate(scene: SceneName, data?: unknown): void {
  currentScene?.exit(ctx);
  currentSceneName = scene;
  currentSceneData = data;
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
  navigate("title");
}

const ctx: SceneContext = { writeFrame, stdin: inputEmitter, navigate, cleanup, exit };

// --- Start ---
navigate("title");

// Focus terminal
term.focus();

// Re-focus on any interaction
document.addEventListener("click", () => term.focus());
document.addEventListener("touchstart", () => term.focus());
