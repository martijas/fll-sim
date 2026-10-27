import { describe, expect, it } from "vitest";
import season from "../../../seasons/2026-27/season.json";
import { fitInLaunchArea, homeAreaOf, launchAreaOf, makeDriveBase, mirrorPose, outlineAt, robotOutline, type Pt, type SeasonConfig } from "../src";

const S = season as SeasonConfig;
/** A 200 x 100 mm robot (100 wide, 200 long) centred on its origin. */
const box: Pt[] = [{ x: -50, y: -100 }, { x: 50, y: -100 }, { x: 50, y: 100 }, { x: -50, y: 100 }];

describe("launch areas", () => {
  it("outline of the drive base covers its parts, front is +y", () => {
    const o = robotOutline(makeDriveBase());
    const xs = o.map((p) => p.x), ys = o.map((p) => p.y);
    expect(Math.max(...xs)).toBeGreaterThan(50);
    expect(Math.min(...xs)).toBeLessThan(-50);
    // (the distance sensor sits at the front)
    expect(Math.max(...ys)).toBeGreaterThan(90);
  });

  it("places an outline by heading (0 = north, counterclockwise)", () => {
    const [p] = outlineAt([{ x: 0, y: 10 }], { xMm: 100, yMm: 100, headingDeg: 90 });
    expect(p.x).toBeCloseTo(90);
    expect(p.y).toBeCloseTo(100);
  });

  it("knows which launch area the robot is completely in", () => {
    expect(launchAreaOf(S, box, { xMm: 150, yMm: 200, headingDeg: 0 })).toBe("left");
    expect(launchAreaOf(S, box, { xMm: 1850, yMm: 200, headingDeg: 0 })).toBe("right");
    // sticking out over the mat's edge, past the arc, or in the middle of the field
    expect(launchAreaOf(S, box, { xMm: 30, yMm: 200, headingDeg: 0 })).toBeNull();
    expect(launchAreaOf(S, box, { xMm: 300, yMm: 380, headingDeg: 0 })).toBeNull();
    expect(launchAreaOf(S, box, { xMm: 1000, yMm: 500, headingDeg: 0 })).toBeNull();
  });

  it("leaves a pose that fits alone", () => {
    const r = fitInLaunchArea(S, box, { xMm: 150, yMm: 200, headingDeg: 0 });
    expect(r).toMatchObject({ pose: { xMm: 150, yMm: 200, headingDeg: 0 }, area: "left", fits: true, moved: false });
  });

  it("moves a pose that doesn't fit to the nearest one that does", () => {
    for (const want of [{ xMm: 30, yMm: 200, headingDeg: 0 }, { xMm: 400, yMm: 400, headingDeg: 30 }, { xMm: 150, yMm: -50, headingDeg: 90 }, { xMm: 700, yMm: 600, headingDeg: -45 }]) {
      const r = fitInLaunchArea(S, box, want);
      expect(r.fits).toBe(true);
      expect(r.moved).toBe(true);
      expect(r.area).toBe("left");
      expect(r.pose.headingDeg).toBeCloseTo(want.headingDeg);
      expect(launchAreaOf(S, box, r.pose)).toBe("left");
    }
    // against the mat's edge: only x changes, to just clear it
    const r = fitInLaunchArea(S, box, { xMm: 30, yMm: 200, headingDeg: 0 });
    expect(r.pose.yMm).toBe(200);
    expect(r.pose.xMm).toBeGreaterThanOrEqual(50);
    expect(r.pose.xMm).toBeLessThanOrEqual(52);
  });

  it("goes to the nearer launch area, or the one asked for", () => {
    expect(fitInLaunchArea(S, box, { xMm: 1500, yMm: 300, headingDeg: 0 }).area).toBe("right");
    expect(fitInLaunchArea(S, box, { xMm: 600, yMm: 300, headingDeg: 0 }).area).toBe("left");
    const r = fitInLaunchArea(S, box, { xMm: 150, yMm: 200, headingDeg: 0 }, { area: "right" });
    expect(r.area).toBe("right");
    expect(launchAreaOf(S, box, r.pose)).toBe("right");
  });

  it("says so when the robot is too big for a launch area", () => {
    const huge: Pt[] = [{ x: -300, y: -300 }, { x: 300, y: -300 }, { x: 300, y: 300 }, { x: -300, y: 300 }];
    expect(fitInLaunchArea(S, huge, { xMm: 200, yMm: 200, headingDeg: 0 }).fits).toBe(false);
  });

  it("mirrors an alignment into the other launch area", () => {
    const m = mirrorPose(S, { xMm: 150, yMm: 200, headingDeg: 30 });
    expect(m).toEqual({ xMm: 1850, yMm: 200, headingDeg: -30 });
    expect(launchAreaOf(S, box, m)).toBe("right");
  });

  it("coming home, the robot may stick out past the mat's edge", () => {
    expect(homeAreaOf(S, box, { xMm: 30, yMm: 200, headingDeg: 0 })).toBe("left");
    expect(homeAreaOf(S, box, { xMm: 300, yMm: 380, headingDeg: 0 })).toBeNull();
  });
});
