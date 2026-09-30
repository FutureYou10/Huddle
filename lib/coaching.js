// Shared coaching math — mirrors the projection logic from the "Meet Your Team"
// onboarding prototype, adapted to work off a real profile + real weigh-ins
// instead of onboarding form answers.

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

export function fmtDate(iso) {
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

export function weeksBetween(startIso, endIso) {
  const d1 = new Date(startIso + "T00:00:00");
  const d2 = new Date(endIso + "T00:00:00");
  return Math.max(0, (d2 - d1) / (7 * 86400000));
}

// Projects a goal weight from the profile's goal/pace/end_date and the most recent
// real weigh-in — same idea as the onboarding's projectedOutcome(), but driven by
// actual tracked data instead of a form answer.
export function projectGoal(profile, latestWeightLb) {
  if (!profile || latestWeightLb == null) return null;
  const rate = PACE_RATE[profile.pace];
  if (!rate || !profile.end_date) return null;
  const today = new Date().toISOString().slice(0, 10);
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
