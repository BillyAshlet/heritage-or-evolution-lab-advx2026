import * as THREE from 'three';
import { Pane } from 'tweakpane';
import { GRAVITY, TANK, TANK_PRESETS, notifyTankChange } from './world.js';
import { screenAngle } from './input.js';
import { BOID_PARAMS } from './boids.js';
import {
  CAPTURE_FX_PARAMS,
  ENERGY_PARAMS,
  TANK_VISUAL_PARAMS,
  PANIC_PARAMS,
  PREDATOR_PARAMS,
  SIM_PARAMS,
  TRAITS,
  TRAIT_MAPPING,
} from './evolution-model.js';
import { stageTuningPreset } from './preset-validation.js';
import m1StandingWave from '../presets/m1-standing-wave.json';

// The window into the machine: Tweakpane panel, always-on FPS counter,
// and visualizers. Every invisible force in this game eventually gets a
// drawable form here.
export function createDebug({
  world,
  scene,
  input,
  presentation,
  flock,
  predator,
}) {
  // Mounted inside #app (via panel-holder) so it rotates with the game.
  const pane = new Pane({
    title: '遗产 · 行为实验室',
    container: document.getElementById('panel-holder'),
  });

  const resets = [];
  const registry = []; // every param, so preset-apply can refresh/widen it

  // Every tunable registers through here and carries: live value,
  // explicit range, its default (the value at registration), a ↺ reset,
  // and — for numeric sliders — recursive zoom: ⊕ halves the range and
  // ⊖ doubles it, both re-centered on the current value. Workflow:
  // sweep the full range to find the neighborhood, ⊕ in for detail,
  // ⊕ again for precision; ↺ restores value AND range. Optional
  // opts.hardMin/hardMax clamp how far ⊖ can widen (e.g. beta < 0 is
  // meaningless). Hover the label for current range + default.
  function addParam(folder, obj, key, opts = {}) {
    const {
      hardMin = -Infinity,
      hardMax = Infinity,
      onChange = null,
      ...tpOpts
    } = opts;
    const def = obj[key];
    const isNumeric =
      typeof def === 'number' && tpOpts.min !== undefined && !tpOpts.options;
    const state = { min: tpOpts.min, max: tpOpts.max, step: tpOpts.step };
    let binding;

    const nice = (x) => parseFloat(x.toPrecision(6));
    const niceStep = (width) => 10 ** Math.floor(Math.log10(width / 100));

    function decorate() {
      const label = binding.element.querySelector('.tp-lblv_l');
      if (!label) return;
      const range = isNumeric ? `range ${state.min}–${state.max} · ` : '';
      label.title = `${range}default ${def}`;
      const addBtn = (text, title, onClick) => {
        const btn = document.createElement('span');
        btn.className = 'param-btn';
        btn.textContent = text;
        btn.title = title;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
        label.appendChild(btn);
      };
      addBtn('↺', `reset to ${def} (value + range)`, resetParam);
      if (isNumeric) {
        addBtn('+', 'zoom in: halve range, centered on value', () => zoom(0.5));
        addBtn('−', 'zoom out: double range, centered on value', () => zoom(2));
      }
    }

    // Tweakpane can't mutate a binding's min/max — rebuild it in place.
    function attachListeners() {
      if (onChange) binding.on('change', onChange);
    }

    function rebuild() {
      const index = folder.children.indexOf(binding);
      binding.dispose();
      binding = folder.addBinding(obj, key, {
        ...tpOpts,
        min: state.min,
        max: state.max,
        step: state.step,
        index,
      });
      attachListeners();
      decorate();
    }

    function zoom(factor) {
      const value = obj[key];
      const width = (state.max - state.min) * factor;
      const s = niceStep(width);
      const min = Math.max(value - width / 2, hardMin);
      const max = Math.min(value + width / 2, hardMax);
      state.min = nice(Math.floor(min / s) * s);
      state.max = nice(Math.ceil(max / s) * s);
      if (state.max <= state.min) state.max = nice(state.min + s * 100);
      state.step = s;
      rebuild();
    }

    function resetParam() {
      obj[key] = def;
      if (isNumeric) {
        state.min = tpOpts.min;
        state.max = tpOpts.max;
        state.step = tpOpts.step;
        rebuild();
      } else {
        binding.refresh();
      }
      // Direct assignment does not emit a Tweakpane change event. Keep
      // structural controls (fish/predator count, tank dimensions, camera
      // presets) in sync when their inline reset button is used.
      if (onChange) onChange({ value: obj[key], last: true });
    }

    // After a preset writes obj[key] directly: repaint the control, and
    // if the new value sits outside the slider's current window, widen
    // the window to include it (never silently clamp a loaded preset).
    function ensureVisible() {
      const v = obj[key];
      if (isNumeric && (v < state.min || v > state.max)) {
        state.min = nice(Math.min(state.min, v));
        state.max = nice(Math.max(state.max, v));
        state.step = niceStep(state.max - state.min);
        rebuild();
      } else {
        binding.refresh();
      }
    }

    binding = folder.addBinding(obj, key, tpOpts);
    attachListeners();
    decorate();
    resets.push(resetParam);
    registry.push({ ensureVisible });
    return binding;
  }

  // Gravity arrow at tank center: direction = where "down" currently is,
  // length = strength relative to standard gravity.
  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 0),
    0.35,
    '#8aa9c2',
    0.06,
    0.03
  );
  scene.add(arrow);

  const monitors = { gravity: '', screen: '' };
  const runtime = {
    alive: '—',
    panic: '—',
    energy: '—',
    predators: '—',
  };
  const derived = {
    form: '—',
    speed: '—',
    radii: '—',
    weights: '—',
    capacity: '—',
  };
  const liveBindings = [];

  const runtimeFolder = pane.addFolder({ title: 'live 实时', expanded: true });
  liveBindings.push(
    runtimeFolder.addBinding(runtime, 'alive', {
      readonly: true,
      label: 'alive',
    }),
    runtimeFolder.addBinding(runtime, 'panic', {
      readonly: true,
      label: 'panic',
    }),
    runtimeFolder.addBinding(runtime, 'energy', {
      readonly: true,
      label: 'energy',
    }),
    runtimeFolder.addBinding(runtime, 'predators', {
      readonly: true,
      label: 'predators / eaten',
    })
  );
  addParam(runtimeFolder, SIM_PARAMS, 'timeScale', {
    label: 'sim speed ×',
    min: 0,
    max: 4,
    step: 0.25,
    hardMin: 0,
    hardMax: 8,
  });
  runtimeFolder.addButton({ title: 'reset simulation ↺' }).on('click', () => {
    flock.reset();
    predator.reset();
  });

  const inputFolder = pane.addFolder({ title: 'input 感应', expanded: false });
  addParam(inputFolder, input, 'flipSign', { label: 'flip sign' });
  addParam(inputFolder, input, 'frameOffset', {
    label: 'frame',
    options: { auto: 'auto', '0°': 0, '180°': 180 },
  });
  // One Euro: tune minCutoff FIRST (hold still, lower until calm),
  // then beta (whip the phone, raise until no lag).
  addParam(inputFolder, input, 'minCutoff', {
    min: 0.05,
    max: 10, // ≥10 Hz at a ~60 Hz sensor is near-raw passthrough
    step: 0.05,
    hardMin: 0.01, // 0 would freeze the filter (infinite time constant)
    hardMax: 60,
  });
  addParam(inputFolder, input, 'beta', {
    min: 0,
    max: 1.5, // whip derivatives are ~tens; 1.5 ≈ instant tracking
    step: 0.01,
    hardMin: 0, // negative beta is meaningless
    hardMax: 10,
  });
  // Flip ergonomics: debounce (threshold must hold this long) and the
  // workshop lock for tuning sessions.
  addParam(inputFolder, input, 'flipDelay', {
    min: 0,
    max: 5, // field-tuned value sat at the old max (3) — headroom added
    step: 0.1,
    hardMin: 0,
    hardMax: 10,
  });
  addParam(inputFolder, input, 'holdFrame', { label: 'hold frame 🔒' });
  inputFolder.addBinding(monitors, 'gravity', {
    readonly: true,
    label: 'gravity',
  });
  inputFolder.addBinding(monitors, 'screen', {
    readonly: true,
    label: 'screen',
  });

  // --- Evolution layer: inherited traits bend (but never replace) the
  // ordinary Reynolds rules below. The readonly rows are the translation
  // table's live output, so a designer can see weights and radii move
  // together rather than guessing from the fish alone.
  const traitsFolder = pane.addFolder({
    title: 'traits 遗传参数',
    expanded: true,
  });
  addParam(traitsFolder, TRAITS, 'speed', {
    min: 0,
    max: 100,
    step: 1,
    hardMin: 0,
    hardMax: 100,
  });
  addParam(traitsFolder, TRAITS, 'size', {
    min: 0,
    max: 100,
    step: 1,
    hardMin: 0,
    hardMax: 100,
  });
  addParam(traitsFolder, TRAITS, 'stamina', {
    min: 0,
    max: 100,
    step: 1,
    hardMin: 0,
    hardMax: 100,
  });
  liveBindings.push(
    traitsFolder.addBinding(derived, 'form', {
      readonly: true,
      label: 'body / turn',
    }),
    traitsFolder.addBinding(derived, 'speed', {
      readonly: true,
      label: 'cruise / max',
    }),
    traitsFolder.addBinding(derived, 'radii', {
      readonly: true,
      label: 'radii S/A/C',
    }),
    traitsFolder.addBinding(derived, 'weights', {
      readonly: true,
      label: 'weights S/A/C',
    }),
    traitsFolder.addBinding(derived, 'capacity', {
      readonly: true,
      label: 'energy cap',
    })
  );

  const mappingFolder = traitsFolder.addFolder({
    title: 'translation 映射系数',
    expanded: false,
  });
  addParam(mappingFolder, TRAIT_MAPPING, 'speedOctaves', {
    min: 0,
    max: 2,
    step: 0.05,
    hardMin: 0,
    hardMax: 4,
  });
  addParam(mappingFolder, TRAIT_MAPPING, 'bodyScaleOctaves', {
    min: 0,
    max: 1.5,
    step: 0.05,
    hardMin: 0,
    hardMax: 3,
  });
  addParam(mappingFolder, TRAIT_MAPPING, 'sizeSpeedPenaltyOctaves', {
    label: 'size → speed −',
    min: 0,
    max: 1.5,
    step: 0.05,
    hardMin: 0,
    hardMax: 3,
  });
  addParam(mappingFolder, TRAIT_MAPPING, 'sizeForcePenaltyOctaves', {
    label: 'size → force −',
    min: 0,
    max: 1.5,
    step: 0.05,
    hardMin: 0,
    hardMax: 3,
  });
  addParam(mappingFolder, TRAIT_MAPPING, 'sizeTurnPenaltyOctaves', {
    label: 'size → turn −',
    min: 0,
    max: 1.5,
    step: 0.05,
    hardMin: 0,
    hardMax: 3,
  });
  for (const [key, label] of [
    ['separationRadiusOctaves', 'size → sep radius'],
    ['separationWeightOctaves', 'size → sep weight'],
    ['alignmentRadiusOctaves', 'size → align radius'],
    ['alignmentWeightOctaves', 'size → align weight'],
    ['cohesionRadiusOctaves', 'size → coh radius'],
    ['cohesionWeightOctaves', 'size → coh weight'],
  ]) {
    addParam(mappingFolder, TRAIT_MAPPING, key, {
      label,
      min: -1.5,
      max: 1.5,
      step: 0.05,
      hardMin: -4,
      hardMax: 4,
    });
  }
  addParam(mappingFolder, TRAIT_MAPPING, 'staminaCapacityOctaves', {
    label: 'stamina → capacity',
    min: 0,
    max: 2,
    step: 0.05,
    hardMin: 0,
    hardMax: 4,
  });

  const energyFolder = pane.addFolder({
    title: 'energy 当前耐力',
    expanded: false,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'capacityBase', {
    min: 0.1,
    max: 4,
    step: 0.05,
    hardMin: 0.01,
    hardMax: 20,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'drainPerSecond', {
    min: 0.001,
    max: 0.1,
    step: 0.001,
    hardMin: 0,
    hardMax: 1,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'basalShare', {
    min: 0,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 1,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'speedExponent', {
    min: 0.5,
    max: 6,
    step: 0.1,
    hardMin: 0,
    hardMax: 12,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'sizeExponent', {
    min: 0.5,
    max: 5,
    step: 0.1,
    hardMin: 0,
    hardMax: 10,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'tiredStart', {
    min: 0,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 1,
  });
  addParam(energyFolder, ENERGY_PARAMS, 'exhaustedAt', {
    min: 0,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 1,
  });
  for (const [key, label] of [
    ['minSpeedFactor', 'min speed'],
    ['minAlignmentFactor', 'min alignment'],
    ['minCohesionFactor', 'min cohesion'],
  ]) {
    addParam(energyFolder, ENERGY_PARAMS, key, {
      label,
      min: 0,
      max: 1,
      step: 0.01,
      hardMin: 0,
      hardMax: 1,
    });
  }
  energyFolder
    .addButton({ title: 'recharge school ↯' })
    .on('click', () => flock.recharge());
  energyFolder
    .addButton({ title: 'tire one fish ↓' })
    .on('click', () => flock.tireOne());

  const panicFolder = pane.addFolder({
    title: 'panic 惊慌传播',
    expanded: false,
  });
  addParam(panicFolder, PANIC_PARAMS, 'alertRadius', {
    min: 0.05,
    max: 1,
    step: 0.01,
    hardMin: 0.01,
    hardMax: 3,
  });
  addParam(panicFolder, PANIC_PARAMS, 'panicRadius', {
    min: 0.01,
    max: 0.5,
    step: 0.01,
    hardMin: 0,
    hardMax: 2,
  });
  for (const [key, label] of [
    ['directOn', 'direct on'],
    ['directOff', 'direct off'],
    ['signalThreshold', 'signal threshold'],
  ]) {
    addParam(panicFolder, PANIC_PARAMS, key, {
      label,
      min: 0,
      max: 1,
      step: 0.01,
      hardMin: 0,
      hardMax: 1,
    });
  }
  addParam(panicFolder, PANIC_PARAMS, 'signalRadius', {
    min: 0.02,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 3,
  });
  for (const [key, label] of [
    ['signalDecayTime', 'signal decay s'],
    ['senseTime', 'sense time s'],
    ['holdTime', 'hold time s'],
    ['refractoryTime', 'refractory s'],
    ['riseTime', 'rise time s'],
    ['fallTime', 'fall time s'],
  ]) {
    addParam(panicFolder, PANIC_PARAMS, key, {
      label,
      min: 0.01,
      max: 3,
      step: 0.01,
      hardMin: 0,
      hardMax: 10,
    });
  }
  for (const [key, label, max] of [
    ['alignmentSourceBoost', 'source align ×', 20],
    ['alignmentReceiverBoost', 'receiver align +', 8],
    ['alignmentReceiverMax', 'receiver max ×', 8],
    ['emergencyAlignmentWeight', 'emergency align', 12],
    ['panicTurnBoost', 'panic turn +', 4],
    ['escapeWeight', 'escape weight', 8],
  ]) {
    addParam(panicFolder, PANIC_PARAMS, key, {
      label,
      min: 0,
      max,
      step: 0.1,
      hardMin: 0,
      hardMax: 40,
    });
  }
  addParam(panicFolder, PANIC_PARAMS, 'cohesionDrop', {
    min: 0,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 1,
  });
  addParam(panicFolder, PANIC_PARAMS, 'speedBoost', {
    min: 0,
    max: 2,
    step: 0.05,
    hardMin: 0,
    hardMax: 5,
  });
  addParam(panicFolder, PANIC_PARAMS, 'predictionTime', {
    min: 0,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 3,
  });
  panicFolder
    .addButton({ title: 'startle one fish 〰' })
    .on('click', () => flock.startleOne());

  const predatorFolder = pane.addFolder({
    title: 'predator 捕食者',
    expanded: false,
  });
  const predatorParams = predator.params ?? PREDATOR_PARAMS;
  addParam(predatorFolder, predatorParams, 'enabled');
  addParam(predatorFolder, predatorParams, 'captureEnabled', {
    label: 'capture enabled',
  });
  addParam(predatorFolder, predatorParams, 'count', {
    label: 'predator count',
    min: 1,
    max: 15,
    step: 1,
    hardMin: 1,
    hardMax: 64,
    onChange: (ev) => {
      if (ev.last) predator.setCount(ev.value);
    },
  });
  for (const [key, label, min, max, step] of [
    ['cruiseSpeed', 'cruise speed', 0.02, 1, 0.01],
    ['maxSpeed', 'max speed', 0.05, 1.5, 0.01],
    ['maxForce', 'max force', 0.05, 10, 0.05],
    ['turnSpeed', 'turn rad/s', 0.1, 8, 0.1],
    ['bodyScale', 'body scale', 0.5, 4, 0.05],
    ['schoolSenseRadius', 'school sense r', 0.05, 3, 0.05],
    ['schoolAttractionWeight', 'school attraction', 0, 6, 0.05],
    ['targetPursuitWeight', 'target pursuit', 0, 6, 0.05],
    ['targetLockTime', 'target lock s', 0, 3, 0.05],
    ['alarmPredatorRadius', 'alarm radius', 0, 0.8, 0.01],
    ['alarmPredatorWeight', 'alarm weight', 0, 20, 0.25],
    ['detectionLength', 'detection length', 0.02, 1.5, 0.01],
    ['avoidanceWeight', 'avoidance weight', 0, 8, 0.1],
    ['predatorSeparationRadius', 'predator sep r', 0, 0.8, 0.01],
    ['predatorSeparationWeight', 'predator sep w', 0, 6, 0.05],
    ['captureRadius', 'capture radius', 0.005, 0.25, 0.005],
    ['captureCooldown', 'capture cooldown', 0, 4, 0.05],
    ['targetLeadTime', 'target lead s', 0, 1, 0.01],
  ]) {
    addParam(predatorFolder, predatorParams, key, {
      label,
      min,
      max,
      step,
      hardMin: 0,
      hardMax: max * 4,
    });
  }
  predatorFolder
    .addButton({ title: 'reset predator ↺' })
    .on('click', () => predator.reset());

  const captureFxFolder = pane.addFolder({
    title: 'capture fx 吞食动效',
    expanded: false,
  });
  addParam(captureFxFolder, CAPTURE_FX_PARAMS, 'enabled');
  addParam(captureFxFolder, CAPTURE_FX_PARAMS, 'particleCount', {
    label: 'cube count',
    min: 1,
    max: 8,
    step: 1,
    hardMin: 1,
    hardMax: 12,
  });
  addParam(captureFxFolder, CAPTURE_FX_PARAMS, 'cubeColor', {
    label: 'cube color',
  });
  addParam(captureFxFolder, CAPTURE_FX_PARAMS, 'biteGlowEnabled', {
    label: 'bite glow',
  });
  for (const [key, label, min, max, step] of [
    ['density', 'cube density', 0.1, 4, 0.05],
    ['spawnRadius', 'spawn radius', 0.005, 0.2, 0.005],
    ['spawnInterval', 'sequence interval s', 0, 0.3, 0.005],
    ['lifetime', 'linear decay s', 0.05, 1.5, 0.01],
    ['cubeSize', 'cube size', 0.003, 0.06, 0.001],
    ['upwardSpeed', 'up speed', 0, 1, 0.01],
    ['radialSpeed', 'radial speed', 0, 1, 0.01],
    ['reverseVelocityFactor', 'reverse velocity', 0, 2, 0.01],
    ['biteFlashDuration', 'bite flash s', 0.05, 1, 0.01],
    ['biteFlashScaleBoost', 'bite scale boost', 0, 1, 0.01],
    ['biteFlashSaturationBoost', 'bite sat boost', 0, 1, 0.01],
    ['biteFlashDarken', 'bite darken', 0, 0.5, 0.01],
    ['biteGlowRadius', 'glow radius', 0.05, 1, 0.01],
    ['biteGlowDuration', 'glow duration', 0.05, 1.5, 0.01],
    ['biteGlowStrength', 'glow strength', 0, 1.5, 0.01],
    ['biteGlowFalloff', 'glow falloff k', 0.2, 8, 0.1],
  ]) {
    addParam(captureFxFolder, CAPTURE_FX_PARAMS, key, {
      label,
      min,
      max,
      step,
      hardMin: 0,
      hardMax: max * 4,
    });
  }

  const cameraFolder = pane.addFolder({
    title: 'camera 视角',
    expanded: false,
  });
  const cameraSettings = presentation.cameraSettings;
  addParam(cameraFolder, cameraSettings, 'fov', {
    min: 25,
    max: 80,
    step: 1,
    hardMin: 20,
    hardMax: 100,
  });
  addParam(cameraFolder, cameraSettings, 'orbitEnabled', {
    label: 'drag orbit',
  });
  addParam(cameraFolder, cameraSettings, 'autoRotate', {
    label: 'auto rotate',
  });
  addParam(cameraFolder, cameraSettings, 'autoRotateSpeed', {
    label: 'rotate speed',
    min: -4,
    max: 4,
    step: 0.05,
    hardMin: -12,
    hardMax: 12,
  });
  addParam(cameraFolder, cameraSettings, 'damping', {
    min: 0.01,
    max: 0.25,
    step: 0.01,
    hardMin: 0,
    hardMax: 1,
  });
  const cameraUI = { view: 'home' };
  addParam(cameraFolder, cameraUI, 'view', {
    label: 'preset / key',
    options: {
      '0 home': 'home',
      '1 front': 'front',
      '3 side': 'side',
      '7 top': 'top',
    },
    onChange: (ev) => presentation.setViewPreset(ev.value),
  });

  // Tank dims 水槽 — platform-selected at boot (scaling model A: only
  // the tank scales; creature-scale params stay put). Live-tunable for
  // the multi-gyre space experiment; shell + camera follow on release.
  const tankFolder = pane.addFolder({ title: 'tank 水槽', expanded: false });
  const onTankSlider = (ev) => {
    if (ev.last) notifyTankChange();
  };
  addParam(tankFolder, TANK, 'width', {
    min: 0.4,
    max: 4,
    step: 0.05,
    hardMin: 0.2,
    hardMax: 10,
    onChange: onTankSlider,
  });
  addParam(tankFolder, TANK, 'height', {
    min: 0.3,
    max: 3,
    step: 0.05,
    hardMin: 0.2,
    hardMax: 10,
    onChange: onTankSlider,
  });
  addParam(tankFolder, TANK, 'depth', {
    min: 0.2,
    max: 3,
    step: 0.05,
    hardMin: 0.1,
    hardMax: 10,
    onChange: onTankSlider,
  });
  const applyTankPreset = (dims) => {
    Object.assign(TANK, dims);
    for (const r of registry) r.ensureVisible();
    notifyTankChange();
  };
  tankFolder
    .addButton({ title: 'mobile dims 1.2×0.8×0.5' })
    .on('click', () => applyTankPreset(TANK_PRESETS.mobile));
  tankFolder
    .addButton({ title: 'desktop dims 2.0×1.2×0.8' })
    .on('click', () => applyTankPreset(TANK_PRESETS.desktop));

  // Face grid is a depth cue only. Keep it next to the tank dims so the
  // operator can judge camera angle without hunting through visualizers.
  addParam(tankFolder, TANK_VISUAL_PARAMS, 'gridEnabled', {
    label: 'depth grid',
  });
  addParam(tankFolder, TANK_VISUAL_PARAMS, 'gridOpacity', {
    label: 'grid opacity',
    min: 0,
    max: 1,
    step: 0.01,
    hardMin: 0,
    hardMax: 1,
  });
  addParam(tankFolder, TANK_VISUAL_PARAMS, 'gridDivisions', {
    label: 'grid divisions',
    min: 1,
    max: 12,
    step: 1,
    hardMin: 1,
    hardMax: 24,
  });

  const boidsFolder = pane.addFolder({ title: 'boids 鱼群', expanded: false });
  addParam(boidsFolder, BOID_PARAMS, 'fishCount', {
    min: 1,
    max: 3000, // the phone is the real ceiling — push until fps speaks
    step: 1,
    hardMin: 1,
    hardMax: 10000,
    onChange: (ev) => {
      if (ev.last) flock.setCount(ev.value); // rebuild once, on release
    },
  });
  addParam(boidsFolder, BOID_PARAMS, 'cruiseSpeed', { min: 0.02, max: 0.6, step: 0.01, hardMin: 0.01 });
  addParam(boidsFolder, BOID_PARAMS, 'maxSpeed', { min: 0.05, max: 0.8, step: 0.01, hardMin: 0.01 });
  addParam(boidsFolder, BOID_PARAMS, 'maxForce', { min: 0.05, max: 8, step: 0.05, hardMin: 0.01 });
  addParam(boidsFolder, BOID_PARAMS, 'separationRadius', { min: 0.01, max: 0.3, step: 0.005, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'separationWeight', { min: 0, max: 5, step: 0.05, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'sepFalloff', {
    label: 'sepFalloff',
    options: { inverse: 'inverse', linear: 'linear', 'inverse-log': 'invlog' },
  });
  addParam(boidsFolder, BOID_PARAMS, 'alignmentRadius', { min: 0.02, max: 0.6, step: 0.01, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'alignmentWeight', { min: 0, max: 5, step: 0.05, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'cohesionRadius', { min: 0.05, max: 0.8, step: 0.01, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'cohesionWeight', { min: 0, max: 5, step: 0.05, hardMin: 0 });
  // Forward vision cone (degrees). 360 = omnidirectional (off). Gates
  // alignment + cohesion only — separation is lateral-line, stays omni.
  addParam(boidsFolder, BOID_PARAMS, 'perceptionFOV', { min: 60, max: 360, step: 5, hardMin: 10, hardMax: 360 });
  // max 2.5 > tank diagonal: deliberately reachable "accidental
  // containment" territory (the old misdiagnosis turned aesthetic)
  addParam(boidsFolder, BOID_PARAMS, 'detectionLength', { min: 0.02, max: 2.5, step: 0.01, hardMin: 0.01, hardMax: 10 });
  addParam(boidsFolder, BOID_PARAMS, 'avoidanceWeight', { min: 0, max: 8, step: 0.1, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'centeringWeight', { min: 0, max: 2, step: 0.01, hardMin: 0 });
  addParam(boidsFolder, BOID_PARAMS, 'angleStep', { min: 5, max: 45, step: 1, hardMin: 1, hardMax: 90 });
  addParam(boidsFolder, BOID_PARAMS, 'maxPitch', { min: 0, max: 80, step: 1, hardMin: 0, hardMax: 89 });
  addParam(boidsFolder, BOID_PARAMS, 'turnSpeed', { min: 0.2, max: 10, step: 0.1, hardMin: 0.05 });

  // --- Presets 预设: the tuning workflow's memory ---
  // Desktop tunes (precise sliders, rapid A/B), the phone feels (real
  // gravity) — the bridge is one compact JSON line: copy here, paste
  // there, apply. localStorage is the per-browser scratchpad of
  // works-in-progress; presets/*.json in the repo (★ built-ins) is the
  // committed archive of locked aesthetic decisions. Presets cover the
  // complete behaviour model; input tuning (One Euro etc.) remains
  // per-device by design.
  const LS_KEY = 'boid-aquarium.presets.v1';
  const builtins = {
    [m1StandingWave.name]: { boids: m1StandingWave.params },
  };
  const readStore = () => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch {
      return {};
    }
  };
  const writeStore = (s) => localStorage.setItem(LS_KEY, JSON.stringify(s));

  const presetUI = { name: '', saved: '★' + m1StandingWave.name, paste: '', status: '' };
  const presetFolder = pane.addFolder({ title: 'presets 预设', expanded: false });
  presetFolder.addBinding(presetUI, 'name', { label: 'name' });

  // All behaviour layers share one versioned snapshot. Existing browser
  // presets that contain a bare BOID_PARAMS object remain loadable.
  const tuningTargets = {
    boids: BOID_PARAMS,
    traits: TRAITS,
    mapping: TRAIT_MAPPING,
    energy: ENERGY_PARAMS,
    panic: PANIC_PARAMS,
    predator: predatorParams,
    captureFx: CAPTURE_FX_PARAMS,
  };
  const tuningDefaults = Object.fromEntries(
    Object.entries(tuningTargets).map(([name, target]) => [name, { ...target }])
  );
  const tuningSnapshot = () =>
    Object.fromEntries(
      Object.entries(tuningTargets).map(([name, target]) => [name, { ...target }])
    );

  function applyParams(params, sourceLabel, tunedTank) {
    const transaction = stageTuningPreset(
      params,
      tuningTargets,
      tuningDefaults
    );
    if (!transaction.ok) {
      presetUI.status = `${sourceLabel}: rejected · ${transaction.error}`;
      return false;
    }

    for (const [groupName, values] of Object.entries(transaction.staged)) {
      Object.assign(tuningTargets[groupName], values);
    }

    if (Object.keys(transaction.staged).length > 0) {
      // setCount both rebuilds the school and normalizes fishCount; the
      // slider's own change handler only fires on user input, not here.
      flock.setCount(BOID_PARAMS.fishCount);
      predator.reset();
      for (const r of registry) r.ensureVisible();
    }
    // The tank key is informational, never applied: a preset describes
    // the school; the tank is the venue. But warn when they differ —
    // radius params don't transfer verbatim across tank scales.
    const mismatch =
      tunedTank &&
      (tunedTank.width !== TANK.width ||
        tunedTank.height !== TANK.height ||
        tunedTank.depth !== TANK.depth)
        ? ` · tuned in ${tunedTank.width}×${tunedTank.height}×${tunedTank.depth}`
        : '';
    presetUI.status =
      `${sourceLabel}: ${transaction.applied} params` +
      (transaction.skipped.length
        ? ` · ignored ${transaction.skipped.join(', ')}`
        : '') +
      mismatch;
    return true;
  }

  let savedList = null;
  function rebuildList() {
    const options = [
      ...Object.keys(builtins).map((k) => ({ text: `★ ${k}`, value: '★' + k })),
      ...Object.keys(readStore()).map((k) => ({ text: k, value: k })),
    ];
    if (!options.some((o) => o.value === presetUI.saved)) presetUI.saved = options[0].value;
    const index = savedList ? presetFolder.children.indexOf(savedList) : undefined;
    if (savedList) savedList.dispose();
    savedList = presetFolder.addBlade({
      view: 'list',
      label: 'saved',
      options,
      value: presetUI.saved,
      index,
    });
    savedList.on('change', (ev) => {
      presetUI.saved = ev.value;
    });
  }

  presetFolder.addButton({ title: 'save to browser 💾' }).on('click', () => {
    const name = presetUI.name.trim();
    if (!name) {
      presetUI.status = 'name it first';
      return;
    }
    if (builtins[name]) {
      presetUI.status = '★ names are reserved';
      return;
    }
    const store = readStore();
    store[name] = tuningSnapshot();
    writeStore(store);
    presetUI.saved = name;
    rebuildList();
    presetUI.status = `saved "${name}"`;
  });

  rebuildList();

  presetFolder.addButton({ title: 'load ▶' }).on('click', () => {
    const params = presetUI.saved.startsWith('★')
      ? builtins[presetUI.saved.slice(1)]
      : readStore()[presetUI.saved];
    if (params) applyParams(params, presetUI.saved);
    else presetUI.status = 'preset not found';
  });

  presetFolder.addButton({ title: 'delete 🗑' }).on('click', () => {
    if (presetUI.saved.startsWith('★')) {
      presetUI.status = '★ built-ins live in the repo, not here';
      return;
    }
    const store = readStore();
    delete store[presetUI.saved];
    writeStore(store);
    rebuildList();
    presetUI.status = 'deleted';
  });

  presetFolder.addButton({ title: 'copy to clipboard 📋' }).on('click', async () => {
    const json = JSON.stringify({
      _type: 'boid-preset',
      name: presetUI.name.trim() || 'untitled',
      date: new Date().toISOString().slice(0, 10),
      // Additive key (2026-07-17): the tank this preset was tuned in.
      // Radius params don't transfer verbatim across tank scales —
      // that's inherent to scaling model A, not a bug.
      tank: { ...TANK },
      params: tuningSnapshot(),
    });
    presetUI.paste = json; // always mirrored — manual-copy fallback
    pasteBinding.refresh();
    try {
      await navigator.clipboard.writeText(json);
      presetUI.status = `copied (${json.length} chars)`;
    } catch {
      presetUI.status = 'clipboard blocked — copy from paste field';
    }
  });

  const pasteBinding = presetFolder.addBinding(presetUI, 'paste', { label: 'paste' });
  presetFolder.addButton({ title: 'apply pasted ▶' }).on('click', () => {
    try {
      const obj = JSON.parse(presetUI.paste);
      applyParams(obj.params ?? obj, obj.name || 'pasted', obj.tank); // bare param objects OK
    } catch {
      presetUI.status = 'not valid JSON';
    }
  });
  presetFolder.addBinding(presetUI, 'status', { readonly: true, label: '·' });

  const view = {
    gravityArrow: true,
    perceptionRadii: false,
    steeringArrows: false,
    visionCone: false,
  };
  const viewFolder = pane.addFolder({ title: 'visualizers 可视化' });
  addParam(viewFolder, view, 'gravityArrow', { label: 'gravity arrow' });
  addParam(viewFolder, view, 'perceptionRadii', { label: 'perception radii' });
  addParam(viewFolder, view, 'steeringArrows', { label: 'steering arrows' });
  addParam(viewFolder, view, 'visionCone', { label: 'vision cone' });

  // Perception radii: three wireframe spheres around fish[0]. Numbers
  // are meaningless; wrapped around a swimming fish they're legible.
  const radiiGroup = new THREE.Group();
  const radiusSpheres = [0.14, 0.24, 0.34].map((opacity) => {
    const s = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({
        color: '#8aa9c2',
        wireframe: true,
        transparent: true,
        opacity,
      })
    );
    radiiGroup.add(s);
    return s;
  });
  radiiGroup.visible = false;
  scene.add(radiiGroup);

  // Steering arrows: one LineSegments buffer, two verts per fish.
  const FORCE_SCALE = 0.15;
  const maxFish = 10000; // must track the fishCount hardMax
  const linePositions = new Float32Array(maxFish * 6);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  const forceLines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({ color: '#8aa9c2' })
  );
  forceLines.frustumCulled = false;
  forceLines.visible = false;
  scene.add(forceLines);

  // Vision cone: a ray-fan on the sample fish marking the FOV boundary.
  // A fan stays honest at ANY angle (a solid cone lies above 180°): at
  // 90° it's a tight forward cone; at 270° it folds back around the
  // blind spot. Scaled to the larger vision radius (ali/coh — the rules
  // FOV gates). Radii show HOW FAR; the cone shows WHICH DIRECTION.
  const FOV_RAYS = 24;
  const fovPositions = new Float32Array(FOV_RAYS * 4 * 3); // rays + ring
  const fovGeo = new THREE.BufferGeometry();
  fovGeo.setAttribute('position', new THREE.BufferAttribute(fovPositions, 3));
  const fovCone = new THREE.LineSegments(
    fovGeo,
    new THREE.LineBasicMaterial({ color: '#8aa9c2', transparent: true, opacity: 0.62 })
  );
  fovCone.frustumCulled = false;
  fovCone.visible = false;
  scene.add(fovCone);
  let fovBuiltFor = -1;
  function rebuildFovGeometry(fovDeg) {
    fovBuiltFor = fovDeg;
    const theta = THREE.MathUtils.degToRad(fovDeg / 2);
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    for (let k = 0; k < FOV_RAYS; k++) {
      const phi = (k / FOV_RAYS) * Math.PI * 2;
      const x = st * Math.cos(phi);
      const y = st * Math.sin(phi);
      const nx = st * Math.cos(((k + 1) / FOV_RAYS) * Math.PI * 2);
      const ny = st * Math.sin(((k + 1) / FOV_RAYS) * Math.PI * 2);
      let o = k * 12;
      // ray: origin → boundary point
      fovPositions[o] = 0; fovPositions[o + 1] = 0; fovPositions[o + 2] = 0;
      fovPositions[o + 3] = x; fovPositions[o + 4] = y; fovPositions[o + 5] = ct;
      // ring segment: boundary point → next boundary point
      fovPositions[o + 6] = x; fovPositions[o + 7] = y; fovPositions[o + 8] = ct;
      fovPositions[o + 9] = nx; fovPositions[o + 10] = ny; fovPositions[o + 11] = ct;
    }
    fovGeo.attributes.position.needsUpdate = true;
  }
  const _fovM = new THREE.Matrix4();
  const _fovF = new THREE.Vector3();
  const _fovR = new THREE.Vector3();
  const _fovU = new THREE.Vector3();
  const _worldUp = new THREE.Vector3(0, 1, 0);

  pane
    .addButton({ title: 'reset all ↺' })
    .on('click', () => {
      resets.forEach((r) => r());
      notifyTankChange();
      flock.setCount(BOID_PARAMS.fishCount);
      predator.reset();
      presentation.setViewPreset('home');
    });

  // Right-side live list: school + predator cards stay visible even when
  // the tuning pane is collapsed. Feel bugs and perf bugs look identical
  // on a phone; the FPS line still tells them apart.
  const schoolHud = document.getElementById('school-hud');
  const predatorHud = document.getElementById('predator-hud');
  let frames = 0;
  let windowStart = performance.now();

  function sampleFishIndex() {
    if (flock.positions.length === 0) return -1;
    if (!flock.alive) return 0;
    for (let i = 0; i < flock.alive.length; i++) {
      if (flock.alive[i]) return i;
    }
    return -1;
  }

  function fallbackAliveCount() {
    if (!flock.alive) return flock.positions.length;
    let count = 0;
    for (let i = 0; i < flock.alive.length; i++) count += flock.alive[i] ? 1 : 0;
    return count;
  }

  function fallbackPanicCount() {
    if (!flock.panic) return 0;
    let count = 0;
    for (let i = 0; i < flock.panic.length; i++) {
      if ((!flock.alive || flock.alive[i]) && flock.panic[i] > 0.35) count++;
    }
    return count;
  }

  function fallbackEnergyRatio() {
    if (!flock.energy?.length) return 1;
    const capacity = Math.max(flock.derived?.energyCapacity ?? 1, 1e-6);
    let total = 0;
    let count = 0;
    for (let i = 0; i < flock.energy.length; i++) {
      if (!flock.alive || flock.alive[i]) {
        total += flock.energy[i] / capacity;
        count++;
      }
    }
    return count ? total / count : 0;
  }


  function fallbackAverageSpeed() {
    if (!flock.velocities?.length) return 0;
    let total = 0;
    let count = 0;
    for (let i = 0; i < flock.velocities.length; i++) {
      if (flock.alive && !flock.alive[i]) continue;
      total += flock.velocities[i].length();
      count++;
    }
    return count ? total / count : 0;
  }



  function formatHudCard(title, rows) {
    const lines = [title];
    for (const [label, value] of rows) {
      const pad = Math.max(1, 14 - String(label).length);
      lines.push(`${label}${' '.repeat(pad)}${value}`);
    }
    return lines.join('\n');
  }

  function predatorHudStats() {
    const agents = predator.agents ?? [];
    const enabled = Boolean(predator.params?.enabled) && agents.length > 0;
    let striking = 0;
    let locked = 0;
    let cooling = 0;
    let flashing = 0;
    let speedSum = 0;
    let captureSum = 0;
    for (const agent of agents) {
      if (agent.alarmActive) striking++;
      if (agent.targetIndex >= 0) locked++;
      if ((agent.captureCooldown ?? 0) > 0) cooling++;
      if (
        Number.isFinite(agent.biteFlashAge) &&
        agent.biteFlashAge <
          (predator.captureVfx?.params?.biteFlashDuration ?? 0.2)
      ) {
        flashing++;
      }
      speedSum += agent.velocity?.length?.() ?? 0;
      captureSum += agent.captures ?? 0;
    }
    return {
      enabled,
      count: agents.length,
      striking,
      locked,
      cooling,
      flashing,
      avgSpeed: agents.length ? speedSum / agents.length : 0,
      captures: predator.captures ?? captureSum,
    };
  }

  function update(nowMs) {
    const g = world.gravity;
    const phenotype = flock.derived ?? BOID_PARAMS;
    const sample = sampleFishIndex();
    arrow.visible = view.gravityArrow;

    radiiGroup.visible = view.perceptionRadii && sample >= 0;
    if (radiiGroup.visible) {
      radiiGroup.position.copy(flock.positions[sample]);
      radiusSpheres[0].scale.setScalar(
        Math.max(phenotype.separationRadius, 1e-4)
      );
      radiusSpheres[1].scale.setScalar(
        Math.max(phenotype.alignmentRadius, 1e-4)
      );
      radiusSpheres[2].scale.setScalar(
        Math.max(phenotype.cohesionRadius, 1e-4)
      );
    }

    fovCone.visible = view.visionCone && sample >= 0;
    if (fovCone.visible) {
      if (BOID_PARAMS.perceptionFOV !== fovBuiltFor) {
        rebuildFovGeometry(BOID_PARAMS.perceptionFOV);
      }
      fovCone.position.copy(flock.positions[sample]);
      // Same roll-locked basis as the fish mesh: local +Z = heading.
      _fovF.copy(flock.velocities[sample]).normalize();
      _fovR.crossVectors(_worldUp, _fovF);
      if (_fovR.lengthSq() < 1e-10) _fovR.set(1, 0, 0);
      _fovR.normalize();
      _fovU.crossVectors(_fovF, _fovR).normalize();
      _fovM.makeBasis(_fovR, _fovU, _fovF);
      fovCone.quaternion.setFromRotationMatrix(_fovM);
      fovCone.scale.setScalar(
        Math.max(phenotype.alignmentRadius, phenotype.cohesionRadius, 1e-4)
      );
    }

    forceLines.visible = view.steeringArrows;
    if (view.steeringArrows) {
      const n = Math.min(flock.positions.length, maxFish);
      for (let i = 0; i < n; i++) {
        const p = flock.positions[i];
        const f = flock.forces[i];
        linePositions[i * 6] = p.x;
        linePositions[i * 6 + 1] = p.y;
        linePositions[i * 6 + 2] = p.z;
        linePositions[i * 6 + 3] = p.x + f.x * FORCE_SCALE;
        linePositions[i * 6 + 4] = p.y + f.y * FORCE_SCALE;
        linePositions[i * 6 + 5] = p.z + f.z * FORCE_SCALE;
      }
      lineGeo.setDrawRange(0, n * 2);
      lineGeo.attributes.position.needsUpdate = true;
    }
    if (g.lengthSq() > 1e-6) arrow.setDirection(g.clone().normalize());
    arrow.setLength(0.35 * (g.length() / GRAVITY), 0.06, 0.03);
    monitors.gravity = `x ${g.x.toFixed(2)}  y ${g.y.toFixed(2)}  z ${g.z.toFixed(2)}`;
    monitors.screen = `${screenAngle()}°  ${
      window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
    }  F${input._F}  rot ${presentation.rotationDeg()}°  off ${input.resolveOffset()}°${
      input.holdFrame ? '  🔒' : ''
    }`;

    frames++;
    if (nowMs - windowStart > 500) {
      const fps = Math.round((frames * 1000) / (nowMs - windowStart));
      let measured = {};
      try {
        measured = flock.metrics?.() ?? {};
      } catch {
        // The panel is diagnostic: a metrics bug must not stop rendering.
      }
      const total =
        measured.initial ??
        measured.initialCount ??
        flock.initialCount ??
        flock.positions.length;
      const alive =
        measured.alive ??
        measured.aliveCount ??
        measured.survivors ??
        fallbackAliveCount();
      const panicked =
        measured.panicked ??
        measured.panic ??
        measured.panicCount ??
        fallbackPanicCount();
      const energyRatio =
        measured.averageEnergyRatio ??
        measured.energyRatio ??
        measured.avgEnergyRatio ??
        fallbackEnergyRatio();
      const stamina = THREE.MathUtils.clamp(energyRatio, 0, 1);
      const avgSpeed =
        measured.averageSpeed ??
        measured.avgSpeed ??
        fallbackAverageSpeed();
      const pct = Math.round(stamina * 100);

      runtime.alive = `${alive} / ${total}`;
      runtime.panic = `${panicked}`;
      runtime.energy = `${pct}%`;
      runtime.predators =
        `${predator.agents?.length ?? (predator.params?.enabled ? 1 : 0)}` +
        ` / ${predator.captures ?? 0}`;

      const d = flock.derived ?? {};
      const f = (value, digits = 2) =>
        Number.isFinite(value) ? value.toFixed(digits) : '—';
      derived.form = `×${f(d.bodyScale)} / ${f(d.turnSpeed)} rad`;
      derived.speed = `${f(d.cruiseSpeed)} / ${f(d.maxSpeed)}`;
      derived.radii = `${f(d.separationRadius)} / ${f(
        d.alignmentRadius
      )} / ${f(d.cohesionRadius)}`;
      derived.weights = `${f(d.separationWeight)} / ${f(
        d.alignmentWeight
      )} / ${f(d.cohesionWeight)}`;
      derived.capacity = f(d.energyCapacity);
      for (const binding of liveBindings) binding.refresh();

      const deaths = measured.deaths ?? flock.deaths ?? {};
      const eaten = deaths.eaten ?? 0;
      const starved = deaths.starved ?? 0;
      const survivalPct = total > 0 ? Math.round((alive / total) * 100) : 0;
      const schoolMode =
        panicked > 0 ? 'PANIC' : alive <= 0 ? 'GONE' : stamina < 0.35 ? 'TIRED' : 'SWIM';

      if (schoolHud) {
        schoolHud.textContent = formatHudCard('鱼群 school', [
          ['fps', `${fps}`],
          ['mode', schoolMode],
          ['alive', `${alive} / ${total}`],
          ['survive', `${survivalPct}%`],
          ['panic', `${panicked}`],
          ['stamina', `${pct}%`],
          ['speed', `${f(avgSpeed, 3)} m/s`],
          ['cruise', `${f(d.cruiseSpeed)} / ${f(d.maxSpeed)}`],
          ['body', `×${f(d.bodyScale)}`],
          ['eaten', `${eaten}`],
          ['starved', `${starved}`],
          ['tilt', input.active ? 'ON' : 'OFF'],
        ]);
      }

      if (predatorHud) {
        const p = predatorHudStats();
        const mode = !p.enabled
          ? 'OFF'
          : p.striking > 0
            ? 'STRIKE'
            : p.locked > 0
              ? 'HUNT'
              : 'PATROL';
        predatorHud.textContent = formatHudCard('猎食者 predator', [
          ['mode', mode],
          ['count', `${p.count}`],
          ['strike', `${p.striking}`],
          ['locked', `${p.locked}`],
          ['cooldown', `${p.cooling}`],
          ['flash', `${p.flashing}`],
          ['eaten', `${p.captures}`],
          ['speed', `${f(p.avgSpeed, 3)} m/s`],
        ]);
      }

      frames = 0;
      windowStart = nowMs;
    }
  }

  return { update, pane };
}
