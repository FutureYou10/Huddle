import { NextResponse } from "next/server";
import { callClaude, toolInputFromResponse } from "../../../../lib/anthropic";
import { authed, SOLVE_SYSTEM, SOLVE_TOOL } from "../../../../lib/mindServer";
import { CONTROL_LABELS, KIND_LABELS } from "../../../../lib/mind";

export const maxDuration = 60;

// POST { itemId, note? } — asks Claude for a decisive way through one stuck
// item: a reframe, 2–3 options each with small steps, and a recommendation.
// Doesn't write anything: the client saves the option the user picks.
export async function POST(request) {
  try {
    const auth = await authed(request);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { supabase } = auth;

    const { itemId, note } = await request.json();
    const { data: item, error } = await supabase
      .from("mind_items")
      .select("title, detail, kind, control, loop_count, influence_note, decision, mind_areas(name)")
      .eq("id", itemId)
      .maybeSingle();
    if (error) throw error;
    if (!item) return NextResponse.json({ error: "Couldn't find that item." }, { status: 404 });

    const lines = [
      `Item: ${item.title}`,
      item.detail && `What's going on: ${item.detail}`,
      `Area: ${item.mind_areas?.name || "none"}`,
      `Type: ${KIND_LABELS[item.kind] || item.kind}`,
      `Control: ${CONTROL_LABELS[item.control] || item.control}`,
      item.influence_note && `The part that's mine: ${item.influence_note}`,
      item.loop_count > 1 && `This has come up ${item.loop_count} times — they've been looping on it.`,
      item.decision && `Previously decided: ${item.decision}`,
      note && `What I'd add right now: ${String(note).slice(0, 2000)}`,
    ].filter(Boolean);

    const response = await callClaude({
      system: SOLVE_SYSTEM,
      messages: [{ role: "user", content: lines.join("\n") }],
      tools: [SOLVE_TOOL],
      toolChoice: { type: "tool", name: SOLVE_TOOL.name },
      maxTokens: 2048,
    });
    const plan = toolInputFromResponse(response, SOLVE_TOOL.name);
    if (!plan || !Array.isArray(plan.options) || !plan.options.length) {
      return NextResponse.json({ error: "Didn't get a usable answer — try again." }, { status: 502 });
    }
    const recommended = Number.isInteger(plan.recommended) && plan.recommended >= 0 && plan.recommended < plan.options.length ? plan.recommended : 0;
    return NextResponse.json({ ...plan, recommended });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Couldn't solve that one." }, { status: 500 });
  }
}
