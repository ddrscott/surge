// Word pools by difficulty tier
const TIER_1 = [
  "fox", "run", "ice", "hex", "arc", "vim", "bug", "log", "api", "tcp",
  "git", "ssh", "ram", "cpu", "dns", "sql", "pip", "npm", "zip", "tar",
  "key", "bit", "hub", "dev", "ops", "red", "net", "sys", "cmd", "pkg",
];

const TIER_2 = [
  "crash", "pixel", "spawn", "flame", "ghost", "stack", "cache",
  "queue", "async", "fetch", "merge", "parse", "yield", "chunk", "proxy",
  "shell", "patch", "regex", "debug", "query", "bytes", "mutex", "panic",
  "forge", "pulse", "blade", "nexus", "cyber", "shard",
];

const TIER_3 = [
  "runtime", "exploit", "payload", "decrypt", "compile", "pointer",
  "garbage", "deadlock", "callback", "process", "segment", "hashmap",
  "reactor", "phantom", "cascade", "voltage", "trigger", "circuit",
  "entropy", "quantum", "orbital", "paradox", "vortex", "vector",
  "cryptic", "hostile", "stealth", "wraith", "cipher", "matrix",
];

const TIER_4 = [
  "overflow", "protocol", "firmware", "pipeline", "compiler", "debugger",
  "skeleton", "throttle", "firewall", "terminal", "parallel", "upstream",
  "artifact", "symbiote", "monolith", "sentinel", "labyrinth", "singularity",
  "oblivion", "resonance", "cataclysm", "annihilate", "intercept", "overwrite",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function getWord(minLen: number, maxLen: number): string {
  const pools: string[][] = [];
  if (minLen <= 3) pools.push(TIER_1);
  if (minLen <= 5 && maxLen >= 4) pools.push(TIER_2);
  if (minLen <= 7 && maxLen >= 5) pools.push(TIER_3);
  if (maxLen >= 7) pools.push(TIER_4);

  if (pools.length === 0) pools.push(TIER_2);

  const pool = pickRandom(pools);
  const candidates = pool.filter((w) => w.length >= minLen && w.length <= maxLen);
  if (candidates.length === 0) return pickRandom(pool);
  return pickRandom(candidates);
}
