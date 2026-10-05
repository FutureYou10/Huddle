import { NextResponse } from "next/server";
import { checkCronAuth, adminSupabase, isOnboarded } from "../../../../lib/cronAuth";
import { dayTypeFor } from "../../../../lib/coaching";
import { pushConfigured, sendPush } from "../../../../lib/push";

// Sends the three nudges (weigh-in, lunch log, training session). Designed to
// be called often — every 10-15 minutes — by an external scheduler with the
// same Bearer CRON_SECRET the other cron routes use. Each reminder fires at
// most once a day per user (reminder_log), the first time this runs after the
// user's chosen time, and only if the thing it nags about hasn't happened.
const WINDOW_MIN = 120; // don't send a reminder more than 2h after its time

function localNow(tz) {
  let zone = tz || "Europe/London";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
  } catch {
    zone = "Europe/London";
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v < 1440 ? v : null;
}

export async function GET(request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!pushConfigured()) return NextResponse.json({ error: "VAPID keys are not set." }, { status: 503 });

  let supabase;
  try {
    supabase = adminSupabase();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 503 });
  }

  const { data: profiles, error } = await supabase.from("profiles").select("*").eq("reminders_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const profile of (profiles || []).filter(isOnboarded)) {
    try {
      const { data: subs } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", profile.id);
      if (!subs || !subs.length) continue;
      const now = localNow(profile.timezone);

      const reminders = [
        {
          kind: "weigh_in",
          time: profile.reminder_weigh_in_time,
          // Skip once a weight is logged for the day.
          needed: async () => {
            const { data } = await supabase.from("daily_metrics").select("weight").eq("user_id", profile.id).eq("date", now.iso).not("weight", "is", null).limit(1);
            return !(data && data.length);
          },
          payload: { title: "Morning weigh-in", body: "Step on the scale and log it — takes ten seconds.", url: "/", tag: "weigh_in" },
        },
        {
          kind: "lunch",
          time: profile.reminder_lunch_time,
          // Skip if anything has been logged in the last three hours.
          needed: async () => {
            const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
            const { data } = await supabase.from("food_log").select("id").eq("user_id", profile.id).gte("logged_at", since).limit(1);
            return !(data && data.length);
          },
          payload: { title: "Log your food", body: "Nothing logged for a few hours — type it or snap a photo.", url: "/coach", tag: "lunch" },
        },
        {
          kind: "session",
          time: profile.reminder_session_time,
          // Only on training days, and only until the session is marked complete.
          needed: async () => {
            const dayType = dayTypeFor(profile, now.iso);
            if (!dayType || dayType === "Rest") return false;
            const { data } = await supabase.from("workout_sessions").select("complete").eq("user_id", profile.id).eq("date", now.iso).eq("complete", true).limit(1);
            if (data && data.length) return false;
            profile._dayType = dayType;
            return true;
          },
          payload: () => ({ title: "Session time", body: `${profile._dayType} day — ready when you are.`, url: "/training", tag: "session" }),
        },
      ];

      for (const r of reminders) {
        const t = toMinutes(r.time);
        if (t == null || now.minutes < t || now.minutes >= t + WINDOW_MIN) continue;
        if (!(await r.needed())) continue;
        // Claim today's slot first; a duplicate-key error means it already went.
        const { error: claimErr } = await supabase.from("reminder_log").insert({ user_id: profile.id, kind: r.kind, day: now.iso });
        if (claimErr) {
          if (claimErr.code !== "23505") throw claimErr;
          continue;
        }
        const payload = typeof r.payload === "function" ? r.payload() : r.payload;
        const out = await sendPush(supabase, subs, payload);
        results.push({ userId: profile.id, kind: r.kind, ...out });
      }
    } catch (err) {
      results.push({ userId: profile.id, ok: false, error: err.message });
    }
  }

  return NextResponse.json({ ranAt: new Date().toISOString(), sent: results.length, results });
}
