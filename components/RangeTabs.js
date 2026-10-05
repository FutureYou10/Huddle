"use client";

// Small Day / Week / Month (etc.) switcher shared by the dashboards. Pure
// presentation — the parent owns which option is selected.
export default function RangeTabs({ value, onChange, options, label = "Time range" }) {
  return (
    <div className="segmented range-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} className={value === o.key ? "active" : ""} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
