import { SHEET, score, type Answers } from "../../../../../../seasons/2026-27/scoring";
import type { AutoScore } from "../../../../../../seasons/2026-27/autoscore";

interface Props {
  answers: Answers;
  onChange(a: Answers): void;
  onReset(): void;
  /** Automatic equipment inspection result (from the robot's size), with the reason. */
  inspection: { pass: boolean; why: string };
  /** The last automatic scoring from the field (answers it filled in, and notes on the rest). */
  auto: AutoScore | null;
  /** Score the field as it is now (null while a program is running). */
  onAutoScore: (() => void) | null;
}

export function ScorePanel({ answers, onChange, onReset, inspection, auto, onAutoScore }: Props) {
  const s = score(answers);
  const set = (id: string, v: boolean | number | string) => onChange({ ...answers, [id]: v });
  return (
    <div className="score-panel">
      <div className="score-total">
        <span>Total</span>
        <b>{s.total}</b>
        <button onClick={onReset}>Reset sheet</button>
        <button onClick={onAutoScore ?? undefined} disabled={!onAutoScore} title={onAutoScore ? "Fill in the sheet from the mission models on the simulated field" : "Available when the program has ended"}>
          Auto-score from field
        </button>
      </div>
      {SHEET.map((m) => (
        <div key={m.id} className="score-mission">
          <div className="score-head">
            <span>{m.number ? `M${String(m.number).padStart(2, "0")} ` : ""}{m.name}</span>
            <b>{s.byMission[m.id] ?? 0}</b>
          </div>
          {m.id === "ei" && <div className={`score-auto ${inspection.pass ? "ok" : "bad"}`}>Robot check: {inspection.why}</div>}
          {m.questions.map((q) => (
            <div key={q.id} className="score-q">
              <span className="score-label">
                {q.label}{q.noEquipment ? " ⃠" : ""}
                {auto && q.id in auto.notes && (
                  // "auto" while the answer is still the one read from the field
                  auto.answers[q.id] !== undefined && auto.answers[q.id] === answers[q.id]
                    ? <span className="score-badge auto" title={auto.notes[q.id]}>auto</span>
                    : auto.answers[q.id] === undefined && <span className="score-badge hand" title={auto.notes[q.id]}>check by hand</span>
                )}
              </span>
              {q.kind === "yesno" && (
                <span className="seg">
                  {[false, true].map((v) => (
                    <button key={String(v)} className={answers[q.id] === v ? "on" : ""} onClick={() => set(q.id, v)}>{v ? "Yes" : "No"}</button>
                  ))}
                </span>
              )}
              {q.kind === "count" && (
                <span className="seg">
                  {Array.from({ length: q.max! + 1 }, (_, i) => (
                    <button key={i} className={answers[q.id] === i ? "on" : ""} onClick={() => set(q.id, i)}>{i}</button>
                  ))}
                </span>
              )}
              {q.kind === "choice" && (
                <span className="seg">
                  {q.options!.map((o) => (
                    <button key={o} className={answers[q.id] === o ? "on" : ""} onClick={() => set(q.id, o)}>{o}</button>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
      {auto && <p className="muted small">auto = read from the simulated field (hover for what was seen); check by hand = the simulator can't tell (hover for why).</p>}
      <p className="muted small">⃠ = No Equipment Constraint: the model can't score while touching equipment at the end of the match. Scoring per the BIOGLOW Robot Game Rulebook and Challenge Update 01.</p>
    </div>
  );
}
