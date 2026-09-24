import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/python/register";
import EditorWorker from "monaco-editor/editor/editor.worker.start?worker";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: () => new EditorWorker() };

// Autocomplete for the SPIKE modules, derived from the same Python files the simulator runs.
const pyModules = import.meta.glob("../../../../../../packages/runtime-python/python/**/*.py", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

interface Member { name: string; kind: "function" | "constant"; detail: string }
const API = new Map<string, Member[]>();
for (const [path, src] of Object.entries(pyModules)) {
  const rel = path.split("/python/")[1].replace(/\.py$/, "").replace(/\/__init__$/, "");
  if (rel.startsWith("_") || rel.includes("/_")) continue;
  const name = rel.split("/").pop()!;
  const members: Member[] = [];
  for (const m of src.matchAll(/^def ([a-z]\w*)\((.*)\):/gm)) members.push({ name: m[1], kind: "function", detail: `${m[1]}(${m[2]})` });
  for (const m of src.matchAll(/^([A-Z][A-Z0-9_]*) = (.+)$/gm)) members.push({ name: m[1], kind: "constant", detail: `${m[1]} = ${m[2]}` });
  if (rel === "hub") for (const sub of ["port", "button", "light", "light_matrix", "motion_sensor", "sound"]) members.push({ name: sub, kind: "constant", detail: `hub.${sub}` });
  API.set(name, members);
}

let providerRegistered = false;
function registerCompletions() {
  if (providerRegistered) return;
  providerRegistered = true;
  monaco.languages.registerCompletionItemProvider("python", {
    triggerCharacters: ["."],
    provideCompletionItems(model, pos) {
      const line = model.getValueInRange({ startLineNumber: pos.lineNumber, startColumn: 1, endLineNumber: pos.lineNumber, endColumn: pos.column });
      const word = model.getWordUntilPosition(pos);
      const range = { startLineNumber: pos.lineNumber, endLineNumber: pos.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
      const m = line.match(/([A-Za-z_]\w*)\.\w*$/);
      if (m && API.has(m[1])) {
        return {
          suggestions: API.get(m[1])!.map((x) => ({
            label: x.name,
            kind: x.kind === "function" ? monaco.languages.CompletionItemKind.Function : monaco.languages.CompletionItemKind.Constant,
            detail: x.detail,
            insertText: x.name,
            range,
          })),
        };
      }
      return {
        suggestions: [...API.keys()].map((k) => ({ label: k, kind: monaco.languages.CompletionItemKind.Module, insertText: k, range })),
      };
    },
  });
}

interface Props {
  value: string;
  onChange(v: string): void;
  errorLine?: number | null;
  errorText?: string | null;
  readOnly?: boolean;
}

export function CodeEditor({ value, onChange, errorLine, errorText, readOnly }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decos = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    registerCompletions();
    const e = monaco.editor.create(host.current!, {
      value,
      language: "python",
      theme: "vs-dark",
      automaticLayout: true,
      fontSize: 14,
      tabSize: 4,
      insertSpaces: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });
    ed.current = e;
    decos.current = e.createDecorationsCollection();
    const sub = e.onDidChangeModelContent(() => onChange(e.getValue()));
    return () => {
      sub.dispose();
      e.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const e = ed.current;
    if (e && e.getValue() !== value) e.setValue(value);
  }, [value]);

  useEffect(() => {
    ed.current?.updateOptions({ readOnly: !!readOnly });
  }, [readOnly]);

  useEffect(() => {
    const e = ed.current;
    if (!e) return;
    const model = e.getModel()!;
    if (errorLine) {
      decos.current!.set([{ range: new monaco.Range(errorLine, 1, errorLine, 1), options: { isWholeLine: true, className: "error-line", glyphMarginClassName: "error-glyph" } }]);
      monaco.editor.setModelMarkers(model, "sim", [{ startLineNumber: errorLine, endLineNumber: errorLine, startColumn: 1, endColumn: model.getLineMaxColumn(errorLine), message: errorText ?? "error", severity: monaco.MarkerSeverity.Error }]);
      e.revealLineInCenterIfOutsideViewport(errorLine);
    } else {
      decos.current!.clear();
      monaco.editor.setModelMarkers(model, "sim", []);
    }
  }, [errorLine, errorText]);

  return <div ref={host} className="code-editor" />;
}
