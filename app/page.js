"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fmtDate, fmtWeight, projectGoal } from "../lib/coaching";
import { useProfile } from "../lib/useProfile";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

function TrendChart({ points }) {
  const valid = points.filter((p) => p.weight != null);
  if (valid.length < 2) {
    return <div className="note">Weigh-ins will start trending here once a couple have synced in.</div>;
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
      <polygon points={`${x(0)},80 ${linePts} ${x(n - 1)},80`} fill="url(#trendFill)" />
      <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(0)} cy={y(first.weight)} r="3.5" fill="var(--bg-card)" stroke="var(--accent)" strokeWidth="2" />
      <circle cx={x(n - 1)} cy={y(last.weight)} r="5" fill="var(--accent)" />
      <text x={x(0)} y="92" fontSize="8.5" fill="var(--text-faint)">{fmtDate(first.date)}</text>
      <text x={x(n - 1)} y="92" fontSize="8.5" fill="var(--text-faint)" textAnchor="end">{fmtDate(last.date)}</text>
    </svg>
  );
}

export default function OverviewPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    supabase
      .from("daily_metrics")
      .select("*")
      .eq("user_id", profile.id)
      .order("date", { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        setMetrics(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [profile]);

  if (profileLoading || (profile && loading)) return <div className="center-loading">Loading your dashboard…</div>;

  const units = profile?.units || "imperial";
  const withWeight = metrics.filter((m) => m.weight != null);
  const latest = withWeight[withWeight.length - 1];
  const goal = latest && profile ? projectGoal(profile, latest.weight) : null;

  return (
    <div className="shell shell-with-nav">
      <AppHeader title={profile?.name ? `${profile.name}'s Plan` : "Your Plan"} />

      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

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
          <div className="note" style={{ marginBottom: 14 }}>No weigh-ins synced yet.</div>
        )}
        <TrendChart points={metrics} />
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

      <BottomNav />
    </div>
  );
}
