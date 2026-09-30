"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./supabaseClient";
import { ensureProfile } from "./ensureProfile";

// Shared by every dashboard page: confirms there's a session (redirecting to
// /login if not), then fetches-or-creates the profile row. Each page then
// does its own fetch for whatever data it needs once `profile` is ready.
export function useProfile() {
  const router = useRouter();
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
        if (!cancelled) setState({ loading: false, session, profile, error: "" });
      } catch (err) {
        if (!cancelled) {
          setState({ loading: false, session, profile: null, error: err.message || "Couldn't load your profile." });
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, [router]);

  return state;
}
