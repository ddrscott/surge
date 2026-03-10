let ALL_FACTS: string[] = [];

/** Initialize facts from raw text (one fact per line, # comments) */
export function initFacts(rawText: string): void {
  ALL_FACTS = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/** Return a random fun fact */
export function getRandomFact(): string {
  if (ALL_FACTS.length === 0) return "No facts loaded.";
  return ALL_FACTS[Math.floor(Math.random() * ALL_FACTS.length)]!;
}
