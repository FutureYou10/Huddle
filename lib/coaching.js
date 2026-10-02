// Shared coaching math. Everything here is generic — it reads only from the
// profile row (start/goal weight+body-fat, end_date, training_split) plus
// whatever daily_metrics/food_log/workout rows are passed in. No user-specific
// branching: the same functions produce Harry's numbers or any other user's
// once their profile + data exist in the same shape.

export const PACE_RATE = {
  loss_05: 0.5,
  loss_1: 1,
  loss_15: 1.5,
  loss_2: 2,
  gain_025: 0.25,
  gain_05: 0.5,
  gain_075: 0.75,
  gain_1: 1,
};

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Shared between Settings and Onboarding so a pace/goal is always labelled
// the same way wherever it's picked or displayed.
export const GOAL_LABEL = { fat: "Lose fat", muscle: "Build muscle", recomp: "Body recomposition" };

export const PACE_LABEL = {
  loss_05: "Lose 0.5 lb/week",
  loss_1: "Lose 1 lb/week",
  loss_15: "Lose 1.5 lb/week",
  loss_2: "Lose 2 lb/week",
  gain_025: "Gain 0.25 lb/week",
  gain_05: "Gain 0.5 lb/week",
  gain_075: "Gain 0.75 lb/week",
  gain_1: "Gain 1 lb/week",
};

// Fat loss and recomposition both run a deficit (recomp needs one to free up
// the fat it's trading for muscle); only an explicit muscle-gain goal calls
// for a surplus pace. Used to filter which paces make sense to offer for a
// given goal (Onboarding) and to pick deficit/surplus direction (nutrition
// target math).
export function pacesForGoal(goal) {
  const prefix = goal === "muscle" ? "gain" : "loss";
  return Object.keys(PACE_RATE).filter((k) => k.startsWith(prefix));
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtWeight(lb, units) {
  if (lb == null || Number.isNaN(lb)) return "—";
  return units === "metric" ? `${Math.round(lb * 0.453592)} kg` : `${Math.round(lb)} lb`;
}

// Signed, one-decimal version of fmtWeight for "change since X" displays,
// where fmtWeight's whole-number rounding would hide real movement.
export function fmtWeightDelta(lb, units) {
  if (lb == null || Number.isNaN(lb)) return "—";
  const converted = units === "metric" ? lb * 0.453592 : lb;
  const unit = units === "metric" ? "kg" : "lb";
  return `${converted >= 0 ? "+" : ""}${converted.toFixed(1)} ${unit}`;
}

// The inverse of fmtWeight's conversion — daily_metrics.weight is always
// stored in lb, so a value typed in kg (because Settings → Units is
// "metric") needs converting back before it's saved.
export function toStorageLb(value, units) {
  if (value == null || Number.isNaN(value)) return null;
  return units === "metric" ? value / 0.453592 : value;
}

// Formats a Date using ITS OWN local calendar fields — never toISOString(),
// which converts to UTC first. That round-trip silently rolls back to the
// previous day for anyone in a positive UTC offset (all of the UK in BST,
// all of Europe, Dubai, Sydney...) — e.g. addDays("2026-09-27", 1) in BST
// came back as "2026-09-27" again (the +1h offset cancels the +1 day),
// which made every addDays-based loop in the app (the Training day picker,
// the Overview checklist, the goal countdown) drift or outright get stuck.
function isoFromLocalDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso() {
  return isoFromLocalDate(new Date());
}

export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoFromLocalDate(d);
}

// Monday=0 .. Sunday=6, matching profiles.training_split's keys.
export function weekdayIndex(iso) {
  const d = new Date(iso + "T00:00:00");
  return (d.getDay() + 6) % 7;
}

export function mondayOf(iso) {
  return addDays(iso, -weekdayIndex(iso));
}

export function weekDates(iso) {
  const monday = mondayOf(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function dayTypeFor(profile, iso) {
  if (!profile?.training_split) return null;
  return profile.training_split[String(weekdayIndex(iso))] || null;
}

export function weeksBetween(startIso, endIso) {
  const d1 = new Date(startIso + "T00:00:00");
  const d2 = new Date(endIso + "T00:00:00");
  return (d2 - d1) / (7 * 86400000);
}

export function daysBetween(startIso, endIso) {
  const d1 = new Date(startIso + "T00:00:00");
  const d2 = new Date(endIso + "T00:00:00");
  return Math.round((d2 - d1) / 86400000);
}

// The `lean_mass` column in daily_metrics has a known unit bug upstream (kg
// sometimes lands where lbs is expected) — deriving it from weight + body fat
// is more reliable than trusting the stored value, and it's what the real
// weight number was itself back-computed from on days the raw sync failed.
export function deriveLeanMass(weightLb, bodyFatPct) {
  if (weightLb == null || bodyFatPct == null) return null;
  return weightLb * (1 - bodyFatPct / 100);
}

export function deriveFatMass(weightLb, bodyFatPct) {
  if (weightLb == null || bodyFatPct == null) return null;
  return weightLb * (bodyFatPct / 100);
}

// The inverse of projectGoal: given a starting weight, a goal weight, and
// the pace the person picked, projects the date they'd reach it. Onboarding
// uses this so the target date is always a consequence of a safe, bounded
// pace choice rather than something typed in freely — pairing a free-typed
// date with a free-typed goal weight is what used to let someone ask for
// "lose 30lb in a month," which only works via an unreasonable calorie
// target (see lib/onboardingNutrition.js's floor, which exists for the
// same reason).
export function projectEndDateFromPace(startWeightLb, goalWeightLb, pace) {
  const rate = PACE_RATE[pace];
  if (!rate || startWeightLb == null || goalWeightLb == null) return null;
  const deltaLb = Math.abs(goalWeightLb - startWeightLb);
  if (deltaLb === 0) return todayIso();
  const weeksNeeded = deltaLb / rate;
  return addDays(todayIso(), Math.round(weeksNeeded * 7));
}

// Projects a goal weight from the profile's goal/pace/end_date and the most
// recent real weigh-in.
export function projectGoal(profile, latestWeightLb) {
  if (!profile || latestWeightLb == null) return null;
  const rate = PACE_RATE[profile.pace];
  if (!rate || !profile.end_date) return null;
  const today = todayIso();
  const weeksLeft = weeksBetween(today, profile.end_date);
  if (weeksLeft <= 0) return null;
  const direction = profile.goal === "muscle" ? 1 : -1;
  const deltaLb = rate * weeksLeft * direction;
  return {
    weeksLeft: Math.round(weeksLeft),
    goalWeightLb: latestWeightLb + deltaLb,
    deltaLb,
    direction,
  };
}

// Required pace to hit the profile's goal_weight/goal_body_fat_pct by
// end_date, recalculated fresh from wherever the user actually is today —
// same idea the real dashboard uses ("recalculated today").
export function requiredPace(profile, latest) {
  if (!profile?.end_date || !latest?.weight || latest.body_fat == null) return null;
  const weeksLeft = weeksBetween(todayIso(), profile.end_date);
  if (weeksLeft <= 0) return null;

  const currentFat = deriveFatMass(latest.weight, latest.body_fat);
  const currentLean = deriveLeanMass(latest.weight, latest.body_fat);
  const goalWeight = profile.goal_weight;
  const goalBfPct = profile.goal_body_fat_pct;
  if (goalWeight == null || goalBfPct == null) return null;

  const goalFat = goalWeight * (goalBfPct / 100);
  const goalLean = goalWeight - goalFat;

  return {
    weeksLeft,
    fatLossPerWeek: (currentFat - goalFat) / weeksLeft,
    muscleGainPerWeek: (goalLean - currentLean) / weeksLeft,
    goalFat,
    goalLean,
    currentFat,
    currentLean,
  };
}

// A simple, honest trend: with too few real weigh-ins a slope is noise, so
// this returns { building: true } rather than inventing a rate — mirrors the
// real dashboard's "still building trend" state.
export function fatMassTrend(rows, minPoints = 7, windowDays = 21) {
  const withFat = rows
    .filter((r) => r.weight != null && r.body_fat != null)
    .map((r) => ({ date: r.date, fat: deriveFatMass(r.weight, r.body_fat) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  if (withFat.length < minPoints) return { building: true, count: withFat.length };

  const cutoff = addDays(withFat[withFat.length - 1].date, -windowDays);
  const windowed = withFat.filter((r) => r.date >= cutoff);
  const first = windowed[0];
  const last = windowed[windowed.length - 1];
  const weeks = weeksBetween(first.date, last.date) || 1 / 7;
  const perWeek = (first.fat - last.fat) / weeks;
  return { building: false, perWeek, count: withFat.length };
}

export function paceTag(actualPerWeek, requiredPerWeek) {
  if (actualPerWeek == null || requiredPerWeek == null || requiredPerWeek <= 0) return "nodata";
  const ratio = actualPerWeek / requiredPerWeek;
  if (ratio >= 1.1) return "ahead";
  if (ratio >= 0.85) return "ontrack";
  return "behind";
}

// A day counts as "on target" nutritionally if it's within the on-target
// band of the daily calorie target — a percentage band (Harry's own rule),
// not a fixed kcal tolerance, so it scales sensibly whether the target is
// 1,800 kcal or 2,800 kcal. Single source of truth — every page/coach that
// grades a day against its target should call this rather than rolling its
// own tolerance. bandPct defaults to 20 (i.e. 80-120%) but is a per-user
// setting (profiles.nutrition_band_pct) — pass it in wherever it's on hand.
export function isCalorieDayOnTarget(actualCal, targetCal, bandPct = 20) {
  if (actualCal == null || targetCal == null || targetCal <= 0) return false;
  const frac = bandPct / 100;
  return actualCal >= targetCal * (1 - frac) && actualCal <= targetCal * (1 + frac);
}

// Phase progress: three even phases from start_date to end_date, tracking
// fat-loss %, muscle-gain %, nutrition discipline % and training discipline %.
export function phaseProgress(profile, latest, nutritionDays, trainingDays) {
  if (!profile?.start_date || !profile?.end_date || !latest) return null;
  const { start_date, end_date, start_weight, start_body_fat_pct, start_lean_mass, goal_weight, goal_body_fat_pct } = profile;
  if ([start_weight, start_body_fat_pct, goal_weight, goal_body_fat_pct].some((v) => v == null)) return null;

  const startFat = start_weight * (start_body_fat_pct / 100);
  const startLean = start_lean_mass ?? deriveLeanMass(start_weight, start_body_fat_pct);
  const goalFat = goal_weight * (goal_body_fat_pct / 100);
  const goalLean = goal_weight - goalFat;

  const currentFat = deriveFatMass(latest.weight, latest.body_fat);
  const currentLean = deriveLeanMass(latest.weight, latest.body_fat);

  const fatSpan = startFat - goalFat;
  const leanSpan = goalLean - startLean;
  const fatLossPct = fatSpan > 0 ? ((startFat - currentFat) / fatSpan) * 100 : 0;
  const muscleGainPct = leanSpan !== 0 ? ((currentLean - startLean) / leanSpan) * 100 : 0;

  const nutritionPct = nutritionDays.total > 0 ? (nutritionDays.onTarget / nutritionDays.total) * 100 : 0;
  const trainingPct = trainingDays.total > 0 ? (trainingDays.done / trainingDays.total) * 100 : 0;

  const totalDays = Math.max(1, daysBetween(start_date, end_date));
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(start_date, todayIso())));
  const phaseLen = totalDays / 3;
  const phase1 = addDays(start_date, Math.round(phaseLen));
  const phase2 = addDays(start_date, Math.round(phaseLen * 2));

  return {
    fatLossPct, muscleGainPct, nutritionPct, trainingPct,
    elapsedPct: (elapsedDays / totalDays) * 100,
    milestones: { start: start_date, phase1, phase2, end: end_date },
  };
}

// Same fat-loss / muscle-gain % math as phaseProgress above, but computed for
// every check-in on record instead of just the latest reading — lets the
// Phase Progress chart plot real point-in-time measurements (which go up and
// down as water weight, cycles, measurement noise etc. move things around)
// instead of one straight interpolated line from start to today.
export function fatLeanProgressSeries(profile, metricsRows) {
  const { start_weight, start_body_fat_pct, start_lean_mass, goal_weight, goal_body_fat_pct } = profile || {};
  if ([start_weight, start_body_fat_pct, goal_weight, goal_body_fat_pct].some((v) => v == null)) return [];

  const startFat = start_weight * (start_body_fat_pct / 100);
  const startLean = start_lean_mass ?? deriveLeanMass(start_weight, start_body_fat_pct);
  const goalFat = goal_weight * (goal_body_fat_pct / 100);
  const goalLean = goal_weight - goalFat;
  const fatSpan = startFat - goalFat;
  const leanSpan = goalLean - startLean;

  return (metricsRows || [])
    .filter((r) => r.weight != null && r.body_fat != null)
    .map((r) => {
      const currentFat = deriveFatMass(r.weight, r.body_fat);
      const currentLean = deriveLeanMass(r.weight, r.body_fat);
      return {
        date: r.date,
        fatLossPct: fatSpan > 0 ? ((startFat - currentFat) / fatSpan) * 100 : 0,
        muscleGainPct: leanSpan !== 0 ? ((currentLean - startLean) / leanSpan) * 100 : 0,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
