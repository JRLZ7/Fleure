#pragma once
#include <stdint.h>
#include <math.h>

namespace fleure {
enum class Phase : uint8_t { Idle, Pressurizing, Running, Completed, Stopped, Fault };
enum class Reason : uint8_t { None, Sensor, Overpressure, InflationTimeout, Heartbeat, Disconnect, PhysicalStop, AppStop, Complete };
enum class Result : uint8_t { None, Accepted, InvalidSettings, Busy, Unsafe };

// All times are unsigned milliseconds so elapsed-time subtraction survives millis() rollover.
struct Controller {
  static constexpr uint32_t SensorMaxAgeMs = 250;
  static constexpr uint32_t InflationTimeoutMs = 120000; // Bench default; validate for your pneumatic hardware.
  static constexpr uint16_t StartTolerance = 25;
  static constexpr float CutoffMmHg = 300.0f;
  Phase phase = Phase::Idle;
  Reason reason = Reason::None;
  uint16_t target = 200, duration = 120;
  float pressure = 0;
  bool pressureValid = false, timerStarted = false, pump = false, ventClosed = false;
  uint32_t lastSample = 0, startedAt = 0, countdownAt = 0, runId = 0, remainingMs = 120000;

  bool active() const { return phase == Phase::Pressurizing || phase == Phase::Running; }
  static bool settingsValid(uint16_t p, uint16_t seconds) {
    return p >= 125 && p <= 275 && (p - 125) % 25 == 0 &&
           seconds >= 120 && seconds <= 360 && (seconds - 120) % 30 == 0;
  }
  void fail(Reason why) {
    if (phase != Phase::Fault) { phase = Phase::Fault; reason = why; }
    pump = false; ventClosed = false;
  }
  void sensorFailure() { pressureValid = false; fail(Reason::Sensor); }
  void sample(float mmHg, uint32_t now) {
    if (!isfinite(mmHg)) { sensorFailure(); return; }
    // A small negative zero offset can occur on a gauge sensor. Do not auto-zero under pressure.
    pressure = mmHg < 0 ? 0 : mmHg;
    pressureValid = true; lastSample = now;
    if (mmHg >= CutoffMmHg) fail(Reason::Overpressure); // Always check the unsmoothed measurement.
  }
  Result start(uint16_t requestedTarget, uint16_t seconds, uint32_t now) {
    if (!settingsValid(requestedTarget, seconds)) return Result::InvalidSettings;
    if (active()) return Result::Busy; // Duplicate START must never reset a running timer.
    if (!pressureValid || uint32_t(now - lastSample) > SensorMaxAgeMs || pressure >= CutoffMmHg)
      return Result::Unsafe;
    target = requestedTarget; duration = seconds; remainingMs = uint32_t(seconds) * 1000;
    startedAt = now; timerStarted = false; phase = Phase::Pressurizing; reason = Reason::None;
    pump = false; ventClosed = true; ++runId;
    tick(now);
    return Result::Accepted;
  }
  void stop(Reason why) {
    pump = false; ventClosed = false;
    // Preserve faults and successful completion when subsequent disconnect/STOP arrives.
    if (phase != Phase::Fault && phase != Phase::Completed) { phase = Phase::Stopped; reason = why; }
  }
  void tick(uint32_t now) {
    if (pressureValid && uint32_t(now - lastSample) > SensorMaxAgeMs) sensorFailure();
    if (!active()) { pump = false; ventClosed = false; return; }
    if (!pressureValid) { fail(Reason::Sensor); return; }
    if (pressure >= CutoffMmHg) { fail(Reason::Overpressure); return; }
    if (!timerStarted && pressure >= target - StartTolerance && pressure <= target + StartTolerance) {
      timerStarted = true; countdownAt = now; phase = Phase::Running;
    }
    if (timerStarted) {
      const uint32_t elapsed = now - countdownAt;
      remainingMs = elapsed >= uint32_t(duration) * 1000 ? 0 : uint32_t(duration) * 1000 - elapsed;
      if (remainingMs == 0) { phase = Phase::Completed; reason = Reason::Complete; pump = false; ventClosed = false; return; }
    } else if (uint32_t(now - startedAt) >= InflationTimeoutMs) {
      fail(Reason::InflationTimeout); return;
    }
    // Regulate using only the pump; keep the vent closed throughout an active run.
    // Stop at/above target and refill below target-25. Overshoot is not actively
    // vented here; completion, STOP and fault paths above still release pressure.
    ventClosed = true;
    if (pressure >= target) pump = false;
    else if (pressure < target - StartTolerance) pump = true;
  }
  uint16_t remainingSeconds() const { return uint16_t((remainingMs + 999) / 1000); }
};
} // namespace fleure
