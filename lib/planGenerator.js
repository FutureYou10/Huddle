// Turns onboarding's answers (days/week, split style, experience, exercises
// to avoid, rest days) into the two things a real plan needs:
// profiles.training_split (weekday -> day_type) and a full set of
// workout_plan rows (one per exercise). Nothing here is Harry-specific —
// the Push/Pull/Legs blueprints happen to reproduce his real numbers at
// "Intermediate" because that's the one proven data point available (see
// splitTemplates.js), but the generator itself takes the same inputs for
// anyone.

import { pickExercise } from "./exerciseLibrary";
import { DAY_BLUEPRINTS, SPLIT_TEMPLATES } from "./splitTemplates";

const LEVEL_FOR_EXPERIENCE = { beginner: 1, intermediate: 2, advanced: 3 };

function setsFor(slot, experience) {
  if (experience === "beginner") return Math.max(2, slot.setsBase - 1);
  if (experience === "advanced") return slot.pattern === "compound" ? slot.setsBase + 1 : slot.setsBase;
  return slot.setsBase;
}

// Distinct day_type names for one split: a blueprint used only once keeps
// its plain name ("Legs"); one used more than once (the two "Push / Pull /
// Legs ×2" halves) gets " A" / " B" suffixes, same convention as Harry's
// own hand-built plan.
export function dayTypeNamesFor(split) {
  const totalOf = {};
  for (const name of split.days) totalOf[name] = (totalOf[name] || 0) + 1;
  const seenSoFar = {};
  return split.days.map((name) => {
    if (totalOf[name] === 1) return name;
    seenSoFar[name] = (seenSoFar[name] || 0) + 1;
    return `${name} ${String.fromCharCode(64 + seenSoFar[name])}`; // A, B, C...
  });
}

// Builds the exercises for every training day in a split at a given
// experience level — used both for the final generate step and for the
// wizard's live "here's what this looks like" preview, so the two can never
// drift apart.
export function previewPlanDays({ daysPerWeek, splitId, experience, excludedNames }) {
  const split = (SPLIT_TEMPLATES[daysPerWeek] || []).find((t) => t.id === splitId) || (SPLIT_TEMPLATES[daysPerWeek] || [])[0];
  if (!split) return [];
  const maxLevel = LEVEL_FOR_EXPERIENCE[experience] || 2;
  const excludedLower = new Set((excludedNames || []).map((n) => n.trim().toLowerCase()).filter(Boolean));
  const dayTypeNames = dayTypeNamesFor(split);

  // How many times this exact blueprint has already appeared, so the 2nd+
  // occurrence (e.g. "Push B") is nudged toward different exercises than
  // the 1st, rather than silently repeating the same session twice.
  const occurrenceSoFar = {};

  return split.days.map((blueprintName, i) => {
    const dayTypeName = dayTypeNames[i];
    const variantOffset = occurrenceSoFar[blueprintName] || 0;
    occurrenceSoFar[blueprintName] = variantOffset + 1;

    const blueprint = DAY_BLUEPRINTS[blueprintName] || [];
    const usedIds = new Set();
    const exercises = [];
    let orderIndex = 0;

    for (const slot of blueprint.filter((s) => s.level <= maxLevel)) {
      const picked = pickExercise({ muscle: slot.muscle, pattern: slot.pattern, excludedLower, usedIds, variantOffset });
      if (!picked) continue; // the library should always have a candidate, but never crash onboarding over it
      usedIds.add(picked.id);
      orderIndex += 1;
      exercises.push({
        exercise: picked.name,
        lift_type: slot.pattern,
        target_sets: setsFor(slot, experience),
        rep_min: slot.repMin,
        rep_max: slot.repMax,
        order_index: orderIndex,
        superset_group: slot.supersetGroup || null,
      });
    }

    const totalSets = exercises.reduce((s, e) => s + e.target_sets, 0);
    return { dayType: dayTypeName, blueprintName, exercises, totalSets };
  });
}

// Full generate: the same per-day exercises as previewPlanDays, plus the
// weekday -> day_type mapping, flattened into insert-ready workout_plan rows.
export function generatePlan({ daysPerWeek, splitId, experience, excludedNames, restWeekdays }) {
  const days = previewPlanDays({ daysPerWeek, splitId, experience, excludedNames });

  const trainingSplit = {};
  let pointer = 0;
  for (let weekday = 0; weekday < 7; weekday++) {
    if (restWeekdays.includes(weekday)) {
      trainingSplit[String(weekday)] = "Rest";
    } else {
      trainingSplit[String(weekday)] = days[pointer % days.length]?.dayType || "Rest";
      pointer += 1;
    }
  }

  const workoutPlanRows = [];
  for (const day of days) {
    for (const ex of day.exercises) {
      workoutPlanRows.push({ day_type: day.dayType, ...ex });
    }
  }

  return { trainingSplit, workoutPlanRows, days };
}
