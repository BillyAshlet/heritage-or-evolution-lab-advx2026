import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultConfig,
  createParameterRegistry,
  exportConfigJson,
  importConfigJson,
  listLeafPaths,
  validateConfig,
} from './experiment-config.js';

test('every configurable leaf has exactly one panel registry entry', () => {
  const config = createDefaultConfig();
  const leaves = listLeafPaths(config).sort();
  const registered = createParameterRegistry(config)
    .map((item) => item.path)
    .sort();
  assert.deepEqual(registered, leaves);
  assert.equal(new Set(registered).size, registered.length);
  for (const spec of createParameterRegistry(config)) {
    assert.ok(spec.label);
    assert.ok(spec.group);
    assert.ok(
      ['live', 'reset', 'rebuildField', 'rebuildScene'].includes(
        spec.applyMode
      )
    );
  }
});

test('config JSON round-trips without loss and validates atomically', () => {
  const original = createDefaultConfig();
  original.runtime.seed = 424242;
  original.schools[1].cohesionWeight = 1.73;
  const imported = importConfigJson(exportConfigJson(original));
  assert.deepEqual(imported.config, original);
  assert.equal(validateConfig(imported.config).valid, true);
  assert.throws(
    () => importConfigJson('{"runtime":{"seed":3}}'),
    /至少需要两个鱼群/
  );
});

test('default project is the live size-derived aquarium', () => {
  const config = createDefaultConfig();
  assert.equal(config.runtime.project, 'aquarium');
  assert.equal(config.runtime.mode, 'steady');
  assert.equal(config.relations.policy, 'size');
  assert.equal(config.holding.enabled, false);
  assert.equal(config.captureVfx.enabled, true);
});

test('invalid predation geometry warns without partially rejecting config', () => {
  const config = createDefaultConfig();
  config.locomotion.burstFactor = 1.1;
  config.locomotion.panicSpeedFactor = 1.2;
  const result = validateConfig(config);
  assert.equal(result.valid, true);
  assert.match(result.warnings.join(' '), /无法闭合距离/);
});
