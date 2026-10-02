"use client";

import { useId } from "react";

// Small cartoon avatars for the three AI coaches — replacing the old thin
// line-icons so the chat reads like messaging an actual character instead
// of a diagram. Each face is a self-contained colored circle (the coach's
// existing accent color) with features drawn on top, so it works standalone
// both on the coach-selector cards and as a per-message avatar. A clipPath
// (scoped with useId so multiple instances on one page never collide) keeps
// every decorative accent inside the circle at any size.

const INK = "rgba(20,18,16,0.82)";
const LIGHT = "rgba(255,255,255,0.85)";

// Calm, steady, focused on the long trend — a small "trending up" chevron
// accent nods to the original line-icon it replaces.
export function TransformationFace({ size = 44, className }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="24" cy="24" r="22" />
        </clipPath>
      </defs>
      <circle cx="24" cy="24" r="22" fill="var(--fat)" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M28 15l5-4.5" stroke={LIGHT} strokeWidth="2.2" strokeLinecap="round" fill="none" />
        <path d="M28 15l5.8-.6.6 5.4" stroke={LIGHT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="14.5" y="22.5" width="7" height="3.1" rx="1.55" fill={INK} />
        <rect x="26.5" y="22.5" width="7" height="3.1" rx="1.55" fill={INK} />
        <path d="M17 31.5c2.5 2.3 11.5 2.3 14 0" stroke={INK} strokeWidth="2.3" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

// Warm and caring — crescent smile-eyes, blushed cheeks, a little sprouting
// leaf for the "nourishment" of it.
export function NutritionistFace({ size = 44, className }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="24" cy="25" r="21" />
        </clipPath>
      </defs>
      <circle cx="24" cy="25" r="21" fill="var(--nutrition)" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M24 2.5c3.2 1 5 4.3 3.3 7.6-3.2-1-5-4.3-3.3-7.6Z" fill={LIGHT} />
        <ellipse cx="13" cy="29.5" rx="3" ry="2" fill={LIGHT} opacity="0.5" />
        <ellipse cx="35" cy="29.5" rx="3" ry="2" fill={LIGHT} opacity="0.5" />
        <path d="M13.5 22.5c1.6-2.3 5.2-2.3 6.8 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" fill="none" />
        <path d="M27.7 22.5c1.6-2.3 5.2-2.3 6.8 0" stroke={INK} strokeWidth="2.1" strokeLinecap="round" fill="none" />
        <path d="M16 31c3 4 13 4 16 0" stroke={INK} strokeWidth="2.3" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

// Pumped, energetic, a bit competitive — raised brows, a wide grin, and a
// headband arc for the "in the gym with you" feel.
export function TrainerFace({ size = 44, className }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx="24" cy="24" r="22" />
        </clipPath>
      </defs>
      <circle cx="24" cy="24" r="22" fill="var(--training)" />
      <g clipPath={`url(#${clipId})`}>
        <path d="M2 18c7-5.5 37-5.5 44 0" stroke={LIGHT} strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M14 21.5l5.5-2" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
        <path d="M28.5 19.5l5.5 2" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
        <circle cx="17.5" cy="26.5" r="2.1" fill={INK} />
        <circle cx="30.5" cy="26.5" r="2.1" fill={INK} />
        <path d="M15 31.5c3 5.5 15 5.5 18 0" stroke={INK} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}
