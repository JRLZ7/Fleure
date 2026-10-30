# Fleure ESP32 pressure-control firmware

`FleureBLE/FleureBLE.ino`, `FleureBLE/TherapyController.h` and `FleureBLE/SystolicEstimator.h` implement pressure sensing, on/off pump/vent regulation, a device-owned countdown and BLE protocol v2. The device advertises as **Fleure-Pump**.

This replaces the earlier LED and pump-only sketches. The service/characteristic UUIDs remain the same, but **the START payload and state format have changed**. Flash this firmware together with the matching pressure-update app.

This is bench-prototype firmware. GPIO and telemetry states describe commands, not proof that a pump stopped or a valve opened. Sensor error, flow dynamics, a stuck sensor/valve/driver or stalled firmware can defeat a software pressure ceiling. Independent pressure protection and actual hardware validation are required before human use.

## Build

Use a BLE-capable ESP32 and Espressif Arduino-ESP32 **3.x**, with its bundled BLE and Wire libraries. Open `FleureBLE/FleureBLE.ino` in Arduino IDE, select the actual board/port, and keep `TherapyController.h` in the same sketch folder. No separate pressure-sensor library is required.

The sketch has been host-compiled against API stubs and exercised with mocked I/O. It has not been compiled with an actual ESP32 toolchain, flashed or electrically verified in this development session.

## Wiring and output logic

| Connection | GPIO | Assumption |
| --- | --- | --- |
| Green START | 18 | Button to GND, internal pull-up |
| Red STOP | 19 | Button to GND, internal pull-up |
| Pump driver input | 25 | HIGH runs pump; LOW stops it |
| Solenoid driver input | 26 | HIGH closes vent; LOW opens vent |
| Sensor SDA | 21 | I²C data |
| Sensor SCL | 22 | I²C clock |

Check pin availability on the actual board. GPIOs control suitable driver circuits; they do not supply load power. Use common ground and the sensor board's documented 3.3 V power/I²C connections. Verify pull-ups and voltage levels on the breakout.

The assumed valve is vent-open when de-energized. A pump-on command closes the vent before setting the pump HIGH. A pump-off/vent command sets the pump LOW before opening the vent. These are sequential GPIO writes with no mechanical settling delay. External circuitry must establish safe levels before the ESP32 configures its pins and while it is unpowered.

| Operating condition | Pump GPIO | Valve GPIO |
| --- | --- | --- |
| Boot, stopped, complete or fault | LOW | LOW: vent open |
| Inflating/refilling | HIGH | HIGH: vent closed |
| Holding pressure | LOW | HIGH: vent closed |
| Venting excess pressure | LOW | LOW: vent open |

An active therapy run is not equivalent to a continuously energized pump.

## Pressure sensing

The configured sensor is **MPRLS0300YG00001BB**, at I²C address **0x18**, measuring **0–300 mmHg gauge** with **transfer function B**. Its B calibration is used directly; do not substitute generic transfer-A/25 PSI library defaults or subtract atmospheric pressure.

The sketch requests a conversion about every 20 ms, waits at least 5 ms before checking it, and faults if conversion remains busy for 25 ms. I²C transactions have a 20 ms timeout. Communication failures, invalid status, sensor integrity/math errors and stale pressure readings trigger shutdown. The controller treats readings older than 250 ms as stale. Negative gauge-zero readings are clamped to zero; no automatic zero calibration under pressure is performed.

The cutoff uses the unsmoothed measurement at **300 mmHg or above**. This equals the sensor's specified measurement endpoint, not an independently guaranteed physical maximum.

## Settings, regulation and countdown

| Parameter | Values |
| --- | --- |
| Target | 125, 150, 175, 200, 225, 250 or 275 mmHg |
| Duration | 120–360 seconds in 30-second steps |
| Boot defaults | 200 mmHg; 120 seconds |
| Initial timer-start band | Target ±5 mmHg, inclusive, subject to cutoff |
| Maximum pressure-build time | 60 seconds before first band entry |

An accepted START requires valid settings and a fresh pressure sample below 300 mmHg. It enters **Pressurizing**. The first sample in the start band immediately begins **Running**; there is no dwell requirement. Once started, the countdown does not pause if pressure leaves the band. A duplicate START during an active run is rejected without resetting its timer.

Regulation uses hysteresis: stop pumping at or above target and refill below target minus 5. Keep the valve closed throughout an active run; pressure above target is not actively vented unless the 300 mmHg fault cutoff is reached. It is not PWM/PID and cannot establish exact constancy without hardware tests. The cutoff overrides regulation and timer-start eligibility: at a 275 mmHg target, 300 mmHg is a fault.

At zero, the board reports **Completed**, remaining time zero, pump LOW and valve LOW. A normal subsequent STOP/disconnect preserves completion; faults remain latched until a new accepted START. A new START after a fault requires healthy fresh pressure below the cutoff and must pass the physical-stop checks.

The build timeout is a configurable bench default in `TherapyController.h`. After the countdown starts, runtime is bounded by the selected duration instead. This branch enables experimental automation (`FLEURE_ENABLE_EXPERIMENTAL_AUTOMATION=1`) for controlled bench testing. Set the flag to `0` for a manual-only build, where physical green START uses manual settings and automation is hidden in the app. Enabled builds use automated physical START and advertise support for the app's **Automated RIPC therapy** button. That path samples the MPRLS waveform during inflation, estimates systolic pressure using a smoothed pulse envelope, and selects `max(200, systolic + 50)` mmHg capped at 275 mmHg before the timed hold. The ordinary app Start command remains a manually selected target. This is an engineering adaptation of the referenced esp-bp signal-processing approach, not a clinically validated blood-pressure measurement or treatment protocol.

## Buttons, remote control and stop conditions

- Red STOP uses the raw input for prompt shutdown and debounced state to block starts during release bounce. It takes priority over green START and remote START.
- Green START is debounced. After a stop condition, it must be released and pressed again. It uses the board's last accepted target/duration, initially the boot defaults.
- Choosing settings in the app does not configure physical START until an app START using those settings is accepted.
- Physical-only runs do not require app heartbeats. Sensor checks, pressure regulation, countdown, cutoff and build timeout still apply.
- An established BLE disconnect stops an active run, including one started physically. A remotely started run also stops when heartbeats have been absent for more than five seconds. The app normally sends one heartbeat per second.
- STOP, disconnect, heartbeat loss, sensor fault, cutoff, build timeout and completion turn the pump off and open the vent. No event automatically resumes a run.

## BLE protocol v2

Use `apps/mobile/src/protocol.ts` as the matching application implementation. Multi-byte integers are little-endian.

| Characteristic | UUID |
| --- | --- |
| Service | b498a000-8a8a-4b27-a8c5-9d0a214c1000 |
| COMMAND, write | b498a001-8a8a-4b27-a8c5-9d0a214c1000 |
| STATE, read/notify | b498a002-8a8a-4b27-a8c5-9d0a214c1000 |

| Command | Payload |
| --- | --- |
| START manual | 7 bytes: opcode 1, target uint16, duration-seconds uint16, request-ID uint16 |
| START automated | 8 bytes: manual START fields plus mode byte `1` |
| STOP | 3 bytes: opcode 0, request-ID uint16 |
| Heartbeat | One byte: opcode 2 |
| Legacy STOP | One byte: opcode 0; still accepted |
| Legacy START | One byte: opcode 1; rejected |

STATE is exactly 20 bytes, fitting the default notification payload:

| Byte offset | Content |
| --- | --- |
| 0 | Protocol version: 2 |
| 1 | Phase: 0 idle, 1 pressurizing, 2 running, 3 completed, 4 stopped, 5 fault, 6 estimating systolic |
| 2 | Reason: 0 none, 1 sensor, 2 overpressure, 3 build timeout, 4 heartbeat timeout, 5 disconnect, 6 physical stop, 7 app stop, 8 completed |
| 3 | Flags: bit 0 pressure valid; bit 1 timer started; bit 2 pump commanded on; bit 3 vent commanded closed; bit 4 experimental automation supported; bit 5 current/last run is automated; bits 6–7 reserved |
| 4–5 | Pressure uint16 in 0.1 mmHg; 0xFFFF when invalid |
| 6–7 | Target mmHg uint16 |
| 8–9 | Remaining seconds uint16, rounded up |
| 10–11 | Configured duration seconds uint16 |
| 12–15 | Run ID uint32, reset on ESP32 reboot |
| 16–17 | Acknowledged command request ID uint16 |
| 18 | Result: 0 none, 1 accepted, 2 invalid settings, 3 busy, 4 unsafe |
| 19 | Advancing uint8 frame counter, wraps at 256 |

Telemetry publishes about every 200 ms, plus phase changes and forced command/stop reports. App START/STOP waits for the matching request acknowledgement rather than trusting an immediate read. An accepted command confirms processing, not verified mechanical actuation. The app times out a command after three seconds and disconnects if telemetry stops advancing for more than three seconds; reading a frozen STATE value does not count as fresh telemetry.

The patient app hides automation unless bit 4 is set and the BLE driver also rejects unsupported automated requests locally. Older v2 firmware with no capability flags remains usable for manual sessions. Use the updated app with automation-enabled firmware: older apps may reject the newly assigned flag bits. Bit 5 separates computed targets from the app's manual target selection, including after completion/reconnection. Non-preset targets from older experimental firmware also do not overwrite manual selections. Automated START sends a 200 mmHg placeholder in the target field; the controller computes the actual target.

## Bench acceptance

Follow [../docs/TESTING.md](../docs/TESTING.md), including independent pressure measurement, sensor faults, cutoff, stop paths, output sequencing and overshoot. Verify the valve's physical vent behavior and actual pressure release, not only GPIO readings or app labels. Do not treat the configured pressure range or 300 mmHg software threshold as clinically validated limits.
