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
  /** Interchangeable models (M13-15): where their dock is in the model (mm) and which way it faces. */
  dock?: { x: number; z: number; dirDeg: number };
}

export type DockName = "farm" | "city" | "mine";
/** A dock location on the mat: centre (mm) and the direction its uprights face (deg). */
export interface DockSite { xMm: number; yMm: number; dirDeg: number }

/** The season's published mission models (seasons/<id>/mission-models.json) and dock locations. */
export async function loadBundledMissions(id: string): Promise<{ models: Record<string, BundledMission>; docks: Partial<Record<DockName, DockSite>> }> {
  const bytes = await window.fllsim.readAsset(`seasons/${id}/mission-models.json`);
  if (!bytes) return { models: {}, docks: {} };
  type Entry = { file: string; pose: BundledMission["pose"]; fixed?: boolean; dock?: BundledMission["dock"] };
  const raw = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  const docks = (raw._docks ?? {}) as Partial<Record<DockName, DockSite>>;
  delete raw._docks;
  const index = raw as Record<string, Entry>;
  const models: Record<string, BundledMission> = {};
  await Promise.all(
    Object.entries(index).map(async ([mid, e]) => {
      const ldr = await window.fllsim.readAsset(e.file);
      if (ldr) models[mid] = { id: mid, text: new TextDecoder("latin1").decode(ldr), pose: e.pose, fixed: e.fixed, dock: e.dock };
    }),
  );
  return { models, docks };
}

/** Where to put an interchangeable model so its dock sits on a dock location. */
export function poseOnDock(model: BundledMission, site: DockSite): BundledMission["pose"] {
  const d = model.dock!;
  const h = site.dirDeg - d.dirDeg, r = (h * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { xMm: site.xMm - (c * d.x - s * d.z), yMm: site.yMm - (s * d.x + c * d.z), headingDeg: ((h % 360) + 360) % 360 };
}
