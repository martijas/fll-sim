import { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SceneBody, SeasonConfig, ShapeSpec, VisualSpec } from "@fll-sim/sim";
import type { Library } from "@fll-sim/ldraw";
import { mat4From3x4, partObject } from "./ldrawMesh";

export type CameraMode = "orbit" | "top" | "follow" | "free";

export interface FieldViewHandle {
  setScene(bodies: SceneBody[], ids: string[], lib?: Library | null, visuals?: Record<string, VisualSpec[]>): void;
  setTransforms(t: Float32Array): void;
  addTrail(xMm: number, yMm: number): void;
  clearTrail(): void;
  setCamera(mode: CameraMode): void;
  /** Paths of earlier runs, drawn dashed in their colours with an arrow at the end. */
  setGhosts(ghosts: { id: string; color: string; pts: { xMm: number; yMm: number; headingDeg: number }[] }[]): void;
}

/** Graphics detail: auto = low on software rendering (no usable GPU), else high. */
export type GraphicsQuality = "auto" | "high" | "medium" | "low";

interface Props {
  season: SeasonConfig;
  matCanvas: HTMLCanvasElement | null;
  quality?: GraphicsQuality;
  /** the graphics driver and the detail used (auto resolved) */
  onGraphics?(info: { renderer: string; software: boolean; quality: Exclude<GraphicsQuality, "auto"> }): void;
}

/** The WebGL2 driver, found with a throwaway context ("" if there is none). */
function probeGl(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return r;
  } catch {
    return "";
  }
}
export const isSoftwareGl = (r: string) => /swiftshader|llvmpipe|softpipe|software|basic render/i.test(r);

const mm = (v: number) => v / 1000;

function labelSprite(text: string): THREE.Sprite {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = "600 28px system-ui, sans-serif";
  const w = Math.ceil(ctx.measureText(text).width) + 20;
  c.width = w;
  c.height = 40;
  ctx.font = "600 28px system-ui, sans-serif";
  ctx.fillStyle = "rgba(20,22,28,0.78)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, 40, 8);
  ctx.fill();
  ctx.fillStyle = "#ffcf00";
  ctx.fillText(text, 10, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set((w / 40) * 0.028, 0.028, 1);
  sp.renderOrder = 10;
  return sp;
}

const mergedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });

/** All of a body's shapes as one mesh (one draw call; coarser round shapes): for low detail. */
function mergedShapes(shapes: ShapeSpec[]): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  for (const s of shapes) {
    let g: THREE.BufferGeometry;
    if (s.kind === "box") g = new THREE.BoxGeometry(mm(s.sizeMm.x), mm(s.sizeMm.y), mm(s.sizeMm.z));
    else if (s.kind === "cylinder") {
      g = new THREE.CylinderGeometry(mm(s.radiusMm), mm(s.radiusMm), mm(s.lengthMm), 12);
      if (s.axis === "x") g.rotateZ(Math.PI / 2);
      else if (s.axis === "z") g.rotateX(Math.PI / 2);
    } else if (s.kind === "sphere") g = new THREE.SphereGeometry(mm(s.radiusMm), 12, 8);
    else continue;
    if (s.kind === "box" && s.rot) g.applyQuaternion(new THREE.Quaternion(s.rot.x, s.rot.y, s.rot.z, s.rot.w));
    g.translate(mm(s.posMm.x), mm(s.posMm.y), mm(s.posMm.z));
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute("uv");
    const c = new THREE.Color(s.color); // (linear, as the material expects)
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  if (!geos.length) return null;
  const merged = mergeGeometries(geos);
  for (const g of geos) g.dispose();
  const m = new THREE.Mesh(merged, mergedMat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function shapeMesh(s: ShapeSpec): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: s.material === "steel" ? 0.8 : 0.05 });
  let geo: THREE.BufferGeometry;
  switch (s.kind) {
    case "box":
      geo = new THREE.BoxGeometry(mm(s.sizeMm.x), mm(s.sizeMm.y), mm(s.sizeMm.z));
      break;
    case "cylinder":
      geo = new THREE.CylinderGeometry(mm(s.radiusMm), mm(s.radiusMm), mm(s.lengthMm), 32);
      break;
    case "sphere":
      geo = new THREE.SphereGeometry(mm(s.radiusMm), 24, 16);
      break;
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(mm(s.posMm.x), mm(s.posMm.y), mm(s.posMm.z));
  if (s.kind === "cylinder") {
    if (s.axis === "x") mesh.rotation.z = Math.PI / 2;
    else if (s.axis === "z") mesh.rotation.x = Math.PI / 2;
  }
  if (s.kind === "box" && s.rot) mesh.quaternion.set(s.rot.x, s.rot.y, s.rot.z, s.rot.w);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** The graphics driver behind a WebGL renderer (e.g. "SwiftShader" = software, slow). */
export function glRenderer(r: THREE.WebGLRenderer): string {
  const gl = r.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

export const FieldView = forwardRef<FieldViewHandle, Props>(function FieldView({ season, matCanvas, quality = "auto", onGraphics }, ref) {
  const gpu = useMemo(() => probeGl(), []);
  // Auto: start from a guess (low on software rendering), then measure the real field once and
  // step down while frames are slow; remembered per graphics driver.
  const [autoQ, setAutoQ] = useState<Exclude<GraphicsQuality, "auto">>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("fllsim.autoGraphics") ?? "null") as { gpu: string; q: Exclude<GraphicsQuality, "auto"> } | null;
      if (saved?.gpu === gpu) return saved.q;
    } catch {
      /* ignore */
    }
    return isSoftwareGl(gpu) ? "low" : "high";
  });
  const measured = useRef(false);
  const q: Exclude<GraphicsQuality, "auto"> = quality === "auto" ? autoQ : quality;
  const qRef = useRef(q);
  qRef.current = q;
  useEffect(() => onGraphics?.({ renderer: gpu, software: isSoftwareGl(gpu), quality: q }), [gpu, q, onGraphics]);
  /** the last scene, to build it again when the detail changes */
  const lastScene = useRef<Parameters<FieldViewHandle["setScene"]> | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const st = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    bodies: THREE.Group[];
    dynamic: THREE.Group;
    trail: THREE.Line;
    trailPts: number[];
    ghosts: THREE.Group;
    mode: CameraMode;
    matMesh: THREE.Mesh;
    /** free camera (first-person): where it looks, radians */
    look: { yaw: number; pitch: number };
    /** follow camera distance factor (Ctrl + / −) */
    followScale: number;
    sun: THREE.DirectionalLight;
    /** something changed: draw a new frame (frames are drawn only when needed) */
    dirty: boolean;
    lastCam: THREE.Matrix4;
  } | null>(null);
  /** keys held down while the field view has focus (free camera) */
  const keys = useRef(new Set<string>());

  const W = mm(season.table.interiorMm.w), H = mm(season.table.interiorMm.h);
  const matOffX = mm((season.table.interiorMm.w - season.mat.sizeMm.w) / 2);
  const toWorld = (xMm: number, yMm: number) => new THREE.Vector3(matOffX + mm(xMm), 0.002, -mm(yMm));

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: qRef.current === "high" });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

    // (for measuring: draw calls and triangles of the last frame)
    Object.assign(window, {
      __fieldInfo: () => ({ ...renderer.info.render, gl: glRenderer(renderer) }),
      // ms per rendered frame (waits for the GPU each time)
      __fieldBench: (n = 5) => {
        const gl = renderer.getContext(), px = new Uint8Array(4);
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          renderer.render(scene, camera);
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        }
        return (performance.now() - t0) / n;
      },
    });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b1e24");
    const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 50);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(W / 2, 0, -H / 2);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight("#ffffff", "#444444", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.6);
    sun.position.set(W / 2 - 0.6, 2.5, 0.8);
    sun.target.position.set(W / 2, 0, -H / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5, near: 0.5, far: 5 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    // Table surface (plywood) extending under the walls.
    const sw = mm(season.table.surfaceMm.w), sh = mm(season.table.surfaceMm.h);
    const table = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.019, sh), new THREE.MeshStandardMaterial({ color: "#c9a574", roughness: 0.9 }));
    table.position.set(W / 2, -0.0095, -H / 2);
    table.receiveShadow = true;
    scene.add(table);

    // Mat, printed to scale.
    const mw = mm(season.mat.sizeMm.w), mh = mm(season.mat.sizeMm.h);
    const matMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 });
    const matMesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), matMat);
    matMesh.rotation.x = -Math.PI / 2;
    matMesh.position.set(matOffX + mw / 2, 0.0006, -mh / 2);
    matMesh.receiveShadow = true;
    scene.add(matMesh);

    // Launch-area outlines (also printed on the mat; drawn for placeholder mats).
    for (const la of season.launchAreas) {
      const pts: THREE.Vector3[] = [];
      const start = la.centerMm.x === 0 ? 0 : Math.PI / 2;
      for (let i = 0; i <= 48; i++) {
        const a = start + (i / 48) * (Math.PI / 2);
        pts.push(toWorld(la.centerMm.x + Math.cos(a) * la.radiusMm, la.centerMm.y + Math.sin(a) * la.radiusMm));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: la.color === "red" ? "#e0302a" : "#2a6be0" }));
      scene.add(line);
    }

    const dynamic = new THREE.Group();
    scene.add(dynamic);
    const trail = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: "#ff8a00" }));
    trail.frustumCulled = false;
    scene.add(trail);

    const ghosts = new THREE.Group();
    scene.add(ghosts);

    st.current = { renderer, scene, camera, controls, bodies: [], dynamic, trail, trailPts: [], ghosts, mode: "orbit", matMesh, look: { yaw: 0, pitch: 0 }, followScale: 1, sun, dirty: true, lastCam: new THREE.Matrix4() };
    setCam("orbit");

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      if (st.current) st.current.dirty = true;
    });
    ro.observe(el);

    let raf = 0;
    let last = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = st.current!;
      const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (s.mode === "free") {
        // first person: the camera is the player. WASD moves where it looks, Q/E down/up, Shift faster
        const k = keys.current;
        camera.rotation.set(s.look.pitch, s.look.yaw, 0, "YXZ");
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
        const move = new THREE.Vector3();
        if (k.has("w")) move.add(fwd);
        if (k.has("s")) move.sub(fwd);
        if (k.has("d")) move.add(right);
        if (k.has("a")) move.sub(right);
        if (k.has("e") || k.has(" ")) move.y += 1;
        if (k.has("q")) move.y -= 1;
        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(0.6 * (k.has("shift") ? 3 : 1) * dt);
          camera.position.add(move);
          camera.position.y = Math.max(0.01, camera.position.y); // not through the table
        }
      }
      if (s.mode === "follow" && s.bodies.length) {
        const robot = s.bodies.find((b) => b.userData.kind === "robot");
        if (robot) {
          const target = robot.position.clone();
          const back = new THREE.Vector3(0, 0.35, 0.45).applyQuaternion(robot.quaternion);
          back.y = 0.35;
          back.multiplyScalar(s.followScale);
          camera.position.lerp(target.clone().add(back), 0.1);
          controls.target.lerp(target, 0.2);
        }
      }
      if (s.mode !== "free") controls.update();
      // draw only when something changed (the scene or the camera): an idle field costs nothing,
      // which keeps the rest of the app quick on slow graphics
      camera.updateMatrixWorld();
      if (!s.dirty && s.lastCam.equals(camera.matrixWorld)) return;
      s.lastCam.copy(camera.matrixWorld);
      s.dirty = false;
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const m = s.matMesh.material as THREE.MeshStandardMaterial;
    if (matCanvas) {
      const tex = new THREE.CanvasTexture(matCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = s.renderer.capabilities.getMaxAnisotropy();
      m.map = tex;
    } else m.map = null;
    m.needsUpdate = true;
    s.dirty = true;
  }, [matCanvas]);

  // graphics detail: shadows and outlines (high), resolution, and LEGO parts or simple shapes
  // for the mission models (low)
  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const high = q === "high";
    s.renderer.shadowMap.enabled = high;
    s.sun.castShadow = high;
    s.renderer.setPixelRatio(q === "high" ? window.devicePixelRatio : Math.min(window.devicePixelRatio, 1) * (q === "low" ? 0.75 : 1));
    const el = host.current!;
    s.renderer.setSize(el.clientWidth, el.clientHeight);
    s.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) x.needsUpdate = true;
    });
    if (lastScene.current) build(...lastScene.current);
    s.dirty = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setCam(mode: CameraMode) {
    const s = st.current!;
    s.mode = mode;
    const c = new THREE.Vector3(W / 2, 0, -H / 2);
    if (mode === "top") {
      s.camera.position.set(c.x, 2.9, c.z + 0.001);
      s.controls.target.copy(c);
    } else if (mode === "orbit") {
      s.camera.position.set(c.x, 1.5, c.z + 1.9);
      s.controls.target.copy(c);
    }
    if (mode === "free") {
      // start from the current view, looking the same way
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(s.camera.quaternion);
      s.look = { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y))) };
    } else {
      // leaving the free camera: back to the normal lens, mouse released
      if (document.pointerLockElement) document.exitPointerLock();
      s.camera.fov = 40;
      s.camera.updateProjectionMatrix();
    }
    s.controls.enabled = mode !== "free";
    host.current?.focus();
  }

  /** Ctrl + / Ctrl −: zoom (the free camera's lens; the others move closer / further). */
  function zoom(dir: number) {
    zoomBy(dir > 0 ? 0.8 : 1.25);
  }
  /** Zoom by a factor (< 1 = closer / narrower lens). */
  function zoomBy(f: number) {
    const s = st.current;
    if (!s) return;
    if (s.mode === "free") {
      s.camera.fov = Math.min(90, Math.max(5, s.camera.fov * f));
      s.camera.updateProjectionMatrix();
      return;
    }
    if (s.mode === "follow") {
      s.followScale = Math.min(6, Math.max(0.2, s.followScale * f));
      return;
    }
    const off = new THREE.Vector3().subVectors(s.camera.position, s.controls.target);
    const len = Math.min(8, Math.max(0.04, off.length() * f));
    s.camera.position.copy(s.controls.target).add(off.setLength(len));
  }
  useEffect(() => window.fllsim.onCameraZoom(zoom), []);

  // keyboard for the free camera: only while the field view has focus (click it), so typing in
  // the editors is never taken
  useEffect(() => {
    const el = host.current!;
    const name = (e: KeyboardEvent) => (e.key === "Shift" ? "shift" : e.key.toLowerCase());
    const down = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const k = name(e);
      if (!["w", "a", "s", "d", "q", "e", " ", "shift"].includes(k)) return;
      e.preventDefault();
      keys.current.add(k);
      // flying from another camera switches to the free camera
      const s = st.current;
      if (s && k !== "shift" && s.mode !== "free") setCam("free");
    };
    const up = (e: KeyboardEvent) => keys.current.delete(name(e));
    // free camera: drag to look around
    let drag: { x: number; y: number } | null = null;
    const turn = (dx: number, dy: number) => {
      const s = st.current!;
      const k = 0.0025 * (s.camera.fov / 40); // slower when zoomed in
      s.look.yaw -= dx * k;
      s.look.pitch = Math.max(-1.55, Math.min(1.55, s.look.pitch - dy * k));
    };
    const pdown = (e: PointerEvent) => {
      if (st.current?.mode !== "free" || e.button !== 0) return;
      // like a game: clicking captures the mouse and it turns the view (Esc lets go)
      if (document.pointerLockElement !== el) el.requestPointerLock?.()?.catch?.(() => {});
      drag = { x: e.clientX, y: e.clientY };
    };
    const pmove = (e: PointerEvent) => {
      if (st.current?.mode !== "free") return;
      if (document.pointerLockElement === el) turn(e.movementX, e.movementY);
      else if (drag && e.buttons & 1) {
        turn(e.clientX - drag.x, e.clientY - drag.y);
        drag = { x: e.clientX, y: e.clientY };
      }
    };
    const pup = () => (drag = null);
    // Trackpad: two-finger pinch zooms (Chromium sends it as a wheel event with Ctrl held), two
    // fingers moving turn the view. A mouse wheel (whole notches, up/down only) still zooms.
    const wheel = (e: WheelEvent) => {
      const s = st.current;
      if (!s) return;
      e.preventDefault();
      e.stopPropagation(); // (not OrbitControls' own wheel zoom)
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const dx = e.deltaX * px, dy = e.deltaY * px;
      const mouseWheel = !e.ctrlKey && (e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 50 && Number.isInteger(dy)));
      if (e.ctrlKey || mouseWheel) {
        zoomBy(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.002)));
        return;
      }
      if (s.mode === "free") turn(dx, dy);
      else {
        // orbit around what the camera looks at
        if (s.mode === "follow" || s.mode === "top") s.mode = "orbit";
        const off = new THREE.Vector3().subVectors(s.camera.position, s.controls.target);
        const sph = new THREE.Spherical().setFromVector3(off);
        sph.theta += dx * 0.005;
        sph.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, sph.phi + dy * 0.005));
        s.camera.position.copy(s.controls.target).add(new THREE.Vector3().setFromSpherical(sph));
        s.camera.lookAt(s.controls.target);
      }
    };
    el.addEventListener("wheel", wheel, { passive: false, capture: true });
    el.addEventListener("pointerdown", pdown);
    el.addEventListener("pointermove", pmove);
    el.addEventListener("pointerup", pup);
    const blur = () => {
      keys.current.clear();
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
    const focus = () => el.focus();
    el.addEventListener("keydown", down);
    el.addEventListener("keyup", up);
    el.addEventListener("blur", blur);
    el.addEventListener("pointerdown", focus);
    return () => {
      el.removeEventListener("keydown", down);
      el.removeEventListener("keyup", up);
      el.removeEventListener("blur", blur);
      el.removeEventListener("pointerdown", focus);
      el.removeEventListener("pointerdown", pdown);
      el.removeEventListener("pointermove", pmove);
      el.removeEventListener("pointerup", pup);
      el.removeEventListener("wheel", wheel, { capture: true });
    };
  }, []);

  /** Build the scene's bodies: LEGO parts (outlined at high detail), or simple shapes for the mission models at low detail. */
  function build(bodies: SceneBody[], ids: string[], lib?: Library | null, visuals?: Record<string, VisualSpec[]>) {
    const s = st.current!;
    s.dynamic.clear();
    s.bodies = ids.map((id) => {
      const g = new THREE.Group();
      const spec = bodies.find((b) => b.id === id);
      g.userData.kind = spec?.kind ?? "field";
      g.userData.id = id;
      const vis = visuals?.[id];
      const lego = lib && vis?.length && (qRef.current !== "low" || spec?.kind === "robot");
      if (lego) {
        for (const v of vis!) {
          const o = partObject(lib!, v.file, v.color, qRef.current === "high");
          o.matrix.copy(mat4From3x4(v.m, 0.001));
          g.add(o);
        }
      } else if (spec && !spec.translucent && qRef.current !== "high") {
        const m = mergedShapes(spec.shapes);
        if (m) g.add(m);
      } else spec?.shapes.forEach((sh) => {
        const mesh = shapeMesh(sh);
        if (spec.translucent) {
          const m = mesh.material as THREE.MeshStandardMaterial;
          m.transparent = true;
          m.opacity = 0.55;
          mesh.castShadow = false;
        }
        g.add(mesh);
      });
      if (spec?.label) {
        const top = Math.max(...spec.shapes.map((sh) => sh.posMm.y + (sh.kind === "box" ? sh.sizeMm.y / 2 : sh.kind === "cylinder" ? sh.lengthMm / 2 : sh.radiusMm)));
        const sp = labelSprite(spec.label);
        sp.position.set(0, mm(top) + 0.03, 0);
        g.add(sp);
      }
      s.dynamic.add(g);
      return g;
    });
    // (rebuilt for another detail level: put the bodies back where they are)
    if (lastT.current && lastT.current.length === s.bodies.length * 7) applyT(lastT.current);
    s.dirty = true;
    // Auto detail: once the whole field is there, time a few frames
    if (quality === "auto" && !measured.current && lib && ids.length > 100) {
      measured.current = true;
      setTimeout(measureAuto, 800);
    }
  }
  function measureAuto() {
    const s = st.current;
    if (!s) return;
    const bench = () => {
      const gl = s.renderer.getContext(), px = new Uint8Array(4);
      s.renderer.render(s.scene, s.camera);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < 2; i++) {
        s.renderer.render(s.scene, s.camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      return (performance.now() - t0) / 2;
    };
    const ms = bench();
    const cur = autoQ;
    const next = ms > 45 && cur === "high" ? "medium" : ms > 45 && cur === "medium" ? "low" : null; // (under ~22 fps: less detail)
    console.log(`[graphics] ${gpu}: ${ms.toFixed(0)} ms per frame at ${cur}${next ? ` -> ${next}` : ""}`);
    try {
      localStorage.setItem("fllsim.autoGraphics", JSON.stringify({ gpu, q: next ?? cur }));
    } catch {
      /* ignore */
    }
    if (next) {
      measured.current = false; // measure again at the new level
      setAutoQ(next);
    }
  }
  const lastT = useRef<Float32Array | null>(null);
  function applyT(t: Float32Array) {
    const s = st.current!;
    s.bodies.forEach((g, i) => {
      g.position.set(t[i * 7], t[i * 7 + 1], t[i * 7 + 2]);
      g.quaternion.set(t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5], t[i * 7 + 6]);
    });
  }

  useImperativeHandle(ref, () => ({
    setScene: (...args) => {
      lastScene.current = args;
      build(...args);
    },
    setTransforms(t) {
      lastT.current = t;
      applyT(t);
      st.current!.dirty = true;
    },
    addTrail(xMm, yMm) {
      const s = st.current!;
      const p = toWorld(xMm, yMm);
      const n = s.trailPts.length;
      if (n >= 3 && Math.hypot(s.trailPts[n - 3] - p.x, s.trailPts[n - 1] - p.z) < 0.003) return;
      s.trailPts.push(p.x, p.y, p.z);
      s.trail.geometry.dispose();
      s.trail.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(s.trailPts, 3));
      s.dirty = true;
    },
    clearTrail() {
      const s = st.current!;
      s.trailPts = [];
      s.trail.geometry.dispose();
      s.trail.geometry = new THREE.BufferGeometry();
      s.dirty = true;
    },
    setCamera: setCam,
    setGhosts(list) {
      const s = st.current!;
      s.dirty = true;
      for (const c of [...s.ghosts.children]) {
        s.ghosts.remove(c);
        c.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          (m.material as THREE.Material | undefined)?.dispose();
        });
      }
      for (const g of list) {
        if (g.pts.length < 2) continue;
        const pts = g.pts.map((p) => toWorld(p.xMm, p.yMm).setY(0.0025));
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: g.color, dashSize: 0.012, gapSize: 0.008 }));
        line.computeLineDistances();
        line.frustumCulled = false;
        s.ghosts.add(line);
        // where (and which way) the robot ended up
        const end = g.pts[g.pts.length - 1];
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 3), new THREE.MeshBasicMaterial({ color: g.color }));
        arrow.position.copy(toWorld(end.xMm, end.yMm).setY(0.004));
        arrow.rotation.set(-Math.PI / 2, 0, 0); // cone tip along -z = heading 0 (mat north)
        arrow.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), (end.headingDeg * Math.PI) / 180);
        s.ghosts.add(arrow);
      }
    },
  }));

  return <div ref={host} className="field-view" tabIndex={0} />;
});
