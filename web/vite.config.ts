import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";

/** Rewrite /play to /play/ so Vite dev server finds play/index.html */
function trailingSlashPlugin(): Plugin {
  return {
    name: "trailing-slash",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === "/play") {
          req.url = "/play/";
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname),
  plugins: [trailingSlashPlugin()],
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
