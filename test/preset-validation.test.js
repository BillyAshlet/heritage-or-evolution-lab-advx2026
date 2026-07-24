import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRESET_NUMERIC_LIMITS,
  stageTuningPreset,
} from '../src/preset-validation.js';
import {
  CAPTURE_FX_PARAMS,
  ENERGY_PARAMS,
  PANIC_PARAMS,
  PREDATOR_PARAMS,
  TRAITS,
  TRAIT_MAPPING,
} from '../src/evolution-model.js';

if (!('maxTouchPoints' in globalThis.navigator)) {
  Object.defineProperty(globalThis.navigator, 'maxTouchPoints', {
    value: 0,
    configurable: true,
  });
}

const { BOID_PARAMS } = await import('../src/boids.js');

function fixture() {
  const targets = {
    boids: { ...BOID_PARAMS },
    traits: { ...TRAITS },
    mapping: { ...TRAIT_MAPPING },
    energy: { ...ENERGY_PARAMS },
    panic: { ...PANIC_PARAMS },
    predator: { ...PREDATOR_PARAMS },
    captureFx: { ...CAPTURE_FX_PARAMS },
  };
  const defaults = Object.fromEntries(
    Object.entries(targets).map(([name, target]) => [name, { ...target }])
  );
  return { targets, defaults };
}

test('every numeric tuning field has an explicit preset safety bound', () => {
  const { targets } = fixture();
  for (const [groupName, target] of Object.entries(targets)) {
    for (const [key, value] of Object.entries(target)) {
      if (typeof value !== 'number') continue;
      assert.ok(
        PRESET_NUMERIC_LIMITS[groupName]?.[key],
        `missing limits for ${groupName}.${key}`
      );
    }
  }
});

test('preset validation is transactional across groups', () => {
  const { targets, defaults } = fixture();
  const before = structuredClone(targets);
  const result = stageTuningPreset(
    {
      traits: { ...defaults.traits, speed: 80 },
      boids: { ...defaults.boids, angleStep: 0 },
    },
    targets,
    defaults
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /boids\.angleStep/);
  assert.deepEqual(targets, before);
  assert.deepEqual(result.staged, {});
});

test('preset validation rejects non-finite and unsafe structural counts', () => {
  const { targets, defaults } = fixture();
  for (const params of [
    { boids: { ...defaults.boids, maxForce: Infinity } },
    { boids: { ...defaults.boids, fishCount: 10001 } },
    { predator: { ...defaults.predator, count: 1.5 } },
    { predator: { ...defaults.predator, count: 65 } },
    { captureFx: { ...defaults.captureFx, particleCount: 2.5 } },
    { captureFx: { ...defaults.captureFx, particleCount: 25 } },
  ]) {
    const result = stageTuningPreset(params, targets, defaults);
    assert.equal(result.ok, false, JSON.stringify(params));
  }
});

test('older complete groups fill missing fields from current defaults', () => {
  const { targets, defaults } = fixture();
  targets.predator.schoolAttractionWeight = 9;
  const result = stageTuningPreset(
    { predator: { count: 5, enabled: true } },
    targets,
    defaults
  );

  assert.equal(result.ok, true);
  assert.equal(result.staged.predator.count, 5);
  assert.equal(
    result.staged.predator.schoolAttractionWeight,
    defaults.predator.schoolAttractionWeight
  );
});

test('panic and energy invariants fail closed', () => {
  const { targets, defaults } = fixture();
  const reversedThreat = stageTuningPreset(
    {
      panic: {
        ...defaults.panic,
        panicRadius: defaults.panic.alertRadius,
      },
    },
    targets,
    defaults
  );
  const reversedEnergy = stageTuningPreset(
    {
      energy: {
        ...defaults.energy,
        exhaustedAt: defaults.energy.tiredStart,
      },
    },
    targets,
    defaults
  );

  assert.equal(reversedThreat.ok, false);
  assert.equal(reversedEnergy.ok, false);
});

test('unknown fields cannot mutate object prototypes', () => {
  const { targets, defaults } = fixture();
  const payload = JSON.parse(
    '{"boids":{"__proto__":{"polluted":true},"fishCount":42}}'
  );
  const result = stageTuningPreset(payload, targets, defaults);

  assert.equal(result.ok, true);
  assert.equal(result.staged.boids.fishCount, 42);
  assert.equal({}.polluted, undefined);
  assert.ok(result.skipped.includes('boids.__proto__'));
});
