import * as THREE from 'three';

import { CaptureVfx } from './capture-vfx.js';
import { PREDATOR_PARAMS } from './evolution-model.js';
import { TANK } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);
const WALL_MARGIN = 0.07;
const PREDATOR_BODY_LENGTH = 0.075;
const FISH_VISUAL_BOUNDING_RADIUS = (0.03 + 2 * 0.008) / 2;
const EPSILON = 1e-10;
const AVOIDANCE_STEP_RAD = THREE.MathUtils.degToRad(18);

const _desired = new THREE.Vector3();
const _channelSteer = new THREE.Vector3();
const _separationSteer = new THREE.Vector3();
const _avoidanceSteer = new THREE.Vector3();
const _steer = new THREE.Vector3();
const _newVelocity = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _previousPosition = new THREE.Vector3();
const _previousVelocity = new THREE.Vector3();
const _noseStart = new THREE.Vector3();
const _noseEnd = new THREE.Vector3();
const _noseDirection = new THREE.Vector3();
const _segment = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _globalCentroid = new THREE.Vector3();
const _localCentroid = new THREE.Vector3();
const _schoolDirection = new THREE.Vector3();
const _targetDirection = new THREE.Vector3();
const _alarmDirection = new THREE.Vector3();
const _avoidanceDirection = new THREE.Vector3();
const _avoidanceForward = new THREE.Vector3();
const _avoidanceAxis = new THREE.Vector3();
const _separationDirection = new THREE.Vector3();
const _candidateDirection = new THREE.Vector3();
const _fallbackPosition = new THREE.Vector3();
const _fallbackVelocity = new THREE.Vector3();
const _capturePosition = new THREE.Vector3();
const _basePredatorColor = new THREE.Color('#c9a27b');
const _biteColor = new THREE.Color();
const _biteHsl = { h: 0, s: 0, l: 0 };

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteOr(value, fallback));
}

// Log-time progress with exponential release. age=0 is the peak bite
// moment; by duration the predator has visually returned to base form.
function biteFlashIntensity(age, duration) {
  if (!(duration > 0) || !(age >= 0) || age >= duration) return 0;
  const u = age / duration;
  const logProgress = Math.log1p(9 * u) / Math.log(10);
  return Math.exp(-3.5 * logProgress);
}

// Ray distance from an interior point to the shrunken tank boundary.
// `detectionLength` compares against this distance; it does not control
// the strength of the eventual avoidance acceleration.
function distanceToInnerWall(position, direction) {
  const hx = TANK.width / 2 - WALL_MARGIN;
  const hy = TANK.height / 2 - WALL_MARGIN;
  const hz = TANK.depth / 2 - WALL_MARGIN;
  let distance = Infinity;
  if (Math.abs(direction.x) > 1e-8) {
    distance = Math.min(
      distance,
      ((direction.x > 0 ? hx : -hx) - position.x) / direction.x
    );
  }
  if (Math.abs(direction.y) > 1e-8) {
    distance = Math.min(
      distance,
      ((direction.y > 0 ? hy : -hy) - position.y) / direction.y
    );
  }
  if (Math.abs(direction.z) > 1e-8) {
    distance = Math.min(
      distance,
      ((direction.z > 0 ? hz : -hz) - position.z) / direction.z
    );
  }
  return Math.max(distance, 0);
}

function distanceToSegmentSq(point, start, end) {
  _segment.copy(end).sub(start);
  const lengthSq = _segment.lengthSq();
  if (lengthSq < 1e-12) return point.distanceToSquared(start);
  const t = THREE.MathUtils.clamp(
    _toPoint.copy(point).sub(start).dot(_segment) / lengthSq,
    0,
    1
  );
  _closest.copy(start).addScaledVector(_segment, t);
  return point.distanceToSquared(_closest);
}

function addSteeringAcceleration(
  sum,
  direction,
  velocity,
  desiredSpeed,
  weight
) {
  if (weight <= 0 || direction.lengthSq() < EPSILON) return;
  _channelSteer
    .copy(direction)
    .normalize()
    .multiplyScalar(desiredSpeed)
    .sub(velocity)
    .multiplyScalar(weight);
  sum.add(_channelSteer);
}

/**
 * A pack manager for all predators in the Web behaviour sandbox.
 *
 * `position`, `velocity`, and `targetIndex` remain compatible with the
 * original single-predator interface by forwarding to agents[0]. New
 * consumers should iterate `agents` so every predator can be sensed.
 */
export class Predator {
  constructor(world, scene, flock) {
    if (
      !world?.systems ||
      !scene?.add ||
      !flock?.positions ||
      !flock?.velocities ||
      typeof flock.kill !== 'function'
    ) {
      throw new TypeError('Predator requires World, Scene, and live Flock interfaces');
    }

    this.world = world;
    this.scene = scene;
    this.flock = flock;
    this.params = PREDATOR_PARAMS;
    this.agents = [];
    this.captures = 0;
    this._elapsed = 0;
    this._disposed = false;
    this._reservedTargets = new Set();

    // A three-sided cone reads as a sharp arrowhead from every camera angle.
    // Its tip is rotated to local +Z, matching the velocity-facing basis in
    // _writeMatrices().
    this.geometry = new THREE.ConeGeometry(
      0.018,
      PREDATOR_BODY_LENGTH,
      3,
      1,
      false
    );
    this.geometry.rotateX(Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      color: '#c9a27b',
      side: THREE.DoubleSide,
    });
    this.mesh = null;
    this.captureVfx = new CaptureVfx(scene);

    this.setCount(this.params.count ?? 1);
    this.reset();
    world.systems.push(this);
  }

  get position() {
    return this.agents[0]?.position ?? _fallbackPosition;
  }

  get velocity() {
    return this.agents[0]?.velocity ?? _fallbackVelocity;
  }

  get targetIndex() {
    return this.agents[0]?.targetIndex ?? -1;
  }

  set targetIndex(value) {
    if (!this.agents[0]) return;
    this.agents[0].targetIndex = Number.isInteger(value) ? value : -1;
    this.agents[0].targetLockRemaining = 0;
    this.agents[0].alarmActive = false;
  }

  _makeAgent(index, count) {
    const agent = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      targetIndex: -1,
      targetLockRemaining: 0,
      alarmActive: false,
      captureCooldown: 0,
      captures: 0,
      biteFlashAge: Infinity,
    };
    this._resetAgent(agent, index, count);
    return agent;
  }

  _resetAgent(agent, index, count) {
    // Spread the pack around the perimeter. The first contact therefore
    // starts at an edge instead of every fish spawning inside panic range.
    const angle = Math.PI + (index / Math.max(count, 1)) * Math.PI * 2;
    agent.position.set(
      Math.cos(angle) * TANK.width * 0.4,
      Math.sin(angle * 1.7) * TANK.height * 0.1,
      Math.sin(angle) * TANK.depth * 0.34
    );
    agent.velocity
      .copy(agent.position)
      .multiplyScalar(-1)
      .add(
        _candidateDirection
          .set(-Math.sin(angle), 0.12 * (index % 2 ? -1 : 1), Math.cos(angle))
          .multiplyScalar(0.18)
      );
    if (agent.velocity.lengthSq() < EPSILON) agent.velocity.set(1, 0, 0);
    agent.velocity
      .normalize()
      .multiplyScalar(nonNegative(this.params.cruiseSpeed, 0.8));
    agent.targetIndex = -1;
    agent.targetLockRemaining = 0;
    agent.alarmActive = false;
    agent.captureCooldown = 0;
    agent.captures = 0;
    agent.biteFlashAge = Infinity;
  }

  _rebuildMesh() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose?.();
    }

    // InstancedMesh accepts a zero draw count, but keep one slot allocated so
    // a live count slider can move 0 → 1 without a special rendering path.
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      Math.max(1, this.agents.length)
    );
    this.mesh.count = this.agents.length;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = null;
    // One soft beige base color; bite flashes push individual instances
    // toward a more saturated hue without changing the shared material.
    for (let i = 0; i < this.mesh.count; i++) {
      this.mesh.setColorAt(i, _basePredatorColor);
    }
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  setCount(value = this.params.count) {
    const count = Math.max(0, Math.round(finiteOr(value, 1)));
    this.params.count = count;

    if (count < this.agents.length) {
      this.agents.length = count;
    } else {
      while (this.agents.length < count) {
        this.agents.push(this._makeAgent(this.agents.length, count));
      }
    }

    this._rebuildMesh();
    this._writeMatrices();
    return this;
  }

  reset() {
    const configuredCount = Math.max(
      0,
      Math.round(finiteOr(this.params.count, this.agents.length || 1))
    );
    if (configuredCount !== this.agents.length) this.setCount(configuredCount);

    this.captures = 0;
    this._elapsed = 0;
    this.captureVfx.reset();
    for (let i = 0; i < this.agents.length; i++) {
      this._resetAgent(this.agents[i], i, this.agents.length);
    }
    this._writeMatrices();
    return this;
  }

  _isAlive(index) {
    return (
      index >= 0 &&
      index < this.flock.positions.length &&
      (!this.flock.alive || Boolean(this.flock.alive[index]))
    );
  }

  _collectSchool() {
    _globalCentroid.set(0, 0, 0);
    let aliveCount = 0;
    for (let i = 0; i < this.flock.positions.length; i++) {
      if (!this._isAlive(i)) continue;
      _globalCentroid.add(this.flock.positions[i]);
      aliveCount++;
    }
    if (aliveCount > 0) _globalCentroid.divideScalar(aliveCount);
    return aliveCount;
  }

  _nearestTarget(
    agent,
    reserved,
    allowReserved = false,
    radius = Infinity
  ) {
    let best = -1;
    let bestDistanceSq = radius * radius;
    for (let i = 0; i < this.flock.positions.length; i++) {
      if (!this._isAlive(i) || (!allowReserved && reserved.has(i))) continue;
      const distanceSq = agent.position.distanceToSquared(this.flock.positions[i]);
      if (distanceSq <= bestDistanceSq) {
        best = i;
        bestDistanceSq = distanceSq;
      }
    }
    return best;
  }

  _refreshTargets(dt) {
    const reserved = this._reservedTargets;
    reserved.clear();
    const alarmRadius = nonNegative(this.params.alarmPredatorRadius, 0.18);
    const alarmWeight = nonNegative(this.params.alarmPredatorWeight, 10);
    const alarmEnabled = alarmRadius > 0 && alarmWeight > 0;

    // Alarm locks are true strike states: they do not expire with the ordinary
    // target timer. They end only when the target dies, capture/reset clears
    // them, or the alarm feature is disabled.
    for (const agent of this.agents) {
      agent.targetLockRemaining = Math.max(
        0,
        agent.targetLockRemaining - Math.max(dt, 0)
      );
      if (!this._isAlive(agent.targetIndex)) {
        agent.targetIndex = -1;
        agent.targetLockRemaining = 0;
        agent.alarmActive = false;
      } else if (!alarmEnabled) {
        agent.alarmActive = false;
      } else if (agent.alarmActive) {
        reserved.add(agent.targetIndex);
      }
    }

    // A nearby fish immediately overrides a still-valid macro target lock.
    // Prefer distinct prey across the pack; share only when every nearby fish
    // is already reserved by another strike.
    if (alarmEnabled) {
      for (const agent of this.agents) {
        if (agent.alarmActive) continue;
        let target = this._nearestTarget(
          agent,
          reserved,
          false,
          alarmRadius
        );
        if (target < 0) {
          target = this._nearestTarget(
            agent,
            reserved,
            true,
            alarmRadius
          );
        }
        if (target < 0) continue;
        agent.targetIndex = target;
        agent.targetLockRemaining = 0;
        agent.alarmActive = true;
        reserved.add(target);
      }
    }

    // A strike may preempt a target that another predator held only as a
    // long-range macro lock. Release that old owner now so the ordinary
    // allocator below can choose another fish. When no alternative exists,
    // its explicit fallback still permits sharing the sole remaining prey.
    for (const agent of this.agents) {
      if (
        !agent.alarmActive &&
        this._isAlive(agent.targetIndex) &&
        reserved.has(agent.targetIndex)
      ) {
        agent.targetIndex = -1;
        agent.targetLockRemaining = 0;
      }
    }

    // Preserve ordinary locks only after alarm acquisition, so a local strike
    // is allowed to preempt a long-range macro target.
    for (const agent of this.agents) {
      if (
        !agent.alarmActive &&
        this._isAlive(agent.targetIndex) &&
        agent.targetLockRemaining > 0
      ) {
        reserved.add(agent.targetIndex);
      }
    }

    const lockTime = nonNegative(this.params.targetLockTime, 0.8);
    for (const agent of this.agents) {
      if (agent.alarmActive) continue;
      if (agent.targetIndex >= 0 && agent.targetLockRemaining > 0) continue;

      let target = this._nearestTarget(agent, reserved);
      if (target < 0) target = this._nearestTarget(agent, reserved, true);
      agent.targetIndex = target;
      agent.targetLockRemaining = target >= 0 ? lockTime : 0;
      if (target >= 0) reserved.add(target);
    }
  }

  _schoolCentroidFor(agent, aliveCount, out) {
    if (aliveCount === 0) return null;

    const senseRadius = nonNegative(this.params.schoolSenseRadius, 0.45);
    const radiusSq = senseRadius * senseRadius;
    out.set(0, 0, 0);
    let localCount = 0;
    if (senseRadius > 0) {
      for (let i = 0; i < this.flock.positions.length; i++) {
        if (!this._isAlive(i)) continue;
        const position = this.flock.positions[i];
        if (agent.position.distanceToSquared(position) > radiusSq) continue;
        out.add(position);
        localCount++;
      }
    }

    if (localCount > 0) return out.divideScalar(localCount);
    return out.copy(_globalCentroid);
  }

  _obstacleAvoidance(agent, out) {
    const detectionLength = nonNegative(this.params.detectionLength, 0.32);
    out.set(0, 0, 0);
    if (detectionLength <= 0 || agent.velocity.lengthSq() < EPSILON) return 0;

    _avoidanceForward.copy(agent.velocity).normalize();
    const wallDistance = distanceToInnerWall(
      agent.position,
      _avoidanceForward
    );
    if (wallDistance >= detectionLength) return 0;

    const urgency = 1 - wallDistance / detectionLength;
    const tries = Math.ceil(Math.PI / AVOIDANCE_STEP_RAD);
    let found = false;

    // Prefer a horizontal turn so the predator continues to read as a fish.
    for (let step = 1; step <= tries && !found; step++) {
      for (const sign of [1, -1]) {
        _candidateDirection
          .copy(_avoidanceForward)
          .applyAxisAngle(UP, sign * step * AVOIDANCE_STEP_RAD);
        if (
          distanceToInnerWall(agent.position, _candidateDirection) >
          detectionLength
        ) {
          out.copy(_candidateDirection);
          found = true;
          break;
        }
      }
    }

    // Near the floor/ceiling, pitch is the useful escape plane.
    if (!found) {
      _avoidanceAxis.crossVectors(UP, _avoidanceForward);
      if (_avoidanceAxis.lengthSq() < EPSILON) {
        _avoidanceAxis.set(1, 0, 0);
      } else {
        _avoidanceAxis.normalize();
      }
      for (const angle of [0.6, -0.6, 1.1, -1.1]) {
        _candidateDirection
          .copy(_avoidanceForward)
          .applyAxisAngle(_avoidanceAxis, angle);
        if (
          distanceToInnerWall(agent.position, _candidateDirection) >
          detectionLength
        ) {
          out.copy(_candidateDirection);
          found = true;
          break;
        }
      }
    }

    // Numerical corner case only. The hard contain step remains the final
    // safety net, but normal avoidance is entirely ray-triggered.
    if (!found) out.copy(agent.position).multiplyScalar(-1);
    return urgency;
  }

  _predatorSeparation(agent, out) {
    const radius = nonNegative(this.params.predatorSeparationRadius, 0.18);
    const radiusSq = radius * radius;
    out.set(0, 0, 0);
    if (radius <= 0) return out;

    for (const other of this.agents) {
      if (other === agent) continue;
      _candidateDirection.copy(agent.position).sub(other.position);
      const distanceSq = _candidateDirection.lengthSq();
      if (distanceSq >= radiusSq) continue;
      if (distanceSq < 1e-12) {
        // Deterministic symmetry break for an exact overlap.
        _candidateDirection.set(
          this.agents.indexOf(agent) < this.agents.indexOf(other) ? -1 : 1,
          0,
          0
        );
        out.add(_candidateDirection);
      } else {
        const distance = Math.sqrt(distanceSq);
        out.addScaledVector(
          _candidateDirection,
          ((radius - distance) / radius) / distance
        );
      }
    }
    return out;
  }

  _steerAgent(agent, aliveCount, dt) {
    const P = this.params;
    const cruiseSpeed = nonNegative(P.cruiseSpeed, 0.8);
    const maxSpeed = Math.max(
      cruiseSpeed * 0.55,
      nonNegative(P.maxSpeed, 0.96)
    );
    const alarmActive =
      agent.alarmActive && this._isAlive(agent.targetIndex);
    const alarmWeight = alarmActive
      ? nonNegative(P.alarmPredatorWeight, 10)
      : 0;
    _desired.set(0, 0, 0);
    _separationSteer.set(0, 0, 0);
    _avoidanceSteer.set(0, 0, 0);

    if (alarmActive) {
      const targetPosition = this.flock.positions[agent.targetIndex];
      const targetVelocity = this.flock.velocities[agent.targetIndex];
      _alarmDirection
        .copy(targetPosition)
        .addScaledVector(
          targetVelocity,
          nonNegative(P.targetLeadTime, 0.12)
        )
        .sub(agent.position);
      addSteeringAcceleration(
        _desired,
        _alarmDirection,
        agent.velocity,
        maxSpeed,
        alarmWeight
      );
    } else {
      const schoolCentroid = this._schoolCentroidFor(
        agent,
        aliveCount,
        _localCentroid
      );
      if (schoolCentroid) {
        _schoolDirection.copy(schoolCentroid).sub(agent.position);
        addSteeringAcceleration(
          _desired,
          _schoolDirection,
          agent.velocity,
          cruiseSpeed,
          nonNegative(P.schoolAttractionWeight, 0.65)
        );
      }

      if (this._isAlive(agent.targetIndex)) {
        const targetPosition = this.flock.positions[agent.targetIndex];
        const targetVelocity = this.flock.velocities[agent.targetIndex];
        _targetDirection
          .copy(targetPosition)
          .addScaledVector(
            targetVelocity,
            nonNegative(P.targetLeadTime, 0.12)
          )
          .sub(agent.position);
        addSteeringAcceleration(
          _desired,
          _targetDirection,
          agent.velocity,
          cruiseSpeed,
          nonNegative(P.targetPursuitWeight, 1.2)
        );
      }
    }

    this._predatorSeparation(agent, _separationDirection);
    addSteeringAcceleration(
      _separationSteer,
      _separationDirection,
      agent.velocity,
      cruiseSpeed,
      nonNegative(P.predatorSeparationWeight, 1.4)
    );

    const avoidanceUrgency = this._obstacleAvoidance(
      agent,
      _avoidanceDirection
    );
    const avoidanceWeight = nonNegative(P.avoidanceWeight, 2.4);
    const avoidanceGain =
      avoidanceUrgency > 0
        ? avoidanceWeight * (1 + avoidanceUrgency * 2)
        : 0;
    if (avoidanceGain > 0) {
      addSteeringAcceleration(
        _avoidanceSteer,
        _avoidanceDirection,
        agent.velocity,
        cruiseSpeed,
        avoidanceGain
      );
    }

    if (
      _desired.lengthSq() +
        _separationSteer.lengthSq() +
        _avoidanceSteer.lengthSq() <
      EPSILON
    ) {
      // No prey or forces: deterministic patrol, different phase per agent.
      const index = this.agents.indexOf(agent);
      const t = this._elapsed * 0.35 + index * 1.7;
      _candidateDirection.set(
        Math.cos(t),
        Math.sin(t * 0.7) * 0.25,
        Math.sin(t)
      );
      addSteeringAcceleration(
        _desired,
        _candidateDirection,
        agent.velocity,
        cruiseSpeed,
        1
      );
    }

    const maxForce = nonNegative(P.maxForce, 1.1);
    // A strike is deliberately allowed a larger acceleration budget. Without
    // this, a "very large" alarm weight would saturate at the ordinary
    // maxForce and only change direction, never produce a visible charge.
    const pursuitForceLimit =
      maxForce * (alarmActive ? Math.max(1, alarmWeight) : 1);
    _desired.clampLength(0, pursuitForceLimit);

    // Separation and avoidance keep independent force budgets. Alarm
    // weight therefore changes only the micro-pursuit channel, never silently
    // amplifying collision avoidance. Avoidance's own weight and urgency
    // expand its cap, rather than being erased by the ordinary maxForce.
    _separationSteer.clampLength(0, maxForce);
    _avoidanceSteer.clampLength(
      0,
      maxForce * Math.max(1, avoidanceGain)
    );
    const avoidanceActive = _avoidanceSteer.lengthSq() >= EPSILON;
    const avoidanceBlend = Math.min(1, avoidanceGain);
    const urgentYield = (1 - avoidanceUrgency) ** 3;
    const safetyYield = avoidanceActive
      ? 1 - avoidanceBlend * (1 - urgentYield)
      : 1;

    // As the forward wall ray gets urgent, both prey pursuit and pack
    // separation yield to the avoidance channel. With avoidanceWeight=0,
    // merely detecting a wall has no hidden effect on either channel.
    _steer
      .copy(_desired)
      .add(_separationSteer)
      .multiplyScalar(safetyYield)
      .add(_avoidanceSteer);
    _newVelocity.copy(agent.velocity).addScaledVector(_steer, dt);

    const speed = Math.max(_newVelocity.length(), 1e-6);
    const maxAngle = nonNegative(P.turnSpeed, 3.8) * dt;
    const angle = agent.velocity.angleTo(_newVelocity);
    if (angle > maxAngle && agent.velocity.lengthSq() > EPSILON) {
      _axis.crossVectors(agent.velocity, _newVelocity);
      if (_axis.lengthSq() > 1e-12) {
        _axis.normalize();
        _newVelocity
          .copy(agent.velocity)
          .applyAxisAngle(_axis, maxAngle)
          .setLength(speed);
      }
    }

    _newVelocity.clampLength(cruiseSpeed * 0.55, maxSpeed);
    agent.velocity.copy(_newVelocity);
    agent.position.addScaledVector(agent.velocity, dt);
    this._contain(agent);
  }

  _contain(agent) {
    const hx = TANK.width / 2 - WALL_MARGIN;
    const hy = TANK.height / 2 - WALL_MARGIN;
    const hz = TANK.depth / 2 - WALL_MARGIN;
    if (agent.position.x > hx) {
      agent.position.x = hx;
      if (agent.velocity.x > 0) agent.velocity.x = 0;
    } else if (agent.position.x < -hx) {
      agent.position.x = -hx;
      if (agent.velocity.x < 0) agent.velocity.x = 0;
    }
    if (agent.position.y > hy) {
      agent.position.y = hy;
      if (agent.velocity.y > 0) agent.velocity.y = 0;
    } else if (agent.position.y < -hy) {
      agent.position.y = -hy;
      if (agent.velocity.y < 0) agent.velocity.y = 0;
    }
    if (agent.position.z > hz) {
      agent.position.z = hz;
      if (agent.velocity.z > 0) agent.velocity.z = 0;
    } else if (agent.position.z < -hz) {
      agent.position.z = -hz;
      if (agent.velocity.z < 0) agent.velocity.z = 0;
    }
  }

  _captureAlongPath(agent, start, startVelocity) {
    const P = this.params;
    agent.captureCooldown = Math.max(0, agent.captureCooldown);
    if (
      !P.captureEnabled ||
      agent.captureCooldown > 0 ||
      this.flock.positions.length === 0
    ) {
      return;
    }

    const noseOffset =
      (PREDATOR_BODY_LENGTH * nonNegative(P.bodyScale, 1.8)) / 2;
    _noseStart.copy(start);
    if (startVelocity.lengthSq() >= EPSILON) {
      _noseDirection.copy(startVelocity).normalize();
      _noseStart.addScaledVector(_noseDirection, noseOffset);
    }
    _noseEnd.copy(agent.position);
    if (agent.velocity.lengthSq() >= EPSILON) {
      _noseDirection.copy(agent.velocity).normalize();
      _noseEnd.addScaledVector(_noseDirection, noseOffset);
    }

    const fishBodyScale = nonNegative(
      this.flock.derived?.bodyScale,
      1
    );
    const captureDistance =
      nonNegative(P.captureRadius, 0.065) +
      FISH_VISUAL_BOUNDING_RADIUS * fishBodyScale;
    let captured = -1;
    let bestDistanceSq = captureDistance ** 2;
    for (let i = 0; i < this.flock.positions.length; i++) {
      if (!this._isAlive(i)) continue;
      const distanceSq = distanceToSegmentSq(
        this.flock.positions[i],
        _noseStart,
        _noseEnd
      );
      if (distanceSq <= bestDistanceSq) {
        bestDistanceSq = distanceSq;
        captured = i;
      }
    }

    if (captured < 0) return;
    _capturePosition.copy(this.flock.positions[captured]);
    if (!this.flock.kill(captured, 'eaten')) return;
    // Debris still originates at the fish; the local brightening shell is
    // centered on the predator so the bite reads as a hunting event.
    this.captureVfx.emit(_capturePosition, agent.velocity, agent.position);
    agent.captures++;
    this.captures++;
    agent.captureCooldown = nonNegative(P.captureCooldown, 0.7);
    agent.biteFlashAge = 0;

    // Any predator locked to the removed fish must choose again next step.
    for (const other of this.agents) {
      if (other.targetIndex !== captured) continue;
      other.targetIndex = -1;
      other.targetLockRemaining = 0;
      other.alarmActive = false;
    }
  }

  step(dt) {
    if (this._disposed) return;
    this.captureVfx.step(dt);
    const P = this.params;
    const configuredCount = Math.max(
      0,
      Math.round(finiteOr(P.count, this.agents.length))
    );
    if (configuredCount !== this.agents.length) this.setCount(configuredCount);

    this.mesh.visible = Boolean(P.enabled) && this.agents.length > 0;
    if (!P.enabled || dt <= 0) return;

    this._elapsed += dt;
    const aliveCount = this._collectSchool();
    this._refreshTargets(dt);

    for (const agent of this.agents) {
      _previousPosition.copy(agent.position);
      _previousVelocity.copy(agent.velocity);
      agent.captureCooldown = Math.max(0, agent.captureCooldown - dt);
      if (Number.isFinite(agent.biteFlashAge)) {
        agent.biteFlashAge += dt;
      }
      this._steerAgent(agent, aliveCount, dt);
      this._captureAlongPath(
        agent,
        _previousPosition,
        _previousVelocity
      );
    }

    this._writeMatrices();
  }

  _writeMatrices() {
    if (!this.mesh) return;
    const bodyScale = nonNegative(this.params.bodyScale, 1.8);
    const fx = this.captureVfx?.params ?? {};
    const flashDuration = nonNegative(fx.biteFlashDuration, 0.2);
    const scaleBoost = nonNegative(fx.biteFlashScaleBoost, 0.28);
    const satBoost = nonNegative(fx.biteFlashSaturationBoost, 0.55);
    const darken = nonNegative(fx.biteFlashDarken, 0.12);

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const flash = biteFlashIntensity(agent.biteFlashAge, flashDuration);
      _forward.copy(agent.velocity);
      if (_forward.lengthSq() < EPSILON) _forward.set(0, 0, 1);
      _forward.normalize();
      _right.crossVectors(UP, _forward);
      if (_right.lengthSq() < EPSILON) _right.set(1, 0, 0);
      _right.normalize();
      _up.crossVectors(_forward, _right).normalize();

      _matrix.makeBasis(_right, _up, _forward);
      _scale.setScalar(bodyScale * (1 + scaleBoost * flash));
      _matrix.scale(_scale);
      _matrix.setPosition(agent.position);
      this.mesh.setMatrixAt(i, _matrix);

      _biteColor.copy(_basePredatorColor);
      _biteColor.getHSL(_biteHsl);
      _biteColor.setHSL(
        _biteHsl.h,
        Math.min(1, _biteHsl.s + satBoost * flash),
        Math.max(0.05, _biteHsl.l * (1 - darken * flash))
      );
      this.mesh.setColorAt(i, _biteColor);
    }
    this.mesh.count = this.agents.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const index = this.world.systems.indexOf(this);
    if (index >= 0) this.world.systems.splice(index, 1);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose?.();
      this.mesh = null;
    }
    this.geometry.dispose();
    this.material.dispose();
    this.captureVfx.dispose();
    this.agents.length = 0;
  }
}
