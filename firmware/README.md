# Pump and valve firmware

`FleureBLE/FleureBLE.ino` now controls pump/valve driver inputs instead of LEDs.
The phone's BLE service UUIDs and START/STOP commands are unchanged. The device
advertises as `Fleure-Pump`.

| State | GPIO 25: pump | GPIO 26: solenoid valve |
|---|---|---|
| ON | HIGH: running | HIGH: energized, vent closed |
| OFF | LOW: stopped | LOW: de-energized, vent open |

This assumes both driver inputs are active HIGH. GPIOs are control signals for
the external driver circuit, not power connections for the pump or valve.

Physical Start remains GPIO 18 and physical Stop remains GPIO 19, both wired to
ground with internal pull-ups. Stop has priority. Startup, Stop, BLE disconnect,
and remote heartbeat timeout all command OFF. ON closes the valve before starting
the pump; OFF stops the pump before opening the valve. These writes are sequential,
with no mechanical settling delay.

There is no pressure feedback, overpressure cutoff, or maximum pump runtime.
This is bench control, not firmware for inflating a cuff on a person. Output
states are commanded states; the firmware cannot verify actual pump or valve
operation. External circuitry must establish safe levels while the ESP32 is
unpowered or its pins are not yet configured.

Compile for ESP32 Dev Module with Espressif Arduino ESP32 3.x, upload, and test
START/STOP and physical Stop on the bench. Also test disconnect and app closure:
the pump should stop and the valve should vent. The five-second heartbeat timeout
applies to remote ON; a physical Start without a phone remains on until Stop.
