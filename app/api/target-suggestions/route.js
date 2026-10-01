import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callClaude, toolInputFromResponse, AnthropicConfigError } from "../../../lib/anthropic";
import {
  RECALIBRATION_TOOL,
  recalibrationSystemPrompt,
  buildRecalibrationContext,
  lastCompletedWeekStart,
} from "../../../lib/weeklyRecalibration";
import { todayIso, mondayOf } from "../../../lib/coaching";

const MIN_LOGGED_DAYS = 3;

function supabaseForToken(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authedSupabase(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const supabase = supabaseForToken(token);
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token);
  if (userErr || !user) return { error: NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 }) };
  return { supabase, userId: user.id };
}

// On-demand "Weekly Recalibration" — a *suggestion*, never applied until
// Harry taps Apply (see POST below). Checked whenever the Food page loads:
// once a new week has started, is last week's suggestion already on record?
// If not, and last week had enough logged to say anything useful, generate it.
export async function GET(request) {
  try {
    const { supabase, userId, error } = await authedSupabase(request);
    if (error) return error;

    const today = todayIso();
    const weekStart = lastCompletedWeekStart(today);

    const { data: existing, error: existingErr } = await supabase
      .from("target_suggestions")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return NextResponse.json({ suggestion: existing });

    const { data: profile, error: profileErr } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profileErr) throw profileErr;

    const { contextText, loggedDayCount } = await buildRecalibrationContext(supabase, userId, profile, weekStart);
    const minLoggedDays = Number(profile?.recalibration_min_logged_days ?? MIN_LOGGED_DAYS);
    if (loggedDayCount < minLoggedDays) {
      return NextResponse.json({ suggestion: null, notEnoughData: true });
    }

    const response = await callClaude({
      system: recalibrationSystemPrompt(),
      messages: [{ role: "user", content: contextText }],
      tools: [RECALIBRATION_TOOL],
      toolChoice: { type: "tool", name: "suggest_targets" },
      maxTokens: 500,
    });
    const input = toolInputFromResponse(response, "suggest_targets");
    if (!input) return NextResponse.json({ suggestion: null, notEnoughData: true });

    const row = {
      user_id: userId,
      week_start: weekStart,
      suggested_daily_calorie_target: input.daily_calorie_target ?? null,
      suggested_daily_protein_target_g: input.daily_protein_target_g ?? null,
      suggested_daily_carb_target_g: input.daily_carb_target_g ?? null,
      suggested_daily_fat_target_g: input.daily_fat_target_g ?? null,
      suggested_weekly_calorie_budget: input.daily_calorie_target != null ? input.daily_calorie_target * 7 : null,
      rationale: input.rationale || "",
    };
    // Upsert, not insert — two near-simultaneous loads (e.g. two tabs) could
    // both pass the "not on record yet" check above before either writes.
    const { data: inserted, error: insertErr } = await supabase
      .from("target_suggestions")
      .upsert(row, { onConflict: "user_id,week_start" })
      .select()
      .single();
    if (insertErr) throw insertErr;

    return NextResponse.json({ suggestion: inserted });
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json({ error: err.message, needsSetup: true }, { status: 503 });
    }
    console.error("Target suggestion error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}

// Harry's decision on a suggestion — the only way targets actually change.
// Applying inserts a new weekly_targets row (taking effect immediately, same
// as any other target update) rather than touching the suggestion's own week.
export async function POST(request) {
  try {
    const { supabase, userId, error } = await authedSupabase(request);
    if (error) return error;

    const { id, action } = await request.json();
    if (!id || !["apply", "dismiss"].includes(action)) {
      return NextResponse.json({ error: "Expected { id, action: 'apply' | 'dismiss' }." }, { status: 400 });
    }

    const { data: suggestion, error: findErr } = await supabase.from("target_suggestions").select("*").eq("id", id).maybeSingle();
    if (findErr) throw findErr;
    if (!suggestion || suggestion.status !== "pending") {
      return NextResponse.json({ error: "That suggestion isn't pending anymore." }, { status: 409 });
    }

    if (action === "apply") {
      // weekly_targets has a unique (user_id, week_start) constraint — if
      // Harry already has a row for the current week, upsert replaces it
      // rather than erroring out on the duplicate key.
      const { error: upsertErr } = await supabase.from("weekly_targets").upsert(
        {
          user_id: userId,
          week_start: mondayOf(todayIso()),
          daily_calorie_target: suggestion.suggested_daily_calorie_target,
          daily_protein_target_g: suggestion.suggested_daily_protein_target_g,
          daily_carb_target_g: suggestion.suggested_daily_carb_target_g,
          daily_fat_target_g: suggestion.suggested_daily_fat_target_g,
          weekly_calorie_budget: suggestion.suggested_weekly_calorie_budget,
          // Keep the actual reasoning, not a generic label — matches how
          // targets set before the app existed recorded their own basis.
          basis: suggestion.rationale || "weekly_recalibration",
        },
        { onConflict: "user_id,week_start" }
      );
      if (upsertErr) throw upsertErr;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("target_suggestions")
      .update({ status: action === "apply" ? "applied" : "dismissed", decided_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    return NextResponse.json({ suggestion: updated });
  } catch (err) {
    console.error("Target suggestion decision error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
