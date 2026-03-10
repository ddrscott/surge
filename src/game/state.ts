import type { GameState } from "../types.js";

export function createGame(): GameState {
  return {
    hp: 100,
    maxHp: 100,
    score: 0,
    combo: 0,
    maxCombo: 0,
    wave: 0,
    enemies: [],
    tick: 0,
    surgeReady: false,
    surgeMeter: 0,
    surgeThreshold: 10,
    gameOver: false,
    lastHit: null,
    inputBuffer: "",
    targetId: null,
    doubleScoreUntil: 0,
    slowUntil: 0,
    nextSpawnTick: 1,
    waveSpawned: 0,
  };
}
