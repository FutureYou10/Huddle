import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callClaude, toolInputFromResponse, AnthropicConfigError } from "../../../lib/anthropic";
import { NUTRITION_GAPS_TOOL, nutritionGapsSystemPrompt, buildNutritionInsightsContext } from "../../../lib/nutritionInsights";
import { todayIso } from "../../../lib/coaching";

const MIN_LOGGED_DAYS = 2;

function supabaseForToken(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// On-demand "Nutrition Gap & Suggestions" for the Food page — no cron
// involved. Cached once per calendar day (nutrition_insights.as_of) so
// repeat page loads the same day don't call Claude again.
export async function GET(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const supabase = supabaseForToken(token);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });
    const userId = user.id;

    const today = todayIso();
    const { data: existing, error: existingErr } = await supabase
      .from("nutrition_insights")
      .select("as_of, items")
      .eq("user_id", userId)
      .eq("as_of", today)
      .maybeSingle();
    if (existingErr) throw existingErr;
    if (existing) return NextResponse.json({ asOf: existing.as_of, items: existing.items, cached: true });

    const { data: profile, error: profileErr } = await supabase.from("profiles").select("nutrition_insights_min_logged_days").eq("id", userId).maybeSingle();
    if (profileErr) throw profileErr;

    const { contextText, loggedDayCount } = await buildNutritionInsightsContext(supabase, userId);
    const minLoggedDays = Number(profile?.nutrition_insights_min_logged_days ?? MIN_LOGGED_DAYS);
    if (loggedDayCount < minLoggedDays) {
      return NextResponse.json({ asOf: today, items: [], notEnoughData: true });
    }

    const response = await callClaude({
      system: nutritionGapsSystemPrompt(),
      messages: [{ role: "user", content: `This week's logged meals:\n${contextText}` }],
      tools: [NUTRITION_GAPS_TOOL],
      toolChoice: { type: "tool", name: "nutrition_gaps" },
      maxTokens: 700,
    });
    const input = toolInputFromResponse(response, "nutrition_gaps");
    const items = Array.isArray(input?.items) ? input.items : [];

    // Upsert, not insert — two near-simultaneous loads (e.g. two tabs) could
    // both pass the "not cached yet" check above before either writes.
    const { error: insertErr } = await supabase
      .from("nutrition_insights")
      .upsert({ user_id: userId, as_of: today, items }, { onConflict: "user_id,as_of" });
    if (insertErr) throw insertErr;

    return NextResponse.json({ asOf: today, items, cached: false });
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json({ error: err.message, needsSetup: true }, { status: 503 });
    }
    console.error("Nutrition insights error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
