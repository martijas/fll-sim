// Where the robot may start: completely inside one of the launch areas (rulebook: "the robot and
// anything it is about to move must fit completely inside the launch area"). The robot's outline
// seen from above (with its tools) is checked against the launch area's quarter circle, and a
// start pose that doesn't fit is moved to the nearest one that does.

import type { RobotModel } from "./model";
import type { SeasonConfig } from "./season";
import { shapeCorners } from "./shapes";
import type { StartPose } from "./world";

/** A 2D point, mm. Robot outlines: x = to the robot's right, y = forward. Mat points: x east, y north. */
export interface Pt { x: number; y: number }

type LaunchArea = SeasonConfig["launchAreas"][number];

/** Convex hull (counterclockwise) of points. */
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The robot's outline seen from above (robot frame: x right, y forward), mm: the convex hull of
 * all its parts, tools included, as they are when it starts.
 */
export function robotOutline(robot: RobotModel): Pt[] {
  const pts: Pt[] = [];
  // (robot bodies all start at the robot's origin: their shapes are in the robot's frame;
  //  robot forward is -z)
  for (const b of robot.bodies) for (const s of b.shapes) for (const c of shapeCorners(s)) pts.push({ x: c.x, y: -c.z });
  if (!pts.length) {
    const { w, l } = robot.footprintMm;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push({ x: (sx * w) / 2, y: (sy * l) / 2 });
  }
  return convexHull(pts);
}

/** An outline (robot frame) placed on the mat at `pose`. */
export function outlineAt(outline: Pt[], pose: StartPose): Pt[] {
  const a = (pose.headingDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // heading 0 faces north (+y); positive turns counterclockwise seen from above
  return outline.map((p) => ({ x: pose.xMm + p.x * c - p.y * s, y: pose.yMm + p.x * s + p.y * c }));
}

/** The constraints of a launch area: within the radius of its corner, and on the mat side of the
 *  two straight edges through the corner (`edges`: false = only the radius, see homeAreaOf). */
function constraints(season: SeasonConfig, la: LaunchArea, edges: boolean) {
  const C = la.centerMm, ms = season.mat.sizeMm;
  const sx = C.x < ms.w / 2 ? 1 : -1, sy = C.y < ms.h / 2 ? 1 : -1;
  return { C, r: la.radiusMm, sx: edges ? sx : 0, sy: edges ? sy : 0 };
}

/** How far a point is outside a launch area, mm (0 = inside). */
function outside(k: ReturnType<typeof constraints>, p: Pt): number {
  const dx = p.x - k.C.x, dy = p.y - k.C.y;
  return Math.max(0, Math.hypot(dx, dy) - k.r, -k.sx * dx, -k.sy * dy);
}

/** The launch area the robot is completely inside at `pose` (its id), or null. */
export function launchAreaOf(season: SeasonConfig, outline: Pt[], pose: StartPose, tolMm = 0.01): string | null {
  const pts = outlineAt(outline, pose);
  for (const la of season.launchAreas) {
    const k = constraints(season, la, true);
    if (pts.every((p) => outside(k, p) <= tolMm)) return la.id;
  }
  return null;
}

/**
 * The home area the robot has come back to (its id), or null. Coming home, the robot may stick
 * out past the mat's edges and the walls; it has to be within the launch area's arc.
 */
export function homeAreaOf(season: SeasonConfig, outline: Pt[], pose: StartPose): string | null {
  const pts = outlineAt(outline, pose);
  for (const la of season.launchAreas) {
    const k = constraints(season, la, false);
    if (pts.every((p) => outside(k, p) <= 0.01)) return la.id;
  }
  return null;
}

/** The launch area nearest to a mat point. */
export function nearestLaunchArea(season: SeasonConfig, p: Pt): string | null {
  let best: LaunchArea | null = null, bd = Infinity;
  for (const la of season.launchAreas) {
    const d = Math.hypot(p.x - la.centerMm.x, p.y - la.centerMm.y);
    if (d < bd) [best, bd] = [la, d];
  }
  return best?.id ?? null;
}

/**
 * The nearest robot position (same heading) to `want` at which the whole outline is inside the
 * launch area, `marginMm` clear of its edges (Dykstra's projection onto the intersection of the
 * constraints: one disc per outline corner, and the two straight edges).
 */
function project(k: ReturnType<typeof constraints>, outline: Pt[], want: Pt, marginMm: number): { p: Pt; over: number } {
  const r = k.r - marginMm;
  // the robot's centre may be anywhere within r of (corner - offset) for every outline corner…
  const discs = outline.map((o) => ({ x: k.C.x - o.x, y: k.C.y - o.y }));
  // …and far enough from the straight edges for its furthest point
  const minX = Math.max(...outline.map((o) => -k.sx * o.x)) + marginMm, minY = Math.max(...outline.map((o) => -k.sy * o.y)) + marginMm;
  const sets: ((q: Pt) => Pt)[] = discs.map((c) => (q: Pt) => {
    const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy);
    return d <= r ? q : { x: c.x + (dx * r) / d, y: c.y + (dy * r) / d };
  });
  if (k.sx) sets.push((q) => (k.sx * (q.x - k.C.x) >= minX ? q : { x: k.C.x + k.sx * minX, y: q.y }));
  if (k.sy) sets.push((q) => (k.sy * (q.y - k.C.y) >= minY ? q : { x: q.x, y: k.C.y + k.sy * minY }));
  let x = { ...want };
  const inc = sets.map(() => ({ x: 0, y: 0 }));
  for (let it = 0; it < 3000; it++) {
    let moved = 0;
    sets.forEach((P, i) => {
      const y = { x: x.x + inc[i].x, y: x.y + inc[i].y };
      const n = P(y);
      inc[i] = { x: y.x - n.x, y: y.y - n.y };
      moved = Math.max(moved, Math.abs(n.x - x.x), Math.abs(n.y - x.y));
      x = n;
    });
    if (moved < 1e-6) break;
  }
  // how far the robot still sticks out (more than 0 when it can't fit at this heading)
  const pts = outlineAt(outline, { xMm: x.x, yMm: x.y, headingDeg: 0 });
  return { p: x, over: Math.max(...pts.map((q) => outside(k, q))) };
}

export interface FitResult {
  pose: StartPose;
  /** the launch area it is in (or the one it was pushed towards, when it doesn't fit) */
  area: string;
  /** whether the robot fits completely in the launch area at this heading */
  fits: boolean;
  /** whether the pose had to be changed */
  moved: boolean;
}

/**
 * Put a start pose completely inside a launch area: the pose itself when it already is, else the
 * nearest position at the same heading that is (`area`: that launch area; otherwise the one that
 * needs the smallest move). Positions are rounded to whole mm, headings to `headingStepDeg`.
 */
export function fitInLaunchArea(season: SeasonConfig, outline: Pt[], pose: StartPose, opts: { area?: string | null; marginMm?: number; headingStepDeg?: number } = {}): FitResult {
  const step = opts.headingStepDeg ?? 0.1;
  const heading = Math.round(wrap180(pose.headingDeg) / step) * step;
  const want: StartPose = { xMm: pose.xMm, yMm: pose.yMm, headingDeg: Number(heading.toFixed(3)) };
  const inArea = launchAreaOf(season, outline, want);
  if (inArea && (!opts.area || opts.area === inArea)) return { pose: want, area: inArea, fits: true, moved: want.headingDeg !== pose.headingDeg };
  const a = (want.headingDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const rotated = outline.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
  const margin = opts.marginMm ?? 0.75; // (rounding to whole mm moves the robot up to 0.71 mm)
  // (the nearest launch area it fits in; when it fits in none, the one it sticks out of least)
  const score = (c: { over: number; d: number }) => (c.over <= 0.01 ? c.d : 1e9 + c.over);
  let best: { area: string; p: Pt; over: number; d: number } | null = null;
  for (const la of season.launchAreas) {
    if (opts.area && la.id !== opts.area) continue;
    const r = project(constraints(season, la, true), rotated, { x: want.xMm, y: want.yMm }, margin);
    const cand = { area: la.id, ...r, d: Math.hypot(r.p.x - want.xMm, r.p.y - want.yMm) };
    if (!best || score(cand) < score(best)) best = cand;
  }
  if (!best) return { pose: want, area: opts.area ?? "", fits: false, moved: false };
  const out: StartPose = { xMm: Math.round(best.p.x), yMm: Math.round(best.p.y), headingDeg: want.headingDeg };
  return { pose: out, area: best.area, fits: launchAreaOf(season, outline, out) === best.area, moved: out.xMm !== pose.xMm || out.yMm !== pose.yMm || out.headingDeg !== pose.headingDeg };
}

/** Degrees wrapped to (-180, 180]. */
export function wrap180(d: number): number {
  const x = ((((d + 180) % 360) + 360) % 360) - 180;
  return x === -180 ? 180 : x;
}

/** The same alignment in the other launch area: mirrored across the mat's centre line. */
export function mirrorPose(season: SeasonConfig, pose: StartPose): StartPose {
  return { xMm: season.mat.sizeMm.w - pose.xMm, yMm: pose.yMm, headingDeg: wrap180(-pose.headingDeg) };
}
