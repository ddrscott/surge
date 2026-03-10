import { layout, bLine, bDiv, decorBar, padToRows, c, renderTitleWord, menuPromptBorder, matchesAnyOption, cursorToPrompt } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

/** Center a string within `w` columns */
function center(text: string, w: number): string {
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  return " ".repeat(pad) + text;
}

interface LeaderboardEntry {
  displayName: string;
  score: number;
  wave: number;
  kills: number;
}

interface LeaderboardData {
  from: "title" | "gameover";
  /** Score just earned, for highlighting on submission */
  lastScore?: number;
  /** Whether score was just submitted */
  submitted?: boolean;
}

type LoadState = "loading" | "loaded" | "error" | "cli";

let scores: LeaderboardEntry[] = [];
let loadState: LoadState = "loading";
let currentUserId: string | null = null;

function renderScreen(inputBuffer: string, data: LeaderboardData): string {
  const { compact, width } = layout();
  const inner = width;
  const input = inputBuffer.toLowerCase();

  const backWord = renderTitleWord(
    "back".startsWith(input) ? inputBuffer : "",
    "back"
  );

  const dbar = decorBar();
  const lines: string[] = [];
  const bc = c.cyan; // border color

  lines.push(bDiv("=", "\u2554", "\u2557", bc));

  if (compact) {
    lines.push(bLine(`${c.cyan}${c.bold}${center("LEADERBOARD", inner)}${c.reset}`, bc));
  } else {
    lines.push(bLine("", bc));
    lines.push(bLine(dbar, bc));
    lines.push(bLine("", bc));
    lines.push(bLine(`${c.cyan}${c.bold}${center("LEADERBOARD", inner)}${c.reset}`, bc));
    lines.push(bLine("", bc));
    lines.push(bLine(dbar, bc));
  }

  lines.push(bLine("", bc));

  if (loadState === "loading") {
    lines.push(bLine(`${c.dim}${center("loading scores...", inner)}${c.reset}`, bc));
  } else if (loadState === "error") {
    lines.push(bLine(`${c.red}${center("failed to load scores", inner)}${c.reset}`, bc));
    lines.push(bLine(`${c.dim}${center("check your connection", inner)}${c.reset}`, bc));
  } else if (loadState === "cli") {
    lines.push(bLine(`${c.dim}${center("leaderboards require the web version", inner)}${c.reset}`, bc));
    lines.push(bLine(`${c.cyan}${center("surge.ljs.app", inner)}${c.reset}`, bc));
  } else if (scores.length === 0) {
    lines.push(bLine(`${c.dim}${center("no scores yet. be the first.", inner)}${c.reset}`, bc));
  } else {
    // Render score table
    if (compact) {
      renderScoresCompact(lines, inner, bc, data);
    } else {
      renderScoresStandard(lines, inner, bc, data);
    }
  }

  if (data.submitted) {
    lines.push(bLine("", bc));
    lines.push(bLine(`${c.green}${center("score submitted!", inner)}${c.reset}`, bc));
  }

  lines.push(bLine("", bc));
  if (!compact) lines.push(bLine(dbar, bc));
  if (!compact) lines.push(bLine("", bc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${backWord} ${c.dim}to return${c.reset}`, bc));
  lines.push(bLine("", bc));

  padToRows(lines, bc);
  lines.push(menuPromptBorder(inputBuffer, bc));

  return "\x1b[H" + lines.join("\n") + "\x1b[J" + cursorToPrompt(inputBuffer);
}

function renderScoresCompact(lines: string[], inner: number, bc: string, data: LeaderboardData): void {
  const maxEntries = 10;
  const shown = scores.slice(0, maxEntries);
  for (let i = 0; i < shown.length; i++) {
    const entry = shown[i]!;
    const rank = `${i + 1}`.padStart(2);
    const name = truncate(entry.displayName, 10);
    const pts = formatScore(entry.score);
    const isHighlight = data.lastScore !== undefined && entry.score === data.lastScore;
    const nameColor = isHighlight ? c.green : c.reset;
    const line = ` ${c.dim}${rank}.${c.reset} ${nameColor}${name.padEnd(10)}${c.reset} ${c.yellow}${pts}${c.reset}`;
    lines.push(bLine(line, bc));
  }
}

function renderScoresStandard(lines: string[], inner: number, bc: string, data: LeaderboardData): void {
  // Header
  const hdrRank = "#".padStart(3);
  const hdrName = "name".padEnd(16);
  const hdrScore = "score".padStart(10);
  const hdrWave = "wave".padStart(6);
  const hdrKills = "kills".padStart(7);
  const header = ` ${hdrRank}  ${hdrName} ${hdrScore} ${hdrWave} ${hdrKills}`;
  lines.push(bLine(`${c.dim}${header}${c.reset}`, bc));
  lines.push(bLine(`${c.dim} ${"─".repeat(Math.min(48, inner - 2))}${c.reset}`, bc));

  const maxEntries = 15;
  const shown = scores.slice(0, maxEntries);
  for (let i = 0; i < shown.length; i++) {
    const entry = shown[i]!;
    const rank = `${i + 1}`.padStart(3);
    const name = truncate(entry.displayName, 16);
    const pts = formatScore(entry.score).padStart(10);
    const wave = `${entry.wave + 1}`.padStart(6);
    const kills = `${entry.kills}`.padStart(7);
    const isHighlight = data.lastScore !== undefined && entry.score === data.lastScore;
    const nameColor = isHighlight ? `${c.green}${c.bold}` : c.reset;
    const rankColor = i < 3 ? c.yellow : c.dim;
    const line = ` ${rankColor}${rank}${c.reset}  ${nameColor}${name.padEnd(16)}${c.reset} ${c.cyan}${pts}${c.reset} ${c.dim}${wave} ${kills}${c.reset}`;
    lines.push(bLine(line, bc));
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

function formatScore(n: number): string {
  return n.toLocaleString();
}

async function fetchScores(): Promise<void> {
  try {
    loadState = "loading";
    const res = await fetch("/api/scores?limit=15");
    if (!res.ok) {
      loadState = "error";
      return;
    }
    const json: { scores: Array<{ displayName: string; score: number; wave: number; kills: number }> } = await res.json();
    scores = json.scores;
    loadState = "loaded";
  } catch {
    loadState = "error";
  }
}

export function enter(ctx: SceneContext, rawData?: unknown): void {
  const data: LeaderboardData = (rawData as LeaderboardData) ?? { from: "title" };
  let inputBuffer = "";
  currentUserId = ctx.authUser?.userId ?? null;

  // Determine if we can fetch scores (web has fetch, CLI does not)
  const isWeb = typeof globalThis.fetch === "function" && ctx.loginUrl !== null;

  if (!isWeb) {
    loadState = "cli";
    scores = [];
    ctx.writeFrame(renderScreen(inputBuffer, data));
  } else {
    loadState = "loading";
    ctx.writeFrame(renderScreen(inputBuffer, data));

    void fetchScores().then(() => {
      ctx.writeFrame(renderScreen(inputBuffer, data));
    });
  }

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.exit();
    }

    if (key === "\x7f" || key === "\b") {
      inputBuffer = inputBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(inputBuffer, data));
      return;
    }

    if (key === "\x1b") {
      inputBuffer = "";
      ctx.writeFrame(renderScreen(inputBuffer, data));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      if (!matchesAnyOption(inputBuffer, key, ["back"])) return;
      inputBuffer += key;
      ctx.writeFrame(renderScreen(inputBuffer, data));

      if (inputBuffer.toLowerCase() === "back") {
        if (data.from === "gameover") {
          ctx.navigate("title");
        } else {
          ctx.navigate("title");
        }
      }
    }
  };

  ctx.stdin.on("data", handler);
}

export function exit(ctx: SceneContext): void {
  if (handler) {
    ctx.stdin.removeListener("data", handler);
    handler = null;
  }
}
