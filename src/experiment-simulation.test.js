import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultConfig } from './experiment-config.js';
import { ExperimentSimulation } from './experiment-simulation.js';

function smallSimulation(mode = 'cascade', seed = 1001, withScene = false) {
  const config = createDefaultConfig();
  config.runtime.mode = mode;
  config.runtime.project = mode === 'ecology' ? 'ecology' : 'cascade';
  config.runtime.seed = seed;
  config.physics.enabled = false;
  config.captureVfx.enabled = withScene;
  config.schools[0].count = 6;
  config.schools[1].count = 4;
  config.schools[2].count = 2;
  config.schools[0].targetNeighbors = 3;
  config.schools[1].targetNeighbors = 2;
  config.schools[2].targetNeighbors = 1;
  if (mode === 'ecology') config.traits.enabled = true;
  const neutralField = {
    query: () => ({ clearance: 1, gradient: [0, 0, 0] }),
  };
  return new ExperimentSimulation({
    scene: withScene ? new THREE.Scene() : null,
    config,
    distanceField: neutralField,
    physics: null,
  });
}

test('headless simulation does not require a THREE.Scene adapter', () => {
  const simulation = smallSimulation();
  assert.equal(simulation.mesh, null);
  assert.equal(simulation.captureVfx, null);
  simulation._advance(1 / 60);
  assert.ok(simulation.elapsed > 0);
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
  simulation._directedRelation(
    predator,
    prey,
    0.01,
    0,
    0,
    0.01,
    0.0001
  );
  assert.equal(simulation.pursuitTargets[predator], -1);
  assert.equal(simulation.threatCounts[prey], 1);
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
  const simulation = smallSimulation('steady', 1001, true);
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

test('seeded initial simulation state is reproducible', () => {
  const a = smallSimulation('cascade', 9981);
  const b = smallSimulation('cascade', 9981);
  const c = smallSimulation('cascade', 9982);
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.velocities], [...b.velocities]);
  assert.notDeepEqual([...a.positions], [...c.positions]);
});

test('ecology capture restores predator energy and never queues respawn', () => {
  const simulation = smallSimulation('ecology');
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.energy[predator] = 0.1;
  simulation.pursuitTargets[predator] = prey;
  simulation.cooldowns[predator] = 0;
  simulation._updateChaseTelemetry(1 / 60);
  simulation.elapsed = 1;
  simulation._captureAndRespawn(1 / 60);
  assert.equal(simulation.alive[prey], 0);
  assert.equal(simulation.pendingRespawns.length, 0);
  assert.ok(simulation.energy[predator] > 0.1);
  const pair = simulation
    .metrics()
    .predatorPairs.find(
      (item) => item.actor === 'medium' && item.target === 'small'
    );
  assert.equal(pair.captures, 1);
  assert.equal(pair.chaseStarts, 1);
  assert.equal(pair.averageCaptureChaseSeconds, 1);
});

test('ecology starvation is real death and sole survivor is terminal', () => {
  const simulation = smallSimulation('ecology');
  simulation.config.plankton.enabled = false;
  simulation.energy[0] = 0.0001;
  simulation._updateEcology(1);
  assert.equal(simulation.alive[0], 0);
  assert.equal(simulation.deathCounts[0].starved, 1);
  assert.equal(simulation.pendingRespawns.length, 0);

  for (let schoolIndex = 1; schoolIndex < 3; schoolIndex += 1) {
    const range = simulation.schoolRanges[schoolIndex];
    simulation.alive.fill(0, range.start, range.end);
  }
  simulation._updateEcology(0);
  assert.deepEqual(simulation.ecologyStatus, {
    state: 'winner',
    winnerIndex: 0,
  });
  const elapsed = simulation.elapsed;
  simulation._advance(1);
  assert.equal(simulation.elapsed, elapsed);
});
