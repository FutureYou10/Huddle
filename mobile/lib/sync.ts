import { supabase } from "./supabase";
import { readRecentHealthData, type DayReading } from "./healthkit";

export type SyncResult = {
  ok: boolean;
  daysWritten: number;
  error?: string;
};

// Reads the last `days` of Health data and upserts it into daily_metrics —
// same table, same columns, same (user_id, date) uniqueness the web app's
// Overview/Training dashboards already read from. A day with nothing in
// Health yet (e.g. today, before a weigh-in) is skipped rather than writing
// a row of nulls over whatever a manual log already put there.
export async function syncHealthData(days = 14): Promise<SyncResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, daysWritten: 0, error: "Not signed in." };

  let readings: DayReading[];
  try {
    readings = await readRecentHealthData(days);
  } catch (err: any) {
    return { ok: false, daysWritten: 0, error: err?.message || "Couldn't read Health data." };
  }

  const rows = readings
    .filter((r) => hasAnyValue(r))
    .map((r) => ({ user_id: user.id, ...stripUndefined(r) }));

  if (rows.length === 0) return { ok: true, daysWritten: 0 };

  const { error } = await supabase
    .from("daily_metrics")
    .upsert(rows, { onConflict: "user_id,date" });

  if (error) return { ok: false, daysWritten: 0, error: error.message };
  return { ok: true, daysWritten: rows.length };
}

function hasAnyValue(r: DayReading): boolean {
  return Object.keys(r).some((k) => k !== "date" && (r as any)[k] != null);
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) (out as any)[k] = v;
  }
  return out;
}
