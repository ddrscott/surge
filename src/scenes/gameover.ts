import type { GameState } from "../types.js";
import { c, bLine, bDiv, padToRows, renderTitleWord } from "../render.js";
import { getRandomFact } from "../game/facts.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

function renderScreen(state: GameState, inputBuffer: string, fact: string): string {
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

  lines.push(bDiv("═", "╔", "╗", rc));
  lines.push(bLine("", rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}  stack overflow.${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}  the system crashed on wave ${c.white}${state.wave + 1}${c.dim}.${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}  you squashed ${c.white}${c.bold}${state.score.toLocaleString()}${c.reset}${c.dim} points worth.${c.reset}`, rc));
  lines.push(bLine(`${c.dim}  longest streak: ${c.white}${c.bold}${state.maxCombo}${c.reset}${c.dim} kills.${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`  ${c.dim}${c.yellow}${fact}${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${jackWord} ${c.dim}to jack back in${c.reset}`, rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${quitWord} ${c.dim}to walk away${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`  ${c.dim}█${c.reset}`, rc));

  padToRows(lines, rc);
  lines.push(bDiv("═", "╚", "╝", rc));

  return "\x1b[H" + lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = data as GameState;
  const fact = getRandomFact();
  let inputBuffer = "";

  ctx.writeFrame(renderScreen(state, inputBuffer, fact));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.cleanup();
      process.exit(0);
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
      inputBuffer += key;
      ctx.writeFrame(renderScreen(state, inputBuffer, fact));

      if (inputBuffer.toLowerCase() === "jack") {
        ctx.navigate("game");
      } else if (inputBuffer.toLowerCase() === "quit") {
        ctx.cleanup();
        process.exit(0);
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
