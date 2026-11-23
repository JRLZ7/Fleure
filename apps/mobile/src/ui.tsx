import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle, StyleProp } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, radius, Tone, toneColors } from "./theme";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

type ButtonVariant = "primary" | "secondary" | "light" | "stop" | "ghost" | "danger";

export function Button({ title, onPress, disabled = false, loading = false, variant = "primary", icon, style }: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.button, v.box, (disabled || loading) && s.disabled, pressed && s.pressed, style]}
    >
      {loading ? <ActivityIndicator color={v.text} /> : icon ? <Ionicons name={icon} size={19} color={v.text} /> : null}
      <Text style={[s.buttonText, { color: v.text }]}>{title}</Text>
    </Pressable>
  );
}

const buttonVariants: Record<ButtonVariant, { box: ViewStyle; text: string }> = {
  primary: { box: { backgroundColor: colors.brand }, text: colors.onBrand },
  secondary: { box: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong }, text: colors.ink },
  light: { box: { backgroundColor: colors.accent }, text: colors.ink },
  stop: { box: { backgroundColor: "#F6E4DC" }, text: "#7C3025" },
  ghost: { box: { backgroundColor: "transparent" }, text: colors.brand },
  danger: { box: { backgroundColor: colors.dangerTint, borderWidth: 1, borderColor: colors.dangerBorder }, text: colors.danger },
};

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={s.titleRow}>
      <View style={s.grow}>
        <Text accessibilityRole="header" style={s.title}>{title}</Text>
        {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={s.backRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={s.backButton}>
        <Ionicons name="chevron-back" size={22} color={colors.brand} />
        <Text style={s.backText}>Back</Text>
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={s.backTitle}>{title}</Text>
      <View style={s.backRight}>{right}</View>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children.toUpperCase()}</Text>;
}

export function IconBadge({ icon, tone = "info", size = 40 }: { icon: IconName; tone?: Tone; size?: number }) {
  const t = toneColors[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2.6, backgroundColor: t.bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={size * 0.5} color={t.fg} />
    </View>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const t = toneColors[tone];
  return <View style={[s.pill, { backgroundColor: t.bg }]}><Text style={[s.pillText, { color: t.fg }]}>{label}</Text></View>;
}

export function ListRow({ icon, tone, title, detail, right, onPress, chevron = !!onPress, last = false }: {
  icon?: IconName;
  tone?: Tone;
  title: string;
  detail?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const content = (
    <View style={[s.row, !last && s.rowDivider]}>
      {icon && <IconBadge icon={icon} tone={tone} size={36} />}
      <View style={s.grow}>
        <Text style={s.rowTitle}>{title}</Text>
        {!!detail && <Text style={s.rowDetail}>{detail}</Text>}
      </View>
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={colors.inkSoft} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => pressed && s.pressed}>
      {content}
    </Pressable>
  );
}

export function Banner({ tone, icon, title, text }: { tone: Tone; icon: IconName; title?: string; text: string }) {
  const t = toneColors[tone];
  return (
    <View style={[s.banner, { backgroundColor: t.bg, borderColor: tone === "danger" ? colors.dangerBorder : "transparent" }]}>
      <Ionicons name={icon} size={22} color={t.fg} style={{ marginTop: 1 }} />
      <View style={s.grow}>
        {!!title && <Text style={[s.bannerTitle, { color: t.fg }]}>{title}</Text>}
        <Text accessibilityRole={tone === "danger" ? "alert" : undefined} style={[s.bannerText, { color: tone === "neutral" ? colors.ink : t.fg }]}>{text}</Text>
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: React.ReactNode }) {
  return (
    <View style={s.empty}>
      <IconBadge icon={icon} tone="info" size={64} />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyText}>{text}</Text>
      {action}
    </View>
  );
}

export type TabKey = "home" | "history" | "profile";

const TABS: { key: TabKey; label: string; icon: IconName; iconActive: IconName }[] = [
  { key: "home", label: "Home", icon: "home-outline", iconActive: "home" },
  { key: "history", label: "History", icon: "time-outline", iconActive: "time" },
  { key: "profile", label: "Profile", icon: "person-circle-outline", iconActive: "person-circle" },
];

export function TabBar({ active, onChange, badges = {} }: { active: TabKey; onChange: (t: TabKey) => void; badges?: Partial<Record<TabKey, number>> }) {
  return (
    <View accessibilityRole="tablist" style={s.tabBar}>
      {TABS.map(t => {
        const on = t.key === active;
        const badge = badges[t.key] ?? 0;
        return (
          <Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => onChange(t.key)} style={s.tab}>
            <View>
              <Ionicons name={on ? t.iconActive : t.icon} size={25} color={on ? colors.brand : colors.inkSoft} />
              {badge > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeText}>{badge > 99 ? "99+" : badge}</Text></View>}
            </View>
            <Text style={[s.tabLabel, on && s.tabLabelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  button: { minHeight: 52, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  buttonText: { fontSize: 16, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.ink, letterSpacing: -0.8 },
  subtitle: { color: colors.inkMuted, fontSize: 15, lineHeight: 22, marginTop: 2 },
  backRow: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 8 },
  backButton: { flexDirection: "row", alignItems: "center", minWidth: 72 },
  backText: { color: colors.brand, fontSize: 16, fontWeight: "600" },
  backTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.ink },
  backRight: { minWidth: 72, alignItems: "flex-end" },
  sectionLabel: { color: colors.inkMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginTop: 6, marginLeft: 4 },
  pill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 56 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  rowTitle: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  rowDetail: { color: colors.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  banner: { flexDirection: "row", gap: 12, padding: 15, borderRadius: radius.md, borderWidth: 1 },
  bannerTitle: { fontSize: 15, fontWeight: "700", marginBottom: 3 },
  bannerText: { fontSize: 14, lineHeight: 21 },
  empty: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 20, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.ink, marginTop: 6 },
  emptyText: { fontSize: 14, lineHeight: 21, color: colors.inkMuted, textAlign: "center" },
  tabBar: { flexDirection: "row", backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderStrong, paddingTop: 8, paddingBottom: 4 },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 2, minHeight: 48 },
  tabLabel: { fontSize: 11, fontWeight: "600", color: colors.inkSoft },
  tabLabelOn: { color: colors.brand },
  tabBadge: { position: "absolute", top: -4, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.dangerStrong, alignItems: "center", justifyContent: "center" },
  tabBadgeText: { color: "#FFF", fontSize: 10, fontWeight: "700" },
});
