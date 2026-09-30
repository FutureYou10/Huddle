"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { MEAL_TYPES } from "../../../lib/constants";
import { ensureProfile } from "../../../lib/ensureProfile";

function nowLocalInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LogMealPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [meal, setMeal] = useState(MEAL_TYPES[0]);
  const [loggedAt, setLoggedAt] = useState(nowLocalInput());
  const [description, setDescription] = useState("");
  const [calories, setCalories] = useState("");
  const [showMacros, setShowMacros] = useState(false);
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      try {
        await ensureProfile(data.session);
      } catch (err) {
        if (!cancelled) setError(err.message || "Couldn't load your profile.");
      }
      if (!cancelled) setChecking(false);
    }
    init();
    return () => { cancelled = true; };
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (description.trim() === "") {
      setError("Add a short description of what you ate.");
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
        meal,
        logged_at: new Date(loggedAt).toISOString(),
        description: description.trim(),
        calories: calories === "" ? null : Number(calories),
        protein_g: protein === "" ? null : Number(protein),
        carbs_g: carbs === "" ? null : Number(carbs),
        fat_g: fat === "" ? null : Number(fat),
        source: "manual",
      };

      const { error: insertError } = await supabase.from("food_log").insert(row);
      if (insertError) throw insertError;

      router.replace("/");
    } catch (err) {
      setError(err.message || "Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return <div className="center-loading">Loading…</div>;

  return (
    <div className="shell">
      <p className="eyebrow">Huddle</p>
      <h1 className="page-title">Log a meal</h1>

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">Meal</label>
          <select value={meal} onChange={(e) => setMeal(e.target.value)}>
            {MEAL_TYPES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">When</label>
          <input
            type="datetime-local"
            required
            value={loggedAt}
            max={nowLocalInput()}
            onChange={(e) => setLoggedAt(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label">Description</label>
          <input
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Two chicken breasts, rice, broccoli"
          />
        </div>

        <div className="field">
          <label className="field-label">Calories</label>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder="e.g. 650"
          />
        </div>

        {showMacros ? (
          <div className="stat-row" style={{ marginBottom: 12 }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="field-label">Protein (g)</label>
              <input type="number" inputMode="numeric" min="0" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="field-label">Carbs (g)</label>
              <input type="number" inputMode="numeric" min="0" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label className="field-label">Fat (g)</label>
              <input type="number" inputMode="numeric" min="0" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn ghost"
            style={{ marginBottom: 12, padding: "6px 0" }}
            onClick={() => setShowMacros(true)}
          >
            + Add protein / carbs / fat
          </button>
        )}

        {error && <div className="error-note" style={{ marginBottom: 12 }}>{error}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save meal"}
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
    </div>
  );
}
