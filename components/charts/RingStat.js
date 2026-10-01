"use client";

// A circular progress ring for a single "today vs target" stat — fills
// toward the target, then switches to the over-color once the day goes past
// it, so closing the gap vs going over read as two visually distinct states.
export default function RingStat({ label, value, target, unit = "", color = "var(--muscle)", overColor = "var(--bad)", size = 76, stroke = 7 }) {
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? value / target : 0;
  const clamped = Math.max(0, Math.min(pct, 1));
  const over = hasTarget && pct > 1;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamped;
  const ringColor = over ? overColor : color;
  const gapText = !hasTarget
    ? "no target set"
    : over
    ? `+${Math.round(value - target)}${unit} over`
    : `${Math.round(target - value)}${unit} to go`;

  return (
    <div className="ring-tile">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        {hasTarget && (
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke={ringColor} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text x="50%" y="45%" textAnchor="middle" dominantBaseline="middle" fontFamily="Oswald, sans-serif" fontSize="15" fontWeight="700" fill="var(--text)">
          {Math.round(value)}
        </text>
        <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, sans-serif" fontSize="9.5" fill="var(--text-faint)">
          / {hasTarget ? `${Math.round(target)}${unit}` : "—"}
        </text>
      </svg>
      <div className="ring-tile-label">{label}</div>
      <div className="ring-tile-gap" style={{ color: over ? overColor : "var(--text-faint)" }}>{gapText}</div>
    </div>
  );
}
