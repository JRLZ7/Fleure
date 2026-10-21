import { BleManager, Device, Subscription } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";
import { Buffer } from "buffer";
import { SERVICE, COMMAND, STATE, Driver, DeviceState } from "./protocol";
import { waitForBluetoothReady } from "./bluetoothReady";
export function createBleDriver(): Driver {
  const manager = new BleManager();
  let device: Device | undefined,
    monitor: Subscription | undefined,
    disconnected: Subscription | undefined,
    beat: ReturnType<typeof setInterval> | undefined,
    publish: ((s: DeviceState) => void) | undefined;
  return {
    async connect(onState, onDisconnect) {
      publish = onState;
      if (Platform.OS === "android") {
        const permissions =
          Number(Platform.Version) >= 31
            ? [
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              ]
            : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
        const result = await PermissionsAndroid.requestMultiple(permissions);
        if (Object.values(result).some((v) => v !== "granted"))
          throw new Error("Bluetooth permissions are required.");
      }
      await waitForBluetoothReady((listener) =>
        manager.onStateChange(listener, true),
      );
      device = await new Promise<Device>((resolve, reject) => {
        const timer = setTimeout(() => {
          manager.stopDeviceScan();
          reject(new Error("No Fleure device found within 12 seconds."));
        }, 12000);
        manager.startDeviceScan([SERVICE], null, (error, found) => {
          if (error) {
            clearTimeout(timer);
            manager.stopDeviceScan();
            reject(error);
          } else if (found) {
            clearTimeout(timer);
            manager.stopDeviceScan();
            resolve(found);
          }
        });
      });
      try {
        device = await device.connect({ timeout: 10000 });
        await device.discoverAllServicesAndCharacteristics();
        const decode = (value: string | null) => {
          if (!value) return;
          const b = Buffer.from(value, "base64");
          if (b.length !== 1 || b[0] > 1)
            throw new Error("Invalid device state");
          onState((b[0] === 1 ? "on" : "off") as DeviceState);
        };
        disconnected = device.onDisconnected(() => {
          if (beat) clearInterval(beat);
          onState("unknown");
          onDisconnect();
        });
        monitor = device.monitorCharacteristicForService(
          SERVICE,
          STATE,
          (error, c) => {
            if (error) {
              onState("unknown");
              void device?.cancelConnection();
              return;
            }
            try {
              decode(c?.value || null);
            } catch {
              onState("unknown");
              void device?.cancelConnection();
            }
          },
        );
        const initial = await device.readCharacteristicForService(
          SERVICE,
          STATE,
        );
        decode(initial.value);
        beat = setInterval(() => {
          void device
            ?.writeCharacteristicWithResponseForService(
              SERVICE,
              COMMAND,
              "Ag==",
            )
            .catch(() => {
              onState("unknown");
              void device?.cancelConnection();
            });
        }, 1000);
        return device.id;
      } catch (e) {
        monitor?.remove();
        disconnected?.remove();
        await device?.cancelConnection().catch(() => {});
        throw e;
      }
    },
    async command(on) {
      if (!device) throw new Error("Device disconnected");
      await device.writeCharacteristicWithResponseForService(
        SERVICE,
        COMMAND,
        Buffer.from([on ? 1 : 0]).toString("base64"),
      );
      const c = await device.readCharacteristicForService(SERVICE, STATE);
      if (!c.value) throw new Error("No device confirmation");
      const b = Buffer.from(c.value, "base64");
      if (b.length !== 1 || b[0] > 1)
        throw new Error("Invalid state confirmation");
      publish?.(b[0] === 1 ? "on" : "off");
    },
    async disconnect() {
      if (beat) clearInterval(beat);
      manager.stopDeviceScan();
      monitor?.remove();
      disconnected?.remove();
      await device?.cancelConnection().catch(() => {});
      manager.destroy();
    },
  };
}
