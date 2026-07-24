// Presets are an external input surface: browser storage and pasted JSON can
// contain values that the sliders can never produce. Stage the whole snapshot
// first, then commit only when every known field is finite and structurally
// safe. This keeps a rejected preset from half-mutating the live simulation.

export const PRESET_NUMERIC_LIMITS = {
  boids: {
    fishCount: [1, 10000],
    cruiseSpeed: [0.001, 5],
    maxSpeed: [0.001, 8],
    maxForce: [0, 100],
    separationRadius: [0, 5],
    separationWeight: [0, 50],
    alignmentRadius: [0, 5],
    alignmentWeight: [0, 50],
    cohesionRadius: [0, 5],
    cohesionWeight: [0, 50],
    perceptionFOV: [10, 360],
    detectionLength: [0.001, 10],
    avoidanceWeight: [0, 50],
    centeringWeight: [0, 10],
    angleStep: [1, 90],
    maxPitch: [0, 89],
    turnSpeed: [0.001, 50],
  },
  traits: {
    speed: [0, 100],
    size: [0, 100],
    stamina: [0, 100],
  },
  mapping: {
    speedOctaves: [0, 4],
    bodyScaleOctaves: [0, 3],
    sizeSpeedPenaltyOctaves: [0, 3],
    sizeForcePenaltyOctaves: [0, 3],
    sizeTurnPenaltyOctaves: [0, 3],
    separationRadiusOctaves: [-4, 4],
    separationWeightOctaves: [-4, 4],
    alignmentRadiusOctaves: [-4, 4],
    alignmentWeightOctaves: [-4, 4],
    cohesionRadiusOctaves: [-4, 4],
    cohesionWeightOctaves: [-4, 4],
    staminaCapacityOctaves: [0, 4],
  },
  energy: {
    capacityBase: [0.01, 20],
    drainPerSecond: [0, 1],
    basalShare: [0, 1],
    speedExponent: [0, 12],
    sizeExponent: [0, 10],
    tiredStart: [0, 1],
    exhaustedAt: [0, 1],
    minSpeedFactor: [0, 1],
    minAlignmentFactor: [0, 1],
    minCohesionFactor: [0, 1],
  },
  panic: {
    alertRadius: [0.001, 3],
    panicRadius: [0, 2],
    directOn: [0, 1],
    directOff: [0, 1],
    signalRadius: [0, 3],
    signalThreshold: [0, 1],
    signalDecayTime: [0, 10],
    senseTime: [0, 10],
    holdTime: [0, 10],
    refractoryTime: [0, 10],
    riseTime: [0, 10],
    fallTime: [0, 10],
    alignmentSourceBoost: [0, 40],
    alignmentReceiverBoost: [0, 40],
    alignmentReceiverMax: [0, 40],
    emergencyAlignmentWeight: [0, 40],
    panicTurnBoost: [0, 10],
    cohesionDrop: [0, 1],
    speedBoost: [0, 5],
    escapeWeight: [0, 40],
    predictionTime: [0, 3],
  },
  predator: {
    count: [0, 64],
    cruiseSpeed: [0, 4],
    maxSpeed: [0, 6],
    maxForce: [0, 40],
    turnSpeed: [0, 32],
    bodyScale: [0, 16],
    schoolSenseRadius: [0, 12],
    schoolAttractionWeight: [0, 24],
    targetPursuitWeight: [0, 24],
    targetLockTime: [0, 12],
    alarmPredatorRadius: [0, 3],
    alarmPredatorWeight: [0, 100],
    detectionLength: [0.001, 10],
    avoidanceWeight: [0, 32],
    predatorSeparationRadius: [0, 3.2],
    predatorSeparationWeight: [0, 24],
    captureRadius: [0, 1],
    captureCooldown: [0, 16],
    targetLeadTime: [0, 4],
  },
  captureFx: {
    particleCount: [1, 24],
    density: [0, 8],
    spawnRadius: [0.001, 1],
    spawnInterval: [0, 1.2],
    lifetime: [0.01, 6],
    cubeSize: [0.001, 0.24],
    upwardSpeed: [0, 4],
    radialSpeed: [0, 4],
    reverseVelocityFactor: [0, 8],
    biteFlashDuration: [0.01, 2],
    biteFlashScaleBoost: [0, 2],
    biteFlashSaturationBoost: [0, 2],
    biteFlashDarken: [0, 1],
    biteGlowRadius: [0.001, 2],
    biteGlowDuration: [0.01, 3],
    biteGlowStrength: [0, 3],
    biteGlowFalloff: [0, 12],
  },
  tankVisual: {
    gridOpacity: [0, 1],
    gridDivisions: [1, 24],
  },
  sim: {
    timeScale: [0, 8],
  },
};

const INTEGER_FIELDS = new Set([
  'boids.fishCount',
  'predator.count',
  'captureFx.particleCount',
  'tankVisual.gridDivisions',
]);
const ENUM_VALUES = {
  'boids.sepFalloff': new Set(['inverse', 'linear', 'invlog']),
};

function reject(path, reason) {
  return {
    ok: false,
    applied: 0,
    skipped: [],
    staged: {},
    error: `${path}: ${reason}`,
  };
}

function validateGroup(groupName, values) {
  if (groupName === 'energy' && values.exhaustedAt >= values.tiredStart) {
    return 'energy.exhaustedAt must be below energy.tiredStart';
  }
  if (groupName === 'panic') {
    if (values.panicRadius >= values.alertRadius) {
      return 'panic.panicRadius must be below panic.alertRadius';
    }
    if (values.directOff >= values.directOn) {
      return 'panic.directOff must be below panic.directOn';
    }
  }
  return null;
}

export function stageTuningPreset(params, targets, defaults) {
  const isGrouped =
    params &&
    typeof params === 'object' &&
    Object.keys(targets).some((key) => Object.hasOwn(params, key));
  const grouped = isGrouped ? params : { boids: params };
  const staged = {};
  const skipped = [];
  let applied = 0;

  for (const [groupName, values] of Object.entries(grouped ?? {})) {
    const target = targets[groupName];
    if (!target || !values || typeof values !== 'object' || Array.isArray(values)) {
      skipped.push(groupName);
      continue;
    }

    // A present group is a full snapshot. Fields introduced after an older
    // preset was saved start from this version's defaults.
    const next = { ...defaults[groupName] };
    for (const [key, value] of Object.entries(values)) {
      const path = `${groupName}.${key}`;
      if (!Object.hasOwn(target, key)) {
        skipped.push(path);
        continue;
      }
      if (typeof value !== typeof target[key]) {
        return reject(path, `expected ${typeof target[key]}`);
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) return reject(path, 'must be finite');
        const limits = PRESET_NUMERIC_LIMITS[groupName]?.[key];
        if (!limits) return reject(path, 'has no declared safety bounds');
        if (value < limits[0] || value > limits[1]) {
          return reject(path, `must be within ${limits[0]}–${limits[1]}`);
        }
        if (INTEGER_FIELDS.has(path) && !Number.isInteger(value)) {
          return reject(path, 'must be an integer');
        }
      }

      const allowed = ENUM_VALUES[path];
      if (allowed && !allowed.has(value)) {
        return reject(path, `must be one of ${[...allowed].join(', ')}`);
      }

      next[key] = value;
      applied++;
    }

    const groupError = validateGroup(groupName, next);
    if (groupError) return reject(groupName, groupError);
    staged[groupName] = next;
  }

  return { ok: true, applied, skipped, staged, error: null };
}
