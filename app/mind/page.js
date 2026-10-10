"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useProfile } from "../../lib/useProfile";
import { headspace, isOpen, itemWeight, nextStep, stepProgress, STAGE_LABELS, areaColor, SUMMARY_PROMPT } from "../../lib/mind";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import BrainMap from "../../components/mind/BrainMap";
import ItemSheet from "../../components/mind/ItemSheet";
import ChatImport from "../../components/mind/ChatImport";

const VIEWS = [
  { id: "map", label: "Map" },
  { id: "do", label: "Do" },
  { id: "dump", label: "Empty head" },
];
const VIEW_KEY = "huddle-mind-view";

function HeadspaceMeter({ items }) {
  const h = headspace(items);
  const open = items.filter(isOpen);
  const loops = open.filter((i) => i.loop_count > 2).length;
  const mineW = h.total ? (h.mine / h.total) * h.pct : 0;
  const notW = h.total ? (h.notMine / h.total) * h.pct : 0;
  return (
    <div className="card mind-meter">
      <div className="mind-meter-top">
        <div>
          <p className="eyebrow">Headspace in use</p>
          <div className="mind-meter-value">{h.pct}%</div>
        </div>
        <div className="mind-meter-stats">
          <span><b>{open.filter((i) => i.stage === "tangled" && i.control !== "not_mine").length}</b> to solve</span>
          <span><b>{open.filter((i) => i.stage === "committed").length}</b> committed</span>
          {loops > 0 && <span className="loop"><b>{loops}</b> on a loop</span>}
        </div>
      </div>
      <div className="mind-meter-bar">
        <div className="mine" style={{ width: `${mineW}%` }} />
        <div className="not-mine" style={{ width: `${notW}%` }} />
      </div>
      {h.notMinePct > 0 && (
        <p className="mind-meter-note">
          <span className="sw" /> {h.notMinePct}% of that is out of your control, so there's nothing to solve there.
        </p>
      )}
    </div>
  );
}

function ItemRow({ item, area, onOpen, children }) {
  const prog = stepProgress(item);
  return (
    <div className="mind-row" onClick={() => onOpen(item)}>
      <span className="mind-row-dot" style={{ background: area ? areaColor(area.index) : "var(--text-faint)" }} />
      <div className="mind-row-main">
        <div className="mind-row-title">{item.title}</div>
        <div className="mind-row-sub">
          {area ? `${area.emoji || ""} ${area.name}` : "Unfiled"}
          {item.loop_count > 2 && <span className="mind-loop-tag">🔁 {item.loop_count}×</span>}
          {prog.total > 0 && item.stage === "committed" && <> · {prog.done}/{prog.total} steps</>}
        </div>
      </div>
      {children && <div onClick={(e) => e.stopPropagation()}>{children}</div>}
    </div>
  );
}

export default function MindPage() {
  const { loading, profile, error: profileError } = useProfile();
  const [areas, setAreas] = useState([]);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("map");
  const [selectedArea, setSelectedArea] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [skip, setSkip] = useState(0);
  const [toast, setToast] = useState("");
  const [dump, setDump] = useState("");
  const [untangling, setUntangling] = useState(false);
  const [dumpResult, setDumpResult] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (VIEWS.some((x) => x.id === v)) setView(v);
    } catch {}
  }, []);

  function switchView(v) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  const load = useCallback(async () => {
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [a, i] = await Promise.all([
      supabase.from("mind_areas").select("*").order("created_at"),
      supabase.from("mind_items").select("*").or(`stage.in.(tangled,solved,committed),closed_at.gte.${weekAgo}`).order("created_at"),
    ]);
    if (a.error || i.error) {
      setError((a.error || i.error).message);
    } else {
      setAreas(a.data.map((x, index) => ({ ...x, index })));
      setItems(i.data);
      setError("");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (profile) load();
  }, [profile, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const areaById = useMemo(() => Object.fromEntries(areas.map((a) => [a.id, a])), [areas]);
  const open = items.filter(isOpen);

  // Optimistic: the map and lists update immediately, Supabase catches up.
  async function patch(item, changes) {
    const next = { ...changes, updated_at: new Date().toISOString() };
    setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, ...next } : x)));
    const { error: err } = await supabase.from("mind_items").update(next).eq("id", item.id);
    if (err) {
      setError(err.message);
      load();
    }
  }

  const actions = {
    patch,
    commit: (item) => {
      patch(item, { stage: "committed" });
      setToast("Committed. It's on your Do list.");
    },
    done: (item) => {
      patch(item, { stage: "done", closed_at: new Date().toISOString(), steps: (item.steps || []).map((s) => ({ ...s, d: true })) });
      setToast("Done. That's out of your head ✓");
      setOpenId(null);
    },
    letGo: (item) => {
      patch(item, { stage: "let_go", closed_at: new Date().toISOString() });
      setToast("Let go. You don't have to carry that one.");
      setOpenId(null);
    },
    applyOption: (item, option) => {
      const steps = option.steps.map((t) => ({ id: Math.random().toString(36).slice(2, 10), t, d: false }));
      patch(item, { decision: option.label, steps, stage: "solved" });
    },
    toggleStep: (item, stepId) => {
      const steps = (item.steps || []).map((s) => (s.id === stepId ? { ...s, d: !s.d } : s));
      const allDone = steps.length && steps.every((s) => s.d);
      if (allDone && item.stage === "committed") {
        patch(item, { steps, stage: "done", closed_at: new Date().toISOString() });
        setToast("Every step done. That's out of your head ✓");
        setOpenId(null);
      } else {
        patch(item, { steps });
        if (steps.find((s) => s.id === stepId)?.d) setToast("Ticked off ✓");
      }
    },
    remove: async (item) => {
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setOpenId(null);
      const { error: err } = await supabase.from("mind_items").delete().eq("id", item.id);
      if (err) {
        setError(err.message);
        load();
      }
    },
  };

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(SUMMARY_PROMPT);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      // Clipboard blocked (some in-app browsers): show it to copy by hand.
      setShowPrompt(true);
    }
  }

  async function untangle() {
    if (!dump.trim()) return;
    setUntangling(true);
    setDumpResult("");
    setError("");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const res = await fetch("/api/mind/untangle", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` },
        body: JSON.stringify({ text: dump }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't untangle that.");
      setDump("");
      setDumpResult(
        json.added || json.bumped
          ? `Sorted. ${json.added} new on the map${json.bumped ? `, ${json.bumped} already there (it's been looping)` : ""}.`
          : "Nothing new to add. It was all already on the map."
      );
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUntangling(false);
    }
  }

  if (loading || (profile && !loaded)) return <div className="center-loading">Loading…</div>;
  if (profileError) return <div className="shell"><p className="error-note">{profileError}</p></div>;

  // Do list: committed things with a next step, heaviest/most-looped first.
  const doQueue = open
    .filter((i) => i.stage === "committed" && nextStep(i))
    .sort((a, b) => itemWeight(b) - itemWeight(a));
  const focus = doQueue.length ? doQueue[skip % doQueue.length] : null;
  const focusStep = focus && nextStep(focus);
  const ready = open.filter((i) => i.stage === "solved" && i.control !== "not_mine");
  const toSolve = open.filter((i) => i.stage === "tangled" && i.control !== "not_mine").sort((a, b) => itemWeight(b) - itemWeight(a));
  const outOfControl = open.filter((i) => i.control === "not_mine");
  const closedThisWeek = items.filter((i) => !isOpen(i));

  const selectedItems =
    selectedArea === "not_mine"
      ? outOfControl
      : selectedArea
      ? open.filter((i) => i.control !== "not_mine" && (selectedArea === "none" ? !areaById[i.area_id] : i.area_id === selectedArea))
      : [];
  const selectedLabel =
    selectedArea === "not_mine" ? "Out of my control" : selectedArea === "none" ? "Other" : selectedArea && areaById[selectedArea] ? `${areaById[selectedArea].emoji || ""} ${areaById[selectedArea].name}` : "";

  const openItem = openId && items.find((i) => i.id === openId);
  const openRow = (item) => setOpenId(item.id);

  return (
    <>
      <div className="shell shell-with-nav">
        <AppHeader title="Mind" />
        <HeadspaceMeter items={items} />

        <div className="segmented">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => switchView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>

        {error && <p className="error-note">{error}</p>}

        {view === "map" && (
          <>
            <div className="card mind-map-card">
              <BrainMap areas={areas} items={items} selected={selectedArea} onSelect={setSelectedArea} />
              <div className="mind-legend">
                <span><i className="e-tangled" /> to solve</span>
                <span><i className="e-solved" /> solved</span>
                <span><i className="e-committed" /> committed</span>
                <span><i className="ooc" /> not mine</span>
              </div>
              {!open.length && (
                <button className="btn primary" onClick={() => switchView("dump")}>Empty your head</button>
              )}
              {open.length > 0 && !selectedArea && <p className="field-hint" style={{ textAlign: "center" }}>Tap an atom to see what's in it.</p>}
            </div>
            {selectedArea && (
              <div className="card">
                <p className="eyebrow">{selectedLabel}</p>
                {selectedArea === "not_mine" && (
                  <p className="mind-ooc-explainer">None of this is yours to solve. Do the small bit if there is one, then let it go.</p>
                )}
                {["tangled", "solved", "committed"].map((stage) => {
                  const list = selectedItems.filter((i) => i.stage === stage);
                  if (!list.length) return null;
                  return (
                    <div key={stage} className="mind-group">
                      {selectedArea !== "not_mine" && <div className="mind-group-head">{STAGE_LABELS[stage]}</div>}
                      {list.map((it) => (
                        <ItemRow key={it.id} item={it} area={areaById[it.area_id]} onOpen={openRow} />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === "do" && (
          <>
            <div className="card mind-focus">
              <p className="eyebrow">Just this one thing</p>
              {focus ? (
                <>
                  <div className="mind-focus-context">
                    {areaById[focus.area_id]?.emoji} {focus.title}
                    <span> · step {stepProgress(focus).done + 1} of {stepProgress(focus).total}</span>
                  </div>
                  <div className="mind-focus-step">{focusStep.t}</div>
                  <button className="btn primary mind-done-btn" onClick={() => actions.toggleStep(focus, focusStep.id)}>
                    Done ✓
                  </button>
                  <div className="mind-focus-alt">
                    {doQueue.length > 1 && <button className="btn ghost" onClick={() => setSkip(skip + 1)}>Not this one right now</button>}
                    <button className="btn ghost" onClick={() => openRow(focus)}>See the plan</button>
                  </div>
                </>
              ) : (
                <p className="mind-focus-empty">
                  {ready.length
                    ? "Nothing committed yet. Commit to something that's ready below."
                    : toSolve.length
                    ? "Nothing committed yet. Solve one thing below. Start with the heaviest."
                    : "Nothing waiting. Empty your head when something builds up."}
                </p>
              )}
            </div>

            {ready.length > 0 && (
              <div className="card">
                <p className="eyebrow">Solved — ready to commit</p>
                {ready.map((it) => (
                  <ItemRow key={it.id} item={it} area={areaById[it.area_id]} onOpen={openRow}>
                    <button className="mind-mini-btn primary" onClick={() => actions.commit(it)}>Commit</button>
                  </ItemRow>
                ))}
              </div>
            )}

            {toSolve.length > 0 && (
              <div className="card">
                <p className="eyebrow">Needs solving · {toSolve.length}</p>
                <p className="field-hint" style={{ marginTop: 4 }}>Solve it once, commit to the steps, stop thinking about it.</p>
                {toSolve.map((it) => (
                  <ItemRow key={it.id} item={it} area={areaById[it.area_id]} onOpen={openRow}>
                    <button className="mind-mini-btn" onClick={() => openRow(it)}>Solve</button>
                  </ItemRow>
                ))}
              </div>
            )}

            {outOfControl.length > 0 && (
              <div className="card mind-ooc-card">
                <p className="eyebrow">Out of my control · {outOfControl.length}</p>
                <p className="mind-ooc-explainer">There's no point problem-solving these. Notice them, then put them down.</p>
                {outOfControl.map((it) => (
                  <ItemRow key={it.id} item={it} area={areaById[it.area_id]} onOpen={openRow}>
                    <button className="mind-mini-btn" onClick={() => actions.letGo(it)}>Let go</button>
                  </ItemRow>
                ))}
              </div>
            )}

            {closedThisWeek.length > 0 && (
              <div className="card">
                <p className="eyebrow">Out of your head this week · {closedThisWeek.length}</p>
                {closedThisWeek.map((it) => (
                  <ItemRow key={it.id} item={it} area={areaById[it.area_id]} onOpen={openRow}>
                    <span className="mind-closed-tag">{it.stage === "done" ? "✓ done" : "let go"}</span>
                  </ItemRow>
                ))}
              </div>
            )}
          </>
        )}

        {view === "dump" && (
          <>
            <div className="card">
              <p className="eyebrow">Empty your head</p>
              <p className="field-hint" style={{ marginTop: 4, marginBottom: 10 }}>
                Type or dictate everything that's buzzing around. Don't organise it. It gets sorted into areas, and anything out of your control gets flagged.
              </p>
              <textarea
                rows={8}
                value={dump}
                onChange={(e) => setDump(e.target.value)}
                placeholder="e.g. need to sort the VAT return, not sure whether to take on the second site, worried about Mum's results, haven't replied to Jo…"
              />
              <button className="btn primary" onClick={untangle} disabled={untangling || !dump.trim()} style={{ marginTop: 10 }}>
                {untangling ? "Untangling…" : "Untangle it"}
              </button>
              {dumpResult && (
                <p className="note" style={{ marginTop: 10 }}>
                  {dumpResult}{" "}
                  <button className="btn ghost" style={{ display: "inline", width: "auto", padding: 0 }} onClick={() => switchView("map")}>See the map</button>
                </p>
              )}
            </div>
            <div className="card">
              <p className="eyebrow">Pull in everything from your Claude chats</p>
              <ol className="mind-howto">
                <li>Copy the prompt below.</li>
                <li>Paste it into a new chat on claude.ai. It will look back through your past chats.</li>
                <li>Copy Claude's answer, paste it into the box above, and tap <b>Untangle it</b>.</li>
              </ol>
              <button className="btn secondary" onClick={copyPrompt}>
                {promptCopied ? "Copied ✓ Now paste it into Claude" : "Copy the prompt"}
              </button>
              <button className="btn ghost" onClick={() => setShowPrompt(!showPrompt)}>
                {showPrompt ? "Hide prompt" : "Show prompt"}
              </button>
              {showPrompt && <pre className="mind-prompt">{SUMMARY_PROMPT}</pre>}
              <p className="field-hint">Run it again any time. Things already on the map get merged, not duplicated.</p>
            </div>
            <details className="mind-export-details">
              <summary>Or import a full claude.ai export instead</summary>
              <ChatImport onImported={load} />
            </details>
          </>
        )}
      </div>

      {openItem && <ItemSheet item={openItem} area={areaById[openItem.area_id]} actions={actions} onClose={() => setOpenId(null)} />}
      {toast && <div className="mind-toast">{toast}</div>}
      <BottomNav />
    </>
  );
}
