import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// The dashboard-card counterpart to coach_messages: the daily-coach and
// midweek-checkin crons write here instead, and the Overview/Food pages poll
// this on load for the latest not-yet-dismissed row for their kind — the
// same "generate once, show as a card until acted on" shape as
// target_suggestions, just with a single dismiss instead of apply/dismiss.
export async function GET(request) {
  try {
    const { supabase, userId, error } = await authedSupabase(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const coach = searchParams.get("coach");
    const kind = searchParams.get("kind");
    if (!coach || !kind) return NextResponse.json({ error: "Expected ?coach=&kind=" }, { status: 400 });

    const { data, error: queryErr } = await supabase
      .from("coach_insights")
      .select("id, coach, kind, body, created_at")
      .eq("user_id", userId)
      .eq("coach", coach)
      .eq("kind", kind)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (queryErr) throw queryErr;

    return NextResponse.json({ insight: data || null });
  } catch (err) {
    console.error("Coach insight fetch error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}

// Dismissing is the only action here — there's nothing to "apply," it's a
// briefing, not a decision.
export async function POST(request) {
  try {
    const { supabase, userId, error } = await authedSupabase(request);
    if (error) return error;

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Expected { id }." }, { status: 400 });

    // Scoped to userId explicitly, same defense-in-depth as target-suggestions'
    // POST — RLS already blocks any real cross-account access, this just
    // keeps a stale/foreign id from doing anything even in principle.
    const { error: updateErr } = await supabase
      .from("coach_insights")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId);
    if (updateErr) throw updateErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Coach insight dismiss error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
