// Server-only web-push helper. Needs three env vars (see .env.local.example):
// NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and, optionally, VAPID_SUBJECT.
import webpush from "web-push";

let configured = false;

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:noreply@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
}

// Sends one payload to every given subscription row ({ id, endpoint, p256dh,
// auth }) and deletes any the push service says are gone (404/410 — the
// reminder was uninstalled or permission revoked), so dead devices don't pile up.
export async function sendPush(supabase, subs, payload) {
  configure();
  let sent = 0;
  const dead = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600 }
        );
        sent += 1;
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
        else console.error("Push send failed:", err?.statusCode, err?.body || err?.message);
      }
    })
  );
  if (dead.length) await supabase.from("push_subscriptions").delete().in("id", dead);
  return { sent, removed: dead.length };
}
