export const SERVICE = "b498a000-8a8a-4b27-a8c5-9d0a214c1000";
export const COMMAND = "b498a001-8a8a-4b27-a8c5-9d0a214c1000";
export const STATE = "b498a002-8a8a-4b27-a8c5-9d0a214c1000";
export type DeviceState = "on" | "off" | "unknown";
export interface Driver {
  connect(
    onState: (s: DeviceState) => void,
    onDisconnect: () => void,
  ): Promise<string>;
  command(on: boolean): Promise<void>;
  disconnect(): Promise<void>;
}
