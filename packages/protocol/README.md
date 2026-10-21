# Fleure LED BLE protocol v1

All UUIDs and byte values must match `apps/mobile/src/protocol.ts` and the sketch.

| Item | UUID | Properties / payload |
|---|---|---|
| Service | b498a000-8a8a-4b27-a8c5-9d0a214c1000 | Advertised as Fleure-LED |
| Command | b498a001-8a8a-4b27-a8c5-9d0a214c1000 | Write with response: one byte 0=STOP, 1=START, 2=HEARTBEAT |
| State | b498a002-8a8a-4b27-a8c5-9d0a214c1000 | Read + Notify, one byte 0=OFF, 1=ON |

The client subscribes before reading initial state. Firmware processes commands in its main loop, so a write response acknowledges receipt, not successful activation. A physical Stop can reject START; state stays OFF. The current state read/notification determines the display. Repeated START/STOP are state requests, not toggles.

Only one central is intended. START never persists across reboot/reconnection. STOP wins over queued START within the same firmware tick. Red held LOW blocks all starts. Heartbeats arrive every second; remote ON is turned OFF after five seconds without them. Link loss stops ON regardless of its origin. No pressure or cycle data exists in this version.

This is an unauthenticated bench protocol. Fixed UUIDs identify functionality, not a trusted device or user. Add pairing, explicit device provisioning, and replay/identity controls before advancing beyond the prototype.
