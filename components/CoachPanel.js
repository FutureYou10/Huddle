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
  const [speakingId, setSpeakingId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open || threads[tab] !== undefined) return;
    loadThread(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, tab, sending, open]);

  // Stop any reply being read aloud when the panel closes or the coach tab
  // changes — nothing should keep talking once you've left that thread.
  useEffect(() => {
    if (!open && typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Read a coach reply aloud with the browser's built-in voice — free, and
  // well supported in Safari/iOS, unlike in-browser speech-to-text. Tapping
  // the same reply again stops it.
  function toggleSpeak(id, text) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (speakingId === id) {
      setSpeakingId(null);
      return;
    }
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
    utterance.onerror = () => setSpeakingId((cur) => (cur === id ? null : cur));
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

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
        <div className="coach-handle" />
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
          {list.map((m) =>
            m.role === "assistant" ? (
              <div key={m.id} className="coach-msg-row">
                <div className="coach-msg coach-msg-assistant">{m.body}</div>
                <button
                  type="button"
                  className={`coach-speak${speakingId === m.id ? " active" : ""}`}
                  onClick={() => toggleSpeak(m.id, m.body)}
                  aria-label={speakingId === m.id ? "Stop reading aloud" : "Read reply aloud"}
                >
                  {speakingId === m.id ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                  {speakingId === m.id ? "Stop" : "Listen"}
                </button>
              </div>
            ) : (
              <div key={m.id} className={`coach-msg coach-msg-${m.role}`}>{m.body}</div>
            )
          )}
          {sending && <div className="coach-msg coach-msg-assistant coach-msg-typing">…</div>}
        </div>

        {error && <div className="error-note" style={{ margin: "0 14px 8px" }}>{error}</div>}

        <div className="coach-input-row">
          <div className="coach-input-wrap">
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
            <button type="button" className="coach-send" onClick={send} disabled={sending || !input.trim()} aria-label="Send message">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5" />
                <path d="M6 11l6-6 6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
