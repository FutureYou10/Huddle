"use client";

import { useState } from "react";
import { fmtDate, addDays, daysBetween, todayIso } from "../../lib/coaching";

// Nutrition/training discipline used to be plotted here too, but they don't
// really belong on a body-composition phase chart (their own Workout
// Checklist / Food Discipline cards below cover that) — same call the
// original dashboard made.
const METRICS = [
  { key: "fatLossPct", label: "Fat loss progress", color: "var(--fat)" },
  { key: "muscleGainPct", label: "Muscle gain progress", color: "var(--muscle)" },
];

const RANGE_DAYS = { week: 7, month: 30, quarter: 90 };
const RANGES = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "all", label: "All" },
];

// Plots every real check-in (`series`) as its own point in time — real
// up-and-down movement, not a single straight line from start to today —
// with a week/month/quarter/all filter, and a dashed "target pace" line
// (where fat-loss/muscle-gain % would be if landing exactly on goal by the
// end date) scaled to whatever window is selected.
export default function PhaseProgressChart({ progress, series }) {
  const [range, setRange] = useState("month");
  if (!progress) return <div className="empty-state">Fills in once your goal and baseline are set.</div>;
  const { milestones } = progress;
  const points = series || [];

  const today = todayIso();
  const cutoff = range === "all" ? milestones.start : addDays(today, -RANGE_DAYS[range]);
  const windowStart = cutoff > milestones.start ? cutoff : milestones.start;
  const windowEnd = today;
  const visible = points.filter((p) => p.date >= windowStart && p.date <= windowEnd);

  const left = 54, right = 740, top = 20, bottom = 195, floor = 230;
  const yMin = -20, yMax = 100;
  const yFor = (pct) => bottom - ((Math.max(yMin, Math.min(yMax, pct)) - 0) / (yMax - 0)) * (bottom - top);
  const totalWindowDays = Math.max(1, daysBetween(windowStart, windowEnd));
  const xFor = (dateIso) => left + (daysBetween(windowStart, dateIso) / totalWindowDays) * (right - left);

  const totalPhaseDays = Math.max(1, daysBetween(milestones.start, milestones.end));
  const paceAt = (dateIso) => (daysBetween(milestones.start, dateIso) / totalPhaseDays) * 100;

  const ticks = [0, 1 / 3, 2 / 3, 1].map((frac) => addDays(windowStart, Math.round(totalWindowDays * frac)));

  return (
    <div className="phase-chart-wrap">
      <div className="segmented" style={{ marginBottom: 12, maxWidth: 320 }}>
        {RANGES.map((r) => (
          <button key={r.key} type="button" className={range === r.key ? "active" : ""} onClick={() => setRange(r.key)}>{r.label}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">No check-ins logged in this range yet.</div>
      ) : (
        <svg viewBox="0 0 760 260" width="100%" style={{ minWidth: 640 }} role="img"
          aria-label={METRICS.map((m) => `${m.label}: ${progress[m.key].toFixed(1)}% currently`).join("; ")}>
          <g stroke="var(--line)" strokeWidth="1">
            <line x1={left} y1={bottom} x2={right} y2={bottom} />
            <line x1={left} y1={(bottom + top) / 2} x2={right} y2={(bottom + top) / 2} />
            <line x1={left} y1={top} x2={right} y2={top} />
            <line x1={left} y1={floor} x2={right} y2={floor} strokeDasharray="2 3" />
          </g>
          <g fill="var(--text-faint)" fontFamily="Inter, sans-serif" fontSize="10.5">
            <text x={left - 8} y={bottom + 3} textAnchor="end">0%</text>
            <text x={left - 8} y={(bottom + top) / 2 + 3} textAnchor="end">50%</text>
            <text x={left - 8} y={top + 3} textAnchor="end">100%</text>
            <text x={left - 8} y={floor + 3} textAnchor="end">{yMin}%</text>
          </g>

          <path
            d={`M${xFor(windowStart)},${yFor(paceAt(windowStart))} L${xFor(windowEnd)},${yFor(paceAt(windowEnd))}`}
            fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5 4"
          />

          {METRICS.map((m) => (
            <path
              key={m.key}
              d={visible.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(p.date)},${yFor(p[m.key])}`).join(" ")}
              fill="none" stroke={m.color} strokeWidth="2.5"
            />
          ))}
          {METRICS.map((m) => (
            <g key={m.key}>
              {visible.map((p, i) => {
                const isLast = i === visible.length - 1;
                return (
                  <circle key={p.date} cx={xFor(p.date)} cy={yFor(p[m.key])} r={isLast ? 5 : 3.5} fill={m.color} opacity={isLast ? 1 : 0.85}>
                    <title>{fmtDate(p.date)} · {m.label}: {p[m.key].toFixed(1)}%</title>
                  </circle>
                );
              })}
            </g>
          ))}

          <g fontFamily="Inter, sans-serif" fontSize="10.5" fill="var(--text-faint)" textAnchor="middle">
            {ticks.map((d, i) => <text key={i} x={xFor(d)} y={250}>{fmtDate(d)}</text>)}
          </g>
        </svg>
      )}

      <div className="phase-legend">
        {METRICS.map((m) => (
          <span key={m.key}><i className="sw" style={{ background: m.color }} />{m.label} — {progress[m.key].toFixed(1)}% currently</span>
        ))}
        <span><i className="sw dash" />Target pace (grey, dashed)</span>
      </div>
    </div>
  );
}
