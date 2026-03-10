#!/usr/bin/env tsx
/**
 * Validate facts.txt at build time.
 * Checks: duplicates, empty lines, line length.
 * Exit code 0 = clean, 1 = errors found.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const factsPath = join(process.cwd(), "facts.txt");

let raw: string;
try {
  raw = readFileSync(factsPath, "utf-8");
} catch {
  console.error("ERROR: facts.txt not found at", factsPath);
  process.exit(1);
}

const lines = raw.split("\n");
const facts: { text: string; line: number }[] = [];

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i]!.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  facts.push({ text: trimmed, line: i + 1 });
}

let errors = 0;

// Check for duplicates
const seen = new Map<string, number>();
for (const { text, line } of facts) {
  const lower = text.toLowerCase();
  const prev = seen.get(lower);
  if (prev !== undefined) {
    console.error(`  line ${line}: duplicate (first at line ${prev})`);
    errors++;
  } else {
    seen.set(lower, line);
  }
}

// Warn about long lines (won't fit in compact terminals)
for (const { text, line } of facts) {
  if (text.length > 75) {
    console.warn(`  warning: line ${line} is ${text.length} chars (>75): "${text.slice(0, 40)}..."`);
  }
}

console.log(`facts.txt: ${facts.length} facts`);
if (errors > 0) {
  console.error(`FAILED: ${errors} error(s)`);
  process.exit(1);
} else {
  console.log("OK");
}
