// Server-only wrapper around the Anthropic Messages API. Plain fetch, no SDK
// dependency, so this needs no npm install step to deploy — it just needs
// ANTHROPIC_API_KEY set as a (non-public) Vercel environment variable.
//
// Never import this from a "use client" file — it reads a secret env var
// and must only ever run in a route handler (server-side).

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicConfigError extends Error {}

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
    system,
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
    throw new Error(`Anthropic API error ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
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
