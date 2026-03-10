import type { GameState } from "../types.js";
import { c, bLine, bDiv, renderTitleWord } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

function renderScreen(inputBuffer: string): string {
  const lines: string[] = [];

  const input = inputBuffer.toLowerCase();
  const resumeWord = renderTitleWord(
    "resume".startsWith(input) ? inputBuffer : "",
    "resume"
  );
  const quitWord = renderTitleWord(
    "quit".startsWith(input) ? inputBuffer : "",
    "quit"
  );

  const bar = `${c.dim}    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${c.reset}`;

  lines.push("\x1b[H");
  lines.push(bDiv("═", "╔", "╗"));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(bar));
  lines.push(bLine(""));
  lines.push(bLine(`${c.yellow}${c.bold}              PAUSED${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(bar));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(`              ${c.dim}type${c.reset} ${resumeWord} ${c.dim}to get back in${c.reset}`));
  lines.push(bLine(`              ${c.dim}type${c.reset} ${quitWord}   ${c.dim}to walk away${c.reset}`));
  lines.push(bLine(`              ${c.dim}or press${c.reset} ${c.yellow}${c.bold}ESC${c.reset} ${c.dim}to resume${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`              ${c.dim}█${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bLine(""));
  lines.push(bDiv("═", "╚", "╝"));

  return lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = data as GameState;
  let inputBuffer = "";

  ctx.writeFrame(renderScreen(inputBuffer));

  handler = (key: string) => {
    // ESC resumes immediately
    if (key === "\x1b") {
      ctx.navigate("game", state);
      return;
    }

    // Ctrl+C also resumes (same as ESC during pause)
    if (key === "\x03") {
      ctx.navigate("game", state);
      return;
    }

    if (key === "\x7f" || key === "\b") {
      inputBuffer = inputBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(inputBuffer));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      inputBuffer += key;
      ctx.writeFrame(renderScreen(inputBuffer));

      if (inputBuffer.toLowerCase() === "resume") {
        ctx.navigate("game", state);
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
