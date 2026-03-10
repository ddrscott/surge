export type PowerUpEffect = "heal" | "surge_boost" | "double_score" | "slow";

export interface Enemy {
  id: number;
  word: string;
  /** Reveal progress from 0 (hidden) to 1+ (fully revealed, grace period) */
  position: number;
  /** Movement speed: position units per tick */
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
  /** Tick when next enemy should spawn */
  nextSpawnTick: number;
  /** Enemies spawned this wave (for phrase rhythm tracking) */
  waveSpawned: number;
}

export interface WaveConfig {
  enemyCount: number;
  /** Min speed: screen widths per second */
  minSpeed: number;
  /** Max speed: screen widths per second */
  maxSpeed: number;
  minWordLength: number;
  maxWordLength: number;
  /** Enemies per spawn burst */
  phraseSize: number;
  /** Ticks between spawns within a burst */
  phrasePace: number;
  /** Ticks of rest between bursts */
  phraseGap: number;
}
