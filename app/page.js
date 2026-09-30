"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { fmtDate, fmtWeight, projectGoal } from "../lib/coaching";

function TrendChart({ points, units }) {
  const valid = points.filter((p) => p.weight != null);
  if (valid.length < 2) {
    return <div className="note">Log a couple more weigh-ins and your trend line shows up here.</div>;
  }

  const weights = valid.map((p) => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const pad = Math.max(1, (maxW - minW) * 0.2);
  const lo = minW - pad;
  const hi = maxW + pad;

  const W = 300, top = 14, bottom = 70, left = 4, right = 296;
  const n = valid.length;
  const x = (i) => left + (n === 1 ? 0 : (i / (n - 1)) * (right - left));
  const y = (w) => bottom - ((w - lo) / (hi - lo || 1)) * (bottom - top);

  const linePts = valid.map((p, i) => `${x(i)},${y(p.weight)}`).join(" ");
  const last = valid[n - 1];
  const first = valid[0];

  return (
    <svg viewBox={`0 0 ${W} 96`} width="100%" aria-hidden="true" className="trend-svg">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${x(0)},80 ${linePts} ${x(n - 1)},80`}
        fill="url(#trendFill)"
      />
      <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(0)} cy={y(first.weight)} r="3.5" fill="var(--bg-card)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(n - 1)} cy={y(last.weight)} r="5" fill="var(--accent)" />
      <text x={x(0)} y="92" fontSize="8.5" fill="var(--text-faint)">{fmtDate(first.date)}</text>
      <text x={x(n - 1)} y="92" fontSize="8.5" fill="var(--text-faint)" textAnchor="end">{fmtDate(last.date)}</text>
    </svg>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [meals, setMeals] = useState([]);
  const [target, setTarget] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      try {
        let { data: profileRow } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!profileRow) {
          const { data: created, error: createErr } = await supabase
            .from("profiles")
            .insert({ id: session.user.id, name: session.user.email.split("@")[0] })
            .select()
            .single();
          if (createErr) throw createErr;
          profileRow = created;
        }

        const [{ data: metricsRows }, { data: mealRows }, { data: targetRows }] = await Promise.all([
          supabase.from("daily_metrics").select("*").eq("user_id", profileRow.id).order("date", { ascending: true }),
          supabase.from("food_log").select("*").eq("user_id", profileRow.id).order("logged_at", { ascending: false }).limit(8),
          supabase.from("weekly_targets").select("*").eq("user_id", profileRow.id).order("week_start", { ascending: false }).limit(1),
        ]);

        if (cancelled) return;
        setProfile(profileRow);
        setMetrics(metricsRows || []);
        setMeals(mealRows || []);
        setTarget((targetRows && targetRows[0]) || null);
      } catch (err) {
        if (!cancelled) setError(err.message || "Couldn't load your data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) return <div className="center-loading">Loading your dashboard…</div>;

  const withWeight = metrics.filter((m) => m.weight != null);
  const latest = withWeight[withWeight.length - 1];
  const units = profile?.units || "imperial";
  const goal = latest ? projectGoal(profile, latest.weight) : null;

  return (
    <div className="shell">
      <div className="top-row">
        <div>
          <p className="eyebrow">Getstacked</p>
          <h1 className="page-title">{profile?.name ? `${profile.name}'s Plan` : "Your Plan"}</h1>
        </div>
        <button className="logout" onClick={handleLogout}>Sign out</button>
      </div>

      {error && <div className="error-note">{error}</div>}

      <div className="card">
        {latest ? (
          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat">
              <div className="k">Latest weight</div>
              <div className="v">{fmtWeight(latest.weight, units)}</div>
            </div>
            <div className="stat">
              <div className="k">As of</div>
              <div className="v">{fmtDate(latest.date)}</div>
            </div>
          </div>
        ) : (
          <div className="note" style={{ marginBottom: 14 }}>No weigh-ins logged yet.</div>
        )}
        <TrendChart points={metrics} units={units} />
      </div>

      {goal && (
        <div className="card">
          <div className="goal-hero">
            <div className="goal-hero-label">Projected in {goal.weeksLeft} weeks</div>
            <div className="goal-hero-value">
              {fmtWeight(goal.goalWeightLb, units).split(" ")[0]}
              <span className="goal-hero-unit">{fmtWeight(goal.goalWeightLb, units).split(" ")[1]}</span>
            </div>
            <div className="goal-hero-sub">by {fmtDate(profile.end_date)}</div>
          </div>
        </div>
      )}

      {target && (
        <div className="card">
          <p className="eyebrow" style={{ marginBottom: 10 }}>This Week's Targets</p>
          <div className="stat-row">
            <div className="stat">
              <div className="k">Calories</div>
              <div className="v">{target.daily_calorie_target ?? "—"}</div>
            </div>
            <div className="stat">
              <div className="k">Protein</div>
              <div className="v">{target.daily_protein_target_g ?? "—"}g</div>
            </div>
            <div className="stat">
              <div className="k">Carbs</div>
              <div className="v">{target.daily_carb_target_g ?? "—"}g</div>
            </div>
            <div className="stat">
              <div className="k">Fat</div>
              <div className="v">{target.daily_fat_target_g ?? "—"}g</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <p className="eyebrow" style={{ marginBottom: 10 }}>Recent Meals</p>
        {meals.length === 0 ? (
          <div className="note">Nothing logged yet.</div>
        ) : (
          meals.map((m) => (
            <div className="meal-row" key={m.id}>
              <div>
                <div className="meal-name">{m.meal}</div>
                <div className="meal-desc">{m.description}</div>
              </div>
              <div className="meal-cal">{m.calories} kcal</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
