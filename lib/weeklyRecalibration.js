// Weekly Recalibration — a *suggested* set of next-week nutrition targets,
// computed from how the prior (now fully-complete) week actually went.
// Generated on-demand (from the Food page, once a new week has started and
// last week hasn't been reviewed yet) and never applied automatically —
// Harry taps Apply or Dismiss, same pattern as Training's Progressive
// Overload Watch, so targets never change without him seeing why first.
//
// Server-only — only ever imported from an app/api/* route handler.

import { todayIso, weekDates, mondayOf, addDays, fatMassTrend, requiredPace, paceTag, dayTypeFor } from "./coaching";

export const RECALIBRATION_TOOL = {
  name: "suggest_targets",
  description: "Propose next week's daily nutrition targets based on how the prior week actually went. Keep changes modest — a small, sensible nudge, never a drastic swing. If last week was on pace, that usually means holding targets steady.",
  input_schema: {
    type: "object",
    properties: {
      daily_calorie_target: { type: "number" },
      daily_protein_target_g: { type: "number" },
      daily_carb_target_g: { type: "number" },
      daily_fat_target_g: { type: "number" },
      rationale: { type: "string", description: "2-3 plain-language sentences explaining the suggested change (or why to hold steady), in the Transformation Coach's voice — numbers and the one thing to focus on, not a data-sourcing tour." },
    },
    required: ["daily_calorie_target", "daily_protein_target_g", "daily_carb_target_g", "daily_fat_target_g", "rationale"],
  },
};

const SYSTEM_PROMPT =
  "You are Harry's Transformation Coach inside Huddle, his personal body-recomposition coaching " +
  "app. It's time for the weekly recalibration — look at how last week actually went (trend, " +
  "training, nutrition adherence) against his current targets, and propose next week's daily " +
  "nutrition targets via the suggest_targets tool. If last week was on pace, that usually means " +
  "holding targets steady rather than changing them for the sake of it. If the trend is off pace, " +
  "nudge calories/macros by a sensible, sustainable amount — never a drastic swing. Be steady, " +
  "direct, and warm. Call suggest_targets exactly once.";

export function recalibrationSystemPrompt() {
  return SYSTEM_PROMPT;
}

// The most recently fully-completed week (Mon-Sun) as of today — recalibration
// only ever looks backward at a week that's actually finished.
export function lastCompletedWeekStart(todayIsoStr) {
  return addDays(mondayOf(todayIsoStr), -7);
}

export async function buildRecalibrationContext(supabase, userId, profile, weekStartIso) {
  const today = todayIso();
  const wDays = weekDates(weekStartIso);

  const { data: metricsRows } = await supabase
    .from("daily_metrics")
    .select("date, weight, body_fat")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(21);
  const metrics = (metricsRows || [])
    .filter((r) => r.weight != null && r.body_fat != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const latest = metrics[metrics.length - 1];

  const { data: targetRows } = await supabase
    .from("weekly_targets")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1);
  const target = targetRows?.[0] || null;

  const { data: foodRows } = await supabase
    .from("food_log")
    .select("logged_at, calories, protein_g, carbs_g, fat_g")
    .eq("user_id", userId)
    .gte("logged_at", `${wDays[0]}T00:00:00`)
    .lt("logged_at", `${addDays(wDays[6], 1)}T00:00:00`);

  const byDay = new Map();
  for (const r of foodRows || []) {
    const d = (r.logged_at || "").slice(0, 10);
    const cur = byDay.get(d) || { cal: 0, protein: 0, carbs: 0, fat: 0 };
    cur.cal += Number(r.calories) || 0;
    cur.protein += Number(r.protein_g) || 0;
    cur.carbs += Number(r.carbs_g) || 0;
    cur.fat += Number(r.fat_g) || 0;
    byDay.set(d, cur);
  }
  const loggedDays = wDays.filter((d) => byDay.has(d));

  const { data: sessions } = await supabase.from("workout_sessions").select("date, complete").eq("user_id", userId).in("date", wDays);
  const doneCount = (sessions || []).filter((s) => s.complete).length;
  const plannedCount = wDays.filter((d) => dayTypeFor(profile, d)).length;

  let trendLine = "Not enough weigh-ins yet to describe a reliable trend.";
  if (latest) {
    const trend = fatMassTrend(metrics);
    if (!trend.building) {
      const req = requiredPace(profile, latest);
      const tag = req ? paceTag(trend.perWeek, req.fatLossPerWeek) : null;
      trendLine = `Fat-loss trend: ~${trend.perWeek.toFixed(2)} lbs/week${req ? ` vs. ~${req.fatLossPerWeek.toFixed(2)} lbs/week required (${tag || "pace unclear"})` : ""}.`;
    } else {
      trendLine = `Still building a reliable trend (${trend.count} weigh-ins so far) — don't overreact to one week's numbers yet.`;
    }
  }

  const avgCal = loggedDays.length ? loggedDays.reduce((s, d) => s + byDay.get(d).cal, 0) / loggedDays.length : null;
  const avgProtein = loggedDays.length ? loggedDays.reduce((s, d) => s + byDay.get(d).protein, 0) / loggedDays.length : null;

  const lines = [
    `Reviewing the week of ${weekStartIso} (${loggedDays.length}/7 days logged).`,
    target
      ? `Current daily targets: ${target.daily_calorie_target ?? "—"} kcal / ${target.daily_protein_target_g ?? "—"}g protein / ${target.daily_carb_target_g ?? "—"}g carbs / ${target.daily_fat_target_g ?? "—"}g fat.`
      : "No current targets on record — propose a sensible starting point.",
    avgCal != null
      ? `Actual average while logged: ${Math.round(avgCal)} kcal/day, ${Math.round(avgProtein)}g protein/day.`
      : "No food logged that week.",
    trendLine,
    `Training: ${doneCount}/${plannedCount || "—"} planned sessions done that week.`,
  ];

  return {
    contextText: lines.filter(Boolean).join("\n"),
    loggedDayCount: loggedDays.length,
  };
}
