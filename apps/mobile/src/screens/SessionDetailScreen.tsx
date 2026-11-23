import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { BackHeader, Banner, Card, EmptyState, IconBadge, SectionLabel } from "../ui";
import { colors } from "../theme";
import { EventLike, describeEvent, formatDuration } from "../eventText";
import type { SessionSummary } from "./HistoryScreen";

export function SessionDetailScreen({ session, load, onBack }: {
  session: SessionSummary;
  load: (id: string) => Promise<EventLike[]>;
  onBack: () => void;
}) {
  const [events, setEvents] = useState<EventLike[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    load(session.id)
      .then(e => { if (live) setEvents(e); })
      .catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [session.id]);

  const started = new Date(session.started);
  const timeline = (events ?? []).filter(e => !e.reason.startsWith("idle:"));
  const completed = timeline.filter(e => e.reason.startsWith("completed:")).length;
  const warnings = timeline.filter(e => e.reason.startsWith("bp_") || e.reason.startsWith("fault:")).length;

  return (
    <View style={st.stack}>
      <BackHeader title="Session" onBack={onBack} />
      <View>
        <Text accessibilityRole="header" style={st.title}>{started.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</Text>
        <Text style={st.subtitle}>{started.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {formatDuration(session.started, session.ended)}</Text>
      </View>

      <View style={st.stats}>
        <Stat value={events ? String(completed) : "–"} label="Completed" />
        <Stat value={events ? String(warnings) : "–"} label="Safety stops" />
        <Stat value={session.ended ? "Closed" : "Open"} label="Status" />
      </View>

      <SectionLabel>Timeline</SectionLabel>
      {error ? <Banner tone="danger" icon="cloud-offline-outline" text={error} />
        : !events ? <View style={st.loading}><ActivityIndicator color={colors.brand} /><Text style={st.muted}>Loading events…</Text></View>
        : timeline.length === 0 ? <EmptyState icon="list-outline" title="No events" text="Nothing was recorded during this connection." />
        : (
          <Card style={st.timeline}>
            {timeline.map((e, i) => {
              const d = describeEvent(e);
              return (
                <View key={i} style={st.item}>
                  <View style={st.rail}>
                    <IconBadge icon={d.icon as never} tone={d.tone} size={34} />
                    {i < timeline.length - 1 && <View style={st.line} />}
                  </View>
                  <View style={st.itemBody}>
                    <Text style={st.itemTitle}>{d.title}</Text>
                    {!!d.detail && <Text style={st.itemDetail}>{d.detail}</Text>}
                    <Text style={st.itemTime}>{new Date(e.recorded).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      <Text style={st.muted}>Device: {session.device}</Text>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={st.stat}>
      <Text style={st.statValue}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  stack: { gap: 14 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "700", letterSpacing: -0.6 },
  subtitle: { color: colors.inkMuted, fontSize: 15, marginTop: 4 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingVertical: 14, alignItems: "center", gap: 2 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: "700" },
  statLabel: { color: colors.inkMuted, fontSize: 12 },
  loading: { flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  muted: { color: colors.inkMuted, fontSize: 12, textAlign: "center" },
  timeline: { gap: 0, paddingVertical: 14 },
  item: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 34 },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 4 },
  itemBody: { flex: 1, paddingBottom: 18, paddingTop: 6 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  itemDetail: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  itemTime: { color: colors.inkSoft, fontSize: 12, marginTop: 4 },
});
