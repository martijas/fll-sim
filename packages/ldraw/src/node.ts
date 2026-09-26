// Node file source for an unpacked LDraw library directory (case-insensitive lookup).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { Library, type FileSource } from "./index";

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

/** The app's bundled part pack (apps/desktop/resources/ldraw/pack.json.gz), as a Library. */
export function packLibrary(): Library | null {
  const file = fileURLToPath(new URL("../../../apps/desktop/resources/ldraw/pack.json.gz", import.meta.url));
  if (!existsSync(file)) return null;
  const pack = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as { files: Record<string, string>; shadow: Record<string, string> };
  const files = new Map(Object.entries(pack.files).map(([k, v]) => [k.toLowerCase(), v]));
  const shadow = new Map(Object.entries(pack.shadow).map(([k, v]) => [k.toLowerCase(), v]));
  return new Library({ read: (p) => files.get(p.toLowerCase()) ?? null }, { read: (p) => shadow.get(p.toLowerCase()) ?? null });
}

/** The full LDraw library if it is installed (with the LDCad shadow library), else the app's part pack. */
export function defaultLibrary(): Library | null {
  const d = findLDrawDir();
  if (!d) return packLibrary();
  const s = findShadowDir();
  return new Library(dirSource(d), s ? dirSource(s) : undefined);
}
