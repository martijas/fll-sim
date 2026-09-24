import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

// Cross-origin isolation enables SharedArrayBuffer (pause/speed/buttons shared with the sim worker).
const isolation = {
  name: "cross-origin-isolation",
  configureServer(server: { middlewares: { use: (fn: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
};

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } } },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), isolation],
    worker: { format: "es" },
    server: { fs: { allow: [resolve(__dirname, "../..")] } },
    build: { rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") } },
    optimizeDeps: { exclude: ["@micropython/micropython-webassembly-pyscript"] },
  },
});
