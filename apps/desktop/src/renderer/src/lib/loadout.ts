// Robots and tools: the preset driving bases and modular tools shipped with FLL Sim, the team's
// own tools from the builder, and putting a robot together with the tools it carries.

import type { Library } from "@fll-sim/ldraw";
import { assemble, attachTool, findMounts, parseModel, type ModelPart } from "@fll-sim/assembly";
import type { RobotModel, SeasonConfig, StartPose } from "@fll-sim/sim";

export interface CatalogEntry { id: string; name: string; text: string; note?: string; /** drive motor ports, left then right (robots) */ drive?: string }

/** Index files list the bundled models: [{ id, name, file, note? }]. */
async function loadIndex(dir: string): Promise<CatalogEntry[]> {
  const bytes = await window.fllsim.readAsset(`apps/desktop/resources/${dir}/index.json`);
  if (!bytes) return [];
  const list = JSON.parse(new TextDecoder().decode(bytes)) as { id: string; name: string; file: string; note?: string; drive?: string }[];
  const out: CatalogEntry[] = [];
  for (const e of list) {
    const b = await window.fllsim.readAsset(`apps/desktop/resources/${dir}/${e.file}`);
    if (b) out.push({ id: e.id, name: e.name, note: e.note, drive: e.drive, text: new TextDecoder("latin1").decode(b) });
  }
  return out;
}

export const loadPresetRobots = () => loadIndex("robots");
export const loadBundledTools = () => loadIndex("tools");

const CUSTOM_TOOLS = "fllsim.customTools";
/** The team's own tools (built in the builder): name -> .ldr text. */
export function loadCustomTools(): CatalogEntry[] {
  try {
    const m = JSON.parse(localStorage.getItem(CUSTOM_TOOLS) ?? "{}") as Record<string, string>;
    return Object.entries(m).map(([name, text]) => ({ id: `custom:${name}`, name, text }));
  } catch {
    return [];
  }
}
export function saveCustomTool(name: string, text: string | null) {
  try {
    const m = JSON.parse(localStorage.getItem(CUSTOM_TOOLS) ?? "{}") as Record<string, string>;
    if (text === null) delete m[name];
    else m[name] = text;
    localStorage.setItem(CUSTOM_TOOLS, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export interface Loadout {
  robot: RobotModel;
  /** tools that went on, with the mount they use */
  fitted: { id: string; mount: string }[];
  /** tools that don't fit this robot (no mount with the same name) */
  unfit: string[];
  warnings: string[];
  /** the robot's mount names (none: it can't take tools) */
  mounts: string[];
}

/** A robot (LDraw parts) with the chosen tools put on at their mounts. */
export function buildLoadout(lib: Library, name: string, robotParts: ModelPart[], tools: CatalogEntry[]): Loadout {
  let parts = robotParts;
  const fitted: Loadout["fitted"] = [], unfit: string[] = [];
  const attached: { parts: (p: ModelPart) => boolean; pointLdu: [number, number, number] }[] = [];
  const used = new Set<string>();
  for (const t of tools) {
    const toolParts = parseModel(lib, t.text).parts;
    // each mount takes one tool: try the tool's mounts in order, skipping ones already taken
    const names = findMounts(toolParts).map((m) => m.name).filter((n) => !used.has(n));
    const r = names.map((n) => attachTool(parts, toolParts, t.id, n)).find(Boolean);
    if (!r) {
      unfit.push(t.name);
      continue;
    }
    used.add(r.mount);
    parts = r.parts;
    fitted.push({ id: t.id, mount: r.mount });
    const tag = `[tool:${t.id}]`;
    attached.push({ parts: (p) => (p.label ?? "").includes(tag), pointLdu: r.pointLdu as [number, number, number] });
  }
  const a = assemble(lib, parts, { name, breakable: true, attached });
  return { robot: a.robot, fitted, unfit, warnings: a.report.warnings, mounts: [...new Set(findMounts(robotParts).map((m) => m.name))] };
}

/** Whether the robot at `pose` is completely inside one of the home (launch) areas, and which. */
export function homeArea(season: SeasonConfig, robot: RobotModel, pose: StartPose): string | null {
  const half = Math.hypot(robot.footprintMm.w, robot.footprintMm.l) / 2;
  for (const la of season.launchAreas) {
    const d = Math.hypot(pose.xMm - la.centerMm.x, pose.yMm - la.centerMm.y);
    if (d + half <= la.radiusMm) return la.id;
  }
  return null;
}
