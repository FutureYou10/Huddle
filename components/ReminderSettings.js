"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function keyToBytes(base64Url) {
  const pad = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const REMINDERS = [
  ["reminder_weigh_in_time", "Weigh-in", "Until you've logged a weight"],
  ["reminder_lunch_time", "Log your food", "Only if nothing's been logged for 3 hours"],
  ["reminder_session_time", "Training session", "Training days only, until it's marked complete"],
];

// Home-screen install + push reminders. Saves instantly (like the theme
// picker) rather than going through the page's big Save bar.
export default function ReminderSettings({ profile }) {
  const [enabled, setEnabled] = useState(Boolean(profile.reminders_enabled));
  const [times, setTimes] = useState({
    reminder_weigh_in_time: profile.reminder_weigh_in_time || "07:30",
    reminder_lunch_time: profile.reminder_lunch_time || "13:00",
    reminder_session_time: profile.reminder_session_time || "17:30",
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [env, setEnv] = useState({ checked: false, supported: false, ios: false, standalone: false });

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setEnv({ checked: true, supported, ios, standalone });
    // Keep the saved timezone current (e.g. after moving abroad).
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (profile.reminders_enabled && tz && tz !== profile.timezone) {
      supabase.from("profiles").update({ timezone: tz }).eq("id", profile.id);
    }
  }, [profile]);

  async function turnOn() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (!PUBLIC_KEY) throw new Error("Reminders aren't set up on the server yet (missing VAPID key).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications are blocked — allow them for Huddle in your device settings, then try again.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(PUBLIC_KEY) });
      const json = sub.toJSON();
      const { error: subErr } = await supabase
        .from("push_subscriptions")
        .upsert({ user_id: profile.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: "endpoint" });
      if (subErr) throw subErr;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London";
      const { error: profErr } = await supabase.from("profiles").update({ reminders_enabled: true, timezone: tz }).eq("id", profile.id);
      if (profErr) throw profErr;
      setEnabled(true);
      setNote("Reminders are on for this device.");
    } catch (e) {
      setError(e.message || "Couldn't turn reminders on.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint).eq("user_id", profile.id);
        await sub.unsubscribe();
      }
      const { error: profErr } = await supabase.from("profiles").update({ reminders_enabled: false }).eq("id", profile.id);
      if (profErr) throw profErr;
      setEnabled(false);
      setNote("Reminders are off.");
    } catch (e) {
      setError(e.message || "Couldn't turn reminders off.");
    } finally {
      setBusy(false);
    }
  }

  async function setTime(key, value) {
    setTimes((t) => ({ ...t, [key]: value }));
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    setNote("");
    const { error: updErr } = await supabase.from("profiles").update({ [key]: value }).eq("id", profile.id);
    if (updErr) setError(updErr.message);
    else setError("");
  }

  async function sendTest() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/push/test", { method: "POST", headers: { authorization: `Bearer ${sessionData.session?.access_token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send a test.");
      setNote("Test sent — it should arrive in a few seconds.");
    } catch (e) {
      setError(e.message || "Couldn't send a test.");
    } finally {
      setBusy(false);
    }
  }

  const needsInstall = env.checked && env.ios && !env.standalone;

  return (
    <div className="card">
      <p className="eyebrow" style={{ marginBottom: 4 }}>Reminders</p>
      <p className="meal-desc" style={{ marginBottom: 10 }}>
        A nudge to weigh in, log your food, or start your session — only when you haven&rsquo;t already.
      </p>

      {needsInstall && (
        <div className="note" style={{ marginBottom: 10 }}>
          On iPhone, reminders only work from the home-screen app. In Safari tap Share, then <strong>Add to Home Screen</strong>, open Huddle from
          the new icon, and come back to this page.
        </div>
      )}
      {env.checked && !env.supported && !needsInstall && <div className="note" style={{ marginBottom: 10 }}>This browser doesn&rsquo;t support push reminders.</div>}
      {error && <div className="error-note" style={{ marginBottom: 10 }}>{error}</div>}
      {note && <p className="field-hint" style={{ marginBottom: 10 }}>{note}</p>}

      {enabled && (
        <div style={{ marginBottom: 12 }}>
          {REMINDERS.map(([key, label, hint]) => (
            <div className="field" key={key}>
              <label className="field-label">{label}</label>
              <input type="time" value={times[key]} onChange={(e) => setTime(key, e.target.value)} />
              <div className="field-hint">{hint}</div>
            </div>
          ))}
        </div>
      )}

      <div className="btn-row">
        {enabled ? (
          <>
            <button type="button" className="btn secondary" style={{ width: "auto", padding: "10px 18px" }} onClick={sendTest} disabled={busy}>
              Send test reminder
            </button>
            <button type="button" className="btn ghost" onClick={turnOff} disabled={busy}>Turn off</button>
          </>
        ) : (
          <button
            type="button"
            className="btn primary"
            style={{ width: "auto", padding: "10px 18px" }}
            onClick={turnOn}
            disabled={busy || needsInstall || (env.checked && !env.supported)}
          >
            {busy ? "Working…" : "Turn on reminders"}
          </button>
        )}
      </div>
    </div>
  );
}
