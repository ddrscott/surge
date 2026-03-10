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
    lines.push(bLine(`${c.dim}  rm them before they rm you.${c.reset}`));
    lines.push(bLine(`${c.dim}  Close = more points.${c.reset}`));
    lines.push(bLine(`${c.dim}  Fill surge, type surge.${c.reset}`));
    lines.push(bLine(`${c.dim}  ${c.magenta}power-ups${c.reset}${c.dim} move fast.${c.reset}`));
  } else {
    lines.push(bLine(`${c.dim}    You're a process inside a dying machine.${c.reset}`));
    lines.push(bLine(`${c.dim}    Bugs are lodged in memory. The firewall sends ${c.reset}${c.red}red wires${c.reset}${c.dim} to pull them in.${c.reset}`));
    lines.push(bLine(`${c.dim}    ${c.reset}${c.red}rm${c.reset}${c.dim} them before they ${c.reset}${c.red}rm${c.reset}${c.dim} you. Type their name before the wire makes contact.${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    As you type, your target locks on:  ${c.bgGreen}${c.black}${c.bold}hor${c.reset}${c.green}${c.bold}net${c.reset}  ${c.dim}— locked${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    More danger, more points. Hackers like danger.${c.reset}`));
    lines.push(bLine(`      ${c.red}${c.bold}DANGER 3x${c.reset}${c.dim}  ·····  ${c.reset}${c.yellow}close 2x${c.reset}${c.dim}  ·····  ${c.reset}${c.green}safe 1x${c.reset}`));
    lines.push(bLine(""));
    lines.push(bLine(`${c.dim}    Let the wire reach a bug and it breaches your stack. Lose integrity, crash.${c.reset}`));
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
      ctx.exit();
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
