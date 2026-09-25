// Scratch 3 project.json blocks <-> Blockly XML, the same translation scratch-vm does between
// its block store and the scratch-blocks workspace. The visual editor loads a project's blocks
// as XML and saves the workspace back into project.json, so .llsp3 files keep the SPIKE App's
// format (compressed primitives, shadow menus, [1|2|3, ...] inputs, mutations).

import type { ScratchBlock, ScratchProject } from "@fll-sim/llsp3";

type Target = ScratchProject["targets"][number];
type Blocks = Record<string, ScratchBlock | unknown[]>;

/** Compressed primitive type numbers used in project.json (see scratch-vm serialization/sb3). */
const PRIMITIVE: Record<number, { opcode: string; field: string }> = {
  4: { opcode: "math_number", field: "NUM" },
  5: { opcode: "math_positive_number", field: "NUM" },
  6: { opcode: "math_whole_number", field: "NUM" },
  7: { opcode: "math_integer", field: "NUM" },
  8: { opcode: "math_angle", field: "NUM" },
  9: { opcode: "colour_picker", field: "COLOUR" },
  10: { opcode: "text", field: "TEXT" },
  11: { opcode: "event_broadcast_menu", field: "BROADCAST_OPTION" },
  12: { opcode: "data_variable", field: "VARIABLE" },
  13: { opcode: "data_listcontents", field: "LIST" },
};
const PRIMITIVE_OF: Record<string, number> = Object.fromEntries(Object.entries(PRIMITIVE).map(([n, p]) => [p.opcode, Number(n)]));

/** Inputs that hold a stack of statements rather than a value. */
const isStatementInput = (name: string) => /^SUBSTACK\d*$/.test(name) || name === "custom_block";

/** The type Blockly gives a variable field for each kind of Scratch variable. */
const VAR_TYPE: Record<string, string> = { VARIABLE: "", LIST: "list", BROADCAST_OPTION: "broadcast_msg" };

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The (non-stage) sprite that holds the program: SPIKE projects have exactly one. */
export function programTarget(project: ScratchProject): Target {
  return project.targets.find((t) => !t.isStage) ?? project.targets[0];
}

// ---- project.json -> XML -------------------------------------------------------------

/** Blockly XML for a project's variables and blocks. */
export function projectToXml(project: ScratchProject): string {
  const out: string[] = ['<xml xmlns="http://www.w3.org/1999/xhtml">', "<variables>"];
  for (const t of project.targets) {
    const local = t.isStage ? "false" : "true";
    for (const [id, [name]] of Object.entries(t.variables ?? {}))
      out.push(`<variable type="" id="${esc(id)}" islocal="${local}" iscloud="false">${esc(name)}</variable>`);
    for (const [id, [name]] of Object.entries(t.lists ?? {}))
      out.push(`<variable type="list" id="${esc(id)}" islocal="${local}" iscloud="false">${esc(name)}</variable>`);
    for (const [id, name] of Object.entries(t.broadcasts ?? {}))
      out.push(`<variable type="broadcast_msg" id="${esc(id)}" islocal="false" iscloud="false">${esc(name)}</variable>`);
  }
  out.push("</variables>");
  const blocks = programTarget(project).blocks as Blocks;
  for (const [id, b] of Object.entries(blocks)) {
    if (Array.isArray(b)) {
      // top-level variable / list reporter: [12|13, name, id, x, y]
      const [type, name, vid, x, y] = b as [number, string, string, number, number];
      const p = PRIMITIVE[type];
      if (p && (type === 12 || type === 13))
        out.push(`<block type="${p.opcode}" id="${esc(id)}" x="${x ?? 0}" y="${y ?? 0}"><field name="${p.field}" id="${esc(vid)}" variabletype="${VAR_TYPE[p.field]}">${esc(name)}</field></block>`);
      continue;
    }
    if (b.topLevel) out.push(blockXml(blocks, id, false, b.x ?? 0, b.y ?? 0));
  }
  out.push("</xml>");
  return out.join("");
}

function blockXml(blocks: Blocks, id: string, asShadow: boolean, x?: number, y?: number): string {
  const b = blocks[id];
  if (!b || Array.isArray(b)) return "";
  const tag = asShadow || b.shadow ? "shadow" : "block";
  const pos = x !== undefined ? ` x="${Math.round(x)}" y="${Math.round(y ?? 0)}"` : "";
  let s = `<${tag} type="${esc(b.opcode)}" id="${esc(id)}"${pos}>`;
  if (b.mutation) s += mutationXml(b.mutation);
  for (const [name, f] of Object.entries(b.fields ?? {})) {
    const [value, fid] = f as [unknown, string | null | undefined];
    const vt = name in VAR_TYPE && fid ? ` id="${esc(fid)}" variabletype="${VAR_TYPE[name]}"` : "";
    s += `<field name="${esc(name)}"${vt}>${esc(value)}</field>`;
  }
  for (const [name, inp] of Object.entries(b.inputs ?? {})) {
    const [kind, a, c] = inp as [number, unknown, unknown];
    const el = isStatementInput(name) ? "statement" : "value";
    let inner = "";
    if (kind === 1) inner = refXml(blocks, a, true);
    // everything inside a shadow must be a shadow too (e.g. a My Block prototype's arguments)
    else if (kind === 2) inner = refXml(blocks, a, tag === "shadow");
    else if (kind === 3) inner = refXml(blocks, c, true) + refXml(blocks, a, tag === "shadow");
    if (inner) s += `<${el} name="${esc(name)}">${inner}</${el}>`;
  }
  if (b.next) s += `<next>${blockXml(blocks, b.next, false)}</next>`;
  return s + `</${tag}>`;
}

/** An input's block or shadow: a block id or a compressed primitive. */
function refXml(blocks: Blocks, ref: unknown, shadow: boolean): string {
  if (ref === null || ref === undefined) return "";
  if (typeof ref === "string") return blockXml(blocks, ref, shadow);
  if (!Array.isArray(ref)) return "";
  const [type, value, vid] = ref as [number, unknown, string | undefined];
  const p = PRIMITIVE[type];
  if (!p) return "";
  const id = `p${Math.random().toString(36).slice(2, 12)}`;
  // variable and list reporters are real blocks; everything else is an editable shadow
  const tag = type === 12 || type === 13 ? "block" : shadow ? "shadow" : "block";
  const vt = type >= 11 ? ` id="${esc(vid)}" variabletype="${VAR_TYPE[p.field]}"` : "";
  return `<${tag} type="${p.opcode}" id="${id}"><field name="${p.field}"${vt}>${esc(value)}</field></${tag}>`;
}

function mutationXml(m: Record<string, unknown>): string {
  const attrs = Object.entries(m)
    .filter(([k]) => k !== "tagName" && k !== "children")
    .map(([k, v]) => ` ${k}="${esc(typeof v === "string" ? v : JSON.stringify(v))}"`)
    .join("");
  return `<mutation${attrs}></mutation>`;
}

// ---- XML -> project.json -------------------------------------------------------------

interface Flat {
  id: string;
  opcode: string;
  shadow: boolean;
  topLevel: boolean;
  parent: string | null;
  next: string | null;
  x?: number;
  y?: number;
  fields: Record<string, [string, string | null]>;
  inputs: Record<string, { block: string | null; shadow: string | null }>;
  mutation?: Record<string, unknown>;
}

const children = (el: Element) => Array.from(el.children);
const tagOf = (el: Element) => el.tagName.toLowerCase();

function flatten(el: Element, parent: string | null, out: Map<string, Flat>, top: boolean, inShadow = false): string {
  const id = el.getAttribute("id") || `b${Math.random().toString(36).slice(2, 12)}`;
  const f: Flat = {
    id,
    opcode: el.getAttribute("type") ?? "",
    // a My Block's prototype is always a shadow in project.json, however the editor made it
    shadow: inShadow || tagOf(el) === "shadow" || el.getAttribute("type") === "procedures_prototype",
    topLevel: top,
    parent,
    next: null,
    fields: {},
    inputs: {},
  };
  if (top) {
    f.x = Math.round(Number(el.getAttribute("x") ?? 0));
    f.y = Math.round(Number(el.getAttribute("y") ?? 0));
  }
  out.set(id, f);
  for (const c of children(el)) {
    const t = tagOf(c);
    if (t === "field") f.fields[c.getAttribute("name")!] = [c.textContent ?? "", c.getAttribute("id")];
    else if (t === "mutation") {
      const m: Record<string, unknown> = { tagName: "mutation", children: [] };
      for (const a of Array.from(c.attributes)) m[a.name] = a.value;
      f.mutation = m;
    } else if (t === "value" || t === "statement") {
      const inp = { block: null as string | null, shadow: null as string | null };
      for (const g of children(c)) {
        const gt = tagOf(g);
        if (gt === "shadow" || g.getAttribute("type") === "procedures_prototype" || (f.shadow && gt === "block")) inp.shadow = flatten(g, id, out, false, true);
        else if (gt === "block") inp.block = flatten(g, id, out, false);
      }
      if (!inp.block) inp.block = inp.shadow;
      f.inputs[c.getAttribute("name")!] = inp;
    } else if (t === "next") {
      const nb = children(c).find((g) => tagOf(g) === "block");
      if (nb) f.next = flatten(nb, id, out, false);
    }
  }
  return id;
}

/**
 * Replace the program's blocks (and variables) with those of a Blockly workspace saved as XML.
 * Everything else in `base` (stage, costumes, monitors, meta) is kept.
 */
export function xmlToProject(xml: Element, base: ScratchProject): ScratchProject {
  const project: ScratchProject = JSON.parse(JSON.stringify(base));
  const target = programTarget(project);
  const stage = project.targets.find((t) => t.isStage) ?? target;

  // variables: keep existing values, drop deleted ones, add new ones to the stage (global)
  const oldVars = new Map<string, { t: Target; value: unknown }>();
  const oldLists = new Map<string, { t: Target; value: unknown[] }>();
  for (const t of project.targets) {
    for (const [id, [, v]] of Object.entries(t.variables ?? {})) oldVars.set(id, { t, value: v });
    for (const [id, [, v]] of Object.entries(t.lists ?? {})) oldLists.set(id, { t, value: v });
    t.variables = {};
    t.lists = {};
    t.broadcasts = {};
  }
  const flat = new Map<string, Flat>();
  for (const el of children(xml)) {
    const t = tagOf(el);
    if (t === "variables") {
      for (const v of children(el)) {
        const id = v.getAttribute("id")!;
        const name = v.textContent ?? "";
        const type = v.getAttribute("type") ?? "";
        if (type === "list") {
          const prev = oldLists.get(id);
          (prev?.t ?? stage).lists[id] = [name, prev?.value ?? []];
        } else if (type === "broadcast_msg") stage.broadcasts[id] = name;
        else {
          const prev = oldVars.get(id);
          (prev?.t ?? stage).variables[id] = [name, prev?.value ?? 0];
        }
      }
    } else if (t === "block" || t === "shadow") flatten(el, null, flat, true);
  }

  // compress into project.json form
  const blocks: Blocks = {};
  const compressed = new Set<string>();
  const compress = (id: string | null): unknown => {
    if (!id) return null;
    const f = flat.get(id);
    if (!f) return null;
    const type = PRIMITIVE_OF[f.opcode];
    if (type === undefined) return id;
    const [value, vid] = Object.values(f.fields)[0] ?? ["", null];
    // literals are compressed only as shadows; variable/list reporters always
    if (type <= 11 && !f.shadow) return id;
    compressed.add(id);
    return type >= 11 ? [type, value, vid] : [type, value];
  };
  const inputsOf = (f: Flat) => {
    const inputs: Record<string, unknown[]> = {};
    for (const [name, { block, shadow }] of Object.entries(f.inputs)) {
      if (!block && !shadow) continue;
      if (block === shadow) inputs[name] = [1, compress(shadow)];
      else if (!shadow) inputs[name] = [2, compress(block)];
      else inputs[name] = [3, compress(block), compress(shadow)];
    }
    return inputs;
  };
  const withInputs = [...flat.values()].map((f) => [f, inputsOf(f)] as const);
  for (const [f, inputs] of withInputs) {
    if (compressed.has(f.id)) continue;
    if (f.topLevel && (f.opcode === "data_variable" || f.opcode === "data_listcontents")) {
      const [name, vid] = Object.values(f.fields)[0] ?? ["", null];
      blocks[f.id] = [PRIMITIVE_OF[f.opcode], name, vid, f.x ?? 0, f.y ?? 0];
      continue;
    }
    const b: ScratchBlock = {
      opcode: f.opcode,
      next: f.next,
      parent: f.parent,
      inputs,
      fields: f.fields,
      shadow: f.shadow,
      topLevel: f.topLevel,
    };
    if (f.mutation) b.mutation = f.mutation;
    if (f.topLevel) {
      b.x = f.x;
      b.y = f.y;
    }
    blocks[f.id] = b;
  }
  target.blocks = blocks;

  // SPIKE lists the block extensions a project uses
  const ext = new Set<string>();
  for (const b of Object.values(blocks)) {
    if (Array.isArray(b)) continue;
    const m = /^(flipper\w+|linegraphmonitor|bargraphmonitor|displaymonitor|weather)_/.exec(b.opcode);
    if (m) ext.add(m[1]);
  }
  project.extensions = [...ext];
  return project;
}

/** An empty SPIKE Word Blocks project (a stage and one sprite, as the SPIKE App saves them). */
export function emptyProject(): ScratchProject {
  const costume = (name: string, cx: number, cy: number) => ({
    assetId: "d41d8cd98f00b204e9800998ecf8427e",
    name,
    bitmapResolution: 1,
    md5ext: "d41d8cd98f00b204e9800998ecf8427e.svg",
    dataFormat: "svg",
    rotationCenterX: cx,
    rotationCenterY: cy,
  });
  return {
    targets: [
      { isStage: true, name: "Stage", variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, costumes: [costume("backdrop1", 47, 55)], sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: "on", textToSpeechLanguage: null } as Target,
      { isStage: false, name: "Program", variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0, costumes: [costume("costume1", 240, 180)], sounds: [], volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false, rotationStyle: "all around" } as Target,
    ],
    monitors: [],
    extensions: [],
    meta: { semver: "3.0.0", vm: "0.2.0", agent: "FLL Sim" },
  };
}
