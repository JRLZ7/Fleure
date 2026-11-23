import React, { useEffect, useState } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Button, Card } from "../ui";
import { colors, radius } from "../theme";
import { formatTime, SYSTOLIC_HIGH_MMHG, SYSTOLIC_LOW_MMHG } from "../protocol";

const CHECKS = [
  "I've been sitting quietly for at least 5 minutes.",
  "The cuff is on my upper arm, snug but not tight, with my arm supported.",
  "I feel well: no chest pain, dizziness, shortness of breath or numbness.",
  "I'll keep still and keep this app open until the session ends.",
];

export function PreSessionSheet({ visible, automated, targetMmHg, durationSeconds, canStart, onCancel, onConfirm }: {
  visible: boolean;
  automated: boolean;
  targetMmHg: number;
  durationSeconds: number;
  canStart: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  useEffect(() => { if (visible) setChecked(CHECKS.map(() => false)); }, [visible]);
  const allChecked = checked.every(Boolean);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <SafeAreaView style={st.screen}>
        <ScrollView contentContainerStyle={st.page}>
          <View style={st.grabber} />
          <Text accessibilityRole="header" style={st.title}>Before you start</Text>
          <Text style={st.sub}>A quick check helps your session go safely.</Text>

          <Card style={st.plan}>
            <Ionicons name={automated ? "pulse" : "options-outline"} size={24} color={colors.brand} />
            <View style={st.grow}>
              <Text style={st.planTitle}>{automated ? "Automated RIPC" : "Manual therapy"}</Text>
              <Text style={st.planDetail}>
                {automated
                  ? `Measures your blood pressure first, then holds 10 mmHg above systolic for ${formatTime(durationSeconds)}. Stops if systolic is ${SYSTOLIC_HIGH_MMHG}+ or below ${SYSTOLIC_LOW_MMHG}.`
                  : `Holds ${targetMmHg} mmHg for ${formatTime(durationSeconds)}.`}
              </Text>
            </View>
          </Card>

          <View style={st.checks}>
            {CHECKS.map((text, i) => (
              <Pressable
                key={i}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checked[i] }}
                accessibilityLabel={text}
                onPress={() => setChecked(c => c.map((v, j) => (j === i ? !v : v)))}
                style={({ pressed }) => [st.check, checked[i] && st.checkOn, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name={checked[i] ? "checkbox" : "square-outline"} size={24} color={checked[i] ? colors.brand : colors.inkSoft} />
                <Text style={st.checkText}>{text}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={st.note}>Stop right away and seek care if you feel pain, numbness, or unwell. You can stop with the app or the green button on the device.</Text>
          {!canStart && <Text style={st.warn}>Your device isn't ready. Check that it's connected and reporting pressure.</Text>}
          <Button title="Start session" icon="play" disabled={!allChecked || !canStart} onPress={onConfirm} />
          <Button title="Not now" variant="ghost" onPress={onCancel} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, gap: 14, maxWidth: 560, width: "100%", alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, alignSelf: "center", marginBottom: 6 },
  grow: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.6 },
  sub: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  plan: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  planTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  planDetail: { color: colors.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 3 },
  checks: { gap: 10 },
  check: { flexDirection: "row", gap: 12, alignItems: "flex-start", padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  checkOn: { borderColor: colors.brand, backgroundColor: "#F1F7F3" },
  checkText: { flex: 1, color: colors.ink, fontSize: 15, lineHeight: 22 },
  note: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  warn: { color: colors.danger, fontSize: 13, lineHeight: 19 },
});
