import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DURATIONS, PRESSURES, formatTime } from "../protocol";
import { BackHeader, Banner, Button, Card, SectionLabel } from "../ui";
import { colors, radius } from "../theme";

export function TherapyPlanScreen({ targetMmHg, durationSeconds, locked, onTarget, onDuration, onBack }: {
  targetMmHg: number;
  durationSeconds: number;
  locked: boolean;
  onTarget: (v: number) => void;
  onDuration: (v: number) => void;
  onBack: () => void;
}) {
  return (
    <View style={st.stack}>
      <BackHeader title="Therapy plan" onBack={onBack} />
      <Text style={st.intro}>Choose the cuff pressure and how long to hold it. Follow the plan your clinician gave you.</Text>
      {locked && <Banner tone="info" icon="lock-closed" text="The plan is locked while a session is running." />}

      <SectionLabel>Target pressure</SectionLabel>
      <Card>
        <View style={st.valueRow}>
          <Text style={st.value}>{targetMmHg}</Text>
          <Text style={st.valueUnit}>mmHg</Text>
        </View>
        <View style={st.grid}>
          {PRESSURES.map(v => (
            <Option key={v} label={String(v)} a11y={`${v} millimeters of mercury`} selected={v === targetMmHg} disabled={locked} onPress={() => onTarget(v)} />
          ))}
        </View>
        <Text style={st.caption}>The countdown starts once pressure first reaches ±5 mmHg of the target, and keeps going if pressure drifts afterwards.</Text>
      </Card>

      <SectionLabel>Duration</SectionLabel>
      <Card>
        <View style={st.valueRow}>
          <Text style={st.value}>{formatTime(durationSeconds)}</Text>
          <Text style={st.valueUnit}>min : sec</Text>
        </View>
        <View style={st.grid}>
          {DURATIONS.map(v => (
            <Option key={v} label={formatTime(v)} a11y={`Duration ${formatTime(v)}`} selected={v === durationSeconds} disabled={locked} onPress={() => onDuration(v)} />
          ))}
        </View>
        <Text style={st.caption}>Automated RIPC uses this duration too.</Text>
      </Card>

      <Banner tone="neutral" icon="shield-checkmark-outline" text="Safety limits stay on whatever you pick: the device vents at 300 mmHg or on a sensor fault." />
      <Button title="Done" onPress={onBack} />
    </View>
  );
}

function Option({ label, a11y, selected, disabled, onPress }: { label: string; a11y: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [st.option, selected && st.optionOn, disabled && st.optionDisabled, pressed && { opacity: 0.75 }]}
    >
      <Text style={[st.optionText, selected && st.optionTextOn]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  stack: { gap: 14 },
  intro: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  valueRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  value: { color: colors.ink, fontSize: 40, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  valueUnit: { color: colors.inkMuted, fontSize: 15 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minWidth: 66, minHeight: 46, paddingHorizontal: 14, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong },
  optionOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  optionDisabled: { opacity: 0.55 },
  optionText: { fontSize: 15, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] },
  optionTextOn: { color: colors.onBrand },
  caption: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
});
