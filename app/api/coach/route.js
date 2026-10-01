import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callClaude, textFromResponse, AnthropicConfigError } from "../../../lib/anthropic";
import { COACHES, TOOLS, buildContext, systemPromptFor } from "../../../lib/coachContext";

const HISTORY_LIMIT = 16;

function supabaseForToken(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const { coach, message } = await request.json();
    if (!COACHES.includes(coach)) return NextResponse.json({ error: "Unknown coach." }, { status: 400 });
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Empty message." }, { status: 400 });
    }

    const supabase = supabaseForToken(token);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });
    const userId = user.id;

    const { data: profile, error: profileErr } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profileErr) throw profileErr;

    const { data: historyRows, error: historyErr } = await supabase
      .from("coach_messages")
      .select("role, body, created_at")
      .eq("user_id", userId)
      .eq("coach", coach)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyErr) throw historyErr;
    const history = (historyRows || []).slice().reverse().map((r) => ({ role: r.role, content: r.body }));

    const contextText = await buildContext(supabase, userId, coach, profile);
    const system = systemPromptFor(coach, contextText, profile);
    // log_meal is available from any of the three coach chats, not just the
    // Nutritionist's — Harry shouldn't have to switch tabs just to log food
    // he mentions mid-conversation with the Transformation Coach or Trainer.
    const tools = [TOOLS.log_meal];
    const messages = [...history, { role: "user", content: message.trim() }];

    let response = await callClaude({ system, messages, tools });
    const loggedMeals = [];
    let workingMessages = messages;

    // A single food-heavy message can need more than one log_meal call (e.g.
    // two separate items), and Claude sometimes spreads those across more
    // than one tool-use round rather than issuing them in parallel in one
    // round. The old code only ever processed one round, then unconditionally
    // took whatever text came back — including nothing at all when that
    // follow-up was itself another tool call. That silently dropped the
    // second item and persisted a literal "…" as a real chat message. Loop
    // until Claude actually stops calling tools, with a sane cap so a
    // misbehaving model can't spin forever.
    let rounds = 0;
    const MAX_TOOL_ROUNDS = 5;
    while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      const toolResults = [];
      for (const toolUse of toolUses) {
        if (toolUse.name === "log_meal") {
          const input = toolUse.input || {};
          const { error: insertErr } = await supabase.from("food_log").insert({
            user_id: userId,
            meal: input.meal,
            description: input.description,
            calories: input.calories,
            protein_g: input.protein_g,
            carbs_g: input.carbs_g,
            fat_g: input.fat_g,
            fiber_g: input.fiber_g ?? null,
            source: input.source || "Chat – estimated",
            logged_at: new Date().toISOString(),
          });
          if (insertErr) {
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Failed to log: ${insertErr.message}`, is_error: true });
          } else {
            loggedMeals.push(input);
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Logged." });
          }
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Unknown tool.", is_error: true });
        }
      }

      workingMessages = [...workingMessages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
      response = await callClaude({ system, messages: workingMessages, tools });
    }

    // Belt and braces: even with the loop above, Claude can still land on a
    // turn with no usable text — either it hit the round cap above mid tool
    // call, or it just returned an empty response for reasons we can't fully
    // predict. Either way, never let that reach Harry as a literal "…" saved
    // chat message. If a tool call is still dangling, close it out first
    // (the API requires a tool_result for every tool_use before the next
    // turn); then ask once more for a reply with `tools` omitted entirely,
    // so Claude has nothing to call and has to answer in plain text.
    if (response.stop_reason === "tool_use" || !textFromResponse(response)) {
      const danglingToolUses = response.content.filter((b) => b.type === "tool_use");
      const nudgeContent = danglingToolUses.length
        ? danglingToolUses.map((toolUse) => ({ type: "tool_result", tool_use_id: toolUse.id, content: "Noted." }))
        : "Reply to Harry now in one short, plain-text sentence — no tool calls.";
      workingMessages = [...workingMessages, { role: "assistant", content: response.content }, { role: "user", content: nudgeContent }];
      response = await callClaude({ system, messages: workingMessages });
    }

    const replyText =
      textFromResponse(response) ||
      (loggedMeals.length ? "Logged that for you." : "Got it — let me know if you'd like me to log that.");

    const loggedMeal = loggedMeals[0] || null;

    const { error: insertHistErr } = await supabase.from("coach_messages").insert([
      { user_id: userId, coach, role: "user", body: message.trim(), kind: "chat" },
      { user_id: userId, coach, role: "assistant", body: replyText, kind: "chat", meta: loggedMeals.length ? { logged_meals: loggedMeals } : null },
    ]);
    if (insertHistErr) throw insertHistErr;

    return NextResponse.json({ reply: replyText, loggedMeal, loggedMeals });
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json({ error: err.message, needsSetup: true }, { status: 503 });
    }
    console.error("Coach chat error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
