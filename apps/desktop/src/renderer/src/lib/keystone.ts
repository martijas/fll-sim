// M13 Keystone Species: the team builds their own keystone species (bag 20) and delivers it to
// the restoration platform. It counts as equipment, so it starts in the launch area with the
// robot. In the simulator it is one loose game piece (a single solid object) on the field.

import type { Library } from "@fll-sim/ldraw";
import { assembleMissionModel, parseModel, type ModelPart } from "@fll-sim/assembly";
import type { FieldModel, StartPose } from "@fll-sim/sim";

/** Field model id of the keystone species (also its key among the team's mission-model builds). */
export const KEYSTONE_ID = "keystone";
/** Where it starts: inside the left (red) launch area, next to the west wall. */
export const KEYSTONE_START: StartPose = { xMm: 70, yMm: 400, headingDeg: 0 };

/** Label every part as the keystone game piece (autoscore finds it by the "[loose:keystone]" tag). */
export function keystoneParts(parts: ModelPart[]): ModelPart[] {
  return parts.map((p) => ({ ...p, label: `keystone: ${(p.label ?? p.file).replace(/ \[loose:[^\]]*\]/, "")} [loose:keystone]` }));
}

/** The keystone species as a free field model (no Dual Lock) from its .ldr/.mpd text. */
export function keystoneModel(lib: Library, text: string, pose: StartPose = KEYSTONE_START): FieldModel {
  const parts = keystoneParts(parseModel(lib, text).parts);
  const { robot: model } = assembleMissionModel(lib, parts, { name: "Keystone species", fixed: false });
  return { id: KEYSTONE_ID, model, pose, fixedBodies: [] };
}
