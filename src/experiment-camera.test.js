import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDoubleClickTarget } from './experiment-camera.js';

test('double click keeps the fish hit before focus camera movement', () => {
  assert.equal(resolveDoubleClickTarget(-1, 42, 120), 42);
  assert.equal(resolveDoubleClickTarget(19, 42, 120), 19);
});

test('double click on empty space does not reuse a stale fish', () => {
  assert.equal(resolveDoubleClickTarget(-1, -1, 80), -1);
  assert.equal(resolveDoubleClickTarget(-1, 42, 700), -1);
});
