#include "../FleureBLE/TherapyController.h"
#include <assert.h>
#include <stdio.h>
#include <initializer_list>
using namespace fleure;

void sampleAt(Controller& c, float pressure, uint32_t now) {
  c.sample(pressure, now);
  c.tick(now);
}
void begin(Controller& c, uint16_t target, uint16_t duration) {
  c.sample(0, 0);
  assert(c.start(target, duration, 0) == Result::Accepted);
  assert(c.pump && c.ventClosed);
}
int main() {
  for (uint16_t target = 125; target <= 275; target += 25) {
    for (uint16_t duration = 120; duration <= 360; duration += 30) {
      Controller c;
      begin(c, target, duration);
      sampleAt(c, target, 10);
      assert(c.timerStarted && !c.pump && c.ventClosed);
      const uint32_t countdownAt = c.countdownAt;
      // Previously opened the vent at target+25; it must now stay closed.
      sampleAt(c, target < 275 ? target + 26 : 299, 20);
      assert(c.active() && !c.pump && c.ventClosed);
      assert(c.countdownAt == countdownAt);
      sampleAt(c, target - 25, 30);
      assert(!c.pump && c.ventClosed);
      sampleAt(c, target - 26, 40);
      assert(c.pump && c.ventClosed);
      sampleAt(c, target - 1, 50);
      assert(c.pump && c.ventClosed);
      sampleAt(c, target, 60);
      assert(!c.pump && c.ventClosed);
      // Refresh sensor at completion so this tests the timer, not a stale sample.
      sampleAt(c, target, countdownAt + uint32_t(duration) * 1000);
      assert(c.phase == Phase::Completed && c.remainingMs == 0);
      assert(!c.pump && !c.ventClosed);
    }
  }
  for (Reason reason : {Reason::PhysicalStop, Reason::AppStop, Reason::Disconnect, Reason::Heartbeat}) {
    Controller c; begin(c, 200, 120); c.stop(reason);
    assert(!c.pump && !c.ventClosed && c.reason == reason);
  }
  {
    Controller c; begin(c, 200, 120); sampleAt(c, 300, 10);
    assert(c.phase == Phase::Fault && c.reason == Reason::Overpressure);
    assert(!c.pump && !c.ventClosed);
  }
  {
    Controller c; begin(c, 200, 120); c.sensorFailure();
    assert(c.phase == Phase::Fault && !c.pump && !c.ventClosed);
  }
  {
    Controller c; begin(c, 200, 120); c.tick(251);
    assert(c.reason == Reason::Sensor && !c.pump && !c.ventClosed);
  }
  {
    Controller c; begin(c, 200, 120);
    sampleAt(c, 0, Controller::InflationTimeoutMs);
    assert(c.reason == Reason::InflationTimeout && !c.pump && !c.ventClosed);
  }
  puts("Controller checks passed: 63 target/duration combinations, pump-only hold/refill, completion and shutdown paths.");
}
