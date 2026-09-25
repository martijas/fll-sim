import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CALIBRATION, heightFactor, makeDriveBase, type ColorCalibration, type FieldModel, type FieldSnapshot, type RobotModel, type SeasonConfig, type StartPose, type VisualSpec } from "@fll-sim/sim";
import { ScorePanel } from "./components/ScorePanel";
import { defaultAnswers, score, type Answers } from "../../../../../seasons/2026-27/scoring";
import { autoScore, type AutoScore } from "../../../../../seasons/2026-27/autoscore";
import type { Library } from "@fll-sim/ldraw";
import { assemble, assembleMissionModel, parseModel, serializeModel, type ModelPart } from "@fll-sim/assembly";
import { Builder } from "./components/Builder";
import { loadLibrary, type CatalogCategory } from "./lib/ldraw";
import { readLlsp3, writePythonLlsp3, type Llsp3Project } from "@fll-sim/llsp3";
import { compileBlocks, type CompileResult } from "@fll-sim/runtime-blocks";
import { FieldView, type CameraMode, type FieldViewHandle } from "./three/FieldView";
import { CodeEditor } from "./components/CodeEditor";
import { HubPanel } from "./components/HubPanel";
import { Telemetry } from "./components/Telemetry";
import { RobotPanel } from "./components/RobotPanel";
import { CalibrationPanel } from "./components/CalibrationPanel";
import type { CalResult } from "./lib/calibration";
import { loadRobotConfig, saveRobotConfig, toDriveBaseOptions, type RobotConfig } from "./lib/robotConfig";
import { SimController } from "./lib/simController";
import { loadBundledMissions, loadDefaultMat, loadMatImage, loadSeason, poseOnDock, type BundledMission, type DockName, type DockSite, type LoadedMat } from "./lib/assets";
import { playHubEvents } from "./lib/audio";
import { DEFAULT_PROGRAM } from "./lib/samples";
import type { Frame } from "./worker/protocol";

const SEASON_ID = "2026-27";
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 100];

interface ConsoleLine { text: string; kind: "out" | "err" | "info" }

/** Missions 13-15: the interchangeable models (any of them can go on any dock). */
const DOCK_MODELS = [
  { id: "m13", name: "M13 Keystone Species" },
  { id: "m14", name: "M14 Seeds of Renewal" },
  { id: "m15", name: "M15 Biocentric Architecture" },
];

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
  const [showCal, setShowCal] = useState(false);
  /** Colour sensor calibration (from the calibration kit), used by the simulator. */
  const [colorCal, setColorCal] = useState<ColorCalibration>(() => {
    try {
      return { ...DEFAULT_CALIBRATION, ...JSON.parse(localStorage.getItem("fllsim.colorCal") ?? "{}") };
    } catch {
      return DEFAULT_CALIBRATION;
    }
  });
  // calibration runs in the simulator: console lines and "program finished"
  const calTap = useRef<((line: string) => void) | null>(null);
  const calDone = useRef<(() => void) | null>(null);
  const lastFrame = useRef<Frame | null>(null);
  /** Set when a Word Blocks project is open: the editor shows its compiled Python read-only. */
  const [blocks, setBlocks] = useState<CompileResult | null>(null);
  const [tab, setTab] = useState<"sim" | "build">("sim");
  const [ldraw, setLdraw] = useState<{ lib: Library; catalog: CatalogCategory[] } | null>(null);
  const [buildParts, setBuildParts] = useState<ModelPart[]>([]);
  /** "drivebase" = port-configured default robot; "ldraw" = the model from the builder. */
  const [robotSource, setRobotSource] = useState<"drivebase" | "ldraw">(() => (localStorage.getItem("fllsim.robotSource") === "ldraw" ? "ldraw" : "drivebase"));
  const [rightTab, setRightTab] = useState<"console" | "score">("console");
  const [answers, setAnswers] = useState<Answers>(() => {
    try {
      return { ...defaultAnswers(), ...JSON.parse(localStorage.getItem("fllsim.score") ?? "{}") };
    } catch {
      return defaultAnswers();
    }
  });
  const [footprints, setFootprints] = useState(true);
  /** The last automatic scoring from the simulated field (shown as badges on the sheet). */
  const [auto, setAuto] = useState<AutoScore | null>(null);
  /** Fill in the score sheet from the field (only the questions the field settles); returns the total. */
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const applyAutoScore = useCallback((snap: FieldSnapshot) => {
    const a = autoScore(snap);
    const next = { ...answersRef.current, ...a.answers };
    setAuto(a);
    setAnswers(next);
    return { total: score(next).total, n: Object.keys(a.answers).length };
  }, []);
  /** Real-part mission models built by the team: mission model id -> .ldr text. */
  const [missionLdr, setMissionLdr] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("fllsim.missionModels") ?? "{}");
    } catch {
      return {};
    }
  });
  /** Mission models shipped with the season (real parts, placed on their mat marks). */
  const [bundled, setBundled] = useState<Record<string, BundledMission>>({});
  const [dockSites, setDockSites] = useState<Partial<Record<DockName, DockSite>>>({});
  /** Missions 13-15: which model the team puts on each dock (part of their strategy). */
  const [docks, setDocks] = useState<Record<DockName, string>>(() => {
    try {
      return { farm: "m13", city: "m14", mine: "m15", ...JSON.parse(localStorage.getItem("fllsim.docks") ?? "{}") };
    } catch {
      return { farm: "m13", city: "m14", mine: "m15" };
    }
  });
  const [realMissions, setRealMissions] = useState(() => localStorage.getItem("fllsim.realMissions") !== "off");
  /** Sim time (ms) when the current match started, or null. */
  const [matchStart, setMatchStart] = useState<number | null>(null);
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
        const b = await loadBundledMissions(SEASON_ID);
        setBundled(b.models);
        setDockSites(b.docks);
      } catch (e) {
        setBootError(String(e));
      }
    })();
  }, []);

  // LDraw part library + the saved builder model.
  const buildLoaded = useRef(false);
  useEffect(() => {
    loadLibrary()
      .then(async (l) => {
        setLdraw(l);
        const saved = localStorage.getItem("fllsim.buildModel");
        const savedParts = saved ? parseModel(l.lib, saved).parts : [];
        if (savedParts.length) setBuildParts(savedParts);
        else {
          // First run: start the builder with the example real-parts drive base.
          const ex = await window.fllsim.readAsset("apps/desktop/resources/robots/spike-drivebase.ldr");
          if (ex) setBuildParts(parseModel(l.lib, new TextDecoder("latin1").decode(ex)).parts);
        }
        buildLoaded.current = true;
      })
      .catch((e) => log(`LEGO parts library unavailable: ${e}`, "err"));
  }, [log]);
  useEffect(() => {
    if (!buildLoaded.current) return; // don't overwrite the saved model before it has been loaded
    try {
      localStorage.setItem("fllsim.buildModel", serializeModel(buildParts));
      localStorage.setItem("fllsim.robotSource", robotSource);
    } catch {
      /* storage full or unavailable */
    }
  }, [buildParts, robotSource]);

  const robotModel: RobotModel = useMemo(() => {
    if (robotSource === "ldraw" && ldraw && buildParts.length) {
      try {
        return assemble(ldraw.lib, buildParts, { name: "Built robot", breakable: true }).robot;
      } catch (e) {
        console.error(e);
      }
    }
    return makeDriveBase(toDriveBaseOptions(robot));
  }, [robotSource, ldraw, buildParts, robot]);
  useEffect(() => {
    try {
      localStorage.setItem("fllsim.score", JSON.stringify(answers));
      localStorage.setItem("fllsim.missionModels", JSON.stringify(missionLdr));
    } catch {
      /* ignore */
    }
  }, [answers, missionLdr]);

  // Real-part mission models: the season's bundled ones on their mat marks, replaced by the
  // team's own builds where they made one (see assembleMissionModel for Dual Lock and gluing).
  const fieldModels: FieldModel[] = useMemo(() => {
    if (!season || !ldraw) return [];
    const out: FieldModel[] = [];
    // interchangeable models go on the dock the team chose (their field id is the dock's: dock-farm…)
    const onDock = new Map<string, { model: BundledMission; pose: BundledMission["pose"] }>();
    for (const [site, mid] of Object.entries(docks) as [DockName, string][]) {
      const model = bundled[mid], where = dockSites[site];
      if (model?.dock && where) onDock.set(`dock-${site}`, { model, pose: poseOnDock(model, where) });
    }
    const plain = Object.keys(bundled).filter((id) => !bundled[id].dock);
    const ids = new Set([...(realMissions ? [...plain, ...onDock.keys()] : []), ...Object.keys(missionLdr)]);
    for (const id of ids) {
      const spec = season.missionModels.find((m) => m.id === id);
      const docked = onDock.get(id);
      const text = missionLdr[id] ?? docked?.model.text ?? bundled[id]?.text;
      const f = spec?.shape;
      const pose = docked?.pose ?? bundled[id]?.pose ?? (f ? { xMm: f.cx, yMm: f.cy, headingDeg: f.kind === "rect" ? f.rot : 0 } : null);
      if (!text || !pose) continue;
      try {
        const { robot: model, fixedBodies } = assembleMissionModel(ldraw.lib, parseModel(ldraw.lib, text).parts, { name: spec?.name ?? id, fixed: missionLdr[id] ? true : bundled[id]?.fixed });
        out.push({ id, model, pose, fixedBodies });
      } catch (e) {
        console.error(`mission model ${id}:`, e);
      }
    }
    return out;
  }, [season, ldraw, missionLdr, bundled, realMissions, docks, dockSites]);
  useEffect(() => {
    try {
      localStorage.setItem("fllsim.docks", JSON.stringify(docks));
    } catch {
      /* ignore */
    }
    // M15's environmental bonus depends on the dock it is on
    const site = (Object.entries(docks) as [DockName, string][]).find(([, m]) => m === "m15")?.[0];
    if (site) setAnswers((a) => ({ ...a, m15d: site === "mine" ? "Mine" : site === "city" ? "City" : "Farm" }));
  }, [docks]);
  useEffect(() => {
    try {
      localStorage.setItem("fllsim.realMissions", realMissions ? "on" : "off");
    } catch {
      /* ignore */
    }
  }, [realMissions]);

  /** Display names of the season's mission models, plus bundled models that have no footprint (e.g. "m01-stand"). */
  const missionNames = useMemo(() => {
    if (!season) return [];
    const label = (m: SeasonConfig["missionModels"][number]) => `M${m.missions.map((n) => String(n).padStart(2, "0")).join("/")} ${m.name}`;
    const out = season.missionModels.map((m) => ({ id: m.id, name: label(m) }));
    for (const id of Object.keys(bundled).sort()) {
      if (out.some((m) => m.id === id)) continue;
      const dm = DOCK_MODELS.find((m) => m.id === id);
      if (dm) { out.push({ id, name: dm.name }); continue; }
      const base = season.missionModels.find((m) => id.startsWith(m.id + "-"));
      out.push({ id, name: base ? `${label(base)} (${id.slice(base.id.length + 1)})` : id });
    }
    return out;
  }, [season, bundled]);

  const robotVisuals = useMemo(() => {
    const v: Record<string, VisualSpec[]> = {};
    for (const b of robotModel.bodies) if (b.visuals?.length) v[b.id] = b.visuals;
    for (const fm of fieldModels) for (const b of fm.model.bodies) if (b.visuals?.length) v[`${fm.id}:${b.id}`] = b.visuals;
    return v;
  }, [robotModel, fieldModels]);

  const inspection = useMemo(() => {
    const fp = robotModel.footprintMm;
    const r = season?.launchAreas[0]?.radiusMm ?? 483;
    const hMax = season?.robotLimits.heightMm ?? 305;
    const diag = Math.hypot(fp.w, fp.l);
    const pass = diag <= r && fp.h <= hMax;
    return { pass, why: `${fp.w.toFixed(0)} × ${fp.l.toFixed(0)} mm (diagonal ${diag.toFixed(0)} of ${r} mm launch radius), ${fp.h.toFixed(0)} mm tall (limit ${hMax}) → ${pass ? "fits" : "does not fit"} (attachments not included)` };
  }, [robotModel, season]);
  const visualsRef = useRef({ lib: null as Library | null, visuals: robotVisuals });
  visualsRef.current = { lib: ldraw?.lib ?? null, visuals: robotVisuals };

  // (Re)create the simulation controller when season/mat are ready.
  useEffect(() => {
    if (!season) return;
    const c = new SimController(
      {
        scene: (bodies, ids) => field.current?.setScene(bodies, ids, visualsRef.current.lib, visualsRef.current.visuals),
        frame: (f) => {
          lastFrame.current = f;
          field.current?.setTransforms(f.transforms);
          if (f.running) field.current?.addTrail(f.pose.xMm, f.pose.yMm);
          setFrame(f);
        },
        stdout: (l) => {
          log(l);
          calTap.current?.(l);
        },
        hub: (ev) => playHubEvents(ev, speedRef.current),
        done: (r, snap) => {
          calDone.current?.();
          setRunning(false);
          setPaused(false);
          const scored = calTap.current ? null : applyAutoScore(snap); // (not for calibration runs)
          setMatchStart((ms) => {
            if (ms !== null) {
              log(`⏱ Match over — ${scored ? `auto-scored from the field: ${scored.total} points. ` : ""}Check the Score tab for what to fill in by hand.`, "info");
              setRightTab("score");
            }
            return null;
          });
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
      { season, mat: mat?.payload ?? null, robot: robotModel, start, fieldModels, footprints, colorCalibration: colorCal },
    );
    ctl.current = c;
    c.boot();
    return () => c.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, mat, robotModel, fieldModels, footprints, colorCal]);

  useEffect(() => {
    consoleEnd.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  const run = (match = false) => {
    const c = ctl.current;
    if (!c) return;
    setError(null);
    field.current?.clearTrail();
    if (frame && frame.timeMs > 300) c.setStart(start); // fresh robot (and field) for every run
    setLines([]);
    const durationS = season?.match.durationS ?? 150;
    log(match ? `▶ Match started: ${fileName} — ${Math.floor(durationS / 60)}:${String(durationS % 60).padStart(2, "0")} on the clock` : `▶ Running ${fileName}`, "info");
    setRunning(true);
    setMatchStart(match ? 250 : null); // the field settles for 250 ms before the program starts
    c.run(source, match ? durationS * 1000 : undefined);
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
  /** Run a calibration program in the simulator from a fresh start; its console lines and how far the robot moved. */
  const runForCalibration = async (source: string) => {
    const c = ctl.current;
    if (!c) return { lines: [], movedMm: 0 };
    field.current?.clearTrail();
    c.setStart(start);
    await new Promise((r) => setTimeout(r, 600)); // let the fresh field settle and report its pose
    const p0 = lastFrame.current?.pose;
    const lines: string[] = [];
    calTap.current = (l) => lines.push(l);
    const done = new Promise<void>((r) => (calDone.current = r));
    setRunning(true);
    c.run(source);
    await done;
    calTap.current = calDone.current = null;
    await new Promise((r) => setTimeout(r, 100));
    const p1 = lastFrame.current?.pose;
    return { lines, movedMm: p0 && p1 ? Math.hypot(p1.xMm - p0.xMm, p1.yMm - p0.yMm) : 0 };
  };
  /** The simulator's colour readings over the mat's white and black (for the calibration kit). */
  const colorModel = useMemo(() => {
    const sensor = robotModel.sensors.find((x) => x.type === "color");
    if (!sensor) return undefined;
    // luminance of the mat's white and black: 99th / 1st percentile of the loaded mat (else typical print)
    let lumWhite = 0.85, lumBlack = 0.02;
    const px = mat?.payload;
    if (px) {
      const d = new Uint8Array(px.data), lums: number[] = [];
      const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      for (let i = 0; i < d.length; i += 4 * 97) lums.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
      lums.sort((a, b) => a - b);
      lumBlack = lums[Math.floor(lums.length * 0.01)];
      lumWhite = lums[Math.floor(lums.length * 0.99)];
    }
    const f = heightFactor(sensor.posMm.y);
    const read = (lum: number) => Math.round(Math.max(0, Math.min(100, f * (colorCal.offset + colorCal.gain * Math.pow(lum, 0.6)))));
    return { white: read(lumWhite), black: read(lumBlack), heightFactor: f, lumWhite, lumBlack };
  }, [robotModel, mat, colorCal]);
  const applyCalibration = (r: CalResult) => {
    if (r.wheelDiameterMm || r.trackWidthMm) {
      const c = { ...robot, ...(r.wheelDiameterMm ? { wheelDiameterMm: r.wheelDiameterMm } : {}), ...(r.trackWidthMm ? { trackWidthMm: r.trackWidthMm } : {}) };
      saveRobotConfig(c);
      setRobot(c);
    }
    if (r.colorCalibration) {
      setColorCal(r.colorCalibration);
      try {
        localStorage.setItem("fllsim.colorCal", JSON.stringify(r.colorCalibration));
      } catch {
        /* ignore */
      }
    }
    log(`Calibration applied: ${r.notes.join(" ")}`, "info");
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
      if (e.key === "F5" && !e.shiftKey) { e.preventDefault(); if (!running) run(false); }
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
        <div className="tabs">
          <button className={tab === "sim" ? "on" : ""} onClick={() => setTab("sim")}>Simulate</button>
          <button className={tab === "build" ? "on" : ""} onClick={() => setTab("build")} disabled={!ldraw}>Build</button>
        </div>
        <div className="group">
          <button onClick={openFile} title="Open .llsp3 / .py (Ctrl+O)">Open</button>
          <button onClick={() => saveFile(false)} title="Save as .llsp3 (Ctrl+S)">Save</button>
          <button onClick={() => saveFile(true)}>Save as…</button>
          <span className="file">{fileName}</span>
        </div>
        <div className="group run">
          {!running ? (
            <>
              <button className="primary" onClick={() => run(false)} title="Run (F5)">▶ Run</button>
              <button onClick={() => run(true)} title="Run as a 2:30 match: the program is stopped when time is up">⏱ Match</button>
            </>
          ) : (
            <button className="danger" onClick={stop} title="Stop (Shift+F5)">■ Stop</button>
          )}
          <button onClick={togglePause} disabled={!running}>{paused ? "▶ Resume" : "❚❚ Pause"}</button>
          {matchStart !== null && frame && (
            <span className="match-timer" title="Match time remaining">
              {(() => {
                const left = Math.max(0, (season.match.durationS * 1000 - (frame.timeMs - matchStart)) / 1000);
                return `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;
              })()}
            </span>
          )}
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
          <select value={robotSource} disabled={running} onChange={(e) => setRobotSource(e.target.value as "drivebase" | "ldraw")} title="Which robot to simulate">
            <option value="drivebase">Robot: standard drive base</option>
            <option value="ldraw" disabled={!buildParts.length}>Robot: my build ({buildParts.length} parts)</option>
          </select>
          <button onClick={() => setShowRobot(true)} disabled={running || robotSource !== "drivebase"} title="Motor and sensor ports, wheels">Ports…</button>
          <button onClick={() => setShowCal(true)} disabled={running || robotSource !== "drivebase"} title="Measure your real robot with a few test programs and make the simulated one match it">Calibrate…</button>
          <button onClick={importMat} title="Load a scan/photo of your mat, cropped to its edges">Mat image…</button>
        </div>
      </header>
      {tab === "build" && ldraw && (
        <Builder
          lib={ldraw.lib}
          catalog={ldraw.catalog}
          parts={buildParts}
          onChange={setBuildParts}
          log={log}
          missionModels={missionNames.map((m) => ({ ...m, built: !!missionLdr[m.id] }))}
          bundledMissions={missionNames.filter((m) => bundled[m.id]).map((m) => ({ ...m, text: bundled[m.id].text }))}
          onUseAsMissionModel={(id, p) => {
            if (!p.length) {
              const { [id]: _removed, ...rest } = missionLdr;
              setMissionLdr(rest);
              log(`Mission model ${id} reset to ${bundled[id] ? "the standard model" : "its stand-in block"}`, "info");
              return;
            }
            setMissionLdr({ ...missionLdr, [id]: serializeModel(p, `${id}.ldr`) });
            log(`Mission model ${id} placed on the field from your build (${p.length} parts). Its heaviest part on the mat is held by Dual Lock.`, "info");
            setTab("sim");
          }}
          onUseAsRobot={(p) => {
            const r = assemble(ldraw.lib, p);
            for (const w of r.report.warnings) log(`⚠ ${w}`, "err");
            log(`Robot from builder: ${r.report.bodies} rigid groups, ${r.report.motors} motors (${r.robot.motors.map((m) => m.port).join(", ") || "none"}), sensors ${r.robot.sensors.map((x) => `${x.type} ${x.port}`).join(", ") || "none"}`, "info");
            setRobotSource("ldraw");
            setTab("sim");
          }}
        />
      )}
      <main className="main" style={{ display: tab === "sim" ? undefined : "none" }}>
        <section className="left">
          <div className="field-wrap">
            <FieldView ref={field} season={season} matCanvas={mat?.canvas ?? null} />
            <div className="cam-buttons">
              {(["orbit", "top", "follow"] as CameraMode[]).map((m) => (
                <button key={m} onClick={() => field.current?.setCamera(m)}>{m === "orbit" ? "3D" : m === "top" ? "Top" : "Follow"}</button>
              ))}
              <button onClick={() => setFootprints(!footprints)} disabled={running} title="Mission models without a real-part build are shown as blocks at their wireframe positions">
                {footprints ? "Hide" : "Show"} mission blocks
              </button>
              {Object.keys(bundled).length > 0 && (
                <button onClick={() => setRealMissions(!realMissions)} disabled={running} title="The season's mission models built from real LEGO parts (off = simple blocks, faster)">
                  Mission models: {realMissions ? "LEGO" : "blocks"}
                </button>
              )}
              {Object.keys(dockSites).length > 0 && (
                <span className="docks" title="Missions 13-15: choose which model goes on each dock (part of your strategy)">
                  {(["farm", "city", "mine"] as DockName[]).map((site) => (
                    <label key={site}>
                      {site[0].toUpperCase() + site.slice(1)}{" "}
                      <select
                        value={docks[site]}
                        disabled={running}
                        onChange={(e) => {
                          const mid = e.target.value;
                          // (a model can only be on one dock: swap with the dock that had it)
                          const other = (Object.keys(docks) as DockName[]).find((k) => docks[k] === mid);
                          setDocks({ ...docks, [site]: mid, ...(other && other !== site ? { [other]: docks[site] } : {}) });
                        }}
                      >
                        {DOCK_MODELS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                  ))}
                </span>
              )}
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
          <div className="right-tabs">
            <button className={rightTab === "console" ? "on" : ""} onClick={() => setRightTab("console")}>Console</button>
            <button className={rightTab === "score" ? "on" : ""} onClick={() => setRightTab("score")}>Score</button>
          </div>
          {rightTab === "console" ? (
            <div className="console">
              {lines.map((l, i) => <div key={i} className={`line ${l.kind}`}>{l.text}</div>)}
              <div ref={consoleEnd} />
            </div>
          ) : (
            <ScorePanel
              answers={{ ...answers, ei: answers.ei }}
              onChange={setAnswers}
              onReset={() => { setAnswers({ ...defaultAnswers(), ei: inspection.pass }); setAuto(null); }}
              inspection={inspection}
              auto={auto}
              onAutoScore={running ? null : async () => {
                const snap = await ctl.current?.snapshot();
                if (!snap) return;
                const r = applyAutoScore(snap);
                log(`Score sheet filled in from the field: ${r.n} answers, ${r.total} points.`, "info");
              }}
            />
          )}
        </section>
      </main>
      {showRobot && <RobotPanel config={robot} onApply={applyRobot} onClose={() => setShowRobot(false)} />}
      {showCal && <CalibrationPanel config={robot} colorCal={colorCal} colorModel={colorModel} runInSim={runForCalibration} onApply={applyCalibration} onClose={() => setShowCal(false)} />}
    </div>
  );
}
