import type { PowerUpEffect } from "../types.js";

let ALL_WORDS: string[] = [];
const buckets = new Map<number, string[]>();

/** Initialize word dictionary from raw text (one word per line, # comments) */
export function initWords(rawText: string): void {
  ALL_WORDS = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  buckets.clear();
  for (const word of ALL_WORDS) {
    const len = word.length;
    if (!buckets.has(len)) buckets.set(len, []);
    buckets.get(len)!.push(word);
  }
}

export interface PowerUpWord {
  word: string;
  effect: PowerUpEffect;
}

const POWER_UPS: PowerUpWord[] = [
  { word: "patch", effect: "heal" },
  { word: "fix", effect: "heal" },
  { word: "malloc", effect: "heal" },
  { word: "defrag", effect: "surge_boost" },
  { word: "clean", effect: "surge_boost" },
  { word: "optimize", effect: "double_score" },
  { word: "overclock", effect: "double_score" },
  { word: "freeze", effect: "slow" },
  { word: "coolant", effect: "slow" },
  { word: "suspend", effect: "slow" },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function getPowerUp(): PowerUpWord {
  return pickRandom(POWER_UPS);
}

/** Pick a word that doesn't collide with any currently active word (no prefix overlaps). */
export function getWord(minLen: number, maxLen: number, activeWords: string[] = []): string {
  // Gather candidates from all matching length buckets
  const candidates: string[] = [];
  for (const [len, words] of buckets) {
    if (len >= minLen && len <= maxLen) {
      candidates.push(...words);
    }
  }

  if (candidates.length === 0) return pickRandom(ALL_WORDS);

  // Filter out words that conflict with active on-screen words
  const active = activeWords.map((w) => w.toLowerCase());
  const safe = candidates.filter((w) => {
    const wl = w.toLowerCase();
    for (const a of active) {
      if (wl === a) return false;           // exact duplicate
      if (wl.startsWith(a)) return false;   // active word is prefix of candidate
      if (a.startsWith(wl)) return false;   // candidate is prefix of active word
    }
    return true;
  });

  if (safe.length > 0) return pickRandom(safe);
  // Fallback: at least avoid exact duplicates
  const deduped = candidates.filter((w) => !active.includes(w.toLowerCase()));
  if (deduped.length > 0) return pickRandom(deduped);
  return pickRandom(candidates);
}
