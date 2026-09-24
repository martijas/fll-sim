import type { MatPlacement } from "@fll-sim/units";

export interface SeasonConfig {
  id: string;
  name: string;
  table: {
    interiorMm: { w: number; h: number };
    wall: { thicknessMm: number; heightMm: number };
    surfaceMm: { w: number; h: number };
  };
  mat: {
    sizeMm: { w: number; h: number };
    placement: "south-centered";
    image?: { default?: string; pxPerMm: number };
  };
  launchAreas: { id: string; color: string; shape: "quarter-circle"; centerMm: { x: number; y: number }; radiusMm: number }[];
  robotLimits: { heightMm: number };
  match: { durationS: number; precisionTokens: number };
  missionModels: MissionModelSpec[];
}

export type Footprint =
  | { kind: "rect"; cx: number; cy: number; w: number; h: number; rot: number }
  | { kind: "circle"; cx: number; cy: number; r: number };

/** A mission model's place on the mat (from the wireframe) and its stand-in block. */
export interface MissionModelSpec {
  id: string;
  missions: number[];
  name: string;
  shape: Footprint;
  heightMm: number;
  color: string;
  dock?: "farm" | "city" | "mine";
  note?: string;
}

/** Where the mat's SW corner sits relative to the table interior SW corner (mm). */
export function matPlacement(s: SeasonConfig): MatPlacement {
  return {
    offsetX: (s.table.interiorMm.w - s.mat.sizeMm.w) / 2,
    offsetY: 0,
  };
}

/** RGBA mat image, row 0 = north edge (as printed/viewed from the south). */
export interface MatImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
