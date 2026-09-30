import { NextResponse } from "next/server";
import { checkCronAuth, adminSupabase, isOnboarded } from "../../../../lib/cronAuth";
import { buildMidweekContext, midweekCheckinPrompt } from "../../../../lib/coachContext";
import { callClaude, textFromResponse, AnthropicConfigError } from "../../../../lib/anthropic";

// Fired Wednesday evenings by Vercel Cron (see vercel.json) — replaces the
// personal "Harry's Mid-Week Food Check-In" scheduled task. Same idea: by
// Wednesday evening there's enough of the week logged to say something
// useful about pace vs. the weekly calorie budget.
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
    try {
      const contextText = await buildMidweekContext(supabase, profile.id);
      const response = await callClaude({
        system: midweekCheckinPrompt(contextText),
        messages: [{ role: "user", content: "Write this week's check-in." }],
        maxTokens: 300,
      });
      const text = textFromResponse(response);
      if (text) {
        const { error: insertErr } = await supabase
          .from("coach_messages")
          .insert({ user_id: profile.id, coach: "nutritionist", role: "assistant", body: text, kind: "midweek_checkin" });
        if (insertErr) throw insertErr;
      }
      results.push({ userId: profile.id, ok: true });
    } catch (err) {
      if (err instanceof AnthropicConfigError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      results.push({ userId: profile.id, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), count: results.length, results });
}
