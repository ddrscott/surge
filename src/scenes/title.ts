import { bLine, bDiv, c, renderTitleWord } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

function renderScreen(titleBuffer: string): string {
  const input = titleBuffer.toLowerCase();
  const surgeWord = renderTitleWord(
    "surge".startsWith(input) ? titleBuffer : "",
    "surge"
  );
  const helpWord = renderTitleWord(
    "help".startsWith(input) ? titleBuffer : "",
    "help"
  );

  const lines: string[] = [];
  lines.push("\x1b[H");
  lines.push(bDiv("═", "╔", "╗"));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.cyan}${c.bold}    ███████ ██    ██ ██████   ██████  ███████${c.reset}`));
  lines.push(bLine(`${c.cyan}${c.bold}    ██      ██    ██ ██   ██ ██       ██${c.reset}`));
  lines.push(bLine(`${c.cyan}${c.bold}    ███████ ██    ██ ██████  ██   ███ █████${c.reset}`));
  lines.push(bLine(`${c.cyan}${c.bold}         ██ ██    ██ ██   ██ ██    ██ ██${c.reset}`));
  lines.push(bLine(`${c.cyan}${c.bold}    ███████  ██████  ██   ██  ██████  ███████${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    The system is infested.${c.reset}`));
  lines.push(bLine(`${c.dim}    Bugs are crawling through memory.${c.reset}`));
  lines.push(bLine(`${c.dim}    Name them to squash them.${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`    ${c.dim}type${c.reset} ${surgeWord} ${c.dim}to jack in${c.reset}`));
  lines.push(bLine(`    ${c.dim}type${c.reset} ${helpWord}  ${c.dim}for briefing${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`    ${c.dim}█${c.reset}`));
  lines.push(bDiv("═", "╚", "╝"));

  return lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext): void {
  let titleBuffer = "";
  ctx.writeFrame(renderScreen(titleBuffer));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.cleanup();
      process.exit(0);
    }

    if (key === "\x7f" || key === "\b") {
      titleBuffer = titleBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(titleBuffer));
      return;
    }

    if (key === "\x1b") {
      titleBuffer = "";
      ctx.writeFrame(renderScreen(titleBuffer));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      titleBuffer += key;
      ctx.writeFrame(renderScreen(titleBuffer));

      if (titleBuffer.toLowerCase() === "surge") {
        ctx.navigate("game");
      } else if (titleBuffer.toLowerCase() === "help") {
        ctx.navigate("help");
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
