import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import { setTermSize } from "../src/render.js";
import { initWords } from "../src/game/words.js";
import { initFacts } from "../src/game/facts.js";
import type { SceneContext, InputEmitter, AuthUser } from "../src/scenes/types.js";

import * as titleScene from "../src/scenes/title.js";
import * as helpScene from "../src/scenes/help.js";
import * as gameScene from "../src/scenes/game.js";
import * as gameoverScene from "../src/scenes/gameover.js";
import * as pauseScene from "../src/scenes/pause.js";
import * as leaderboardScene from "../src/scenes/leaderboard.js";

// @ts-ignore - Vite raw import
import bugsRaw from "../bugs.txt?raw";
// @ts-ignore - Vite raw import
import factsRaw from "../facts.txt?raw";

// --- Initialize data ---
initWords(bugsRaw);
initFacts(factsRaw);

// --- Auth state ---
let authUser: AuthUser | null = null;

async function fetchAuthState(): Promise<void> {
  try {
    const res = await fetch("/api/auth/me");
    const data: { authenticated: boolean; email?: string; userId?: string } = await res.json();
    if (data.authenticated && data.email && data.userId) {
      authUser = { email: data.email, userId: data.userId };
    }
  } catch {
    // Auth check failed silently — user is unauthenticated
  }
}

function getLoginUrl(): string {
  return `/api/auth/login?returnTo=${encodeURIComponent(window.location.href)}`;
}

async function doLogout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
    authUser = null;
    // Re-render title screen after logout
    if (currentSceneName === "title") {
      navigate("title");
    }
  } catch {
    // Logout failed silently
  }
}

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

/** Read a CSS env() value in pixels (for safe-area-inset-*) */
function getSafeAreaInset(side: string): number {
  const el = document.documentElement;
  const val = getComputedStyle(el).getPropertyValue(`env(safe-area-inset-${side})`);
  return parseFloat(val) || 0;
}

function pickTier(): TermSize {
  // Use visualViewport for accurate size (excludes virtual keyboard, browser chrome)
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;

  // Account for safe area insets (notch, status bar)
  const insetTop = getSafeAreaInset("top");
  const insetBottom = getSafeAreaInset("bottom");
  const insetLeft = getSafeAreaInset("left");
  const insetRight = getSafeAreaInset("right");

  const availW = vw - insetLeft - insetRight;
  const availH = vh - insetTop - insetBottom;

  // Character aspect ratio: width ≈ 0.6 × fontSize, height ≈ 1.2 × fontSize
  const charWidthRatio = 0.6;
  const charHeightRatio = 1.2;
  const isPortrait = availH > availW;

  for (const tier of TIERS) {
    const fontByWidth = availW / (tier.cols * charWidthRatio);
    const fontByHeight = availH / (tier.rows * charHeightRatio);
    // Portrait: size to width so virtual keyboard has room below
    const fontSize = Math.floor(isPortrait ? fontByWidth : Math.min(fontByWidth, fontByHeight));

    if (fontSize >= 10) {
      return { cols: tier.cols, rows: tier.rows, fontSize };
    }
  }

  // Fallback: smallest tier, fit to width
  const smallest = TIERS[TIERS.length - 1]!;
  const fontSize = Math.max(10, Math.floor(availW / (smallest.cols * charWidthRatio)));
  return { cols: smallest.cols, rows: smallest.rows, fontSize };
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
// visualViewport fires on virtual keyboard show/hide
window.visualViewport?.addEventListener("resize", handleResize);

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
  leaderboard: leaderboardScene,
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

const ctx: SceneContext = {
  writeFrame,
  stdin: inputEmitter,
  navigate,
  cleanup,
  exit,
  get authUser() { return authUser; },
  get loginUrl() { return getLoginUrl(); },
  logout: () => { void doLogout(); },
};

// --- Start (fetch auth state, then show title) ---
async function start(): Promise<void> {
  await fetchAuthState();
  navigate("title");
  term.focus();
}

void start();

// Re-focus on any interaction
document.addEventListener("click", () => term.focus());
document.addEventListener("touchstart", () => term.focus());
