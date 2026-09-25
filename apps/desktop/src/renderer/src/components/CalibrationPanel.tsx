// Calibrate the simulated robot against the real one: save the test programs for the SPIKE App,
// paste what they printed, and apply the corrections.
import { useMemo, useState } from "react";
import type { ColorCalibration } from "@fll-sim/sim";
import { writePythonLlsp3 } from "@fll-sim/llsp3";
import { calibrationTests, corrections, metrics, parseCalLog, type CalMetrics, type CalResult } from "../lib/calibration";
import type { RobotConfig } from "../lib/robotConfig";

interface Props {
  config: RobotConfig;
  colorCal: ColorCalibration;
  /** the simulator's colour readings model (mat white/black and sensor height), if known */
  colorModel?: { white: number; black: number; heightFactor: number; lumWhite: number; lumBlack: number };
  /** run a program in the simulator: its console lines and how far the robot moved (mm) */
  runInSim(source: string): Promise<{ lines: string[]; movedMm: number }>;
  onApply(r: CalResult): void;
  onClose(): void;
}

const KEY = "fllsim.calibration";

export function CalibrationPanel({ config, colorCal, colorModel, runInSim, onApply, onClose }: Props) {
  const tests = useMemo(() => calibrationTests(config), [config]);
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "{}") as { real?: string; distance?: string; sim?: string; simMm?: number };
    } catch {
      return {};
    }
  })();
  const [real, setReal] = useState(saved.real ?? "");
  const [distance, setDistance] = useState(saved.distance ?? "");
  const [sim, setSim] = useState<{ text: string; driveMm: number } | null>(saved.sim ? { text: saved.sim, driveMm: saved.simMm ?? 0 } : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const persist = (p: { real?: string; distance?: string; sim?: string; simMm?: number }) => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ real, distance, sim: sim?.text, simMm: sim?.driveMm, ...p }));
    } catch {
      /* ignore */
    }
  };

  const save = async (id: string, title: string, python: string) => {
    await window.fllsim.saveFile(`FLL Sim calibration ${id}.llsp3`, writePythonLlsp3(python, `Calibration: ${title}`), [{ name: "SPIKE project", extensions: ["llsp3"] }]);
  };

  const runSim = async () => {
    const parts: string[] = [];
    let driveMm = 0;
    for (const t of tests.filter((x) => x.simulated)) {
      setBusy(`Simulating ${t.title}…`);
      const r = await runInSim(t.python);
      parts.push(...r.lines);
      if (t.id === "drive") driveMm = r.movedMm;
    }
    const text = parts.join("\n");
    setSim({ text, driveMm });
    persist({ sim: text, simMm: driveMm });
    setBusy(null);
  };

  const realM: CalMetrics = useMemo(() => metrics(parseCalLog(real), Number(distance) || undefined), [real, distance]);
  const simM: CalMetrics = useMemo(() => (sim ? metrics(parseCalLog(sim.text), sim.driveMm) : {}), [sim]);
  const result = useMemo(() => corrections(realM, simM, config, colorCal, colorModel), [realM, simM, config, colorCal, colorModel]);
  const canApply = result.wheelDiameterMm !== undefined || result.trackWidthMm !== undefined || result.colorCalibration !== undefined;

  const row = (label: string, r?: number, s?: number, unit = "") => (
    <tr key={label}>
      <td>{label}</td>
      <td>{r === undefined || Number.isNaN(r) ? "—" : `${+r.toFixed(1)}${unit}`}</td>
      <td>{s === undefined || Number.isNaN(s) ? "—" : `${+s.toFixed(1)}${unit}`}</td>
    </tr>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal calibration" onClick={(e) => e.stopPropagation()}>
        <h2>Calibrate against your real robot</h2>
        <p className="hint">
          Save each test below, open it in the SPIKE App and run it on the robot (they are Python projects: the SPIKE App
          runs them even if your team codes in Word Blocks). Then copy everything the console printed into the box. Uses
          ports {config.leftPort}/{config.rightPort} (drive) and {config.colorPorts.join(", ") || "none"} (colour) — set
          them in <b>Ports…</b> first.
        </p>
        <ol className="cal-tests">
          {tests.map((t) => (
            <li key={t.id}>
              <div>
                <b>{t.title}</b> <span className="hint">{t.howTo}</span>
              </div>
              <button onClick={() => save(t.id, t.title, t.python)}>Save program…</button>
            </li>
          ))}
        </ol>
        <label className="cal-field">
          Drive test: how far the robot drove (mm)
          <input type="number" value={distance} min={0} placeholder="e.g. 523" onChange={(e) => { setDistance(e.target.value); persist({ distance: e.target.value }); setApplied(false); }} />
        </label>
        <textarea
          className="cal-log"
          placeholder="Paste the SPIKE App console output of the tests here (lines starting with CAL,…)"
          value={real}
          onChange={(e) => { setReal(e.target.value); persist({ real: e.target.value }); setApplied(false); }}
        />
        <div className="modal-buttons left">
          <button onClick={runSim} disabled={!!busy}>{busy ?? (sim ? "Re-run the tests in the simulator" : "Run the tests in the simulator")}</button>
        </div>
        <table className="cal-table">
          <thead>
            <tr><th /><th>Real robot</th><th>Simulator</th></tr>
          </thead>
          <tbody>
            {row("Drive: distance", realM.driveMm, simM.driveMm, " mm")}
            {row("Drive: heading drift", realM.driveYawDeg, simM.driveYawDeg, "°")}
            {row("Effective wheel diameter", realM.wheelMm, simM.wheelMm, " mm")}
            {row("Spin: turned", realM.spinDeg, simM.spinDeg, "°")}
            {row("Effective track width", realM.trackMm, simM.trackMm, " mm")}
            {row("Top speed", realM.topSpeed, simM.topSpeed, " °/s")}
            {row("Time to 90 % speed", realM.t90, simM.t90, " ms")}
            {row("Coasting after letting go", realM.coastDeg, simM.coastDeg, "°")}
            {row("Colour: white", realM.white?.length ? realM.white.reduce((a, b) => a + b, 0) / realM.white.length : undefined, colorModel?.white)}
            {row("Colour: black", realM.black?.length ? realM.black.reduce((a, b) => a + b, 0) / realM.black.length : undefined, colorModel?.black)}
          </tbody>
        </table>
        <ul className="cal-notes">
          {result.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
        <div className="modal-buttons">
          <button onClick={onClose}>Close</button>
          <button className="primary" disabled={!canApply || applied} onClick={() => { onApply(result); setApplied(true); }}>
            {applied ? "Applied ✓" : "Apply corrections"}
          </button>
        </div>
      </div>
    </div>
  );
}
