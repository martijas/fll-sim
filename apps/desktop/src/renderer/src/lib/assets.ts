import type { SeasonConfig } from "@fll-sim/sim";
import type { MatPayload } from "../worker/protocol";

declare global {
  interface Window {
    fllsim: import("../../../preload/index").FllSimApi;
  }
}

export async function loadSeason(id: string): Promise<SeasonConfig> {
  const bytes = await window.fllsim.readAsset(`seasons/${id}/season.json`);
  if (!bytes) throw new Error(`season ${id} not found`);
  return JSON.parse(new TextDecoder().decode(bytes)) as SeasonConfig;
}

export interface LoadedMat {
  canvas: HTMLCanvasElement;
  payload: MatPayload;
}

/** Load the mat image into a canvas (for the texture) and raw RGBA (for the colour sensor). */
export async function loadMatImage(bytes: Uint8Array): Promise<LoadedMat> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]));
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { canvas, payload: { width: img.width, height: img.height, data: img.data.buffer.slice(0) } };
}

/** The team's imported mat if there is one, else the development placeholder (source checkout only). */
export async function loadDefaultMat(season: SeasonConfig): Promise<LoadedMat | null> {
  const user = await window.fllsim.loadUserMat(season.id);
  if (user) return loadMatImage(user);
  const rel = season.mat.image?.default;
  if (!rel) return null;
  const bytes = await window.fllsim.readAsset(rel);
  return bytes ? loadMatImage(bytes) : null;
}

/** A real-part mission model shipped with the season: its .ldr and its pose on the mat. */
export interface BundledMission {
  id: string;
  text: string;
  pose: { xMm: number; yMm: number; headingDeg: number };
  /** false = not held by Dual Lock */
  fixed?: boolean;
}

/** The season's published mission models (seasons/<id>/mission-models.json), empty if none. */
export async function loadBundledMissions(id: string): Promise<Record<string, BundledMission>> {
  const bytes = await window.fllsim.readAsset(`seasons/${id}/mission-models.json`);
  if (!bytes) return {};
  const index = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, { file: string; pose: BundledMission["pose"]; fixed?: boolean }>;
  const out: Record<string, BundledMission> = {};
  await Promise.all(
    Object.entries(index).map(async ([mid, e]) => {
      const ldr = await window.fllsim.readAsset(e.file);
      if (ldr) out[mid] = { id: mid, text: new TextDecoder("latin1").decode(ldr), pose: e.pose, fixed: e.fixed };
    }),
  );
  return out;
}
