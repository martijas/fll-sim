// LDraw parts library: parsing, file resolution, colours, and flattening parts/models into
// triangle meshes, edge lines and LDCad connection points ("snaps"). Coordinates stay in LDU
// in LDraw's frame (-Y up) here; `ldrawToWorld` converts to the simulator's frame.

export type Mat4 = Float64Array; // row-major 3x4 affine: [a b c x; d e f y; g h i z]

export const LDU_MM = 0.4;

/** Synchronous file source (bundled pack, node fs, or a system LDraw install). */
export interface FileSource {
  /** Return file text for a library-relative path like "parts/3001.dat", or null. */
  read(path: string): string | null;
}

// ---- parsing ---------------------------------------------------------------------------
export type Line =
  | { t: 0; text: string }
  | { t: 1; color: number; m: Mat4; file: string }
  | { t: 2 | 5; color: number; p: number[] }
  | { t: 3 | 4; color: number; p: number[] };

export interface ParsedFile {
  name: string;
  title: string;
  lines: Line[];
  /** LDCad snap meta lines (from the shadow library or inline). */
  snaps: string[];
}

export function parseLines(text: string, name = ""): ParsedFile {
  const lines: Line[] = [];
  const snaps: string[] = [];
  let title = "";
  for (const raw of text.split(/\r?\n/)) {
    const s = raw.trim();
    if (!s) continue;
    const tok = s.split(/\s+/);
    const t = Number(tok[0]);
    if (t === 0) {
      const rest = s.slice(1).trim();
      if (!title && rest && !rest.startsWith("!") && !/^(Name|Author|BFC|FILE|NOFILE|STEP)\b/.test(rest)) title = rest;
      if (rest.startsWith("!LDCAD SNAP_")) snaps.push(rest);
      lines.push({ t: 0, text: rest });
    } else if (t === 1 && tok.length >= 15) {
      const n = tok.slice(1, 14).map(Number);
      const m = new Float64Array([n[4], n[5], n[6], n[1], n[7], n[8], n[9], n[2], n[10], n[11], n[12], n[3]]);
      lines.push({ t: 1, color: n[0], m, file: normName(tok.slice(14).join(" ")) });
    } else if ((t === 2 || t === 5) && tok.length >= 8) {
      lines.push({ t, color: Number(tok[1]), p: tok.slice(2, t === 2 ? 8 : 14).map(Number) } as Line);
    } else if (t === 3 && tok.length >= 11) {
      lines.push({ t: 3, color: Number(tok[1]), p: tok.slice(2, 11).map(Number) });
    } else if (t === 4 && tok.length >= 14) {
      lines.push({ t: 4, color: Number(tok[1]), p: tok.slice(2, 14).map(Number) });
    }
  }
  return { name, title, lines, snaps };
}

export const normName = (f: string) => f.trim().replace(/\\/g, "/").toLowerCase();

/** Split a multi-part document (.mpd / .io export) into named files; first file is the main model. */
export function splitMpd(text: string): { main: string; files: Map<string, string> } {
  const files = new Map<string, string>();
  let main = "";
  let cur: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (cur !== null) files.set(cur, buf.join("\n"));
  };
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*0\s+FILE\s+(.+?)\s*$/i);
    if (m) {
      flush();
      cur = normName(m[1]);
      if (!main) main = cur;
      buf = [];
    } else if (/^\s*0\s+NOFILE\s*$/i.test(line)) {
      flush();
      cur = null;
      buf = [];
    } else buf.push(line);
  }
  flush();
  if (!files.size) {
    main = "model.ldr";
    files.set(main, text);
  }
  return { main, files };
}

// ---- colours -----------------------------------------------------------------------------
export interface LDColor {
  code: number;
  name: string;
  rgb: [number, number, number]; // 0..255
  edge: [number, number, number];
  alpha: number; // 0..255
  material: "solid" | "rubber" | "chrome" | "metal" | "pearlescent" | "transparent" | "glitter" | "speckle";
}

const hex = (h: string): [number, number, number] => {
  const v = h.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

export function parseColors(ldconfig: string): Map<number, LDColor> {
  const out = new Map<number, LDColor>();
  for (const line of ldconfig.split(/\r?\n/)) {
    const m = line.match(/!COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+(#[0-9A-Fa-f]{6})\s+EDGE\s+(#[0-9A-Fa-f]{6})(.*)$/);
    if (!m) continue;
    const rest = m[5];
    const alpha = Number(rest.match(/ALPHA\s+(\d+)/)?.[1] ?? 255);
    const material = /RUBBER/.test(rest) ? "rubber" : /CHROME/.test(rest) ? "chrome" : /METAL/.test(rest) ? "metal" : /PEARLESCENT/.test(rest) ? "pearlescent" : /GLITTER/.test(rest) ? "glitter" : /SPECKLE/.test(rest) ? "speckle" : alpha < 255 ? "transparent" : "solid";
    out.set(Number(m[2]), { code: Number(m[2]), name: m[1].replace(/_/g, " "), rgb: hex(m[3]), edge: hex(m[4]), alpha, material });
  }
  return out;
}

// ---- library -------------------------------------------------------------------------------
/**
 * Parts FLL Sim adds to the library. A rubber band: a unit-length thin tube along +X from the
 * origin, stretched between its two anchors by its placement matrix (X column = anchor to anchor).
 */
export const BAND_PART = "fllsim-band.dat";
/**
 * A mount point (not a real part: no mass, no collisions). Robots and tools carry one per place
 * a tool attaches; its label is the mount's name. Attaching a tool puts the tool's mount exactly
 * on the robot's mount of the same name, so the tool always connects the same way. Drawn as a
 * small flat arrow pointing along its -Z.
 */
export const MOUNT_PART = "fllsim-mount.dat";
const BUILTIN: Record<string, string> = {
  [MOUNT_PART]: `0 Mount Point (FLL Sim)
0 Name: ${MOUNT_PART}
0 Author: FLL Sim
0 !LDRAW_ORG Unofficial_Part
1 16 0 0 0 8 0 0 0 1 0 0 0 8 4-4disc.dat
3 16 -6 -0.5 -6 6 -0.5 -6 0 -0.5 -18
3 16 0 -0.5 -18 6 -0.5 -6 -6 -0.5 -6
`,
  [BAND_PART]: `0 Rubber Band (FLL Sim)
0 Name: ${BAND_PART}
0 Author: FLL Sim
0 !LDRAW_ORG Unofficial_Part
1 16 0 0 0 0 1 0 1 0 0 0 0 1 4-4cyli.dat
`,
};

/**
 * Connection data the LDCad shadow library is missing, added by FLL Sim (same meta syntax).
 * 43056 (hinge plate 2 x 4.5 base, M11's door hinge): the anti-studs underneath.
 */
const EXTRA_SNAPS: Record<string, string[]> = {
  "parts/43056.dat": ["!LDCAD SNAP_CYL [gender=F] [caps=one] [secs=S 6 4] [pos=-10 8 -30] [grid=2 4 20 20]"],
};

export class Library {
  private cache = new Map<string, ParsedFile | null>();
  private localCache = new WeakMap<Map<string, string>, Map<string, ParsedFile>>();
  private shadowCache = new Map<string, string[]>();
  readonly colors: Map<number, LDColor>;

  /**
   * @param source   file source rooted at the LDraw library dir (containing parts/, p/)
   * @param shadow   optional LDCad shadow library source (same layout) for snap info
   */
  constructor(private source: FileSource, private shadow?: FileSource, ldconfig?: string) {
    this.colors = parseColors(ldconfig ?? source.read("LDConfig.ldr") ?? "");
  }

  /** Resolve and parse a referenced file name (search order per the LDraw spec). */
  get(name: string, local?: Map<string, string>): ParsedFile | null {
    const n = normName(name);
    if (local?.has(n)) {
      // Model-internal files are cached per model (names like "model.ldr" repeat across models).
      let lc = this.localCache.get(local);
      if (!lc) this.localCache.set(local, (lc = new Map()));
      if (!lc.has(n)) lc.set(n, parseLines(local.get(n)!, n));
      return lc.get(n)!;
    }
    if (this.cache.has(n)) return this.cache.get(n)!;
    let found: ParsedFile | null = null;
    if (BUILTIN[n]) {
      found = parseLines(BUILTIN[n], n);
      this.cache.set(n, found);
      return found;
    }
    for (const dir of ["parts/", "p/", "models/", ""]) {
      const text = this.source.read(dir + n);
      if (text !== null) {
        found = parseLines(text, n);
        found.snaps.push(...this.shadowSnaps(dir + n));
        break;
      }
    }
    this.cache.set(n, found);
    return found;
  }

  private shadowSnaps(path: string): string[] {
    if (!this.shadowCache.has(path)) {
      const text = this.shadow?.read(path);
      this.shadowCache.set(path, [...(text ? parseLines(text).snaps : []), ...(EXTRA_SNAPS[path] ?? [])]);
    }
    return this.shadowCache.get(path)!;
  }

  color(code: number): LDColor {
    if (code >= 0x2000000) {
      const v = code & 0xffffff;
      const rgb: [number, number, number] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      return { code, name: "direct", rgb, edge: [0, 0, 0], alpha: 255, material: "solid" };
    }
    return this.colors.get(code) ?? { code, name: `unknown ${code}`, rgb: [128, 128, 128], edge: [51, 51, 51], alpha: 255, material: "solid" };
  }

  /** Is this file a "part" (leaf for the builder), rather than a model/subfile? */
  isPart(name: string): boolean {
    const n = normName(name);
    return !n.startsWith("s/") && this.source.read("parts/" + n) !== null;
  }
}

// ---- matrices ------------------------------------------------------------------------------
export const IDENTITY: Mat4 = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);

export function mul(a: Mat4, b: Mat4): Mat4 {
  const r = new Float64Array(12);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j];
    r[i * 4 + 3] = a[i * 4] * b[3] + a[i * 4 + 1] * b[7] + a[i * 4 + 2] * b[11] + a[i * 4 + 3];
  }
  return r;
}

export function apply(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
}

export function applyDir(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [m[0] * x + m[1] * y + m[2] * z, m[4] * x + m[5] * y + m[6] * z, m[8] * x + m[9] * y + m[10] * z];
}

const det3 = (m: Mat4) => m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);

// ---- flattening -----------------------------------------------------------------------------
export interface Mesh {
  /** Triangles, xyz per vertex (LDU, LDraw frame). */
  positions: number[];
  /** rgb per vertex (0..255). */
  colors: number[];
  /** Edge line segments (type 2), xyz pairs. */
  edges: number[];
  edgeColors: number[];
  /** Per-triangle LDraw colour code (resolved). */
  triColorCodes: number[];
}

export interface Snap {
  kind: "cyl" | "clp" | "fgr" | "gen" | "sph";
  /** Index of the top-level subfile line this snap came from (-1 = the file itself); used to split motors into housing/rotor. */
  src: number;
  id?: string;
  gender: "M" | "F";
  /** Cylinder section spec, e.g. "R 8 2   R 6 16   R 8 2" (R round, A axle, S square, _L flexible). */
  secs: string;
  caps: string;
  center: boolean;
  slide: boolean;
  grid?: string;
  /** Transform of the snap in the part/model frame (LDU): axis is the local +Y (snap "out" dir). */
  m: Mat4;
}

export interface FlattenOptions {
  /** Stop recursing into these (e.g. collect placed parts instead of triangles). */
  collectParts?: boolean;
  /** Skip geometry, only gather snaps / parts. */
  geometry?: boolean;
  /** MPD-internal files. */
  local?: Map<string, string>;
}

export interface PlacedPart {
  file: string;
  color: number;
  m: Mat4; // part transform in model frame (LDU, LDraw frame)
}

/** Flatten a part or model into a mesh (plus snaps), resolving colours 16/24. */
export function flatten(lib: Library, name: string, color = 16, o: FlattenOptions = {}): { mesh: Mesh; snaps: Snap[]; parts: PlacedPart[]; missing: string[] } {
  const mesh: Mesh = { positions: [], colors: [], edges: [], edgeColors: [], triColorCodes: [] };
  const snaps: Snap[] = [];
  const parts: PlacedPart[] = [];
  const missing = new Set<string>();
  const geometry = o.geometry !== false;

  let src = -1;
  /** Snaps of a file honouring LDCad SNAP_CLEAR (drop inherited) and SNAP_INCL (include another file's). */
  const snapsOf = (f: ParsedFile, m: Mat4, depth: number): { own: Snap[]; clear: boolean } => {
    const own: Snap[] = [];
    let clear = false;
    for (const line of f.snaps) {
      if (/SNAP_CLEAR\b/.test(line)) {
        if (!/\[id=/i.test(line)) clear = true;
        continue;
      }
      if (/SNAP_INCL\b/.test(line)) {
        const ref = attr(line, "ref");
        const g = ref ? lib.get(ref, o.local) : null;
        if (g && depth < 20) {
          for (const base of parseSnap(line.replace("SNAP_INCL", "SNAP_GEN"), m) ?? []) {
            const inner = snapsOf(g, base.m, depth + 1).own;
            own.push(...inner);
            if (!snapsOf(g, base.m, depth + 1).clear) own.push(...collectSub(g, base.m, depth + 1));
          }
        }
        continue;
      }
      const snap = parseSnap(line, m);
      if (snap) own.push(...snap.map((x) => ({ ...x, src })));
    }
    return { own, clear };
  };
  /** Snaps contributed by a file's subfiles (recursively), without geometry. */
  const collectSub = (f: ParsedFile, m: Mat4, depth: number): Snap[] => {
    const out: Snap[] = [];
    for (const l of f.lines) {
      if (l.t !== 1) continue;
      const g = lib.get(l.file, o.local);
      if (!g) continue;
      const mm = mul(m, l.m);
      const r = snapsOf(g, mm, depth + 1);
      out.push(...r.own);
      if (!r.clear) out.push(...collectSub(g, mm, depth + 1));
    }
    return out;
  };

  const visit = (fileName: string, m: Mat4, cur: number, depth: number, topLevel: boolean, snapsOn = true) => {
    if (depth > 40) return;
    const f = lib.get(fileName, o.local);
    if (!f) {
      missing.add(fileName);
      return;
    }
    let childSnaps = snapsOn;
    if (snapsOn) {
      const r = snapsOf(f, m, depth);
      snaps.push(...r.own);
      if (r.clear) childSnaps = false;
    }
    const col = lib.color(cur);
    const rgb = col.rgb;
    for (const l of f.lines) {
      if (l.t === 1) {
        const c = l.color === 16 ? cur : l.color === 24 ? cur : l.color;
        const mm = mul(m, l.m);
        if (o.collectParts && topLevel && lib.isPart(l.file) && !o.local?.has(l.file)) {
          parts.push({ file: l.file, color: c, m: mm });
          continue;
        }
        const nextTop = topLevel && (o.local?.has(l.file) ?? false);
        if (depth === 0) src = f.lines.indexOf(l);
        visit(l.file, mm, c, depth + 1, o.collectParts ? nextTop : false, childSnaps);
      } else if (!geometry) continue;
      else if (l.t === 3 || l.t === 4) {
        const c = l.color === 16 ? cur : l.color;
        const cc = c === cur ? rgb : lib.color(c).rgb;
        const p = l.p;
        const tri = (i: number, j: number, k: number) => {
          for (const q of [i, j, k]) {
            const v = apply(m, p[q * 3], p[q * 3 + 1], p[q * 3 + 2]);
            mesh.positions.push(v[0], v[1], v[2]);
            mesh.colors.push(cc[0], cc[1], cc[2]);
          }
          mesh.triColorCodes.push(c);
        };
        // Winding is irrelevant for our double-sided rendering; keep orientation consistent with det.
        const flip = det3(m) < 0;
        if (flip) tri(0, 2, 1);
        else tri(0, 1, 2);
        if (l.t === 4) {
          if (flip) tri(0, 3, 2);
          else tri(0, 2, 3);
        }
      } else if (l.t === 2) {
        const c = l.color === 24 || l.color === 16 ? lib.color(cur).edge : lib.color(l.color).rgb;
        const a = apply(m, l.p[0], l.p[1], l.p[2]);
        const b = apply(m, l.p[3], l.p[4], l.p[5]);
        mesh.edges.push(...a, ...b);
        mesh.edgeColors.push(...c, ...c);
      }
    }
  };
  visit(name, IDENTITY, color, 0, true);
  return { mesh, snaps, parts, missing: [...missing] };
}

// ---- snaps ------------------------------------------------------------------------------------
function attr(s: string, key: string): string | undefined {
  const m = s.match(new RegExp(`\\[${key}=([^\\]]*)\\]`, "i"));
  return m?.[1].trim();
}

/** Parse one LDCad SNAP meta line in the frame `m`. Arrays ([grid=...]) expand to several snaps. */
export function parseSnap(line: string, m: Mat4): Snap[] | null {
  const kindM = line.match(/SNAP_(CYL|CLP|FGR|GEN|SPH)\b/);
  if (!kindM) return null;
  const kind = kindM[1].toLowerCase() as Snap["kind"];
  const pos = (attr(line, "pos") ?? "0 0 0").split(/\s+/).map(Number);
  const ori = (attr(line, "ori") ?? "1 0 0 0 1 0 0 0 1").split(/\s+/).map(Number);
  const local = new Float64Array([ori[0], ori[1], ori[2], pos[0], ori[3], ori[4], ori[5], pos[1], ori[6], ori[7], ori[8], pos[2]]);
  const base = mul(m, local);
  // Clips hold a bar (radius, length); click-hinge fingers interleave (a sequence of finger
  // lengths starting with a finger for genderOfs=M or a gap for F): both as round cylinders.
  const radius = attr(line, "radius");
  const secs = kind === "clp" ? `R ${radius ?? 4} ${attr(line, "length") ?? 8}`
    : kind === "fgr" ? `R ${radius ?? 4} ${(attr(line, "seq") ?? "8").split(/\s+/).map(Number).reduce((a, b) => a + b, 0)}`
    : attr(line, "secs") ?? "";
  const gender = kind === "clp" ? "F" : kind === "fgr" ? ((attr(line, "genderOfs") ?? "M").toUpperCase() === "F" ? "F" : "M") : (attr(line, "gender") ?? "M").toUpperCase() === "F" ? "F" : "M";
  const mk = (mm: Mat4): Snap => ({
    kind,
    src: -1,
    id: attr(line, "id"),
    gender,
    secs,
    caps: attr(line, "caps") ?? "none",
    center: attr(line, "center") === "true" || kind === "clp",
    slide: attr(line, "slide") === "true",
    grid: attr(line, "grid"),
    m: mm,
  });
  const grid = attr(line, "grid");
  if (!grid) return [mk(base)];
  // grid=[C] cx [C] cz sx sz (2D, local X and Z) or [C] cx [C] cy [C] cz sx sy sz (3D);
  // C = centred on the snap's origin.
  const g = grid.split(/\s+/);
  const dims = g.filter((t) => t !== "C").length === 6 ? [0, 1, 2] : [0, 2];
  let i = 0;
  const axes = dims.map(() => {
    let centered = false;
    if (g[i] === "C") {
      centered = true;
      i++;
    }
    return { n: Number(g[i++]), centered };
  });
  const sp = dims.map(() => Number(g[i++]));
  const out: Snap[] = [];
  const idx = axes.map(() => 0);
  const total = axes.reduce((t, a) => t * a.n, 1);
  for (let c = 0; c < total; c++) {
    let r = c;
    axes.forEach((a, k) => {
      idx[k] = r % a.n;
      r = Math.floor(r / a.n);
    });
    const o = [0, 0, 0];
    dims.forEach((d, k) => (o[d] = (axes[k].centered ? idx[k] - (axes[k].n - 1) / 2 : idx[k]) * sp[k]));
    out.push(mk(mul(base, new Float64Array([1, 0, 0, o[0], 0, 1, 0, o[1], 0, 0, 1, o[2]]))));
  }
  return out;
}

// ---- helpers ------------------------------------------------------------------------------------
export function bounds(positions: number[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (positions[i + k] < min[k]) min[k] = positions[i + k];
      if (positions[i + k] > max[k]) max[k] = positions[i + k];
    }
  return { min, max };
}

/**
 * LDraw frame (LDU, -Y up, a model's front facing -Z) -> simulator robot/world frame
 * (mm, +Y up, forward -Z): (x, y, z) -> (-x, -y, z) * 0.4, a 180° rotation about Z (no mirroring).
 */
export function ldrawToWorld(x: number, y: number, z: number): [number, number, number] {
  return [-x * LDU_MM, -y * LDU_MM, z * LDU_MM];
}
