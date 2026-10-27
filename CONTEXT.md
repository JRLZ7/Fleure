# Fleure: ESP32 pressure-control cuff project

Updated: October 26, 2026.

This file describes the current source implementation and the latest user-reported hardware decisions. Implemented code, proposed circuit details and verified physical behavior are different categories. The source files and hardware measurements take precedence over older project summaries.

## 1. Purpose and current scope

Fleure is an ESP32-controlled pneumatic cuff prototype with a native patient app, BLE communication, an authenticated local API and a clinician web dashboard. The broader goal is Remote Ischemic Preconditioning (RIPC), but the current controller implements **one pressure-regulated timed hold followed by venting**, not a complete repeated ischemia/reperfusion protocol.

The earlier LED demo, browser simulator, L298N wiring and fixed 20-second inflate/20-second deflate test are superseded for this implementation. The patient app now uses hardware BLE only. Wi-Fi control and a deployed cloud service are not implemented.

The configured pressure choices are project requirements, not validated treatment recommendations. Source-level tests do not establish safe human use, physical pressure accuracy or a guaranteed pressure ceiling. Independent pressure protection, reliable release, hardware validation and appropriate clinical review remain necessary before human testing.

## 2. Current source layout

| Repository path | Responsibility |
| --- | --- |
| apps/mobile/App.tsx | Patient login, device controls, settings, live pressure, remaining time, local queue and upload UI |
| apps/mobile/src/protocol.ts | Protocol-v2 types, settings validation, command encoding and telemetry decoding |
| apps/mobile/src/ble.ts | Native BLE connection, notifications/reads, command acknowledgements and heartbeat/freshness handling |
| apps/mobile/src/ble.web.ts | Reports that Bluetooth requires an Android/iOS development build; no browser fallback |
| apps/mobile/src/bluetoothReady.ts | Waits for Bluetooth readiness and reports permission/power problems |
| firmware/FleureBLE/FleureBLE.ino | ESP32 GPIOs, buttons, sensor I²C, BLE transport and controller integration |
| firmware/FleureBLE/TherapyController.h | Pressure regulation, timer state and shutdown rules; must remain beside the sketch |
| apps/api | Express/TypeScript API, authentication and SQLite persistence |
| apps/clinician | Existing React/Vite dashboard for uploaded assigned-patient sessions |
| firmware/README.md | Current firmware wiring, behavior and detailed v2 byte layout |
| docs/TESTING.md | Verification record and outstanding acceptance procedures |

Remove the obsolete mobile `src/simulator.ts` and migrate tests/imports that use its old interface. The current driver exposes `start(settings)` and `stop()`, replacing `command(on)`. Align any older `packages/protocol` documentation with v2 before relying on it.

## 3. App settings and session behavior

| Requirement | Current implementation |
| --- | --- |
| Pressure units | Live gauge pressure in mmHg, displayed to one decimal place |
| Pressure targets | 125, 150, 175, 200, 225, 250, 275 mmHg |
| Default target | 200 mmHg |
| Duration options | 2:00 through 6:00, every 30 seconds |
| Default duration | 2:00 |
| Start control | A single Start button becomes STOP while a start is pending and throughout an active run |
| Settings changes | Sent to the board when Start is pressed; selectors lock during an active run |
| Countdown start | First valid sample within target ±25 mmHg; inclusive endpoints, no dwell time, cutoff takes priority |
| Later pressure deviations | Timer continues; pressure regulation stays active |
| Countdown owner | ESP32; the phone displays reported remaining seconds rather than maintaining an independent countdown |
| Normal completion | Pump off, vent open, Completed and 0:00; no automatic restart |

A target of 275 mmHg has a nominal start band of 250–300 mmHg, but **300 mmHg triggers shutdown**, not timer start or continued operation.

The patient interface has a teal/cream design, pressure and timer panels, setting selectors, upload/history controls and recent activity. It uses React Native's built-in SafeAreaView. The attempted `react-native-safe-area-context` change was reverted following a missing native-component error.

Keyboard handling uses keyboard events, extra scroll padding, measurement of the focused field, and Next/Done navigation. This replaced the initial KeyboardAvoidingView-only approach. Actual phone/layout behavior still needs device testing.

Backgrounding disconnects BLE and ends the local connection session. Live telemetry is cleared on connection loss; the app cannot independently prove physical output state after losing contact. There is no automatic reconnect, therapy resume or simulator mode.

## 4. Firmware regulation and shutdown

The firmware uses `digitalWrite()` on active-HIGH driver inputs. It does not use PWM, variable-speed control or PID.

- Close the vent before turning the pump on.
- Pump toward the selected target; turn the pump off at target while keeping the vent closed.
- Refill when pressure falls below target minus 25 mmHg.
- Vent when pressure exceeds target plus 25 mmHg, keeping the pump off until pressure returns to target.
- Start the countdown on first entry into the initial band. Once started, it continues through subsequent pressure changes unless stopped/faulted.
- At zero, command pump off and vent open. A later normal STOP/disconnect preserves the completed result.
- Reject duplicate START during an active run; do not reset the active countdown.

This is hysteretic regulation intended to control pressure near the target. Actual constancy, overshoot and release time have not been established by hardware measurements.

| Condition | Implemented response |
| --- | --- |
| Measured pressure ≥300 mmHg | Fault; pump off, vent open |
| Invalid/missing pressure or sensor status fault | Sensor fault; pump off, vent open |
| Pressure reading older than 250 ms | Sensor fault; pump off, vent open |
| Initial start band not reached within 60 seconds | Build-timeout fault; pump off, vent open |
| Physical red STOP or app STOP | Stop and vent |
| Established BLE disconnect | Stop and vent, including a physically started run |
| Remote heartbeat absent for more than five seconds | Stop and vent a remotely started run |
| Countdown complete | Completed, zero remaining time, pump off, vent open |
| Boot/reset | Initialize pump off and vent open; never automatically start |

The 60-second pressure-build timeout is an additional configurable bench default in TherapyController.h. It is separate from the user-selected duration. Cutoff uses the unsmoothed pressure measurement. Faults do not automatically restart; a new START requires fresh valid pressure below the cutoff and must pass physical-stop checks.

Green physical START uses the last accepted board settings, initially 200 mmHg / 2:00. A new app selection alone does not configure physical START. Physical-only runs do not require app heartbeats, but still use sensing, regulation, countdown and fault handling. Red STOP takes priority; physical green must be released/re-pressed after a stop condition.

## 5. GPIOs, power and sensor

| Connection | ESP32 connection | Current firmware assumption |
| --- | --- | --- |
| Physical START button | GPIO 18 to GND | INPUT_PULLUP, active LOW |
| Physical STOP button | GPIO 19 to GND | INPUT_PULLUP, active LOW |
| Pump transistor control | GPIO 25 | HIGH runs pump; LOW stops pump |
| Valve transistor control | GPIO 26 | HIGH energizes/closes vent; LOW opens vent |
| Pressure SDA | GPIO 21 | I²C data |
| Pressure SCL | GPIO 22 | I²C clock |
| Sensor supply | 3V3 and GND | 3.3 V sensor power; common ground |
| ESP32 bench power | USB | Pump/valve load power is external |

These are the pressure-control sketch's assignments. Earlier GPIO 27/26 L298N and GPIO 21 valve mappings are obsolete. A separate user-shared manual GPIO test sketch is not the integrated pressure/BLE controller.

The selected sensor is **Honeywell MPRLS0300YG00001BB**, a 0–300 mmHg gauge-pressure breakout using I²C address 0x18 and transfer function B. The code uses that calibration directly, not a generic 25 PSI/transfer-A configuration, and does not subtract atmospheric pressure.

The sketch requests conversions approximately every 20 ms, waits at least 5 ms before checking completion, has a 25 ms busy-conversion timeout and bounds I²C transactions to 20 ms. Slight negative gauge-zero readings are clamped to zero; automatic zero calibration under pressure is not implemented.

The wiring guide proposes 10 kΩ pull-ups from SDA and SCL to 3V3 and a 100 nF bypass capacitor at the sensor, subject to checking what is already on the breakout. EOC is unused because the code polls status. RES is optional according to breakout documentation. Sensor-chip pad numbers must not be assumed to match breakout-header positions.

## 6. Latest transistor and supply decisions

The user is **not using an L298N**. Separate transistor switches are intended for the pump and solenoid.

| Item | Confirmed report or unresolved detail |
| --- | --- |
| Supply arrangement | User reports a 12 V supply, with no series resistor in the pump's positive supply path |
| Solenoid branch | User explicitly confirmed a **100 Ω resistor in series with the coil** |
| Transistor marking | User wrote **IZLZ44N**; whether this is **IRLZ44N** remains unconfirmed |
| Pump model | Earlier notes mention WP-370B; current rated voltage, running/stall current and exact model have not been supplied |
| Valve rating | Earlier notes describe a 6 V three-way valve; present rated voltage/current have not been confirmed |
| Coil resistor rating | 100 Ω is known; wattage and thermal suitability are unknown |
| Gate resistors | 330 Ω per gate and 10 kΩ gate-to-source pull-downs were proposed; installation is unconfirmed |
| Flyback protection | One correctly rated diode across each load was proposed; actual diode parts/installation are unconfirmed |

The proposed low-side N-channel MOSFET arrangement connects load negative to Drain, Source to common ground, and Gate to the GPIO through its gate resistor. The pump's positive lead connects to +12 V only if the pump is suitably rated; its negative must remain switched if the ESP32 is to stop it.

For the stated solenoid branch, +12 V passes through the 100 Ω resistor to coil positive; coil negative connects to the valve MOSFET Drain. This records the user's arrangement, **not confirmation that it is electrically suitable**. The series resistor is not a gate resistor and does not provide a fixed regulated voltage. At 60 mA, for example, it drops 6 V and dissipates 0.36 W; that is a calculation example, not an established coil operating point.

The proposed flyback diode goes across the coil itself: cathode/stripe at coil positive **after** the series resistor, anode at coil negative/Drain. Pump diode cathode is at pump positive; anode at pump negative/Drain. Diode ratings and actual valve release time require verification.

If the parts are confirmed IRLZ44N in TO-220, with printed face toward the viewer and legs down: pin 1/left Gate, pin 2/middle Drain, pin 3/right Source; metal tab is Drain. Its datasheet specifies on-resistance at 4 V, 5 V and 10 V gate drive, not 3.3 V. Direct ESP32 drive therefore remains unverified for these loads; a suitable gate driver or lower-voltage-specified MOSFET may be needed.

Join ESP32 GND, sensor GND, transistor Sources and external supply negatives. GPIOs must not supply pump/valve load current. The actual valve must vent when unpowered. Missing transistor, load and resistor ratings must be resolved before treating the wiring PDF as a finalized circuit.

## 7. BLE protocol v2

The advertised name is Fleure-Pump. Service/characteristic UUIDs are retained, but START and STATE are incompatible with the earlier one-byte protocol.

| Function | UUID / format |
| --- | --- |
| Service | b498a000-8a8a-4b27-a8c5-9d0a214c1000 |
| COMMAND | b498a001-8a8a-4b27-a8c5-9d0a214c1000 |
| STATE | b498a002-8a8a-4b27-a8c5-9d0a214c1000 |
| START | Seven bytes: opcode 1, target uint16, duration-seconds uint16, request-ID uint16 |
| STOP | Three bytes: opcode 0, request-ID uint16 |
| Heartbeat | One byte: opcode 2 |
| Legacy commands | One-byte STOP accepted; one-byte START rejected |

Multi-byte values are little-endian. STATE is 20 bytes: version, phase, reason, flags, pressure in tenths of mmHg or invalid sentinel, target, remaining seconds, configured duration, run ID, acknowledged request ID, result and advancing uint8 frame counter. See firmware/README.md for byte offsets.

Phases are idle, pressurizing, running, completed, stopped and fault. Telemetry normally publishes about every 200 ms, plus phase/command changes. The phone sends heartbeat/read polls about every second. It waits for the matching acknowledgement, imposes a three-second command deadline and disconnects if telemetry stops advancing for more than three seconds. A readable frozen GATT value is not fresh data.

BLE pairing, authorization of nearby clients, device provisioning and a device-selection UI are not implemented. The app connects to the first matching advertiser. Run IDs are board-local and reset on reboot, not globally unique device attestations.

## 8. API, clinician dashboard and persistence

The existing Node.js API uses Express, Zod, scrypt password hashes, bearer tokens and Node's built-in SQLite. server.ts reads process environment values; direct startup must explicitly load/export configuration. No production identity service or cloud deployment is provisioned.

| Seeded account | Role/access |
| --- | --- |
| patient@fleure.local | Own sessions |
| clinician@fleure.local | Assigned Demo Patient's sessions |
| other@fleure.local | Own sessions; unassigned to the clinician |

On first startup with an empty users table, DEMO_PASSWORD must be at least 12 characters and is used to seed all three accounts. Changing it after the database exists does not reset passwords. There is no registration/reset flow. A different DATABASE_PATH creates a separate fresh database without deleting the old one. Patient-app tokens remain in memory; restarting requires login.

Pending sessions/events are saved in AsyncStorage and uploaded explicitly with Sync & refresh history. Phase/reason/run changes are recorded with target and duration in event reason text. Pressure samples and countdown samples are **live display only**, not stored as a backend time series or pressure chart.

A local/API session represents one BLE connection and can contain several timed therapy runs. Completion does not close that connection session; disconnect/backgrounding does. Legacy event state `on` means an active run, not that the pump GPIO stayed HIGH throughout regulation.

The clinician dashboard reviews uploaded data for assigned patients and requires refresh; it is not a live pressure stream. It was not redesigned during the pressure update. Stable UUIDs support upload retry deduplication. Old queued simulator records remain supported by the unchanged API schema, although the current app cannot generate new simulator runs. Records are phone-reported, not cryptographically attested by the board.

## 9. Verification and build evidence

Targeted pressure-update checks passed for strict frontend TypeScript, all 63 target/duration combinations, timer boundaries/rollover, regulation and faults, host-compiled sketch integration with mocked GPIO/I²C/BLE, firmware-to-app decoding, delayed command acknowledgement, STOP/freshness handling and mocked-native app interactions. Keyboard scroll-space logic was included.

The assistant did not compile/flash with a physical ESP32 toolchain or perform actual phone/BLE/pneumatic tests. The user subsequently supplied this Arduino compile summary; the exact source/build environment was not provided:

| Reported allocation | Used | Reported maximum |
| --- | --- | --- |
| Program storage | 1,120,799 bytes (85%) | 1,310,720 bytes |
| Global/static RAM | 42,820 bytes (13%) | 327,680 bytes |

This leaves 189,921 bytes in that application partition and 284,860 bytes before additional runtime RAM allocations. It does not imply variables are omitted, nor does it prove runtime heap stability or functional hardware behavior.

Full-repository API/clinician checks, native builds, firmware flashing, sensor calibration, pressure traces, overshoot, transistor temperatures and physical stop/vent timing still need recorded evidence. Historical LED/simulator tests and old dependency-audit counts are not current pressure-system acceptance results. See docs/TESTING.md for the current procedures.

## 10. Retained goals and next work

Earlier design goals remain aspirations: under 1 lb total weight, more than one year lifespan, one-handed operation, adjustable adult-arm fit, suitable comfort, a ±5% pressure-accuracy target, emergency release and minimal intervention. None is established as achieved by the source changes.

Next priorities:

1. Confirm transistor marking, load voltage/current ratings, pump stall current, 100 Ω resistor wattage and actual driver/diode installation.
2. Verify valve port behavior, power-off venting, independent pressure protection and safe startup GPIO levels on a bench fixture.
3. Validate pressure-sensor wiring/calibration and physical pressure response across the selectable settings, including overshoot and release.
4. Complete native BLE, interruption, repeated-session and runtime-memory tests; record the exact hardware/software versions.
5. Rerun repository checks after integrating matching v2 app/firmware and removing obsolete simulator dependencies.
6. Design persistent pressure-history storage, authenticated device identity and any multi-cycle RIPC behavior as separate future work with explicit requirements and validation.

Do not restore earlier L298N pins, LED labels, fixed 20-second cycles or simulator fallback based on the old CONTEXT.md. Preserve the current pressure/timer requirements unless the user explicitly changes them.
