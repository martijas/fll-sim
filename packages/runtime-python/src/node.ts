// Node helpers (CLI + tests): load the bundled Python modules and locate the wasm binary.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function loadPythonFiles(root = join(here, "..", "python")): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith(".py")) out[relative(root, p)] = readFileSync(p, "utf8");
    }
  };
  walk(root);
  return out;
}

export function micropythonWasmPath(): string {
  const req = createRequire(import.meta.url);
  return join(dirname(req.resolve("@micropython/micropython-webassembly-pyscript/micropython.mjs")), "micropython.wasm");
}
