// LEGO-style building instructions from a builder model: cover, bill of materials, and one
// panel per step (parts callout with quantities + the model so far, new parts outlined).
// Produces a self-contained HTML document (images inlined) that the main process prints to PDF.
import * as THREE from "three";
import type { Library } from "@fll-sim/ldraw";
import type { ModelPart } from "@fll-sim/assembly";
import { analyzePart } from "@fll-sim/assembly";
import { partGeometry } from "../three/ldrawMesh";

const ROOT = new THREE.Matrix4().makeScale(-1, -1, 1); // LDraw -> +Y up (units stay LDU)

/** Assign steps to a model without any: each part gets a step, pins/axles join the next part's step. */
export function autoSteps(lib: Library, parts: ModelPart[]): number[] {
  if (parts.every((p) => p.step !== undefined)) return parts.map((p) => p.step!);
  const steps: number[] = [];
  let s = 0;
  let pendingConnectors = 0;
  for (const p of parts) {
    const connector = analyzePart(lib, p.file).connector;
    if (connector) {
      steps.push(-1);
      pendingConnectors++;
      continue;
    }
    s++;
    // connectors placed just before this part go into its step
    for (let k = steps.length - 1; k >= 0 && pendingConnectors > 0; k--)
      if (steps[k] === -1) {
        steps[k] = s;
        pendingConnectors--;
      }
    steps.push(s);
  }
  return steps.map((x) => (x === -1 ? Math.max(1, s) : x));
}

class Renderer {
  renderer: THREE.WebGLRenderer;
  constructor(readonly lib: Library, w: number, h: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  private scene(parts: ModelPart[], highlight: Set<number>, faded: boolean) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#8a8a8a", 2.2));
    const sun = new THREE.DirectionalLight("#ffffff", 1.2);
    sun.position.set(-0.6, 1, 0.8);
    scene.add(sun);
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.matrix.copy(ROOT);
    scene.add(root);
    const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const edge = new THREE.LineBasicMaterial({ color: "#222222", transparent: true, opacity: 0.55 });
    const hiEdge = new THREE.LineBasicMaterial({ color: "#ff8a00" });
    parts.forEach((p, i) => {
      const g = partGeometry(this.lib, p.file, p.color);
      const o = new THREE.Group();
      o.matrixAutoUpdate = false;
      const m = p.m;
      o.matrix.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);
      o.add(new THREE.Mesh(g.mesh, solid));
      if (g.edges.getAttribute("position").count) o.add(new THREE.LineSegments(g.edges, highlight.has(i) ? hiEdge : edge));
      root.add(o);
      void faded;
    });
    root.updateMatrixWorld(true);
    return { scene, root };
  }

  /** Render parts framed by `bounds` (world box) from the standard instruction angle. */
  shot(parts: ModelPart[], bounds: THREE.Box3, highlight = new Set<number>()): string {
    const { scene } = this.scene(parts, highlight, false);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 20);
    const camera = new THREE.PerspectiveCamera(22, this.renderer.domElement.width / this.renderer.domElement.height, 1, 100000);
    const dirV = new THREE.Vector3(0.62, 0.55, 0.72).normalize(); // front-right-above, like LEGO books
    const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.82;
    camera.position.copy(center).addScaledVector(dirV, dist);
    camera.lookAt(center);
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.render(scene, camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  dispose() {
    this.renderer.dispose();
  }
}

function worldBox(lib: Library, parts: ModelPart[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const p of parts) {
    const a = analyzePart(lib, p.file);
    const m = new THREE.Matrix4().set(p.m[0], p.m[1], p.m[2], p.m[3], p.m[4], p.m[5], p.m[6], p.m[7], p.m[8], p.m[9], p.m[10], p.m[11], 0, 0, 0, 1).premultiply(ROOT);
    for (const x of [a.min[0], a.max[0]]) for (const y of [a.min[1], a.max[1]]) for (const z of [a.min[2], a.max[2]]) box.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(m));
  }
  return box;
}

export interface InstructionOptions {
  title: string;
  subtitle?: string;
  /** Steps per page (2 = two panels side by side on landscape A4). */
  perPage?: number;
  onProgress?(done: number, total: number): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Build the instructions HTML document. */
export async function buildInstructions(lib: Library, parts: ModelPart[], o: InstructionOptions): Promise<string> {
  const steps = autoSteps(lib, parts);
  const order = parts.map((p, i) => ({ p, i, s: steps[i] })).sort((a, b) => a.s - b.s || a.i - b.i);
  const stepNums = [...new Set(order.map((x) => x.s))];
  const big = new Renderer(lib, 1100, 820);
  const small = new Renderer(lib, 180, 150);
  const full = worldBox(lib, parts);
  const partPic = new Map<string, string>();
  const pic = (p: ModelPart) => {
    const k = `${p.file}|${p.color}`;
    if (!partPic.has(k)) {
      const single = { ...p, m: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]) };
      partPic.set(k, small.shot([single], worldBox(lib, [single])));
    }
    return partPic.get(k)!;
  };
  const name = (p: ModelPart) => lib.get(p.file)?.title.replace(/^[~=_]/, "") ?? p.file;
  const colorName = (c: number) => lib.color(c).name;

  // Bill of materials
  const bom = new Map<string, { p: ModelPart; n: number }>();
  for (const p of parts) {
    const k = `${p.file}|${p.color}`;
    bom.set(k, { p, n: (bom.get(k)?.n ?? 0) + 1 });
  }
  const bomItems = [...bom.values()].sort((a, b) => name(a.p).localeCompare(name(b.p)));

  const panels: string[] = [];
  let done = 0;
  for (const s of stepNums) {
    const upto = order.filter((x) => x.s <= s).map((x) => x.p);
    const fresh = new Set(order.filter((x) => x.s <= s).map((x, k) => (x.s === s ? k : -1)).filter((k) => k >= 0));
    const newParts = order.filter((x) => x.s === s).map((x) => x.p);
    const callout = new Map<string, { p: ModelPart; n: number }>();
    for (const p of newParts) {
      const k = `${p.file}|${p.color}`;
      callout.set(k, { p, n: (callout.get(k)?.n ?? 0) + 1 });
    }
    // frame the model so far (like LEGO books, early steps are shown close up), but never
    // smaller than a third of the finished model so single parts don't fill the page
    const box = worldBox(lib, upto);
    const minSize = full.getSize(new THREE.Vector3()).multiplyScalar(1 / 3);
    box.expandByVector(minSize.sub(box.getSize(new THREE.Vector3())).max(new THREE.Vector3()).multiplyScalar(0.5));
    const img = big.shot(upto, box, fresh);
    panels.push(`<section class="step"><div class="num">${stepNums.indexOf(s) + 1}</div>
      <div class="pli">${[...callout.values()].map((c) => `<figure><img src="${pic(c.p)}"><figcaption>${c.n}x</figcaption></figure>`).join("")}</div>
      <img class="shot" src="${img}"></section>`);
    o.onProgress?.(++done, stepNums.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  const cover = big.shot(parts, full);
  big.dispose();
  small.dispose();
  const per = o.perPage ?? 2;
  const pages: string[] = [];
  const BOM_PER_PAGE = 24;
  const bomPages: string[] = [];
  for (let i = 0; i < bomItems.length; i += BOM_PER_PAGE)
    bomPages.push(`<div class="page bom"><h1>Parts list${bomItems.length > BOM_PER_PAGE ? ` (${i / BOM_PER_PAGE + 1})` : ""}</h1><div class="grid">${bomItems.slice(i, i + BOM_PER_PAGE).map((b) => `<figure><img src="${pic(b.p)}"><b>${b.n}x</b>${esc(name(b.p))}<br>${esc(colorName(b.p.color))} · ${b.p.file.replace(".dat", "")}</figure>`).join("")}</div><div class="folio">${bomPages.length + 2}</div></div>`);
  for (let i = 0; i < panels.length; i += per) pages.push(`<div class="page steps per${per}">${panels.slice(i, i + per).join("")}<div class="folio">${pages.length + 2 + bomPages.length}</div></div>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(o.title)}</title><style>
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: #1b1b1b; }
.page { width: 297mm; height: 210mm; page-break-after: always; position: relative; overflow: hidden; background: #fff; padding: 10mm; }
.cover { display: flex; flex-direction: column; background: linear-gradient(160deg, #ffcf00 0%, #ffcf00 38%, #fff 38%); }
.cover h1 { font-size: 34pt; margin: 0 0 4mm; }
.cover h2 { font-size: 14pt; font-weight: 400; margin: 0; }
.cover img { flex: 1; min-height: 0; object-fit: contain; }
.cover .count { position: absolute; right: 12mm; bottom: 10mm; font-size: 14pt; }
.bom h1 { font-size: 18pt; margin: 0 0 6mm; }
.bom .grid { display: grid; grid-template-columns: repeat(auto-fill, 44mm); gap: 3mm; }
.bom figure { margin: 0; border: 0.3mm solid #ccc; border-radius: 2mm; padding: 1mm; text-align: center; font-size: 7pt; }
.bom figure img { width: 36mm; height: 30mm; object-fit: contain; }
.bom b { font-size: 11pt; display: block; }
.steps { display: grid; gap: 6mm; }
.steps.per1 { grid-template-columns: 1fr; }
.steps.per2 { grid-template-columns: 1fr 1fr; }
.step { position: relative; border-left: 0.4mm solid #ddd; padding-left: 4mm; }
.step:first-child { border-left: none; padding-left: 0; }
.num { font-size: 30pt; font-weight: 700; }
.pli { display: inline-flex; gap: 2mm; background: #dbeafe; border: 0.4mm solid #3b82f6; border-radius: 2mm; padding: 2mm 3mm; margin: 1mm 0 3mm; flex-wrap: wrap; max-width: 100%; }
.pli figure { margin: 0; text-align: center; }
.pli img { width: 22mm; height: 18mm; object-fit: contain; }
.pli figcaption { font-size: 10pt; font-weight: 700; }
.shot { width: 100%; height: 125mm; object-fit: contain; }
.folio { position: absolute; right: 8mm; bottom: 5mm; font-size: 9pt; color: #777; }
</style></head><body>
<div class="page cover"><h1>${esc(o.title)}</h1><h2>${esc(o.subtitle ?? "Building instructions · FLL Sim")}</h2><img src="${cover}"><div class="count">${parts.length} pieces · ${stepNums.length} steps</div></div>
${bomPages.join("\n")}
${pages.join("\n")}
</body></html>`;
}
