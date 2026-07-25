import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATED_GAME_PATH,
  aggregateBalanceTrials,
  assessBalanceChecks,
  buildMultiplicativePath,
  confirmSearchFinalists,
  expectedRoundGuidance,
  generateBarycentricGrid,
  generateLevelSearchPoints,
  runGameBalanceTrial,
  searchMultiplicativePaths,
} from './game_balance_search.mjs';
import {
  IDENTITY_COEFFICIENTS,
  NEUTRAL_BARYCENTRIC_POINT,
} from '../src/game-mode.js';

test('barycentric search grid covers the triangle without 150-point traits', () => {
  const grid = generateBarycentricGrid(4);
  assert.equal(grid.length, 16);
  for (const point of grid) {
    assert.ok(Object.values(point).every((value) => value >= 0 && value <= 1));
    assert.ok(
      Math.abs(point.size + point.stamina + point.speed - 1) < 1e-12
    );
  }
  assert.ok(
    grid.some(
      (point) =>
        Math.abs(point.size - 1 / 3) < 1e-12 &&
        Math.abs(point.stamina - 1 / 3) < 1e-12 &&
        Math.abs(point.speed - 1 / 3) < 1e-12
    )
  );
});

test('each level search includes its asymmetric calibration point', () => {
  for (const calibrated of CALIBRATED_GAME_PATH) {
    const points = generateLevelSearchPoints(calibrated.level, 4);
    assert.ok(
      points.some((point) =>
        ['size', 'stamina', 'speed'].every(
          (axis) =>
            Math.abs(
              point[axis] - calibrated.barycentric[axis]
            ) < 1e-12
        )
      )
    );
  }
  assert.equal(generateLevelSearchPoints('L1', 4).length, 17);
});

test('headless production trial is deterministic and permanent', () => {
  const options = {
    level: 'L1',
    cumulativeCoefficients: IDENTITY_COEFFICIENTS,
    seed: 4242,
    dt: 0.1,
    durationSec: 1,
  };
  const first = runGameBalanceTrial(options);
  const second = runGameBalanceTrial(options);
  assert.deepEqual(second, first);
  assert.equal(
    first.survivors + first.deaths.eaten + first.deaths.starved,
    first.initial
  );
  assert.equal(first.simulatedSec, 1);
});

test('production trial starts from the inherited TUNING layout', () => {
  const submitted = {
    size: 1.5,
    stamina: 0.5,
    speed: 0.5,
  };
  const options = {
    level: 'L2',
    initialCumulativeCoefficients: IDENTITY_COEFFICIENTS,
    cumulativeCoefficients: submitted,
    seed: 8421,
    dt: 0.1,
    durationSec: 0.1,
  };
  const staged = runGameBalanceTrial(options);
  const repeated = runGameBalanceTrial(options);
  const direct = runGameBalanceTrial({
    ...options,
    initialCumulativeCoefficients: submitted,
  });
  const legacyDirect = runGameBalanceTrial({
    ...options,
    initialCumulativeCoefficients: undefined,
  });

  assert.deepEqual(repeated, staged);
  assert.deepEqual(legacyDirect, direct);
  assert.deepEqual(
    staged.initialCumulativeCoefficients,
    IDENTITY_COEFFICIENTS
  );
  assert.notEqual(
    staged.startPositionChecksum,
    direct.startPositionChecksum
  );
});

test('trial aggregation reports survival robustness across seeds', () => {
  const trials = [
    {
      level: 'L3',
      seed: 1,
      cumulativeCoefficients: {
        size: 0.8,
        stamina: 1.4,
        speed: 0.9,
      },
      survivalRate: 0.5,
      passed: true,
      averageEnergy: 0.3,
      deaths: { eaten: 5, starved: 15 },
      captures: 1,
    },
    {
      level: 'L3',
      seed: 2,
      cumulativeCoefficients: {
        size: 0.8,
        stamina: 1.4,
        speed: 0.9,
      },
      survivalRate: 0.75,
      passed: true,
      averageEnergy: 0.5,
      deaths: { eaten: 3, starved: 7 },
      captures: 2,
    },
  ];
  const aggregate = aggregateBalanceTrials(trials);
  assert.equal(aggregate.meanSurvivalRate, 0.625);
  assert.equal(aggregate.minSurvivalRate, 0.5);
  assert.equal(aggregate.passRate, 1);
  assert.equal(aggregate.meanDeaths.starved, 11);
});

test('guidance checks each generation choice rather than cumulative values', () => {
  assert.equal(
    expectedRoundGuidance('L1', {
      size: 0,
      stamina: 0.5,
      speed: 0.5,
    }).matches,
    true
  );
  assert.equal(
    expectedRoundGuidance('L2', {
      size: 0.6,
      stamina: 0.2,
      speed: 0.2,
    }).matches,
    true
  );
  assert.equal(
    expectedRoundGuidance('L3', {
      size: 0.2,
      stamina: 0.6,
      speed: 0.2,
    }).matches,
    true
  );
  assert.equal(
    expectedRoundGuidance('L3', NEUTRAL_BARYCENTRIC_POINT)
      .matches,
    false
  );
});

test('balance acceptance is a hard gate for guidance and both controls', () => {
  const passing = {
    level: 'L1',
    guidance: { matches: true },
    correct: { passRate: 1 },
    neutral: { passRate: 0 },
    wrong: { passRate: 0 },
  };
  assert.deepEqual(assessBalanceChecks([passing]), {
    accepted: true,
    reasons: [],
  });

  for (const broken of [
    { guidance: { matches: false } },
    { correct: { passRate: 0.8 } },
    { neutral: { passRate: 0.2 } },
    { wrong: { passRate: 0.2 } },
  ]) {
    const rejected = assessBalanceChecks([
      { ...passing, ...broken },
    ]);
    assert.equal(rejected.accepted, false);
    assert.ok(rejected.reasons.length > 0);
  }
});

test('calibrated controls derive from the inherited state, not identity', () => {
  const path = buildMultiplicativePath(CALIBRATED_GAME_PATH);
  assert.deepEqual(path[0].cumulativeBefore, IDENTITY_COEFFICIENTS);
  for (let index = 1; index < path.length; index += 1) {
    assert.deepEqual(
      path[index].cumulativeBefore,
      path[index - 1].cumulativeAfter
    );
  }
});

test('path search multiplies each round from ideal cumulative coefficients', () => {
  const result = searchMultiplicativePaths({
    levels: [1, 2],
    roundPoints: [
      { size: 1, stamina: 0, speed: 0 },
      { size: 0, stamina: 0, speed: 1 },
    ],
    seeds: [101],
    dt: 0.1,
    beamWidth: 1,
  });
  assert.equal(result.levels.length, 2);
  assert.equal(result.bestPath.length, 2);
  const [first, second] = result.bestPath;
  for (const axis of ['size', 'stamina', 'speed']) {
    assert.equal(
      second.cumulativeAfter[axis],
      first.cumulativeAfter[axis] *
        second.roundMultipliers[axis]
    );
  }
});

test('guided search filters mismatched choices before simulation', () => {
  const result = searchMultiplicativePaths({
    levels: [1],
    roundPoints: [
      { size: 1, stamina: 0, speed: 0 },
      { size: 0, stamina: 0.5, speed: 0.5 },
    ],
    seeds: [101],
    dt: 0.1,
    beamWidth: 2,
    requireGuidance: true,
  });
  assert.equal(result.levels[0].evaluated, 1);
  assert.deepEqual(result.bestPath[0].barycentric, {
    size: 0,
    stamina: 0.5,
    speed: 0.5,
  });
});

test('confirmation reports one canonical full path at every level', () => {
  const coarse = searchMultiplicativePaths({
    levels: [1, 2],
    roundPoints: [
      { size: 1, stamina: 0, speed: 0 },
      { size: 0, stamina: 0, speed: 1 },
    ],
    seeds: [101],
    dt: 0.1,
    beamWidth: 2,
  });
  const confirmed = confirmSearchFinalists(coarse, {
    seeds: [101],
    dt: 0.1,
    finalistCount: 2,
  });

  assert.equal(confirmed.bestPath.length, 2);
  assert.equal(confirmed.levels.length, 2);
  for (let index = 0; index < confirmed.levels.length; index += 1) {
    const reported = confirmed.levels[index].best;
    const canonical = confirmed.bestPath[index];
    assert.deepEqual(reported.barycentric, canonical.barycentric);
    assert.deepEqual(
      reported.cumulativeCoefficients,
      canonical.cumulativeAfter
    );
    assert.deepEqual(reported.evaluation, canonical.evaluation);
  }
});
