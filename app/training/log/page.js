"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { todayIso } from "../../../lib/coaching";
import { useProfile } from "../../../lib/useProfile";
import { DAY_TYPES } from "../../../lib/constants";

export default function LogSetPage() {
  const router = useRouter();
  const { loading: profileLoading, session, error: profileError } = useProfile();

  const [date, setDate] = useState(todayIso());
  const [dayType, setDayType] = useState(DAY_TYPES[0]);
  const [exercise, setExercise] = useState("");
  const [setNumber, setSetNumber] = useState(1);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [niggle, setNiggle] = useState("");
  const [notes, setNotes] = useState("");
  const [logged, setLogged] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleAddSet(e) {
    e.preventDefault();
    setError("");

    if (exercise.trim() === "") {
      setError("Enter an exercise name.");
      return;
    }

    setBusy(true);
    try {
      const row = {
        user_id: session.user.id,
        date,
        day_type: dayType,
        exercise: exercise.trim(),
        set_number: Number(setNumber) || 1,
        weight_kg: weight === "" ? null : Number(weight),
        reps: reps === "" ? null : Number(reps),
        niggle_pain: niggle.trim() === "" ? null : niggle.trim(),
        notes: notes.trim() === "" ? null : notes.trim(),
      };

      const { data, error: insertError } = await supabase.from("workout_log").insert(row).select().single();
      if (insertError) throw insertError;

      setLogged((prev) => [...prev, data]);
      setSetNumber((n) => (Number(n) || 1) + 1);
      setNiggle("");
      setNotes("");
    } catch (err) {
      setError(err.message || "Couldn't save that set — try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleNewExercise() {
    setExercise("");
    setSetNumber(1);
    setWeight("");
    setReps("");
  }

  if (profileLoading) return <div className="center-loading">Loading…</div>;

  return (
    <div className="shell">
      <p className="eyebrow">Huddle</p>
      <h1 className="page-title">Log training</h1>

      <form className="card" onSubmit={handleAddSet}>
        <div className="stat-row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="field-label">Date</label>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="field-label">Day type</label>
            <select value={dayType} onChange={(e) => setDayType(e.target.value)}>
              {DAY_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Exercise</label>
          <input
            type="text"
            required
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
            placeholder="e.g. Barbell Squat"
          />
        </div>

        <div className="stat-row" style={{ marginBottom: 12 }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="field-label">Set #</label>
            <input type="number" min="1" value={setNumber} onChange={(e) => setSetNumber(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="field-label">Weight (kg)</label>
            <input type="number" inputMode="decimal" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label className="field-label">Reps</label>
            <input type="number" inputMode="numeric" min="0" value={reps} onChange={(e) => setReps(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Niggle / pain (optional)</label>
          <input
            type="text"
            value={niggle}
            onChange={(e) => setNiggle(e.target.value)}
            placeholder="e.g. slight left knee twinge"
          />
        </div>

        <div className="field">
          <label className="field-label">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How it felt, form cues, etc."
          />
        </div>

        {(error || profileError) && <div className="error-note" style={{ marginBottom: 12 }}>{error || profileError}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : `Add set ${setNumber}`}
        </button>
        <button type="button" className="btn secondary" style={{ marginTop: 10 }} onClick={handleNewExercise}>
          New exercise
        </button>
      </form>

      {logged.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Logged This Session</p>
          {logged.map((s) => (
            <div className="meal-row" key={s.id}>
              <div>
                <div className="meal-name">{s.exercise} — set {s.set_number}</div>
                <div className="meal-desc">{s.day_type}</div>
              </div>
              <div className="meal-cal">{s.weight_kg != null ? `${s.weight_kg}kg` : "—"} × {s.reps ?? "—"}</div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn ghost" onClick={() => router.replace("/training")}>
        Done — back to Training
      </button>
    </div>
  );
}
