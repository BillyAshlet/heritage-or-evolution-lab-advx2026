import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

if (!('maxTouchPoints' in globalThis.navigator)) {
  Object.defineProperty(globalThis.navigator, 'maxTouchPoints', {
    value: 0,
    configurable: true,
  });
}

const { Predator } = await import('../src/predator.js');
const { PREDATOR_PARAMS } = await import('../src/evolution-model.js');

function restoreObject(target, snapshot) {
  for (const key of Object.keys(target)) {
    if (!(key in snapshot)) delete target[key];
  }
  Object.assign(target, snapshot);
}

function withPredatorParams(overrides, fn) {
  const before = { ...PREDATOR_PARAMS };
  Object.assign(PREDATOR_PARAMS, {
    enabled: true,
    captureEnabled: false,
    count: 1,
    cruiseSpeed: 0.4,
    maxSpeed: 0.8,
    maxForce: 4,
    turnSpeed: 100,
    bodyScale: 1.8,
    captureRadius: 0.02,
    captureCooldown: 0,
    targetLeadTime: 0,
    schoolSenseRadius: 0.3,
    schoolAttractionWeight: 0.7,
    targetPursuitWeight: 1.2,
    targetLockTime: 0.8,
    alarmPredatorRadius: 0,
    alarmPredatorWeight: 0,
    detectionLength: 0.32,
    avoidanceWeight: 0,
    predatorSeparationRadius: 0.16,
    predatorSeparationWeight: 1.4,
    ...overrides,
  });
  try {
    return fn();
  } finally {
    restoreObject(PREDATOR_PARAMS, before);
  }
}

function makeFlock(points) {
  const positions = points.map((point) => new THREE.Vector3(...point));
  const velocities = points.map(() => new THREE.Vector3());
  const alive = new Uint8Array(points.length);
  alive.fill(1);
  return {
    positions,
    velocities,
    alive,
    deaths: { eaten: 0, starved: 0 },
    kill(index, reason) {
      if (!this.alive[index]) return false;
      this.alive[index] = 0;
      this.deaths[reason]++;
      return true;
    },
  };
}

function makeHarness(points = []) {
  const world = { systems: [] };
  const scene = new THREE.Scene();
  const flock = makeFlock(points);
  const predator = new Predator(world, scene, flock);
  return { world, scene, flock, predator };
}


test('bite flash peaks on capture then fades within the flash window', async () => {
  const { CAPTURE_FX_PARAMS, PREDATOR_PARAMS } = await import(
    '../src/evolution-model.js'
  );
  const beforeFx = { ...CAPTURE_FX_PARAMS };
  Object.assign(CAPTURE_FX_PARAMS, {
    biteFlashDuration: 0.2,
    biteFlashScaleBoost: 0.5,
    biteFlashSaturationBoost: 0.8,
    biteFlashDarken: 0.2,
  });
  try {
    withPredatorParams(
      {
        count: 1,
        captureEnabled: true,
        cruiseSpeed: 0.8,
        maxSpeed: 0.9,
        maxForce: 0,
        turnSpeed: 0,
        captureRadius: 0.05,
        schoolAttractionWeight: 0,
        targetPursuitWeight: 0,
      },
      () => {
        const { flock, predator } = makeHarness([[0.05, 0, 0]]);
        const agent = predator.agents[0];
        agent.position.set(0, 0, 0);
        agent.velocity.set(0.8, 0, 0);
        assert.equal(agent.biteFlashAge, Infinity);

        predator.step(0.1);
        assert.equal(flock.alive[0], 0);
        assert.equal(agent.biteFlashAge, 0);

        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        const color = new THREE.Color();
        const hsl = { h: 0, s: 0, l: 0 };
        predator.mesh.getMatrixAt(0, matrix);
        matrix.decompose(position, quaternion, scale);
        predator.mesh.getColorAt(0, color);
        color.getHSL(hsl);
        assert.ok(scale.x > PREDATOR_PARAMS.bodyScale);
        assert.ok(hsl.s > 0.35);

        for (let i = 0; i < 12; i++) predator.step(0.02);
        assert.ok(agent.biteFlashAge >= 0.2);
        predator.mesh.getMatrixAt(0, matrix);
        matrix.decompose(position, quaternion, scale);
        assert.ok(Math.abs(scale.x - PREDATOR_PARAMS.bodyScale) < 1e-6);
        predator.dispose();
      }
    );
  } finally {
    Object.assign(CAPTURE_FX_PARAMS, beforeFx);
  }
});

test('Predator manages an instanced pack and preserves first-agent getters', () =>
  withPredatorParams({ count: 3 }, () => {
    const { world, predator } = makeHarness([[0, 0, 0]]);

    assert.equal(predator.agents.length, 3);
    assert.equal(predator.mesh.count, 3);
    assert.equal(predator.position, predator.agents[0].position);
    assert.equal(predator.velocity, predator.agents[0].velocity);
    assert.equal(predator.targetIndex, predator.agents[0].targetIndex);
    assert.ok(world.systems.includes(predator));

    predator.setCount(5);
    assert.equal(PREDATOR_PARAMS.count, 5);
    assert.equal(predator.agents.length, 5);
    assert.equal(predator.mesh.count, 5);

    predator.reset();
    assert.equal(predator.captures, 0);
    assert.ok(predator.agents.every((agent) => agent.targetIndex === -1));

    predator.dispose();
    assert.ok(!world.systems.includes(predator));
    assert.equal(predator.agents.length, 0);
  }));

test('target lock prevents nearest-fish jitter until the lock expires', () =>
  withPredatorParams(
    {
      count: 1,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 1,
      targetLockTime: 0.75,
    },
    () => {
      const { flock, predator } = makeHarness([
        [0.35, 0, 0],
        [0.75, 0, 0],
      ]);
      predator.position.set(0, 0, 0);
      predator.velocity.set(0, 0, 0.4);

      predator.step(0.01);
      assert.equal(predator.targetIndex, 0);

      // Fish 1 cuts much closer, but the active lock must hold fish 0.
      flock.positions[0].set(0.6, 0, 0);
      flock.positions[1].set(0.02, 0, 0);
      predator.step(0.2);
      assert.equal(predator.targetIndex, 0);

      predator.step(0.6);
      assert.equal(predator.targetIndex, 1);
      predator.dispose();
    }
  ));

test('alarm predator acquires the nearest fish inside its small radius', () =>
  withPredatorParams(
    {
      count: 1,
      alarmPredatorRadius: 0.3,
      alarmPredatorWeight: 8,
      schoolAttractionWeight: 40,
      targetPursuitWeight: 40,
      maxForce: 1,
      turnSpeed: 1000,
    },
    () => {
      const { predator } = makeHarness([
        [0.22, 0, 0],
        [0.1, 0, 0],
        [-0.8, 0, 0],
      ]);
      predator.position.set(0, 0, 0);
      predator.velocity.set(0, 0, 0);

      predator.step(0.02);

      assert.equal(predator.agents[0].alarmActive, true);
      assert.equal(predator.targetIndex, 1);
      assert.ok(predator.velocity.x > 0);
      predator.dispose();
    }
  ));

test('alarm target stays locked outside the trigger radius until it dies', () =>
  withPredatorParams(
    {
      count: 1,
      alarmPredatorRadius: 0.25,
      alarmPredatorWeight: 8,
      captureEnabled: false,
    },
    () => {
      const { flock, predator } = makeHarness([
        [0.18, 0, 0],
        [0.1, 0, 0],
      ]);
      predator.position.set(0, 0, 0);
      predator.velocity.set(0, 0, 0);
      predator.step(0.01);
      assert.equal(predator.targetIndex, 1);

      flock.positions[1].set(0.7, 0, 0);
      flock.positions[0].set(0.01, 0, 0);
      predator.step(0.01);
      assert.equal(predator.targetIndex, 1);
      assert.equal(predator.agents[0].alarmActive, true);

      flock.alive[1] = 0;
      predator.step(0.01);
      assert.equal(predator.targetIndex, 0);
      assert.equal(predator.agents[0].alarmActive, true);
      predator.dispose();
    }
  ));

test('alarm strike preempts a macro owner and sends it to another fish', () =>
  withPredatorParams(
    {
      count: 2,
      alarmPredatorRadius: 0.2,
      alarmPredatorWeight: 8,
    },
    () => {
      const { predator } = makeHarness([
        [0.1, 0, 0],
        [-0.4, 0, 0],
      ]);
      const [macroOwner, striker] = predator.agents;
      macroOwner.position.set(-0.8, 0, 0);
      macroOwner.targetIndex = 0;
      macroOwner.targetLockRemaining = 1;
      macroOwner.alarmActive = false;
      striker.position.set(0, 0, 0);
      striker.targetIndex = -1;
      striker.targetLockRemaining = 0;
      striker.alarmActive = false;

      predator._refreshTargets(0);

      assert.equal(striker.alarmActive, true);
      assert.equal(striker.targetIndex, 0);
      assert.equal(macroOwner.alarmActive, false);
      assert.equal(macroOwner.targetIndex, 1);
      predator.dispose();
    }
  ));

test('alarm weight raises the strike acceleration budget above macro maxForce', () =>
  withPredatorParams(
    {
      count: 1,
      alarmPredatorRadius: 1,
      alarmPredatorWeight: 8,
      maxForce: 1,
      turnSpeed: 1000,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 0,
    },
    () => {
      const { predator } = makeHarness([[0.2, 0, 0]]);
      predator.position.set(0, 0, 0);
      predator.velocity.set(0, 0, 0);

      predator.step(0.05);

      assert.ok(predator.velocity.x > 0.2);
      assert.ok(predator.velocity.length() <= PREDATOR_PARAMS.maxSpeed + 1e-9);
      predator.dispose();
    }
  ));

test('alarm weight does not amplify the predator-separation channel', () =>
  withPredatorParams(
    {
      count: 2,
      alarmPredatorRadius: 1,
      maxSpeed: 0.8,
      maxForce: 0.1,
      turnSpeed: 1000,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 0,
      predatorSeparationRadius: 0.2,
      predatorSeparationWeight: 4,
      avoidanceWeight: 0,
    },
    () => {
      const velocityAfterStep = (weight) => {
        PREDATOR_PARAMS.alarmPredatorWeight = weight;
        const { predator } = makeHarness([[0, 0, 0.5]]);
        const [agent, neighbour] = predator.agents;
        agent.position.set(0, 0, 0);
        agent.velocity.set(0, 0, PREDATOR_PARAMS.maxSpeed);
        agent.targetIndex = 0;
        agent.alarmActive = true;
        neighbour.position.set(0.01, 0, 0);
        neighbour.velocity.set(0, 0, PREDATOR_PARAMS.maxSpeed);

        predator._steerAgent(agent, 1, 0.02);
        const result = agent.velocity.clone();
        predator.dispose();
        return result;
      };

      const low = velocityAfterStep(1);
      const high = velocityAfterStep(10);
      assert.ok(low.distanceTo(high) < 1e-9);
    }
  ));

test('school attraction falls back from an empty local radius to global centroid', () =>
  withPredatorParams(
    {
      count: 1,
      schoolSenseRadius: 0.01,
      schoolAttractionWeight: 1,
      targetPursuitWeight: 0,
    },
    () => {
      const { predator } = makeHarness([
        [0.5, 0.1, 0],
        [0.6, -0.1, 0],
      ]);
      predator.position.set(0, 0, 0);
      predator.velocity.set(0, 0, 0.4);

      predator.step(0.1);

      assert.ok(predator.velocity.x > 0);
      predator.dispose();
    }
  ));

test('school attraction weight linearly controls unsaturated lateral acceleration', () =>
  withPredatorParams(
    {
      count: 1,
      schoolSenseRadius: 0.01,
      targetPursuitWeight: 0,
      maxForce: 100,
      turnSpeed: 1000,
      predatorSeparationWeight: 0,
    },
    () => {
      const lateralDelta = (weight) => {
        PREDATOR_PARAMS.schoolAttractionWeight = weight;
        const { predator } = makeHarness([[0.6, 0, 0]]);
        predator.position.set(0, 0, 0);
        predator.velocity.set(0, 0, PREDATOR_PARAMS.cruiseSpeed);

        const before = predator.velocity.x;
        predator.step(0.05);
        const delta = predator.velocity.x - before;
        predator.dispose();
        return delta;
      };

      const low = lateralDelta(0.1);
      const high = lateralDelta(0.8);

      assert.ok(low > 0);
      assert.ok(high > low * 7.5);
      assert.ok(high < low * 8.5);
    }
  ));

test('predator separation pushes overlapping pack members apart', () =>
  withPredatorParams(
    {
      count: 2,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 0,
      predatorSeparationRadius: 0.2,
      predatorSeparationWeight: 3,
    },
    () => {
      const { predator } = makeHarness([]);
      predator.agents[0].position.set(-0.01, 0, 0);
      predator.agents[1].position.set(0.01, 0, 0);
      predator.agents[0].velocity.set(0, 0, 0);
      predator.agents[1].velocity.set(0, 0, 0);

      predator.step(0.05);

      assert.ok(predator.agents[0].velocity.x < 0);
      assert.ok(predator.agents[1].velocity.x > 0);
      predator.dispose();
    }
  ));

test('predator detectionLength alone gates the forward avoidance ray', () =>
  withPredatorParams(
    {
      count: 1,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 0,
      predatorSeparationWeight: 0,
      avoidanceWeight: 2,
    },
    () => {
      const { predator } = makeHarness([]);
      const agent = predator.agents[0];
      const direction = new THREE.Vector3();
      agent.position.set(0.68, 0, 0);
      agent.velocity.set(0.4, 0, 0);

      PREDATOR_PARAMS.detectionLength = 0.1;
      assert.equal(predator._obstacleAvoidance(agent, direction), 0);
      assert.equal(direction.lengthSq(), 0);

      PREDATOR_PARAMS.detectionLength = 0.4;
      const urgency = predator._obstacleAvoidance(agent, direction);
      assert.ok(urgency > 0);
      assert.ok(direction.lengthSq() > 0);
      assert.ok(direction.clone().normalize().dot(agent.velocity.clone().normalize()) < 0.99);
      predator.dispose();
    }
  ));

test('predator avoidanceWeight scales acceleration without changing detection', () =>
  withPredatorParams(
    {
      count: 1,
      detectionLength: 0.4,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 0,
      predatorSeparationWeight: 0,
      maxForce: 100,
      turnSpeed: 1000,
    },
    () => {
      const lateralSpeed = (weight) => {
        PREDATOR_PARAMS.avoidanceWeight = weight;
        const { predator } = makeHarness([]);
        predator.position.set(0.68, 0, 0);
        predator.velocity.set(PREDATOR_PARAMS.cruiseSpeed, 0, 0);
        predator.step(0.02);
        const lateral = Math.hypot(predator.velocity.y, predator.velocity.z);
        predator.dispose();
        return lateral;
      };

      const low = lateralSpeed(0.1);
      const high = lateralSpeed(0.8);
      assert.ok(low > 0);
      assert.ok(high > low * 5);
    }
  ));

test('wall detection has no steering effect when avoidanceWeight is zero', () =>
  withPredatorParams(
    {
      count: 1,
      alarmPredatorRadius: 1,
      alarmPredatorWeight: 8,
      avoidanceWeight: 0,
      maxForce: 1,
      turnSpeed: 1000,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 0,
    },
    () => {
      const velocityAfterStep = (detectionLength) => {
        PREDATOR_PARAMS.detectionLength = detectionLength;
        const { predator } = makeHarness([[0.9, 0, 0]]);
        const agent = predator.agents[0];
        agent.position.set(0.7, 0, 0);
        agent.velocity.set(0.4, 0, 0);
        agent.targetIndex = 0;
        agent.alarmActive = true;

        predator._steerAgent(agent, 1, 0.01);
        const result = agent.velocity.clone();
        predator.dispose();
        return result;
      };

      const undetected = velocityAfterStep(0);
      const detected = velocityAfterStep(0.4);
      assert.ok(undetected.distanceTo(detected) < 1e-9);
    }
  ));

test('hard containment removes outward velocity instead of reflecting it', () =>
  withPredatorParams({ count: 1 }, () => {
    const { predator } = makeHarness([]);
    const agent = predator.agents[0];
    agent.position.set(100, -100, 100);
    agent.velocity.set(0.8, -0.7, 0.6);

    predator._contain(agent);

    assert.equal(agent.velocity.x, 0);
    assert.equal(agent.velocity.y, 0);
    assert.equal(agent.velocity.z, 0);
    assert.ok(agent.position.x < 100);
    assert.ok(agent.position.y > -100);
    assert.ok(agent.position.z < 100);
    predator.dispose();
  }));

test('production alarm and avoidance turn before the wall without a hard bounce', () =>
  withPredatorParams(
    {
      count: 1,
      captureEnabled: true,
      cruiseSpeed: 0.8,
      maxSpeed: 0.96,
      maxForce: 1.1,
      turnSpeed: 3.8,
      schoolSenseRadius: 1,
      schoolAttractionWeight: 1.6,
      targetPursuitWeight: 0.85,
      alarmPredatorRadius: 0.18,
      alarmPredatorWeight: 10,
      detectionLength: 0.32,
      avoidanceWeight: 2.4,
      predatorSeparationWeight: 1.1,
      captureRadius: 0.065,
    },
    () => {
      const { flock, predator } = makeHarness([[0.92, 0, 0]]);
      const agent = predator.agents[0];
      agent.position.set(0.7, 0, 0);
      agent.velocity.set(0.8, 0, 0);
      let maxX = agent.position.x;
      let maxVelocityJump = 0;
      const previousVelocity = new THREE.Vector3();

      for (let step = 0; step < 60; step++) {
        previousVelocity.copy(agent.velocity);
        predator.step(1 / 60);
        maxX = Math.max(maxX, agent.position.x);
        maxVelocityJump = Math.max(
          maxVelocityJump,
          previousVelocity.distanceTo(agent.velocity)
        );
      }

      assert.ok(maxX < 0.929);
      assert.ok(maxVelocityJump < 0.2);
      assert.equal(flock.alive[0], 0);
      predator.dispose();
    }
  ));

test('each predator sweep can capture a crossed bystander', async () => {
  const { CAPTURE_FX_PARAMS } = await import('../src/evolution-model.js');
  const beforeFx = { ...CAPTURE_FX_PARAMS };
  Object.assign(CAPTURE_FX_PARAMS, {
    density: 0,
    particleCount: 3,
    spawnRadius: 0,
    radialSpeed: 0,
    biteGlowEnabled: false,
  });
  try {
  withPredatorParams(
    {
      count: 1,
      captureEnabled: true,
      cruiseSpeed: 0.8,
      maxSpeed: 0.9,
      maxForce: 0,
      turnSpeed: 0,
      captureRadius: 0.015,
      targetLeadTime: 0,
      schoolAttractionWeight: 0,
      targetPursuitWeight: 1,
    },
    () => {
      const { flock, predator } = makeHarness([
        [0, 0.05, 0],
        [0.08, 0, 0],
      ]);
      predator.position.set(0, 0, 0);
      predator.velocity.set(0.8, 0, 0);

      predator.step(0.1);

      assert.equal(flock.alive[0], 1);
      assert.equal(flock.alive[1], 0);
      assert.equal(flock.deaths.eaten, 1);
      assert.equal(predator.captures, 1);
      assert.equal(predator.agents[0].captures, 1);
      assert.equal(predator.captureVfx.particles.length, 3);
      assert.deepEqual(
        predator.captureVfx.particles[0].origin.toArray(),
        flock.positions[1].toArray()
      );
      assert.ok(predator.captureVfx.particles[0].initialVelocity.x < 0);
      predator.dispose();
    }
  );
  } finally {
    Object.assign(CAPTURE_FX_PARAMS, beforeFx);
  }
});
