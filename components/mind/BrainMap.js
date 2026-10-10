"use client";

import { areaColor, isOpen, itemWeight } from "../../lib/mind";

const SIZE = 340;
const C = SIZE / 2;
const ORBIT = 104; // where the area atoms sit around "you"
const OUTER = 158; // the out-of-control ring

// The map: you in the middle, each life area as an atom on a synapse out from
// you, sized by how much headspace it's taking, with its open thoughts as
// electrons. Hollow electrons still need solving, filled ones are committed.
// Everything out of your control sits on the faint outer ring — visible, but
// deliberately apart from the stuff you can act on.
export default function BrainMap({ areas, items, selected, onSelect }) {
  const open = items.filter(isOpen);
  const outOfControl = open.filter((i) => i.control === "not_mine");
  const inControl = open.filter((i) => i.control !== "not_mine");

  const atoms = areas
    .map((a, index) => {
      const its = inControl.filter((i) => i.area_id === a.id);
      const weight = its.reduce((s, i) => s + itemWeight(i), 0);
      return { ...a, index, items: its, weight };
    })
    .filter((a) => a.items.length);
  const unfiled = inControl.filter((i) => !i.area_id || !areas.some((a) => a.id === i.area_id));
  if (unfiled.length) atoms.push({ id: "none", name: "Other", emoji: "•", index: areas.length, items: unfiled, weight: unfiled.reduce((s, i) => s + itemWeight(i), 0) });

  const maxWeight = Math.max(1, ...atoms.map((a) => a.weight));

  return (
    <svg className="brain-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Map of what's on your mind">
      <defs>
        <radialGradient id="core-glow">
          <stop offset="0%" style={{ stopColor: "rgba(var(--accent-rgb), 0.35)" }} />
          <stop offset="100%" style={{ stopColor: "rgba(var(--accent-rgb), 0)" }} />
        </radialGradient>
      </defs>

      {/* Out-of-control ring */}
      <g className={`ooc-ring${selected === "not_mine" ? " selected" : ""}`} onClick={() => onSelect(selected === "not_mine" ? null : "not_mine")}>
        <circle cx={C} cy={C} r={OUTER} className="ooc-circle" />
        {outOfControl.map((it, i) => {
          const a = (i / Math.max(outOfControl.length, 1)) * Math.PI * 2 - Math.PI / 2 + 0.3;
          return <circle key={it.id} cx={C + Math.cos(a) * OUTER} cy={C + Math.sin(a) * OUTER} r={4 + it.load} className="ooc-dot" />;
        })}
      </g>

      {/* Synapses */}
      {atoms.map((atom, i) => {
        const a = (i / atoms.length) * Math.PI * 2 - Math.PI / 2;
        const x = C + Math.cos(a) * ORBIT;
        const y = C + Math.sin(a) * ORBIT;
        return (
          <line key={atom.id} x1={C} y1={C} x2={x} y2={y} stroke={areaColor(atom.index, 0.35)} strokeWidth={1 + (atom.weight / maxWeight) * 4} strokeLinecap="round" />
        );
      })}

      {/* You */}
      <circle cx={C} cy={C} r={44} fill="url(#core-glow)" />
      <circle cx={C} cy={C} r={22} className="core" />
      <text x={C} y={C + 4} textAnchor="middle" className="core-label">you</text>

      {/* Atoms */}
      {atoms.map((atom, i) => {
        const a = (i / atoms.length) * Math.PI * 2 - Math.PI / 2;
        const x = C + Math.cos(a) * ORBIT;
        const y = C + Math.sin(a) * ORBIT;
        const r = 13 + Math.sqrt(atom.weight / maxWeight) * 15;
        const isSel = selected === atom.id;
        const labelBelow = y >= C - 10;
        return (
          <g key={atom.id} className={`atom${isSel ? " selected" : ""}`} onClick={() => onSelect(isSel ? null : atom.id)}>
            <circle cx={x} cy={y} r={r + 9} fill="transparent" />
            <circle cx={x} cy={y} r={r} fill={areaColor(atom.index)} className="atom-body" />
            <text x={x} y={y + 5} textAnchor="middle" className="atom-emoji">{atom.emoji || "•"}</text>
            <g className="electrons" style={{ transformOrigin: `${x}px ${y}px`, animationDuration: `${18 + i * 4}s` }}>
              {atom.items.map((it, j) => {
                const ea = (j / atom.items.length) * Math.PI * 2;
                const er = r + 8;
                const cls = it.stage === "committed" ? "e-committed" : it.stage === "solved" ? "e-solved" : "e-tangled";
                return (
                  <circle
                    key={it.id}
                    cx={x + Math.cos(ea) * er}
                    cy={y + Math.sin(ea) * er}
                    r={2.2 + it.load}
                    className={`electron ${cls}${it.loop_count > 2 ? " looping" : ""}`}
                    style={{ "--ec": areaColor(atom.index) }}
                  />
                );
              })}
            </g>
            <text x={x} y={labelBelow ? y + r + 22 : y - r - 15} textAnchor="middle" className="atom-label">
              {atom.name} · {atom.items.length}
            </text>
          </g>
        );
      })}

      {!open.length && (
        <text x={C} y={C + 62} textAnchor="middle" className="map-empty">
          Clear head. Nothing on the map.
        </text>
      )}
    </svg>
  );
}
