// A Spotify-Wrapped-style highlight reel: a handful of the most shareable
// stats from a week or month, computed from data already on hand (no new
// tables). Deliberately curated, not comprehensive — cards with nothing to
// celebrate are left out rather than shown as "—".
import { addDays, mondayOf, weekdayIndex } from "./coaching";
import { groupLogByExercise } from "./training";

// The most recent fully-elapsed Monday→Sunday week as of `today` — if today
// IS Sunday, that counts as the week's last day (ready to recap today).
export function latestCompletedWeek(today) {
  const end = weekdayIndex(today) === 6 ? today : addDays(mondayOf(today), -1);
  return { start: addDays(end, -6), end };
}

// The most recently fully-elapsed calendar month as of `today`.
export function latestCompletedMonth(today) {
  const [y, m] = today.split("-").map(Number);
  const firstOfThisMonth = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = addDays(firstOfThisMonth, -1); // last day of the previous month
  const [py, pm] = end.split("-").map(Number);
  const start = `${py}-${String(pm).padStart(2, "0")}-01`;
  return { start, end, key: `${py}-${String(pm).padStart(2, "0")}` };
}

function inRange(dateIso, start, end) {
  return dateIso >= start && dateIso <= end;
}

function biggestStrengthGain(fullWorkoutLogRows, rangeStart, rangeEnd) {
  const byExercise = groupLogByExercise(fullWorkoutLogRows); // Map(exercise -> sessions sorted newest-first)
  let best = null;
  for (const [exercise, sessions] of byExercise.entries()) {
    const idx = sessions.findIndex((s) => inRange(s.date, rangeStart, rangeEnd));
    if (idx === -1) continue;
    const recent = sessions[idx];
    const baseline = sessions[idx + 1];
    if (!baseline) continue;
    const recentTop = recent.sets[recent.sets.length - 1];
    const baselineTop = baseline.sets[baseline.sets.length - 1];
    if (!recentTop || !baselineTop || recentTop.weight_kg == null || baselineTop.weight_kg == null) continue;
    const deltaKg = Math.round((recentTop.weight_kg - baselineTop.weight_kg) * 100) / 100;
    if (deltaKg <= 0) continue;
    if (!best || deltaKg > best.deltaKg) {
      best = { exercise, deltaKg, fromKg: baselineTop.weight_kg, toKg: recentTop.weight_kg };
    }
  }
  return best;
}

// Builds the ordered set of recap cards for [rangeStart, rangeEnd] (inclusive
// ISO dates). Every input array can be the full multi-week set already
// loaded by the Overview page — this does its own date filtering.
export function buildRecap({ meals, metrics, workoutLog, sessions, calTarget, rangeStart, rangeEnd }) {
  const cards = [];

  const mealsInRange = (meals || []).filter((m) => inRange((m.logged_at || "").slice(0, 10), rangeStart, rangeEnd));
  const metricsInRange = (metrics || []).filter((m) => inRange(m.date, rangeStart, rangeEnd));
  const workoutLogInRange = (workoutLog || []).filter((r) => inRange(r.date, rangeStart, rangeEnd));
  const sessionsInRange = (sessions || []).filter((s) => inRange(s.date, rangeStart, rangeEnd));

  // Total volume lifted
  const totalVolumeKg = workoutLogInRange.reduce((sum, r) => sum + (Number(r.weight_kg) || 0) * (Number(r.reps) || 0), 0);
  if (totalVolumeKg > 0) {
    cards.push({
      icon: "🏋️", color: "var(--muscle)", title: "Total weight lifted",
      value: `${Math.round(totalVolumeKg).toLocaleString()}kg`,
      sub: "across every set logged",
    });
  }

  // Biggest strength gain
  const gain = biggestStrengthGain(workoutLog || [], rangeStart, rangeEnd);
  if (gain) {
    cards.push({
      icon: "📈", color: "var(--accent)", title: "Biggest strength gain",
      value: gain.exercise,
      sub: `${gain.fromKg}kg → ${gain.toKg}kg (+${gain.deltaKg}kg)`,
    });
  }

  // Sessions completed
  const sessionsDone = sessionsInRange.filter((s) => s.complete).length;
  if (sessionsDone > 0) {
    cards.push({
      icon: "✅", color: "var(--training)", title: "Training sessions completed",
      value: String(sessionsDone),
      sub: sessionsDone === 1 ? "session" : "sessions",
    });
  }

  // Most protein meal
  const proteinMeals = mealsInRange.filter((m) => m.protein_g != null);
  if (proteinMeals.length) {
    const best = proteinMeals.reduce((a, b) => (Number(b.protein_g) > Number(a.protein_g) ? b : a));
    cards.push({
      icon: "🥩", color: "var(--good)", title: "Highest-protein meal",
      value: `${Math.round(best.protein_g)}g`,
      sub: best.meal || best.description || "logged meal",
    });
  }

  // Avg calories vs target
  const calByDay = new Map();
  for (const m of mealsInRange) {
    const d = (m.logged_at || "").slice(0, 10);
    calByDay.set(d, (calByDay.get(d) || 0) + (Number(m.calories) || 0));
  }
  if (calByDay.size > 0) {
    const avgCal = Array.from(calByDay.values()).reduce((a, b) => a + b, 0) / calByDay.size;
    cards.push({
      icon: "🍽️", color: "var(--fat)", title: "Average daily calories",
      value: `${Math.round(avgCal).toLocaleString()}`,
      sub: calTarget != null ? `vs a ${Math.round(calTarget).toLocaleString()} target` : `across ${calByDay.size} logged day${calByDay.size === 1 ? "" : "s"}`,
    });
  }

  // Weight change over the period
  const withWeight = metricsInRange.filter((m) => m.weight != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (withWeight.length >= 2) {
    const delta = withWeight[withWeight.length - 1].weight - withWeight[0].weight;
    if (Math.abs(delta) >= 0.1) {
      cards.push({
        icon: delta < 0 ? "⬇️" : "⬆️", color: "var(--nutrition)", title: "Weight change",
        value: `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}lb`,
        sub: "over this period",
      });
    }
  }

  return cards;
}
