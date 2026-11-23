export const colors = {
  background: "#F5F5EF",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F3EB",
  border: "#E2E8DE",
  borderStrong: "#D6E0D3",
  ink: "#193F36",
  inkMuted: "#5B7167",
  inkSoft: "#7C8F86",
  brand: "#17685D",
  brandDark: "#15594F",
  brandDeep: "#0F463E",
  brandTint: "#E5ECE3",
  onBrand: "#FFFFFF",
  onBrandMuted: "#D3E3DA",
  accent: "#EEF1CC",
  accentInk: "#F2F4D1",
  success: "#2D7A4B",
  successTint: "#E3F1E7",
  warning: "#8A5A12",
  warningTint: "#FBF0DA",
  danger: "#8A3227",
  dangerStrong: "#B23A2C",
  dangerTint: "#FAEAE4",
  dangerBorder: "#EBC8BC",
};

export const radius = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.inkMuted, bg: colors.surfaceMuted },
  info: { fg: colors.brand, bg: colors.brandTint },
  success: { fg: colors.success, bg: colors.successTint },
  warning: { fg: colors.warning, bg: colors.warningTint },
  danger: { fg: colors.danger, bg: colors.dangerTint },
};
