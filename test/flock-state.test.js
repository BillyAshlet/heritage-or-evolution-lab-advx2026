import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// world.js selects a tank preset from this browser-shaped property at import.
if (!('maxTouchPoints' in globalThis.navigator)) {
  Object.defineProperty(globalThis.navigator, 'maxTouchPoints', {
    value: 0,
    configurable: true,
  });
}

const { Flock, BOID_PARAMS } = await import('../src/boids.js');
const { ENERGY_PARAMS, PANIC_PARAMS, TRAITS } =
  await import('../src/evolution-model.js');

function withParams(fn) {
  const boidBefore = { ...BOID_PARAMS };
  const energyBefore = { ...ENERGY_PARAMS };
  const panicBefore = { ...PANIC_PARAMS };
  const traitsBefore = { ...TRAITS };
  const restore = (target, before) => {
    for (const key of Object.keys(target)) {
      if (!(key in before)) delete target[key];
    }
    Object.assign(target, before);
  };
  try {
    return fn();
  } finally {
    restore(BOID_PARAMS, boidBefore);
    restore(ENERGY_PARAMS, energyBefore);
    restore(PANIC_PARAMS, panicBefore);
    restore(TRAITS, traitsBefore);
  }
}

function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('panic alarms propagate at most one neighbor hop per physics step', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 3;
    BOID_PARAMS.perceptionFOV = 360;
    PANIC_PARAMS.signalRadius = 0.13;
    PANIC_PARAMS.signalThreshold = 0.1;
    PANIC_PARAMS.senseTime = 0;

    const world = { systems: [] };
    const scene = new THREE.Scene();
    const flock = new Flock(world, scene);

    for (let i = 0; i < 3; i++) {
      flock.positions[i].set(i * 0.08, 0, 0);
      flock.velocities[i].set(0, 0, BOID_PARAMS.cruiseSpeed);
    }
    flock.startleOne(0);

    flock.step(1 / 60);
    assert.ok(flock.alarm[0] > 0);
    assert.ok(flock.alarm[1] > 0.9);
    assert.equal(flock.alarm[2], 0);

    flock.step(1 / 60);
    assert.ok(flock.alarm[2] > 0.9);
    flock.dispose();
  }));

test('panic heading stays dominant among many calm alignment neighbors', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 14;
    BOID_PARAMS.perceptionFOV = 360;
    BOID_PARAMS.separationWeight = 0;
    BOID_PARAMS.cohesionWeight = 0;
    BOID_PARAMS.avoidanceWeight = 0;
    BOID_PARAMS.centeringWeight = 0;
    ENERGY_PARAMS.drainPerSecond = 0;
    PANIC_PARAMS.signalRadius = 0.2;
    PANIC_PARAMS.emergencyAlignmentWeight = 3;
    PANIC_PARAMS.panicTurnBoost = 0;

    const world = { systems: [] };
    const scene = new THREE.Scene();
    const flock = new Flock(world, scene);

    flock.positions[0].set(0, 0, 0);
    flock.velocities[0].set(0, 0, BOID_PARAMS.cruiseSpeed);
    flock.positions[1].set(0.04, 0, 0);
    flock.velocities[1].set(BOID_PARAMS.cruiseSpeed, 0, 0);
    flock.panic[1] = 1;
    flock.alarm[1] = 1;

    for (let i = 2; i < flock.positions.length; i++) {
      const angle = ((i - 2) / (flock.positions.length - 2)) * Math.PI * 2;
      flock.positions[i].set(
        Math.cos(angle) * 0.08,
        Math.sin(angle) * 0.025,
        Math.sin(angle) * 0.08
      );
      flock.velocities[i].set(-BOID_PARAMS.cruiseSpeed, 0, 0);
    }

    flock.step(1 / 60);

    assert.ok(
      flock.forces[0].x > 0,
      `emergency +X heading was diluted: force.x=${flock.forces[0].x}`
    );
    flock.dispose();
  }));

test('alignmentSourceBoost lets the most urgent alarmed heading win', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 3;
    BOID_PARAMS.perceptionFOV = 360;
    BOID_PARAMS.separationWeight = 0;
    BOID_PARAMS.alignmentWeight = 0;
    BOID_PARAMS.cohesionWeight = 0;
    BOID_PARAMS.avoidanceWeight = 0;
    BOID_PARAMS.centeringWeight = 0;
    ENERGY_PARAMS.drainPerSecond = 0;
    PANIC_PARAMS.signalRadius = 0.2;
    PANIC_PARAMS.emergencyAlignmentWeight = 3;
    PANIC_PARAMS.panicTurnBoost = 0;

    const simulate = (sourceBoost) => {
      PANIC_PARAMS.alignmentSourceBoost = sourceBoost;
      const world = { systems: [] };
      const scene = new THREE.Scene();
      const flock = new Flock(world, scene);

      flock.positions[0].set(0, 0, 0);
      flock.velocities[0].set(0, BOID_PARAMS.cruiseSpeed, 0);
      flock.positions[1].set(0.04, 0, 0);
      flock.velocities[1].set(BOID_PARAMS.cruiseSpeed, 0, 0);
      flock.panic[1] = flock.alarm[1] = 1;
      flock.positions[2].set(-0.04, 0, 0);
      flock.velocities[2].set(0, 0, BOID_PARAMS.cruiseSpeed);
      flock.panic[2] = flock.alarm[2] = 0.5;

      flock.step(1 / 60);
      const x = flock.forces[0].x;
      flock.dispose();
      return x;
    };

    const equalVote = simulate(0);
    const urgentVote = simulate(10);
    assert.ok(
      urgentVote > equalVote * 1.08,
      `urgent source did not gain directional influence: ${urgentVote} vs ${equalVote}`
    );
  }));

test('panicTurnBoost increases the receiver turn cap', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 2;
    BOID_PARAMS.perceptionFOV = 360;
    BOID_PARAMS.separationWeight = 0;
    BOID_PARAMS.alignmentWeight = 0;
    BOID_PARAMS.cohesionWeight = 0;
    BOID_PARAMS.avoidanceWeight = 0;
    BOID_PARAMS.centeringWeight = 0;
    BOID_PARAMS.turnSpeed = 0.5;
    ENERGY_PARAMS.drainPerSecond = 0;
    PANIC_PARAMS.signalRadius = 0.2;
    PANIC_PARAMS.emergencyAlignmentWeight = 20;

    const simulate = (turnBoost) => {
      PANIC_PARAMS.panicTurnBoost = turnBoost;
      const world = { systems: [] };
      const scene = new THREE.Scene();
      const flock = new Flock(world, scene);
      flock.positions[0].set(0, 0, 0);
      flock.velocities[0].set(0, 0, BOID_PARAMS.cruiseSpeed);
      flock.positions[1].set(0.04, 0, 0);
      flock.velocities[1].set(BOID_PARAMS.cruiseSpeed, 0, 0);
      flock.panic[1] = 1;
      flock.alarm[1] = 1;

      flock.step(0.1);
      const turn = new THREE.Vector3(0, 0, 1).angleTo(
        flock.velocities[0].clone().normalize()
      );
      flock.dispose();
      return turn;
    };

    const baseline = simulate(0);
    const boosted = simulate(3);
    assert.ok(
      boosted > baseline * 2,
      `expected boosted turn >2x baseline, got ${boosted} vs ${baseline}`
    );
  }));

test('each fish flees its nearest active predator agent with singular fallback', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 1;
    BOID_PARAMS.separationWeight = 0;
    BOID_PARAMS.alignmentWeight = 0;
    BOID_PARAMS.cohesionWeight = 0;
    BOID_PARAMS.avoidanceWeight = 0;
    BOID_PARAMS.centeringWeight = 0;
    ENERGY_PARAMS.drainPerSecond = 0;
    PANIC_PARAMS.alertRadius = 0.5;
    PANIC_PARAMS.panicRadius = 0.05;

    const world = { systems: [] };
    const scene = new THREE.Scene();
    const flock = new Flock(world, scene);
    flock.positions[0].set(0, 0, 0);
    flock.velocities[0].set(0, 0, BOID_PARAMS.cruiseSpeed);

    const inactiveClosest = {
      active: false,
      position: new THREE.Vector3(0.01, 0, 0),
      velocity: new THREE.Vector3(),
    };
    const far = {
      active: true,
      position: new THREE.Vector3(-0.3, 0, 0),
      velocity: new THREE.Vector3(),
    };
    const near = {
      active: true,
      position: new THREE.Vector3(0.1, 0, 0),
      velocity: new THREE.Vector3(),
    };
    flock.setPredator({
      params: { enabled: true },
      agents: [inactiveClosest, far, near],
    });

    flock.step(1 / 60);
    assert.equal(flock._threatAgent[0], near);
    assert.ok(flock.directThreat[0] > 0);
    assert.ok(
      flock.forces[0].x < 0,
      `fish did not flee away from nearest +X predator: ${flock.forces[0].x}`
    );

    const singular = {
      params: { enabled: true },
      position: new THREE.Vector3(0.1, 0, 0),
      velocity: new THREE.Vector3(),
    };
    flock.setPredator(singular);
    flock.step(1 / 60);
    assert.equal(flock._threatAgent[0], singular);
    assert.ok(flock.directThreat[0] > 0);

    // A pack manager with count=0 deliberately exposes an empty agents
    // array. Do not fall back to its compatibility getters and invent a
    // phantom predator at the origin.
    flock.setPredator({
      params: { enabled: true },
      agents: [],
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(),
    });
    flock.step(1 / 60);
    assert.equal(flock._threatAgent[0], null);
    assert.equal(flock.directThreat[0], 0);
    flock.dispose();
  }));

test('kill hides the fish instance immediately for same-step capture VFX', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 1;
    const world = { systems: [] };
    const scene = new THREE.Scene();
    const flock = new Flock(world, scene);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrixVersion = flock.mesh.instanceMatrix.version;

    assert.equal(flock.kill(0, 'eaten'), true);
    flock.mesh.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);

    assert.equal(scale.lengthSq(), 0);
    assert.ok(flock.mesh.instanceMatrix.version > matrixVersion);
    flock.dispose();
  }));

test('live stamina tuning preserves current energy ratio', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 2;
    const world = { systems: [] };
    const scene = new THREE.Scene();
    const flock = new Flock(world, scene);

    const oldCapacity = flock.derived.energyCapacity;
    flock.energy[0] = oldCapacity * 0.4;
    flock.tireOne(1, 0.08);
    assert.ok(
      Math.abs(flock.energy[1] / oldCapacity - 0.08) < 1e-6
    );
    TRAITS.stamina = 100;
    flock.step(1 / 60);

    const ratio = flock.energy[0] / flock.derived.energyCapacity;
    // One step consumes a tiny amount after the capacity-preserving rescale.
    assert.ok(ratio < 0.4);
    assert.ok(ratio > 0.39);
    flock.dispose();
  }));

test('same initial school settles tighter when small and wider when large', () =>
  withParams(() => {
    BOID_PARAMS.fishCount = 36;
    ENERGY_PARAMS.drainPerSecond = 0;

    const simulate = (size) => {
      TRAITS.size = size;
      const world = { systems: [] };
      const scene = new THREE.Scene();
      const flock = new Flock(world, scene);
      const random = seededRandom(3);

      for (let i = 0; i < flock.positions.length; i++) {
        flock.positions[i].set(
          (random() * 2 - 1) * 0.55,
          (random() * 2 - 1) * 0.28,
          (random() * 2 - 1) * 0.22
        );
        const yaw = (random() - 0.5) * 0.8;
        flock.velocities[i]
          .set(Math.sin(yaw), (random() - 0.5) * 0.08, Math.cos(yaw))
          .normalize()
          .multiplyScalar(0.23);
      }

      for (let step = 0; step < 1200; step++) flock.step(1 / 60);
      const metrics = flock.metrics();
      flock.dispose();
      return metrics;
    };

    const small = simulate(20);
    const medium = simulate(50);
    const large = simulate(80);

    assert.ok(
      small.medianNearestNeighbor < medium.medianNearestNeighbor
    );
    assert.ok(
      medium.medianNearestNeighbor < large.medianNearestNeighbor
    );
    assert.ok(small.radiusOfGyration < medium.radiusOfGyration);
    assert.ok(medium.radiusOfGyration < large.radiusOfGyration);
  }));
