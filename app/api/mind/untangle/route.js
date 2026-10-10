import { NextResponse } from "next/server";
import { callClaude, toolInputFromResponse } from "../../../../lib/anthropic";
import { authed, UNTANGLE_SYSTEM, UNTANGLE_TOOL } from "../../../../lib/mindServer";
import { newStep } from "../../../../lib/mind";

export const maxDuration = 60;

const MAX_INPUT_CHARS = 30000;

// POST { text } — a brain dump typed or pasted in the Mind tab — or
// { chats: [{ uuid, title, text }] } — one batch of condensed Claude chats
// from an export (lib/mind.js batchChats). Claude files each distinct thing
// onto the map; repeats of things already there bump their loop_count
// instead of making duplicates. Writes straight to the map and returns counts.
export async function POST(request) {
  try {
    const auth = await authed(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase, user } = auth;

    const body = await request.json();
    const chats = Array.isArray(body.chats) ? body.chats.filter((c) => c && c.uuid && typeof c.text === "string") : [];
    const text = chats.length ? chats.map((c) => c.text).join("\n\n") : String(body.text || "");
    if (!text.trim()) return NextResponse.json({ error: "Nothing to untangle yet." }, { status: 400 });
    if (text.length > MAX_INPUT_CHARS) return NextResponse.json({ error: "That's a lot in one go — try a shorter chunk." }, { status: 400 });

    const [{ data: areas, error: areasErr }, { data: openItems, error: itemsErr }] = await Promise.all([
      supabase.from("mind_areas").select("id, name, emoji").order("created_at"),
      supabase.from("mind_items").select("id, title, area_id, loop_count, stage").not("stage", "in", "(done,let_go)"),
    ]);
    if (areasErr) throw areasErr;
    if (itemsErr) throw itemsErr;

    const areaName = Object.fromEntries((areas || []).map((a) => [a.id, a.name]));
    const mapSummary =
      (areas || []).length || (openItems || []).length
        ? `Areas already on the map: ${(areas || []).map((a) => a.name).join(", ") || "none"}\n\nOpen items already on the map:\n` +
          ((openItems || []).map((i) => `- [${i.id}] ${i.title} (${areaName[i.area_id] || "no area"})`).join("\n") || "none")
        : "The map is empty so far.";

    const response = await callClaude({
      system: UNTANGLE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${mapSummary}\n\n---\n${chats.length ? "Excerpts from my past Claude chats:" : "What's in my head right now:"}\n\n${text}`,
        },
      ],
      tools: [UNTANGLE_TOOL],
      toolChoice: { type: "tool", name: UNTANGLE_TOOL.name },
      maxTokens: 4096,
    });
    const result = toolInputFromResponse(response, UNTANGLE_TOOL.name);
    const found = Array.isArray(result?.items) ? result.items : [];

    // Resolve area names to ids, creating any new ones.
    const byName = new Map((areas || []).map((a) => [a.name.toLowerCase(), a.id]));
    const newAreas = [];
    for (const it of found) {
      const name = String(it.area || "").trim().slice(0, 40) || "Other";
      if (!byName.has(name.toLowerCase()) && !newAreas.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
        newAreas.push({ name, emoji: String(it.area_emoji || "").slice(0, 8) || null, user_id: user.id });
      }
    }
    if (newAreas.length) {
      const { data: created, error } = await supabase.from("mind_areas").insert(newAreas).select("id, name");
      if (error) throw error;
      for (const a of created) byName.set(a.name.toLowerCase(), a.id);
    }

    const openById = new Map((openItems || []).map((i) => [i.id, i]));
    const source = chats.length ? (chats.length === 1 ? `Claude chat: ${chats[0].title}` : `${chats.length} Claude chats`) : "Brain dump";
    const inserts = [];
    let bumped = 0;
    for (const it of found) {
      const mentions = Math.max(1, Math.min(50, parseInt(it.mentions, 10) || 1));
      const existing = it.existing_id && openById.get(it.existing_id);
      if (existing) {
        const { error } = await supabase
          .from("mind_items")
          .update({ loop_count: (existing.loop_count || 1) + mentions, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
        bumped++;
        continue;
      }
      const kind = ["action", "decision", "worry", "idea"].includes(it.kind) ? it.kind : "action";
      const control = ["mine", "influence", "not_mine"].includes(it.control) ? it.control : "mine";
      const steps = it.ready && control !== "not_mine" && Array.isArray(it.steps) ? it.steps.filter(Boolean).slice(0, 8).map((s) => newStep(String(s).slice(0, 200))) : [];
      inserts.push({
        user_id: user.id,
        area_id: byName.get(String(it.area || "Other").trim().slice(0, 40).toLowerCase()) || null,
        title: String(it.title || "").slice(0, 120) || "Untitled",
        detail: it.detail ? String(it.detail).slice(0, 500) : null,
        kind,
        control,
        load: [1, 2, 3].includes(it.load) ? it.load : 2,
        loop_count: mentions,
        // Plain to-dos arrive already solved (just needs committing to);
        // anything that needs a decision starts tangled.
        stage: steps.length ? "solved" : "tangled",
        steps,
        influence_note: it.influence_note ? String(it.influence_note).slice(0, 300) : null,
        source,
      });
    }
    if (inserts.length) {
      const { error } = await supabase.from("mind_items").insert(inserts);
      if (error) throw error;
    }

    if (chats.length) {
      const { error } = await supabase
        .from("mind_imported_chats")
        .upsert(chats.map((c) => ({ user_id: user.id, chat_uuid: String(c.uuid), title: String(c.title || "").slice(0, 200) })));
      if (error) throw error;
    }

    return NextResponse.json({ added: inserts.length, bumped, areasAdded: newAreas.length });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Couldn't untangle that." }, { status: 500 });
  }
}
