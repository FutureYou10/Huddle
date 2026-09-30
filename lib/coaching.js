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

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
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
