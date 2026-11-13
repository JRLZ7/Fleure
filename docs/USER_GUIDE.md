# Fleure basic user guide

Fleure is a bench prototype that connects a phone app to an ESP32 pressure
device. This guide is for users who want the basic steps without the
development details.

## Before you start

You need:

- A powered Fleure ESP32 device with the matching pressure-control firmware.
- A physical Android or iPhone development build of the Fleure app.
- Internet access so the app can reach the Fleure API.
- The patient email and password provided for your setup.

The browser version can display the interface, but it cannot connect to the
Bluetooth device or run therapy. Expo Go is also not sufficient because the
app needs the native Bluetooth module.

## Sign in and connect

1. Open Fleure on the phone.
2. Enter the patient email and password.
3. Tap **Sign in**. The app connects automatically to
   `https://fleure-378c.onrender.com`.
4. Turn on Bluetooth and keep the phone near the ESP32.
5. Tap **Connect device** and wait for the device status to show **Connected**.

The app connects to the first compatible Fleure device it finds. Keep the app
in the foreground while connected. Backgrounding the app ends the Bluetooth
connection and does not resume a therapy run automatically.

## Manual therapy

1. Choose the target pressure and duration.
2. Confirm that a live pressure value is visible.
3. Tap **Start** in the app.
4. The device builds pressure. The countdown begins when pressure first reaches
   within 5 mmHg of the selected target.
5. To stop early, tap **STOP** in the app or press the physical button.
6. At normal completion, the app shows **Therapy complete** and `0:00`. The
   device should have stopped the pump and opened the vent.

Changing a setting only changes the next app-started run. Settings are locked
while a run is active.

## Automated RIPC therapy

If the connected firmware supports experimental automation, the app shows
**Automated RIPC therapy**.

1. Choose the duration. The manual pressure choice is not used to determine
   the automated target.
2. Confirm that a live pressure value is visible.
3. Tap **Automated RIPC therapy** or click the physical button.
4. The device records the pressure waveform while inflating toward its
   estimation point, then estimates systolic pressure.
5. If the estimate is accepted, the device selects estimated systolic plus
   10 mmHg, capped at 275 mmHg, and begins the timed hold.
6. Use **STOP** at any time to stop and vent, or press the physical button / flip the switch to stop.

## Upload history

Therapy events are saved on the phone until they are uploaded.

1. After a run or connection session, tap **Sync & refresh history**.
2. Wait for the success message and review recent sessions.
3. Do not clear the app's storage before syncing pending events.

The app uploads event changes such as start, stop, completion and faults. It
does not upload a continuous pressure graph or countdown history.

## Common messages and what to do

| Message or symptom | What to do |
| --- | --- |
| Bluetooth is off | Turn on Bluetooth, then tap **Connect device** again. |
| Bluetooth permission is denied | Allow Bluetooth permission for Fleure in phone settings, then reconnect. |
| Bluetooth is still initializing | Wait briefly and try **Connect device** again. |
| No Fleure device found | Confirm the ESP32 is powered, nearby and advertising, then retry. |
| Firmware mismatch | The app and ESP32 are using different protocol versions. Ask the technical operator to install matching app and firmware versions. |
| Sensor unavailable or invalid | Stop using the device. The device has stopped and vented; have the hardware and sensor checked. |
| 300 mmHg cutoff reached | The device stopped and opened the vent. Do not restart until the cause and pressure reading have been checked. |
| Target range was not reached | The device stopped after its pressure-build timeout. Check the cuff, tubing, pump, valve and sensor before retrying. |
| Unable to estimate systolic pressure | Automated estimation failed safely. The pump stopped and the vent opened; use manual mode only if the technical operator approves it. |
| Bluetooth disconnected | Reconnect deliberately. There is no automatic resume, and the app cannot prove the physical output state after losing contact. |
| No device acknowledgement | The app closed the connection after waiting for the device. Check the device before reconnecting. |
| Sign in failed | Check the email and password, and confirm the phone has internet access. The demo email addresses are lowercase. |
| Sync failed | Keep the app data, restore the API connection and tap **Sync & refresh history** again. |

If the pump does not stop or the vent does not open as expected, use the
independent physical safety procedure for the bench setup. Do not rely on the
phone display as proof that the hardware is safe.

## Clinician dashboard

Clinicians use the web dashboard, not the patient Bluetooth controls:

1. Start the clinician dashboard and open its local web address.
2. Sign in with the clinician account.
3. Select the assigned patient.
4. Tap **Refresh uploaded data**.
5. Select a session and inspect its uploaded events.

The dashboard shows uploaded observations after synchronization. It is not a
live pressure monitor.
