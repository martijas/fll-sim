import { Library } from "@fll-sim/ldraw";
import { dirSource, findLDrawDir, findShadowDir } from "@fll-sim/ldraw/node";
export function loadLib(): Library {
  const d = findLDrawDir();
  if (!d) throw new Error("LDraw library not found");
  const s = findShadowDir();
  return new Library(dirSource(d), s ? dirSource(s) : undefined);
}
