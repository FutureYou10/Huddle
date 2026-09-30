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
