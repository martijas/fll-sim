// Three.js geometry for LDraw parts (cached per file + colour), in LDU / LDraw frame.
import * as THREE from "three";
import { flatten, type Library } from "@fll-sim/ldraw";

const cache = new Map<string, { mesh: THREE.BufferGeometry; edges: THREE.BufferGeometry }>();
const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.02, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });
/** Simpler lighting for low graphics detail (no physically based shading). */
const plain = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

export function partGeometry(lib: Library, file: string, color: number, lowRes = false) {
  const key = `${file}|${color}|${lowRes ? "8" : "16"}`;
  let g = cache.get(key);
  if (!g) {
    const { mesh } = flatten(lib, file, color, { lowRes });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(mesh.positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(mesh.colors.map((c) => srgb(c / 255)), 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const edges = new THREE.BufferGeometry();
    edges.setAttribute("position", new THREE.Float32BufferAttribute(mesh.edges, 3));
    edges.setAttribute("color", new THREE.Float32BufferAttribute(mesh.edgeColors.map((c) => srgb(c / 255)), 3));
    g = { mesh: geo, edges };
    cache.set(key, g);
  }
  return g;
}

const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** A renderable part: object whose matrix maps LDU part coordinates to the parent's frame. */
/**
 * `lowDetail`: LDraw's low-resolution round primitives and simpler lighting (same shape, fewer
 * triangles), for slow graphics.
 */
export function partObject(lib: Library, file: string, color: number, withEdges = true, lowDetail = false): THREE.Object3D {
  const g = partGeometry(lib, file, color, lowDetail);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(g.mesh, lowDetail ? plain : solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (withEdges && g.edges.getAttribute("position").count) group.add(new THREE.LineSegments(g.edges, edgeMat));
  group.matrixAutoUpdate = false;
  return group;
}

/** Row-major 3x4 (as produced by the assembly package) -> THREE.Matrix4. */
export function mat4From3x4(m: ArrayLike<number>, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().set(m[0] * scale, m[1] * scale, m[2] * scale, m[3] * scale, m[4] * scale, m[5] * scale, m[6] * scale, m[7] * scale, m[8] * scale, m[9] * scale, m[10] * scale, m[11] * scale, 0, 0, 0, 1);
}

/**
 * A body's LEGO parts as a single mesh (one draw call): low-resolution round primitives, simple
 * lighting and compact vertex data. The same shapes as the separate parts, for slow graphics.
 */
export function mergedParts(lib: Library, visuals: { file: string; color: number; m: ArrayLike<number> }[], scale: number): THREE.Mesh | null {
  const geos = visuals.map((v) => ({ g: partGeometry(lib, v.file, v.color, true).mesh, m: mat4From3x4(v.m, scale) }));
  const total = geos.reduce((n, x) => n + x.g.getAttribute("position").count, 0);
  if (!total) return null;
  const pos = new Float32Array(total * 3), nor = new Int8Array(total * 3), col = new Uint8Array(total * 3);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0;
  for (const { g, m } of geos) {
    const p = g.getAttribute("position"), n = g.getAttribute("normal"), c = g.getAttribute("color");
    nm.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++, o++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor[o * 3] = Math.round(v.x * 127); nor[o * 3 + 1] = Math.round(v.y * 127); nor[o * 3 + 2] = Math.round(v.z * 127);
      col[o * 3] = Math.round(c.getX(i) * 255); col[o * 3 + 1] = Math.round(c.getY(i) * 255); col[o * 3 + 2] = Math.round(c.getZ(i) * 255);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3, true));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3, true));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, plain);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
