// SPIKE App Word Blocks for the scratch-blocks editor: block shapes, menus, colours and the
// toolbox. Opcodes and input names are those the SPIKE App saves in .llsp3 files (see
// docs_wordblock.txt); runtime-blocks compiles them. Menus the SPIKE App draws as shadow blocks
// use its shadow opcodes ("<extension>_<menu>", field "field_<opcode>").

import * as Blockly from "scratch-blocks";

type Style = "flippermotor" | "flippermove" | "flipperlight" | "flippersound" | "event" | "control" | "flippersensors" | "operators";
type Shape = "hat" | "stack" | "number" | "string" | "bool";
type Options = [string, string][];

/** One argument of a block's message: an input with a default, a dropdown field or a Boolean slot. */
type Arg =
  | { n: string; num: string }
  | { n: string; text: string }
  | { n: string; menu: string; value: string }
  | { n: string; field: Options }
  | { n: string; bool: true }
  | { n: string; matrix: string };

interface BlockDef { opcode: string; style: Style; shape: Shape; msg: string; args: Arg[] }

/** Colours of the SPIKE App categories (primary, secondary, tertiary). */
export const STYLES: Record<string, [string, string, string]> = {
  flippermotor: ["#0090F5", "#0081DC", "#0073C4"],
  flippermove: ["#FF4CCD", "#F730C1", "#E020AC"],
  flipperlight: ["#9966FF", "#855CD6", "#774DCB"],
  flippersound: ["#CF63CF", "#C94FC9", "#BD42BD"],
  event: ["#FFBF00", "#E6AC00", "#CC9900"],
  control: ["#FFAB19", "#EC9C13", "#CF8B17"],
  flippersensors: ["#4CBFE6", "#2E9FC7", "#2E8EB8"],
  sensing: ["#4CBFE6", "#2E9FC7", "#2E8EB8"],
  operators: ["#59C059", "#46B946", "#389438"],
  data: ["#FF8C1A", "#FF8000", "#DB6E00"],
  data_lists: ["#FF661A", "#FF5500", "#E64D00"],
  more: ["#FF6680", "#FF4D6A", "#FF3355"],
  motion: ["#4C97FF", "#4280D7", "#3373CC"],
  looks: ["#9966FF", "#855CD6", "#774DCB"],
  sounds: ["#CF63CF", "#C94FC9", "#BD42BD"],
  pen: ["#0FBD8C", "#0DA57A", "#0B8E69"],
};

// ---- menus ---------------------------------------------------------------------------
const PORTS = "ABCDEF".split("");
const opts = (...v: string[]): Options => v.map((x) => [x, x]);
const pairs = () => {
  const out: Options = [];
  for (const a of PORTS) for (const b of PORTS) if (a !== b) out.push([a + b, a + b]);
  return out;
};
const multiPorts = (): Options => [...opts(...PORTS), ...pairs().filter(([v]) => v[0] < v[1])];
const COLORS: Options = [["black", "0"], ["magenta", "1"], ["purple", "2"], ["blue", "3"], ["azure", "4"], ["turquoise", "5"], ["green", "6"], ["yellow", "7"], ["orange", "8"], ["red", "9"], ["white", "10"], ["no color", "-1"]];

/** Shadow menu blocks: opcode -> [style, options]. */
const MENUS: Record<string, [Style, Options]> = {
  "flippermotor_multiple-port-selector": ["flippermotor", multiPorts()],
  "flippermotor_single-motor-selector": ["flippermotor", opts(...PORTS)],
  "flippermotor_custom-icon-direction": ["flippermotor", [["↻ clockwise", "clockwise"], ["↺ counterclockwise", "counterclockwise"]]],
  "flippermotor_position-direction": ["flippermotor", [["shortest path", "shortest"], ["clockwise", "clockwise"], ["counterclockwise", "counterclockwise"]]],
  "flippermove_movement-port-selector": ["flippermove", pairs()],
  "flippermove_custom-icon-direction": ["flippermove", [["⬆ forward", "forward"], ["⬇ back", "back"], ["↻ turn right", "clockwise"], ["↺ turn left", "counterclockwise"]]],
  "flippermoremotor_single-motor-selector": ["flippermotor", opts(...PORTS)],
  "flippermoremotor_multiple-port-selector": ["flippermotor", multiPorts()],
  "flipperlight_color-selector-vertical": ["flipperlight", COLORS.filter(([, v]) => v !== "-1")],
  "flipperlight_distance-sensor-selector": ["flipperlight", opts(...PORTS)],
  "flippersensors_color-sensor-selector": ["flippersensors", opts(...PORTS)],
  "flippersensors_color-selector": ["flippersensors", COLORS],
  "flippersensors_force-sensor-selector": ["flippersensors", opts(...PORTS)],
  "flippersensors_distance-sensor-selector": ["flippersensors", opts(...PORTS)],
  "flippersensors_custom-comparator": ["flippersensors", opts("<", ">", "=")],
  "flippersensors_force-sensor-option": ["flippersensors", [["pressed", "pressed"], ["hard-pressed", "hardpressed"], ["released", "released"]]],
  "flippersensors_distance-comparator": ["flippersensors", [["closer than", "<"], ["farther than", ">"], ["exactly at", "="]]],
  "flippersensors_custom-tilted": ["flippersensors", opts("forward", "backward", "left", "right", "any")],
  "flippersensors_orientation-options": ["flippersensors", [["front", "front"], ["back", "back"], ["top", "top"], ["bottom", "bottom"], ["left side", "leftside"], ["right side", "rightside"]]],
  "flipperevents_color-sensor-selector": ["event", opts(...PORTS)],
  "flipperevents_color-selector": ["event", COLORS],
  "flipperevents_force-sensor-selector": ["event", opts(...PORTS)],
  "flipperevents_distance-sensor-selector": ["event", opts(...PORTS)],
  "flipperevents_force-sensor-option": ["event", [["pressed", "pressed"], ["hard-pressed", "hardpressed"], ["released", "released"]]],
  "flipperevents_distance-comparator": ["event", [["closer than", "<"], ["farther than", ">"], ["exactly at", "="]]],
  "flipperevents_custom-tilted": ["event", opts("forward", "backward", "left", "right", "any")],
  "flipperevents_orientation-options": ["event", [["front", "front"], ["back", "back"], ["top", "top"], ["bottom", "bottom"], ["left side", "leftside"], ["right side", "rightside"]]],
};
/** The 5x5 image menu: 25 brightness digits (0-9); the editor's matrix field is on/off. */
export const MATRIX_MENU = "flipperlight_matrix-5x5-brightness-image";

const m = (n: string, menu: string, value: string): Arg => ({ n, menu, value });
const num = (n: string, v: string): Arg => ({ n, num: v });
const txt = (n: string, v: string): Arg => ({ n, text: v });
const fld = (n: string, o: Options): Arg => ({ n, field: o });
const bool = (n: string): Arg => ({ n, bool: true });

const B = (opcode: string, style: Style, shape: Shape, msg: string, ...args: Arg[]): BlockDef => ({ opcode, style, shape, msg, args });

/** Blocks by toolbox category, in toolbox order. */
export const CATEGORIES: { id: string; name: string; style: string; blocks: BlockDef[] }[] = [
  {
    id: "motors", name: "Motors", style: "flippermotor", blocks: [
      B("flippermotor_motorTurnForDirection", "flippermotor", "stack", "%1 run %2 for %3 %4", m("PORT", "flippermotor_multiple-port-selector", "A"), m("DIRECTION", "flippermotor_custom-icon-direction", "clockwise"), num("VALUE", "1"), fld("UNIT", [["rotations", "rotations"], ["degrees", "degrees"], ["seconds", "seconds"]])),
      B("flippermotor_motorGoDirectionToPosition", "flippermotor", "stack", "%1 go %2 to position %3", m("PORT", "flippermotor_multiple-port-selector", "A"), m("DIRECTION", "flippermotor_position-direction", "shortest"), num("POSITION", "0")),
      B("flippermotor_motorStartDirection", "flippermotor", "stack", "%1 start motor %2", m("PORT", "flippermotor_multiple-port-selector", "A"), m("DIRECTION", "flippermotor_custom-icon-direction", "clockwise")),
      B("flippermotor_motorStop", "flippermotor", "stack", "%1 stop motor", m("PORT", "flippermotor_multiple-port-selector", "A")),
      B("flippermotor_motorSetSpeed", "flippermotor", "stack", "%1 set speed to %2 %%", m("PORT", "flippermotor_multiple-port-selector", "A"), num("SPEED", "75")),
      B("flippermotor_absolutePosition", "flippermotor", "number", "%1 position", m("PORT", "flippermotor_single-motor-selector", "A")),
      B("flippermotor_speed", "flippermotor", "number", "%1 speed", m("PORT", "flippermotor_single-motor-selector", "A")),
      B("flippermoremotor_motorGoToRelativePosition", "flippermotor", "stack", "%1 go to relative position %2 at %3 %% speed", m("PORT", "flippermoremotor_multiple-port-selector", "A"), num("POSITION", "0"), num("SPEED", "75")),
      B("flippermoremotor_motorSetDegreeCounted", "flippermotor", "stack", "%1 set relative position to %2", m("PORT", "flippermoremotor_multiple-port-selector", "A"), num("VALUE", "0")),
      B("flippermoremotor_position", "flippermotor", "number", "%1 relative position", m("PORT", "flippermoremotor_single-motor-selector", "A")),
      B("flippermoremotor_motorStartPower", "flippermotor", "stack", "%1 start motor at %2 %% power", m("PORT", "flippermoremotor_multiple-port-selector", "A"), num("POWER", "100")),
      B("flippermoremotor_power", "flippermotor", "number", "%1 power", m("PORT", "flippermoremotor_single-motor-selector", "A")),
      B("flippermoremotor_motorSetStopMethod", "flippermotor", "stack", "%1 set motor to %2 at stop", m("PORT", "flippermoremotor_multiple-port-selector", "A"), fld("STOP", [["brake", "brake"], ["hold position", "hold"], ["coast", "coast"]])),
      B("flippermoremotor_motorSetAcceleration", "flippermotor", "stack", "%1 set acceleration to %2", m("PORT", "flippermoremotor_multiple-port-selector", "A"), fld("ACCELERATION", [["medium", "medium"], ["fast", "fast"], ["slow", "slow"]])),
    ],
  },
  {
    id: "movement", name: "Movement", style: "flippermove", blocks: [
      B("flippermove_move", "flippermove", "stack", "move %1 for %2 %3", m("DIRECTION", "flippermove_custom-icon-direction", "forward"), num("VALUE", "10"), fld("UNIT", [["cm", "cm"], ["in", "in"], ["rotations", "rotations"], ["degrees", "degrees"], ["seconds", "seconds"]])),
      B("flippermove_startMove", "flippermove", "stack", "start moving %1", m("DIRECTION", "flippermove_custom-icon-direction", "forward")),
      B("flippermove_steer", "flippermove", "stack", "move steering %1 for %2 %3", num("STEERING", "30"), num("VALUE", "10"), fld("UNIT", [["cm", "cm"], ["in", "in"], ["rotations", "rotations"], ["degrees", "degrees"], ["seconds", "seconds"]])),
      B("flippermove_startSteer", "flippermove", "stack", "start moving steering %1", num("STEERING", "30")),
      B("flippermove_stopMove", "flippermove", "stack", "stop moving"),
      B("flippermove_movementSpeed", "flippermove", "stack", "set movement speed to %1 %%", num("SPEED", "50")),
      B("flippermove_setMovementPair", "flippermove", "stack", "set movement motors to %1", m("PAIR", "flippermove_movement-port-selector", "AB")),
      B("flippermove_setDistance", "flippermove", "stack", "set 1 motor rotation to %1 %2 moved", num("DISTANCE", "17.5"), fld("UNIT", [["cm", "cm"], ["in", "in"]])),
      B("flippermoremove_startDualSpeed", "flippermove", "stack", "start moving at %1 %2 %% speed", num("LEFT", "50"), num("RIGHT", "50")),
      B("flippermoremove_movementSetStopMethod", "flippermove", "stack", "set movement motors to %1 at stop", fld("STOP", [["brake", "brake"], ["hold position", "hold"], ["coast", "coast"]])),
      B("flippermoremove_movementSetAcceleration", "flippermove", "stack", "set movement acceleration to %1", fld("ACCELERATION", [["medium", "medium"], ["fast", "fast"], ["slow", "slow"]])),
    ],
  },
  {
    id: "light", name: "Light", style: "flipperlight", blocks: [
      B("flipperlight_lightDisplayImageOnForTime", "flipperlight", "stack", "turn on %1 for %2 seconds", { n: "MATRIX", matrix: "9909999099000009000909990" }, num("VALUE", "2")),
      B("flipperlight_lightDisplayImageOn", "flipperlight", "stack", "turn on %1", { n: "MATRIX", matrix: "9909999099000009000909990" }),
      B("flipperlight_lightDisplayText", "flipperlight", "stack", "write %1", txt("TEXT", "Hello")),
      B("flipperdisplay_lightDisplayOff", "flipperlight", "stack", "turn off pixels"),
      B("flipperlight_lightDisplaySetBrightness", "flipperlight", "stack", "set pixel brightness to %1 %%", num("BRIGHTNESS", "75")),
      B("flipperlight_lightDisplaySetPixel", "flipperlight", "stack", "set pixel at %1 , %2 to %3 %%", num("X", "1"), num("Y", "1"), num("BRIGHTNESS", "100")),
      B("flipperlight_lightDisplayRotate", "flipperlight", "stack", "rotate %1", fld("DIRECTION", [["↻ clockwise", "clockwise"], ["↺ counterclockwise", "counterclockwise"]])),
      B("flipperlight_lightDisplaySetOrientation", "flipperlight", "stack", "set orientation to %1", fld("ORIENTATION", [["upright", "upright"], ["left", "left"], ["right", "right"], ["upside down", "upsidedown"]])),
      B("flipperlight_centerButtonLight", "flipperlight", "stack", "set Center Button light to %1", m("COLOR", "flipperlight_color-selector-vertical", "9")),
      B("flipperlight_ultrasonicLightUp", "flipperlight", "stack", "%1 light up %2", m("PORT", "flipperlight_distance-sensor-selector", "A"), txt("VALUE", "100 100 100 100")),
    ],
  },
  {
    id: "sound", name: "Sound", style: "flippersound", blocks: [
      B("flippersound_beepForTime", "flippersound", "stack", "play beep %1 for %2 seconds", num("NOTE", "60"), num("DURATION", "0.2")),
      B("flippersound_beep", "flippersound", "stack", "start playing beep %1", num("NOTE", "60")),
      B("flippersound_stopSound", "flippersound", "stack", "stop all sounds"),
    ],
  },
  {
    id: "events", name: "Events", style: "event", blocks: [
      B("flipperevents_whenProgramStarts", "event", "hat", "when program starts"),
      B("flipperevents_whenColor", "event", "hat", "when %1 is color %2", m("PORT", "flipperevents_color-sensor-selector", "A"), m("OPTION", "flipperevents_color-selector", "0")),
      B("flipperevents_whenPressed", "event", "hat", "when %1 is %2", m("PORT", "flipperevents_force-sensor-selector", "A"), m("OPTION", "flipperevents_force-sensor-option", "pressed")),
      B("flipperevents_whenDistance", "event", "hat", "when %1 is %2 %3 %4", m("PORT", "flipperevents_distance-sensor-selector", "A"), m("COMPARATOR", "flipperevents_distance-comparator", "<"), num("VALUE", "15"), fld("UNIT", [["%", "%"], ["cm", "cm"], ["in", "in"]])),
      B("flipperevents_whenTilted", "event", "hat", "when tilted %1", m("VALUE", "flipperevents_custom-tilted", "forward")),
      B("flipperevents_whenOrientation", "event", "hat", "when %1 is up", m("VALUE", "flipperevents_orientation-options", "front")),
      B("flipperevents_whenButton", "event", "hat", "when %1 Button %2", fld("BUTTON", [["Left", "left"], ["Right", "right"]]), fld("EVENT", [["pressed", "pressed"], ["released", "released"]])),
      B("flipperevents_whenTimer", "event", "hat", "when timer > %1", num("VALUE", "5")),
      B("flipperevents_whenCondition", "event", "hat", "when %1", bool("CONDITION")),
    ],
  },
  {
    id: "control", name: "Control", style: "control", blocks: [
      B("flippercontrol_stopOtherStacks", "control", "stack", "stop other stacks"),
      B("flippercontrol_stop", "control", "stack", "stop %1", fld("STOP_OPTION", [["all", "all"], ["this stack", "this stack"], ["and exit program", "exit program"]])),
    ],
  },
  {
    id: "sensors", name: "Sensors", style: "flippersensors", blocks: [
      B("flippersensors_isColor", "flippersensors", "bool", "%1 is color %2 ?", m("PORT", "flippersensors_color-sensor-selector", "A"), m("VALUE", "flippersensors_color-selector", "0")),
      B("flippersensors_color", "flippersensors", "number", "%1 color", m("PORT", "flippersensors_color-sensor-selector", "A")),
      B("flippersensors_isReflectivity", "flippersensors", "bool", "%1 is reflection %2 %3 %% ?", m("PORT", "flippersensors_color-sensor-selector", "A"), m("COMPARATOR", "flippersensors_custom-comparator", "<"), num("VALUE", "50")),
      B("flippersensors_reflectivity", "flippersensors", "number", "%1 reflected light", m("PORT", "flippersensors_color-sensor-selector", "A")),
      B("flippersensors_isPressed", "flippersensors", "bool", "%1 is %2 ?", m("PORT", "flippersensors_force-sensor-selector", "A"), m("OPTION", "flippersensors_force-sensor-option", "pressed")),
      B("flippersensors_force", "flippersensors", "number", "%1 pressure in %2", m("PORT", "flippersensors_force-sensor-selector", "A"), fld("UNIT", [["%", "%"], ["newtons", "newton"]])),
      B("flippersensors_isDistance", "flippersensors", "bool", "%1 is %2 %3 %4 ?", m("PORT", "flippersensors_distance-sensor-selector", "A"), m("COMPARATOR", "flippersensors_distance-comparator", "<"), num("VALUE", "15"), fld("UNIT", [["%", "%"], ["cm", "cm"], ["in", "in"]])),
      B("flippersensors_distance", "flippersensors", "number", "%1 distance in %2", m("PORT", "flippersensors_distance-sensor-selector", "A"), fld("UNIT", [["%", "%"], ["cm", "cm"], ["in", "in"]])),
      B("flippersensors_isTilted", "flippersensors", "bool", "is hub tilted %1 ?", m("VALUE", "flippersensors_custom-tilted", "forward")),
      B("flippersensors_isorientation", "flippersensors", "bool", "is hub %1 up?", m("VALUE", "flippersensors_orientation-options", "front")),
      B("flippersensors_orientationAxis", "flippersensors", "number", "%1 angle", fld("AXIS", [["pitch", "pitch"], ["roll", "roll"], ["yaw", "yaw"]])),
      B("flippersensors_resetYaw", "flippersensors", "stack", "set yaw angle to 0"),
      B("flippersensors_buttonIsPressed", "flippersensors", "bool", "is %1 Button %2 ?", fld("BUTTON", [["Left", "left"], ["Right", "right"]]), fld("EVENT", [["pressed", "pressed"], ["released", "released"]])),
      B("flippersensors_timer", "flippersensors", "number", "timer"),
      B("flippersensors_resetTimer", "flippersensors", "stack", "reset timer"),
      B("flippermoresensors_rawColor", "flippersensors", "number", "%1 %2 color value", m("PORT", "flippersensors_color-sensor-selector", "A"), fld("COLOR", [["red", "red"], ["green", "green"], ["blue", "blue"]])),
      B("flippermoresensors_acceleration", "flippersensors", "number", "acceleration %1", fld("AXIS", [["x", "x"], ["y", "y"], ["z", "z"]])),
      B("flippermoresensors_angularVelocity", "flippersensors", "number", "angular velocity %1", fld("AXIS", [["x", "x"], ["y", "y"], ["z", "z"]])),
    ],
  },
  {
    id: "operators", name: "Operators", style: "operators", blocks: [
      B("flipperoperator_isInBetween", "operators", "bool", "is %1 between %2 and %3 ?", num("VALUE", ""), num("LOW", "-10"), num("HIGH", "10")),
    ],
  },
];

/** Scratch core blocks shown in each category (after the SPIKE ones), as toolbox XML. */
const n = (name: string, v: string, type = "math_number") => `<value name="${name}"><shadow type="${type}"><field name="NUM">${v}</field></shadow></value>`;
const t = (name: string, v: string) => `<value name="${name}"><shadow type="text"><field name="TEXT">${v}</field></shadow></value>`;
const CORE: Record<string, string[]> = {
  events: [
    `<block type="event_whenbroadcastreceived"></block>`,
    `<block type="event_broadcast"><value name="BROADCAST_INPUT"><shadow type="event_broadcast_menu"></shadow></value></block>`,
    `<block type="event_broadcastandwait"><value name="BROADCAST_INPUT"><shadow type="event_broadcast_menu"></shadow></value></block>`,
  ],
  control: [
    `<block type="control_wait">${n("DURATION", "1", "math_positive_number")}</block>`,
    `<block type="control_repeat">${n("TIMES", "10", "math_whole_number")}</block>`,
    `<block type="control_forever"></block>`,
    `<block type="control_if"></block>`,
    `<block type="control_if_else"></block>`,
    `<block type="control_wait_until"></block>`,
    `<block type="control_repeat_until"></block>`,
  ],
  operators: [
    `<block type="operator_random">${n("FROM", "1")}${n("TO", "10")}</block>`,
    `<block type="operator_add">${n("NUM1", "")}${n("NUM2", "")}</block>`,
    `<block type="operator_subtract">${n("NUM1", "")}${n("NUM2", "")}</block>`,
    `<block type="operator_multiply">${n("NUM1", "")}${n("NUM2", "")}</block>`,
    `<block type="operator_divide">${n("NUM1", "")}${n("NUM2", "")}</block>`,
    `<block type="operator_lt">${t("OPERAND1", "")}${t("OPERAND2", "50")}</block>`,
    `<block type="operator_equals">${t("OPERAND1", "")}${t("OPERAND2", "50")}</block>`,
    `<block type="operator_gt">${t("OPERAND1", "")}${t("OPERAND2", "50")}</block>`,
    `<block type="operator_and"></block>`,
    `<block type="operator_or"></block>`,
    `<block type="operator_not"></block>`,
    `<block type="operator_join">${t("STRING1", "apple ")}${t("STRING2", "banana")}</block>`,
    `<block type="operator_letter_of">${n("LETTER", "1", "math_whole_number")}${t("STRING", "apple")}</block>`,
    `<block type="operator_length">${t("STRING", "apple")}</block>`,
    `<block type="operator_contains">${t("STRING1", "apple")}${t("STRING2", "a")}</block>`,
    `<block type="operator_mod">${n("NUM1", "")}${n("NUM2", "")}</block>`,
    `<block type="operator_round">${n("NUM", "")}</block>`,
    `<block type="operator_mathop">${n("NUM", "")}</block>`,
  ],
};

// ---- registration ----------------------------------------------------------------

const EXT: Record<Shape, string> = { hat: "shape_hat", stack: "shape_statement", number: "output_number", string: "output_string", bool: "output_boolean" };

function argJson(a: Arg): Record<string, unknown> {
  if ("field" in a) return { type: "field_dropdown", name: a.n, options: a.field };
  if ("bool" in a) return { type: "input_value", name: a.n, check: "Boolean" };
  return { type: "input_value", name: a.n };
}

/** The toolbox XML for an argument's default (shadow) value. */
function argXml(a: Arg): string {
  if ("num" in a) return n(a.n, a.num);
  if ("text" in a) return t(a.n, a.text);
  if ("menu" in a) return `<value name="${a.n}"><shadow type="${a.menu}"><field name="field_${a.menu}">${a.value}</field></shadow></value>`;
  if ("matrix" in a) return `<value name="${a.n}"><shadow type="${MATRIX_MENU}"><field name="field_${MATRIX_MENU}">${matrixToField(a.matrix)}</field></shadow></value>`;
  return "";
}

/** SPIKE stores 25 brightness digits; the matrix field is 25 on/off digits. */
export const matrixToField = (v: string) => v.padEnd(25, "0").slice(0, 25).replace(/[1-9]/g, "1").replace(/[^01]/g, "0");
export const fieldToMatrix = (v: string) => v.replace(/1/g, "9");

let registered = false;
/** Register the SPIKE blocks with scratch-blocks (once). */
export function registerSpikeBlocks() {
  if (registered) return;
  registered = true;
  // SPIKE blocks are longer than Scratch's: widen the palette (fixed at 250 px in scratch-blocks)
  Blockly.CheckableContinuousFlyout.prototype.getWidth = () => 340;
  for (const c of CATEGORIES)
    for (const d of c.blocks) {
      const json = { message0: d.msg, args0: d.args.map(argJson), extensions: [`colours_${d.style}`, EXT[d.shape]] };
      Blockly.Blocks[d.opcode] = { init(this: Blockly.Block) { this.jsonInit(json); } };
    }
  for (const [opcode, [style, options]] of Object.entries(MENUS)) {
    const json = { message0: "%1", args0: [{ type: "field_dropdown", name: `field_${opcode}`, options }], extensions: [`colours_${style}`, "output_string"] };
    Blockly.Blocks[opcode] = { init(this: Blockly.Block) { this.jsonInit(json); } };
  }
  const matrix = { message0: "%1", args0: [{ type: "field_matrix", name: `field_${MATRIX_MENU}` }], outputShape: 2, output: "String", extensions: ["colours_flipperlight"] };
  Blockly.Blocks[MATRIX_MENU] = { init(this: Blockly.Block) { this.jsonInit(matrix); } };
  // "colours_<style>" extensions for the SPIKE styles (scratch-blocks registers its own)
  for (const s of Object.keys(STYLES))
    if (!Blockly.Extensions.isRegistered(`colours_${s}`)) Blockly.Extensions.register(`colours_${s}`, function (this: Blockly.Block) { this.setStyle(s); });
}

/**
 * Blocks in a loaded project the editor has no definition for (e.g. music or weather blocks):
 * register a plain block with the same inputs and fields so the program keeps them unchanged.
 */
export function registerUnknownBlocks(blocks: Record<string, unknown>) {
  const usage = new Map<string, { inputs: Set<string>; stmts: Set<string>; fields: Set<string>; shape: Shape }>();
  const valueRefs = new Set<string>();
  for (const b of Object.values(blocks)) {
    if (Array.isArray(b)) continue;
    for (const [name, inp] of Object.entries((b as { inputs: Record<string, unknown[]> }).inputs ?? {}))
      if (!/^SUBSTACK/.test(name) && name !== "custom_block") for (const r of inp.slice(1)) if (typeof r === "string") valueRefs.add(r);
  }
  for (const [id, raw] of Object.entries(blocks)) {
    if (Array.isArray(raw)) continue;
    const b = raw as { opcode: string; inputs: Record<string, unknown[]>; fields: Record<string, unknown[]>; topLevel: boolean; next: string | null; shadow: boolean };
    if (Blockly.Blocks[b.opcode]) continue;
    const u = usage.get(b.opcode) ?? { inputs: new Set(), stmts: new Set(), fields: new Set(), shape: "stack" as Shape };
    for (const k of Object.keys(b.inputs ?? {})) (/^SUBSTACK/.test(k) ? u.stmts : u.inputs).add(k);
    for (const k of Object.keys(b.fields ?? {})) u.fields.add(k);
    if (valueRefs.has(id) || b.shadow) u.shape = "string";
    else if (/when/i.test(b.opcode) && b.topLevel) u.shape = "hat";
    usage.set(b.opcode, u);
  }
  for (const [opcode, u] of usage) {
    const label = opcode.replace(/^[a-z]+_/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").toLowerCase();
    const args: Record<string, unknown>[] = [];
    let msg = u.shape === "string" && u.fields.size === 1 && !u.inputs.size ? "" : label;
    for (const f of u.fields) { msg += ` %${args.length + 1}`; args.push({ type: "field_input", name: f, text: "" }); }
    for (const i of u.inputs) { msg += ` %${args.length + 1}`; args.push({ type: "input_value", name: i }); }
    const json: Record<string, unknown> = { message0: msg.trim() || label, args0: args, extensions: ["colours_more", EXT[u.shape]], tooltip: `${opcode} (not simulated: kept unchanged)` };
    let k = 1;
    for (const s of u.stmts) { json[`message${k}`] = "%1"; json[`args${k}`] = [{ type: "input_statement", name: s }]; k++; }
    Blockly.Blocks[opcode] = { init(this: Blockly.Block) { this.jsonInit(json); } };
  }
  return [...usage.keys()];
}

/** The toolbox (categories with their blocks), as scratch-blocks XML. */
export function toolboxXml(): string {
  const cat = (id: string, name: string, style: string, body: string, extra = "") =>
    `<category name="${name}" id="${id}" colour="${STYLES[style][0]}" secondaryColour="${STYLES[style][2]}"${extra}>${body}</category>`;
  const out: string[] = ["<xml>"];
  for (const c of CATEGORIES) {
    const own = c.blocks.map((d) => `<block type="${d.opcode}">${d.args.map(argXml).join("")}</block>`);
    const core = CORE[c.id] ?? [];
    const body = c.id === "control" ? [...core, ...own] : c.id === "operators" ? [...core, ...own] : [...own, ...core];
    out.push(cat(c.id, c.name, c.style, body.join("")));
  }
  out.push(cat("variables", "Variables", "data", "", ' custom="VARIABLE"'));
  out.push(cat("myblocks", "My Blocks", "more", "", ' custom="PROCEDURE"'));
  out.push("</xml>");
  return out.join("");
}

/** Blockly theme with the Scratch and SPIKE block colours. */
export function spikeTheme() {
  const styles: Record<string, { colourPrimary: string; colourSecondary: string; colourTertiary: string; colourQuaternary: string }> = {};
  for (const [k, [a, b, c]] of Object.entries(STYLES)) styles[k] = { colourPrimary: a, colourSecondary: b, colourTertiary: c, colourQuaternary: c };
  styles.textField = { colourPrimary: "#FFFFFF", colourSecondary: "#FFFFFF", colourTertiary: "#DDDDDD", colourQuaternary: "#DDDDDD" };
  return new Blockly.Theme("fllsim-spike", styles as never, {}, { workspaceBackgroundColour: "#F9F9F9", toolboxBackgroundColour: "#FFFFFF", flyoutBackgroundColour: "#F9F9F9", scrollbarColour: "#CECDCE" } as never);
}
