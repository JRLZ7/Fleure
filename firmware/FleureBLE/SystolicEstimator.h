#pragma once
#include <stdint.h>
#include <math.h>

namespace fleure {

// Lightweight on-device adaptation of the reference project's pulse-envelope
// method. The MPRLS pressure stream is already in mmHg, so no sensor-specific
// conversion is performed here.
struct SystolicEstimator {
  enum class EstimateStatus : uint8_t {
    Accepted, BufferFull, TooFewSamples, NoOscillations, WeakSignal, NoCandidate
  };
  static constexpr uint16_t Capacity = 900;
  float pressures[Capacity] = {};
  float envelopes[Capacity] = {};
  uint16_t count = 0;
  float baseline = 0;
  float envelope = 0;
  bool overflowed = false;

  void reset() {
    count = 0;
    baseline = 0;
    envelope = 0;
    overflowed = false;
  }

  void sample(float pressure) {
    if (!isfinite(pressure)) return;
    if (count >= Capacity) { overflowed = true; return; }
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

  static const char* statusText(EstimateStatus status) {
    switch (status) {
      case EstimateStatus::Accepted: return "accepted";
      case EstimateStatus::BufferFull: return "recording buffer full; later pressure data missing";
      case EstimateStatus::TooFewSamples: return "too few pressure samples";
      case EstimateStatus::NoOscillations: return "no usable alternating pressure signal";
      case EstimateStatus::WeakSignal: return "pressure envelope too weak";
      case EstimateStatus::NoCandidate: return "no systolic candidate in supported range";
    }
    return "unknown estimator result";
  }

  EstimateStatus estimateDetailed(uint16_t& systolic) const {
    systolic = 0;
    // Never select a target from a truncated recording of only early inflation.
    if (overflowed) return EstimateStatus::BufferFull;
    if (count < 100) return EstimateStatus::TooFewSamples;
    // Reject an inflation ramp without measurable alternating pressure
    // variations. This gate is deliberately only a sanity check, NOT a
    // clinically validated systolic estimator.
    unsigned reversals = 0;
    int previousDirection = 0;
    for (uint16_t i = 1; i < count; ++i) {
      const float delta = pressures[i] - pressures[i - 1];
      const int direction = delta > 0.08f ? 1 : delta < -0.08f ? -1 : 0;
      if (direction == 0) continue;
      if (previousDirection != 0 && direction != previousDirection) ++reversals;
      previousDirection = direction;
    }
    if (reversals < 8) return EstimateStatus::NoOscillations;
    float maximum = 0;
    for (uint16_t i = 20; i < count; ++i)
      if (envelopes[i] > maximum) maximum = envelopes[i];
    if (!(maximum > 0.01f)) return EstimateStatus::WeakSignal;

    const float threshold = maximum * 0.55f;
    for (uint16_t i = 20; i < count; ++i) {
      if (pressures[i] >= 60.0f && envelopes[i] >= threshold) {
        const float value = pressures[i];
        if (value >= 80.0f && value <= 240.0f) {
          systolic = uint16_t(value + 0.5f);
          return EstimateStatus::Accepted;
        }
      }
    }
    return EstimateStatus::NoCandidate;
  }

  bool estimate(uint16_t& systolic) const {
    return estimateDetailed(systolic) == EstimateStatus::Accepted;
  }
};
} // namespace fleure
