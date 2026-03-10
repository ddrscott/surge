import type { GameState } from "../types.js";
import { layout, c, bLine, bDiv, decorBar, padToRows, renderTitleWord, menuPromptBorder, matchesAnyOption, cursorToPrompt } from "../render.js";
import { getRandomFact } from "../game/facts.js";
import type { SceneContext } from "./types.js";

let handler: ((key: string) => void) | null = null;

/** Center a string within `w` columns */
function center(text: string, w: number): string {
  const pad = Math.max(0, Math.floor((w - text.length) / 2));
  return " ".repeat(pad) + text;
}

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

type SubmitStatus = "idle" | "submitting" | "submitted" | "failed";

function renderScreen(state: GameState, inputBuffer: string, fact: string, authEmail: string | null = null, hasAuth = false, submitStatus: SubmitStatus = "idle"): string {
  const { compact, width } = layout();
  const inner = width;
  const lines: string[] = [];
  const rc = `${c.red}${c.bold}`; // red color for game over borders

  const input = inputBuffer.toLowerCase();
  const jackWord = renderTitleWord(
    "jack".startsWith(input) ? inputBuffer : "",
    "jack"
  );
  const boardWord = renderTitleWord(
    "board".startsWith(input) ? inputBuffer : "",
    "board"
  );
  const quitWord = renderTitleWord(
    "quit".startsWith(input) ? inputBuffer : "",
    "quit"
  );

  // Inner width minus some padding for fact wrapping
  const factWidth = width - 4;
  const factLines = wrapFact(fact, factWidth, 3);

  const dbar = decorBar();

  lines.push(bDiv("═", "╔", "╗", rc));

  if (compact) {
    lines.push(bLine(`${c.dim}${center("stack overflow.", inner)}${c.reset}`, rc));
    const stats = `wave ${state.wave + 1} · ${state.score.toLocaleString()} pts · streak ${state.maxCombo}`;
    lines.push(bLine(`${c.dim}${center(stats, inner)}${c.reset}`, rc));
  } else {
    lines.push(bLine("", rc));
    lines.push(bLine(dbar, rc));
    lines.push(bLine("", rc));
    const title = "STACK OVERFLOW";
    lines.push(bLine(`${c.red}${c.bold}${center(title, inner)}${c.reset}`, rc));
    lines.push(bLine("", rc));
    lines.push(bLine(dbar, rc));
    lines.push(bLine("", rc));
    const statsText = `wave ${state.wave + 1}  ·  ${state.score.toLocaleString()} pts  ·  streak ${state.maxCombo}`;
    lines.push(bLine(`${c.dim}${center(statsText, inner)}${c.reset}`, rc));
  }

  lines.push(bLine("", rc));
  for (const fl of factLines) {
    lines.push(bLine(`${c.brightGreen}${center(fl, inner)}${c.reset}`, rc));
  }
  lines.push(bLine("", rc));
  if (!compact) lines.push(bLine(dbar, rc));
  if (!compact) lines.push(bLine("", rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${jackWord}  ${c.dim}to jack back in${c.reset}`, rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${boardWord} ${c.dim}for leaderboard${c.reset}`, rc));
  lines.push(bLine(`  ${c.dim}type${c.reset} ${quitWord}  ${c.dim}to walk away${c.reset}`, rc));
  lines.push(bLine("", rc));

  // Auth/leaderboard status (web only)
  if (authEmail && submitStatus === "submitted") {
    lines.push(bLine(`${c.green}  score submitted!${c.reset} ${c.dim}· ${c.reset}${c.green}${authEmail}${c.reset}`, rc));
  } else if (authEmail && submitStatus === "submitting") {
    lines.push(bLine(`${c.dim}  submitting score... · ${c.reset}${c.green}${authEmail}${c.reset}`, rc));
  } else if (authEmail && submitStatus === "failed") {
    lines.push(bLine(`${c.red}  submit failed${c.reset} ${c.dim}· ${c.reset}${c.green}${authEmail}${c.reset}`, rc));
  } else if (authEmail) {
    lines.push(bLine(`${c.dim}  logged in as ${c.reset}${c.green}${authEmail}${c.reset}`, rc));
  } else if (hasAuth) {
    lines.push(bLine(`${c.dim}  sign in at ${c.reset}${c.cyan}auth.ljs.app${c.reset}${c.dim} to submit scores${c.reset}`, rc));
  }

  padToRows(lines, rc);
  lines.push(menuPromptBorder(inputBuffer, rc));

  return "\x1b[H" + lines.join("\n") + "\x1b[J" + cursorToPrompt(inputBuffer);
}

async function submitScore(state: GameState, email: string): Promise<boolean> {
  try {
    const res = await fetch("/api/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        score: state.score,
        wave: state.wave,
        kills: state.kills,
        checksum: state.killChecksum,
        displayName: email.split("@")[0] ?? email,
      }),
    });
    return res.ok || res.status === 201;
  } catch {
    return false;
  }
}

export function enter(ctx: SceneContext, data?: unknown): void {
  const state = data as GameState;
  const fact = getRandomFact();
  let inputBuffer = "";
  const authEmail = ctx.authUser?.email ?? null;
  const hasAuth = ctx.loginUrl !== null;
  let submitStatus: SubmitStatus = "idle";

  const render = () => ctx.writeFrame(renderScreen(state, inputBuffer, fact, authEmail, hasAuth, submitStatus));
  render();

  // Auto-submit score if authenticated and score > 0
  if (authEmail && state.score > 0 && hasAuth) {
    submitStatus = "submitting";
    render();
    void submitScore(state, authEmail).then((ok) => {
      submitStatus = ok ? "submitted" : "failed";
      render();
    });
  }

  handler = (key: string) => {
    if (key === "\x03") {
      ctx.exit();
    }

    if (key === "\x7f" || key === "\b") {
      inputBuffer = inputBuffer.slice(0, -1);
      render();
      return;
    }

    if (key === "\x1b") {
      inputBuffer = "";
      render();
      return;
    }

    if (key.length === 1 && key >= " " && key <= "~") {
      if (!matchesAnyOption(inputBuffer, key, ["jack", "board", "quit"])) return;
      inputBuffer += key;
      render();

      if (inputBuffer.toLowerCase() === "jack") {
        ctx.navigate("game");
      } else if (inputBuffer.toLowerCase() === "board") {
        ctx.navigate("leaderboard", { from: "gameover", lastScore: state.score, submitted: submitStatus === "submitted" });
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
