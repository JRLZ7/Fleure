#include "../FleureBLE/SystolicEstimator.h"
#include <assert.h>
#include <math.h>
#include <stdio.h>
using namespace fleure;

int main() {
  SystolicEstimator estimator;
  for (int i = 0; i < 500; ++i) {
    const float pressure = 40.0f + i * 0.34f + 2.0f * sinf(i * 0.35f);
    estimator.sample(pressure);
  }
  uint16_t systolic = 0;
  assert(estimator.ready(210));
  assert(estimator.estimate(systolic));
  assert(systolic >= 80 && systolic <= 240);
  printf("Systolic estimator check passed: %u mmHg\n", systolic);
}
