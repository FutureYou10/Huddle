// Day blueprints and split templates for the onboarding plan generator.
//
// A blueprint is an ordered list of slots for one kind of training day
// ("Push", "Legs", "Upper", ...). Each slot names a muscle + movement
// pattern (never a fixed exercise — lib/exerciseLibrary.pickExercise fills
// that in, which is what makes exclusions/substitution possible) plus a
// baseline set count and rep range, and a `level`: 1 = included even at
// Beginner, 2 = added at Intermediate, 3 = added at Advanced only. That one
// field is the entire volume-by-experience system — see
// lib/planGenerator.js's slotsForExperience/setsForExperience.
//
// The Push/Pull/Legs blueprints below are deliberately calibrated to
// reproduce Harry's own real, lived-in plan at the Intermediate level (7
// exercises/day, ~23-24 working sets/session) — he built it up from an
// earlier, lighter version until the volume felt right, so it's the one
// concrete "this amount of training is correct for an intermediate" data
// point this whole system has, and every other blueprint below was sized
// relative to it rather than to a generic textbook number.

export const DAY_BLUEPRINTS = {
  Push: [
    { muscle: "chest", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "shoulders", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "chest", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15, supersetGroup: "A" },
    { muscle: "shoulders", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15, supersetGroup: "A" },
    { muscle: "triceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15, supersetGroup: "B" },
    { muscle: "chest", pattern: "compound", level: 2, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "triceps", pattern: "isolation", level: 2, setsBase: 3, repMin: 10, repMax: 12, supersetGroup: "B" },
    { muscle: "shoulders", pattern: "isolation", level: 3, setsBase: 3, repMin: 12, repMax: 15 },
  ],
  Pull: [
    { muscle: "back", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "back", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "upper_back", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15, supersetGroup: "A" },
    { muscle: "biceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15, supersetGroup: "B" },
    { muscle: "biceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 10, repMax: 12, supersetGroup: "B" },
    { muscle: "back", pattern: "compound", level: 2, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "upper_back", pattern: "isolation", level: 2, setsBase: 3, repMin: 12, repMax: 15, supersetGroup: "A" },
    { muscle: "biceps", pattern: "isolation", level: 3, setsBase: 3, repMin: 10, repMax: 12 },
  ],
  Legs: [
    { muscle: "quads", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "hamstrings", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 10 },
    { muscle: "quads", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "calves", pattern: "isolation", level: 1, setsBase: 4, repMin: 12, repMax: 15, supersetGroup: "A" },
    { muscle: "hamstrings", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "quads", pattern: "compound", level: 2, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "quads", pattern: "isolation", level: 2, setsBase: 3, repMin: 10, repMax: 12, supersetGroup: "A" },
    { muscle: "abs", pattern: "isolation", level: 3, setsBase: 3, repMin: 12, repMax: 15 },
  ],
  Upper: [
    { muscle: "chest", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "back", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "shoulders", pattern: "compound", level: 1, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "biceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "triceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "back", pattern: "compound", level: 2, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "shoulders", pattern: "isolation", level: 2, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "upper_back", pattern: "isolation", level: 3, setsBase: 3, repMin: 12, repMax: 15 },
  ],
  Lower: [
    { muscle: "quads", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "hamstrings", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 10 },
    { muscle: "quads", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "calves", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "hamstrings", pattern: "isolation", level: 2, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "glutes", pattern: "compound", level: 2, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "abs", pattern: "isolation", level: 3, setsBase: 3, repMin: 12, repMax: 15 },
  ],
  "Full Body": [
    { muscle: "quads", pattern: "compound", level: 1, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "hamstrings", pattern: "compound", level: 1, setsBase: 3, repMin: 8, repMax: 10 },
    { muscle: "chest", pattern: "compound", level: 1, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "back", pattern: "compound", level: 1, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "shoulders", pattern: "isolation", level: 2, setsBase: 2, repMin: 12, repMax: 15 },
    { muscle: "biceps", pattern: "isolation", level: 2, setsBase: 2, repMin: 12, repMax: 15 },
    { muscle: "triceps", pattern: "isolation", level: 3, setsBase: 2, repMin: 12, repMax: 15 },
    { muscle: "abs", pattern: "isolation", level: 3, setsBase: 2, repMin: 12, repMax: 15 },
  ],
  Chest: [
    { muscle: "chest", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "chest", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "chest", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "triceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "chest", pattern: "compound", level: 2, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "chest", pattern: "isolation", level: 2, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "triceps", pattern: "isolation", level: 3, setsBase: 3, repMin: 10, repMax: 12 },
  ],
  Back: [
    { muscle: "back", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "back", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "upper_back", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "biceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "back", pattern: "compound", level: 2, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "biceps", pattern: "isolation", level: 2, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "upper_back", pattern: "isolation", level: 3, setsBase: 3, repMin: 12, repMax: 15 },
  ],
  Shoulders: [
    { muscle: "shoulders", pattern: "compound", level: 1, setsBase: 4, repMin: 8, repMax: 12 },
    { muscle: "shoulders", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "upper_back", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "shoulders", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "shoulders", pattern: "compound", level: 2, setsBase: 3, repMin: 8, repMax: 12 },
    { muscle: "upper_back", pattern: "isolation", level: 2, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "shoulders", pattern: "isolation", level: 3, setsBase: 3, repMin: 12, repMax: 15 },
  ],
  Arms: [
    { muscle: "biceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "triceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "biceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "triceps", pattern: "isolation", level: 1, setsBase: 3, repMin: 12, repMax: 15 },
    { muscle: "biceps", pattern: "isolation", level: 2, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "triceps", pattern: "isolation", level: 2, setsBase: 3, repMin: 10, repMax: 12 },
    { muscle: "biceps", pattern: "isolation", level: 3, setsBase: 2, repMin: 12, repMax: 15 },
    { muscle: "triceps", pattern: "isolation", level: 3, setsBase: 2, repMin: 12, repMax: 15 },
  ],
};

// Keyed by days/week -> a small menu of named styles, exactly matching
// Harry's "give them the option" answer rather than silently auto-picking
// one. `days` lists the blueprint for each training day in the week, in
// order — its length always equals the days/week key it lives under.
export const SPLIT_TEMPLATES = {
  1: [{ id: "full_body_1", label: "Full Body", blurb: "One complete session hitting everything.", days: ["Full Body"] }],
  2: [
    { id: "full_body_2", label: "Full Body ×2", blurb: "Two complete full-body sessions.", days: ["Full Body", "Full Body"] },
    { id: "upper_lower_2", label: "Upper / Lower", blurb: "One upper-body day, one lower-body day.", days: ["Upper", "Lower"] },
  ],
  3: [
    { id: "full_body_3", label: "Full Body ×3", blurb: "A classic, well-tested beginner-to-intermediate split.", days: ["Full Body", "Full Body", "Full Body"] },
    { id: "ppl_3", label: "Push / Pull / Legs", blurb: "Each muscle group trained once, with sharper focus per session.", days: ["Push", "Pull", "Legs"] },
  ],
  4: [
    { id: "upper_lower_4", label: "Upper / Lower ×2", blurb: "Every muscle group trained twice a week.", days: ["Upper", "Lower", "Upper", "Lower"] },
    { id: "ppl_upper_4", label: "Push / Pull / Legs / Upper", blurb: "Full push/pull/legs split plus an extra upper-body day.", days: ["Push", "Pull", "Legs", "Upper"] },
  ],
  5: [
    { id: "ppl_ul_5", label: "Push / Pull / Legs / Upper / Lower", blurb: "A fuller week without doubling anything up.", days: ["Push", "Pull", "Legs", "Upper", "Lower"] },
    { id: "bro_5", label: "Body-Part Split", blurb: "One focused day per major muscle group.", days: ["Chest", "Back", "Legs", "Shoulders", "Arms"] },
  ],
  6: [
    { id: "ppl_6", label: "Push / Pull / Legs ×2", blurb: "Harry's own split — each muscle group trained twice a week.", days: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"] },
    { id: "bro_6", label: "Body-Part Split ×6", blurb: "A focused day per muscle group, plus a full-body top-up.", days: ["Chest", "Back", "Shoulders", "Legs", "Arms", "Full Body"] },
  ],
};

export function splitOptionsFor(daysPerWeek) {
  return SPLIT_TEMPLATES[daysPerWeek] || [];
}
