import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Card, ListRow, Pill, ScreenTitle, SectionLabel } from "../ui";
import { colors } from "../theme";
import { SYSTOLIC_HIGH_MMHG, SYSTOLIC_LOW_MMHG } from "../protocol";

export function ProfileScreen({ name, email, connected, deviceName, automationSupported, logs, signingOut, onSignOut }: {
  name: string;
  email: string;
  connected: boolean;
  deviceName: string;
  automationSupported: boolean;
  logs: string[];
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const [showLog, setShowLog] = useState(false);
  const initials = name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";

  return (
    <View style={st.stack}>
      <ScreenTitle title="Profile" />

      <Card style={st.person}>
        <View style={st.avatar}><Text style={st.avatarText}>{initials}</Text></View>
        <View style={st.grow}>
          <Text style={st.name}>{name}</Text>
          <Text style={st.email} numberOfLines={1}>{email}</Text>
        </View>
        <Pill label="Patient" tone="info" />
      </Card>

      <SectionLabel>Device</SectionLabel>
      <Card style={st.list}>
        <ListRow icon="bluetooth" tone={connected ? "success" : "neutral"} title={connected ? "Connected" : "Not connected"} detail={connected ? deviceName : "Connect from the Home tab"} />
        <ListRow icon="pulse" tone="info" title="Automated RIPC" detail={!connected ? "Shown once your device is connected" : automationSupported ? "Supported by your device firmware" : "Not available on this firmware"} last />
      </Card>

      <SectionLabel>Safety limits</SectionLabel>
      <Card style={st.list}>
        <ListRow icon="heart-outline" tone="danger" title="Blood pressure check" detail={`Automated therapy stops if estimated systolic is ${SYSTOLIC_HIGH_MMHG} mmHg or higher, or below ${SYSTOLIC_LOW_MMHG}.`} />
        <ListRow icon="speedometer-outline" tone="warning" title="Pressure cutoff" detail="The device vents at 300 mmHg or on a sensor fault." />
        <ListRow icon="bluetooth" tone="info" title="Connection loss" detail="If Bluetooth drops, the device stops and vents on its own." last />
      </Card>

      <SectionLabel>Activity this visit</SectionLabel>
      <Card style={st.list}>
        <ListRow icon="list-outline" tone="neutral" title="Activity log" detail={`${logs.length} entr${logs.length === 1 ? "y" : "ies"}`} onPress={() => setShowLog(v => !v)} chevron={false} right={<Text style={st.toggle}>{showLog ? "Hide" : "Show"}</Text>} last={!showLog} />
        {showLog && (
          <View style={st.log}>
            {logs.length === 0 ? <Text style={st.logLine}>Device and connection events will appear here.</Text>
              : logs.map((l, i) => <Text key={i} style={st.logLine}>{l}</Text>)}
          </View>
        )}
      </Card>

      <SectionLabel>About</SectionLabel>
      <Card style={st.list}>
        <ListRow icon="information-circle-outline" tone="neutral" title="Fleure" detail="Version 0.1.0 · bench prototype" />
        <ListRow icon="alert-circle-outline" tone="warning" title="Not a medical device" detail="Pressure settings and the blood pressure estimate are not validated for clinical use." last />
      </Card>

      <Button title={signingOut ? "Signing out" : "Sign out"} icon="log-out-outline" variant="danger" loading={signingOut} onPress={onSignOut} />
    </View>
  );
}

const st = StyleSheet.create({
  stack: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  person: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.accentInk, fontSize: 20, fontWeight: "700" },
  name: { color: colors.ink, fontSize: 19, fontWeight: "700" },
  email: { color: colors.inkMuted, fontSize: 14, marginTop: 2 },
  list: { paddingVertical: 4, gap: 0 },
  toggle: { color: colors.brand, fontWeight: "600", fontSize: 14 },
  log: { paddingVertical: 10, gap: 6 },
  logLine: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
});
