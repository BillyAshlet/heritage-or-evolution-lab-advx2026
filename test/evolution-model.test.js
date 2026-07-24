import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ENERGY_PARAMS,
  PANIC_PARAMS,
  TRAIT_MAPPING,
  derivePhenotype,
  energyDrainPerSecond,
  energyResponse,
  threatFromDistance,
} from '../src/evolution-model.js';

const BASE = {
  cruiseSpeed: 0.23,
  maxSpeed: 0.46,
  maxForce: 5.2,
  turnSpeed: 2.8,
  separationRadius: 0.1,
  separationWeight: 0.8,
  alignmentRadius: 0.24,
  alignmentWeight: 0.45,
  cohesionRadius: 0.45,
  cohesionWeight: 0.4,
};

test('small fish cluster while large fish claim more personal space', () => {
  const small = derivePhenotype(
    BASE,
    { speed: 50, size: 10, stamina: 50 },
    TRAIT_MAPPING,
    ENERGY_PARAMS
  );
  const large = derivePhenotype(
    BASE,
    { speed: 50, size: 90, stamina: 50 },
    TRAIT_MAPPING,
    ENERGY_PARAMS
  );

  assert.ok(small.bodyScale < large.bodyScale);
  assert.ok(small.separationRadius < large.separationRadius);
  assert.ok(small.separationWeight < large.separationWeight);
  assert.ok(small.alignmentRadius > large.alignmentRadius);
  assert.ok(small.alignmentWeight > large.alignmentWeight);
  assert.ok(small.cohesionRadius > large.cohesionRadius);
  assert.ok(small.cohesionWeight > large.cohesionWeight);
  assert.ok(small.turnSpeed > large.turnSpeed);

  const smallAttractionToRepulsion =
    (small.cohesionRadius * small.cohesionWeight) /
    (small.separationRadius * small.separationWeight);
  const largeAttractionToRepulsion =
    (large.cohesionRadius * large.cohesionWeight) /
    (large.separationRadius * large.separationWeight);
  assert.ok(smallAttractionToRepulsion > largeAttractionToRepulsion);
});

test('genetic stamina changes capacity, not full-energy social response', () => {
  const low = derivePhenotype(BASE, {
    speed: 50,
    size: 50,
    stamina: 0,
  });
  const high = derivePhenotype(BASE, {
    speed: 50,
    size: 50,
    stamina: 100,
  });

  assert.ok(low.energyCapacity < high.energyCapacity);
  // Equal current-energy ratios must produce equal behaviour even when the
  // absolute capacity differs.
  const ratio = 0.4;
  assert.deepEqual(
    energyResponse((low.energyCapacity * ratio) / low.energyCapacity),
    energyResponse((high.energyCapacity * ratio) / high.energyCapacity)
  );
  assert.equal(low.alignmentWeight, high.alignmentWeight);
  assert.equal(low.cohesionWeight, high.cohesionWeight);
});

test('current energy weakens speed, alignment and cohesion monotonically', () => {
  const empty = energyResponse(0);
  const half = energyResponse(0.4);
  const full = energyResponse(1);

  for (const key of ['speed', 'alignment', 'cohesion']) {
    assert.ok(empty[key] < half[key]);
    assert.ok(half[key] <= full[key]);
  }
});

test('predator threat is local and monotonic', () => {
  assert.equal(threatFromDistance(1), 0);
  assert.equal(threatFromDistance(0), 1);
  assert.equal(threatFromDistance(PANIC_PARAMS.alertRadius), 0);
  assert.equal(threatFromDistance(PANIC_PARAMS.panicRadius), 1);
  assert.ok(threatFromDistance(0.16) > threatFromDistance(0.3));
});

test('panic defaults have stable hysteresis and positive time scales', () => {
  assert.ok(PANIC_PARAMS.panicRadius < PANIC_PARAMS.alertRadius);
  assert.ok(PANIC_PARAMS.directOff < PANIC_PARAMS.directOn);
  assert.ok(PANIC_PARAMS.emergencyAlignmentWeight > 0);
  assert.ok(PANIC_PARAMS.panicTurnBoost > 0);
  for (const key of [
    'signalDecayTime',
    'senseTime',
    'holdTime',
    'refractoryTime',
    'riseTime',
    'fallTime',
  ]) {
    assert.ok(PANIC_PARAMS[key] > 0, `${key} must be positive`);
  }
});

test('speed and body size raise the energy drain rate', () => {
  const small = derivePhenotype(BASE, {
    speed: 50,
    size: 0,
    stamina: 50,
  });
  const large = derivePhenotype(BASE, {
    speed: 50,
    size: 100,
    stamina: 50,
  });

  assert.ok(
    energyDrainPerSecond(BASE.cruiseSpeed * 1.5, small) >
      energyDrainPerSecond(BASE.cruiseSpeed, small)
  );
  assert.ok(
    energyDrainPerSecond(BASE.cruiseSpeed, large) >
      energyDrainPerSecond(BASE.cruiseSpeed, small)
  );
});
