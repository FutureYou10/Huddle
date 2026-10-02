"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "./supabaseClient";
import { ensureProfile } from "./ensureProfile";
import { applyTheme } from "./theme";
import { isOnboarded } from "./onboardingStatus";

// Shared by every dashboard page: confirms there's a session (redirecting to
// /login if not), then fetches-or-creates the profile row. Each page then
// does its own fetch for whatever data it needs once `profile` is ready.
//
// A brand-new profile has no training_split yet (ensureProfile only sets id
// + name), so this also sends a not-yet-onboarded user straight to
// /onboarding instead of letting them land on an empty, math-free dashboard
// — the same isOnboarded signal the cron jobs already use server-side.
// Already-onboarded users are never redirected there automatically; the
// only way back into onboarding once a plan exists is the explicit
// "Rebuild my plan" link in Settings.
export function useProfile() {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true, session: null, profile: null, error: "" });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }
      try {
        const profile = await ensureProfile(session);
        applyTheme(profile.theme);
        if (cancelled) return;
        if (!isOnboarded(profile) && pathname !== "/onboarding") {
          router.replace("/onboarding");
          return;
        }
        setState({ loading: false, session, profile, error: "" });
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, session, profile: null, error: err.message || "Couldn't load your profile." });
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [router, pathname]);

  return state;
}
