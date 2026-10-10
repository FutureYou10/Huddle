// Shared helpers for the Mind tab (app/mind): labels, the headspace maths
// behind the map, and reading a claude.ai data export in the browser.
//
// The idea the whole tab is built around: every thought ends up either as a
// committed action, or explicitly let go. Nothing is left to loop.
//
//   tangled   -> needs solving (a decision, a worry, a vague "should")
//   solved    -> a decision is made and there's a plan of small steps
//   committed -> you've signed up to the plan; it shows on the Do list
//   done      -> out of your head
//   let_go    -> out of your control, consciously put down

export const KIND_LABELS = { action: "To do", decision: "Decision", worry: "Worry", idea: "Idea" };
export const KIND_ICONS = { action: "→", decision: "⑂", worry: "~", idea: "✦" };
export const CONTROL_LABELS = { mine: "In my control", influence: "Partly mine", not_mine: "Out of my control" };
export const STAGE_LABELS = { tangled: "Needs solving", solved: "Solved — ready to commit", committed: "Committed", done: "Done", let_go: "Let go" };

// Soft ceiling for the headspace meter: ~13 heavy things, or 40 light ones,
// fills it. It's a feeling gauge, not a measurement — what matters is that it
// visibly drops each time something gets ticked off or let go.
export const HEADSPACE_CAPACITY = 40;

// Muted, theme-safe hues for the area atoms. Picked by index so an area keeps
// its colour as long as the areas keep their order (created_at).
export const AREA_HUES = [16, 196, 140, 42, 268, 330, 92, 222];
export function areaColor(index, alpha = 1) {
  const hue = AREA_HUES[index % AREA_HUES.length];
  return `hsla(${hue}, 62%, 52%, ${alpha})`;
}

export function isOpen(item) {
  return item.stage !== "done" && item.stage !== "let_go";
}

// Out-of-control things still take up room in your head — that's the point of
// showing them — but they're counted separately so the meter can say how much
// of the weight is stuff there's no point problem-solving.
export function headspace(items) {
  let mine = 0;
  let notMine = 0;
  for (const it of items) {
    if (!isOpen(it)) continue;
    const w = (it.load || 2) + Math.min(3, Math.max(0, (it.loop_count || 1) - 1)) * 0.5;
    if (it.control === "not_mine") notMine += w;
    else mine += w;
  }
  const total = mine + notMine;
  return {
    mine,
    notMine,
    total,
    pct: Math.min(100, Math.round((total / HEADSPACE_CAPACITY) * 100)),
    notMinePct: total ? Math.round((notMine / total) * 100) : 0,
  };
}

export function itemWeight(item) {
  return (item.load || 2) + Math.min(3, Math.max(0, (item.loop_count || 1) - 1)) * 0.5;
}

export function nextStep(item) {
  return (item.steps || []).find((s) => !s.d) || null;
}

export function stepProgress(item) {
  const steps = item.steps || [];
  return { done: steps.filter((s) => s.d).length, total: steps.length };
}

export function newStep(text) {
  return { id: Math.random().toString(36).slice(2, 10), t: text, d: false };
}

// ---------------------------------------------------------------------------
// claude.ai export reading
//
// claude.ai → Settings → Privacy → Export data emails a .zip containing
// conversations.json: [{ uuid, name, created_at, updated_at, chat_messages:
// [{ sender: "human" | "assistant", text, content: [{ type, text }] }] }].
// We accept either the zip or the extracted conversations.json.

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser can't open zip files — unzip the export and choose conversations.json instead.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Minimal zip reader: finds one file by name via the central directory.
async function readFileFromZip(buffer, wanted) {
  const b = new Uint8Array(buffer);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("That doesn't look like a valid zip file.");
  const count = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  if (p === 0xffffffff) throw new Error("This export is too big to open here — unzip it and choose conversations.json instead.");
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) break;
    const method = u16(b, p + 10);
    const compSize = u32(b, p + 20);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    const localOffset = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted || name.endsWith("/" + wanted)) {
      const lNameLen = u16(b, localOffset + 26);
      const lExtraLen = u16(b, localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = b.subarray(start, start + compSize);
      if (method === 0) return new TextDecoder().decode(data);
      if (method === 8) return new TextDecoder().decode(await inflateRaw(data));
      throw new Error("Unsupported zip compression — unzip the export and choose conversations.json instead.");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error("No conversations.json found in that zip. Is it the claude.ai data export?");
}

function messageText(m) {
  if (Array.isArray(m.content) && m.content.length) {
    const t = m.content.filter((c) => c && c.type === "text" && c.text).map((c) => c.text).join("\n");
    if (t) return t;
  }
  return typeof m.text === "string" ? m.text : "";
}

export async function readClaudeExport(file) {
  const buffer = await file.arrayBuffer();
  const isZip = new Uint8Array(buffer.slice(0, 4)).every((v, i) => v === [0x50, 0x4b, 0x03, 0x04][i]);
  const json = isZip ? await readFileFromZip(buffer, "conversations.json") : new TextDecoder().decode(buffer);
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Couldn't read that file — choose the .zip from claude.ai, or conversations.json inside it.");
  }
  if (!Array.isArray(data)) throw new Error("That file isn't a list of conversations.");
  return data
    .map((c) => {
      const msgs = (c.chat_messages || []).map((m) => ({ sender: m.sender, text: messageText(m) })).filter((m) => m.text.trim());
      return {
        uuid: c.uuid,
        title: (c.name || "").trim() || "Untitled chat",
        updated_at: c.updated_at || c.created_at,
        humanCount: msgs.filter((m) => m.sender === "human").length,
        messages: msgs,
      };
    })
    .filter((c) => c.uuid && c.humanCount > 0)
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
}

// What actually gets sent to be untangled: your own words (the human turns —
// that's where the thinking lives), plus a short tail of Claude's last reply
// for context on where the chat landed. Capped so a batch of chats stays well
// inside one request.
export function condenseChat(chat, maxChars = 3500) {
  const human = chat.messages.filter((m) => m.sender === "human").map((m) => "- " + m.text.replace(/\s+/g, " ").trim());
  let body = human.join("\n");
  if (body.length > maxChars) {
    // Keep the start (what it was about) and the end (where it got to).
    const half = Math.floor(maxChars / 2);
    body = body.slice(0, half) + "\n…\n" + body.slice(-half);
  }
  const lastAssistant = [...chat.messages].reverse().find((m) => m.sender === "assistant");
  const landed = lastAssistant ? lastAssistant.text.replace(/\s+/g, " ").trim().slice(0, 400) : "";
  const date = String(chat.updated_at || "").slice(0, 10);
  return `### Chat: "${chat.title}" (${date})\nWhat I said:\n${body}${landed ? `\nWhere Claude left it: ${landed}` : ""}`;
}

// Groups condensed chats into request-sized batches.
export function batchChats(chats, maxBatchChars = 18000) {
  const batches = [];
  let cur = [];
  let size = 0;
  for (const chat of chats) {
    const text = condenseChat(chat);
    if (cur.length && size + text.length > maxBatchChars) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push({ uuid: chat.uuid, title: chat.title, text });
    size += text.length;
  }
  if (cur.length) batches.push(cur);
  return batches;
}
