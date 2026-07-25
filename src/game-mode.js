import {
  createDefaultConfig,
  deepClone,
} from './experiment-config.js';

export const GAME_PHASE = Object.freeze({
  TUNING: 'tuning',
  RUNNING: 'running',
  VERDICT: 'verdict',
  INHERIT: 'inherit',
  COMPLETE: 'complete',
});

export const PLAYER_SCHOOL_ID = 'medium';
export const COEFFICIENT_KEYS = Object.freeze([
  'size',
  'stamina',
  'speed',
]);
export const NEUTRAL_BARYCENTRIC_POINT = Object.freeze({
  size: 1 / 3,
  stamina: 1 / 3,
  speed: 1 / 3,
});
export const IDENTITY_COEFFICIENTS = Object.freeze({
  size: 1,
  stamina: 1,
  speed: 1,
});
export const ROUND_MULTIPLIER_RANGE = Object.freeze({
  minimum: 0.5,
  neutral: 1,
  maximum: 1.5,
});
export const GAME_RUNTIME_SEED_RANGE = Object.freeze({
  minimum: 1,
  maximum: 999999,
});
export const TRIANGLE_VERTICES = Object.freeze({
  speed: Object.freeze({ x: 0.5, y: 0 }),
  size: Object.freeze({ x: 0, y: Math.sqrt(3) / 2 }),
  stamina: Object.freeze({ x: 1, y: Math.sqrt(3) / 2 }),
});

const EPSILON = 1e-9;
const PLAYER_BASELINES = new WeakMap();
const GAME_BASELINES = new WeakMap();

export const PLAYER_PHENOTYPE_COUPLING = Object.freeze({
  sizeSpeedPenaltyExponent: 0.2,
  sizeTurnPenaltyExponent: 0.55,
  sizeMetabolismExponent: 1.25,
  activeSpeedMetabolismShare: 0.4,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function createLevelSpec({
  id,
  label,
  story,
  durationSec,
  winSurvivalPct,
  plankton,
  preyFish,
  rivalFish,
  playerFish,
  simulation,
  dressing,
}) {
  return deepFreeze({
    id,
    label,
    story,
    durationSec,
    winSurvivalPct,
    plankton: { enabled: true, ...plankton },
    preyFish,
    rivalFish,
    playerFish,
    simulation,
    rules: {
      reproduction: false,
      respawn: false,
    },
    terrain: { narrowGaps: false },
    dressing,
  });
}

export const LEVEL_1_SPEC = createLevelSpec({
  id: 'L1',
  label: '第一代 · 匮乏年代',
  story: '捕食者环伺，浮游只够勉强充饥。活下来比壮大更重要。',
  durationSec: 90,
  // 35% 仍是三关最低胜线，但会挡住首代极端缩体留下的 L2 软锁。
  winSurvivalPct: 35,
  plankton: {
    capacity: 300,
    initialFraction: 0.58,
    growthRate: 0.09,
    maxIntakePerFish: 0.035,
    energyConversion: 0.6,
  },
  preyFish: {
    id: 'small',
    name: '稀少食物鱼',
    count: 72,
    sizeClass: 1,
    captureRateMultiplier: 5,
  },
  rivalFish: {
    id: 'large',
    name: '饥荒捕食者',
    count: 24,
    sizeClass: 3,
    speedMultiplier: 1.2,
  },
  playerFish: {
    id: PLAYER_SCHOOL_ID,
    name: '蓝色进化鱼',
    count: 40,
  },
  simulation: {
    captureRate: 0.8,
    playerCaptureRateMultiplier: 0.35,
    rivalCaptureRateMultiplier: 0.3,
    relationK: 1.25,
    // 极端缩体后的 0.75 蓝鱼会被 small 反捕食；3.0 大鱼忽略
    // size=1 的 small（避免先吃光这批反制者），但仍捕食适度缩体
    // 后 size=1.2 的蓝鱼。
    relationKMax: 2.9,
    captureLengthFactor: 1.5,
    activityScale: 1,
  },
  dressing: {
    bg: '#071426',
    propsRef: 'scarcity',
    musicRef: 'scarcity',
  },
});

export const LEVEL_2_SPEC = createLevelSpec({
  id: 'L2',
  label: '第二代 · 黄金时代',
  story: '浮游见底，少量捕食者之外出现了与你原本平行的鱼群。',
  durationSec: 75,
  winSurvivalPct: 75,
  plankton: {
    capacity: 180,
    initialFraction: 0.28,
    growthRate: 0.04,
    maxIntakePerFish: 0.03,
  },
  preyFish: {
    id: 'small',
    name: '平行鱼',
    count: 110,
    sizeClass: 1.2,
    captureRateMultiplier: 5,
  },
  rivalFish: {
    id: 'large',
    name: '稀少捕食者',
    count: 2,
    sizeClass: 2.25,
  },
  playerFish: {
    id: PLAYER_SCHOOL_ID,
    name: '蓝色进化鱼',
    count: 40,
    grazeRate: 0.02,
  },
  simulation: {
    captureRate: 0.8,
    playerCaptureRateMultiplier: 2,
    rivalCaptureRateMultiplier: 0.04,
    // 平行鱼必须能反过来捕食多代缩小的蓝鱼；增大到门槛后关系才
    // 从 prey/peer 翻为 predator，形成 L2 的体型教学。
    relationKMax: 3.3,
    captureLengthFactor: 2,
    ecology: {
      // TUNING now preserves the inherited-layout positions into RUNNING.
      // A successful parallel-fish capture must therefore sustain the whole
      // school even on the least favorable published attempt seed.
      captureEnergyPerSize: 9,
      burstMetabolicRate: 0.005,
    },
    relations: {
      targetLockTime: 5,
      burstRadiusFactor: 1,
    },
    locomotion: {
      burstFactor: 2.5,
      burstForceBudget: 3,
    },
    activityScale: 1,
  },
  dressing: {
    bg: '#12324a',
    propsRef: 'golden-age',
    musicRef: 'golden-age',
  },
});

export const LEVEL_3_SPEC = createLevelSpec({
  id: 'L3',
  label: '第三代 · 后疫情时代',
  story: '食物与猎食者都已稀少，整个生态降低活动，耐力决定谁能熬到最后。',
  durationSec: 105,
  winSurvivalPct: 50,
  plankton: {
    capacity: 46,
    initialFraction: 0.34,
    growthRate: 0.03,
    maxIntakePerFish: 0.025,
  },
  preyFish: {
    id: 'small',
    name: '零散鱼群',
    count: 10,
    sizeClass: 1,
  },
  rivalFish: {
    id: 'large',
    name: '迟缓捕食者',
    count: 2,
    sizeClass: 2.25,
  },
  playerFish: {
    id: PLAYER_SCHOOL_ID,
    name: '蓝色进化鱼',
    count: 40,
  },
  simulation: {
    captureRate: 0.8,
    playerCaptureRateMultiplier: 0.1,
    rivalCaptureRateMultiplier: 0.04,
    relationKMax: 1.667,
    activityScale: 0.72,
  },
  dressing: {
    bg: '#111c28',
    propsRef: 'post-pandemic',
    musicRef: 'post-pandemic',
  },
});

const levelSpecs = [LEVEL_1_SPEC, LEVEL_2_SPEC, LEVEL_3_SPEC];
Object.defineProperties(levelSpecs, {
  L1: { value: LEVEL_1_SPEC },
  L2: { value: LEVEL_2_SPEC },
  L3: { value: LEVEL_3_SPEC },
});
export const LEVEL_SPECS = Object.freeze(levelSpecs);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readFinite(value, key) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${key} must be a finite number`);
  }
  return number;
}

export function randomGameRuntimeSeed(random = Math.random) {
  if (typeof random !== 'function') {
    throw new TypeError('random must be a function');
  }
  const sample = Number(random());
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('random must return a number in [0, 1)');
  }
  const { minimum, maximum } = GAME_RUNTIME_SEED_RANGE;
  return minimum + Math.floor(sample * (maximum - minimum + 1));
}

/**
 * One seed belongs to one playable attempt. TUNING and RUNNING reuse it so
 * pressing Start never reshuffles the scene, while retry/next/restart renew it.
 */
export class GameAttemptSeed {
  #random;
  #current;

  constructor({ random = Math.random } = {}) {
    if (typeof random !== 'function') {
      throw new TypeError('random must be a function');
    }
    this.#random = random;
    this.#current = null;
  }

  get current() {
    return this.#current;
  }

  ensure() {
    return this.#current ?? this.renew();
  }

  renew() {
    const previous = this.#current;
    let next = randomGameRuntimeSeed(this.#random);
    if (next === previous) {
      next =
        next === GAME_RUNTIME_SEED_RANGE.maximum
          ? GAME_RUNTIME_SEED_RANGE.minimum
          : next + 1;
    }
    this.#current = next;
    return this.#current;
  }
}

function copyAndValidateCoefficients(coefficients) {
  if (
    !coefficients ||
    typeof coefficients !== 'object' ||
    Array.isArray(coefficients)
  ) {
    throw new TypeError('coefficients must be an object');
  }
  const result = {};
  for (const key of COEFFICIENT_KEYS) {
    result[key] = readFinite(coefficients[key], key);
    if (result[key] <= 0) {
      throw new RangeError(`${key} coefficient must be greater than zero`);
    }
  }
  return result;
}

function rawBarycentric(point) {
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    throw new TypeError('barycentric point must be an object');
  }
  return COEFFICIENT_KEYS.map((key) => readFinite(point[key], key));
}

function projectToSimplex(values) {
  const sorted = [...values].sort((a, b) => b - a);
  let rho = -1;
  let cumulative = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    cumulative += sorted[index];
    const theta = (cumulative - 1) / (index + 1);
    if (sorted[index] - theta > 0) rho = index;
  }
  const theta =
    (sorted.slice(0, rho + 1).reduce((sum, value) => sum + value, 0) -
      1) /
    (rho + 1);
  const projected = values.map((value) => Math.max(0, value - theta));
  const total = projected.reduce((sum, value) => sum + value, 0);
  projected[projected.length - 1] += 1 - total;
  return projected;
}

export function normalizeBarycentricPoint(
  point,
  { project = false } = {}
) {
  let values = rawBarycentric(point);
  const total = values.reduce((sum, value) => sum + value, 0);
  const valid =
    values.every((value) => value >= -EPSILON) &&
    Math.abs(total - 1) <= EPSILON;
  if (!valid && !project) {
    throw new RangeError(
      'barycentric weights must be non-negative and total 1'
    );
  }
  if (!valid) {
    values = projectToSimplex(values);
  } else {
    values = values.map((value) => Math.max(0, value));
    values[values.length - 1] +=
      1 - values.reduce((sum, value) => sum + value, 0);
  }
  return {
    size: values[0],
    stamina: values[1],
    speed: values[2],
  };
}

export function barycentricToCartesian(
  point,
  vertices = TRIANGLE_VERTICES
) {
  const weights = normalizeBarycentricPoint(point);
  return {
    x: COEFFICIENT_KEYS.reduce(
      (sum, key) => sum + weights[key] * vertices[key].x,
      0
    ),
    y: COEFFICIENT_KEYS.reduce(
      (sum, key) => sum + weights[key] * vertices[key].y,
      0
    ),
  };
}

export function cartesianToBarycentric(
  point,
  { vertices = TRIANGLE_VERTICES, project = true } = {}
) {
  const x = readFinite(point?.x, 'x');
  const y = readFinite(point?.y, 'y');
  const a = vertices.size;
  const b = vertices.stamina;
  const c = vertices.speed;
  const denominator =
    (b.y - c.y) * (a.x - c.x) +
    (c.x - b.x) * (a.y - c.y);
  if (Math.abs(denominator) <= EPSILON) {
    throw new RangeError('triangle vertices must not be collinear');
  }
  const size =
    ((b.y - c.y) * (x - c.x) +
      (c.x - b.x) * (y - c.y)) /
    denominator;
  const stamina =
    ((c.y - a.y) * (x - c.x) +
      (a.x - c.x) * (y - c.y)) /
    denominator;
  return normalizeBarycentricPoint(
    { size, stamina, speed: 1 - size - stamina },
    { project }
  );
}

export function roundMultiplierForWeight(weight) {
  const value = readFinite(weight, 'weight');
  if (value < -EPSILON || value > 1 + EPSILON) {
    throw new RangeError('barycentric weight must be between 0 and 1');
  }
  const bounded = clamp(value, 0, 1);
  if (Math.abs(bounded - 1 / 3) <= EPSILON) return 1;
  return bounded < 1 / 3
    ? 0.5 + 1.5 * bounded
    : 0.75 + 0.75 * bounded;
}

export function deriveRoundMultipliers(
  point = NEUTRAL_BARYCENTRIC_POINT
) {
  const weights = normalizeBarycentricPoint(point);
  return Object.freeze({
    size: roundMultiplierForWeight(weights.size),
    stamina: roundMultiplierForWeight(weights.stamina),
    speed: roundMultiplierForWeight(weights.speed),
  });
}

export function multiplyCoefficients(
  inherited = IDENTITY_COEFFICIENTS,
  round = IDENTITY_COEFFICIENTS
) {
  const left = copyAndValidateCoefficients(inherited);
  const right = copyAndValidateCoefficients(round);
  return Object.freeze({
    size: left.size * right.size,
    stamina: left.stamina * right.stamina,
    speed: left.speed * right.speed,
  });
}

export function previewCumulativeCoefficients(
  inherited = IDENTITY_COEFFICIENTS,
  point = NEUTRAL_BARYCENTRIC_POINT
) {
  return multiplyCoefficients(
    inherited,
    deriveRoundMultipliers(point)
  );
}

function playerBaseline(school) {
  return {
    size: school.size,
    cruiseSpeed: school.cruiseSpeed,
    maxSpeed: school.maxSpeed,
    turnSpeed: school.turnSpeed,
    metabolismMultiplier: school.metabolismMultiplier ?? 1,
  };
}

export const PLAYER_IDEAL_BASE_VALUES = deepFreeze(
  playerBaseline(
    createDefaultConfig().schools.find(
      (school) => school.id === PLAYER_SCHOOL_ID
    )
  )
);

export function derivePlayerPhenotype(
  idealBase,
  cumulative = IDENTITY_COEFFICIENTS
) {
  const base = playerBaseline(idealBase);
  const coefficients = copyAndValidateCoefficients(cumulative);
  const sizeSpeedPenalty =
    coefficients.size **
    -PLAYER_PHENOTYPE_COUPLING.sizeSpeedPenaltyExponent;
  const movementSpeedMultiplier =
    coefficients.speed * sizeSpeedPenalty;
  const turnSpeedMultiplier =
    coefficients.size **
    -PLAYER_PHENOTYPE_COUPLING.sizeTurnPenaltyExponent;
  const metabolismMultiplier =
    ((1 - PLAYER_PHENOTYPE_COUPLING.activeSpeedMetabolismShare +
      PLAYER_PHENOTYPE_COUPLING.activeSpeedMetabolismShare *
        coefficients.speed) *
      coefficients.size **
        PLAYER_PHENOTYPE_COUPLING.sizeMetabolismExponent) /
    coefficients.stamina;

  return Object.freeze({
    coefficients: Object.freeze(coefficients),
    size: base.size * coefficients.size,
    cruiseSpeed: base.cruiseSpeed * movementSpeedMultiplier,
    maxSpeed: base.maxSpeed * movementSpeedMultiplier,
    turnSpeed: base.turnSpeed * turnSpeedMultiplier,
    metabolismMultiplier:
      base.metabolismMultiplier * metabolismMultiplier,
    movementSpeedMultiplier,
    sizeSpeedPenaltyMultiplier: sizeSpeedPenalty,
    turnSpeedMultiplier,
  });
}

/**
 * Returns a new config and always derives the player phenotype from the same
 * ideal baseline. Reapplying coefficients therefore cannot compound an
 * already transformed config accidentally.
 */
export function applyPlayerCoefficients(
  baseConfig,
  cumulative = IDENTITY_COEFFICIENTS
) {
  if (!baseConfig || !Array.isArray(baseConfig.schools)) {
    throw new TypeError('baseConfig must contain schools');
  }
  const sourcePlayer = baseConfig.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  if (!sourcePlayer) {
    throw new RangeError(`missing player school: ${PLAYER_SCHOOL_ID}`);
  }
  const baseline =
    PLAYER_BASELINES.get(sourcePlayer) ?? playerBaseline(sourcePlayer);
  const phenotype = derivePlayerPhenotype(baseline, cumulative);
  const result = deepClone(baseConfig);
  const player = result.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );

  Object.assign(player, {
    size: phenotype.size,
    cruiseSpeed: phenotype.cruiseSpeed,
    maxSpeed: phenotype.maxSpeed,
    turnSpeed: phenotype.turnSpeed,
    metabolismMultiplier: phenotype.metabolismMultiplier,
  });
  PLAYER_BASELINES.set(player, baseline);
  return result;
}

function findLevelSpec(level) {
  if (level && typeof level === 'object' && level.id) {
    const found = LEVEL_SPECS.find((item) => item.id === level.id);
    if (found) return found;
  }
  const normalized =
    typeof level === 'number'
      ? `L${level}`
      : String(level ?? 'L1').toUpperCase();
  const found = LEVEL_SPECS.find((item) => item.id === normalized);
  if (!found) throw new RangeError(`unknown game level: ${level}`);
  return found;
}

function requireSchool(config, id) {
  const school = config.schools.find((item) => item.id === id);
  if (!school) throw new RangeError(`missing school: ${id}`);
  return school;
}

function applyLevelSpec(baseConfig, spec) {
  const result = deepClone(baseConfig);
  const small = requireSchool(result, 'small');
  const player = requireSchool(result, PLAYER_SCHOOL_ID);
  const large = requireSchool(result, 'large');

  Object.assign(result.runtime, {
    project: 'game',
    mode: 'steady',
    populationPreset: 'custom',
  });
  Object.assign(result.tank, {
    preset: 'game',
    width: 6,
    height: 3.6,
    depth: 2.4,
  });
  result.obstacles.enabled = false;
  result.traits.enabled = false;
  result.ecology.enabled = true;
  Object.assign(result.plankton, spec.plankton, { enabled: true });
  result.capture.targetCaptureRate = spec.simulation.captureRate;
  if (spec.simulation.captureLengthFactor !== undefined) {
    result.capture.captureLengthFactor =
      spec.simulation.captureLengthFactor;
  }
  if (spec.simulation.relationK !== undefined) {
    result.relations.k = spec.simulation.relationK;
  }
  result.relations.KMax = spec.simulation.relationKMax;
  Object.assign(result.ecology, spec.simulation.ecology);
  Object.assign(result.relations, spec.simulation.relations);
  Object.assign(result.locomotion, spec.simulation.locomotion);

  Object.assign(small, {
    name: spec.preyFish.name,
    count: spec.preyFish.count,
    size: spec.preyFish.sizeClass,
    ...(spec.preyFish.captureRateMultiplier === undefined
      ? {}
      : {
          captureRateMultiplier:
            spec.preyFish.captureRateMultiplier,
        }),
  });
  Object.assign(player, {
    name: spec.playerFish.name,
    count: spec.playerFish.count,
    captureRateMultiplier:
      spec.simulation.playerCaptureRateMultiplier,
    ...(spec.playerFish.grazeRate === undefined
      ? {}
      : { grazeRate: spec.playerFish.grazeRate }),
  });
  Object.assign(large, {
    name: spec.rivalFish.name,
    count: spec.rivalFish.count,
    size: spec.rivalFish.sizeClass,
    captureRateMultiplier:
      spec.simulation.rivalCaptureRateMultiplier,
  });
  if (spec.rivalFish.speedMultiplier !== undefined) {
    large.cruiseSpeed *= spec.rivalFish.speedMultiplier;
    large.maxSpeed *= spec.rivalFish.speedMultiplier;
  }

  const activityScale = spec.simulation.activityScale;
  if (activityScale !== 1) {
    for (const school of result.schools) {
      school.cruiseSpeed *= activityScale;
      school.maxSpeed *= activityScale;
      school.turnSpeed *= activityScale;
    }
  }
  return result;
}

/**
 * Builds a fresh simulation config for one attempt. No live fish, energy, or
 * previous population is carried between calls.
 */
export function createGameLevelConfig(
  baseConfig = createDefaultConfig(),
  level = 'L1',
  cumulative = IDENTITY_COEFFICIENTS
) {
  // Convenience overload: createGameLevelConfig('L2', cumulative)
  if (
    typeof baseConfig === 'string' ||
    typeof baseConfig === 'number' ||
    (baseConfig && baseConfig.id && !baseConfig.schools)
  ) {
    cumulative =
      level && typeof level === 'object' ? level : cumulative;
    level = baseConfig;
    baseConfig = createDefaultConfig();
  }
  const spec = findLevelSpec(level);
  // A generated level config is a simulation snapshot, not the next level's
  // baseline. Remember the caller's pristine ideal config so passing an L1/L2
  // result back here still rebuilds from the same source instead of leaking
  // per-level ecology overrides or compounding NPC speed multipliers.
  const idealBase =
    GAME_BASELINES.get(baseConfig) ??
    (baseConfig.runtime?.project === 'game' ||
    baseConfig.tank?.preset === 'game'
      ? createDefaultConfig()
      : deepClone(baseConfig));
  const levelConfig = applyLevelSpec(idealBase, spec);
  const result = applyPlayerCoefficients(levelConfig, cumulative);
  GAME_BASELINES.set(result, idealBase);
  return result;
}

function copyReport(report, finalCoefficients) {
  if (!report || typeof report !== 'object') {
    throw new TypeError('round report must be an object');
  }
  const initial = Number(report.initial);
  const survivors = Number(report.survivors);
  const eaten = Number(
    report.deaths?.eaten ?? report.deaths?.captured ?? 0
  );
  const starved = Number(report.deaths?.starved ?? 0);
  for (const [key, value] of Object.entries({
    initial,
    survivors,
    eaten,
    starved,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`round report ${key} must be a non-negative integer`);
    }
  }
  if (initial <= 0) {
    throw new RangeError('round report initial must be greater than zero');
  }
  if (survivors + eaten + starved !== initial) {
    throw new RangeError(
      'round report must satisfy survivors + eaten + starved = initial'
    );
  }
  return deepFreeze({
    survivors,
    initial,
    deaths: { eaten, starved },
    finalCoefficients: { ...finalCoefficients },
    events: Array.isArray(report.events) ? deepClone(report.events) : [],
  });
}

function assertPhase(actual, ...allowed) {
  if (!allowed.includes(actual)) {
    throw new Error(
      `illegal game transition from ${actual}; expected ${allowed.join(' or ')}`
    );
  }
}

export class GameSession {
  #phase;
  #levelIndex;
  #barycentric;
  #inheritedCoefficients;
  #submittedBarycentric;
  #submittedRoundMultipliers;
  #submittedPreviewCumulative;
  #report;
  #verdict;
  #lineage;

  constructor({
    initialBarycentric = NEUTRAL_BARYCENTRIC_POINT,
    initialInheritedCoefficients = IDENTITY_COEFFICIENTS,
  } = {}) {
    this.#phase = GAME_PHASE.TUNING;
    this.#levelIndex = 0;
    this.#barycentric =
      normalizeBarycentricPoint(initialBarycentric);
    this.#inheritedCoefficients =
      copyAndValidateCoefficients(initialInheritedCoefficients);
    this.#submittedBarycentric = null;
    this.#submittedRoundMultipliers = null;
    this.#submittedPreviewCumulative = null;
    this.#report = null;
    this.#verdict = null;
    this.#lineage = [];
  }

  get phase() {
    return this.#phase;
  }

  get levelIndex() {
    return this.#levelIndex;
  }

  get currentLevel() {
    return LEVEL_SPECS[this.#levelIndex] ?? null;
  }

  get barycentric() {
    return { ...this.#barycentric };
  }

  get trianglePoint() {
    return barycentricToCartesian(this.#barycentric);
  }

  get roundMultipliers() {
    return {
      ...deriveRoundMultipliers(this.#barycentric),
    };
  }

  get inheritedCoefficients() {
    return { ...this.#inheritedCoefficients };
  }

  get previewCumulative() {
    if (this.#submittedPreviewCumulative) {
      return { ...this.#submittedPreviewCumulative };
    }
    return {
      ...previewCumulativeCoefficients(
        this.#inheritedCoefficients,
        this.#barycentric
      ),
    };
  }

  get submittedBarycentric() {
    return this.#submittedBarycentric
      ? { ...this.#submittedBarycentric }
      : null;
  }

  get submittedRoundMultipliers() {
    return this.#submittedRoundMultipliers
      ? { ...this.#submittedRoundMultipliers }
      : null;
  }

  get report() {
    return this.#report;
  }

  get verdict() {
    return this.#verdict;
  }

  get lineage() {
    return this.#lineage.slice();
  }

  get canTune() {
    return this.#phase === GAME_PHASE.TUNING;
  }

  setBarycentric(point) {
    assertPhase(this.#phase, GAME_PHASE.TUNING);
    this.#barycentric = normalizeBarycentricPoint(point);
    return this.barycentric;
  }

  setTrianglePoint(point) {
    return this.setBarycentric(
      cartesianToBarycentric(point, { project: true })
    );
  }

  startLevel() {
    assertPhase(this.#phase, GAME_PHASE.TUNING);
    this.#submittedBarycentric = {
      ...normalizeBarycentricPoint(this.#barycentric),
    };
    this.#submittedRoundMultipliers = {
      ...deriveRoundMultipliers(this.#submittedBarycentric),
    };
    this.#submittedPreviewCumulative = {
      ...multiplyCoefficients(
        this.#inheritedCoefficients,
        this.#submittedRoundMultipliers
      ),
    };
    this.#report = null;
    this.#verdict = null;
    this.#phase = GAME_PHASE.RUNNING;
    return deepFreeze({
      barycentric: { ...this.#submittedBarycentric },
      roundMultipliers: { ...this.#submittedRoundMultipliers },
      previewCumulative: { ...this.#submittedPreviewCumulative },
    });
  }

  finishLevel(report) {
    assertPhase(this.#phase, GAME_PHASE.RUNNING);
    this.#report = copyReport(
      report,
      this.#submittedPreviewCumulative
    );
    const survivalPct =
      (this.#report.survivors / this.#report.initial) * 100;
    const won =
      survivalPct + EPSILON >= this.currentLevel.winSurvivalPct;
    this.#verdict = deepFreeze({
      won,
      survivalPct,
      thresholdPct: this.currentLevel.winSurvivalPct,
      reason:
        this.#report.survivors === 0
          ? 'extinct'
          : won
            ? 'passed'
            : 'below-threshold',
    });
    this.#phase = GAME_PHASE.VERDICT;
    return this.#verdict;
  }

  retryLevel() {
    assertPhase(this.#phase, GAME_PHASE.VERDICT);
    if (this.#verdict.won) {
      throw new Error('a successful level must be inherited, not retried');
    }
    this.#barycentric = { ...this.#submittedBarycentric };
    this.#submittedBarycentric = null;
    this.#submittedRoundMultipliers = null;
    this.#submittedPreviewCumulative = null;
    this.#report = null;
    this.#verdict = null;
    this.#phase = GAME_PHASE.TUNING;
    return this.barycentric;
  }

  sealGeneration() {
    assertPhase(this.#phase, GAME_PHASE.VERDICT);
    if (!this.#verdict.won) {
      throw new Error('a failed level cannot create a generation record');
    }
    const record = deepFreeze({
      gen: this.#lineage.length + 1,
      barycentric: { ...this.#submittedBarycentric },
      roundMultipliers: { ...this.#submittedRoundMultipliers },
      cumulativeBefore: { ...this.#inheritedCoefficients },
      cumulativeAfter: { ...this.#submittedPreviewCumulative },
      level: this.currentLevel.id,
      verdict: deepClone(this.#verdict),
      report: deepClone(this.#report),
    });
    this.#lineage.push(record);
    this.#inheritedCoefficients = {
      ...this.#submittedPreviewCumulative,
    };
    this.#phase = GAME_PHASE.INHERIT;
    return record;
  }

  advanceLevel() {
    assertPhase(this.#phase, GAME_PHASE.INHERIT);
    if (this.#levelIndex === LEVEL_SPECS.length - 1) {
      this.#phase = GAME_PHASE.COMPLETE;
      return null;
    }
    this.#levelIndex += 1;
    this.#barycentric = { ...NEUTRAL_BARYCENTRIC_POINT };
    this.#submittedBarycentric = null;
    this.#submittedRoundMultipliers = null;
    this.#submittedPreviewCumulative = null;
    this.#report = null;
    this.#verdict = null;
    this.#phase = GAME_PHASE.TUNING;
    return this.currentLevel;
  }

  restart() {
    this.#phase = GAME_PHASE.TUNING;
    this.#levelIndex = 0;
    this.#barycentric = { ...NEUTRAL_BARYCENTRIC_POINT };
    this.#inheritedCoefficients = { ...IDENTITY_COEFFICIENTS };
    this.#submittedBarycentric = null;
    this.#submittedRoundMultipliers = null;
    this.#submittedPreviewCumulative = null;
    this.#report = null;
    this.#verdict = null;
    this.#lineage = [];
    return this.snapshot();
  }

  restartGame() {
    return this.restart();
  }

  snapshot() {
    return {
      phase: this.#phase,
      levelIndex: this.#levelIndex,
      level: this.currentLevel,
      barycentric: this.barycentric,
      roundMultipliers: this.roundMultipliers,
      inheritedCoefficients: this.inheritedCoefficients,
      previewCumulative: this.previewCumulative,
      report: this.#report,
      verdict: this.#verdict,
      lineage: this.lineage,
    };
  }
}
