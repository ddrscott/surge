export interface InputEmitter {
  on(event: "data", listener: (key: string) => void): void;
  removeListener(event: "data", listener: (key: string) => void): void;
}

export interface AuthUser {
  email: string;
  userId: string;
}

export interface LocalScore {
  score: number;
  wave: number;
  kills: number;
  maxCombo: number;
  date: string;
}

export interface SceneContext {
  writeFrame: (data: string) => void;
  stdin: InputEmitter;
  navigate: (scene: "title" | "help" | "game" | "gameover" | "pause", data?: unknown) => void;
  cleanup: () => void;
  exit: () => void;
  /** Authenticated user info (web only, null when not logged in or in CLI) */
  authUser: AuthUser | null;
  /** Login URL for auth redirect (web only, null in CLI) */
  loginUrl: string | null;
  /** Trigger logout (web only, no-op in CLI) */
  logout: () => void;
  /** Local high scores (CLI: filesystem, web: no-op) */
  getLocalScores: () => LocalScore[];
  saveLocalScore: (score: number, wave: number, kills: number, maxCombo: number) => void;
}
