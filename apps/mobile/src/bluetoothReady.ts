type Subscription = { remove(): void };
type Subscribe = (listener: (state: string) => void) => Subscription;

// iOS initially reports Unknown while CoreBluetooth starts up. Only a stable
// state can tell us whether Bluetooth is actually off or permission is denied.
export function waitForBluetoothReady(
  subscribe: Subscribe,
  timeoutMs = 10000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let subscription: Subscription | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(
      () => finish(new Error("Bluetooth is still initializing. Try Connect again.")),
      timeoutMs,
    );
    try {
      subscription = subscribe((state) => {
        switch (state) {
          case "PoweredOn":
            finish();
            break;
          case "PoweredOff":
            finish(new Error("Bluetooth is off. Turn it on in Settings → Bluetooth, then connect again."));
            break;
          case "Unauthorized":
            finish(new Error("Bluetooth permission is denied. Allow Bluetooth for Fleure in iPhone Settings."));
            break;
          case "Unsupported":
            finish(new Error("This device does not support Bluetooth Low Energy."));
            break;
          // Unknown and Resetting are temporary; wait for the next update.
        }
      });
      // A mock or platform implementation may emit synchronously on subscribe.
      if (settled) subscription.remove();
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
