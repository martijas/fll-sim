import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
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

// scratch-blocks loads its icons and sprites from a media directory: serve it at /blocks-media/
// in development and copy it into the build.
const blocksMedia = join(dirname(createRequire(import.meta.url).resolve("scratch-blocks")), "../media");
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const scratchMedia = {
  name: "scratch-blocks-media",
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: Buffer) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/blocks-media\/([^?]+)/.exec(req.url ?? "");
      const file = m && join(blocksMedia, decodeURIComponent(m[1]));
      if (!file || !file.startsWith(blocksMedia) || !statSync(file, { throwIfNoEntry: false })?.isFile()) return next();
      if (file.endsWith(".svg")) res.setHeader("Content-Type", "image/svg+xml");
      res.end(readFileSync(file));
    });
  },
  generateBundle(this: { emitFile: (f: { type: "asset"; fileName: string; source: Uint8Array }) => void }) {
    for (const f of walk(blocksMedia)) this.emitFile({ type: "asset", fileName: `blocks-media/${relative(blocksMedia, f)}`, source: readFileSync(f) });
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
    plugins: [react(), isolation, scratchMedia],
    worker: { format: "es" },
    server: { fs: { allow: [resolve(__dirname, "../..")] } },
    build: { rollupOptions: { input: resolve(__dirname, "src/renderer/index.html") } },
    optimizeDeps: { exclude: ["@micropython/micropython-webassembly-pyscript"] },
  },
});
