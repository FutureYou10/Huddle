"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useProfile } from "../../lib/useProfile";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import { COACHES, markSeen, countUnread } from "../../lib/unreadCoach";
import { TransformationFace, NutritionistFace, TrainerFace } from "../../components/CoachFaces";

const COACH_META = {
  transformation: { label: "Transformation", tagline: "Your trend & the big picture", color: "var(--fat)", Face: TransformationFace },
  nutritionist: { label: "Nutritionist", tagline: "Log food, hit your targets", color: "var(--nutrition)", Face: NutritionistFace },
  trainer: { label: "Trainer", tagline: "Today's session", color: "var(--training)", Face: TrainerFace },
};

const GREETING = {
  transformation: "I'm your Transformation Coach — ask me about your trend, your goal, or how the week's shaping up.",
  nutritionist: "I'm your Nutritionist — tell me what you ate and I'll log it, or ask about your targets.",
  trainer: "I'm your Trainer — ask about today's session, or just check in before you lift.",
};

// A full-screen page (its own nav tab) rather than the old slide-up panel —
// three coach threads deserve a proper conversation-list feel, with a
// selector you can actually see yourself choosing from, not three cramped
// tabs. Per-coach unread badges here, plus one aggregate badge on the
// bottom nav, mirror how a normal messaging app surfaces "something's new."
export default function CoachChatPage() {
  const { loading: profileLoading, profile, error: profileError } = useProfile();
  const [tab, setTab] = useState("transformation");
  const [threads, setThreads] = useState({});
  const [loadingTab, setLoadingTab] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({ transformation: 0, nutritionist: 0, trainer: 0 });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [speakingId, setSpeakingId] = useState(null);
  const [streamingId, setStreamingId] = useState(null);
  const scrollRef = useRef(null);

  // Work out what's unread across all three threads once the profile's
  // ready, then immediately mark whichever tab is open (Transformation, by
  // default) as seen — its messages are on screen right away, so they were
  // never really "unread" from here.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("coach_messages")
        .select("coach, created_at")
        .eq("user_id", profile.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(150);
      if (cancelled) return;
      const counts = countUnread(profile.id, data || []);
      counts[tab] = 0;
      setUnreadCounts(counts);
      markSeen(profile.id, tab);
    })();
    return () => {
      cancelled = true;
    };
    // Only on first load of this page — selectTab() handles later switches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  useEffect(() => {
    if (!profile || threads[tab] !== undefined) return;
    loadThread(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, tab]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [threads, tab, sending]);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [tab]);

  function selectTab(coach) {
    if (coach === tab) return;
    setTab(coach);
    if (profile) {
      markSeen(profile.id, coach);
      setUnreadCounts((c) => ({ ...c, [coach]: 0 }));
    }
  }

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
    const { data, error: err } = await supabase
      .from("coach_messages")
      .select("id, role, body")
      .eq("user_id", profile.id)
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
    const replyId = `reply-${Date.now()}`;
    let streamStarted = false;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Signed out — refresh and sign back in.");
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ coach: tab, message: text }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Something went wrong.");
      }
      if (!res.body) throw new Error("Streaming isn't supported in this browser.");

      // The reply arrives as newline-delimited JSON chunks (see
      // app/api/coach/route.js) rather than one finished object, so the
      // assistant bubble fills in as it types instead of popping in whole
      // once everything — including any tool-use round-trips — is done.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === "delta") {
            if (!streamStarted) {
              streamStarted = true;
              setStreamingId(replyId);
              setThreads((t) => ({ ...t, [tab]: [...(t[tab] || []), { id: replyId, role: "assistant", body: evt.text }] }));
            } else {
              setThreads((t) => ({
                ...t,
                [tab]: (t[tab] || []).map((m) => (m.id === replyId ? { ...m, body: m.body + evt.text } : m)),
              }));
            }
          } else if (evt.type === "done") {
            setThreads((t) => ({
              ...t,
              [tab]: (t[tab] || []).map((m) => (m.id === replyId ? { ...m, body: evt.reply ?? m.body } : m)),
            }));
          } else if (evt.type === "error") {
            streamError = evt.error || "Something went wrong.";
          }
        }
      }

      if (streamError) {
        setThreads((t) => ({ ...t, [tab]: (t[tab] || []).filter((m) => m.id !== replyId) }));
        throw new Error(streamError);
      }
    } catch (err) {
      setError(err.message || "Couldn't reach your coach — try again.");
    } finally {
      setSending(false);
      setStreamingId(null);
    }
  }

  if (profileLoading) return <div className="center-loading">Loading…</div>;

  const list = threads[tab] || [];
  const ActiveFace = COACH_META[tab].Face;

  return (
    <div className="shell chat-shell">
      <AppHeader title="Coach" />
      {(error || profileError) && <div className="error-note">{error || profileError}</div>}

      <div className="chat-selector">
        {COACHES.map((key) => {
          const meta = COACH_META[key];
          const Face = meta.Face;
          const active = tab === key;
          const unread = unreadCounts[key] || 0;
          return (
            <button
              key={key}
              type="button"
              className={`chat-coach-card${active ? " active" : ""}`}
              style={{ "--card-color": meta.color }}
              onClick={() => selectTab(key)}
            >
              {unread > 0 && <span className="chat-unread-badge">{unread > 9 ? "9+" : unread}</span>}
              <span className="chat-coach-icon">
                <Face size={48} />
              </span>
              <span className="chat-coach-name">{meta.label}</span>
              <span className="chat-coach-tagline">{meta.tagline}</span>
            </button>
          );
        })}
      </div>

      <div className="chat-thread" ref={scrollRef}>
        {loadingTab[tab] && list.length === 0 && <div className="coach-greeting">Loading…</div>}
        {!loadingTab[tab] && list.length === 0 && (
          <div className="coach-msg-with-avatar">
            <span className="coach-msg-avatar">
              <ActiveFace size={30} />
            </span>
            <div className="coach-greeting" style={{ padding: "6px 4px" }}>{GREETING[tab]}</div>
          </div>
        )}
        {list.map((m) =>
          m.role === "assistant" ? (
            <div key={m.id} className="coach-msg-with-avatar">
              <span className="coach-msg-avatar">
                <ActiveFace size={30} />
              </span>
              <div className="coach-msg-row">
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
            </div>
          ) : (
            <div key={m.id} className={`coach-msg coach-msg-${m.role}`}>{m.body}</div>
          )
        )}
        {sending && !streamingId && (
          <div className="coach-msg-with-avatar">
            <span className="coach-msg-avatar">
              <ActiveFace size={30} />
            </span>
            <div className="coach-msg coach-msg-assistant coach-msg-typing">…</div>
          </div>
        )}
      </div>

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

      <BottomNav />
    </div>
  );
}
