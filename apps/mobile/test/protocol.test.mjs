import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeStart } from '../src/protocol.ts';

test('encodes manual and automated START commands distinctly', () => {
  const settings = { targetMmHg: 200, durationSeconds: 120 };
  assert.equal(encodeStart(settings, 7).length, 7);
  assert.deepEqual([...encodeStart(settings, 7, true)], [1, 200, 0, 120, 0, 7, 0, 1]);
});

import {
  decodeTelemetry, PHASES, PHASE_LABELS, isActive, supportsAutomation,
  manualSettingsForTelemetry,
} from '../src/protocol.ts';

function frame({ flags = 1, target = 200, phase = 0, remaining = 120 } = {}) {
  const b = new Uint8Array(20), v = new DataView(b.buffer);
  b[0] = 2; b[1] = phase; b[3] = flags;
  v.setUint16(4, 1000, true);
  v.setUint16(6, target, true);
  v.setUint16(8, remaining, true);
  v.setUint16(10, 120, true);
  return b;
}

test('automation is unavailable for missing telemetry and older/default firmware', () => {
  assert.equal(supportsAutomation(null), false);
  const t = decodeTelemetry(frame());
  assert.equal(t.automationSupported, false);
  assert.equal(t.automatedRun, false);
  assert.equal(supportsAutomation(t), false);
});

test('firmware capability enables automation even before any automated run', () => {
  const t = decodeTelemetry(frame({ flags: 1 | 16 }));
  assert.equal(supportsAutomation(t), true);
  assert.equal(t.automatedRun, false);
});

test('computed target survives decoding without poisoning manual restart after reconnect', () => {
  const t = decodeTelemetry(frame({ flags: 1 | 2 | 16 | 32, target: 215, phase: 3, remaining: 0 }));
  assert.equal(t.targetMmHg, 215);
  assert.equal(t.automatedRun, true);
  const manual = manualSettingsForTelemetry({ targetMmHg: 175, durationSeconds: 180 }, t);
  assert.equal(manual.targetMmHg, 175);
  assert.equal(encodeStart(manual, 8).length, 7);
});

test('legacy non-preset and preset automated targets both preserve manual choice', () => {
  const current = { targetMmHg: 175, durationSeconds: 120 };
  for (const [target, flags] of [[215, 1], [200, 1 | 16 | 32]]) {
    const t = decodeTelemetry(frame({ flags, target }));
    assert.equal(manualSettingsForTelemetry(current, t).targetMmHg, 175);
  }
});

test('manual firmware settings still synchronize on reconnect', () => {
  const t = decodeTelemetry(frame({ target: 225 }));
  assert.equal(manualSettingsForTelemetry({ targetMmHg: 175, durationSeconds: 180 }, t).targetMmHg, 225);
});

test('automated START ignores computed/manual target, but validates duration', () => {
  assert.deepEqual([...encodeStart({ targetMmHg: 215, durationSeconds: 120 }, 8, true)], [1, 200, 0, 120, 0, 8, 0, 1]);
  assert.throws(() => encodeStart({ targetMmHg: 215, durationSeconds: 120 }, 8));
  assert.throws(() => encodeStart({ targetMmHg: 215, durationSeconds: 121 }, 8, true));
});

test('every phase, including estimation, has a visible status and estimation remains stoppable', () => {
  for (const phase of PHASES) assert.ok(PHASE_LABELS[phase]?.length);
  const t = decodeTelemetry(frame({ flags: 1 | 16 | 32, phase: 6 }));
  assert.equal(isActive(t), true);
  assert.equal(PHASE_LABELS[t.phase], 'Estimating systolic pressure');
});

test('undefined telemetry flags are still rejected', () => {
  assert.throws(() => decodeTelemetry(frame({ flags: 1 | 64 })));
  assert.throws(() => decodeTelemetry(frame({ flags: 1 | 128 })));
});

test('estimation failure has its own fault reason without invalidating healthy pressure', () => {
  const b = frame({ flags: 1 | 16 | 32, phase: 5 });
  b[2] = 9;
  const t = decodeTelemetry(b);
  assert.equal(t.phase, 'fault');
  assert.equal(t.reason, 'systolic_estimation_failed');
  assert.equal(t.pressureMmHg, 100);
  assert.equal(isActive(t), false);
  assert.equal(t.pumpOn, false);
  assert.equal(t.ventClosed, false);
});
