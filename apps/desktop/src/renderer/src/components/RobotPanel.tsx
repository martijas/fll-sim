import { useState } from "react";
import { PORTS, type Port } from "@fll-sim/sim";
import { PRESETS, configProblems, type RobotConfig } from "../lib/robotConfig";

interface Props {
  config: RobotConfig;
  onApply(c: RobotConfig): void;
  onClose(): void;
}

function PortPicker({ value, onChange, allowNone }: { value: Port | ""; onChange(p: Port | ""): void; allowNone?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Port | "")}>
      {allowNone && <option value="">none</option>}
      {PORTS.map((p) => <option key={p} value={p}>{p}</option>)}
    </select>
  );
}

function MultiPorts({ value, onChange, max }: { value: Port[]; onChange(p: Port[]): void; max: number }) {
  return (
    <span className="multi-ports">
      {PORTS.map((p) => (
        <label key={p} className="chip">
          <input
            type="checkbox"
            checked={value.includes(p)}
            disabled={!value.includes(p) && value.length >= max}
            onChange={(e) => onChange(e.target.checked ? [...value, p].sort() as Port[] : value.filter((x) => x !== p))}
          />
          {p}
        </label>
      ))}
    </span>
  );
}

export function RobotPanel({ config, onApply, onClose }: Props) {
  const [c, setC] = useState<RobotConfig>(config);
  const problems = configProblems(c);
  const set = (patch: Partial<RobotConfig>) => setC({ ...c, ...patch, name: "Custom" });
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Robot</h2>
        <p className="muted">Wire the simulated drive base like your real robot. (A full LEGO builder comes in milestone M6.)</p>
        <div className="form">
          <label>Preset
            <select value="" onChange={(e) => e.target.value && setC(PRESETS[Number(e.target.value)])}>
              <option value="">{c.name}</option>
              {PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
            </select>
          </label>
          <label>Left drive motor <PortPicker value={c.leftPort} onChange={(p) => set({ leftPort: p as Port })} /></label>
          <label>Right drive motor <PortPicker value={c.rightPort} onChange={(p) => set({ rightPort: p as Port })} /></label>
          <label>Drive motor type
            <select value={c.driveMotor} onChange={(e) => set({ driveMotor: e.target.value as RobotConfig["driveMotor"] })}>
              <option value="medium">Medium angular motor</option>
              <option value="large">Large angular motor</option>
            </select>
          </label>
          <label>Wheel diameter (mm)
            <select value={c.wheelDiameterMm} onChange={(e) => set({ wheelDiameterMm: Number(e.target.value) })}>
              <option value={56}>56 — SPIKE Prime wheel</option>
              <option value={88}>88 — large wheel</option>
              <option value={62.4}>62.4 — 62.4 × 20 tyre</option>
            </select>
          </label>
          <label>Track width (mm) <input type="number" value={c.trackWidthMm} step={8} min={64} max={240} onChange={(e) => set({ trackWidthMm: Number(e.target.value) })} /></label>
          <label>Colour sensors (down) <MultiPorts value={c.colorPorts} onChange={(p) => set({ colorPorts: p })} max={3} /></label>
          <label>Distance sensor (front) <PortPicker value={c.distancePort} allowNone onChange={(p) => set({ distancePort: p })} /></label>
          <label>Attachment motors <MultiPorts value={c.attachmentPorts} onChange={(p) => set({ attachmentPorts: p })} max={2} /></label>
        </div>
        {problems.map((p) => <div key={p} className="problem">⚠ {p}</div>)}
        <div className="modal-buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={problems.length > 0} onClick={() => onApply(c)}>Apply</button>
        </div>
      </div>
    </div>
  );
}
