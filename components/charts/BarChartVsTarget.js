"use client";

import { fmtDate } from "../../lib/coaching";

// A row of day-bars against a flat target line. Used for calories/protein
// this week, and for the steps trend. `days` is [{date, value, complete,
// isToday}] — value null means "not logged yet" (hollow marker, not a zero).
export default function BarChartVsTarget({ days, target, color, unit, targetLabel }) {
  const W = 700;
  const chartTop = 15, chartBottom = 60, left = 40, right = 680;
  const withValues = days.map((d) => d.value).filter((v) => v != null);
  const maxVal = Math.max(target || 0, ...withValues, 1) * 1.15;

  const barW = 28;
  const slot = (right - left) / days.length;
  const yFor = (v) => chartBottom - (v / maxVal) * (chartBottom - chartTop);
  const targetY = yFor(target || 0);

  return (
    <div className="chart-scroll">
    <svg viewBox={`0 0 ${W} 92`} width="100%" style={{ minWidth: 480 }} role="img"
      aria-label={`${days.map((d) => `${fmtDate(d.date)} ${d.value != null ? d.value + (d.isToday ? " so far" : "") : "not logged yet"}`).join("; ")} vs a target of ${target}${unit || ""}`}>
      <g fontFamily="Inter, sans-serif">
        <line x1={left} y1={targetY} x2={right} y2={targetY} stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5 4" />
        <text x={right + 6} y={targetY + 3} fontSize="9.5" fill="var(--text-faint)">{targetLabel ?? target}</text>
        <line x1={left} y1={8} x2={left} y2={chartBottom} stroke="var(--line)" strokeWidth="1" />
        <line x1={left} y1={chartBottom} x2={right} y2={chartBottom} stroke="var(--line)" strokeWidth="1" />

        {days.map((d, i) => {
          const cx = left + slot * (i + 0.5);
          if (d.value == null) {
            return (
              <g key={d.date}>
                <circle cx={cx} cy={24} r="7" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeDasharray="3 2" />
                <text x={cx} y={74} fontSize="10" fill="var(--text-dim)" textAnchor="middle">{fmtDate(d.date)}</text>
                <text x={cx} y={86} fontSize="9" fill="var(--text-faint)" textAnchor="middle">no log yet</text>
              </g>
            );
          }
          const barY = yFor(d.value);
          const over = d.value > (target || 0);
          return (
            <g key={d.date}>
              <rect
                x={cx - barW / 2} y={barY} width={barW} height={Math.max(0, chartBottom - barY)} rx="3"
                fill={color}
                stroke={d.isToday ? "var(--warn)" : "none"}
                strokeWidth={d.isToday ? "1.5" : "0"}
                strokeDasharray={d.isToday ? "3 2" : "0"}
              />
              <text x={cx} y={barY - 6} fontSize="9" fill={over ? "var(--bad)" : "var(--warn)"} textAnchor="middle">
                {Math.round(d.value).toLocaleString()}{d.isToday ? " so far" : ""}
              </text>
              <text x={cx} y={74} fontSize="10" fill="var(--text-dim)" textAnchor="middle">{fmtDate(d.date)}</text>
            </g>
          );
        })}
      </g>
    </svg>
    </div>
  );
}
