import type { GameState } from "../types.js";
import { layout, c, bLine, bDiv, padToRows, renderTitleWord, menuPromptBorder, matchesAnyOption, cursorToPrompt } from "../render.js";
import { getRandomFact } from "../game/facts.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

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

function renderScreen(state: GameState, inputBuffer: string, fact: string): string {
  const { width } = layout();
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

  // Inner width minus border padding (║ + 2 spaces each side)
  const factWidth = width - 4;
  const factLines = wrapFact(fact, factWidth, 3);

  lines.push(bDiv("═", "╔", "╗", rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}  stack overflow.${c.reset}`, rc));
  lines.push(bLine(`${c.dim}  wave ${c.white}${state.wave + 1}${c.dim} · ${c.white}${c.bold}${state.score.toLocaleString()}${c.reset}${c.dim} pts · streak ${c.white}${c.bold}${state.maxCombo}${c.reset}`, rc));
  lines.push(bLine("", rc));
  for (const fl of factLines) {
    lines.push(bLine(`  ${c.brightGreen}${fl}${c.reset}`, rc));
  }
  lines.push(bLine("", rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${jackWord} ${c.dim}to jack back in${c.reset}`, rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${quitWord} ${c.dim}to walk away${c.reset}`, rc));
  lines.push(bLine("", rc));

  padToRows(lines, rc);
  lines.push(menuPromptBorder(inputBuffer, rc));

  return "\x1b[H" + lines.join("\n") + "\x1b[J" + cursorToPrompt(inputBuffer);
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = data as GameState;
  const fact = getRandomFact();
  let inputBuffer = "";

  ctx.writeFrame(renderScreen(state, inputBuffer, fact));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.exit();
    }

    if (key === "\x7f" || key === "\b") {
      inputBuffer = inputBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(state, inputBuffer, fact));
      return;
    }

    if (key === "\x1b") {
      inputBuffer = "";
      ctx.writeFrame(renderScreen(state, inputBuffer, fact));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      if (!matchesAnyOption(inputBuffer, key, ["jack", "quit"])) return;
      inputBuffer += key;
      ctx.writeFrame(renderScreen(state, inputBuffer, fact));

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
