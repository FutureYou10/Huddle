"use client";

import { fmtDate } from "../../lib/coaching";

const METRICS = [
  { key: "fatLossPct", label: "Fat loss progress", color: "var(--fat)" },
  { key: "muscleGainPct", label: "Muscle gain progress", color: "var(--muscle)" },
  { key: "nutritionPct", label: "Nutrition discipline", color: "var(--nutrition)" },
  { key: "trainingPct", label: "Training discipline", color: "var(--training)" },
];

// Three even phases from start to goal, each metric plotted as a short line
// from Start (0%) to today's reading — same shape as the real dashboard's
// phase-progress chart, generalised to whatever `progress` values come in.
export default function PhaseProgressChart({ progress }) {
  if (!progress) return <div className="empty-state">Fills in once your goal and baseline are set.</div>;
  const { milestones, elapsedPct } = progress;
  const left = 54, right = 740, top = 20, bottom = 195, floor = 230;
  const yMin = -20, yMax = 100;
  const yFor = (pct) => bottom - ((Math.max(yMin, Math.min(yMax, pct)) - 0) / (yMax - 0)) * (bottom - top);
  const xFor = (frac) => left + frac * (right - left);
  const todayX = xFor(Math.min(1, Math.max(0, elapsedPct / 100)));

  return (
    <div className="phase-chart-wrap">
      <svg viewBox="0 0 760 260" width="100%" style={{ minWidth: 640 }} role="img"
        aria-label={METRICS.map((m) => `${m.label}: ${progress[m.key].toFixed(1)}%`).join("; ")}>
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
        <path d={`M${left},${bottom} L${right},${top}`} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5 4" />
        {METRICS.map((m) => (
          <path key={m.key} d={`M${left},${bottom} L${todayX},${yFor(progress[m.key])}`} fill="none" stroke={m.color} strokeWidth="2.5" />
        ))}
        {METRICS.map((m) => (
          <circle key={m.key} cx={todayX} cy={yFor(progress[m.key])} r="5" fill={m.color} />
        ))}
        <g fontFamily="Oswald, sans-serif" fontSize="12" fontWeight="600" fill="var(--text-dim)" textAnchor="middle">
          <text x={left} y={250}>Start</text>
          <text x={xFor(1 / 3)} y={250}>Phase 1</text>
          <text x={xFor(2 / 3)} y={250}>Phase 2</text>
          <text x={right} y={250}>Goal</text>
        </g>
        <g fontFamily="Inter, sans-serif" fontSize="10.5" fill="var(--text-faint)" textAnchor="middle">
          <text x={left} y={264}>{fmtDate(milestones.start)}</text>
          <text x={xFor(1 / 3)} y={264}>{fmtDate(milestones.phase1)}</text>
          <text x={xFor(2 / 3)} y={264}>{fmtDate(milestones.phase2)}</text>
          <text x={right} y={264}>{fmtDate(milestones.end)}</text>
        </g>
      </svg>
      <div className="phase-legend">
        {METRICS.map((m) => (
          <span key={m.key}><i className="sw" style={{ background: m.color }} />{m.label} — {progress[m.key].toFixed(1)}%</span>
        ))}
        <span><i className="sw dash" />Target pace (grey, dashed)</span>
      </div>
    </div>
  );
}
