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
  // Keep the complete inflation recording at the sensor's maximum sample rate.
  // Include both endpoints of the 120-second window (6001 samples, ~48 KB).
  static constexpr uint32_t RecordingDurationMs = 120000;
  static constexpr uint32_t MinimumSampleIntervalMs = 20;
  static constexpr float ReadyPressureMmHg = 175.0f;
  // A centered two-second window removes the approximately linear inflation
  // ramp while retaining the cardiac-pressure oscillation.
  static constexpr uint16_t OscillationWindowSamples = 101;
  static constexpr float MinimumOscillationMmHg = 0.03f;
  static constexpr uint16_t Capacity = RecordingDurationMs / MinimumSampleIntervalMs + 1;
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
    return count >= 100 && pressure >= ReadyPressureMmHg;
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
    // Work on a centered, locally detrended signal. Comparing adjacent raw
    // pressure samples makes a normal inflation ramp hide small cardiac
    // oscillations, because the ramp's positive slope dominates each sample.
    const uint16_t halfWindow = OscillationWindowSamples / 2;
    if (count <= OscillationWindowSamples) return EstimateStatus::TooFewSamples;
    unsigned reversals = 0;
    int previousDirection = 0;
    float filteredEnvelope = 0;
    float maximum = 0;
    for (uint16_t i = halfWindow; i + halfWindow < count; ++i) {
      float localMean = 0;
      for (uint16_t j = i - halfWindow; j <= i + halfWindow; ++j)
        localMean += pressures[j];
      const float signal = pressures[i] - localMean / OscillationWindowSamples;
      filteredEnvelope += 0.18f * (fabsf(signal) - filteredEnvelope);
      if (pressures[i] >= 80.0f && pressures[i] <= 240.0f &&
          filteredEnvelope > maximum)
        maximum = filteredEnvelope;
      const int direction = signal > MinimumOscillationMmHg ? 1 :
                            signal < -MinimumOscillationMmHg ? -1 : 0;
      if (direction == 0) continue;
      if (previousDirection != 0 && direction != previousDirection) ++reversals;
      previousDirection = direction;
    }
    if (reversals < 8) return EstimateStatus::NoOscillations;
    if (!(maximum > MinimumOscillationMmHg)) return EstimateStatus::WeakSignal;

    const float threshold = maximum * 0.55f;
    filteredEnvelope = 0;
    for (uint16_t i = halfWindow; i + halfWindow < count; ++i) {
      float localMean = 0;
      for (uint16_t j = i - halfWindow; j <= i + halfWindow; ++j)
        localMean += pressures[j];
      const float signal = pressures[i] - localMean / OscillationWindowSamples;
      filteredEnvelope += 0.18f * (fabsf(signal) - filteredEnvelope);
      if (pressures[i] >= 60.0f && filteredEnvelope >= threshold) {
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
