import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { callClaudeStreaming, textFromResponse, AnthropicConfigError } from "../../../lib/anthropic";
import { COACHES, TOOLS, buildContext, systemPromptFor } from "../../../lib/coachContext";
import { todayIso } from "../../../lib/coaching";

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

    const { coach, message, image } = await request.json();
    if (!COACHES.includes(coach)) return NextResponse.json({ error: "Unknown coach." }, { status: 400 });
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Empty message." }, { status: 400 });
    }
    // Optional food photo, already downscaled by the client. Validate shape and
    // size here — it goes straight into the model request.
    let imageBlock = null;
    if (image) {
      const okType = ["image/jpeg", "image/png", "image/webp"].includes(image.media_type);
      if (!okType || typeof image.data !== "string" || !image.data || image.data.length > 3_000_000) {
        return NextResponse.json({ error: "That photo couldn't be used — try another one." }, { status: 400 });
      }
      imageBlock = { type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } };
    }

    const supabase = supabaseForToken(token);
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser(token);
    if (userErr || !user) return NextResponse.json({ error: "Session expired — please sign in again." }, { status: 401 });
    const userId = user.id;

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          error: "ANTHROPIC_API_KEY is not set. Add it as an Environment Variable in the Vercel project settings, then redeploy.",
          needsSetup: true,
        },
        { status: 503 }
      );
    }

    const { data: profile, error: profileErr } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profileErr) throw profileErr;

    let historyQuery = supabase
      .from("coach_messages")
      .select("role, body, created_at")
      .eq("user_id", userId)
      .eq("coach", coach)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    // The Nutritionist's "Logged so far today" total (coachContext.js) resets
    // at midnight and is always recalculated fresh — but with no date filter
    // here, yesterday's chat (including a total it stated for a now-stale
    // day) stays in history and invites the model to carry that old number
    // forward instead of trusting today's real one. Confirmed doing exactly
    // this: a reply stated 3050 kcal when the actual logged-today figure was
    // 790 — precisely yesterday's total plus today's new items. Scoping only
    // this persona's history to today removes the stale number before it can
    // be misread as current. The other two personas keep full history since
    // their numbers always carry an explicit date (dayBreakdown, "today's
    // session"), which doesn't have the same silent-staleness risk.
    if (coach === "nutritionist") {
      historyQuery = historyQuery.gte("created_at", `${todayIso()}T00:00:00`);
    }
    const { data: historyRows, error: historyErr } = await historyQuery;
    if (historyErr) throw historyErr;
    const history = (historyRows || []).slice().reverse().map((r) => ({ role: r.role, content: r.body }));

    const contextText = await buildContext(supabase, userId, coach, profile);
    const system = systemPromptFor(coach, contextText, profile);
    // log_meal is available from any of the three coach chats, not just the
    // Nutritionist's — Harry shouldn't have to switch tabs just to log food
    // he mentions mid-conversation with the Transformation Coach or Trainer.
    const tools = [TOOLS.log_meal, TOOLS.edit_meal, TOOLS.delete_meal];
    // The photo itself isn't stored (only used for this turn); the saved history
    // row just notes that one was attached.
    const userContent = imageBlock ? [imageBlock, { type: "text", text: message.trim() }] : message.trim();
    const messages = [...history, { role: "user", content: userContent }];
    const savedUserBody = imageBlock ? `📷 ${message.trim()}` : message.trim();

    // Everything from here streams back to Harry as it happens, instead of
    // him staring at "…" until the whole exchange — including any tool-use
    // round-trips — finishes. The response body is newline-delimited JSON,
    // one small object per line:
    //   {"type":"delta","text":"..."}   — a chunk of the reply to append
    //   {"type":"done","reply":"...","loggedMeal":...,"loggedMeals":[...]}
    //   {"type":"error","error":"...","needsSetup"?:true}
    // Plain NDJSON rather than real SSE — this is an internal API with one
    // purpose-built client (app/coach/page.js), so there's no reason to take
    // on the EventSource framing.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

        // Text streams in per tool-use round (see below), and a round that
        // itself calls a tool can still carry its own preamble text (e.g.
        // "Let me log that…") before the round that gives the real reply.
        // Accumulate all of it as Harry's reply, inserting a blank line
        // between rounds only when both sides of the seam actually have
        // text, so a silent tool-only round never leaves a stray gap.
        let replyText = "";
        let roundHadText = false;
        let priorRoundHadText = false;
        const onTextDelta = (delta) => {
          if (!roundHadText && priorRoundHadText) {
            replyText += "\n\n";
            enqueue({ type: "delta", text: "\n\n" });
          }
          roundHadText = true;
          replyText += delta;
          enqueue({ type: "delta", text: delta });
        };

        try {
          let response = await callClaudeStreaming({ system, messages, tools, onTextDelta });
          const loggedMeals = [];
          // Successful edit_meal / delete_meal calls this turn.
          let foodChanges = 0;
          let workingMessages = messages;

          // A single food-heavy message can need more than one log_meal call
          // (e.g. two separate items), and Claude sometimes spreads those
          // across more than one tool-use round rather than issuing them in
          // parallel in one round. Loop until Claude actually stops calling
          // tools, with a sane cap so a misbehaving model can't spin forever.
          let rounds = 0;
          const MAX_TOOL_ROUNDS = 5;
          while (response.stop_reason === "tool_use" && rounds < MAX_TOOL_ROUNDS) {
            rounds += 1;
            priorRoundHadText = roundHadText;
            roundHadText = false;
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
              } else if (toolUse.name === "edit_meal") {
                const input = toolUse.input || {};
                const patch = {};
                for (const key of ["meal", "description", "calories", "protein_g", "carbs_g", "fat_g", "fiber_g"]) {
                  if (input[key] !== undefined && input[key] !== null) patch[key] = input[key];
                }
                if (input.id == null || Object.keys(patch).length === 0) {
                  toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Need an entry id and at least one field to change.", is_error: true });
                } else {
                  // Scoped by user_id as well as id (RLS already enforces it).
                  const { data: updated, error: updErr } = await supabase
                    .from("food_log")
                    .update(patch)
                    .eq("id", input.id)
                    .eq("user_id", userId)
                    .select("id");
                  if (updErr) {
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Failed to edit: ${updErr.message}`, is_error: true });
                  } else if (!updated || updated.length === 0) {
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `No food log entry with id ${input.id} — nothing changed.`, is_error: true });
                  } else {
                    foodChanges += 1;
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Updated." });
                  }
                }
              } else if (toolUse.name === "delete_meal") {
                const input = toolUse.input || {};
                if (input.id == null) {
                  toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Need an entry id.", is_error: true });
                } else {
                  const { data: removed, error: delErr } = await supabase
                    .from("food_log")
                    .delete()
                    .eq("id", input.id)
                    .eq("user_id", userId)
                    .select("id");
                  if (delErr) {
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `Failed to delete: ${delErr.message}`, is_error: true });
                  } else if (!removed || removed.length === 0) {
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: `No food log entry with id ${input.id} — nothing deleted.`, is_error: true });
                  } else {
                    foodChanges += 1;
                    toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Deleted." });
                  }
                }
              } else {
                toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Unknown tool.", is_error: true });
              }
            }

            workingMessages = [...workingMessages, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
            response = await callClaudeStreaming({ system, messages: workingMessages, tools, onTextDelta });
          }

          // Belt and braces: even with the loop above, Claude can still land
          // on a turn with no usable text — either it hit the round cap
          // above mid tool call, or it just returned an empty response for
          // reasons we can't fully predict. Either way, never let that reach
          // Harry as an empty bubble. If a tool call is still dangling,
          // close it out first (the API requires a tool_result for every
          // tool_use before the next turn); then ask once more for a reply
          // with `tools` omitted entirely, so Claude has nothing to call and
          // has to answer in plain text.
          if (response.stop_reason === "tool_use" || !textFromResponse(response)) {
            priorRoundHadText = roundHadText;
            roundHadText = false;
            const danglingToolUses = response.content.filter((b) => b.type === "tool_use");
            const nudgeContent = danglingToolUses.length
              ? danglingToolUses.map((toolUse) => ({ type: "tool_result", tool_use_id: toolUse.id, content: "Noted." }))
              : "Reply to Harry now in one short, plain-text sentence — no tool calls.";
            workingMessages = [...workingMessages, { role: "assistant", content: response.content }, { role: "user", content: nudgeContent }];
            response = await callClaudeStreaming({ system, messages: workingMessages, onTextDelta });
          }

          if (!replyText.trim()) {
            const fallback = loggedMeals.length
              ? "Logged that for you."
              : foodChanges
                ? "Done — your food log is updated."
                : "Got it — let me know if you'd like me to log that.";
            replyText = fallback;
            enqueue({ type: "delta", text: fallback });
          }

          // Defense in depth against a known failure mode: the model stating
          // food was logged (confirmed happening — "Got that logged — about
          // 380 kcal...") without ever calling log_meal, so nothing lands in
          // food_log even though Harry's told otherwise. The system prompt
          // now explicitly forbids this, but that's a probabilistic
          // guardrail, not a guarantee — this just makes a slip visible in
          // the server logs instead of only discoverable by reconstructing
          // it from the database after the fact.
          if (loggedMeals.length === 0 && foodChanges === 0 && /\b(logged|got that|added (that|it)|noted (that|it)|removed|deleted|updated|fixed)\b/i.test(replyText)) {
            console.warn("Coach chat: reply reads like a food-log confirmation but no log_meal/edit_meal/delete_meal call succeeded this turn.", {
              userId, coach, message: message.trim(), replyText,
            });
          }

          const loggedMeal = loggedMeals[0] || null;

          const { error: insertHistErr } = await supabase.from("coach_messages").insert([
            { user_id: userId, coach, role: "user", body: savedUserBody, kind: "chat" },
            { user_id: userId, coach, role: "assistant", body: replyText, kind: "chat", meta: loggedMeals.length ? { logged_meals: loggedMeals } : null },
          ]);
          if (insertHistErr) {
            // By this point the full reply has already been streamed to
            // Harry — there's no clean way to retract it, and failing the
            // whole request now would just hide a reply he's already read.
            // Log it so a missing-history gap is diagnosable without
            // yanking back something already on his screen.
            console.error("Coach chat: failed to save chat history:", insertHistErr);
          }

          enqueue({ type: "done", reply: replyText, loggedMeal, loggedMeals });
        } catch (err) {
          if (err instanceof AnthropicConfigError) {
            enqueue({ type: "error", error: err.message, needsSetup: true });
          } else {
            console.error("Coach chat error:", err);
            enqueue({ type: "error", error: err.message || "Something went wrong." });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AnthropicConfigError) {
      return NextResponse.json({ error: err.message, needsSetup: true }, { status: 503 });
    }
    console.error("Coach chat error:", err);
    return NextResponse.json({ error: err.message || "Something went wrong." }, { status: 500 });
  }
}
