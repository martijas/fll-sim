// Virtual SPIKE Prime hub: 5x5 light matrix, centre-button light, left/right buttons.
const LIGHT_COLORS: Record<number, string> = {
  0: "#111", 1: "#ff3fd0", 2: "#8a3cff", 3: "#1a4dff", 4: "#2fb8ff", 5: "#19d6c0", 6: "#1fcf3a", 7: "#ffe01a", 8: "#ff8a00", 9: "#ff2020", 10: "#ffffff",
};

interface Props {
  pixels: number[];
  lights: Record<number, number>;
  onButton(which: "left" | "right", down: boolean): void;
}

export function HubPanel({ pixels, lights, onButton }: Props) {
  const btn = (which: "left" | "right") => ({
    onPointerDown: () => onButton(which, true),
    onPointerUp: () => onButton(which, false),
    onPointerLeave: () => onButton(which, false),
  });
  return (
    <div className="hub">
      <div className="hub-matrix">
        {pixels.map((v, i) => (
          <div key={i} className="hub-px" style={{ opacity: 0.12 + (v / 100) * 0.88, background: v > 0 ? "#fff6d8" : "#555" }} />
        ))}
      </div>
      <div className="hub-buttons">
        <button className="hub-btn" {...btn("left")} title="Left button">◀</button>
        <div className="hub-center" style={{ boxShadow: `0 0 10px 3px ${LIGHT_COLORS[lights[0] ?? 0] ?? "#fff"}`, borderColor: LIGHT_COLORS[lights[0] ?? 0] }} title="Power button light" />
        <button className="hub-btn" {...btn("right")} title="Right button">▶</button>
      </div>
    </div>
  );
}
