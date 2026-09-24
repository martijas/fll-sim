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
