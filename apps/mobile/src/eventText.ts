// Turns stored session event reasons into short, patient-friendly text.
import type { Tone } from "./theme";

export type EventLike = { state: string; source: string; reason: string; recorded: string };

export type EventDescription = {
  title: string;
  detail: string;
  tone: Tone;
  icon: string; // Ionicons name
};

const STOP_REASONS: Record<string, string> = {
  none: "",
  sensor_fault: "Pressure sensor unavailable",
  overpressure: "300 mmHg safety cutoff reached",
  pressure_build_timeout: "Target pressure not reached within 60 seconds",
  heartbeat_timeout: "Lost contact with the app",
  disconnected: "Bluetooth disconnected",
  physical_stop: "Stopped with the button on the device",
  app_stop: "Stopped from the app",
  completed: "Completed",
  systolic_estimation_failed: "Could not measure blood pressure",
};

function fields(parts: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) out[k] = v;
  }
  return out;
}

function duration(seconds: string | undefined): string {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return "";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function describeEvent(e: EventLike): EventDescription {
  const [head, ...rest] = e.reason.split(";");
  const f = fields(rest);

  if (head === "bp_high" || head === "bp_low") {
    const high = head === "bp_high";
    return {
      title: high ? "Blood pressure too high" : "Blood pressure too low",
      detail: `Estimated systolic ${f.systolic ?? "?"} mmHg · therapy stopped`,
      tone: "danger",
      icon: "alert-circle",
    };
  }

  if (head.includes(":")) {
    const [phase, reason] = head.split(":");
    const plan = [f.target && `Target ${f.target} mmHg`, duration(f.duration)].filter(Boolean).join(" · ");
    switch (phase) {
      case "estimating_systolic":
        return { title: "Measuring blood pressure", detail: "Automated therapy started", tone: "info", icon: "pulse" };
      case "pressurizing":
        return { title: "Therapy started", detail: plan || "Building pressure", tone: "info", icon: "play-circle" };
      case "running":
        return { title: "Target pressure reached", detail: "Countdown started", tone: "info", icon: "timer-outline" };
      case "completed":
        return { title: "Therapy completed", detail: plan, tone: "success", icon: "checkmark-circle" };
      case "stopped":
        return { title: "Therapy stopped", detail: STOP_REASONS[reason] ?? reason, tone: "neutral", icon: "stop-circle" };
      case "fault":
        return { title: "Device stopped for safety", detail: STOP_REASONS[reason] ?? reason, tone: "danger", icon: "warning" };
      case "idle":
        return { title: "Device ready", detail: "", tone: "neutral", icon: "radio-button-on" };
    }
  }

  switch (head) {
    case "link_lost":
      return { title: "Bluetooth connection lost", detail: "The device stops and vents on its own", tone: "warning", icon: "bluetooth" };
    case "disconnected":
      return { title: "Device disconnected", detail: "", tone: "neutral", icon: "bluetooth" };
    case "connection_failed":
      return { title: "Could not connect", detail: "", tone: "warning", icon: "bluetooth" };
    case "app_background":
      return { title: "App left the foreground", detail: "Connection closed", tone: "warning", icon: "phone-portrait-outline" };
    case "app_restart":
      return { title: "App restarted", detail: "Session closed", tone: "neutral", icon: "refresh" };
  }
  return { title: head || "Event", detail: "", tone: "neutral", icon: "ellipse-outline" };
}

export function formatDuration(startIso: string, endIso?: string | null): string {
  if (!endIso) return "In progress";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "Under a minute";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
