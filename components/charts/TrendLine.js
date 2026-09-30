"use client";

import { fmtDate } from "../../lib/coaching";

// A small line-with-dots trend chart, optionally against a dashed pace
// reference line — used for Fat Mass and Lean Mass trends.
export default function TrendLine({ points, paceValue, paceLabel, color }) {
  const valid = points.filter((p) => p.value != null);
  if (valid.length < 2) {
    return <div className="note">Trending here once a couple more readings land.</div>;
  }
  const vals = valid.map((p) => p.value).concat(paceValue != null ? [paceValue] : []);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pad = Math.max(0.3, (max - min) * 0.25);
  const lo = min - pad, hi = max + pad;

  const W = 380, top = 15, bottom = 80, left = 40, right = 360;
  const n = valid.length;
  const x = (i) => left + (n === 1 ? 0 : (i / (n - 1)) * (right - left));
  const y = (v) => bottom - ((v - lo) / (hi - lo || 1)) * (bottom - top);

  const path = valid.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} 90`} width="100%" role="img"
      aria-label={`${valid.map((p) => `${fmtDate(p.date)} ${p.value.toFixed(1)}`).join(", ")}${paceValue != null ? `, against a pace checkpoint of ${paceValue.toFixed(1)}` : ""}`}>
      <line x1={left} y1={top - 5} x2={left} y2={bottom} stroke="var(--line)" />
      <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--line)" />
      {paceValue != null && (
        <>
          <line x1={left} y1={y(paceValue)} x2={right} y2={y(paceValue)} stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="4 3" />
          <text x={right + 4} y={y(paceValue) + 3} fontSize="9" fill="var(--text-faint)">{paceLabel ?? paceValue.toFixed(1)}</text>
        </>
      )}
      <path d={path} stroke={color} strokeWidth="2.5" fill="none" />
      {valid.map((p, i) => (
        <g key={p.date}>
          <circle cx={x(i)} cy={y(p.value)} r="4" fill={color} />
          <text x={x(i)} y={y(p.value) < 30 ? y(p.value) + 16 : y(p.value) - 10} fontSize="10" fill="var(--text)" textAnchor="middle">{p.value.toFixed(1)}</text>
          <text x={x(i)} y={bottom + 10} fontSize="9.5" fill="var(--text-faint)" textAnchor="middle">{fmtDate(p.date)}</text>
        </g>
      ))}
    </svg>
  );
}
