import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readLlsp3, writePythonLlsp3 } from "../src";

const GUIDED = "resources/2026-27-bioglow/code/guided-mission-bioglow-11.llsp3";

describe("llsp3", () => {
  it("round-trips a Python project", () => {
    const src = "import motor\nfrom hub import port\nmotor.run(port.A, 500)\n";
    const p = readLlsp3(writePythonLlsp3(src, "Test"));
    expect(p.kind).toBe("python");
    if (p.kind !== "python") return;
    expect(p.source).toBe(src);
    expect(p.manifest.name).toBe("Test");
    expect(p.manifest.type).toBe("python");
    const again = readLlsp3(writePythonLlsp3(src + "# edit\n", "Test", p));
    expect(again.manifest.id).toBe(p.manifest.id);
  });

  it.skipIf(!existsSync(GUIDED))("reads FIRST's BIOGLOW guided mission (Word Blocks)", () => {
    const p = readLlsp3(new Uint8Array(readFileSync(GUIDED)));
    expect(p.kind).toBe("word-blocks");
    if (p.kind !== "word-blocks") return;
    const opcodes = new Set(p.project.targets.flatMap((t) => Object.values(t.blocks).map((b) => (b as { opcode?: string }).opcode)));
    expect(opcodes.has("flipperevents_whenProgramStarts")).toBe(true);
    expect(opcodes.has("flippermove_move")).toBe(true);
  });
});
