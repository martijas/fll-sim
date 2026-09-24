// Builds the bundled LDraw part pack + catalog for the app:
//  - SPIKE Prime set (45678) and Expansion v2 (45681) inventories (Rebrickable CSV dumps)
//  - the season Challenge Set elements (element IDs extracted from FIRST's element overview PDF)
//  - every geometry file those parts reference, plus LDCad shadow snap data
// Output: apps/desktop/resources/ldraw/pack.json.gz and catalog.json
//
//   pnpm --filter @fll-sim/ldraw-pack run build-pack [--elements resources/.../element-overview.pdf]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { Library, flatten, normName, parseLines } from "@fll-sim/ldraw";
import { dirSource, findLDrawDir, findShadowDir } from "@fll-sim/ldraw/node";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const cache = `${process.env.HOME}/.cache/fll-sim`;
const RB = join(cache, "rebrickable");
const OUT = join(repo, "apps/desktop/resources/ldraw");

const ldrawDir = findLDrawDir();
const shadowDir = findShadowDir();
if (!ldrawDir) throw new Error("LDraw library not found (download complete.zip to ~/.cache/fll-sim/ldraw)");
const src = dirSource(ldrawDir);
const shadow = shadowDir ? dirSource(shadowDir) : undefined;
const lib = new Library(src, shadow);

// ---- CSV helpers ------------------------------------------------------------------------
function csv(name: string): string[][] {
  const text = gunzipSync(readFileSync(join(RB, `${name}.csv.gz`))).toString("utf8");
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const row: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else cur += c;
    }
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// ---- colour mapping: Rebrickable colour id -> LDraw code ------------------------------------
const rbColors = new Map(csv("colors").map(([id, name, rgb]) => [Number(id), { name, rgb }]));
const norm = (s: string) => s.toLowerCase().replace(/gray/g, "grey").replace(/[^a-z0-9]/g, "");
const ldByName = new Map([...lib.colors.values()].map((c) => [norm(c.name), c.code]));
function ldColor(rbId: number): number {
  const c = rbColors.get(rbId);
  if (!c) return 16;
  const byName = ldByName.get(norm(c.name));
  if (byName !== undefined) return byName;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.rgb.slice(i, i + 2), 16));
  let best = 16, bd = Infinity;
  for (const lc of lib.colors.values()) {
    if (lc.code > 511 || lc.alpha < 255 !== (c.name.startsWith("Trans"))) continue;
    const d = (lc.rgb[0] - r) ** 2 + (lc.rgb[1] - g) ** 2 + (lc.rgb[2] - b) ** 2;
    if (d < bd) { bd = d; best = lc.code; }
  }
  return best;
}

// ---- part mapping: Rebrickable part_num -> LDraw file ----------------------------------------
const kwIndex = new Map<string, string>();
{
  const list = execFileSync("bash", ["-c", `grep -il "!KEYWORDS" ${ldrawDir}/parts/*.dat || true`], { maxBuffer: 1 << 28 }).toString().trim().split("\n");
  for (const path of list) {
    if (!path) continue;
    const file = path.split("/").pop()!.toLowerCase();
    const text = readFileSync(path, "latin1");
    for (const m of text.matchAll(/(?:Rebrickable|BrickLink)\s+([A-Za-z0-9-]+)/g)) if (!kwIndex.has(m[1].toLowerCase())) kwIndex.set(m[1].toLowerCase(), file);
  }
}
const rbParts = new Map(csv("parts").map(([num, name]) => [num, name]));
function ldPart(rb: string): string | null {
  const f = ldPartRaw(rb);
  if (!f) return null;
  // Follow "~Moved to xxx" redirect files.
  const moved = lib.get(f)?.title.match(/^~Moved to\s+(\S+)/i);
  return moved ? `${moved[1].toLowerCase().replace(/\.dat$/, "")}.dat` : f;
}
function ldPartRaw(rb: string): string | null {
  const n = rb.toLowerCase();
  const tries = [n, n.replace(/pr0*(\d+)$/, "p$1"), n.replace(/pr\d+$/, ""), n.replace(/[a-z]$/, ""), n.replace(/c\d+$/, "c01")];
  for (const t of tries) if (src.read(`parts/${t}.dat`)) return `${t}.dat`;
  if (kwIndex.has(n)) return kwIndex.get(n)!;
  return null;
}

// ---- inventories ----------------------------------------------------------------------------
const invBySet = new Map<string, number>();
for (const [id, ver, set] of csv("inventories")) {
  const prev = invBySet.get(set);
  if (prev === undefined || Number(ver) > 0) invBySet.set(set, Number(id));
}
const invParts = csv("inventory_parts");

interface Entry { file: string; name: string; colors: Record<number, number>; rb: string[] }
const categories: { id: string; name: string; entries: Map<string, Entry> }[] = [];
const unmapped: string[] = [];

// The hub is sold with its battery: offer the complete assembly, not the two halves.
const OVERRIDE: Record<string, string | null> = { "45601.dat": "45601c01.dat", "45610.dat": null };

function addTo(cat: { entries: Map<string, Entry> }, rbPart: string, rbColor: number, qty: number) {
  let file = ldPart(rbPart);
  if (file && file in OVERRIDE) file = OVERRIDE[file];
  if (!file) {
    unmapped.push(`${rbPart} (${rbParts.get(rbPart) ?? "?"})`);
    return;
  }
  const f = lib.get(file);
  const e = cat.entries.get(file) ?? { file, name: f?.title ?? rbParts.get(rbPart) ?? file, colors: {}, rb: [] };
  const lc = ldColor(rbColor);
  e.colors[lc] = (e.colors[lc] ?? 0) + qty;
  if (!e.rb.includes(rbPart)) e.rb.push(rbPart);
  cat.entries.set(file, e);
}

for (const [set, name] of [["45678-1", "SPIKE Prime Core Set"], ["45681-1", "SPIKE Prime Expansion Set"]]) {
  const inv = invBySet.get(set);
  const cat = { id: set, name, entries: new Map<string, Entry>() };
  for (const [iid, part, color, qty, spare] of invParts) if (Number(iid) === inv && spare !== "True") addTo(cat, part, Number(color), Number(qty));
  categories.push(cat);
}

// Challenge Set elements from the element overview PDF (element id -> part + colour).
const pdfArg = process.argv.indexOf("--elements");
const pdf = pdfArg > 0 ? resolve(process.argv[pdfArg + 1]) : join(repo, "resources/2026-27-bioglow/building-instructions/element-overview.pdf");
if (existsSync(pdf)) {
  const text = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString();
  const ids = new Set([...text.matchAll(/\b(\d{6,7})\b/g)].map((m) => m[1]));
  const elements = new Map(csv("elements").map(([eid, part, color]) => [eid, { part, color: Number(color) }]));
  const cat = { id: "challenge", name: "BIOGLOW Challenge Set", entries: new Map<string, Entry>() };
  let missing = 0;
  for (const id of ids) {
    const e = elements.get(id);
    if (e) addTo(cat, e.part, e.color, 1);
    else missing++;
  }
  console.log(`challenge set: ${ids.size} element ids, ${missing} not in Rebrickable elements`);
  categories.push(cat);
}

// Extras every builder needs.
const extras = { id: "extra", name: "Common Technic & bricks", entries: new Map<string, Entry>() };
for (const f of ["2780.dat", "3673.dat", "61332.dat", "43093.dat", "6558.dat", "32054.dat", "3749.dat", "4519.dat", "3705.dat", "32073.dat", "3706.dat", "3707.dat", "3737.dat", "6536.dat", "32184.dat", "3713.dat", "4265c.dat", "66906.dat", "3001.dat", "3003.dat", "3004.dat", "3010.dat", "3020.dat", "3022.dat", "3023.dat", "3024.dat", "3068b.dat", "3069b.dat", "3070b.dat", "3700.dat", "3701.dat", "3702.dat", "3894.dat", "32009.dat", "32278.dat", "64179.dat", "39790.dat", "39789.dat"]) {
  if (lib.get(f)) extras.entries.set(f, { file: f, name: lib.get(f)!.title, colors: { 15: 1, 0: 1, 71: 1, 4: 1 }, rb: [] });
}
categories.push(extras);

// ---- dependency closure ----------------------------------------------------------------------
const files = new Map<string, string>();
const shadowFiles = new Map<string, string>();
const want = (name: string) => {
  const n = normName(name);
  for (const dir of ["parts/", "p/"]) {
    const path = dir + n;
    if (files.has(path)) return;
    const t = src.read(path);
    if (t === null) continue;
    files.set(path, t);
    const s = shadow?.read(path);
    if (s) shadowFiles.set(path, s);
    for (const l of parseLines(t).lines) if (l.t === 1) want(l.file);
    // Shadow files can reference other shadow-only includes (SNAP_INCL ref=...).
    if (s) for (const m of s.matchAll(/ref=([^\]\s]+)/g)) want(m[1]);
    return;
  }
};
for (const c of categories) for (const e of c.entries.values()) want(e.file);
files.set("LDConfig.ldr", src.read("LDConfig.ldr")!);

// Sanity: every catalog part flattens with no missing subfiles.
const packSource = { read: (p: string) => files.get(p.toLowerCase()) ?? null };
const packLib = new Library(packSource, { read: (p: string) => shadowFiles.get(p.toLowerCase()) ?? null });
let bad = 0;
for (const c of categories) for (const e of c.entries.values()) {
  const r = flatten(packLib, e.file, 16, { geometry: false });
  if (r.missing.length) { bad++; console.warn("missing in pack:", e.file, r.missing.slice(0, 3)); }
}

mkdirSync(OUT, { recursive: true });
const pack = { version: 1, source: "LDraw Parts Library (CC BY 4.0 / CC BY 2.0) and LDCad shadow library (CC BY-SA 4.0)", files: Object.fromEntries(files), shadow: Object.fromEntries(shadowFiles) };
const gz = gzipSync(JSON.stringify(pack), { level: 9 });
writeFileSync(join(OUT, "pack.json.gz"), gz);
const catalog = categories.map((c) => ({ id: c.id, name: c.name, parts: [...c.entries.values()].sort((a, b) => a.name.localeCompare(b.name)) }));
writeFileSync(join(OUT, "catalog.json"), JSON.stringify(catalog, null, 1));
writeFileSync(join(OUT, "ATTRIBUTION.txt"), `Part geometry: LDraw Parts Library, https://library.ldraw.org — licensed under CC BY 4.0 (older parts CC BY 2.0); see CAreadme.txt of the library.
Connection data: LDCad Shadow Library by Roland Melkert and contributors, https://github.com/RolandMelkert/LDCadShadowLibrary — CC BY-SA 4.0.
Set inventories and element mapping: Rebrickable, https://rebrickable.com.
LEGO® is a trademark of the LEGO Group, which does not sponsor, authorize or endorse this software.
`);
console.log(`catalog: ${catalog.map((c) => `${c.name} ${c.parts.length}`).join(", ")}`);
console.log(`pack: ${files.size} files, ${shadowFiles.size} shadow, ${(gz.length / 1e6).toFixed(2)} MB gz; unmapped ${unmapped.length}; broken ${bad}`);
if (unmapped.length) console.log("unmapped:", [...new Set(unmapped)].slice(0, 40).join("; "));
