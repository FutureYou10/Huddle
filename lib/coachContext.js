// Persona definitions for the three in-app coaches, plus the per-persona
// context builders that pull just enough live Supabase data to ground each
// reply — using the exact same math the dashboards use (lib/coaching.js,
// lib/training.js) so the chat never disagrees with what's on screen.
//
// This file is only ever imported from app/api/coach/route.js (a server
// route handler) — never import it from a "use client" component.

import {
  todayIso,
  weekDates,
  dayTypeFor,
  deriveFatMass,
  deriveLeanMass,
  fatMassTrend,
  requiredPace,
  paceTag,
  isCalorieDayOnTarget,
  fmtDate,
} from "./coaching";
import { pyramidTargets, computeOverloadFlags, groupLogByExercise } from "./training";

export const COACHES = ["transformation", "nutritionist", "trainer"];

export const PERSONA_LABEL = {
  transformation: "Transformation Coach",
  nutritionist: "Nutritionist",
  trainer: "Trainer",
};

const PERSONA_NOTES_FIELD = {
  transformation: "transformation_notes",
  nutritionist: "nutritionist_notes",
  trainer: "trainer_notes",
};

// The on-target band is a per-user setting (profiles.nutrition_band_pct,
// default 20 → 80-120%), so the persona text below carries it as a
// placeholder rather than a baked-in number — resolved here against
// whatever's actually on the profile.
function bandRange(profile) {
  const pct = Number(profile?.nutrition_band_pct ?? 20);
  return { low: Math.round(100 - pct), high: Math.round(100 + pct) };
}

function personaPrompt(coach, profile) {
  const { low, high } = bandRange(profile);
  return (SYSTEM_PROMPT[coach] || "").replaceAll("{{BAND_LOW}}", low).replaceAll("{{BAND_HIGH}}", high);
}

// Harry's own free-text tweaks from Settings — a generic, always-available
// lever so a tone/content adjustment doesn't need a code change. `coach_notes`
// applies to all three personas; the per-persona field layers on top.
function notesSuffix(profile, coach) {
  const shared = (profile?.coach_notes || "").trim();
  const persona = (profile?.[PERSONA_NOTES_FIELD[coach]] || "").trim();
  const parts = [];
  if (shared) parts.push(`Harry's own notes for every coach: ${shared}`);
  if (persona) parts.push(`Harry's own notes for this coach specifically: ${persona}`);
  return parts.length ? `\n\n${parts.join("\n")}` : "";
}

const BASE_RULES =
  "You're one of three coach personas inside Huddle, Harry's personal body-recomposition " +
  "coaching app — the other two are separate chat threads he can switch to. He should come away " +
  "from a reply feeling like he just heard from someone who's actually on his side, not a results " +
  "terminal that printed a number. React like a person would to what he just said before you get " +
  "to any figure — if he tells you what he ate, that's worth a genuine word or two, not just a " +
  "straight-to-the-data response. Keep replies short — a few sentences, plain language, no headers " +
  "or bullet lists unless he's asked for a breakdown — but brevity means cutting the tour of where " +
  "a figure came from (that detail already lives on his dashboard), not cutting the warmth. Don't " +
  "end every message with a prompting question like 'What's next?' — that's a script tic, not how " +
  "people actually text; only ask something when you'd genuinely want to know the answer. If you " +
  "can't do something, lead with what you can do instead, not the limitation. 'Logged' and 'on " +
  "target' are never the same claim — a day can be fully logged and still miss the target range, " +
  "so never phrase or imply a missed target as if nothing was logged; if you're not sure which one " +
  "a number in the context below refers to, say it out in full rather than guessing.\n\n" +
  "If Harry describes something he ate or drank — in any of the three chats, not just the " +
  "Nutritionist's — call log_meal with your best estimate of calories and macros and log it " +
  "there and then; he shouldn't have to switch tabs just to log food. If he says he weighed or " +
  "measured it, set source to \"Chat – weighed\"; otherwise \"Chat – estimated\". Confirm briefly " +
  "what you logged and how it fits his day so far, then carry on being yourself — logging food " +
  "doesn't mean switching personas. Never say something was logged, saved, or changed unless you " +
  "actually just did it with a tool call in this same turn and it succeeded — if you're not " +
  "calling a tool, don't use confirming language like \"logged\" or \"got that\"; say what you'd " +
  "do instead (e.g. ask him to repeat it) rather than claim it's done.\n\n" +
  "If Harry questions a number or says something looks off, only explain what you can actually " +
  "see in the context given to you this turn — never invent a specific cause (a duplicate entry, " +
  "a sync error) that you haven't verified is really there. A confident-sounding wrong explanation " +
  "is worse than admitting you're not sure what happened and suggesting he double-check the " +
  "dashboard — a wrong diagnosis can send him second-guessing or deleting the wrong thing.";

const SYSTEM_PROMPT = {
  transformation:
    `${BASE_RULES}\n\nYou are the Transformation Coach — the hub. You see the whole picture: ` +
    "weight/body-fat trend, training consistency, and nutrition discipline together, and you " +
    "keep Harry oriented toward his goal. Day-to-day weigh-in swings (water, sodium, carbs, " +
    "alcohol) are noise, not verdicts — never react to a single day as if it means something " +
    "on its own; talk in terms of the trend. Be steady, direct, and warm.\n\n" +
    "On nutrition specifically: the on-target band is {{BAND_LOW}}-{{BAND_HIGH}}% of the calorie " +
    "target, which is wide — clearing it is a pass, not evidence of precision, so never call a week 'solid' or " +
    "'on point' just because every day cleared the band. Use the actual calorie-by-day figures " +
    "in the context below to say where intake is actually tracking (which days ran over, which " +
    "ran under, roughly by how much) and name one real thing worth tightening — e.g. the size of " +
    "the day-to-day swing, a day that was closer to the edge of the band than the others — even " +
    "in a week where everything technically passed. A pass on every day doesn't mean there's " +
    "nothing to improve.",
  nutritionist:
    `${BASE_RULES}\n\nYou are the Nutritionist. You're knowledgeable and caring, and you explain ` +
    "your reasoning briefly — you're teaching Harry to build his own food intuition over time, " +
    "not grading him. Never be judgmental about an over-budget day; food isn't moral. Be warm " +
    "and evidence-based, never hype-driven — no exclamation-mark energy, no fad-diet language. " +
    "If something's off track, say so plainly and kindly, then give one concrete next step.\n\n" +
    "\"Logged so far today\" in the context below is recalculated from scratch every single turn " +
    "and is the only number for today's running total — never calculate your own total, and never " +
    "carry forward or add to a total you stated earlier in this conversation. That history can " +
    "stretch back into previous days, and a total from a prior day is not today's total — using it " +
    "produces a number larger than what's actually logged today, which reads as a bug even though " +
    "the logging itself was fine.",
  trainer:
    `${BASE_RULES}\n\nYou are the Trainer. You're pumped, motivational, and likeable, and you ` +
    "genuinely want every session to earn its place. Push hard when it's earned, ease off when " +
    "it's not — read the room. Be fun and a bit competitive, never drill-sergeant. Celebrate " +
    "effort as much as numbers. Talk like someone actually in the gym with him, not reading off " +
    "a script.",
};

export const TOOLS = {
  log_meal: {
    name: "log_meal",
    description: "Log a meal or snack Harry describes to his food diary, with your best estimate of its calories and macros.",
    input_schema: {
      type: "object",
      properties: {
        meal: { type: "string", description: "e.g. Breakfast, Lunch, Dinner, Snack" },
        description: { type: "string", description: "What he ate, in his own words plus any detail he gave" },
        calories: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
        fiber_g: { type: "number" },
        source: { type: "string", enum: ["Chat – estimated", "Chat – weighed"] },
      },
      required: ["meal", "description", "calories", "protein_g", "carbs_g", "fat_g", "source"],
    },
  },
};

function n(v, d = 1) {
  return v == null ? "—" : Number(v).toFixed(d);
}

async function transformationContext(supabase, userId, profile) {
  const today = todayIso();
  const { data: metrics } = await supabase
    .from("daily_metrics")
    .select("date, weight, body_fat")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(21);
  const rows = (metrics || [])
    .filter((r) => r.weight != null && r.body_fat != null)
    .map((r) => ({ ...r, fatMass: deriveFatMass(r.weight, r.body_fat), leanMass: deriveLeanMass(r.weight, r.body_fat) }))
    .reverse();
  const latest = rows[rows.length - 1];

  const wDays = weekDates(today);
  const eligibleDays = wDays.filter((d) => d <= today);
  const { data: sessions } = await supabase.from("workout_sessions").select("date, complete").eq("user_id", userId).in("date", wDays);
  const doneCount = (sessions || []).filter((s) => s.complete).length;
  // Two bugs fixed here: this used to count every day in the whole Mon-Sun
  // week (including days that haven't happened yet) as "planned," AND counted
  // "Rest" as a planned training day since dayTypeFor just returns the string
  // — truthy, so it passed the filter. Both inflated the denominator (e.g.
  // showing "2/7" for a week with one rest day and three days still to come,
  // when the honest figure for Mon-Thu on a 6-day split is "2/4").
  const plannedCount = eligibleDays.filter((d) => {
    const dt = dayTypeFor(profile, d);
    return dt && dt !== "Rest";
  }).length;

  const { data: foodRows } = await supabase
    .from("food_log")
    .select("logged_at, calories")
    .eq("user_id", userId)
    .gte("logged_at", `${wDays[0]}T00:00:00`);
  const { data: target } = await supabase.from("weekly_targets").select("daily_calorie_target").eq("user_id", userId).order("week_start", { ascending: false }).limit(1);
  const calTarget = target?.[0]?.daily_calorie_target ?? null;
  const byDay = new Map();
  for (const r of foodRows || []) {
    const d = (r.logged_at || "").slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + (Number(r.calories) || 0));
  }
  const loggedDays = [...byDay.keys()].filter((d) => d <= today);
  // Today is still in progress, so grading it against a full day's target
  // would almost always read as a miss purely because the day isn't over —
  // the Overview page's Food Discipline grid already special-cases today the
  // same way (shows it as "today," not "miss"); this keeps the coach consistent.
  const completedLoggedDays = loggedDays.filter((d) => d < today);
  const bandPct = Number(profile?.nutrition_band_pct ?? 20);
  const onTargetDays = calTarget != null ? completedLoggedDays.filter((d) => isCalorieDayOnTarget(byDay.get(d), calTarget, bandPct)).length : null;
  // Concrete per-day figures so the coach can say *where* intake actually ran
  // (which days over, which under, by how much) instead of just a pass/fail
  // count — clearing the on-target band is wide enough that the count alone
  // reads as more precise than it is.
  const dayBreakdown = calTarget != null && loggedDays.length
    ? loggedDays
        .map((d) => {
          const cal = byDay.get(d);
          const diff = Math.round(cal - calTarget);
          const diffStr = diff === 0 ? "on target" : `${diff > 0 ? "+" : ""}${diff} vs target`;
          return `${fmtDate(d)} ${Math.round(cal)} kcal (${diffStr}${d === today ? ", today, still in progress" : ""})`;
        })
        .join("; ")
    : null;

  if (!latest) return "No weigh-ins logged yet, so there's no trend to talk about — encourage him to get a weigh-in and a couple of days of food logged before you can say anything concrete.";

  const trend = fatMassTrend(rows);
  const req = requiredPace(profile, latest);
  const tag = !trend.building && req ? paceTag(trend.perWeek, req.fatLossPerWeek) : null;

  return [
    `Latest weigh-in (${latest.date}): ${n(latest.weight)} lbs, ${n(latest.body_fat)}% body fat → fat mass ~${n(latest.fatMass)} lbs, lean mass ~${n(latest.leanMass)} lbs.`,
    !trend.building
      ? `Fat-loss trend: ~${n(trend.perWeek, 2)} lbs/week${req ? ` vs. ~${n(req.fatLossPerWeek, 2)} lbs/week required (${tag || "pace unclear"})` : ""}.`
      : `Still building a reliable trend (${trend.count} weigh-ins so far) — talk in terms of consistency, not a rate yet.`,
    profile?.goal_weight ? `Goal: ${n(profile.goal_weight, 0)} lbs / ${n(profile.goal_body_fat_pct, 1)}% body fat by ${profile.end_date || "the target date"}.` : "",
    `This week so far: ${doneCount}/${plannedCount} planned training sessions done. Nutrition: ${loggedDays.length}/${eligibleDays.length} days logged${
      onTargetDays != null && completedLoggedDays.length ? `, ${onTargetDays}/${completedLoggedDays.length} completed days within the calorie target (today's still in progress, not graded yet)` : ""
    }. Logged and on-target are different things — a day can be fully logged and still land outside the target range; never say or imply a day wasn't logged just because it missed the target.`,
    dayBreakdown ? `Calorie-by-day this week vs. the ${Math.round(calTarget)} kcal target: ${dayBreakdown}.` : "",
  ].filter(Boolean).join("\n");
}

async function nutritionistContext(supabase, userId, profile) {
  const today = todayIso();
  const { data: targetRows } = await supabase.from("weekly_targets").select("*").eq("user_id", userId).order("week_start", { ascending: false }).limit(1);
  const target = targetRows?.[0];
  const { data: meals } = await supabase.from("food_log").select("meal, description, calories, protein_g, carbs_g, fat_g, logged_at").eq("user_id", userId).gte("logged_at", `${today}T00:00:00`);
  const sums = (meals || []).reduce(
    (acc, m) => ({
      cal: acc.cal + (Number(m.calories) || 0),
      protein: acc.protein + (Number(m.protein_g) || 0),
      carbs: acc.carbs + (Number(m.carbs_g) || 0),
      fat: acc.fat + (Number(m.fat_g) || 0),
    }),
    { cal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const dietary = profile?.dietary_restrictions || [];
  const allergies = profile?.allergies || [];

  const lines = [
    target
      ? `Today's targets: ${n(target.daily_calorie_target, 0)} kcal, ${n(target.daily_protein_target_g, 0)}g protein, ${n(target.daily_carb_target_g, 0)}g carbs, ${n(target.daily_fat_target_g, 0)}g fat.`
      : "No weekly targets set yet.",
    `Logged so far today: ${n(sums.cal, 0)} kcal, ${n(sums.protein, 0)}g protein, ${n(sums.carbs, 0)}g carbs, ${n(sums.fat, 0)}g fat.`,
    (dietary.length || allergies.length)
      ? `From onboarding — ${[
          dietary.length ? `dietary restrictions: ${dietary.join(", ")}` : "",
          allergies.length ? `allergies: ${allergies.join(", ")}` : "",
        ].filter(Boolean).join("; ")}. Never suggest around these, even once, even as a joke.`
      : "",
  ].filter(Boolean);
  if (meals && meals.length) {
    lines.push("Meals today: " + meals.map((m) => `${m.meal} (${m.description}, ${n(m.calories, 0)} kcal)`).join("; "));
  }
  return lines.join("\n");
}

async function trainerContext(supabase, userId, profile) {
  const today = todayIso();
  const dayType = dayTypeFor(profile, today);
  if (!dayType) return "Today isn't a scheduled training day on his split — if he's asking about training, this is a rest day (or an extra/optional session).";

  const { data: plan } = await supabase.from("workout_plan").select("*").eq("user_id", userId).eq("day_type", dayType).order("order_index");
  const { data: session } = await supabase.from("workout_sessions").select("complete, note").eq("user_id", userId).eq("date", today).maybeSingle();
  const { data: logRows } = await supabase.from("workout_log").select("exercise, date, weight_kg, reps, set_number").eq("user_id", userId).order("date", { ascending: false }).limit(300);
  const byExercise = groupLogByExercise(logRows || []);
  const flags = plan ? computeOverloadFlags(plan, byExercise) : [];
  const injuries = profile?.injury_flags || [];

  const lines = [
    injuries.length
      ? `From onboarding — injuries/things to watch out for: ${injuries.join(", ")}. The exercises that directly conflict are already excluded from the plan, but factor this into tone and any cues you give (e.g. favor easing off a movement that aggravates it over pushing through).`
      : "",
    `Today's session (${dayType}): ${(plan || []).map((ex) => {
      const t = pyramidTargets(ex);
      const top = t[t.length - 1];
      return `${ex.exercise} (${ex.target_sets}x, top set ~${n(top.weight, 1)}kg x ${top.reps})`;
    }).join(", ") || "nothing planned"}.`,
    session ? `Session status: ${session.complete ? "already marked complete" : "started but not yet marked complete"}${session.note ? `, note: "${session.note}"` : ""}.` : "Not started yet today.",
  ];
  if (flags.length) {
    lines.push("Ready for a weight bump (hit target reps 2 sessions running): " + flags.map((f) => `${f.exercise} → ${n(f.suggested, 1)}kg`).join(", ") + ".");
  }
  return lines.filter(Boolean).join("\n");
}

export async function buildContext(supabase, userId, coach, profile) {
  if (coach === "transformation") return transformationContext(supabase, userId, profile);
  if (coach === "nutritionist") return nutritionistContext(supabase, userId, profile);
  if (coach === "trainer") return trainerContext(supabase, userId, profile);
  return "";
}

export function systemPromptFor(coach, contextText, profile) {
  return `${personaPrompt(coach, profile)}${notesSuffix(profile, coach)}\n\nCurrent state (for your reference, don't recite it back verbatim):\n${contextText}`;
}

// --- Proactive (cron-fired) messages -------------------------------------
// These reuse the same personas and context data as the live chat, so a
// scheduled check-in never disagrees with what a reply in the app would say
// — same lib/coaching.js math, just triggered by a clock instead of a turn.

export async function buildMidweekContext(supabase, userId) {
  const today = todayIso();
  const wDays = weekDates(today);
  const { data: targetRows } = await supabase
    .from("weekly_targets")
    .select("*")
    .eq("user_id", userId)
    .order("week_start", { ascending: false })
    .limit(1);
  const target = targetRows?.[0];
  const { data: foodRows } = await supabase
    .from("food_log")
    .select("logged_at, calories")
    .eq("user_id", userId)
    .gte("logged_at", `${wDays[0]}T00:00:00`);

  const byDay = new Map();
  for (const r of foodRows || []) {
    const d = (r.logged_at || "").slice(0, 10);
    byDay.set(d, (byDay.get(d) || 0) + (Number(r.calories) || 0));
  }
  const eligibleDays = wDays.filter((d) => d <= today);
  const loggedDays = eligibleDays.filter((d) => byDay.has(d));
  const weekBudget = target?.weekly_calorie_budget ?? (target?.daily_calorie_target != null ? target.daily_calorie_target * 7 : null);
  const spent = loggedDays.reduce((s, d) => s + byDay.get(d), 0);
  const paceSoFar = weekBudget != null ? (weekBudget / 7) * loggedDays.length : null;
  const delta = paceSoFar != null ? spent - paceSoFar : null;

  return [
    weekBudget ? `Weekly calorie budget: ${n(weekBudget, 0)} kcal.` : "No weekly calorie budget set yet.",
    `Logged ${loggedDays.length}/${eligibleDays.length} days so far this week, totalling ${n(spent, 0)} kcal.`,
    delta != null ? `That's ${delta >= 0 ? "+" : ""}${n(delta, 0)} kcal vs. pace so far this week.` : "",
  ].filter(Boolean).join("\n");
}

export function dailyCheckinPrompt(contextText, profile) {
  return (
    `${personaPrompt("transformation", profile)}${notesSuffix(profile, "transformation")}\n\n` +
    "This is this morning's proactive check-in — Harry hasn't asked you anything, so don't greet him or say " +
    "\"just checking in.\" Open directly with the trend and the one thing to focus on today. Keep it to 2–4 sentences.\n\n" +
    `Current state:\n${contextText}`
  );
}

export function midweekCheckinPrompt(contextText, profile) {
  return (
    `${personaPrompt("nutritionist", profile)}${notesSuffix(profile, "nutritionist")}\n\n` +
    "This is a proactive mid-week check-in — Harry hasn't asked you anything, so skip the greeting. Look at the " +
    "week so far: if he's trending over the weekly budget, name ONE concrete pull-back for the rest of the week " +
    "(a specific daily habit to trim, not a generic \"eat less\"). If he's on track or under, say so briefly and " +
    "encourage him to keep going. Keep it to 2–4 sentences.\n\n" +
    `Current state:\n${contextText}`
  );
}
