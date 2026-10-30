
#define FLEURE_ENABLE_EXPERIMENTAL_AUTOMATION 1
#include "../FleureBLE/TherapyController.h"
#include "../FleureBLE/SystolicEstimator.h"

#include <assert.h>
#include <stdio.h>

using namespace fleure;
static_assert(SystolicEstimator::RecordingDurationMs >= Controller::InflationTimeoutMs,
  "Estimator recording must cover the complete pressure-build window");

static void sampleAt(
    Controller& c,
    float pressure,
    uint32_t time
) {
  c.sample(pressure, time);
  c.tick(time);
}

static void beginAutomated(Controller& c) {
  c.sample(0, 0);

  assert(c.startAutomated(120, 0) == Result::Accepted);
  assert(c.phase == Phase::EstimatingSystolic);
  assert(!c.timerStarted);
  assert(c.active());
}

static void testCountdownDoesNotStartDuringEstimation() {
  Controller c;
  beginAutomated(c);

  sampleAt(c, 195, 100);
  assert(c.phase == Phase::EstimatingSystolic);
  assert(!c.timerStarted);

  sampleAt(c, 200, 200);
  assert(c.phase == Phase::EstimatingSystolic);
  assert(!c.timerStarted);

  assert(c.acceptSystolic(165, 200));
  assert(c.target == 215);
  assert(c.phase == Phase::Pressurizing);
  assert(!c.timerStarted);

  sampleAt(c, 210, 300);
  assert(c.phase == Phase::Running);
  assert(c.timerStarted);
  assert(c.countdownAt == 300);
}

static void testStopDuringEstimation() {
  Controller c;
  beginAutomated(c);

  c.stop(Reason::AppStop);

  assert(c.phase == Phase::Stopped);
  assert(!c.pump);
  assert(!c.ventClosed);
  assert(!c.acceptSystolic(160, 10));
}

static void testPressureFault() {
  Controller c;
  beginAutomated(c);

  c.sample(300, 100);

  assert(c.phase == Phase::Fault);
  assert(c.reason == Reason::Overpressure);
  assert(!c.pump);
  assert(!c.ventClosed);
  assert(!c.acceptSystolic(160, 100));
}

static void testInvalidSystolic() {
  Controller c;
  beginAutomated(c);

  sampleAt(c, 200, 100);

  assert(!c.acceptSystolic(79, 100));
  assert(!c.acceptSystolic(241, 100));

  assert(c.phase == Phase::EstimatingSystolic);
  assert(!c.timerStarted);
}

static void testTargetBounds() {
  Controller low;
  beginAutomated(low);
  sampleAt(low, 200, 100);

  assert(low.acceptSystolic(100, 100));
  assert(low.target == 200);

  Controller high;
  beginAutomated(high);
  sampleAt(high, 200, 100);

  assert(high.acceptSystolic(240, 100));
  assert(high.target == 275);
}

static void testStaleSample() {
  Controller c;
  beginAutomated(c);

  assert(!c.acceptSystolic(
    160, Controller::SensorMaxAgeMs + 1
  ));
}

static void testEstimationTimeout() {
  Controller c;
  beginAutomated(c);

  sampleAt(c, 100, Controller::InflationTimeoutMs);

  assert(c.phase == Phase::Fault);
  assert(c.reason == Reason::InflationTimeout);
  assert(!c.pump);
  assert(!c.ventClosed);
}

int main() {
  {
    Controller physical;
    assert(physical.automationSupported());
    assert((physical.telemetryFlags() & 16) != 0);
    assert((physical.telemetryFlags() & 32) == 0);
    physical.sample(0, 0);
    assert(physical.startPhysical(0) == Result::Accepted);
    assert(physical.phase == Phase::EstimatingSystolic);
    assert(physical.mode == Mode::AutomatedRipc);
    assert((physical.telemetryFlags() & (16 | 32)) == (16 | 32));
    physical.stop(Reason::PhysicalStop);
    assert(!physical.pump && !physical.ventClosed);
  }
  testCountdownDoesNotStartDuringEstimation();
  testStopDuringEstimation();
  testPressureFault();
  testInvalidSystolic();
  testTargetBounds();
  testStaleSample();
  testEstimationTimeout();
  {
    Controller c;
    SystolicEstimator estimator;
    beginAutomated(c);
    for (unsigned i = 1; i <= 800; ++i) {
      const float pressure = i * 0.25f;
      c.sample(pressure, i * 20);
      estimator.sample(pressure);
      c.tick(i * 20);
    }
    assert(c.phase == Phase::EstimatingSystolic && !c.pump && c.ventClosed);
    uint16_t estimate = 0;
    assert(estimator.ready(c.pressure));
    assert(!estimator.estimate(estimate));
    c.fail(Reason::SystolicEstimation);
    assert(c.phase == Phase::Fault && c.reason == Reason::SystolicEstimation);
    assert(c.pressureValid && !c.pump && !c.ventClosed);
    assert(!c.timerStarted && c.target == 200);
    assert(!c.acceptSystolic(165, 16000));
  }

  puts("Automated controller regression tests passed.");
  return 0;
}
