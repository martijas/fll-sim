// Mission 04 Lucky Leaves (bag 6 + three 21L flexible hoses from bag 0), scripted from the official
// building instructions (text-based book text-bi-04 + picture book book-04).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
//
// The nest is three "base leaves" (4x6 plates with grey walls) joined at 45 degrees by A-shaped
// plates (15706). Each base leaf is built in its own "leaf frame": 4x6 plate running front-back,
// top at y = 0, its 2x4 extension (1x2 brick + dark grey plates) at leaf -x, which is the leaf's
// front in the finished model. On top of each base leaf, a tile frame leaves a 2x4 recess.
// Three loose game pieces sit in the recesses: two leaves (step 11) and the katydid (step 12, a leaf
// with two black T-piece legs). Each carries a click-hinged handle plate with a hose loop.
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { Build, orient, pt, dir, type SnapInfo } from "../src/build";
import { findConnectionsForParts } from "@fll-sim/assembly/fit";

const LBG = 71, DBG = 72, GREEN = 2, BGREEN = 10, BROWN = 70, BLACK = 0, NOUGAT = 84;
const PLATE46 = "3032.dat", PLATE24 = "3020.dat", PLATE16 = "3666.dat", PLATE12 = "3023b.dat", PLATE14 = "3710.dat";
const BRICK12 = "3004.dat", BRICK16 = "3009.dat", APLATE = "15706.dat", TILE14 = "2431.dat";
const LEAF = "57906.dat", RND14 = "77845.dat", RND12 = "35480.dat", JUMP24 = "65509.dat", JUMP22 = "87580.dat";
const CLICK = "44567b.dat", HANDLE = "2540.dat", TPIECE = "4697b.dat";

type V3 = [number, number, number];
const VERT = orient("+z", "+y", "-x"); // plate/brick long axis front-back

/** Rigid inverse. */
function inv(m: Mat4): Mat4 {
  const r = new Float64Array(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 4 + j] = m[j * 4 + i];
  for (let i = 0; i < 3; i++) r[i * 4 + 3] = -(r[i * 4] * m[3] + r[i * 4 + 1] * m[7] + r[i * 4 + 2] * m[11]);
  return r;
}
const withT = (r: Mat4, t: V3): Mat4 => {
  const m = new Float64Array(r);
  m[3] = t[0]; m[7] = t[1]; m[11] = t[2];
  return m;
};
const close = (m: Mat4, o: V3, tol = 1) => Math.hypot(m[3] - o[0], m[7] - o[1], m[11] - o[2]) < tol;
const along = (m: Mat4, axis: V3) => Math.abs(Math.abs(dir(m, [1, 0, 0])[0] * axis[0] + dir(m, [1, 0, 0])[1] * axis[1] + dir(m, [1, 0, 0])[2] * axis[2]) - 1) < 1e-3;

/**
 * Attach a stud-connected part whose origin (top-surface centre) must end at `o` (leaf frame given
 * by `F`, identity for the frame the build was started in), with its long (local x) axis along
 * `axis` in that frame. Real stud connections are required (`min`).
 */
function put(b: Build, file: string, color: number, to: number | number[], o: V3, axis: V3, min: number, label: string, F?: Mat4, maxOverlap?: number) {
  const Fi = F ? inv(F) : undefined;
  const local = (m: Mat4) => (Fi ? mul(Fi, m) : m);
  try {
  return b.attach(file, color, {
    to,
    offsets: [0],
    accept: (m) => {
      const l = local(m);
      return close(l, o) && along(l, axis) && dir(l, [0, 1, 0])[1] > 0.99;
    },
    // the checker counts stud connections per 40-LDU cell, so `min` is only checked for >= 1 (position is pinned by `accept`)
    minConnections: Math.min(min, 1),
    maxOverlap: maxOverlap ?? 6, // position is pinned; voxel boxes of touching parts overlap a little
    label,
  });
  } catch (e) {
    const z: V3 = [axis[1] * 0 - axis[2] * 1, axis[2] * 0 - axis[0] * 0, axis[0] * 1 - axis[1] * 0];
    const R = new Float64Array([axis[0], 0, z[0], o[0], axis[1], 1, z[1], o[1], axis[2], 0, z[2], o[2]]);
    const m = F ? mul(F, R) : R;
    const placed = b.parts.map((p) => ({ file: p.file, m: p.m }));
    console.log(`  expected placement of ${label}:`, findConnectionsForParts(b.lib, placed, { file, m }));
    for (const [k, p] of placed.entries()) { const r = findConnectionsForParts(b.lib, [p], { file, m }); if (r.overlap > 0.1) console.log(`    overlaps #${k} ${b.parts[k].label}: ${r.overlap.toFixed(1)}`); }
    throw e;
  }
}

/** Steps 1-4: the leftmost base leaf (built in the main build; its frame = identity). */
function leftLeaf(b: Build) {
  const p = b.place(PLATE46, GREEN, VERT, "left leaf 4x6 plate");
  put(b, BRICK12, LBG, p, [30, -24, 0], [0, 0, 1], 2, "1x2 brick right");
  b.step();
  const br = put(b, BRICK16, LBG, p, [-20, -24, 30], [1, 0, 0], 4, "1x6 brick back");
  b.step();
  const p24 = put(b, PLATE24, GREEN, br, [-60, 0, 0], [0, 0, 1], 2, "2x4 plate under overhang");
  put(b, BRICK12, LBG, p24, [-70, -24, 0], [0, 0, 1], 2, "1x2 brick left");
  b.step();
  const p16 = put(b, PLATE16, LBG, [p, p24], [-20, -8, -30], [1, 0, 0], 6, "1x6 plate front");
  put(b, PLATE12, DBG, p16, [-60, -16, -30], [1, 0, 0], 2, "dark grey 1x2 plate");
  b.step();
  return p;
}

/** Steps 5.1-5.5 / 6.1-6.5: middle and right base leaves (own frames, 4x6 at the origin). */
function sideBuild(lib: Library, right: boolean) {
  const s = new Build(lib, right ? "right leaf" : "middle leaf");
  const p = s.place(PLATE46, GREEN, VERT, `${s.name} 4x6 plate`);
  // A-shaped plate, point of the A to the right, front 1x4 on the back row of the 4x6
  const a = put(s, APLATE, LBG, p, [40, -8, 60], [1, 0, 0], 4, "A-shaped plate");
  const back = put(s, PLATE16, LBG, [p, a], [-20, -8, 30], [1, 0, 0], 4, "1x6 plate (back)");
  const p24 = put(s, PLATE24, GREEN, back, [-60, 0, 0], [0, 0, 1], 2, "2x4 plate under overhang");
  if (!right) {
    put(s, BRICK12, LBG, p24, [-70, -24, 0], [0, 0, 1], 2, "1x2 brick left");
    put(s, BRICK12, LBG, p, [30, -24, 0], [0, 0, 1], 2, "1x2 brick right");
    const front = put(s, PLATE16, LBG, [p, p24], [-20, -8, -30], [1, 0, 0], 6, "1x6 plate (front)");
    put(s, PLATE12, DBG, back, [-60, -16, 30], [1, 0, 0], 2, "dark grey 1x2 plate");
    put(s, PLATE12, DBG, front, [-60, -16, -30], [1, 0, 0], 2, "dark grey 1x2 plate");
  } else {
    put(s, PLATE12, DBG, back, [-60, -16, 30], [1, 0, 0], 2, "dark grey 1x2 plate");
    put(s, BRICK12, LBG, p24, [-70, -24, 0], [0, 0, 1], 2, "1x2 brick left");
    put(s, BRICK12, LBG, p, [30, -24, 0], [0, 0, 1], 2, "1x2 brick right");
    put(s, BRICK16, LBG, [p, p24], [-20, -24, -30], [1, 0, 0], 6, "1x6 brick (front)");
  }
  return { s, a };
}

/**
 * Place a sub-assembly so that the stud row `from` (two end studs, sub frame) lands on the row `to`
 * (model frame), rotating about the vertical only; of the two ways round, the one that doesn't
 * collide with the model is used. The stud connections are then checked for real.
 */
function placeGroup(b: Build, sub: Build, from: [V3, V3], to: [V3, V3], label: string): number[] {
  const mid = (r: [V3, V3]): V3 => [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[1][1]) / 2, (r[0][2] + r[1][2]) / 2];
  const ang = (r: [V3, V3]) => Math.atan2(r[1][2] - r[0][2], r[1][0] - r[0][0]);
  const placed = b.parts.map((p) => ({ file: p.file, m: p.m }));
  let best: { T: Mat4; conn: number; overlap: number } | null = null;
  for (const flip of [0, Math.PI]) {
    // rotation about y taking the direction of `from` onto `to` (LDraw rot about y: x' = x c + z s, z' = -x s + z c)
    const th = ang(from) - ang(to) + flip;
    const c = Math.cos(th), s = Math.sin(th);
    const R = new Float64Array([c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]);
    const a = pt(R, mid(from)), t = mid(to);
    const T = withT(R, [t[0] - a[0], t[1] - a[1], t[2] - a[2]]);
    let conn = 0, overlap = 0;
    for (const p of sub.parts) {
      const r = findConnectionsForParts(b.lib, placed, { file: p.file, m: mul(T, p.m) });
      conn += r.connections;
      overlap += r.overlap;
    }
    if (!best || overlap < best.overlap) best = { T, conn, overlap };
  }
  if (!best || best.conn < 1 || best.overlap > 5) throw new Error(`${label}: no clean placement (${JSON.stringify(best && { conn: best.conn, overlap: best.overlap })})`);
  return sub.parts.map((p) => b.place(p.file, p.color, mul(best!.T, p.m), p.label ?? label));
}

/** Frame of a base leaf from its placed 4x6 plate (leaf frame -> model). */
const leafFrame = (b: Build, plate: number) => mul(b.parts[plate].m, inv(VERT));

// ---- loose game pieces ------------------------------------------------------------------------
interface Piece { file: string; color: number; m: Mat4; label: string }

/**
 * Hose loop: the 21L flexible hose (2630) has no bendable geometry or snap data, so it is drawn
 * the way LDraw represents shaped flexible parts: its two end connectors (2630k01) on the handle
 * bar and bar segments (2630k02) along an upright loop in the plane of the bar.
 * `hm` = handle plate matrix (leaf-piece frame). The hose pieces have no snap data (loose parts).
 */
function hoseLoop(hm: Mat4): Piece[] {
  const out: Piece[] = [];
  const axis = dir(hm, [1, 0, 0]); // bar axis
  const up: V3 = [0, -1, 0];
  const c = pt(hm, [0, 2, -20]); // bar centre
  const P = (u: number, h: number): V3 => [c[0] + axis[0] * u + up[0] * h, c[1] + axis[1] * u + up[1] * h, c[2] + axis[2] * u + up[2] * h];
  const frameAt = (T: number[], at: V3): Mat4 => {
    // local y -> tangent, local x -> plane normal, local z = x × y
    const N = [axis[1] * up[2] - axis[2] * up[1], axis[2] * up[0] - axis[0] * up[2], axis[0] * up[1] - axis[1] * up[0]];
    const Z = [N[1] * T[2] - N[2] * T[1], N[2] * T[0] - N[0] * T[2], N[0] * T[1] - N[1] * T[0]];
    return new Float64Array([N[0], T[0], Z[0], at[0], N[1], T[1], Z[1], at[1], N[2], T[2], Z[2], at[2]]);
  };
  const tan = (du: number, dh: number) => {
    const l = Math.hypot(du, dh);
    return [(axis[0] * du + up[0] * dh) / l, (axis[1] * du + up[1] * dh) / l, (axis[2] * du + up[2] * dh) / l];
  };
  // end connectors on the front and back half of the bar, stems pointing up
  for (const u of [-5, 5]) out.push({ file: "2630k01.dat", color: NOUGAT, m: frameAt(tan(0, 1), P(u, 0)), label: "hose end (on handle bar)" });
  // teardrop loop: ellipse A x B above the stems, total hose length ~412 LDU (21L)
  const A = 45, B = 75, H0 = 20;
  const phi0 = Math.asin(5 / A);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const f = phi0 + ((2 * Math.PI - 2 * phi0) * i) / 400;
    pts.push([-A * Math.sin(f), H0 + B - B * Math.cos(f)]);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1], n = Math.round(L / 28);
  for (let k = 0; k < n; k++) {
    const s = (L * (k + 0.5)) / n;
    const i = Math.max(1, cum.findIndex((v) => v >= s));
    const [u0, h0] = pts[i - 1], [u1, h1] = pts[i];
    out.push({ file: "2630k02.dat", color: NOUGAT, m: frameAt(tan(u1 - u0, h1 - h0), P((u0 + u1) / 2, (h0 + h1) / 2)), label: "hose segment" });
  }
  return out;
}

/**
 * Steps 11 / 12: a leaf game piece in its own frame (57906 studs up, click fingers at +x).
 * Everything under the leaf is really stud/bar connected; the click hinge (leaf fingers <-> 44567b
 * finger) has no usable snap data in the tooling, so the black clip plate is placed at the hinge
 * position computed from the leaf's hinge axis (x = 130, y = 2, along z).
 */
function leafPiece(lib: Library, katydid: boolean): Piece[] {
  const s = new Build(lib, katydid ? "katydid" : "leaf");
  const leaf = s.place(LEAF, GREEN, orient("+x", "+y", "+z"), katydid ? "katydid leaf" : "leaf");
  const r14 = put(s, RND14, BROWN, leaf, [40, 8, 0], [1, 0, 0], 4, "brown 1x4 round-end plate");
  if (!katydid) {
    put(s, JUMP24, BGREEN, r14, [40, 16, 0], [1, 0, 0], 2, "2x4 jumper plate (drops into the recess)");
  } else {
    const r12 = put(s, RND12, BROWN, r14, [20, 16, 0], [1, 0, 0], 2, "brown 1x2 round-end plate");
    put(s, JUMP22, BGREEN, r14, [60, 16, 0], [1, 0, 0], 1, "2x2 jumper plate");
    for (const x of [10, 30])
      s.attach(TPIECE, BLACK, {
        to: r12,
        where: (q: SnapInfo) => Math.abs(q.pos[0] - x) < 1 && q.gender === "F",
        own: (q: SnapInfo) => q.axis[1] < -0.9, // the stem of the T
        accept: (m) => m[7] > 20,
        prefer: (m) => Math.abs(dir(m, [0, 0, 1])[2]), // legs across the leaf
        label: "T-piece leg",
      });
  }
  // click-hinge plate, upright, studs towards the leaf, finger down in the leaf's fingers
  const clipR = orient("-z", "+x", "-y");
  const hingeLocal = pt(clipR, [0, 2, -20]);
  const clip = s.place(CLICK, BLACK, withT(clipR, [130 - hingeLocal[0], 2 - hingeLocal[1], 0 - hingeLocal[2]]), "click hinge plate (clipped to the leaf fingers)");
  const h = s.attach(HANDLE, GREEN, { to: clip, offsets: [0], minConnections: 1, accept: (m) => m[3] < s.parts[clip].m[3] - 4, // on the stud side (towards the leaf)
    prefer: (m) => -pt(m, [0, 2, -20])[1], label: "1x2 plate with handle" });
  const pieces: Piece[] = s.parts.map((p) => ({ file: p.file, color: p.color, m: p.m, label: p.label ?? p.file }));
  return [...pieces, ...hoseLoop(s.parts[h].m)];
}

/**
 * Pose of a leaf piece in a base leaf's frame: the 2x4/2x2 plates under it hang in the 2x4 recess
 * (leaf-frame x -60..20, z -20..20); the leaf rests on the front tile (top y = -32, front edge x = -80)
 * and on the raised back tile (top y = -40, front edge x = 20), so it tilts slightly nose-down, as
 * the instructions note ("will not sit perfectly flat").
 */
function restPose(): Mat4 {
  const slope = 8 / 100, th = Math.atan(slope), c = Math.cos(th), s = Math.sin(th);
  const tx = -20 - 40 * c - 8 * s;
  const ty = -32 - slope * 60 + 40 * s - 8 * c;
  return new Float64Array([c, s, 0, tx, -s, c, 0, ty, 0, 0, 1, 0]);
}

export function build(lib: Library) {
  const b = new Build(lib, "M04 Lucky Leaves");

  // ---- Steps 1-4: left leaf -------------------------------------------------------------------
  const pL = leftLeaf(b);

  // ---- Step 5: middle leaf; the angled 1x4 of its A-plate goes on the left leaf's free front row
  // (a 45-degree placement: computed from the stud rows, then the stud connections are verified)
  const angledRow = (s: Build, a: number): [V3, V3] => {
    const p = s.parts[a].m;
    return [pt(p, [0, 8, 14.14]), pt(p, [-42.43, 8, 56.57])];
  };
  const mid = sideBuild(lib, false);
  const rowL: [V3, V3] = [[30, 0, -50], [-30, 0, -50]];
  const idxM = placeGroup(b, mid.s, angledRow(mid.s, mid.a), rowL, "middle leaf");
  b.step();
  const pM = idxM[0];
  const FM = leafFrame(b, pM);

  // ---- Step 6: right leaf; the angled 1x4 of its A-plate goes on the middle leaf's free front row
  const rgt = sideBuild(lib, true);
  const idxR = placeGroup(b, rgt.s, angledRow(rgt.s, rgt.a), [pt(FM, [30, 0, -50]), pt(FM, [-30, 0, -50])], "right leaf");
  b.step();
  const pR = idxR[0];
  const FL = leafFrame(b, pL), FR = leafFrame(b, pR);

  // ---- Step 7: four 2x4 plates, each with one column on an A-plate half and one on the
  // neighbouring 1x6 plate (in leaf frames: x -30..30 of the two rows at the A-plate's edge)
  const all = () => b.parts.map((_, k) => k);
  put(b, PLATE24, GREEN, all(), [0, -16, -40], [1, 0, 0], 4, "2x4 plate over left/middle A-plate (left half)", FL, 8);
  put(b, PLATE24, GREEN, all(), [0, -16, 40], [1, 0, 0], 4, "2x4 plate over left/middle A-plate (right half)", FM, 8);
  put(b, PLATE24, GREEN, all(), [0, -16, -40], [1, 0, 0], 4, "2x4 plate over middle/right A-plate (left half)", FM, 8);
  put(b, PLATE24, GREEN, all(), [0, -16, 40], [1, 0, 0], 4, "2x4 plate over middle/right A-plate (right half)", FR, 8);
  b.step();

  // ---- Step 8: 1x6 plates close the top ring of each leaf (y -24..-16), back ends even --------
  put(b, PLATE16, LBG, all(), [-20, -24, -30], [1, 0, 0], 6, "1x6 plate on left leaf", FL);
  put(b, PLATE16, LBG, all(), [-20, -24, 30], [1, 0, 0], 6, "1x6 plate on middle leaf (left)", FM);
  put(b, PLATE16, LBG, all(), [-20, -24, -30], [1, 0, 0], 6, "1x6 plate on middle leaf (right)", FM);
  put(b, PLATE16, LBG, all(), [-20, -24, 30], [1, 0, 0], 6, "1x6 plate on right leaf", FR);
  b.step();

  // ---- Steps 9-10: tile frame around a 2x4 recess on each leaf ---------------------------------
  const frames = [FL, FM, FR];
  for (const F of frames) put(b, TILE14, BGREEN, all(), [-70, -32, 0], [0, 0, 1], 4, "front tile", F);
  for (const F of frames) for (const z of [-30, 30]) put(b, TILE14, BGREEN, all(), [-20, -32, z], [1, 0, 0], 4, "side tile", F);
  const backs = frames.map((F) => put(b, PLATE14, GREEN, all(), [30, -32, 0], [0, 0, 1], 4, "back 1x4 plate", F));
  b.step();
  for (const [k, F] of frames.entries()) put(b, TILE14, BGREEN, backs[k], [30, -40, 0], [0, 0, 1], 4, "back tile", F);
  b.step();

  // ---- Steps 11-12: loose leaves (left, middle) and katydid (right) resting in the recesses ----
  const pose = restPose();
  for (const [F, katydid, name] of [[FL, false, "leaf (left)"], [FM, false, "leaf (middle)"], [FR, true, "katydid (right)"]] as const) {
    if (katydid) b.step();
    const T = mul(F, pose);
    for (const p of leafPiece(lib, katydid)) b.place(p.file, p.color, mul(T, p.m), `${name}: ${p.label}`);
  }

  return finish(b, FM);
}

/** Final pose: middle leaf pointing to the front (-Z), model centred, standing on y = 0. */
function finish(b: Build, FM: Mat4) {
  // middle leaf frame: its -x (front) -> -Z, its +z -> -X
  const R = new Float64Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
  const G = mul(R, inv(FM));
  for (const p of b.parts) p.m = mul(G, p.m);
  const bb = b.bounds();
  const shift: V3 = [-(bb.min[0] + bb.max[0]) / 2, -bb.max[1], -(bb.min[2] + bb.max[2]) / 2];
  for (const p of b.parts) p.m = withT(p.m, [p.m[3] + shift[0], p.m[7] + shift[1], p.m[11] + shift[2]]);
  return b;
}
