export interface SceneContext {
  writeFrame: (data: string) => void;
  stdin: NodeJS.ReadStream;
  navigate: (scene: "title" | "help" | "game" | "gameover" | "pause", data?: unknown) => void;
  cleanup: () => void;
}
