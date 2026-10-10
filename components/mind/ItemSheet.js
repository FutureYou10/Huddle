"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { CONTROL_LABELS, KIND_LABELS, STAGE_LABELS, newStep, stepProgress } from "../../lib/mind";

// Full view of one thought. What it offers depends on where the item is:
//   out of my control -> do the small bit if there is one, then let it go
//   tangled           -> solve it with Claude: pick one option, get steps
//   solved            -> review the steps and commit
//   committed         -> tick steps off
export default function ItemSheet({ item, area, actions, onClose }) {
  const [solveNote, setSolveNote] = useState("");
  const [solving, setSolving] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [newStepText, setNewStepText] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const notMine = item.control === "not_mine";
  const closed = item.stage === "done" || item.stage === "let_go";
  const prog = stepProgress(item);

  async function solve() {
    setSolving(true);
    setError("");
    setPlan(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/mind/solve", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ itemId: item.id, note: solveNote.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't solve that one.");
      setPlan(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setSolving(false);
    }
  }

  function choose(option) {
    actions.applyOption(item, option);
    setPlan(null);
  }

  function addStep(e) {
    e.preventDefault();
    const t = newStepText.trim();
    if (!t) return;
    actions.patch(item, { steps: [...(item.steps || []), newStep(t)] });
    setNewStepText("");
  }

  return (
    <div className="recap-overlay mind-sheet-overlay" onClick={onClose}>
      <div className="mind-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={item.title}>
        <div className="mind-sheet-head">
          <span className="mind-sheet-area">{area ? `${area.emoji || ""} ${area.name}` : "Unfiled"}</span>
          <button className="recap-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <h2 className="mind-sheet-title">{item.title}</h2>
        {item.detail && <p className="mind-sheet-detail">{item.detail}</p>}
        <div className="mind-chips">
          <span className="mind-chip">{KIND_LABELS[item.kind]}</span>
          <span className={`mind-chip stage-${item.stage}`}>{STAGE_LABELS[item.stage]}</span>
          {item.loop_count > 1 && <span className="mind-chip loop">🔁 come up {item.loop_count}×</span>}
        </div>

        <div className="segmented mind-control-toggle">
          {Object.entries(CONTROL_LABELS).map(([k, label]) => (
            <button key={k} className={item.control === k ? "active" : ""} onClick={() => actions.patch(item, { control: k })}>
              {label}
            </button>
          ))}
        </div>

        {closed ? (
          <div className="mind-sheet-section">
            <p className="note">{item.stage === "done" ? "Done and out of your head." : "Let go. It's not yours to carry."}</p>
            <button className="btn secondary" onClick={() => actions.patch(item, { stage: item.steps?.length ? "committed" : "tangled", closed_at: null })}>
              Bring it back
            </button>
          </div>
        ) : notMine ? (
          <div className="mind-sheet-section">
            <p className="mind-ooc-explainer">
              This one's out of your control, so there's nothing to solve. Thinking about it more won't change the outcome.
            </p>
            {item.influence_note && (
              <p className="note">
                <b>The only bit that's yours:</b> {item.influence_note}
              </p>
            )}
            <button className="btn primary" onClick={() => actions.letGo(item)}>
              Let it go
            </button>
          </div>
        ) : (
          <>
            {item.control === "influence" && item.influence_note && (
              <p className="note">
                <b>The part that's yours:</b> {item.influence_note}
              </p>
            )}

            {item.stage === "tangled" && !plan && (
              <div className="mind-sheet-section">
                <label className="field-label">Anything to add? (optional)</label>
                <textarea rows={2} value={solveNote} onChange={(e) => setSolveNote(e.target.value)} placeholder="e.g. the deadline is Friday, I'm leaning towards…" />
                <button className="btn primary" onClick={solve} disabled={solving} style={{ marginTop: 10 }}>
                  {solving ? "Working it out…" : "Solve it"}
                </button>
              </div>
            )}

            {plan && (
              <div className="mind-sheet-section">
                <p className="mind-reframe">{plan.reframe}</p>
                {plan.options.map((opt, i) => (
                  <div key={i} className={`mind-option${i === plan.recommended ? " recommended" : ""}`}>
                    {i === plan.recommended && <span className="mind-option-badge">Recommended</span>}
                    <div className="mind-option-label">{opt.label}</div>
                    <div className="mind-option-why">{opt.why}</div>
                    <ol className="mind-option-steps">
                      {opt.steps.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ol>
                    <button className={`btn ${i === plan.recommended ? "primary" : "secondary"}`} onClick={() => choose(opt)}>
                      Go with this
                    </button>
                  </div>
                ))}
                {plan.good_enough && <p className="note"><b>Good enough looks like:</b> {plan.good_enough}</p>}
                <button className="btn ghost" onClick={solve} disabled={solving}>
                  {solving ? "Thinking…" : "None of these — try again"}
                </button>
              </div>
            )}

            {item.decision && item.stage !== "tangled" && (
              <p className="mind-decision">
                <span>Decided</span>
                {item.decision}
              </p>
            )}

            {(item.stage === "solved" || item.stage === "committed") && (
              <div className="mind-sheet-section">
                <div className="mind-steps-head">
                  Steps {prog.total > 0 && <span>{prog.done}/{prog.total}</span>}
                </div>
                <ul className="mind-steps">
                  {(item.steps || []).map((s) => (
                    <li key={s.id} className={s.d ? "done" : ""}>
                      <button className="mind-check" onClick={() => actions.toggleStep(item, s.id)} aria-label={s.d ? "Untick" : "Tick off"}>
                        {s.d ? "✓" : ""}
                      </button>
                      <span>{s.t}</span>
                      <button className="mind-step-remove" onClick={() => actions.patch(item, { steps: item.steps.filter((x) => x.id !== s.id) })} aria-label="Remove step">
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <form onSubmit={addStep} className="mind-add-step">
                  <input type="text" value={newStepText} onChange={(e) => setNewStepText(e.target.value)} placeholder="Add a step" />
                </form>
                {item.stage === "solved" ? (
                  <button className="btn primary" onClick={() => actions.commit(item)} disabled={!item.steps?.length}>
                    Commit to this
                  </button>
                ) : (
                  <button className="btn secondary" onClick={() => actions.done(item)}>
                    Mark the whole thing done
                  </button>
                )}
                <button className="btn ghost" onClick={() => actions.patch(item, { stage: "tangled", decision: null, steps: [] })}>
                  Rethink it
                </button>
              </div>
            )}
          </>
        )}

        {error && <p className="error-note">{error}</p>}

        <div className="mind-sheet-foot">
          {!closed && !notMine && (
            <button className="btn ghost" onClick={() => actions.letGo(item)}>
              Let it go
            </button>
          )}
          {confirmDelete ? (
            <button className="btn ghost" style={{ color: "var(--bad)" }} onClick={() => actions.remove(item)}>
              Tap again to delete
            </button>
          ) : (
            <button className="btn ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
        {item.source && <p className="mind-source">From: {item.source}</p>}
      </div>
    </div>
  );
}
