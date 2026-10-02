"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { useProfile } from "../../lib/useProfile";
import { isOnboarded } from "../../lib/onboardingStatus";
import {
  todayIso, mondayOf, toStorageLb, deriveLeanMass, PACE_LABEL, GOAL_LABEL, pacesForGoal, DAY_LABELS,
  fmtDateLong, fmtWeight, projectEndDateFromPace, projectGoalBodyFatPct, deriveGoalPhases,
} from "../../lib/coaching";
import { splitOptionsFor } from "../../lib/splitTemplates";
import { previewPlanDays, generatePlan, dayTypeNamesFor } from "../../lib/planGenerator";
import { EXERCISES } from "../../lib/exerciseLibrary";
import { ACTIVITY_LEVELS, estimateDayOneTargets } from "../../lib/onboardingNutrition";

const STEPS = ["about", "weighin", "goal", "numbers", "training", "split", "exclusions", "preferences", "experience", "review"];

// Turns a comma-separated free-text field into a clean string array for the
// profiles.dietary_restrictions/allergies/injury_flags columns — all three
// already existed in the schema, just never collected or read anywhere.
function parseList(str) {
  return (str || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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
    activityLevel: "light",
    goalWeight: toDisplay(profile?.goal_weight ?? null),
    // Always derived fresh from current stats + the saved goal weight,
    // rather than trusting whatever goal_body_fat_pct was saved last time —
    // that number goes stale the moment current weight/body-fat changes
    // (which is most of the time, since rebuilding a plan usually happens
    // after real progress). Falls back to a raw saved value only when there's
    // no goal weight to estimate from yet.
    goalBodyFatPct: (() => {
      const estimated = profile?.goal_weight != null
        ? projectGoalBodyFatPct(weightLb, bodyFat, profile.goal_weight, profile?.goal || "fat")
        : null;
      if (estimated != null) return String(Math.round(estimated * 10) / 10);
      return profile?.goal_body_fat_pct != null ? String(profile.goal_body_fat_pct) : "";
    })(),
    // Whether the person has typed their own goal body-fat % THIS session —
    // until they do, it stays in sync with the estimate above as goal weight
    // or goal direction change (see setGoalWeight/setGoal). A value that was
    // merely saved from a past session doesn't count as "theirs" here: it
    // goes stale, so every load starts in auto-estimate mode and only a
    // fresh keystroke in this field opts back out of it.
    goalBodyFatPctTouched: false,
    restWeekdays: restWeekdays.length ? restWeekdays : [2, 6],
    splitId: "",
    excludedIds: [],
    // Free-text, comma-separated in the UI — stored as arrays (see parseList)
    // in profiles.dietary_restrictions/allergies/injury_flags so the
    // Nutritionist and Trainer personas always know about them, not just
    // when Harry happens to mention it in chat or remembers to add a
    // Settings note.
    dietaryRestrictions: (profile?.dietary_restrictions || []).join(", "),
    allergies: (profile?.allergies || []).join(", "),
    injuryNotes: (profile?.injury_flags || []).join(", "),
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
    // silently reinterpreting "180" as kg instead of lb. Clears the
    // goal-body-fat estimate along with goalWeight too, unless the person
    // typed their own number in (goalBodyFatPctTouched) — that's theirs to keep.
    setForm((f) => ({
      ...f,
      units,
      weight: "",
      goalWeight: "",
      goalBodyFatPct: f.goalBodyFatPctTouched ? f.goalBodyFatPct : "",
    }));
  }

  function setGoal(goal) {
    setError("");
    setForm((f) => {
      const valid = pacesForGoal(goal);
      const next = { ...f, goal, pace: valid.includes(f.pace) ? f.pace : "" };
      // The goal direction changes which compartment the body-fat estimate
      // assumes is held fixed (see projectGoalBodyFatPct) — recompute it
      // unless the person's already typed their own number.
      if (!f.goalBodyFatPctTouched && f.goalWeight.trim() !== "") {
        const weightLbNow = toStorageLb(parseFloat(f.weight), f.units);
        const bodyFatPctNow = parseFloat(f.bodyFat);
        const goalWeightLbNow = toStorageLb(parseFloat(f.goalWeight), f.units);
        const estimated = projectGoalBodyFatPct(weightLbNow, bodyFatPctNow, goalWeightLbNow, goal);
        next.goalBodyFatPct = estimated != null ? String(Math.round(estimated * 10) / 10) : "";
      }
      return next;
    });
  }

  // Goal weight is the number people actually have in mind; goal body-fat %
  // almost never is. So typing a goal weight keeps the body-fat field in
  // sync with an estimate (today's lean mass held fixed for a fat-loss/
  // recomp goal, today's fat mass held fixed for a muscle-gain goal) —
  // right up until the person types their own number into that field,
  // which flips goalBodyFatPctTouched and leaves it alone from then on.
  function setGoalWeight(value) {
    setError("");
    setForm((f) => {
      const next = { ...f, goalWeight: value };
      if (!f.goalBodyFatPctTouched) {
        const weightLbNow = toStorageLb(parseFloat(f.weight), f.units);
        const bodyFatPctNow = parseFloat(f.bodyFat);
        const goalWeightLbNow = value.trim() !== "" ? toStorageLb(parseFloat(value), f.units) : null;
        const estimated = projectGoalBodyFatPct(weightLbNow, bodyFatPctNow, goalWeightLbNow, f.goal);
        next.goalBodyFatPct = estimated != null ? String(Math.round(estimated * 10) / 10) : "";
      }
      return next;
    });
  }

  function setGoalBodyFatPct(value) {
    setError("");
    setForm((f) => ({ ...f, goalBodyFatPct: value, goalBodyFatPctTouched: true }));
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
      case "about":
        return form.dob.trim() !== "";
      case "weighin":
        return form.weight.trim() !== "" && form.bodyFat.trim() !== "" && !Number.isNaN(parseFloat(form.weight)) && !Number.isNaN(parseFloat(form.bodyFat));
      case "goal":
        return !!form.goal && !!form.pace;
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
      // Both optional — someone may not have a number in mind yet. When a
      // goal weight IS given, the target date is derived from it + the pace
      // already chosen, never typed in separately (see projectEndDateFromPace).
      const goalWeightLb = form.goalWeight.trim() !== "" ? toStorageLb(parseFloat(form.goalWeight), form.units) : null;
      const goalBodyFatPct = form.goalBodyFatPct.trim() !== "" ? parseFloat(form.goalBodyFatPct) : null;
      const computedEndDate = goalWeightLb != null ? projectEndDateFromPace(weightLb, goalWeightLb, form.pace) : null;
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
          end_date: computedEndDate,
          start_weight: weightLb,
          start_body_fat_pct: bodyFatPct,
          start_lean_mass: leanMassLb,
          goal_weight: goalWeightLb,
          goal_body_fat_pct: goalBodyFatPct,
          training_split: trainingSplit,
          dietary_restrictions: parseList(form.dietaryRestrictions),
          allergies: parseList(form.allergies),
          injury_flags: parseList(form.injuryNotes),
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
              <label className="field-label">Date of birth</label>
              <input type="date" required value={form.dob} onChange={(e) => set("dob", e.target.value)} />
              <p className="field-hint">Needed to calculate your calorie targets — it&apos;s also the fallback for estimating BMR on days real body-composition data isn&apos;t available.</p>
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
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">How active is your day-to-day, outside training?</label>
              <select value={form.activityLevel} onChange={(e) => set("activityLevel", e.target.value)}>
                {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <p className="field-hint">Used for your first nutrition targets — Weekly Recalibration swaps this estimate for your real tracked activity after the first week.</p>
            </div>
          </>
        )}

        {stepName === "numbers" && (() => {
          const weightLbNow = toStorageLb(parseFloat(form.weight), form.units);
          const goalWeightLbNow = form.goalWeight.trim() !== "" ? toStorageLb(parseFloat(form.goalWeight), form.units) : null;
          const projectedEndDate =
            goalWeightLbNow != null && !Number.isNaN(goalWeightLbNow) && weightLbNow != null
              ? projectEndDateFromPace(weightLbNow, goalWeightLbNow, form.pace)
              : null;
          return (
            <>
              <p className="eyebrow" style={{ marginBottom: 10 }}>Your Target Numbers</p>
              <p className="field-hint" style={{ marginTop: -4, marginBottom: 10 }}>
                Optional — only fill this in if you&apos;ve got a goal weight in mind. We work out the date from the
                pace you already picked, rather than asking you to guess one — that&apos;s what keeps the calorie
                target realistic instead of forcing through an unsafe deficit or surplus to hit an arbitrary date.
              </p>
              <div className="field-row">
                <div className="field">
                  <label className="field-label">Goal weight ({form.units === "metric" ? "kg" : "lb"})</label>
                  <input type="number" step="0.1" value={form.goalWeight} onChange={(e) => setGoalWeight(e.target.value)} />
                </div>
                <div className="field">
                  <label className="field-label">Goal body fat %{!form.goalBodyFatPctTouched && form.goalBodyFatPct ? " (estimated)" : ""}</label>
                  <input type="number" step="0.1" value={form.goalBodyFatPct} onChange={(e) => setGoalBodyFatPct(e.target.value)} />
                </div>
              </div>
              {goalWeightLbNow != null ? (
                <>
                  {!form.goalBodyFatPctTouched && form.goalBodyFatPct && (
                    <p className="field-hint" style={{ marginBottom: 8 }}>
                      Estimated from your goal weight, assuming you {form.goal === "muscle" ? "add that weight as muscle" : "keep the muscle you have now"} —
                      most people don&apos;t know their target body fat %, so we work it out rather than ask. Type your own number if you&apos;ve got one (e.g. from a scan).
                    </p>
                  )}
                  <p className="note" style={{ marginBottom: 0 }}>
                    {projectedEndDate
                      ? <>At {PACE_LABEL[form.pace] || "your chosen pace"}, that&apos;s roughly <strong>{fmtDateLong(projectedEndDate)}</strong>.</>
                      : "Pick a pace on the previous step to see an estimated date."}
                  </p>
                </>
              ) : (
                <p className="field-hint" style={{ marginBottom: 0 }}>No goal weight yet — that&apos;s fine, we&apos;ll track your trend without a fixed target date.</p>
              )}
            </>
          );
        })()}

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

        {stepName === "preferences" && (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>Anything Your Coaches Should Know</p>
            <p className="field-hint" style={{ marginTop: -4, marginBottom: 12 }}>
              All optional — but the more your coaches know up front, the less you&apos;ll have to repeat yourself in
              chat. These show up automatically in the Nutritionist&apos;s and Trainer&apos;s context, not just this once.
            </p>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Dietary restrictions</label>
              <input
                type="text"
                placeholder="e.g. vegetarian, halal, dairy-free"
                value={form.dietaryRestrictions}
                onChange={(e) => set("dietaryRestrictions", e.target.value)}
              />
              <p className="field-hint">Comma-separated — the Nutritionist will never suggest around these.</p>
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label className="field-label">Allergies</label>
              <input
                type="text"
                placeholder="e.g. peanuts, shellfish"
                value={form.allergies}
                onChange={(e) => set("allergies", e.target.value)}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Injuries or things to watch out for</label>
              <input
                type="text"
                placeholder="e.g. bad lower back, shoulder impingement"
                value={form.injuryNotes}
                onChange={(e) => set("injuryNotes", e.target.value)}
              />
              <p className="field-hint">
                On top of the exercises you already excluded — this gives the Trainer context for how to talk about them, e.g. easing off a movement that aggravates it rather than just skipping it silently.
              </p>
            </div>
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
          const weightLbNow = toStorageLb(parseFloat(form.weight), form.units);
          const goalWeightLbNow = form.goalWeight.trim() !== "" ? toStorageLb(parseFloat(form.goalWeight), form.units) : null;
          const projectedEndDate = goalWeightLbNow != null ? projectEndDateFromPace(weightLbNow, goalWeightLbNow, form.pace) : null;
          const nutritionPreview = estimateDayOneTargets({
            weightLb: weightLbNow,
            bodyFatPct: parseFloat(form.bodyFat),
            heightCm: form.heightCm.trim() ? Number(form.heightCm) : null,
            sex: form.sex || null,
            dob: form.dob || null,
            goal: form.goal,
            pace: form.pace,
            activityLevel: form.activityLevel,
          });
          // Preview only — Day 1, so everything after Phase 1 is necessarily
          // locked. Built from the in-progress form rather than the (not yet
          // saved) profile, using the same shared deriveGoalPhases the
          // dashboard uses once this is saved, so the preview never disagrees
          // with what shows up there afterward.
          const goalPhases = goalWeightLbNow != null
            ? deriveGoalPhases({ start_weight: weightLbNow, goal_weight: goalWeightLbNow, pace: form.pace, start_date: todayIso() }, weightLbNow)
            : [];
          return (
            <>
              <p className="eyebrow" style={{ marginBottom: 10 }}>Review &amp; Generate</p>

              <p className="field-label">Your Goal</p>
              <p className="note" style={{ marginTop: 6, marginBottom: 16 }}>
                {GOAL_LABEL[form.goal]}, {(PACE_LABEL[form.pace] || form.pace).toLowerCase()}
                {goalWeightLbNow != null ? (
                  <>
                    {" "}— targeting {fmtWeight(goalWeightLbNow, form.units)}
                    {form.goalBodyFatPct.trim() !== "" ? ` / ${form.goalBodyFatPct}% body fat` : ""}
                    {projectedEndDate ? <>, around <strong>{fmtDateLong(projectedEndDate)}</strong></> : ""}.
                  </>
                ) : (
                  <>. No fixed goal weight — we&apos;ll track your trend rather than count down to a date.</>
                )}
              </p>

              {goalPhases.length > 0 && (
                <>
                  <p className="field-label">Your Phases</p>
                  <p className="field-hint" style={{ marginTop: 6, marginBottom: 10 }}>
                    That&apos;s a big enough goal that we&apos;ve split it into {goalPhases.length} ~3-month chunks — the
                    next one unlocks once you actually hit this one&apos;s target, not just when the date arrives.
                  </p>
                  <div className="phase-list" style={{ marginBottom: 16 }}>
                    {goalPhases.map((p) => (
                      <div key={p.index} className={`phase-item${p.current ? " current" : ""}${!p.unlocked ? " locked" : ""}`}>
                        <div>
                          <div className="phase-label">
                            {!p.unlocked ? "🔒 " : ""}
                            {p.label}
                            {p.current ? " · starts here" : ""}
                          </div>
                          <div className="phase-range">
                            {fmtWeight(p.startWeightLb, form.units)} → {fmtWeight(p.targetWeightLb, form.units)} · est. {fmtDateLong(p.estimatedDate)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {(form.dietaryRestrictions.trim() || form.allergies.trim() || form.injuryNotes.trim()) && (
                <>
                  <p className="field-label">Your Coaches Will Know</p>
                  <p className="note" style={{ marginTop: 6, marginBottom: 16 }}>
                    {[
                      form.dietaryRestrictions.trim() && `Diet: ${form.dietaryRestrictions.trim()}`,
                      form.allergies.trim() && `Allergies: ${form.allergies.trim()}`,
                      form.injuryNotes.trim() && `Injuries: ${form.injuryNotes.trim()}`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </>
              )}

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
              {nutritionPreview.floor_applied && (
                <p
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: "var(--warn)",
                    background: "color-mix(in srgb, var(--warn) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--warn) 30%, transparent)",
                    borderRadius: 10,
                    padding: "9px 11px",
                    marginBottom: 10,
                  }}
                >
                  Your chosen pace works out to ~{nutritionPreview.naive_calorie_target} kcal/day, which is below a
                  safe minimum for your stats — we&apos;ve held it at {nutritionPreview.daily_calorie_target} instead.
                  Go back and pick a slower pace if you&apos;d rather have more food to work with.
                </p>
              )}
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
