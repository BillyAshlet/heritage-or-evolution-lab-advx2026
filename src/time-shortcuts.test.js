import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HeldTimeShortcutState,
  isEditableShortcutTarget,
  resolveHeldTimeScale,
} from './time-shortcuts.js';

test('held time shortcut uses the most recently pressed key', () => {
  assert.equal(resolveHeldTimeScale([]), 1);
  assert.equal(resolveHeldTimeScale(['Enter']), 2);
  assert.equal(resolveHeldTimeScale(['Space']), 0.2);
  assert.equal(resolveHeldTimeScale(['Enter', 'Space']), 0.2);
  assert.equal(resolveHeldTimeScale(['Space', 'Enter']), 2);
  assert.equal(resolveHeldTimeScale(['Enter']), 2);
});

test('held shortcut state restores the remaining key and then normal speed', () => {
  const state = new HeldTimeShortcutState();
  assert.equal(state.press('Enter'), 2);
  assert.equal(state.press('Space'), 0.2);
  assert.equal(state.release('Space'), 2);
  assert.equal(state.release('Enter'), 1);
  assert.equal(state.release('Enter'), null);
});

test('repeated press cannot leave a duplicate held key behind', () => {
  const state = new HeldTimeShortcutState();
  assert.equal(state.press('Space'), 0.2);
  assert.equal(state.press('Space'), 0.2);
  assert.equal(state.release('Space'), 1);
  assert.deepEqual(state.keys, []);
  assert.equal(state.press('Enter'), 2);
  assert.equal(state.clear(), 1);
  assert.equal(state.clear(), null);
});

test('time shortcuts ignore editable controls', () => {
  assert.equal(isEditableShortcutTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableShortcutTarget({ tagName: 'BUTTON' }), true);
  assert.equal(isEditableShortcutTarget({ tagName: 'CANVAS' }), false);
});
