import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultConfig } from './experiment-config.js';
import { ExperimentSimulation } from './experiment-simulation.js';

function smallSimulation(mode = 'steady', seed = 1001, withScene = false) {
  const config = createDefaultConfig();
  config.runtime.mode = mode;
  config.runtime.project = mode === 'ecology' ? 'ecology' : 'aquarium';
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
  const school = simulation.metrics().population[0];
  assert.equal(simulation.mesh, null);
  assert.equal(simulation.captureVfx, null);
  assert.equal(school.cohesionRadius, school.neighborRadius);
  // Classic boids proportions: alignment neighborhood is wider than separation.
  assert.ok(school.separationRadius < school.alignmentRadius);
  assert.ok(school.alignmentRadius < school.cohesionRadius);
  simulation._advance(1 / 60);
  assert.ok(simulation.elapsed > 0);
});

test('configuration and runtime expose no replenishment mechanism', () => {
  const config = createDefaultConfig();
  const simulation = smallSimulation('steady');
  const metrics = simulation.metrics();
  assert.equal('respawn' in config, false);
  assert.equal('pendingRespawns' in simulation, false);
  assert.equal('respawned' in metrics, false);
  assert.equal('queuedRespawns' in metrics, false);
});

test('simulation exposes no removed cascade runtime surface', () => {
  const simulation = smallSimulation();
  const metrics = simulation.metrics();
  assert.equal('probe' in simulation, false);
  assert.equal('releaseHolding' in simulation, false);
  assert.equal('runBatch' in simulation, false);
  assert.equal('cascade' in metrics, false);
  assert.equal('released' in metrics, false);
});

test('direct threat is proximity-driven even when pursuit target selection loses', () => {
  const simulation = smallSimulation();
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.sameNeighbors[prey] = 5;
  simulation.targetAlignment[predator] = 2;
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

test('predation uses broad prey cohesion before the smaller burst layer', () => {
  const simulation = smallSimulation();
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  const detection =
    simulation.derived.schools[simulation.schoolIds[predator]]
      .detectionLength;
  const burstRadius =
    detection * simulation.config.relations.burstRadiusFactor;
  const distance = (detection + burstRadius) / 2;
  simulation.positions.fill(0);
  simulation.positions[prey * 3] = distance;
  simulation.velocities[predator * 3] = 1;
  simulation._directedRelation(
    predator,
    prey,
    distance,
    0,
    0,
    distance,
    distance * distance
  );
  assert.equal(simulation.predationCounts[predator], 1);
  assert.equal(simulation.pursuitTargets[predator], -1);
});

test('predators outside local hunt radius remain ordinary boids', () => {
  const simulation = smallSimulation();
  simulation.config.locomotion.boundaryWeight = 0;
  simulation.config.locomotion.avoidanceWeight = 0;
  simulation.config.locomotion.wanderWeight = 0;
  // Keep school-sense from reaching across the staged gap; this test isolates
  // the local burst/pursuit layer, not the long-range school approach layer.
  simulation.config.relations.schoolSenseFactor = 1;
  simulation.config.relations.pursuitWeight = 0;
  simulation.config.relations.burstWeight = 0;
  for (const school of simulation.config.schools) {
    school.separationWeight = 0;
    school.alignmentWeight = 0;
    school.cohesionWeight = 0;
  }
  for (let index = 0; index < simulation.count; index += 1) {
    const schoolIndex = simulation.schoolIds[index];
    simulation.positions[index * 3] =
      schoolIndex === 0 ? 1 : schoolIndex === 1 ? -1 : 0;
    simulation.positions[index * 3 + 1] = 0;
    simulation.positions[index * 3 + 2] = 0;
    simulation.velocities[index * 3] = 0;
    simulation.velocities[index * 3 + 1] = 0;
    simulation.velocities[index * 3 + 2] =
      simulation.config.schools[schoolIndex].cruiseSpeed;
  }
  simulation._advance(1 / 60);
  const predator = simulation.schoolRanges[1].start;
  assert.ok(Math.abs(simulation.velocities[predator * 3]) < 1e-8);
  assert.equal(simulation.predationCounts[predator], 0);
  assert.equal(simulation.pursuitTargets[predator], -1);
  assert.equal(simulation.threatCounts[0], 0);
  assert.equal('schoolCenters' in simulation, false);
});

test('burst target prefers the prey closest to the current heading', () => {
  const simulation = smallSimulation();
  const forwardPrey = 0;
  const nearerSidePrey = 1;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.velocities.fill(0);
  simulation.velocities[predator * 3] = 1;
  simulation._directedRelation(
    predator,
    nearerSidePrey,
    0,
    0.01,
    0,
    0.01,
    0.0001
  );
  simulation._directedRelation(
    predator,
    forwardPrey,
    0.02,
    0,
    0,
    0.02,
    0.0004
  );
  assert.equal(simulation.pursuitTargets[predator], forwardPrey);
  assert.equal(simulation.locomotionStates[predator], 0);
  assert.equal('stamina' in simulation, false);
  assert.equal('stamina' in simulation.fish(predator), false);
});

test('predation mode captures at visual distance and death stays permanent', () => {
  const simulation = smallSimulation('steady', 1001, true);
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.pursuitTargets[predator] = prey;
  simulation.cooldowns[predator] = 0;
  simulation._capture(1 / 60);
  assert.equal(simulation.alive[prey], 0);
  assert.ok(simulation.captureVfx.particles.length > 0);
  assert.equal('pendingRespawns' in simulation, false);
  simulation.elapsed += 30;
  simulation._capture(30);
  assert.equal(simulation.alive[prey], 0);
});

test('seeded initial simulation state is reproducible', () => {
  const a = smallSimulation('steady', 9981);
  const b = smallSimulation('steady', 9981);
  const c = smallSimulation('steady', 9982);
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.velocities], [...b.velocities]);
  assert.notDeepEqual([...a.positions], [...c.positions]);
});

test('random spawn scatters fish across the tank instead of school clusters', () => {
  const simulation = smallSimulation('steady', 4242);
  // Default production mode is pods; this test isolates pure random scatter.
  simulation.config.runtime.spawnMode = 'random';
  simulation.reset(4242);
  assert.equal(simulation.config.runtime.spawnMode, 'random');
  const halfW = simulation.config.tank.width / 2;
  const xs = [];
  for (let i = 0; i < simulation.count; i += 1) {
    xs.push(simulation.positions[i * 3]);
  }
  const spread = Math.max(...xs) - Math.min(...xs);
  assert.ok(spread > halfW, `expected wide random spread, got ${spread}`);

  const clustered = smallSimulation('steady', 4242);
  clustered.config.runtime.spawnMode = 'cluster';
  clustered.reset(4242);
  const school = clustered.config.schools[0];
  const centerX = school.spawnRegion.centerX * clustered.config.tank.width;
  let maxDist = 0;
  const range = clustered.schoolRanges[0];
  for (let i = range.start; i < range.end; i += 1) {
    const dx = clustered.positions[i * 3] - centerX;
    const dy = clustered.positions[i * 3 + 1];
    const dz = clustered.positions[i * 3 + 2];
    maxDist = Math.max(maxDist, Math.hypot(dx, dy, dz));
  }
  assert.ok(
    maxDist <= school.spawnRegion.radius + 1e-6,
    `cluster spawn escaped radius: ${maxDist}`
  );
});

test('ecology capture restores predator energy', () => {
  const simulation = smallSimulation('ecology');
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions.fill(0);
  simulation.energy[predator] = 0.1;
  simulation.pursuitTargets[predator] = prey;
  simulation.cooldowns[predator] = 0;
  simulation._updateChaseTelemetry(1 / 60);
  simulation.elapsed = 1;
  simulation._capture(1 / 60);
  assert.equal(simulation.alive[prey], 0);
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
  if (simulation.captureVfx) {
    assert.ok(
      simulation.captureVfx.particles.some((p) => p.style === 'starvation')
    );
  }

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


test('aquarium stamina drains without ecology winner freeze', () => {
  const simulation = smallSimulation('steady');
  simulation.config.ecology.enabled = true;
  simulation.config.plankton.enabled = false;
  simulation.energy[0] = 0.0001;
  simulation._updateEcology(1);
  assert.equal(simulation.alive[0], 0);
  assert.equal(simulation.deathCounts[0].starved, 1);
  for (let schoolIndex = 1; schoolIndex < 3; schoolIndex += 1) {
    const range = simulation.schoolRanges[schoolIndex];
    simulation.alive.fill(0, range.start, range.end);
  }
  simulation._updateEcology(0);
  assert.equal(simulation.ecologyStatus.state, 'running');
  const elapsed = simulation.elapsed;
  simulation._advance(1 / 60);
  assert.ok(simulation.elapsed > elapsed);
});


test('low energy blocks burst sprint', () => {
  const simulation = smallSimulation('steady');
  simulation.config.ecology.enabled = true;
  simulation.config.ecology.minBurstEnergyRatio = 1 / 3;
  const predator = simulation.schoolRanges[1].start;
  const prey = 0;
  simulation.pursuitTargets[predator] = prey;
  simulation.energy[predator] =
    simulation.config.ecology.energyCapacity * 0.2;
  assert.equal(simulation._canBurst(predator), false);
  assert.equal(
    simulation._movementState(predator, prey, false),
    'cruise'
  );
  simulation.energy[predator] =
    simulation.config.ecology.energyCapacity * 0.5;
  assert.equal(simulation._canBurst(predator), true);
  assert.equal(
    simulation._movementState(predator, prey, false),
    'burst'
  );
});


test('carrion foraging restores energy from starvation debris', () => {
  const simulation = smallSimulation('steady', 1001, true);
  simulation.config.ecology.enabled = true;
  simulation.config.ecology.carrionEnergy = 0.3;
  simulation.config.ecology.carrionRadius = 1;
  simulation.config.schools[0].grazeRate = 1;
  simulation.energy[0] = 0.1;
  const floorY =
    -simulation.config.tank.height / 2 + simulation.config.tank.wallMargin;
  simulation.captureVfx.emitStarvation(
    new THREE.Vector3(
      simulation.positions[0],
      simulation.positions[1],
      simulation.positions[2]
    ),
    { floorY }
  );
  // force all fragments visible
  for (const particle of simulation.captureVfx.particles) particle.age = 0.1;
  const before = simulation.energy[0];
  // guarantee graze attempt succeeds by high rate and multiple steps
  for (let i = 0; i < 20; i += 1) simulation._updateEcology(0.25);
  assert.ok(simulation.energy[0] > before);
  assert.ok(simulation.metrics().ecology.plankton.consumed > 0);
});
