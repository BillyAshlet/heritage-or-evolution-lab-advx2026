import * as THREE from 'three';
import { TANK } from './world.js';
import {
  ENERGY_PARAMS,
  PANIC_PARAMS,
  TRAITS,
  TRAIT_MAPPING,
  derivePhenotype,
  distanceSignal,
  energyDrainPerSecond,
  energyResponse,
  exponentialApproach,
  threatFromDistance,
} from './evolution-model.js';

// The flock 鱼群. Craig Reynolds (1986): each fish, each step, sums a
// handful of local steering forces — separation, alignment, cohesion,
// obstacle avoidance, and a speed keeper. Nothing is choreographed;
// everything the school appears to "decide" emerges from these weights.
// 简单规则，复杂系统。

// Raw Reynolds-boid baseline. Inherited traits bend these values at runtime;
// the debug panel keeps both layers visible so the translation can be tuned.
export const BOID_PARAMS = {
  fishCount: 36,
  cruiseSpeed: 0.23, // m/s — preferred swimming speed
  maxSpeed: 0.46, // m/s — hard ceiling (~2× cruise so fish can actually reach it)
  maxForce: 5.2, // m/s² — steering clamp per rule
  separationRadius: 0.1, // personal space
  // Deliberately stronger than cohesion at the neutral point. This prevents
  // alignment/cohesion from visually "washing out" personal space, while the
  // size translation below still makes small schools much tighter.
  separationWeight: 0.8,
  // Distance→weight shape for separation (A/B live): 'inverse' 1/d (the
  // original), 'linear' (r−d)/r, 'invlog' ln(r/d) — flat mid-band, sharp
  // only at close approach. NOTE: steerToward normalizes the summed
  // vector, so shape changes how near neighbors outvote far ones in the
  // *direction*, not the force magnitude.
  sepFalloff: 'inverse',
  alignmentRadius: 0.24, // conformity neighborhood
  alignmentWeight: 0.45,
  cohesionRadius: 0.45, // belonging neighborhood
  cohesionWeight: 0.4,
  // Forward field of view, degrees (360 = omnidirectional = off).
  // Applies to ALIGNMENT and COHESION only — vision drives schooling.
  // Separation stays omnidirectional by design: it models lateral-line
  // proximity sense, and blinding it behind causes rear-end collisions.
  // The experiment (Billy's hypothesis, 2026-07-17): a forward cone
  // breaks pair symmetry, so direction information must TRAVEL through
  // the school instead of propagating instantly — the delay may be what
  // lets local pockets (multi-gyre) form and persist.
  perceptionFOV: 300,
  detectionLength: 0.23, // forward ray length
  avoidanceWeight: 1.0,
  // Gentle constant pull toward tank center (向心). 0 = off (checkpoint
  // behavior). The honest version of the accidental containment that a
  // tank-sized detectionLength once produced — A/B it against pure wall
  // avoidance without abusing the ray length.
  centeringWeight: 0,
  angleStep: 18, // degrees per rotation attempt when the ray hits
  maxPitch: 57, // degrees — fish never swim like submarines
  turnSpeed: 2.8, // rad/s — heading change cap; makes turns read as swimming
};

// Fish keep this far off the glass — the avoidance ray tests against
// this shrunken inner box, not the visual walls.
const WALL_MARGIN = 0.05;
const UP = new THREE.Vector3(0, 1, 0);

// Half neighborhood (13 of 26 cells): with same-cell pairs taken in
// sorted order, every cell pair is visited exactly once.
const FWD = [];
for (let oz = -1; oz <= 1; oz++) {
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      if (oz > 0 || (oz === 0 && oy > 0) || (oz === 0 && oy === 0 && ox > 0)) {
        FWD.push([ox, oy, oz]);
      }
    }
  }
}

// Scratch vectors — step() runs 60×/s over every fish; no allocations.
const _sep = new THREE.Vector3();
const _ali = new THREE.Vector3();
const _emergencyAli = new THREE.Vector3();
const _coh = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _force = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _cand = new THREE.Vector3();
const _newVel = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _scale = new THREE.Vector3();
const _predictedPredator = new THREE.Vector3();
const _color = new THREE.Color();

// Distance from a point along a direction to the inner box boundary
// (ray-vs-AABB from inside). Returns Infinity for degenerate directions.
function distToWall(p, d) {
  const hx = TANK.width / 2 - WALL_MARGIN;
  const hy = TANK.height / 2 - WALL_MARGIN;
  const hz = TANK.depth / 2 - WALL_MARGIN;
  let t = Infinity;
  if (Math.abs(d.x) > 1e-8) t = Math.min(t, ((d.x > 0 ? hx : -hx) - p.x) / d.x);
  if (Math.abs(d.y) > 1e-8) t = Math.min(t, ((d.y > 0 ? hy : -hy) - p.y) / d.y);
  if (Math.abs(d.z) > 1e-8) t = Math.min(t, ((d.z > 0 ? hz : -hz) - p.z) / d.z);
  return Math.max(t, 0);
}

function isActivePredatorAgent(agent) {
  return Boolean(
    agent &&
    agent.position &&
    agent.velocity &&
    agent.active !== false &&
    agent.enabled !== false &&
    agent.alive !== false &&
    agent.params?.enabled !== false
  );
}

// desired direction (not necessarily unit) → clamped steering force
function steerToward(
  desired,
  vel,
  out,
  maxSpeed = BOID_PARAMS.maxSpeed,
  maxForce = BOID_PARAMS.maxForce
) {
  out
    .copy(desired)
    .normalize()
    .multiplyScalar(maxSpeed)
    .sub(vel)
    .clampLength(0, maxForce);
  return out;
}

export class Flock {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.positions = [];
    this.velocities = [];
    this.forces = []; // last net steering per fish — fed to the visualizer
    this.predator = null;
    this._activePredators = [];
    this.derived = derivePhenotype(BOID_PARAMS);
    this.initialCount = 0;
    this.aliveCount = 0;
    this.panicCount = 0;
    this.averageEnergyRatio = 1;
    this.deaths = { eaten: 0, starved: 0 };
    this.lastStepMs = 0; // instrument: social+integrate cost per step
    this.lastPairMode = 'brute'; // 'grid' | 'brute' — which pass ran
    this._geo = new THREE.CapsuleGeometry(0.008, 0.03, 4, 8);
    this._geo.rotateX(Math.PI / 2); // capsule length along +Z = forward
    this._mat = new THREE.MeshBasicMaterial({
      // White preserves the exact per-instance school-blue multiplier.
      color: '#ffffff',
    });
    this.mesh = null;
    this.setCount(BOID_PARAMS.fishCount);
    world.systems.push(this);
  }

  setCount(n) {
    n = Math.max(1, Math.round(n));
    BOID_PARAMS.fishCount = n;
    this.positions = Array.from({ length: n }, () => new THREE.Vector3());
    this.velocities = Array.from({ length: n }, () => new THREE.Vector3());
    this.forces = Array.from({ length: n }, () => new THREE.Vector3());

    // Flat scratch buffers for the social pair pass (see step()'s perf
    // note). Rebuilt with the school; never touched by consumers.
    this._f32 = {};
    for (const k of [
      'px', 'py', 'pz', 'vx', 'vy', 'vz', 'fx', 'fy', 'fz',
      'sepX', 'sepY', 'sepZ', 'aliX', 'aliY', 'aliZ', 'cohX', 'cohY', 'cohZ',
      'aliW', 'emAliX', 'emAliY', 'emAliZ', 'emAliUrgency',
      'incoming', 'targetSpeed', 'maxSpeed', 'energySpeed',
    ]) {
      this._f32[k] = new Float32Array(n);
    }
    this._nSep = new Uint16Array(n);
    this._nAli = new Uint16Array(n);
    this._nCoh = new Uint16Array(n);
    this.alive = new Uint8Array(n);
    this.energy = new Float32Array(n);
    this.panic = new Float32Array(n);
    this._panicNext = new Float32Array(n);
    this.alarm = new Float32Array(n);
    this._alarmNext = new Float32Array(n);
    this.heard = new Float32Array(n);
    this._heardNext = new Float32Array(n);
    this.panicHold = new Float32Array(n);
    this.refractory = new Float32Array(n);
    this.directThreat = new Float32Array(n);
    this._directLatch = new Uint8Array(n);
    this._threatAgent = new Array(n).fill(null);

    // Spatial grid scratch (counting sort); cell arrays grow lazily in
    // step() because grid dims follow the live radii and tank.
    this._cellIdx = new Uint32Array(n);
    this._sorted = new Uint32Array(n);

    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose?.();
    }
    this.mesh = new THREE.InstancedMesh(this._geo, this._mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
    this.reset();
  }

  setPredator(predator) {
    this.predator = predator;
  }

  // A reset creates a fresh laboratory population. Individual bodies do not
  // inherit; only the three trait values above survive between experiments.
  reset(n = this.positions.length) {
    n = Math.max(1, Math.round(n));
    if (n !== this.positions.length) {
      this.setCount(n);
      return;
    }

    this.derived = derivePhenotype(BOID_PARAMS);
    this._energyCapacity = this.derived.energyCapacity;
    const hx = (TANK.width / 2 - WALL_MARGIN * 2) * 0.62;
    const hy = (TANK.height / 2 - WALL_MARGIN * 2) * 0.58;
    const hz = (TANK.depth / 2 - WALL_MARGIN * 2) * 0.58;
    for (let i = 0; i < n; i++) {
      // Start as one readable school, not uniformly scattered throughout
      // the whole tank. The boid rules still decide what it becomes.
      this.positions[i].set(
        (Math.random() * 2 - 1) * hx,
        (Math.random() * 2 - 1) * hy,
        (Math.random() * 2 - 1) * hz
      );
      const yaw = Math.random() * Math.PI * 2;
      const pitch = (Math.random() * 2 - 1) * 0.18;
      this.velocities[i]
        .set(Math.cos(yaw), pitch, Math.sin(yaw))
        .normalize()
        .multiplyScalar(this.derived.cruiseSpeed * (0.88 + Math.random() * 0.2));
      this.forces[i].set(0, 0, 0);
      this.alive[i] = 1;
      this.energy[i] = this._energyCapacity;
      this.panic[i] = 0;
      this._panicNext[i] = 0;
      this.alarm[i] = 0;
      this._alarmNext[i] = 0;
      this.heard[i] = 0;
      this._heardNext[i] = 0;
      this.panicHold[i] = 0;
      this.refractory[i] = 0;
      this.directThreat[i] = 0;
      this._directLatch[i] = 0;
      this._threatAgent[i] = null;
    }

    this.initialCount = n;
    this.aliveCount = n;
    this.panicCount = 0;
    this.averageEnergyRatio = 1;
    this.deaths = { eaten: 0, starved: 0 };
    this._writeMatrices();
  }

  recharge() {
    this.derived = derivePhenotype(BOID_PARAMS);
    this._energyCapacity = this.derived.energyCapacity;
    for (let i = 0; i < this.energy.length; i++) {
      if (this.alive[i]) this.energy[i] = this._energyCapacity;
    }
    this.averageEnergyRatio = 1;
  }

  tireOne(index = -1, ratio = 0.08) {
    if (index < 0 || !this.alive[index]) {
      index = -1;
      let bestD2 = Infinity;
      for (let i = 0; i < this.positions.length; i++) {
        if (!this.alive[i]) continue;
        const d2 = this.positions[i].lengthSq();
        if (d2 < bestD2) {
          bestD2 = d2;
          index = i;
        }
      }
    }
    if (index < 0) return -1;
    this.energy[index] =
      THREE.MathUtils.clamp(ratio, 0, 1) * this.derived.energyCapacity;
    return index;
  }

  // Manual laboratory stimulus: useful when tuning propagation without
  // waiting for the predator to approach the school.
  startleOne(index = -1) {
    if (index < 0 || !this.alive[index]) {
      index = -1;
      let bestD2 = Infinity;
      for (let i = 0; i < this.positions.length; i++) {
        if (!this.alive[i]) continue;
        const d2 = this.positions[i].lengthSq();
        if (d2 < bestD2) {
          bestD2 = d2;
          index = i;
        }
      }
    }
    if (index < 0) return -1;

    this.alarm[index] = 1;
    this.panic[index] = 1;
    this.panicHold[index] = PANIC_PARAMS.holdTime;
    this.refractory[index] = PANIC_PARAMS.refractoryTime;
    this.velocities[index]
      .applyAxisAngle(UP, Math.PI * 0.62)
      .setLength(this.derived.maxSpeed);
    return index;
  }

  kill(index, reason = 'eaten') {
    if (index < 0 || index >= this.alive.length || !this.alive[index]) {
      return false;
    }
    this.alive[index] = 0;
    this.energy[index] = 0;
    this.panic[index] = 0;
    this.alarm[index] = 0;
    this.heard[index] = 0;
    this._threatAgent[index] = null;
    this.forces[index].set(0, 0, 0);
    // Predator runs after the flock in the fixed-step system order. Hide this
    // exact instance immediately so a capture cube never appears one frame
    // before the eaten fish disappears.
    if (this.mesh) {
      _m.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(index, _m);
      this.mesh.instanceMatrix.needsUpdate = true;
    }
    this.aliveCount = Math.max(0, this.aliveCount - 1);
    if (reason === 'starved') this.deaths.starved++;
    else this.deaths.eaten++;
    return true;
  }

  step(dt) {
    const t0 = performance.now();
    const P = BOID_PARAMS;
    const n = this.positions.length;
    const D = (this.derived = derivePhenotype(P));

    // Live trait tuning keeps current energy percentage stable. Stamina is
    // capacity, not a hidden instant refill/penalty.
    const previousCapacity = Math.max(this._energyCapacity || D.energyCapacity, 1e-6);
    if (Math.abs(previousCapacity - D.energyCapacity) > 1e-8) {
      for (let i = 0; i < n; i++) {
        if (!this.alive[i]) continue;
        const ratio = THREE.MathUtils.clamp(this.energy[i] / previousCapacity, 0, 1);
        this.energy[i] = ratio * D.energyCapacity;
      }
      this._energyCapacity = D.energyCapacity;
    }

    // --- The three social rules ---
    // Perf shape: flat typed arrays, squared distances, each pair
    // visited once and applied to both fish. Above ~200 fish a uniform
    // spatial grid (cells ≥ the largest social radius, counting sort,
    // 13-cell half neighborhood) replaces the O(N²) sweep — in the
    // desktop tank at cohesionRadius 0.3 that skips ~⅔ of all pairs;
    // the win grows as radii shrink or the tank grows.
    const {
      px, py, pz, vx, vy, vz, fx, fy, fz,
      sepX, sepY, sepZ, aliX, aliY, aliZ, cohX, cohY, cohZ,
      aliW, emAliX, emAliY, emAliZ, emAliUrgency,
      incoming, targetSpeed, maxSpeed, energySpeed,
    } = this._f32;
    const nSep = this._nSep;
    const nAli = this._nAli;
    const nCoh = this._nCoh;
    for (let i = 0; i < n; i++) {
      const p = this.positions[i];
      const v = this.velocities[i];
      px[i] = p.x; py[i] = p.y; pz[i] = p.z;
      vx[i] = v.x; vy[i] = v.y; vz[i] = v.z;
      const sp = Math.hypot(v.x, v.y, v.z);
      if (sp > 1e-9) {
        fx[i] = v.x / sp; fy[i] = v.y / sp; fz[i] = v.z / sp;
      } else {
        fx[i] = 0; fy[i] = 0; fz[i] = 1;
      }
      sepX[i] = sepY[i] = sepZ[i] = 0;
      aliX[i] = aliY[i] = aliZ[i] = 0;
      emAliX[i] = emAliY[i] = emAliZ[i] = emAliUrgency[i] = 0;
      cohX[i] = cohY[i] = cohZ[i] = 0;
      aliW[i] = incoming[i] = 0;
      nSep[i] = nAli[i] = nCoh[i] = 0;
    }
    const sepR = D.separationRadius;
    const shape = P.sepFalloff;
    const sepR2 = D.separationRadius * D.separationRadius;
    const aliR2 = D.alignmentRadius * D.alignmentRadius;
    const cohR2 = D.cohesionRadius * D.cohesionRadius;
    const signalR2 = PANIC_PARAMS.signalRadius * PANIC_PARAMS.signalRadius;
    const maxR2 = Math.max(sepR2, aliR2, cohR2, signalR2);
    const maxR = Math.sqrt(maxR2);
    // FOV gates alignment + cohesion per-direction; 360° short-circuits.
    const fovActive = P.perceptionFOV < 360;
    const cosHalf = Math.cos(THREE.MathUtils.degToRad(P.perceptionFOV / 2));

    // A panic heading is a separate emergency channel. It never enters the
    // ordinary alignment average, so twenty calm neighbors cannot dilute
    // the one fish that actually saw danger.
    const addAlignment = (receiver, sender, canSee, d2) => {
      if (!canSee) return;
      const urgency = Math.max(this.panic[sender], this.alarm[sender]);
      if (d2 < signalR2 && urgency > 0.001) {
        const proximity = distanceSignal(
          Math.sqrt(d2),
          PANIC_PARAMS.signalRadius
        );
        // `alignmentSourceBoost` still has a precise job after splitting
        // emergency heading from ordinary alignment: among several alarmed
        // senders it makes the most urgent heading win the directional vote.
        // Absolute emergency force is controlled separately below by
        // `emergencyAlignmentWeight`.
        const sourceBoost = Number.isFinite(PANIC_PARAMS.alignmentSourceBoost)
          ? Math.max(0, PANIC_PARAMS.alignmentSourceBoost)
          : 0;
        const weight =
          proximity *
          urgency *
          (1 + sourceBoost * urgency * urgency);
        if (weight > 1e-6) {
          emAliX[receiver] += fx[sender] * weight;
          emAliY[receiver] += fy[sender] * weight;
          emAliZ[receiver] += fz[sender] * weight;
          emAliUrgency[receiver] = Math.max(
            emAliUrgency[receiver],
            proximity * urgency
          );
          return;
        }
      }
      if (d2 < aliR2) {
        aliX[receiver] += vx[sender];
        aliY[receiver] += vy[sender];
        aliZ[receiver] += vz[sender];
        aliW[receiver] += 1;
        nAli[receiver]++;
      }
    };

    const pair = (i, j) => {
      if (!this.alive[i] || !this.alive[j]) return;
      const dx = px[i] - px[j];
      const dy = py[i] - py[j];
      const dz = pz[i] - pz[j];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= maxR2 || d2 < 1e-12) return;
      let seeIJ = true;
      let seeJI = true;
      if (fovActive) {
        const inv = 1 / Math.sqrt(d2);
        // i→j direction is −Δ; j→i direction is +Δ
        seeIJ = (-dx * fx[i] - dy * fy[i] - dz * fz[i]) * inv >= cosHalf;
        seeJI = (dx * fx[j] + dy * fy[j] + dz * fz[j]) * inv >= cosHalf;
      }
      if (d2 < sepR2) {
        // contribution = Δ·w, so per-neighbor magnitude m(d) = w·d
        let w;
        if (shape === 'linear') {
          const d = Math.sqrt(d2);
          w = (sepR - d) / (sepR * d); // m = (r−d)/r
        } else if (shape === 'invlog') {
          const d = Math.sqrt(d2);
          w = Math.log(sepR / d) / d; // m = ln(r/d)
        } else {
          w = 1 / d2; // 'inverse': m = 1/d — the original
        }
        sepX[i] += dx * w; sepY[i] += dy * w; sepZ[i] += dz * w; nSep[i]++;
        sepX[j] -= dx * w; sepY[j] -= dy * w; sepZ[j] -= dz * w; nSep[j]++;
      }

      addAlignment(i, j, seeIJ, d2);
      addAlignment(j, i, seeJI, d2);

      if (d2 < signalR2) {
        const d = Math.sqrt(d2);
        if (seeIJ) {
          incoming[i] = Math.max(
            incoming[i],
            this.alarm[j] * distanceSignal(d, PANIC_PARAMS.signalRadius)
          );
        }
        if (seeJI) {
          incoming[j] = Math.max(
            incoming[j],
            this.alarm[i] * distanceSignal(d, PANIC_PARAMS.signalRadius)
          );
        }
      }
      if (d2 < cohR2) {
        if (seeIJ) { cohX[i] += px[j]; cohY[i] += py[j]; cohZ[i] += pz[j]; nCoh[i]++; }
        if (seeJI) { cohX[j] += px[i]; cohY[j] += py[i]; cohZ[j] += pz[i]; nCoh[j]++; }
      }
    };

    // Grid pass when it pays; brute sweep for small schools or when the
    // radii span the tank (grid degenerates to a handful of cells).
    let useGrid = n >= 200;
    let nx = 1;
    let ny = 1;
    let nz = 1;
    if (useGrid) {
      const cell = Math.max(0.05, maxR);
      nx = Math.min(32, Math.max(1, Math.floor(TANK.width / cell)));
      ny = Math.min(32, Math.max(1, Math.floor(TANK.height / cell)));
      nz = Math.min(32, Math.max(1, Math.floor(TANK.depth / cell)));
      if (nx * ny * nz <= 8) useGrid = false;
    }

    if (!useGrid) {
      this.lastPairMode = 'brute';
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) pair(i, j);
      }
    } else {
      this.lastPairMode = 'grid';
      const numCells = nx * ny * nz;
      if (!this._starts || this._starts.length < numCells + 1) {
        this._starts = new Uint32Array(numCells + 1);
        this._cursor = new Uint32Array(numCells);
      }
      const starts = this._starts;
      const cursor = this._cursor;
      const cellIdx = this._cellIdx;
      const sorted = this._sorted;
      starts.fill(0, 0, numCells + 1);
      cursor.fill(0, 0, numCells);
      const cw = TANK.width / nx;
      const ch = TANK.height / ny;
      const cd = TANK.depth / nz;
      const hw = TANK.width / 2;
      const hh = TANK.height / 2;
      const hd = TANK.depth / 2;
      for (let i = 0; i < n; i++) {
        const cx = Math.min(nx - 1, Math.max(0, Math.floor((px[i] + hw) / cw)));
        const cy = Math.min(ny - 1, Math.max(0, Math.floor((py[i] + hh) / ch)));
        const cz = Math.min(nz - 1, Math.max(0, Math.floor((pz[i] + hd) / cd)));
        const c = (cz * ny + cy) * nx + cx;
        cellIdx[i] = c;
        starts[c + 1]++;
      }
      for (let c = 0; c < numCells; c++) starts[c + 1] += starts[c];
      for (let i = 0; i < n; i++) {
        const c = cellIdx[i];
        sorted[starts[c] + cursor[c]++] = i;
      }
      for (let cz = 0; cz < nz; cz++) {
        for (let cy = 0; cy < ny; cy++) {
          for (let cx = 0; cx < nx; cx++) {
            const c = (cz * ny + cy) * nx + cx;
            const s0 = starts[c];
            const s1 = starts[c + 1];
            // pairs inside this cell, each once
            for (let a = s0; a < s1; a++) {
              const i = sorted[a];
              for (let b = a + 1; b < s1; b++) pair(i, sorted[b]);
            }
            // pairs against the 13-cell forward half neighborhood
            for (let k = 0; k < FWD.length; k++) {
              const x2 = cx + FWD[k][0];
              const y2 = cy + FWD[k][1];
              const z2 = cz + FWD[k][2];
              if (x2 < 0 || x2 >= nx || y2 < 0 || y2 >= ny || z2 < 0 || z2 >= nz) continue;
              const c2 = (z2 * ny + y2) * nx + x2;
              const t0c = starts[c2];
              const t1c = starts[c2 + 1];
              for (let a = s0; a < s1; a++) {
                const i = sorted[a];
                for (let b = t0c; b < t1c; b++) pair(i, sorted[b]);
              }
            }
          }
        }
      }
    }

    // --- Threat detection and one-hop alarm state transition ---
    // pair() read only the previous frame's alarm/panic buffers. All next
    // values are committed together after integration, so array order cannot
    // make a warning cross several fish in one frame.
    const activePredators = this._activePredators;
    activePredators.length = 0;
    const predatorSystemEnabled =
      this.predator &&
      this.predator.enabled !== false &&
      this.predator.params?.enabled !== false;
    if (predatorSystemEnabled) {
      const agents = this.predator.agents;
      if (Array.isArray(agents)) {
        for (const agent of agents) {
          if (isActivePredatorAgent(agent)) activePredators.push(agent);
        }
      } else if (isActivePredatorAgent(this.predator)) {
        // Backward-compatible singular Predator interface.
        activePredators.push(this.predator);
      }
    }
    const predatorActive = activePredators.length > 0;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) {
        this._panicNext[i] = 0;
        this._alarmNext[i] = 0;
        this._heardNext[i] = 0;
        this.directThreat[i] = 0;
        this._threatAgent[i] = null;
        continue;
      }

      let direct = 0;
      let enteredDirect = false;
      if (predatorActive) {
        let closest = null;
        let closestD2 = Infinity;
        for (const agent of activePredators) {
          const d2 = this.positions[i].distanceToSquared(agent.position);
          if (d2 < closestD2) {
            closest = agent;
            closestD2 = d2;
          }
        }
        this._threatAgent[i] = closest;
        direct = threatFromDistance(Math.sqrt(closestD2), PANIC_PARAMS);
        if (!this._directLatch[i] && direct >= PANIC_PARAMS.directOn) {
          this._directLatch[i] = 1;
          enteredDirect = true;
        } else if (this._directLatch[i] && direct <= PANIC_PARAMS.directOff) {
          this._directLatch[i] = 0;
        }
      } else {
        this._directLatch[i] = 0;
        this._threatAgent[i] = null;
      }
      this.directThreat[i] = direct;

      const sensed = exponentialApproach(
        this.heard[i],
        incoming[i],
        dt,
        PANIC_PARAMS.senseTime
      );
      this._heardNext[i] = sensed;

      let nextHold = Math.max(0, this.panicHold[i] - dt);
      let nextRefractory = Math.max(0, this.refractory[i] - dt);
      let emitPulse = enteredDirect;
      const socialTrigger =
        !this._directLatch[i] &&
        sensed >= PANIC_PARAMS.signalThreshold &&
        nextRefractory <= 0;
      if (socialTrigger) {
        emitPulse = true;
        nextRefractory = PANIC_PARAMS.refractoryTime;
      }
      if (emitPulse) nextHold = PANIC_PARAMS.holdTime;
      if (enteredDirect) {
        nextRefractory = Math.max(nextRefractory, PANIC_PARAMS.refractoryTime);
      }
      this.panicHold[i] = nextHold;
      this.refractory[i] = nextRefractory;

      this._alarmNext[i] = emitPulse
        ? 1
        : this.alarm[i] * Math.exp(-dt / Math.max(PANIC_PARAMS.signalDecayTime, 1e-6));
      const targetPanic = Math.max(direct, nextHold > 0 ? 1 : 0);
      const timeConstant =
        targetPanic > this.panic[i] ? PANIC_PARAMS.riseTime : PANIC_PARAMS.fallTime;
      this._panicNext[i] = exponentialApproach(
        this.panic[i],
        targetPanic,
        dt,
        timeConstant
      );
    }

    for (let i = 0; i < n; i++) {
      const pos = this.positions[i];
      const vel = this.velocities[i];
      const force = this.forces[i].set(0, 0, 0);
      if (!this.alive[i]) {
        targetSpeed[i] = maxSpeed[i] = energySpeed[i] = 0;
        continue;
      }

      const response = energyResponse(
        this.energy[i] / Math.max(D.energyCapacity, 1e-6),
        ENERGY_PARAMS
      );
      energySpeed[i] = response.speed;
      const p = Math.max(this._panicNext[i], this.directThreat[i]);
      targetSpeed[i] =
        D.cruiseSpeed * response.speed * (1 + PANIC_PARAMS.speedBoost * p);
      maxSpeed[i] = Math.max(
        targetSpeed[i] * 1.08,
        D.maxSpeed * response.speed * (1 + PANIC_PARAMS.speedBoost * p)
      );
      const safetySpeed = D.maxSpeed * (1 + 0.25 * p);

      if (nSep[i] > 0) {
        _sep.set(sepX[i], sepY[i], sepZ[i]);
        force.add(
          steerToward(_sep, vel, _force, safetySpeed, D.maxForce)
            .multiplyScalar(D.separationWeight)
        );
      }
      if (nAli[i] > 0) {
        _ali
          .set(aliX[i], aliY[i], aliZ[i])
          .divideScalar(Math.max(aliW[i], 1e-6));
        const receiverBoost = Math.min(
          1 + PANIC_PARAMS.alignmentReceiverBoost * this._heardNext[i],
          PANIC_PARAMS.alignmentReceiverMax
        );
        force.add(
          steerToward(_ali, vel, _force, maxSpeed[i], D.maxForce)
            .multiplyScalar(D.alignmentWeight * response.alignment * receiverBoost)
        );
      }
      if (emAliUrgency[i] > 0) {
        _emergencyAli.set(emAliX[i], emAliY[i], emAliZ[i]);
        const emergencyWeight = Number.isFinite(
          PANIC_PARAMS.emergencyAlignmentWeight
        )
          ? Math.max(0, PANIC_PARAMS.emergencyAlignmentWeight)
          : D.alignmentWeight * 5;
        force.add(
          steerToward(
            _emergencyAli,
            vel,
            _force,
            maxSpeed[i],
            D.maxForce
          ).multiplyScalar(
            emergencyWeight * response.alignment * emAliUrgency[i]
          )
        );
      }
      if (nCoh[i] > 0) {
        _coh.set(cohX[i], cohY[i], cohZ[i]).divideScalar(nCoh[i]).sub(pos);
        force.add(
          steerToward(_coh, vel, _force, maxSpeed[i], D.maxForce)
            .multiplyScalar(
              D.cohesionWeight *
              response.cohesion *
              Math.max(0, 1 - PANIC_PARAMS.cohesionDrop * p)
            )
        );
      }

      // Only a fish that directly detects the predator gets a geometric
      // escape vector. Socially alarmed fish know the sender's heading, not
      // the predator's magically omniscient position.
      const threatAgent = this._threatAgent[i];
      if (threatAgent && this.directThreat[i] > 0) {
        _predictedPredator
          .copy(threatAgent.position)
          .addScaledVector(threatAgent.velocity, PANIC_PARAMS.predictionTime);
        _desired.copy(pos).sub(_predictedPredator);
        if (_desired.lengthSq() < 1e-10) {
          _desired.copy(threatAgent.velocity).negate();
        }
        force.add(
          steerToward(_desired, vel, _force, maxSpeed[i], D.maxForce)
            .multiplyScalar(PANIC_PARAMS.escapeWeight * this.directThreat[i])
        );
      }

      // --- Obstacle avoidance: forward ray, rotate until clear ---
      _dir.copy(vel).normalize();
      if (_dir.lengthSq() < 1e-10) _dir.set(0, 0, 1);
      const dWall = distToWall(pos, _dir);
      if (dWall < P.detectionLength) {
        const urgency = 1 - dWall / P.detectionLength;
        let found = false;
        const stepRad = THREE.MathUtils.degToRad(P.angleStep);
        const tries = Math.ceil(Math.PI / stepRad);
        // yaw sweep first (fish prefer turning to climbing)…
        for (let k = 1; k <= tries && !found; k++) {
          for (const s of [1, -1]) {
            _cand.copy(_dir).applyAxisAngle(UP, s * k * stepRad);
            if (distToWall(pos, _cand) > P.detectionLength) {
              found = true;
              break;
            }
          }
        }
        // …then pitch as a fallback (floor/ceiling ahead)
        if (!found) {
          _axis.crossVectors(UP, _dir).normalize();
          for (const a of [0.6, -0.6, 1.1, -1.1]) {
            _cand.copy(_dir).applyAxisAngle(_axis, a);
            if (distToWall(pos, _cand) > P.detectionLength) {
              found = true;
              break;
            }
          }
        }
        if (!found) _cand.copy(pos).multiplyScalar(-1); // toward tank center
        force.add(
          steerToward(_cand, vel, _force, safetySpeed, D.maxForce).multiplyScalar(
            P.avoidanceWeight * (1 + urgency * 2)
          )
        );
      }

      // --- Centering: constant-magnitude drift toward tank center ---
      if (P.centeringWeight > 0) {
        _cand.copy(pos).multiplyScalar(-1);
        if (_cand.lengthSq() > 1e-8) {
          force.add(
            steerToward(_cand, vel, _force, safetySpeed, D.maxForce)
              .multiplyScalar(P.centeringWeight)
          );
        }
      }

      // --- Speed keeper: drift back to cruise, never stall or rocket ---
      _desired.copy(_dir).multiplyScalar(targetSpeed[i]).sub(vel);
      force.add(_desired.clampLength(0, D.maxForce * 0.5));
    }

    // Integrate in a second pass so all fish saw the same flock state.
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue;
      const pos = this.positions[i];
      const vel = this.velocities[i];
      _newVel.copy(vel).addScaledVector(this.forces[i], dt);

      // Turn-speed cap: rotate the heading no faster than turnSpeed rad/s
      const speed = Math.max(_newVel.length(), 1e-6);
      const panicTurnBoost = Number.isFinite(PANIC_PARAMS.panicTurnBoost)
        ? Math.max(0, PANIC_PARAMS.panicTurnBoost)
        : 0.35;
      const turnUrgency = Math.max(
        this._panicNext[i],
        this.directThreat[i],
        emAliUrgency[i]
      );
      const maxAngle =
        D.turnSpeed *
        (0.55 + 0.45 * energySpeed[i]) *
        (1 + panicTurnBoost * turnUrgency) *
        dt;
      const angle = vel.angleTo(_newVel);
      if (angle > maxAngle && vel.lengthSq() > 1e-10) {
        _axis.crossVectors(vel, _newVel);
        if (_axis.lengthSq() > 1e-12) {
          _axis.normalize();
          _newVel.copy(vel).applyAxisAngle(_axis, maxAngle).setLength(speed);
        }
      }

      // Pitch clamp: recompose vertical component if too steep
      const h = Math.hypot(_newVel.x, _newVel.z);
      const pitch = Math.atan2(_newVel.y, Math.max(h, 1e-6));
      const maxPitchRad = THREE.MathUtils.degToRad(BOID_PARAMS.maxPitch);
      if (Math.abs(pitch) > maxPitchRad) {
        _newVel.y = Math.max(h, 1e-6) * Math.tan(Math.sign(pitch) * maxPitchRad);
      }

      // Speed clamp
      _newVel.clampLength(targetSpeed[i] * 0.3, maxSpeed[i]);
      vel.copy(_newVel);
      pos.addScaledVector(vel, dt);

      // Hard containment (belt & suspenders under extreme tuning):
      // clamp inside the inner box and kill the escaping component.
      const hx = TANK.width / 2 - WALL_MARGIN;
      const hy = TANK.height / 2 - WALL_MARGIN;
      const hz = TANK.depth / 2 - WALL_MARGIN;
      if (pos.x > hx || pos.x < -hx) {
        pos.x = THREE.MathUtils.clamp(pos.x, -hx, hx);
        vel.x *= -0.5;
      }
      if (pos.y > hy || pos.y < -hy) {
        pos.y = THREE.MathUtils.clamp(pos.y, -hy, hy);
        vel.y *= -0.5;
      }
      if (pos.z > hz || pos.z < -hz) {
        pos.z = THREE.MathUtils.clamp(pos.z, -hz, hz);
        vel.z *= -0.5;
      }

      this.energy[i] = Math.max(
        0,
        this.energy[i] - energyDrainPerSecond(vel.length(), D, ENERGY_PARAMS) * dt
      );
    }

    // Atomic commit of alarm/panic buffers: one simulation step is at most
    // one social hop, independent of fish array order.
    [this.panic, this._panicNext] = [this._panicNext, this.panic];
    [this.alarm, this._alarmNext] = [this._alarmNext, this.alarm];
    [this.heard, this._heardNext] = [this._heardNext, this.heard];

    let alive = 0;
    let panicked = 0;
    let energySum = 0;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) continue;
      alive++;
      if (this.panic[i] >= 0.35) panicked++;
      energySum += this.energy[i] / Math.max(D.energyCapacity, 1e-6);
    }
    this.aliveCount = alive;
    this.panicCount = panicked;
    this.averageEnergyRatio = alive > 0 ? energySum / alive : 0;

    this._writeMatrices();
    this.lastStepMs = performance.now() - t0;
  }

  metrics() {
    const live = [];
    const center = new THREE.Vector3();
    const heading = new THREE.Vector3();
    let energySum = 0;
    let speedSum = 0;
    for (let i = 0; i < this.positions.length; i++) {
      if (!this.alive[i]) continue;
      live.push(i);
      center.add(this.positions[i]);
      speedSum += this.velocities[i].length();
      _dir.copy(this.velocities[i]).normalize();
      heading.add(_dir);
      energySum += this.energy[i] / Math.max(this.derived.energyCapacity, 1e-6);
    }

    const count = live.length;
    if (count > 0) center.divideScalar(count);
    let radiusSq = 0;
    const nearest = [];
    for (let a = 0; a < count; a++) {
      const i = live[a];
      radiusSq += this.positions[i].distanceToSquared(center);
      let best = Infinity;
      for (let b = 0; b < count; b++) {
        if (a === b) continue;
        best = Math.min(best, this.positions[i].distanceTo(this.positions[live[b]]));
      }
      if (Number.isFinite(best)) nearest.push(best);
    }
    nearest.sort((a, b) => a - b);
    const middle = Math.floor(nearest.length / 2);
    const medianNearestNeighbor =
      nearest.length === 0
        ? 0
        : nearest.length % 2
          ? nearest[middle]
          : (nearest[middle - 1] + nearest[middle]) / 2;

    return {
      alive: count,
      survivors: count,
      initial: this.initialCount,
      survivalRatio: this.initialCount > 0 ? count / this.initialCount : 0,
      deaths: { ...this.deaths },
      panic: this.panicCount,
      panicCount: this.panicCount,
      averageEnergy: count > 0 ? energySum / count : 0,
      averageEnergyRatio: count > 0 ? energySum / count : 0,
      averageSpeed: count > 0 ? speedSum / count : 0,
      medianNearestNeighbor,
      radiusOfGyration: count > 0 ? Math.sqrt(radiusSq / count) : 0,
      polarization: count > 0 ? heading.length() / count : 0,
      pairMode: this.lastPairMode,
      stepMs: this.lastStepMs,
    };
  }

  // Orientation: yaw + pitch follow velocity, roll locked (right vector
  // built from world up), so fish always swim right-side up.
  _writeMatrices() {
    const n = this.positions.length;
    const bodyScale = this.derived?.bodyScale ?? 1;
    for (let i = 0; i < n; i++) {
      if (!this.alive[i]) {
        _m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, _m);
        continue;
      }
      _dir.copy(this.velocities[i]).normalize();
      _right.crossVectors(UP, _dir);
      if (_right.lengthSq() < 1e-10) _right.set(1, 0, 0);
      _right.normalize();
      _up2.crossVectors(_dir, _right).normalize();
      _m.makeBasis(_right, _up2, _dir);
      _scale.setScalar(bodyScale);
      _m.scale(_scale).setPosition(this.positions[i]);
      this.mesh.setMatrixAt(i, _m);

      // State is expressed through movement, never through a color legend.
      // Soft school blue keeps the scene calm while shapes stay readable.
      // Nearby predator bites can briefly lift lightness with a radial falloff.
      _color.set('#7eb6d9');
      const lighten =
        this.predator?.captureVfx?.sampleLighten?.(this.positions[i]) ?? 0;
      if (lighten > 0) {
        _color.offsetHSL(0, -0.08 * lighten, 0.28 * lighten);
      }
      this.mesh.setColorAt(i, _color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    const index = this.world.systems.indexOf(this);
    if (index >= 0) this.world.systems.splice(index, 1);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose?.();
    }
    this._geo.dispose();
    this._mat.dispose();
  }
}
