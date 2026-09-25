// pnpm --filter @fll-sim/model-build run build-model m05 [--render]
import { mkdirSync } from "node:fs";
import { loadLib } from "./lib";
import { VIEWS } from "./build";

const which = process.argv[2];
const lib = loadLib();
const mod = await import(`../models/${which}.ts`);
const b = mod.build(lib);
mkdirSync("out", { recursive: true });
b.save(`out/${which}.ldr`);
for (const v of (process.argv.includes("--views") ? ["iso", "isoBack", "front", "right", "top"] : ["iso", "front"])) b.render(`out/${which}-${v}.png`, VIEWS[v]);
console.log(`${which}: ${b.parts.length} parts`, b.check());
