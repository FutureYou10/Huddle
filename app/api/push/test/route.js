import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pushConfigured, sendPush } from "../../../../lib/push";

// "Send test reminder" button in Settings — confirms this device really
// receives pushes, without waiting for the next scheduled one.
export async function POST(request) {
  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    if (!pushConfigured()) {
      return NextResponse.json({ error: "Reminders aren't set up on the server yet (missing VAPID keys).", needsSetup: true }, { status: 503 });
    }
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });

    const { data: subs, error } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
    if (error) throw error;
    if (!subs || !subs.length) return NextResponse.json({ error: "No device is registered for reminders yet." }, { status: 400 });

    const result = await sendPush(supabase, subs, {
      title: "Huddle reminders are on",
      body: "This is what a nudge will look like.",
      url: "/settings",
      tag: "huddle-test",
    });
    if (!result.sent) return NextResponse.json({ error: "The push service didn't accept it — try turning reminders off and on again." }, { status: 502 });
    return NextResponse.json({ ok: true, sent: result.sent });
  } catch (err) {
    console.error("Push test error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
