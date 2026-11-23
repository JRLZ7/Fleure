import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Banner, Button } from "../ui";
import { colors, radius } from "../theme";

export function SignInScreen({ email, password, busy, ready, error, status, onEmail, onPassword, onSubmit }: {
  email: string;
  password: string;
  busy: boolean;
  ready: boolean;
  error: string;
  status: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
}) {
  const passwordRef = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const canSubmit = ready && !busy && email.trim().length > 0 && password.length > 0;

  return (
    <KeyboardAvoidingView style={st.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
        <View style={st.hero}>
          <View style={st.mark}><Text style={st.markLetter}>f</Text></View>
          <Text style={st.brand}>fleure</Text>
          <Text style={st.tagline}>Remote ischemic conditioning,{"\n"}guided from your phone.</Text>
        </View>

        <View style={st.form}>
          <Text accessibilityRole="header" style={st.heading}>Sign in</Text>
          <Text style={st.sub}>Use the patient account from your care team.</Text>
          {!!error && <Banner tone="danger" icon="alert-circle" text={error} />}

          <Text style={st.label}>Email</Text>
          <View style={st.field}>
            <Ionicons name="mail-outline" size={19} color={colors.inkSoft} />
            <TextInput
              accessibilityLabel="Email address"
              style={st.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              autoComplete="email"
              returnKeyType="next"
              value={email}
              onChangeText={onEmail}
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
              placeholder="you@example.com"
              placeholderTextColor={colors.inkSoft}
            />
          </View>

          <Text style={st.label}>Password</Text>
          <View style={st.field}>
            <Ionicons name="lock-closed-outline" size={19} color={colors.inkSoft} />
            <TextInput
              ref={passwordRef}
              accessibilityLabel="Password"
              style={st.input}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              value={password}
              onChangeText={onPassword}
              onSubmitEditing={() => { if (canSubmit) onSubmit(); }}
              placeholder="Your password"
              placeholderTextColor={colors.inkSoft}
            />
            <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? "Hide password" : "Show password"} hitSlop={10} onPress={() => setShowPassword(v => !v)}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.inkMuted} />
            </Pressable>
          </View>

          <Button title={busy ? "Signing in" : "Sign in"} loading={busy} disabled={!canSubmit} onPress={onSubmit} style={st.submit} />
          {!!status && <Text style={st.status}>{status}</Text>}
          {!ready && <Text style={st.status}>Loading saved sessions…</Text>}
        </View>

        <Text style={st.footer}>Bench prototype · not for clinical use</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  flex: { flex: 1 },
  page: { flexGrow: 1, padding: 24, paddingBottom: 32, gap: 28, justifyContent: "center", maxWidth: 520, width: "100%", alignSelf: "center" },
  hero: { alignItems: "center", gap: 10, paddingTop: 24 },
  mark: { width: 72, height: 72, borderRadius: 26, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  markLetter: { color: colors.accentInk, fontSize: 52, fontWeight: "600", fontStyle: "italic", marginTop: -8 },
  brand: { color: colors.ink, fontSize: 34, fontWeight: "700", letterSpacing: -1.2 },
  tagline: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  form: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 22, gap: 10, borderWidth: 1, borderColor: colors.border },
  heading: { color: colors.ink, fontSize: 24, fontWeight: "700" },
  sub: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, marginBottom: 4 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "600", marginTop: 6 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F7F9F5", borderWidth: 1, borderColor: "#D4DED2", borderRadius: radius.sm, paddingHorizontal: 14, minHeight: 52 },
  input: { flex: 1, color: colors.ink, fontSize: 16, paddingVertical: 14 },
  submit: { marginTop: 12 },
  status: { color: colors.inkMuted, fontSize: 13, textAlign: "center" },
  footer: { color: colors.inkSoft, fontSize: 11, fontWeight: "600", letterSpacing: 1, textAlign: "center", textTransform: "uppercase" },
});
