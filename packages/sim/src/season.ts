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
  missionModels: unknown[];
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
