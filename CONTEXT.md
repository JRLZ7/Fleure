# ESP32 Remote-Controlled Blood Pressure Cuff Project

## 1. Project Overview

You are working on an **ESP32-controlled pneumatic cuff system designed for Remote Ischemic Preconditioning (RIPC)**.

The goal is to develop a device that can automatically inflate and deflate a blood pressure cuff using an ESP32 microcontroller, with the eventual ability to control the system remotely, monitor pressure, and transmit data to a mobile application and potentially healthcare providers.

Unlike a traditional blood pressure monitor, which primarily measures blood pressure, your device is intended to **control cuff inflation and deflation for timed compression cycles**.

The project combines:

- **Hardware:** ESP32, air pump, solenoid valve, motor driver, pressure sensor, and blood pressure cuff.
- **Firmware:** Arduino/C++ code to operate the pump and valve.
- **Connectivity:** Bluetooth Low Energy (BLE) or Wi-Fi communication.
- **Software:** A mobile application for remote control, monitoring, and data collection.
- **Healthcare integration:** Potential storage and sharing of recorded measurements with clinicians.

## 2. Hardware Components

| Component | Purpose | Current direction |
|---|---|---|
| ESP32 | Central microcontroller | Main controller |
| L298N motor driver | Controls air pump motor | Selected and being tested |
| WP-370B air pump | Inflates blood pressure cuff | Being tested |
| 6V 3-way solenoid valve | Controls air release | Exploring valve operation and modifications |
| Blood pressure cuff | Applies pressure to the limb | Standard inflatable cuff |
| MPX5050 pressure sensor | Measures pneumatic pressure | Previously researched |
| Qwiic MicroPressure sensor | Alternative pressure measurement | Previously compared |
| Battery pack | Powers pump and electronics | 8 × 1.5V batteries investigated |

### Basic Pneumatic System

Conceptual layout (the valve connection depends on its port configuration):

```text
Air pump ─────┬──────── Blood pressure cuff
              │
              ├──────── Pressure sensor
              │
              └──────── Solenoid valve ─── Vent to atmosphere
```

You have also been investigating the internal structure of three-way solenoid valves, including modifying or 3D-printing a replacement cover while preserving the valve's normal functionality.

## 3. ESP32 Firmware and Control

The current firmware work focuses on basic pump and valve operation rather than a complete automated RIPC protocol.

Your most recent requested testing cycle was:

1. **Inflation — 20 seconds:** Pump ON.
2. **Deflation — 20 seconds:** Pump OFF, vent open.
3. Repeat as needed for hardware testing.

Your current implementation preferences include:

- Using the L298N motor driver with ESP32 GPIO pins.
- Controlling the motor with basic `digitalWrite()` commands.
- Avoiding PWM and variable-speed control for now.
- Using the Random Nerd Tutorials ESP32/L298N wiring and control approach as a reference.
- Adding solenoid valve control for inflation and deflation.

This timing-based approach is useful for testing component functionality, but it does not regulate the actual pressure in the cuff.

## 4. Current ESP32 Pin Configuration

Based on the latest discussed code and hardware setup:

| Connection | ESP32 GPIO | Function |
|---|---|---|
| L298N IN1 | GPIO 27 | Pump motor control |
| L298N IN2 | GPIO 26 | Pump motor control |
| L298N ENA | Jumper installed | Motor channel enabled |
| Solenoid MOSFET | GPIO 21 | Solenoid control |
| Pressure sensor | Not finalized | Pressure readings |

Intended control logic:

| System state | IN1 | IN2 | Solenoid |
|---|---|---|---|
| Inflation | LOW | HIGH | Energized |
| Deflation | LOW | LOW | De-energized |

**Note:** This assumes energizing the solenoid closes the exhaust and de-energizing it vents the cuff. Verify the behavior with the specific valve before use.

## 5. Long-Term RIPC Functionality

The broader project aims to automate a clinician-prescribed sequence of ischemia and reperfusion:

1. Inflate the cuff until the prescribed target pressure is reached.
2. Maintain the target pressure for the prescribed ischemic interval.
3. Open the exhaust valve and completely release cuff pressure.
4. Maintain the deflated state for the prescribed reperfusion interval.
5. Repeat for the prescribed number of cycles.
6. Record pressure measurements, timing, and session outcomes.

The pressure sensor is essential because the system must know when it has reached the desired pressure and whether pressure remains stable.

**Safety:** The current 20-second inflation/20-second deflation program is a hardware test, not a clinically appropriate RIPC protocol. Human testing requires appropriate pressure feedback, automatic pressure release, independent overpressure protection, and clinical oversight.

## 6. Mobile App and Cloud Architecture

You have discussed an architecture that allows patients to operate the cuff remotely and clinicians to access resulting data:

```text
ESP32 + Cuff
   │
   │ Bluetooth Low Energy (BLE)
   ▼
Mobile Application
   │
   │ HTTPS / authenticated API
   ▼
Cloud Backend
   │
   │ Authenticated access
   ▼
Clinician Portal
```

- **ESP32 + cuff:** Motor, valve, and pressure sensing.
- **Mobile app:** Session controls, live monitoring, and history.
- **Cloud backend:** Secure storage, device and user records.
- **Clinician portal:** Review patient sessions and measurements.

You were leaning toward BLE for ESP32-to-phone communication and an authenticated backend for storing data. You also explored ways to prevent a compromised or malicious mobile client from modifying measurements before they reach the server.

The ESP32 itself should remain responsible for safety-critical pump and valve operation, regardless of connection status.

## 7. Design Requirements

| Requirement | Target |
|---|---|
| Portability | Under 1 lb total |
| Lifespan | More than 1 year |
| Accessibility | One-handed operation |
| Fit | Adjustable adult-arm sizing |
| Comfort | Comparable to standard cuffs |
| Pressure accuracy | ±5% design target |
| Safety | Emergency release and overpressure protection |
| Automation | Minimal patient intervention |

## 8. Current Progress and Next Steps

| Workstream | Status | Details |
|---|---|---|
| Hardware selection and architecture | Explored | ESP32, L298N, pump, valve, and cuff identified. |
| Basic pump control | In progress | Digital GPIO control without PWM; hardware testing underway. |
| Solenoid valve operation | In progress | Control logic and replacement housing design being investigated. |
| Pressure sensor integration | Pending | MPX5050 and Qwiic options researched; closed-loop control not yet established. |
| Safety and RIPC control | Pending | Pressure limits, holding control, fault handling, and repeated cycles still need implementation. |
| BLE, app, and backend | Planned | Architecture discussed, but device communication is not yet implemented. |

## Overall Summary

You are developing a **portable, low-cost, ESP32-powered RIPC cuff that automatically controls inflation, pressure maintenance, and deflation**, with the eventual goal of supporting home use and remote clinical monitoring.

Your immediate focus is getting the pump and solenoid valve operating reliably using an ESP32 and L298N motor driver without PWM.

The next major technical milestone is integrating a pressure sensor so the system can transition from simple time-based inflation to **closed-loop, pressure-regulated control with reliable fail-safe deflation**.
