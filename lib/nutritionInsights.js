// "Nutrition Gap & Suggestions" — a small set of realistic gaps spotted in
// the last 7 days of logged meals, each with one concrete suggestion.
// Generated on-demand (from the Food page) rather than on a cron, and
// cached per calendar day in nutrition_insights so a page re-load doesn't
// call Claude again until tomorrow.
//
// Server-only — only ever imported from an app/api/* route handler.

import { todayIso, addDays, fmtDate } from "./coaching";

export const NUTRITION_GAPS_TOOL = {
  name: "nutrition_gaps",
  description: "Report realistic nutrition gaps spotted in the week's logged meals, each with one concrete, easy suggestion.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            icon: { type: "string", description: "One emoji representing the food or nutrient, e.g. 🍊" },
            title: { type: "string", description: "Short headline, e.g. 'Vitamin C had one good day — worth repeating'" },
            detail: { type: "string", description: "1-2 sentences on what was actually logged that supports this, naming the day/meal" },
            suggestion: { type: "string", description: "One concrete, easy swap or addition for today or tomorrow" },
          },
          required: ["icon", "title", "detail", "suggestion"],
        },
      },
    },
    required: ["items"],
  },
};

const SYSTEM_PROMPT =
  "You are Harry's Nutritionist inside Huddle, his personal body-recomposition coaching app. " +
  "Look at what he's actually logged over the last 7 days and call out 2-4 realistic nutrition " +
  "gaps — things like vitamin C, fibre, omega-3, veg variety, or a repeated low point — based " +
  "only on what's actually in the meals listed below, never invented. Be specific about which " +
  "day or meal supports each point. Tone: warm and evidence-based, teaching rather than grading " +
  "— no exclamation-mark energy, no fad-diet language, never judgmental. For each gap, give one " +
  "easy, concrete suggestion he could act on today or tomorrow. Call nutrition_gaps exactly once.";

export function nutritionGapsSystemPrompt() {
  return SYSTEM_PROMPT;
}

// Returns the last 7 days of logged meals as plain text (one line per day),
// plus how many distinct days actually have anything logged — callers use
// that count to decide whether there's enough to say anything useful yet.
export async function buildNutritionInsightsContext(supabase, userId) {
  const today = todayIso();
  const since = addDays(today, -6);
  const { data: rows, error } = await supabase
    .from("food_log")
    .select("logged_at, meal, description")
    .eq("user_id", userId)
    .gte("logged_at", `${since}T00:00:00`)
    .order("logged_at", { ascending: true });
  if (error) throw error;

  const byDay = new Map();
  for (const r of rows || []) {
    const d = (r.logged_at || "").slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(`${r.meal || "Meal"}${r.description ? ` — ${r.description}` : ""}`);
  }
  const loggedDays = [...byDay.keys()].sort();
  const lines = loggedDays.map((d) => `${fmtDate(d)}: ${byDay.get(d).join("; ")}`);

  return {
    contextText: lines.length ? lines.join("\n") : "Nothing logged in the last 7 days.",
    loggedDayCount: loggedDays.length,
  };
}
