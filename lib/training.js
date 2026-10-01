// Lifting-specific logic: the pyramid rep/weight ramp, superset grouping, and
// progressive-overload detection. Generic over whatever workout_plan rows are
// passed in — no user-specific branching.

export function pyramidTargets(ex) {
  const n = ex.target_sets || 1;
  const repMin = ex.rep_min ?? 8;
  const repMax = ex.rep_max ?? 12;
  const range = repMax - repMin;
  const stepBase = ex.lift_type === "compound" ? 2.5 : 1.25;
  const weight0 = ex.current_working_weight_kg || 0;

  let reps, pct;
  if (n <= 1) { reps = [repMax]; pct = [100]; }
  else if (n === 2) { reps = [repMax, repMin]; pct = [85, 100]; }
  else if (n === 3) { reps = [repMax, Math.round((repMax + repMin) / 2), repMin]; pct = [75, 90, 100]; }
  else {
    const mid = Math.max(repMin, repMax - Math.round(range / 2));
    reps = [repMax]; pct = [70];
    for (let s = 1; s < n - 1; s++) { reps.push(mid); pct.push(90); }
    reps.push(repMin); pct.push(100);
  }
  return reps.map((r, i) => {
    let weight = weight0 * (pct[i] / 100);
    weight = Math.round(weight / stepBase) * stepBase;
    return { reps: r, weight };
  });
}

export function stepSizeFor(ex) {
  return ex.lift_type === "compound" ? 2.5 : 1.25;
}

// Groups a day's exercises (already ordered by order_index) into
// superset blocks, same shape the real Training Dashboard renders.
export function groupSupersets(exercises) {
  const blocks = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.superset_group) {
      const group = [ex];
      let j = i + 1;
      while (j < exercises.length && exercises[j].superset_group === ex.superset_group) { group.push(exercises[j]); j++; }
      blocks.push({ type: "superset", tag: ex.superset_group, exercises: group });
      i = j;
    } else {
      blocks.push({ type: "single", exercises: [ex] });
      i++;
    }
  }
  return blocks;
}

// logByExercise: Map(exercise name -> sessions sorted newest-first),
// each session {date, sets:[{weight_kg, reps, set_number}]} sorted by set_number.
export function computeOverloadFlags(plan, logByExercise) {
  const flags = [];
  for (const ex of plan) {
    const sessions = logByExercise.get(ex.exercise) || [];
    if (sessions.length < 2) continue;
    const targets = pyramidTargets(ex);
    const topTarget = targets[targets.length - 1];
    const last2Tops = sessions.slice(0, 2).map((s) => s.sets[s.sets.length - 1]);
    const bothAtTop = last2Tops.every((top) => top && Number(top.weight_kg) === Number(ex.current_working_weight_kg) && Number(top.reps) >= topTarget.reps);
    if (bothAtTop) {
      const bump = stepSizeFor(ex);
      flags.push({
        planId: ex.id,
        exercise: ex.exercise,
        dayType: ex.day_type,
        current: ex.current_working_weight_kg,
        suggested: Math.round((ex.current_working_weight_kg + bump) * 100) / 100,
      });
    }
  }
  return flags;
}

// The heaviest single set ever logged for an exercise, across every set in
// every session on record — the number to beat next time this exercise comes
// up (Harry: "the top weight exercises... maximum weight for exercise in
// order to push me on the next time I revisit the exercise").
export function maxWeightForExercise(hist) {
  let best = null;
  for (const session of hist || []) {
    for (const set of session.sets || []) {
      if (set.weight_kg == null) continue;
      if (!best || set.weight_kg > best.weight_kg) {
        best = { weight_kg: set.weight_kg, reps: set.reps, date: session.date };
      }
    }
  }
  return best;
}

// Epley estimated 1RM for a single set — lets a trend account for reps as
// well as weight, so more reps at the same weight still reads as progress
// and a heavier set with fewer reps isn't automatically counted as one.
function estOneRepMax(set) {
  if (!set || set.weight_kg == null || set.reps == null) return null;
  return set.weight_kg * (1 + set.reps / 30);
}

// % change in estimated 1RM (top set) between the two most recent sessions
// for an exercise — the Strength Scoreboard's "getting better each time"
// indicator. null when there's no prior session yet to compare against.
export function strengthTrendPct(hist) {
  if (!hist || hist.length < 2) return null;
  const latestE1RM = estOneRepMax(hist[0]?.sets?.[hist[0].sets.length - 1]);
  const prevE1RM = estOneRepMax(hist[1]?.sets?.[hist[1].sets.length - 1]);
  if (latestE1RM == null || prevE1RM == null || prevE1RM === 0) return null;
  return ((latestE1RM - prevE1RM) / prevE1RM) * 100;
}

// A deterministic, one-sentence "last time" note per exercise — not a live
// coach call (too slow/costly to run per exercise on page load), just what a
// PT glancing at your last session would say before you load the bar: beat
// it, chase the target, or ease in if the working weight's moved since then.
export function lastTimeNote(ex, history) {
  if (!history || !history.length) {
    return "First time logging this one — get a feel for the weight and log exactly what you hit.";
  }
  const targets = pyramidTargets(ex);
  const topTarget = targets[targets.length - 1];
  const lastTop = history[0]?.sets?.[history[0].sets.length - 1];
  if (!lastTop || lastTop.weight_kg == null || lastTop.reps == null) {
    return "No clean top-set number from last time — log the weight and reps today so there's something to build on.";
  }

  const current = Number(ex.current_working_weight_kg);
  const lastWeight = Number(lastTop.weight_kg);
  const sameWeight = Number.isFinite(current) && lastWeight === current;
  const hitTarget = topTarget && lastTop.reps >= topTarget.reps;

  if (sameWeight && hitTarget) {
    return `Last time you hit ${lastTop.weight_kg}kg × ${lastTop.reps} on the top set — try to beat that today, even by a rep.`;
  }
  if (sameWeight && !hitTarget) {
    const short = topTarget ? topTarget.reps - lastTop.reps : 0;
    return short > 0
      ? `Last time you were ${short} rep${short === 1 ? "" : "s"} short of target at ${lastTop.weight_kg}kg — same weight again, chase those reps.`
      : `Last time was ${lastTop.weight_kg}kg × ${lastTop.reps} — match or beat that today.`;
  }
  if (Number.isFinite(current) && lastWeight < current) {
    return `Working weight's gone up since last time (${lastTop.weight_kg}kg → ${current}kg) — ease into the top set and see how it feels.`;
  }
  if (Number.isFinite(current) && lastWeight > current) {
    return `Working weight's eased back since last time (${lastTop.weight_kg}kg → ${current}kg) — take it steady and build back up.`;
  }
  return `Last time you hit ${lastTop.weight_kg}kg × ${lastTop.reps} on the top set — build on that today.`;
}

// Builds { exerciseName -> [{date, sets:[...]}, ...] } sorted newest first,
// from flat workout_log rows.
export function groupLogByExercise(logRows) {
  const byDate = new Map();
  for (const row of logRows) {
    const key = `${row.date}|${row.exercise}`;
    if (!byDate.has(key)) byDate.set(key, { date: row.date, exercise: row.exercise, sets: [] });
    byDate.get(key).sets.push(row);
  }
  const byExercise = new Map();
  for (const entry of byDate.values()) {
    entry.sets.sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
    if (!byExercise.has(entry.exercise)) byExercise.set(entry.exercise, []);
    byExercise.get(entry.exercise).push(entry);
  }
  for (const list of byExercise.values()) list.sort((a, b) => (a.date < b.date ? 1 : -1));
  return byExercise;
}
