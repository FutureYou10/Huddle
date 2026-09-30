"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setInfo("Account created. If email confirmation is on, check your inbox — otherwise you're signed in already.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <p className="eyebrow">Getstacked</p>
      <h1 className="page-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>

      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div className="field">
          <label className="field-label">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </div>

        {error && <div className="error-note" style={{ marginBottom: 12 }}>{error}</div>}
        {info && <div className="note" style={{ marginBottom: 12 }}>{info}</div>}

        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Sign up" : "Sign in"}
        </button>

        <button
          type="button"
          className="btn ghost"
          style={{ marginTop: 10 }}
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
            setInfo("");
          }}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}
