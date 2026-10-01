"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, todayIso, weekDates, dayTypeFor, DAY_LABELS } from "../../lib/coaching";
import { pyramidTargets, groupSupersets, computeOverloadFlags, groupLogByExercise, stepSizeFor, maxWeightForExercise, strengthTrendPct } from "../../lib/training";
import { EXTRA_ACTIVITY_TYPES, EFFORT_LEVELS, ASSUMED_BODYWEIGHT_KG, estimateExtraActivityKcal } from "../../lib/extraActivity";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import Sparkline from "../../components/charts/Sparkline";

const REP_QUICK = [6, 7, 8, 9, 10, 11, 12];

// In-progress set weights/reps live only in React state until "Save session"
// is tapped — so switching screens (bottom nav) or the browser reclaiming a
// backgrounded tab unmounts this page and wipes anything not yet saved. We
// mirror every edit into localStorage under this key so a remount can
// recover it, and clear it once a save actually lands in Supabase.
function draftKey(userId, dateIso) {
  return `huddle-training-draft-${userId}-${dateIso}`;
}

function ExerciseRow({ ex, formSets, onWeight, onReps, history }) {
  const targets = pyramidTargets(ex);
  const step = stepSizeFor(ex);
  const last = history?.[0];
  const lastTop = last?.sets?.[last.sets.length - 1];
  const pr = history && history.length ? maxWeightForExercise(history) : null;
  return (
    <div className="exercise-row">
      <div className="exercise-top">
        <div className="exercise-name">{ex.exercise}</div>
        <div className="exercise-target">
          {ex.target_sets} × {ex.rep_max}→{ex.rep_min} reps · {ex.lift_type}
          {lastTop && <> · last time top set {lastTop.weight_kg}kg × {lastTop.reps}</>}
          {pr && <> · <b style={{ color: "var(--accent)" }}>PR {pr.weight_kg}kg × {pr.reps}</b></>}
        </div>
      </div>
      <div className="pyramid-sets">
        {Array.from({ length: ex.target_sets || 0 }, (_, s) => {
          const key = `${ex.id}-${s}`;
          const v = formSets[key] || { weight: "", reps: "" };
          return (
            <div className="pyramid-set-row" key={key}>
              <span className="set-no">Set {s + 1}<em>target {targets[s]?.reps} reps</em></span>
              <div className="stepper-wrap">
                <button type="button" className="stepper-btn" onClick={() => onWeight(key, ex, -1)}>−</button>
                <input type="number" step={step} value={v.weight} onChange={(e) => onWeight(key, ex, 0, e.target.value)} />
                <button type="button" className="stepper-btn" onClick={() => onWeight(key, ex, 1)}>+</button>
                <span className="unit-label">kg</span>
              </div>
              <div className="stepper-wrap">
                <button type="button" className="stepper-btn" onClick={() => onReps(key, -1)}>−</button>
                <input type="number" value={v.reps} onChange={(e) => onReps(key, 0, e.target.value)} />
                <button type="button" className="stepper-btn" onClick={() => onReps(key, 1)}>+</button>
                <span className="unit-label">reps</span>
              </div>
              <div className="rep-quick-row">
                {REP_QUICK.map((n) => (
                  <button key={n} type="button" className={`rep-quick-btn${Number(v.reps) === n ? " active" : ""}`} onClick={() => onReps(key, 0, n)}>{n}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {history && history.length >= 2 && (
        <div className="lift-chart" style={{ marginTop: 8, maxWidth: 200 }}>
          <Sparkline points={history.slice().reverse().map((h) => ({ weight: h.sets[h.sets.length - 1].weight_kg }))} />
        </div>
      )}
    </div>
  );
}

export default function TrainingPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [plan, setPlan] = useState([]);
  const [logRows, setLogRows] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [extras, setExtras] = useState([]);
  const [latestWeightLb, setLatestWeightLb] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [formSets, setFormSets] = useState({});
  const [note, setNote] = useState("");
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [extraType, setExtraType] = useState(EXTRA_ACTIVITY_TYPES[0].key);
  const [extraMinutes, setExtraMinutes] = useState(45);
  const [extraEffort, setExtraEffort] = useState("moderate");

  async function loadAll(userId) {
    const [planRes, logRes, sessRes, extraRes, weightRes] = await Promise.all([
      supabase.from("workout_plan").select("*").eq("user_id", userId).order("day_type", { ascending: true }).order("order_index", { ascending: true }),
      supabase.from("workout_log").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(600),
      supabase.from("workout_sessions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(120),
      supabase.from("workout_extras").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(60),
      supabase.from("daily_metrics").select("weight").eq("user_id", userId).not("weight", "is", null).order("date", { ascending: false }).limit(1),
    ]);
    const err = planRes.error || logRes.error || sessRes.error || extraRes.error || weightRes.error;
    if (err) setError(err.message);
    setPlan(planRes.data || []);
    setLogRows(logRes.data || []);
    setSessions(sessRes.data || []);
    setExtras(extraRes.data || []);
    setLatestWeightLb((weightRes.data && weightRes.data[0]?.weight) ?? null);
    setLoading(false);
  }

  useEffect(() => { if (profile) loadAll(profile.id); }, [profile]);

  const dayType = dayTypeFor(profile, selectedDate);
  const dayPlan = plan.filter((p) => p.day_type === dayType).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  const session = sessions.find((s) => s.date === selectedDate) || null;
  const logForDay = logRows.filter((r) => r.date === selectedDate);
  const logByExercise = useMemo(() => groupLogByExercise(logRows), [logRows]);
  const overloadFlags = useMemo(() => computeOverloadFlags(plan, logByExercise), [plan, logByExercise]);
  const keyLifts = useMemo(() => {
    const list = [];
    for (const [exercise, hist] of logByExercise.entries()) {
      if (hist.length < 2) continue;
      list.push({ exercise, hist });
    }
    return list.sort((a, b) => b.hist.length - a.hist.length).slice(0, 4);
  }, [logByExercise]);
  // A PB tile per exercise in TODAY's (selected day's) workout only — not
  // every exercise ever logged — shown from the very first session logged,
  // unlike Key Lift Progress above, which waits for a trend (2+ sessions)
  // before it has a chart worth drawing. Each tile also carries a % change
  // in estimated 1RM vs the previous session, so Harry can see at a glance
  // whether an exercise is trending up or down.
  const strengthBoard = useMemo(() => {
    const list = [];
    for (const ex of dayPlan) {
      const hist = logByExercise.get(ex.exercise);
      if (!hist || !hist.length) continue;
      const pr = maxWeightForExercise(hist);
      if (!pr) continue;
      list.push({ exercise: ex.exercise, pr, sessionCount: hist.length, trendPct: strengthTrendPct(hist) });
    }
    return list.sort((a, b) => a.exercise.localeCompare(b.exercise));
  }, [dayPlan, logByExercise]);

  useEffect(() => {
    if (!profile) return;
    const init = {};
    for (const ex of dayPlan) {
      const targets = pyramidTargets(ex);
      const existing = logForDay.filter((r) => r.exercise === ex.exercise).sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
      for (let s = 0; s < (ex.target_sets || 0); s++) {
        const ev = existing[s];
        init[`${ex.id}-${s}`] = {
          weight: ev ? String(ev.weight_kg ?? "") : String(targets[s]?.weight ?? ""),
          reps: ev && ev.reps != null ? String(ev.reps) : "",
        };
      }
    }
    let initNote = session?.note || "";
    let initComplete = !!session?.complete;

    // Recover any not-yet-saved typing for this date — e.g. if the bottom
    // nav was tapped or the browser reclaimed a backgrounded tab before
    // "Save session" was hit, which otherwise silently lost it.
    try {
      const raw = localStorage.getItem(draftKey(profile.id, selectedDate));
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.formSets) Object.assign(init, draft.formSets);
        if (typeof draft?.note === "string") initNote = draft.note;
        if (typeof draft?.complete === "boolean") initComplete = draft.complete;
      }
    } catch {}

    setFormSets(init);
    setNote(initNote);
    setComplete(initComplete);
    setSaveMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plan, logRows, sessions, profile]);

  function persistDraft(nextFormSets, nextNote, nextComplete) {
    if (!profile) return;
    try {
      localStorage.setItem(draftKey(profile.id, selectedDate), JSON.stringify({ formSets: nextFormSets, note: nextNote, complete: nextComplete }));
    } catch {}
  }

  if (profileLoading || (profile && loading)) return <div className="center-loading">Loading…</div>;

  function onWeight(key, ex, delta, typedValue) {
    setFormSets((prev) => {
      let next;
      if (typedValue !== undefined) {
        next = { ...prev, [key]: { ...prev[key], weight: typedValue } };
      } else {
        const step = stepSizeFor(ex);
        const cur = Number(prev[key]?.weight) || 0;
        next = { ...prev, [key]: { ...prev[key], weight: String(Math.max(0, cur + delta * step)) } };
      }
      persistDraft(next, note, complete);
      return next;
    });
  }
  function onReps(key, delta, typedValue) {
    setFormSets((prev) => {
      let next;
      if (typedValue !== undefined) {
        next = { ...prev, [key]: { ...prev[key], reps: String(typedValue) } };
      } else {
        const cur = Number(prev[key]?.reps) || 0;
        next = { ...prev, [key]: { ...prev[key], reps: String(Math.max(0, cur + delta)) } };
      }
      persistDraft(next, note, complete);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true); setSaveMsg(""); setError("");
    try {
      const { error: sessErr } = await supabase.from("workout_sessions")
        .upsert({ user_id: profile.id, date: selectedDate, day_type: dayType, note, complete }, { onConflict: "user_id,date" });
      if (sessErr) throw sessErr;

      const { error: delErr } = await supabase.from("workout_log").delete().eq("user_id", profile.id).eq("date", selectedDate);
      if (delErr) throw delErr;

      const rows = [];
      dayPlan.forEach((ex) => {
        for (let s = 0; s < (ex.target_sets || 0); s++) {
          const v = formSets[`${ex.id}-${s}`];
          if (v && (v.weight !== "" || v.reps !== "")) {
            rows.push({
              user_id: profile.id, date: selectedDate, day_type: dayType, exercise: ex.exercise, set_number: s + 1,
              weight_kg: v.weight === "" ? null : Number(v.weight),
              reps: v.reps === "" ? null : Number(v.reps),
            });
          }
        }
      });
      if (rows.length) {
        const { error: insErr } = await supabase.from("workout_log").insert(rows);
        if (insErr) throw insErr;
      }
      await loadAll(profile.id);
      try { localStorage.removeItem(draftKey(profile.id, selectedDate)); } catch {}
      setSaveMsg("Saved");
    } catch (e) {
      setError(e.message || "Couldn't save that session.");
    } finally {
      setSaving(false);
    }
  }

  async function applyOverload(flag) {
    await supabase.from("workout_plan").update({ current_working_weight_kg: flag.suggested }).eq("id", flag.planId);
    await loadAll(profile.id);
  }

  async function logExtra(label, calLow, calHigh) {
    await supabase.from("workout_extras").insert({ user_id: profile.id, date: selectedDate, label, cal_low: calLow, cal_high: calHigh });
    await loadAll(profile.id);
  }
  async function removeExtra(id) {
    await supabase.from("workout_extras").delete().eq("id", id);
    await loadAll(profile.id);
  }

  // Weight for the kcal estimate: most recent real weigh-in, falling back to
  // the start weight from onboarding, and only to an assumed figure (flagged
  // in the UI) if neither exists yet.
  const weightLbForEstimate = latestWeightLb ?? profile?.start_weight ?? null;
  const weightKg = weightLbForEstimate != null ? weightLbForEstimate * 0.453592 : ASSUMED_BODYWEIGHT_KG;
  const weightIsAssumed = weightLbForEstimate == null;
  const extraEstimate = estimateExtraActivityKcal(extraType, extraEffort, extraMinutes, weightKg);

  async function handleLogExtra() {
    const activity = EXTRA_ACTIVITY_TYPES.find((a) => a.key === extraType);
    const effort = EFFORT_LEVELS.find((e) => e.key === extraEffort);
    const label = `${activity?.label || "Activity"} · ${extraMinutes}min · ${effort?.label.split(" — ")[0] || extraEffort}`;
    await logExtra(label, extraEstimate?.low ?? null, extraEstimate?.high ?? null);
  }

  const wDays = weekDates(todayIso());
  const today = todayIso();
  const extrasForDay = extras.filter((e) => e.date === selectedDate);
  const blocks = groupSupersets(dayPlan);

  return (
    <div className="shell shell-with-nav">
      <AppHeader title="Training" />
      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>This Week</p>
        <div className="day-grid">
          {wDays.map((d, i) => {
            const dt = dayTypeFor(profile, d);
            const s = sessions.find((x) => x.date === d);
            const classes = ["day-btn"];
            if (d === today) classes.push("today");
            if (d === selectedDate) classes.push("open");
            if (s?.complete) classes.push("done");
            return (
              <div key={d} className={classes.join(" ")} onClick={() => setSelectedDate(d)}>
                <div className="lbl">{DAY_LABELS[i]}</div>
                <div className="type">{dt || "Rest"}</div>
                {s?.complete && <div className="tick">✓</div>}
              </div>
            );
          })}
        </div>
      </div>

      {strengthBoard.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Strength Scoreboard <span className="meal-desc" style={{ textTransform: "none", letterSpacing: 0 }}>{dayType}</span></p>
          <div className="scoreboard-grid">
            {strengthBoard.map((s) => (
              <div className="scoreboard-tile" key={s.exercise}>
                <div className="scoreboard-name">{s.exercise}</div>
                <div className="scoreboard-value">{s.pr.weight_kg}<span className="scoreboard-unit">kg</span></div>
                <div className="scoreboard-sub">top set × {s.pr.reps} reps</div>
                {s.trendPct != null && (
                  <div className="scoreboard-trend" style={{ color: s.trendPct >= 0 ? "var(--good)" : "var(--bad)" }}>
                    {s.trendPct >= 0 ? "▲" : "▼"} {Math.abs(s.trendPct).toFixed(1)}% vs last time
                  </div>
                )}
                <div className="scoreboard-status">{s.sessionCount === 1 ? "First session logged" : `${s.sessionCount} sessions logged`}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {overloadFlags.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Progressive Overload Watch</p>
          {overloadFlags.map((f) => (
            <div key={f.planId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 12.5 }}>Hit the top of range twice on <b>{f.exercise}</b> ({f.dayType}) — try <b>{f.suggested}kg</b> next time.</div>
              <button className="btn small primary" style={{ width: "auto", padding: "6px 12px" }} onClick={() => applyOverload(f)}>Apply</button>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="top-row" style={{ marginBottom: 10 }}>
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", margin: 0 }}>
            {fmtDate(selectedDate)} · {dayType || "Rest"}
          </h3>
        </div>

        {(!dayType || dayType === "Rest") ? (
          <div className="empty-state">Rest day — nothing planned.</div>
        ) : dayPlan.length === 0 ? (
          <div className="note">No plan set up for {dayType} yet — your Trainer coach can build one with you.</div>
        ) : (
          <>
            {blocks.map((block, i) => block.type === "superset" ? (
              <div className="superset-block" key={i}>
                <div className="superset-label">⚡ Superset {block.tag} — alternate, minimal rest between</div>
                {block.exercises.map((ex) => (
                  <ExerciseRow key={ex.id} ex={ex} formSets={formSets} onWeight={onWeight} onReps={onReps} history={logByExercise.get(ex.exercise)} />
                ))}
              </div>
            ) : (
              <ExerciseRow key={block.exercises[0].id} ex={block.exercises[0]} formSets={formSets} onWeight={onWeight} onReps={onReps} history={logByExercise.get(block.exercises[0].exercise)} />
            ))}

            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label">Notes / niggles</label>
              <textarea value={note} onChange={(e) => { const v = e.target.value; setNote(v); persistDraft(formSets, v, complete); }} rows={2} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
              <input type="checkbox" checked={complete} onChange={(e) => { const v = e.target.checked; setComplete(v); persistDraft(formSets, note, v); }} style={{ width: "auto" }} /> Mark session complete
            </label>
            <div className="btn-row">
              <button className="btn primary" style={{ width: "auto", padding: "10px 18px" }} onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save session"}</button>
            </div>
            {saveMsg && <div className="save-note">{saveMsg}</div>}
          </>
        )}

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <p className="eyebrow" style={{ marginBottom: 8 }}>Extra activity</p>
          {extrasForDay.map((ex) => (
            <div key={ex.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
              <span style={{ fontSize: 12.5 }}>🔥 {ex.label}{ex.cal_low ? ` · est. ${ex.cal_low}${ex.cal_high && ex.cal_high !== ex.cal_low ? `–${ex.cal_high}` : ""} kcal` : ""}</span>
              <button className="btn ghost" style={{ width: "auto" }} onClick={() => removeExtra(ex.id)}>Remove</button>
            </div>
          ))}
          <div className="extra-activity-form">
            <div className="field-row">
              <select value={extraType} onChange={(e) => setExtraType(e.target.value)}>
                {EXTRA_ACTIVITY_TYPES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
              </select>
              <select value={extraEffort} onChange={(e) => setExtraEffort(e.target.value)}>
                {EFFORT_LEVELS.map((lvl) => <option key={lvl.key} value={lvl.key}>{lvl.label}</option>)}
              </select>
            </div>
            <div className="extra-activity-row">
              <div className="stepper-wrap">
                <button type="button" className="stepper-btn" onClick={() => setExtraMinutes((m) => Math.max(5, m - 5))}>−</button>
                <input type="number" value={extraMinutes} onChange={(e) => setExtraMinutes(Math.max(0, Number(e.target.value) || 0))} />
                <button type="button" className="stepper-btn" onClick={() => setExtraMinutes((m) => m + 5)}>+</button>
                <span className="unit-label">min</span>
              </div>
              {extraEstimate && (
                <span className="meal-desc">≈ {extraEstimate.low}–{extraEstimate.high} kcal{weightIsAssumed ? " (assumed bodyweight)" : ""}</span>
              )}
            </div>
            <button className="btn secondary" style={{ width: "auto", padding: "8px 14px", marginTop: 8 }} onClick={handleLogExtra}>🔥 Log activity</button>
          </div>
        </div>
      </div>

      {keyLifts.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Key Lift Progress</p>
          {keyLifts.map(({ exercise, hist }) => {
            const last = hist[0].sets[hist[0].sets.length - 1];
            const first = hist[hist.length - 1].sets[hist[hist.length - 1].sets.length - 1];
            const diff = Math.round((last.weight_kg - first.weight_kg) * 100) / 100;
            const pr = maxWeightForExercise(hist);
            const atPr = pr && pr.weight_kg === last.weight_kg && pr.date === hist[0].date;
            return (
              <div className="lift-row" key={exercise}>
                <div className="lift-name">
                  <div className="n">{exercise}</div>
                  <div className="v">{last.weight_kg}kg now{diff !== 0 ? ` · ${diff > 0 ? "+" : ""}${diff}kg` : ""}</div>
                  {pr && (
                    <div className="meal-desc" style={{ color: atPr ? "var(--accent)" : undefined, fontWeight: atPr ? 700 : 400 }}>
                      {atPr ? "At PR · " : "PR "}{pr.weight_kg}kg × {pr.reps}{!atPr ? ` (${fmtDate(pr.date)})` : ""}
                    </div>
                  )}
                </div>
                <div className="lift-chart"><Sparkline points={hist.slice().reverse().map((h) => ({ weight: h.sets[h.sets.length - 1].weight_kg }))} /></div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Full Session Log</p>
        {sessions.length === 0 ? (
          <div className="empty-state">No sessions logged yet.</div>
        ) : (
          sessions.map((s) => {
            const rowsForDay = logRows.filter((r) => r.date === s.date);
            const byEx = groupLogByExercise(rowsForDay);
            const lines = Array.from(byEx.entries()).map(([ex, hist]) => `${ex}: ${hist[0].sets.map((st) => `${st.weight_kg}kg×${st.reps}`).join(", ")}`);
            return (
              <div className="log-entry" key={s.date}>
                <div className="log-entry-head">
                  <div className="log-entry-title">{fmtDate(s.date)} · {s.day_type}</div>
                  <span className={`badge ${s.complete ? "done" : "pending"}`}>{s.complete ? "Done" : "Partial"}</span>
                </div>
                {lines.length > 0 && <div className="log-entry-detail">{lines.join(" · ")}</div>}
                {s.note && <div className="log-note">⚠ {s.note}</div>}
              </div>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}
