"use client";

import { useRef, useState } from "react";
import { fmtDate } from "../lib/coaching";

// A Spotify-Wrapped-style highlight reel — one big stat per card, swipe
// through them. `cards` comes from lib/recap.js's buildRecap().
export default function RecapModal({ open, onClose, title, rangeStart, rangeEnd, cards }) {
  const [active, setActive] = useState(0);
  const trackRef = useRef(null);
  if (!open) return null;

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx);
  }

  return (
    <div className="recap-overlay" onClick={onClose}>
      <div className="recap-panel" onClick={(e) => e.stopPropagation()}>
        <div className="recap-head">
          <div>
            <div className="recap-title">{title}</div>
            <div className="recap-range">{fmtDate(rangeStart)} – {fmtDate(rangeEnd)}</div>
          </div>
          <button type="button" className="recap-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {cards.length === 0 ? (
          <div className="recap-empty">Not enough logged yet to recap this one — check back next time.</div>
        ) : (
          <>
            <div className="recap-track" ref={trackRef} onScroll={onScroll}>
              {cards.map((c, i) => (
                <div className="recap-card" key={i} style={{ background: `color-mix(in srgb, ${c.color} 14%, var(--bg-card))`, borderColor: c.color }}>
                  <div className="recap-card-icon">{c.icon}</div>
                  <div className="recap-card-title">{c.title}</div>
                  <div className="recap-card-value" style={{ color: c.color }}>{c.value}</div>
                  <div className="recap-card-sub">{c.sub}</div>
                </div>
              ))}
            </div>
            <div className="recap-dots">
              {cards.map((_, i) => <span key={i} className={`recap-dot${i === active ? " active" : ""}`} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
