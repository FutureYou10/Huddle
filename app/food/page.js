"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, todayIso, weekDates } from "../../lib/coaching";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import WeekBudgetChart from "../../components/charts/WeekBudgetChart";

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
  return groups.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

const SOURCE_LABEL = {
  "Chat – estimated": "Chat · est.",
  "Chat – weighed": "Chat · weighed",
  "Photo estimate": "Photo",
};

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
      supabase.from("food_log").select("*").eq("user_id", profile.id).order("logged_at", { ascending: false }).limit(120),
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

  const today = todayIso();
  const groups = groupByDay(meals);
  const todaysMeals = groups.find((g) => g.date === today)?.rows || [];

  const calByDay = new Map(groups.map((g) => [g.date, sumField(g.rows, "calories")]));
  const proteinByDay = new Map(groups.map((g) => [g.date, sumField(g.rows, "protein_g")]));
  const wDays = weekDates(today);

  const calTarget = target?.daily_calorie_target ?? null;
  const proteinTarget = target?.daily_protein_target_g ?? null;
  const fatTarget = target?.daily_fat_target_g ?? null;
  const carbTarget = target?.daily_carb_target_g ?? null;
  const todayCal = calByDay.get(today) || 0;
  const todayProtein = proteinByDay.get(today) || 0;
  const todayFat = sumField(todaysMeals, "fat_g");
  const todayCarb = sumField(todaysMeals, "carbs_g");
  const todayFiber = sumField(todaysMeals, "fiber_g");

  const weekLoggedDays = wDays.filter((d) => d <= today && calByDay.has(d));
  const weekAvgProtein = weekLoggedDays.length ? weekLoggedDays.reduce((s, d) => s + proteinByDay.get(d), 0) / weekLoggedDays.length : null;
  const weekOnTargetDays = calTarget != null ? weekLoggedDays.filter((d) => Math.abs(calByDay.get(d) - calTarget) <= 100).length : 0;
  const weekBudget = target?.weekly_calorie_budget ?? (calTarget != null ? calTarget * 7 : null);
  const weekSpent = weekLoggedDays.reduce((s, d) => s + calByDay.get(d), 0);
  const weekPaceSoFar = weekBudget != null ? (weekBudget / 7) * weekLoggedDays.length : null;
  const weekDelta = weekPaceSoFar != null ? weekSpent - weekPaceSoFar : null;

  function bar(label, value, targetVal, color) {
    const pct = targetVal ? Math.min(100, (value / targetVal) * 100) : 0;
    return (
      <div className="bar-row" key={label}>
        <div className="bar-label">{label}</div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>
        <div className="bar-val">{Math.round(value)} / {targetVal ?? "—"}{label === "Calories" ? "" : "g"}</div>
      </div>
    );
  }

  return (
    <div className="shell shell-with-nav">
      <AppHeader title="Food" />
      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Today&rsquo;s Targets</p>
        {bar("Calories", todayCal, calTarget, "var(--fat)")}
        {bar("Protein", todayProtein, proteinTarget, "var(--muscle)")}
        {bar("Carbs", todayCarb, carbTarget, "var(--nutrition)")}
        {bar("Fat", todayFat, fatTarget, "var(--training)")}
        {todayFiber > 0 && <div className="meal-desc" style={{ marginTop: 8 }}>Fibre today: {Math.round(todayFiber)}g</div>}
      </div>

      <div className="grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 4 }}>
        <div className="stat">
          <div className="k">Week vs Budget</div>
          <div className="v">{weekDelta != null ? `${weekDelta >= 0 ? "+" : ""}${Math.round(weekDelta)}` : "—"}</div>
          <div className="meal-desc">{weekDelta != null ? (weekDelta >= 0 ? "over pace" : "under pace") : "no budget set"}</div>
        </div>
        <div className="stat">
          <div className="k">Protein Avg</div>
          <div className="v">{weekAvgProtein != null ? Math.round(weekAvgProtein) : "—"}g</div>
          <div className="meal-desc">this week so far</div>
        </div>
        <div className="stat">
          <div className="k">On Target</div>
          <div className="v">{weekOnTargetDays} / {weekLoggedDays.length}</div>
          <div className="meal-desc">days this week</div>
        </div>
        <div className="stat">
          <div className="k">Logged Today</div>
          <div className="v">{todaysMeals.length}</div>
          <div className="meal-desc">meal{todaysMeals.length === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>This Week So Far <span style={{ textTransform: "none", fontWeight: 400 }}>vs {weekBudget ? Math.round(weekBudget).toLocaleString() : "—"} kcal budget pace</span></p>
        {weekBudget ? (
          <WeekBudgetChart weekDates={wDays} calByDay={calByDay} weeklyBudget={weekBudget} todayIso={today} />
        ) : (
          <div className="note">Set a weekly calorie budget to see the week&rsquo;s trajectory here.</div>
        )}
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Today&rsquo;s Food Log</p>
        {todaysMeals.length === 0 ? (
          <div className="note">Nothing logged yet today — this fills in as your Nutritionist chat gets logged.</div>
        ) : (
          todaysMeals.map((m) => (
            <div className="meal-row" key={m.id}>
              <div>
                <div className="meal-name">{m.meal}{m.source && <span className="source-tag">{SOURCE_LABEL[m.source] || m.source}</span>}</div>
                <div className="meal-desc">{m.description}</div>
              </div>
              <div className="meal-cal">{m.calories != null ? `${m.calories} kcal` : "—"}</div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Full Log</p>
        {groups.length === 0 ? (
          <div className="note">Nothing logged yet.</div>
        ) : (
          groups.map((g) => {
            const dayTotal = sumField(g.rows, "calories");
            return (
              <div className="day-group" key={g.date}>
                <div className="day-group-head">
                  <span>{fmtDate(g.date)}</span>
                  <span>{Math.round(dayTotal)} kcal</span>
                </div>
                {g.rows.map((m) => (
                  <div className="meal-row" key={m.id}>
                    <div>
                      <div className="meal-name">{m.meal}{m.source && <span className="source-tag">{SOURCE_LABEL[m.source] || m.source}</span>}</div>
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
