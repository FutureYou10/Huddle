// Day-one nutrition targets, generated at the end of onboarding so there's
// something real in weekly_targets before the first Weekly Recalibration
// has a week of logged data to work from (same gap WeighInCard closed for
// daily_metrics). Deliberately reuses the Katch-McArdle/bootstrap-BMR
// methodology from lib/weeklyRecalibration.js rather than inventing a
// second formula — the only real difference is that recalibration looks at
// a week of real activity data for its add-on, and onboarding has none yet,
// so it asks one quick lifestyle question instead and uses a flat add-on
// banded off that answer.

import { deriveLeanMass, PACE_RATE } from "./coaching";

const FLAT_ACTIVITY_FALLBACK = 450; // same default as lib/weeklyRecalibration.js

export const ACTIVITY_LEVELS = {
  sedentary: { label: "Mostly sitting (desk job, little daily movement)", addOnKcal: 300 },
  light: { label: "On your feet sometimes (some walking, light daily activity)", addOnKcal: 450 },
  moderate: { label: "Active job or routine (regularly on the move)", addOnKcal: 600 },
  active: { label: "Very active (physical job, lots of daily movement)", addOnKcal: 750 },
};

function katchMcArdleBmr(leanMassLb) {
  const leanMassKg = leanMassLb * 0.453592;
  return 370 + 21.6 * leanMassKg;
}

function bootstrapBmr(weightLb, heightCm, sex, dob) {
  const weightKg = weightLb * 0.453592;
  let age = 35;
  if (dob) {
    const ms = new Date().getTime() - new Date(dob + "T00:00:00").getTime();
    age = Math.floor(ms / (365.25 * 86400000));
  }
  const sexTerm = sex === "female" ? -161 : sex === "male" ? 5 : -78;
  return 10 * weightKg + 6.25 * (heightCm || 170) - 5 * age + sexTerm;
}

// weightLb/bodyFatPct should be what's being logged as today's weigh-in
// (and start_weight/start_body_fat_pct) during onboarding.
export function estimateDayOneTargets({ weightLb, bodyFatPct, heightCm, sex, dob, goal, pace, activityLevel }) {
  const leanMassLb = deriveLeanMass(weightLb, bodyFatPct);
  const usingLeanMass = leanMassLb != null;
  const bmr = usingLeanMass ? katchMcArdleBmr(leanMassLb) : bootstrapBmr(weightLb, heightCm, sex, dob);

  const activityAddOn = ACTIVITY_LEVELS[activityLevel]?.addOnKcal ?? FLAT_ACTIVITY_FALLBACK;
  const tdee = bmr + activityAddOn;

  // Same direction rule as lib/coaching.js's projectGoal: only an explicit
  // muscle-gain goal points at a surplus — fat loss and recomposition both
  // run a deficit (recomp still needs one to free up the fat it's trading
  // for muscle; Harry's own profile is goal="recomp" with a loss-direction
  // pace, which is exactly this case).
  const direction = goal === "muscle" ? 1 : -1;
  const rate = PACE_RATE[pace] || 0;
  const dailyDeltaKcal = ((rate * 3500) / 7) * direction;

  // A floor against an unreasonably low target from stacking a small body
  // weight with an aggressive pace — never recommend less than ~85% of BMR
  // or 1200 kcal, whichever is higher. Surfaced as floorApplied rather than
  // left for someone to notice only by doing the arithmetic themselves —
  // the gap between "what the pace implies" and "what we actually gave you"
  // is exactly the kind of thing that reads as a bug if it isn't explained
  // (a 2 lb/week pace at a real, Katch-McArdle-derived BMR is a common way
  // to hit this: the straight math wants well under the floor).
  const naiveTarget = Math.round(tdee + dailyDeltaKcal);
  const floor = Math.max(1200, Math.round(bmr * 0.85));
  const floorApplied = naiveTarget < floor;
  const dailyCalorieTarget = Math.max(floor, naiveTarget);

  const proteinG = Math.round(weightLb * 1.0);
  const fatG = Math.round((dailyCalorieTarget * 0.25) / 9);
  const carbG = Math.max(0, Math.round((dailyCalorieTarget - proteinG * 4 - fatG * 9) / 4));

  const basis =
    `Day-one estimate from onboarding: ${
      usingLeanMass
        ? `Katch-McArdle BMR (~${Math.round(bmr)} kcal) from ~${Math.round(leanMassLb)}lb lean mass`
        : `a rough height/weight bootstrap BMR (~${Math.round(bmr)} kcal) — no lean-mass data yet`
    } + a ~${activityAddOn} kcal/day activity estimate → ~${Math.round(tdee)} kcal TDEE, then a ` +
    `${dailyDeltaKcal >= 0 ? "+" : ""}${Math.round(dailyDeltaKcal)} kcal/day adjustment for the chosen pace` +
    (floorApplied
      ? ` would come out to ~${naiveTarget} kcal — below a safe floor of ~${floor} kcal (85% of your BMR), so we've held it there instead. A slower pace would land on a higher, more comfortable number.`
      : `.`) +
    ` This is a starting point — Weekly Recalibration will refine it with real tracked data after the first week.`;

  return {
    daily_calorie_target: dailyCalorieTarget,
    daily_protein_target_g: proteinG,
    daily_carb_target_g: carbG,
    daily_fat_target_g: fatG,
    basis,
    floor_applied: floorApplied,
    naive_calorie_target: naiveTarget,
  };
}
