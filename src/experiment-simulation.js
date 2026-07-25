import * as THREE from 'three';
import {
  RelationMatrix,
  SeededRng,
  SpatialHash3D,
  captureRadius,
  deriveExperiment,
  ecologyOutcome,
  effectiveMaxSpeed,
  effectiveTurnSpeed,
  metabolicRate,
  perPredatorCooldown,
  relationBetween,
  stepPlankton,
  sustainedSpeedScale,
  tankVolume,
} from './experiment-model.js';
import { sceneClearance, tankWallClearance } from './distance-field.js';
import { CaptureVfx } from './capture-vfx.js';

const EPSILON = 1e-8;
const FORWARD = new THREE.Vector3(0, 0, 1);
const LOCOMOTION = Object.freeze({
  CRUISE: 0,
  BURST: 1,
  EVADE: 2,
});
const LOCOMOTION_LABEL = Object.freeze([
  'cruise',
  'burst',
  'evade',
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function approach(current, target, rate, dt) {
  const alpha = 1 - Math.exp(-Math.max(0, rate) * dt);
  return current + (target - current) * alpha;
}

function normalize3(x, y, z) {
  const magnitude = Math.hypot(x, y, z);
  if (magnitude <= EPSILON) return [0, 0, 0, 0];
  return [x / magnitude, y / magnitude, z / magnitude, magnitude];
}

function add3(array, index, x, y, z) {
  const offset = index * 3;
  array[offset] += x;
  array[offset + 1] += y;
  array[offset + 2] += z;
}

function set3(array, index, x, y, z) {
  const offset = index * 3;
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
}

export class ExperimentSimulation {
  constructor({ scene, config, distanceField, physics }) {
    this.scene = scene;
    this.config = config;
    this.distanceField = distanceField;
    this.physics = physics;
    this.relations = new RelationMatrix();
    this.hash = new SpatialHash3D(1);
    this.hiddenFish = -1;
    this.captureVfx = null;
    this.planktonMesh = null;
    this.metricsState = {
      frameMs: 0,
      fps: 0,
      pairCount: 0,
      captures: 0,
      dynamicContacts: 0,
    };
    this.rebuild(config);
  }

  dispose() {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    if (this.planktonMesh) {
      this.planktonMesh.removeFromParent();
      this.planktonMesh.geometry.dispose();
      this.planktonMesh.material.dispose();
      this.planktonMesh = null;
    }
    this.captureVfx?.dispose();
    this.captureVfx = null;
  }

  rebuild(config = this.config) {
    this.config = config;
    this.dispose();
    this.derived = deriveExperiment(config);
    this.count = this.derived.totalCount;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.forces = new Float32Array(this.count * 3);
    this.separation = new Float32Array(this.count * 3);
    this.cohesionSums = new Float32Array(this.count * 3);
    this.predationSums = new Float32Array(this.count * 3);
    this.alignmentSums = new Float32Array(this.count * 3);
    this.evadeForces = new Float32Array(this.count * 3);
    this.avoidanceDirections = new Float32Array(this.count * 3);
    this.schoolIds = new Uint16Array(this.count);
    this.alive = new Uint8Array(this.count);
    this.panic = new Float32Array(this.count);
    this.energy = new Float32Array(this.count);
    this.locomotionStates = new Uint8Array(this.count);
    this.cooldowns = new Float32Array(this.count);
    this.wanderPhases = new Float32Array(this.count);
    this.sameNeighbors = new Uint16Array(this.count);
    this.cohesionCounts = new Uint16Array(this.count);
    this.predationCounts = new Uint16Array(this.count);
    this.alignmentCounts = new Uint16Array(this.count);
    this.threatCounts = new Uint16Array(this.count);
    this.pursuitTargets = new Int32Array(this.count);
    this.lastPursuitTargets = new Int32Array(this.count);
    this.chaseStartTimes = new Float64Array(this.count);
    this.targetAlignment = new Float32Array(this.count);
    this.targetDistance2 = new Float32Array(this.count);
    this.schoolCenters = new Float32Array(config.schools.length * 3);
    this.schoolAliveCounts = new Uint16Array(config.schools.length);
    this.schoolRanges = [];
    let cursor = 0;
    for (
      let schoolIndex = 0;
      schoolIndex < config.schools.length;
      schoolIndex += 1
    ) {
      const start = cursor;
      cursor += this.derived.schools[schoolIndex].count;
      this.schoolRanges.push({ start, end: cursor });
      this.schoolIds.fill(schoolIndex, start, cursor);
    }
    if (this.scene?.add) {
      this.captureVfx = new CaptureVfx(
        this.scene,
        this.config.captureVfx
      );
    }
    this._buildMesh();
    this._buildPlanktonMesh();
    this.reset(config.runtime.seed);
  }

  _buildMesh() {
    if (!this.scene?.add) {
      this.mesh = null;
      return;
    }
    const radialSegments = Math.max(
      3,
      Math.round(this.config.visual.radialSegments)
    );
    const geometry = new THREE.CapsuleGeometry(
      this.config.visual.bodyRadius,
      this.config.visual.bodyLength,
      2,
      radialSegments
    );
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: this.config.visual.opacity < 1,
      opacity: this.config.visual.opacity,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.name = 'experiment-fish';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < this.count; index += 1) {
      const color = new THREE.Color(
        this.config.schools[this.schoolIds[index]].color
      );
      this.mesh.setColorAt(index, color);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  _buildPlanktonMesh() {
    if (!this.scene?.add || this.config.plankton.visualCount <= 0) {
      this.planktonMesh = null;
      return;
    }
    const count = Math.max(
      0,
      Math.round(this.config.plankton.visualCount)
    );
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const rng = new SeededRng(
      (Number(this.config.runtime.seed) ^ 0x9e3779b9) >>> 0
    );
    const margin = this.config.tank.wallMargin;
    const half = [
      Math.max(0, this.config.tank.width / 2 - margin),
      Math.max(0, this.config.tank.height / 2 - margin),
      Math.max(0, this.config.tank.depth / 2 - margin),
    ];
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = rng.range(-half[0], half[0]);
      positions[offset + 1] = rng.range(-half[1], half[1]);
      positions[offset + 2] = rng.range(-half[2], half[2]);
    }
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    const material = new THREE.PointsMaterial({
      color: this.config.plankton.color,
      size: this.config.plankton.pointSize,
      transparent: true,
      opacity: this.config.plankton.opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.planktonMesh = new THREE.Points(geometry, material);
    this.planktonMesh.name = 'experiment-plankton';
    this.planktonMesh.frustumCulled = false;
    this.scene.add(this.planktonMesh);
  }

  reset(seed = this.config.runtime.seed) {
    this.rng = new SeededRng(seed);
    this.seed = Number(seed);
    this.config.runtime.seed = this.seed;
    this.elapsed = 0;
    this.relations.reset();
    this.relationMatrix = this.relations.update(
      this.config.schools,
      this.config.relations
    );
    this.metricsState.pairCount = 0;
    this.metricsState.captures = 0;
    this.metricsState.dynamicContacts = 0;
    this.chaseTelemetry = new Map();
    this.deathCounts = this.config.schools.map(() => ({
      captured: 0,
      starved: 0,
    }));
    this.planktonLevel =
      this.config.plankton.capacity *
      this.config.plankton.initialFraction;
    this.planktonConsumed = 0;
    this.ecologyStatus = { state: 'running', winnerIndex: null };
    this.captureVfx?.reset();
    this.alive.fill(1);
    this.panic.fill(0);
    this.energy.fill(
      this.config.ecology.energyCapacity *
        this.config.ecology.initialEnergyRatio
    );
    this.locomotionStates.fill(LOCOMOTION.CRUISE);
    this.pursuitTargets.fill(-1);
    this.targetAlignment.fill(-Infinity);
    this.targetDistance2.fill(Infinity);
    this.lastPursuitTargets.fill(-1);
    this.chaseStartTimes.fill(-1);
    this.hiddenFish = -1;

    for (
      let schoolIndex = 0;
      schoolIndex < this.config.schools.length;
      schoolIndex += 1
    ) {
      const school = this.config.schools[schoolIndex];
      const range = this.schoolRanges[schoolIndex];
      const center = [
        school.spawnRegion.centerX * this.config.tank.width,
        school.spawnRegion.centerY * this.config.tank.height,
        school.spawnRegion.centerZ * this.config.tank.depth,
      ];
      const heading = normalize3(
        school.initialHeading.x,
        school.initialHeading.y,
        school.initialHeading.z
      );
      const pursuitSchool = this.relationMatrix[schoolIndex].includes(
        'pursuit'
      );
      const period = pursuitSchool
        ? perPredatorCooldown(
            this.derived.schools[schoolIndex].count,
            this.config.capture.targetCaptureRate
          )
        : Infinity;
      for (let index = range.start; index < range.end; index += 1) {
        const radius = school.spawnRegion.radius;
        const wall = this.config.tank.wallMargin;
        let spawn = center;
        for (
          let attempt = 0;
          attempt < this.config.runtime.initialSpawnAttempts;
          attempt += 1
        ) {
          const point = this.rng.inUnitSphere();
          const candidate = [
            clamp(
              center[0] + point[0] * radius,
              -this.config.tank.width / 2 + wall,
              this.config.tank.width / 2 - wall
            ),
            clamp(
              center[1] + point[1] * radius,
              -this.config.tank.height / 2 + wall,
              this.config.tank.height / 2 - wall
            ),
            clamp(
              center[2] + point[2] * radius,
              -this.config.tank.depth / 2 + wall,
              this.config.tank.depth / 2 - wall
            ),
          ];
          spawn = candidate;
          if (
            sceneClearance(candidate, this.config) >
            this.derived.schools[schoolIndex].visualLength / 2
          ) {
            break;
          }
        }
        set3(
          this.positions,
          index,
          spawn[0],
          spawn[1],
          spawn[2]
        );
        const jitter = this.rng.unitVector();
        const hx = heading[0] + jitter[0] * 0.16;
        const hy = heading[1] + jitter[1] * 0.16;
        const hz = heading[2] + jitter[2] * 0.16;
        const direction = normalize3(hx, hy, hz);
        set3(
          this.velocities,
          index,
          direction[0] * school.cruiseSpeed,
          direction[1] * school.cruiseSpeed,
          direction[2] * school.cruiseSpeed
        );
        this.cooldowns[index] = Number.isFinite(period)
          ? this.rng.range(0, period)
          : Infinity;
        this.wanderPhases[index] = this.rng.range(0, Math.PI * 2);
      }
    }
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this._syncPlanktonVisual();
    this.updateMesh();
    return this;
  }

  setConfig(config, mode = 'live') {
    this.config = config;
    if (this.captureVfx) this.captureVfx.params = config.captureVfx;
    this.derived = deriveExperiment(config);
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this.relationMatrix = this.relations.update(
      config.schools,
      config.relations
    );
    if (mode !== 'live') this.reset(config.runtime.seed);
    if (this.mesh) {
      this.mesh.material.opacity = config.visual.opacity;
      this.mesh.material.transparent = config.visual.opacity < 1;
      for (let index = 0; index < this.count; index += 1) {
        this.mesh.setColorAt(
          index,
          new THREE.Color(config.schools[this.schoolIds[index]].color)
        );
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
    this._syncPlanktonVisual();
  }

  _syncPlanktonVisual() {
    if (!this.planktonMesh) return;
    const visible =
      this.config.runtime.mode === 'ecology' &&
      this.config.plankton.enabled;
    this.planktonMesh.visible = visible;
    const fraction =
      this.config.plankton.capacity > EPSILON
        ? clamp(
            this.planktonLevel / this.config.plankton.capacity,
            0,
            1
          )
        : 0;
    const visibleCount = visible
      ? Math.round(this.config.plankton.visualCount * fraction)
      : 0;
    this.planktonMesh.geometry.setDrawRange(0, visibleCount);
    this.planktonMesh.material.size = this.config.plankton.pointSize;
    this.planktonMesh.material.opacity = this.config.plankton.opacity;
    this.planktonMesh.material.color.set(this.config.plankton.color);
  }

  _clearAccumulators() {
    this.forces.fill(0);
    this.separation.fill(0);
    this.cohesionSums.fill(0);
    this.predationSums.fill(0);
    this.alignmentSums.fill(0);
    this.evadeForces.fill(0);
    this.sameNeighbors.fill(0);
    this.cohesionCounts.fill(0);
    this.predationCounts.fill(0);
    this.alignmentCounts.fill(0);
    this.threatCounts.fill(0);
    this.pursuitTargets.fill(-1);
    this.targetAlignment.fill(-Infinity);
    this.targetDistance2.fill(Infinity);
    this.metricsState.pairCount = 0;
    this.metricsState.dynamicContacts = 0;
  }

  _telemetryFor(actorSchool, targetSchool) {
    const key = `${actorSchool}>${targetSchool}`;
    let record = this.chaseTelemetry.get(key);
    if (!record) {
      record = {
        starts: 0,
        pursuitFrames: 0,
        captures: 0,
        abandoned: 0,
        active: 0,
        completedDuration: 0,
        capturedDuration: 0,
        burstSeconds: 0,
      };
      this.chaseTelemetry.set(key, record);
    }
    return record;
  }

  _finishChase(predator, prey, captured) {
    if (prey < 0 || this.chaseStartTimes[predator] < 0) return;
    const actorSchool = this.schoolIds[predator];
    const targetSchool = this.schoolIds[prey];
    const record = this._telemetryFor(actorSchool, targetSchool);
    const duration = Math.max(
      0,
      this.elapsed - this.chaseStartTimes[predator]
    );
    record.completedDuration += duration;
    if (captured) {
      record.captures += 1;
      record.capturedDuration += duration;
    } else {
      record.abandoned += 1;
    }
    this.lastPursuitTargets[predator] = -1;
    this.chaseStartTimes[predator] = -1;
  }

  _updateChaseTelemetry(dt) {
    for (const record of this.chaseTelemetry.values()) record.active = 0;
    for (let predator = 0; predator < this.count; predator += 1) {
      if (!this.alive[predator]) {
        this._finishChase(
          predator,
          this.lastPursuitTargets[predator],
          false
        );
        continue;
      }
      const next = this.pursuitTargets[predator];
      const previous = this.lastPursuitTargets[predator];
      if (next !== previous) {
        this._finishChase(predator, previous, false);
        if (next >= 0 && this.alive[next]) {
          const actorSchool = this.schoolIds[predator];
          const targetSchool = this.schoolIds[next];
          const record = this._telemetryFor(actorSchool, targetSchool);
          record.starts += 1;
          this.lastPursuitTargets[predator] = next;
          this.chaseStartTimes[predator] = this.elapsed;
        }
      }
      const activeTarget = this.lastPursuitTargets[predator];
      if (activeTarget < 0 || !this.alive[activeTarget]) continue;
      const record = this._telemetryFor(
        this.schoolIds[predator],
        this.schoolIds[activeTarget]
      );
      record.active += 1;
      record.pursuitFrames += 1;
      if (this.locomotionStates[predator] === LOCOMOTION.BURST) {
        record.burstSeconds += dt;
      }
    }
  }

  _sameSchoolPair(i, j, dx, dy, dz, distance2) {
    const schoolIndex = this.schoolIds[i];
    const derived = this.derived.schools[schoolIndex];
    if (distance2 <= derived.cohesionRadius ** 2) {
      this.sameNeighbors[i] += 1;
      this.sameNeighbors[j] += 1;
      this.cohesionCounts[i] += 1;
      this.cohesionCounts[j] += 1;
      add3(
        this.cohesionSums,
        i,
        this.positions[j * 3],
        this.positions[j * 3 + 1],
        this.positions[j * 3 + 2]
      );
      add3(
        this.cohesionSums,
        j,
        this.positions[i * 3],
        this.positions[i * 3 + 1],
        this.positions[i * 3 + 2]
      );
    }
    if (distance2 <= derived.alignmentRadius ** 2) {
      this.alignmentCounts[i] += 1;
      this.alignmentCounts[j] += 1;
      add3(
        this.alignmentSums,
        i,
        this.velocities[j * 3],
        this.velocities[j * 3 + 1],
        this.velocities[j * 3 + 2]
      );
      add3(
        this.alignmentSums,
        j,
        this.velocities[i * 3],
        this.velocities[i * 3 + 1],
        this.velocities[i * 3 + 2]
      );
    }
    if (distance2 <= derived.separationRadius ** 2) {
      const distance = Math.sqrt(Math.max(EPSILON, distance2));
      const strength = 1 - distance / derived.separationRadius;
      const scale = strength / distance;
      add3(this.separation, i, -dx * scale, -dy * scale, -dz * scale);
      add3(this.separation, j, dx * scale, dy * scale, dz * scale);
    }
  }

  _crossSchoolPair(i, j, dx, dy, dz, distance2) {
    const schoolI = this.schoolIds[i];
    const schoolJ = this.schoolIds[j];
    const configSchoolI = this.config.schools[schoolI];
    const configSchoolJ = this.config.schools[schoolJ];
    const distance = Math.sqrt(Math.max(EPSILON, distance2));
    const crossRadius =
      this.config.perception.crossSeparationScale *
      Math.max(configSchoolI.size, configSchoolJ.size);
    if (distance < crossRadius) {
      const strength = 1 - distance / crossRadius;
      const scale = strength / distance;
      add3(this.separation, i, -dx * scale, -dy * scale, -dz * scale);
      add3(this.separation, j, dx * scale, dy * scale, dz * scale);
    }

    this._directedRelation(i, j, dx, dy, dz, distance, distance2);
    this._directedRelation(j, i, -dx, -dy, -dz, distance, distance2);
  }

  _directedRelation(
    actor,
    target,
    dx,
    dy,
    dz,
    distance,
    distance2
  ) {
    const actorSchool = this.schoolIds[actor];
    const targetSchool = this.schoolIds[target];
    const relation = this.relationMatrix[actorSchool][targetSchool];
    if (relation !== 'pursuit') return;
    const actorDetection =
      this.derived.schools[actorSchool].detectionLength;
    if (distance2 <= actorDetection * actorDetection) {
      add3(
        this.predationSums,
        actor,
        this.positions[target * 3],
        this.positions[target * 3 + 1],
        this.positions[target * 3 + 2]
      );
      this.predationCounts[actor] += 1;
    }

    const burstRadius =
      actorDetection * this.config.relations.burstRadiusFactor;
    if (distance2 <= burstRadius * burstRadius) {
      const actorOffset = actor * 3;
      const speed = normalize3(
        this.velocities[actorOffset],
        this.velocities[actorOffset + 1],
        this.velocities[actorOffset + 2]
      );
      const inverseDistance = 1 / Math.max(distance, EPSILON);
      const alignment =
        speed[0] * dx * inverseDistance +
        speed[1] * dy * inverseDistance +
        speed[2] * dz * inverseDistance;
      if (
        alignment > this.targetAlignment[actor] ||
        (alignment === this.targetAlignment[actor] &&
          distance2 < this.targetDistance2[actor])
      ) {
        this.pursuitTargets[actor] = target;
        this.targetAlignment[actor] = alignment;
        this.targetDistance2[actor] = distance2;
      }
    }

    // directThreat belongs to the prey and is proximity-driven. It does
    // not care whether this predator won target selection or is cooling down.
    const preyDetection =
      this.derived.schools[targetSchool].detectionLength;
    if (distance2 <= preyDetection * preyDetection) {
      this.threatCounts[target] += 1;
      const inverse = 1 / Math.max(distance, EPSILON);
      const awayX = dx * inverse;
      const awayY = dy * inverse;
      const awayZ = dz * inverse;
      const velocityOffset = target * 3;
      const lateral = normalize3(
        this.velocities[velocityOffset + 1] * awayZ -
          this.velocities[velocityOffset + 2] * awayY,
        this.velocities[velocityOffset + 2] * awayX -
          this.velocities[velocityOffset] * awayZ,
        this.velocities[velocityOffset] * awayY -
          this.velocities[velocityOffset + 1] * awayX
      );
      add3(
        this.evadeForces,
        target,
        awayX +
          lateral[0] * this.config.relations.evadeLateralWeight,
        awayY +
          lateral[1] * this.config.relations.evadeLateralWeight,
        awayZ +
          lateral[2] * this.config.relations.evadeLateralWeight
      );
    }
  }

  _pairPasses() {
    this.hash.forEachPair((i, j) => {
      this.metricsState.pairCount += 1;
      const io = i * 3;
      const jo = j * 3;
      const dx = this.positions[jo] - this.positions[io];
      const dy = this.positions[jo + 1] - this.positions[io + 1];
      const dz = this.positions[jo + 2] - this.positions[io + 2];
      const distance2 = dx * dx + dy * dy + dz * dz;
      if (this.schoolIds[i] === this.schoolIds[j]) {
        this._sameSchoolPair(i, j, dx, dy, dz, distance2);
      }
    });
    this.hash.forEachPair((i, j) => {
      if (this.schoolIds[i] === this.schoolIds[j]) return;
      const io = i * 3;
      const jo = j * 3;
      const dx = this.positions[jo] - this.positions[io];
      const dy = this.positions[jo + 1] - this.positions[io + 1];
      const dz = this.positions[jo + 2] - this.positions[io + 2];
      const distance2 = dx * dx + dy * dy + dz * dz;
      this._crossSchoolPair(i, j, dx, dy, dz, distance2);
    });
  }

  _boundaryForce(index) {
    const offset = index * 3;
    const half = [
      this.config.tank.width / 2,
      this.config.tank.height / 2,
      this.config.tank.depth / 2,
    ];
    const softness = this.config.tank.edgeSoftness;
    const force = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const value = this.positions[offset + axis];
      const negativeDistance = value + half[axis];
      const positiveDistance = half[axis] - value;
      if (negativeDistance < softness) {
        force[axis] += 1 - negativeDistance / softness;
      }
      if (positiveDistance < softness) {
        force[axis] -= 1 - positiveDistance / softness;
      }
    }
    return force;
  }

  _movementState(index, target, threatened) {
    const state =
      target >= 0 && this.alive[target]
        ? 'burst'
        : threatened
          ? 'evade'
          : 'cruise';
    this.locomotionStates[index] =
      state === 'burst'
        ? LOCOMOTION.BURST
        : state === 'evade'
          ? LOCOMOTION.EVADE
          : LOCOMOTION.CRUISE;
    return state;
  }

  _steerFish(index, dt) {
    if (!this.alive[index]) return;
    const offset = index * 3;
    const schoolIndex = this.schoolIds[index];
    const school = this.config.schools[schoolIndex];
    const cohesionCount = this.cohesionCounts[index];
    const alignmentCount = this.alignmentCounts[index];
    let fx = this.separation[offset] * school.separationWeight;
    let fy = this.separation[offset + 1] * school.separationWeight;
    let fz = this.separation[offset + 2] * school.separationWeight;
    if (cohesionCount > 0) {
      fx +=
        (this.cohesionSums[offset] / cohesionCount -
          this.positions[offset]) *
        school.cohesionWeight;
      fy +=
        (this.cohesionSums[offset + 1] / cohesionCount -
          this.positions[offset + 1]) *
        school.cohesionWeight;
      fz +=
        (this.cohesionSums[offset + 2] / cohesionCount -
          this.positions[offset + 2]) *
        school.cohesionWeight;
    }
    const schoolCenterOffset = schoolIndex * 3;
    if (this.schoolAliveCounts[schoolIndex] > 1) {
      const globalWeight =
        school.cohesionWeight *
        this.config.perception.globalCohesionFactor;
      fx +=
        (this.schoolCenters[schoolCenterOffset] -
          this.positions[offset]) *
        globalWeight;
      fy +=
        (this.schoolCenters[schoolCenterOffset + 1] -
          this.positions[offset + 1]) *
        globalWeight;
      fz +=
        (this.schoolCenters[schoolCenterOffset + 2] -
          this.positions[offset + 2]) *
        globalWeight;
    }
    if (alignmentCount > 0) {
      fx +=
        (this.alignmentSums[offset] / alignmentCount -
          this.velocities[offset]) *
        school.alignmentWeight;
      fy +=
        (this.alignmentSums[offset + 1] / alignmentCount -
          this.velocities[offset + 1]) *
        school.alignmentWeight;
      fz +=
        (this.alignmentSums[offset + 2] / alignmentCount -
          this.velocities[offset + 2]) *
        school.alignmentWeight;
    }

    const threatened = this.threatCounts[index] > 0;
    this.panic[index] = approach(
      this.panic[index],
      threatened ? this.config.relations.directThreatPanic : 0,
      threatened
        ? this.config.relations.panicRiseRate
        : this.config.relations.panicDecayRate,
      dt
    );
    if (threatened) {
      fx += this.evadeForces[offset] * this.config.relations.evadeWeight;
      fy +=
        this.evadeForces[offset + 1] * this.config.relations.evadeWeight;
      fz +=
        this.evadeForces[offset + 2] * this.config.relations.evadeWeight;
    }

    const localPredationCount = this.predationCounts[index];
    if (localPredationCount > 0) {
      fx +=
        (this.predationSums[offset] / localPredationCount -
          this.positions[offset]) *
        this.config.relations.pursuitWeight;
      fy +=
        (this.predationSums[offset + 1] / localPredationCount -
          this.positions[offset + 1]) *
        this.config.relations.pursuitWeight;
      fz +=
        (this.predationSums[offset + 2] / localPredationCount -
          this.positions[offset + 2]) *
        this.config.relations.pursuitWeight;
    } else {
      let preyCount = 0;
      let preyX = 0;
      let preyY = 0;
      let preyZ = 0;
      for (
        let preySchool = 0;
        preySchool < this.config.schools.length;
        preySchool += 1
      ) {
        if (this.relationMatrix[schoolIndex][preySchool] !== 'pursuit') {
          continue;
        }
        const aliveCount = this.schoolAliveCounts[preySchool];
        const preyOffset = preySchool * 3;
        preyCount += aliveCount;
        preyX += this.schoolCenters[preyOffset] * aliveCount;
        preyY += this.schoolCenters[preyOffset + 1] * aliveCount;
        preyZ += this.schoolCenters[preyOffset + 2] * aliveCount;
      }
      if (preyCount > 0) {
        fx +=
          (preyX / preyCount - this.positions[offset]) *
          this.config.relations.pursuitWeight;
        fy +=
          (preyY / preyCount - this.positions[offset + 1]) *
          this.config.relations.pursuitWeight;
        fz +=
          (preyZ / preyCount - this.positions[offset + 2]) *
          this.config.relations.pursuitWeight;
      }
    }

    const target = this.pursuitTargets[index];
    if (target >= 0 && this.alive[target]) {
      const targetOffset = target * 3;
      const distance = Math.sqrt(this.targetDistance2[index]);
      const lookAhead = Math.min(
        this.config.locomotion.interceptLookAhead,
        distance / Math.max(EPSILON, school.maxSpeed)
      );
      const ix =
        this.positions[targetOffset] +
        this.velocities[targetOffset] * lookAhead;
      const iy =
        this.positions[targetOffset + 1] +
        this.velocities[targetOffset + 1] * lookAhead;
      const iz =
        this.positions[targetOffset + 2] +
        this.velocities[targetOffset + 2] * lookAhead;
      const pursuit = normalize3(
        ix - this.positions[offset],
        iy - this.positions[offset + 1],
        iz - this.positions[offset + 2]
      );
      const weight = this.config.relations.burstWeight;
      fx += pursuit[0] * weight;
      fy += pursuit[1] * weight;
      fz += pursuit[2] * weight;
    }

    const boundary = this._boundaryForce(index);
    fx += boundary[0] * this.config.locomotion.boundaryWeight;
    fy += boundary[1] * this.config.locomotion.boundaryWeight;
    fz += boundary[2] * this.config.locomotion.boundaryWeight;

    const point = [
      this.positions[offset],
      this.positions[offset + 1],
      this.positions[offset + 2],
    ];
    const query = this.distanceField?.query(point);
    if (query && query.clearance < this.config.tank.edgeSoftness) {
      const closeness =
        1 -
        clamp(
          query.clearance / Math.max(EPSILON, this.config.tank.edgeSoftness),
          0,
          1
        );
      const inertia = this.config.locomotion.avoidanceInertia;
      this.avoidanceDirections[offset] =
        this.avoidanceDirections[offset] * inertia +
        query.gradient[0] * (1 - inertia);
      this.avoidanceDirections[offset + 1] =
        this.avoidanceDirections[offset + 1] * inertia +
        query.gradient[1] * (1 - inertia);
      this.avoidanceDirections[offset + 2] =
        this.avoidanceDirections[offset + 2] * inertia +
        query.gradient[2] * (1 - inertia);
      const suppression = Math.max(
        0.15,
        1 -
          this.panic[index] *
            this.config.locomotion.panicAvoidanceSuppression
      );
      const weight =
        this.config.locomotion.avoidanceWeight * closeness * suppression;
      fx += this.avoidanceDirections[offset] * weight;
      fy += this.avoidanceDirections[offset + 1] * weight;
      fz += this.avoidanceDirections[offset + 2] * weight;
    }

    this.wanderPhases[index] += dt * (0.7 + (index % 13) * 0.017);
    const phase = this.wanderPhases[index];
    fx += Math.sin(phase * 1.31) * this.config.locomotion.wanderWeight;
    fy += Math.sin(phase * 1.73 + 2.1) * this.config.locomotion.wanderWeight;
    fz += Math.cos(phase * 1.17) * this.config.locomotion.wanderWeight;

    const dynamic = this.physics?.interactFish(point, [
      this.velocities[offset],
      this.velocities[offset + 1],
      this.velocities[offset + 2],
    ]);
    if (dynamic) {
      fx += dynamic.force[0] * this.config.locomotion.avoidanceWeight;
      fy += dynamic.force[1] * this.config.locomotion.avoidanceWeight;
      fz += dynamic.force[2] * this.config.locomotion.avoidanceWeight;
      this.metricsState.dynamicContacts += dynamic.contacts;
    }

    const force = normalize3(fx, fy, fz);
    const forceBudget =
      target >= 0 && this.alive[target]
        ? this.config.locomotion.maxForce *
          Math.max(1, this.config.relations.burstWeight)
        : this.config.locomotion.maxForce;
    const forceMagnitude = Math.min(
      forceBudget,
      force[3]
    );
    const oldVx = this.velocities[offset];
    const oldVy = this.velocities[offset + 1];
    const oldVz = this.velocities[offset + 2];
    let nextVx = oldVx + force[0] * forceMagnitude * dt;
    let nextVy = oldVy + force[1] * forceMagnitude * dt;
    let nextVz = oldVz + force[2] * forceMagnitude * dt;
    const nextDirection = normalize3(nextVx, nextVy, nextVz);
    const oldDirection = normalize3(oldVx, oldVy, oldVz);
    const dot = clamp(
      oldDirection[0] * nextDirection[0] +
        oldDirection[1] * nextDirection[1] +
        oldDirection[2] * nextDirection[2],
      -1,
      1
    );
    const angle = Math.acos(dot);
    const turnSpeed = effectiveTurnSpeed(this.config, school);
    const turnAlpha =
      angle <= EPSILON
        ? 1
        : Math.min(1, (turnSpeed * dt) / angle);
    const turned = normalize3(
      oldDirection[0] * (1 - turnAlpha) + nextDirection[0] * turnAlpha,
      oldDirection[1] * (1 - turnAlpha) + nextDirection[1] * turnAlpha,
      oldDirection[2] * (1 - turnAlpha) + nextDirection[2] * turnAlpha
    );
    let desiredSpeed = nextDirection[3];
    const cruiseSpeed =
      school.cruiseSpeed * sustainedSpeedScale(this.config, school);
    if (desiredSpeed < cruiseSpeed) {
      desiredSpeed = approach(desiredSpeed, cruiseSpeed, 3, dt);
    }
    const state = this._movementState(index, target, threatened);
    const maxSpeed = effectiveMaxSpeed(this.config, school, state);
    desiredSpeed = Math.min(maxSpeed, desiredSpeed);
    nextVx = turned[0] * desiredSpeed;
    nextVy = turned[1] * desiredSpeed;
    nextVz = turned[2] * desiredSpeed;
    set3(this.velocities, index, nextVx, nextVy, nextVz);
  }

  _integrate(index, dt) {
    if (!this.alive[index]) return;
    const offset = index * 3;
    this.positions[offset] += this.velocities[offset] * dt;
    this.positions[offset + 1] += this.velocities[offset + 1] * dt;
    this.positions[offset + 2] += this.velocities[offset + 2] * dt;
    const half = [
      this.config.tank.width / 2 - this.config.tank.wallMargin,
      this.config.tank.height / 2 - this.config.tank.wallMargin,
      this.config.tank.depth / 2 - this.config.tank.wallMargin,
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      if (this.positions[offset + axis] < -half[axis]) {
        this.positions[offset + axis] = -half[axis];
        this.velocities[offset + axis] = Math.abs(
          this.velocities[offset + axis]
        );
      } else if (this.positions[offset + axis] > half[axis]) {
        this.positions[offset + axis] = half[axis];
        this.velocities[offset + axis] = -Math.abs(
          this.velocities[offset + axis]
        );
      }
    }
  }

  _activeSchoolCount(schoolIndex) {
    const range = this.schoolRanges[schoolIndex];
    let count = 0;
    for (let index = range.start; index < range.end; index += 1) {
      count += this.alive[index];
    }
    return count;
  }

  _killFish(index, reason) {
    if (!this.alive[index]) return false;
    this.alive[index] = 0;
    const schoolIndex = this.schoolIds[index];
    if (reason === 'captured') {
      this.deathCounts[schoolIndex].captured += 1;
    } else if (reason === 'starved') {
      this.deathCounts[schoolIndex].starved += 1;
      if (this.config.ecology.starvationVfxEnabled) {
        const offset = index * 3;
        const position = new THREE.Vector3(
          this.positions[offset],
          this.positions[offset + 1],
          this.positions[offset + 2]
        );
        this.captureVfx?.emit(
          position,
          new THREE.Vector3(0, 0, 0),
          position
        );
      }
    }
    return true;
  }

  _updateEcology(dt) {
    if (this.config.runtime.mode !== 'ecology') return;
    const plankton = this.config.plankton;
    const capacity = plankton.capacity;
    const halfSaturation =
      capacity * plankton.halfSaturationFraction;
    const availability =
      plankton.enabled && this.planktonLevel > 0
        ? this.planktonLevel /
          Math.max(EPSILON, this.planktonLevel + halfSaturation)
        : 0;
    let requestedConsumption = 0;
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      const school = this.config.schools[this.schoolIds[index]];
      requestedConsumption +=
        school.grazeRate *
        plankton.maxIntakePerFish *
        availability *
        dt;
    }
    const resource = stepPlankton({
      level: this.planktonLevel,
      capacity,
      growthRate: plankton.enabled ? plankton.growthRate : 0,
      requestedConsumption,
      dt,
    });
    this.planktonLevel = resource.level;
    this.planktonConsumed += resource.consumed;
    const starved = [];
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      const school = this.config.schools[this.schoolIds[index]];
      const intake =
        school.grazeRate *
        plankton.maxIntakePerFish *
        availability *
        dt *
        resource.fulfillment *
        plankton.energyConversion;
      const drain =
        metabolicRate(
          this.config,
          school,
          this.locomotionStates[index] === LOCOMOTION.BURST
        ) * dt;
      this.energy[index] = Math.min(
        this.config.ecology.energyCapacity,
        this.energy[index] + intake - drain
      );
      if (this.energy[index] <= 0) starved.push(index);
    }
    for (const index of starved) this._killFish(index, 'starved');
    const aliveCounts = this.config.schools.map((_, schoolIndex) =>
      this._activeSchoolCount(schoolIndex)
    );
    this.ecologyStatus = ecologyOutcome(aliveCounts);
    this._syncPlanktonVisual();
  }

  _capture(dt) {
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      this.cooldowns[index] = Math.max(0, this.cooldowns[index] - dt);
    }
    for (let predator = 0; predator < this.count; predator += 1) {
      const prey = this.pursuitTargets[predator];
      if (
        !this.alive[predator] ||
        prey < 0 ||
        !this.alive[prey] ||
        this.cooldowns[predator] > 0
      ) {
        continue;
      }
      const predatorSchool = this.schoolIds[predator];
      const preySchool = this.schoolIds[prey];
      if (
        relationBetween(
          this.config.schools[predatorSchool],
          this.config.schools[preySchool],
          this.config.relations
        ) !== 'pursuit'
      ) {
        continue;
      }
      const po = predator * 3;
      const qo = prey * 3;
      const distance = Math.hypot(
        this.positions[qo] - this.positions[po],
        this.positions[qo + 1] - this.positions[po + 1],
        this.positions[qo + 2] - this.positions[po + 2]
      );
      const radius = captureRadius(
        this.config,
        this.config.schools[predatorSchool],
        this.config.schools[preySchool]
      );
      if (distance > radius) continue;
      this.captureVfx?.emit(
        new THREE.Vector3(
          this.positions[qo],
          this.positions[qo + 1],
          this.positions[qo + 2]
        ),
        new THREE.Vector3(
          this.velocities[po],
          this.velocities[po + 1],
          this.velocities[po + 2]
        ),
        new THREE.Vector3(
          this.positions[po],
          this.positions[po + 1],
          this.positions[po + 2]
        )
      );
      this._finishChase(predator, prey, true);
      this._killFish(prey, 'captured');
      this.metricsState.captures += 1;
      if (this.config.runtime.mode === 'ecology') {
        this.energy[predator] = Math.min(
          this.config.ecology.energyCapacity,
          this.energy[predator] +
            this.config.ecology.captureEnergyPerSize *
              this.config.schools[preySchool].size
        );
      }
      this.cooldowns[predator] = perPredatorCooldown(
        this._activeSchoolCount(predatorSchool),
        this.config.capture.targetCaptureRate
      );
    }
  }

  _advance(dt) {
    if (
      this.config.runtime.mode === 'ecology' &&
      this.ecologyStatus.state !== 'running'
    ) {
      return;
    }
    this.elapsed += dt;
    this.derived = deriveExperiment(this.config);
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this.relationMatrix = this.relations.update(
      this.config.schools,
      this.config.relations
    );
    this._clearAccumulators();
    this.hash.build(this.positions, this.alive, this.count);
    this._pairPasses();
    this.schoolCenters.fill(0);
    this.schoolAliveCounts.fill(0);
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      const schoolIndex = this.schoolIds[index];
      const centerOffset = schoolIndex * 3;
      const offset = index * 3;
      this.schoolCenters[centerOffset] += this.positions[offset];
      this.schoolCenters[centerOffset + 1] += this.positions[offset + 1];
      this.schoolCenters[centerOffset + 2] += this.positions[offset + 2];
      this.schoolAliveCounts[schoolIndex] += 1;
    }
    for (
      let schoolIndex = 0;
      schoolIndex < this.config.schools.length;
      schoolIndex += 1
    ) {
      const count = Math.max(1, this.schoolAliveCounts[schoolIndex]);
      const offset = schoolIndex * 3;
      this.schoolCenters[offset] /= count;
      this.schoolCenters[offset + 1] /= count;
      this.schoolCenters[offset + 2] /= count;
    }
    for (let index = 0; index < this.count; index += 1) {
      this._steerFish(index, dt);
    }
    this._updateChaseTelemetry(dt);
    for (let index = 0; index < this.count; index += 1) {
      this._integrate(index, dt);
    }
    this._capture(dt);
    this._updateEcology(dt);
    this.physics?.step(dt);
    this.updateMesh();
  }

  step(dt) {
    const start = performance.now();
    this._advance(dt);
    const frameMs = performance.now() - start;
    this.metricsState.frameMs = approach(
      this.metricsState.frameMs,
      frameMs,
      4,
      dt
    );
    this.metricsState.fps =
      this.metricsState.frameMs > 0
        ? Math.min(999, 1000 / this.metricsState.frameMs)
        : 0;
    this.captureVfx?.step(dt);
  }

  updateMesh() {
    if (!this.mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const direction = new THREE.Vector3();
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      position.set(
        this.positions[offset],
        this.positions[offset + 1],
        this.positions[offset + 2]
      );
      if (!this.alive[index] || index === this.hiddenFish) {
        scale.setScalar(0);
        quaternion.identity();
      } else {
        const school = this.config.schools[this.schoolIds[index]];
        scale.setScalar(school.size);
        direction
          .set(
            this.velocities[offset],
            this.velocities[offset + 1],
            this.velocities[offset + 2]
          )
          .normalize();
        if (direction.lengthSq() <= EPSILON) direction.copy(FORWARD);
        quaternion.setFromUnitVectors(FORWARD, direction);
      }
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(index, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  averageNeighbors(schoolIndex) {
    const range = this.schoolRanges[schoolIndex];
    let total = 0;
    let count = 0;
    for (let index = range.start; index < range.end; index += 1) {
      if (!this.alive[index]) continue;
      total += this.sameNeighbors[index];
      count += 1;
    }
    return count > 0 ? total / count : 0;
  }

  averageEnergy(schoolIndex) {
    const range = this.schoolRanges[schoolIndex];
    let total = 0;
    let count = 0;
    for (let index = range.start; index < range.end; index += 1) {
      if (!this.alive[index]) continue;
      total +=
        this.energy[index] /
        Math.max(EPSILON, this.config.ecology.energyCapacity);
      count += 1;
    }
    return count > 0 ? total / count : 0;
  }

  aliveCount(schoolIndex) {
    return this._activeSchoolCount(schoolIndex);
  }

  fish(index) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.count
    ) {
      return null;
    }
    const offset = index * 3;
    return {
      index,
      alive: Boolean(this.alive[index]),
      schoolIndex: this.schoolIds[index],
      school: this.config.schools[this.schoolIds[index]],
      position: [
        this.positions[offset],
        this.positions[offset + 1],
        this.positions[offset + 2],
      ],
      velocity: [
        this.velocities[offset],
        this.velocities[offset + 1],
        this.velocities[offset + 2],
      ],
      panic: this.panic[index],
      energy: this.energy[index],
      locomotionState: LOCOMOTION_LABEL[this.locomotionStates[index]],
    };
  }

  nearestAliveSameSchool(index) {
    const source = this.fish(index);
    if (!source) return -1;
    let result = -1;
    let distance2 = Infinity;
    const range = this.schoolRanges[source.schoolIndex];
    for (let other = range.start; other < range.end; other += 1) {
      if (other === index || !this.alive[other]) continue;
      const offset = other * 3;
      const dx = this.positions[offset] - source.position[0];
      const dy = this.positions[offset + 1] - source.position[1];
      const dz = this.positions[offset + 2] - source.position[2];
      const candidate = dx * dx + dy * dy + dz * dz;
      if (candidate < distance2) {
        result = other;
        distance2 = candidate;
      }
    }
    return result;
  }

  setHiddenFish(index = -1) {
    this.hiddenFish = index;
    this.updateMesh();
  }

  metrics() {
    const predatorPairs = [];
    for (let actor = 0; actor < this.config.schools.length; actor += 1) {
      for (let target = 0; target < this.config.schools.length; target += 1) {
        if (this.relationMatrix[actor][target] !== 'pursuit') continue;
        const actorSchool = this.config.schools[actor];
        const targetSchool = this.config.schools[target];
        const telemetry = this._telemetryFor(actor, target);
        const radius = captureRadius(
          this.config,
          actorSchool,
          targetSchool
        );
        const pursuitSpeed = effectiveMaxSpeed(
          this.config,
          actorSchool,
          'burst'
        );
        const evadeSpeed = effectiveMaxSpeed(
          this.config,
          targetSchool,
          'evade'
        );
        const closingSpeed = pursuitSpeed - evadeSpeed;
        predatorPairs.push({
          actor: actorSchool.id,
          target: targetSchool.id,
          captureRadius: radius,
          perPredatorCooldown: perPredatorCooldown(
            this._activeSchoolCount(actor),
            this.config.capture.targetCaptureRate
          ),
          pursuitSpeed,
          evadeSpeed,
          closingSpeed,
          nominalClosureSeconds:
            closingSpeed > EPSILON
              ? Math.max(
                  0,
                  this.derived.schools[actor].detectionLength - radius
                ) / closingSpeed
              : Infinity,
          chaseStarts: telemetry.starts,
          pursuitFrames: telemetry.pursuitFrames,
          activeChases: telemetry.active,
          captures: telemetry.captures,
          abandoned: telemetry.abandoned,
          conversion:
            telemetry.starts > 0
              ? telemetry.captures / telemetry.starts
              : 0,
          averageChaseSeconds:
            telemetry.captures + telemetry.abandoned > 0
              ? telemetry.completedDuration /
                (telemetry.captures + telemetry.abandoned)
              : 0,
          averageCaptureChaseSeconds:
            telemetry.captures > 0
              ? telemetry.capturedDuration / telemetry.captures
              : 0,
          burstSeconds: telemetry.burstSeconds,
        });
      }
    }
    const ecologyWinner =
      this.ecologyStatus.winnerIndex === null
        ? null
        : this.config.schools[this.ecologyStatus.winnerIndex];
    const warnings = [];
    if (
      this.config.locomotion.burstFactor <=
      this.config.locomotion.panicSpeedFactor
    ) {
      warnings.push('burstFactor ≤ panicSpeedFactor');
    }
    if (predatorPairs.some((pair) => pair.closingSpeed <= 0)) {
      warnings.push('至少一条捕食关系的名义闭合速度 ≤ 0');
    }
    return {
      seed: this.seed,
      elapsed: this.elapsed,
      project: this.config.runtime.project,
      mode: this.config.runtime.mode,
      population: this.config.schools.map((school, index) => ({
        id: school.id,
        name: school.name,
        size: school.size,
        alive: this.aliveCount(index),
        target: this.derived.schools[index].count,
        neighborRadius: this.derived.schools[index].neighborRadius,
        separationRadius:
          this.derived.schools[index].separationRadius,
        alignmentRadius:
          this.derived.schools[index].alignmentRadius,
        cohesionRadius:
          this.derived.schools[index].cohesionRadius,
        detectionLength: this.derived.schools[index].detectionLength,
        burstRadius:
          this.derived.schools[index].detectionLength *
          this.config.relations.burstRadiusFactor,
        measuredNeighbors: this.averageNeighbors(index),
        averageEnergy: this.averageEnergy(index),
        deaths: { ...this.deathCounts[index] },
      })),
      relationMatrix: this.relationMatrix,
      pairCount: this.metricsState.pairCount,
      captures: this.metricsState.captures,
      captureParticles: this.captureVfx?.particles.length ?? 0,
      dynamicContacts: this.metricsState.dynamicContacts,
      rigidBodies: this.physics?.metrics?.() ?? [],
      simulationMs: this.metricsState.frameMs,
      simulationFps: this.metricsState.fps,
      renderFps: this.metricsState.renderFps ?? 0,
      predatorPairs,
      ecology: {
        state: this.ecologyStatus.state,
        winnerId: ecologyWinner?.id ?? null,
        winnerName: ecologyWinner?.name ?? null,
        plankton: {
          level: this.planktonLevel,
          capacity: this.config.plankton.capacity,
          fraction:
            this.config.plankton.capacity > EPSILON
              ? this.planktonLevel / this.config.plankton.capacity
              : 0,
          consumed: this.planktonConsumed,
        },
        deaths: this.deathCounts.map((entry, schoolIndex) => ({
          schoolId: this.config.schools[schoolIndex].id,
          ...entry,
        })),
      },
      tankVolume: tankVolume(this.config.tank),
      warnings,
    };
  }
}
