"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { fmtDate, todayIso, addDays, weekDates, weekdayIndex, dayTypeFor, isCalorieDayOnTarget } from "../../lib/coaching";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import WeekBudgetChart from "../../components/charts/WeekBudgetChart";
import RangeTabs from "../../components/RangeTabs";

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
  "Saved meal": "Saved",
  "Repeated": "Repeat",
};

const EDIT_FIELDS = [
  ["calories", "Calories"],
  ["protein_g", "Protein g"],
  ["carbs_g", "Carbs g"],
  ["fat_g", "Fat g"],
  ["fiber_g", "Fibre g"],
];

// One food-log row that opens into an inline editor on tap. Writes go straight
// to Supabase under RLS (scoped by id + user_id as well), same direct-write
// pattern as the weigh-in card.
function MealRow({ m, userId, onSaved, onDeleted, onError, onRelog, onFavourite }) {
  const [open, setOpen] = useState(false);
  const [favName, setFavName] = useState("");
  const [favSaved, setFavSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({});

  function startEdit() {
    setForm({
      meal: m.meal || "",
      description: m.description || "",
      calories: m.calories ?? "",
      protein_g: m.protein_g ?? "",
      carbs_g: m.carbs_g ?? "",
      fat_g: m.fat_g ?? "",
      fiber_g: m.fiber_g ?? "",
    });
    setConfirmDelete(false);
    setFavName(((m.description || m.meal || "").trim()).slice(0, 40));
    setFavSaved(false);
    setOpen(true);
  }

  async function saveFavourite() {
    if (busy || !favName.trim()) return;
    setBusy(true);
    const ok = await onFavourite(m, favName.trim());
    setBusy(false);
    if (ok) setFavSaved(true);
  }

  async function relog() {
    if (busy) return;
    setBusy(true);
    await onRelog(m);
    setBusy(false);
  }

  async function save() {
    if (busy) return;
    if (!form.meal.trim()) return onError("Give the entry a meal name.");
    const num = (v) => (v === "" || v == null ? null : Number(v));
    const patch = {
      meal: form.meal.trim(),
      description: form.description.trim(),
      calories: num(form.calories),
      protein_g: num(form.protein_g),
      carbs_g: num(form.carbs_g),
      fat_g: num(form.fat_g),
      fiber_g: num(form.fiber_g),
    };
    for (const [k] of EDIT_FIELDS) {
      if (patch[k] != null && (!Number.isFinite(patch[k]) || patch[k] < 0)) return onError("Numbers need to be zero or more.");
    }
    setBusy(true);
    const { data, error } = await supabase.from("food_log").update(patch).eq("id", m.id).eq("user_id", userId).select().maybeSingle();
    setBusy(false);
    if (error || !data) return onError(error?.message || "Couldn't save that change.");
    onSaved(data);
    setOpen(false);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.from("food_log").delete().eq("id", m.id).eq("user_id", userId);
    setBusy(false);
    if (error) return onError(error.message);
    onDeleted(m.id);
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="meal-item">
      <div className="meal-row">
        <div>
          <div className="meal-name">{m.meal}{m.source && <span className="source-tag">{SOURCE_LABEL[m.source] || m.source}</span>}</div>
          <div className="meal-desc">{m.description}</div>
        </div>
        <div className="meal-right">
          <div className="meal-cal">{m.calories != null ? `${m.calories} kcal` : "—"}</div>
          <div className="meal-actions">
            <button type="button" className="meal-edit-btn" onClick={relog} disabled={busy} aria-label={`Log ${m.meal} again today`}>Log again</button>
            <button type="button" className="meal-edit-btn" onClick={() => (open ? setOpen(false) : startEdit())} aria-label={open ? "Close editor" : `Edit ${m.meal}`}>
              {open ? "Close" : "Edit"}
            </button>
          </div>
        </div>
      </div>
      {open && (
        <div className="meal-editor">
          <div className="field">
            <label className="field-label">Meal</label>
            <input type="text" value={form.meal} onChange={set("meal")} />
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <input type="text" value={form.description} onChange={set("description")} />
          </div>
          <div className="meal-editor-grid">
            {EDIT_FIELDS.map(([k, label]) => (
              <div className="field" key={k}>
                <label className="field-label">{label}</label>
                <input type="number" inputMode="decimal" min="0" step="any" value={form[k]} onChange={set(k)} />
              </div>
            ))}
          </div>
          <div className="btn-row">
            <button type="button" className="btn primary" style={{ width: "auto", padding: "9px 18px" }} onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            {confirmDelete ? (
              <button type="button" className="btn secondary meal-delete-confirm" style={{ width: "auto", padding: "9px 14px" }} onClick={remove} disabled={busy}>
                Tap again to delete
              </button>
            ) : (
              <button type="button" className="btn ghost meal-delete" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</button>
            )}
            <button type="button" className="btn ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
          </div>
          <div className="meal-fav">
            <label className="field-label">Save as a favourite</label>
            <div className="meal-fav-row">
              <input type="text" value={favName} onChange={(e) => { setFavName(e.target.value); setFavSaved(false); }} placeholder="Name, e.g. Usual breakfast" />
              <button type="button" className="btn secondary" style={{ width: "auto", padding: "9px 14px" }} onClick={saveFavourite} disabled={busy || !favName.trim()}>
                {favSaved ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FoodPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [target, setTarget] = useState(null);
  const [meals, setMeals] = useState([]);
  const [saved, setSaved] = useState([]);
  const [targetRange, setTargetRange] = useState("day");
  const [repeating, setRepeating] = useState(false);
  const [weekSessions, setWeekSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [insights, setInsights] = useState(null); // { items, notEnoughData } | null while loading
  const [suggestion, setSuggestion] = useState(null); // { suggestion, notEnoughData } | null while loading
  const [deciding, setDeciding] = useState(false);
  const [midweekInsight, setMidweekInsight] = useState(null); // { id, body, created_at } | null
  const [dismissingInsight, setDismissingInsight] = useState(false);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const wDays = weekDates(todayIso());
    Promise.all([
      supabase.from("weekly_targets").select("*").eq("user_id", profile.id).order("week_start", { ascending: false }).limit(1),
      supabase.from("food_log").select("*").eq("user_id", profile.id).order("logged_at", { ascending: false }).limit(400),
      supabase.from("workout_sessions").select("*").eq("user_id", profile.id).gte("date", wDays[0]).lte("date", wDays[6]),
      supabase.from("saved_meals").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }),
    ]).then(([targetRes, mealsRes, sessionsRes, savedRes]) => {
      if (cancelled) return;
      if (targetRes.error) setError(targetRes.error.message);
      if (mealsRes.error) setError(mealsRes.error.message);
      if (sessionsRes.error) setError(sessionsRes.error.message);
      setTarget((targetRes.data && targetRes.data[0]) || null);
      setMeals(mealsRes.data || []);
      setWeekSessions(sessionsRes.data || []);
      // Favourites are a nice-to-have: a failure here shouldn't block the page.
      setSaved(savedRes.data || []);
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
      const [insightsRes, suggestionRes, midweekRes] = await Promise.all([
        fetch("/api/nutrition-insights", { headers }).then((r) => r.json()).catch((e) => ({ error: e.message })),
        fetch("/api/target-suggestions", { headers }).then((r) => r.json()).catch((e) => ({ error: e.message })),
        // The Wednesday mid-week check-in (app/api/cron/midweek-checkin) —
        // a dismissable card here instead of a chat message.
        fetch("/api/coach-insights?coach=nutritionist&kind=midweek_checkin", { headers }).then((r) => r.json()).catch((e) => ({ error: e.message })),
      ]);
      if (cancelled) return;
      setInsights(insightsRes.error ? { items: [], notEnoughData: true } : insightsRes);
      setSuggestion(suggestionRes.error ? { suggestion: null } : suggestionRes);
      setMidweekInsight(midweekRes.error ? null : midweekRes.insight);
    })();
    return () => { cancelled = true; };
  }, [profile]);

  async function dismissMidweekInsight() {
    if (!midweekInsight || dismissingInsight) return;
    setDismissingInsight(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/coach-insights", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: midweekInsight.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Couldn't save that.");
      setMidweekInsight(null);
    } catch (e) {
      setError(e.message || "Couldn't save that.");
    } finally {
      setDismissingInsight(false);
    }
  }

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

  // Inserts one or more entries stamped "now" and shows them straight away.
  async function addToLog(entries) {
    const stamp = new Date().toISOString();
    const rows = entries.map((e) => ({
      user_id: profile.id,
      meal: e.meal,
      description: e.description ?? null,
      calories: e.calories ?? null,
      protein_g: e.protein_g ?? null,
      carbs_g: e.carbs_g ?? null,
      fat_g: e.fat_g ?? null,
      fiber_g: e.fiber_g ?? null,
      source: e.source || null,
      logged_at: stamp,
    }));
    const { data, error: insErr } = await supabase.from("food_log").insert(rows).select();
    if (insErr || !data) {
      setError(insErr?.message || "Couldn't add that.");
      return false;
    }
    setError("");
    setMeals((ms) => [...data, ...ms]);
    return true;
  }

  function relogMeal(m) {
    return addToLog([m]);
  }

  async function repeatYesterday() {
    if (repeating) return;
    const y = new Date(`${todayIso()}T12:00:00`);
    y.setDate(y.getDate() - 1);
    const yIso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    const rows = meals.filter((r) => (r.logged_at || "").slice(0, 10) === yIso);
    if (!rows.length) return setError("Nothing logged yesterday to repeat.");
    setRepeating(true);
    await addToLog(rows.map((r) => ({ ...r, source: "Repeated" })));
    setRepeating(false);
  }

  async function saveFavourite(m, name) {
    const { data, error: favErr } = await supabase
      .from("saved_meals")
      .insert({
        user_id: profile.id,
        name,
        description: m.description ?? null,
        calories: m.calories ?? null,
        protein_g: m.protein_g ?? null,
        carbs_g: m.carbs_g ?? null,
        fat_g: m.fat_g ?? null,
      })
      .select()
      .single();
    if (favErr || !data) {
      setError(favErr?.message || "Couldn't save that favourite.");
      return false;
    }
    setError("");
    setSaved((s) => [data, ...s]);
    return true;
  }

  async function removeFavourite(id) {
    const { error: delErr } = await supabase.from("saved_meals").delete().eq("id", id).eq("user_id", profile.id);
    if (delErr) return setError(delErr.message);
    setSaved((s) => s.filter((x) => x.id !== id));
  }

  function addFavourite(f) {
    return addToLog([{ meal: f.name, description: f.description, calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, source: "Saved meal" }]);
  }

  function onMealSaved(row) {
    setError("");
    setMeals((ms) => ms.map((x) => (x.id === row.id ? row : x)));
  }
  function onMealDeleted(id) {
    setError("");
    setMeals((ms) => ms.filter((x) => x.id !== id));
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

  // Day shows today as-is; Week / Month show the average per logged day so the
  // same daily targets still make sense as the comparison. The in-progress day
  // is left out of an average (it would read as a miss just because it isn't
  // over) unless it's the only day there is.
  const rangeDates = targetRange === "week" ? wDays.filter((d) => d <= today) : Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));
  let avgDates = rangeDates.filter((d) => d < today && calByDay.has(d));
  if (avgDates.length === 0) avgDates = rangeDates.filter((d) => calByDay.has(d));
  const rowsByDate = new Map(groups.map((g) => [g.date, g.rows]));
  const avgOf = (field) => (avgDates.length ? avgDates.reduce((sum, d) => sum + sumField(rowsByDate.get(d) || [], field), 0) / avgDates.length : 0);
  const shown =
    targetRange === "day"
      ? { cal: todayCal, protein: todayProtein, carb: todayCarb, fat: todayFat }
      : { cal: avgOf("calories"), protein: avgOf("protein_g"), carb: avgOf("carbs_g"), fat: avgOf("fat_g") };

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

      {midweekInsight && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Mid-Week Check-In <span style={{ textTransform: "none", fontWeight: 400 }}>from your Nutritionist</span></p>
            <button type="button" className="btn ghost" style={{ width: "auto", padding: "4px 10px", fontSize: 13 }} onClick={dismissMidweekInsight} disabled={dismissingInsight}>
              {dismissingInsight ? "…" : "Dismiss"}
            </button>
          </div>
          <p className="note" style={{ margin: 0 }}>{midweekInsight.body}</p>
        </div>
      )}

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <p className="eyebrow" style={{ margin: 0 }}>{targetRange === "day" ? "Today\u2019s Targets" : "Daily Average vs Targets"}</p>
          <RangeTabs value={targetRange} onChange={setTargetRange} options={[{ key: "day", label: "Day" }, { key: "week", label: "Week" }, { key: "month", label: "Month" }]} label="Targets range" />
        </div>
        {bar("Calories", shown.cal, calTarget, "var(--fat)")}
        {bar("Protein", shown.protein, proteinTarget, "var(--muscle)")}
        {bar("Carbs", shown.carb, carbTarget, "var(--nutrition)")}
        {bar("Fat", shown.fat, fatTarget, "var(--training)")}
        {targetRange === "day" ? (
          todayFiber > 0 && <div className="meal-desc" style={{ marginTop: 8 }}>Fibre today: {Math.round(todayFiber)}g</div>
        ) : (
          <div className="meal-desc" style={{ marginTop: 8 }}>
            {avgDates.length > 0 ? `Average per day across ${avgDates.length} logged day${avgDates.length === 1 ? "" : "s"}` : "No logged days in this range yet."}
            {targetRange === "week" ? " this week" : " in the last 30 days"}
          </div>
        )}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <p className="eyebrow" style={{ margin: 0 }}>Quick Add</p>
          <button type="button" className="meal-edit-btn" onClick={repeatYesterday} disabled={repeating}>
            {repeating ? "Adding…" : "Repeat yesterday"}
          </button>
        </div>
        {saved.length === 0 ? (
          <div className="note">Open any entry below with Edit and save it as a favourite — then it&rsquo;s one tap to add again.</div>
        ) : (
          saved.map((f) => (
            <div className="meal-row" key={f.id}>
              <div>
                <div className="meal-name">{f.name}</div>
                <div className="meal-desc">{f.description}</div>
              </div>
              <div className="meal-right">
                <div className="meal-cal">{f.calories != null ? `${Math.round(Number(f.calories))} kcal` : "—"}</div>
                <div className="meal-actions">
                  <button type="button" className="meal-edit-btn" onClick={() => addFavourite(f)}>Add to today</button>
                  <button type="button" className="meal-edit-btn meal-delete" onClick={() => removeFavourite(f.id)} aria-label={`Remove ${f.name} from favourites`}>Remove</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Today&rsquo;s Food Log</p>
        {todaysMeals.length === 0 ? (
          <div className="note">Nothing logged yet today — this fills in as your Nutritionist chat gets logged.</div>
        ) : (
          todaysMeals.map((m) => (
            <MealRow key={m.id} m={m} userId={profile.id} onSaved={onMealSaved} onDeleted={onMealDeleted} onError={setError} onRelog={relogMeal} onFavourite={saveFavourite} />
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
                  <MealRow key={m.id} m={m} userId={profile.id} onSaved={onMealSaved} onDeleted={onMealDeleted} onError={setError} onRelog={relogMeal} onFavourite={saveFavourite} />
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
