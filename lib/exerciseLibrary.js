// The exercise pool the onboarding plan-generator picks from. Every entry is
// tagged with the muscle it trains and whether it's a compound or isolation
// lift (matching workout_plan.lift_type) — that (muscle, pattern) pair is
// the whole substitution model: "auto-swap for a similar alternative" just
// means "pick the next-best exercise with the same tag that isn't excluded
// or already used today."
//
// `tier` is preference order within a (muscle, pattern) group — lower goes
// first. It's what lets the generator give a split's "B" day a genuinely
// different primary lift than its "A" day (see pickExercise's variantOffset)
// instead of silently repeating the same exercise twice a week.

export const EXERCISES = [
  // Chest
  { id: "barbell_bench_press", name: "Barbell bench press", muscle: "chest", pattern: "compound", tier: 1 },
  { id: "incline_barbell_press", name: "Incline barbell press", muscle: "chest", pattern: "compound", tier: 2 },
  { id: "incline_dumbbell_press", name: "Incline dumbbell press", muscle: "chest", pattern: "compound", tier: 3 },
  { id: "flat_dumbbell_press", name: "Flat dumbbell press", muscle: "chest", pattern: "compound", tier: 4 },
  { id: "weighted_dips", name: "Weighted dips", muscle: "chest", pattern: "compound", tier: 5 },
  { id: "machine_chest_press", name: "Machine chest press", muscle: "chest", pattern: "compound", tier: 6 },
  { id: "cable_fly", name: "Cable fly", muscle: "chest", pattern: "isolation", tier: 1 },
  { id: "pec_deck", name: "Pec deck", muscle: "chest", pattern: "isolation", tier: 2 },
  { id: "dumbbell_fly", name: "Dumbbell fly", muscle: "chest", pattern: "isolation", tier: 3 },

  // Shoulders (front/side delts)
  { id: "seated_overhead_press", name: "Seated overhead press", muscle: "shoulders", pattern: "compound", tier: 1 },
  { id: "seated_db_shoulder_press", name: "Seated dumbbell shoulder press", muscle: "shoulders", pattern: "compound", tier: 2 },
  { id: "standing_barbell_press", name: "Standing barbell press", muscle: "shoulders", pattern: "compound", tier: 3 },
  { id: "arnold_press", name: "Arnold press", muscle: "shoulders", pattern: "compound", tier: 4 },
  { id: "machine_shoulder_press", name: "Machine shoulder press", muscle: "shoulders", pattern: "compound", tier: 5 },
  { id: "lateral_raise", name: "Lateral raise", muscle: "shoulders", pattern: "isolation", tier: 1 },
  { id: "cable_lateral_raise", name: "Cable lateral raise", muscle: "shoulders", pattern: "isolation", tier: 2 },
  { id: "front_raise", name: "Front raise", muscle: "shoulders", pattern: "isolation", tier: 3 },

  // Upper back / rear delts (the "pull accessory" group — rows live under back)
  { id: "rear_delt_fly", name: "Rear delt fly", muscle: "upper_back", pattern: "isolation", tier: 1 },
  { id: "face_pull", name: "Face pull", muscle: "upper_back", pattern: "isolation", tier: 2 },
  { id: "reverse_pec_deck", name: "Reverse pec deck", muscle: "upper_back", pattern: "isolation", tier: 3 },

  // Traps
  { id: "dumbbell_shrug", name: "Dumbbell shrug", muscle: "traps", pattern: "isolation", tier: 1 },
  { id: "barbell_shrug", name: "Barbell shrug", muscle: "traps", pattern: "isolation", tier: 2 },
  { id: "cable_shrug", name: "Cable shrug", muscle: "traps", pattern: "isolation", tier: 3 },

  // Triceps
  { id: "cable_tricep_pushdown", name: "Cable tricep pushdown", muscle: "triceps", pattern: "isolation", tier: 1 },
  { id: "overhead_tricep_extension", name: "Overhead tricep extension", muscle: "triceps", pattern: "isolation", tier: 2 },
  { id: "ezbar_skull_crusher", name: "EZ-bar skull crusher", muscle: "triceps", pattern: "isolation", tier: 3 },
  { id: "dumbbell_kickback", name: "Dumbbell kickback", muscle: "triceps", pattern: "isolation", tier: 4 },

  // Back
  { id: "bentover_row", name: "Bent-over barbell row", muscle: "back", pattern: "compound", tier: 1 },
  { id: "lat_pulldown", name: "Lat pulldown", muscle: "back", pattern: "compound", tier: 2 },
  { id: "seated_cable_row", name: "Seated cable row", muscle: "back", pattern: "compound", tier: 3 },
  { id: "weighted_pullup", name: "Weighted pull-up", muscle: "back", pattern: "compound", tier: 4 },
  { id: "single_arm_db_row", name: "Single-arm dumbbell row", muscle: "back", pattern: "compound", tier: 5 },
  { id: "cable_row_wide", name: "Cable seated row (wide grip)", muscle: "back", pattern: "compound", tier: 6 },
  { id: "tbar_row", name: "T-bar row", muscle: "back", pattern: "compound", tier: 7 },
  { id: "chest_supported_row", name: "Chest-supported row", muscle: "back", pattern: "compound", tier: 8 },
  { id: "machine_row", name: "Machine row", muscle: "back", pattern: "compound", tier: 9 },

  // Biceps
  { id: "db_bicep_curl", name: "Dumbbell bicep curl", muscle: "biceps", pattern: "isolation", tier: 1 },
  { id: "hammer_curl", name: "Hammer curl", muscle: "biceps", pattern: "isolation", tier: 2 },
  { id: "ezbar_curl", name: "EZ-bar curl", muscle: "biceps", pattern: "isolation", tier: 3 },
  { id: "cable_curl", name: "Cable curl", muscle: "biceps", pattern: "isolation", tier: 4 },
  { id: "preacher_curl", name: "Preacher curl", muscle: "biceps", pattern: "isolation", tier: 5 },

  // Quads
  { id: "barbell_back_squat", name: "Barbell back squat", muscle: "quads", pattern: "compound", tier: 1 },
  { id: "front_or_hack_squat", name: "Front squat or hack squat", muscle: "quads", pattern: "compound", tier: 2 },
  { id: "leg_press", name: "Leg press", muscle: "quads", pattern: "compound", tier: 3 },
  { id: "bulgarian_split_squat", name: "Bulgarian split squat", muscle: "quads", pattern: "compound", tier: 4 },
  { id: "goblet_squat", name: "Goblet squat", muscle: "quads", pattern: "compound", tier: 5 },
  { id: "front_squat", name: "Front squat", muscle: "quads", pattern: "compound", tier: 6 },
  { id: "hack_squat", name: "Hack squat", muscle: "quads", pattern: "compound", tier: 7 },
  { id: "smith_machine_squat", name: "Smith machine squat", muscle: "quads", pattern: "compound", tier: 8 },
  { id: "leg_extension", name: "Leg extension", muscle: "quads", pattern: "isolation", tier: 1 },
  { id: "walking_lunges", name: "Walking lunges", muscle: "quads", pattern: "isolation", tier: 2 },
  { id: "step_ups", name: "Step-ups", muscle: "quads", pattern: "isolation", tier: 3 },

  // Hamstrings
  { id: "romanian_deadlift", name: "Romanian deadlift", muscle: "hamstrings", pattern: "compound", tier: 1 },
  { id: "conventional_deadlift", name: "Conventional deadlift", muscle: "hamstrings", pattern: "compound", tier: 2 },
  { id: "good_morning", name: "Good morning", muscle: "hamstrings", pattern: "compound", tier: 3 },
  { id: "dumbbell_rdl", name: "Dumbbell Romanian deadlift", muscle: "hamstrings", pattern: "compound", tier: 4 },
  { id: "seated_leg_curl", name: "Seated leg curl", muscle: "hamstrings", pattern: "isolation", tier: 1 },
  { id: "lying_leg_curl", name: "Lying leg curl", muscle: "hamstrings", pattern: "isolation", tier: 2 },
  { id: "nordic_curl", name: "Nordic curl", muscle: "hamstrings", pattern: "isolation", tier: 3 },

  // Glutes
  { id: "hip_thrust", name: "Hip thrust", muscle: "glutes", pattern: "compound", tier: 1 },
  { id: "glute_bridge", name: "Glute bridge", muscle: "glutes", pattern: "compound", tier: 2 },
  { id: "cable_glute_kickback", name: "Cable glute kickback", muscle: "glutes", pattern: "isolation", tier: 1 },
  { id: "hip_abduction_machine", name: "Hip abduction machine", muscle: "glutes", pattern: "isolation", tier: 2 },

  // Calves
  { id: "standing_calf_raise", name: "Standing calf raise", muscle: "calves", pattern: "isolation", tier: 1 },
  { id: "seated_calf_raise", name: "Seated calf raise", muscle: "calves", pattern: "isolation", tier: 2 },
  { id: "leg_press_calf_raise", name: "Leg press calf raise", muscle: "calves", pattern: "isolation", tier: 3 },

  // Abs
  { id: "hanging_leg_raise", name: "Hanging leg raise", muscle: "abs", pattern: "isolation", tier: 1 },
  { id: "cable_crunch", name: "Cable crunch", muscle: "abs", pattern: "isolation", tier: 2 },
  { id: "ab_wheel_rollout", name: "Ab wheel rollout", muscle: "abs", pattern: "isolation", tier: 3 },
];

// Finds the best exercise for a (muscle, pattern) slot that isn't excluded
// and isn't already used elsewhere in the same session — this one function
// is both "pick the normal exercise for this slot" (variantOffset 0) and
// "swap this excluded/duplicate one for a similar alternative" (same
// filters, just starting further down the tier order), so there's no
// separate substitution code path to keep in sync.
export function pickExercise({ muscle, pattern, excludedLower, usedIds, variantOffset = 0 }) {
  const isUsable = (e) => !excludedLower?.has(e.name.toLowerCase()) && !usedIds?.has(e.id);

  const sameGroup = EXERCISES.filter((e) => e.muscle === muscle && e.pattern === pattern && isUsable(e)).sort((a, b) => a.tier - b.tier);
  if (sameGroup.length) return sameGroup[variantOffset % sameGroup.length];

  // Nothing left with the same pattern (e.g. every isolation option for this
  // muscle is excluded) — broaden to the same muscle, any pattern, rather
  // than leaving the slot empty.
  const sameMuscle = EXERCISES.filter((e) => e.muscle === muscle && isUsable(e)).sort((a, b) => a.tier - b.tier);
  if (sameMuscle.length) return sameMuscle[variantOffset % sameMuscle.length];

  return null;
}

export function findByName(name) {
  const lower = (name || "").trim().toLowerCase();
  return EXERCISES.find((e) => e.name.toLowerCase() === lower) || null;
}

// Resolves a workout_plan exercise name to its library entry. A few plan rows
// were generated as "X or Y" (e.g. "Front squat or hack squat"); those fall
// back to the first half that is in the library so they still know their muscle.
export function resolveExercise(name) {
  const exact = findByName(name);
  if (exact) return exact;
  for (const part of (name || "").split(/\s+or\s+/i)) {
    const hit = findByName(part);
    if (hit) return hit;
  }
  return null;
}

// What a Swap button cycles through for a planned exercise: the original
// first, then every other exercise that trains the same muscle with the same
// pattern (compound for compound, isolation for isolation), best-tier first.
// `takenLower` is the set of lower-cased names already in today's session, so
// a swap never doubles an exercise up. Combined "X or Y" library names are
// skipped — they're covered by their separate entries.
export function swapOptions(originalName, takenLower) {
  const base = resolveExercise(originalName);
  if (!base) return [originalName];
  const alts = EXERCISES
    .filter((e) => e.muscle === base.muscle && e.pattern === base.pattern)
    .filter((e) => !/\sor\s/i.test(e.name))
    .filter((e) => e.name.toLowerCase() !== (originalName || "").toLowerCase())
    .filter((e) => !takenLower?.has(e.name.toLowerCase()))
    .sort((a, b) => a.tier - b.tier)
    .map((e) => e.name);
  return [originalName, ...alts];
}
