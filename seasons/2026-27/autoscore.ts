// Automatic scoring for BIOGLOW (2026-27): reads the simulated field (a snapshot of every mission
// model body, see Simulation.snapshot) and answers the scoresheet questions it can judge reliably.
// Everything else is left for the team to fill in, with the reason.
//
// Pieces are found by their part labels (the "0 // label" lines of the mission model .ldr files),
// never by field model id, so models moved to another dock (M13-M15) are still found. A model the
// robot never came near is still frozen exactly as set up: its questions get their start answers.
// Once woken, a rule only answers when the physics state settles the question; where the model
// can't show it (a piece built into its model, a position the rulebook defines by pictures), or
// where a model settles by itself (known droops), it leaves the question and says why.

import type { Answers } from "./scoring";

type V3 = [number, number, number];
type Q4 = [number, number, number, number];

/** Structurally the same as FieldSnapshot from @fll-sim/sim. */
export interface Snapshot {
  timeMs: number;
  mat: { offsetX: number; offsetY: number };
  bodies: SnapBody[];
}
export interface SnapBody {
  id: string;
  model: string;
  labels: string[];
  parts: number;
  fixed: boolean;
  pts: V3[];
  pose: { p: V3; q: Q4 };
  start: { p: V3; q: Q4 };
  touches: string[];
  attached: string[];
  frozen: boolean;
}

export interface AutoScore {
  /** answers the field settles */
  answers: Answers;
  /** per question id: what was seen (answered questions) or why it is left to the team */
  notes: Record<string, string>;
}

/** Leaf habitat of M04 (the bold outline around the nest on the mat), mat frame mm. */
const LEAF_HABITAT = { cx: 121, cy: 1019, w: 132, h: 132 };
/** A piece this close to the mat (mm) touches it. */
const ON_MAT = 2;

// ---- geometry ------------------------------------------------------------------------------------
function rot(q: Q4, v: V3): V3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
const conj = (q: Q4): Q4 => [-q[0], -q[1], -q[2], q[3]];
type When = "pose" | "start";
/** Collider corners in the world (mm, y up). */
const world = (b: SnapBody, t: When = "pose"): V3[] => b.pts.map((p) => { const r = rot(b[t].q, p); return [r[0] + b[t].p[0], r[1] + b[t].p[1], r[2] + b[t].p[2]]; });
const centroid = (pts: V3[]): V3 => { const c: V3 = [0, 0, 0]; for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length; return c; };
const lowest = (b: SnapBody, t: When = "pose") => Math.min(...world(b, t).map((p) => p[1]));
const onMat = (b: SnapBody, t: When = "pose") => lowest(b, t) <= ON_MAT || (t === "pose" && b.touches.includes("mat"));
/** How far a body is from its set-up pose: centre displacement and rise (mm), rotation (degrees). */
function moved(b: SnapBody) {
  const c0 = centroid(world(b, "start")), c1 = centroid(world(b));
  const dot = Math.abs(b.pose.q[0] * b.start.q[0] + b.pose.q[1] * b.start.q[1] + b.pose.q[2] * b.start.q[2] + b.pose.q[3] * b.start.q[3]);
  return { mm: Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]), deg: (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI, rise: c1[1] - c0[1] };
}
const near = (b: SnapBody, mm: number, deg: number) => { const m = moved(b); return m.mm <= mm && m.deg <= deg; };
/** Mat frame (mm) of a world point. */
const toMat = (s: Snapshot, p: V3) => ({ x: p[0] - s.mat.offsetX, y: -p[2] - s.mat.offsetY });

// ---- finding pieces ------------------------------------------------------------------------------------
const has = (b: SnapBody, re: RegExp) => b.labels.some((l) => re.test(l));
/** All bodies of the model that has a body labelled like `re`. */
function modelOf(s: Snapshot, re: RegExp): SnapBody[] {
  const hit = s.bodies.find((b) => has(b, re));
  return hit ? s.bodies.filter((b) => b.model === hit.model) : [];
}
/** The robot hasn't come near the model: nothing in it has moved. */
const untouched = (bodies: SnapBody[]) => bodies.every((b) => b.fixed || b.frozen);
const loose = (l: string) => /\[loose:([^\]@~]+)/.exec(l)?.[1]?.trim();
/** Game pieces of a model (tag -> bodies made only of that piece's parts); pieces built into another body are listed in `builtIn`. */
function pieces(bodies: SnapBody[], re: RegExp) {
  const free = new Map<string, SnapBody[]>();
  const builtIn = new Set<string>();
  for (const b of bodies) {
    const tags = new Set(b.labels.map(loose).filter((t): t is string => !!t && re.test(t)));
    for (const t of tags) {
      if (b.labels.every((x) => loose(x) === t)) free.set(t, [...(free.get(t) ?? []), b]);
      else builtIn.add(t);
    }
  }
  for (const t of free.keys()) builtIn.delete(t);
  return { free, builtIn: [...builtIn] };
}
/** Still where it was set up on its model, or touching or held to any of `others`. (Contacts are
 *  only known after a physics step of a woken model: a piece that hasn't moved is where it was.) */
const onAny = (b: SnapBody, others: SnapBody[]) => near(b, 3, 3) || others.some((o) => b.touches.includes(o.id) || b.attached.includes(o.id));

// ---- the rules ------------------------------------------------------------------------------------
export function autoScore(s: Snapshot): AutoScore {
  const answers: Answers = {};
  const notes: Record<string, string> = {};
  const set = (id: string, v: boolean | number | string, why: string) => { answers[id] = v; notes[id] = why; };
  const manual = (id: string, why: string) => { notes[id] = why; };
  const missing = (ids: string[], what: string) => { for (const id of ids) manual(id, `no ${what} model on the field`); };

  // M01 Drone Survey
  const drone = s.bodies.find((b) => has(b, /^drone 2x4 plate/));
  if (drone) set("m01a", !onMat(drone), onMat(drone) ? "the drone is on the mat" : `the drone is ${lowest(drone).toFixed(0)} mm above the mat`);
  else missing(["m01a"], "Drone Survey");
  const map = s.bodies.find((b) => has(b, /^4x6 hollow technic brick/) && !b.fixed);
  if (map) {
    const turned = moved(map).deg;
    if (turned < 135) set("m01b", false, `the LiDAR map is turned ${turned.toFixed(0)}° from its start: not flipped over`);
    else manual("m01b", `the LiDAR map is flipped over (${turned.toFixed(0)}°): check that the scan marker is at least partly in the survey area`);
  } else missing(["m01b"], "LiDAR map");

  // M02 Exploding Seeds: seeds no longer touching the stalk
  const m02 = modelOf(s, /\[loose:seed \d/);
  const m02seeds = pieces(m02, /^seed \d/);
  if (m02.length) {
    const stalk = m02.filter((b) => !b.labels.every((l) => loose(l)?.startsWith("seed")));
    const seen: string[] = [];
    let off = 0;
    for (const [t, bs] of m02seeds.free) {
      const gone = bs.every((b) => !onAny(b, stalk));
      if (gone) off++;
      seen.push(`${t} ${gone ? "off" : "on the stalk"}`);
    }
    const stuck = m02seeds.builtIn.length ? `; ${m02seeds.builtIn.join(", ")} can't come off in this model yet (built into the stalk)` : "";
    set("m02", off, seen.join(", ") + stuck);
  } else missing(["m02"], "Exploding Seeds");

  // M03 Flip the Rock
  const m03 = modelOf(s, /^rotating platform/);
  const platform = m03.find((b) => has(b, /^rotating platform/));
  if (platform && untouched(m03)) set("m03a", false, "the robot hasn't touched Flip the Rock");
  else manual("m03a", platform ? "the research flag's down position isn't modelled yet: check it on the field" : "no Flip the Rock model on the field");
  if (platform) {
    const m = moved(platform);
    if (m.deg > 10) set("m03b", false, `the rock is turned ${m.deg.toFixed(0)}° from its starting position`);
    else if (untouched(m03)) set("m03b", false, "the robot hasn't touched Flip the Rock");
    else manual("m03b", "the rock is in its starting position: if it was flipped and put back, answer yes");
  } else missing(["m03b"], "Flip the Rock");

  // M04 Lucky Leaves
  const m04 = modelOf(s, /\[loose:katydid/);
  if (m04.length) {
    const { free } = pieces(m04, /^(leaf|katydid)/);
    const nest = m04.filter((b) => !b.labels.some((l) => loose(l)));
    const leaves = [...free].filter(([t]) => t.startsWith("leaf"));
    const removed = leaves.filter(([, bs]) => bs.every((b) => !onAny(b, nest))).length;
    set("m04a", removed, `${removed} of ${leaves.length} leaves off the nest`);
    const kat = [...free].find(([t]) => t.startsWith("katydid"))?.[1];
    if (kat) {
      const inside = kat.some((b) => world(b).some((p) => { const q = toMat(s, p); return Math.abs(q.x - LEAF_HABITAT.cx) <= LEAF_HABITAT.w / 2 && Math.abs(q.y - LEAF_HABITAT.cy) <= LEAF_HABITAT.h / 2; }));
      set("m04b", inside, inside ? "the katydid is at least partly in the leaf habitat" : "the katydid is completely outside the leaf habitat");
      const home = kat.every((b) => near(b, 5, 5));
      set("m04c", home, home ? "the katydid is in its starting position" : "the katydid was moved from its starting position");
    }
  } else missing(["m04a", "m04b", "m04c"], "Lucky Leaves");

  // M05 Reaching Roots
  const m05 = modelOf(s, /\(root arm/);
  if (m05.length && untouched(m05)) set("m05", "No", "the robot hasn't touched Reaching Roots");
  else manual("m05", m05.length ? "check how far the plant root is extended" : "no Reaching Roots model on the field");

  // M06 Leafcutter Frenzy, M07 Humongous Fungus
  const m06 = modelOf(s, /^cam \(tip/);
  for (const q of ["m06a", "m06b"]) manual(q, m06.length ? "the ant and the leaf fragments are built into the nest model here (not free pieces yet)" : "no Leafcutter Frenzy model on the field");
  if (m06.length && untouched(m06)) set("m07a", false, "the robot hasn't touched Humongous Fungus");
  else manual("m07a", m06.length ? "check that the mycelium is completely extended (the web arm droops by itself once woken)" : "no Humongous Fungus model on the field");
  manual("m07b", "needs the opposing team's table");

  // M08 Tangled, M09 Research Platform
  const vine = s.bodies.find((b) => has(b, /vine end/));
  if (vine) set("m08", onMat(vine), onMat(vine) ? "the vine touches the mat" : `the vine is ${lowest(vine).toFixed(0)} mm above the mat`);
  else missing(["m08"], "Tangled");
  const m09 = modelOf(s, /\[loose:research platform/);
  if (m09.length) {
    const fresh = untouched(m09);
    const plat = m09.filter((b) => b.labels.some((l) => loose(l)?.startsWith("research platform"))).sort((a, b) => b.parts - a.parts)[0];
    const rise = plat ? moved(plat).rise : 0;
    if (fresh || rise < 5) set("m09a", false, fresh ? "the robot hasn't touched the research platform" : "the research platform isn't raised");
    else if (rise >= 20) set("m09a", true, `the research platform is ${rise.toFixed(0)} mm higher`);
    else manual("m09a", `the research platform is ${rise.toFixed(0)} mm higher: check that it is raised`);
    const trap = m09.filter((b) => has(b, /^camera/));
    if (fresh || (trap.length && trap.every((b) => near(b, 5, 15)))) set("m09b", false, fresh ? "the robot hasn't touched the camera trap" : "the camera trap hasn't moved");
    else manual("m09b", "the camera trap has moved: check that it is deployed");
    const seed = m09.filter((b) => has(b, /\(seed\)/));
    const tree = m09.filter((b) => !seed.includes(b));
    if (seed.length) {
      const off = seed.every((b) => !onAny(b, tree));
      set("m09c", off, off ? "the seed is off the tree" : "the seed is still on the tree");
    }
  } else missing(["m09a", "m09b", "m09c"], "Research Platform");

  // M10 Fragile Microhabitats (No Equipment Constraint: no points while touching the robot)
  const habitat = (id: string, re: RegExp, name: string) => {
    const bs = modelOf(s, re);
    if (!bs.length) return missing([id], `${name} habitat`);
    // (its frame: hanging parts swing freely)
    const bad = bs.filter((b) => b.parts >= 3 && !near(b, 8, 15));
    if (bs.some((b) => b.touches.includes("robot"))) set(id, false, `the robot is touching the ${name} habitat`);
    else set(id, !bad.length, bad.length ? `the ${name} habitat was moved or knocked over` : `the ${name} habitat is in its starting position`);
  };
  habitat("m10a", /^spider( web)?:/, "spider");
  habitat("m10b", /^snail/, "snail");

  // M11 Window to the Past
  const door = s.bodies.find((b) => has(b, /^door:/) && !b.fixed);
  if (door) {
    const down = onMat(door) && !onMat(door, "start");
    set("m11", down, down ? "the root cover is down on the mat" : "the root cover isn't down on the mat");
  } else missing(["m11"], "Window to the Past");

  // M12 Forest Elder
  const m12 = modelOf(s, /\(support fork\)/);
  const cane = m12.find((b) => has(b, /\(support fork\)/));
  if (cane) {
    const turned = moved(cane).deg;
    const tree = m12.filter((b) => b.fixed);
    if (untouched(m12) || turned < 10) set("m12a", false, "the cane isn't raised");
    else if (turned > 60 && cane.touches.some((t) => tree.some((b) => b.id === t))) set("m12a", true, `the cane is raised (${turned.toFixed(0)}°) against the tree`);
    else manual("m12a", `the cane is turned ${turned.toFixed(0)}°: check that it is completely raised, touching the tree`);
  } else missing(["m12a"], "Forest Elder");
  const ring = pieces(m12, /^ring/).free.get("ring");
  const post = s.bodies.filter((b) => has(b, /\(post: /));
  if (ring && post.length) {
    const rp = world([...ring].sort((a, b) => b.parts - a.parts)[0]), pp = post.flatMap((b) => world(b));
    const rc = toMat(s, centroid(rp)), pc = toMat(s, centroid(pp));
    const d = Math.hypot(rc.x - pc.x, rc.y - pc.y);
    const low = Math.min(...rp.map((p) => p[1])) < Math.max(...pp.map((p) => p[1]));
    if (d < 15 && low) set("m12b", true, "the support tie is around the post");
    else if (d > 60) set("m12b", false, `the support tie is ${d.toFixed(0)} mm from the post`);
    else manual("m12b", "the support tie is next to the post: check that it is around it");
  } else missing(["m12b"], "Forest Elder post");

  // M13 Keystone Species: the team's own model isn't in the simulator
  manual("m13", "your keystone species isn't simulated: check it by hand");

  // M14 Seeds of Renewal: the M02 and M09 seeds
  const station = modelOf(s, /^rod swing/);
  if (station.length) {
    const base = station.find((b) => b.fixed) ?? [...station].sort((a, b) => b.parts - a.parts)[0];
    // contained: completely within the station's outline (in its own frame) and down in it (not on its top)
    const lo = [0, 1, 2].map((k) => Math.min(...base.pts.map((p) => p[k]))), hi = [0, 1, 2].map((k) => Math.max(...base.pts.map((p) => p[k])));
    const local = (p: V3) => rot(conj(base.pose.q), [p[0] - base.pose.p[0], p[1] - base.pose.p[1], p[2] - base.pose.p[2]]);
    const contained = (bs: SnapBody[]) => {
      const l = bs.flatMap((b) => world(b)).map(local);
      return l.every((q) => q[0] >= lo[0] && q[0] <= hi[0] && q[2] >= lo[2] && q[2] <= hi[2]) && Math.min(...l.map((q) => q[1])) < hi[1];
    };
    const seeds: SnapBody[][] = [...m02seeds.free.values()];
    const m09seed = m09.filter((b) => has(b, /\(seed\)/));
    if (m09seed.length) seeds.push(m09seed);
    const inStation = seeds.filter(contained);
    const onMatToo = inStation.filter((bs) => bs.some((b) => onMat(b)));
    set("m14a", inStation.length, `${inStation.length} seed${inStation.length === 1 ? "" : "s"} in the replantation station`);
    set("m14b", onMatToo.length, `${onMatToo.length} of them touching the mat`);
  } else missing(["m14a", "m14b"], "Seeds of Renewal");

  // M15 Biocentric Architecture
  const m15 = modelOf(s, /nesting canopy/);
  const canopy = m15.find((b) => has(b, /nesting canopy/) && !b.fixed);
  if (canopy) {
    const m = moved(canopy);
    if (m.deg < 5) set("m15a", false, "the nesting canopy is closed");
    else if (m.deg > 45 && m.rise > 5) set("m15a", true, `the nesting canopy is raised (${m.deg.toFixed(0)}°)`);
    else manual("m15a", `the nesting canopy is partly open (${m.deg.toFixed(0)}°): check that it is raised`);
    if (untouched(m15)) set("m15b", false, "the robot hasn't touched the building");
    else manual("m15b", "the garden skylight is part of the building in this model (it doesn't slide yet)");
    const hatch = m15.filter((b) => has(b, /^crank:/));
    const down = hatch.some((b) => onMat(b) && !onMat(b, "start"));
    set("m15c", down, down ? "the compost hatch is open, touching the mat" : "the compost hatch isn't touching the mat");
    const dock = /^dock-(farm|city|mine)$/.exec(canopy.model)?.[1];
    if (dock) set("m15d", dock === "mine" ? "Mine" : dock === "city" ? "City" : "Farm", `the building is on the ${dock} dock`);
  } else missing(["m15a", "m15b", "m15c"], "Biocentric Architecture");

  manual("pt", "precision tokens are counted by the referee");
  return { answers, notes };
}
