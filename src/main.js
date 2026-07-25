import * as THREE from 'three';
import { World, TANK, notifyTankChange } from './world.js';
import { createScene } from './scene.js';
import { MotionInput, mountEnableButton } from './input.js';
import {
  createDefaultConfig,
  deepClone,
  exportConfigJson,
  importConfigJson,
  validateConfig,
} from './experiment-config.js';
import { DistanceField3D } from './distance-field.js';
import {
  PhysicsEnvironment,
  initializeRapier,
} from './physics-environment.js';
import { ExperimentSimulation } from './experiment-simulation.js';
import { ExperimentCameraController } from './experiment-camera.js';
import { createExperimentDebug } from './experiment-debug.js';
import { TimeShortcutController } from './time-shortcuts.js';
import { RadiusVisualizer } from './radius-visualizer.js';

const startup = document.getElementById('startup-status');

function setStartup(message, state = 'loading') {
  startup.textContent = message;
  startup.dataset.state = state;
  startup.hidden = false;
}

function syncTank(config) {
  Object.assign(TANK, {
    width: config.tank.width,
    height: config.tank.height,
    depth: config.tank.depth,
  });
  notifyTankChange();
}

function restoreDefaultSchoolLayout(stage) {
  const defaults = createDefaultConfig();
  for (const school of stage.schools) {
    const original = defaults.schools.find((item) => item.id === school.id);
    if (!original) continue;
    school.spawnRegion = deepClone(original.spawnRegion);
    school.initialHeading = deepClone(original.initialHeading);
  }
}

function applyPopulationPreset(stage) {
  const presets = {
    full: { small: 400, medium: 200, large: 40 },
    performance: { small: 200, medium: 80, large: 20 },
  };
  const counts = presets[stage.runtime.populationPreset];
  if (!counts) return;
  for (const school of stage.schools) {
    if (counts[school.id] !== undefined) school.count = counts[school.id];
  }
}

function applyProjectPreset(stage) {
  if (stage.runtime.project === 'aquarium') {
    Object.assign(stage.tank, {
      preset: 'aquarium',
      width: 6,
      height: 3.6,
      depth: 2.4,
    });
    stage.obstacles.enabled = false;
    stage.runtime.mode = 'steady';
    stage.traits.enabled = false;
    restoreDefaultSchoolLayout(stage);
  } else if (stage.runtime.project === 'obstacle') {
    Object.assign(stage.tank, { width: 2, height: 1.2, depth: 0.8 });
    stage.tank.preset = 'obstacle';
    stage.obstacles.enabled = true;
    stage.runtime.mode = 'steady';
    stage.traits.enabled = false;
    const obstacleCenters = {
      small: 0.23,
      medium: 0,
      large: -0.21,
    };
    for (const school of stage.schools) {
      school.spawnRegion.centerX = obstacleCenters[school.id] ?? 0;
      school.spawnRegion.centerY = 0;
      school.spawnRegion.centerZ = -0.35;
      school.spawnRegion.radius = school.id === 'large' ? 0.14 : 0.18;
      school.initialHeading = { x: 0, y: 0, z: 1 };
    }
  } else if (stage.runtime.project === 'ecology') {
    Object.assign(stage.tank, {
      preset: 'ecology',
      width: 3,
      height: 1.8,
      depth: 1.2,
    });
    stage.obstacles.enabled = false;
    stage.runtime.mode = 'ecology';
    stage.traits.enabled = true;
    restoreDefaultSchoolLayout(stage);
  }
}

function applyTankPreset(stage) {
  if (
    ['aquarium', 'obstacle', 'ecology'].includes(
      stage.tank.preset
    )
  ) {
    stage.runtime.project = stage.tank.preset;
    applyProjectPreset(stage);
  }
}

async function bootstrap() {
  setStartup('初始化 Rapier WASM…');
  await initializeRapier();
  const world = new World();
  const input = new MotionInput(world);
  const initialConfig = createDefaultConfig();
  syncTank(initialConfig);
  const presentation = createScene(
    document.getElementById('app'),
    () => input.presentationRotation()
  );
  const { renderer, scene, camera } = presentation;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  scene.add(
    new THREE.HemisphereLight('#eaf6ff', '#8d806d', 2.1),
    new THREE.DirectionalLight('#fff4dc', 1.45)
  );
  scene.children.at(-1).position.set(1.5, 2.2, 2.4);
  mountEnableButton(input);

  let current = deepClone(initialConfig);
  let stage = deepClone(initialConfig);
  let distanceField = new DistanceField3D(current);
  const physics = new PhysicsEnvironment(scene, current);
  const simulation = new ExperimentSimulation({
    scene,
    config: current,
    distanceField,
    physics,
  });
  world.systems.push(simulation);
  const cameraController = new ExperimentCameraController({
    camera,
    renderer,
    presentation,
    simulation,
  });
  let debug = null;

  const controller = {
    get current() {
      return current;
    },
    get stage() {
      return stage;
    },
    setStage(next) {
      const result = validateConfig(next);
      if (!result.valid) throw new Error(result.errors.join('\n'));
      stage = deepClone(next);
      return result;
    },
    applyConfig(mode = 'rebuildScene', sourcePath = '') {
      if (sourcePath === 'runtime.project') applyProjectPreset(stage);
      if (sourcePath === 'tank.preset') applyTankPreset(stage);
      if (sourcePath === 'runtime.populationPreset') {
        applyPopulationPreset(stage);
      } else if (/^schools\.\d+\.count$/.test(sourcePath)) {
        stage.runtime.populationPreset = 'custom';
      }
      const result = validateConfig(stage);
      if (!result.valid) throw new Error(result.errors.join('\n'));
      current = deepClone(stage);
      if (mode === 'live') {
        distanceField.config = current;
        physics.config = current;
        simulation.setConfig(current, 'live');
      } else if (mode === 'reset') {
        distanceField.config = current;
        physics.config = current;
        simulation.setConfig(current, 'reset');
      } else if (mode === 'rebuildField') {
        syncTank(current);
        distanceField.rebuild(current);
        physics.rebuild(current);
        simulation.distanceField = distanceField;
        simulation.physics = physics;
        simulation.setConfig(current, 'reset');
        cameraController.exitView(true);
      } else {
        syncTank(current);
        distanceField = new DistanceField3D(current);
        physics.rebuild(current);
        simulation.distanceField = distanceField;
        simulation.physics = physics;
        simulation.rebuild(current);
        cameraController.onSimulationRebuilt(simulation);
      }
      if (result.warnings.length) {
        console.warn('[experiment config]', ...result.warnings);
      }
      return { config: current, warnings: result.warnings };
    },
    reset() {
      physics.rebuild(current);
      simulation.physics = physics;
      simulation.reset(current.runtime.seed);
      cameraController.exitView(true);
      return simulation.metrics();
    },
    restoreDefaults() {
      stage = createDefaultConfig();
      return this.applyConfig('rebuildScene');
    },
    exportConfig() {
      return exportConfigJson(stage);
    },
    importConfig(text) {
      const imported = importConfigJson(text);
      stage = imported.config;
      this.applyConfig('rebuildScene');
      return imported;
    },
    addSchool(sourceIndex = stage.schools.length - 1) {
      const template = deepClone(
        stage.schools[sourceIndex] ?? stage.schools.at(-1)
      );
      let number = stage.schools.length + 1;
      const ids = new Set(stage.schools.map((school) => school.id));
      while (ids.has(`school-${number}`)) number += 1;
      const palette = ['#7e6db0', '#53a078', '#b16d8a', '#687e9f'];
      template.id = `school-${number}`;
      template.name = `鱼群 ${number}`;
      template.color = palette[(number - 1) % palette.length];
      template.count = 40;
      template.size = Number((template.size * 1.25).toFixed(2));
      template.targetNeighbors = Math.min(8, template.count - 1);
      template.spawnRegion.centerX = 0;
      stage.schools.push(template);
      stage.runtime.populationPreset = 'custom';
      return this.applyConfig('rebuildScene');
    },
    removeSchool(index = stage.schools.length - 1) {
      if (stage.schools.length <= 2) {
        throw new Error('至少保留两个鱼群');
      }
      const safeIndex = Math.max(
        0,
        Math.min(stage.schools.length - 1, index)
      );
      stage.schools.splice(safeIndex, 1);
      stage.runtime.populationPreset = 'custom';
      return this.applyConfig('rebuildScene');
    },
  };

  debug = createExperimentDebug({
    controller,
    simulation,
    spawnRigidBody: (type, options) =>
      physics.spawnRigidBody(type, options),
  });
  const radiusVisualizer = new RadiusVisualizer(scene);
  const timeShortcuts = new TimeShortcutController({
    setTimeScale(value) {
      stage.runtime.timeScale = value;
      controller.applyConfig('live', 'runtime.timeScale');
      debug.pane?.refresh();
      return current.runtime.timeScale;
    },
    onDoubleSpace() {
      cameraController.exitView(true);
    },
  });

  const experimentApi = {
    stageConfig(next) {
      if (next === undefined) return deepClone(stage);
      return controller.setStage(next);
    },
    applyConfig(nextOrMode, maybeMode) {
      if (nextOrMode && typeof nextOrMode === 'object') {
        controller.setStage(nextOrMode);
        const result = controller.applyConfig(maybeMode ?? 'rebuildScene');
        debug.rebuildPane();
        return result;
      }
      return controller.applyConfig(nextOrMode ?? 'rebuildScene');
    },
    exportConfig: () => controller.exportConfig(),
    importConfig(text) {
      const result = controller.importConfig(text);
      debug.rebuildPane();
      return result;
    },
    reset: () => controller.reset(),
    metrics: () => simulation.metrics(),
    spawnRigidBody: (type, options) =>
      physics.spawnRigidBody(type, options),
    setProject(project) {
      stage.runtime.project = project;
      const result = controller.applyConfig(
        'rebuildScene',
        'runtime.project'
      );
      debug.rebuildPane();
      return result;
    },
  };
  Object.defineProperties(experimentApi, {
    config: { enumerable: true, get: () => current },
    staged: { enumerable: true, get: () => stage },
  });
  window.experiment = experimentApi;

  let lastFrame = performance.now();
  let smoothedFrameMs = 16.7;
  renderer.setAnimationLoop((nowMs) => {
    const realDt = Math.min(0.1, Math.max(0, (nowMs - lastFrame) / 1000));
    lastFrame = nowMs;
    smoothedFrameMs += ((realDt * 1000 || 16.7) - smoothedFrameMs) * 0.06;
    simulation.metricsState.renderFps = 1000 / smoothedFrameMs;
    input.update();
    presentation.updateOrientation();
    presentation.updateCamera();
    world.timeScale = current.runtime.timeScale;
    world.fixedDt = current.runtime.fixedDt;
    world.step(nowMs);
    cameraController.update(realDt);
    renderer.render(scene, camera);
    cameraController.renderPreview();
    timeShortcuts.update(current.runtime.timeScale);
    radiusVisualizer.update(simulation, current);
    debug.update(nowMs);
  });
  setStartup('Web 实验版已就绪', 'ready');
  setTimeout(() => {
    startup.hidden = true;
  }, 900);
}

bootstrap().catch((error) => {
  console.error(error);
  setStartup(`启动失败：${error.message}`, 'error');
});
