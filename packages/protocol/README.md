# Fleure BLE protocol v2

This document describes the wire format shared by the patient app and
`firmware/FleureBLE`. The device advertises as `Fleure-Pump`. This is an
unauthenticated bench protocol; the UUIDs do not identify a trusted device or
user.

## UUIDs

| Item | UUID | Properties |
| --- | --- | --- |
| Service | `b498a000-8a8a-4b27-a8c5-9d0a214c1000` | Advertised service |
| COMMAND | `b498a001-8a8a-4b27-a8c5-9d0a214c1000` | Write with response |
| STATE | `b498a002-8a8a-4b27-a8c5-9d0a214c1000` | Read and notify |

All multi-byte integers are little-endian.

## Commands

| Command | Payload |
| --- | --- |
| Manual START | 7 bytes: opcode `1`, target uint16, duration uint16, request ID uint16 |
| Automated START | 8 bytes: manual START fields plus mode byte `1` |
| STOP | 3 bytes: opcode `0`, request ID uint16 |
| Heartbeat | 1 byte: opcode `2` |
| Legacy STOP | 1 byte: opcode `0`; accepted for compatibility |
| Legacy START | 1 byte: opcode `1`; rejected |

Targets are 125–275 mmHg in 25 mmHg steps. Durations are 120–360 seconds
in 30-second steps. Automated START ignores the target field and uses 175 mmHg
as a valid placeholder; the firmware computes the target after systolic
estimation.

The request ID is echoed in STATE when the firmware processes a command.
Acknowledgement means the command was processed, not that physical actuation
has been verified.

## STATE

STATE is exactly 20 bytes:

| Offset | Content |
| ---: | --- |
| 0 | Protocol version: `2` |
| 1 | Phase: `0` idle, `1` pressurizing, `2` running, `3` completed, `4` stopped, `5` fault, `6` estimating systolic |
| 2 | Reason: `0` none, `1` sensor, `2` overpressure, `3` pressure-build timeout, `4` heartbeat timeout, `5` disconnect, `6` physical stop, `7` app stop, `8` completed, `9` systolic estimation failed |
| 3 | Flags: bit 0 pressure valid; bit 1 timer started; bit 2 pump commanded on; bit 3 vent commanded closed; bit 4 automation supported; bit 5 automated run; bits 6–7 reserved |
| 4–5 | Pressure uint16 in 0.1 mmHg; `0xFFFF` when invalid |
| 6–7 | Target mmHg uint16 |
| 8–9 | Remaining seconds uint16, rounded up |
| 10–11 | Configured duration seconds uint16 |
| 12–15 | Run ID uint32; reset on ESP32 reboot |
| 16–17 | Acknowledged request ID uint16 |
| 18 | Result: `0` none, `1` accepted, `2` invalid settings, `3` busy, `4` unsafe |
| 19 | Advancing uint8 frame counter; wraps at 256 |

Telemetry is published about every 200 ms, plus phase and command changes. The
app sends heartbeat/read polls about once per second, waits for matching
acknowledgements, times out commands after three seconds, and treats a frozen
frame counter for more than three seconds as a lost connection.

The protocol has no pairing, authorization, provisioning or replay protection.
Run IDs are board-local and reset on reboot. See
`firmware/README.md` for regulation, shutdown and wiring behavior.
