import { bLine, bDiv, c } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

function renderScreen(): string {
  const lines: string[] = [];
  lines.push("\x1b[H");
  lines.push(bDiv("═", "╔", "╗"));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.cyan}${c.bold}    BRIEFING${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    Hostiles crawl toward you across the wire.${c.reset}`));
  lines.push(bLine(`${c.dim}    Each one is a word. Type it to destroy it.${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    As you type, your target locks on:${c.reset}`));
  lines.push(bLine(`${c.dim}      ${c.bgGreen}${c.black}${c.bold}pha${c.reset}${c.green}${c.bold}ntom${c.reset}  ${c.dim}— locked, still coming${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    Closer kills hit harder:${c.reset}`));
  lines.push(bLine(`      ${c.green}far${c.reset}${c.dim}  ···  ${c.reset}${c.yellow}close${c.reset}${c.dim}  ···  ${c.reset}${c.red}${c.bold}KILL ZONE${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    Let them reach you and they tear your signal.${c.reset}`));
  lines.push(bLine(`${c.dim}    Lose your signal, lose the wire.${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    Fill the ${c.magenta}surge${c.dim} meter. Unleash it. Kill them all.${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`${c.dim}    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░${c.reset}`));
  lines.push(bLine(""));
  lines.push(bLine(`    ${c.dim}any key to go back${c.reset}`));
  lines.push(bDiv("═", "╚", "╝"));

  return lines.join("\n") + "\x1b[J";
}

export function enter(ctx: SceneContext): void {
  ctx.writeFrame(renderScreen());

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.cleanup();
      process.exit(0);
    }
    ctx.navigate("title");
  };

  ctx.stdin.on("data", handler);
}

export function exit(ctx: SceneContext): void {
  if (handler) {
    ctx.stdin.removeListener("data", handler);
    handler = null;
  }
}
