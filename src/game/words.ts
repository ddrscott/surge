// Bug/insect word pools by difficulty tier
// Mix of common names and Latin binomials

const TIER_1 = [
  "ant", "bee", "fly", "bug", "mite", "tick", "flea", "gnat",
  "wasp", "moth", "slug", "worm", "lice", "grub", "nit",
];

const TIER_2 = [
  "roach", "aphid", "larva", "louse", "drone", "nymph",
  "hornet", "mantis", "earwig", "weevil", "thrips", "maggot",
  "cicada", "sawfly", "botfly", "spider", "locust",
  "beetle", "chigoe", "midge", "borer",
];

const TIER_3 = [
  "firefly", "termite", "cricket", "monarch", "ladybug", "blowfly",
  "sandfly", "katydid", "pillbug", "stinkbug", "cutworm", "webworm",
  "mealybug", "housefly", "june bug", "bedbug",
  // Latin creeping in
  "aranea", "acarina", "bombyx", "pieris", "lucanus",
];

const TIER_4 = [
  "dragonfly", "bumblebee", "butterfly", "cockroach", "silverfish",
  "centipede", "millipede", "mosquito", "damselfly", "caddisfly",
  "woodlouse", "dung beetle", "stag beetle", "longhorn",
  // Latin binomials
  "musca domestica", "apis mellifera", "aedes aegypti",
  "bombyx mori", "pieris rapae", "formica rufa",
  "lucanus cervus", "pulex irritans", "cimex lectularius",
  "blatta orientalis", "periplaneta americana",
  "drosophila melanogaster", "anopheles gambiae",
  "vespa mandarinia", "gryllus campestris",
  "mantis religiosa", "scarabaeus sacer",
  "acheta domesticus", "tenebrio molitor",
  "blatella germanica", "dermatophagoides",
  "ixodes scapularis", "pediculus humanus",
];

import type { PowerUpEffect } from "../types.js";

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

export function getWord(minLen: number, maxLen: number): string {
  const pools: string[][] = [];
  if (minLen <= 4) pools.push(TIER_1);
  if (minLen <= 6 && maxLen >= 4) pools.push(TIER_2);
  if (minLen <= 8 && maxLen >= 5) pools.push(TIER_3);
  if (maxLen >= 7) pools.push(TIER_4);

  if (pools.length === 0) pools.push(TIER_2);

  const pool = pickRandom(pools);
  const candidates = pool.filter((w) => w.length >= minLen && w.length <= maxLen);
  if (candidates.length === 0) return pickRandom(pool);
  return pickRandom(candidates);
}
