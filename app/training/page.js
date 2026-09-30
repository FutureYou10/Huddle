"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, todayIso, weekDates, dayTypeFor, DAY_LABELS } from "../../lib/coaching";
import { pyramidTargets, groupSupersets, computeOverloadFlags, groupLogByExercise, stepSizeFor } from "../../lib/training";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import Sparkline from "../../components/charts/Sparkline";

const REP_QUICK = [6, 7, 8, 9, 10, 11, 12];

function ExerciseRow({ ex, formSets, onWeight, onReps, history }) {
  const targets = pyramidTargets(ex);
  const step = stepSizeFor(ex);
  const last = history?.[0];
  const lastTop = last?.sets?.[last.sets.length - 1];
  return (
    <div className="exercise-row">
      <div className="exercise-top">
        <div className="exercise-name">{ex.exercise}</div>
        <div className="exercise-target">
          {ex.target_sets} × {ex.rep_max}→{ex.rep_min} reps · {ex.lift_type}
          {lastTop && <> · last time top set {lastTop.weight_kg}kg × {lastTop.reps}</>}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [formSets, setFormSets] = useState({});
  const [note, setNote] = useState("");
  const [complete, setComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  async function loadAll(userId) {
    const [planRes, logRes, sessRes, extraRes] = await Promise.all([
      supabase.from("workout_plan").select("*").eq("user_id", userId).order("day_type", { ascending: true }).order("order_index", { ascending: true }),
      supabase.from("workout_log").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(600),
      supabase.from("workout_sessions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(120),
      supabase.from("workout_extras").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(60),
    ]);
    const err = planRes.error || logRes.error || sessRes.error || extraRes.error;
    if (err) setError(err.message);
    setPlan(planRes.data || []);
    setLogRows(logRes.data || []);
    setSessions(sessRes.data || []);
    setExtras(extraRes.data || []);
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

  useEffect(() => {
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
    setFormSets(init);
    setNote(session?.note || "");
    setComplete(!!session?.complete);
    setSaveMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, plan, logRows, sessions]);

  if (profileLoading || (profile && loading)) return <div className="center-loading">Loading…</div>;

  function onWeight(key, ex, delta, typedValue) {
    setFormSets((prev) => {
      if (typedValue !== undefined) return { ...prev, [key]: { ...prev[key], weight: typedValue } };
      const step = stepSizeFor(ex);
      const cur = Number(prev[key]?.weight) || 0;
      return { ...prev, [key]: { ...prev[key], weight: String(Math.max(0, cur + delta * step)) } };
    });
  }
  function onReps(key, delta, typedValue) {
    setFormSets((prev) => {
      if (typedValue !== undefined) return { ...prev, [key]: { ...prev[key], reps: String(typedValue) } };
      const cur = Number(prev[key]?.reps) || 0;
      return { ...prev, [key]: { ...prev[key], reps: String(Math.max(0, cur + delta)) } };
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
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 12.5, color: "var(--text-dim)" }}>
              <input type="checkbox" checked={complete} onChange={(e) => setComplete(e.target.checked)} style={{ width: "auto" }} /> Mark session complete
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
          <button className="btn secondary" style={{ width: "auto", padding: "8px 14px", marginTop: 6 }} onClick={() => logExtra("Blaze class", 500, 500)}>🔥 Log a Blaze class</button>
        </div>
      </div>

      {keyLifts.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Key Lift Progress</p>
          {keyLifts.map(({ exercise, hist }) => {
            const last = hist[0].sets[hist[0].sets.length - 1];
            const first = hist[hist.length - 1].sets[hist[hist.length - 1].sets.length - 1];
            const diff = Math.round((last.weight_kg - first.weight_kg) * 100) / 100;
            return (
              <div className="lift-row" key={exercise}>
                <div className="lift-name"><div className="n">{exercise}</div><div className="v">{last.weight_kg}kg now{diff !== 0 ? ` · ${diff > 0 ? "+" : ""}${diff}kg` : ""}</div></div>
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
