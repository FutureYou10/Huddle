"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { todayIso, toStorageLb, fmtDate } from "../../lib/coaching";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";

// Segmental fields come in three families (fat / muscle / lean mass), each
// with the same five body parts — defined once and reused for the form, the
// left/right balance check, and the scan card so all three stay in sync.
const SEGMENTS = [
  { key: "left_arm", label: "Left arm" },
  { key: "right_arm", label: "Right arm" },
  { key: "left_leg", label: "Left leg" },
  { key: "right_leg", label: "Right leg" },
  { key: "torso", label: "Torso" },
];
const PAIRS = [
  { side: "arm", left: "left_arm", right: "right_arm", label: "Arms" },
  { side: "leg", left: "left_leg", right: "right_leg", label: "Legs" },
];
const FAMILIES = [
  { prefix: "fat_mass", label: "Fat mass by segment" },
  { prefix: "muscle_mass", label: "Muscle mass by segment" },
  { prefix: "lean_mass", label: "Lean mass by segment" },
];

// All mass-type fields get converted lb<->kg with the profile's units, same
// as daily_metrics.weight everywhere else in the app. Everything else
// (percentages, BMR, water in litres, visceral fat rating, phase angle)
// is stored and shown exactly as typed — there's no imperial equivalent for
// litres worth bothering with.
const MASS_FIELDS = [
  "weight", "fat_mass_total", "skeletal_muscle_mass", "soft_lean_mass", "lean_mass_total",
  ...FAMILIES.flatMap((f) => SEGMENTS.map((s) => `${f.prefix}_${s.key}`)),
];
const PLAIN_FIELDS = [
  "body_fat_pct", "bmi", "visceral_fat_rating", "bmr",
  "body_water_l", "body_water_pct", "ecw_l", "ecw_pct", "icw_l", "phase_angle",
];

const BLANK_FORM = {
  date: "", source: "Gym InBody scan", notes: "",
  ...Object.fromEntries([...MASS_FIELDS, ...PLAIN_FIELDS].map((k) => [k, ""])),
};

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

function daysBetweenLocal(aIso, bIso) {
  return Math.round((new Date(bIso + "T00:00:00") - new Date(aIso + "T00:00:00")) / 86400000);
}

export default function BodyScanPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [scans, setScans] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...BLANK_FORM, date: todayIso() });
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const units = profile?.units;
  const massUnit = units === "metric" ? "kg" : "lb";

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const [{ data: scanRows }, { data: metricRows }] = await Promise.all([
        supabase.from("body_scans").select("*").eq("user_id", profile.id).order("date", { ascending: false }),
        supabase.from("daily_metrics").select("date, weight, body_fat").eq("user_id", profile.id).order("date", { ascending: true }),
      ]);
      if (cancelled) return;
      setScans(scanRows || []);
      setMetrics(metricRows || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile]);

  function fmtMass(lb) {
    if (lb == null) return "—";
    const v = units === "metric" ? lb * 0.453592 : lb;
    return `${(Math.round(v * 10) / 10).toFixed(1)} ${massUnit}`;
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // The nearest daily_metrics (home scale) row to a scan's date, however far
  // away it is — "compare to my at home scales" only works if there's
  // something to compare against, even a few days off.
  function nearestMetric(dateIso) {
    let best = null;
    let bestDiff = Infinity;
    for (const m of metrics) {
      if (m.weight == null) continue;
      const diff = Math.abs(daysBetweenLocal(dateIso, m.date));
      if (diff < bestDiff) {
        best = m;
        bestDiff = diff;
      }
    }
    return best ? { ...best, daysAway: bestDiff } : null;
  }

  async function save() {
    if (!form.date) {
      setErr("Pick a date.");
      return;
    }
    if (form.weight === "" || form.body_fat_pct === "") {
      setErr("Weight and body fat % at minimum — everything else here is optional.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const payload = {
        user_id: profile.id,
        date: form.date,
        source: form.source.trim() || null,
        notes: form.notes.trim() || null,
      };
      for (const key of MASS_FIELDS) payload[key] = toStorageLb(numOrNull(form[key]), units);
      for (const key of PLAIN_FIELDS) payload[key] = numOrNull(form[key]);

      const { data, error } = await supabase.from("body_scans").insert(payload).select().single();
      if (error) throw error;
      setScans((prev) => [data, ...prev].sort((a, b) => (a.date < b.date ? 1 : -1)));
      setForm({ ...BLANK_FORM, date: todayIso() });
      setAdding(false);
    } catch (e) {
      setErr(e.message || "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteScan(id) {
    const { error } = await supabase.from("body_scans").delete().eq("id", id).eq("user_id", profile.id);
    if (!error) setScans((prev) => prev.filter((s) => s.id !== id));
    setPendingDelete(null);
  }

  if (profileLoading || loading) return <div className="center-loading">Loading…</div>;

  return (
    <div className="shell shell-with-nav">
      <AppHeader eyebrow="Body Composition" title="Body Scans" />
      {profileError && <div className="error-note">{profileError}</div>}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 6 }}>What this is</p>
        <p className="field-hint" style={{ fontSize: 12.5 }}>
          For readings from a proper body-composition scale — the kind at a gym with a left/right segmental
          breakdown — rather than your everyday weigh-in. Log one whenever you get on one, weekly or ad hoc.
          Kept separate from your daily weigh-ins on Overview: a different machine reads body fat % differently,
          and mixing the two into one trend would make it noisier, not more accurate. This is here for spotting
          muscle imbalances and sanity-checking your home scale against, side by side.
        </p>
      </div>

      {!adding ? (
        <button type="button" className="btn primary" style={{ width: "auto", padding: "10px 18px" }} onClick={() => setAdding(true)}>
          + Log a body scan
        </button>
      ) : (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>Log a Body Scan</p>
          {err && <div className="error-note">{err}</div>}

          <div className="field-row">
            <div className="field">
              <label className="field-label">Date</label>
              <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Source</label>
              <input type="text" value={form.source} onChange={(e) => setField("source", e.target.value)} placeholder="Gym InBody scan" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Weight ({massUnit})</label>
              <input type="number" inputMode="decimal" step="0.1" value={form.weight} onChange={(e) => setField("weight", e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Body fat %</label>
              <input type="number" inputMode="decimal" step="0.1" value={form.body_fat_pct} onChange={(e) => setField("body_fat_pct", e.target.value)} />
            </div>
          </div>

          <details className="more" style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muscle)" }}>Whole-body detail (optional)</summary>
            <div style={{ marginTop: 10 }}>
              <div className="field-row">
                <div className="field"><label className="field-label">BMI</label><input type="number" step="0.1" value={form.bmi} onChange={(e) => setField("bmi", e.target.value)} /></div>
                <div className="field"><label className="field-label">Visceral fat rating</label><input type="number" step="0.1" value={form.visceral_fat_rating} onChange={(e) => setField("visceral_fat_rating", e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="field-label">Total fat mass ({massUnit})</label><input type="number" step="0.1" value={form.fat_mass_total} onChange={(e) => setField("fat_mass_total", e.target.value)} /></div>
                <div className="field"><label className="field-label">Skeletal muscle mass ({massUnit})</label><input type="number" step="0.1" value={form.skeletal_muscle_mass} onChange={(e) => setField("skeletal_muscle_mass", e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="field-label">Soft lean mass ({massUnit})</label><input type="number" step="0.1" value={form.soft_lean_mass} onChange={(e) => setField("soft_lean_mass", e.target.value)} /></div>
                <div className="field"><label className="field-label">Total lean mass ({massUnit})</label><input type="number" step="0.1" value={form.lean_mass_total} onChange={(e) => setField("lean_mass_total", e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="field-label">BMR (kcal)</label><input type="number" step="1" value={form.bmr} onChange={(e) => setField("bmr", e.target.value)} /></div>
                <div className="field"><label className="field-label">Phase angle (°)</label><input type="number" step="0.1" value={form.phase_angle} onChange={(e) => setField("phase_angle", e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="field-label">Body water (L)</label><input type="number" step="0.1" value={form.body_water_l} onChange={(e) => setField("body_water_l", e.target.value)} /></div>
                <div className="field"><label className="field-label">Body water %</label><input type="number" step="0.1" value={form.body_water_pct} onChange={(e) => setField("body_water_pct", e.target.value)} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="field-label">Extracellular water (L)</label><input type="number" step="0.1" value={form.ecw_l} onChange={(e) => setField("ecw_l", e.target.value)} /></div>
                <div className="field"><label className="field-label">Extracellular water %</label><input type="number" step="0.1" value={form.ecw_pct} onChange={(e) => setField("ecw_pct", e.target.value)} /></div>
              </div>
              <div className="field" style={{ maxWidth: "50%" }}>
                <label className="field-label">Intracellular water (L)</label>
                <input type="number" step="0.1" value={form.icw_l} onChange={(e) => setField("icw_l", e.target.value)} />
              </div>
            </div>
          </details>

          {FAMILIES.map((fam) => (
            <details className="more" key={fam.prefix} style={{ marginTop: 10 }}>
              <summary style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muscle)" }}>{fam.label} (optional)</summary>
              <div style={{ marginTop: 10 }}>
                <div className="field-row">
                  {SEGMENTS.slice(0, 2).map((s) => (
                    <div className="field" key={s.key}>
                      <label className="field-label">{s.label} ({massUnit})</label>
                      <input type="number" step="0.1" value={form[`${fam.prefix}_${s.key}`]} onChange={(e) => setField(`${fam.prefix}_${s.key}`, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="field-row">
                  {SEGMENTS.slice(2, 4).map((s) => (
                    <div className="field" key={s.key}>
                      <label className="field-label">{s.label} ({massUnit})</label>
                      <input type="number" step="0.1" value={form[`${fam.prefix}_${s.key}`]} onChange={(e) => setField(`${fam.prefix}_${s.key}`, e.target.value)} />
                    </div>
                  ))}
                </div>
                <div className="field" style={{ maxWidth: "50%" }}>
                  <label className="field-label">Torso ({massUnit})</label>
                  <input type="number" step="0.1" value={form[`${fam.prefix}_torso`]} onChange={(e) => setField(`${fam.prefix}_torso`, e.target.value)} />
                </div>
              </div>
            </details>
          ))}

          <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
            <label className="field-label">Notes (optional)</label>
            <input type="text" value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Fasted, post-workout, which machine…" />
          </div>

          <div className="btn-row">
            <button type="button" className="btn primary" style={{ width: "auto", padding: "10px 18px" }} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save scan"}
            </button>
            <button type="button" className="btn ghost" onClick={() => { setAdding(false); setErr(""); }}>Cancel</button>
          </div>
        </div>
      )}

      {scans.length === 0 ? (
        <div className="card"><p className="meal-desc">No scans logged yet — add your first one above.</p></div>
      ) : (
        scans.map((scan) => {
          const home = nearestMetric(scan.date);
          const homeBodyFat = home?.body_fat != null ? Number(home.body_fat) : null;
          const scanBodyFat = scan.body_fat_pct != null ? Number(scan.body_fat_pct) : null;
          return (
            <div className="card" key={scan.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <p className="eyebrow" style={{ marginBottom: 0 }}>{fmtDate(scan.date)}{scan.source ? ` · ${scan.source}` : ""}</p>
                {pendingDelete === scan.id ? (
                  <span style={{ display: "flex", gap: 8 }}>
                    <button type="button" className="btn ghost" style={{ color: "var(--bad)" }} onClick={() => deleteScan(scan.id)}>Confirm delete</button>
                    <button type="button" className="btn ghost" onClick={() => setPendingDelete(null)}>Cancel</button>
                  </span>
                ) : (
                  <button type="button" className="btn ghost" onClick={() => setPendingDelete(scan.id)}>Delete</button>
                )}
              </div>

              <div className="stat-row" style={{ marginTop: 10, flexWrap: "wrap" }}>
                <div className="stat"><div className="k">Weight</div><div className="v">{fmtMass(scan.weight)}</div></div>
                <div className="stat"><div className="k">Body fat</div><div className="v">{scanBodyFat != null ? `${scanBodyFat}%` : "—"}</div></div>
                <div className="stat"><div className="k">Visceral fat</div><div className="v">{scan.visceral_fat_rating ?? "—"}</div></div>
                <div className="stat"><div className="k">BMR</div><div className="v">{scan.bmr ?? "—"}</div></div>
              </div>

              {home && (
                <p className="meal-desc" style={{ marginTop: 10 }}>
                  Nearest home weigh-in: {fmtDate(home.date)}{home.daysAway ? ` (${home.daysAway}d away)` : ""} — {fmtMass(home.weight)}
                  {homeBodyFat != null ? `, ${homeBodyFat}% body fat` : ""}.
                  {homeBodyFat != null && scanBodyFat != null && (
                    ` Body fat % reads ${Math.abs(homeBodyFat - scanBodyFat).toFixed(1)}pt ${homeBodyFat > scanBodyFat ? "higher" : "lower"} on the home scale — different devices read differently, so some gap is expected.`
                  )}
                </p>
              )}

              <AsymmetryRows scan={scan} massUnit={massUnit} units={units} />

              {scan.notes && <p className="meal-desc" style={{ marginTop: 8 }}>📝 {scan.notes}</p>}
            </div>
          );
        })
      )}

      <BottomNav />
    </div>
  );
}

// One row per paired body part per mass family (fat/muscle/lean × arms/legs)
// that actually has both sides logged — this is the whole point of the
// table: spotting a left/right imbalance a single overall number can't show.
function AsymmetryRows({ scan, massUnit, units }) {
  function toDisplay(lb) {
    if (lb == null) return null;
    const n = Number(lb);
    if (Number.isNaN(n)) return null;
    return units === "metric" ? n * 0.453592 : n;
  }

  const rows = [];
  for (const fam of FAMILIES) {
    for (const pair of PAIRS) {
      const l = toDisplay(scan[`${fam.prefix}_${pair.left}`]);
      const r = toDisplay(scan[`${fam.prefix}_${pair.right}`]);
      if (l == null || r == null) continue;
      const avg = (l + r) / 2;
      const diffPct = avg > 0 ? (Math.abs(l - r) / avg) * 100 : 0;
      rows.push({ key: `${fam.prefix}_${pair.side}`, label: `${fam.label.replace(" by segment", "")} — ${pair.label}`, l, r, diffPct });
    }
  }
  if (!rows.length) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <p className="field-label" style={{ marginBottom: 6 }}>Left / right balance</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 4, fontSize: 12, padding: "6px 10px", background: "var(--bg-raised)", border: "1px solid var(--line)", borderRadius: 8 }}>
            <span>{r.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {r.l.toFixed(1)} / {r.r.toFixed(1)} {massUnit}
              {r.diffPct >= 8 ? (
                <strong style={{ color: "var(--warn)", marginLeft: 6 }}>· {r.diffPct.toFixed(0)}% off — worth watching</strong>
              ) : (
                <span style={{ color: "var(--good)", marginLeft: 6 }}>· balanced</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
