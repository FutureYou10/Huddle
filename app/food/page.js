"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate } from "../../lib/coaching";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

function groupByDay(rows) {
  const groups = [];
  const byDate = new Map();
  for (const row of rows) {
    const key = (row.logged_at || "").slice(0, 10);
    if (!byDate.has(key)) {
      const g = { date: key, rows: [] };
      byDate.set(key, g);
      groups.push(g);
    }
    byDate.get(key).rows.push(row);
  }
  return groups;
}

export default function FoodPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [target, setTarget] = useState(null);
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    Promise.all([
      supabase.from("weekly_targets").select("*").eq("user_id", profile.id).order("week_start", { ascending: false }).limit(1),
      supabase.from("food_log").select("*").eq("user_id", profile.id).order("logged_at", { ascending: false }).limit(30),
    ]).then(([targetRes, mealsRes]) => {
      if (cancelled) return;
      if (targetRes.error) setError(targetRes.error.message);
      if (mealsRes.error) setError(mealsRes.error.message);
      setTarget((targetRes.data && targetRes.data[0]) || null);
      setMeals(mealsRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile]);

  if (profileLoading || (profile && loading)) return <div className="center-loading">Loading…</div>;

  const groups = groupByDay(meals);

  return (
    <div className="shell shell-with-nav">
      <AppHeader title="Food" />

      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

      {target ? (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>This Week&rsquo;s Targets</p>
          <div className="stat-row">
            <div className="stat">
              <div className="k">Calories</div>
              <div className="v">{target.daily_calorie_target ?? "—"}</div>
            </div>
            <div className="stat">
              <div className="k">Protein</div>
              <div className="v">{target.daily_protein_target_g ?? "—"}g</div>
            </div>
            <div className="stat">
              <div className="k">Carbs</div>
              <div className="v">{target.daily_carb_target_g ?? "—"}g</div>
            </div>
            <div className="stat">
              <div className="k">Fat</div>
              <div className="v">{target.daily_fat_target_g ?? "—"}g</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="note">No weekly targets set yet.</div>
        </div>
      )}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Meal Log</p>
        {groups.length === 0 ? (
          <div className="note">Nothing logged yet — this fills in as your Nutritionist chats get logged.</div>
        ) : (
          groups.map((g) => {
            const dayTotal = g.rows.reduce((sum, r) => sum + (Number(r.calories) || 0), 0);
            return (
              <div className="day-group" key={g.date}>
                <div className="day-group-head">
                  <span>{fmtDate(g.date)}</span>
                  <span>{dayTotal} kcal</span>
                </div>
                {g.rows.map((m) => (
                  <div className="meal-row" key={m.id}>
                    <div>
                      <div className="meal-name">{m.meal}</div>
                      <div className="meal-desc">{m.description}</div>
                    </div>
                    <div className="meal-cal">{m.calories != null ? `${m.calories} kcal` : "—"}</div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}
