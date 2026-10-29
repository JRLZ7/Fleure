import { BleManager, Device, Subscription } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";
import { Buffer } from "buffer";
import { SERVICE, COMMAND, STATE, Driver, Telemetry, decodeTelemetry, encodeStart, encodeStop, TherapySettings } from "./protocol";
import { waitForBluetoothReady } from "./bluetoothReady";

export function createBleDriver(): Driver {
  const manager = new BleManager();
  let device: Device | undefined, monitor: Subscription | undefined, disconnected: Subscription | undefined;
  let beat: ReturnType<typeof setInterval> | undefined, pollInFlight = false, disposed = false;
  let publish: ((t: Telemetry) => void) | undefined, lost: (() => void) | undefined;
  let latest: Telemetry | null = null, lastReceived = 0, nextRequest = 0;
  let cancelScan: (() => void) | undefined;
  const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  function receive(value: string | null) {
    if (disposed) return;
    if (!value) throw new Error("Missing device telemetry.");
    const decoded = decodeTelemetry(Buffer.from(value, "base64"));
    // A readable but frozen GATT value is not fresh telemetry.
    if (!latest || decoded.frameCounter !== latest.frameCounter) lastReceived = Date.now();
    latest = decoded;
    // Continue the sequence after reconnect so an old acknowledgement cannot confirm a new command.
    if (nextRequest === 0) nextRequest = latest.requestId;
    publish?.(latest);
  }
  async function write(bytes: Uint8Array) {
    if (disposed || !device) throw new Error("Device disconnected.");
    await device.writeCharacteristicWithResponseForService(SERVICE, COMMAND, Buffer.from(bytes).toString("base64"));
  }
  async function read() {
    if (disposed || !device) throw new Error("Device disconnected.");
    const c = await device.readCharacteristicForService(SERVICE, STATE);
    receive(c.value);
  }
  async function close() {
    if (disposed) return;
    disposed = true;
    if (beat) clearInterval(beat);
    cancelScan?.();
    manager.stopDeviceScan(); monitor?.remove(); disconnected?.remove();
    await device?.cancelConnection().catch(() => {});
    manager.destroy();
  }
  function connectionLost() {
    if (disposed) return;
    // Invalidate the UI immediately. ESP32 also shuts down on disconnect/heartbeat timeout.
    void close(); lost?.();
  }
  async function request(bytes: Uint8Array, requestId: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      await write(bytes);
      while (!disposed) {
        await read();
        if (nextRequest !== requestId) return; // A newer STOP supersedes an in-flight START.
        if (latest?.requestId === requestId) {
          if (latest.result === 1) return;
          const errors: Record<number, string> = {
            2: "Device rejected the selected settings.",
            3: "A session is already active.",
            4: "Device refused to start: check the sensor, pressure and physical STOP button.",
          };
          throw new Error(errors[latest.result] || "Command was not accepted.");
        }
        await delay(80);
      }
      throw new Error("Device disconnected before acknowledgement.");
    };
    try {
      await Promise.race([
        run(),
        new Promise<void>((_, reject) => {
          timeout = setTimeout(() => {
            // Bound even a native read/write that never resolves. ESP32 then stops on link/heartbeat loss.
            connectionLost();
            reject(new Error("No device acknowledgement. Connection closed; check the device before reconnecting."));
          }, 3000);
        }),
      ]);
    } finally { if (timeout) clearTimeout(timeout); }
  }
  function requestId() { nextRequest = (nextRequest + 1) & 0xFFFF; if (nextRequest === 0) nextRequest = 1; return nextRequest; }
  return {
    async connect(onTelemetry, onDisconnect) {
      publish = onTelemetry; lost = onDisconnect;
      if (disposed) throw new Error("Create a new connection before reconnecting.");
      if (Platform.OS === "android") {
        const permissions = Number(Platform.Version) >= 31
          ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
          : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        const result = await PermissionsAndroid.requestMultiple(permissions);
        if (Object.values(result).some(v => v !== "granted")) throw new Error("Bluetooth permissions are required.");
      }
      try {
        await waitForBluetoothReady(listener => manager.onStateChange(listener, true));
        if (disposed) throw new Error("Connection cancelled.");
        device = await new Promise<Device>((resolve, reject) => {
          let settled = false;
          const finish = (found?: Device, error?: Error) => {
            if (settled) return; settled = true;
            clearTimeout(timer); manager.stopDeviceScan(); cancelScan = undefined;
            if (error) reject(error); else resolve(found!);
          };
          const timer = setTimeout(() => finish(undefined, new Error("No Fleure device found within 12 seconds.")), 12000);
          cancelScan = () => finish(undefined, new Error("Connection cancelled."));
          manager.startDeviceScan([SERVICE], null, (error, found) => {
            if (error) finish(undefined, error); else if (found) finish(found);
          });
        });
        if (disposed) throw new Error("Connection cancelled.");
        device = await device.connect({ timeout: 10000 });
        if (disposed) { await device.cancelConnection().catch(() => {}); throw new Error("Connection cancelled."); }
        await device.discoverAllServicesAndCharacteristics();
        disconnected = device.onDisconnected(connectionLost);
        monitor = device.monitorCharacteristicForService(SERVICE, STATE, (error, c) => {
          if (disposed) return;
          if (error) { connectionLost(); return; }
          try { receive(c?.value || null); } catch { connectionLost(); }
        });
        await read(); // Legacy firmware fails the protocol-version check here, before START is possible.
        if (disposed) throw new Error("Connection interrupted.");
        beat = setInterval(() => {
          if (disposed) return;
          if (Date.now() - lastReceived > 3000) { connectionLost(); return; }
          if (pollInFlight) return;
          pollInFlight = true;
          void (async () => {
            try { await write(new Uint8Array([2])); await read(); }
            catch { connectionLost(); }
            finally { pollInFlight = false; }
          })();
        }, 1000);
        return device.id;
      } catch (e) { await close(); throw e; }
    },
    async start(settings: TherapySettings, automated = false) {
      const id = requestId(); await request(encodeStart(settings, id, automated), id);
    },
    async stop() {
      const id = requestId(); await request(encodeStop(id), id);
    },
    disconnect: close,
  };
}
