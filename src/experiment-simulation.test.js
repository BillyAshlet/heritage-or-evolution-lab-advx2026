import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDefaultConfig } from './experiment-config.js';
import {
  captureSpeedFactor,
  effectiveSchoolCaptureRate,
  perPredatorCooldown,
} from './experiment-model.js';
import { ExperimentSimulation } from './experiment-simulation.js';
import { createTutorialConfig, T1_SPEC } from './tutorial-mode.js';

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

test('locomotion preview moves fish without advancing gameplay state', () => {
  const simulation = smallSimulation('steady', 7342);
  const prey = 0;
  const predator = simulation.schoolRanges[1].start;
  simulation.positions[prey * 3] = 0;
  simulation.positions[prey * 3 + 1] = 0;
  simulation.positions[prey * 3 + 2] = 0;
  simulation.positions[predator * 3] = 0.001;
  simulation.positions[predator * 3 + 1] = 0;
  simulation.positions[predator * 3 + 2] = 0;
  simulation.energy[prey] = 0.0001;
  simulation.cooldowns[predator] = 0;

  const before = {
    positions: Array.from(simulation.positions),
    energy: Array.from(simulation.energy),
    alive: Array.from(simulation.alive),
    cooldowns: Array.from(simulation.cooldowns),
    deaths: structuredClone(simulation.deathCounts),
    planktonLevel: simulation.planktonLevel,
    planktonConsumed: simulation.planktonConsumed,
    captures: simulation.metricsState.captures,
  };

  simulation.setLocomotionPreview(true);
  for (let frame = 0; frame < 120; frame += 1) {
    simulation.step(1 / 60);
  }

  assert.ok(
    simulation.positions.some(
      (value, index) => Math.abs(value - before.positions[index]) > 1e-6
    )
  );
  assert.equal(simulation.elapsed, 0);
  assert.deepEqual(Array.from(simulation.energy), before.energy);
  assert.deepEqual(Array.from(simulation.alive), before.alive);
  assert.deepEqual(Array.from(simulation.cooldowns), before.cooldowns);
  assert.deepEqual(simulation.deathCounts, before.deaths);
  assert.equal(simulation.planktonLevel, before.planktonLevel);
  assert.equal(simulation.planktonConsumed, before.planktonConsumed);
  assert.equal(simulation.metricsState.captures, before.captures);
  assert.ok(simulation.panic.every((value) => value === 0));
  assert.ok(simulation.alarm.every((value) => value === 0));
  assert.ok(simulation.pursuitTargets.every((value) => value === -1));
  assert.ok(simulation.locomotionStates.every((value) => value === 0));

  const visiblePositions = Array.from(simulation.positions);
  const visibleVelocities = Array.from(simulation.velocities);
  simulation.beginGameplayFromPreview();
  assert.equal(simulation.locomotionPreview, false);
  assert.deepEqual(Array.from(simulation.positions), visiblePositions);
  assert.deepEqual(Array.from(simulation.velocities), visibleVelocities);
  assert.equal(simulation.elapsed, 0);
  simulation.step(1 / 60);
  assert.ok(simulation.elapsed > 0);
});

test('gameplay start canonicalizes relation hysteresis and final cooldowns', () => {
  const simulation = smallSimulation('steady', 9917);
  const actorSchoolIndex = 1;
  const targetSchoolIndex = 0;
  const actorRange = simulation.schoolRanges[actorSchoolIndex];
  const actorIndex = actorRange.start;
  const peerConfig = structuredClone(simulation.config);
  const target = peerConfig.schools[targetSchoolIndex];
  const actor = peerConfig.schools[actorSchoolIndex];
  actor.size =
    target.size *
    (peerConfig.relations.k - peerConfig.relations.hysteresis / 2);

  // The prior pursuit relation keeps the live preview inside hysteresis.
  simulation.setConfig(peerConfig, 'live');
  assert.equal(
    simulation.relationMatrix[actorSchoolIndex][targetSchoolIndex],
    'pursuit'
  );
  simulation.beginGameplayFromPreview();
  assert.equal(
    simulation.relationMatrix[actorSchoolIndex][targetSchoolIndex],
    'peer'
  );
  assert.equal(simulation.cooldowns[actorIndex], Infinity);

  const pursuitConfig = structuredClone(peerConfig);
  const pursuitActor = pursuitConfig.schools[actorSchoolIndex];
  pursuitActor.size =
    target.size * (pursuitConfig.relations.k + 0.05);
  pursuitActor.cruiseSpeed *= 1.4;
  pursuitActor.maxSpeed *= 1.4;
  simulation.setConfig(pursuitConfig, 'live');
  simulation.beginGameplayFromPreview();

  const period = perPredatorCooldown(
    actorRange.end - actorRange.start,
    effectiveSchoolCaptureRate(pursuitConfig, pursuitActor),
    captureSpeedFactor(pursuitConfig, pursuitActor)
  );
  assert.ok(Number.isFinite(simulation.cooldowns[actorIndex]));
  assert.ok(
    Math.abs(
      simulation.cooldowns[actorIndex] -
        simulation.initialCooldownPhases[actorIndex] * period
    ) < 1e-5
  );
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

test('initial, post-capture and metrics cooldowns share school speed and capture multipliers', () => {
  const simulation = smallSimulation('steady', 1001);
  const mediumSchoolIndex = 1;
  const medium = simulation.config.schools[mediumSchoolIndex];
  const range = simulation.schoolRanges[mediumSchoolIndex];
  const initialCooldowns = Array.from(
    simulation.cooldowns.slice(range.start, range.end)
  );

  medium.cruiseSpeed =
    simulation.config.capture.referenceCruiseSpeed * 2;
  medium.captureRateMultiplier = 2;
  simulation.reset(1001);
  const scaledInitialCooldowns = Array.from(
    simulation.cooldowns.slice(range.start, range.end)
  );
  for (let index = 0; index < initialCooldowns.length; index += 1) {
    assert.ok(
      Math.abs(
        scaledInitialCooldowns[index] - initialCooldowns[index] / 4
      ) < 1e-6
    );
  }

  const prey = 0;
  const predator = range.start;
  simulation.positions.fill(0);
  simulation.pursuitTargets[predator] = prey;
  simulation.cooldowns[predator] = 0;
  simulation._capture(1 / 60);
  const expected = perPredatorCooldown(
    simulation._activeSchoolCount(mediumSchoolIndex),
    effectiveSchoolCaptureRate(simulation.config, medium),
    captureSpeedFactor(simulation.config, medium)
  );
  assert.ok(Math.abs(simulation.cooldowns[predator] - expected) < 1e-6);
  const pair = simulation
    .metrics()
    .predatorPairs.find(
      (item) => item.actor === 'medium' && item.target === 'small'
    );
  assert.ok(Math.abs(pair.perPredatorCooldown - expected) < 1e-12);
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

test('feeding recovery is amplified and shares 40 percent with living schoolmates', () => {
  const simulation = smallSimulation('steady', 20260725);
  const schoolRange = simulation.schoolRanges[0];
  const eater = schoolRange.start;
  const peer = eater + 1;
  simulation.config.ecology.forageEnergyMultiplier = 2.2;
  simulation.config.ecology.energyShareFraction = 0.4;
  simulation.config.ecology.planktonEnergy = 0.06;
  simulation.config.plankton.energyConversion = 1;
  simulation.config.plankton.halfSaturationFraction = 0;
  simulation.config.ecology.grazeHungerRatio = 0.2;
  simulation.config.ecology.basalRate = 0;
  simulation.config.ecology.burstMetabolicRate = 0;
  simulation.config.schools[0].grazeRate = 1;
  simulation.energy.fill(1);
  simulation.energy[eater] = 0.1;
  simulation.energy[peer] = 0.3;
  simulation.rng.next = () => 0;

  simulation._updateEcology(0.25);

  const gain = 0.06 * 2.2;
  const sharedPerFish =
    (gain * 0.4) / (schoolRange.end - schoolRange.start);
  assert.ok(
    Math.abs(
      simulation.energy[eater] -
        (0.1 + gain * 0.6 + sharedPerFish)
    ) < 1e-6
  );
  assert.ok(
    Math.abs(simulation.energy[peer] - (0.3 + sharedPerFish)) < 1e-6
  );
});

test('plankton seed stock cannot become frame-rate-dependent free food', () => {
  const simulation = smallSimulation('steady', 20260726);
  const eater = simulation.schoolRanges[0].start;
  simulation.config.ecology.basalRate = 0;
  simulation.config.ecology.burstMetabolicRate = 0;
  simulation.config.ecology.grazeHungerRatio = 0.2;
  simulation.config.plankton.growthRate = 0;
  simulation.config.schools[0].grazeRate = 1;
  simulation.energy.fill(1);
  simulation.energy[eater] = 0.1;
  simulation.rng.next = () => 0;
  const floor =
    simulation.config.plankton.capacity *
    simulation.config.plankton.minFraction;
  simulation.planktonLevel = floor;
  const consumedBefore = simulation.planktonConsumed;

  for (let frame = 0; frame < 120; frame += 1) {
    simulation._updateEcology(1 / 60);
  }

  assert.ok(Math.abs(simulation.energy[eater] - 0.1) < 1e-7);
  assert.equal(simulation.planktonLevel, floor);
  assert.equal(simulation.planktonConsumed, consumedBefore);
});

test('捕食冷却在关系翻转后重新播种（否则出生时是猎物的鱼永远吃不到东西）', () => {
  // 教学关会在运行中翻转捕食关系：拖一下滑块，上一秒被吃、下一秒变成吃。
  // 冷却是出生时按当时关系算的，当时没有猎物的鱼群会被写成 Infinity，
  // 而 Infinity - dt 还是 Infinity，永不过期。曾经的实际表现是：翻转后
  // 追上了、贴到 0.009m、上千帧待在捕食半径内，却每一帧都被冷却挡掉。
  const prey = createTutorialConfig(T1_SPEC, 0.7); // 玩家是猎物
  prey.runtime.randomizeSeed = false;
  prey.runtime.seed = 1001;
  const simulation = new ExperimentSimulation({
    scene: null,
    config: prey,
    distanceField: null,
    physics: null,
  });
  const playerSchool = prey.schools.findIndex((school) => school.id === 'medium');
  const playerFish = [];
  for (let index = 0; index < simulation.count; index += 1) {
    if (simulation.schoolIds[index] === playerSchool) playerFish.push(index);
  }

  assert.ok(
    playerFish.every((index) => !Number.isFinite(simulation.cooldowns[index])),
    '出生时玩家没有猎物，冷却应为 Infinity'
  );

  const predator = createTutorialConfig(T1_SPEC, 1.6); // 翻转成捕食者
  predator.runtime.randomizeSeed = false;
  predator.runtime.seed = 1001;
  simulation.setConfig(predator, 'live');

  assert.ok(
    playerFish.every((index) => Number.isFinite(simulation.cooldowns[index])),
    '翻转成捕食者后冷却必须变成有限值，否则永远无法捕食'
  );
});
