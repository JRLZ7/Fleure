import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeEvent, formatDuration, dayLabel, greeting } from '../src/eventText.ts';

const ev = (reason) => ({ state: 'off', source: 'device', reason, recorded: '2026-11-23T12:00:00Z' });

test('describes therapy phases and stop reasons in plain language', () => {
  assert.deepEqual(
    [describeEvent(ev('pressurizing:none;target=200;duration=120;run=3')).title, describeEvent(ev('pressurizing:none;target=200;duration=120;run=3')).detail],
    ['Therapy started', 'Target 200 mmHg · 2:00'],
  );
  assert.equal(describeEvent(ev('completed:completed;target=200;duration=120;run=3')).tone, 'success');
  assert.equal(describeEvent(ev('stopped:physical_stop;target=200;duration=120;run=3')).detail, 'Stopped with the button on the device');
  assert.equal(describeEvent(ev('fault:overpressure;target=200;duration=120;run=3')).tone, 'danger');
});

test('describes blood pressure and connection events', () => {
  const high = describeEvent(ev('bp_high;systolic=192'));
  assert.equal(high.title, 'Blood pressure too high');
  assert.match(high.detail, /192 mmHg/);
  assert.equal(describeEvent(ev('bp_low;systolic=84')).title, 'Blood pressure too low');
  assert.equal(describeEvent(ev('link_lost')).tone, 'warning');
  assert.equal(describeEvent(ev('something_new')).title, 'something_new');
});

test('formats durations, day labels and greetings', () => {
  assert.equal(formatDuration('2026-11-23T12:00:00Z', null), 'In progress');
  assert.equal(formatDuration('2026-11-23T12:00:00Z', '2026-11-23T12:00:20Z'), 'Under a minute');
  assert.equal(formatDuration('2026-11-23T12:00:00Z', '2026-11-23T12:12:00Z'), '12 min');
  assert.equal(formatDuration('2026-11-23T12:00:00Z', '2026-11-23T13:30:00Z'), '1 h 30 min');
  const now = new Date(2026, 10, 23, 15);
  assert.equal(dayLabel(new Date(2026, 10, 23, 9).toISOString(), now), 'Today');
  assert.equal(dayLabel(new Date(2026, 10, 22, 9).toISOString(), now), 'Yesterday');
  assert.equal(greeting(new Date(2026, 10, 23, 8)), 'Good morning');
  assert.equal(greeting(new Date(2026, 10, 23, 20)), 'Good evening');
});
