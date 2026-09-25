// Mission 14 Seeds of Renewal (bag 21 + two black 11x7 frames, two brown 15L beams and a dark grey
// 15x11 frame from bag 0), scripted from the official building instructions (text-bi-12 + book-12).
// LDraw frame: -Y up, -Z = front (towards the builder), +X = right. 1 stud = 20 LDU = 8 mm.
//
// Two separate pieces (the book: "You do not need to combine the two parts of this build"):
//  * the replantation station ("rectangle", steps 1-20): two black 11x7 end frames (x = +-140),
//    joined by two green side assemblies (bottom) and two brown 15L beams (top). Inside hang, on
//    free-spinning grey pins, six "soil rod" swings across the station (step 19, pivot axis Z) and two
//    long swings between the end frames (step 20, pivot axis X). Each end carries a turning latch: a
//    brown axle column (5L axle w/ stop + bush + green 2L arm + axle joiner + 3L axle w/ stop) that
//    rotates in the frame's top and bottom beams, with the lime cross block / grey brick / yellow
//    tile handle on top.
//  * the dock base (step 21): the dark grey 15x11 frame lying flat on the mat, with two black 5x7
//    frames standing upright outside its short sides (back half) and two black 3L beams inside its
//    front corners. The station stands on it: the end frames sit on the dock's short sides, held
//    between the two 5x7 uprights (x), and each 5x7 upright sits between the two green 1L beams on
//    the end frame's outer face (z) - that is how it "latches" (as in the field setup photo).
//
// Orientation: long axis of the station along X as in the text's steps 18-21 (the dock's 3L beams
// at the front, -Z; the 5x7 uprights at the back half). The field setup photo shows the station
// seen from its -X end (end 2 = steps 9-15) with the 5x7 upright on the viewer's left.
// Seeds: the four seeds scored here are the three M02 seeds and the M09 seed (other books); book 12
// contains no seed pieces. They are placed into the station from above, through the swinging rods,
// and score the bonus when they reach the mat through the dock's open centre.
import { type Library, type Mat4 } from "@fll-sim/ldraw";
import { Build, orient } from "../src/build";

const BLACK = 0, RED = 4, YELLOW = 14, GREEN = 2, BGREEN = 10, LIME = 27, BROWN = 70, LBG = 71, DBG = 72, NOUGAT = 84, DKGREEN = 288;
const PIN = "61332.dat", GPIN = "3673.dat", L1 = "18654.dat", L3 = "32523.dat", L9 = "40490.dat", L15 = "32278.dat", LBENT = "32526.dat";
const F711 = "39794.dat", F1115 = "39790.dat", F57 = "64179.dat", BLOCK33 = "39793.dat";
const PINBRICK = "53540.dat", TILE12 = "3069b.dat", XBLOCK = "42003.dat", AX5S = "15462.dat", AX3S = "24316.dat", BUSH = "3713.dat";
const ARM2 = "60483.dat", JOIN2 = "59443.dat", JOIN3 = "42195.dat", AX2 = "32062.dat";

type V3 = [number, number, number];
type Dir = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const O = (x: Dir, y: Dir, z: Dir) => (p: V3): Mat4 => orient(x, y, z, p);

// orientations (where the part's own X, Y, Z axes point)
const ALONG_X = O("+x", "+y", "+z"); // pins / axles (own X) along world +X
const ALONG_NX = O("-x", "+y", "-z"); // ... pointing -X
const PIN_Z = O("+z", "+y", "-x"); // own X along world +Z
const PIN_NZ = O("-z", "+y", "+x"); // own X along world -Z
const PIN_Y = O("+y", "+x", "-z"); // own X along world +Y (down)
const PIN_NY = O("-y", "+x", "+z"); // own X along world -Y (up)
const HOLES_X = O("+z", "+x", "+y"); // 1L beam: hole (own Y) along world X
const JOIN_Y = O("+x", "-z", "+y"); // joiners / bushes (own Z) vertical
const JOIN_X = O("-z", "+y", "+x"); // joiners (own Z) along world X
const JOIN_Z = O("+x", "+y", "+z"); // joiners (own Z) along world Z
const END_FRAME = O("+y", "-x", "+z"); // 11x7 frame upright in the YZ plane: 7 tall, 11 wide along Z
const BEAM_X = O("+y", "+z", "+x"); // straight beam along X, holes along Z
const HANG_ZHOLES = O("-x", "+z", "+y"); // 3L beam hanging (long along Y), holes along Z
const HANG_XHOLES = O("+z", "+x", "+y"); // 3L beam hanging, holes along X
const DOCK_BEAM = O("-y", "+x", "+z"); // 3L beam lying along Z, holes along X

// ---- heights -----------------------------------------------------------------------------------
const DOCK_Y = -10; // dock frame centre (lies on the mat, y 0..-20)
// end frame centre: the frame bottom is 2 LDU above the dock top (y = -20), the station resting on
// the stops of the two 3L latch axles that stick out under the bottom beams
const YC = -92;
const XE = 140; // end frames at x = +-140 (station outer faces at +-150)

/**
 * One end of the station (steps 1-7 / 9-15). `s` = +1: end 1 at x = +140; -1: end 2 at x = -140.
 * World z of a hole seen from the end's own building view: end 1 z = -xBuild, end 2 z = +xBuild, so
 * both ends end up with the latch at z = +80 (back), the 3x3 block at z = -60 and the green 1L beams
 * at z = +100 and z = -60.
 */
function end(b: Build, s: 1 | -1) {
  const name = s > 0 ? "end 1" : "end 2";
  const X = s * XE, out = s * (XE + 10); // frame centre plane / outer face
  // 1.1 black 11x7 frame, upright
  const f = b.put(F711, BLACK, END_FRAME([X, YC, 0]), 0, `${name}: black 11x7 frame`);
  // 1.2 / 2 two pins from the back (outer face) into the bottom beam, green 1L beams on them
  for (const z of [100, -60]) {
    b.put(PIN, BLACK, ALONG_X([out, YC + 60, z]), 1, `${name}: pin (bottom beam, outer face)`);
    b.put(L1, BGREEN, HOLES_X([out + s * 10, YC + 60, z]), 1, `${name}: green 1L beam`);
  }
  b.step();
  // 3 3x3 square block with two pins, pins down into the top side of the bottom beam
  for (const z of [-80, -40]) b.put(PIN, BLACK, PIN_Y([X, YC + 50, z]), 1, `${name}: pin (under 3x3 block)`);
  b.put(BLOCK33, DBG, END_FRAME([X, YC + 20, -60]), 2, `${name}: dark grey 3x3 block`);
  b.step();
  // 4 latch handle on top: lime cross block (axle hole over the 2nd hole of the top beam, z = +80),
  //   grey 1x2 brick with two pins outboard of it (yellow tile on top), brown 5L axle w/ stop down
  //   through the cross block and the top beam
  b.put(XBLOCK, LIME, O("-y", "-z", "+x")([X, YC - 80, 60]), 0, `${name}: lime cross block (latch handle)`);
  b.put(PINBRICK, LBG, (s > 0 ? O("-z", "+y", "+x") : O("+z", "+y", "-x"))([X + s * 20, YC - 90, 50]), 1, `${name}: grey 1x2 brick with 2 pins`);
  b.put(TILE12, YELLOW, (s > 0 ? O("-z", "+y", "+x") : O("+z", "+y", "-x"))([X + s * 20, YC - 98, 50]), 1, `${name}: yellow 1x2 tile`);
  b.put(AX5S, BROWN, PIN_NY([X, YC - 90 + 48, 80]), 2, `${name}: brown 5L axle w/ stop (latch column)`);
  b.step();
  // 5 red bush under the top beam
  b.put(BUSH, RED, JOIN_Y([X, YC - 40, 80]), 1, `${name}: red bush`);
  b.step();
  // 6 green 2L arm (axle hole on the column, pin hole towards the middle of the frame, -z), brown
  //   2L axle joiner
  b.put(ARM2, GREEN, O("-x", "+y", "-z")([X, YC - 20, 80]), 1, `${name}: green 2L latch arm`);
  b.put(JOIN2, BROWN, JOIN_Y([X, YC + 10, 80]), 1, `${name}: brown 2L axle joiner`);
  b.step();
  // 7 brown 3L axle w/ stop from below through the bottom beam into the joiner
  b.put(AX3S, BROWN, PIN_Y([X, YC + 70 - 28, 80]), 2, `${name}: brown 3L axle w/ stop`);
  b.step();
  return f;
}

/**
 * Side assembly (step 8 / 17): bright green 9L with two green 3x5 L beams (3L arms up at the ends),
 * pinned to the end frames' upright beams (bottom two edge holes). `z` = side of the station.
 */
function side(b: Build, zs: 1 | -1, first: boolean) {
  const name = first ? "side 1" : "side 2";
  const zL = zs * 120, z9 = zs * 100, zp = zs * 110;
  // L beams: corner hole at (+-140, -50), 3L arm up, 5L arm towards the middle
  b.put(LBENT, GREEN, O("-y", "+z", "-x")([-60, YC + 40, zL]), 0, `${name}: green 3x5 L beam (left)`);
  b.put(LBENT, GREEN, O("-y", "-z", "+x")([60, YC + 40, zL]), 0, `${name}: green 3x5 L beam (right)`);
  // pins between the 9L and the L beams (two each end), 9L on them
  for (const x of [-80, -60, 60, 80]) b.put(PIN, BLACK, PIN_Z([x, YC + 40, zp]), 1, `${name}: pin (9L to L beam)`);
  b.put(L9, BGREEN, BEAM_X([0, YC + 40, z9]), 4, `${name}: bright green 9L beam`);
  // pins from the L beams' corner and top holes into the end frames' bottom two edge holes
  // (the middle edge hole's snap is missing from the frame's data: it connects to the L beam only)
  for (const x of [-140, 140]) for (const y of [YC + 40, YC]) b.put(PIN, BLACK, PIN_Z([x, y, zp]), 1, `${name}: pin (L beam to end frame)`);
}

export function build(lib: Library) {
  const b = new Build(lib, "M14 Seeds of Renewal");

  // ---- Steps 1-8: end 1 and side 1 -----------------------------------------------------------------
  end(b, 1);
  side(b, -1, true);
  b.step();
  // ---- Steps 9-16: end 2, joined to side 1 ---------------------------------------------------------
  end(b, -1);
  b.step();
  // ---- Step 17: side 2 -----------------------------------------------------------------------------
  side(b, 1, false);
  b.step();

  // ---- Step 18: brown 15L beams on the top free edge holes, six grey (free) pins facing inwards ----
  for (const zs of [-1, 1] as const) {
    for (const x of [-140, 140]) b.put(PIN, BLACK, PIN_Z([x, YC - 40, zs * 110]), 1, "pin (15L to end frame)");
    b.put(L15, BROWN, BEAM_X([0, YC - 40, zs * 120]), 2, zs < 0 ? "brown 15L beam (front)" : "brown 15L beam (back)");
    for (const x of [-100, -60, -20, 20, 60, 100]) b.put(GPIN, LBG, PIN_Z([x, YC - 40, zs * 110]), 1, "grey pin (swing pivot)");
  }
  b.step();

  // ---- Step 19: six soil-rod swings across the station (pivot = grey pins, axis Z) ----------------
  for (const x of [-100, -60, -20, 20, 60, 100]) {
    b.put(L3, BROWN, HANG_ZHOLES([x, YC - 20, 100]), 1, "rod swing: brown 3L (back)");
    b.put(AX5S, BROWN, PIN_Z([x, YC, 110 - 48]), 1, "rod swing: brown 5L axle w/ stop");
    b.put(JOIN3, NOUGAT, JOIN_Z([x, YC, 0]), 1, "rod swing: nougat 3L axle joiner");
    b.put(L3, BROWN, HANG_ZHOLES([x, YC - 20, -100]), 1, "rod swing: brown 3L (front)");
    b.put(AX5S, BROWN, PIN_NZ([x, YC, -110 + 48]), 2, "rod swing: brown 5L axle w/ stop");
  }
  b.step();

  // ---- Step 20: two long swings between the end frames (pivot = grey pins in the top beams' face
  //      holes, axis X). Built "right" liftarm first: the text's right = our -X (its view is from the
  //      other side of the station).
  for (const z of [-20, 20]) {
    b.put(GPIN, LBG, ALONG_X([-130, YC - 60, z]), 1, "long swing: grey pin (end 2)");
    b.put(L3, BROWN, HANG_XHOLES([-120, YC - 40, z]), 1, "long swing: brown 3L (end 2)");
    b.put(AX5S, BROWN, ALONG_NX([-130 + 48, YC - 20, z]), 1, "long swing: brown 5L axle w/ stop");
    b.put(JOIN2, BROWN, JOIN_X([-30, YC - 20, z]), 1, "long swing: brown 2L axle joiner");
    b.put(AX2, RED, ALONG_X([-10, YC - 20, z]), 1, "long swing: red 2L axle");
    b.put(JOIN3, DKGREEN, JOIN_X([20, YC - 20, z]), 1, "long swing: dark green 3L axle joiner");
    b.put(GPIN, LBG, ALONG_X([130, YC - 60, z]), 1, "long swing: grey pin (end 1)");
    b.put(L3, BROWN, HANG_XHOLES([120, YC - 40, z]), 1, "long swing: brown 3L (end 1)");
    b.put(AX5S, BROWN, ALONG_X([130 - 48, YC - 20, z]), 2, "long swing: brown 5L axle w/ stop");
  }
  b.step();

  // ---- Step 21: the dock base (separate piece; the station stands on it) --------------------------
  b.place(F1115, DBG, O("+z", "+y", "-x")([0, DOCK_Y, 0]), "dock: dark grey 15x11 frame");
  for (const xs of [-1, 1]) {
    // 21.1-21.2 pins out of the short sides (back hole, and one hole skipped in front of it)
    for (const z of [80, 0]) b.put(PIN, BLACK, ALONG_X([xs * 150, DOCK_Y, z]), z === 0 ? 0 : 1, "dock: pin (outer side)");
    // 21.3 black 3L beams with two pins, inside the front corners
    for (const z of [-80, -40]) b.put(PIN, BLACK, ALONG_X([xs * 130, DOCK_Y, z]), 1, "dock: pin (inner side)");
    b.put(L3, BLACK, DOCK_BEAM([xs * 120, DOCK_Y, -60]), 2, "dock: black 3L beam (front corner)");
    // 21.4 black 5x7 frames upright on the outer pins (bottom corner holes)
    b.put(F57, BLACK, (xs > 0 ? O("+z", "+x", "+y") : O("-z", "-x", "+y"))([xs * 160, DOCK_Y - 60, 40]), 1, "dock: black 5x7 upright frame");
  }
  b.step();
  return b;
}
