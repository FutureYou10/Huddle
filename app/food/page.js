"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, todayIso, weekDates, weekdayIndex, dayTypeFor, isCalorieDayOnTarget } from "../../lib/coaching";
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
  const [weekSessions, setWeekSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [insights, setInsights] = useState(null); // { items, notEnoughData } | null while loading
  const [suggestion, setSuggestion] = useState(null); // { suggestion, notEnoughData } | null while loading
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const wDays = weekDates(todayIso());
    Promise.all([
      supabase.from("weekly_targets").select("*").eq("user_id", profile.id).order("week_start", { ascending: false }).limit(1),
      supabase.from("food_log").select("*").eq("user_id", profile.id).order("logged_at", { ascending: false }).limit(120),
      supabase.from("workout_sessions").select("*").eq("user_id", profile.id).gte("date", wDays[0]).lte("date", wDays[6]),
    ]).then(([targetRes, mealsRes, sessionsRes]) => {
      if (cancelled) return;
      if (targetRes.error) setError(targetRes.error.message);
      if (mealsRes.error) setError(mealsRes.error.message);
      if (sessionsRes.error) setError(sessionsRes.error.message);
      setTarget((targetRes.data && targetRes.data[0]) || null);
      setMeals(mealsRes.data || []);
      setWeekSessions(sessionsRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile]);

  // Nutrition Gap & Suggestions and the Weekly Recalibration suggestion are
  // both generated on-demand by their own API routes (not a cron) — calling
  // them here means they're ready whenever there's something to say, instead
  // of waiting on a schedule. Each is cheap to re-check: already-cached /
  // already-decided state comes straight back without calling Claude again.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;
      const headers = { authorization: `Bearer ${token}` };
      const [insightsRes, suggestionRes] = await Promise.all([
        fetch("/api/nutrition-insights", { headers }).then((r) => r.json()).catch((e) => ({ error: e.message })),
        fetch("/api/target-suggestions", { headers }).then((r) => r.json()).catch((e) => ({ error: e.message })),
      ]);
      if (cancelled) return;
      setInsights(insightsRes.error ? { items: [], notEnoughData: true } : insightsRes);
      setSuggestion(suggestionRes.error ? { suggestion: null } : suggestionRes);
    })();
    return () => { cancelled = true; };
  }, [profile]);

  async function decide(action) {
    if (!suggestion?.suggestion || deciding) return;
    setDeciding(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/target-suggestions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: suggestion.suggestion.id, action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't save that.");
      setSuggestion({ suggestion: json.suggestion });
      if (action === "apply") {
        const { data: targetRes } = await supabase
          .from("weekly_targets")
          .select("*")
          .eq("user_id", profile.id)
          .order("week_start", { ascending: false })
          .limit(1);
        setTarget((targetRes && targetRes[0]) || null);
      }
    } catch (e) {
      setError(e.message || "Couldn't save that.");
    } finally {
      setDeciding(false);
    }
  }

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
  // Today is still in progress — grading it against the full daily target
  // would read as a miss purely because the day isn't over yet.
  const bandPct = Number(profile?.nutrition_band_pct ?? 20);
  const weekOnTargetDays = calTarget != null ? weekLoggedDays.filter((d) => d < today && isCalorieDayOnTarget(calByDay.get(d), calTarget, bandPct)).length : 0;

  // Pacing is measured against real calendar time elapsed this week (Monday
  // through today, inclusive), not just days that happen to have a log —
  // a genuine "progress vs time gone" tracker rather than one that quietly
  // skips a day you forgot to log.
  const daysElapsed = weekdayIndex(today) + 1;
  const daysSoFar = wDays.filter((d) => d <= today);
  const weekBudget = target?.weekly_calorie_budget ?? (calTarget != null ? calTarget * 7 : null);
  const weekSpent = daysSoFar.reduce((s, d) => s + (calByDay.get(d) || 0), 0);
  const weekPaceSoFar = weekBudget != null ? (weekBudget / 7) * daysElapsed : null;
  const weekDelta = weekPaceSoFar != null ? weekSpent - weekPaceSoFar : null;

  const weeklyProteinTarget = proteinTarget != null ? proteinTarget * 7 : null;
  const weekProteinSpent = daysSoFar.reduce((s, d) => s + (proteinByDay.get(d) || 0), 0);
  const weekProteinPaceSoFar = weeklyProteinTarget != null ? (weeklyProteinTarget / 7) * daysElapsed : null;
  const weekProteinDelta = weekProteinPaceSoFar != null ? weekProteinSpent - weekProteinPaceSoFar : null;

  const trainingDaysPlannedSoFar = daysSoFar.filter((d) => {
    const dt = dayTypeFor(profile, d);
    return dt && dt !== "Rest";
  }).length;
  const sessionsDoneThisWeek = weekSessions.filter((s) => s.complete).length;

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

      {suggestion?.suggestion?.status === "pending" && (
        <div className="card recalibration-card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Suggested Recalibration</p>
          <div className="recalibration-targets">
            <div className="recalibration-target"><span className="k">Calories</span><span className="v">{Math.round(suggestion.suggestion.suggested_daily_calorie_target)}</span></div>
            <div className="recalibration-target"><span className="k">Protein</span><span className="v">{Math.round(suggestion.suggestion.suggested_daily_protein_target_g)}g</span></div>
            <div className="recalibration-target"><span className="k">Carbs</span><span className="v">{Math.round(suggestion.suggestion.suggested_daily_carb_target_g)}g</span></div>
            <div className="recalibration-target"><span className="k">Fat</span><span className="v">{Math.round(suggestion.suggestion.suggested_daily_fat_target_g)}g</span></div>
          </div>
          <p className="note" style={{ marginTop: 10 }}>{suggestion.suggestion.rationale}</p>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn primary" style={{ width: "auto", padding: "10px 18px" }} onClick={() => decide("apply")} disabled={deciding}>
              {deciding ? "Saving…" : "Apply to next week"}
            </button>
            <button className="btn ghost" onClick={() => decide("dismiss")} disabled={deciding}>Keep current targets</button>
          </div>
        </div>
      )}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Today&rsquo;s Targets</p>
        {bar("Calories", todayCal, calTarget, "var(--fat)")}
        {bar("Protein", todayProtein, proteinTarget, "var(--muscle)")}
        {bar("Carbs", todayCarb, carbTarget, "var(--nutrition)")}
        {bar("Fat", todayFat, fatTarget, "var(--training)")}
        {todayFiber > 0 && <div className="meal-desc" style={{ marginTop: 8 }}>Fibre today: {Math.round(todayFiber)}g</div>}
      </div>

      <p className="meal-desc" style={{ marginBottom: 6 }}>This week so far · day {daysElapsed} of 7</p>
      <div className="grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 4 }}>
        <div className="stat">
          <div className="k">Calories vs Pace</div>
          <div className="v">{weekDelta != null ? `${weekDelta >= 0 ? "+" : ""}${Math.round(weekDelta)}` : "—"}</div>
          <div className="meal-desc">{weekDelta != null ? (weekDelta >= 0 ? "over pace" : "under pace") : "no budget set"}</div>
        </div>
        <div className="stat">
          <div className="k">Protein vs Pace</div>
          <div className="v">{weekProteinDelta != null ? `${weekProteinDelta >= 0 ? "+" : ""}${Math.round(weekProteinDelta)}g` : "—"}</div>
          <div className="meal-desc">{weekAvgProtein != null ? `avg ${Math.round(weekAvgProtein)}g/day` : "no target set"}</div>
        </div>
        <div className="stat">
          <div className="k">Sessions</div>
          <div className="v">{sessionsDoneThisWeek} / {trainingDaysPlannedSoFar}</div>
          <div className="meal-desc">trained this week</div>
        </div>
        <div className="stat">
          <div className="k">On Target</div>
          <div className="v">{weekOnTargetDays} / {weekLoggedDays.length}</div>
          <div className="meal-desc">days this week</div>
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

      {insights?.items?.length > 0 && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Nutrition Gap &amp; Suggestions <span style={{ textTransform: "none", fontWeight: 400 }}>from what&rsquo;s actually been logged this week</span></p>
          {insights.items.map((item, i) => (
            <div className="insight-row" key={i}>
              <div className="insight-icon">{item.icon}</div>
              <div>
                <div className="insight-title">{item.title}</div>
                <div className="meal-desc">{item.detail}</div>
                <div className="insight-suggestion">Suggestion: {item.suggestion}</div>
              </div>
            </div>
          ))}
        </div>
      )}

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
