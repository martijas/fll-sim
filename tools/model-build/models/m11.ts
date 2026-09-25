// Mission 11 Window to the Past (bag 17 + two brown 6x10 plates and four rock panels from bag 0),
// scripted from the official building instructions (text-based book text-bi-09 + picture book book-09).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right.
//
// Build frame "B" (the base as seen from step 10 on): door hinged at the back (+z), studs up, base
// plates' bottom at y = 0. The door (steps 1-7) is scripted in its own frame "D" (studs up, as in
// steps 1-5) and mapped into B by a 180-degree turn about Z (the flip of step 6 followed by the
// 180-degree turn of step 10). The door is hinged on two hinge-plate pairs (43045 on the door,
// 43056 on the base) with free-spinning light grey pins; closed (step 39) it leans against the back
// edge of the base top. At the end the model is turned so it is seen as on the final page: door on
// the right (+X), the curved bar with the hanging nut at the front-left.
import { type Library, type Mat4, mul } from "@fll-sim/ldraw";
import { Build, at, dir, orient, pt, rot } from "../src/build";
import { findConnectionsForParts } from "@fll-sim/assembly/fit";

const BLACK = 0, RED = 4, GREEN = 2, BGREEN = 10, TAN = 19, WHITE = 15, YELLOW = 14, BROWN = 70, LBG = 71, DBG = 72;
const DORANGE = 484, TRCLEAR = 47, SANDGREEN = 378, DKGREEN = 288, MAZURE = 322, LAVENDER = 31, DKPINK = 5, MAGENTA = 26, LORANGE = 191, PYELLOW = 226;

type V3 = [number, number, number];
const x = (m: Mat4) => m[3], y = (m: Mat4) => m[7], z = (m: Mat4) => m[11];
const withT = (r: Mat4, t: V3): Mat4 => { const m = new Float64Array(r); m[3] = t[0]; m[7] = t[1]; m[11] = t[2]; return m; };
const R90 = rot("y", 90), R180 = rot("y", 180);

export function build(lib: Library) {
  const b = new Build(lib, "M11 Window to the Past");
  const put = (file: string, color: number, m: Mat4, min: number, label: string) => b.put(file, color, m, min, label);

  // ================= Group 1: the door (frame D, then mapped into B) ==========================
  // D: cells along x (the 6x10 spans x -100..100), the red row at z = 0, the 6x10 rows z -20..-120.
  const TDB = rot("z", 180, [0, -4, 0]);
  const Dm = (m: Mat4) => mul(TDB, m);
  const door: number[] = [];
  const dput = (file: string, color: number, m: Mat4, min: number, label: string) => {
    const i = put(file, color, Dm(m), min, label);
    door.push(i);
    return i;
  };
  // 1 red 1x2 plate; red 1x4 tile, right half on it
  dput("3023b.dat", RED, at(160, 0, 0), 0, "door: red 1x2 plate");
  dput("2431.dat", RED, at(140, -8, 0), 2, "door: red 1x4 tile");
  b.step();
  // 2 red 1x12 plate, right two studs under the tile's overhang
  dput("60479.dat", RED, at(20, 0, 0), 1, "door: red 1x12 plate");
  b.step();
  // 3 black 2x4 tile, back row on the 1x12, left of the 1x4 tile
  dput("87079.dat", BLACK, at(60, -8, -10), 2, "door: black 2x4 tile (sign)");
  b.step();
  // 4 brown 6x10 plate under the tile's front row, right sides even
  dput("3033.dat", BROWN, at(0, 0, -70), 2, "door: brown 6x10 plate");
  b.step();
  // 5 dark orange 1x3 tile (sign post), second column from the right, in front of the 2x4 tile
  dput("63864.dat", DORANGE, at(70, -8, -60, R90), 3, "door: dark orange 1x3 tile (sign post)");
  b.step();
  // 6 (door flipped) red 1x4 plate under the red end; brown 1x3 round-end plates at both ends
  dput("3710.dat", RED, at(140, 8, 0), 4, "door: red 1x4 plate");
  dput("77850.dat", BROWN, at(90, 8, -20, R90), 3, "door: brown 1x3 round-end plate (right)");
  dput("77850.dat", BROWN, at(-90, 8, -20, R90), 3, "door: brown 1x3 round-end plate (left)");
  // black 1x1 round plate with clip, stud in the tube between cells 2/3 of the front tube row
  dput("5264.dat", BLACK, at(0, 8, -30), 0, "door: black 1x1 round plate with clip (stud in a 6x10 tube)");
  b.step();
  // 7 shovel clipped horizontally, head on the left (clip grips have no snap data: placed exactly)
  const shovel = b.place("3837.dat", DBG, Dm(orient("+z", "+x", "+y", [-14, 18, -30])), "door: shovel (in the clip)");
  door.push(shovel);
  dput("35480.dat", GREEN, at(0, 8, -120), 2, "door: green 1x2 round-end plate");
  b.step();

  // ================= Step 8-9: hinges and the first base plates (frame B) ======================
  // 43045 (hole hanging down) upside down on the door; 43056 (hole sticking up) on the base;
  // light grey frictionless pin through both holes: hinge axis along X at y = -22, z = -150.
  for (const hx of [-40, 40]) door.push(put("43045.dat", LBG, at(hx, -12, -110, rot("x", 180)), 3, "door: hinge plate top (43045)"));
  [-40, 40].forEach((hx) => b.place("43056.dat", LBG, at(hx, -16, -190), "base: hinge plate base (43056)"));
  [-40, 40].forEach((hx) => put("3673.dat", LBG, at(hx, -22, -150), 2, "hinge pin (light grey, no friction)"));
  b.step();
  put("4477.dat", BROWN, at(0, -8, -220), 0, "base: brown 1x10 plate");
  put("3832.dat", BROWN, at(0, -8, -190), 0, "base: brown 2x10 plate");
  b.step();

  // ================= Group 2: base =============================================================
  // 10 green 1x2 slopes, tall side at the front, on the back row of the 2x10 at both ends
  for (const sx of [-80, 80]) put("85984.dat", GREEN, at(sx, -8, -180, R180), 2, "base: green 1x2 slope");
  b.step();
  // 11 brown 2x6 plate between the hinge plates, back even with the 2x10
  put("3795.dat", BROWN, at(0, -16, -230, R90), 4, "base: brown 2x6 plate");
  b.step();
  // 12 brown 6x10 plate under the 2x6's three overhanging rows
  put("3033.dat", BROWN, at(0, -8, -290), 4, "base: brown 6x10 plate");
  b.step();
  // 13 four rock panels (walls), hollow side inwards
  const rockL = orient("-z", "+y", "+x"), rockR = orient("+z", "+y", "-x");
  for (const pz of [-310, -230]) {
    put("47847.dat", BROWN, withT(rockL, [-80, -152, pz]), 1, "base: rock panel (left wall)");
    put("47847.dat", BROWN, withT(rockR, [80, -152, pz]), 1, "base: rock panel (right wall)");
  }
  b.step();
  // 14 transparent 1x1 / 1x2 bricks on the panels' lower shoulder studs
  for (const wx of [-70, 70]) {
    put("3005.dat", TRCLEAR, at(wx, -152, -340), 1, "base: trans-clear 1x1 brick");
    put("3065.dat", TRCLEAR, at(wx, -152, -270, R90), 2, "base: trans-clear 1x2 brick");
    put("3005.dat", TRCLEAR, at(wx, -152, -200), 1, "base: trans-clear 1x1 brick");
  }
  b.step();

  // Wall tops: one stud column per wall at x = +-70, studs at y = -152, z = -340 .. -200.
  // The three top plates (back 2x8 with a root, 4x8 with a root, front 2x8 with a root) cover
  // z -350 .. -190, x -80 .. 80.

  // ---- 15-19 plant with a root on the back 2x8 (cone near the right end) --------------------
  put("3738.dat", BGREEN, at(0, -160, -210), 4, "back 2x8 plate with holes");
  // (placed on the walls in step 19; its parts are listed here in book order)
  put("4032a.dat", GREEN, at(40, -168, -210), 4, "green 2x2 round plate");
  b.step();
  put("3942c.dat", BGREEN, at(40, -216, -210), 1, "bright green 2x2x2 cone");
  b.step();
  // 17 tan 45-degree curved tube hanging under the plate; yellow 3L axle up through the second hole
  //    from the right into the cone; red 2L axle out of its lower end, pointing down-left
  put("4519.dat", YELLOW, orient("+y", "+x", "-z", [40, -176, -210]), 1, "yellow 3L axle");
  const tube = put("7324.dat", TAN, rot("z", 180, [40, -152, -210]), 1, "tan 45-degree curved tube (root)");
  const tm = b.parts[tube].m;
  const tEnd = pt(tm, [23.4, -56.6, 0]), dd = dir(tm, [0.7071, -0.7071, 0]); // lower end, pointing down-left
  const along = (p: V3, d: V3, s: number): V3 => [p[0] + d[0] * s, p[1] + d[1] * s, p[2] + d[2] * s];
  const M = (xa: V3, ya: V3, za: V3, t: V3): Mat4 => new Float64Array([xa[0], ya[0], za[0], t[0], xa[1], ya[1], za[1], t[1], xa[2], ya[2], za[2], t[2]]);
  const perp: V3 = [-dd[1], dd[0], 0]; // in the xy plane, perpendicular to dd
  put("32062.dat", RED, M(dd, perp, [0, 0, dd[0] * perp[1] - dd[1] * perp[0]], along(tEnd, dd, 5)), 1, "red 2L axle");
  b.step();
  // 18 root stump (2x2 round brick, round plate with centre stud, tan six-stem bar) on the end of
  //    the red axle, stems pointing down-left. Stump frame: its local +y (top -> bottom) points up the axle.
  {
    const up: V3 = [-dd[0], -dd[1], 0];
    const sx: V3 = [perp[0], perp[1], 0];
    const sz: V3 = [sx[1] * up[2] - sx[2] * up[1], sx[2] * up[0] - sx[0] * up[2], sx[0] * up[1] - sx[1] * up[0]];
    const S = M(sx, up, sz, along(tEnd, dd, 29));
    // (the real part is a 2x2 round brick with four root points at the bottom; not in LDraw -> plain 2x2 round brick)
    put("3941.dat", BROWN, S, 1, "brown 2x2 round brick (stand-in for the 2x2 round brick with four points)");
    put("18674.dat", BROWN, mul(S, at(0, -8, 0)), 1, "brown 2x2 round plate with centre stud");
    put("19119.dat", TAN, mul(S, at(0, -12, 0)), 0, "tan bar with six stems (bar in the hollow stud)");
  }
  b.step();

  // ---- 20-23 4x8 plate with a hanging root, on the walls in front of the back 2x8 ------------
  put("3035.dat", BGREEN, at(0, -160, -270), 4, "bright green 4x8 plate");
  put("49309.dat", BROWN, at(0, -152, -270), 0, "brown 2x2x2 inverted cone (hanging under the 4x8)");
  b.step();
  // 21 root cluster: white 3L bar from the cone tip into the tan open-stud plate / 1x1 brick with
  //    four side studs; tan three-prong bars in the side studs; tan six-stem bar at the bottom
  put("87994.dat", WHITE, at(0, -130, -270), 0, "white 3L bar");
  put("85861.dat", TAN, at(0, -100, -270), 0, "tan 1x1 round plate with open stud");
  put("4733.dat", BROWN, at(0, -92, -270), 1, "brown 1x1 brick with studs on four sides");
  put("85861.dat", TAN, at(0, -68, -270), 1, "tan 1x1 round plate with open stud");
  put("19119.dat", TAN, at(0, -60, -270, rot("x", 180)), 0, "tan bar with six stems (stems down)");
  for (const s of [[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][]) {
    const sd: V3 = [s[0], 0, s[1]];
    const yl: V3 = [-sd[0], 0, -sd[2]]; // bar points into the side stud
    const zl: V3 = [0, -1, 0];
    const xl: V3 = [yl[1] * zl[2] - yl[2] * zl[1], yl[2] * zl[0] - yl[0] * zl[2], yl[0] * zl[1] - yl[1] * zl[0]];
    b.place("68211.dat", TAN, M(xl, yl, zl, [13 * sd[0], -82, -270 + 13 * sd[2]]), "tan bar with three prongs (in a side stud; bar-in-stud not in snap data)");
  }
  b.step();
  b.step();
  // 23 green 1x2 brick with axle hole, rightmost column, front rows of the 4x8
  put("32064a.dat", GREEN, at(70, -184, -290, R90), 2, "green 1x2 brick with axle hole");
  b.step();

  // ---- 24-28 front 2x8 with a root -------------------------------------------------------
  put("3738.dat", BGREEN, at(0, -160, -330), 4, "front 2x8 plate with holes");
  put("35480.dat", WHITE, at(60, -168, -340), 2, "white 1x2 round-end plate");
  b.step();
  put("4032a.dat", GREEN, at(20, -168, -330), 4, "green 2x2 round plate");
  put("3262.dat", BROWN, at(20, -192, -330), 1, "brown 2x2 dome top");
  b.step();
  put("3705.dat", BLACK, orient("+y", "+x", "-z", [20, -144, -330]), 1, "black 4L axle (upright)");
  // tan cone upside down on the axle, pushed up against the plate
  put("3942c.dat", TAN, at(20, -104, -330, rot("x", 180)), 1, "tan 2x2x2 cone (upside down)");
  b.step();
  put("98284.dat", SANDGREEN, at(20, -96, -330, rot("x", 180)), 0, "sand green 2x2 round plate with 4 bars (upside down)");
  const st1 = put("24855.dat", SANDGREEN, at(20, -80, -330, rot("x", 180)), 0, "sand green flower stem (bar in the plate's hole)");
  b.attach("24855.dat", SANDGREEN, { to: st1, angles: [60], debug: !!process.env.M11_DBG, accept: (m) => dir(m, [0, 1, 0])[1] < -0.99 && y(m) > -75, label: "sand green flower stem (stems offset from the first)" });
  b.step();
  b.step();
  // 29 green 1x4 brick behind the left stud of the white plate
  put("3010.dat", GREEN, at(50, -184, -290, R90), 3, "green 1x4 brick");
  b.step();
  // 30 two 2x2 corner plates: left column on the 1x4 brick, the single right stud on the axle-hole brick
  put("2420.dat", GREEN, orient("-z", "+y", "+x", [50, -192, -300]), 2, "green 2x2 corner plate");
  put("2420.dat", GREEN, at(50, -192, -280), 2, "green 2x2 corner plate");
  b.step();
  // 31 white 1x1 cone + medium azure 2x2 round tile on the right stud of the white plate
  put("59900.dat", WHITE, at(70, -192, -340), 1, "white 1x1 cone");
  put("14769.dat", MAZURE, at(70, -200, -340), 0, "medium azure 2x2 round tile");
  b.step();

  // ---- 32-34 stump ----------------------------------------------------------------------
  put("3941.dat", BROWN, at(-40, -184, -310), 2, "brown 2x2 round brick (stand-in for the 2x2 round brick with four points)");
  put("98284.dat", BROWN, at(-40, -192, -310), 1, "brown 2x2 round plate with 4 upright bars");
  put("14769p83.dat", BROWN, at(-40, -200, -310), 1, "brown 2x2 round tile, tree stump pattern");
  b.step();
  // leaf plates (32607's three leaves spread towards local (+x, -z))
  const leafRot = (target: V3) => {
    const a = Math.atan2(-target[2], target[0]) - Math.atan2(1, 1); // yaw of (1,0,-1) -> target
    return rot("y", Math.round((a * 180) / Math.PI));
  };
  // 33 (base seen with the door at the front) three-leaf plates
  put("32607.dat", GREEN, at(-70, -168, -260, leafRot([1, 0, 0])), 1, "green 1x1 round plate with three leaves");
  put("32607.dat", GREEN, at(70, -200, -300, leafRot([0, 0, 1])), 1, "green 1x1 round plate with three leaves");
  b.step();
  // 34 two leaf assemblies on the stump's back and right bars (1x1 round plate with a long leaf:
  //    not in LDraw -> bright green three-leaf plate as stand-in; 5-petal plate on top)
  for (const [bx, bz, d] of [[-40, -340, [0, 0, -1]], [-70, -310, [-1, 0, 0]]] as [number, number, V3][]) {
    b.place("32607.dat", BGREEN, at(bx, -209, bz, leafRot(d)), "bright green 1x1 round plate with leaf (stand-in; on a stump bar)");
    put("24866.dat", GREEN, at(bx, -217, bz), 1, "green 1x1 plate with five petals");
  }
  b.step();

  // ---- 35-36 plant with frog, red flower ------------------------------------------------------
  // (the two dark green 1x2 round-end plates carry large upright jagged leaves in the real set;
  //  that part is not in LDraw -> plain dark green 1x2 round-end plates)
  put("35480.dat", DKGREEN, at(-10, -168, -250, R90), 2, "dark green 1x2 round-end plate (leaf plate stand-in)");
  put("35480.dat", DKGREEN, at(-10, -176, -250, R90), 2, "dark green 1x2 round-end plate (leaf plate stand-in)");
  put("15470.dat", DKGREEN, at(-10, -176, -240), 1, "dark green 1x1 round plate with swirl (curly stem stand-in)");
  put("33320.dat", PYELLOW, at(-10, -176, -260), 1, "pale yellow frog");
  b.step();
  const lf = put("32607.dat", GREEN, at(-50, -168, -220, leafRot([1, 0, 0])), 1, "green 1x1 round plate with three leaves");
  b.attach("5904.dat", RED, { to: lf, accept: (m) => Math.abs(x(m) + 50) < 1 && Math.abs(z(m) + 220) < 1 && dir(m, [0, 1, 0])[1] > 0.99, label: "red 1x1 flower" });
  b.step();

  // ---- 37 trunk and lavender leaves on the dome ------------------------------------------------
  put("85861.dat", DKPINK, at(20, -200, -330), 1, "pink 1x1 round plate with open stud");
  {
    const h: V3 = [-Math.SQRT1_2, 0, Math.SQRT1_2]; // back right (base seen with the door on the right)
    const T = M([Math.SQRT1_2, 0, Math.SQRT1_2], h, [0, -1, 0], [20, -208, -330]);
    put("80497.dat", DKPINK, T, 0, "pink elephant trunk (bar in the open stud)");
    const top = pt(T, [0, 64, 40]);
    const L = M([-Math.SQRT1_2, 0, -Math.SQRT1_2], [0, 1, 0], [Math.SQRT1_2, 0, -Math.SQRT1_2], [top[0], top[1] - 8, top[2]]);
    put("2417.dat", LAVENDER, L, 1, "lavender 6x5 plant leaves (point to the back right)");
    put("85861.dat", DKPINK, withT(L, [top[0], top[1] - 16, top[2]]), 1, "pink 1x1 round plate with open stud");
  }
  b.step();

  // ---- 38 sea grass plant with buds and a large flower on the bright green cone ------------------
  {
    const P = at(40, -240, -210); // brown cone on the 2x2x2 cone's top stud; stems along world x
    const Pm = (m: Mat4) => mul(P, m);
    put("59900.dat", BROWN, P, 1, "brown 1x1 cone");
    put("30093.dat", BGREEN, Pm(at(0, -8, 0)), 0, "bright green sea grass (bar in the cone's hollow stud)");
    const tip = (sx: number, sy: number): V3 => [sx, sy - 8, 0]; // stem tops (plant frame)
    const inv = rot("x", 180);
    const bud = (t: V3, label: string) => {
      const c = t[1] + 2;
      put("59900.dat", YELLOW, Pm(at(t[0], c, t[2], inv)), 0, `yellow 1x1 cone (${label}, on a stem)`);
      put("85861.dat", DKPINK, Pm(at(t[0], c - 24, t[2], inv)), 1, `pink 1x1 round plate (${label})`);
    };
    bud(tip(-30, -33), "bud");
    bud(tip(30, -68), "bud");
    const t3 = tip(10, -117);
    put("85861.dat", YELLOW, Pm(at(t3[0], t3[1] + 2, 0, inv)), 0, "yellow 1x1 round plate with open stud (on a stem)");
    put("85861.dat", DKPINK, Pm(at(t3[0], t3[1] - 6, 0, inv)), 1, "pink 1x1 round plate with open stud");
    const t4 = tip(-10, -88), c4y = t4[1] + 2;
    put("59900.dat", YELLOW, Pm(at(t4[0], c4y, 0, inv)), 0, "yellow 1x1 cone (large flower, on a stem)");
    put("15469.dat", LORANGE, Pm(at(t4[0], c4y - 24, 0, inv)), 0, "light orange 2x2 round brick with four petals");
    put("2654a.dat", MAGENTA, Pm(at(t4[0], c4y - 40, 0, inv)), 1, "dark pink 2x2 dish");
  }
  b.step();
  // step 39 (door closed) is applied below, after the base is complete
  b.step();

  // ---- 39.2 curved bar in the axle-hole brick; 40 nut hanging on its tip -------------------------
  // axle along the hole (front-back = world x here), arc rising towards the front, studs facing left/right
  const CB = orient("+z", "-x", "-y", [80, -174, -290]);
  put("4042.dat", BROWN, CB, 0, "brown curved bar (axle in the brick's axle hole)");
  const tipP = pt(CB, [0, -111.1, 106.8]), tDir = dir(CB, [0, -0.3827, 0.9239]);
  b.step();
  {
    // nut frame N: brown cone at the origin (normal), 32013 below with its pin hole at (0,65,0)
    const aDir: V3 = [-tDir[1], tDir[0], 0]; // perpendicular to the tip, pointing front-down
    const nx = tDir, ny: V3 = [-aDir[0], -aDir[1], -aDir[2]];
    const nz: V3 = [nx[1] * ny[2] - nx[2] * ny[1], nx[2] * ny[0] - nx[0] * ny[2], nx[0] * ny[1] - nx[1] * ny[0]];
    const hole = along(tipP, tDir, -10);
    const R = M(nx, ny, nz, [0, 0, 0]);
    const off = pt(R, [0, 65, 0]);
    const N = withT(R, [hole[0] - off[0], hole[1] - off[1], hole[2] - off[2]]);
    const Nm = (m: Mat4) => mul(N, m);
    put("59900.dat", BROWN, N, 0, "nut: brown 1x1 cone");
    put("78258.dat", BROWN, Nm(at(0, -8, 0)), 0, "nut: brown 2L bar with stop");
    put("4733.dat", BROWN, Nm(at(0, -36, 0)), 1, "nut: brown 1x1 brick with studs on four sides");
    put("22388.dat", TAN, Nm(at(0, -36, 0)), 1, "nut: tan 1x1 pyramid");
    for (const s of [[1, 0], [0, 1], [-1, 0], [0, -1]] as [number, number][]) {
      const yl: V3 = [-s[0], 0, -s[1]], zl: V3 = [0, -1, 0];
      const xl: V3 = [yl[1] * zl[2] - yl[2] * zl[1], yl[2] * zl[0] - yl[0] * zl[2], yl[0] * zl[1] - yl[1] * zl[0]];
      put("49668.dat", TAN, Nm(M(xl, yl, zl, [18 * s[0], -26, 18 * s[1]])), 1, "nut: tan 1x1 plate with tooth (tooth down)");
    }
    put("32062.dat", RED, Nm(orient("+y", "+x", "-z", [0, 34, 0])), 1, "nut: red 2L axle");
    put("32013.dat", RED, Nm(orient("+x", "-z", "+y", [0, 65, 0])), 1, "nut: red angle connector #1 (pin hole on the curved bar's tip)");
  }

  // ---- 39.1 close the door: swing it up about the hinge axis until it rests on the base -------------
  closeDoor(b, door);

  return finish(b);
}

/**
 * Step 39.1: rotate the door parts about the hinge axis (x, y = -22, z = -150) up and over towards
 * the base until they touch it (first angle with overlap), i.e. the door leans against the base.
 */
function closeDoor(b: Build, door: number[]) {
  const others = b.parts.map((p, i) => ({ file: p.file, m: p.m, i })).filter((p) => !door.includes(p.i));
  const axisT = (deg: number) => mul(at(0, -22, -150), mul(rot("x", deg), at(0, 22, 150)));
  const orig = door.map((i) => b.parts[i].m);
  let best = 90;
  for (let deg = 90; deg <= 150; deg += 0.5) {
    const T = axisT(deg);
    let ov = 0;
    for (const [k, i] of door.entries()) ov += findConnectionsForParts(b.lib, others, { file: b.parts[i].file, m: mul(T, orig[k]) }).overlap;
    if (process.env.M11_DBG) console.log("close", deg, ov.toFixed(1));
    if (ov > 1) break;
    best = deg;
  }
  const T = axisT(best);
  for (const [k, i] of door.entries()) b.parts[i].m = mul(T, orig[k]);
  if (process.env.M11_DBG) {
    console.log("door closed at", best, "degrees");
    for (const dg of [best, best + 0.5]) {
      const Tn = axisT(dg);
      for (const [k, i] of door.entries())
        for (const o of others) {
          const r = findConnectionsForParts(b.lib, [o], { file: b.parts[i].file, m: mul(Tn, orig[k]) });
          if (r.overlap > 0.05) console.log(`  ${dg}: ${b.parts[i].label} x ${b.parts[o.i].label}: ${r.overlap.toFixed(2)}`);
        }
    }
  }
}

/** Final pose: seen as on the last page (door on the right = +X), standing on y = 0, centred. */
function finish(b: Build) {
  // base frame B: its +x (front of the last steps) -> -Z, its +z (door side) -> +X
  const R = new Float64Array([0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0]);
  for (const p of b.parts) p.m = mul(R, p.m);
  const bb = b.bounds();
  const shift: V3 = [-(bb.min[0] + bb.max[0]) / 2, -bb.max[1], -(bb.min[2] + bb.max[2]) / 2];
  for (const p of b.parts) p.m = withT(p.m, [p.m[3] + shift[0], p.m[7] + shift[1], p.m[11] + shift[2]]);
  if (process.env.M11_DBG) {
    const f = b.bounds();
    console.log("bounds", f.min.map(Math.round), f.max.map(Math.round), "size mm", f.size.map((v) => Math.round(v * 0.4)));
    const base = b.parts.map((_, i) => i).filter((i) => /rock panel|base: brown 6x10|1x10|2x10/.test(b.parts[i].label ?? ""));
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const i of base) { const q = b.bounds(i); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q.min[k]); mx[k] = Math.max(mx[k], q.max[k]); } }
    console.log("base body", mn.map(Math.round), mx.map(Math.round));
  }
  return b;
}
