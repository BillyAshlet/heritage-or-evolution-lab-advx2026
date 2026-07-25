import assert from 'node:assert/strict';
import test from 'node:test';
import { LEVEL_SPECS } from './game-mode.js';
import {
  VISITOR_OWNED_SCREENS,
  VISITOR_SCREEN,
  resolveVisitorLevelCopy,
} from './visitor-mode.js';

test('visitor shell never owns gameplay state-machine screens', () => {
  assert.deepEqual(VISITOR_OWNED_SCREENS, [
    VISITOR_SCREEN.TITLE,
    VISITOR_SCREEN.SETTINGS,
    VISITOR_SCREEN.CONCEPT,
    VISITOR_SCREEN.CREDITS,
    VISITOR_SCREEN.CUTSCENE,
    VISITOR_SCREEN.END,
  ]);
  for (const gameplayScreen of [
    'TUNING',
    'RUNNING',
    'VERDICT',
    'INHERIT',
  ]) {
    assert.equal(VISITOR_OWNED_SCREENS.includes(gameplayScreen), false);
  }
});

test('Chinese cutscenes consume the canonical level narrative', () => {
  LEVEL_SPECS.forEach((level, index) => {
    const copy = resolveVisitorLevelCopy(LEVEL_SPECS, index, 'zh');
    assert.equal(copy.title, level.title ?? level.label);
    assert.equal(copy.story, level.story);
    assert.match(copy.cta, /→$/);
  });
});

test('English cutscenes retain teammate-authored localized presentation copy', () => {
  const copy = resolveVisitorLevelCopy(LEVEL_SPECS, 1, 'en');
  assert.equal(
    copy.title,
    'It was the best of times, it was the worst of times',
  );
  assert.match(copy.story, /water has risen/i);
  assert.equal(copy.cta, 'Adjust Traits →');
});
