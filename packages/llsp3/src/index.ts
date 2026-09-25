// SPIKE App 3 project files (.llsp3): a zip containing manifest.json, icon.svg and either
// projectbody.json (Python: {"main": source}) or scratch.sb3 (Word Blocks, a Scratch 3 project zip).

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export interface Llsp3Manifest {
  type: "python" | "word-blocks" | string;
  name: string;
  id?: string;
  created?: string;
  lastsaved?: string;
  version?: number;
  extensions?: string[];
  [k: string]: unknown;
}

export type Llsp3Project =
  | { kind: "python"; manifest: Llsp3Manifest; source: string; files: Record<string, Uint8Array> }
  | { kind: "word-blocks"; manifest: Llsp3Manifest; project: ScratchProject; sb3: Record<string, Uint8Array>; files: Record<string, Uint8Array> };

/** Scratch 3 project.json (only the parts we use). */
export interface ScratchProject {
  targets: {
    isStage: boolean;
    name: string;
    variables: Record<string, [string, unknown]>;
    lists: Record<string, [string, unknown[]]>;
    broadcasts: Record<string, string>;
    blocks: Record<string, ScratchBlock | unknown[]>;
  }[];
  [k: string]: unknown;
}

export interface ScratchBlock {
  opcode: string;
  next: string | null;
  parent: string | null;
  inputs: Record<string, unknown[]>;
  fields: Record<string, unknown[]>;
  shadow: boolean;
  topLevel: boolean;
  mutation?: Record<string, unknown>;
  x?: number;
  y?: number;
}

export function readLlsp3(data: Uint8Array): Llsp3Project {
  const files = unzipSync(data);
  const mf = files["manifest.json"];
  if (!mf) throw new Error("Not a SPIKE project: manifest.json missing");
  const manifest = JSON.parse(strFromU8(mf)) as Llsp3Manifest;
  if (files["projectbody.json"]) {
    const body = JSON.parse(strFromU8(files["projectbody.json"])) as { main?: string };
    return { kind: "python", manifest, source: body.main ?? "", files };
  }
  if (files["scratch.sb3"]) {
    const sb3 = unzipSync(files["scratch.sb3"]);
    const pj = sb3["project.json"];
    if (!pj) throw new Error("scratch.sb3 has no project.json");
    return { kind: "word-blocks", manifest, project: JSON.parse(strFromU8(pj)) as ScratchProject, sb3, files };
  }
  throw new Error(`Unsupported SPIKE project type "${manifest.type}"`);
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" rx="8" fill="#ffd500"/><text x="30" y="38" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#000">py</text></svg>`;

function randomId(n = 12) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/**
 * Write a Python .llsp3. When `base` (a previously opened project) is given, its manifest
 * and extra files are preserved so the SPIKE App keeps its metadata.
 */
export function writePythonLlsp3(source: string, name: string, base?: Llsp3Project): Uint8Array {
  const now = new Date().toISOString();
  const prev = base?.kind === "python" ? base : undefined;
  const body = strToU8(JSON.stringify({ main: source }));
  const manifest: Llsp3Manifest = {
    ...(prev?.manifest ?? { type: "python", autoDelete: false, created: now, id: randomId(), slotIndex: 0, workspaceX: 120, workspaceY: 120, zoomLevel: 0.5, showAllBlocks: false, version: 38, hardware: {}, state: { canvasDrawerOpen: false }, extraFiles: [] }),
    type: "python",
    name,
    lastsaved: now,
    size: body.length,
  };
  const files: Record<string, Uint8Array> = {
    ...(prev?.files ?? {}),
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "projectbody.json": body,
  };
  if (!files["icon.svg"]) files["icon.svg"] = strToU8(ICON);
  return zipSync(files);
}

const BLOCKS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect width="60" height="60" rx="8" fill="#ffd500"/><rect x="14" y="18" width="32" height="10" rx="3" fill="#0090f5"/><rect x="14" y="32" width="24" height="10" rx="3" fill="#ff4ccd"/></svg>`;

/**
 * Write a Word Blocks .llsp3 (manifest + scratch.sb3 holding project.json). When `base` (a
 * previously opened Word Blocks project) is given, its manifest, icon and sb3 assets are kept.
 */
export function writeBlocksLlsp3(project: ScratchProject, name: string, base?: Llsp3Project): Uint8Array {
  const now = new Date().toISOString();
  const prev = base?.kind === "word-blocks" ? base : undefined;
  const pj = strToU8(JSON.stringify(project));
  // costumes reference an empty SVG by its MD5 (that of zero bytes)
  const sb3: Record<string, Uint8Array> = { "d41d8cd98f00b204e9800998ecf8427e.svg": new Uint8Array(0), ...(prev?.sb3 ?? {}), "project.json": pj };
  const sb3zip = zipSync(sb3);
  const manifest: Llsp3Manifest = {
    ...(prev?.manifest ?? { autoDelete: false, created: now, id: randomId(), slotIndex: 0, workspaceX: 120, workspaceY: 120, zoomLevel: 0.675, showAllBlocks: false, version: 38, hardware: {}, state: { playMode: "download", canvasDrawerOpen: false, hasMonitors: false }, extraFiles: [] }),
    type: "word-blocks",
    name,
    lastsaved: now,
    size: sb3zip.length,
    extensions: (project.extensions as string[] | undefined) ?? [],
  };
  const files: Record<string, Uint8Array> = {
    ...(prev?.files ?? {}),
    "manifest.json": strToU8(JSON.stringify(manifest)),
    "scratch.sb3": sb3zip,
  };
  if (!files["icon.svg"]) files["icon.svg"] = strToU8(BLOCKS_ICON);
  return zipSync(files);
}
