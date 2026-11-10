#define FLEURE_ENABLE_EXPERIMENTAL_AUTOMATION 0
#include "../FleureBLE/TherapyController.h"
#include <assert.h>
#include <stdio.h>
using namespace fleure;

int main() {
  Controller c;
  assert(!c.automationSupported());
  assert((c.telemetryFlags() & (16 | 32)) == 0);
  c.sample(0, 0);
  assert(c.startPhysical(0) == Result::Accepted);
  assert(c.mode == Mode::Manual && c.phase == Phase::Pressurizing);
  assert(c.target == 200 && c.pump && c.ventClosed);
  assert(c.startPhysical(1) == Result::Busy);
  c.stop(Reason::PhysicalStop);
  assert(!c.pump && !c.ventClosed);

  c.sample(0, 2);
  assert(c.start(175, 180, 2) == Result::Accepted);
  c.stop(Reason::AppStop);
  c.sample(0, 3);
  assert(c.startPhysical(3) == Result::Accepted);
  assert(c.target == 175 && c.duration == 180);
  c.stop(Reason::PhysicalStop);
  assert(c.startPhysical(300) == Result::Unsafe);
  assert(!c.pump && !c.ventClosed);
  puts("Manual-only physical START regression tests passed.");
}
