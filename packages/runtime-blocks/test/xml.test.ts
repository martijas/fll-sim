// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLlsp3, writeBlocksLlsp3, type ScratchProject } from "@fll-sim/llsp3";
import { compileBlocks, emptyProject, programTarget, projectToXml, xmlToProject } from "../src";

const GUIDED = "resources/2026-27-bioglow/code/guided-mission-bioglow-11.llsp3";

const roundTrip = (p: ScratchProject) => xmlToProject(new DOMParser().parseFromString(projectToXml(p), "text/xml").documentElement, p);
/** Block ids of compressed primitives are regenerated; compare the generated program instead. */
const program = (p: ScratchProject) => compileBlocks(p).python;

// A project using the harder parts of the format: variables, lists, broadcasts, My Blocks with
// arguments, reporters dropped over shadows ([3, ...]) and top-level variable reporters.
function sample(): ScratchProject {
  const p = emptyProject();
  const stage = p.targets[0];
  stage.variables = { v1: ["speed", 40] };
  stage.lists = { l1: ["turns", [90, 180]] };
  stage.broadcasts = { m1: ["go"] as unknown as string };
  stage.broadcasts = { m1: "go" };
  const b: Record<string, unknown> = {
    hat: { opcode: "flipperevents_whenProgramStarts", next: "set", parent: null, inputs: {}, fields: {}, shadow: false, topLevel: true, x: 10, y: 20 },
    set: { opcode: "data_setvariableto", next: "call", parent: "hat", inputs: { VALUE: [1, [10, "55"]] }, fields: { VARIABLE: ["speed", "v1"] }, shadow: false, topLevel: false },
    call: { opcode: "procedures_call", next: "bc", parent: "set", inputs: { arg1: [3, [12, "speed", "v1"], [10, "10"]] }, fields: {}, shadow: false, topLevel: false, mutation: { tagName: "mutation", children: [], proccode: "drive %s", argumentids: '["arg1"]', warp: "false" } },
    bc: { opcode: "event_broadcast", next: "rep", parent: "call", inputs: { BROADCAST_INPUT: [1, [11, "go", "m1"]] }, fields: {}, shadow: false, topLevel: false },
    rep: { opcode: "control_repeat", next: null, parent: "bc", inputs: { TIMES: [1, [6, "3"]], SUBSTACK: [2, "mv"] }, fields: {}, shadow: false, topLevel: false },
    mv: { opcode: "flippermove_move", next: null, parent: "rep", inputs: { DIRECTION: [1, "dir"], VALUE: [3, "item", [4, "10"]] }, fields: { UNIT: ["cm", null] }, shadow: false, topLevel: false },
    dir: { opcode: "flippermove_custom-icon-direction", next: null, parent: "mv", inputs: {}, fields: { "field_flippermove_custom-icon-direction": ["back", null] }, shadow: true, topLevel: false },
    item: { opcode: "data_itemoflist", next: null, parent: "mv", inputs: { INDEX: [1, [7, "1"]] }, fields: { LIST: ["turns", "l1"] }, shadow: false, topLevel: false },
    def: { opcode: "procedures_definition", next: "st", parent: null, inputs: { custom_block: [1, "proto"] }, fields: {}, shadow: false, topLevel: true, x: 400, y: 20 },
    proto: { opcode: "procedures_prototype", next: null, parent: "def", inputs: { arg1: [1, "argr"] }, fields: {}, shadow: true, topLevel: false, mutation: { tagName: "mutation", children: [], proccode: "drive %s", argumentids: '["arg1"]', argumentnames: '["cm"]', argumentdefaults: '[""]', warp: "false" } },
    argr: { opcode: "argument_reporter_string_number", next: null, parent: "proto", inputs: {}, fields: { VALUE: ["cm", null] }, shadow: true, topLevel: false },
    st: { opcode: "flippermove_steer", next: null, parent: "def", inputs: { STEERING: [1, [4, "0"]], VALUE: [3, "arg", [4, "10"]] }, fields: { UNIT: ["cm", null] }, shadow: false, topLevel: false },
    arg: { opcode: "argument_reporter_string_number", next: null, parent: "st", inputs: {}, fields: { VALUE: ["cm", null] }, shadow: false, topLevel: false },
    rx: { opcode: "event_whenbroadcastreceived", next: null, parent: null, inputs: {}, fields: { BROADCAST_OPTION: ["go", "m1"] }, shadow: false, topLevel: true, x: 10, y: 300 },
    loose: [12, "speed", "v1", 600, 400],
  };
  programTarget(p).blocks = b as never;
  return p;
}

describe("Word Blocks <-> Blockly XML", () => {
  it("round-trips variables, lists, broadcasts, My Blocks and reporters over shadows", () => {
    const p = sample();
    const back = roundTrip(p);
    expect(program(back)).toBe(program(p));
    const blocks = programTarget(back).blocks as Record<string, unknown>;
    // the same structure comes back: literals compressed, reporters over shadows kept as [3, ...]
    expect((blocks.set as { inputs: unknown }).inputs).toEqual({ VALUE: [1, [10, "55"]] });
    expect((blocks.call as { inputs: unknown }).inputs).toEqual({ arg1: [3, [12, "speed", "v1"], [10, "10"]] });
    expect((blocks.mv as { inputs: unknown }).inputs).toEqual({ DIRECTION: [1, "dir"], VALUE: [3, "item", [4, "10"]] });
    expect((blocks.rep as { inputs: unknown }).inputs).toEqual({ TIMES: [1, [6, "3"]], SUBSTACK: [2, "mv"] });
    expect((blocks.def as { inputs: unknown }).inputs).toEqual({ custom_block: [1, "proto"] });
    expect(blocks.loose).toEqual([12, "speed", "v1", 600, 400]);
    expect((blocks.proto as { mutation: unknown }).mutation).toEqual((p.targets[1].blocks.proto as { mutation: unknown }).mutation);
    expect(back.targets[0].variables).toEqual({ v1: ["speed", 40] });
    expect(back.targets[0].lists).toEqual({ l1: ["turns", [90, 180]] });
    expect(back.targets[0].broadcasts).toEqual({ m1: "go" });
    expect(back.extensions).toEqual(["flipperevents", "flippermove"]);
  });

  it("saves a .llsp3 the reader opens again", () => {
    const p = roundTrip(sample());
    const again = readLlsp3(writeBlocksLlsp3(p, "Round trip"));
    expect(again.kind).toBe("word-blocks");
    if (again.kind !== "word-blocks") return;
    expect(again.manifest.type).toBe("word-blocks");
    expect(program(again.project)).toBe(program(p));
    expect(Object.keys(again.sb3)).toContain("d41d8cd98f00b204e9800998ecf8427e.svg");
  });

  it.skipIf(!existsSync(GUIDED))("round-trips FIRST's guided mission unchanged", () => {
    const proj = readLlsp3(new Uint8Array(readFileSync(GUIDED)));
    if (proj.kind !== "word-blocks") throw new Error("expected word blocks");
    const back = roundTrip(proj.project);
    expect(programTarget(back).blocks).toEqual(programTarget(proj.project).blocks);
  });
});
