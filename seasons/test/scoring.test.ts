import { describe, expect, it } from "vitest";
import { defaultAnswers, maxScore, score } from "../2026-27/scoring";

describe("BIOGLOW scoring", () => {
  it("empty sheet scores the 6 precision tokens only", () => {
    expect(score(defaultAnswers()).total).toBe(50);
  });
  it("maximum score", () => {
    // EI 20, M01 30, M02 30, M03 30, M04 30, M05 20, M06 40, M07 40 (incl. two bonuses), M08 30,
    // M09 30, M10 20, M11 20, M12 30, M13 30, M14 40, M15 40, precision tokens 50 = 530
    expect(maxScore()).toBe(530);
  });
  it("Lucky Leaves follows Challenge Update 01", () => {
    const a = { ...defaultAnswers(), pt: 0, m04a: 2, m04b: true, m04c: true };
    expect(score(a).byMission.m04).toBe(30);
    expect(score({ ...a, m04c: false }).byMission.m04).toBe(10);
    expect(score({ ...a, m04b: false }).byMission.m04).toBe(0); // katydid outside the habitat
  });
  it("Seeds of Renewal bonus can't exceed seeds in the station", () => {
    expect(score({ ...defaultAnswers(), pt: 0, m14a: 2, m14b: 4 }).byMission.m14).toBe(20);
  });
  it("Biocentric Architecture environmental bonus depends on the dock", () => {
    const a = { ...defaultAnswers(), pt: 0, m15b: true, m15d: "City" };
    expect(score(a).byMission.m15).toBe(20);
    expect(score({ ...a, m15d: "Farm" }).byMission.m15).toBe(10);
  });
});
