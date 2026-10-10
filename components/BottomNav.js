"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { countUnread, totalUnread } from "../lib/unreadCoach";

function OverviewIcon({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5v-6h5v6H17.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function FoodIcon({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v7a2 2 0 0 0 4 0V3" />
      <path d="M9 10v11" />
      <path d="M16 3c-1.4 0-2.5 1.8-2.5 5s1.1 4.4 2.5 4.6V21" />
    </svg>
  );
}

function TrainingIcon({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12h2.5M19 12h2.5" />
      <rect x="5" y="9" width="2.5" height="6" rx="0.8" />
      <rect x="16.5" y="9" width="2.5" height="6" rx="0.8" />
      <path d="M7.5 12h9" />
      <rect x="3.5" y="10.3" width="1.5" height="3.4" rx="0.5" />
      <rect x="19" y="10.3" width="1.5" height="3.4" rx="0.5" />
    </svg>
  );
}

function CoachIcon({ active }) {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={active ? "var(--accent)" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H9l-4.5 4V16H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
      <circle cx="8.5" cy="10.75" r="0.9" fill={active ? "var(--accent)" : "currentColor"} stroke="none" />
      <circle cx="12" cy="10.75" r="0.9" fill={active ? "var(--accent)" : "currentColor"} stroke="none" />
      <circle cx="15.5" cy="10.75" r="0.9" fill={active ? "var(--accent)" : "currentColor"} stroke="none" />
    </svg>
  );
}

const TABS = [
  { href: "/", label: "Overview", Icon: OverviewIcon },
  { href: "/food", label: "Food", Icon: FoodIcon },
  { href: "/training", label: "Training", Icon: TrainingIcon },
];

// Coach is now its own full-screen page (app/coach) rather than a panel this
// component opened — so it's a plain Link like the other three tabs. The
// one thing it still owns is the aggregate unread badge: a quick count of
// unseen coach replies across all three threads, so "something's waiting"
// is visible from anywhere in the app, not just from inside the chat.
export default function BottomNav() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id;
      if (!userId) return;
      const { data } = await supabase
        .from("coach_messages")
        .select("coach, created_at")
        .eq("user_id", userId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(150);
      if (!cancelled) setUnread(totalUnread(countUnread(userId, data || [])));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const coachActive = pathname.startsWith("/coach");

  return (
    <nav className="bottom-nav">
      {TABS.map(({ href, label, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={`nav-tab${active ? " active" : ""}`}>
            <Icon active={active} />
            <span>{label}</span>
          </Link>
        );
      })}
      <Link href="/coach" className={`nav-tab${coachActive ? " active" : ""}`}>
        <span className="nav-icon-wrap">
          <CoachIcon active={coachActive} />
          {unread > 0 && <span className="nav-badge">{unread > 9 ? "9+" : unread}</span>}
        </span>
        <span>Coach</span>
      </Link>
    </nav>
  );
}
