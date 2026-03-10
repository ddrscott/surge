import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        play: resolve(__dirname, "play/index.html"),
      },
    },
  },
  assetsInclude: ["**/*.txt"],
});
