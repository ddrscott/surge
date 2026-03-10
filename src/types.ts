export type PowerUpEffect = "heal" | "surge_boost" | "double_score" | "slow";

export interface Enemy {
  id: number;
  word: string;
  /** Reveal progress from 0 (hidden) to 1+ (fully revealed, grace period) */
  position: number;
  /** Reveal speed: letters per tick */
  speed: number;
  /** Base damage if it times out */
  damage: number;
  /** Point value (speed × length scaled) */
  points: number;
  /** Whether this enemy has been killed */
  dead: boolean;
  /** Tick when spawned */
  spawnedAt: number;
  /** Fixed lane (row index) for rendering */
  lane: number;
  /** Tick when killed, for death animation */
  killedAt: number;
  /** Zone at time of death */
  killedZone: Zone | null;
  /** Points earned on kill */
  killedPoints: number;
  /** If set, this is a power-up, not a bug */
  powerUp: PowerUpEffect | null;
}

export const NUM_LANES = 17;

export type Zone = "SAFE" | "RISKY" | "CRITICAL" | "MISSED";

export interface HitResult {
  enemy: Enemy;
  zone: Zone;
  points: number;
  damage: number;
  perfect: boolean;
}

export interface GameState {
  hp: number;
  maxHp: number;
  score: number;
  combo: number;
  maxCombo: number;
  wave: number;
  enemies: Enemy[];
  tick: number;
  surgeReady: boolean;
  surgeMeter: number;
  surgeThreshold: number;
  gameOver: boolean;
  lastHit: HitResult | null;
  inputBuffer: string;
  /** ID of the enemy currently being targeted by input, or null */
  targetId: number | null;
  /** Tick when double score expires (0 = inactive) */
  doubleScoreUntil: number;
  /** Tick when slow effect expires (0 = inactive) */
  slowUntil: number;
}

export interface WaveConfig {
  enemyCount: number;
  /** Min reveal speed: letters per tick */
  minSpeed: number;
  /** Max reveal speed: letters per tick */
  maxSpeed: number;
  minWordLength: number;
  maxWordLength: number;
  spawnInterval: number;
}
