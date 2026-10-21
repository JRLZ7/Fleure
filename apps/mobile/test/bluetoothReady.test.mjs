import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForBluetoothReady } from '../src/bluetoothReady.ts';

test('waits through iOS initialization and resetting until powered on', async () => {
  let emit, removed = 0, ready = false;
  const result = waitForBluetoothReady(listener => {
    emit = listener;
    listener('Unknown');
    return { remove() { removed++; } };
  }).then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);
  emit('Resetting');
  await Promise.resolve();
  assert.equal(ready, false);
  emit('PoweredOn');
  await result;
  assert.equal(ready, true);
  assert.equal(removed, 1);
});

for (const [state, message] of [['PoweredOff', /Bluetooth is off/], ['Unauthorized', /permission is denied/], ['Unsupported', /does not support/]]) {
  test(`reports ${state} accurately and removes subscription`, async () => {
    let removed = 0;
    await assert.rejects(waitForBluetoothReady(listener => {
      listener(state);
      return { remove() { removed++; } };
    }), message);
    assert.equal(removed, 1);
  });
}

test('initialization timeout cleans up subscription', async () => {
  let removed = 0;
  await assert.rejects(waitForBluetoothReady(listener => {
    listener('Unknown');
    return { remove() { removed++; } };
  }, 10), /still initializing/);
  assert.equal(removed, 1);
});

test('already powered on resolves and cleans up a synchronous subscription', async () => {
  let removed = 0;
  await waitForBluetoothReady(listener => {
    listener('PoweredOn');
    return { remove() { removed++; } };
  });
  assert.equal(removed, 1);
});
