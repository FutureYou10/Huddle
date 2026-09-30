import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { supabase } from "../lib/supabase";

// Same Supabase Auth users as the web app — sign in with the same email and
// password you use on huddle-rho-orcin.vercel.app.
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSignIn() {
    setError("");
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) setError(signInError.message);
  }

  return (
    <KeyboardAvoidingView
      style={styles.shell}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.eyebrow}>HUDDLE</Text>
      <Text style={styles.title}>Welcome back</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          placeholder="••••••••"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleSignIn} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#faf9f6" },
  eyebrow: { fontSize: 11, fontWeight: "700", letterSpacing: 1, color: "#8b8d93", marginBottom: 4 },
  title: { fontSize: 26, fontWeight: "700", color: "#1a1a1a", marginBottom: 24 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "600", color: "#5b5d63", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#e5e2da",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  error: { color: "#c8501f", fontSize: 13, marginBottom: 12 },
  button: {
    backgroundColor: "#c8501f",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
