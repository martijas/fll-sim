// Optical sensor models. Values follow the SPIKE 3 Python API ranges.

import type { MatImage } from "./season";

export const Color = {
  BLACK: 0, MAGENTA: 1, PURPLE: 2, BLUE: 3, AZURE: 4, TURQUOISE: 5, GREEN: 6, YELLOW: 7, ORANGE: 8, RED: 9, WHITE: 10, UNKNOWN: -1,
} as const;

export interface RGB { r: number; g: number; b: number } // sRGB 0..1

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Average mat colour in a disc of radius `rMm` around (xMm, yMm) in the mat frame. */
export function sampleMat(img: MatImage, pxPerMm: number, xMm: number, yMm: number, rMm: number, matHMm: number): RGB | null {
  const cx = xMm * pxPerMm;
  const cy = (matHMm - yMm) * pxPerMm; // row 0 = north edge
  const rp = Math.max(0.5, rMm * pxPerMm);
  let sr = 0, sg = 0, sb = 0, n = 0;
  // Sample on a fixed polar pattern (cheap, deterministic): centre + 2 rings of 8.
  const pts: [number, number][] = [[0, 0]];
  for (const f of [0.5, 1]) for (let k = 0; k < 8; k++) pts.push([Math.cos((k * Math.PI) / 4) * rp * f, Math.sin((k * Math.PI) / 4) * rp * f]);
  for (const [dx, dy] of pts) {
    const px = Math.floor(cx + dx), py = Math.floor(cy + dy);
    if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
    const i = (py * img.width + px) * 4;
    sr += img.data[i]; sg += img.data[i + 1]; sb += img.data[i + 2]; n++;
  }
  if (n === 0) return null;
  return { r: sr / n / 255, g: sg / n / 255, b: sb / n / 255 };
}

/**
 * Signal strength vs height of the sensor face above the surface (mm). SPIKE colour sensors
 * read best at ~8–16 mm; beyond ~40 mm the LED return fades out.
 */
export function heightFactor(hMm: number): number {
  if (hMm <= 16) return 1;
  if (hMm >= 60) return 0;
  if (hMm <= 40) return 1 - ((hMm - 16) / 24) * 0.85;
  return 0.15 * (1 - (hMm - 40) / 20);
}

export const spotRadiusMm = (hMm: number) => 2.5 + 0.12 * Math.max(0, hMm);

export interface ColorReading {
  reflection: number; // 0..100
  rgbi: [number, number, number, number]; // 0..1024
  color: number;
}

export interface ColorCalibration {
  /** reflection = offset + gain * f(luminance); defaults match a typical printed mat. */
  offset: number;
  gain: number;
}
export const DEFAULT_CALIBRATION: ColorCalibration = { offset: 12, gain: 92 };

export function colorReading(c: RGB | null, hMm: number, cal: ColorCalibration = DEFAULT_CALIBRATION): ColorReading {
  const f = c ? heightFactor(hMm) : 0;
  if (!c || f <= 0) return { reflection: 0, rgbi: [0, 0, 0, 0], color: Color.UNKNOWN };
  const lr = srgbToLinear(c.r), lg = srgbToLinear(c.g), lb = srgbToLinear(c.b);
  const lum = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const reflection = Math.round(Math.max(0, Math.min(100, f * (cal.offset + cal.gain * Math.pow(lum, 0.6)))));
  const k = 1024 * f;
  const rgbi: [number, number, number, number] = [
    Math.round(Math.min(1024, (0.05 + 0.95 * lr) * k)),
    Math.round(Math.min(1024, (0.05 + 0.95 * lg) * k)),
    Math.round(Math.min(1024, (0.05 + 0.95 * lb) * k)),
    Math.round(Math.min(1024, (0.05 + 0.95 * lum) * k)),
  ];
  return { reflection, rgbi, color: f < 0.3 ? Color.UNKNOWN : classify(c) };
}

/** Classify an sRGB colour into the SPIKE colour set. */
export function classify(c: RGB): number {
  const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
  const v = max, s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.22) return Color.BLACK;
  if (s < 0.22) return v > 0.62 ? Color.WHITE : Color.BLACK;
  let h: number;
  const d = max - min;
  if (max === c.r) h = ((c.g - c.b) / d) % 6;
  else if (max === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 12 || h >= 340) return Color.RED;
  if (h < 38) return Color.ORANGE;
  if (h < 70) return Color.YELLOW;
  if (h < 165) return Color.GREEN;
  if (h < 205) return Color.AZURE;
  if (h < 255) return Color.BLUE;
  return Color.MAGENTA;
}

export function parseHexColor(hex: string): RGB {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
