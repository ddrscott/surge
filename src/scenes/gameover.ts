import type { GameState } from "../types.js";
import { c, bLine, bDiv, renderTitleWord } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

function renderScreen(state: GameState, inputBuffer: string): string {
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

  lines.push("\x1b[H");
  lines.push(bLine("", rc));
  lines.push(bDiv("═", "╔", "╗", rc));
  lines.push(bLine("", rc));
  lines.push(bLine("", rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}              stack overflow.${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}              the system crashed${c.reset}`, rc));
  lines.push(bLine(`${c.dim}              on wave ${c.white}${state.wave + 1}${c.dim}.${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`${c.dim}              you squashed ${c.white}${c.bold}${state.score.toLocaleString()}${c.reset}${c.dim} points worth.${c.reset}`, rc));
  lines.push(bLine(`${c.dim}              longest streak: ${c.white}${c.bold}${state.maxCombo}${c.reset}${c.dim} kills.${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`              ${c.dim}type${c.reset} ${jackWord} ${c.dim}to jack back in${c.reset}`, rc));
  lines.push(bLine(`              ${c.dim}type${c.reset} ${quitWord} ${c.dim}to walk away${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bLine(`              ${c.dim}█${c.reset}`, rc));
  lines.push(bLine("", rc));
  lines.push(bDiv("═", "╚", "╝", rc));

  return lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = data as GameState;
  let inputBuffer = "";

  ctx.writeFrame(renderScreen(state, inputBuffer));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.cleanup();
      process.exit(0);
    }

    if (key === "\x7f" || key === "\b") {
      inputBuffer = inputBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(state, inputBuffer));
      return;
    }

    if (key === "\x1b") {
      inputBuffer = "";
      ctx.writeFrame(renderScreen(state, inputBuffer));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      inputBuffer += key;
      ctx.writeFrame(renderScreen(state, inputBuffer));

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
