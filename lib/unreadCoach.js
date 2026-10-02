"use client";

// Lightweight, per-device "unread" tracking for the coach chat. There's no
// server-side read receipt for coach_messages, so — like the training-draft
// and recap-seen state elsewhere in this app — this just remembers, per
// coach, the last time Harry actually opened that thread, and counts
// anything newer than that as unread. Good enough to answer the same
// question a messaging app's badge answers, with no schema change.

export const COACHES = ["transformation", "nutritionist", "trainer"];

function lastSeenKey(userId, coach) {
  return `huddle-coach-seen-${userId}-${coach}`;
}

export function getLastSeen(userId, coach) {
  try {
    return localStorage.getItem(lastSeenKey(userId, coach));
  } catch {
    return null;
  }
}

export function markSeen(userId, coach, atIso) {
  try {
    localStorage.setItem(lastSeenKey(userId, coach), atIso || new Date().toISOString());
  } catch {
    // Best-effort — worst case the badge just doesn't clear until the next
    // successful write.
  }
}

// `rows` is any list of { coach, created_at } assistant messages (order
// doesn't matter, duplicates are harmless). Returns one count per coach.
export function countUnread(userId, rows) {
  const counts = Object.fromEntries(COACHES.map((c) => [c, 0]));
  for (const coach of COACHES) {
    const seen = getLastSeen(userId, coach);
    counts[coach] = (rows || []).filter((m) => m.coach === coach && (!seen || m.created_at > seen)).length;
  }
  return counts;
}

export function totalUnread(counts) {
  return COACHES.reduce((sum, c) => sum + (counts[c] || 0), 0);
}
