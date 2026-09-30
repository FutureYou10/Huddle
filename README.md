# Huddle

Harry's personal coaching dashboard — weigh-ins, goal projection, weekly
nutrition targets, and recent meals, all backed by the "Getstacked" Supabase
project (Postgres + Auth + Row Level Security).

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
- `app/page.js` — the dashboard (redirects to `/login` if not signed in)
- `lib/supabaseClient.js` — Supabase client setup
- `lib/coaching.js` — shared goal-projection math (mirrors the onboarding prototype)
- `app/globals.css` — design system (light/dark, matches the onboarding prototype)

## Status

This is the first cut of the real app, running in parallel with the existing
Airtable-based daily coaching (scheduled tasks + dashboards keep running
unchanged until this is verified solid). Next up: writing weigh-ins and meals
*into* the app itself (currently it's read-only against the migrated/synced
data), then eventually porting to Expo/React Native for the App Store.
