import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEditableShortcutTarget,
  resolveTimeShortcut,
} from './time-shortcuts.js';

test('enter selects 2x and a single space schedules 0.2x', () => {
  assert.equal(
    resolveTimeShortcut({ code: 'Enter', now: 100 }),
    'double-speed'
  );
  assert.equal(
    resolveTimeShortcut({ code: 'Space', now: 100 }),
    'slow-motion'
  );
});

test('second space pauses only when the interval is below 150ms', () => {
  assert.equal(
    resolveTimeShortcut({
      code: 'Space',
      now: 249,
      lastSpaceAt: 100,
      hasPendingSpace: true,
    }),
    'pause'
  );
  assert.equal(
    resolveTimeShortcut({
      code: 'Space',
      now: 250,
      lastSpaceAt: 100,
      hasPendingSpace: true,
    }),
    'slow-motion'
  );
});

test('time shortcuts ignore editable controls', () => {
  assert.equal(isEditableShortcutTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableShortcutTarget({ tagName: 'BUTTON' }), true);
  assert.equal(isEditableShortcutTarget({ tagName: 'CANVAS' }), false);
});
