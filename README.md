# Fleure pressure-control prototype

Fleure combines an ESP32 pump/vent controller, an Expo patient app, a Node.js API and a React clinician dashboard. The current patient app uses **real Bluetooth hardware only** and displays live pressure and the ESP32's remaining session time.

This is a bench prototype. The pressure choices are implementation settings, not validated treatment recommendations. Physical pressure accuracy, overshoot, emergency release and failure behavior require hardware verification and independent protection before human use.

## Current behavior

| Setting or function | Implementation |
| --- | --- |
| Target pressure | 125–275 mmHg in 25 mmHg steps; default 200 mmHg |
| Duration | 2:00–6:00 in 30-second steps; default 2:00 |
| Timer start | First valid pressure sample within target ±25 mmHg; no dwell time |
| Later pressure deviations | Countdown continues; pressure regulation remains active |
| App control | One Start button becomes STOP while start is pending and during an active run |
| Settings during a run | Locked |
| Completion | ESP32 stops pump, opens vent and reports Completed / 0:00 |
| Cutoff | Measured pressure at or above 300 mmHg stops pump and opens vent |
| Sensor fault | Invalid/missing data or stale readings stop pump and open vent |
| Pressure-build timeout | 60 seconds without reaching the initial band; configurable bench default |

The ESP32 owns regulation, timing and outputs. The app displays device reports rather than running its own countdown. Regulation uses on/off hysteresis, not PWM or PID: pump toward target, refill below target minus 25 mmHg, and vent above target plus 25 mmHg until pressure returns to target. Actual pressure stability is not guaranteed by software tests.

The 300 mmHg cutoff takes priority over the timer-start band. For a target of 275 mmHg, a 300 mmHg reading is a fault even though it is on the upper edge of that band.

## Requirements

- Node.js 24.x and npm; the API uses Node's built-in SQLite.
- A BLE-capable ESP32 with the pins required by the sketch, the pump/valve driver circuits and an MPRLS0300YG00001BB pressure sensor.
- Arduino IDE with Espressif Arduino-ESP32 3.x and its bundled BLE/Wire libraries.
- A physical Android/iOS phone with a development build containing `react-native-ble-plx`. Expo Go cannot provide this module.
- Android SDK for local Android builds, or macOS/Xcode and signing for local iOS builds; an existing EAS development-build workflow may also be used.

The repository's existing lockfile and Expo configuration remain authoritative for dependency versions. The source update introduces no new mobile native dependency and uses React Native's built-in SafeAreaView.

## Install the matching source files

Replace `apps/mobile/App.tsx` and `apps/mobile/src/{ble.ts,ble.web.ts,protocol.ts}` with the pressure-update versions. Keep `bluetoothReady.ts`. Remove obsolete `src/simulator.ts` and any tests/imports that still depend on its old driver interface.

Keep `TherapyController.h` beside `firmware/FleureBLE/FleureBLE.ino` and upload the new sketch. The app and firmware must both use protocol v2. The new app rejects legacy one-byte state frames, and the new firmware rejects legacy one-byte START commands. See [firmware/README.md](firmware/README.md) for wiring, regulation and protocol details.

## Configure accounts and API

From the repository root:

```sh
npm ci
cp apps/api/.env.example apps/api/.env
```

Set `DEMO_PASSWORD` to your own value of at least 12 characters. The first startup against an empty users table seeds these accounts with that password:

| Email | Role | Access |
| --- | --- | --- |
| patient@fleure.local | Patient | Own sessions |
| clinician@fleure.local | Clinician | Demo Patient's sessions |
| other@fleure.local | Patient | Own sessions; unassigned to clinician |

There is no registration or password-reset flow. Email lookup is case-sensitive; use the listed lowercase addresses. Changing `DEMO_PASSWORD` after the database exists does not change saved passwords. To create fresh demo accounts without deleting existing data, stop the API and set `DATABASE_PATH` to a new filename before restarting with the desired `DEMO_PASSWORD`. The new database starts without the old sessions.

Use the existing npm scripts to start services in separate terminals:

```sh
npm run dev:api
npm run dev:clinician
```

The API reads `DEMO_PASSWORD`, `DATABASE_PATH`, `HOST`, `PORT` and `CORS_ORIGINS` from the process environment. If starting `server.ts` directly, load/export your `.env` values explicitly; the supplied entry point does not load `.env` itself. The default database filename is `fleure.db`, resolved relative to the API process working directory.

For a physical phone, set `HOST=0.0.0.0`, restart the API and enter `http://YOUR_COMPUTER_LAN_IP:3001` in the patient app. The phone and computer must be reachable over the network. Use an HTTPS endpoint if the phone's network policy blocks local HTTP. The clinician dev server normally runs at `http://localhost:5173` and proxies `/api` to the API.

For browser requests, match `CORS_ORIGINS` to the exact requesting origins and restart the API after changes. Native apps do not use browser CORS.

## Build and run the patient app

Use the repository's existing native-build scripts:

```sh
npm run android -w @fleure/mobile
# Or on macOS, with Xcode and signing configured:
npm run ios -w @fleure/mobile -- --device
```

After installing a compatible development build:

```sh
npm run dev:mobile
```

Rebuild the development app when native dependencies or native configuration change. A JavaScript reload alone cannot register a newly added native component.

The browser can render the login and interface, but **cannot connect or run therapy** in this implementation. `ble.web.ts` explains that a native development build is required. There is no simulator fallback. A web export is a packaging check, not a functional hardware test.

## Run a bench session

1. Wire and bench-check the hardware using the firmware README. Power one prototype; the app currently connects to the first matching Fleure service.
2. Sign in with the patient account and the configured API address.
3. Connect to `Fleure-Pump`. A fresh, valid pressure reading is required before Start.
4. Choose pressure and duration, then press Start. Settings are sent when Start is pressed, not when a selector is tapped.
5. The ESP32 builds pressure. Its countdown begins on first entry into the ±25 mmHg band and continues until completion unless stopped or faulted.
6. Use STOP or the physical red button to end early. At normal completion, confirm pump off, vent open and Completed / 0:00 in the app.
7. Press **Sync & refresh history** to upload queued events and refresh history.
8. On the clinician dashboard, sign in as the clinician, choose Demo Patient and refresh uploaded data.

Keep the app in the foreground. Backgrounding closes BLE and ends the local connection session. Reconnect deliberately; there is no automatic resume. After a communication failure, the app clears pressure/timer telemetry and cannot independently prove the physical output state.

## Physical controls and failure handling

Green START uses the board's last accepted settings, initially 200 mmHg / 2:00. App selections are not sent until app Start. Physical-only operation does not require app heartbeats, but still uses pressure regulation, the countdown and fault shutdown. An established BLE disconnect stops an active run regardless of how it started.

Red STOP takes priority; green must be released and pressed again after a stop condition. Remote runs stop if heartbeats are absent for more than five seconds. The app disconnects if the device telemetry frame counter stops advancing for more than three seconds; command acknowledgement also has a three-second deadline. Sensor readings older than 250 ms trigger a firmware fault. These are software behaviors, not independent hardware emergency protection.

## Data and clinician visibility

- Live pressure and countdown samples are **not persisted** in the backend. There is no stored pressure graph or real-time clinician telemetry stream.
- Phase/reason/run changes become device events, including target and duration in the reason text. Legacy `on` represents an active run; it does not mean the pump GPIO is continuously HIGH during regulation.
- A saved app session covers a BLE connection and can contain multiple therapy runs. Completion does not automatically disconnect or close that connection session; disconnect/backgrounding closes it.
- AsyncStorage retains pending sessions/events until explicit upload. Do not clear app storage before syncing. Stable UUIDs support retry deduplication.
- Old queued simulator sessions remain compatible with the unchanged API schema; the current app cannot create new simulator runs.
- Authentication tokens remain in memory; restarting requires login. The API enforces patient ownership and clinician assignments. Records remain phone-reported, not cryptographically attested by the ESP32.

## Layout

| Path | Purpose |
| --- | --- |
| apps/mobile | Expo/React Native patient app and native BLE driver |
| apps/clinician | React/Vite clinician dashboard |
| apps/api | Express/TypeScript API and SQLite storage |
| firmware/FleureBLE | ESP32 sketch and TherapyController.h |
| docs/TESTING.md | Current verification record and acceptance procedures |
| packages/protocol | Existing protocol documentation; align it with v2 before using it as a wire-format reference |

The v2 implementation is defined by `apps/mobile/src/protocol.ts`, `ble.ts`, `FleureBLE.ino` and `TherapyController.h`. Older LED-demo documentation and CONTEXT.md may describe superseded pins, sensors or plans.

## Verification and remaining work

The targeted pressure-update checks passed for TypeScript, controller logic, mocked sketch I/O, protocol decoding, BLE acknowledgement/freshness and app interactions. No real ESP32 compile/flash, native phone build or hardware pressure test was completed. Full repository checks below were retained from the original workflow and must be rerun after integration:

```sh
npm run check
npm test
npm run build
npm exec -w @fleure/mobile -- expo install --check
npm exec -w @fleure/mobile -- expo export --platform web
```

See [docs/TESTING.md](docs/TESTING.md) for exact coverage and outstanding acceptance tests. The source update is not a deployed cloud service or a completed multi-cycle RIPC protocol. BLE pairing/provisioning, device identity, independent pressure protection, hardware validation and clinical validation remain outside the implemented prototype. Any nearby compatible BLE client can issue prototype commands; server roles do not authenticate BLE commands.
