import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CaptureVfx } from './capture-vfx.js';

test('starvation corpses sink without fading and never expire', () => {
  const scene = new THREE.Scene();
  const vfx = new CaptureVfx(
    scene,
    { enabled: true, density: 0, particleCount: 6 },
    {
      particleCount: 6,
      density: 0,
      spawnRadius: 0.05,
      spawnInterval: 0,
      cubeSize: 0.02,
      cubeColor: '#6f7d52',
      radialSpeed: 0.04,
      gravity: -0.08,
      persist: true,
    }
  );
  const origin = new THREE.Vector3(0, 0.5, 0);
  assert.equal(vfx.emitStarvation(origin, { floorY: -0.2 }), 6);
  assert.equal(vfx.particles.length, 6);
  assert.ok(vfx.particles.every((p) => p.persist));
  assert.ok(vfx.particles.every((p) => !Number.isFinite(p.lifetime) || p.lifetime === Infinity));

  vfx.step(0.001);
  const first = vfx.particles[0];
  first.age = 1;
  const freeY =
    first.origin.y +
    first.initialVelocity.y * 1 +
    0.5 * first.gravityY * 1 * 1;
  vfx._writeMatrices();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  vfx.mesh.getMatrixAt(0, matrix);
  matrix.decompose(position, quaternion, scale);
  assert.ok(Math.abs(position.y - freeY) < 1e-6);
  assert.ok(Math.abs(scale.x - first.size) < 1e-6);

  // Long step must not cull starvation debris.
  vfx.step(10);
  assert.equal(vfx.particles.length, 6);

  // After enough time the corpse rests on the floor, still full size.
  first.age = 100;
  vfx._writeMatrices();
  vfx.mesh.getMatrixAt(0, matrix);
  matrix.decompose(position, quaternion, scale);
  assert.ok(Math.abs(position.y - first.floorY) < 1e-6);
  assert.ok(Math.abs(scale.x - first.size) < 1e-6);
});
