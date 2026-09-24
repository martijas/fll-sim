// Node file source for an unpacked LDraw library directory (case-insensitive lookup).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { FileSource } from "./index";

export function dirSource(root: string): FileSource {
  const index = new Map<string, string>();
  const walk = (d: string, rel: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(p).isDirectory()) walk(p, r);
      else index.set(r.toLowerCase(), p);
    }
  };
  if (existsSync(root)) walk(root, "");
  return {
    read(path: string) {
      const p = index.get(path.toLowerCase());
      return p ? readFileSync(p, "latin1") : null;
    },
  };
}

/** Default locations: FLLSIM_LDRAW env, the dev cache, or Debian's ldraw-parts package. */
export function findLDrawDir(): string | null {
  for (const d of [process.env.FLLSIM_LDRAW, `${process.env.HOME}/.cache/fll-sim/ldraw`, "/usr/share/ldraw"]) if (d && existsSync(join(d, "parts"))) return d;
  return null;
}
export function findShadowDir(): string | null {
  for (const d of [process.env.FLLSIM_LDCAD_SHADOW, `${process.env.HOME}/.cache/fll-sim/shadow`]) if (d && existsSync(join(d, "parts"))) return d;
  return null;
}
