import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeStart } from '../src/protocol.ts';

test('encodes manual and automated START commands distinctly', () => {
  const settings = { targetMmHg: 200, durationSeconds: 120 };
  assert.equal(encodeStart(settings, 7).length, 7);
  assert.deepEqual([...encodeStart(settings, 7, true)], [1, 200, 0, 120, 0, 7, 0, 1]);
});
