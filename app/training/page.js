"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/coaching";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

function groupPlan(rows) {
  const groups = [];
  const byDay = new Map();
  for (const row of rows) {
    const key = row.day_type || "Plan";
    if (!byDay.has(key)) {
      const g = { day_type: key, exercises: [] };
      byDay.set(key, g);
      groups.push(g);
    }
    byDay.get(key).exercises.push(row);
  }
  return groups;
}

function groupLog(rows) {
  const groups = [];
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) {
      const g = { date: row.date, exercises: new Map() };
      byDate.set(row.date, g);
      groups.push(g);
    }
    const g = byDate.get(row.date);
    if (!g.exercises.has(row.exercise)) g.exercises.set(row.exercise, []);
    g.exercises.get(row.exercise).push(row);
  }
  return groups.map((g) => ({
    date: g.date,
    exercises: Array.from(g.exercises.entries()).map(([exercise, sets]) => ({
      exercise,
      sets: sets.sort((a, b) => (a.set_number || 0) - (b.set_number || 0)),
    })),
  }));
}

export default function TrainingPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [plan, setPlan] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    Promise.all([
      supabase.from("workout_plan").select("*").eq("user_id", profile.id).order("day_type", { ascending: true }).order("order_index", { ascending: true }),
      supabase.from("workout_log").select("*").eq("user_id", profile.id).order("date", { ascending: false }).limit(80),
    ]).then(([planRes, logRes]) => {
      if (cancelled) return;
      if (planRes.error) setError(planRes.error.message);
      if (logRes.error) setError(logRes.error.message);
      setPlan(planRes.data || []);
      setLog(logRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile]);

  if (profileLoading || (profile && loading)) return <div className="center-loading">Loading…</div>;

  const planGroups = groupPlan(plan);
  const logGroups = groupLog(log);

  return (
    <div className="shell shell-with-nav">
      <AppHeader title="Training" />

      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

      <Link href="/training/log" className="btn primary">+ Log a set</Link>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Your Plan</p>
        {planGroups.length === 0 ? (
          <div className="note">No plan set up yet — your Trainer coach can build one with you.</div>
        ) : (
          planGroups.map((g) => (
            <div className="day-group" key={g.day_type}>
              <div className="day-group-head"><span>{g.day_type}</span></div>
              {g.exercises.map((ex) => (
                <div className="meal-row" key={ex.id}>
                  <div>
                    <div className="meal-name">{ex.exercise}</div>
                    <div className="meal-desc">{ex.target_sets ?? "—"} × {ex.target_rep_range || "—"}</div>
                  </div>
                  <div className="meal-cal">{ex.current_working_weight_kg != null ? `${ex.current_working_weight_kg}kg` : "—"}</div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Recent Sessions</p>
        {logGroups.length === 0 ? (
          <div className="note">No sessions logged yet.</div>
        ) : (
          logGroups.map((day) => (
            <div className="day-group" key={day.date}>
              <div className="day-group-head"><span>{fmtDate(day.date)}</span></div>
              {day.exercises.map((ex) => (
                <div className="exercise-block" key={ex.exercise}>
                  <div className="exercise-name">{ex.exercise}</div>
                  <div className="set-chips">
                    {ex.sets.map((s) => (
                      <span className="set-chip" key={s.id}>
                        {s.weight_kg != null ? `${s.weight_kg}kg` : "—"} × {s.reps ?? "—"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
