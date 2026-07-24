import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { CaptureVfx } from '../src/capture-vfx.js';

function params(overrides = {}) {
  return {
    enabled: true,
    particleCount: 3,
    density: 0, // force particleCount path for deterministic tests
    spawnRadius: 0.04,
    spawnInterval: 0.1,
    lifetime: 1,
    cubeSize: 0.2,
    upwardSpeed: 0.4,
    radialSpeed: 0,
    reverseVelocityFactor: 0.5,
    biteGlowEnabled: false,
    ...overrides,
  };
}

function matrixPose(vfx, index) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  vfx.mesh.getMatrixAt(index, matrix);
  matrix.decompose(position, quaternion, scale);
  return { position, scale };
}

function close(actual, expected, epsilon = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} should be close to ${expected}`
  );
}

test('capture cubes appear sequentially from the fish death position', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(scene, params());
  const origin = new THREE.Vector3(1, 2, 3);

  assert.equal(vfx.emit(origin, new THREE.Vector3(0.5, 0, 0)), 3);
  assert.equal(vfx.mesh.count, 3);
  close(matrixPose(vfx, 0).scale.x, 0.2);
  close(matrixPose(vfx, 1).scale.x, 0);
  close(matrixPose(vfx, 2).scale.x, 0);

  vfx.step(0.1);
  assert.ok(matrixPose(vfx, 0).scale.x < 0.2);
  close(matrixPose(vfx, 1).scale.x, 0.2);
  close(matrixPose(vfx, 2).scale.x, 0);

  vfx.step(0.1);
  close(matrixPose(vfx, 2).scale.x, 0.2);
  vfx.dispose();
});

test('capture velocity and size decay linearly with analytic displacement', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(
    scene,
    params({
      particleCount: 1,
      spawnInterval: 0,
      spawnRadius: 0,
      radialSpeed: 0,
    })
  );
  const origin = new THREE.Vector3(1, 2, 3);
  vfx.emit(origin, new THREE.Vector3(0.5, 0, 0));

  vfx.step(0.5);
  const pose = matrixPose(vfx, 0);
  // v0 = (-0.25, 0.4, 0), integral factor at t=.5,L=1 is .375.
  close(pose.position.x, 1 - 0.25 * 0.375);
  close(pose.position.y, 2 + 0.4 * 0.375);
  close(pose.position.z, 3);
  close(pose.scale.x, 0.1);

  vfx.step(0.5);
  close(matrixPose(vfx, 0).scale.x, 0);
  vfx.step(0.001);
  assert.equal(vfx.mesh.count, 0);
  vfx.dispose();
});

test('capture trajectory is independent of fixed-step subdivision', () => {
  const origin = new THREE.Vector3(0.1, -0.2, 0.3);
  const predatorVelocity = new THREE.Vector3(0.6, -0.1, 0.2);
  const sceneA = new THREE.Scene();
  const sceneB = new THREE.Scene();
  const vfxA = new CaptureVfx(
    sceneA,
    params({ particleCount: 1, spawnInterval: 0, spawnRadius: 0, radialSpeed: 0 })
  );
  const vfxB = new CaptureVfx(
    sceneB,
    params({ particleCount: 1, spawnInterval: 0, spawnRadius: 0, radialSpeed: 0 })
  );
  vfxA.emit(origin, predatorVelocity);
  vfxB.emit(origin, predatorVelocity);

  vfxA.step(0.4);
  for (let i = 0; i < 4; i++) vfxB.step(0.1);

  const a = matrixPose(vfxA, 0);
  const b = matrixPose(vfxB, 0);
  close(a.position.distanceTo(b.position), 0);
  close(a.scale.distanceTo(b.scale), 0);
  vfxA.dispose();
  vfxB.dispose();
});

test('capture reset clears active and pending cubes', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(scene, params());
  vfx.emit(new THREE.Vector3(), new THREE.Vector3());
  vfx.reset();

  assert.equal(vfx.particles.length, 0);
  assert.equal(vfx.mesh.count, 0);
  vfx.dispose();
});

test('capture capacity evicts whole bursts instead of fragmenting trios', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(
    scene,
    params({ lifetime: 100, spawnInterval: 0 })
  );
  for (let i = 0; i < 86; i++) {
    vfx.emit(new THREE.Vector3(i, 0, 0), new THREE.Vector3());
  }

  assert.ok(vfx.particles.length <= 256);
  const counts = new Map();
  for (const particle of vfx.particles) {
    counts.set(particle.burstId, (counts.get(particle.burstId) ?? 0) + 1);
  }
  assert.ok([...counts.values()].every((count) => count === 3));
  vfx.dispose();
});

test('capture dispose releases the instanced mesh GPU attribute', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(scene, params());
  let disposeEvents = 0;
  vfx.mesh.addEventListener('dispose', () => disposeEvents++);

  vfx.dispose();

  assert.equal(disposeEvents, 1);
  assert.ok(!scene.children.includes(vfx.mesh));
});
