// Automatic scoring of the untouched field: at set-up, and after waking every model and letting it
// settle (a stable field should still score nothing).
//
//   pnpm exec tsx src/score-field.ts [--ms 2000]
import { autoScore } from "../../../seasons/2026-27/autoscore";
import { fieldModels, fieldSim } from "./field";

const args = process.argv.slice(2);
const msI = args.indexOf("--ms");
const MS = msI >= 0 ? Number(args[msI + 1]) : 2000;
const sim = await fieldSim(fieldModels());
const show = (title: string) => {
  const r = autoScore(sim.snapshot());
  console.log(`\n== ${title}`);
  for (const [id, why] of Object.entries(r.notes)) console.log(`  ${id.padEnd(5)} ${id in r.answers ? String(r.answers[id]).padEnd(8) : "(manual)"} ${why}`);
};
show("set up");
sim.unfreezeModels();
sim.stepMs(MS);
show(`woken, ${MS} ms later`);
