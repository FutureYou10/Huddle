import { createClient } from "@supabase/supabase-js";

// Shared by the /api/cron/* routes: verifies the request actually came from
// Vercel's Cron scheduler (or a manual "Run" from the Vercel dashboard, which
// sends the same header) rather than a public GET, and hands back a
// service-role Supabase client — these routes have no logged-in user, so
// there's no auth.uid() for RLS to check against; the service role bypasses
// RLS entirely, which is why CRON_SECRET is what stands in for auth here.
export function checkCronAuth(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, status: 503, error: "CRON_SECRET is not set — add it in Vercel's Environment Variables." };
  const got = request.headers.get("authorization") || "";
  if (got !== `Bearer ${expected}`) return { ok: false, status: 401, error: "Unauthorized." };
  return { ok: true };
}

export function adminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — add it in Vercel's Environment Variables.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// "Onboarded" for now just means a training split exists — the same signal
// the dashboards use to know a profile is ready to drive real math.
export function isOnboarded(profile) {
  return !!(profile.training_split && Object.keys(profile.training_split).length > 0);
}
