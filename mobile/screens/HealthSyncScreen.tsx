import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, AppState } from "react-native";
import { supabase } from "../lib/supabase";
import { healthKitAvailable, requestHealthPermissions } from "../lib/healthkit";
import { syncHealthData } from "../lib/sync";

type Status = "checking" | "unavailable" | "needs_permission" | "syncing" | "synced" | "error";

// The whole point of the native app, v1: replace "build your own iOS
// Shortcut" with "tap Allow once." Everything else Huddle does (the actual
// coach dashboards, chat, training log) still lives on the web app for now —
// this screen's only job is keeping daily_metrics topped up from Health.
export default function HealthSyncScreen() {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const runSync = useCallback(async () => {
    setStatus("syncing");
    const result = await syncHealthData(14);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.error || "Sync failed.");
      return;
    }
    setStatus("synced");
    setMessage(
      result.daysWritten > 0
        ? `Synced ${result.daysWritten} day${result.daysWritten === 1 ? "" : "s"} from Health.`
        : "Up to date — nothing new in Health since last sync."
    );
    setLastSynced(new Date());
  }, []);

  const init = useCallback(async () => {
    const available = await healthKitAvailable();
    if (!available) {
      setStatus("unavailable");
      setMessage("Health isn't available on this device (Health only exists on iPhone, not iPad or simulators without it configured).");
      return;
    }
    const granted = await requestHealthPermissions();
    if (!granted) {
      setStatus("needs_permission");
      setMessage("Couldn't request Health access — try again, or check Settings → Privacy → Health → Huddle.");
      return;
    }
    await runSync();
  }, [runSync]);

  useEffect(() => {
    init();
    // Re-sync whenever the app comes back to the foreground, so numbers
    // logged in Health (a new weigh-in, today's steps) show up without
    // Harry having to think about it.
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") runSync();
    });
    return () => sub.remove();
  }, [init, runSync]);

  return (
    <ScrollView contentContainerStyle={styles.shell}>
      <Text style={styles.eyebrow}>HUDDLE</Text>
      <Text style={styles.title}>Health sync</Text>
      <Text style={styles.sub}>
        Weight, body fat, lean mass, steps, and energy sync straight from Health into your Huddle
        dashboards — no Shortcut to build.
      </Text>

      <View style={styles.card}>
        {status === "checking" || status === "syncing" ? (
          <View style={styles.row}>
            <ActivityIndicator />
            <Text style={styles.rowText}>{status === "checking" ? "Checking Health access…" : "Syncing…"}</Text>
          </View>
        ) : (
          <Text style={[styles.rowText, status === "error" && styles.errorText]}>{message}</Text>
        )}
        {lastSynced && status !== "syncing" && (
          <Text style={styles.timestamp}>Last synced {lastSynced.toLocaleTimeString()}</Text>
        )}
      </View>

      <Pressable style={styles.button} onPress={status === "needs_permission" ? init : runSync}>
        <Text style={styles.buttonText}>
          {status === "needs_permission" ? "Allow Health access" : "Sync now"}
        </Text>
      </Pressable>

      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  shell: { flexGrow: 1, padding: 24, paddingTop: 64, backgroundColor: "#faf9f6" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#8b8d93", marginBottom: 4 },
  title: { fontSize: 26, fontWeight: "700", color: "#1a1a1a", marginBottom: 8 },
  sub: { fontSize: 13.5, color: "#5b5d63", lineHeight: 19, marginBottom: 24 },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e2da",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { fontSize: 14, color: "#1a1a1a", flexShrink: 1 },
  errorText: { color: "#c8501f" },
  timestamp: { fontSize: 11.5, color: "#8b8d93", marginTop: 8 },
  button: {
    backgroundColor: "#c8501f",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  signOut: { alignItems: "center", paddingVertical: 10 },
  signOutText: { color: "#8b8d93", fontSize: 13, textDecorationLine: "underline" },
});
