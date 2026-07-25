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
import {
  GAME_PHASE,
  GameAttemptSeed,
  GameSession,
  LEVEL_SPECS,
  PLAYER_SCHOOL_ID,
  createGameLevelConfig,
} from './game-mode.js';
import { GameUI } from './game-ui.js';

const startup = document.getElementById('startup-status');
const app = document.getElementById('app');

const GAME_LEVEL_COPY = Object.freeze({
  L1: Object.freeze({
    era: 'GENERATION 01 · SCARCITY',
    objective: '在捕食者与饥荒夹击下，让至少 35% 的蓝鱼活到观察结束。',
  }),
  L2: Object.freeze({
    era: 'GENERATION 02 · GOLDEN AGE',
    objective: '改变体型关系、利用平行鱼群，让至少 75% 的蓝鱼存活。',
  }),
  L3: Object.freeze({
    era: 'GENERATION 03 · QUIET AFTERMATH',
    objective: '在低食物、低活动的漫长时期，让至少 50% 的蓝鱼熬到最后。',
  }),
});

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
    // 大群数量必须够高，否则 cohesionRadius 追不上平均间距，
    // 全缸随机出生时它从第一帧就感知不到同伴，永远不成群。
    // 捕获速率由每群共享节流决定，与数量无关，所以提高数量不加剧捕食。
    full: { small: 400, medium: 200, large: 80 },
    performance: { small: 200, medium: 80, large: 40 },
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
    stage.ecology.enabled = true;
    stage.plankton.enabled = true;
    restoreDefaultSchoolLayout(stage);
  } else if (stage.runtime.project === 'obstacle') {
    Object.assign(stage.tank, { width: 2, height: 1.2, depth: 0.8 });
    stage.tank.preset = 'obstacle';
    stage.obstacles.enabled = true;
    stage.runtime.mode = 'steady';
    stage.traits.enabled = false;
    stage.ecology.enabled = false;
    stage.plankton.enabled = false;
    const obstacleCenters = {
      small: 0.23,
      medium: 0,
      large: -0.21,
    };
    for (const school of stage.schools) {
      school.spawnRegion.centerX = obstacleCenters[school.id] ?? 0;
      school.spawnRegion.centerY = 0;
      school.spawnRegion.centerZ = -0.35;
      // blob 要大于该群 separationRadius，否则出生即互斥爆开
      school.spawnRegion.radius = school.id === 'large' ? 0.3 : 0.26;
      // 这个缸是 2.0 × 1.2 × 0.8，z 是最短轴（±0.4）。
      // 原来朝 z 出发 = 整群列队冲向最近的墙。
      school.initialHeading = { x: 1, y: 0, z: 0 };
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
    stage.ecology.enabled = true;
    stage.plankton.enabled = true;
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
  const gameBaseConfig = createDefaultConfig();
  const gameSession = new GameSession();
  const gameAttemptSeed = new GameAttemptSeed();
  let nonGameConfig = deepClone(initialConfig);
  syncTank(initialConfig);
  const presentation = createScene(
    app,
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
  let gameUI = null;
  let timeShortcuts = null;
  let lastPresentedProject = null;
  let lastGameUiUpdate = -Infinity;

  function makeGameConfig({
    running = false,
    newAttempt = false,
  } = {}) {
    const config = createGameLevelConfig(
      gameBaseConfig,
      gameSession.currentLevel,
      gameSession.previewCumulative
    );
    config.runtime.timeScale = running ? 1 : 0;
    // Randomize once per playable attempt, then reuse that seed from TUNING
    // into RUNNING so pressing Start does not reshuffle the visible scene.
    config.runtime.randomizeSeed = false;
    config.runtime.seed = newAttempt
      ? gameAttemptSeed.renew()
      : gameAttemptSeed.ensure();
    return config;
  }

  function prepareProjectStage(project) {
    if (project === 'game') {
      const enteringGame = current.runtime.project !== 'game';
      if (enteringGame) {
        nonGameConfig = deepClone(current);
      }
      stage = makeGameConfig({ newAttempt: enteringGame });
      return;
    }

    if (current.runtime.project === 'game') {
      stage = deepClone(nonGameConfig);
      stage.runtime.project = project;
    }
    applyProjectPreset(stage);
  }

  function gameRoundReport(metrics) {
    const player = metrics.population.find(
      (school) => school.id === PLAYER_SCHOOL_ID
    );
    if (!player) throw new Error(`找不到玩家鱼群 ${PLAYER_SCHOOL_ID}`);
    const initial = player.target;
    const survivors = player.alive;
    const totalDeaths = Math.max(0, initial - survivors);
    const eaten = Math.min(
      totalDeaths,
      Math.max(0, player.deaths?.captured ?? 0)
    );
    const measuredStarved = Math.max(0, player.deaths?.starved ?? 0);
    const starved =
      eaten + measuredStarved === totalDeaths
        ? measuredStarved
        : totalDeaths - eaten;
    return {
      initial,
      survivors,
      deaths: { eaten, starved },
      events: [],
    };
  }

  function gameViewModel(metrics = simulation.metrics()) {
    const level = gameSession.currentLevel ?? LEVEL_SPECS.at(-1);
    const copy = GAME_LEVEL_COPY[level.id] ?? {};
    const player = metrics.population.find(
      (school) => school.id === PLAYER_SCHOOL_ID
    );
    const report = gameSession.report;
    const initial = report?.initial ?? player?.target ?? level.playerFish.count;
    const survivors =
      report?.survivors ?? player?.alive ?? level.playerFish.count;
    const rawTimeRemaining = level.durationSec - metrics.elapsed;
    return {
      active: current.runtime.project === 'game',
      phase: gameSession.phase,
      levelIndex: gameSession.levelIndex,
      levelCount: LEVEL_SPECS.length,
      level: {
        ...level,
        title: level.label,
        era: copy.era,
        objective: copy.objective,
      },
      barycentric: gameSession.barycentric,
      roundWeights: gameSession.barycentric,
      roundMultipliers: gameSession.roundMultipliers,
      inheritedCoefficients: gameSession.inheritedCoefficients,
      previewCumulative: gameSession.previewCumulative,
      cumulativeCoefficients: gameSession.previewCumulative,
      initial,
      survivors,
      survivalPct: initial > 0 ? (survivors / initial) * 100 : 0,
      timeRemaining:
        rawTimeRemaining <= 1e-6 ? 0 : Math.max(0, rawTimeRemaining),
      deaths: report?.deaths ?? player?.deaths,
      lineage: gameSession.lineage,
      result: gameSession.verdict,
    };
  }

  function renderGameUi(nowMs = performance.now(), force = false) {
    if (!gameUI) return;
    if (current.runtime.project !== 'game') {
      gameUI.render({ active: false });
      return;
    }
    if (!force && nowMs - lastGameUiUpdate < 100) return;
    lastGameUiUpdate = nowMs;
    gameUI.render(gameViewModel());
  }

  function syncProjectPresentation(force = false) {
    const project = current.runtime.project;
    const isGame = project === 'game';
    app.dataset.project = project;
    if (isGame) {
      app.dataset.gameAttemptSeed = String(current.runtime.seed);
    } else {
      delete app.dataset.gameAttemptSeed;
    }
    timeShortcuts?.setEnabled(!isGame);
    cameraController.setInteractionEnabled(!isGame);
    simulation.setLocomotionPreview(
      isGame && gameSession.phase === GAME_PHASE.TUNING
    );
    if (project !== lastPresentedProject && isGame) {
      cameraController.exitView(true);
    }
    lastPresentedProject = project;
    renderGameUi(performance.now(), force || isGame);
  }

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
      if (sourcePath === 'runtime.project') {
        prepareProjectStage(stage.runtime.project);
      }
      if (sourcePath === 'tank.preset') {
        if (stage.tank.preset === 'game') {
          stage.runtime.project = 'game';
          prepareProjectStage('game');
        } else {
          applyTankPreset(stage);
        }
      }
      if (!sourcePath && stage.runtime.project === 'game') {
        // Imports and programmatic staging can name Game without going through
        // the project switcher. Rebuild the canonical current level so the
        // simulation and GameSession can never diverge.
        prepareProjectStage('game');
      }
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
      syncProjectPresentation();
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
      if (stage.schools.length <= 1) {
        throw new Error('至少保留一个鱼群');
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
  timeShortcuts = new TimeShortcutController({
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

  function installGameScene({
    running = false,
    newAttempt = true,
  } = {}) {
    controller.setStage(
      makeGameConfig({ running, newAttempt })
    );
    const result = controller.applyConfig(
      'rebuildScene',
      running ? 'game.start' : 'game.tuning'
    );
    renderGameUi(performance.now(), true);
    return result;
  }

  function updateTriangleSelection(point) {
    gameSession.setBarycentric(point?.barycentric ?? point);
    controller.setStage(makeGameConfig());
    controller.applyConfig('live', 'game.tuning.selection');
    renderGameUi(performance.now(), true);
  }

  gameUI = new GameUI({
    root: document.getElementById('game-ui-root'),
    onTriangleInput: updateTriangleSelection,
    onBarycentricInput: updateTriangleSelection,
    onStart() {
      if (gameSession.phase !== GAME_PHASE.TUNING) return;
      // Validate and stage the exact attempt before locking the selection.
      controller.setStage(makeGameConfig({ running: true }));
      gameSession.startLevel();
      // TUNING already holds a clean, non-scoring simulation. Applying the
      // final phenotype live preserves the visible positions instead of
      // rewinding the fish to their spawn points.
      controller.applyConfig('live', 'game.start');
      simulation.beginGameplayFromPreview();
      // Do not charge the RUNNING state for the partial RAF interval that
      // elapsed while the player was still choosing a direction.
      world.resetTiming(performance.now());
      renderGameUi(performance.now(), true);
    },
    onRetry() {
      if (gameSession.phase !== GAME_PHASE.VERDICT) return;
      gameSession.retryLevel();
      installGameScene();
    },
    onContinue() {
      if (gameSession.phase === GAME_PHASE.VERDICT) {
        if (!gameSession.verdict?.won) return;
        gameSession.sealGeneration();
        renderGameUi(performance.now(), true);
        return;
      }
      if (gameSession.phase !== GAME_PHASE.INHERIT) return;
      gameSession.advanceLevel();
      if (gameSession.phase === GAME_PHASE.COMPLETE) {
        renderGameUi(performance.now(), true);
      } else {
        installGameScene();
      }
    },
    onRestart() {
      gameSession.restart();
      installGameScene();
    },
    onExit() {
      // Exiting during RUNNING would discard the attempt's only live report.
      if (gameSession.phase === GAME_PHASE.RUNNING) return;
      stage.runtime.project = 'aquarium';
      controller.applyConfig('rebuildScene', 'runtime.project');
      debug.rebuildPane();
      renderGameUi(performance.now(), true);
    },
  });
  syncProjectPresentation(true);

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

  function finishGameLevelIfNeeded(metrics) {
    if (
      current.runtime.project !== 'game' ||
      gameSession.phase !== GAME_PHASE.RUNNING
    ) {
      return false;
    }
    const player = metrics.population.find(
      (school) => school.id === PLAYER_SCHOOL_ID
    );
    const timedOut =
      metrics.elapsed + 1e-9 >= gameSession.currentLevel.durationSec;
    if (!timedOut && (player?.alive ?? 0) > 0) return false;

    stage.runtime.timeScale = 0;
    controller.applyConfig('live', 'runtime.timeScale');
    gameSession.finishLevel(gameRoundReport(metrics));
    renderGameUi(performance.now(), true);
    return true;
  }

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
    const tuningPreview =
      current.runtime.project === 'game' &&
      gameSession.phase === GAME_PHASE.TUNING;
    world.timeScale = tuningPreview ? 1 : current.runtime.timeScale;
    world.fixedDt = current.runtime.fixedDt;
    world.step(nowMs);
    if (current.runtime.project === 'game') {
      const metrics = simulation.metrics();
      finishGameLevelIfNeeded(metrics);
      renderGameUi(nowMs);
    }
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
