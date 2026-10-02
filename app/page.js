"use client";

import { Fragment, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  fmtDate, fmtDateLong, fmtWeight, fmtWeightDelta, todayIso, addDays, weekDates, dayTypeFor,
  deriveLeanMass, deriveFatMass, requiredPace, fatMassTrend, paceTag, phaseProgress, fatLeanProgressSeries, isCalorieDayOnTarget,
  deriveGoalPhases,
} from "../lib/coaching";
import { useProfile } from "../lib/useProfile";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import BarChartVsTarget from "../components/charts/BarChartVsTarget";
import TrendLine from "../components/charts/TrendLine";
import DayBoxGrid from "../components/charts/DayBoxGrid";
import PhaseProgressChart from "../components/charts/PhaseProgressChart";
import RingStat from "../components/charts/RingStat";
import RecapModal from "../components/RecapModal";
import WeighInCard from "../components/WeighInCard";
import { buildRecap, latestCompletedWeek, latestCompletedMonth } from "../lib/recap";

const PACE_TAG_LABEL = { ahead: "Ahead of pace", ontrack: "On track", behind: "Behind pace", nodata: "Still building trend" };

function sumByDate(rows, dateOf, field) {
  const out = new Map();
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    out.set(d, (out.get(d) || 0) + (Number(r[field]) || 0));
  }
  return out;
}

export default function OverviewPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [metrics, setMetrics] = useState([]);
  const [meals, setMeals] = useState([]);
  const [target, setTarget] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [workoutLog, setWorkoutLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [howOpen, setHowOpen] = useState(false);
  const [recap, setRecap] = useState(null); // { key, title, rangeStart, rangeEnd, cards } | null

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const since = addDays(todayIso(), -60);
    // The Phase Progress chart's quarter/all filters need the metrics history
    // to reach back to the start of the phase, not just the last 60 days
    // every other chart on this page needs.
    const metricsSince = profile.start_date && profile.start_date < since ? profile.start_date : since;
    Promise.all([
      supabase.from("daily_metrics").select("*").eq("user_id", profile.id).gte("date", metricsSince).order("date", { ascending: true }),
      supabase.from("food_log").select("*").eq("user_id", profile.id).gte("logged_at", since).order("logged_at", { ascending: true }),
      supabase.from("weekly_targets").select("*").eq("user_id", profile.id).order("week_start", { ascending: false }).limit(1),
      supabase.from("workout_sessions").select("*").eq("user_id", profile.id).gte("date", since),
      supabase.from("workout_log").select("*").eq("user_id", profile.id).gte("date", since).order("date", { ascending: false }),
    ]).then(([m, f, t, s, wl]) => {
      if (cancelled) return;
      const err = m.error || f.error || t.error || s.error || wl.error;
      if (err) setError(err.message);
      setMetrics(m.data || []);
      setMeals(f.data || []);
      setTarget((t.data && t.data[0]) || null);
      setSessions(s.data || []);
      setWorkoutLog(wl.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [profile]);

  // Auto-pop a recap the first time this loads after its period ends — a
  // Sunday for the week just gone, the start of a new month for the month
  // just gone — then remembers it's been shown so it doesn't nag every load.
  // A completed-but-empty period is marked seen too, just never shown.
  useEffect(() => {
    if (!profile || loading) return;
    try {
      const today = todayIso();
      const calTargetNow = target?.daily_calorie_target ?? null;
      const week = latestCompletedWeek(today);
      const weekKey = `huddle-recap-week-${profile.id}`;
      if (localStorage.getItem(weekKey) !== week.end) {
        localStorage.setItem(weekKey, week.end);
        const cards = buildRecap({ meals, metrics, workoutLog, sessions, calTarget: calTargetNow, rangeStart: week.start, rangeEnd: week.end });
        if (cards.length > 0) {
          setRecap({ key: week.end, title: "Your Week", rangeStart: week.start, rangeEnd: week.end, cards });
          return;
        }
      }
      const month = latestCompletedMonth(today);
      const monthKey = `huddle-recap-month-${profile.id}`;
      if (localStorage.getItem(monthKey) !== month.key) {
        localStorage.setItem(monthKey, month.key);
        const cards = buildRecap({ meals, metrics, workoutLog, sessions, calTarget: calTargetNow, rangeStart: month.start, rangeEnd: month.end });
        if (cards.length > 0) setRecap({ key: month.key, title: "Your Month", rangeStart: month.start, rangeEnd: month.end, cards });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, loading]);

  if (profileLoading || (profile && loading)) return <div className="center-loading">Loading…</div>;

  const today = todayIso();
  const yesterday = addDays(today, -1);
  const withWeight = metrics.filter((m) => m.weight != null);
  const latest = withWeight[withWeight.length - 1] || null;
  const prev = withWeight[withWeight.length - 2] || null;
  const yesterdayMetric = metrics.find((m) => m.date === yesterday) || null;

  const calByDay = sumByDate(meals, (r) => (r.logged_at || "").slice(0, 10), "calories");
  const proteinByDay = sumByDate(meals, (r) => (r.logged_at || "").slice(0, 10), "protein_g");

  const todayCal = calByDay.get(today) || 0;
  const todayProtein = proteinByDay.get(today) || 0;
  const todayFat = sumByDate(meals.filter((m) => (m.logged_at || "").slice(0, 10) === today), () => today, "fat_g").get(today) || 0;
  const todayCarb = sumByDate(meals.filter((m) => (m.logged_at || "").slice(0, 10) === today), () => today, "carbs_g").get(today) || 0;
  const yesterdayCal = calByDay.get(yesterday) || 0;
  const yesterdayProtein = proteinByDay.get(yesterday) || 0;
  const hasTodayLog = calByDay.has(today);
  const hasYesterdayLog = calByDay.has(yesterday);

  const calTarget = target?.daily_calorie_target ?? null;
  const proteinTarget = target?.daily_protein_target_g ?? null;
  const bandPct = Number(profile?.nutrition_band_pct ?? 20);
  const bandLow = Math.round(100 - bandPct);
  const bandHigh = Math.round(100 + bandPct);

  function openRecap(period) {
    const range = period === "week" ? latestCompletedWeek(today) : latestCompletedMonth(today);
    const cards = buildRecap({ meals, metrics, workoutLog, sessions, calTarget, rangeStart: range.start, rangeEnd: range.end });
    setRecap({ key: range.key || range.end, title: period === "week" ? "Your Week" : "Your Month", rangeStart: range.start, rangeEnd: range.end, cards });
  }

  // Merge a manually-logged weigh-in straight into local state so the whole
  // page (latest/prev, Phase Progress, Since You Started…) recomputes off
  // it immediately — no refetch needed.
  function handleWeighInSaved(row) {
    setMetrics((m) => {
      const others = m.filter((r) => r.date !== row.date);
      return [...others, row].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    });
  }

  const todayRow = metrics.find((m) => m.date === today) || null;

  const leanNow = latest ? deriveLeanMass(latest.weight, latest.body_fat) : null;
  const leanPrev = prev ? deriveLeanMass(prev.weight, prev.body_fat) : null;
  const fatNow = latest ? deriveFatMass(latest.weight, latest.body_fat) : null;
  const startFat = profile?.start_weight != null && profile?.start_body_fat_pct != null
    ? profile.start_weight * (profile.start_body_fat_pct / 100) : null;
  const fatChangeSinceStart = fatNow != null && startFat != null ? fatNow - startFat : null;
  const startLean = profile?.start_weight != null && profile?.start_body_fat_pct != null
    ? deriveLeanMass(profile.start_weight, profile.start_body_fat_pct) : null;
  const leanChangeSinceStart = leanNow != null && startLean != null ? leanNow - startLean : null;
  const weightChangeSinceStart = latest?.weight != null && profile?.start_weight != null
    ? latest.weight - profile.start_weight : null;
  const bodyFatChangeSinceStart = latest?.body_fat != null && profile?.start_body_fat_pct != null
    ? latest.body_fat - profile.start_body_fat_pct : null;

  const required = latest ? requiredPace(profile, latest) : null;
  const trend = fatMassTrend(metrics);
  const tag = trend.building ? "nodata" : paceTag(trend.perWeek, required?.fatLossPerWeek);

  const wDays = weekDates(today);
  const calWeek = wDays.map((d) => ({ date: d, value: calByDay.has(d) ? calByDay.get(d) : null, isToday: d === today }));
  const proteinWeek = wDays.map((d) => ({ date: d, value: proteinByDay.has(d) ? proteinByDay.get(d) : null, isToday: d === today }));

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const stepsSeries = last7.map((d) => {
    const row = metrics.find((m) => m.date === d);
    return { date: d, value: row?.steps ?? null, isToday: d === today };
  });

  const fatTrendPts = withWeight.slice(-4).map((m) => ({ date: m.date, value: deriveFatMass(m.weight, m.body_fat) }));
  const leanTrendPts = withWeight.slice(-4).map((m) => ({ date: m.date, value: deriveLeanMass(m.weight, m.body_fat) }));

  const daysToGoal = profile?.end_date
    ? Array.from({ length: Math.max(0, Math.round((new Date(profile.end_date) - new Date(today)) / 86400000)) + 1 }, (_, i) => addDays(today, i))
    : [];
  const trainingLeft = daysToGoal.filter((d) => d !== today && dayTypeFor(profile, d) && dayTypeFor(profile, d) !== "Rest").length;
  const nutritionLeft = Math.max(0, daysToGoal.length - 1);

  const sessionByDate = new Map(sessions.map((s) => [s.date, s]));
  const checklistDays = [];
  for (let d = profile?.start_date || today; d <= (profile?.end_date || today) && checklistDays.length < 90; d = addDays(d, 1)) {
    const dt = dayTypeFor(profile, d);
    const session = sessionByDate.get(d);
    let status = "";
    if (d === today) status = "today";
    else if (dt === "Rest" || !dt) status = "rest";
    else if (session?.complete) status = "done";
    else if (d < today) status = "missed";
    checklistDays.push({ date: d, status, title: `${fmtDate(d)} · ${dt || "Rest"}${session?.complete ? " · done" : ""}` });
  }
  const trainingDoneCount = checklistDays.filter((d) => d.status === "done").length;
  const trainingTotalSoFar = checklistDays.filter((d) => d.status === "done" || d.status === "missed").length;

  const foodDaysAll = [];
  for (let d = profile?.start_date || today; d <= (profile?.end_date || today) && foodDaysAll.length < 90; d = addDays(d, 1)) {
    let status = "";
    if (d === today) status = "today";
    else if (calByDay.has(d) && calTarget != null) {
      status = isCalorieDayOnTarget(calByDay.get(d), calTarget, bandPct) ? "fooddone" : "miss";
    }
    foodDaysAll.push({ date: d, status, title: `${fmtDate(d)}${calByDay.has(d) ? ` · ${Math.round(calByDay.get(d))} kcal` : ""}` });
  }
  const foodOnTargetCount = foodDaysAll.filter((d) => d.status === "fooddone").length;
  const foodGradedCount = foodDaysAll.filter((d) => d.status === "fooddone" || d.status === "miss").length;

  const progress = latest ? phaseProgress(
    profile, latest,
    { total: foodGradedCount, onTarget: foodOnTargetCount },
    { total: trainingTotalSoFar, done: trainingDoneCount },
  ) : null;
  const progressSeries = progress ? fatLeanProgressSeries(profile, metrics) : [];
  // Sequential 3-month sub-goals — distinct from phaseProgress's milestones
  // above (those just slice the overall timeline into thirds for the chart's
  // x-axis). These are real chunks with their own weight targets; a phase
  // unlocks once the previous one's target is actually hit, not on a date.
  const goalPhases = deriveGoalPhases(profile, latest?.weight ?? profile?.start_weight);

  const logRows = metrics.slice().reverse().slice(0, 30).map((m) => ({
    ...m,
    calories: calByDay.get(m.date) ?? null,
    protein: proteinByDay.get(m.date) ?? null,
    fatMass: deriveFatMass(m.weight, m.body_fat),
  }));

  return (
    <div className="shell shell-with-nav">
      <AppHeader title="Overview" />
      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={() => openRecap("week")}>🎉 Weekly Recap</button>
        <button type="button" className="btn secondary" style={{ width: "auto", padding: "8px 14px" }} onClick={() => openRecap("month")}>📅 Monthly Recap</button>
      </div>

      <WeighInCard profile={profile} todayRow={todayRow} onSaved={handleWeighInSaved} />

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Today</p>
        <div className="ring-row">
          <RingStat label="Calories" value={todayCal} target={calTarget} color="var(--fat)" />
          <RingStat label="Protein" value={todayProtein} target={proteinTarget} unit="g" color="var(--muscle)" />
          <RingStat label="Fat" value={todayFat} target={target?.daily_fat_target_g} unit="g" color="var(--training)" />
          <RingStat label="Carbs" value={todayCarb} target={target?.daily_carb_target_g} unit="g" color="var(--nutrition)" />
        </div>
        {!hasTodayLog && <div className="note" style={{ marginTop: 10 }}>Nothing logged yet today — this fills in as your Nutritionist chat gets logged.</div>}
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>
          Body Composition <span className="meal-desc" style={{ textTransform: "none", letterSpacing: 0 }}>as of {fmtDate(latest?.date)}</span>
        </p>
        <div className="stat-row">
          <div className="stat">
            <div className="k">Weight</div>
            <div className="v">{latest?.weight != null ? fmtWeight(latest.weight, profile?.units) : "—"} <span style={{ fontSize: 12, color: "var(--text-faint)" }}>→ {profile?.goal_weight != null ? fmtWeight(profile.goal_weight, profile?.units) : "—"}</span></div>
            {prev && latest && <div className="meal-desc">{(latest.weight - prev.weight >= 0 ? "+" : "")}{(latest.weight - prev.weight).toFixed(1)} vs last reading</div>}
          </div>
          <div className="stat">
            <div className="k">Body Fat %</div>
            <div className="v">{latest?.body_fat ?? "—"}% <span style={{ fontSize: 12, color: "var(--text-faint)" }}>→ {profile?.goal_body_fat_pct ?? "—"}%</span></div>
            {prev && latest && <div className="meal-desc">{(latest.body_fat - prev.body_fat >= 0 ? "+" : "")}{(latest.body_fat - prev.body_fat).toFixed(1)}pt vs last reading</div>}
          </div>
          <div className="stat">
            <div className="k">Lean Mass</div>
            <div className="v">{leanNow != null ? leanNow.toFixed(1) : "—"}</div>
            {leanPrev != null && leanNow != null && <div className="meal-desc">{(leanNow - leanPrev >= 0 ? "+" : "")}{(leanNow - leanPrev).toFixed(1)} vs last reading</div>}
          </div>
          <div className="stat">
            <div className="k">Fat Mass</div>
            <div className="v">{fatNow != null ? fatNow.toFixed(1) : "—"}</div>
            {prev && latest && <div className="meal-desc">{(fatNow - deriveFatMass(prev.weight, prev.body_fat) >= 0 ? "+" : "")}{(fatNow - deriveFatMass(prev.weight, prev.body_fat)).toFixed(1)} vs last reading</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Since You Started <span className="meal-desc" style={{ textTransform: "none", letterSpacing: 0 }}>{fmtDate(profile?.start_date)} → {fmtDate(latest?.date)}</span></p>
        <div className="since-start-hero">
          <div className="since-start-value">{weightChangeSinceStart != null ? fmtWeightDelta(weightChangeSinceStart, profile?.units) : "—"}</div>
          <div className="since-start-caption">{weightChangeSinceStart == null ? "no starting weight set" : weightChangeSinceStart < 0 ? "down since you started" : weightChangeSinceStart > 0 ? "up since you started" : "unchanged since you started"}</div>
        </div>
        <div className="stat-row">
          <div className="stat">
            <div className="k">Fat Mass</div>
            <div className="v">{fatChangeSinceStart != null ? fmtWeightDelta(fatChangeSinceStart, profile?.units) : "—"}</div>
          </div>
          <div className="stat">
            <div className="k">Lean Mass</div>
            <div className="v">{leanChangeSinceStart != null ? fmtWeightDelta(leanChangeSinceStart, profile?.units) : "—"}</div>
          </div>
          <div className="stat">
            <div className="k">Body Fat %</div>
            <div className="v">{bodyFatChangeSinceStart != null ? `${bodyFatChangeSinceStart >= 0 ? "+" : ""}${bodyFatChangeSinceStart.toFixed(1)}pt` : "—"}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Yesterday</p>
        <div className="stat-row">
          <div className="stat">
            <div className="k">Calories</div>
            <div className="v">{hasYesterdayLog ? Math.round(yesterdayCal) : "—"}</div>
            <div className="meal-desc">{calTarget != null && hasYesterdayLog ? `${yesterdayCal > calTarget ? "+" : ""}${Math.round(yesterdayCal - calTarget)} vs target` : "not logged"}</div>
          </div>
          <div className="stat">
            <div className="k">Protein</div>
            <div className="v">{hasYesterdayLog ? Math.round(yesterdayProtein) : "—"}g</div>
            <div className="meal-desc">{proteinTarget != null && hasYesterdayLog ? `${yesterdayProtein > proteinTarget ? "+" : ""}${Math.round(yesterdayProtein - proteinTarget)}g vs target` : "not logged"}</div>
          </div>
          <div className="stat">
            <div className="k">Steps</div>
            <div className="v">{yesterdayMetric?.steps ?? "—"}</div>
            <div className="meal-desc">vs 10,000 target</div>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="hero-label" style={{ fontSize: 11, textTransform: "uppercase", color: "var(--text-faint)", fontWeight: 600, marginBottom: 8 }}>
          At this rate, you land on {fmtDateLong(profile?.end_date)} at
        </p>
        {trend.building ? (
          <div className="goal-hero-value" style={{ fontSize: 22 }}>
            Still building trend <small style={{ display: "block", fontSize: 12, color: "var(--text-faint)", fontWeight: 500 }}>{trend.count} weigh-in{trend.count === 1 ? "" : "s"} logged so far</small>
          </div>
        ) : (
          <div className="goal-hero-value" style={{ fontSize: 28 }}>
            <span className={`pace-tag ${tag}`} style={{ fontSize: 11, verticalAlign: "middle" }}>{PACE_TAG_LABEL[tag]}</span>
          </div>
        )}
        {required && (
          <div className="pace-compare" style={{ display: "flex", gap: 16, marginTop: 12, padding: 12, background: "var(--bg-raised)", border: "1px solid var(--line)", borderRadius: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="k">Required pace (recalculated today)</div>
              <div className="v" style={{ fontSize: 15 }}>{required.fatLossPerWeek.toFixed(2)} lbs fat/wk · {required.muscleGainPerWeek.toFixed(2)} lbs muscle/wk</div>
              <div className="meal-desc">{required.weeksLeft.toFixed(1)} weeks left to {fmtDate(profile?.end_date)}</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div className="k">Today&rsquo;s live targets</div>
              <div className="v" style={{ fontSize: 15 }}>{calTarget ?? "—"} kcal · {proteinTarget ?? "—"}g protein</div>
            </div>
          </div>
        )}
        <details className="more" open={howOpen} onToggle={(e) => setHowOpen(e.target.open)} style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 600, color: "var(--muscle)" }}>{howOpen ? "Hide detail" : "How this is calculated"}</summary>
          <div className="more-body" style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.6, marginTop: 6 }}>
            <p>Goal fat mass = goal weight × goal body-fat% ({profile?.goal_weight ?? "—"} × {profile?.goal_body_fat_pct ?? "—"}%). Required pace = (current fat/lean mass − goal fat/lean mass) ÷ weeks left, recalculated from today&rsquo;s reading every time this loads. With fewer than 7 real weigh-ins a slope is noise rather than a forecast, so the pace tag stays off until there&rsquo;s a real run of data.</p>
          </div>
        </details>
      </div>

      <div className="card">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 12 }}>
          This Week <span className="meal-desc">{fmtDate(wDays[0])} – {fmtDate(wDays[6])}</span>
        </h3>
        <p className="meal-desc" style={{ marginBottom: 4 }}>Calories vs {calTarget ?? "—"} kcal/day target</p>
        <BarChartVsTarget days={calWeek} target={calTarget || 0} color="var(--fat)" />
        <p className="meal-desc" style={{ margin: "14px 0 4px" }}>Protein vs {proteinTarget ?? "—"}g/day target</p>
        <BarChartVsTarget days={proteinWeek} target={proteinTarget || 0} unit="g" color="var(--muscle)" />
      </div>

      {goalPhases.length > 0 && (
        <div className="card">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 4 }}>Goal Phases</h3>
          <p className="meal-desc" style={{ marginBottom: 12 }}>
            Broken into {goalPhases.length} chunks of about 3 months each — the next one unlocks once you actually hit this one&rsquo;s target, whenever that ends up being.
          </p>
          <div className="phase-list">
            {goalPhases.map((p) => (
              <div key={p.index} className={`phase-item${p.complete ? " complete" : ""}${p.current ? " current" : ""}${!p.unlocked ? " locked" : ""}`}>
                <div>
                  <div className="phase-label">
                    {p.complete ? "✅ " : !p.unlocked ? "🔒 " : ""}
                    {p.label}
                    {p.current ? " · in progress" : ""}
                  </div>
                  <div className="phase-range">
                    {fmtWeight(p.startWeightLb, profile?.units)} → {fmtWeight(p.targetWeightLb, profile?.units)}
                    {!p.complete ? ` · est. ${fmtDateLong(p.estimatedDate)}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 12 }}>Phase Progress</h3>
        <PhaseProgressChart progress={progress} series={progressSeries} />
      </div>

      <div className="card">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 12 }}>Fat Mass &amp; Lean Mass Trend</h3>
        <div className="trend-wrap" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <p className="meal-desc" style={{ color: "var(--fat)", fontWeight: 600, marginBottom: 4 }}>Fat Mass</p>
            <TrendLine points={fatTrendPts} paceValue={required?.currentFat} color="var(--fat)" />
          </div>
          <div>
            <p className="meal-desc" style={{ color: "var(--muscle)", fontWeight: 600, marginBottom: 4 }}>Lean Mass</p>
            <TrendLine points={leanTrendPts} paceValue={required?.currentLean} color="var(--muscle)" />
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 12 }}>Steps — Last 7 Days <span className="meal-desc">vs 10,000/day target</span></h3>
        <BarChartVsTarget days={stepsSeries} target={10000} color="var(--muscle)" targetLabel="10,000" />
      </div>

      <div className="card countdown-card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="countdown-num" style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 700, color: "var(--accent)" }}>
            {trainingLeft + nutritionLeft}<small style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase" }}>things left to do</small>
          </div>
          <div className="meal-desc">between today and {fmtDate(profile?.end_date)}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div><div className="v" style={{ fontSize: 21 }}>{trainingLeft}</div><div className="meal-desc">Training sessions</div></div>
          <div><div className="v" style={{ fontSize: 21 }}>{nutritionLeft}</div><div className="meal-desc">On-target nutrition days</div></div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 12 }}>
          Workout Checklist <span className="meal-desc">{fmtDate(profile?.start_date)} → {fmtDate(profile?.end_date)}</span>
        </h3>
        <DayBoxGrid days={checklistDays} />
        <div className="empty-state" style={{ paddingTop: 10 }}><b>{trainingDoneCount} of {checklistDays.filter((d) => d.status !== "rest" && d.status !== "").length}</b> sessions done</div>
      </div>

      <div className="card">
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 12 }}>
          Food Discipline <span className="meal-desc">on target = within {bandLow}–{bandHigh}% of the live daily target</span>
        </h3>
        <DayBoxGrid days={foodDaysAll} />
        <div className="empty-state" style={{ paddingTop: 10 }}><b>{foodOnTargetCount} of {foodGradedCount}</b> completed days on target so far</div>
      </div>

      <div className="card">
        <details className="more">
          <summary style={{ cursor: "pointer", fontFamily: "var(--font-display)", fontSize: 13, textTransform: "uppercase", color: "var(--text-dim)" }}>
            Full Log <span className="meal-desc" style={{ textTransform: "none" }}>({logRows.length} days — tap to show)</span>
          </summary>
          <div className="log-wrap chart-scroll" style={{ marginTop: 12 }}>
            <table style={{ minWidth: 640 }}>
              <thead><tr><th>Date</th><th>Weight</th><th>Body Fat</th><th>Lean Mass</th><th>Fat Mass</th><th>Steps</th><th>Cal In</th><th>Protein</th></tr></thead>
              <tbody>
                {logRows.map((r) => (
                  <Fragment key={r.date}>
                    <tr>
                      <td>{fmtDate(r.date)}</td>
                      <td>{r.weight ?? "—"}</td>
                      <td>{r.body_fat != null ? `${r.body_fat}%` : "—"}</td>
                      <td>{r.weight != null && r.body_fat != null ? deriveLeanMass(r.weight, r.body_fat).toFixed(1) : "—"}</td>
                      <td>{r.fatMass != null ? r.fatMass.toFixed(1) : "—"}</td>
                      <td>{r.steps ?? "—"}</td>
                      <td>{r.calories != null ? Math.round(r.calories) : "—"}</td>
                      <td>{r.protein != null ? `${Math.round(r.protein)}g` : "—"}</td>
                    </tr>
                    {r.notes && (
                      <tr className="log-notes-row">
                        <td colSpan={8}>📝 {r.notes}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <RecapModal
        open={!!recap}
        onClose={() => setRecap(null)}
        title={recap?.title}
        rangeStart={recap?.rangeStart}
        rangeEnd={recap?.rangeEnd}
        cards={recap?.cards || []}
      />

      <BottomNav />
    </div>
  );
}
