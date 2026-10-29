export const SERVICE = "b498a000-8a8a-4b27-a8c5-9d0a214c1000";
export const COMMAND = "b498a001-8a8a-4b27-a8c5-9d0a214c1000";
export const STATE = "b498a002-8a8a-4b27-a8c5-9d0a214c1000";
export const PRESSURES = [125, 150, 175, 200, 225, 250, 275] as const;
export const DURATIONS = [120, 150, 180, 210, 240, 270, 300, 330, 360] as const;
export type DeviceState = "on" | "off" | "unknown";
export const PHASES = ["idle", "pressurizing", "running", "completed", "stopped", "fault", "estimating_systolic"] as const;
export const REASONS = ["none", "sensor_fault", "overpressure", "pressure_build_timeout", "heartbeat_timeout", "disconnected", "physical_stop", "app_stop", "completed"] as const;
export type TherapyPhase = typeof PHASES[number];
export type TherapySettings = { targetMmHg: number; durationSeconds: number };
export type Telemetry = TherapySettings & {
  phase: TherapyPhase;
  reason: typeof REASONS[number];
  pressureMmHg: number | null;
  timerStarted: boolean;
  pumpOn: boolean;
  ventClosed: boolean;
  remainingSeconds: number;
  runId: number;
  requestId: number;
  result: number;
  frameCounter: number;
};
export function isActive(t: Telemetry | null): boolean {
  return t?.phase === "pressurizing" || t?.phase === "running" || t?.phase === "estimating_systolic";
}
export function validateSettings(s: TherapySettings): void {
  if (!(PRESSURES as readonly number[]).includes(s.targetMmHg) || !(DURATIONS as readonly number[]).includes(s.durationSeconds))
    throw new Error("Choose 125–275 mmHg in steps of 25 and 2–6 minutes in steps of 30 seconds.");
}
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function decodeTelemetry(bytes: Uint8Array): Telemetry {
  if (bytes.length !== 20 || bytes[0] !== 2)
    throw new Error("Firmware mismatch. Flash the Fleure v2 sketch before connecting.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const phase = PHASES[bytes[1]], reason = REASONS[bytes[2]], flags = bytes[3];
  if (!phase || !reason || (flags & 0xF0) !== 0 || bytes[18] > 4)
    throw new Error("Invalid device telemetry.");
  const settings = { targetMmHg: v.getUint16(6, true), durationSeconds: v.getUint16(10, true) };
  // Manual START options are discrete; telemetry may contain any computed
  // integer target in the firmware-supported range (e.g. 215 mmHg).
  // Keep the existing discrete duration validation for both modes.
  if (!Number.isInteger(settings.targetMmHg) || settings.targetMmHg < 125 || settings.targetMmHg > 275 ||
      !(DURATIONS as readonly number[]).includes(settings.durationSeconds))
    throw new Error("Invalid device telemetry settings.");
  const pressure = v.getUint16(4, true), remaining = v.getUint16(8, true);
  if (remaining > settings.durationSeconds || Boolean(flags & 1) === (pressure === 0xFFFF) || (phase === "completed" && remaining !== 0))
    throw new Error("Invalid device telemetry values.");
  return {
    ...settings, phase, reason,
    pressureMmHg: flags & 1 ? pressure / 10 : null,
    timerStarted: Boolean(flags & 2), pumpOn: Boolean(flags & 4), ventClosed: Boolean(flags & 8),
    remainingSeconds: remaining, runId: v.getUint32(12, true), requestId: v.getUint16(16, true), result: bytes[18], frameCounter: bytes[19],
  };
}
export function encodeStart(s: TherapySettings, requestId: number, automated = false): Uint8Array {
  validateSettings(s);
  const b = new Uint8Array(automated ? 8 : 7), v = new DataView(b.buffer);
  b[0] = 1; v.setUint16(1, s.targetMmHg, true); v.setUint16(3, s.durationSeconds, true); v.setUint16(5, requestId, true);
  if (automated) b[7] = 1;
  return b;
}
export function encodeStop(requestId: number): Uint8Array {
  return new Uint8Array([0, requestId & 255, requestId >> 8]);
}
export interface Driver {
  connect(onTelemetry: (t: Telemetry) => void, onDisconnect: () => void): Promise<string>;
  start(settings: TherapySettings, automated?: boolean): Promise<void>;
  stop(): Promise<void>;
  disconnect(): Promise<void>;
}
