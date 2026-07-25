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

export function sustainedSpeedScale(config, school) {
  if (!config.traits?.enabled) return 1;
  return Math.max(
    config.traits.minSustainedSpeedFactor,
    school.size ** -config.traits.sizeSpeedPenaltyExponent
  );
}

export function effectiveTurnSpeed(config, school) {
  if (!config.traits?.enabled) return school.turnSpeed;
  return (
    school.turnSpeed *
    Math.max(
      config.traits.minTurnFactor,
      school.size ** -config.traits.sizeTurnPenaltyExponent
    )
  );
}

export function effectiveMaxSpeed(config, school, state = 'cruise') {
  const sustainedScale = sustainedSpeedScale(config, school);
  const sustainedMax = school.maxSpeed * sustainedScale;
  if (state === 'pursuit' || state === 'burst') {
    return sustainedMax * config.locomotion.burstFactor;
  }
  if (state === 'evade') {
    return sustainedMax * config.locomotion.panicSpeedFactor;
  }
  return sustainedMax;
}

export function metabolicRate(config, school, bursting = false) {
  const ecology = config.ecology;
  const basal =
    ecology.basalRate /
    Math.max(EPSILON, school.size ** ecology.basalSizeExponent);
  return basal + (bursting ? ecology.burstMetabolicRate : 0);
}

export function stepPlankton({
  level,
  capacity,
  growthRate,
  requestedConsumption,
  dt,
}) {
  const safeCapacity = Math.max(EPSILON, capacity);
  const current = Math.max(0, Math.min(safeCapacity, level));
  const growth =
    growthRate * current * (1 - current / safeCapacity) * Math.max(0, dt);
  const available = Math.min(safeCapacity, current + growth);
  const consumed = Math.min(
    available,
    Math.max(0, requestedConsumption)
  );
  return {
    level: Math.max(0, available - consumed),
    growth,
    consumed,
    fulfillment:
      requestedConsumption > EPSILON
        ? consumed / requestedConsumption
        : 1,
  };
}

export function ecologyOutcome(aliveCounts) {
  const surviving = aliveCounts
    .map((count, index) => ({ count, index }))
    .filter((item) => item.count > 0);
  if (surviving.length === 0) {
    return { state: 'collapse', winnerIndex: null };
  }
  if (surviving.length === 1) {
    return { state: 'winner', winnerIndex: surviving[0].index };
  }
  return { state: 'running', winnerIndex: null };
}

export function relationForRatio(ratio, relations, previous = 'ignore') {
  const { k, hysteresis } = relations;
  if (!Number.isFinite(ratio) || ratio <= 0) return 'ignore';
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
