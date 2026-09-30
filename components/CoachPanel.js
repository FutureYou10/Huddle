"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const TABS = [
  { key: "transformation", label: "Transformation" },
  { key: "nutritionist", label: "Nutritionist" },
  { key: "trainer", label: "Trainer" },
];

const GREETING = {
  transformation: "I'm your Transformation Coach — ask me about your trend, your goal, or how the week's shaping up.",
  nutritionist: "I'm your Nutritionist — tell me what you ate and I'll log it, or ask about your targets.",
  trainer: "I'm your Trainer — ask about today's session, or just check in before you lift.",
};

// A slide-up panel (not a route) so it can be opened from any dashboard page
// without losing that page's state underneath it. Three persistent threads —
// one per coach persona — each backed by coach_messages in Supabase.
export default function CoachPanel({ open, onClose }) {
  const [tab, setTab] = useState("transformation");
  const [threads, setThreads] = useState({});
  const [loadingTab, setLoadingTab] = useState({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open || threads[tab] !== undefined) return;
    loadThread(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, tab, sending, open]);

  async function loadThread(coach) {
    setLoadingTab((s) => ({ ...s, [coach]: true }));
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    if (!userId) {
      setLoadingTab((s) => ({ ...s, [coach]: false }));
      return;
    }
    const { data, error: err } = await supabase
      .from("coach_messages")
      .select("id, role, body")
      .eq("user_id", userId)
      .eq("coach", coach)
      .order("created_at", { ascending: true })
      .limit(60);
    if (err) setError(err.message);
    setThreads((t) => ({ ...t, [coach]: data || [] }));
    setLoadingTab((s) => ({ ...s, [coach]: false }));
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError("");
    const optimistic = { id: `local-${Date.now()}`, role: "user", body: text };
    setThreads((t) => ({ ...t, [tab]: [...(t[tab] || []), optimistic] }));
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Signed out — refresh and sign back in.");
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ coach: tab, message: text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Something went wrong.");
      setThreads((t) => ({ ...t, [tab]: [...(t[tab] || []), { id: `reply-${Date.now()}`, role: "assistant", body: json.reply }] }));
    } catch (err) {
      setError(err.message || "Couldn't reach your coach — try again.");
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  const list = threads[tab] || [];

  return (
    <div className="coach-overlay" onClick={onClose}>
      <div className="coach-panel" onClick={(e) => e.stopPropagation()}>
        <div className="coach-panel-head">
          <div className="coach-tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`coach-tab${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button type="button" className="coach-close" onClick={onClose} aria-label="Close chat">✕</button>
        </div>

        <div className="coach-messages" ref={scrollRef}>
          {loadingTab[tab] && list.length === 0 && <div className="coach-greeting">Loading…</div>}
          {!loadingTab[tab] && list.length === 0 && <div className="coach-greeting">{GREETING[tab]}</div>}
          {list.map((m) => (
            <div key={m.id} className={`coach-msg coach-msg-${m.role}`}>{m.body}</div>
          ))}
          {sending && <div className="coach-msg coach-msg-assistant coach-msg-typing">…</div>}
        </div>

        {error && <div className="error-note" style={{ margin: "0 14px 8px" }}>{error}</div>}

        <div className="coach-input-row">
          <textarea
            className="coach-input"
            rows={1}
            placeholder={tab === "nutritionist" ? "Tell me what you ate…" : "Message your coach…"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="coach-send" onClick={send} disabled={sending || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
