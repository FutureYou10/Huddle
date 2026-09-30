"use client";

// A tiny inline trend line for a lift's top-set weight over its last few
// sessions — no axes, just shape + a highlighted latest point.
export default function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const w = 160, h = 40, pad = 5;
  const vals = points.map((p) => p.weight);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const stepX = (w - 2 * pad) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.weight - min) / range) * (h - 2 * pad);
    return [x, y];
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--accent)" />
    </svg>
  );
}
