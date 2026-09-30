"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { toStoredLb } from "../../../lib/coaching";
import { ensureProfile } from "../../../lib/ensureProfile";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function LogWeightPage() {
  const router = useRouter();
  const [units, setUnits] = useState("imperial");
  const [date, setDate] = useState(todayIso());
  const [weight, setWeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      try {
        const profileRow = await ensureProfile(session);
        if (!cancelled) {
          setUnits(profileRow?.units || "imperial");
          setChecking(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Couldn't load your profile.");
          setChecking(false);
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");

    const lb = toStoredLb(weight, units);
    if (lb == null) {
      setError("Enter a weight.");
      return;
    }

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      const row = {
        user_id: session.user.id,
        date,
        weight: lb,
        body_fat: bodyFat === "" ? null : Number(bodyFat),
        notes: notes.trim() === "" ? null : notes.trim(),
      };

      const { error: upsertError } = await supabase
        .from("daily_metrics")
        .upsert(row, { onConflict: "user_id,date" });
      if (upsertError) throw upsertError;

      router.replace("/");
    } catch (err) {
      setError(err.message || "Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <div className="center-loading">Loading…</div>;

  const weightUnitLabel = units === "metric" ? "kg" : "lb";

  return (
    <div className="shell">
      <p className="eyebrow">Huddle</p>
      <h1 className="page-title">Log a weigh-in</h1>

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">Date</label>
          <input
            type="date"
            required
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label">Weight ({weightUnitLabel})</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            required
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder={units === "metric" ? "e.g. 107.0" : "e.g. 236.0"}
          />
        </div>

        <div className="field">
          <label className="field-label">Body fat % (optional)</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="3"
            max="60"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            placeholder="e.g. 18.5"
          />
        </div>

        <div className="field">
          <label className="field-label">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth flagging"
          />
        </div>

        {error && <div className="error-note" style={{ marginBottom: 12 }}>{error}</div>}
        {info && <div className="note" style={{ marginBottom: 12 }}>{info}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save weigh-in"}
        </button>
        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 10 }}
          onClick={() => router.replace("/")}
        >
          Cancel
        </button>
      </form>

      <div className="note">
        Logging on a date you've already logged updates that day's entry
        instead of creating a duplicate.
      </div>
    </div>
  );
}
