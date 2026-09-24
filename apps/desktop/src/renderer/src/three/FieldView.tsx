import { useEffect, useImperativeHandle, useRef, forwardRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { SceneBody, SeasonConfig, ShapeSpec, VisualSpec } from "@fll-sim/sim";
import type { Library } from "@fll-sim/ldraw";
import { mat4From3x4, partObject } from "./ldrawMesh";

export type CameraMode = "orbit" | "top" | "follow";

export interface FieldViewHandle {
  setScene(bodies: SceneBody[], ids: string[], lib?: Library | null, visuals?: Record<string, VisualSpec[]>): void;
  setTransforms(t: Float32Array): void;
  addTrail(xMm: number, yMm: number): void;
  clearTrail(): void;
  setCamera(mode: CameraMode): void;
}

interface Props {
  season: SeasonConfig;
  matCanvas: HTMLCanvasElement | null;
}

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

export const FieldView = forwardRef<FieldViewHandle, Props>(function FieldView({ season, matCanvas }, ref) {
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
    mode: CameraMode;
    matMesh: THREE.Mesh;
  } | null>(null);

  const W = mm(season.table.interiorMm.w), H = mm(season.table.interiorMm.h);
  const matOffX = mm((season.table.interiorMm.w - season.mat.sizeMm.w) / 2);
  const toWorld = (xMm: number, yMm: number) => new THREE.Vector3(matOffX + mm(xMm), 0.002, -mm(yMm));

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);

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

    st.current = { renderer, scene, camera, controls, bodies: [], dynamic, trail, trailPts: [], mode: "orbit", matMesh };
    setCam("orbit");

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = st.current!;
      if (s.mode === "follow" && s.bodies.length) {
        const robot = s.bodies.find((b) => b.userData.kind === "robot");
        if (robot) {
          const target = robot.position.clone();
          const back = new THREE.Vector3(0, 0.35, 0.45).applyQuaternion(robot.quaternion);
          back.y = 0.35;
          camera.position.lerp(target.clone().add(back), 0.1);
          controls.target.lerp(target, 0.2);
        }
      }
      controls.update();
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
  }, [matCanvas]);

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
  }

  useImperativeHandle(ref, () => ({
    setScene(bodies, ids, lib, visuals) {
      const s = st.current!;
      s.dynamic.clear();
      s.bodies = ids.map((id) => {
        const g = new THREE.Group();
        const spec = bodies.find((b) => b.id === id);
        g.userData.kind = spec?.kind ?? "field";
        g.userData.id = id;
        const vis = visuals?.[id];
        if (lib && vis?.length) {
          for (const v of vis) {
            const o = partObject(lib, v.file, v.color);
            o.matrix.copy(mat4From3x4(v.m, 0.001));
            g.add(o);
          }
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
    },
    setTransforms(t) {
      const s = st.current!;
      s.bodies.forEach((g, i) => {
        g.position.set(t[i * 7], t[i * 7 + 1], t[i * 7 + 2]);
        g.quaternion.set(t[i * 7 + 3], t[i * 7 + 4], t[i * 7 + 5], t[i * 7 + 6]);
      });
    },
    addTrail(xMm, yMm) {
      const s = st.current!;
      const p = toWorld(xMm, yMm);
      const n = s.trailPts.length;
      if (n >= 3 && Math.hypot(s.trailPts[n - 3] - p.x, s.trailPts[n - 1] - p.z) < 0.003) return;
      s.trailPts.push(p.x, p.y, p.z);
      s.trail.geometry.dispose();
      s.trail.geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(s.trailPts, 3));
    },
    clearTrail() {
      const s = st.current!;
      s.trailPts = [];
      s.trail.geometry.dispose();
      s.trail.geometry = new THREE.BufferGeometry();
    },
    setCamera: setCam,
  }));

  return <div ref={host} className="field-view" />;
});
