import type { Library } from "@fll-sim/ldraw";
import { defaultLibrary } from "@fll-sim/ldraw/node";
/** The full LDraw library if installed (~/.cache/fll-sim/ldraw), else the app's bundled part pack. */
export function loadLib(): Library {
  const lib = defaultLibrary();
  if (!lib) throw new Error("LDraw library not found");
  return lib;
}
