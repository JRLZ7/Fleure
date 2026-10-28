# Fleure verification and bench acceptance

This document covers the hardware-only pressure app and matching ESP32 protocol-v2 firmware. The old browser simulator and LED acceptance matrix no longer describe current behavior.

The source implements one pressure-regulated timed hold. It is not a validated treatment protocol or a completed multi-cycle RIPC controller. Perform physical testing on a bench fixture with independent pressure measurement and protection, not on a person.

## Verification status

The following targeted checks passed while preparing the pressure update. These were isolated source checks, not a full repository build or a physical-device test.

| Check | Result and scope |
| --- | --- |
| Frontend TypeScript | Passed strict checking, including unused-local/parameter checks, against React Native and BLE library types. Existing Crypto/AsyncStorage imports were represented by the interfaces used by the app. |
| Controller combinations | Passed all 63 combinations: seven pressure targets × nine durations. |
| Timer logic | Passed first-entry boundaries, continuous timing outside the band, completion at zero and unsigned-clock rollover. |
| Regulation and faults | Passed hysteresis, cutoff at 300, stale/invalid pressure, pressure-build timeout and duplicate-START rejection. |
| Sketch integration | Host C++ compilation and mocked GPIO/I²C/BLE tests passed for completion, cutoff, sensor failure, heartbeat loss, disconnect, STOP priority, legacy START rejection and output ordering. |
| Protocol | Passed settings encoding, malformed/legacy-frame rejection and decoding a completed frame emitted by the mocked sketch. |
| BLE driver | Passed delayed acknowledgement, rejected START, STOP, stale/frozen telemetry shutdown and repeated cleanup with a mocked peripheral. |
| App interactions | Passed mocked-native tests for sign-in/connect, selector choices/defaults, settings delivery/locking, Start/STOP, reported countdown/completion and keyboard scroll space. |

**Not verified:** actual ESP32-toolchain compilation, flashing, sensor calibration, electrical behavior, native phone compilation, real BLE permissions/link behavior, physical pump/valve response, pressure stability, overshoot or emergency pressure release. Mocked GPIO output ordering does not verify mechanical sequencing.

The original documents reported checks of the earlier LED/simulator system. Those results do not establish correctness of this pressure update. Previous audit counts are historical; run a fresh audit rather than treating them as current.

## Repository integration checks to run

The pump-only regulation regression test can be run on a host with a C++ compiler:

```sh
c++ -std=c++11 -Wall -Wextra -Werror firmware/test/controller_test.cpp -o /tmp/fleure-controller-test
/tmp/fleure-controller-test
```

It covers all 63 target/duration combinations, holding the valve closed above
target, pump refill hysteresis, timer completion, and stop/fault release paths.
It tests commanded outputs only, not physical pressure retention or overshoot.

From the repository root, using its lockfile and actual npm scripts:

```sh
npm ci
npm run check
npm test
npm run build
npm exec -w @fleure/mobile -- expo install --check
npm exec -w @fleure/mobile -- expo export --platform web
npm audit
```

These commands are retained from the repository's original workflow and were not rerun against a complete checkout for this update. No package manifests, test suite or clinician source checkout was supplied with the source-file update.

Before running them, remove the obsolete simulator file and migrate any tests/imports using its previous `Driver.command(on)` interface. The current driver exposes `start(settings)` and `stop()`. Align any `packages/protocol` documentation with the v2 wire format in [../firmware/README.md](../firmware/README.md).

Review audit findings against the installed dependency versions; do not apply forced major-version changes without checking Expo/native compatibility. A successful web or iOS JavaScript export is not a native build or a BLE test.

## Setup and recording

Use the setup in [../README.md](../README.md) and wiring in the firmware README. Record these for every physical run:

| Item | Record |
| --- | --- |
| Source | Commit or archive version for app, firmware and controller header |
| Toolchain | Board model, Arduino-ESP32 version, compile/upload results |
| Phone | OS, device model, Expo/native build and BLE library versions |
| Sensor | Exact part, wiring, reference-instrument details and calibration results |
| Pneumatics | Pump, driver, valve, supply, tubing and bench-fixture configuration |
| Settings | Target, duration and relevant timeout constants |
| Measurements | Actual pressure trace, overshoot, timing and release behavior |
| Outcome | Pass/fail, observed stop reason and deviations |

Confirm a normally-open vent, active-HIGH driver inputs, suitable load power/driver protection, common ground, sensor electrical levels and independent pressure protection before enabling the pump. Do not infer physical pressure from an app label alone.

## Native app and keyboard acceptance

| Action | Expected |
| --- | --- |
| Launch compatible native development build | Login renders without missing-native-component errors |
| Enter email/password/server URL | Each field can be reached above the keyboard by scrolling/focus navigation; Next moves through fields and Done dismisses |
| Tap/scroll with keyboard open | Form remains usable; taps on handled controls work and scrolling does not immediately dismiss the keyboard |
| Sign in as patient | Correct seeded account accepted; clinician account redirected to the dashboard workflow |
| Connect to matching v2 firmware | Fresh live pressure and device phase appear; initial board settings populate selectors |
| Inspect targets | Exactly 125, 150, 175, 200, 225, 250, 275 mmHg; boot default 200 |
| Inspect durations | Exactly 2:00, 2:30, 3:00, 3:30, 4:00, 4:30, 5:00, 5:30, 6:00; boot default 2:00 |
| Change a selection before Start | App selection changes; no hardware run or configuration write starts yet |
| Press Start | Both settings are sent; control becomes STOP while request is pending and throughout active operation |
| Try changing settings during a run | Selectors remain locked |
| Press STOP, including during pressure buildup | Stop is sent and acknowledged; pump-off/vent-open status follows |
| End a run normally | App shows Therapy complete and 0:00 from ESP32 telemetry; settings unlock |
| Connect to legacy firmware | Firmware-mismatch error; no START allowed |
| Use patient app in browser | Interface can render, but Connect reports that a native development build is required; no simulator or therapy run |

Repeat keyboard checks on the actual smallest supported screen and with accessibility text scaling. Mocked layout tests do not establish physical screen behavior.

## Pressure, regulation and timer acceptance

Use a bench fixture and independent reference measurement. Where precise threshold inputs are needed, use controlled test equipment or the host-level tests; do not bypass production cutoff checks to obtain a result.

| Case | Expected firmware/app behavior |
| --- | --- |
| Power on/reset | Pump LOW, valve LOW/vent open; no automatic run; sensor sampled before START is accepted |
| Sensor absent/unreadable at startup | Fault/invalid pressure; START refused; pump off and vent open |
| Valid START below initial band | Pressurizing; countdown holds at selected full duration |
| Target 200; first valid sample reaches 195 mmHg | Countdown starts immediately; no dwell required |
| Target 200; initial sample at 205 mmHg | Eligible to begin countdown; endpoint is inclusive |
| Initial pressure outside band but below cutoff | Countdown waits; controller regulates toward target |
| Pressure leaves band after timing begins | Countdown continues without pause/reset; regulation remains active |
| Pump reaches target | Pump command turns off with vent closed |
| Pressure falls below target minus 5 | Pump refills toward target |
| Pressure exceeds target plus 5, below cutoff | Pump off; valve stays closed; no active pressure release during regulation |
| Measured pressure reaches 300 or higher | Fault immediately commands pump off and vent open; cutoff takes priority over timer-start band |
| Target 275; sample at 300 | Overpressure fault, not timer start/continuation |
| Sensor integrity/math error, communication failure or invalid reading | Sensor fault; pump off and vent open; pressure invalid rather than a stale live value |
| Last valid pressure exceeds 250 ms age | Sensor fault and stop/vent |
| Initial band not reached within 60 seconds | Pressure-build-timeout fault; stop/vent |
| Countdown reaches zero | Completed, zero remaining seconds, pump off, vent open; no automatic new run |
| Duplicate START during active run | Rejected as busy; original duration and countdown are unchanged |
| Fault resolves to healthy pressure | No automatic restart; a fresh explicit START is still required |
| New accepted START after completion/stop | New run ID; full selected duration; initial band rule applies again |

Exercise all selector values with automated tests, then bench-test pressure response across the intended combinations and supply/fixture conditions. Establish actual pressure accuracy, overshoot, holding behavior and complete release independently. The software cutoff at the sensor's full-scale endpoint cannot prove a physical ceiling of 300 mmHg.

## Buttons, communication and interruption acceptance

| Action | Expected |
| --- | --- |
| Physical green START | Uses last accepted board settings, initially 200 mmHg / 2:00 |
| Physical red STOP | Pump off and vent open; STOP takes priority |
| Both buttons held; or app START while red held | No active run; releasing red alone must not start a run |
| Hold green while pressing/releasing red | No restart until green is released/re-pressed or a new permitted remote START is issued |
| Physical START while disconnected | Runs with sensor checks and autonomous timer; app heartbeat not required |
| Physical buttons while connected | Reported phase updates in the app |
| Disconnect during an active run | Board stops/vents; phone clears live telemetry and records unknown connection state |
| Disable phone Bluetooth or kill app | Board stops on disconnect or remote heartbeat expiry; confirm actual pressure release |
| Suppress remote heartbeats while keeping BLE link | Remote run stops after more than five seconds without a processed heartbeat |
| Established BLE disconnect after physical START | Board stops/vents even though the run was started physically |
| Freeze telemetry frame counter while GATT remains readable | App detects lack of advancement after more than three seconds and disconnects |
| Delay START acknowledgement | App waits for matching request ID; immediate old STATE must not confirm START |
| No command acknowledgement for three seconds | App reports failure and closes connection; verify board shutdown independently |
| STOP while START acknowledgement is pending | New STOP supersedes pending START; no unintended timer reset/restart |
| Reconnect after a stop/fault/completion | Read actual current telemetry; no automatic START or resume |
| Background app | BLE closes and local connection session ends; no automatic reconnect |
| Reboot ESP32 during run | Outputs initialize off/vent; run ID resets; app must not assume continued therapy |

Shutdown timing includes firmware polling, transaction timeouts and physical actuator response. Measure end-to-end behavior; a passed callback/GPIO test alone is insufficient.

## Persistence, API and clinician regression checks

Sign in before testing API outages: an unavailable API cannot authenticate a new login.

1. Connect, run a bench session to completion, then disconnect and Sync. Verify one uploaded **hardware connection session** with phase/reason events, settings and completion reason.
2. Repeat Sync. Already uploaded events should not be duplicated.
3. Perform two timed runs within one BLE connection, then disconnect and Sync. Both run IDs should be represented inside that connection session; do not expect a separate API session for every Start.
4. After login, stop the API, generate hardware events and attempt Sync. It should report failure and retain queued events. Restart the API and retry successfully.
5. Inspect uploaded events through the API or available dashboard detail views. Phone-recorded and server-received timestamps have different meanings. Confirm phase/reason/settings text survives upload; do not expect stored high-frequency pressure samples or a countdown series.
6. Refresh the clinician dashboard after Sync. It should show uploaded data for its assigned patient; it is not a live pressure stream. The clinician UI itself was not redesigned by this pressure update.
7. Sign in as `other@fleure.local`. It cannot read Demo Patient's sessions. The clinician is restricted to assigned patients; unauthenticated requests and writes to another patient's session must fail.
8. Test conflicting event-ID retries and logout/token expiry against the unchanged API integration tests. Current events must use hardware/device or connection sources; legacy queued simulator records remain separate.
9. Restart the app with an unfinished local connection session. It should require login and close the recovered session locally with an unknown/app_restart event before later upload. Avoid clearing AsyncStorage before Sync.
10. Confirm normal completion alone leaves BLE connected and does not close the API connection-session record. Disconnect/backgrounding ends it. An open record does not prove therapy is still running.
11. Verify changing `DEMO_PASSWORD` on an existing database leaves saved passwords unchanged. Use a different `DATABASE_PATH` for a separate fresh-account test without deleting existing records.

These are acceptance procedures to execute in the integrated repository. The pressure update did not rerun the full API/clinician suite, provide device attestation, persist pressure traces, add registration/password reset or deploy a cloud service.

## Release record

Mark each procedure with date, tester, source version, measured result and evidence. Keep failed/blocked cases visible. Do not describe a native build, firmware upload, real BLE run or pressure test as passed until performed on the actual equipment.
