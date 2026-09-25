// Mission 15 Biocentric Architecture (bags 22-24 + frames from bag 0), scripted from the official
// building instructions (text-based book text-bi-13 + picture book book-13).
//
// Frame used while scripting ("B2", the orientation of steps 30-63: crank handle at the front
// left, long walls at the front and back): LDraw units, -Y up, -Z front, +X right.
// Building stud grid: 13 columns (col 0..12, x = 20*col + 10) x 12 rows (row 0 = back ..
// row 11 = front, z = 230 - 20*row). Floor top at y = 0. Steps 5-19 and 64-71 of the book are
// written for the building turned 90 degrees ("B1": B2's left wall = B1's front); they are
// converted to B2 cells here (B1 column c, row r -> B2 col 12 - r, row c).
//
// Mechanisms:
//  - Compost hatch: the crank assembly (two black quarter-circle liftarms joined by pin connectors
//    and a stack of three 3L liftarms) pivots on two white axle-pins in the tan 1x2 bricks with
//    holes at the front-left; the red crank handle turns it forward so it swings down to the mat.
//  - Garden skylight: sliding panel (6x6 black tile + red tile frame with a window) whose black
//    door-rail plates run in the grooves of two rails of 1x4 grooved bricks; it slides completely
//    in under the lime roof at the front.
//  - Nesting canopy: black 4x10 plate on two hinge-plate pairs at the back of the roof, lifted by
//    its red ball handle; it covers the bird's nest.
//  - End frames: each lime 7x11 frame carries a vertical shaft (lever on top) that turns freely.
// The dock base (steps 1-4: 15x11 frame with two upright 5x7 frames) is placed under the
// building: each end frame rests on a short side of the dock, and one 1L-liftarm foot of each end
// frame sits in the opening of the dock's upright 5x7 frame (the building is not pinned to it).
//
// Approximations / data gaps:
//  - the red "1x2 plate with pin hole on one end" (canopy, steps 64-65) is not in LDraw: 11458 (1x2
//    plate with offset peghole) is used, shifted one stud so its hole sits past the canopy's end;
//  - the pink flower bud (step 12) is not in LDraw: a bright pink rose (95829) stands in for it;
//  - hinge base 98285 (2x4 with 3 holes) is used because 43056 has no underside stud data;
//  - window glass, curved/lime slopes and the plants' stem flowers have no working snap data
//    (glued in the mission model); the skylight's door rails in the grooves are not a snap either,
//    so the skylight is a separate body resting on the walls;
//  - the canopy settles ~3 degrees open, resting on the nest's claws/egg.
import { IDENTITY, type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { Build, at, orient, rot } from "../src/build";
import { findConnectionsForParts } from "@fll-sim/assembly/fit";

type V3 = [number, number, number];

// colours
const BLACK = 0, BLUE = 1, GREEN = 2, RED = 4, DPINK = 5, YELLOW = 14, WHITE = 15, TAN = 19, LIME = 27, DTAN = 28,
  BPINK = 29, TLBLUE = 43, BROWN = 70, LBG = 71, DBG = 72, LNOUGAT = 78, BGREEN = 10, GOLD = 297, DAZURE = 321, OLIVE = 330;

const X = (c: number) => 20 * c + 10;
const Z = (r: number) => 230 - 20 * r;

const DEBUG = !!process.env.M15_DEBUG;

function withT(r: Mat4, t: V3): Mat4 {
  const m = new Float64Array(r);
  m[3] = t[0]; m[7] = t[1]; m[11] = t[2];
  return m;
}
/** Mirror a placement in the plane x = x0; `flip` = a local axis the part is symmetric about. */
function mirrorX(m: Mat4, x0: number, flip: "x" | "y" | "z"): Mat4 {
  const r = new Float64Array(m);
  // S * m: negate the first row (x components) and mirror the translation
  r[0] = -m[0]; r[1] = -m[1]; r[2] = -m[2]; r[3] = 2 * x0 - m[3];
  // * F: negate the column of the flipped local axis
  const k = flip === "x" ? 0 : flip === "y" ? 1 : 2;
  for (let i = 0; i < 3; i++) r[i * 4 + k] = -r[i * 4 + k];
  return r;
}
/** Rotation taking local +y onto unit vector d (for parts on angled plant stems). */
function yTo(d: V3): Mat4 {
  const l = Math.hypot(...d); const y: V3 = [d[0] / l, d[1] / l, d[2] / l];
  const ref: V3 = Math.abs(y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  let z: V3 = [ref[1] * y[2] - ref[2] * y[1], ref[2] * y[0] - ref[0] * y[2], ref[0] * y[1] - ref[1] * y[0]];
  const zl = Math.hypot(...z); z = [z[0] / zl, z[1] / zl, z[2] / zl];
  const x: V3 = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  return new Float64Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0]);
}
/** Rotation about the vertical so that local -z (the "pointing" side of leaves/teeth) faces (dx, dz). */
const face = (dx: number, dz: number) => rot("y", (Math.atan2(-dx, -dz) * 180) / Math.PI);
const DIR = { front: [0, -1], back: [0, 1], left: [-1, 0], right: [1, 0] } as const;
const faceDir = (...ds: (keyof typeof DIR)[]) => face(ds.reduce((s, d) => s + DIR[d][0], 0), ds.reduce((s, d) => s + DIR[d][1], 0));

class M {
  constructor(readonly b: Build) {}
  /** Place a part at an exact position and check it connects (warn only when debugging). */
  p(file: string, color: number, m: Mat4, label: string, min = 1): number {
    if (min > 0) {
      const r = findConnectionsForParts(this.b.lib, this.b.parts.map((q) => ({ file: q.file, m: q.m })), { file, m });
      if (r.connections < min && DEBUG) console.log(`  [no connection] ${label} (${file}) at ${[m[3], m[7], m[11]].map(Math.round)} overlap ${r.overlap.toFixed(1)}`);
    }
    return this.b.place(file, color, m, label);
  }
  /** Stud-grid part covering B2 cols c0..c1, rows r0..r1 with its top surface at y. */
  g(file: string, color: number, c0: number, c1: number, r0: number, r1: number, y: number, label: string, r?: Mat4, min = 1) {
    const cx = (X(c0) + X(c1)) / 2, cz = (Z(r0) + Z(r1)) / 2;
    const R = r ?? (Math.abs(c1 - c0) < Math.abs(r1 - r0) ? rot("y", 90) : IDENTITY);
    return this.p(file, color, withT(R, [cx, y, cz]), label, min);
  }
}

// ---------------------------------------------------------------------------------------------
// Steps 20-29: crank assembly, built in its own frame ("bf": pivot = the quarter circles' corner
// holes on the x axis at the origin, the bottom legs pointing to the front (-z), the upright legs
// up; right quarter circle at x 0..10, left one at x -90..-80).
function crank(lib: Library): Build {
  const c = new Build(lib, "crank");
  const m = new M(c);
  const QC = orient("-z", "+x", "-y"); // 32249: local x-leg -> front, z-leg -> up, thickness along x
  m.p("32249.dat", BLACK, withT(QC, [5, 0, 0]), "right quarter circle liftarm", 0);
  m.p("65249.dat", WHITE, at(0, 0, 0, rot("y", 180)), "white axle-pin (right pivot, pin sticking out right)");
  c.step();
  m.p("43857.dat", LBG, withT(orient("-z", "+x", "-y"), [-10, -10, 0]), "grey 2L liftarm on the pivot axle");
  m.p("32002.dat", TAN, at(0, -20, 0), "tan 3/4 pin (half pin into the quarter circle)");
  c.step();
  m.p("32073.dat", YELLOW, at(-40, -40, 0), "yellow 5L axle (top holes)");
  c.step();
  // crank handle: arm on the 5L axle, pin at the back pointing right, red connector, blue axle-pin, ball
  m.p("61408.dat", BLACK, withT(orient("-y", "+x", "+z"), [-10, -40, 0]), "crank arm (3L thin liftarm with pin)");
  m.p("62462.dat", RED, at(20, -40, 40), "red 2L pin connector (handle)");
  m.p("43093.dat", BLUE, at(40, -40, 40), "blue axle-pin (handle)");
  m.p("32474.dat", RED, withT(orient("+y", "-x", "+z"), [54, -40, 40]), "red ball (crank handle)");
  c.step();
  // step 24: tan pin - green connector - black pin - olive connector - tan pin, bottom middle holes
  m.p("32002.dat", TAN, at(0, 0, -20), "tan 3/4 pin (right, lower string)");
  m.p("62462.dat", OLIVE, at(-20, 0, -20), "olive 2L pin connector");
  m.p("61332.dat", BLACK, at(-40, 0, -20), "black pin");
  m.p("62462.dat", BGREEN, at(-60, 0, -20), "green 2L pin connector");
  m.p("32002.dat", TAN, at(-80, 0, -20, rot("y", 180)), "tan 3/4 pin (left, lower string)");
  c.step();
  // step 25: olive connector + white axle-pin + lime 1L liftarm + pink half bush, front bottom holes
  m.p("65249.dat", WHITE, at(-20, 0, -40), "white axle-pin (front string)");
  m.p("62462.dat", OLIVE, at(-50, 0, -40), "olive 2L pin connector (front string)");
  m.p("18654.dat", LIME, withT(orient("-y", "+x", "+z"), [-20, 0, -40]), "lime 1L liftarm");
  m.p("32123b.dat", DPINK, withT(orient("+z", "-y", "+x"), [-5, 0, -40]), "pink half bush");
  c.step();
  // step 26: three black 3L liftarms on a blue 3L pin, hung on the 5L axle, lying forward on top
  const L3 = orient("+y", "+x", "-z"); // holes along -z from the axle, hole axis x
  for (const x of [-30, -50, -70]) m.p("32523.dat", BLACK, withT(L3, [x, -40, -20]), "black 3L liftarm (hatch stack)");
  m.p("42924.dat", BLUE, at(-50, -40, -20), "blue 3L pin (hatch stack)");
  c.step();
  // step 27: left quarter circle with blue axle-pin + pink bush in its front bottom hole
  m.p("43093.dat", BLUE, at(-70, 0, -40, rot("y", 180)), "blue axle-pin (front string, left)");
  m.p("32123b.dat", DPINK, withT(orient("+z", "-y", "+x"), [-75, 0, -40]), "pink half bush (left)");
  m.p("32249.dat", BLACK, withT(QC, [-85, 0, 0]), "left quarter circle liftarm", 0);
  c.step();
  m.p("65249.dat", WHITE, at(-80, 0, 0), "white axle-pin (left pivot, pin sticking out left)");
  c.step();
  // step 29: tan 1x2 bricks with two holes on the pivot pins (back hole on the pin)
  m.p("32000.dat", TAN, at(-100, -10, -10, rot("y", 90)), "tan 1x2 brick with holes (left pivot)");
  m.p("32000.dat", TAN, at(20, -10, -10, rot("y", 90)), "tan 1x2 brick with holes (right pivot)");
  return c;
}

// Steps 42-48: sliding skylight, built in its own frame "S" (rails along x, black tile at -x).
function slider(lib: Library): Build {
  const s = new Build(lib, "skylight");
  const m = new M(s);
  const V = rot("y", 90);
  m.p("3710.dat", TAN, at(0, 8, 0, V), "tan 1x4 plate", 0);
  m.p("3666.dat", RED, at(0, 0, 0, V), "red 1x6 plate");
  s.step();
  for (const z of [-50, 50]) m.p("4477.dat", DBG, at(-90, 8, z), "dark grey 1x10 plate");
  s.step();
  for (const z of [-50, 50]) {
    const R = z < 0 ? IDENTITY : rot("y", 180); // door rail facing outwards
    m.p("32028.dat", BLACK, at(-30, 0, z, R), "black 1x2 plate with door rail");
    m.p("4510.dat", BLACK, at(-130, 0, z, R), "black 1x8 plate with door rail");
  }
  s.step();
  m.p("3666.dat", TAN, at(-200, 8, 0, V), "tan 1x6 plate (under the rail ends)");
  m.p("3023b.dat", DTAN, at(-200, 0, 0, V), "dark tan 1x2 plate");
  s.step();
  m.p("2431.dat", RED, at(0, -8, 0, V), "red 1x4 tile");
  for (const z of [-50, 50]) m.p("6636.dat", RED, at(-50, -8, z), "red 1x6 tile");
  m.p("10202.dat", BLACK, at(-170, -8, 0), "black 6x6 tile (skylight cover)");
  s.step();
  m.p("3001.dat", BLACK, at(-130, 0, 0, V), "black 2x4 brick (under the cover)");
  return s;
}

// Steps 64-70: nesting canopy, in B2 coordinates (closed, before tilting onto the nest).
function canopy(b: Build, m: M): number[] {
  const first = b.parts.length;
  const V = rot("y", 90);
  // hinges: base plates on the roof (B2 cols 0-1 and 2-3, rows 0-3), knuckles at the back edge
  for (const cx of [20, 60]) {
    m.p("98285.dat", LBG, at(cx, -136, 200), "hinge base plate");
    m.p("43045.dat", LBG, at(cx, -152, 200), "hinge top plate", 0);
    m.p("3673.dat", LBG, at(cx, -142, 240), "grey pin (hinge)");
  }
  m.p("3030.dat", BLACK, at(40, -160, 140, V), "black 4x10 plate (nesting canopy)");
  // under its front end: red plates with pin holes (holes overhanging to the front), grey 2x2, black 2x4
  for (const cx of [10, 70]) m.p("11458.dat", RED, at(cx, -152, 40, rot("y", 90)), "red 1x2 plate with pin hole");
  m.p("3022.dat", LBG, at(40, -152, 40), "grey 2x2 plate");
  m.p("3020.dat", BLACK, at(40, -144, 60), "black 2x4 plate");
  // step 68: grey L-liftarm on a free pin in the back red plate's hole, 3L leg standing up
  m.p("3673.dat", LBG, at(80, -158, 30), "grey pin (L-liftarm)");
  m.p("32526.dat", LBG, withT(orient("-y", "+x", "+z"), [90, -158, 30]), "grey 3x5 L-liftarm");
  // step 69: handle into the front red plate's hole, pointing out to the left
  m.p("43093.dat", BLUE, at(0, -158, 30, rot("y", 180)), "blue axle-pin (canopy handle)");
  m.p("42195.dat", RED, withT(orient("+z", "+y", "-x"), [-30, -158, 30]), "red 3L axle connector (canopy handle)");
  m.p("4519.dat", LBG, at(-70, -158, 30), "grey 3L axle (canopy handle)");
  m.p("3713.dat", RED, withT(orient("+z", "+y", "-x"), [-70, -158, 30]), "red bush (canopy handle)");
  m.p("32474.dat", RED, withT(orient("-y", "+x", "+z"), [-94, -158, 30]), "red ball (canopy handle)");
  m.p("41835.dat", DAZURE, at(10, -160, 50, rot("y", -90)), "blue bird (on the canopy)");
  return Array.from({ length: b.parts.length - first }, (_, i) => first + i);
}

// Steps 74-81: lime end frame on the left face of the building (B2 x = -10).
function endFrame(b: Build, m: M, right: boolean) {
  const first = b.parts.length;
  const x0 = -10;
  m.p("39794.dat", LIME, withT(orient("-y", "+x", "+z"), [x0, -58, 120]), "lime 7x11 end frame", 0);
  // feet: pins in the bottom liftarm, 1L liftarms on the outside
  for (const z of [100, 220]) {
    m.p("61332.dat", BLACK, at(-20, 2, z), "black pin (end frame foot)", 0);
    m.p("18654.dat", LIME, withT(orient("-y", "+x", "+z"), [-30, 2, z]), "lime 1L liftarm (end frame foot)");
  }
  // lever and shaft (turns freely in the frame)
  m.p("42003.dat", LIME, withT(orient("+y", "-z", "-x"), [x0, -138, 140]), "lime axle/pin cross block (lever)", 0);
  m.p("53540.dat", LBG, at(-30, -148, 130, rot("y", -90)), "grey 1x2 brick with pins (lever)");
  m.p("3069b.dat", YELLOW, at(-30, -156, 130, rot("y", 90)), "yellow 1x2 tile (lever)");
  m.p("15462.dat", BROWN, withT(orient("-y", "+x", "+z"), [x0, -98, 160]), "brown 5L axle with stop (shaft)");
  m.p("3713.dat", RED, withT(orient("+x", "-z", "+y"), [x0, -98, 160]), "red bush (shaft)");
  m.p("60483.dat", GREEN, at(x0, -78, 160, rot("y", 180)), "green 2L liftarm (shaft)");
  m.p("59443.dat", BROWN, withT(orient("+x", "-z", "+y"), [x0, -48, 160]), "brown axle joiner (shaft)");
  m.p("24316.dat", BROWN, withT(orient("+y", "+x", "-z"), [x0, -16, 160]), "brown 3L axle with stop (shaft)");
  // four pins towards the building (into the green 1x2 bricks with holes)
  for (const z of [20, 220]) for (const y of [-78, -38]) m.p("61332.dat", BLACK, at(0, y, z), "black pin (end frame to building)", 0);
  if (right) {
    const flip: Record<string, "x" | "y" | "z"> = { "42003.dat": "z", "53540.dat": "x", "3069b.dat": "x" };
    for (let i = first; i < b.parts.length; i++) b.parts[i].m = mirrorX(b.parts[i].m, 130, flip[b.parts[i].file] ?? "y");
  }
}

// Steps 1-4: the dock (15x11 frame lying flat, a 5x7 frame upright on each short side), centred
// under the building, its uprights towards the building's front.
function dock(b: Build, m: M) {
  const first = b.parts.length;
  const yc = 22; // dock beams: y 12..32 (bottom on the mat)
  m.p("39790.dat", DBG, withT(orient("-z", "+y", "+x"), [130, yc, 120]), "dock 15x11 frame", 0);
  // left side (x = -10): pins sticking out left at z = 40 and 120, the 5x7 upright on them
  for (const z of [40, 120]) m.p("61332.dat", BLACK, at(-20, yc, z), "black pin (dock upright)", 0);
  // 3L liftarms inside the front corner (from inside, on two pins)
  for (const z of [160, 200]) m.p("61332.dat", BLACK, at(0, yc, z), "black pin (dock stop)", 0);
  m.p("32523.dat", BLACK, withT(orient("-y", "+x", "+z"), [10, yc, 180]), "black 3L liftarm (dock stop)");
  m.p("64179.dat", BLACK, withT(orient("-z", "+x", "-y"), [-30, yc - 60, 80]), "black 5x7 upright frame (dock)");
  const n = b.parts.length;
  for (let i = first + 1; i < n; i++) {
    const p = b.parts[i];
    b.place(p.file, p.color, mirrorX(p.m, 130, "y"), p.label + " (right)");
  }
}

// Plants -----------------------------------------------------------------------------------------
function tallPlant(m: M, x: number, z: number, y0: number) {
  let y = y0;
  for (let k = 0; k < 3; k++) {
    y -= 24;
    m.p("4727.dat", BGREEN, at(x, y, z), "green flower petals (tall plant)");
    if (k < 2) { y -= 8; m.p("24866.dat", GREEN, at(x, y, z), "green 1x1 flower plate"); }
  }
  m.p("4367.dat", RED, at(x, y, z), "red flower (tall plant)", 0);
}
function stemPlant(m: M, x: number, z: number, y0: number) {
  const dirs = [faceDir("right"), faceDir("front", "left"), faceDir("front", "right")];
  let y = y0 - 8;
  for (const d of dirs) { m.p("32607.dat", GREEN, withT(d, [x, y, z]), "green leaves plate (stem plant)"); y -= 8; }
  const stem = m.p("19119.dat", GREEN, at(x, y + 8, z), "bar with six stems", 0);
  // stem tips (from the part's snap data): pos - 25 * axis
  const stems: [V3, V3][] = [[[-6.5, -10.1, 0], [0.5, 0.87, 0]], [[3.2, -10.1, 5.6], [-0.25, 0.87, -0.43]], [[-3.8, -5.7, -6.5], [0.47, 0.34, 0.81]],
    [[3.2, -10.1, -5.6], [-0.25, 0.87, 0.43]], [[-3.8, -5.7, 6.5], [0.47, 0.34, -0.81]], [[7.5, -5.7, 0], [-0.94, 0.34, 0]]];
  const sm = m.b.parts[stem].m;
  stems.forEach(([p, a], k) => {
    const tip: V3 = [sm[3] + p[0] - 26 * a[0], sm[7] + p[1] - 26 * a[1], sm[11] + p[2] - 26 * a[2]];
    m.p("24866.dat", k % 2 ? GREEN : YELLOW, withT(yTo(a), tip), "flower plate on a stem", 0);
  });
}

export function build(lib: Library) {
  const b = new Build(lib, "M15 Biocentric Architecture");
  const m = new M(b);
  const V = rot("y", 90), R180 = rot("y", 180);

  // ---- Steps 5-9 (B1 steps, converted): floor start, stream, grass --------------------------
  m.g("60479.dat", WHITE, 12, 12, 0, 11, 0, "white 1x12 plate (floor, right edge)", undefined, 0);
  m.p("2357.dat", TAN, at(250, -24, 230, R180), "tan 2x2 corner brick (back right)");
  b.step();
  m.g("3028.dat", WHITE, 6, 11, 0, 11, 0, "white 6x12 plate (floor)");
  b.step();
  m.g("3069b.dat", TLBLUE, 10, 11, 1, 1, -8, "trans blue 1x2 tile (stream)");
  m.g("25269.dat", TLBLUE, 9, 9, 1, 1, -8, "trans blue quarter tile", R180);
  m.g("87580.dat", GREEN, 9, 10, 2, 3, -8, "green 2x2 jumper tile");
  m.g("25269.dat", TLBLUE, 11, 11, 2, 2, -8, "trans blue quarter tile", IDENTITY);
  b.step();
  m.g("87580.dat", GREEN, 7, 8, 2, 3, -8, "green 2x2 jumper tile");
  m.g("87580.dat", GREEN, 9, 10, 4, 5, -8, "green 2x2 jumper tile");
  m.g("87580.dat", GREEN, 7, 8, 4, 5, -8, "green 2x2 jumper tile");
  b.step();
  m.g("3700.dat", GREEN, 12, 12, 0, 1, -48, "green 1x2 brick with hole (right face, back)", V);
  m.g("3023b.dat", DTAN, 12, 12, 0, 1, -56, "dark tan 1x2 plate", V);
  m.g("15070.dat", BGREEN, 12, 12, 0, 0, -64, "bright green tooth plate", faceDir("back"));
  m.g("6141.dat", TAN, 12, 12, 1, 1, -64, "tan 1x1 round plate");
  b.step();

  // ---- Steps 10-19: back wall with windows, plants, left end ---------------------------------
  m.g("3062b.dat", GREEN, 10, 10, 0, 0, -24, "green 1x1 round brick");
  m.g("3008.dat", TAN, 2, 9, 0, 0, -24, "tan 1x8 brick (back wall)");
  b.step();
  const win = (c0: number, row: number, yb: number, R: Mat4, label: string) => {
    const mm = withT(R, [(X(c0) + X(c0 + 1)) / 2, yb - 48, Z(row)]);
    m.p("60592.dat", TAN, mm, label);
    m.p("60601.dat", TLBLUE, mm, label + " glass", 0);
  };
  win(10, 0, -24, R180, "window (back wall)");
  win(8, 0, -24, R180, "window (back wall)");
  b.step();
  // step 12: leaves + pink bud on the back-left jumper, yellow flower plate on the front-right one
  m.p("32607.dat", GREEN, withT(faceDir("right"), [X(9.5), -16, Z(2.5)]), "green leaves plate");
  m.p("95829.dat", BPINK, at(X(9.5), -16, Z(2.5)), "pink flower bud (approximated by a rose)", 0);
  m.p("24866.dat", YELLOW, at(X(7.5), -16, Z(4.5)), "yellow 1x1 flower plate");
  b.step();
  tallPlant(m, X(9.5), Z(4.5), -8);
  b.step();
  stemPlant(m, X(7.5), Z(2.5), -8);
  b.step();
  m.g("3028.dat", WHITE, 0, 5, 0, 11, 0, "white 6x12 plate (floor, left)");
  b.step();
  for (const y of [-48, -72]) m.g("3622.dat", TAN, 5, 7, 0, 0, y, "tan 1x3 brick (back wall)");
  b.step();
  m.p("2357.dat", TAN, at(10, -24, 230, V), "tan 2x2 corner brick (back left)");
  b.step();
  win(3, 0, -24, R180, "window (back wall)");
  win(1, 0, -24, R180, "window (back wall)");
  b.step();
  m.g("3700.dat", GREEN, 0, 0, 0, 1, -48, "green 1x2 brick with hole (left face, back)", V);
  m.g("3023b.dat", DTAN, 0, 0, 0, 1, -56, "dark tan 1x2 plate", V);
  m.g("15070.dat", YELLOW, 0, 0, 0, 0, -64, "yellow tooth plate", faceDir("back"));
  m.g("6141.dat", TAN, 0, 0, 1, 1, -64, "tan 1x1 round plate");
  b.step();

  // ---- Steps 20-30: crank assembly (compost hatch) on the front two rows at the left ----------
  const cr = crank(lib);
  const T = new Float64Array([-1, 0, 0, 30, 0, 1, 0, -14, 0, 0, -1, 10]); // bf -> B2 (turned round)
  for (const p of cr.parts) b.place(p.file, p.color, mul(T, p.m), `crank: ${p.label}`);
  b.step();

  // ---- Steps 31-36: front wall -----------------------------------------------------------------
  m.g("3710.dat", TAN, 7, 10, 11, 11, -8, "tan 1x4 plate (front)");
  m.p("2357.dat", TAN, at(250, -24, 10, rot("y", -90)), "tan 2x2 corner brick (front right)");
  b.step();
  win(9, 11, -8, IDENTITY, "window (front wall)");
  win(7, 11, -8, IDENTITY, "window (front wall)");
  b.step();
  m.g("3062b.dat", GREEN, 6, 6, 11, 11, -48, "green 1x1 round brick");
  m.g("3062b.dat", GREEN, 11, 11, 11, 11, -48, "green 1x1 round brick");
  m.g("15070.dat", BGREEN, 6, 6, 11, 11, -56, "bright green tooth plate", faceDir("front"));
  m.g("15070.dat", BGREEN, 11, 11, 11, 11, -56, "bright green tooth plate", faceDir("front"));
  b.step();
  m.g("3700.dat", GREEN, 12, 12, 10, 11, -48, "green 1x2 brick with hole (right face, front)", V);
  m.g("3023b.dat", DTAN, 12, 12, 10, 11, -56, "dark tan 1x2 plate", V);
  b.step();
  m.g("6141.dat", TAN, 12, 12, 10, 10, -64, "tan 1x1 round plate");
  m.g("3623.dat", GREEN, 10, 12, 11, 11, -64, "green 1x3 plate");
  m.g("3710.dat", TAN, 6, 9, 11, 11, -64, "tan 1x4 plate");
  b.step();
  m.g("3700.dat", GREEN, 0, 0, 10, 11, -48, "green 1x2 brick with hole (left face, front)", V);
  m.g("3023b.dat", DTAN, 0, 0, 10, 11, -56, "dark tan 1x2 plate", V);
  m.g("6141.dat", TAN, 0, 0, 10, 10, -64, "tan 1x1 round plate");
  m.g("15070.dat", BGREEN, 0, 0, 11, 11, -64, "bright green tooth plate", faceDir("front"));
  b.step();

  // ---- Steps 37-41: upper walls and the skylight rails -----------------------------------------
  m.g("3700.dat", GREEN, 12, 12, 0, 1, -88, "green 1x2 brick with hole (right face, back, upper)", V);
  m.g("3023b.dat", DTAN, 12, 12, 0, 1, -96, "dark tan 1x2 plate", V);
  b.step();
  m.g("3008.dat", TAN, 4, 11, 0, 0, -96, "tan 1x8 brick (back wall)");
  m.g("6636.dat", TAN, 6, 11, 0, 0, -104, "tan 1x6 tile (back wall)");
  b.step();
  m.g("3700.dat", GREEN, 0, 0, 10, 11, -88, "green 1x2 brick with hole (left face, front, upper)", V);
  m.g("3008.dat", TAN, 1, 8, 11, 11, -88, "tan 1x8 brick (front wall, over the crank)");
  m.g("3622.dat", TAN, 9, 11, 11, 11, -88, "tan 1x3 brick (front wall)");
  m.g("3700.dat", GREEN, 12, 12, 10, 11, -88, "green 1x2 brick with hole (right face, front, upper)", V);
  b.step();
  m.g("3023b.dat", DTAN, 12, 12, 10, 11, -96, "dark tan 1x2 plate", V);
  m.g("6141.dat", TAN, 0, 0, 10, 10, -96, "tan 1x1 round plate");
  m.g("3666.dat", TAN, 0, 5, 11, 11, -96, "tan 1x6 plate (front wall)");
  b.step();
  // rails: tan 1x12 plate + three 1x4 grooved bricks; grooves facing each other
  for (const [col, slot] of [[5, -90], [12, 90]] as const) {
    m.g("60479.dat", TAN, col, col, 0, 11, -104, `tan 1x12 plate (rail, col ${col})`);
    for (const r0 of [0, 4, 8]) m.g("2653.dat", TAN, col, col, r0, r0 + 3, -128, "tan 1x4 brick with groove (rail)", rot("y", slot));
  }
  b.step();

  // ---- Steps 42-49: sliding skylight in the rails (pushed fully in: black tile under the roof) --
  const sl = slider(lib);
  const TS = new Float64Array([0, 0, -1, 180, 0, 1, 0, -120, 1, 0, 0, 230]); // S -> B2
  for (const p of sl.parts) b.place(p.file, p.color, mul(TS, p.m), `skylight: ${p.label}`);
  b.step();

  // ---- Steps 50-53: front wall between the rails, lime roof --------------------------------------
  m.g("3700.dat", GREEN, 10, 11, 11, 11, -88 - 24, "green 1x2 brick with hole (front wall)");
  m.p("89678.dat", RED, at(X(10.5), -102, 0, V), "red pin with stud (front wall)");
  m.g("3010.dat", GREEN, 6, 9, 11, 11, -112, "green 1x4 brick (front wall)");
  b.step();
  m.g("6636.dat", TAN, 6, 11, 11, 11, -120, "tan 1x6 tile (front wall)");
  b.step();
  m.g("3008.dat", TAN, 5, 12, 11, 11, -152, "tan 1x8 brick (over the skylight slot)");
  m.g("3010.dat", GREEN, 5, 5, 7, 10, -152, "green 1x4 brick (on the rail)");
  m.g("3010.dat", GREEN, 12, 12, 7, 10, -152, "green 1x4 brick (on the rail)");
  m.g("3008.dat", TAN, 5, 12, 6, 6, -152, "tan 1x8 brick");
  b.step();
  m.g("3036.dat", LIME, 5, 12, 6, 11, -160, "lime 6x8 plate (roof)", IDENTITY);
  for (const r0 of [6, 8, 10]) m.g("85984.dat", LIME, 5, 5, r0, r0 + 1, -160, "lime 1x2 slope", rot("y", -90));
  b.step();

  // ---- Steps 54-61: left part of the roof ---------------------------------------------------------
  win(2, 0, -72, R180, "window (back wall, upper)");
  m.g("3062b.dat", GREEN, 1, 1, 0, 0, -96, "green 1x1 round brick");
  m.g("3023b.dat", DTAN, 0, 0, 10, 11, -104, "dark tan 1x2 plate", V);
  b.step();
  m.g("3700.dat", GREEN, 0, 0, 0, 1, -88, "green 1x2 brick with hole (left face, back, upper)", V);
  m.g("3023b.dat", DTAN, 0, 0, 0, 1, -96, "dark tan 1x2 plate", V);
  m.g("6141.dat", TAN, 0, 0, 1, 1, -104, "tan 1x1 round plate");
  m.g("15070.dat", BGREEN, 0, 0, 0, 0, -104, "bright green tooth plate", faceDir("back"));
  b.step();
  m.g("6112.dat", TAN, 1, 1, 0, 11, -120, "tan 1x12 brick");
  m.g("6112.dat", TAN, 4, 4, 0, 11, -120, "tan 1x12 brick");
  b.step();
  m.g("3700.dat", GREEN, 2, 3, 11, 11, -120, "green 1x2 brick with hole (front wall)");
  m.p("89678.dat", RED, at(X(2.5), -110, 0, V), "red pin with stud (front wall)");
  b.step();
  m.g("3032.dat", TAN, 1, 4, 6, 11, -128, "tan 4x6 plate (roof)", V);
  m.g("3032.dat", TAN, 1, 4, 0, 5, -128, "tan 4x6 plate (roof)", V);
  b.step();
  m.g("6112.dat", TAN, 0, 0, 0, 11, -128, "tan 1x12 brick (left edge)");
  m.g("24866.dat", GREEN, 0, 0, 11, 11, -136, "green 1x1 flower plate");
  b.step();
  m.g("3023b.dat", DTAN, 1, 2, 10, 10, -136, "dark tan 1x2 plate");
  m.g("3023b.dat", DTAN, 1, 2, 10, 10, -144, "dark tan 1x2 plate");
  for (const c of [1, 2]) m.p("11477.dat", GREEN, at(X(c), -144, Z(10.5)), "green curved slope", 0);
  b.step();

  // ---- Steps 62-63: bird's nest (cols 0-3, rows 5-8), flower and bird -----------------------------
  m.g("60474.dat", TAN, 0, 3, 5, 8, -136, "tan 4x4 round plate (nest)");
  const nest: [number, number, ("front" | "back" | "left" | "right")[]][] = [[2, 6, ["back", "right"]], [2, 7, ["front", "right"]], [1, 6, ["back", "left"]], [1, 7, ["front", "left"]]];
  for (const [c, r, d] of nest) m.g("32607.dat", GOLD, c, c, r, r, -144, "gold leaves plate (nest)", faceDir(...d));
  m.g("6908.dat", LNOUGAT, 2, 2, 7, 7, -144, "light nougat dome (egg)", undefined, 0);
  for (const [c, r, d] of [[2, 6, ["back", "left"]], [1, 6, ["front", "left"]], [1, 7, ["front", "right"]]] as const)
    m.g("68211.dat", GOLD, c, c, r, r, -144, "gold bar with three claws (nest)", faceDir(...(d as unknown as ("front" | "back" | "left" | "right")[])), 0);
  b.step();
  m.g("24866.dat", GREEN, 0, 0, 4, 4, -136, "green 1x1 flower plate");
  m.g("41835.dat", DAZURE, 1, 1, 4, 4, -128, "blue bird", rot("y", -90), 0);
  b.step();

  // ---- Steps 64-71: nesting canopy on the roof's back four rows ---------------------------------
  const can = canopy(b, m);
  b.step();

  // ---- Steps 72-73: claws in the front-wall studs, plants on the lime roof -------------------------
  for (const x of [X(10.5), X(2.5)]) {
    const y = x > 100 ? -102 : -110;
    m.p("68211.dat", BGREEN, withT(orient("+x", "+z", "-y"), [x, y, -4]), "green bar with three claws (front wall)", 0);
  }
  m.g("32607.dat", GREEN, 6, 6, 9, 9, -168, "green leaves plate (roof)", faceDir("right"));
  m.g("32607.dat", GREEN, 9, 9, 10, 10, -168, "green leaves plate (roof)", faceDir("back"));
  m.g("32607.dat", GREEN, 9, 9, 9, 9, -168, "green leaves plate (roof)", faceDir("front"));
  m.g("24866.dat", YELLOW, 9, 9, 10, 10, -176, "yellow 1x1 flower plate (roof)");
  m.g("32607.dat", GREEN, 11, 11, 9, 9, -168, "green leaves plate (roof)", faceDir("right"));
  m.g("24866.dat", YELLOW, 11, 11, 9, 9, -176, "yellow 1x1 flower plate (roof)");
  b.step();

  // ---- Steps 74-89: lime end frames with turning shafts --------------------------------------------
  endFrame(b, m, false);
  b.step();
  endFrame(b, m, true);
  b.step();

  // ---- Steps 1-4: the dock under the building -------------------------------------------------------
  dock(b, m);

  // the canopy rests on the nest's claws: tilt it about the hinge axis until it clears them
  tiltCanopy(b, can);

  return finish(b);
}

/** Rotate the canopy (all parts above the hinge base plates) about the hinge axis (x, y -142, z 240). */
function tiltCanopy(b: Build, idx: number[]) {
  const moving = idx.filter((i) => b.parts[i].file !== "98285.dat");
  const others = b.parts.map((_, i) => i).filter((i) => !idx.includes(i));
  const placed = others.map((i) => ({ file: b.parts[i].file, m: b.parts[i].m }));
  const orig = moving.map((i) => b.parts[i].m);
  for (let deg = 0; deg <= 30; deg += 1) {
    const th = (-deg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    // rotation about x through (0, -142, 240); front end (-z) rises (-y)
    const R = new Float64Array([1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]);
    const toO = new Float64Array([1, 0, 0, 0, 0, 1, 0, 142, 0, 0, 1, -240]);
    const back = new Float64Array([1, 0, 0, 0, 0, 1, 0, -142, 0, 0, 1, 240]);
    const G = mul(back, mul(R, toO));
    let ov = 0;
    moving.forEach((i, k) => {
      if (b.parts[i].file === "3673.dat" || b.parts[i].file === "43045.dat") return;
      ov += findConnectionsForParts(b.lib, placed, { file: b.parts[i].file, m: mul(G, orig[k]) }).overlap;
    });
    if (DEBUG) console.log(`  canopy tilt ${deg}: overlap ${ov.toFixed(1)}`);
    if (ov < 1 || deg === 30) {
      moving.forEach((i, k) => (b.parts[i].m = mul(G, orig[k])));
      if (DEBUG) console.log(`  canopy resting at ${deg} degrees`);
      return;
    }
  }
}

/** Final pose: B2 orientation (crank handle at the front left), centred, standing on y = 0. */
function finish(b: Build) {
  const bb = b.bounds();
  const shift: V3 = [-(bb.min[0] + bb.max[0]) / 2, -bb.max[1], -(bb.min[2] + bb.max[2]) / 2];
  for (const p of b.parts) p.m = withT(p.m, [p.m[3] + shift[0], p.m[7] + shift[1], p.m[11] + shift[2]]);
  return b;
}
