// Software renderer for LDraw models (no GPU): z-buffered triangles with flat shading plus
// edge lines, orthographic views. Used to check scripted builds against the official
// instruction pictures, and to draw building-instruction steps headlessly.
import { PNG } from "pngjs";
import { type Library, type Mat4, flatten, mul } from "@fll-sim/ldraw";

export interface RenderPart { file: string; color: number; m: Mat4; highlight?: boolean; faded?: boolean }

export interface View {
  /** Camera direction (from camera towards the model), LDraw frame. */
  dir: [number, number, number];
  up?: [number, number, number];
}

export const VIEWS: Record<string, View> = {
  // LDraw: -Y is up, front is -Z. "iso" looks from front-right-above.
  iso: { dir: [-0.55, 0.55, 0.63] },
  isoBack: { dir: [0.55, 0.55, -0.63] },
  front: { dir: [0, 0, 1] },
  right: { dir: [-1, 0, 0] },
  top: { dir: [0, 1, 0], up: [0, 0, -1] },
};

const norm = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Tri { p: number[]; c: [number, number, number]; alpha: number }

const meshCache = new WeakMap<Library, Map<string, { pos: number[]; col: number[]; edges: number[] }>>();
function partMesh(lib: Library, file: string, color: number) {
  let m = meshCache.get(lib);
  if (!m) meshCache.set(lib, (m = new Map()));
  const k = `${file}|${color}`;
  let r = m.get(k);
  if (!r) {
    const f = flatten(lib, file, color, {});
    r = { pos: f.mesh.positions, col: f.mesh.colors, edges: f.mesh.edges };
    m.set(k, r);
  }
  return r;
}

export interface RenderOptions {
  width?: number;
  height?: number;
  view?: View;
  background?: [number, number, number];
  /** Fixed framing (LDraw bounds) so a sequence of steps doesn't jump around. */
  frame?: { min: number[]; max: number[] };
  edges?: boolean;
}

/** Render parts to an RGBA PNG buffer. */
export function render(lib: Library, parts: RenderPart[], o: RenderOptions = {}): Buffer {
  const W = o.width ?? 800, H = o.height ?? 600;
  const view = o.view ?? VIEWS.iso;
  const fwd = norm(view.dir);
  const upHint = view.up ?? [0, -1, 0];
  let right = norm(cross(fwd, upHint));
  if (!isFinite(right[0]) || Math.hypot(...right) < 0.5) right = [1, 0, 0];
  const up = norm(cross(right, fwd));
  // Screen: x = right, y = -up (down), depth = fwd.

  const tris: Tri[] = [];
  const lines: { a: number[]; b: number[] }[] = [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const mesh = partMesh(lib, part.file, part.color);
    const alpha = part.faded ? 0.35 : 1;
    const tr = (x: number, y: number, z: number) => {
      const m = part.m;
      return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
    };
    for (let i = 0; i < mesh.pos.length; i += 9) {
      const p = [...tr(mesh.pos[i], mesh.pos[i + 1], mesh.pos[i + 2]), ...tr(mesh.pos[i + 3], mesh.pos[i + 4], mesh.pos[i + 5]), ...tr(mesh.pos[i + 6], mesh.pos[i + 7], mesh.pos[i + 8])];
      for (let k = 0; k < 9; k++) {
        min[k % 3] = Math.min(min[k % 3], p[k]);
        max[k % 3] = Math.max(max[k % 3], p[k]);
      }
      const ci = (i / 3) * 3;
      let c: [number, number, number] = [mesh.col[ci], mesh.col[ci + 1], mesh.col[ci + 2]];
      if (part.highlight) c = c;
      tris.push({ p, c, alpha });
    }
    if (o.edges !== false && !part.faded)
      for (let i = 0; i < mesh.edges.length; i += 6) lines.push({ a: tr(mesh.edges[i], mesh.edges[i + 1], mesh.edges[i + 2]), b: tr(mesh.edges[i + 3], mesh.edges[i + 4], mesh.edges[i + 5]) });
  }
  const fmin = o.frame?.min ?? min, fmax = o.frame?.max ?? max;
  // Project the frame's corners to fit the image.
  let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  for (const x of [fmin[0], fmax[0]]) for (const y of [fmin[1], fmax[1]]) for (const z of [fmin[2], fmax[2]]) {
    const q = [x, y, z];
    const u = dot(q, right), v = -dot(q, up);
    sx0 = Math.min(sx0, u); sx1 = Math.max(sx1, u); sy0 = Math.min(sy0, v); sy1 = Math.max(sy1, v);
  }
  const pad = 0.08;
  const scale = Math.min((W * (1 - 2 * pad)) / (sx1 - sx0 || 1), (H * (1 - 2 * pad)) / (sy1 - sy0 || 1));
  const ox = W / 2 - ((sx0 + sx1) / 2) * scale, oy = H / 2 - ((sy0 + sy1) / 2) * scale;
  const proj = (q: number[]) => [dot(q, right) * scale + ox, -dot(q, up) * scale + oy, dot(q, fwd)];

  const bg = o.background ?? [255, 255, 255];
  const rgb = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++) { rgb[i * 3] = bg[0]; rgb[i * 3 + 1] = bg[1]; rgb[i * 3 + 2] = bg[2]; }
  const zbuf = new Float32Array(W * H).fill(Infinity);
  const light = norm([-0.4, -0.8, -0.45]); // from above-front-left (LDraw -Y up)

  // Opaque first, then faded (drawn with blending, no depth write).
  const order = [...tris.filter((t) => t.alpha >= 1), ...tris.filter((t) => t.alpha < 1)];
  for (const t of order) {
    const a = proj(t.p.slice(0, 3)), b = proj(t.p.slice(3, 6)), c = proj(t.p.slice(6, 9));
    const n = norm(cross([t.p[3] - t.p[0], t.p[4] - t.p[1], t.p[5] - t.p[2]], [t.p[6] - t.p[0], t.p[7] - t.p[1], t.p[8] - t.p[2]]));
    const shade = 0.55 + 0.45 * Math.abs(dot(n, light));
    const col = [t.c[0] * shade, t.c[1] * shade, t.c[2] * shade];
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        const k = y * W + x;
        if (t.alpha >= 1) {
          if (z >= zbuf[k]) continue;
          zbuf[k] = z;
          rgb[k * 3] = col[0]; rgb[k * 3 + 1] = col[1]; rgb[k * 3 + 2] = col[2];
        } else if (z < zbuf[k] + 1e6) {
          const al = t.alpha * (z < zbuf[k] ? 1 : 0.35);
          rgb[k * 3] += (col[0] - rgb[k * 3]) * al * 0.5;
          rgb[k * 3 + 1] += (col[1] - rgb[k * 3 + 1]) * al * 0.5;
          rgb[k * 3 + 2] += (col[2] - rgb[k * 3 + 2]) * al * 0.5;
        }
      }
  }
  // Edge lines (depth-tested with a small bias).
  for (const l of lines) {
    const a = proj(l.a), b = proj(l.b);
    const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])) + 1;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const x = Math.round(a[0] + (b[0] - a[0]) * s), y = Math.round(a[1] + (b[1] - a[1]) * s);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const z = a[2] + (b[2] - a[2]) * s;
      const k = y * W + x;
      if (z <= zbuf[k] + 0.8) { rgb[k * 3] *= 0.35; rgb[k * 3 + 1] *= 0.35; rgb[k * 3 + 2] *= 0.35; }
    }
  }
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    png.data[i * 4] = Math.max(0, Math.min(255, rgb[i * 3]));
    png.data[i * 4 + 1] = Math.max(0, Math.min(255, rgb[i * 3 + 1]));
    png.data[i * 4 + 2] = Math.max(0, Math.min(255, rgb[i * 3 + 2]));
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

export { mul };
