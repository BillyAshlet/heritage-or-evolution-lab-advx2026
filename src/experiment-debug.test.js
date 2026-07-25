import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomRangeWindow } from './experiment-debug.js';

test('numeric range can zoom in and return to its registered safety range', () => {
  const limits = { min: 0, max: 100, step: 1 };
  const narrowed = zoomRangeWindow(
    { min: 0, max: 100, step: 1 },
    50,
    0.5,
    limits
  );
  assert.deepEqual(narrowed, { min: 25, max: 75, step: 1 });
  assert.deepEqual(zoomRangeWindow(narrowed, 50, 2, limits), {
    min: 0,
    max: 100,
    step: 1,
  });
});

test('range zoom remains inside safety bounds near an edge', () => {
  assert.deepEqual(
    zoomRangeWindow(
      { min: 0, max: 100, step: 0.1 },
      5,
      0.5,
      { min: 0, max: 100, step: 0.1 }
    ),
    { min: 0, max: 50, step: 0.1 }
  );
});
