import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Banner, Button, Card, EmptyState, ListRow, Pill, ScreenTitle, SectionLabel } from "../ui";
import { colors } from "../theme";
import { dayLabel, formatDuration } from "../eventText";

export type SessionSummary = { id: string; device: string; started: string; ended?: string | null };

export function HistoryScreen({ sessions, loaded, pending, syncing, syncError, lastSynced, onSync, onOpen }: {
  sessions: SessionSummary[];
  loaded: boolean;
  pending: number;
  syncing: boolean;
  syncError: string;
  lastSynced: Date | null;
  onSync: () => void;
  onOpen: (s: SessionSummary) => void;
}) {
  const groups: { day: string; items: SessionSummary[] }[] = [];
  for (const s of sessions) {
    const day = dayLabel(s.started);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(s); else groups.push({ day, items: [s] });
  }

  return (
    <View style={st.stack}>
      <ScreenTitle title="History" subtitle="Your device sessions, uploaded for your care team." />

      <Card style={st.syncCard}>
        <View style={st.syncRow}>
          <View style={st.grow}>
            <Text style={st.syncTitle}>{pending > 0 ? `${pending} event${pending === 1 ? "" : "s"} waiting to upload` : "Everything is uploaded"}</Text>
            <Text style={st.syncDetail}>{syncing ? "Syncing…" : lastSynced ? `Last synced ${lastSynced.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "Not synced yet this visit"}</Text>
          </View>
          <Pill label={pending > 0 ? "Pending" : "Up to date"} tone={pending > 0 ? "warning" : "success"} />
        </View>
        <Button title={syncing ? "Syncing" : "Sync now"} icon="cloud-upload-outline" variant="secondary" loading={syncing} onPress={onSync} />
      </Card>
      {!!syncError && <Banner tone="danger" icon="cloud-offline-outline" text={syncError} />}

      {!loaded && !syncing ? null : sessions.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No sessions yet" text="Connect your device from Home. Each connection shows up here once it's uploaded." />
      ) : groups.map(g => (
        <View key={g.day} style={st.group}>
          <SectionLabel>{g.day}</SectionLabel>
          <Card style={st.listCard}>
            {g.items.map((s, i) => (
              <ListRow
                key={s.id}
                icon={s.ended ? "checkmark-done" : "ellipsis-horizontal"}
                tone={s.ended ? "info" : "warning"}
                title={new Date(s.started).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                detail={`${formatDuration(s.started, s.ended)} · ${s.device === "connecting" ? "No device" : s.device}`}
                right={!s.ended ? <Pill label="Open" tone="warning" /> : undefined}
                onPress={() => onOpen(s)}
                last={i === g.items.length - 1}
              />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  stack: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  syncCard: { gap: 14 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  syncTitle: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  syncDetail: { color: colors.inkMuted, fontSize: 13, marginTop: 3 },
  group: { gap: 8 },
  listCard: { paddingVertical: 4, gap: 0 },
});
