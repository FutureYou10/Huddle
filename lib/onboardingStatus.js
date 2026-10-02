// Single source of truth for "has this profile completed onboarding?" —
// shared by the client (useProfile's redirect into /onboarding) and the
// server (the cron jobs skipping profiles that aren't ready for coaching
// messages yet), so the two never disagree about what "onboarded" means.
export function isOnboarded(profile) {
  return !!(profile?.training_split && Object.keys(profile.training_split).length > 0);
}
