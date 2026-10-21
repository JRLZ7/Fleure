import { Driver } from "./protocol";
export function createBleDriver(): Driver {
  throw new Error(
    "Real BLE requires the Android/iOS development build. Use the simulator in the browser.",
  );
}
