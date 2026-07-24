const EPSILON = 1e-9;

export class SeededRng {
  constructor(seed = 1) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    const normalized = Number.isFinite(Number(seed)) ? Number(seed) : 1;
    this.seed = normalized >>> 0;
    this.state = this.seed || 0x6d2b79f5;
    return this;
  }

  next() {
    // Mulberry32: compact, stable across browsers and sufficient for simulation.
    let value = (this.state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    value = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    return value;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  integer(min, maxInclusive) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  sign() {
    return this.next() < 0.5 ? -1 : 1;
  }

  unitVector() {
    const z = this.range(-1, 1);
    const angle = this.range(0, Math.PI * 2);
    const radius = Math.sqrt(Math.max(0, 1 - z * z));
    return [radius * Math.cos(angle), radius * Math.sin(angle), z];
  }

  inUnitSphere() {
    const direction = this.unitVector();
    const radius = Math.cbrt(this.next());
    return direction.map((value) => value * radius);
  }
}

export function tankVolume(tank) {
  return tank.width * tank.height * tank.depth;
}

export function visualLength(size, visual) {
  return (visual.bodyLength + 2 * visual.bodyRadius) * size;
}

export function deriveSchool(config, school) {
  const count = Math.max(1, Math.round(school.count));
  const desired = Math.min(
    Math.max(0, school.targetNeighbors),
    Math.max(0, count - 1)
  );
  const rawRadius =
    desired <= 0
      ? 0
      : Math.cbrt(
          (3 * desired * tankVolume(config.tank)) /
            (4 * Math.PI * count)
        );
  const length = visualLength(school.size, config.visual);
  const neighborRadius = Math.max(
    rawRadius,
    config.perception.minNeighborRadiusFactor * length
  );
  return {
    id: school.id,
    count,
    visualLength: length,
    rawRadius,
    neighborRadius,
    cohesionRadius: neighborRadius,
    alignmentRadius:
      neighborRadius * config.perception.alignmentRadiusFactor,
    separationRadius:
      neighborRadius * config.perception.separationRadiusFactor,
    detectionLength:
      neighborRadius * config.perception.detectionLengthFactor,
  };
}

export function deriveExperiment(config) {
  const schools = config.schools.map((school) => deriveSchool(config, school));
  let cellSize = 0;
  for (const value of schools) {
    cellSize = Math.max(
      cellSize,
      value.cohesionRadius,
      value.detectionLength
    );
  }
  for (let a = 0; a < config.schools.length; a += 1) {
    for (let b = a + 1; b < config.schools.length; b += 1) {
      cellSize = Math.max(
        cellSize,
        config.perception.crossSeparationScale *
          Math.max(config.schools[a].size, config.schools[b].size)
      );
    }
  }
  const totalCount = schools.reduce((sum, item) => sum + item.count, 0);
  return { schools, cellSize, totalCount };
}

export function captureRadius(config, predatorSchool, preySchool) {
  return (
    config.capture.captureLengthFactor *
    (visualLength(predatorSchool.size, config.visual) +
      visualLength(preySchool.size, config.visual))
  );
}

export function perPredatorCooldown(activePredatorCount, targetCaptureRate) {
  if (activePredatorCount <= 0 || targetCaptureRate <= 0) return Infinity;
  return activePredatorCount / targetCaptureRate;
}

export function effectiveMaxSpeed(config, school, state = 'cruise') {
  if (state === 'pursuit') {
    return school.maxSpeed * config.locomotion.burstFactor;
  }
  if (state === 'evade') {
    return school.maxSpeed * config.locomotion.panicSpeedFactor;
  }
  return school.maxSpeed;
}

export function relationForRatio(ratio, relations, previous = 'ignore') {
  const { k, KMax, hysteresis, policy = 'size' } = relations;
  if (!Number.isFinite(ratio) || ratio <= 0) return 'ignore';

  if (policy === 'size') {
    if (
      previous === 'pursuit' &&
      ratio >= Math.max(1, k - hysteresis)
    ) {
      return 'pursuit';
    }
    if (
      previous === 'evade' &&
      ratio <= 1 / Math.max(1 + EPSILON, k - hysteresis)
    ) {
      return 'evade';
    }
    if (ratio >= k) return 'pursuit';
    if (ratio <= 1 / k) return 'evade';
    return 'peer';
  }

  // Hysteresis affects exits, not the documented nominal classification:
  // an existing state survives through an expanded band.
  if (
    previous === 'pursuit' &&
    ratio >= Math.max(1, k - hysteresis) &&
    ratio <= KMax + hysteresis
  ) {
    return 'pursuit';
  }
  if (
    previous === 'evade' &&
    ratio >= Math.max(EPSILON, 1 / (KMax + hysteresis)) &&
    ratio <= 1 / Math.max(1 + EPSILON, k - hysteresis)
  ) {
    return 'evade';
  }
  if (ratio >= k && ratio <= KMax) return 'pursuit';
  if (ratio >= 1 / KMax && ratio <= 1 / k) return 'evade';
  if (ratio > 1 / k && ratio < k) return 'peer';
  return 'ignore';
}

export function relationBetween(
  actorSchool,
  targetSchool,
  relations,
  previous = 'ignore'
) {
  if (actorSchool.id === targetSchool.id) return 'peer';
  return relationForRatio(
    actorSchool.size / targetSchool.size,
    relations,
    previous
  );
}

export class RelationMatrix {
  constructor() {
    this.previous = new Map();
  }

  update(schools, relations) {
    const matrix = schools.map(() => schools.map(() => 'ignore'));
    for (let a = 0; a < schools.length; a += 1) {
      for (let b = 0; b < schools.length; b += 1) {
        const key = `${schools[a].id}>${schools[b].id}`;
        const value = relationBetween(
          schools[a],
          schools[b],
          relations,
          this.previous.get(key) ?? 'ignore'
        );
        matrix[a][b] = value;
        this.previous.set(key, value);
      }
    }
    return matrix;
  }

  reset() {
    this.previous.clear();
  }
}

export class SpatialHash3D {
  constructor(cellSize = 1) {
    this.cellSize = Math.max(EPSILON, cellSize);
    this.cells = new Map();
    this.positions = null;
    this.alive = null;
    this.count = 0;
  }

  key(ix, iy, iz) {
    return `${ix},${iy},${iz}`;
  }

  cellOf(x, y, z) {
    const scale = 1 / this.cellSize;
    return [
      Math.floor(x * scale),
      Math.floor(y * scale),
      Math.floor(z * scale),
    ];
  }

  build(positions, alive, count = alive.length) {
    this.cells.clear();
    this.positions = positions;
    this.alive = alive;
    this.count = count;
    for (let index = 0; index < count; index += 1) {
      if (!alive[index]) continue;
      const offset = index * 3;
      const [ix, iy, iz] = this.cellOf(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2]
      );
      const key = this.key(ix, iy, iz);
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = [];
        this.cells.set(key, bucket);
      }
      bucket.push(index);
    }
    return this;
  }

  forEachCandidate(index, callback) {
    if (!this.alive[index]) return;
    const offset = index * 3;
    const [cx, cy, cz] = this.cellOf(
      this.positions[offset],
      this.positions[offset + 1],
      this.positions[offset + 2]
    );
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      for (let y = cy - 1; y <= cy + 1; y += 1) {
        for (let z = cz - 1; z <= cz + 1; z += 1) {
          const bucket = this.cells.get(this.key(x, y, z));
          if (!bucket) continue;
          for (const other of bucket) {
            if (other !== index) callback(other);
          }
        }
      }
    }
  }

  forEachPair(callback) {
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      this.forEachCandidate(index, (other) => {
        if (other > index) callback(index, other);
      });
    }
  }
}

export function groupStatistics(positions, velocities, indices) {
  const count = indices.length;
  if (count === 0) {
    return {
      count: 0,
      center: [0, 0, 0],
      centerVelocity: [0, 0, 0],
      rog: 0,
    };
  }
  const center = [0, 0, 0];
  const centerVelocity = [0, 0, 0];
  for (const index of indices) {
    const offset = index * 3;
    center[0] += positions[offset];
    center[1] += positions[offset + 1];
    center[2] += positions[offset + 2];
    if (velocities) {
      centerVelocity[0] += velocities[offset];
      centerVelocity[1] += velocities[offset + 1];
      centerVelocity[2] += velocities[offset + 2];
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    center[axis] /= count;
    centerVelocity[axis] /= count;
  }
  let squared = 0;
  for (const index of indices) {
    const offset = index * 3;
    const dx = positions[offset] - center[0];
    const dy = positions[offset + 1] - center[1];
    const dz = positions[offset + 2] - center[2];
    squared += dx * dx + dy * dy + dz * dz;
  }
  return {
    count,
    center,
    centerVelocity,
    rog: Math.sqrt(squared / count),
  };
}

export function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function peakSample(samples, key) {
  if (!samples.length) return null;
  return samples.reduce((best, sample) =>
    sample[key] > best[key] ? sample : best
  );
}

export function firstResponsePeak(samples, key, baseline, riseFraction) {
  if (samples.length < 5) return peakSample(samples, key);
  const smoothed = samples.map((sample, index) => {
    const start = Math.max(0, index - 1);
    const end = Math.min(samples.length - 1, index + 1);
    let total = 0;
    for (let cursor = start; cursor <= end; cursor += 1) {
      total += samples[cursor][key];
    }
    return total / (end - start + 1);
  });
  const threshold = baseline * (1 + riseFraction);
  for (let index = 2; index < samples.length - 2; index += 1) {
    if (
      smoothed[index] >= threshold &&
      smoothed[index] >= smoothed[index - 1] &&
      smoothed[index] > smoothed[index + 1] &&
      smoothed[index + 1] >= smoothed[index + 2]
    ) {
      return samples[index];
    }
  }
  return peakSample(samples, key);
}

export function fastestRiseSample(samples, key) {
  if (samples.length < 2) return samples[0] ?? null;
  let result = samples[1];
  let bestSlope = -Infinity;
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    const dt = Math.max(EPSILON, after.time - before.time);
    const slope = (after[key] - before[key]) / dt;
    if (slope > bestSlope) {
      bestSlope = slope;
      result = after;
    }
  }
  return result;
}

export function analyzeCascadeSeries({
  baselineSamples,
  eventSamples,
  impulseByDirection,
  forbidden,
  config,
  tank,
}) {
  const judge = config.cascadeJudge;
  const baselineMedium = mean(
    baselineSamples.map((sample) => sample.rogMedium)
  );
  const baselineSmall = mean(
    baselineSamples.map((sample) => sample.rogSmall)
  );
  const baselineNeighborsMedium = mean(
    baselineSamples.map((sample) => sample.neighborsMedium)
  );
  const baselineNeighborsSmall = mean(
    baselineSamples.map((sample) => sample.neighborsSmall)
  );
  const baselineAttribution = mean(
    baselineSamples
      .filter((sample) => sample.attributionSamples > 0)
      .map((sample) => sample.mediumAttribution)
  );
  const mediumPeak = firstResponsePeak(
    eventSamples,
    'rogMedium',
    baselineMedium,
    judge.rogRiseFraction
  );
  const smallPeak = firstResponsePeak(
    eventSamples,
    'rogSmall',
    baselineSmall,
    judge.rogRiseFraction
  );
  const fastestSmall = fastestRiseSample(eventSamples, 'rogSmall');
  const shortestSide = Math.min(tank.width, tank.height, tank.depth);
  const directImpulse =
    smallPeak?.largeToSmallImpulse ??
    impulseByDirection.largeToSmall ??
    0;
  const indirectImpulse =
    smallPeak?.mediumToSmallImpulse ??
    impulseByDirection.mediumToSmall ??
    0;
  const impulseRatio =
    indirectImpulse > EPSILON ? directImpulse / indirectImpulse : Infinity;
  const attributionGain =
    (fastestSmall?.mediumAttribution ?? 0) - baselineAttribution;
  const attributionSamples = fastestSmall?.attributionSamples ?? 0;

  const checks = {
    baselineShape:
      baselineMedium <
        shortestSide * judge.maxBaselineRogShortestSideFactor &&
      baselineSmall <
        shortestSide * judge.maxBaselineRogShortestSideFactor,
    baselineNeighbors:
      baselineNeighborsMedium > judge.minAverageNeighbors &&
      baselineNeighborsSmall > judge.minAverageNeighbors,
    mediumRise:
      Boolean(mediumPeak) &&
      mediumPeak.rogMedium >= baselineMedium * (1 + judge.rogRiseFraction),
    smallRise:
      Boolean(smallPeak) &&
      smallPeak.rogSmall >= baselineSmall * (1 + judge.rogRiseFraction),
    peakLag:
      Boolean(mediumPeak && smallPeak) &&
      smallPeak.time - mediumPeak.time >= judge.minPeakLag,
    impulsePath:
      indirectImpulse > EPSILON &&
      impulseRatio < judge.maxDirectImpulseRatio,
    attribution:
      attributionSamples >= judge.minAttributionSamples &&
      attributionGain >= judge.attributionGain,
    noDirectLargeSmall:
      (forbidden.pursuit ?? 0) === 0 &&
      (forbidden.directThreat ?? 0) === 0 &&
      (forbidden.captures ?? 0) === 0,
  };
  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    baseline: {
      mediumRog: baselineMedium,
      smallRog: baselineSmall,
      mediumNeighbors: baselineNeighborsMedium,
      smallNeighbors: baselineNeighborsSmall,
      mediumAttribution: baselineAttribution,
    },
    peaks: {
      medium: mediumPeak,
      small: smallPeak,
      lag:
        mediumPeak && smallPeak ? smallPeak.time - mediumPeak.time : null,
    },
    impulseRatio,
    directImpulse,
    indirectImpulse,
    attributionGain,
    attributionSamples,
    fastestSmall,
  };
}

export function modeFlags(mode) {
  const steady = mode === 'steady';
  return { captureEnabled: steady, respawnEnabled: steady };
}

export function isRespawnCandidate({
  point,
  schoolIndex,
  config,
  derived,
  positions,
  alive,
  schoolIds,
  obstacleClearance = Infinity,
  rigidBodyClearance = Infinity,
}) {
  if (obstacleClearance <= 0 || rigidBodyClearance <= 0) return false;
  const tank = config.tank;
  const edgeBand = config.respawn.edgeBand;
  const half = [tank.width / 2, tank.height / 2, tank.depth / 2];
  const atEdge =
    half[0] - Math.abs(point[0]) <= edgeBand ||
    half[1] - Math.abs(point[1]) <= edgeBand ||
    half[2] - Math.abs(point[2]) <= edgeBand;
  if (!atEdge) return false;

  let hasSchoolmate = false;
  const ownRadius2 = derived.schools[schoolIndex].cohesionRadius ** 2;
  for (let index = 0; index < alive.length; index += 1) {
    if (!alive[index]) continue;
    const offset = index * 3;
    const dx = positions[offset] - point[0];
    const dy = positions[offset + 1] - point[1];
    const dz = positions[offset + 2] - point[2];
    const distance2 = dx * dx + dy * dy + dz * dz;
    const otherSchoolIndex = schoolIds[index];
    if (otherSchoolIndex === schoolIndex) {
      if (distance2 <= ownRadius2) hasSchoolmate = true;
      continue;
    }
    const relation = relationBetween(
      config.schools[otherSchoolIndex],
      config.schools[schoolIndex],
      config.relations
    );
    if (relation !== 'pursuit') continue;
    const safeDistance =
      config.respawn.predatorSafetyFactor *
      derived.schools[otherSchoolIndex].detectionLength;
    if (distance2 <= safeDistance * safeDistance) return false;
  }
  return hasSchoolmate;
}

export function radialAttribution({
  smallIndices,
  mediumSchoolIndex,
  positions,
  velocities,
  alive,
  schoolIds,
  radialSpeedThreshold,
  maxNeighborDistance = Infinity,
}) {
  const stats = groupStatistics(positions, velocities, smallIndices);
  let samples = 0;
  let attributedMedium = 0;
  for (const fish of smallIndices) {
    const offset = fish * 3;
    const rx = positions[offset] - stats.center[0];
    const ry = positions[offset + 1] - stats.center[1];
    const rz = positions[offset + 2] - stats.center[2];
    const radius = Math.hypot(rx, ry, rz);
    if (radius <= EPSILON) continue;
    const radialSpeed =
      ((velocities[offset] - stats.centerVelocity[0]) * rx +
        (velocities[offset + 1] - stats.centerVelocity[1]) * ry +
        (velocities[offset + 2] - stats.centerVelocity[2]) * rz) /
      radius;
    if (radialSpeed <= radialSpeedThreshold) continue;
    let nearest = -1;
    let nearestDistance2 = Infinity;
    for (let other = 0; other < alive.length; other += 1) {
      if (!alive[other] || schoolIds[other] === schoolIds[fish]) continue;
      const otherOffset = other * 3;
      const dx = positions[otherOffset] - positions[offset];
      const dy = positions[otherOffset + 1] - positions[offset + 1];
      const dz = positions[otherOffset + 2] - positions[offset + 2];
      const distance2 = dx * dx + dy * dy + dz * dz;
      if (distance2 < nearestDistance2) {
        nearest = other;
        nearestDistance2 = distance2;
      }
    }
    samples += 1;
    if (
      nearest < 0 ||
      nearestDistance2 > maxNeighborDistance * maxNeighborDistance
    ) {
      continue;
    }
    if (schoolIds[nearest] === mediumSchoolIndex) attributedMedium += 1;
  }
  return {
    samples,
    mediumRate: samples > 0 ? attributedMedium / samples : 0,
  };
}
