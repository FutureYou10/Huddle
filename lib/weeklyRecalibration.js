// Weekly Recalibration — a *suggested* set of next-week nutrition targets,
// computed from how the prior (now fully-complete) week actually went.
// Generated on-demand (from the Food page, once a new week has started and
// last week hasn't been reviewed yet) and never applied automatically —
// Harry taps Apply or Dismiss, same pattern as Training's Progressive
// Overload Watch, so targets never change without him seeing why first.
//
// Methodology ported from the original pre-app recalibration process (the
// reasoning recorded in older weekly_targets.basis rows): Katch-McArdle BMR
// from real lean mass, a flat activity add-on when watch-wear data is too
// thin to trust, and a "hold steady when sparse" rule so a recalibration
// never swings calories off a trend that isn't real yet.
//
// Server-only — only ever imported from an app/api/* route handler.

import {
  todayIso,
  weekDates,
  mondayOf,
  addDays,
  daysBetween,
  fatMassTrend,
  requiredPace,
  paceTag,
  dayTypeFor,
  deriveLeanMass,
} from "./coaching";

export const RECALIBRATION_TOOL = {
  name: "suggest_targets",
  description:
    "Propose next week's daily nutrition targets based on how the prior week actually went, applying the BMR/TDEE method and hold-steady rule described in the system prompt. Keep changes modest — a small, sensible nudge, never a drastic swing.",
  input_schema: {
    type: "object",
    properties: {
      daily_calorie_target: { type: "number" },
      daily_protein_target_g: { type: "number" },
      daily_carb_target_g: { type: "number" },
      daily_fat_target_g: { type: "number" },
      rationale: {
        type: "string",
        description:
          "2-3 plain-language sentences explaining the suggested change (or why to hold steady), in the Transformation Coach's voice — the numbers and the one thing to focus on, not a data-sourcing tour.",
      },
    },
    required: ["daily_calorie_target", "daily_protein_target_g", "daily_carb_target_g", "daily_fat_target_g", "rationale"],
  },
};

const SYSTEM_PROMPT =
  "You are Harry's Transformation Coach inside Huddle, his personal body-recomposition coaching " +
  "app. It's time for the weekly recalibration — work out next week's daily nutrition targets " +
  "from how last week actually went, using this method, then call suggest_targets exactly once:\n\n" +
  "1. BMR: the context gives you a Katch-McArdle estimate (370 + 21.6 x lean mass in kg) built " +
  "from his most recent real lean-mass figure — more accurate than a generic formula since it's " +
  "based on his actual measured body composition, not just height and weight. If no real lean-mass " +
  "data exists at all yet, the context instead gives you a rough height/weight bootstrap BMR — " +
  "treat that as a starting point only, and say plainly that it's rough until real tracking data " +
  "comes in.\n" +
  "2. Activity add-on: the context tells you whether there were enough watch-worn days this week " +
  "to trust a real activity average. If so, use that real figure; if not, it gives you a flat " +
  "fallback instead — treat that as an estimate, not a measurement, and don't present it as more " +
  "precise than it is.\n" +
  "3. BMR + activity add-on = TDEE. Weigh that against the required pace (also in the context, " +
  "recalculated fresh off his current goal) to see roughly what daily deficit is actually needed, " +
  "and let that steer the new calorie target.\n" +
  "4. HOLD STEADY WHEN DATA IS SPARSE: if the context says the fat-loss trend is still building " +
  "(not enough real weigh-ins yet), do not swing calories off a fresh TDEE estimate with zero " +
  "verified trend behind it — carry the current targets forward essentially unchanged, mention " +
  "the TDEE math only as a preview of what's coming once there's a real trend, and say plainly " +
  "why you're holding steady.\n" +
  "5. The goal in the context is always whatever's on his profile right now — if it changed since " +
  "last week's targets were set, treat the current goal as authoritative and say so plainly rather " +
  "than quietly working off stale numbers.\n" +
  "6. Keep protein and fat floors stable across a routine recalibration unless the math clearly " +
  "calls for a change, and never move calories by a drastic amount in one step — a sensible, " +
  "sustainable nudge, or holding steady, are almost always the right call.\n\n" +
  "Be steady, direct, and warm. In rationale, speak in the Transformation Coach's voice: the " +
  "numbers and the one thing driving them, in 2-3 plain sentences — the detailed reasoning above " +
  "is for you to work from, not to recite back to him verbatim.";

export function recalibrationSystemPrompt() {
  return SYSTEM_PROMPT;
}

// The most recently fully-completed week (Mon-Sun) as of today — recalibration
// only ever looks backward at a week that's actually finished.
export function lastCompletedWeekStart(todayIsoStr) {
  return addDays(mondayOf(todayIsoStr), -7);
}

// Katch-McArdle: BMR from lean mass alone (kg) — needs no age or sex, which
// matters because neither is reliably on file. More accurate than a generic
// formula once there's a real (or at least onboarding-stated) lean mass to use.
function katchMcArdleBmr(leanMassLb) {
  const leanMassKg = leanMassLb * 0.453592;
  return 370 + 21.6 * leanMassKg;
}

// Rough bootstrap for the rare case there's no lean-mass figure at all yet —
// not even the onboarding estimate. Mifflin-St Jeor needs an age; when dob
// isn't on file (it frequently isn't), fall back to a documented assumption
// rather than silently guessing — the context text says so either way, so
// the coach can flag the number as rough rather than presenting it as exact.
function bootstrapBmr(weightLb, heightCm, sex, dob, today) {
  const weightKg = weightLb * 0.453592;
  let age = 35;
  let ageIsAssumed = true;
  if (dob) {
    age = Math.floor(daysBetween(dob, today) / 365.25);
    ageIsAssumed = false;
  }
  const sexTerm = sex === "female" ? -161 : sex === "male" ? 5 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexTerm;
  return { bmr, ageIsAssumed, age };
}

const MIN_USABLE_ACTIVITY_DAYS = 3;
const FLAT_ACTIVITY_FALLBACK = 450;

export async function buildRecalibrationContext(supabase, userId, profile, weekStartIso) {
  const today = todayIso();
  const wDays = weekDates(weekStartIso);

  const { data: metricsRows } = await supabase
    .from("daily_metrics")
    .select("date, weight, body_fat, active_energy, resting_energy")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(21);
  const allRows = metricsRows || [];
  const metrics = allRows
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
  // dayTypeFor returns "Rest" on a rest day — a truthy string, so a plain
  // truthiness filter counts rest days as "planned training," inflating the
  // denominator (the same bug just found and fixed in coachContext.js).
  const plannedCount = wDays.filter((d) => {
    const dt = dayTypeFor(profile, d);
    return dt && dt !== "Rest";
  }).length;

  // trend defaults to "building" (rather than undefined) so the hold-steady
  // check below still fires correctly even with zero weigh-ins ever logged.
  let trend = { building: true, count: 0 };
  let trendLine = "Not enough weigh-ins yet to describe a reliable trend.";
  if (latest) {
    trend = fatMassTrend(metrics);
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

  // --- BMR/TDEE, ported from the original (pre-app) recalibration method ---
  // Prefer a real measured lean mass (this week's latest weigh-in), then the
  // onboarding-stated lean mass, then one derived from onboarding weight/body
  // fat — only falling back to a generic bootstrap if none of those exist.
  const leanMassLb =
    (latest ? deriveLeanMass(latest.weight, latest.body_fat) : null) ??
    profile?.start_lean_mass ??
    deriveLeanMass(profile?.start_weight, profile?.start_body_fat_pct);

  let bmr = null;
  let bmrLine;
  if (leanMassLb != null) {
    bmr = katchMcArdleBmr(leanMassLb);
    bmrLine = `Katch-McArdle BMR from ${Math.round(leanMassLb)}lb lean mass: ~${Math.round(bmr)} kcal.`;
  } else if (profile?.height_cm && (latest?.weight || profile?.start_weight)) {
    const weightLb = latest?.weight ?? profile.start_weight;
    const { bmr: bootBmr, ageIsAssumed, age } = bootstrapBmr(weightLb, Number(profile.height_cm), profile.sex, profile.dob, today);
    bmr = bootBmr;
    bmrLine = `No lean-mass data yet, so this is a rough height/weight bootstrap BMR${
      ageIsAssumed ? ` (age not on file — assumed ${age})` : ""
    }: ~${Math.round(bmr)} kcal. Treat as a starting point, not a precise figure.`;
  } else {
    bmrLine = "Not enough data on file (no lean mass, no height/weight) to estimate a BMR yet.";
  }

  const activityRows = allRows.filter((r) => wDays.includes(r.date));
  const usableActivityDays = activityRows.filter((r) => Number(r.active_energy) > 0 && Number(r.resting_energy) > 0);
  let activityAddOn;
  let activityLine;
  if (usableActivityDays.length >= MIN_USABLE_ACTIVITY_DAYS) {
    activityAddOn = usableActivityDays.reduce((s, r) => s + Number(r.active_energy), 0) / usableActivityDays.length;
    activityLine = `Activity add-on: ${usableActivityDays.length} full watch-worn days this week average ${Math.round(activityAddOn)} kcal active energy — use that real average.`;
  } else {
    activityAddOn = FLAT_ACTIVITY_FALLBACK;
    activityLine = `Activity add-on: only ${usableActivityDays.length} full watch-worn day(s) this week — not enough to trust a real average, so use the flat ~${FLAT_ACTIVITY_FALLBACK} kcal/day fallback instead.`;
  }

  const tdeeLine = bmr != null ? `Estimated TDEE (BMR + activity add-on): ~${Math.round(bmr + activityAddOn)} kcal/day.` : "";

  const goalLine =
    profile?.goal_weight != null && profile?.goal_body_fat_pct != null
      ? `Goal on file right now: ${profile.goal_weight} lbs / ${profile.goal_body_fat_pct}% body fat by ${
          profile.end_date || "the target date"
        } — this is live off his current profile, so if it changed since last week's targets were set, this is the one to use.`
      : "";

  const holdSteadyLine = trend.building
    ? "HOLD STEADY: not enough real weigh-ins yet for a trustworthy trend — treat the BMR/TDEE numbers above as a preview only, not something to act on. Carry the current targets forward essentially unchanged and say plainly why."
    : "";

  const lines = [
    `Reviewing the week of ${weekStartIso} (${loggedDays.length}/7 days logged).`,
    target
      ? `Current daily targets: ${target.daily_calorie_target ?? "—"} kcal / ${target.daily_protein_target_g ?? "—"}g protein / ${
          target.daily_carb_target_g ?? "—"
        }g carbs / ${target.daily_fat_target_g ?? "—"}g fat${target.basis ? ` (set because: ${target.basis.slice(0, 300)})` : ""}.`
      : "No current targets on record — propose a sensible starting point.",
    avgCal != null ? `Actual average while logged: ${Math.round(avgCal)} kcal/day, ${Math.round(avgProtein)}g protein/day.` : "No food logged that week.",
    trendLine,
    `Training: ${doneCount}/${plannedCount || "—"} planned sessions done that week.`,
    bmrLine,
    activityLine,
    tdeeLine,
    goalLine,
    holdSteadyLine,
  ];

  return {
    contextText: lines.filter(Boolean).join("\n"),
    loggedDayCount: loggedDays.length,
  };
}
