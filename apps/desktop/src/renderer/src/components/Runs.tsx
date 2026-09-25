// Earlier runs (to compare paths on the mat) and the replay timeline for the last run.

import type { Frame } from "../worker/protocol";

export interface RunRecord {
  id: number;
  label: string;
  color: string;
  /** Robot poses along the run (sampled). */
  pts: Frame["pose"][];
  durationS: number;
  visible: boolean;
  /** Full frames for replay (the most recent run only). */
  frames?: Frame[];
  /** The scene the frames belong to (replay needs the same bodies). */
  scene?: number;
}

export const RUN_COLORS = ["#3fa7ff", "#b36bff", "#2fd08a", "#ff5fa2", "#ffd84a", "#6be0e0", "#ff7a5c", "#a0a8b8"];

const fmtPose = (p: Frame["pose"]) => `(${p.xMm.toFixed(0)}, ${p.yMm.toFixed(0)}) ${p.headingDeg.toFixed(0)}°`;

export function RunsPanel({ runs, onToggle, onClear }: { runs: RunRecord[]; onToggle(id: number): void; onClear(): void }) {
  if (!runs.length) return null;
  const [latest, ...older] = runs;
  return (
    <div className="runs-panel">
      <div className="runs-head">
        <b>Runs</b>
        <button onClick={onClear} title="Forget all runs">Clear</button>
      </div>
      <div className="run-row">
        <span className="swatch" style={{ background: "#ff8a00" }} />
        <span>{latest.label} (last)</span>
        <span className="muted">{latest.durationS.toFixed(1)} s → {fmtPose(latest.pts[latest.pts.length - 1])}</span>
      </div>
      {older.map((r) => {
        const end = r.pts[r.pts.length - 1];
        const d = Math.hypot(end.xMm - latest.pts[latest.pts.length - 1].xMm, end.yMm - latest.pts[latest.pts.length - 1].yMm);
        return (
          <label key={r.id} className="run-row" title="Show this run's path on the mat">
            <input type="checkbox" checked={r.visible} onChange={() => onToggle(r.id)} />
            <span className="swatch" style={{ background: r.color }} />
            <span>{r.label}</span>
            <span className="muted">{r.durationS.toFixed(1)} s → {fmtPose(end)} · {d.toFixed(0)} mm from last</span>
          </label>
        );
      })}
    </div>
  );
}

export function ReplayBar({ frames, index, playing, onSeek, onPlay, onExit }: { frames: Frame[]; index: number; playing: boolean; onSeek(i: number): void; onPlay(p: boolean): void; onExit(): void }) {
  const t0 = frames[0].timeMs;
  return (
    <div className="replay-bar">
      <button onClick={() => onPlay(!playing)}>{playing ? "❚❚" : "▶"}</button>
      <input type="range" min={0} max={frames.length - 1} value={index} onChange={(e) => onSeek(Number(e.target.value))} />
      <span className="replay-time">{((frames[index].timeMs - t0) / 1000).toFixed(2)} s</span>
      <button onClick={onExit} title="Back to the live field">✕ Exit replay</button>
    </div>
  );
}
