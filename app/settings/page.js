"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { PACE_RATE, PACE_LABEL, GOAL_LABEL } from "../../lib/coaching";
import { useProfile } from "../../lib/useProfile";
import { applyTheme } from "../../lib/theme";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Every field this page can write, with its blank-state default — anything
// not in this list is left alone (never round-tripped through the form).
const FIELD_DEFAULTS = {
  name: "",
  sex: "",
  dob: "",
  height_cm: "",
  units: "imperial",
  goal: "",
  pace: "",
  start_date: "",
  end_date: "",
  start_weight: "",
  start_body_fat_pct: "",
  goal_weight: "",
  goal_body_fat_pct: "",
  training_split: {},
  nutrition_band_pct: 20,
  recalibration_activity_fallback_kcal: 450,
  recalibration_min_activity_days: 3,
  recalibration_min_logged_days: 3,
  nutrition_insights_min_logged_days: 2,
  coach_notes: "",
  transformation_notes: "",
  nutritionist_notes: "",
  trainer_notes: "",
  daily_checkin_enabled: true,
  midweek_checkin_enabled: true,
  theme: "system",
};

function pick(profile) {
  const out = {};
  for (const key of Object.keys(FIELD_DEFAULTS)) {
    const v = profile?.[key];
    out[key] = v == null ? FIELD_DEFAULTS[key] : v;
  }
  return out;
}

export default function SettingsPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [form, setForm] = useState(null);
  const [savedForm, setSavedForm] = useState(null);
  const [dayTypes, setDayTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    const initial = pick(profile);
    setForm(initial);
    setSavedForm(initial);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    supabase
      .from("workout_plan")
      .select("day_type")
      .eq("user_id", profile.id)
      .then(({ data }) => {
        if (cancelled) return;
        setDayTypes(Array.from(new Set((data || []).map((r) => r.day_type).filter(Boolean))));
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  if (profileLoading || !form) return <div className="center-loading">Loading…</div>;
  if (profileError) return (
    <div className="shell">
      <div className="error-note">{profileError}</div>
    </div>
  );

  const dirty = JSON.stringify(savedForm) !== JSON.stringify(form);

  function set(key, value) {
    setSavedNote(false);
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setDay(dayIndex, value) {
    setSavedNote(false);
    setForm((f) => ({ ...f, training_split: { ...f.training_split, [dayIndex]: value } }));
  }

  // Appearance is low-stakes and reads better as instant — it applies to the
  // screen immediately and saves itself, rather than waiting on the big Save
  // bar below with everything else.
  async function handleTheme(value) {
    applyTheme(value);
    setForm((f) => ({ ...f, theme: value }));
    setSavedForm((f) => ({ ...f, theme: value }));
    await supabase.from("profiles").update({ theme: value }).eq("id", profile.id);
  }

  function discard() {
    setForm(savedForm);
    setError("");
  }

  async function handleSave() {
    setError("");

    const bandPct = Number(form.nutrition_band_pct);
    if (!Number.isFinite(bandPct) || bandPct <= 0 || bandPct > 100) {
      setError("The on-target band needs to be a number between 1 and 100.");
      return;
    }
    const dayCountFields = ["recalibration_min_activity_days", "recalibration_min_logged_days", "nutrition_insights_min_logged_days"];
    for (const key of dayCountFields) {
      const v = Number(form[key]);
      if (!Number.isFinite(v) || v < 0) {
        setError("Day-count fields need to be zero or a positive whole number.");
        return;
      }
    }
    const fallbackKcal = Number(form.recalibration_activity_fallback_kcal);
    if (!Number.isFinite(fallbackKcal) || fallbackKcal < 0) {
      setError("The activity fallback needs to be a positive number of kcal.");
      return;
    }

    setSaving(true);
    const numOrNull = (v) => (v === "" || v == null ? null : Number(v));
    const payload = {
      name: form.name || null,
      sex: form.sex || null,
      dob: form.dob || null,
      height_cm: numOrNull(form.height_cm),
      units: form.units,
      goal: form.goal || null,
      pace: form.pace || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      start_weight: numOrNull(form.start_weight),
      start_body_fat_pct: numOrNull(form.start_body_fat_pct),
      goal_weight: numOrNull(form.goal_weight),
      goal_body_fat_pct: numOrNull(form.goal_body_fat_pct),
      training_split: form.training_split,
      nutrition_band_pct: bandPct,
      recalibration_activity_fallback_kcal: fallbackKcal,
      recalibration_min_activity_days: Math.round(Number(form.recalibration_min_activity_days)),
      recalibration_min_logged_days: Math.round(Number(form.recalibration_min_logged_days)),
      nutrition_insights_min_logged_days: Math.round(Number(form.nutrition_insights_min_logged_days)),
      coach_notes: form.coach_notes || null,
      transformation_notes: form.transformation_notes || null,
      nutritionist_notes: form.nutritionist_notes || null,
      trainer_notes: form.trainer_notes || null,
      daily_checkin_enabled: !!form.daily_checkin_enabled,
      midweek_checkin_enabled: !!form.midweek_checkin_enabled,
    };

    const { error: updateErr } = await supabase.from("profiles").update(payload).eq("id", profile.id);
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setSavedForm(form);
    setSavedNote(true);
  }

  const dayTypeOptions = Array.from(new Set([...dayTypes, "Rest"]));

  return (
    <div className="shell">
      <AppHeader title="Settings" />

      {error && <div className="error-note">{error}</div>}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Appearance</p>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Theme</label>
          <div className="segmented">
            {["system", "light", "dark"].map((v) => (
              <button key={v} type="button" className={form.theme === v ? "active" : ""} onClick={() => handleTheme(v)}>
                {v === "system" ? "Match device" : v === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Account</p>
        <div className="field">
          <label className="field-label">Display name</label>
          <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Units</label>
          <div className="segmented">
            {["imperial", "metric"].map((v) => (
              <button key={v} type="button" className={form.units === v ? "active" : ""} onClick={() => set("units", v)}>
                {v === "imperial" ? "lb" : "kg"}
              </button>
            ))}
          </div>
          <p className="field-hint">Applies to the weight numbers on Overview. Lifting weights and body-fat % are unaffected.</p>
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Goals &amp; Numbers</p>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Sex</label>
            <select value={form.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Height (cm)</label>
            <input type="number" value={form.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Date of birth</label>
          <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
          <p className="field-hint">Only used as a fallback for the recalibration BMR estimate on weeks with no lean-mass data yet — optional.</p>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">Goal</label>
            <select value={form.goal} onChange={(e) => set("goal", e.target.value)}>
              <option value="">—</option>
              {Object.entries(GOAL_LABEL).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Pace</label>
            <select value={form.pace} onChange={(e) => set("pace", e.target.value)}>
              <option value="">—</option>
              {Object.keys(PACE_RATE).map((k) => (
                <option key={k} value={k}>{PACE_LABEL[k] || k}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">Start date</label>
            <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Target date</label>
            <input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label className="field-label">Start weight (lb)</label>
            <input type="number" step="0.1" value={form.start_weight} onChange={(e) => set("start_weight", e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Start body fat %</label>
            <input type="number" step="0.1" value={form.start_body_fat_pct} onChange={(e) => set("start_body_fat_pct", e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Goal weight (lb)</label>
            <input type="number" step="0.1" value={form.goal_weight} onChange={(e) => set("goal_weight", e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Goal body fat %</label>
            <input type="number" step="0.1" value={form.goal_body_fat_pct} onChange={(e) => set("goal_body_fat_pct", e.target.value)} />
          </div>
        </div>

        <label className="field-label" style={{ marginTop: 2 }}>Weekly training split</label>
        {DAY_LABELS.map((label, i) => (
          <div className="day-split-row" key={label}>
            <div className="day-split-label">{label}</div>
            <select value={form.training_split?.[String(i)] || "Rest"} onChange={(e) => setDay(String(i), e.target.value)}>
              {dayTypeOptions.map((dt) => (
                <option key={dt} value={dt}>{dt}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 4 }}>Training Plan</p>
        <p className="meal-desc" style={{ marginBottom: 10 }}>
          Rebuild your whole split from scratch — pick your training days, a split style, your experience level, and
          any exercises to skip, and it regenerates your exercises/sets/reps and this week's nutrition targets to match.
        </p>
        <Link href="/onboarding" className="btn secondary" style={{ width: "auto", padding: "10px 18px", display: "inline-block" }}>
          Rebuild my plan
        </Link>
        <p className="field-hint">This replaces your current exercise list and this week's targets — it won't touch logged history.</p>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 4 }}>Nutrition &amp; Recalibration Rules</p>
        <p className="meal-desc" style={{ marginBottom: 10 }}>The numeric knobs behind the coaching math — these are the defaults the app shipped with.</p>
        <div className="field">
          <label className="field-label">On-target band (±%)</label>
          <input type="number" min="1" max="100" value={form.nutrition_band_pct} onChange={(e) => set("nutrition_band_pct", e.target.value)} />
          <p className="field-hint">A day counts as "on target" within this percent of the calorie target either way — 20 means 80–120%.</p>
        </div>
        <div className="field">
          <label className="field-label">Recalibration activity fallback (kcal)</label>
          <input type="number" value={form.recalibration_activity_fallback_kcal} onChange={(e) => set("recalibration_activity_fallback_kcal", e.target.value)} />
          <p className="field-hint">Used for a week without enough watch-worn days to trust a real activity average.</p>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Min. watch-worn days needed</label>
            <input type="number" min="0" value={form.recalibration_min_activity_days} onChange={(e) => set("recalibration_min_activity_days", e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">Min. logged days to recalibrate</label>
            <input type="number" min="0" value={form.recalibration_min_logged_days} onChange={(e) => set("recalibration_min_logged_days", e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Min. logged days for nutrition gap suggestions</label>
          <input type="number" min="0" value={form.nutrition_insights_min_logged_days} onChange={(e) => set("nutrition_insights_min_logged_days", e.target.value)} />
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 4 }}>Coach Notes</p>
        <p className="meal-desc" style={{ marginBottom: 10 }}>Free text, read straight into the coaches' own instructions — dietary restrictions, phrasing you don't want, anything worth them always knowing.</p>
        <div className="field">
          <label className="field-label">For every coach</label>
          <textarea rows={3} value={form.coach_notes} onChange={(e) => set("coach_notes", e.target.value)} placeholder="e.g. I'm vegetarian — never suggest meat. Keep replies to 2-3 sentences." />
        </div>
        <div className="field">
          <label className="field-label">Transformation Coach only</label>
          <textarea rows={2} value={form.transformation_notes} onChange={(e) => set("transformation_notes", e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Nutritionist only</label>
          <textarea rows={2} value={form.nutritionist_notes} onChange={(e) => set("nutritionist_notes", e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">Trainer only</label>
          <textarea rows={2} value={form.trainer_notes} onChange={(e) => set("trainer_notes", e.target.value)} />
        </div>
      </div>

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 6 }}>Message Cadence</p>
        <div className="toggle-row">
          <div>
            <div className="toggle-row-label">Daily morning check-in</div>
            <div className="toggle-row-sub">Transformation Coach, ~9am</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.daily_checkin_enabled} onChange={(e) => set("daily_checkin_enabled", e.target.checked)} />
            <span className="switch-track" />
          </label>
        </div>
        <div className="toggle-row">
          <div>
            <div className="toggle-row-label">Mid-week check-in</div>
            <div className="toggle-row-sub">Nutritionist, Wednesday evening</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={!!form.midweek_checkin_enabled} onChange={(e) => set("midweek_checkin_enabled", e.target.checked)} />
            <span className="switch-track" />
          </label>
        </div>
      </div>

      {dirty && (
        <div className="settings-save-bar">
          <button className="btn primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          <button className="btn ghost" onClick={discard} disabled={saving}>Discard</button>
        </div>
      )}
      {!dirty && savedNote && <div className="settings-saved-note">Saved.</div>}

      <BottomNav />
    </div>
  );
}
