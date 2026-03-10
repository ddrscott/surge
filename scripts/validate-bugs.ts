#!/usr/bin/env tsx
/**
 * Validate bugs.txt at build time.
 * Checks: duplicates, empty words, prefix collisions within same length bucket.
 * Exit code 0 = clean, 1 = errors found.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const bugsPath = join(process.cwd(), "bugs.txt");

let raw: string;
try {
  raw = readFileSync(bugsPath, "utf-8");
} catch {
  console.error("ERROR: bugs.txt not found at", bugsPath);
  process.exit(1);
}

const lines = raw.split("\n");
const words: { word: string; line: number }[] = [];

for (let i = 0; i < lines.length; i++) {
  const trimmed = lines[i]!.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  words.push({ word: trimmed, line: i + 1 });
}

let errors = 0;

// Check for empty or whitespace-only words
for (const { word, line } of words) {
  if (word.length === 0) {
    console.error(`  line ${line}: empty word`);
    errors++;
  }
}

// Check for duplicates
const seen = new Map<string, number>();
for (const { word, line } of words) {
  const lower = word.toLowerCase();
  const prev = seen.get(lower);
  if (prev !== undefined) {
    console.error(`  line ${line}: duplicate "${word}" (first at line ${prev})`);
    errors++;
  } else {
    seen.set(lower, line);
  }
}

// Check for prefix collisions (word A is a prefix of word B)
const allWords = words.map((w) => ({ ...w, lower: w.word.toLowerCase() }));
allWords.sort((a, b) => a.lower.localeCompare(b.lower));

for (let i = 0; i < allWords.length; i++) {
  for (let j = i + 1; j < allWords.length; j++) {
    const a = allWords[i]!;
    const b = allWords[j]!;
    // Since sorted lexicographically, if b doesn't start with a, no later word will either
    if (!b.lower.startsWith(a.lower)) break;
    console.warn(`  warning: "${a.word}" (line ${a.line}) is a prefix of "${b.word}" (line ${b.line})`);
  }
}

// Summary
console.log(`bugs.txt: ${words.length} words`);
if (errors > 0) {
  console.error(`FAILED: ${errors} error(s)`);
  process.exit(1);
} else {
  console.log("OK");
}
