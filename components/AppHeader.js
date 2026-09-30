"use client";

import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

export default function AppHeader({ title, eyebrow = "Huddle" }) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="top-row">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="page-title">{title}</h1>
      </div>
      <button className="logout" onClick={handleLogout}>Sign out</button>
    </div>
  );
}
