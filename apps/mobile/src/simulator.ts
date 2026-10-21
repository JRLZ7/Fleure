import { Driver, DeviceState } from "./protocol";
export function createSimulator(): Driver {
  let listener: ((s: DeviceState) => void) | undefined;
  return {
    async connect(onState) {
      listener = onState;
      onState("off");
      return "SIMULATOR-LED";
    },
    async command(on) {
      if (!listener) throw new Error("Connect first");
      listener(on ? "on" : "off");
    },
    async disconnect() {
      listener?.("unknown");
      listener = undefined;
    },
  };
}
