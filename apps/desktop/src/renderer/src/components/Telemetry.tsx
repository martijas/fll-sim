import type { Frame } from "../worker/protocol";

export function Telemetry({ frame }: { frame: Frame | null }) {
  if (!frame) return null;
  const p = frame.pose;
  return (
    <div className="telemetry">
      <table>
        <tbody>
          <tr><th>Time</th><td>{(frame.timeMs / 1000).toFixed(2)} s</td></tr>
          <tr><th>Robot</th><td>x {p.xMm.toFixed(0)} mm, y {p.yMm.toFixed(0)} mm, heading {p.headingDeg.toFixed(1)}°</td></tr>
          <tr><th>Yaw</th><td>{(frame.yaw / 10).toFixed(1)}°</td></tr>
          {frame.motors.map((m) => (
            <tr key={m.port}><th>Motor {m.port}</th><td>rel {m.relPos}° · abs {m.absPos}° · {m.speed}°/s · pwm {(m.duty / 100).toFixed(0)}%</td></tr>
          ))}
          {frame.sensors.map((s) => (
            <tr key={s.port}><th>{s.type === "color" ? "Color" : "Distance"} {s.port}</th><td>{s.value}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
