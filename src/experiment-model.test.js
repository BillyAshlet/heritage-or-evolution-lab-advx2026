import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SeededRng,
  SpatialHash3D,
  analyzePairedCascade,
  analyzeCascadeSeries,
  captureRadius,
  deriveExperiment,
  ecologyOutcome,
  effectiveMaxSpeed,
  effectiveTurnSpeed,
  metabolicRate,
  perPredatorCooldown,
  relationBetween,
  relationForRatio,
  stepPlankton,
  visualLength,
} from './experiment-model.js';
import { createDefaultConfig } from './experiment-config.js';

test('default dynamic radii match the 400/200/40 design values', () => {
  const config = createDefaultConfig();
  const derived = deriveExperiment(config);
  assert.ok(Math.abs(derived.schools[0].neighborRadius - 0.314) < 0.002);
  assert.ok(Math.abs(derived.schools[1].neighborRadius - 0.396) < 0.002);
  assert.ok(Math.abs(derived.schools[2].neighborRadius - 0.426) < 0.002);
  assert.ok(Math.abs(derived.schools[0].detectionLength - 0.2355) < 0.002);
  assert.ok(Math.abs(derived.schools[1].detectionLength - 0.2966) < 0.002);
  assert.ok(Math.abs(derived.schools[2].detectionLength - 0.3196) < 0.002);
});

test('visual-length lower bound prevents dense configurations from tunneling', () => {
  const config = createDefaultConfig();
  config.schools[0].count = 2000;
  config.schools[0].targetNeighbors = 1;
  const derived = deriveExperiment(config).schools[0];
  assert.equal(
    derived.neighborRadius,
    config.perception.minNeighborRadiusFactor *
      visualLength(config.schools[0].size, config.visual)
  );
});

test('spatial hash finds adjacent-cell neighbors and emits each pair once', () => {
  const positions = new Float32Array([
    0.99, 0, 0,
    1.01, 0, 0,
    1.8, 0, 0,
  ]);
  const alive = new Uint8Array([1, 1, 1]);
  const hash = new SpatialHash3D(1).build(positions, alive);
  const pairs = [];
  hash.forEachPair((a, b) => pairs.push(`${a}-${b}`));
  assert.deepEqual(pairs.sort(), ['0-1', '0-2', '1-2']);
  assert.equal(new Set(pairs).size, pairs.length);

  const symmetric = new Float64Array(3);
  hash.forEachPair((a, b) => {
    symmetric[a] -= 1;
    symmetric[b] += 1;
  });
  assert.equal(
    symmetric.reduce((sum, value) => sum + value, 0),
    0
  );
});

test('main project derives predator and prey roles from live body size', () => {
  const config = createDefaultConfig();
  const [small, medium, large] = config.schools;
  assert.equal(relationBetween(medium, small, config.relations), 'pursuit');
  assert.equal(relationBetween(large, medium, config.relations), 'pursuit');
  assert.equal(relationBetween(large, small, config.relations), 'pursuit');
  assert.equal(relationBetween(small, large, config.relations), 'evade');
  assert.equal(relationBetween(small, small, config.relations), 'peer');

  small.size = 3.2;
  assert.equal(relationBetween(small, large, config.relations), 'pursuit');
  assert.equal(relationBetween(large, small, config.relations), 'evade');
  assert.equal(
    relationForRatio(1.3, config.relations, 'pursuit'),
    'pursuit'
  );
  assert.equal(
    relationForRatio(1.2, config.relations, 'pursuit'),
    'peer'
  );
});

test('cascade sub-experiment keeps the explicit trophic window', () => {
  const config = createDefaultConfig();
  config.relations.policy = 'window';
  const [small, medium, large] = config.schools;
  assert.equal(relationBetween(medium, small, config.relations), 'pursuit');
  assert.equal(relationBetween(large, medium, config.relations), 'pursuit');
  assert.equal(relationBetween(large, small, config.relations), 'ignore');
  assert.equal(relationBetween(small, large, config.relations), 'ignore');
});

test('burst, panic speed and visual capture distance are derived', () => {
  const config = createDefaultConfig();
  const [small, medium] = config.schools;
  assert.equal(
    effectiveMaxSpeed(config, medium, 'pursuit'),
    medium.maxSpeed * config.locomotion.burstFactor
  );
  assert.equal(
    effectiveMaxSpeed(config, small, 'evade'),
    small.maxSpeed * config.locomotion.panicSpeedFactor
  );
  assert.equal(
    captureRadius(config, medium, small),
    config.capture.captureLengthFactor *
      (visualLength(medium.size, config.visual) +
        visualLength(small.size, config.visual))
  );
});

test('per-predator independent cooldown converges to target school rate', () => {
  const count = 200;
  const targetRate = 3;
  const cooldown = perPredatorCooldown(count, targetRate);
  assert.ok(Math.abs(count / cooldown - targetRate) < 1e-12);
});

test('seeded RNG is reproducible without importing the rendering engine', () => {
  const rngA = new SeededRng(44);
  const rngB = new SeededRng(44);
  assert.deepEqual(
    Array.from({ length: 20 }, () => rngA.next()),
    Array.from({ length: 20 }, () => rngB.next())
  );
});

test('synthetic cascade series proves ordered peaks, path and attribution', () => {
  const config = createDefaultConfig();
  const baselineSamples = Array.from({ length: 6 }, (_, index) => ({
    time: index * 0.2,
    rogMedium: 0.3,
    rogSmall: 0.3,
    neighborsMedium: 8,
    neighborsSmall: 8,
    mediumAttribution: 0.1,
    attributionSamples: 30,
  }));
  const medium = [0.3, 0.38, 0.48, 0.4, 0.34, 0.32, 0.31, 0.3];
  const small = [0.3, 0.31, 0.33, 0.38, 0.45, 0.5, 0.42, 0.35];
  const eventSamples = medium.map((rogMedium, index) => ({
    time: index * 0.25,
    rogMedium,
    rogSmall: small[index],
    neighborsMedium: 8,
    neighborsSmall: 8,
    mediumAttribution: index >= 3 ? 0.4 : 0.1,
    attributionSamples: 40,
    largeToSmallImpulse: index * 0.3,
    mediumToSmallImpulse: index * 8,
  }));
  const result = analyzeCascadeSeries({
    baselineSamples,
    eventSamples,
    impulseByDirection: {
      largeToSmall: 2,
      mediumToSmall: 50,
    },
    forbidden: { pursuit: 0, directThreat: 0, captures: 0 },
    config,
    tank: config.tank,
  });
  assert.equal(result.passed, true);
  assert.ok(result.peaks.lag >= config.cascadeJudge.minPeakLag);
  assert.ok(
    result.impulseRatio <
      config.cascadeJudge.maxDirectImpulseRatio
  );
  assert.ok(
    result.attributionGain >= config.cascadeJudge.attributionGain
  );
});

test('paired cascade compares release against the same-seed holding control', () => {
  const config = createDefaultConfig();
  const baselineSamples = Array.from({ length: 5 }, (_, index) => ({
    time: index * 0.1,
    rogMedium: 0.4,
    rogSmall: 0.4,
    neighborsMedium: 8,
    neighborsSmall: 8,
  }));
  const controlSamples = Array.from({ length: 8 }, (_, index) => ({
    time: index * 0.25,
    rogMedium: 0.4 + index * 0.01,
    rogSmall: 0.4 + index * 0.012,
  }));
  const eventSamples = controlSamples.map((sample, index) => ({
    ...sample,
    rogMedium:
      sample.rogMedium + [0, 0.02, 0.05, 0.08, 0.06, 0.04, 0.02, 0][index],
    rogSmall:
      sample.rogSmall + [0, 0, 0.01, 0.02, 0.05, 0.08, 0.06, 0.03][index],
  }));
  const result = analyzePairedCascade({
    baselineSamples,
    eventSamples,
    controlSamples,
    forbidden: { pursuit: 0, directThreat: 0, captures: 0 },
    config,
    tank: config.tank,
  });
  assert.equal(result.passed, true);
  assert.ok(
    result.effects.medium >= config.cascadeJudge.pairedMinMediumDelta
  );
  assert.ok(
    result.effects.small >= config.cascadeJudge.pairedMinSmallDelta
  );
  assert.ok(result.peaks.lag >= config.cascadeJudge.minPeakLag);

  const noiseOnly = analyzePairedCascade({
    baselineSamples,
    eventSamples: controlSamples,
    controlSamples,
    forbidden: { pursuit: 0, directThreat: 0, captures: 0 },
    config,
    tank: config.tank,
  });
  assert.equal(noiseOnly.passed, false);
  assert.equal(noiseOnly.effects.small, 0);
});

test('ecology helpers implement logistic food, Kleiber-like drain and terminal outcomes', () => {
  const config = createDefaultConfig();
  const smallRate = metabolicRate(config, config.schools[0]);
  const largeRate = metabolicRate(config, config.schools[2]);
  assert.ok(largeRate < smallRate);
  const resource = stepPlankton({
    level: 300,
    capacity: 600,
    growthRate: 0.12,
    requestedConsumption: 10,
    dt: 1,
  });
  assert.ok(resource.growth > 0);
  assert.equal(resource.consumed, 10);
  assert.deepEqual(ecologyOutcome([3, 0, 0]), {
    state: 'winner',
    winnerIndex: 0,
  });
  assert.deepEqual(ecologyOutcome([0, 0, 0]), {
    state: 'collapse',
    winnerIndex: null,
  });
  assert.equal(ecologyOutcome([3, 2, 0]).state, 'running');
});

test('trait coupling penalizes sustained speed and turning while preserving burst state', () => {
  const config = createDefaultConfig();
  config.traits.enabled = true;
  const small = config.schools[0];
  const large = config.schools[2];
  assert.ok(
    effectiveMaxSpeed(config, large, 'cruise') <
      effectiveMaxSpeed(config, small, 'cruise')
  );
  assert.ok(
    effectiveTurnSpeed(config, large) <
      effectiveTurnSpeed(config, small)
  );
  assert.ok(
    effectiveMaxSpeed(config, large, 'burst') >
      effectiveMaxSpeed(config, large, 'cruise')
  );
});
