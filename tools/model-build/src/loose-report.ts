// Which bodies of each published mission model are free (no joint to anything) and what they are.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, parseModel } from "@fll-sim/assembly";
import { loadLib } from "./lib";

const repo = "/home/jason/project";
const index = JSON.parse(readFileSync(join(repo, "seasons/2026-27/mission-models.json"), "utf8")) as Record<string, { file: string }>;
const lib = loadLib();
for (const [id, e] of Object.entries(index)) {
  if (process.argv[2] && !id.startsWith(process.argv[2])) continue;
  const parts = parseModel(lib, readFileSync(join(repo, e.file), "latin1")).parts;
  const { robot } = assemble(lib, parts, { autoPorts: false });
  const jointed = new Set(robot.freeJoints.flatMap((j) => [j.a, j.b]));
  const free = robot.bodies.filter((b) => !jointed.has(b.id));
  const byLabel = new Map<string, number>();
  for (const b of free) {
    // visuals -> part labels via file matching is lossy; use first visual's file + matched label
    const labels = b.visuals!.map((v) => parts.find((p) => p.file === v.file && Math.abs(p.m[3] * 0.4 + v.m[3]) < 1e9)?.label ?? v.file);
    const k = [...new Set(labels)].slice(0, 3).join(" | ") + (labels.length > 3 ? ` (+${labels.length - 3})` : "");
    byLabel.set(k, (byLabel.get(k) ?? 0) + 1);
  }
  console.log(`\n${id}: ${robot.bodies.length} bodies, ${free.length} free`);
  for (const [k, n] of [...byLabel].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${n}× ${k}`);
}
