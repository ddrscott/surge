import type { Enemy, GameState, HitResult, PowerUpEffect, WaveConfig, Zone } from "../types.js";
import { layout } from "../render.js";
import { getWord, getPowerUp } from "./words.js";

const ZONE_THRESHOLDS = {
  SAFE: 0.5,
  RISKY: 0.85,
  CRITICAL: 1.05, // word dies shortly after injection completes at 1.0
};

const ZONE_MULTIPLIERS: Record<Zone, number> = {
  SAFE: 1,
  RISKY: 2,
  CRITICAL: 3,
  MISSED: 0,
};

export function comboMultiplier(combo: number): number {
  return 1 + Math.floor(combo / 3) * 0.5;
}

const FPS = 20; // 50ms tick

// Speeds are in screen widths per second (position is 0–1 normalized).
// 0.25 sw/s ≈ 4 seconds to cross. Same real time on any terminal width.
// Phrase-based spawning: enemies arrive in bursts with rests between them.
const WAVES: WaveConfig[] = [
  //                                                                      phrase  pace  gap
  { enemyCount: 6,  minSpeed: 0.10, maxSpeed: 0.15, minWordLength: 3, maxWordLength: 4,  phraseSize: 2, phrasePace: 12, phraseGap: 50 },
  { enemyCount: 8,  minSpeed: 0.15, maxSpeed: 0.22, minWordLength: 3, maxWordLength: 5,  phraseSize: 2, phrasePace: 10, phraseGap: 44 },
  { enemyCount: 10, minSpeed: 0.25, maxSpeed: 0.40, minWordLength: 3, maxWordLength: 6,  phraseSize: 3, phrasePace: 8,  phraseGap: 40 },
  { enemyCount: 12, minSpeed: 0.28, maxSpeed: 0.45, minWordLength: 4, maxWordLength: 7,  phraseSize: 3, phrasePace: 8,  phraseGap: 36 },
  { enemyCount: 14, minSpeed: 0.30, maxSpeed: 0.50, minWordLength: 4, maxWordLength: 8,  phraseSize: 3, phrasePace: 6,  phraseGap: 32 },
  { enemyCount: 16, minSpeed: 0.35, maxSpeed: 0.55, minWordLength: 4, maxWordLength: 9,  phraseSize: 4, phrasePace: 6,  phraseGap: 28 },
  { enemyCount: 19, minSpeed: 0.40, maxSpeed: 0.65, minWordLength: 5, maxWordLength: 10, phraseSize: 4, phrasePace: 5,  phraseGap: 24 },
  { enemyCount: 22, minSpeed: 0.45, maxSpeed: 0.75, minWordLength: 5, maxWordLength: 11, phraseSize: 4, phrasePace: 4,  phraseGap: 20 },
];

function getWaveConfig(wave: number): WaveConfig {
  if (wave < WAVES.length) return WAVES[wave]!;
  const last = WAVES[WAVES.length - 1]!;
  const scale = 1 + (wave - WAVES.length) * 0.1;
  return {
    ...last,
    enemyCount: Math.floor(last.enemyCount * scale),
    minSpeed: last.minSpeed * scale,
    maxSpeed: last.maxSpeed * scale,
    phrasePace: Math.max(2, last.phrasePace - Math.floor((wave - WAVES.length) * 0.5)),
    phraseGap: Math.max(10, last.phraseGap - (wave - WAVES.length) * 2),
  };
}

let nextEnemyId = 0;

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Pick a free lane, or -1 if all lanes are occupied (lane locking) */
function pickLane(state: GameState): number {
  const { lanes } = layout();
  const occupied = new Set(state.enemies.filter((e) => !e.dead).map((e) => e.lane));
  const free: number[] = [];
  for (let i = 0; i < lanes; i++) {
    if (!occupied.has(i)) free.push(i);
  }
  if (free.length > 0) return free[Math.floor(Math.random() * free.length)]!;
  return -1; // all lanes occupied — defer spawn
}

export function getZone(position: number): Zone {
  if (position >= ZONE_THRESHOLDS.CRITICAL) return "MISSED";
  if (position >= ZONE_THRESHOLDS.RISKY) return "CRITICAL";
  if (position >= ZONE_THRESHOLDS.SAFE) return "RISKY";
  return "SAFE";
}

const SCROLL_IN = 0.05; // must match game.ts

/** How many letters of an enemy's word have scrolled into view (tail-first) */
export function revealedCount(enemy: Enemy): number {
  if (enemy.position <= 0) return 0;
  if (enemy.position >= SCROLL_IN) return enemy.word.length;
  const progress = enemy.position / SCROLL_IN;
  return Math.min(enemy.word.length, Math.max(1, Math.ceil(progress * enemy.word.length)));
}

function spawnEnemy(state: GameState, config: WaveConfig, lane: number): Enemy {
  const activeWords = state.enemies.filter((e) => !e.dead).map((e) => e.word);
  const word = getWord(config.minWordLength, config.maxWordLength, activeWords);
  const swps = randBetween(config.minSpeed, config.maxSpeed); // screen widths/sec
  const speed = swps / FPS; // convert to position/tick
  return {
    id: nextEnemyId++,
    word,
    position: 0,
    speed,
    damage: 10 + word.length * 2,
    points: Math.round(swps * word.length * 500),
    dead: false,
    spawnedAt: state.tick,
    lane,
    killedAt: -1,
    killedZone: null,
    killedPoints: 0,
    powerUp: null,
  };
}

function spawnPowerUp(state: GameState, config: WaveConfig, lane: number): Enemy {
  const pu = getPowerUp();
  const swps = randBetween(config.maxSpeed * 1.5, config.maxSpeed * 2.5);
  const speed = swps / FPS;
  return {
    id: nextEnemyId++,
    word: pu.word,
    position: 0,
    speed,
    damage: 0,
    points: Math.round(swps * pu.word.length * 500),
    dead: false,
    spawnedAt: state.tick,
    lane,
    killedAt: -1,
    killedZone: null,
    killedPoints: 0,
    powerUp: pu.effect,
  };
}

export function findTarget(state: GameState): Enemy | null {
  const input = state.inputBuffer.toLowerCase();
  if (!input) return null;

  const matches = state.enemies
    .filter((e) => {
      if (e.dead) return false;
      if (revealedCount(e) === 0) return false; // word not on screen yet
      return e.word.toLowerCase().startsWith(input);
    })
    .sort((a, b) => b.position - a.position);

  if (state.targetId !== null) {
    const locked = matches.find((e) => e.id === state.targetId);
    if (locked) return locked;
  }

  return matches[0] ?? null;
}

export function processInput(state: GameState): HitResult | null {
  if (state.gameOver) return null;

  const input = state.inputBuffer.toLowerCase();
  if (!input) {
    state.targetId = null;
    return null;
  }

  // Surge check
  if (state.surgeReady && input === "surge") {
    const cm = comboMultiplier(state.combo);
    let totalPoints = 0;
    let killCount = 0;
    for (const enemy of state.enemies) {
      if (!enemy.dead) {
        enemy.dead = true;
        enemy.killedAt = state.tick;
        enemy.killedZone = "CRITICAL";
        const pts = Math.floor(enemy.points * 3 * cm);
        enemy.killedPoints = pts;
        totalPoints += pts;
        killCount++;
      }
    }
    state.score += totalPoints;
    state.surgeReady = false;
    state.surgeMeter = 0;
    state.combo += killCount;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.inputBuffer = "";
    state.targetId = null;
    const result: HitResult = {
      enemy: state.enemies[0] || ({} as Enemy),
      zone: "CRITICAL",
      points: totalPoints,
      damage: 0,
      perfect: true,
    };
    state.lastHit = result;
    return result;
  }

  const target = findTarget(state);

  if (target) {
    state.targetId = target.id;

    if (input === target.word.toLowerCase()) {
      const zone = getZone(target.position);
      const zoneMultiplier = ZONE_MULTIPLIERS[zone];
      const cm = comboMultiplier(state.combo);
      let points = Math.floor(target.points * zoneMultiplier * cm);
      const damage = 0;

      // Apply double score if active
      if (state.doubleScoreUntil > state.tick) {
        points *= 2;
      }

      target.dead = true;
      target.killedAt = state.tick;
      target.killedZone = zone;
      target.killedPoints = points;

      // Apply power-up effect
      if (target.powerUp) {
        applyPowerUp(state, target.powerUp);
      } else {
        // Normal bug kill — surge meter
        if (zone === "CRITICAL") {
          state.surgeMeter += 3;
        } else if (zone === "RISKY") {
          state.surgeMeter += 2;
        } else {
          state.surgeMeter += 1;
        }
      }

      state.score += points;
      state.combo += 1;
      if (state.combo > state.maxCombo) state.maxCombo = state.combo;

      if (state.surgeMeter >= state.surgeThreshold) {
        state.surgeReady = true;
      }

      state.inputBuffer = "";
      state.targetId = null;

      const result: HitResult = {
        enemy: target,
        zone,
        points,
        damage,
        perfect: zone === "CRITICAL" && damage === 0,
      };
      state.lastHit = result;
      return result;
    }
  } else {
    state.targetId = null;
  }

  return null;
}

const EFFECT_DURATION = 200; // ~10 seconds at 50ms/tick

function applyPowerUp(state: GameState, effect: PowerUpEffect): void {
  switch (effect) {
    case "heal":
      state.hp = Math.min(state.maxHp, state.hp + 25);
      break;
    case "surge_boost":
      state.surgeMeter = Math.min(state.surgeThreshold, state.surgeMeter + 5);
      if (state.surgeMeter >= state.surgeThreshold) state.surgeReady = true;
      break;
    case "double_score":
      state.doubleScoreUntil = state.tick + EFFECT_DURATION;
      break;
    case "slow":
      state.slowUntil = state.tick + EFFECT_DURATION;
      break;
  }
}

export function gameTick(state: GameState): void {
  if (state.gameOver) return;

  state.tick++;

  const config = getWaveConfig(state.wave);

  // Phrase-based spawning: bursts of enemies with rests between
  if (state.waveSpawned < config.enemyCount && state.tick >= state.nextSpawnTick) {
    const lane = pickLane(state);
    if (lane >= 0) {
      state.enemies.push(spawnEnemy(state, config, lane));
      state.waveSpawned++;

      // Decide when to spawn next based on position within the phrase
      const posInPhrase = (state.waveSpawned - 1) % config.phraseSize;
      if (posInPhrase < config.phraseSize - 1) {
        state.nextSpawnTick = state.tick + config.phrasePace;
      } else {
        state.nextSpawnTick = state.tick + config.phraseGap;
      }

      // Power-ups: ~15% chance per spawn, starting wave 1
      if (state.wave >= 1 && Math.random() < 0.15) {
        const puLane = pickLane(state);
        if (puLane >= 0) {
          state.enemies.push(spawnPowerUp(state, config, puLane));
        }
      }
    } else {
      // All lanes occupied — retry in a few ticks
      state.nextSpawnTick = state.tick + 5;
    }
  }

  // Slow effect multiplier
  const slowFactor = state.slowUntil > state.tick ? 0.4 : 1.0;

  // Reveal letters (typewriter): position = fraction of word revealed
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;

    // Power-ups ignore slow (they're helpers, not enemies)
    const slow = enemy.powerUp ? 1.0 : slowFactor;
    // speed is position/tick (already converted from screen widths/sec)
    enemy.position += enemy.speed * slow;

    if (enemy.position >= ZONE_THRESHOLDS.CRITICAL) {
      enemy.dead = true;
      enemy.killedAt = state.tick;
      enemy.killedZone = "MISSED";
      enemy.killedPoints = 0;
      // Power-ups just disappear — no damage, no combo break
      if (!enemy.powerUp) {
        state.hp -= enemy.damage;
        state.combo = 0;
        // Clear input when an enemy gets through — no manual backspacing
        state.inputBuffer = "";
        state.targetId = null;
      }
    }
  }

  // Clean up old dead enemies (keep for a short animation window)
  const DEATH_ANIM_TICKS = 8; // ~400ms at 50ms/tick
  state.enemies = state.enemies.filter(
    (e) => !e.dead || (state.tick - e.killedAt) < DEATH_ANIM_TICKS
  );

  // Check wave complete — all bugs spawned AND all dead AND animations done
  const allDead = state.enemies.filter((e) => !e.dead).length === 0;
  const allAnimDone = state.enemies.every((e) => e.dead && (state.tick - e.killedAt) >= DEATH_ANIM_TICKS);
  if (state.waveSpawned >= config.enemyCount && allDead && (state.enemies.length === 0 || allAnimDone)) {
    state.wave++;
    state.enemies = [];
    state.targetId = null;
    state.nextSpawnTick = state.tick + 30; // brief calm before next wave
    state.waveSpawned = 0;
    state.hp = Math.min(state.maxHp, state.hp + 15);
  }

  if (state.hp <= 0) {
    state.hp = 0;
    state.gameOver = true;
  }
}
