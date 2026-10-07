// Server-only wrapper around the Anthropic Messages API. Plain fetch, no SDK
// dependency, so this needs no npm install step to deploy — it just needs
// ANTHROPIC_API_KEY set as a (non-public) Vercel environment variable.
//
// Never import this from a "use client" file — it reads a secret env var
// and must only ever run in a route handler (server-side).

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicConfigError extends Error {}

// Turn Anthropic's raw error body into something a person can act on.
function apiError(status, text) {
  let msg = "";
  try { msg = JSON.parse(text)?.error?.message || ""; } catch {}
  if (/usage limits?/i.test(msg)) {
    const when = msg.match(/regain access on ([0-9T:\- ]+UTC)/i);
    return new Error(
      "Your coach is paused: the Anthropic API spend limit has been reached" +
        (when ? ` (resets ${when[1]})` : "") +
        ". Raise the limit or add credit in the Anthropic Console to switch it back on."
    );
  }
  if (status === 429) return new Error("The coach is getting too many requests right now — try again in a minute.");
  if (status === 529 || status >= 500) return new Error("Anthropic is busy right now — try again in a moment.");
  if (status === 401) return new Error("The Anthropic API key was rejected — check ANTHROPIC_API_KEY in Vercel.");
  return new Error(`Anthropic API error ${status}: ${text.slice(0, 500)}`);
}

export async function callClaude({ system, messages, tools, toolChoice, maxTokens = 1024 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicConfigError(
      "ANTHROPIC_API_KEY is not set. Add it as an Environment Variable in the Vercel project settings, then redeploy."
    );
  }

  const body = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: maxTokens,
    // Every caller here passes a big generated context dump as a plain
    // string (profile + metrics + food log + training state...). Wrapping
    // it as a cacheable block means a multi-round tool-use exchange (the
    // coach chat loop in app/api/coach — log one meal, sometimes two or
    // three rounds) reads that same system prompt from cache on rounds 2+
    // instead of reprocessing the whole thing each time, and a cache write
    // from one turn is still warm (5min TTL) for the very next message in
    // the same conversation. Meaningfully cuts real latency on exactly the
    // multi-round case that was making chat feel slow — not just cosmetic.
    // A caller that already built its own content-block array (none do
    // today) passes it straight through untouched.
    system: typeof system === "string" ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system,
    messages,
  };
  if (tools && tools.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw apiError(res.status, text);
  }
  return res.json();
}

// Parses a fetch Response whose body is an Anthropic SSE event stream,
// yielding each event's already-JSON-parsed `data:` payload. Anthropic's SSE
// events always carry a `type` field matching the `event:` line, so callers
// can switch on that directly — no need to track the `event:` line too.
async function* sseEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // may be an incomplete line — finish it next read
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        yield JSON.parse(payload);
      } catch {
        // A malformed line shouldn't take down the whole stream.
      }
    }
  }
}

// Streaming counterpart to callClaude, for the one case where showing partial
// output as it's generated is worth the extra plumbing: the coach chat's
// user-visible reply (app/api/coach/route.js). Everywhere else (nutrition
// insights, the daily/midweek cron jobs) wants one finished result and
// should keep using callClaude.
//
// Reconstructs the same { content, stop_reason } shape callClaude's
// res.json() would have returned, so a caller can reuse textFromResponse /
// toolInputFromResponse and the same tool-use-loop logic either way — the
// only new behavior is the onTextDelta callback, fired with each chunk of
// text as it streams in. A tool_use block's input arrives as fragments too,
// but those are only ever handed back whole, once complete — partial
// tool-call JSON isn't something a caller could safely act on.
export async function callClaudeStreaming({ system, messages, tools, toolChoice, maxTokens = 1024, onTextDelta }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AnthropicConfigError(
      "ANTHROPIC_API_KEY is not set. Add it as an Environment Variable in the Vercel project settings, then redeploy."
    );
  }

  const body = {
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: typeof system === "string" ? [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] : system,
    messages,
    stream: true,
  };
  if (tools && tools.length) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw apiError(res.status, text);
  }

  const blocks = [];
  let stopReason = null;

  for await (const event of sseEvents(res)) {
    switch (event.type) {
      case "content_block_start": {
        const cb = event.content_block;
        blocks[event.index] =
          cb.type === "tool_use" ? { type: "tool_use", id: cb.id, name: cb.name, input: {}, _json: "" } : { type: "text", text: "" };
        break;
      }
      case "content_block_delta": {
        const block = blocks[event.index];
        if (!block) break;
        if (event.delta.type === "text_delta") {
          block.text += event.delta.text;
          if (onTextDelta) onTextDelta(event.delta.text);
        } else if (event.delta.type === "input_json_delta") {
          block._json += event.delta.partial_json || "";
        }
        break;
      }
      case "content_block_stop": {
        const block = blocks[event.index];
        if (block && block.type === "tool_use") {
          try {
            block.input = block._json ? JSON.parse(block._json) : {};
          } catch {
            block.input = {};
          }
          delete block._json;
        }
        break;
      }
      case "message_delta": {
        if (event.delta && event.delta.stop_reason) stopReason = event.delta.stop_reason;
        break;
      }
      case "error": {
        throw new Error(event.error?.message || "Anthropic streaming error");
      }
      default:
        break;
    }
  }

  return { content: blocks.filter(Boolean), stop_reason: stopReason };
}

// Pulls the plain-text reply out of a Messages API response, ignoring any
// tool_use blocks (callers that care about tool calls read response.content
// directly instead).
export function textFromResponse(response) {
  return (response.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

// Pulls the first tool call's input out of a response — for callers that
// force a single structured tool via toolChoice and just want its arguments
// back (e.g. a JSON-shaped suggestion) rather than a prose reply.
export function toolInputFromResponse(response, toolName) {
  const block = (response.content || []).find((b) => b.type === "tool_use" && (!toolName || b.name === toolName));
  return block ? block.input : null;
}
