// Rough Compendium-of-Physical-Activities-style MET values per activity
// type, at three effort levels, for estimating a calorie burn from just
// duration + effort when there's no watch/heart-rate reading for a session
// — "extra activity" logged on top of the structured lifting plan (a class,
// a run, a hike, and so on). Generic over activity type rather than
// hardcoded to any one specific class, so it covers whatever someone
// actually does that day.
export const EXTRA_ACTIVITY_TYPES = [
  { key: "hiit_class", label: "HIIT / bootcamp class", met: { light: 6, moderate: 8, vigorous: 10 } },
  { key: "running", label: "Running", met: { light: 7, moderate: 9.8, vigorous: 12.8 } },
  { key: "cycling", label: "Cycling", met: { light: 4, moderate: 8, vigorous: 10 } },
  { key: "swimming", label: "Swimming", met: { light: 5, moderate: 7, vigorous: 10 } },
  { key: "rowing", label: "Rowing machine", met: { light: 4.8, moderate: 7, vigorous: 12 } },
  { key: "boxing", label: "Boxing / kickboxing", met: { light: 5.5, moderate: 7.8, vigorous: 10 } },
  { key: "dance", label: "Dance / Zumba", met: { light: 4, moderate: 6, vigorous: 8 } },
  { key: "elliptical", label: "Elliptical / cross-trainer", met: { light: 4.5, moderate: 6, vigorous: 8.5 } },
  { key: "hiking", label: "Hiking", met: { light: 4.5, moderate: 6, vigorous: 7.8 } },
  { key: "team_sport", label: "Team sport (football, tennis, basketball…)", met: { light: 5, moderate: 7, vigorous: 9 } },
  { key: "yoga_pilates", label: "Yoga / Pilates", met: { light: 2.5, moderate: 3, vigorous: 4 } },
  { key: "walking", label: "Walking", met: { light: 2.5, moderate: 3.5, vigorous: 5 } },
  { key: "other", label: "Other / general exercise", met: { light: 3.5, moderate: 5.5, vigorous: 7.5 } },
];

export const EFFORT_LEVELS = [
  { key: "light", label: "Light — could hold a conversation" },
  { key: "moderate", label: "Moderate — breathing hard" },
  { key: "vigorous", label: "Vigorous — all out" },
];

// Used only when there's no real weigh-in or profile start weight to go on
// at all — keeps the estimator from breaking rather than pretending to
// precision it doesn't have.
export const ASSUMED_BODYWEIGHT_KG = 75;

// kcal = MET × weight(kg) × hours. Returns a small ±10% band (not a single
// number) since this is an estimate standing in for a device reading, not
// one itself.
export function estimateExtraActivityKcal(activityKey, effortKey, minutes, weightKg) {
  const activity = EXTRA_ACTIVITY_TYPES.find((a) => a.key === activityKey);
  if (!activity || !minutes || minutes <= 0 || !weightKg) return null;
  const met = activity.met[effortKey] ?? activity.met.moderate;
  const kcal = met * weightKg * (minutes / 60);
  return {
    mid: Math.round(kcal),
    low: Math.max(0, Math.round((kcal * 0.9) / 5) * 5),
    high: Math.round((kcal * 1.1) / 5) * 5,
  };
}
