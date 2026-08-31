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
import {
  T1_SPEC,
  TUTORIAL_SPECS,
  tutorialChamberBoxes,
  TUTORIAL_PROJECT,
  createTutorialConfig,
  findTutorialSpec,
} from './tutorial-mode.js';
import { TutorialUI } from './tutorial-ui.js';
import { mountVisitorMode } from './visitor-mode.js';

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
  let visitorUI = null;
  let gameUiRevealed = false;
  let timeShortcuts = null;
  // 开发者模式是一个【状态】，不是"切到某个项目"这个动作。
  //
  // 改这一条之前，本应用其实没有开发者模式：调试面板在启动时无条件创建、
  // 一直挂在 DOM 里，玩家看到的每一个界面都是靠 CSS 把它盖住做出来的
  // （game-ui.css 和 visitor.css 里各有一份"隐藏清单"）。这种黑名单写法
  // 的默认值是【泄漏】—— 新加一个玩家界面时只要忘了写隐藏规则，参数面板
  // 就会露出来。教学关就是这么撞上的。
  //
  // 现在反过来：玩家视图是默认，开发者控件要显式打开才存在。新增玩家界面
  // 不需要再写任何隐藏规则。
  let developerMode = false;
  let tutorialUI = null;
  let tutorialSpec = T1_SPEC;
  let tutorialValue = T1_SPEC.slider.initial;
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

  function makeTutorialConfig() {
    return createTutorialConfig(tutorialSpec, tutorialValue);
  }

  // 拖滑块 = 【实时】改体型，绝不重建场景。
  //
  // 之前这里走的是 rebuildScene，而 setConfig 在非 live 模式下会调 reset()，
  // 鱼直接弹回出生点重新排队 —— 玩家每动一下滑块画面就"刷新"一次，根本
  // 没法边调边看。live 模式重新推导体型、捕食半径、关系矩阵，但不 reset，
  // 位置和速度原样保留：按住滑块来回拖，鱼一直在游，身体在手底下连续变。
  // （游戏本体开局用的也是这条路，见 onStart。）
  function applyTutorialSizeLive() {
    controller.setStage(makeTutorialConfig());
    controller.applyConfig('live', 'tutorial.value');
  }

  // 整场重来：只有进入教学关和玩家主动点「重新开始本场」时才走这条。
  function installTutorialScene() {
    controller.setStage(makeTutorialConfig());
    controller.applyConfig('rebuildScene', 'tutorial.reset');
    // 防御性地退出「运动预览」态并重置计时：预览态只跑运动不跑捕食，
    // 而从游戏 TUNING 阶段切进教学关时仿真可能正处于该状态。
    // （syncProjectPresentation 也会关掉它，这里是双保险。）
    // ⚠️ 更正：这两行【不是】用来修「浏览器里鱼不会被吃」的 —— 那个现象
    // 后来查明是自动化环境里标签页 visibilityState=hidden、rAF 被浏览器
    // 挂起导致整个渲染循环没在跑，与本项目代码无关。
    simulation.beginGameplayFromPreview();
    simulation.setFrozenChambers(tutorialUI ? [...tutorialUI.paused] : []);
    world.resetTiming(performance.now());
  }

  // game 与 tutorial 都会把 stage 整个换成自己生成的配置（鱼群数量、缸体
  // 尺寸、捕食参数全不一样），所以离开它们时必须还原成进入前的那份，
  // 否则会把教学关的 4 条鱼带进水族馆。
  const MANAGED_PROJECTS = new Set(['game', TUTORIAL_PROJECT]);

  // 场景底色。默认值抄自 scene.js 的硬编码，教学关是实验室白，
  // 与 tutorial-ui.js 的 --t-bg 同色。
  // 空气透视：远处的鱼向背景色褪去。
  //
  // 这修的是【可读性】，不是美观。鱼用的是 MeshBasicMaterial（不受光的
  // 纯色块），在白底上没有任何深度线索 —— 于是一条远处的大鱼和一条近处
  // 的小鱼看起来一样大。而这一课的全部内容就是比体型，深度线索缺失会让
  // 玩家读错他正在学的那个量。
  //
  // ⚠️ MeshBasicMaterial 默认 fog: true，但着色器是在 scene.fog 还不存在
  // 时编译的，事后加雾必须把材质标记为需要重编译，否则毫无效果。
  function applyDepthCue(enabled) {
    if (!scene) return;
    const materials = [simulation?.mesh?.material].filter(Boolean);
    if (!enabled) {
      if (!scene.fog) return;
      scene.fog = null;
      materials.forEach((material) => (material.needsUpdate = true));
      return;
    }
    // 雾的远近端跟着相机到缸心的距离走：缸只有 1.6 米深，写死的数值
    // 换个取景就废了。
    const distance = camera.position.length();
    const depth = Math.max(0.6, current.tank.depth);
    // 雾区直接由【后壁最多褪多少】反推，不用两个魔数系数。
    // 前壁 0 褪色，后壁褪 DEPTH_CUE_MAX_FADE —— 一个有含义的旋钮，
    // 想更清就调小它，不用再猜两个乘数之间的关系。
    const near = Math.max(0.05, distance - depth / 2);
    const far = near + depth / DEPTH_CUE_MAX_FADE;
    if (scene.fog) {
      scene.fog.color.set(TUTORIAL_SCENE_BG);
      scene.fog.near = near;
      scene.fog.far = far;
      return;
    }
    scene.fog = new THREE.Fog(TUTORIAL_SCENE_BG, near, far);
    materials.forEach((material) => (material.needsUpdate = true));
  }

  // 后壁处最多褪去多少。0.7 试过 —— 纵深是出来了，但整缸发糊，
  // 鱼的固有色被稀释，反而不容易比体型。0.3 保留纵深又让每条鱼都实。
  const DEPTH_CUE_MAX_FADE = 0.3;

  // 分缸：教学关 T2 画成【两个真正的盒子】，不是一个盒子加一条隔板。
  //
  // 第一版就是加隔板 —— 设计者的反馈是"看上去是一个缸莫名其妙分成两个"，
  // 这个判断准：隔板表达的是"切开"，而这一课要表达的是"两个独立环境"。
  // 仿真那边早就是隔离的（bounds + chamber），所以这里纯粹是视觉，
  // 但视觉才是玩家唯一能读到的东西。
  function applyChamberDivider(spec) {
    if (!spec?.chambers) {
      presentation.setTankChambers(null);
      return;
    }
    presentation.setTankChambers(
      tutorialChamberBoxes(spec).map(({ centerY, height }) => ({
        centerY,
        height,
      }))
    );
  }

  const DEFAULT_SCENE_BG = '#f4efe6';
  const TUTORIAL_SCENE_BG = '#eef1f0';

  // ── 教学关路由 /tutorial ──────────────────────────────────────────
  // /tutorial 进第一课，/tutorial/T2 进指定一课。
  //
  // 现阶段这是【测试入口】。玩家最终怎么进教学（大概率是 BEGIN 之后判断
  // 要不要教程、且可跳过）等三课齐了再定，那个决定不该被这段代码抢先 ——
  // 但路由本身不会白写，产品入口做好后它照样是可分享的直达链接。
  //
  // 真实路径而非 hash：本项目独占 advx.billyashlet.com 的根，迁移也是整体
  // 迁移，不存在"挂到未知子路径"的顾虑。代价是两处配套改动，都已做：
  // vite base 改 '/'（否则相对资源在 /tutorial/ 下会 404），以及
  // vercel.json 的 SPA rewrite（否则线上直接开 /tutorial 是 404）。
  // 前缀从 BASE_URL 推导而不写死 '/'，这样 base 万一再变，路由跟着走。
  const ROUTE_BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/*$/, '/');

  function tutorialLessonFromPath() {
    const path = window.location.pathname;
    const rest = path.startsWith(ROUTE_BASE)
      ? path.slice(ROUTE_BASE.length)
      : path.replace(/^\//, '');
    const [route, lesson] = rest.replace(/\/+$/, '').split('/');
    if (route !== TUTORIAL_PROJECT) return null;
    return lesson || TUTORIAL_SPECS[0].id;
  }

  function applyTutorialRoute() {
    const lesson = tutorialLessonFromPath();
    if (!lesson) return false;
    let spec;
    try {
      spec = findTutorialSpec(lesson);
    } catch {
      spec = T1_SPEC;
      console.warn(`未知的教学关 ${lesson}，已回落到 ${spec.id}。`);
    }
    const changedLesson = spec !== tutorialSpec;
    if (changedLesson) {
      tutorialSpec = spec;
      tutorialValue = spec.slider.initial;
      // 面板是按 spec 一次性建出来的，换课必须重建，否则文案会停在上一课。
      tutorialUI?.dispose();
      tutorialUI = null;
    }
    visitorUI?.hide();
    if (current.runtime.project === TUTORIAL_PROJECT) {
      // 已经在教学关里换课：syncProjectPresentation 只会重建面板，
      // 缸体和鱼群还停在上一课 —— 场景得自己装。
      if (changedLesson) installTutorialScene();
      else syncProjectPresentation(true);
    } else {
      switchProject(TUTORIAL_PROJECT);
    }
    return true;
  }

  // controller 上没有 setProject（那是 experimentApi 的方法），换项目要走
  // enterDeveloperMode 用的这条路：改 stage 的 project 再 rebuildScene。
  function switchProject(project) {
    stage.runtime.project = project;
    controller.applyConfig('rebuildScene', 'runtime.project');
    debug?.rebuildPane();
  }

  function nextTutorialSpec(spec) {
    const index = TUTORIAL_SPECS.indexOf(spec);
    return index >= 0 ? TUTORIAL_SPECS[index + 1] : undefined;
  }

  /**
   * 「我明白了」→ 进下一课；三课都看完就离开教学、进入正式关卡。
   *
   * 走 pushState + applyTutorialRoute 而不是直接换 spec：这样浏览器的
   * 后退键能一课课退回去，地址栏也始终是当前那一课 —— 路由是唯一的
   * 真相来源，UI 只是照着它渲染。
   */
  function advanceTutorial() {
    const next = nextTutorialSpec(tutorialSpec);
    if (!next) {
      leaveTutorial('game');
      return;
    }
    history.pushState(null, '', `${ROUTE_BASE}tutorial/${next.id}`);
    applyTutorialRoute();
  }

  // 退出教学时把地址退回根，否则刷新会被弹回教学关。用 pushState 而不是
  // replaceState：玩家按浏览器后退键应该能回到教学关，这是真实路径路由
  // 相对 hash 白拿的好处。
  function leaveTutorial(project) {
    if (tutorialLessonFromPath()) {
      history.pushState(null, '', ROUTE_BASE + window.location.search);
    }
    switchProject(project);
  }

  function prepareProjectStage(project) {
    const leavingManaged = MANAGED_PROJECTS.has(current.runtime.project);
    if (MANAGED_PROJECTS.has(project)) {
      if (!leavingManaged) {
        nonGameConfig = deepClone(current);
      }
      stage =
        project === TUTORIAL_PROJECT
          ? makeTutorialConfig()
          : makeGameConfig({ newAttempt: current.runtime.project !== 'game' });
      return;
    }

    if (leavingManaged) {
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
      active:
        current.runtime.project === 'game' &&
        gameUiRevealed,
      phase: gameSession.phase,
      levelIndex: gameSession.levelIndex,
      levelCount: LEVEL_SPECS.length,
      level: {
        ...level,
        // spec 自带 title（典故长句）优先；没写的关卡回落到短 label。
        title: level.title ?? level.label,
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
    if (
      current.runtime.project !== 'game' ||
      !gameUiRevealed
    ) {
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
    const visitorBlocking = visitorUI?.blocking ?? false;
    app.dataset.project = project;
    if (isGame) {
      app.dataset.gameAttemptSeed = String(current.runtime.seed);
    } else {
      delete app.dataset.gameAttemptSeed;
    }
    // TUNING 也开放快慢键：调参恰恰是最需要放慢观察的时刻，原来只在
    // RUNNING 启用，等于"能看清的时候已经改不了了"。TUNING 期间倒计时
    // 与生态都不推进，变速只影响观察，不触及任何判定。
    const timeShortcutsAllowed =
      !visitorBlocking &&
      (!isGame ||
        gameSession.phase === GAME_PHASE.RUNNING ||
        gameSession.phase === GAME_PHASE.TUNING);
    // 点鱼观察窗链路在 game 模式同样开放（单击鱼 → 观察窗 → 特写/跟随
    // → ESC/双击空格回全局），只在游客壳遮挡时禁用。
    cameraController.setInteractionEnabled(!visitorBlocking);
    simulation.setLocomotionPreview(
      isGame && gameSession.phase === GAME_PHASE.TUNING
    );
    const isTutorial = project === TUTORIAL_PROJECT;
    // 场景底色跟着项目走。scene.js 里写死的是暖米色 #f4efe6，那是水族馆
    // 的调子；教学关要的是连成一片的实验室白 —— 缸外那一圈和控制条带
    // 必须是同一个色，否则"标本被放在实验台上"这个读法就散了。
    if (scene?.background?.set) {
      scene.background.set(isTutorial ? TUTORIAL_SCENE_BG : DEFAULT_SCENE_BG);
    }
    applyDepthCue(isTutorial);
    applyChamberDivider(isTutorial ? tutorialSpec : null);
    // 变速键按【本课是否声明】开放，不再一刀切关掉。
    //
    // 原来这里是 !isTutorial —— 三课全禁。但 T2 的提示写着"按住 SPACE
    // 放慢"、T3 写着"按 ENTER 快进"，也就是界面在承诺一个我亲手禁用了的
    // 功能。规范里"不能说谎"那一条，被我自己违反了。
    // 每个操作仍然只在它第一次真正有用的那一课出现：T1 不给（那一课教
    // 点鱼），T2 给慢放（追逐要看清），T3 给快进（饿死比追逐慢得多）。
    const wantsTimeKeys = isTutorial ? Boolean(tutorialSpec?.timeControls) : true;
    timeShortcuts?.setEnabled(wantsTimeKeys && (timeShortcutsAllowed ?? true));
    app.dataset.timeKeys = wantsTimeKeys ? '1' : '';
    if (isTutorial && !tutorialUI) {
      // 首次进入教学关同样要退出预览态（换滑块走 installTutorialScene，
      // 但进关这一次不经过它）。
      simulation.beginGameplayFromPreview();
      tutorialUI = new TutorialUI({
        spec: tutorialSpec,
        lastLesson: !nextTutorialSpec(tutorialSpec),
        // 跟随游客壳当前的语言：玩家在标题页选过中文，进教学关就该是中文。
        language: visitorUI?.language ?? 'en',
        onPauseChange(chambers) {
          simulation.setFrozenChambers(chambers);
        },
        onLanguageChange(next) {
          // 反向同步，免得退出教学关后标题页又跳回英文。
          window.downstream?.setLang?.(next);
        },
        onValueChange(value) {
          tutorialValue = value;
          applyTutorialSizeLive();
        },
        onReset: installTutorialScene,
        onNext() {
          advanceTutorial();
        },
        onExit() {
          leaveTutorial('game');
        },
      });
    } else if (!isTutorial && tutorialUI) {
      tutorialUI.dispose();
      tutorialUI = null;
    }
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

  // 调试面板按需创建：不进开发者模式就完全不存在，而不是创建出来再藏起来。
  function ensureDebug() {
    if (!debug) {
      debug = createExperimentDebug({
        controller,
        simulation,
        spawnRigidBody: (type, options) =>
          physics.spawnRigidBody(type, options),
      });
    }
    return debug;
  }
  const radiusVisualizer = new RadiusVisualizer(scene);
  timeShortcuts = new TimeShortcutController({
    setTimeScale(value) {
      stage.runtime.timeScale = value;
      controller.applyConfig('live', 'runtime.timeScale');
      debug?.pane?.refresh();
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

  function beginVisitorExperience() {
    gameUiRevealed = false;
    gameSession.restart();
    installGameScene({ newAttempt: true });
  }

  // Developer mode always lands on the map/rigid-body experiment: it is the
  // most legible preview of the simulation. Entering dev mode is always a
  // fresh entry from the visitor menu, so this is unconditional — the old
  // 'only redirect away from game' check never fired, because the runtime
  // sits on 'aquarium' while the visitor shell is showing.
  const DEVELOPER_LANDING_PROJECT = 'obstacle';

  function setDeveloperMode(enabled) {
    developerMode = Boolean(enabled);
    app.dataset.developer = developerMode ? '1' : '';
  }

  function enterDeveloperMode() {
    gameUiRevealed = false;
    setDeveloperMode(true);
    ensureDebug();
    if (current.runtime.project !== DEVELOPER_LANDING_PROJECT) {
      stage.runtime.project = DEVELOPER_LANDING_PROJECT;
      controller.applyConfig('rebuildScene', 'runtime.project');
    }
    debug?.rebuildPane();
    syncProjectPresentation(true);
  }

  // 退出开发者模式。改这条之前根本没有出口 —— 进去了只能刷新页面。
  // 面板实例保留（下次进来不用重建），只是不再显示。
  function exitDeveloperMode() {
    setDeveloperMode(false);
    if (tutorialLessonFromPath()) {
      history.pushState(null, '', ROUTE_BASE + window.location.search);
    }
    // 回到标题页应有的背景。开发者模式多半停在 obstacle/ecology 这类
    // 子实验上，直接把标题页盖上去会露出一缸不相干的东西。
    if (
      current.runtime.project !== 'game' &&
      current.runtime.project !== 'aquarium'
    ) {
      stage.runtime.project = 'aquarium';
      controller.applyConfig('rebuildScene', 'runtime.project');
    }
    returnToVisitorTitle();
    visitorUI?.showTitle();
    syncProjectPresentation(true);
  }

  function revealVisitorLevel(levelIndex) {
    if (
      gameSession.phase !== GAME_PHASE.TUNING ||
      levelIndex !== gameSession.levelIndex
    ) {
      throw new Error('过场年代与当前游戏关卡不同步。');
    }
    gameUiRevealed = true;
    syncProjectPresentation(true);
  }

  function returnToVisitorTitle() {
    gameUiRevealed = false;
    if (
      current.runtime.project === 'game' &&
      gameSession.phase !== GAME_PHASE.RUNNING
    ) {
      stage.runtime.project = 'aquarium';
      controller.applyConfig('rebuildScene', 'runtime.project');
      debug?.rebuildPane();
    }
    syncProjectPresentation(true);
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
      gameUiRevealed = true;
      installGameScene();
    },
    onContinue() {
      if (gameSession.phase === GAME_PHASE.VERDICT) {
        // 单次判定：胜负都封代继续，失败不再卡在本关。
        gameSession.sealGeneration();
        renderGameUi(performance.now(), true);
        return;
      }
      if (gameSession.phase !== GAME_PHASE.INHERIT) return;
      gameUiRevealed = false;
      gameSession.advanceLevel();
      if (gameSession.phase === GAME_PHASE.COMPLETE) {
        renderGameUi(performance.now(), true);
        visitorUI?.showEnd();
      } else {
        visitorUI?.showCutscene(gameSession.levelIndex);
        installGameScene();
      }
    },
    onRestart() {
      gameUiRevealed = false;
      gameSession.restart();
      visitorUI?.showCutscene(0);
      installGameScene();
    },
    onExit() {
      // Exiting during RUNNING would discard the attempt's only live report.
      if (gameSession.phase === GAME_PHASE.RUNNING) return;
      gameUiRevealed = false;
      stage.runtime.project = 'aquarium';
      controller.applyConfig('rebuildScene', 'runtime.project');
      debug?.rebuildPane();
      renderGameUi(performance.now(), true);
      visitorUI?.showTitle();
    },
    onSkipLevel() {
      // 测试后门：钟面拉伸栏打开时按空格，按当前存活状态立即结算本关。
      if (
        current.runtime.project !== 'game' ||
        gameSession.phase !== GAME_PHASE.RUNNING
      ) {
        return;
      }
      settleGameLevel(simulation.metrics());
    },
  });

  visitorUI = mountVisitorMode({
    root: app,
    levels: LEVEL_SPECS,
    onBeginExperience: beginVisitorExperience,
    onEnterDeveloperMode: enterDeveloperMode,
    onEnterLevel: revealVisitorLevel,
    onReturnToTitle: returnToVisitorTitle,
    onScreenChange() {
      syncProjectPresentation(true);
    },
  });
  syncProjectPresentation(true);

  // 启动时读一次路径；再监听 popstate，让浏览器前进/后退能在教学关与
  // 正式关卡之间来回走。
  // 左上角实验室标记 = 退出开发者模式的出口。用 h1 而不是 button 是因为
  // 它本来就是标题；补上 role/tabindex 让键盘也能用。
  const labMark = document.getElementById('lab-mark');
  if (labMark) {
    labMark.setAttribute('role', 'button');
    labMark.setAttribute('tabindex', '0');
    labMark.setAttribute('title', '退出开发者模式');
    labMark.addEventListener('click', () => {
      if (developerMode) exitDeveloperMode();
    });
    labMark.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (developerMode) exitDeveloperMode();
    });
  }

  // 点击缸体 = 暂停/继续那一半。
  //
  // 按钮已经能做同样的事，但按钮在屏幕下方、鱼在上方 —— 想停住正在看的
  // 那一缸，视线得来回跑。直接点它才是这个动作该有的样子。
  // 打到鱼就让开：点鱼看视角是 T1 教的操作，两者不该抢同一次点击。
  const tutorialRay = new THREE.Raycaster();
  const tutorialPointer = new THREE.Vector2();
  const tutorialBox = new THREE.Box3();
  const tutorialHit = new THREE.Vector3();
  renderer.domElement.addEventListener('click', (event) => {
    if (current.runtime.project !== TUTORIAL_PROJECT) return;
    if (!tutorialSpec?.chambers || !tutorialUI) return;
    const rect = renderer.domElement.getBoundingClientRect();
    tutorialPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    tutorialPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    tutorialRay.setFromCamera(tutorialPointer, camera);
    if (
      simulation.mesh &&
      tutorialRay.intersectObject(simulation.mesh, false).length > 0
    ) {
      return;
    }
    // 和【整个缸体盒子】求交，不是和某一层截面。
    // 第一版拿 z=0 的中层截面判定，结果可点区域比看得见的缸窄得多 ——
    // 缸有 1.6m 厚，透视下前后面在屏幕上差很远，点在看得见的地方却打空。
    const tank = tutorialSpec.tank;
    let picked = null;
    let nearest = Infinity;
    for (const item of tutorialChamberBoxes(tutorialSpec)) {
      tutorialBox.set(
        new THREE.Vector3(-tank.width / 2, item.centerY - item.height / 2, -tank.depth / 2),
        new THREE.Vector3(tank.width / 2, item.centerY + item.height / 2, tank.depth / 2)
      );
      if (!tutorialRay.ray.intersectBox(tutorialBox, tutorialHit)) continue;
      const distance = tutorialRay.ray.origin.distanceToSquared(tutorialHit);
      if (distance < nearest) {
        nearest = distance;
        picked = item.id;
      }
    }
    if (picked) tutorialUI.togglePause(picked);
  });

  applyTutorialRoute();
  window.addEventListener('popstate', () => {
    if (!applyTutorialRoute() && current.runtime.project === TUTORIAL_PROJECT) {
      // 从 /tutorial 后退回根：离开教学关，但不要再 push 一条历史，
      // 否则后退键会卡在两条记录之间来回跳。
      switchProject('game');
    }
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
        debug?.rebuildPane();
        return result;
      }
      return controller.applyConfig(nextOrMode ?? 'rebuildScene');
    },
    exportConfig: () => controller.exportConfig(),
    importConfig(text) {
      const result = controller.importConfig(text);
      debug?.rebuildPane();
      return result;
    },
    reset: () => controller.reset(),
    metrics: () => simulation.metrics(),
    exitDeveloperMode,
    spawnRigidBody: (type, options) =>
      physics.spawnRigidBody(type, options),
    setProject(project) {
      stage.runtime.project = project;
      const result = controller.applyConfig(
        'rebuildScene',
        'runtime.project'
      );
      debug?.rebuildPane();
      return result;
    },
  };
  Object.defineProperties(experimentApi, {
    config: { enumerable: true, get: () => current },
    staged: { enumerable: true, get: () => stage },
  });
  window.experiment = experimentApi;

  // 把当前 RUNNING 局面直接写成本关判定：倒计时自然结束、蓝鱼提前
  // 灭绝和测试跳关后门共用同一条结算路径。
  function settleGameLevel(metrics) {
    stage.runtime.timeScale = 0;
    controller.applyConfig('live', 'runtime.timeScale');
    gameSession.finishLevel(gameRoundReport(metrics));
    // 结算时退出特写/跟随全屏，否则结算面板会盖在鱼视角上；
    // 同步展示态以关闭变速快捷键（否则 VERDICT 中松开 Enter 会把
    // timeScale 写回 1，模拟在结算屏背后继续跑）。
    cameraController.exitView(true);
    syncProjectPresentation(true);
  }

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

    settleGameLevel(metrics);
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
    // 教学关不做任何自动重置。
    // 一开始按「鱼被吃光自动回到最初位置」实现过，但实际用下来是错的：
    // 试验刚出结果就被系统抢走重来，观察者根本没看够。安全试验的重跑
    // 时机应该由观察者自己决定 —— 面板上的「重新开始本场」就是那个开关。
    // 这里也顺带去掉了每帧一次的 metrics() 调用（它只为那个自动重置服务）。
    cameraController.update(realDt);
    renderer.render(scene, camera);
    cameraController.renderPreview();
    timeShortcuts.update(current.runtime.timeScale);
    radiusVisualizer.update(simulation, current);
    debug?.update(nowMs);
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
