// Print a part's snaps (for writing build scripts): pnpm exec tsx src/inspect.ts 64179.dat
import { IDENTITY } from "@fll-sim/ldraw";
import { Build } from "./build";
import { loadLib } from "./lib";
const lib = loadLib();
for (const f of process.argv.slice(2)) {
  const b = new Build(lib, "inspect");
  b.place(f, 16, IDENTITY);
  const bb = b.bounds(0);
  console.log(`== ${f}: ${lib.get(f)?.title} | bounds min ${bb.min.map(Math.round)} max ${bb.max.map(Math.round)}`);
  for (const s of b.snaps(0)) console.log(`  ${s.gender} ${s.kind.padEnd(5)} pos ${s.pos.map((v) => Math.round(v * 10) / 10).join(",").padEnd(18)} axis ${s.axis.map((v) => Math.round(v * 100) / 100).join(",").padEnd(14)} ${s.secs}`);
}
