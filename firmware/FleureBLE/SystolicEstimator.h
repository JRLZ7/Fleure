#pragma once
#include <stdint.h>
#include <math.h>

namespace fleure {

// Lightweight on-device adaptation of the reference project's pulse-envelope
// method. The MPRLS pressure stream is already in mmHg, so no sensor-specific
// conversion is performed here.
struct SystolicEstimator {
  static constexpr uint16_t Capacity = 900;
  float pressures[Capacity] = {};
  float envelopes[Capacity] = {};
  uint16_t count = 0;
  float baseline = 0;
  float envelope = 0;

  void reset() {
    count = 0;
    baseline = 0;
    envelope = 0;
  }

  void sample(float pressure) {
    if (!isfinite(pressure) || count >= Capacity) return;
    if (count == 0) baseline = pressure;
    baseline += 0.04f * (pressure - baseline);
    const float pulse = fabsf(pressure - baseline);
    envelope += 0.18f * (pulse - envelope);
    pressures[count] = pressure;
    envelopes[count] = envelope;
    ++count;
  }

  bool ready(float pressure) const {
    return count >= 100 && pressure >= 200.0f;
  }

  bool estimate(uint16_t& systolic) const {
    if (count < 100) return false;
    float maximum = 0;
    for (uint16_t i = 20; i < count; ++i)
      if (envelopes[i] > maximum) maximum = envelopes[i];
    if (!(maximum > 0.01f)) return false;

    const float threshold = maximum * 0.55f;
    for (uint16_t i = 20; i < count; ++i) {
      if (pressures[i] >= 60.0f && envelopes[i] >= threshold) {
        const float value = pressures[i];
        if (value >= 80.0f && value <= 240.0f) {
          systolic = uint16_t(value + 0.5f);
          return true;
        }
      }
    }
    return false;
  }
};
} // namespace fleure
