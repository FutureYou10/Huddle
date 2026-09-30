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
    const system = systemPromptFor(coach, contextText);
    const tools = coach === "nutritionist" ? [TOOLS.log_meal] : undefined;
    const messages = [...history, { role: "user", content: message.trim() }];

    let response = await callClaude({ system, messages, tools });
    let loggedMeal = null;

    if (response.stop_reason === "tool_use") {
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
            loggedMeal = input;
            toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Logged." });
          }
        } else {
          toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Unknown tool.", is_error: true });
        }
      }

      const followUpMessages = [...messages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
      response = await callClaude({ system, messages: followUpMessages, tools });
    }

    const replyText = textFromResponse(response) || "…";

    const { error: insertHistErr } = await supabase.from("coach_messages").insert([
      { user_id: userId, coach, role: "user", body: message.trim(), kind: "chat" },
      { user_id: userId, coach, role: "assistant", body: replyText, kind: "chat", meta: loggedMeal ? { logged_meal: loggedMeal } : null },
    ]);
    if (insertHistErr) throw insertHistErr;

    return NextResponse.json({ reply: replyText, loggedMeal });
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json({ error: err.message, needsSetup: true }, { status: 503 });
    }
    console.error("Coach chat error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
