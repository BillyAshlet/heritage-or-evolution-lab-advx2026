import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CaptureVfx } from './capture-vfx.js';

test('starvation debris uses fibonacci shell and constant downward acceleration', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(scene, { enabled: true, density: 0, particleCount: 6 }, {
    particleCount: 6,
    density: 0,
    spawnRadius: 0.05,
    spawnInterval: 0,
    lifetime: 2,
    cubeSize: 0.02,
    cubeColor: '#6f7d52',
    radialSpeed: 0.04,
    gravity: -0.08,
  });
  const origin = new THREE.Vector3(0, 0.5, 0);
  assert.equal(vfx.emitStarvation(origin), 6);
  assert.equal(vfx.particles.length, 6);
  assert.ok(vfx.particles.every((p) => p.style === 'starvation'));
  assert.ok(vfx.particles.every((p) => p.gravityY === -0.08));

  // Advance all particles into the visible phase.
  vfx.step(0.001);
  const first = vfx.particles[0];
  const age = 1;
  first.age = age;
  const expectedY =
    first.origin.y +
    first.initialVelocity.y * age +
    0.5 * first.gravityY * age * age;
  vfx._writeMatrices();
  const matrix = new THREE.Matrix4();
  vfx.mesh.getMatrixAt(0, matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  assert.ok(Math.abs(position.y - expectedY) < 1e-6);
  assert.ok(position.y < first.origin.y);
});
