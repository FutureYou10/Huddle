"use client";

import { fmtDate } from "../../lib/coaching";

// Cumulative calories so far this week against a straight budget-pace line
// (weeklyBudget spread evenly across 7 days) — the Food Dashboard's signature
// chart: it shows whether the week is trending over or under budget, not just
// whether any single day was.
export default function WeekBudgetChart({ weekDates, calByDay, weeklyBudget, todayIso }) {
  const left = 40, right = 360, top = 15, bottom = 80;
  let running = 0;
  const points = weekDates.map((d, i) => {
    const logged = calByDay.has(d);
    if (logged && d <= todayIso) running += calByDay.get(d);
    return { date: d, day: i + 1, cumulative: logged || d < todayIso ? running : null, isToday: d === todayIso };
  });
  const paceAt = (dayNum) => (weeklyBudget || 0) * (dayNum / 7);
  const maxVal = Math.max(weeklyBudget || 0, ...points.map((p) => p.cumulative || 0), 1) * 1.1;

  const x = (dayNum) => left + ((dayNum - 1) / 6) * (right - left);
  const y = (v) => bottom - (v / maxVal) * (bottom - top);

  const known = points.filter((p) => p.cumulative != null);
  const path = known.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.day)},${y(p.cumulative)}`).join(" ");
  const pacePath = `M${x(1)},${y(paceAt(0))} L${x(7)},${y(paceAt(7))}`;

  const weekTotal = known.length ? known[known.length - 1].cumulative : 0;
  const paceSoFar = paceAt(known.length ? known[known.length - 1].day : 0);
  const delta = weekTotal - paceSoFar;

  return (
    <div className="chart-scroll">
      <svg viewBox="0 0 380 100" width="100%" style={{ minWidth: 340 }} role="img"
        aria-label={`Week-to-date cumulative calories ${Math.round(weekTotal)}, budget pace ${Math.round(paceSoFar)}, ${delta >= 0 ? "over" : "under"} by ${Math.abs(Math.round(delta))}`}>
        <line x1={left} y1={top - 5} x2={left} y2={bottom} stroke="var(--line)" />
        <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="var(--line)" />
        <path d={pacePath} stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5 4" fill="none" />
        <path d={path} stroke="var(--fat)" strokeWidth="2.5" fill="none" />
        {known.map((p) => (
          <circle key={p.date} cx={x(p.day)} cy={y(p.cumulative)} r={p.isToday ? 5 : 4} fill="var(--fat)" />
        ))}
        {points.map((p) => (
          <text key={p.date} x={x(p.day)} y={bottom + 12} fontSize="9.5" fill="var(--text-faint)" textAnchor="middle">{fmtDate(p.date)}</text>
        ))}
      </svg>
    </div>
  );
}
