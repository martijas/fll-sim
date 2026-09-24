// Three.js geometry for LDraw parts (cached per file + colour), in LDU / LDraw frame.
import * as THREE from "three";
import { flatten, type Library } from "@fll-sim/ldraw";

const cache = new Map<string, { mesh: THREE.BufferGeometry; edges: THREE.BufferGeometry }>();
const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.02, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 });

export function partGeometry(lib: Library, file: string, color: number) {
  const key = `${file}|${color}`;
  let g = cache.get(key);
  if (!g) {
    const { mesh } = flatten(lib, file, color, {});
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
export function partObject(lib: Library, file: string, color: number, withEdges = true): THREE.Object3D {
  const g = partGeometry(lib, file, color);
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(g.mesh, solid);
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
