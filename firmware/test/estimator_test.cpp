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

  SystolicEstimator smooth;
  for (int i = 1; i <= 800; ++i) smooth.sample(i * 0.25f);
  assert(smooth.ready(200));
  assert(smooth.estimateDetailed(systolic) == SystolicEstimator::EstimateStatus::NoOscillations);
  assert(systolic == 0);

  // A previously usable but truncated recording must not authorize a target.
  assert(estimator.estimate(systolic));
  for (unsigned i = estimator.count; i <= SystolicEstimator::Capacity; ++i)
    estimator.sample(200.0f);
  assert(estimator.count == SystolicEstimator::Capacity);
  assert(estimator.overflowed);
  assert(estimator.estimateDetailed(systolic) == SystolicEstimator::EstimateStatus::BufferFull);
  assert(!estimator.estimate(systolic) && systolic == 0);

  estimator.reset();
  assert(estimator.count == 0 && !estimator.overflowed);
  assert(estimator.estimateDetailed(systolic) == SystolicEstimator::EstimateStatus::TooFewSamples);
  for (int i = 0; i < 500; ++i)
    estimator.sample(40.0f + i * 0.34f + 2.0f * sinf(i * 0.35f));
  assert(estimator.estimate(systolic));
  puts("Estimator failure diagnostics, buffer guard and reset checks passed.");
}
