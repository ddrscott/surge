export interface InputEmitter {
  on(event: "data", listener: (key: string) => void): void;
  removeListener(event: "data", listener: (key: string) => void): void;
}

export interface SceneContext {
  writeFrame: (data: string) => void;
  stdin: InputEmitter;
  navigate: (scene: "title" | "help" | "game" | "gameover" | "pause", data?: unknown) => void;
  cleanup: () => void;
  exit: () => void;
}
