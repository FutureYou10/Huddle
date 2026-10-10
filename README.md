# Huddle

Harry's personal coaching app — three dashboards (Overview, Food, Training)
with a bottom tab bar, backed by the "Getstacked" Supabase project (Postgres
+ Auth + Row Level Security).

## Local development

```bash
cp .env.local.example .env.local   # already filled in with the real Supabase URL + publishable key
npm install
npm run dev
```

Open http://localhost:3000 — you'll land on `/login` until you sign up or
sign in.

## Deploying (Vercel)

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. In the project's **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://kcxnwehxdrzwwqizqnym.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the publishable key from `.env.local.example`
4. Deploy. Vercel builds with `npm install && npm run build` automatically —
   no other config needed (this is a stock Next.js 14 App Router project).

## First real sign-up (one-time, important)

Your migrated Airtable history (weigh-ins, food log, weekly targets, your
baseline photo note) is currently attached to a **placeholder** profile row in
Supabase, not to a real login. The first time you sign up through `/login` on
the deployed app:

1. Tell Claude the email you signed up with.
2. Claude will look up the new `auth.users` id Supabase generated for you and
   run one SQL statement that re-points your historical data at your new
   account (`UPDATE profiles SET id = '<new-auth-uid>' WHERE id = '<placeholder-uid>'`).
   The database is already set up (`ON UPDATE CASCADE` on every child table)
   so this is a single clean statement — nothing needs to be re-entered.

Skip this and the app still works, but you'll start from a blank slate
instead of seeing your existing history.

## Project structure

- `app/login/page.js` — sign in / sign up (Supabase Auth, email+password)
- `app/page.js` — **Overview** tab: weight trend + goal projection
- `app/food/page.js` — **Food** tab: weekly targets + meal log, grouped by day
- `app/training/page.js` — **Training** tab: workout plan + recent sessions (grouped by day, sets shown as chips)
- `app/training/log/page.js` — log a workout set (the one manual-entry form that's stayed — see Status below)
- `app/mind/page.js` — **Mind** tab: a map of everything taking up headspace (see below)
- `components/AppHeader.js` — shared page header (title + sign out), used by all three dashboards
- `components/BottomNav.js` — the tab bar (Overview / Food / Training), active-state aware
- `lib/supabaseClient.js` — Supabase client setup
- `lib/coaching.js` — shared goal-projection math + date helpers (mirrors the onboarding prototype)
- `lib/constants.js` — canonical dropdown option lists (training day types)
- `lib/ensureProfile.js` — fetches or creates the signed-in user's profile row; called by every page before it reads or writes anything else
- `lib/useProfile.js` — shared hook wrapping session-check + `ensureProfile`, used by every page
- `app/globals.css` — design system (light/dark, matches the onboarding prototype)

## Status

Running in parallel with the existing Airtable-based daily coaching
(scheduled tasks keep running unchanged until this is verified solid).

**Weigh-ins and meals are read-only in the app on purpose** — those come from
the existing automated pipeline (Apple Health → Shortcuts → Zapier for
weigh-ins; the Nutritionist coach chat for meals), not from typing them into
a form here. Once that pipeline is repointed from Airtable to Supabase (part
of the eventual cutover), new entries will just show up in Overview/Food
without the app needing to do anything.

**Training is the one place with manual logging in-app**, because gym
sets/reps/weight aren't captured by an existing automated source the way
weigh-ins and meals are.

Not yet in the app: the actual coach chat (Nutritionist / Trainer / Head
Coach personas + the daily coaching message) — that still runs as
conversations with Claude and the scheduled task, separately from Huddle.
Bringing that into the app, and repointing the live data pipeline from
Airtable to Supabase, are the next real steps — then eventually porting to
Expo/React Native for the App Store.

## Mind tab

A visual of what's on your mind, built to turn thinking into action instead of
rumination. You sit in the middle of the map. Each life area (Work, Money,
Family…) is an atom, sized by how much headspace it's taking, and its thoughts
circle it as electrons. Anything out of your control sits on a faint outer ring,
apart from what you can act on.

Every thought moves **tangled → solved → committed → done**, or gets **let go**:

- **Empty head**: type or dictate a brain dump, or import past Claude chats.
  Claude sorts it into areas, merges repeats (so a thought you keep coming back
  to shows as 🔁 *on a loop*), and labels each one *in my control*,
  *partly mine* or *out of my control*.
- **Solve it**: for a stuck decision or worry, Claude names the real question,
  offers 2–3 options with small steps each, and recommends one. Pick one and
  it's solved.
- **Commit**: sign up to the steps. Committed things feed **Do**, which shows
  one tiny next step at a time with a big *Done ✓*.
- Out-of-control items can't be solved, only let go. If there's a small part
  you can still do, it's shown.

**Pulling in Claude chats (quick way):** Empty head has a *Copy the prompt*
button. Paste the prompt into a new claude.ai chat, which searches your past
conversations and writes a detailed summary grouped by area, with how often each
thing came up and how much of it is in your control. Paste that answer back into
Empty head and untangle it. Run it again any time; repeats get merged.

**Importing Claude chats (full export):** claude.ai doesn't offer an API for reading your
chats, so this works from the data export (claude.ai → Settings → Privacy →
Export data). Choose the .zip in the Mind tab and pick which chats to include.
The file is read in the browser. Only a condensed version of your own messages
from the chats you pick is sent to Claude to be sorted, and only the items it
pulls out are stored. Chats already imported are remembered, so a later export
only brings in new ones.

Tables: `mind_areas`, `mind_items`, `mind_imported_chats`
(`supabase/migrations/20261010_mind_map.sql`, already applied to the project).
Uses the same `ANTHROPIC_API_KEY` as the coach chat.
