"use client";

import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { todayIso, toStorageLb } from "../lib/coaching";

// A manual stopgap: the only thing that's ever written to daily_metrics is
// the native mobile app's Apple Health sync (mobile/lib/sync.ts), and that
// app isn't shipped yet — still waiting on Apple Developer Program approval.
// Until it is, there's no way to get a new weigh-in into Huddle at all, so
// Overview can quietly go stale for days. This gives Harry (or anyone) a
// direct way to log today's numbers themselves, collapsing into a quiet
// confirmation once it's done so it doesn't nag for the rest of the day.
export default function WeighInCard({ profile, todayRow, onSaved }) {
  const alreadyLogged = !!(todayRow && todayRow.weight != null);
  const [editing, setEditing] = useState(!alreadyLogged);
  const units = profile?.units;
  const unitLabel = units === "metric" ? "kg" : "lb";

  const displayWeight = (lb) => {
    if (lb == null) return "";
    const v = units === "metric" ? lb * 0.453592 : lb;
    return String(Math.round(v * 10) / 10);
  };

  const [weight, setWeight] = useState(displayWeight(todayRow?.weight));
  const [bodyFat, setBodyFat] = useState(todayRow?.body_fat != null ? String(todayRow.body_fat) : "");
  const [notes, setNotes] = useState(todayRow?.notes || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const typed = parseFloat(weight);
    if (!weight.trim() || Number.isNaN(typed)) {
      setErr("Enter a weight.");
      return;
    }
    // Body fat % isn't optional even though it's a separate field: the
    // coach's trend math and the Weekly Recalibration both only treat a day
    // as a usable reading when it has BOTH weight and body fat together
    // (that's what deriving lean/fat mass needs) — a weight-only row here
    // would show on Overview's tiles but be silently invisible everywhere
    // else, which is a worse trap than just asking for both up front.
    if (!bodyFat.trim()) {
      setErr("Body fat % is needed too — the coach and your trend both rely on weight and body fat together.");
      return;
    }
    const bf = parseFloat(bodyFat);
    if (Number.isNaN(bf)) {
      setErr("Body fat % should be a number.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const weightLb = toStorageLb(typed, units);
      const payload = {
        user_id: profile.id,
        date: todayIso(),
        weight: weightLb,
        body_fat: bf,
        notes: notes.trim() || null,
      };
      const { data, error } = await supabase
        .from("daily_metrics")
        .upsert(payload, { onConflict: "user_id,date" })
        .select()
        .single();
      if (error) throw error;
      onSaved(data);
      setEditing(false);
    } catch (e) {
      setErr(e.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p className="eyebrow" style={{ marginBottom: 0 }}>Today's Weigh-In</p>
          <button type="button" className="logout" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <p style={{ marginTop: 8, fontSize: 13.5 }}>
          ✓ {displayWeight(todayRow.weight)} {unitLabel} logged{todayRow.body_fat != null ? ` · ${todayRow.body_fat}% body fat` : ""}
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="eyebrow" style={{ marginBottom: 10 }}>Log Today's Weigh-In</p>
      <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
        The app's Health sync isn't live yet, so this is how today's number gets in until it is.
      </p>
      {err && <div className="error-note">{err}</div>}
      <div className="field-row">
        <div className="field">
          <label className="field-label">Weight ({unitLabel})</label>
          <input type="number" inputMode="decimal" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Body fat %</label>
          <input type="number" inputMode="decimal" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="field-label">Notes (optional)</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Felt heavy today, didn't sleep well…" />
      </div>
      <div className="btn-row">
        <button type="button" className="btn primary" style={{ width: "auto", padding: "10px 18px" }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        {alreadyLogged && (
          <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
        )}
      </div>
    </div>
  );
}
