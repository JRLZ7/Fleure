import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Telemetry, PHASE_LABELS, formatTime, isActive } from "../protocol";
import { Banner, Button, Card, IconBadge, Pill, SectionLabel } from "../ui";
import { colors, radius } from "../theme";
import { greeting } from "../eventText";

export type HomeProps = {
  name: string;
  connected: boolean;
  connecting: boolean;
  deviceName: string;
  therapy: Telemetry | null;
  therapyActive: boolean;
  starting: boolean;
  stopping: boolean;
  canStart: boolean;
  automationSupported: boolean;
  targetMmHg: number;
  durationSeconds: number;
  error: string;
  bpAlert: string;
  systolic: number | null;
  reasonText: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onStart: (automated: boolean) => void;
  onStop: () => void;
  onEditPlan: () => void;
  onOpenProfile: () => void;
};

export function HomeScreen(p: HomeProps) {
  const t = p.connected ? p.therapy : null;
  const active = isActive(t) || p.starting;
  const countdown = t && (isActive(t) || t.timerStarted) ? t.remainingSeconds : p.durationSeconds;
  const total = t && (isActive(t) || t.timerStarted) ? t.durationSeconds : p.durationSeconds;
  const progress = t?.timerStarted ? Math.min(1, Math.max(0, 1 - t.remainingSeconds / Math.max(1, total))) : t?.phase === "completed" ? 1 : 0;
  const phaseLabel = !p.connected ? "Not connected" : t ? PHASE_LABELS[t.phase] : "Reading device…";
  const initials = p.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const phaseHint = !t ? "" : t.phase === "estimating_systolic" ? "Measuring your blood pressure as the cuff inflates"
    : t.phase === "pressurizing" ? "Building pressure · timer starts within ±5 mmHg of target"
    : t.phase === "running" ? "Hold still · the countdown runs on your device"
    : t.phase === "completed" ? "Done · pump off · vent open"
    : "";

  return (
    <View style={st.stack}>
      <View style={st.header}>
        <View style={st.grow}>
          <Text style={st.greeting}>{greeting()},</Text>
          <Text accessibilityRole="header" style={st.name}>{p.name}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Open profile" onPress={p.onOpenProfile} style={st.avatar}>
          <Text style={st.avatarText}>{initials}</Text>
        </Pressable>
      </View>

      {!!p.error && <Banner tone="danger" icon="alert-circle" text={p.error} />}
      {!!p.bpAlert && <Banner tone="danger" icon="heart-dislike" title="Blood pressure warning" text={p.bpAlert} />}

      <Card style={st.deviceRow}>
        <IconBadge icon="bluetooth" tone={p.connected ? "success" : "neutral"} size={44} />
        <View style={st.grow}>
          <Text style={st.deviceTitle}>Fleure device</Text>
          <Text style={st.deviceDetail} numberOfLines={1}>{p.connected ? p.deviceName || "Connected" : p.connecting ? "Searching nearby…" : "Not connected"}</Text>
        </View>
        {p.connected
          ? <Button title="Disconnect" variant="secondary" style={st.smallButton} disabled={p.starting || p.stopping || active} onPress={p.onDisconnect} />
          : <Button title={p.connecting ? "Connecting" : "Connect"} loading={p.connecting} style={st.smallButton} onPress={p.onConnect} />}
      </Card>

      <View style={st.live}>
        <View style={st.liveTop}>
          <Text style={st.liveEyebrow}>{active ? "SESSION IN PROGRESS" : "LIVE PRESSURE"}</Text>
          <View style={[st.liveDot, { backgroundColor: p.connected ? "#BDE9CF" : "#8FA9A0" }]} />
        </View>
        {!p.connected ? (
          <View style={st.offline}>
            <Ionicons name="bluetooth-outline" size={34} color={colors.onBrandMuted} />
            <Text style={st.offlineTitle}>Connect your device to begin</Text>
            <Text style={st.liveHint}>Keep the ESP32 nearby with Bluetooth on, and keep this app open while connected.</Text>
          </View>
        ) : (
          <>
            <View style={st.pressureLine}>
              <Text accessibilityLiveRegion="none" style={st.pressure}>{t?.pressureMmHg != null ? t.pressureMmHg.toFixed(0) : "—"}</Text>
              <Text style={st.unit}>mmHg</Text>
            </View>
            <Text accessibilityLiveRegion="polite" style={st.phase}>{phaseLabel}</Text>
            {!!phaseHint && <Text style={st.liveHint}>{phaseHint}</Text>}
            <View style={st.timerBox}>
              <View style={st.timerRow}>
                <Text style={st.timerLabel}>Time remaining</Text>
                <Text style={st.timer}>{formatTime(countdown)}</Text>
              </View>
              <View style={st.track}><View style={[st.fill, { width: `${progress * 100}%` }]} /></View>
              <Text style={st.timerMeta}>Target {active && t ? t.targetMmHg : p.targetMmHg} mmHg{t?.automatedRun && active ? " · automated" : ""}</Text>
            </View>
            {!!p.reasonText && <Text style={st.liveHint}>{p.reasonText}</Text>}
            {!p.bpAlert && p.systolic !== null && <Text style={st.liveHint}>Estimated systolic {p.systolic} mmHg · within the safe range</Text>}
          </>
        )}
        {p.connected && (active ? (
          <Button title={p.stopping ? "Stopping…" : "Stop therapy"} icon="stop-circle" variant="stop" disabled={p.stopping} onPress={p.onStop} />
        ) : (
          <View style={st.actions}>
            <Button title="Start therapy" icon="play" variant="light" disabled={!p.canStart} onPress={() => p.onStart(false)} />
            {p.automationSupported && <Button title="Automated RIPC" icon="pulse" variant="primary" style={st.autoButton} disabled={!p.canStart} onPress={() => p.onStart(true)} />}
          </View>
        ))}
      </View>

      <SectionLabel>Your therapy plan</SectionLabel>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit therapy plan" disabled={active || p.stopping} onPress={p.onEditPlan} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
        <Card style={st.planCard}>
          <View style={st.planItem}>
            <Text style={st.planValue}>{p.targetMmHg}</Text>
            <Text style={st.planLabel}>mmHg target</Text>
          </View>
          <View style={st.planDivider} />
          <View style={st.planItem}>
            <Text style={st.planValue}>{formatTime(p.durationSeconds)}</Text>
            <Text style={st.planLabel}>duration</Text>
          </View>
          <View style={st.planEdit}>
            {active || p.stopping ? <Pill label="Locked" /> : <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />}
          </View>
        </Card>
      </Pressable>
      <Text style={st.footnote}>Automated RIPC measures your blood pressure first and sets the target for you. The plan above is used for manual Start therapy.</Text>

      <SectionLabel>Good to know</SectionLabel>
      <Card style={st.tips}>
        <Tip icon="body-outline" text="Rest seated for 5 minutes before a session, with your arm supported at heart level." />
        <Tip icon="shield-checkmark-outline" text="The device stops and vents on its own at 300 mmHg, on a sensor fault, or if Bluetooth drops." />
        <Tip icon="hand-left-outline" text="Press the green button on the device at any time to stop." />
      </Card>
    </View>
  );
}

function Tip({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={st.tip}>
      <Ionicons name={icon} size={20} color={colors.brand} />
      <Text style={st.tipText}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  stack: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 },
  greeting: { color: colors.inkMuted, fontSize: 16 },
  name: { color: colors.ink, fontSize: 30, fontWeight: "700", letterSpacing: -0.8 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.accentInk, fontSize: 17, fontWeight: "700" },
  deviceRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  deviceTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  deviceDetail: { color: colors.inkMuted, fontSize: 13, marginTop: 2 },
  smallButton: { minHeight: 40, paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.sm },
  live: { backgroundColor: colors.brandDark, borderRadius: radius.xl, padding: 20, gap: 12 },
  liveTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  liveEyebrow: { color: "#D8E7DC", fontSize: 11, fontWeight: "700", letterSpacing: 1.6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  offline: { alignItems: "center", gap: 8, paddingVertical: 18 },
  offlineTitle: { color: colors.onBrand, fontSize: 19, fontWeight: "700", textAlign: "center" },
  pressureLine: { flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 8 },
  pressure: { color: colors.accentInk, fontSize: 68, fontWeight: "600", letterSpacing: -2, fontVariant: ["tabular-nums"] },
  unit: { color: colors.onBrandMuted, fontSize: 18 },
  phase: { color: colors.onBrand, fontSize: 22, fontWeight: "700", textAlign: "center" },
  liveHint: { color: colors.onBrandMuted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  timerBox: { backgroundColor: "#22685B", borderRadius: radius.md, padding: 14, gap: 10 },
  timerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  timerLabel: { color: colors.onBrandMuted, fontSize: 13, fontWeight: "600" },
  timer: { color: colors.onBrand, fontSize: 30, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: { height: 8, borderRadius: 4, backgroundColor: "#15594F", overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: "#C9E39D" },
  timerMeta: { color: colors.onBrandMuted, fontSize: 12 },
  actions: { gap: 10 },
  autoButton: { backgroundColor: "#2E7D6F", borderWidth: 1, borderColor: "#5D978A" },
  planCard: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  planItem: { flex: 1, alignItems: "center", gap: 2 },
  planValue: { color: colors.ink, fontSize: 26, fontWeight: "700", fontVariant: ["tabular-nums"] },
  planLabel: { color: colors.inkMuted, fontSize: 12 },
  planDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: colors.borderStrong },
  planEdit: { width: 60, alignItems: "flex-end" },
  footnote: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, marginHorizontal: 4, marginTop: -4 },
  tips: { gap: 14 },
  tip: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  tipText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 21 },
});
