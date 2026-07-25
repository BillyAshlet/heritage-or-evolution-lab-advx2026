#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  IDENTITY_COEFFICIENTS,
  LEVEL_SPECS,
  NEUTRAL_BARYCENTRIC_POINT,
  PLAYER_SCHOOL_ID,
  createGameLevelConfig,
  deriveRoundMultipliers,
  multiplyCoefficients,
  normalizeBarycentricPoint,
} from '../src/game-mode.js';
import { ExperimentSimulation } from '../src/experiment-simulation.js';

export const DEFAULT_BALANCE_SEEDS = Object.freeze([
  1001,
  2003,
  3001,
  4001,
  5003,
]);

const EPSILON = 1e-9;
const AXES = Object.freeze(['size', 'stamina', 'speed']);

export const CALIBRATED_GAME_PATH = Object.freeze([
  Object.freeze({
    level: 'L1',
    barycentric: Object.freeze({
      size: 0.2,
      stamina: 0.4,
      speed: 0.4,
    }),
  }),
  Object.freeze({
    level: 'L2',
    barycentric: Object.freeze({
      size: 0.8,
      stamina: 0,
      speed: 0.2,
    }),
  }),
  Object.freeze({
    level: 'L3',
    barycentric: Object.freeze({
      size: 0.0625,
      stamina: 0.875,
      speed: 0.0625,
    }),
  }),
]);

export const WRONG_ROUND_POINTS = Object.freeze({
  L1: Object.freeze({
    label: '极端缩体与耐力',
    barycentric: Object.freeze({ size: 0, stamina: 1, speed: 0 }),
  }),
  L2: Object.freeze({
    label: '继续缩体',
    barycentric: Object.freeze({ size: 0, stamina: 1, speed: 0 }),
  }),
  L3: Object.freeze({
    label: '只押速度',
    barycentric: Object.freeze({ size: 0, stamina: 0, speed: 1 }),
  }),
});

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce(
      (sum, value) => sum + (value - average) ** 2,
      0
    ) / values.length
  );
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (
    sorted[lower] * (upper - position) +
    sorted[upper] * (position - lower)
  );
}

function resolveLevel(level) {
  const id =
    typeof level === 'object'
      ? level.id
      : typeof level === 'number'
        ? `L${level}`
        : String(level).toUpperCase();
  const spec = LEVEL_SPECS.find((item) => item.id === id);
  if (!spec) throw new RangeError(`unknown level: ${level}`);
  return spec;
}

function copyCoefficients(coefficients) {
  const result = {};
  for (const axis of AXES) {
    const value = Number(coefficients?.[axis]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${axis} coefficient must be positive`);
    }
    result[axis] = value;
  }
  return result;
}

/**
 * Returns all barycentric lattice points for an equilateral triangle.
 * divisions=4 yields 15 points; divisions=10 yields 66.
 */
export function generateBarycentricGrid(divisions = 4) {
  const count = Number(divisions);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new RangeError('divisions must be an integer from 1 to 100');
  }
  const points = [];
  for (let size = 0; size <= count; size += 1) {
    for (let stamina = 0; stamina <= count - size; stamina += 1) {
      const speed = count - size - stamina;
      points.push({
        size: size / count,
        stamina: stamina / count,
        speed: speed / count,
      });
    }
  }
  if (count % 3 !== 0) {
    points.push({ ...NEUTRAL_BARYCENTRIC_POINT });
  }
  return points;
}

function barycentricKey(point) {
  const normalized = normalizeBarycentricPoint(point);
  return AXES.map((axis) => normalized[axis].toFixed(12)).join('/');
}

function uniqueBarycentricPoints(points) {
  const seen = new Set();
  const unique = [];
  for (const rawPoint of points) {
    const point = normalizeBarycentricPoint(rawPoint);
    const key = barycentricKey(point);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
}

/**
 * A coarse lattice cannot represent the deliberately asymmetric L3 point
 * without exploding to a 1/16 grid. Each level therefore adds its documented
 * calibration point to the ordinary exploratory grid.
 */
export function generateLevelSearchPoints(level, divisions = 4) {
  const spec = resolveLevel(level);
  const calibrated = CALIBRATED_GAME_PATH.find(
    (step) => step.level === spec.id
  );
  return uniqueBarycentricPoints([
    ...generateBarycentricGrid(divisions),
    calibrated.barycentric,
  ]);
}

function playerPopulation(metrics) {
  const population = metrics.population.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  if (!population) {
    throw new Error(`simulation omitted ${PLAYER_SCHOOL_ID} population`);
  }
  return population;
}

function configureTrialConfig(config, seed, fixedDt) {
  Object.assign(config.runtime, {
    seed,
    randomizeSeed: false,
    fixedDt,
    timeScale: 1,
  });
  config.physics.enabled = false;
  config.captureVfx.enabled = false;
  config.plankton.visualCount = 0;
  return config;
}

function weightedStateChecksum(values) {
  return round(
    values.reduce(
      (sum, value, index) =>
        sum + value * ((index % 17) + 1),
      0
    )
  );
}

/**
 * Executes production boids, predation, eating, energy and permanent death.
 * Rendering, Rapier and particle meshes are disabled for repeatable headless
 * evaluation. There is no reproduction or automatic population refill.
 */
export function runGameBalanceTrial({
  level,
  cumulativeCoefficients = IDENTITY_COEFFICIENTS,
  initialCumulativeCoefficients = cumulativeCoefficients,
  seed,
  dt = 1 / 30,
  durationSec,
} = {}) {
  const spec = resolveLevel(level);
  const cumulative = copyCoefficients(cumulativeCoefficients);
  const initialCumulative = copyCoefficients(
    initialCumulativeCoefficients
  );
  const numericSeed = Number(seed);
  if (!Number.isInteger(numericSeed)) {
    throw new RangeError('seed must be an integer');
  }
  const fixedDt = Number(dt);
  if (!Number.isFinite(fixedDt) || fixedDt <= 0 || fixedDt > 0.25) {
    throw new RangeError('dt must be greater than 0 and at most 0.25 seconds');
  }
  const duration =
    durationSec === undefined ? spec.durationSec : Number(durationSec);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new RangeError('durationSec must be positive');
  }

  const initialConfig = configureTrialConfig(
    createGameLevelConfig(spec.id, initialCumulative),
    numericSeed,
    fixedDt
  );
  const config = configureTrialConfig(
    createGameLevelConfig(spec.id, cumulative),
    numericSeed,
    fixedDt
  );
  if ('respawn' in config || 'reproduction' in config) {
    throw new Error('balance trials must never replenish fish');
  }

  const simulation = new ExperimentSimulation({
    scene: null,
    config: initialConfig,
    distanceField: null,
    physics: null,
  });
  // Match the browser route: TUNING is born from inherited coefficients,
  // the submitted phenotype is applied live, then all scoring state is reset
  // while the visible starting kinematics are preserved.
  simulation.setConfig(config, 'live');
  simulation.beginGameplayFromPreview();
  const startPositionChecksum = weightedStateChecksum(
    simulation.positions
  );
  const startVelocityChecksum = weightedStateChecksum(
    simulation.velocities
  );
  const playerIndex = config.schools.findIndex(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  const initial = config.schools[playerIndex].count;
  let steps = 0;
  while (simulation.elapsed + EPSILON < duration) {
    simulation._advance(
      Math.min(fixedDt, duration - simulation.elapsed)
    );
    steps += 1;
    if (simulation.aliveCount(playerIndex) === 0) break;
  }

  const metrics = simulation.metrics();
  const player = playerPopulation(metrics);
  const survivalRate = player.alive / initial;
  const result = {
    level: spec.id,
    seed: numericSeed,
    initialCumulativeCoefficients: { ...initialCumulative },
    cumulativeCoefficients: { ...cumulative },
    startPositionChecksum,
    startVelocityChecksum,
    durationSec: duration,
    simulatedSec: round(simulation.elapsed),
    steps,
    initial,
    survivors: player.alive,
    survivalRate,
    passed: survivalRate * 100 >= spec.winSurvivalPct,
    averageEnergy: player.averageEnergy,
    deaths: {
      eaten: player.deaths.captured,
      starved: player.deaths.starved,
    },
    captures: metrics.predatorPairs
      .filter((pair) => pair.actor === PLAYER_SCHOOL_ID)
      .reduce((sum, pair) => sum + pair.captures, 0),
    relationRow: [...metrics.relationMatrix[playerIndex]],
  };
  simulation.dispose();
  return result;
}

export function aggregateBalanceTrials(trials) {
  if (!Array.isArray(trials) || trials.length === 0) {
    throw new RangeError('at least one trial is required');
  }
  const survivalRates = trials.map((trial) => trial.survivalRate);
  return {
    level: trials[0].level,
    cumulativeCoefficients: {
      ...trials[0].cumulativeCoefficients,
    },
    seeds: trials.map((trial) => trial.seed),
    trialCount: trials.length,
    meanSurvivalRate: mean(survivalRates),
    medianSurvivalRate: percentile(survivalRates, 0.5),
    minSurvivalRate: Math.min(...survivalRates),
    maxSurvivalRate: Math.max(...survivalRates),
    survivalStdDev: standardDeviation(survivalRates),
    passRate:
      trials.filter((trial) => trial.passed).length / trials.length,
    meanEnergy: mean(trials.map((trial) => trial.averageEnergy)),
    meanDeaths: {
      eaten: mean(trials.map((trial) => trial.deaths.eaten)),
      starved: mean(trials.map((trial) => trial.deaths.starved)),
    },
    meanCaptures: mean(trials.map((trial) => trial.captures)),
    trials,
  };
}

function compareEvaluations(left, right) {
  return (
    right.passRate - left.passRate ||
    right.meanSurvivalRate - left.meanSurvivalRate ||
    right.minSurvivalRate - left.minSurvivalRate ||
    right.meanEnergy - left.meanEnergy ||
    left.survivalStdDev - right.survivalStdDev
  );
}

function comparePathCandidates(left, right) {
  return (
    compareEvaluations(left.evaluation, right.evaluation) ||
    right.pathScore - left.pathScore ||
    left.pathKey.localeCompare(right.pathKey)
  );
}

export function expectedRoundGuidance(level, barycentric) {
  const spec = resolveLevel(level);
  const point = normalizeBarycentricPoint(barycentric);
  if (spec.id === 'L1') {
    return {
      expected: '体型权重低于中心，速度或耐力权重高于中心',
      matches:
        point.size < 1 / 3 &&
        (point.speed > 1 / 3 || point.stamina > 1 / 3),
    };
  }
  if (spec.id === 'L2') {
    return {
      expected: '体型是本代最高权重且高于中心',
      matches:
        point.size > 1 / 3 &&
        point.size > point.speed &&
        point.size > point.stamina,
    };
  }
  return {
    expected: '耐力是本代最高权重且高于中心',
    matches:
      point.stamina > 1 / 3 &&
      point.stamina > point.speed &&
      point.stamina > point.size,
  };
}

export function evaluateCumulativeCoefficients({
  level,
  cumulativeCoefficients,
  initialCumulativeCoefficients = cumulativeCoefficients,
  seeds = DEFAULT_BALANCE_SEEDS,
  dt = 1 / 30,
  durationSec,
}) {
  return aggregateBalanceTrials(
    seeds.map((seed) =>
      runGameBalanceTrial({
        level,
        cumulativeCoefficients,
        initialCumulativeCoefficients,
        seed,
        dt,
        durationSec,
      })
    )
  );
}

function pathKey(path) {
  return path
    .map(({ barycentric }) =>
      AXES.map((axis) => barycentric[axis].toFixed(6)).join('/')
    )
    .join('|');
}

function cumulativeKey(coefficients) {
  return AXES.map((axis) => coefficients[axis].toFixed(8)).join('/');
}

function selectDiverseBeam(candidates, width) {
  const selected = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = cumulativeKey(candidate.cumulativeCoefficients);
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(candidate);
    if (selected.length >= width) break;
  }
  return selected;
}

/**
 * Beam-searches complete three-generation paths. Each trial stages the
 * inherited TUNING phenotype before applying the submitted cumulative
 * coefficients; transformed configs are never reused as the next
 * generation's ideal baseline.
 */
export function searchMultiplicativePaths({
  levels = LEVEL_SPECS,
  roundPoints = generateBarycentricGrid(4),
  roundPointsByLevel,
  seeds = DEFAULT_BALANCE_SEEDS.slice(0, 1),
  dt = 0.1,
  beamWidth = 5,
  requireGuidance = false,
  requirePass = false,
  onProgress,
} = {}) {
  const evaluationCache = new Map();
  const evaluateCached = (
    level,
    initialCumulativeCoefficients,
    cumulativeCoefficients
  ) => {
    const key = `${resolveLevel(level).id}|${cumulativeKey(
      initialCumulativeCoefficients
    )}->${cumulativeKey(
      cumulativeCoefficients
    )}`;
    let evaluation = evaluationCache.get(key);
    if (!evaluation) {
      evaluation = evaluateCumulativeCoefficients({
        level,
        initialCumulativeCoefficients,
        cumulativeCoefficients,
        seeds,
        dt,
      });
      evaluationCache.set(key, evaluation);
    }
    return evaluation;
  };
  let beam = [
    {
      path: [],
      inheritedCoefficients: { ...IDENTITY_COEFFICIENTS },
      cumulativeCoefficients: { ...IDENTITY_COEFFICIENTS },
      pathScore: 0,
      pathKey: '',
    },
  ];
  const levelResults = [];

  for (const level of levels) {
    const spec = resolveLevel(level);
    const candidates = [];
    const availablePoints = uniqueBarycentricPoints(
      roundPointsByLevel?.[spec.id] ?? roundPoints
    ).filter(
      (point) =>
        !requireGuidance ||
        expectedRoundGuidance(spec, point).matches
    );
    const total = beam.length * availablePoints.length;
    let completed = 0;
    for (const parent of beam) {
      for (const rawPoint of availablePoints) {
        const barycentric = normalizeBarycentricPoint(rawPoint);
        const roundMultipliers =
          deriveRoundMultipliers(barycentric);
        const cumulativeCoefficients = multiplyCoefficients(
          parent.cumulativeCoefficients,
          roundMultipliers
        );
        const evaluation = evaluateCached(
          spec,
          parent.cumulativeCoefficients,
          cumulativeCoefficients
        );
        const step = {
          level: spec.id,
          barycentric: { ...barycentric },
          roundMultipliers: { ...roundMultipliers },
          cumulativeBefore: {
            ...parent.cumulativeCoefficients,
          },
          cumulativeAfter: { ...cumulativeCoefficients },
        };
        const path = [...parent.path, step];
        candidates.push({
          level: spec.id,
          path,
          barycentric: step.barycentric,
          roundMultipliers: step.roundMultipliers,
          inheritedCoefficients: step.cumulativeBefore,
          cumulativeCoefficients: step.cumulativeAfter,
          evaluation,
          pathScore:
            parent.pathScore + evaluation.meanSurvivalRate,
          pathKey: pathKey(path),
        });
        completed += 1;
        onProgress?.({
          level: spec.id,
          completed,
          total,
        });
      }
    }
    candidates.sort(comparePathCandidates);
    const viableCandidates = requirePass
      ? candidates.filter(
          (candidate) => candidate.evaluation.passRate === 1
        )
      : candidates;
    beam = selectDiverseBeam(
      viableCandidates,
      Math.max(1, Number(beamWidth))
    );
    levelResults.push({
      level: spec.id,
      evaluated: candidates.length,
      candidates,
      beam,
    });
    if (beam.length === 0) break;
  }
  return {
    seeds: [...seeds],
    dt,
    roundPointCount: roundPointsByLevel
      ? Object.fromEntries(
          levelResults.map(({ level }) => [
            level,
            uniqueBarycentricPoints(
              roundPointsByLevel[level] ?? roundPoints
            ).length,
          ])
        )
      : roundPoints.length,
    beamWidth,
    levels: levelResults,
    bestPath: levelResults.at(-1)?.candidates[0]?.path ?? [],
  };
}

function summarizeConfirmedPath(path) {
  const evaluations = path.map((step) => step.evaluation);
  const thresholdMargins = path.map((step) => {
    const threshold = resolveLevel(step.level).winSurvivalPct / 100;
    return step.evaluation.meanSurvivalRate - threshold;
  });
  return {
    passedLevelCount: evaluations.filter(
      (evaluation) => evaluation.passRate === 1
    ).length,
    minPassRate: Math.min(
      ...evaluations.map((evaluation) => evaluation.passRate)
    ),
    meanPassRate: mean(
      evaluations.map((evaluation) => evaluation.passRate)
    ),
    minThresholdMargin: Math.min(...thresholdMargins),
    meanThresholdMargin: mean(thresholdMargins),
    minSurvivalRate: Math.min(
      ...evaluations.map((evaluation) => evaluation.minSurvivalRate)
    ),
    meanSurvivalRate: mean(
      evaluations.map((evaluation) => evaluation.meanSurvivalRate)
    ),
  };
}

function compareConfirmedPaths(left, right) {
  return (
    right.summary.passedLevelCount - left.summary.passedLevelCount ||
    right.summary.minPassRate - left.summary.minPassRate ||
    right.summary.minThresholdMargin -
      left.summary.minThresholdMargin ||
    right.summary.meanPassRate - left.summary.meanPassRate ||
    right.summary.meanThresholdMargin -
      left.summary.meanThresholdMargin ||
    right.summary.minSurvivalRate - left.summary.minSurvivalRate ||
    right.summary.meanSurvivalRate -
      left.summary.meanSurvivalRate ||
    left.pathKey.localeCompare(right.pathKey)
  );
}

function createEvaluationCache(seeds, dt) {
  const cache = new Map();
  return (
    level,
    cumulativeCoefficients,
    initialCumulativeCoefficients = cumulativeCoefficients
  ) => {
    const key = `${resolveLevel(level).id}|${cumulativeKey(
      initialCumulativeCoefficients
    )}->${cumulativeKey(
      cumulativeCoefficients
    )}`;
    let evaluation = cache.get(key);
    if (!evaluation) {
      evaluation = evaluateCumulativeCoefficients({
        level,
        initialCumulativeCoefficients,
        cumulativeCoefficients,
        seeds,
        dt,
      });
      cache.set(key, evaluation);
    }
    return evaluation;
  };
}

export function buildMultiplicativePath(
  roundPath = CALIBRATED_GAME_PATH
) {
  if (!Array.isArray(roundPath) || roundPath.length === 0) {
    throw new RangeError('roundPath must contain at least one generation');
  }
  let cumulative = { ...IDENTITY_COEFFICIENTS };
  return roundPath.map((rawStep) => {
    const spec = resolveLevel(rawStep.level);
    const barycentric = normalizeBarycentricPoint(
      rawStep.barycentric
    );
    const roundMultipliers =
      deriveRoundMultipliers(barycentric);
    const cumulativeBefore = { ...cumulative };
    cumulative = multiplyCoefficients(
      cumulativeBefore,
      roundMultipliers
    );
    return {
      level: spec.id,
      barycentric: { ...barycentric },
      roundMultipliers: { ...roundMultipliers },
      cumulativeBefore,
      cumulativeAfter: { ...cumulative },
    };
  });
}

function candidateFromRoundPath(roundPath) {
  const path = buildMultiplicativePath(roundPath);
  const last = path.at(-1);
  return {
    level: last.level,
    path,
    barycentric: last.barycentric,
    roundMultipliers: last.roundMultipliers,
    inheritedCoefficients: last.cumulativeBefore,
    cumulativeCoefficients: last.cumulativeAfter,
    pathKey: pathKey(path),
  };
}

function confirmPath(candidate, evaluateConfirmed) {
  const path = candidate.path.map((step) => {
    const evaluation = evaluateConfirmed(
      step.level,
      step.cumulativeAfter,
      step.cumulativeBefore
    );
    return {
      ...step,
      evaluation,
      guidance: expectedRoundGuidance(
        step.level,
        step.barycentric
      ),
    };
  });
  return {
    path,
    pathKey: pathKey(path),
    summary: summarizeConfirmedPath(path),
  };
}

export function assessBalanceChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new RangeError('balance checks must contain at least one level');
  }
  const reasons = [];
  for (const check of checks) {
    if (!check.guidance?.matches) {
      reasons.push(`${check.level}: guidance mismatch`);
    }
    if (check.correct?.passRate !== 1) {
      reasons.push(`${check.level}: calibrated choice is not robust`);
    }
    if (check.neutral?.passRate !== 0) {
      reasons.push(`${check.level}: neutral choice can pass`);
    }
    if (check.wrong?.passRate !== 0) {
      reasons.push(`${check.level}: named wrong choice can pass`);
    }
  }
  return {
    accepted: reasons.length === 0,
    reasons,
  };
}

function verifyConfirmedPath(confirmedPath, evaluateConfirmed) {
  const checks = confirmedPath.path.map((step) => {
    const neutralCumulative = multiplyCoefficients(
      step.cumulativeBefore,
      deriveRoundMultipliers(NEUTRAL_BARYCENTRIC_POINT)
    );
    const wrongControl = WRONG_ROUND_POINTS[step.level];
    const wrongCumulative = multiplyCoefficients(
      step.cumulativeBefore,
      deriveRoundMultipliers(wrongControl.barycentric)
    );
    return {
      level: step.level,
      guidance: step.guidance,
      correct: step.evaluation,
      neutral: evaluateConfirmed(
        step.level,
        neutralCumulative,
        step.cumulativeBefore
      ),
      wrong: evaluateConfirmed(
        step.level,
        wrongCumulative,
        step.cumulativeBefore
      ),
      wrongLabel: wrongControl.label,
      neutralCumulative,
      wrongCumulative,
    };
  });
  return {
    ...assessBalanceChecks(checks),
    checks,
  };
}

function pathStepAsCandidate(confirmedPath, levelIndex) {
  const step = confirmedPath.path[levelIndex];
  return {
    level: step.level,
    path: confirmedPath.path.slice(0, levelIndex + 1),
    barycentric: step.barycentric,
    roundMultipliers: step.roundMultipliers,
    inheritedCoefficients: step.cumulativeBefore,
    cumulativeCoefficients: step.cumulativeAfter,
    evaluation: step.evaluation,
    pathScore: confirmedPath.path
      .slice(0, levelIndex + 1)
      .reduce(
        (sum, item) => sum + item.evaluation.meanSurvivalRate,
        0
      ),
    pathKey: pathKey(
      confirmedPath.path.slice(0, levelIndex + 1)
    ),
  };
}

export function confirmSearchFinalists(
  coarse,
  {
    seeds = DEFAULT_BALANCE_SEEDS,
    dt = 1 / 30,
    finalistCount = 5,
    referencePaths = [],
  } = {}
) {
  const coarseCandidates =
    coarse.levels.at(-1)?.candidates.slice(0, finalistCount) ??
    [];
  if (coarseCandidates.length === 0) {
    throw new RangeError(
      'coarse search must contain at least one complete path'
    );
  }
  const searchedLevels = coarse.levels.map((level) => level.level);
  const finalCandidateMap = new Map(
    coarseCandidates.map((candidate) => [
      candidate.pathKey,
      candidate,
    ])
  );
  for (const referencePath of referencePaths) {
    const prefix = referencePath.slice(0, searchedLevels.length);
    if (
      prefix.length !== searchedLevels.length ||
      prefix.some(
        (step, index) =>
          resolveLevel(step.level).id !== searchedLevels[index]
      )
    ) {
      continue;
    }
    const candidate = candidateFromRoundPath(prefix);
    finalCandidateMap.set(candidate.pathKey, candidate);
  }

  const evaluateConfirmed = createEvaluationCache(seeds, dt);
  const confirmedPaths = [...finalCandidateMap.values()]
    .map((candidate) =>
      confirmPath(candidate, evaluateConfirmed)
    )
    .sort(compareConfirmedPaths);
  const verifications = new Map();
  let selectedPath = null;
  let selectedVerification = null;
  for (const candidate of confirmedPaths) {
    const eligible =
      candidate.path.every(
        (step) =>
          step.guidance.matches &&
          step.evaluation.passRate === 1
      );
    if (!eligible) continue;
    const verification = verifyConfirmedPath(
      candidate,
      evaluateConfirmed
    );
    verifications.set(candidate.pathKey, verification);
    if (verification.accepted) {
      selectedPath = candidate;
      selectedVerification = verification;
      break;
    }
  }
  selectedPath ??= confirmedPaths[0];
  selectedVerification ??=
    verifications.get(selectedPath.pathKey) ??
    verifyConfirmedPath(selectedPath, evaluateConfirmed);

  const runnerUpPath =
    confirmedPaths.find(
      (candidate) => candidate.pathKey !== selectedPath.pathKey
    ) ?? null;
  const confirmedLevels = selectedPath.path.map((step, levelIndex) => {
    const best = pathStepAsCandidate(selectedPath, levelIndex);
    const runnerUp = runnerUpPath
      ? pathStepAsCandidate(runnerUpPath, levelIndex)
      : null;
    const check = selectedVerification.checks[levelIndex];
    const neutral = {
      level: best.level,
      barycentric: { ...NEUTRAL_BARYCENTRIC_POINT },
      roundMultipliers: { ...IDENTITY_COEFFICIENTS },
      inheritedCoefficients: {
        ...best.inheritedCoefficients,
      },
      cumulativeCoefficients: { ...check.neutralCumulative },
      evaluation: check.neutral,
    };
    const wrongControl = WRONG_ROUND_POINTS[best.level];
    const wrong = {
      level: best.level,
      label: wrongControl.label,
      barycentric: { ...wrongControl.barycentric },
      roundMultipliers: {
        ...deriveRoundMultipliers(wrongControl.barycentric),
      },
      inheritedCoefficients: {
        ...best.inheritedCoefficients,
      },
      cumulativeCoefficients: { ...check.wrongCumulative },
      evaluation: check.wrong,
    };
    return {
      level: step.level,
      best,
      runnerUp,
      neutral,
      wrong,
      guidance: step.guidance,
      accepted:
        check.guidance.matches &&
        check.correct.passRate === 1 &&
        check.neutral.passRate === 0 &&
        check.wrong.passRate === 0,
    };
  });
  return {
    seeds: [...seeds],
    dt,
    accepted: selectedVerification.accepted,
    rejectionReasons: selectedVerification.reasons,
    levels: confirmedLevels,
    bestPath: selectedPath.path,
    pathSummary: selectedPath.summary,
    finalists: confirmedPaths,
    verification: selectedVerification,
  };
}

export function searchGameBalance({
  divisions = 4,
  coarseSeeds = DEFAULT_BALANCE_SEEDS.slice(0, 1),
  finalSeeds = DEFAULT_BALANCE_SEEDS,
  coarseDt = 0.1,
  finalDt = 1 / 30,
  beamWidth = 5,
  finalistCount = 5,
  requireGuidance = true,
  onProgress,
} = {}) {
  const roundPointsByLevel = Object.fromEntries(
    LEVEL_SPECS.map((level) => [
      level.id,
      generateLevelSearchPoints(level, divisions),
    ])
  );
  const coarse = searchMultiplicativePaths({
    roundPointsByLevel,
    seeds: coarseSeeds,
    dt: coarseDt,
    beamWidth,
    requireGuidance,
    requirePass: true,
    onProgress,
  });
  const confirmed = confirmSearchFinalists(coarse, {
    seeds: finalSeeds,
    dt: finalDt,
    finalistCount,
    referencePaths: [CALIBRATED_GAME_PATH],
  });
  return {
    searchMode: requireGuidance ? 'guided' : 'unconstrained',
    coarse,
    confirmed,
  };
}

export function verifyCalibratedGamePath({
  seeds = DEFAULT_BALANCE_SEEDS,
  dt = 1 / 30,
} = {}) {
  const evaluateConfirmed = createEvaluationCache(seeds, dt);
  const confirmed = confirmPath(
    candidateFromRoundPath(CALIBRATED_GAME_PATH),
    evaluateConfirmed
  );
  const verification = verifyConfirmedPath(
    confirmed,
    evaluateConfirmed
  );
  return {
    seeds: [...seeds],
    dt,
    accepted: verification.accepted,
    rejectionReasons: verification.reasons,
    path: confirmed.path,
    pathSummary: confirmed.summary,
    checks: verification.checks,
  };
}

function parseNumberList(value) {
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter(Number.isFinite);
}

function parseArgs(argv) {
  const options = {
    divisions: 4,
    coarseSeeds: DEFAULT_BALANCE_SEEDS.slice(0, 1),
    finalSeeds: DEFAULT_BALANCE_SEEDS,
    coarseDt: 0.1,
    finalDt: 1 / 30,
    beamWidth: 5,
    finalistCount: 5,
    json: false,
    quiet: false,
    requireGuidance: true,
    verifyReference: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = argv[index + 1];
    if (key === '--json') {
      options.json = true;
    } else if (key === '--quiet') {
      options.quiet = true;
    } else if (key === '--unconstrained') {
      options.requireGuidance = false;
    } else if (key === '--verify-reference') {
      options.verifyReference = true;
    } else if (key === '--divisions') {
      options.divisions = Number(next);
      index += 1;
    } else if (key === '--coarse-seeds') {
      options.coarseSeeds = parseNumberList(next);
      index += 1;
    } else if (key === '--seeds') {
      options.finalSeeds = parseNumberList(next);
      index += 1;
    } else if (key === '--coarse-dt') {
      options.coarseDt = Number(next);
      index += 1;
    } else if (key === '--dt') {
      options.finalDt = Number(next);
      index += 1;
    } else if (key === '--beam') {
      options.beamWidth = Number(next);
      index += 1;
    } else if (key === '--finalists') {
      options.finalistCount = Number(next);
      index += 1;
    } else {
      throw new RangeError(`unknown argument: ${key}`);
    }
  }
  return options;
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function triplet(values) {
  return AXES.map((axis) => values[axis].toFixed(3)).join('/');
}

function describeCandidate(label, candidate) {
  if (!candidate) return `${label}: n/a`;
  const result = candidate.evaluation;
  return [
    `${label}: w ${triplet(candidate.barycentric)}`,
    `round ×${triplet(candidate.roundMultipliers)}`,
    `cumulative ×${triplet(candidate.cumulativeCoefficients)}`,
    `survival mean ${percent(result.meanSurvivalRate)}`,
    `min ${percent(result.minSurvivalRate)}`,
    `pass ${percent(result.passRate)}`,
    `deaths E/S ${result.meanDeaths.eaten.toFixed(1)}/${result.meanDeaths.starved.toFixed(1)}`,
  ].join(' · ');
}

function printSummary(result) {
  console.log(
    `confirmed seeds: ${result.confirmed.seeds.join(', ')} · dt ${result.confirmed.dt}`
  );
  console.log(
    `acceptance: ${result.confirmed.accepted ? 'PASS' : 'FAIL'}`
  );
  for (const level of result.confirmed.levels) {
    console.log(`\n${level.level}`);
    console.log(describeCandidate('guided best', level.best));
    console.log(describeCandidate('runner-up', level.runnerUp));
    console.log(describeCandidate('neutral', level.neutral));
    console.log(
      describeCandidate(`wrong (${level.wrong.label})`, level.wrong)
    );
    console.log(
      `level gate: ${level.accepted ? 'PASS' : 'FAIL'} · ${level.guidance.expected}`
    );
  }
  console.log('\naccepted three-generation path');
  for (const step of result.confirmed.bestPath) {
    console.log(
      `${step.level}: w ${triplet(step.barycentric)} · round ×${triplet(step.roundMultipliers)} · cumulative ×${triplet(step.cumulativeAfter)}`
    );
  }
  if (!result.confirmed.accepted) {
    for (const reason of result.confirmed.rejectionReasons) {
      console.log(`reject: ${reason}`);
    }
  }
}

function printReferenceVerification(result) {
  console.log(
    `calibrated path: ${result.accepted ? 'PASS' : 'FAIL'} · seeds ${result.seeds.join(', ')} · dt ${result.dt}`
  );
  result.path.forEach((step, index) => {
    const check = result.checks[index];
    console.log(
      [
        `\n${step.level}: w ${triplet(step.barycentric)}`,
        `correct pass ${percent(check.correct.passRate)}`,
        `neutral pass ${percent(check.neutral.passRate)}`,
        `${check.wrongLabel} pass ${percent(check.wrong.passRate)}`,
        `guidance ${check.guidance.matches ? 'PASS' : 'FAIL'}`,
      ].join(' · ')
    );
  });
  for (const reason of result.rejectionReasons) {
    console.log(`reject: ${reason}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const onProgress =
    options.quiet || options.json
      ? undefined
      : ({ level, completed, total }) => {
          if (completed === total || completed % 10 === 0) {
            process.stderr.write(
              `\r${level}: ${completed}/${total} paths`
            );
            if (completed === total) process.stderr.write('\n');
          }
        };
  const result = options.verifyReference
    ? verifyCalibratedGamePath({
        seeds: options.finalSeeds,
        dt: options.finalDt,
      })
    : searchGameBalance({ ...options, onProgress });
  const payload = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: round(
      (performance.now() - startedAt) / 1000,
      3
    ),
    engine: 'ExperimentSimulation',
    reproduction: false,
    ...result,
  };
  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else if (options.verifyReference) {
    printReferenceVerification(payload);
    console.log(`\nelapsed: ${payload.elapsedSeconds}s`);
  } else {
    printSummary(payload);
    console.log(`\nelapsed: ${payload.elapsedSeconds}s`);
  }
  const accepted = options.verifyReference
    ? payload.accepted
    : payload.confirmed.accepted;
  if (!accepted) process.exitCode = 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
