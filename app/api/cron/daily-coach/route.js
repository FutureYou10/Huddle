import { NextResponse } from "next/server";
import { checkCronAuth, adminSupabase, isOnboarded } from "../../../../lib/cronAuth";
import { buildContext, dailyCheckinPrompt } from "../../../../lib/coachContext";
import { callClaude, textFromResponse, AnthropicConfigError } from "../../../../lib/anthropic";

// Fired once a day by Vercel Cron (see vercel.json). Replaces the personal
// "Harry's Daily Health Coach" scheduled task with something that runs for
// any onboarded user, not just Harry — same trend math as the Transformation
// Coach chat and the Overview dashboard, delivered as a proactive DM instead
// of waiting for him to open the app.
export async function GET(request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let supabase;
  try {
    supabase = adminSupabase();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }

  const { data: profiles, error } = await supabase.from("profiles").select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const profile of (profiles || []).filter(isOnboarded)) {
    // Per-user cadence setting from Settings — off by his own choice, not an error.
    if (profile.daily_checkin_enabled === false) {
      results.push({ userId: profile.id, ok: true, skipped: "daily_checkin_disabled" });
      continue;
    }
    try {
      const contextText = await buildContext(supabase, profile.id, "transformation", profile);
      const response = await callClaude({
        system: dailyCheckinPrompt(contextText, profile),
        messages: [{ role: "user", content: "Write today's check-in." }],
        maxTokens: 300,
      });
      const text = textFromResponse(response);
      if (text) {
        const { error: insertErr } = await supabase
          .from("coach_messages")
          .insert({ user_id: profile.id, coach: "transformation", role: "assistant", body: text, kind: "daily_checkin" });
        if (insertErr) throw insertErr;
      }
      results.push({ userId: profile.id, ok: true });
    } catch (err) {
      // A missing/bad Anthropic key fails every user identically — stop
      // early and surface it as one clear config error instead of N copies.
      if (err instanceof AnthropicConfigError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      results.push({ userId: profile.id, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), count: results.length, results });
}
