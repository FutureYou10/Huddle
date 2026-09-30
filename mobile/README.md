# Huddle mobile (v1: Health sync only)

The native app's only job right now is the thing a web app fundamentally
can't do: read Apple Health directly, so a new user taps **Allow** once
instead of building an iOS Shortcut. It signs in with the same Supabase
account as the web app and writes into the same `daily_metrics` table —
everything else (dashboards, coach chat, training log) still lives at
huddle-rho-orcin.vercel.app for now. Those screens get ported into this app
in later passes, once this foundation is proven on a real device.

## Why this couldn't be finished end-to-end in the build sandbox

Two hard limits, both worth knowing about:

1. **No npm registry access in the sandbox.** Every file here was written by
   hand and syntax-checked with esbuild (against `--external` flags for every
   dependency), the same way the web app's changes have been all along — but
   nothing has actually been `npm install`-ed or run. Versions in
   `package.json` are my best current guess, not a locked, tested set.
2. **No iOS toolchain here either** — no Xcode, no simulator, no physical
   device. I can't build or preview this app myself. The first real test
   happens on your machine or through EAS Build (Expo's cloud build service),
   not in this chat.

There's a third thing worth flagging honestly: `@kingstinct/react-native-healthkit`'s
exact API (function names, argument shapes) may have moved since I last knew
it — native-module libraries change their surface across major versions more
than typical JS packages, and I couldn't install it here to confirm. I isolated
every call into it inside `lib/healthkit.ts` for exactly this reason — if
something doesn't match, that's the one file to fix, not the rest of the app.

## First-time setup (do this on your own machine, not in this chat)

```bash
cd mobile
npm install
npx expo install --fix   # reconciles every Expo package to versions that
                          # actually match whatever Expo SDK npm resolves —
                          # corrects any version guesses above
cp .env.example .env     # already has the real Supabase URL/anon key filled in
```

## Why Expo Go won't work here

HealthKit is a custom native module. The generic **Expo Go** app on the App
Store only bundles Expo's own built-in native modules — it can't load
third-party native code like the HealthKit library, so this app won't run
inside it no matter what you try. You need a **development build**, which is
a one-time custom build of Expo Go with this app's native dependencies baked
in. After that first build, day-to-day work is normal fast-refresh JS
development, same as Expo Go.

## Building a development build (one-time, needs your Apple Developer account)

You'll do this part yourself — it needs your own Apple ID sign-in and 2FA,
which isn't something I can or should do on your behalf.

```bash
npm install -g eas-cli
eas login                        # your own Expo account (free) — create one if needed
eas build:configure              # links this project to an EAS project, fills in app.json's eas.projectId
eas build --profile development --platform ios
```

`eas build` will prompt to either let it manage iOS signing automatically
(recommended — it talks to your Apple Developer account directly) or use
credentials you provide. Automatic is simplest since you already have an
Apple Developer Program membership.

When the build finishes (10-20 minutes, cloud-side), EAS gives you an install
link — open it on your iPhone in Safari to install the dev-build app. From
then on:

```bash
npx expo start --dev-client
```

...starts the JS bundler, and opening the dev-build app on your phone
connects to it — edits to the JS/TS here show up with fast refresh, same as
any Expo project. You only need a fresh `eas build` again if a *native*
dependency changes (a new library, a new HealthKit permission, etc.) —
everyday screen/logic changes don't need it.

## What v1 actually does

1. Sign in with your existing Huddle email/password (same Supabase project,
   same account as the web app).
2. Requests Health read access for: weight, body fat %, lean mass, steps,
   active energy, resting energy, dietary energy, and protein — the same
   fields the old iOS Shortcut pulled.
3. Pulls the last 14 days and upserts them into `daily_metrics`
   (`onConflict: user_id,date`), so a gap gets backfilled, not just "today."
4. Re-syncs automatically every time the app comes to the foreground, plus a
   manual "Sync now" button.

Known gaps for later passes, not done tonight:
- **No background sync** — it only pulls when the app is actually opened.
  True background delivery (syncing while the app is closed) needs
  `HKObserverQuery` + iOS background delivery entitlements, which is real
  additional work and easier to get right once the foreground path is proven
  on your phone.
- **No conflict handling** against a same-day manual entry made in the web
  app's coach chat — Health's value just overwrites it on next sync. Worth
  revisiting once you've used both side by side for a few days and see
  whether it's actually a problem in practice.
- Bundle identifier is a placeholder (`com.futureyou10.huddle`) — fine for a
  development build, but confirm/change it before any real App Store
  submission, matching whatever App ID you register in App Store Connect.
