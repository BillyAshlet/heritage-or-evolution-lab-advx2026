import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHOOL_EMBEDDED_GLOBAL_PATHS,
  SCHOOL_SECTIONS,
  buildRadiusMonitorModel,
  zoomRangeWindow,
} from './experiment-debug.js';

test('numeric range can zoom in and return to its registered safety range', () => {
  const limits = { min: 0, max: 100, step: 1 };
  const narrowed = zoomRangeWindow(
    { min: 0, max: 100, step: 1 },
    50,
    0.5,
    limits
  );
  assert.deepEqual(narrowed, { min: 25, max: 75, step: 1 });
  assert.deepEqual(zoomRangeWindow(narrowed, 50, 2, limits), {
    min: 0,
    max: 100,
    step: 1,
  });
});

test('range zoom remains inside safety bounds near an edge', () => {
  assert.deepEqual(
    zoomRangeWindow(
      { min: 0, max: 100, step: 0.1 },
      5,
      0.5,
      { min: 0, max: 100, step: 0.1 }
    ),
    { min: 0, max: 50, step: 0.1 }
  );
});

test('boid editor keeps each radius control beside its school weight', () => {
  const sections = Object.fromEntries(
    SCHOOL_SECTIONS.map((section) => [section.title, section])
  );
  assert.deepEqual(sections['分离 · Separation'].fields, [
    'separationWeight',
  ]);
  assert.deepEqual(sections['分离 · Separation'].globalPaths, [
    'perception.separationRadiusFactor',
  ]);
  assert.equal(
    sections['分离 · Separation'].derivedRadius,
    'separationRadius'
  );
  assert.deepEqual(sections['对齐 · Alignment'].fields, [
    'alignmentWeight',
  ]);
  assert.deepEqual(sections['对齐 · Alignment'].globalPaths, [
    'perception.alignmentRadiusFactor',
  ]);
  assert.equal(
    sections['对齐 · Alignment'].derivedRadius,
    'alignmentRadius'
  );
  assert.deepEqual(sections['凝聚 · Cohesion'].fields, [
    'targetNeighbors',
    'cohesionWeight',
  ]);
  assert.equal(sections['凝聚 · Cohesion'].globalPaths, undefined);
  assert.equal(
    sections['凝聚 · Cohesion'].derivedRadius,
    'cohesionRadius'
  );
  assert.deepEqual(
    [...SCHOOL_EMBEDDED_GLOBAL_PATHS].sort(),
    [
      'perception.alignmentRadiusFactor',
      'perception.separationRadiusFactor',
    ].sort()
  );
});

test('radius monitors expose boid and live directed combat radii', () => {
  const metrics = {
    population: [
      {
        id: 'small',
        name: '小群',
        color: '#48a',
        separationRadius: 0.25,
        alignmentRadius: 0.22,
        cohesionRadius: 0.63,
        detectionLength: 0.28,
        panicRadius: 0.28,
        burstRadius: 0.21,
      },
      {
        id: 'large',
        name: '大群',
        color: '#a44',
        separationRadius: 0.34,
        alignmentRadius: 0.3,
        cohesionRadius: 0.85,
        detectionLength: 0.38,
        panicRadius: 0.38,
        burstRadius: 0.29,
      },
    ],
    relationMatrix: [
      ['peer', 'evade'],
      ['pursuit', 'peer'],
    ],
  };
  const [small, large] = buildRadiusMonitorModel(metrics);
  assert.deepEqual(small.boid, {
    separation: 0.25,
    alignment: 0.22,
    cohesion: 0.63,
  });
  assert.equal(small.combat.hunt, null);
  assert.equal(small.combat.panic, 0.28);
  assert.deepEqual(small.combat.threatSources, ['大群']);
  assert.equal(large.combat.hunt, 0.38);
  assert.equal(large.combat.panic, null);
  assert.deepEqual(large.combat.huntTargets, ['小群']);
});
