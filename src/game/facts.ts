import { readFileSync } from "node:fs";
import { join } from "node:path";

// Load facts from plain text file (one fact per line, # comments, blank lines ignored)
const factsPath = join(process.cwd(), "facts.txt");
const ALL_FACTS: string[] = readFileSync(factsPath, "utf-8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

/** Return a random fun fact */
export function getRandomFact(): string {
  if (ALL_FACTS.length === 0) return "No facts loaded.";
  return ALL_FACTS[Math.floor(Math.random() * ALL_FACTS.length)]!;
}
