import { useCallback, useEffect, useRef, useState } from "react";
import type { SeasonConfig, StartPose } from "@fll-sim/sim";
import { readLlsp3, writePythonLlsp3, type Llsp3Project } from "@fll-sim/llsp3";
import { compileBlocks, type CompileResult } from "@fll-sim/runtime-blocks";
import { FieldView, type CameraMode, type FieldViewHandle } from "./three/FieldView";
import { CodeEditor } from "./components/CodeEditor";
import { HubPanel } from "./components/HubPanel";
import { Telemetry } from "./components/Telemetry";
import { RobotPanel } from "./components/RobotPanel";
import { loadRobotConfig, saveRobotConfig, toDriveBaseOptions, type RobotConfig } from "./lib/robotConfig";
import { SimController } from "./lib/simController";
import { loadDefaultMat, loadMatImage, loadSeason, type LoadedMat } from "./lib/assets";
import { playHubEvents } from "./lib/audio";
import { DEFAULT_PROGRAM } from "./lib/samples";
import type { Frame } from "./worker/protocol";

const SEASON_ID = "2026-27";
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 100];

interface ConsoleLine { text: string; kind: "out" | "err" | "info" }

export function App() {
  const [season, setSeason] = useState<SeasonConfig | null>(null);
  const [mat, setMat] = useState<LoadedMat | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [source, setSource] = useState(DEFAULT_PROGRAM);
  const [fileName, setFileName] = useState<string>("Untitled.llsp3");
  const [filePath, setFilePath] = useState<string | undefined>();
  const [project, setProject] = useState<Llsp3Project | undefined>();
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [start, setStart] = useState<StartPose>({ xMm: 230, yMm: 180, headingDeg: 0 });
  const [error, setError] = useState<{ line?: number; text: string } | null>(null);
  const [robot, setRobot] = useState<RobotConfig>(loadRobotConfig);
  const [showRobot, setShowRobot] = useState(false);
  /** Set when a Word Blocks project is open: the editor shows its compiled Python read-only. */
  const [blocks, setBlocks] = useState<CompileResult | null>(null);
  const field = useRef<FieldViewHandle>(null);
  const ctl = useRef<SimController | null>(null);
  const consoleEnd = useRef<HTMLDivElement>(null);
  const speedRef = useRef(1);

  const log = useCallback((text: string, kind: ConsoleLine["kind"] = "out") => {
    setLines((l) => (l.length > 2000 ? [...l.slice(-1500), { text, kind }] : [...l, { text, kind }]));
  }, []);

  // Load season + mat once.
  useEffect(() => {
    (async () => {
      try {
        const s = await loadSeason(SEASON_ID);
        setSeason(s);
        setMat(await loadDefaultMat(s));
      } catch (e) {
        setBootError(String(e));
      }
    })();
  }, []);

  // (Re)create the simulation controller when season/mat are ready.
  useEffect(() => {
    if (!season) return;
    const c = new SimController(
      {
        scene: (bodies, ids) => field.current?.setScene(bodies, ids),
        frame: (f) => {
          field.current?.setTransforms(f.transforms);
          if (f.running) field.current?.addTrail(f.pose.xMm, f.pose.yMm);
          setFrame(f);
        },
        stdout: (l) => log(l),
        hub: (ev) => playHubEvents(ev, speedRef.current),
        done: (r) => {
          setRunning(false);
          setPaused(false);
          if (r.stopped) log(`■ Stopped at ${(r.simTimeMs / 1000).toFixed(2)} s`, "info");
          else if (r.ok) log(`✔ Program finished at ${(r.simTimeMs / 1000).toFixed(2)} s (sim time)`, "info");
          else {
            log(`✖ ${r.errorType ?? "Error"}`, "err");
            setError({ line: r.errorLine, text: r.error ?? "" });
          }
        },
        fatal: (m) => {
          setRunning(false);
          log(`Simulator error: ${m}`, "err");
        },
      },
      { season, mat: mat?.payload ?? null, robot: toDriveBaseOptions(robot), start },
    );
    ctl.current = c;
    c.boot();
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, mat, robot]);

  useEffect(() => {
    consoleEnd.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const run = () => {
    const c = ctl.current;
    if (!c) return;
    setError(null);
    field.current?.clearTrail();
    if (frame && frame.timeMs > 300) c.setStart(start); // fresh robot for every run
    setLines([]);
    log(`▶ Running ${fileName}`, "info");
    setRunning(true);
    c.run(source);
  };
  const stop = () => {
    ctl.current?.stop();
    setRunning(false);
    setPaused(false);
    log("■ Stopped", "info");
  };
  const reset = () => {
    field.current?.clearTrail();
    ctl.current?.setStart(start);
    setRunning(false);
    setPaused(false);
  };
  const togglePause = () => {
    const c = ctl.current;
    if (!c) return;
    c.setPaused(!paused);
    setPaused(!paused);
  };
  const changeSpeed = (s: number) => {
    speedRef.current = s;
    setSpeed(s);
    ctl.current?.setSpeed(s);
  };
  const applyStart = (p: StartPose) => {
    setStart(p);
    if (!running) {
      field.current?.clearTrail();
      ctl.current?.setStart(p);
    }
  };

  const openFile = async () => {
    const f = await window.fllsim.openFile([{ name: "SPIKE projects & Python", extensions: ["llsp3", "py"] }]);
    if (!f) return;
    try {
      if (f.name.endsWith(".py")) {
        setBlocks(null);
        setSource(new TextDecoder().decode(f.data));
        setProject(undefined);
        setFileName(f.name.replace(/\.py$/, ".llsp3"));
        setFilePath(undefined);
      } else {
        const p = readLlsp3(f.data);
        if (p.kind === "word-blocks") {
          const c = compileBlocks(p.project);
          setBlocks(c);
          setProject(p);
          setSource(c.python);
          setFileName(f.name);
          setFilePath(f.path);
          setError(null);
          log(`Opened Word Blocks project ${f.name} (shown as the Python it runs as)`, "info");
          for (const w of c.warnings) log(`⚠ ${w}`, "err");
          return;
        }
        setBlocks(null);
        setProject(p);
        setSource(p.source);
        setFileName(f.name);
        setFilePath(f.path);
      }
      setError(null);
      log(`Opened ${f.name}`, "info");
    } catch (e) {
      log(`Could not open ${f.name}: ${e}`, "err");
    }
  };
  const saveFile = async (as = false) => {
    if (blocks) {
      log("Word Blocks projects are read-only here — edit them in the SPIKE App, or use “Convert to Python”.", "err");
      return;
    }
    const name = fileName.replace(/\.llsp3$/, "");
    const data = writePythonLlsp3(source, name, project);
    const r = await window.fllsim.saveFile(fileName, data, [{ name: "SPIKE project", extensions: ["llsp3"] }], as ? undefined : filePath);
    if (r) {
      setFileName(r.name);
      setFilePath(r.path);
      setProject(readLlsp3(data));
      log(`Saved ${r.path}`, "info");
    }
  };
  const applyRobot = (c: RobotConfig) => {
    saveRobotConfig(c);
    setRobot(c);
    setShowRobot(false);
    field.current?.clearTrail();
    log(`Robot: ${c.name} — drive ${c.leftPort}+${c.rightPort}, colour ${c.colorPorts.join(",") || "none"}, distance ${c.distancePort || "none"}, motors ${c.attachmentPorts.join(",") || "none"}`, "info");
  };
  const convertToPython = () => {
    setBlocks(null);
    setProject(undefined);
    setFileName(fileName.replace(/\.llsp3$/, "") + " (Python).llsp3");
    setFilePath(undefined);
    log("Converted to an editable Python project. Save to keep it; the original blocks file is unchanged.", "info");
  };

  const importMat = async () => {
    const f = await window.fllsim.openFile([{ name: "Mat image (to scale)", extensions: ["png", "jpg", "jpeg", "webp"] }]);
    if (!f) return;
    setMat(await loadMatImage(f.data));
    await window.fllsim.saveUserMat(season!.id, f.data);
    log(`Mat image ${f.name} loaded and saved for next time — it is stretched to ${season!.mat.sizeMm.w} × ${season!.mat.sizeMm.h} mm.`, "info");
  };

  // Keyboard shortcuts: F5 run, Shift+F5 stop, Ctrl+S save, Ctrl+O open.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F5" && !e.shiftKey) { e.preventDefault(); if (!running) run(); }
      else if (e.key === "F5" && e.shiftKey) { e.preventDefault(); stop(); }
      else if (e.ctrlKey && e.key === "s") { e.preventDefault(); saveFile(e.shiftKey); }
      else if (e.ctrlKey && e.key === "o") { e.preventDefault(); openFile(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (bootError) return <div className="boot-error">Failed to start: {bootError}</div>;
  if (!season) return <div className="boot">Loading season…</div>;

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">FLL Sim <span>{season.name} · {season.id}</span></div>
        <div className="group">
          <button onClick={openFile} title="Open .llsp3 / .py (Ctrl+O)">Open</button>
          <button onClick={() => saveFile(false)} title="Save as .llsp3 (Ctrl+S)">Save</button>
          <button onClick={() => saveFile(true)}>Save as…</button>
          <span className="file">{fileName}</span>
        </div>
        <div className="group run">
          {!running ? (
            <button className="primary" onClick={run} title="Run (F5)">▶ Run</button>
          ) : (
            <button className="danger" onClick={stop} title="Stop (Shift+F5)">■ Stop</button>
          )}
          <button onClick={togglePause} disabled={!running}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
          <button onClick={reset} disabled={running} title="Put the robot back at the start pose">↺ Reset</button>
          <label>
            Speed
            <select value={speed} onChange={(e) => changeSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => <option key={s} value={s}>{s === 100 ? "max" : `${s}×`}</option>)}
            </select>
          </label>
        </div>
        <div className="group">
          <label>X <input type="number" value={start.xMm} step={5} disabled={running} onChange={(e) => applyStart({ ...start, xMm: Number(e.target.value) })} /></label>
          <label>Y <input type="number" value={start.yMm} step={5} disabled={running} onChange={(e) => applyStart({ ...start, yMm: Number(e.target.value) })} /></label>
          <label>Heading <input type="number" value={start.headingDeg} step={5} disabled={running} onChange={(e) => applyStart({ ...start, headingDeg: Number(e.target.value) })} /></label>
          <button onClick={() => setShowRobot(true)} disabled={running} title="Motor and sensor ports, wheels">Robot…</button>
          <button onClick={importMat} title="Load a scan/photo of your mat, cropped to its edges">Mat image…</button>
        </div>
      </header>
      <main className="main">
        <section className="left">
          <div className="field-wrap">
            <FieldView ref={field} season={season} matCanvas={mat?.canvas ?? null} />
            <div className="cam-buttons">
              {(["orbit", "top", "follow"] as CameraMode[]).map((m) => (
                <button key={m} onClick={() => field.current?.setCamera(m)}>{m === "orbit" ? "3D" : m === "top" ? "Top" : "Follow"}</button>
              ))}
            </div>
            <div className="status">
              {frame ? `t = ${(frame.timeMs / 1000).toFixed(2)} s · (${frame.pose.xMm.toFixed(0)}, ${frame.pose.yMm.toFixed(0)}) mm · ${frame.pose.headingDeg.toFixed(1)}°` : "starting…"}
              {running && (paused ? " · paused" : " · running")}
            </div>
          </div>
          <div className="bottom">
            <HubPanel pixels={frame?.pixels ?? new Array(25).fill(0)} lights={frame?.lights ?? {}} onButton={(w, d) => ctl.current?.setButton(w, d)} />
            <Telemetry frame={frame} />
          </div>
        </section>
        <section className="right">
          {blocks && (
            <div className="banner">
              <span>🧩 Word Blocks project — showing the Python it runs as (read-only).</span>
              {blocks.warnings.map((w) => <span key={w} className="warn">⚠ {w}</span>)}
              <button onClick={convertToPython}>Convert to Python</button>
            </div>
          )}
          <CodeEditor value={source} onChange={setSource} readOnly={!!blocks} errorLine={error?.line ?? null} errorText={error?.text ?? null} />
          <div className="console">
            {lines.map((l, i) => <div key={i} className={`line ${l.kind}`}>{l.text}</div>)}
            <div ref={consoleEnd} />
          </div>
        </section>
      </main>
      {showRobot && <RobotPanel config={robot} onApply={applyRobot} onClose={() => setShowRobot(false)} />}
    </div>
  );
}
