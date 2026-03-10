import { layout, bLine, bDiv, decorBar, padToRows, c, renderTitleWord } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

/** Center a string within `w` columns */
function center(text: string, w: number): string {
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  return " ".repeat(pad) + text;
}

function renderScreen(titleBuffer: string): string {
  const { compact, width } = layout();
  const inner = width; // inner width between ║ borders
  const input = titleBuffer.toLowerCase();
  const surgeWord = renderTitleWord(
    "surge".startsWith(input) ? titleBuffer : "",
    "surge"
  );
  const helpWord = renderTitleWord(
    "help".startsWith(input) ? titleBuffer : "",
    "help"
  );
  const quitWord = renderTitleWord(
    "quit".startsWith(input) ? titleBuffer : "",
    "quit"
  );

  const dbar = decorBar();
  const lines: string[] = [];
  lines.push(bDiv("═", "╔", "╗"));

  // ASCII art banner lines (59 chars wide)
  const banner = [
    "███████ ██    ██ ██████   ██████  ███████",
    "██      ██    ██ ██   ██ ██       ██",
    "███████ ██    ██ ██████  ██   ███ █████",
    "     ██ ██    ██ ██   ██ ██    ██ ██",
    "███████  ██████  ██   ██  ██████  ███████",
  ];
  const bannerWidth = banner[0]!.length; // 41

  if (compact) {
    const title = "S U R G E";
    lines.push(bLine(`${center(title, inner).replace(title, `${c.cyan}${c.bold}${title}${c.reset}`)}`));
    lines.push(bLine(`${c.dim}${center("Bugs in memory.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Type to squash.", inner)}${c.reset}`));
  } else if (inner >= bannerWidth + 2) {
    // Full ASCII banner, centered
    lines.push(bLine(""));
    lines.push(bLine(dbar));
    lines.push(bLine(""));
    for (const line of banner) {
      lines.push(bLine(`${c.cyan}${c.bold}${center(line, inner)}${c.reset}`));
    }
    lines.push(bLine(""));
    lines.push(bLine(dbar));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}${center("The system is infested.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Bugs are crawling through memory.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Name them to squash them.", inner)}${c.reset}`));
  } else {
    // Medium: too narrow for ASCII art, too wide for compact
    lines.push(bLine(dbar));
    lines.push(bLine(""));
    const title = "S U R G E";
    lines.push(bLine(`${c.cyan}${c.bold}${center(title, inner)}${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(dbar));
    lines.push(bLine(`${c.dim}${center("The system is infested.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Bugs are crawling through memory.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Name them to squash them.", inner)}${c.reset}`));
  }

  lines.push(bLine(""));
  if (!compact) lines.push(bLine(dbar));
  if (!compact) lines.push(bLine(""));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${surgeWord} ${c.dim}to jack in${c.reset}`));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${helpWord}  ${c.dim}for briefing${c.reset}`));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${quitWord}  ${c.dim}to walk away${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`  ${c.dim}█${c.reset}`));

  padToRows(lines);
  lines.push(bDiv("═", "╚", "╝"));

  return "\x1b[H" + lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext): void {
  let titleBuffer = "";
  ctx.writeFrame(renderScreen(titleBuffer));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.exit();
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
      } else if (titleBuffer.toLowerCase() === "quit") {
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
