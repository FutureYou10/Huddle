"use client";

import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { batchChats, readClaudeExport } from "../../lib/mind";

const DEFAULT_PICK = 15;
const PAGE = 40;

// Pulls past Claude chats onto the map. claude.ai has no API for reading your
// chats, so this works from the data export (Settings → Privacy → Export
// data): the file is read in the browser, you pick which chats, and only a
// condensed version of your own side of each is sent off to be untangled.
// Chats already imported are remembered (mind_imported_chats) and hidden by
// default, so re-importing a fresh export only picks up what's new.
export default function ChatImport({ onImported }) {
  const [chats, setChats] = useState(null);
  const [already, setAlready] = useState(new Set());
  const [picked, setPicked] = useState(new Set());
  const [showImported, setShowImported] = useState(false);
  const [filter, setFilter] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setStatus("Reading your export…");
    try {
      const list = await readClaudeExport(file);
      const { data } = await supabase.from("mind_imported_chats").select("chat_uuid");
      const done = new Set((data || []).map((r) => r.chat_uuid));
      setAlready(done);
      setChats(list);
      setPicked(new Set(list.filter((c) => !done.has(c.uuid)).slice(0, DEFAULT_PICK).map((c) => c.uuid)));
      setStatus("");
    } catch (err) {
      setError(err.message);
      setStatus("");
    }
    e.target.value = "";
  }

  const visible = useMemo(() => {
    if (!chats) return [];
    const q = filter.trim().toLowerCase();
    return chats.filter((c) => (showImported || !already.has(c.uuid)) && (!q || c.title.toLowerCase().includes(q)));
  }, [chats, already, showImported, filter]);

  function toggle(uuid) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(uuid) ? next.delete(uuid) : next.add(uuid);
      return next;
    });
  }

  async function run() {
    const selected = chats.filter((c) => picked.has(c.uuid));
    if (!selected.length) return;
    setBusy(true);
    setError("");
    const batches = batchChats(selected);
    let added = 0;
    let bumped = 0;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers = { "content-type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token}` };
      for (let i = 0; i < batches.length; i++) {
        setStatus(`Untangling ${batches.length > 1 ? `batch ${i + 1} of ${batches.length}` : `${selected.length} chats`}…`);
        const res = await fetch("/api/mind/untangle", { method: "POST", headers, body: JSON.stringify({ chats: batches[i] }) });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Import stopped part way.");
        added += json.added;
        bumped += json.bumped;
        setAlready((prev) => new Set([...prev, ...batches[i].map((c) => c.uuid)]));
        onImported?.();
      }
      setPicked(new Set());
      setStatus(`Done. ${added} new thing${added === 1 ? "" : "s"} on the map${bumped ? `, ${bumped} that kept coming up` : ""}.`);
    } catch (err) {
      setError(`${err.message}${added ? ` (${added} added before it stopped.)` : ""}`);
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">Bring in your Claude chats</p>
      {!chats ? (
        <>
          <ol className="mind-howto">
            <li>On claude.ai, go to <b>Settings → Privacy → Export data</b>.</li>
            <li>You'll get an email with a download link. Download the .zip.</li>
            <li>Choose that file here. You pick which chats get sorted.</li>
          </ol>
          <label className="btn secondary mind-file-btn">
            Choose export (.zip or conversations.json)
            <input type="file" accept=".zip,.json,application/zip,application/json" onChange={onFile} hidden />
          </label>
          <p className="field-hint">The file is opened on your phone. Only your messages from the chats you pick get sent off to be sorted, and the chat text itself isn't stored.</p>
        </>
      ) : (
        <>
          <div className="mind-import-bar">
            <span>
              {chats.length} chats · {already.size ? `${chats.filter((c) => already.has(c.uuid)).length} already on the map` : "none imported yet"}
            </span>
            <button className="btn ghost" onClick={() => setChats(null)}>Change file</button>
          </div>
          <input type="text" placeholder="Search chat titles" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="mind-import-tools">
            <button className="chip" onClick={() => setPicked(new Set(visible.map((c) => c.uuid)))}>Select all {visible.length}</button>
            <button className="chip" onClick={() => setPicked(new Set())}>Clear</button>
            <label className="mind-import-toggle">
              <input type="checkbox" checked={showImported} onChange={(e) => setShowImported(e.target.checked)} /> show imported
            </label>
          </div>
          <ul className="mind-chat-list">
            {visible.slice(0, limit).map((c) => (
              <li key={c.uuid} onClick={() => toggle(c.uuid)} className={picked.has(c.uuid) ? "picked" : ""}>
                <span className="mind-check">{picked.has(c.uuid) ? "✓" : ""}</span>
                <span className="mind-chat-title">{c.title}</span>
                <span className="mind-chat-meta">
                  {already.has(c.uuid) ? "imported · " : ""}
                  {String(c.updated_at || "").slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
          {visible.length > limit && (
            <button className="btn ghost" onClick={() => setLimit(limit + PAGE)}>Show more ({visible.length - limit} left)</button>
          )}
          <button className="btn primary" onClick={run} disabled={busy || !picked.size} style={{ marginTop: 10 }}>
            {busy ? "Working…" : `Untangle ${picked.size} chat${picked.size === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {status && <p className="note" style={{ marginTop: 10 }}>{status}</p>}
      {error && <p className="error-note" style={{ marginTop: 10 }}>{error}</p>}
    </div>
  );
}
