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
//
// Every blurb below says WHY you'd pick that option over its siblings at the
// same day count, not just what it contains — the structure is visible from
// the day sequence shown underneath each card already.
export const SPLIT_TEMPLATES = {
  1: [
    { id: "full_body_1", label: "Full Body", blurb: "One session a week is all most schedules allow — this is the one to pick, since it's the only way to still hit every major muscle group.", days: ["Full Body"] },
  ],
  2: [
    { id: "full_body_2", label: "Full Body ×2", blurb: "Pick this for simplicity and frequency — every muscle gets trained twice, in two straightforward do-everything sessions.", days: ["Full Body", "Full Body"] },
    { id: "upper_lower_2", label: "Upper / Lower", blurb: "Pick this for more volume per muscle than Full Body ×2 — splitting the body in half means fewer exercises to fit in each session, so each one can go deeper.", days: ["Upper", "Lower"] },
  ],
  3: [
    { id: "full_body_3", label: "Full Body ×3", blurb: "The safest default if you're newer to training — frequent practice on the big compound lifts, with a rest day between most sessions to recover and learn the movements.", days: ["Full Body", "Full Body", "Full Body"] },
    { id: "upper_lower_full_3", label: "Upper / Lower / Full Body", blurb: "A middle ground between Full Body ×3 and Push/Pull/Legs — two more focused split days, plus a full-body day that tops up anything light on volume.", days: ["Upper", "Lower", "Full Body"] },
    { id: "ppl_3", label: "Push / Pull / Legs", blurb: "Pick this once Full Body starts feeling crowded — shorter, more focused sessions, at the cost of each muscle only getting trained once a week.", days: ["Push", "Pull", "Legs"] },
  ],
  4: [
    { id: "upper_lower_4", label: "Upper / Lower ×2", blurb: "The standard choice at 4 days — twice-weekly frequency on everything, which tends to build muscle faster than once-a-week splits at the same total weekly volume.", days: ["Upper", "Lower", "Upper", "Lower"] },
    { id: "ppl_upper_4", label: "Push / Pull / Legs / Upper", blurb: "Pick this if you want Push/Pull/Legs' sharper focus per session but still want chest, back, shoulders and arms trained twice a week.", days: ["Push", "Pull", "Legs", "Upper"] },
  ],
  5: [
    { id: "ppl_5", label: "Push / Pull / Legs", blurb: "The 3-way split stretched across 5 days by repeating Push and Pull a second time — more upper-body frequency, while legs stay at once a week (they need the longer recovery).", days: ["Push", "Pull", "Legs", "Push", "Pull"] },
    { id: "upper_lower_5", label: "Upper / Lower", blurb: "Upper/Lower run across 5 days with an extra Upper session — legs get two heavy lower-body days a week, while upper body gets three, easier to recover between since it's spread across more muscle groups.", days: ["Upper", "Lower", "Upper", "Lower", "Upper"] },
    { id: "bro_5", label: "Body-Part Split", blurb: "One all-out day per major muscle group — the classic \"bro split.\" Works best if you respond well to a lot of volume in one sitting rather than hitting a muscle more often.", days: ["Chest", "Back", "Legs", "Shoulders", "Arms"] },
  ],
  6: [
    { id: "ppl_6", label: "Push / Pull / Legs ×2", blurb: "Harry's own split — high frequency and high volume, with every muscle trained twice a week across two full PPL rotations. Suits someone who recovers well and wants to train hard most days.", days: ["Push", "Pull", "Legs", "Push", "Pull", "Legs"] },
    { id: "upper_lower_6", label: "Upper / Lower ×3", blurb: "Three rounds of Upper/Lower instead of two PPL rotations — higher frequency per muscle than Body-Part Split, and simpler to plan for than six different day types.", days: ["Upper", "Lower", "Upper", "Lower", "Upper", "Lower"] },
    { id: "bro_6", label: "Body-Part Split ×6", blurb: "A focused day per muscle group, plus a 6th day of lighter full-body work to pick up anything that needs more frequency. More day-to-day variety than PPL ×2, at the cost of training each muscle less often.", days: ["Chest", "Back", "Shoulders", "Legs", "Arms", "Full Body"] },
  ],
};

export function splitOptionsFor(daysPerWeek) {
  return SPLIT_TEMPLATES[daysPerWeek] || [];
}
