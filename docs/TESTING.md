# Verification

## Automated / local checks

- TypeScript checks: API, clinician frontend, patient app.
- API integration test: unauthorized access, patient/clinician roles, assigned-patient isolation, session ownership, retry deduplication, event conflicts, simulator/hardware source separation, end-session, logout.
- Clinician production bundle.
- Expo web export and dependency compatibility.

Hardware is not attached to this development session. The sketch has not been compiled/flashed or electrically verified. Native phone compilation, Bluetooth permissions, BLE compatibility with this Expo/React Native release, and button timing must be verified on the actual devices.

## Manual browser demo

1. Follow README setup. Patient signs in, simulator Connect, Start, Stop, Disconnect.
2. Sync. Clinician signs in and sees one simulator session with state reports and disconnect event.
3. Repeat Sync. Event count should not increase for events already uploaded.
4. Stop the API, connect simulator and generate events. Sync reports an error; pending events remain.
5. Restart API, Sync, and inspect those events. Received timestamps differ from phone-recorded timestamps.
6. Sign in as `other@fleure.local`: it cannot retrieve Demo Patient's sessions. Clinician only sees Demo Patient.
7. Restart app with an unfinished session: it closes locally with an unknown/app_restart event. Login again and upload.

## Hardware acceptance matrix (LED only)

| Action | Expected |
|---|---|
| Power on/reset | Red ON, green OFF |
| Physical Start | Green ON |
| Physical Stop | Red ON |
| Both buttons held | OFF |
| Hold green, press/release red | Remains OFF until green released/re-pressed |
| App Start/Stop | ESP32 LEDs match confirmed app state |
| Physical buttons while connected | App state updates |
| App Start while red held | Remains OFF, including after red release |
| Disconnect while ON | ESP32 OFF; app shows unknown |
| Disable Bluetooth / kill app | OFF upon disconnect, or remote heartbeat expiry |
| Suppress heartbeat while link remains up | Remote ON ends after about 5 seconds |
| Reconnect | Actual state read; no automatic Start |
| Background app | Link closed; session ends, no automatic reconnect |
| API unavailable | Local BLE control works; events remain queued |

A red LED is an OFF indicator, not evidence of a hardware emergency shutdown. This prototype contains no cuff control.

## Results from this development session

TypeScript checks, the API integration test, clinician production build, Expo dependency compatibility, web export, iOS JavaScript export, and BLE config-plugin evaluation passed. Browser testing confirmed patient login, simulator OFF → ON → OFF, disconnect, upload completion, and clinician login with the assigned patient listed. Clinician session inspection was not exercised through the browser before computer-use testing was stopped.

An iOS JavaScript export is not a native iOS build. No Xcode/Android native build, firmware compilation, flashing, or real BLE test was completed.

`npm audit` reported 22 advisories (7 moderate, 15 high) in the Expo/React Native dependency tree, including transitive Metro, node-forge, and xcode/uuid dependencies. npm's suggested forced fixes would downgrade Expo/React Native across incompatible major versions, so they were not applied. Review upstream fixes before deployment; this remains a local demo.
