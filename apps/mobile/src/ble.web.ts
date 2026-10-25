import { Driver } from "./protocol";
export function createBleDriver(): Driver {
  throw new Error("Bluetooth requires the Android/iOS development build. Open Fleure on your phone using that build.");
}
