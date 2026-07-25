import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GAME_PHASE,
  GAME_RUNTIME_SEED_RANGE,
  GameAttemptSeed,
  GameSession,
  IDENTITY_COEFFICIENTS,
  LEVEL_SPECS,
  NEUTRAL_BARYCENTRIC_POINT,
  PLAYER_SCHOOL_ID,
  ROUND_MULTIPLIER_RANGE,
  TRIANGLE_VERTICES,
  applyPlayerCoefficients,
  barycentricToCartesian,
  cartesianToBarycentric,
  createGameLevelConfig,
  derivePlayerPhenotype,
  deriveRoundMultipliers,
  multiplyCoefficients,
  normalizeBarycentricPoint,
  previewCumulativeCoefficients,
  randomGameRuntimeSeed,
} from './game-mode.js';
import {
  createDefaultConfig,
  validateConfig,
} from './experiment-config.js';
import { relationBetween } from './experiment-model.js';

const SIZE_VERTEX = Object.freeze({
  size: 1,
  stamina: 0,
  speed: 0,
});
const STAMINA_VERTEX = Object.freeze({
  size: 0,
  stamina: 1,
  speed: 0,
});
const SPEED_VERTEX = Object.freeze({
  size: 0,
  stamina: 0,
  speed: 1,
});

function reportAt(survivors, initial = 40) {
  return {
    survivors,
    initial,
    deaths: {
      eaten: initial - survivors,
      starved: 0,
    },
  };
}

function passCurrentLevel(session) {
  const survivors = Math.ceil(
    session.currentLevel.winSurvivalPct * 0.4
  );
  session.startLevel();
  session.finishLevel(reportAt(survivors));
  return session.sealGeneration();
}

test('game level H0 values keep the accepted no-reproduction contract', () => {
  assert.equal(PLAYER_SCHOOL_ID, 'medium');
  assert.deepEqual(
    LEVEL_SPECS.map((level) => [
      level.id,
      level.durationSec,
      level.winSurvivalPct,
      level.playerFish.count,
    ]),
    [
      ['L1', 90, 35, 40],
      ['L2', 75, 75, 40],
      ['L3', 105, 50, 40],
    ]
  );
  assert.equal(LEVEL_SPECS.L2.preyFish.name, '平行鱼');
  assert.equal(LEVEL_SPECS.L2.preyFish.sizeClass, 1.2);
  assert.equal(LEVEL_SPECS.L2.preyFish.count, 110);
  assert.equal(LEVEL_SPECS.L3.plankton.capacity, 46);
  for (const level of LEVEL_SPECS) {
    assert.equal(level.plankton.enabled, true);
    assert.equal(level.rules.reproduction, false);
    assert.equal(level.rules.respawn, false);
    assert.equal(Object.isFrozen(level), true);
  }
});

test('triangle mapping is exactly neutral at center and explicit at boundaries', () => {
  assert.deepEqual(
    deriveRoundMultipliers(NEUTRAL_BARYCENTRIC_POINT),
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(deriveRoundMultipliers(SIZE_VERTEX), {
    size: 1.5,
    stamina: 0.5,
    speed: 0.5,
  });
  assert.deepEqual(deriveRoundMultipliers(STAMINA_VERTEX), {
    size: 0.5,
    stamina: 1.5,
    speed: 0.5,
  });
  assert.deepEqual(deriveRoundMultipliers(SPEED_VERTEX), {
    size: 0.5,
    stamina: 0.5,
    speed: 1.5,
  });
  assert.deepEqual(
    deriveRoundMultipliers({ size: 0.5, stamina: 0.5, speed: 0 }),
    { size: 1.125, stamina: 1.125, speed: 0.5 }
  );
  assert.deepEqual(ROUND_MULTIPLIER_RANGE, {
    minimum: 0.5,
    neutral: 1,
    maximum: 1.5,
  });
});

test('one Game attempt reuses its seed and every new attempt renews it', () => {
  const samples = [0, 0, 0.5, 0.999999];
  const attemptSeed = new GameAttemptSeed({
    random: () => samples.shift(),
  });

  const tuningSeed = attemptSeed.ensure();
  assert.equal(tuningSeed, GAME_RUNTIME_SEED_RANGE.minimum);
  assert.equal(attemptSeed.ensure(), tuningSeed);

  // A repeated random sample must still produce a different attempt.
  assert.equal(attemptSeed.renew(), tuningSeed + 1);
  assert.equal(attemptSeed.renew(), 500000);
  assert.equal(
    attemptSeed.renew(),
    GAME_RUNTIME_SEED_RANGE.maximum
  );
  assert.throws(
    () => randomGameRuntimeSeed(() => 1),
    /\[0, 1\)/
  );
});

test('cartesian and barycentric coordinates round-trip and project drags to the triangle', () => {
  for (const point of [
    NEUTRAL_BARYCENTRIC_POINT,
    SIZE_VERTEX,
    STAMINA_VERTEX,
    SPEED_VERTEX,
    { size: 0.2, stamina: 0.3, speed: 0.5 },
  ]) {
    const cartesian = barycentricToCartesian(point);
    const roundTrip = cartesianToBarycentric(cartesian, {
      project: false,
    });
    for (const key of ['size', 'stamina', 'speed']) {
      assert.ok(Math.abs(roundTrip[key] - point[key]) < 1e-12);
    }
  }
  assert.deepEqual(
    barycentricToCartesian(SPEED_VERTEX),
    TRIANGLE_VERTICES.speed
  );

  const projected = cartesianToBarycentric({ x: 0.5, y: -1 });
  assert.deepEqual(projected, SPEED_VERTEX);
  assert.throws(
    () =>
      normalizeBarycentricPoint({
        size: 0.7,
        stamina: 0.7,
        speed: -0.4,
      }),
    /non-negative and total 1/
  );
});

test('coefficient inheritance compounds and never silently cancels', () => {
  const first = multiplyCoefficients(IDENTITY_COEFFICIENTS, {
    size: 1.5,
    stamina: 1,
    speed: 1,
  });
  const second = multiplyCoefficients(first, {
    size: 0.5,
    stamina: 1,
    speed: 1,
  });
  assert.equal(second.size, 0.75);
  assert.deepEqual(
    previewCumulativeCoefficients(
      { size: 1.5, stamina: 0.75, speed: 0.5 },
      NEUTRAL_BARYCENTRIC_POINT
    ),
    { size: 1.5, stamina: 0.75, speed: 0.5 }
  );
});

test('phenotype derives from ideal base and applies declared size coupling', () => {
  const base = createDefaultConfig().schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  const neutral = derivePlayerPhenotype(base);
  assert.equal(neutral.size, base.size);
  assert.equal(neutral.cruiseSpeed, base.cruiseSpeed);
  assert.equal(neutral.maxSpeed, base.maxSpeed);
  assert.equal(neutral.turnSpeed, base.turnSpeed);
  assert.equal(neutral.metabolismMultiplier, base.metabolismMultiplier);

  const large = derivePlayerPhenotype(base, {
    size: 1.5,
    stamina: 0.5,
    speed: 0.5,
  });
  assert.equal(large.size, base.size * 1.5);
  assert.ok(large.cruiseSpeed < base.cruiseSpeed);
  assert.ok(large.turnSpeed < base.turnSpeed);
  assert.ok(large.metabolismMultiplier > base.metabolismMultiplier);
});

test('applying coefficients is immutable, repeatable, and changes only medium', () => {
  const base = createDefaultConfig();
  const snapshot = structuredClone(base);
  const coefficients = { size: 1.2, stamina: 1.4, speed: 0.7 };
  const applied = applyPlayerCoefficients(base, coefficients);
  const repeated = applyPlayerCoefficients(applied, coefficients);

  assert.deepEqual(base, snapshot);
  for (const school of base.schools) {
    const changed = applied.schools.find((item) => item.id === school.id);
    if (school.id === PLAYER_SCHOOL_ID) {
      assert.notEqual(changed.size, school.size);
      assert.notEqual(changed.cruiseSpeed, school.cruiseSpeed);
    } else {
      assert.deepEqual(changed, school);
    }
  }
  const firstPlayer = applied.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  const repeatedPlayer = repeated.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  assert.deepEqual(repeatedPlayer, firstPlayer);
});

test('level config is rebuilt from ideal values and exposes the L2 size window', () => {
  const base = createDefaultConfig();
  const snapshot = structuredClone(base);
  const neutral = createGameLevelConfig(
    base,
    'L2',
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(base, snapshot);
  assert.equal(validateConfig(neutral).valid, true);
  assert.equal(neutral.runtime.project, 'game');
  assert.equal(neutral.tank.preset, 'game');
  assert.equal(neutral.plankton.enabled, true);

  const neutralSmall = neutral.schools.find((school) => school.id === 'small');
  const neutralPlayer = neutral.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  assert.equal(
    relationBetween(neutralPlayer, neutralSmall, neutral.relations),
    'peer'
  );

  const edible = createGameLevelConfig(base, 'L2', {
    size: 1.2,
    stamina: 0.8,
    speed: 0.8,
  });
  const edibleSmall = edible.schools.find((school) => school.id === 'small');
  const ediblePlayer = edible.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  assert.equal(
    relationBetween(ediblePlayer, edibleSmall, edible.relations),
    'pursuit'
  );
  assert.equal(
    relationBetween(edibleSmall, ediblePlayer, edible.relations),
    'evade'
  );
});

test('level-only balance controls are explicit and do not leak between levels', () => {
  const l1 = createGameLevelConfig('L1');
  const l2 = createGameLevelConfig('L2');
  const l3 = createGameLevelConfig('L3');
  const l1Large = l1.schools.find((school) => school.id === 'large');
  const l1Small = l1.schools.find((school) => school.id === 'small');
  const l2Player = l2.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  const l2Small = l2.schools.find((school) => school.id === 'small');

  for (const level of [l1, l2, l3]) {
    assert.equal(level.plankton.color, '#14532d');
  }
  assert.equal(l1.relations.k, 1.25);
  assert.equal(l1.relations.KMax, 2.9);
  assert.equal(l1.capture.captureLengthFactor, 1.5);
  assert.equal(l1Small.count, 72);
  assert.equal(l1Small.captureRateMultiplier, 5);
  assert.equal(l1Large.captureRateMultiplier, 0.3);
  assert.equal(l1Large.cruiseSpeed, 0.23 * 1.2);
  assert.equal(l1Large.maxSpeed, 0.46 * 1.2);
  assert.equal(l1Large.turnSpeed, 2.8);

  assert.equal(l2Player.grazeRate, 0.02);
  assert.equal(l2Player.captureRateMultiplier, 2);
  assert.equal(l2Small.captureRateMultiplier, 5);
  assert.equal(l2.ecology.energyShareFraction, 0.4);
  assert.equal(l2.ecology.captureEnergyPerSize, 9);
  assert.equal(l2.ecology.burstMetabolicRate, 0.005);
  assert.equal(l2.relations.targetLockTime, 5);
  assert.equal(l2.locomotion.burstFactor, 2.5);
  assert.equal(l2.capture.captureLengthFactor, 2);

  assert.equal(l3.plankton.capacity, 46);
  assert.equal(l3.relations.k, 1.35);
  assert.equal(l3.capture.captureLengthFactor, 0.5);
  assert.equal(
    l3.schools.find((school) => school.id === PLAYER_SCHOOL_ID)
      .grazeRate,
    0.25
  );

  const l3FromL2 = createGameLevelConfig(
    l2,
    'L3',
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(l3FromL2, l3);

  const repeatedL1 = createGameLevelConfig(
    l1,
    'L1',
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(repeatedL1, l1);

  const roundTrippedL3 = createGameLevelConfig(
    structuredClone(l2),
    'L3',
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(roundTrippedL3, l3);
});

test('all 27 three-vertex lineages remain valid without clamping', () => {
  const vertices = [SIZE_VERTEX, STAMINA_VERTEX, SPEED_VERTEX];
  let paths = 0;
  for (const first of vertices) {
    for (const second of vertices) {
      for (const third of vertices) {
        let cumulative = { ...IDENTITY_COEFFICIENTS };
        for (const [index, point] of [first, second, third].entries()) {
          cumulative = multiplyCoefficients(
            cumulative,
            deriveRoundMultipliers(point)
          );
          const config = createGameLevelConfig(
            LEVEL_SPECS[index].id,
            cumulative
          );
          const validation = validateConfig(config);
          assert.equal(
            validation.valid,
            true,
            `${LEVEL_SPECS[index].id}: ${validation.errors.join('; ')}`
          );
        }
        paths += 1;
      }
    }
  }
  assert.equal(paths, 27);

  const allSize = { size: 3.375, stamina: 0.125, speed: 0.125 };
  const allStamina = {
    size: 0.125,
    stamina: 3.375,
    speed: 0.125,
  };
  const largest = createGameLevelConfig('L3', allSize).schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  const smallest = createGameLevelConfig('L3', allStamina).schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  assert.equal(largest.size, 5.0625);
  assert.equal(smallest.size, 0.1875);
  assert.ok(largest.metabolismMultiplier > 23);
  assert.ok(smallest.metabolismMultiplier < 0.02);
});

test('GameSession locks triangle input and rejects illegal transitions', () => {
  const session = new GameSession();
  assert.equal(session.phase, GAME_PHASE.TUNING);
  assert.deepEqual(session.barycentric, NEUTRAL_BARYCENTRIC_POINT);
  assert.deepEqual(
    session.inheritedCoefficients,
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(session.previewCumulative, IDENTITY_COEFFICIENTS);
  assert.throws(() => session.finishLevel(reportAt(40)), /illegal/);

  session.setBarycentric(SPEED_VERTEX);
  const submitted = session.startLevel();
  assert.deepEqual(submitted.roundMultipliers, {
    size: 0.5,
    stamina: 0.5,
    speed: 1.5,
  });
  assert.equal(session.phase, GAME_PHASE.RUNNING);
  assert.throws(() => session.setBarycentric(SIZE_VERTEX), /illegal/);
  assert.throws(() => session.setTrianglePoint({ x: 0, y: 0 }), /illegal/);
  assert.throws(
    () =>
      session.finishLevel({
        initial: 40,
        survivors: 20,
        deaths: { eaten: 5, starved: 5 },
      }),
    /must satisfy/
  );
});

test('failure preserves the round point but not cumulative inheritance', () => {
  const session = new GameSession();
  session.setBarycentric(STAMINA_VERTEX);
  session.startLevel();
  const failed = session.finishLevel(reportAt(7));
  assert.equal(failed.won, false);
  assert.throws(() => session.sealGeneration(), /failed level/);
  assert.deepEqual(
    session.inheritedCoefficients,
    IDENTITY_COEFFICIENTS
  );
  assert.equal(session.lineage.length, 0);

  const retained = session.retryLevel();
  assert.deepEqual(retained, STAMINA_VERTEX);
  assert.deepEqual(
    session.inheritedCoefficients,
    IDENTITY_COEFFICIENTS
  );
  assert.deepEqual(session.previewCumulative, {
    size: 0.5,
    stamina: 1.5,
    speed: 0.5,
  });
});

test('successful generations multiply lineage and reset the next point to center', () => {
  const session = new GameSession();
  session.setBarycentric(SIZE_VERTEX);
  const first = passCurrentLevel(session);
  assert.deepEqual(first.cumulativeBefore, IDENTITY_COEFFICIENTS);
  assert.deepEqual(first.cumulativeAfter, {
    size: 1.5,
    stamina: 0.5,
    speed: 0.5,
  });
  assert.deepEqual(
    session.inheritedCoefficients,
    first.cumulativeAfter
  );

  session.advanceLevel();
  assert.equal(session.currentLevel.id, 'L2');
  assert.deepEqual(session.barycentric, NEUTRAL_BARYCENTRIC_POINT);
  assert.deepEqual(session.previewCumulative, first.cumulativeAfter);

  session.setBarycentric(SPEED_VERTEX);
  const second = passCurrentLevel(session);
  assert.equal(second.cumulativeAfter.size, 0.75);
  assert.equal(second.cumulativeAfter.speed, 0.75);
  assert.equal(second.cumulativeAfter.stamina, 0.25);
  session.advanceLevel();

  const third = passCurrentLevel(session);
  assert.equal(third.gen, 3);
  session.advanceLevel();
  assert.equal(session.phase, GAME_PHASE.COMPLETE);
  assert.equal(session.lineage.length, 3);

  const exposedLineage = session.lineage;
  exposedLineage.pop();
  assert.equal(session.lineage.length, 3);

  const restarted = session.restart();
  assert.equal(restarted.phase, GAME_PHASE.TUNING);
  assert.equal(restarted.level.id, 'L1');
  assert.deepEqual(
    restarted.barycentric,
    NEUTRAL_BARYCENTRIC_POINT
  );
  assert.deepEqual(
    restarted.inheritedCoefficients,
    IDENTITY_COEFFICIENTS
  );
  assert.equal(restarted.lineage.length, 0);
});
