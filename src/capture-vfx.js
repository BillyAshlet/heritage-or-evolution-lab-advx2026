import * as THREE from 'three';

import { CAPTURE_FX_PARAMS } from './evolution-model.js';

const MAX_PARTICLES = 256;
const EPSILON = 1e-8;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _initialVelocity = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteOr(value, fallback));
}

function fibonacciDirection(index, count, out) {
  // Even shell sampling with a tiny deterministic jitter so successive
  // bites never look like the exact same crystal lattice.
  const i = index + 0.5;
  const y = 1 - (2 * i) / count;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * i;
  const jitter = ((index * 17) % 7) * 0.035;
  out.set(
    Math.cos(theta + jitter) * radius,
    y,
    Math.sin(theta + jitter) * radius
  );
  if (out.lengthSq() < EPSILON) out.set(0, 1, 0);
  return out.normalize();
}

/**
 * Capture debris + bite glow.
 *
 * Cubes are seeded on a Fibonacci sphere around the fish death point.
 * Density scales how many points occupy the shell; upwardSpeed and the
 * predator reverse velocity still dominate the later trajectory. Glow is
 * a transparent billboard ring whose brightness falls off as
 * (1 - r/R) * exp(-k r/R).
 */
export const DEFAULT_STARVATION_VFX = Object.freeze({
  particleCount: 10,
  density: 1.6,
  spawnRadius: 0.05,
  spawnInterval: 0.03,
  lifetime: 2.4,
  cubeSize: 0.02,
  cubeColor: '#6f7d52',
  radialSpeed: 0.035,
  gravity: -0.05,
});

export class CaptureVfx {
  constructor(scene, params = CAPTURE_FX_PARAMS, starvationParams = DEFAULT_STARVATION_VFX) {
    if (!scene?.add) {
      throw new TypeError('CaptureVfx requires a Three.js Scene');
    }
    this.scene = scene;
    this.params = params;
    this.starvationParams = starvationParams || DEFAULT_STARVATION_VFX;
    this.particles = [];
    this.glows = [];
    this._nextBurstId = 1;

    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshBasicMaterial({
      color: params.cubeColor || '#1e4f8c',
    });
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      MAX_PARTICLES
    );
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.glowGeometry = new THREE.SphereGeometry(1, 20, 14);
    this.glowMaterial = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    // One reusable glow mesh is enough for the sandbox; new bites just
    // restart the strongest remaining pulse.
    this.glowMesh = new THREE.Mesh(this.glowGeometry, this.glowMaterial);
    this.glowMesh.visible = false;
    this.glowMesh.renderOrder = 2;
    scene.add(this.glowMesh);
  }

  _desiredCount(params = this.params) {
    const P = params;
    const density = nonNegative(P.density, 1);
    const radius = Math.max(nonNegative(P.spawnRadius, 0.04), 0.01);
    // Area of a unit-ish shell around the bite. Density 1 ≈ previous look.
    const byDensity = Math.round(density * 4 * Math.PI * radius * radius * 180);
    const ceiling = Math.min(
      24,
      Math.max(1, Math.round(finiteOr(P.particleCount, 8)))
    );
    // density 0 is a deterministic test/debug path that falls back to the
    // explicit particleCount ceiling instead of estimating shell occupancy.
    if (density <= 0) return ceiling;
    return Math.max(1, Math.min(ceiling, Math.max(1, byDensity)));
  }

  emit(position, predatorVelocity, glowCenter = null) {
    const P = this.params;
    if (!P.enabled || !position || !predatorVelocity) return 0;

    const count = this._desiredCount();
    const interval = nonNegative(P.spawnInterval, 0.02);
    const lifetime = nonNegative(P.lifetime, 0.5);
    const size = nonNegative(P.cubeSize, 0.018);
    const spawnRadius = nonNegative(P.spawnRadius, 0.04);
    const radialSpeed = nonNegative(P.radialSpeed, 0.18);
    if (count === 0 || lifetime <= EPSILON || size <= EPSILON) return 0;

    while (this.particles.length + count > MAX_PARTICLES) {
      const oldestBurstId = this.particles[0]?.burstId;
      if (oldestBurstId === undefined) break;
      let removeCount = 0;
      while (
        removeCount < this.particles.length &&
        this.particles[removeCount].burstId === oldestBurstId
      ) {
        removeCount++;
      }
      this.particles.splice(0, removeCount);
    }

    const burstId = this._nextBurstId++;
    for (let i = 0; i < count; i++) {
      fibonacciDirection(i, count, _radial);
      _initialVelocity
        .copy(_radial)
        .multiplyScalar(radialSpeed)
        .addScaledVector(_up, nonNegative(P.upwardSpeed, 0.12))
        .addScaledVector(
          predatorVelocity,
          -nonNegative(P.reverseVelocityFactor, 0.4)
        );

      this.particles.push({
        burstId,
        style: 'capture',
        origin: position
          .clone()
          .addScaledVector(_radial, spawnRadius * (0.35 + 0.65 * ((i % 5) / 4))),
        initialVelocity: _initialVelocity.clone(),
        gravityY: 0,
        age: -i * interval,
        lifetime,
        size,
        color: P.cubeColor || '#1e4f8c',
      });
    }

    this._emitGlow(glowCenter || position);
    this._writeMatrices();
    return count;
  }

  emitStarvation(position) {
    const P = this.starvationParams || DEFAULT_STARVATION_VFX;
    if (!position) return 0;

    const count = this._desiredCount(P);
    const interval = nonNegative(P.spawnInterval, 0.03);
    const lifetime = nonNegative(P.lifetime, 2.4);
    const size = nonNegative(P.cubeSize, 0.02);
    const spawnRadius = nonNegative(P.spawnRadius, 0.05);
    const radialSpeed = nonNegative(P.radialSpeed, 0.035);
    const gravity = finiteOr(P.gravity, -0.05);
    if (count === 0 || lifetime <= EPSILON || size <= EPSILON) return 0;

    while (this.particles.length + count > MAX_PARTICLES) {
      const oldestBurstId = this.particles[0]?.burstId;
      if (oldestBurstId === undefined) break;
      let removeCount = 0;
      while (
        removeCount < this.particles.length &&
        this.particles[removeCount].burstId === oldestBurstId
      ) {
        removeCount++;
      }
      this.particles.splice(0, removeCount);
    }

    const burstId = this._nextBurstId++;
    for (let i = 0; i < count; i++) {
      fibonacciDirection(i, count, _radial);
      _initialVelocity.copy(_radial).multiplyScalar(radialSpeed);
      this.particles.push({
        burstId,
        style: 'starvation',
        origin: position
          .clone()
          .addScaledVector(_radial, spawnRadius * (0.35 + 0.65 * ((i % 5) / 4))),
        initialVelocity: _initialVelocity.clone(),
        gravityY: gravity,
        age: -i * interval,
        lifetime,
        size,
        color: P.cubeColor || '#6f7d52',
      });
    }

    this._writeMatrices();
    return count;
  }

  _emitGlow(position) {
    const P = this.params;
    if (!P.biteGlowEnabled) {
      this.glowMesh.visible = false;
      this.glows.length = 0;
      return;
    }
    const duration = nonNegative(P.biteGlowDuration, 0.35);
    const radius = nonNegative(P.biteGlowRadius, 0.28);
    if (duration <= EPSILON || radius <= EPSILON) return;
    this.glows = [
      {
        origin: position.clone(),
        age: 0,
        duration,
        radius,
        strength: nonNegative(P.biteGlowStrength, 0.55),
        falloff: nonNegative(P.biteGlowFalloff, 2.4),
      },
    ];
  }

  syncMaterial() {
    const next = this.params.cubeColor || '#1e4f8c';
    if (this.material.color.getStyle() !== new THREE.Color(next).getStyle()) {
      this.material.color.set(next);
    }
  }

  step(dt) {
    this.syncMaterial();
    if (!this.params.enabled) {
      this.reset();
      return;
    }
    if (!(dt > 0)) return;

    if (this.particles.length > 0) {
      let writeIndex = 0;
      for (let readIndex = 0; readIndex < this.particles.length; readIndex++) {
        const particle = this.particles[readIndex];
        particle.age += dt;
        if (particle.age <= particle.lifetime) {
          this.particles[writeIndex++] = particle;
        }
      }
      this.particles.length = writeIndex;
      this._writeMatrices();
    }

    if (this.glows.length > 0) {
      let write = 0;
      for (let i = 0; i < this.glows.length; i++) {
        const glow = this.glows[i];
        glow.age += dt;
        if (glow.age <= glow.duration) this.glows[write++] = glow;
      }
      this.glows.length = write;
      this._writeGlow();
    } else if (this.glowMesh.visible) {
      this.glowMesh.visible = false;
      this.glowMaterial.opacity = 0;
    }
  }

  _writeMatrices() {
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      if (particle.age < 0) {
        _matrix.makeScale(0, 0, 0);
        _matrix.setPosition(particle.origin);
        this.mesh.setMatrixAt(i, _matrix);
        continue;
      }

      const age = Math.min(particle.age, particle.lifetime);
      const speedRatio = Math.max(0, 1 - age / particle.lifetime);
      if (particle.style === 'starvation') {
        // Constant vertical acceleration: x = x0 + v0 t + 1/2 a t^2.
        _position
          .copy(particle.origin)
          .addScaledVector(particle.initialVelocity, age);
        _position.y += 0.5 * finiteOr(particle.gravityY, -0.05) * age * age;
      } else {
        // Integral of v0(1 - t/L): displacement = v0(t - t²/(2L)).
        const displacement = age - (age * age) / (2 * particle.lifetime);
        _position
          .copy(particle.origin)
          .addScaledVector(particle.initialVelocity, displacement);
      }
      _scale.setScalar(particle.size * speedRatio);
      _matrix.makeScale(_scale.x, _scale.y, _scale.z);
      _matrix.setPosition(_position);
      this.mesh.setMatrixAt(i, _matrix);
    }
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  _writeGlow() {
    const glow = this.glows[0];
    if (!glow) {
      this.glowMesh.visible = false;
      this.glowMaterial.opacity = 0;
      return;
    }
    const u = Math.min(1, Math.max(0, glow.age / glow.duration));
    // Brightest immediately after the bite, then soft release.
    const envelope = Math.exp(-3.2 * u) * (1 - u);
    // Represent the radial falloff profile with a slightly expanding shell
    // whose opacity already encodes the linear*exp center weight.
    const visualRadius = glow.radius * (0.55 + 0.75 * u);
    const centerWeight = Math.exp(-glow.falloff * 0.15);
    this.glowMesh.visible = envelope > 0.01;
    this.glowMesh.position.copy(glow.origin);
    this.glowMesh.scale.setScalar(Math.max(visualRadius, 1e-4));
    this.glowMaterial.opacity = Math.min(
      0.55,
      glow.strength * envelope * centerWeight
    );
  }

  // Public helper for the school brightening pass: returns the strongest
  // lighten factor at a world position using linear * exp falloff.
  sampleLighten(position) {
    let best = 0;
    for (const glow of this.glows) {
      const radius = Math.max(glow.radius, EPSILON);
      const distance = position.distanceTo(glow.origin);
      if (distance >= radius) continue;
      const t = distance / radius;
      const u = Math.min(1, Math.max(0, glow.age / glow.duration));
      const envelope = Math.exp(-3.2 * u) * (1 - u);
      const spatial = (1 - t) * Math.exp(-glow.falloff * t);
      best = Math.max(best, glow.strength * envelope * spatial);
    }
    return best;
  }

  reset() {
    this.particles.length = 0;
    this.glows.length = 0;
    this._nextBurstId = 1;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.visible = false;
    this.glowMaterial.opacity = 0;
  }

  dispose() {
    this.reset();
    this.scene.remove(this.mesh);
    this.scene.remove(this.glowMesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.glowGeometry.dispose();
    this.glowMaterial.dispose();
  }
}
