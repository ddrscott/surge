import { layout, bLine, bDiv, decorBar, padToRows, c, renderTitleWord, menuPromptBorder, matchesAnyOption, cursorToPrompt } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

/** Center a string within `w` columns */
function center(text: string, w: number): string {
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  return " ".repeat(pad) + text;
}

function renderScreen(titleBuffer: string, bestScore: number): string {
  const { compact, width, rows } = layout();
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

  // ASCII art banner lines (41 chars wide)
  const banner = [
    "███████ ██    ██ ██████   ██████  ███████",
    "██      ██    ██ ██   ██ ██       ██",
    "███████ ██    ██ ██████  ██   ███ █████",
    "     ██ ██    ██ ██   ██ ██    ██ ██",
    "███████  ██████  ██   ██  ██████  ███████",
  ];
  const bannerWidth = banner[0]!.length; // 41

  // Fixed content: top border(1) + menu(3) + blank(1) + prompt(1) = 6
  // Budget remaining rows for banner + taglines + spacers
  const fixedLines = 1 + 3 + 1 + 1;
  const budgetForBanner = rows - fixedLines;

  if (compact) {
    const title = "S U R G E";
    lines.push(bLine(`${center(title, inner).replace(title, `${c.cyan}${c.bold}${title}${c.reset}`)}`));
    lines.push(bLine(`${c.dim}${center("Bugs in memory.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("rm them before they rm you.", inner)}${c.reset}`));
  } else if (inner >= bannerWidth + 2 && budgetForBanner >= 12) {
    // Full ASCII banner with breathing room: 5 banner + 3 taglines + 4 spacers/dbars = 12 min
    const spacious = budgetForBanner >= 16;
    if (spacious) lines.push(bLine(""));
    lines.push(bLine(dbar));
    if (spacious) lines.push(bLine(""));
    for (const line of banner) {
      const padded = line + " ".repeat(bannerWidth - line.length);
      lines.push(bLine(`${c.cyan}${c.bold}${center(padded, inner)}${c.reset}`));
    }
    if (spacious) lines.push(bLine(""));
    lines.push(bLine(dbar));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}${center("The system is infested.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Bugs are lodged in memory.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("rm them before they rm you.", inner)}${c.reset}`));
  } else if (!compact) {
    // Medium: text title instead of ASCII art
    lines.push(bLine(dbar));
    lines.push(bLine(""));
    const title = "S U R G E";
    lines.push(bLine(`${c.cyan}${c.bold}${center(title, inner)}${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(dbar));
    lines.push(bLine(`${c.dim}${center("The system is infested.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("Bugs are lodged in memory.", inner)}${c.reset}`));
    lines.push(bLine(`${c.dim}${center("rm them before they rm you.", inner)}${c.reset}`));
  }

  lines.push(bLine(""));
  if (!compact && budgetForBanner >= 14) lines.push(bLine(dbar));
  if (!compact && budgetForBanner >= 14) lines.push(bLine(""));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${surgeWord} ${c.dim}to jack in${c.reset}`));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${helpWord}  ${c.dim}for briefing${c.reset}`));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${quitWord}  ${c.dim}to walk away${c.reset}`));
  if (bestScore > 0) {
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}  high score: ${c.reset}${c.cyan}${bestScore.toLocaleString()}${c.reset}`));
  }

  padToRows(lines);
  lines.push(menuPromptBorder(titleBuffer));

  return "\x1b[H" + lines.join("\n") + "\x1b[J" + cursorToPrompt(titleBuffer);
}

export function enter(ctx: SceneContext): void {
  let titleBuffer = "";
  const localScores = ctx.getLocalScores();
  const bestScore = localScores.length > 0 ? localScores[0]!.score : 0;

  ctx.writeFrame(renderScreen(titleBuffer, bestScore));

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.exit();
    }

    if (key === "\x7f" || key === "\b") {
      titleBuffer = titleBuffer.slice(0, -1);
      ctx.writeFrame(renderScreen(titleBuffer, bestScore));
      return;
    }

    if (key === "\x1b") {
      titleBuffer = "";
      ctx.writeFrame(renderScreen(titleBuffer, bestScore));
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      if (!matchesAnyOption(titleBuffer, key, ["surge", "help", "quit"])) return;
      titleBuffer += key;
      ctx.writeFrame(renderScreen(titleBuffer, bestScore));

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
