// Server-only pieces of the Mind tab: the signed-in Supabase client and the
// two Claude prompts (untangle a brain dump / solve one item).

import { createClient } from "@supabase/supabase-js";

export function supabaseForToken(token) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Resolves the bearer token to { supabase, user } or { error, status }.
export async function authed(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Not signed in.", status: 401 };
  const supabase = supabaseForToken(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { error: "Session expired — please sign in again.", status: 401 };
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error: "ANTHROPIC_API_KEY is not set. Add it as an Environment Variable in the Vercel project settings, then redeploy.",
      status: 503,
    };
  }
  return { supabase, user: data.user };
}

const SHARED_STANCE = `You help someone with ADHD get things out of their head and into action. They tend to ruminate: the same worries and decisions get talked through again and again without turning into anything done. Your job is to stop the loop.

Principles:
- Action over thinking. Every item should point to something physical they can do, or be explicitly let go.
- Be honest about control. If the outcome depends on other people, the market, the past, health results, the weather, etc., it is "not_mine" — say so plainly, so they stop spending time problem-solving it. If part of it is theirs (they can ask, prepare, send, decide their response), it's "influence" and you name that sliver.
- Small steps. A step is one concrete physical action that takes under 15 minutes, starting with a verb ("Text Sam to ask…", "Open the bank app and…"). The first step should take under 2 minutes.
- Plain, warm, short. British English. No therapy-speak, no lectures, no motivational filler.`;

export const UNTANGLE_SYSTEM = `${SHARED_STANCE}

You'll be given raw thinking — a brain dump, excerpts from past chats with Claude, or a summary Claude wrote of their past chats — plus the areas and open items already on their map. Pull out the distinct things taking up headspace and file each one.

Rules:
- One item per distinct thing. Merge repeats. If something is already on the map, return it with existing_id set instead of creating a duplicate (and count how many more times it came up in "mentions").
- Skip anything already resolved, trivial one-off questions (e.g. "what's the capital of…"), and pure information lookups. Keep what is genuinely occupying their mind: open decisions, worries, commitments, projects, things they keep meaning to do.
- Areas are life buckets like Work, Money, Health, Family, Home, Business, Relationships. Reuse an existing area name exactly when it fits. Keep the whole map to 8 areas or fewer.
- Titles: 3–8 words, plain, specific ("Decide whether to hire a barista", not "Staffing").
- "mentions": how many separate chats or times this came up. A high number means they've been looping on it. If a summary gives a count, use it.
- If a summary says what they'd already decided or where they got to, put that in the detail, and if the next steps are then obvious, mark it ready.
- "ready": true only when it's obvious what to do (a plain to-do). Then give 2–5 steps. Decisions and worries are not ready — they need solving first, so give no steps.
- For not_mine items, influence_note is the one thing they *could* do, or "Nothing to do — let it go." For influence items, it's the part that is theirs.`;

export const UNTANGLE_TOOL = {
  name: "map_thoughts",
  description: "File every distinct thing occupying headspace onto the map.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            existing_id: { type: "string", description: "id of an item already on the map that this is the same as; omit for new items" },
            area: { type: "string" },
            area_emoji: { type: "string", description: "one emoji for the area" },
            title: { type: "string" },
            detail: { type: "string", description: "one sentence: what's actually going on" },
            kind: { type: "string", enum: ["action", "decision", "worry", "idea"] },
            control: { type: "string", enum: ["mine", "influence", "not_mine"] },
            load: { type: "integer", enum: [1, 2, 3], description: "how much headspace it takes: 1 light, 3 heavy" },
            mentions: { type: "integer", minimum: 1 },
            ready: { type: "boolean" },
            steps: { type: "array", items: { type: "string" } },
            influence_note: { type: "string" },
          },
          required: ["area", "title", "kind", "control", "load", "mentions", "ready"],
        },
      },
    },
    required: ["items"],
  },
};

export const SOLVE_SYSTEM = `${SHARED_STANCE}

You'll be given one item from their map that's stuck ("tangled"). Solve it with them so they can commit to action and stop thinking about it.

- Name the real question in one line (often smaller than it feels).
- Give 2–3 genuinely different options. For a plain to-do, one option is fine. Each option has a one-line "why" and 2–5 small steps that would carry it out.
- Recommend one. Be decisive — they can overrule you.
- If the honest answer is that it's mostly out of their control, say so in "reframe", make the first option the small part they can influence, and include an option to let it go.
- "good_enough": one line on what "done" looks like, so they know when to stop.`;

export const SOLVE_TOOL = {
  name: "solve_item",
  description: "Offer a decisive way through, as options with small steps.",
  input_schema: {
    type: "object",
    properties: {
      reframe: { type: "string" },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            why: { type: "string" },
            steps: { type: "array", items: { type: "string" } },
          },
          required: ["label", "why", "steps"],
        },
      },
      recommended: { type: "integer", description: "index into options" },
      good_enough: { type: "string" },
    },
    required: ["reframe", "options", "recommended", "good_enough"],
  },
};
