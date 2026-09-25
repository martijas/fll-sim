// LEGO builder: place real LDraw parts by snapping connection points together.
// Internally everything is in the LDraw model frame (LDU); a root transform maps it to metres.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { IDENTITY, type Library, type Mat4, mul, type Snap } from "@fll-sim/ldraw";
import { analyzePart, assemble, partSnaps, placeOnSnap, serializeModel, parseModel, type ModelPart, type AssemblyReport } from "@fll-sim/assembly";
import { PORTS, type Port } from "@fll-sim/sim";
import type { CatalogCategory, CatalogPart } from "../lib/ldraw";
import { partObject } from "../three/ldrawMesh";
import { autoSteps, buildInstructions } from "../lib/instructions";

interface Props {
  lib: Library;
  catalog: CatalogCategory[];
  parts: ModelPart[];
  onChange(parts: ModelPart[]): void;
  onUseAsRobot(parts: ModelPart[]): void;
  missionModels: { id: string; name: string; built: boolean }[];
  /** The season's real-part mission models, openable as examples (e.g. to print their instructions). */
  bundledMissions: { id: string; name: string; text: string }[];
  /** Put the current build on the field as a mission model (empty parts = remove). */
  onUseAsMissionModel(id: string, parts: ModelPart[]): void;
  log(text: string, kind?: "out" | "err" | "info"): void;
}

interface Ghost { file: string; color: number; snapIdx: number; angle: number; flip: boolean; offset: number; m: Mat4; attached: boolean }

const ROOT = new THREE.Matrix4().makeScale(-0.0004, -0.0004, 0.0004); // LDU LDraw frame -> metres, +Y up
const ROOT_INV = ROOT.clone().invert();

const toThree = (m: Mat4) => new THREE.Matrix4().set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], 0, 0, 0, 1);
const translate = (x: number, y: number, z: number): Mat4 => new Float64Array([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]);
const rotY = (deg: number): Mat4 => {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return new Float64Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
};

function hexOf(lib: Library, code: number) {
  return "#" + lib.color(code).rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export function Builder({ lib, catalog, parts, onChange, onUseAsRobot, missionModels, bundledMissions, onUseAsMissionModel, log }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [catId, setCatId] = useState(catalog[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [color, setColor] = useState(71);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [report, setReport] = useState<AssemblyReport | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [modelName, setModelName] = useState("My robot");
  /** Step that newly placed parts go into (building instructions). */
  const maxStep = parts.reduce((m, p) => Math.max(m, p.step ?? 0), 0);
  const [step, setStep] = useState(Math.max(1, maxStep));
  const undo = useRef<ModelPart[][]>([]);
  const redo = useRef<ModelPart[][]>([]);
  const st = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; root: THREE.Group; ghostObj: THREE.Object3D | null; selBox: THREE.Box3Helper } | null>(null);
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const stepRef = useRef(1);

  const commit = (next: ModelPart[]) => {
    undo.current.push(partsRef.current);
    redo.current = [];
    setReport(null);
    onChange(next);
  };

  // ---- scene setup ---------------------------------------------------------------------
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#23262e");
    const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 20);
    camera.position.set(0.25, 0.22, 0.3);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.03, 0);
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight("#ffffff", "#555555", 1.8));
    const sun = new THREE.DirectionalLight("#ffffff", 1.4);
    sun.position.set(0.4, 0.8, 0.5);
    sun.castShadow = true;
    scene.add(sun);
    const grid = new THREE.GridHelper(0.64, 80, "#3d4250", "#30343d"); // 8 mm stud pitch
    scene.add(grid);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.25 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.name = "ground";
    scene.add(ground);
    const root = new THREE.Group();
    root.matrixAutoUpdate = false;
    root.matrix.copy(ROOT);
    scene.add(root);
    const selBox = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color("#ffcf00"));
    selBox.visible = false;
    scene.add(selBox);
    st.current = { renderer, scene, camera, controls, root, ghostObj: null, selBox };
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  // ---- model rendering -------------------------------------------------------------------------
  useEffect(() => {
    const s = st.current!;
    for (const c of [...s.root.children]) if (c.userData.partIndex !== undefined) s.root.remove(c);
    parts.forEach((p, i) => {
      const o = partObject(lib, p.file, p.color);
      o.matrix.copy(toThree(p.m));
      o.userData.partIndex = i;
      o.traverse((c) => (c.userData.partIndex = i));
      s.root.add(o);
    });
    s.root.updateMatrixWorld(true);
    updateSelection(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parts, lib]);

  function updateSelection(i: number | null) {
    const s = st.current!;
    const obj = i === null ? null : s.root.children.find((c) => c.userData.partIndex === i);
    if (obj) {
      s.selBox.box.setFromObject(obj);
      s.selBox.visible = true;
    } else s.selBox.visible = false;
  }
  useEffect(() => updateSelection(selected), [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ghost rendering ----------------------------------------------------------------------------
  useEffect(() => {
    const s = st.current!;
    if (s.ghostObj) s.root.remove(s.ghostObj);
    s.ghostObj = null;
    if (!ghost) return;
    const o = partObject(lib, ghost.file, ghost.color, false);
    o.matrix.copy(toThree(ghost.m));
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.material = (c.material as THREE.Material).clone();
        (c.material as THREE.MeshStandardMaterial).transparent = true;
        (c.material as THREE.MeshStandardMaterial).opacity = ghost.attached ? 0.8 : 0.45;
        c.castShadow = false;
      }
      c.raycast = () => {}; // never pick the ghost
    });
    s.root.add(o);
    s.ghostObj = o;
  }, [ghost, lib]);

  // ---- placement ---------------------------------------------------------------------------------
  const ghostSnaps = useMemo(() => (ghost ? partSnaps(lib, ghost.file) : []), [ghost?.file, lib]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Model-frame snaps of placed parts, with their part index. */
  const placedSnaps = useMemo(() => {
    const out: { part: number; s: Snap; m: Mat4 }[] = [];
    parts.forEach((p, i) => {
      for (const s of analyzePart(lib, p.file).snaps) if (s.kind === "cyl" || s.kind === "clp" || s.kind === "fgr") out.push({ part: i, s, m: mul(p.m, s.m) });
    });
    return out;
  }, [parts, lib]);

  function pick(ev: { clientX: number; clientY: number }) {
    const s = st.current!;
    const r = s.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, s.camera);
    const targets = s.root.children.filter((c) => c.userData.partIndex !== undefined);
    const hits = ray.intersectObjects(targets, true);
    if (hits.length) return { point: hits[0].point, part: hits[0].object.userData.partIndex as number, ray };
    const g = ray.intersectObject(s.scene.getObjectByName("ground")!);
    return { point: g[0]?.point ?? null, part: null as number | null, ray };
  }

  function updateGhost(ev: { clientX: number; clientY: number }, g: Ghost) {
    const h = pick(ev);
    if (!h.point) return;
    const p = h.point.clone().applyMatrix4(ROOT_INV); // model frame (LDU)
    const gs = ghostSnaps[g.snapIdx % Math.max(1, ghostSnaps.length)];
    if (h.part !== null && gs) {
      // nearest compatible snap on the hit part (or any part near the hit point)
      let best: { m: Mat4 } | null = null;
      let bd = 60;
      for (const t of placedSnaps) {
        if (t.s.gender === gs.gender) continue;
        const d = Math.hypot(t.m[3] - p.x, t.m[7] - p.y, t.m[11] - p.z);
        const bonus = t.part === h.part ? 0 : 15;
        if (d + bonus < bd) {
          bd = d + bonus;
          best = t;
        }
      }
      if (best) {
        setGhost({ ...g, m: placeOnSnap(best.m, gs.m, { angleDeg: g.angle, flip: g.flip, offset: g.offset }), attached: true });
        return;
      }
    }
    // free placement on the ground, resting on y = 0 (LDraw -Y up), snapped to a 10 LDU grid
    const info = analyzePart(lib, g.file);
    const base = mul(rotY(g.angle), IDENTITY);
    const gx = Math.round(p.x / 10) * 10, gz = Math.round(p.z / 10) * 10;
    setGhost({ ...g, m: mul(translate(gx, -info.max[1], gz), base), attached: false });
  }

  const lastMouse = useRef({ clientX: 0, clientY: 0 });
  useEffect(() => {
    const el = st.current!.renderer.domElement;
    let down = { x: 0, y: 0 };
    const move = (e: PointerEvent) => {
      lastMouse.current = { clientX: e.clientX, clientY: e.clientY };
      const g = ghostRef.current;
      if (g) updateGhost(e, g);
    };
    const pd = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const pu = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4 || e.button !== 0) return; // orbit drag
      const g = ghostRef.current;
      if (g) {
        commit([...partsRef.current, { file: g.file, color: g.color, m: g.m, step: stepRef.current }]);
        setSelected(partsRef.current.length);
        return;
      }
      const h = pick(e);
      setSelected(h.part);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", pd);
    el.addEventListener("pointerup", pu);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", pd);
      el.removeEventListener("pointerup", pu);
    };
  });

  // ---- keyboard ------------------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "SELECT") return;
      const g = ghostRef.current;
      const re = (ng: Ghost) => {
        setGhost(ng);
        updateGhost(lastMouse.current, ng);
      };
      if (e.key === "Escape") { setGhost(null); setSelected(null); }
      else if (g && e.key === "Tab") { e.preventDefault(); re({ ...g, snapIdx: (g.snapIdx + (e.shiftKey ? ghostSnaps.length - 1 : 1)) % Math.max(1, ghostSnaps.length) }); }
      else if (g && (e.key === "r" || e.key === "R")) re({ ...g, angle: (g.angle + (e.shiftKey ? -90 : 90)) % 360 });
      else if (g && (e.key === "f" || e.key === "F")) re({ ...g, flip: !g.flip });
      else if (g && e.key === "]") re({ ...g, offset: g.offset + 10 });
      else if (g && e.key === "[") re({ ...g, offset: g.offset - 10 });
      else if (!g && selected !== null && (e.key === "Delete" || e.key === "Backspace")) {
        commit(partsRef.current.filter((_, i) => i !== selected));
        setSelected(null);
      } else if (!g && selected !== null && (e.key === "m" || e.key === "M")) {
        const p = partsRef.current[selected];
        commit(partsRef.current.filter((_, i) => i !== selected));
        setSelected(null);
        setGhost({ file: p.file, color: p.color, snapIdx: 0, angle: 0, flip: false, offset: 0, m: p.m, attached: false });
      } else if (e.ctrlKey && e.key === "z") {
        const prev = undo.current.pop();
        if (prev) { redo.current.push(partsRef.current); onChange(prev); setSelected(null); }
      } else if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) {
        const next = redo.current.pop();
        if (next) { undo.current.push(partsRef.current); onChange(next); setSelected(null); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- catalog ------------------------------------------------------------------------------------------
  const cat = catalog.find((c) => c.id === catId) ?? catalog[0];
  const q = query.trim().toLowerCase();
  const list = (q ? catalog.flatMap((c) => c.parts) : cat?.parts ?? []).filter((p, i, arr) => (!q || p.name.toLowerCase().includes(q) || p.file.includes(q)) && arr.findIndex((x) => x.file === p.file) === i);

  const startPlacing = (p: CatalogPart) => {
    const cols = Object.keys(p.colors).map(Number);
    const c = cols.includes(color) ? color : cols[0] ?? color;
    setColor(c);
    setSelected(null);
    const g: Ghost = { file: p.file, color: c, snapIdx: 0, angle: 0, flip: false, offset: 0, m: IDENTITY, attached: false };
    setGhost(g);
  };

  const sel = selected !== null ? parts[selected] : null;
  const selInfo = sel ? analyzePart(lib, sel.file) : null;
  const allColors = useMemo(() => {
    const set = new Set<number>();
    for (const c of catalog) for (const p of c.parts) for (const k of Object.keys(p.colors)) set.add(Number(k));
    return [...set].filter((c) => lib.colors.has(c)).sort((a, b) => a - b);
  }, [catalog, lib]);

  stepRef.current = step;

  const exportInstructions = async (name: string) => {
    if (!parts.length) return;
    // Builds made before steps existed get automatic steps.
    const steps = autoSteps(lib, parts);
    const stepped = parts.map((p, i) => ({ ...p, step: steps[i] }));
    try {
      setExporting("Rendering…");
      const html = await buildInstructions(lib, stepped, { title: name, onProgress: (d, t) => setExporting(`Rendering step ${d}/${t}…`) });
      setExporting("Saving…");
      const path = await window.fllsim.exportInstructions(html, `${name.replace(/[^\w -]+/g, "_")}.pdf`);
      if (path) log(`Building instructions saved: ${path}`, "info");
    } catch (e) {
      log(`Could not export instructions: ${e}`, "err");
    } finally {
      setExporting(null);
    }
  };

  const check = () => {
    if (!parts.length) return;
    const r = assemble(lib, parts);
    setReport(r.report);
    log(`Connections: ${r.report.bodies} rigid group(s), ${r.report.joints} hinge(s), ${r.report.motors} motor(s), ${r.report.gears} gear mesh(es)${r.robot.gears?.length ? ` (${r.robot.gears.map((g) => g.label).join(", ")})` : ""}`, "info");
    for (const w of r.report.warnings) log(`⚠ ${w}`, "err");
  };

  const save = async () => {
    const text = serializeModel(parts, "robot.ldr");
    const res = await window.fllsim.saveFile("robot.ldr", new TextEncoder().encode(text), [{ name: "LDraw model", extensions: ["ldr", "mpd"] }]);
    if (res) log(`Saved ${res.path}`, "info");
  };
  const open = async () => {
    const f = await window.fllsim.openFile([{ name: "LDraw model", extensions: ["ldr", "mpd", "dat"] }]);
    if (!f) return;
    const r = parseModel(lib, new TextDecoder("latin1").decode(f.data));
    if (r.missing.length) log(`⚠ Parts not in the bundled library (shown missing): ${r.missing.slice(0, 8).join(", ")}${r.missing.length > 8 ? "…" : ""}`, "err");
    commit(r.parts);
    log(`Opened ${f.name}: ${r.parts.length} parts`, "info");
  };

  return (
    <div className="builder">
      <aside className="catalog">
        <input className="search" placeholder="Search parts (name or number)…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {!q && (
          <select value={catId} onChange={(e) => setCatId(e.target.value)}>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.parts.length})</option>)}
          </select>
        )}
        <div className="part-list">
          {list.slice(0, 400).map((p) => (
            <button key={p.file} className={`part-item ${ghost?.file === p.file ? "active" : ""}`} onClick={() => startPlacing(p)} title={p.file}>
              <span className="swatches">{Object.keys(p.colors).slice(0, 4).map((c) => <i key={c} style={{ background: hexOf(lib, Number(c)) }} />)}</span>
              <span className="pname">{p.name}</span>
              <span className="pnum">{p.file.replace(".dat", "")}</span>
            </button>
          ))}
        </div>
      </aside>
      <section className="build-view-wrap">
        <div className="build-toolbar">
          <button onClick={() => { if (parts.length && confirm("Start a new model? Unsaved changes are lost.")) commit([]); }}>New</button>
          <button onClick={open}>Open .ldr…</button>
          <select value="" onChange={async (e) => {
            const file = e.target.value;
            if (!file) return;
            const mission = bundledMissions.find((m) => "mission:" + m.id === file);
            if (mission) {
              const r = parseModel(lib, mission.text);
              commit(r.parts);
              setModelName(mission.name);
              return log(`Loaded mission model: ${mission.name} (${r.parts.length} parts)`, "info");
            }
            const bytes = await window.fllsim.readAsset(`apps/desktop/resources/robots/${file}`);
            if (!bytes) return log(`Example ${file} not found`, "err");
            const r = parseModel(lib, new TextDecoder("latin1").decode(bytes));
            commit(r.parts);
            log(`Loaded example: ${file} (${r.parts.length} parts)`, "info");
          }}>
            <option value="">Examples…</option>
            <option value="spike-drivebase.ldr">SPIKE drive base (real parts)</option>
            {bundledMissions.length > 0 && (
              <optgroup label="Mission models">
                {bundledMissions.map((m) => <option key={m.id} value={"mission:" + m.id}>{m.name}</option>)}
              </optgroup>
            )}
          </select>
          <button onClick={save} disabled={!parts.length}>Save .ldr…</button>
          <button onClick={check} disabled={!parts.length}>Check connections</button>
          <span className="step-ctl" title="New parts go into this building-instruction step">
            Step <b>{step}</b>
            <button onClick={() => setStep(Math.max(maxStep, step) + 1)} disabled={!parts.some((p) => (p.step ?? 1) === step)}>+ New step</button>
          </span>
          <input className="model-name" value={modelName} onChange={(e) => setModelName(e.target.value)} title="Model name (used for instructions and files)" />
          <button onClick={() => exportInstructions(modelName.trim() || "My model")} disabled={!parts.length || !!exporting}>{exporting ?? "Instructions…"}</button>
          <button className="primary" onClick={() => onUseAsRobot(parts)} disabled={!parts.length}>Use as robot ▶</button>
          <select value="" disabled={!parts.length} onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v.startsWith("reset:")) onUseAsMissionModel(v.slice(6), []);
            else onUseAsMissionModel(v, parts);
          }} title="Place this build on the field as one of the mission models">
            <option value="">Use as mission model…</option>
            {missionModels.map((m) => <option key={m.id} value={m.id}>{m.name}{m.built ? " (replace)" : ""}</option>)}
            {missionModels.filter((m) => m.built).map((m) => <option key={"r" + m.id} value={"reset:" + m.id}>Reset {m.name} to default</option>)}
          </select>
          <span className="hint">{ghost ? "Click to place · Tab: next connection · R: rotate · F: flip · [ ]: slide · Esc: cancel" : "Pick a part on the left · click a part to select · Del: delete · M: move · Ctrl+Z: undo"}</span>
        </div>
        <div ref={host} className="build-view" />
        {report && (
          <div className="build-report">
            {report.bodies} rigid group{report.bodies === 1 ? "" : "s"} · {report.joints} hinge{report.joints === 1 ? "" : "s"} · {report.motors} motor{report.motors === 1 ? "" : "s"}{report.gears ? ` · ${report.gears} gear mesh${report.gears === 1 ? "" : "es"}` : ""}
            {report.warnings.map((w) => <div key={w} className="warn">⚠ {w}</div>)}
          </div>
        )}
      </section>
      <aside className="inspector">
        <h3>Colour</h3>
        <div className="colors">
          {allColors.map((c) => (
            <button key={c} className={`color ${(sel?.color ?? ghost?.color ?? color) === c ? "on" : ""}`} style={{ background: hexOf(lib, c) }} title={lib.color(c).name}
              onClick={() => {
                setColor(c);
                if (ghost) setGhost({ ...ghost, color: c });
                else if (selected !== null) commit(parts.map((p, i) => (i === selected ? { ...p, color: c } : p)));
              }} />
          ))}
        </div>
        {sel && selInfo && (
          <>
            <h3>Selected part</h3>
            <div className="sel-name">{selInfo.title}</div>
            <div className="muted">{sel.file} · {(selInfo.massKg * 1000).toFixed(1)} g</div>
            {selInfo.electronics && selInfo.electronics.kind !== "hub" && (
              <label>Port
                <select value={sel.port ?? ""} onChange={(e) => commit(parts.map((p, i) => (i === selected ? { ...p, port: (e.target.value || undefined) as Port | undefined } : p)))}>
                  <option value="">auto</option>
                  {PORTS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
            )}
            <div className="sel-buttons">
              <button onClick={() => { const p = parts[selected!]; commit(parts.filter((_, i) => i !== selected)); setSelected(null); setGhost({ file: p.file, color: p.color, snapIdx: 0, angle: 0, flip: false, offset: 0, m: p.m, attached: false }); }}>Move (M)</button>
              <button onClick={() => { commit(parts.filter((_, i) => i !== selected)); setSelected(null); }}>Delete</button>
            </div>
          </>
        )}
        <h3>Model</h3>
        <div className="muted">{parts.length} parts · {(parts.reduce((s, p) => s + analyzePart(lib, p.file).massKg, 0) * 1000).toFixed(0)} g</div>
      </aside>
    </div>
  );
}
