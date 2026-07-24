import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  SeededRng,
  SpatialHash3D,
  analyzeCascadeSeries,
  captureRadius,
  deriveExperiment,
  effectiveMaxSpeed,
  isRespawnCandidate,
  perPredatorCooldown,
  relationBetween,
  relationForRatio,
  visualLength,
} from './experiment-model.js';
import { createDefaultConfig } from './experiment-config.js';
import { ExperimentSimulation } from './experiment-simulation.js';

function smallSimulation(mode = 'cascade', seed = 1001) {
  const config = createDefaultConfig();
  config.runtime.mode = mode;
  config.runtime.seed = seed;
  config.physics.enabled = false;
  config.schools[0].count = 6;
  config.schools[1].count = 4;
  config.schools[2].count = 2;
  config.schools[0].targetNeighbors = 3;
  config.schools[1].targetNeighbors = 2;
  config.schools[2].targetNeighbors = 1;
  const neutralField = {
    query: () => ({ clearance: 1, gradient: [0, 0, 0] }),
  };
  const simulation = new ExperimentSimulation({
    scene: new THREE.Scene(),
    config,
    distanceField: neutralField,
    physics: null,
  });
  simulation.updateMesh = () => {};
  return simulation;
}

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

test('direct threat is proximity-driven even when pursuit target selection loses', () => {
  const simulation = smallSimulation();
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.sameNeighbors[prey] = 5;
  simulation.targetIsolation[predator] = 0;
  simulation.targetDistance2[predator] = 0;
  simulation.pursuitTargets[predator] = -1;
  simulation._directedRelation(predator, prey, 0.01, 0, 0, 0.01, 0.0001);
  assert.equal(simulation.pursuitTargets[predator], -1);
  assert.equal(simulation.threatCounts[prey], 1);
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

test('cascade mode cannot capture or schedule respawn', () => {
  const simulation = smallSimulation('cascade');
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.pursuitTargets[predator] = prey;
  simulation.cooldowns[predator] = 0;
  simulation._captureAndRespawn(1 / 60);
  assert.equal(simulation.alive[prey], 1);
  assert.equal(simulation.pendingRespawns.length, 0);
});

test('steady mode captures at visual distance and queues delayed respawn', () => {
  const simulation = smallSimulation('steady');
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.pursuitTargets[predator] = prey;
  simulation.cooldowns[predator] = 0;
  simulation._captureAndRespawn(1 / 60);
  assert.equal(simulation.alive[prey], 0);
  assert.equal(simulation.pendingRespawns.length, 1);
  assert.ok(simulation.captureVfx.particles.length > 0);
  assert.equal(
    simulation.pendingRespawns[0].due,
    simulation.elapsed + simulation.config.respawn.delay
  );
});

test('respawn validator enforces edge, predator safety and schoolmate cohesion', () => {
  const config = createDefaultConfig();
  config.schools[0].count = 2;
  config.schools[1].count = 1;
  config.schools[2].count = 1;
  const derived = deriveExperiment(config);
  const positions = new Float32Array([
    1.45, 0, 0,
    0, 0, 0,
    0, 0, 0,
    -1.4, 0, 0,
  ]);
  const alive = new Uint8Array([1, 0, 1, 1]);
  const schoolIds = new Uint16Array([0, 0, 1, 2]);
  assert.equal(
    isRespawnCandidate({
      point: [1.44, 0, 0],
      schoolIndex: 0,
      config,
      derived,
      positions,
      alive,
      schoolIds,
      obstacleClearance: 0.2,
      rigidBodyClearance: 0.2,
    }),
    true
  );
  positions[6] = 1.44;
  assert.equal(
    isRespawnCandidate({
      point: [1.44, 0, 0],
      schoolIndex: 0,
      config,
      derived,
      positions,
      alive,
      schoolIds,
      obstacleClearance: 0.2,
      rigidBodyClearance: 0.2,
    }),
    false
  );
  assert.equal(
    isRespawnCandidate({
      point: [0, 0, 0],
      schoolIndex: 0,
      config,
      derived,
      positions,
      alive,
      schoolIds,
      obstacleClearance: 0.2,
      rigidBodyClearance: 0.2,
    }),
    false
  );
});

test('seeded RNG and initial simulation state are reproducible', () => {
  const a = smallSimulation('cascade', 9981);
  const b = smallSimulation('cascade', 9981);
  const c = smallSimulation('cascade', 9982);
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.velocities], [...b.velocities]);
  assert.notDeepEqual([...a.positions], [...c.positions]);
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
