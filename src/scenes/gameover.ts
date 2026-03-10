import type { GameState } from "../types.js";
import { layout, c, bLine, bDiv, decorBar, padToRows, renderTitleWord, menuPromptBorder, matchesAnyOption, cursorToPrompt } from "../render.js";
import { getRandomFact } from "../game/facts.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

/** Center a string within `w` columns */
function center(text: string, w: number): string {
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  return " ".repeat(pad) + text;
}

/** Word-wrap text to fit within maxWidth, returning up to maxLines lines */
function wrapFact(text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(" ");
  const result: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxWidth && line) {
      result.push(line);
      if (result.length >= maxLines) return result;
      line = word;
    } else {
      line = test;
    }
  }
  if (line && result.length < maxLines) result.push(line);
  return result;
}

function renderScreen(state: GameState, inputBuffer: string, fact: string, authEmail: string | null = null, hasAuth = false): string {
  const { compact, width } = layout();
  const inner = width;
  const lines: string[] = [];
  const rc = `${c.red}${c.bold}`; // red color for game over borders

  const input = inputBuffer.toLowerCase();
  const jackWord = renderTitleWord(
    "jack".startsWith(input) ? inputBuffer : "",
    "jack"
  );
  const quitWord = renderTitleWord(
    "quit".startsWith(input) ? inputBuffer : "",
    "quit"
  );

  // Inner width minus some padding for fact wrapping
  const factWidth = width - 4;
  const factLines = wrapFact(fact, factWidth, 3);

  const dbar = decorBar();

  lines.push(bDiv("═", "╔", "╗", rc));

  if (compact) {
    lines.push(bLine(`${c.dim}${center("stack overflow.", inner)}${c.reset}`, rc));
    const stats = `wave ${state.wave + 1} · ${state.score.toLocaleString()} pts · streak ${state.maxCombo}`;
    lines.push(bLine(`${c.dim}${center(stats, inner)}${c.reset}`, rc));
  } else {
    lines.push(bLine("", rc));
    lines.push(bLine(dbar, rc));
    lines.push(bLine("", rc));
    const title = "STACK OVERFLOW";
    lines.push(bLine(`${c.red}${c.bold}${center(title, inner)}${c.reset}`, rc));
    lines.push(bLine("", rc));
    lines.push(bLine(dbar, rc));
    lines.push(bLine("", rc));
    const statsText = `wave ${state.wave + 1}  ·  ${state.score.toLocaleString()} pts  ·  streak ${state.maxCombo}`;
    lines.push(bLine(`${c.dim}${center(statsText, inner)}${c.reset}`, rc));
  }

  lines.push(bLine("", rc));
  for (const fl of factLines) {
    lines.push(bLine(`${c.brightGreen}${center(fl, inner)}${c.reset}`, rc));
  }
  lines.push(bLine("", rc));
  if (!compact) lines.push(bLine(dbar, rc));
  if (!compact) lines.push(bLine("", rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${jackWord} ${c.dim}to jack back in${c.reset}`, rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${quitWord} ${c.dim}to walk away${c.reset}`, rc));
  lines.push(bLine("", rc));

  // Auth/leaderboard status (web only)
  if (authEmail) {
    lines.push(bLine(`${c.dim}  leaderboard coming soon · ${c.reset}${c.green}${authEmail}${c.reset}`, rc));
  } else if (hasAuth) {
    lines.push(bLine(`${c.dim}  sign in to submit scores → ${c.reset}${c.cyan}auth.ljs.app${c.reset}`, rc));
  }

  padToRows(lines, rc);
  lines.push(menuPromptBorder(inputBuffer, rc));

  return "\x1b[H" + lines.join("\n") + "\x1b[J" + cursorToPrompt(inputBuffer);
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = data as GameState;
  const fact = getRandomFact();
  let inputBuffer = "";
  const authEmail = ctx.authUser?.email ?? null;
  const hasAuth = ctx.loginUrl !== null;

  ctx.writeFrame(renderScreen(state, inputBuffer, fact, authEmail, hasAuth));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.exit();
    }

    if (key === "\x7f" || key === "\b") {
      inputBuffer = inputBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(state, inputBuffer, fact, authEmail, hasAuth));
      return;
    }

    if (key === "\x1b") {
      inputBuffer = "";
      ctx.writeFrame(renderScreen(state, inputBuffer, fact, authEmail, hasAuth));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      if (!matchesAnyOption(inputBuffer, key, ["jack", "quit"])) return;
      inputBuffer += key;
      ctx.writeFrame(renderScreen(state, inputBuffer, fact, authEmail, hasAuth));

      if (inputBuffer.toLowerCase() === "jack") {
        ctx.navigate("game");
      } else if (inputBuffer.toLowerCase() === "quit") {
        ctx.exit();
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
