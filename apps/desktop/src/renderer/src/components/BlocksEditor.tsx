// Visual Word Blocks editor (scratch-blocks, like the SPIKE App). It edits a Scratch 3
// project.json, which the simulator compiles and runs and which saves back into a .llsp3.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as Blockly from "scratch-blocks";
import type { ScratchProject } from "@fll-sim/llsp3";
import { programTarget, projectToXml, xmlToProject } from "@fll-sim/runtime-blocks";
import { MATRIX_MENU, fieldToMatrix, matrixToField, registerSpikeBlocks, registerUnknownBlocks, spikeTheme, toolboxXml } from "../blocks/spike";

export interface BlocksEditorHandle {
  /** Outline a block (e.g. the one that raised an error) and scroll to it; null clears. */
  showBlock(id: string | null): void;
}

interface Props {
  project: ScratchProject;
  /** Changes when a different project is opened (the editor reloads its blocks). */
  projectKey: string;
  onChange(p: ScratchProject): void;
  /** Opcodes the editor has no block for; they are kept unchanged. */
  onUnknown?(opcodes: string[]): void;
  /** The project's blocks could not be (fully) loaded into the editor. */
  onError?(message: string): void;
}

interface PromptState { title: string; message: string; value: string; list: boolean; done(v: string | null): void }
type Part = { kind: "label"; text: string } | { kind: "s" | "b"; name: string; id: string };
interface ProcState { parts: Part[]; warp: boolean; done(m: Element | null): void }

let msgsReady = false;

/** Swap every 5x5 image value between SPIKE digits and the editor's on/off field. */
function convertMatrices(root: Element, fn: (v: string) => string) {
  for (const f of Array.from(root.getElementsByTagName("field")))
    if (f.getAttribute("name") === `field_${MATRIX_MENU}`) f.textContent = fn(f.textContent ?? "");
}

function parseProc(m: Element): Part[] {
  const code = m.getAttribute("proccode") ?? "";
  const names: string[] = JSON.parse(m.getAttribute("argumentnames") ?? "[]");
  const ids: string[] = JSON.parse(m.getAttribute("argumentids") ?? "[]");
  const parts: Part[] = [];
  let i = 0;
  for (const tok of code.split(/(%[sbn])/)) {
    if (tok === "%s" || tok === "%n" || tok === "%b") {
      parts.push({ kind: tok === "%b" ? "b" : "s", name: names[i] ?? `input${i + 1}`, id: ids[i] ?? Blockly.utils.idGenerator.genUid() });
      i++;
    } else if (tok.trim()) parts.push({ kind: "label", text: tok.trim() });
  }
  return parts.length ? parts : [{ kind: "label", text: "my block" }];
}

function procMutation(parts: Part[], warp: boolean): Element {
  const args = parts.filter((p): p is Extract<Part, { id: string }> => p.kind !== "label");
  const m = document.createElementNS(null, "mutation") as Element;
  m.setAttribute("proccode", parts.map((p) => (p.kind === "label" ? p.text.replace(/%/g, "") : `%${p.kind}`)).join(" "));
  m.setAttribute("argumentids", JSON.stringify(args.map((a) => a.id)));
  m.setAttribute("argumentnames", JSON.stringify(args.map((a) => a.name)));
  m.setAttribute("argumentdefaults", JSON.stringify(args.map((a) => (a.kind === "b" ? "false" : ""))));
  m.setAttribute("warp", String(warp));
  return m;
}

export const BlocksEditor = forwardRef<BlocksEditorHandle, Props>(function BlocksEditor({ project, projectKey, onChange, onUnknown, onError }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const ws = useRef<Blockly.WorkspaceSvg | null>(null);
  const base = useRef(project);
  const loading = useRef(false);
  const cb = useRef({ onChange, onUnknown, onError });
  cb.current = { onChange, onUnknown, onError };
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [proc, setProc] = useState<ProcState | null>(null);

  useImperativeHandle(ref, () => ({
    showBlock(id) {
      const w = ws.current;
      if (!w) return;
      const b = id ? w.getBlockById(id) : null;
      Blockly.getSelected()?.unselect?.();
      if (b) {
        b.select();
        // the block itself, not the rest of its stack
        w.scrollBoundsIntoView((b as Blockly.BlockSvg).getBoundingRectangleWithoutChildren());
      }
    },
  }));

  // create the workspace once
  useEffect(() => {
    if (!msgsReady) {
      Blockly.ScratchMsgs.setLocale("en");
      msgsReady = true;
    }
    registerSpikeBlocks();
    Blockly.ScratchVariables.setPromptHandler((message, defaultValue, callback, title, varType) => {
      setPrompt({
        title: title || "New Variable",
        message,
        value: defaultValue,
        list: varType === "list",
        done: (v) => {
          setPrompt(null);
          callback(v as string, [], { scope: "global", isCloud: false });
        },
      });
    });
    Blockly.ScratchProcedures.externalProcedureDefCallback = (mutation, done) => {
      setProc({ parts: parseProc(mutation), warp: mutation.getAttribute("warp") === "true", done: (m) => { setProc(null); done(m ?? undefined); } });
    };
    const w = Blockly.inject(host.current!, {
      toolbox: toolboxXml(),
      media: "./blocks-media/",
      theme: spikeTheme(),
      zoom: { controls: true, wheel: true, startScale: 0.675 },
      grid: { spacing: 40, length: 2, colour: "#ddd" },
      move: { scrollbars: true, drag: true, wheel: true },
      trashcan: true,
      sounds: false,
      comments: true,
      scratchTheme: Blockly.ScratchBlocksTheme.CLASSIC,
    } as never);
    ws.current = w;
    w.registerToolboxCategoryCallback("VARIABLE", Blockly.ScratchVariables.getVariablesCategory as never);
    w.registerToolboxCategoryCallback("PROCEDURE", Blockly.ScratchProcedures.getProceduresCategory as never);
    // the toolbox first rendered before the Variables / My Blocks callbacks existed
    (w.getToolbox() as unknown as { forceRerender?(): void })?.forceRerender?.();
    Object.assign(window, { __blocks: w, __Blockly: Blockly }); // for scripted UI tests

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshToolbox = () => (w.getToolbox() as unknown as { forceRerender?(): void })?.forceRerender?.();
    w.addChangeListener((e: Blockly.Events.Abstract) => {
      if (e.isUiEvent || loading.current) return;
      if (e.type === Blockly.Events.VAR_CREATE || e.type === Blockly.Events.VAR_DELETE || e.type === Blockly.Events.VAR_RENAME) refreshToolbox();
      if (e.type === Blockly.Events.BLOCK_CREATE || e.type === Blockly.Events.BLOCK_DELETE || e.type === Blockly.Events.BLOCK_CHANGE) refreshToolbox();
      clearTimeout(timer);
      timer = setTimeout(() => {
        const dom = Blockly.Xml.workspaceToDom(w);
        convertMatrices(dom, fieldToMatrix);
        const p = xmlToProject(dom, base.current);
        base.current = p;
        cb.current.onChange(p);
      }, 250);
    });
    const ro = new ResizeObserver(() => Blockly.svgResize(w));
    ro.observe(host.current!);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      w.dispose();
      ws.current = null;
    };
  }, []);

  // (re)load the blocks when another project is opened
  useEffect(() => {
    const w = ws.current;
    if (!w) return;
    base.current = project;
    const unknown = registerUnknownBlocks(programTarget(project).blocks as Record<string, unknown>);
    cb.current.onUnknown?.(unknown);
    const dom = Blockly.utils.xml.textToDom(projectToXml(project));
    convertMatrices(dom, matrixToField);
    loading.current = true;
    try {
      Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, w);
    } catch (e) {
      console.error(e);
      cb.current.onError?.(String(e));
    } finally {
      loading.current = false;
    }
    (w.getToolbox() as unknown as { forceRerender?(): void })?.forceRerender?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  return (
    <div className="blocks-editor">
      <div ref={host} className="blocks-host" />
      {prompt && <PromptDialog state={prompt} />}
      {proc && <ProcDialog state={proc} />}
    </div>
  );
});

function PromptDialog({ state }: { state: PromptState }) {
  const [v, setV] = useState(state.value);
  const ok = () => state.done(v.trim() || null);
  return (
    <div className="modal-backdrop" onClick={() => state.done(null)}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <h2>{state.title}</h2>
        <label className="cal-field">
          {state.message}
          <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") state.done(null); }} />
        </label>
        <div className="modal-buttons">
          <button onClick={() => state.done(null)}>Cancel</button>
          <button className="primary" onClick={ok}>OK</button>
        </div>
      </div>
    </div>
  );
}

/** "Make a Block": the block's words and inputs, in order. */
function ProcDialog({ state }: { state: ProcState }) {
  const [parts, setParts] = useState<Part[]>(state.parts);
  const set = (i: number, p: Part) => setParts(parts.map((x, j) => (j === i ? p : x)));
  const add = (p: Part) => setParts([...parts, p]);
  const newId = () => Blockly.utils.idGenerator.genUid();
  const valid = parts.some((p) => p.kind === "label" && p.text.trim());
  return (
    <div className="modal-backdrop" onClick={() => state.done(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Make a Block</h2>
        <p className="hint">Words appear on the block; inputs become values you can use inside the definition.</p>
        <div className="proc-parts">
          {parts.map((p, i) => (
            <div key={i} className={`proc-part ${p.kind}`}>
              {p.kind === "label" ? (
                <input value={p.text} placeholder="words" onChange={(e) => set(i, { ...p, text: e.target.value })} />
              ) : (
                <>
                  <span className="proc-kind">{p.kind === "b" ? "⬡ true/false" : "◯ number or text"}</span>
                  <input value={p.name} onChange={(e) => set(i, { ...p, name: e.target.value })} />
                </>
              )}
              <button onClick={() => setParts(parts.filter((_, j) => j !== i))} title="Remove">✕</button>
            </div>
          ))}
        </div>
        <div className="modal-buttons left">
          <button onClick={() => add({ kind: "s", name: `input${parts.filter((x) => x.kind !== "label").length + 1}`, id: newId() })}>Add an input (number or text)</button>
          <button onClick={() => add({ kind: "b", name: `condition${parts.filter((x) => x.kind !== "label").length + 1}`, id: newId() })}>Add an input (true/false)</button>
          <button onClick={() => add({ kind: "label", text: "" })}>Add a label</button>
        </div>
        <div className="modal-buttons">
          <button onClick={() => state.done(null)}>Cancel</button>
          <button className="primary" disabled={!valid} onClick={() => state.done(procMutation(parts.filter((p) => p.kind !== "label" || p.text.trim()), state.warp))}>OK</button>
        </div>
      </div>
    </div>
  );
}
