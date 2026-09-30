import { supabase } from "./supabaseClient";

// Fetches the signed-in user's profile row, creating a bare one if this is
// their first time anywhere in the app (dashboard or either logging page —
// whichever they land on first). Every child table's user_id references
// profiles(id), so this has to succeed before any write to daily_metrics or
// food_log can.
export async function ensureProfile(session) {
  let { data: profileRow, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;

  if (!profileRow) {
    const { data: created, error: createErr } = await supabase
      .from("profiles")
      .insert({ id: session.user.id, name: session.user.email.split("@")[0] })
      .select()
      .single();
    if (createErr) throw createErr;
    profileRow = created;
  }

  return profileRow;
}
