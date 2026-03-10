import { layout, bLine, bDiv, decorBar, padToRows, c } from "../render.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

function renderScreen(): string {
  const { compact } = layout();
  const dbar = decorBar();

  const lines: string[] = [];
  lines.push(bDiv("═", "╔", "╗"));
  lines.push(bLine(""));
  lines.push(bLine(dbar));
  lines.push(bLine(`${c.cyan}${c.bold}  BRIEFING${c.reset}`));
  lines.push(bLine(dbar));
  lines.push(bLine(""));

  if (compact) {
    lines.push(bLine(`${c.dim}  Type the word to kill it.${c.reset}`));
    lines.push(bLine(`${c.dim}  Close = more points.${c.reset}`));
    lines.push(bLine(`${c.dim}  Fill surge, type surge.${c.reset}`));
    lines.push(bLine(`${c.dim}  ${c.magenta}power-ups${c.reset}${c.dim} move fast.${c.reset}`));
  } else {
    lines.push(bLine(`${c.dim}    You're a process inside a dying machine.${c.reset}`));
    lines.push(bLine(`${c.dim}    Bugs are crawling toward your stack frame. Type their name to squash them.${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    As you type, your target locks on:  ${c.bgGreen}${c.black}${c.bold}hor${c.reset}${c.green}${c.bold}net${c.reset}  ${c.dim}— locked, still crawling${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    Wait for the kill zone. Bigger score:${c.reset}`));
    lines.push(bLine(`      ${c.green}far${c.reset}${c.dim}  ·····  ${c.reset}${c.yellow}close${c.reset}${c.dim}  ·····  ${c.reset}${c.red}${c.bold}SQUASH${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    Let them reach you and they corrupt memory. Lose your integrity, crash.${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    Fill the ${c.magenta}surge${c.dim} meter. Fumigate everything.${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    Watch for ${c.magenta}${c.bold}power-ups${c.reset}${c.dim} — they move fast:${c.reset}`));
    lines.push(bLine(`${c.dim}      ${c.magenta}${c.bold}patch${c.reset} ${c.dim}${c.magenta}fix${c.reset}${c.dim} = heal    ${c.magenta}${c.bold}freeze${c.reset}${c.dim} = slow bugs    ${c.magenta}${c.bold}optimize${c.reset}${c.dim} = 2x score${c.reset}`));
  }

  lines.push(bLine(""));
  lines.push(bLine(dbar));
  lines.push(bLine(`  ${c.dim}any key to go back${c.reset}`));

  padToRows(lines);
  lines.push(bDiv("═", "╚", "╝"));

  return "\x1b[H" + lines.join("\n") + "\x1b[J";
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
