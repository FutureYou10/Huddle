"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useProfile } from "../../lib/useProfile";
import { isOnboarded } from "../../lib/onboardingStatus";
import { todayIso, mondayOf, toStorageLb, deriveLeanMass, PACE_LABEL, GOAL_LABEL, pacesForGoal, DAY_LABELS } from "../../lib/coaching";
import { splitOptionsFor } from "../../lib/splitTemplates";
import { previewPlanDays, generatePlan, dayTypeNamesFor } from "../../lib/planGenerator";
import { EXERCISES } from "../../lib/exerciseLibrary";
import { ACTIVITY_LEVELS, estimateDayOneTargets } from "../../lib/onboardingNutrition";

const STEPS = ["about", "weighin", "goal", "numbers", "training", "split", "exclusions", "experience", "review"];

const MUSCLE_LABELS = {
  chest: "Chest",
  shoulders: "Shoulders",
  upper_back: "Rear Delts / Upper Back",
  triceps: "Triceps",
  back: "Back",
  biceps: "Biceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abs: "Abs",
};
const MUSCLE_ORDER = Object.keys(MUSCLE_LABELS);

const EXPERIENCE_OPTIONS = [
  { id: "beginner", label: "Beginner", blurb: "New to structured training, or back after a long break." },
  { id: "intermediate", label: "Intermediate", blurb: "Training consistently for a while, comfortable with a fuller session." },
  { id: "advanced", label: "Advanced", blurb: "Years of consistent training — ready for a bigger workload." },
];

function deriveInitialForm(profile, latestMetric) {
  const units = profile?.units || "imperial";
  const toDisplay = (lb) => {
    if (lb == null) return "";
    const v = units === "metric" ? lb * 0.453592 : lb;
    return String(Math.round(v * 10) / 10);
  };
  const weightLb = latestMetric?.weight ?? profile?.start_weight ?? null;
  const bodyFat = latestMetric?.body_fat ?? profile?.start_body_fat_pct ?? null;

  const hasSplit = profile?.training_split && Object.keys(profile.training_split).length > 0;
  const restWeekdays = hasSplit
    ? Object.entries(profile.training_split)
        .filter(([, v]) => v === "Rest")
        .map(([k]) => Number(k))
        .sort((a, b) => a - b)
    : [2, 6];

  return {
    name: profile?.name || "",
    sex: profile?.sex || "",
    units,
    heightCm: profile?.height_cm != null ? String(profile.height_cm) : "",
    dob: profile?.dob || "",
    weight: toDisplay(weightLb),
    bodyFat: bodyFat != null ? String(bodyFat) : "",
    goal: profile?.goal || "fat",
    pace: profile?.pace || "",
    endDate: profile?.end_date || "",
    activityLevel: "light",
    goalWeight: toDisplay(profile?.goal_weight ?? null),
    goalBodyFatPct: profile?.goal_body_fat_pct != null ? String(profile.goal_body_fat_pct) : "",
    restWeekdays: restWeekdays.length ? restWeekdays : [2, 6],
    splitId: "",
    excludedIds: [],
    experience: "intermediate",
  };
}

export default function OnboardingPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const router = useRouter();

  const [latestMetric, setLatestMetric] = useState(null);
  const [metricLoaded, setMetricLoaded] = useState(false);
  const [form, setForm] = useState(null);
  const [step, setStep] = useState(0);
  const [gateConfirmed, setGateConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Rebuilding an existing plan prefills from the latest real weigh-in
  // rather than whatever's on the profile from months ago.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    supabase
      .from("daily_metrics")
      .select("weight, body_fat")
      .eq("user_id", profile.id)
      .order("date", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        setLatestMetric(data?.[0] || null);
        setMetricLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || !metricLoaded || form) return;
    setForm(deriveInitialForm(profile, latestMetric));
  }, [profile, metricLoaded, latestMetric, form]);

  const daysPerWeek = form ? 7 - form.restWeekdays.length : 0;
  const splitOptions = form ? splitOptionsFor(daysPerWeek) : [];

  // Keep the chosen split valid whenever the rest-day picker changes the
  // number of training days (e.g. going back and adding a rest day).
  useEffect(() => {
    if (!form || !splitOptions.length) return;
    if (!splitOptions.find((s) => s.id === form.splitId)) {
      setForm((f) => ({ ...f, splitId: splitOptions[0].id }));
    }
  }, [form, splitOptions]);

  const alreadyOnboarded = !!profile && isOnboarded(profile);

  if (profileLoading || !form) return <div className="center-loading">Loading…</div>;
  if (profileError) {
    return (
      <div className="shell">
        <div className="error-note">{profileError}</div>
      </div>
    );
  }

  if (alreadyOnboarded && !gateConfirmed) {
    return (
      <div className="shell wizard-shell">
        <p className="eyebrow">Huddle</p>
        <h1 className="page-title">Rebuild your plan?</h1>
        <div className="card">
          <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
            You already have a training plan and nutrition targets set up. Going through this again replaces your
            current exercises, sets and reps, and this week&apos;s nutrition targets — it won&apos;t touch anything
            you&apos;ve already logged.
          </p>
        </div>
        <button className="btn primary" onClick={() => setGateConfirmed(true)}>Build a new plan</button>
        <button className="btn ghost" onClick={() => router.replace("/")}>Cancel, keep what I have</button>
      </div>
    );
  }

  function set(key, value) {
    setError("");
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setUnits(units) {
    setError("");
    // The numbers already typed were in the old unit — clearing them beats
    // silently reinterpreting "180" as kg instead of lb.
    setForm((f) => ({ ...f, units, weight: "", goalWeight: "" }));
  }

  function setGoal(goal) {
    setError("");
    setForm((f) => {
      const valid = pacesForGoal(goal);
      return { ...f, goal, pace: valid.includes(f.pace) ? f.pace : "" };
    });
  }

  function toggleRestDay(i) {
    setError("");
    setForm((f) => {
      const has = f.restWeekdays.includes(i);
      if (has && f.restWeekdays.length <= 1) return f; // at least one rest day
      if (!has && f.restWeekdays.length >= 6) return f; // at least one training day
      const next = has ? f.restWeekdays.filter((d) => d !== i) : [...f.restWeekdays, i];
      next.sort((a, b) => a - b);
      return { ...f, restWeekdays: next };
    });
  }

  function toggleExcluded(id) {
    setForm((f) => {
      const has = f.excludedIds.includes(id);
      return { ...f, excludedIds: has ? f.excludedIds.filter((x) => x !== id) : [...f.excludedIds, id] };
    });
  }

  const paceOptions = pacesForGoal(form.goal);
  const excludedNames = form.excludedIds.map((id) => EXERCISES.find((e) => e.id === id)?.name).filter(Boolean);
  const previewDays = splitOptions.length
    ? previewPlanDays({ daysPerWeek, splitId: form.splitId, experience: form.experience, excludedNames })
    : [];

  function canProceed() {
    switch (STEPS[step]) {
      case "weighin":
        return form.weight.trim() !== "" && form.bodyFat.trim() !== "" && !Number.isNaN(parseFloat(form.weight)) && !Number.isNaN(parseFloat(form.bodyFat));
      case "goal":
        return !!form.goal && !!form.pace && !!form.endDate;
      case "numbers":
        return form.goalWeight.trim() !== "" && form.goalBodyFatPct.trim() !== "";
      case "training":
        return daysPerWeek >= 1 && daysPerWeek <= 6;
      case "split":
        return !!form.splitId;
      case "experience":
        return !!form.experience;
      default:
        return true;
    }
  }

  function next() {
    if (!canProceed()) {
      setError("Fill in this step before moving on.");
      return;
    }
    setError("");
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  function back() {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleGenerate() {
    setSaving(true);
    setError("");
    try {
      const weightLb = toStorageLb(parseFloat(form.weight), form.units);
      const bodyFatPct = parseFloat(form.bodyFat);
      const goalWeightLb = toStorageLb(parseFloat(form.goalWeight), form.units);
      const goalBodyFatPct = parseFloat(form.goalBodyFatPct);
      const leanMassLb = deriveLeanMass(weightLb, bodyFatPct);
      const heightCm = form.heightCm.trim() ? Number(form.heightCm) : null;

      const { trainingSplit, workoutPlanRows } = generatePlan({
        daysPerWeek,
        splitId: form.splitId,
        experience: form.experience,
        excludedNames,
        restWeekdays: form.restWeekdays,
      });

      const nutrition = estimateDayOneTargets({
        weightLb,
        bodyFatPct,
        heightCm,
        sex: form.sex || null,
        dob: form.dob || null,
        goal: form.goal,
        pace: form.pace,
        activityLevel: form.activityLevel,
      });

      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          name: form.name || null,
          sex: form.sex || null,
          dob: form.dob || null,
          height_cm: heightCm,
          units: form.units,
          goal: form.goal,
          pace: form.pace,
          start_date: todayIso(),
          end_date: form.endDate || null,
          start_weight: weightLb,
          start_body_fat_pct: bodyFatPct,
          start_lean_mass: leanMassLb,
          goal_weight: goalWeightLb,
          goal_body_fat_pct: goalBodyFatPct,
          training_split: trainingSplit,
        })
        .eq("id", profile.id);
      if (profileErr) throw profileErr;

      const { error: metricsErr } = await supabase
        .from("daily_metrics")
        .upsert({ user_id: profile.id, date: todayIso(), weight: weightLb, body_fat: bodyFatPct }, { onConflict: "user_id,date" });
      if (metricsErr) throw metricsErr;

      // Wholesale replace — a regenerated plan is meant to be the new plan,
      // not merged with whatever exercises existed before.
      const { error: deleteErr } = await supabase.from("workout_plan").delete().eq("user_id", profile.id);
      if (deleteErr) throw deleteErr;
      const { error: insertErr } = await supabase.from("workout_plan").insert(workoutPlanRows.map((r) => ({ ...r, user_id: profile.id })));
      if (insertErr) throw insertErr;

      const { error: targetsErr } = await supabase.from("weekly_targets").upsert(
        {
          user_id: profile.id,
          week_start: mondayOf(todayIso()),
          daily_calorie_target: nutrition.daily_calorie_target,
          daily_protein_target_g: nutrition.daily_protein_target_g,
          daily_carb_target_g: nutrition.daily_carb_target_g,
          daily_fat_target_g: nutrition.daily_fat_target_g,
          weekly_calorie_budget: nutrition.daily_calorie_target * 7,
          basis: nutrition.basis,
        },
        { onConflict: "user_id,week_start" }
      );
      if (targetsErr) throw targetsErr;

      router.replace("/");
    } catch (err) {
      setError(err.message || "Something went wrong — try again.");
      setSaving(false);
    }
  }

  const stepName = STEPS[step];
  const progressPct = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="shell wizard-shell">
      <p className="eyebrow">Huddle</p>
      <h1 className="page-title">{alreadyOnboarded ? "Rebuild Your Plan" : "Let's Set You Up"}</h1>
      <div className="wizard-progress-track">
        <div className="wizard-progress-fill" style={{ width: `${progressPct}%` }} />
      </div>

      {error && <div className="error-note">{error}</div>}

      <div className="card">
        {stepName === "about" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>About You</p>
            <div className="field">
              <label className="field-label">Display name</label>
              <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Units</label>
              <div className="segmented">
                {["imperial", "metric"].map((v) => (
                  <button key={v} type="button" className={form.units === v ? "active" : ""} onClick={() => setUnits(v)}>
                    {v === "imperial" ? "lb" : "kg"}
                  </button>
                ))}
              </div>
            </div>
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
                <input type="number" value={form.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Date of birth (optional)</label>
              <input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              <p className="field-hint">Only used as a fallback if we ever need to estimate your BMR without real body-composition data.</p>
            </div>
          </>
        )}

        {stepName === "weighin" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Your Starting Point</p>
            <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>Today&apos;s numbers — this becomes your Day 1 baseline.</p>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Weight ({form.units === "metric" ? "kg" : "lb"})</label>
                <input type="number" inputMode="decimal" step="0.1" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Body fat %</label>
                <input type="number" inputMode="decimal" step="0.1" value={form.bodyFat} onChange={(e) => set("bodyFat", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {stepName === "goal" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Your Goal</p>
            <div className="field">
              <label className="field-label">Goal</label>
              <div className="option-grid">
                {Object.entries(GOAL_LABEL).map(([k, label]) => (
                  <button key={k} type="button" className={`option-card${form.goal === k ? " active" : ""}`} onClick={() => setGoal(k)}>
                    <span className="option-card-label">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="field-label">Pace</label>
              <select value={form.pace} onChange={(e) => set("pace", e.target.value)}>
                <option value="">—</option>
                {paceOptions.map((k) => (
                  <option key={k} value={k}>{PACE_LABEL[k] || k}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">How active is your day-to-day, outside training?</label>
              <select value={form.activityLevel} onChange={(e) => set("activityLevel", e.target.value)}>
                {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <p className="field-hint">Used for your first nutrition targets — Weekly Recalibration swaps this estimate for your real tracked activity after the first week.</p>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Target date</label>
              <input type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
            </div>
          </>
        )}

        {stepName === "numbers" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Your Target Numbers</p>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Goal weight ({form.units === "metric" ? "kg" : "lb"})</label>
                <input type="number" step="0.1" value={form.goalWeight} onChange={(e) => set("goalWeight", e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Goal body fat %</label>
                <input type="number" step="0.1" value={form.goalBodyFatPct} onChange={(e) => set("goalBodyFatPct", e.target.value)} />
              </div>
            </div>
          </>
        )}

        {stepName === "training" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Training Days</p>
            <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>Tap your rest day(s) — everything else becomes a training day.</p>
            <div className="chip-row">
              {DAY_LABELS.map((label, i) => (
                <button key={label} type="button" className={`chip${form.restWeekdays.includes(i) ? " active" : ""}`} onClick={() => toggleRestDay(i)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="note" style={{ marginTop: 12 }}>
              That&apos;s <strong>{daysPerWeek} training day{daysPerWeek === 1 ? "" : "s"}</strong> and {form.restWeekdays.length} rest day{form.restWeekdays.length === 1 ? "" : "s"} a week.
            </p>
          </>
        )}

        {stepName === "split" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Split Style</p>
            <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>{daysPerWeek} training day{daysPerWeek === 1 ? "" : "s"} a week — pick how to arrange them.</p>
            <div className="option-list">
              {splitOptions.map((opt) => {
                const names = dayTypeNamesFor(opt);
                return (
                  <button key={opt.id} type="button" className={`option-card wide${form.splitId === opt.id ? " active" : ""}`} onClick={() => set("splitId", opt.id)}>
                    <span className="option-card-label">{opt.label}</span>
                    <span className="option-card-sub">{opt.blurb}</span>
                    <span className="option-card-sequence">{names.join(" → ")}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {stepName === "exclusions" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Exercises To Avoid</p>
            <p className="field-hint" style={{ marginTop: -4, marginBottom: 12 }}>
              Tap anything you can&apos;t or don&apos;t want to do — we&apos;ll automatically swap in a similar alternative.
            </p>
            {MUSCLE_ORDER.map((muscle) => (
              <div key={muscle} style={{ marginBottom: 12 }}>
                <label className="field-label">{MUSCLE_LABELS[muscle]}</label>
                <div className="chip-row">
                  {EXERCISES.filter((e) => e.muscle === muscle).map((e) => (
                    <button key={e.id} type="button" className={`chip${form.excludedIds.includes(e.id) ? " active bad" : ""}`} onClick={() => toggleExcluded(e.id)}>
                      {e.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {stepName === "experience" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Experience Level</p>
            <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>This decides how many exercises and sets each session gets.</p>
            <div className="option-list">
              {EXPERIENCE_OPTIONS.map((opt) => (
                <button key={opt.id} type="button" className={`option-card wide${form.experience === opt.id ? " active" : ""}`} onClick={() => set("experience", opt.id)}>
                  <span className="option-card-label">{opt.label}</span>
                  <span className="option-card-sub">{opt.blurb}</span>
                </button>
              ))}
            </div>
            {previewDays.length > 0 && (
              <div className="note" style={{ marginTop: 12 }}>
                {previewDays.map((d) => (
                  <div key={d.dayType} style={{ marginBottom: 2 }}>
                    <strong>{d.dayType}</strong>: {d.exercises.length} exercises, {d.totalSets} sets
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {stepName === "review" && (() => {
          const nutritionPreview = estimateDayOneTargets({
            weightLb: toStorageLb(parseFloat(form.weight), form.units),
            bodyFatPct: parseFloat(form.bodyFat),
            heightCm: form.heightCm.trim() ? Number(form.heightCm) : null,
            sex: form.sex || null,
            dob: form.dob || null,
            goal: form.goal,
            pace: form.pace,
            activityLevel: form.activityLevel,
          });
          return (
            <>
              <p className="eyebrow" style={{ marginBottom: 10 }}>Review &amp; Generate</p>

              <p className="field-label">Your Plan</p>
              {previewDays.map((d) => (
                <div key={d.dayType} className="exercise-block">
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, fontSize: 13.5 }}>
                    <span>{d.dayType}</span>
                    <span style={{ color: "var(--text-faint)", fontWeight: 500, fontSize: 11.5 }}>{d.totalSets} sets</span>
                  </div>
                  {d.exercises.map((ex, i) => (
                    <div key={i} style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>
                      {ex.exercise} — {ex.target_sets}×{ex.rep_min}-{ex.rep_max}
                    </div>
                  ))}
                </div>
              ))}

              <p className="field-label" style={{ marginTop: 16 }}>Day-One Nutrition Targets</p>
              <div className="stat-row">
                <div className="stat">
                  <div className="k">Calories</div>
                  <div className="v">{nutritionPreview.daily_calorie_target}</div>
                </div>
                <div className="stat">
                  <div className="k">Protein</div>
                  <div className="v">{nutritionPreview.daily_protein_target_g}g</div>
                </div>
                <div className="stat">
                  <div className="k">Carbs</div>
                  <div className="v">{nutritionPreview.daily_carb_target_g}g</div>
                </div>
                <div className="stat">
                  <div className="k">Fat</div>
                  <div className="v">{nutritionPreview.daily_fat_target_g}g</div>
                </div>
              </div>
              <p className="field-hint" style={{ marginTop: 8 }}>{nutritionPreview.basis}</p>
            </>
          );
        })()}
      </div>

      <div className="wizard-nav-row">
        {step > 0 && (
          <button className="btn secondary" style={{ width: "auto" }} onClick={back} disabled={saving}>Back</button>
        )}
        {stepName !== "review" ? (
          <button className="btn primary" style={{ width: "auto", marginLeft: "auto" }} onClick={next}>Next</button>
        ) : (
          <button className="btn primary" style={{ width: "auto", marginLeft: "auto" }} onClick={handleGenerate} disabled={saving}>
            {saving ? "Building your plan…" : "Generate my plan"}
          </button>
        )}
      </div>
    </div>
  );
}
