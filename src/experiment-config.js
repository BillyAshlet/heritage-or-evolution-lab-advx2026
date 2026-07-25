const TAU = Math.PI * 2;

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function school({
  id,
  name,
  color,
  count,
  size,
  targetNeighbors,
  centerX,
}) {
  return {
    id,
    name,
    color,
    count,
    size,
    targetNeighbors,
    cruiseSpeed: 0.23,
    maxSpeed: 0.46,
    turnSpeed: 2.8,
    grazeRate: id === 'small' ? 1 : id === 'medium' ? 0.25 : 0,
    separationWeight: 0.55,
    alignmentWeight: 0.45,
    cohesionWeight: 0.4,
    spawnRegion: {
      centerX,
      centerY: 0,
      centerZ: 0,
      radius: id === 'large' ? 0.22 : 0.3,
    },
    initialHeading:
      id === 'large'
        ? { x: 1, y: 0, z: 0 }
        : { x: 0, y: 0, z: 1 },
  };
}

export const DEFAULT_EXPERIMENT_CONFIG = Object.freeze({
  runtime: {
    project: 'aquarium',
    mode: 'steady',
    populationPreset: 'full',
    seed: 1001,
    timeScale: 1,
    fixedDt: 1 / 60,
    initialSpawnAttempts: 16,
  },
  schools: [
    school({
      id: 'small',
      name: '小群',
      color: '#4f9fcf',
      count: 400,
      size: 1,
      targetNeighbors: 8,
      centerX: 0.32,
    }),
    school({
      id: 'medium',
      name: '中群',
      color: '#e5a441',
      count: 200,
      size: 1.5,
      targetNeighbors: 8,
      centerX: -0.05,
    }),
    school({
      id: 'large',
      name: '大群',
      color: '#c95252',
      count: 40,
      size: 2.25,
      targetNeighbors: 2,
      centerX: -0.38,
    }),
  ],
  tank: {
    preset: 'aquarium',
    width: 6,
    height: 3.6,
    depth: 2.4,
    wallMargin: 0.035,
    edgeSoftness: 0.16,
  },
  perception: {
    minNeighborRadiusFactor: 3,
    alignmentRadiusFactor: 0.35,
    separationRadiusFactor: 0.4,
    detectionLengthFactor: 0.45,
    crossSeparationScale: 0.15,
  },
  relations: {
    k: 1.35,
    hysteresis: 0.1,
    pursuitWeight: 1.05,
    burstRadiusFactor: 0.75,
    burstWeight: 10,
    evadeWeight: 1.3,
    evadeLateralWeight: 0.32,
    directThreatPanic: 0.85,
    panicRiseRate: 4.5,
    panicDecayRate: 1.35,
  },
  locomotion: {
    burstFactor: 1.35,
    panicSpeedFactor: 1.15,
    maxForce: 5.2,
    interceptLookAhead: 1.3,
    boundaryWeight: 1.8,
    avoidanceWeight: 2.2,
    panicAvoidanceSuppression: 0.72,
    avoidanceInertia: 0.72,
    wanderWeight: 0.08,
  },
  traits: {
    enabled: false,
    sizeSpeedPenaltyExponent: 0.2,
    minSustainedSpeedFactor: 0.55,
    sizeTurnPenaltyExponent: 0.55,
    minTurnFactor: 0.45,
  },
  ecology: {
    energyCapacity: 1,
    initialEnergyRatio: 0.82,
    basalRate: 0.02,
    basalSizeExponent: 0.75,
    burstMetabolicRate: 0.035,
    captureEnergyPerSize: 1,
    starvationVfxEnabled: true,
  },
  plankton: {
    enabled: true,
    capacity: 600,
    initialFraction: 0.8,
    growthRate: 0.12,
    halfSaturationFraction: 0.2,
    maxIntakePerFish: 0.04,
    energyConversion: 1,
    visualCount: 1200,
    pointSize: 0.012,
    color: '#91b957',
    opacity: 0.72,
  },
  visual: {
    bodyLength: 0.03,
    bodyRadius: 0.008,
    radialSegments: 6,
    opacity: 0.92,
  },
  capture: {
    targetCaptureRate: 3,
    captureLengthFactor: 0.5,
  },
  debug: {
    perceptionRadii: false,
    combatRadii: false,
  },
  captureVfx: {
    enabled: true,
    particleCount: 12,
    density: 2,
    spawnRadius: 0.055,
    spawnInterval: 0.02,
    lifetime: 0.75,
    cubeSize: 0.022,
    cubeColor: '#1e4f8c',
    upwardSpeed: 0.12,
    reverseVelocityFactor: 0.4,
    radialSpeed: 0.22,
    biteGlowEnabled: true,
    biteGlowRadius: 0.28,
    biteGlowDuration: 0.45,
    biteGlowStrength: 0.85,
    biteGlowFalloff: 2.4,
  },
  spatialHash: {
    enabled: true,
  },
  distanceField: {
    enabled: true,
    cellSize: 0.05,
    paddingCells: 1,
    analyticRefineDistance: 0.1,
    gradientEpsilon: 0.025,
  },
  obstacles: {
    enabled: false,
    ringA: {
      enabled: true,
      type: 'ring',
      x: -0.42,
      y: 0.05,
      z: 0,
      rotationX: 0,
      rotationY: 0.22,
      rotationZ: 0,
      width: 0.82,
      height: 0.72,
      thickness: 0.08,
      holeDiameter: 0.48,
      frameDepth: 0.12,
    },
    ringB: {
      enabled: true,
      type: 'ring',
      x: 0.46,
      y: -0.08,
      z: -0.06,
      rotationX: 0,
      rotationY: -0.28,
      rotationZ: 0,
      width: 0.76,
      height: 0.68,
      thickness: 0.08,
      holeDiameter: 0.48,
      frameDepth: 0.12,
    },
    blockA: {
      enabled: true,
      type: 'box',
      x: -0.68,
      y: -0.54,
      z: 0.28,
      rotationX: 0,
      rotationY: 0.15,
      rotationZ: 0,
      width: 0.42,
      height: 0.28,
      depth: 0.34,
    },
    blockB: {
      enabled: true,
      type: 'box',
      x: 0.58,
      y: -0.48,
      z: 0.22,
      rotationX: 0,
      rotationY: -0.22,
      rotationZ: 0,
      width: 0.54,
      height: 0.2,
      depth: 0.3,
    },
  },
  physics: {
    enabled: true,
    spawnDefaults: false,
    gravityX: 0,
    gravityY: -0.34,
    gravityZ: 0,
    linearDamping: 1.45,
    angularDamping: 1.2,
    restitution: 0.25,
    density: 0.55,
    fishImpulseStrength: 0.0024,
    fishImpulseLimit: 0.009,
    interactionRadius: 0.055,
    aabbPadding: 0.08,
    dynamicRingRadius: 0.12,
    dynamicRingTube: 0.025,
    dynamicCubeSize: 0.14,
    dynamicColumnRadius: 0.045,
    dynamicColumnHeight: 0.18,
    dynamicBaseRadius: 0.09,
    dynamicBaseHeight: 0.035,
    ringSpawnX: -0.62,
    ringSpawnY: 0.45,
    ringSpawnZ: 0.18,
    cubeSpawnX: 0,
    cubeSpawnY: 0.52,
    cubeSpawnZ: -0.14,
    columnSpawnX: 0.66,
    columnSpawnY: 0.44,
    columnSpawnZ: 0.14,
  },
  camera: {
    fov: 45,
    globalNear: 0.01,
    focusDistance: 0.3,
    focusHeight: 0.09,
    closeupDistance: 0.11,
    closeupSide: 0.07,
    closeupHeight: 0.04,
    closeupFov: 30,
    lookAhead: 0.2,
    positionDamping: 12,
    orientationDamping: 9,
  },
});

export function createDefaultConfig() {
  return deepClone(DEFAULT_EXPERIMENT_CONFIG);
}

function entry(path, group, label, applyMode, options = {}) {
  return { path, group, label, applyMode, ...options };
}

const scalarEntries = [
  entry('runtime.project', '项目', 'project', 'rebuildScene', {
    options: {
      '主项目 · 水族馆': 'aquarium',
      '子实验 · 地图与刚体': 'obstacle',
      '子实验 · 生态淘汰': 'ecology',
    },
  }),
  entry('runtime.mode', 'Advanced · Runtime', 'mode', 'reset', {
    options: {
      'Predation · permanent death': 'steady',
      Ecology: 'ecology',
    },
  }),
  entry(
    'runtime.populationPreset',
    '运行',
    'population preset',
    'rebuildScene',
    {
      options: {
        '完整 640': 'full',
        '性能 300': 'performance',
        '自定义': 'custom',
      },
    }
  ),
  entry('runtime.seed', '运行', 'seed', 'reset', {
    min: 1,
    max: 999999,
    step: 1,
  }),
  entry('runtime.timeScale', '运行', 'time scale', 'live', {
    min: 0,
    max: 4,
    step: 0.1,
  }),
  entry('runtime.fixedDt', 'Advanced · Runtime', 'fixed dt', 'reset', {
    min: 1 / 240,
    max: 1 / 20,
    step: 1 / 240,
  }),
  entry(
    'runtime.initialSpawnAttempts',
    'Advanced · Runtime',
    'initial spawn attempts',
    'rebuildScene',
    {
      min: 1,
      max: 100,
      step: 1,
    }
  ),
  entry('tank.preset', '缸体', 'preset', 'rebuildScene', {
    options: {
      Aquarium: 'aquarium',
      Obstacle: 'obstacle',
      Ecology: 'ecology',
      Custom: 'custom',
    },
  }),
  entry('tank.width', '缸体', 'width', 'rebuildScene', {
    min: 1,
    max: 12,
    step: 0.05,
  }),
  entry('tank.height', '缸体', 'height', 'rebuildScene', {
    min: 0.6,
    max: 7.2,
    step: 0.05,
  }),
  entry('tank.depth', '缸体', 'depth', 'rebuildScene', {
    min: 0.4,
    max: 4.8,
    step: 0.05,
  }),
  entry(
    'tank.wallMargin',
    'Advanced · Tank',
    'wall margin · 硬边界',
    'live',
    {
      min: 0,
      max: 0.2,
      step: 0.005,
    }
  ),
  entry(
    'tank.edgeSoftness',
    'Advanced · Tank',
    'edge softness · 软转向带',
    'live',
    {
      min: 0.02,
      max: 0.5,
      step: 0.01,
    }
  ),
  entry(
    'perception.minNeighborRadiusFactor',
    '感知',
    'min radius / body',
    'reset',
    { min: 1, max: 8, step: 0.1 }
  ),
  entry(
    'perception.alignmentRadiusFactor',
    '感知',
    'radius ×（全局）',
    'live',
    { min: 0.05, max: 1, step: 0.01 }
  ),
  entry(
    'perception.separationRadiusFactor',
    '感知',
    'radius ×（全局）',
    'live',
    { min: 0.05, max: 1, step: 0.01 }
  ),
  entry(
    'perception.detectionLengthFactor',
    '感知',
    'hunt / panic radius × cohesion',
    'live',
    { min: 0.1, max: 2, step: 0.01 }
  ),
  entry(
    'perception.crossSeparationScale',
    '跨鱼群作用',
    'cross separation radius / size',
    'live',
    { min: 0.02, max: 0.5, step: 0.01 }
  ),
  entry('relations.k', '关系', '捕食体型阈值 k', 'live', {
    min: 1.01,
    max: 2,
    step: 0.01,
  }),
  entry('relations.hysteresis', '关系', 'hysteresis δ', 'live', {
    min: 0,
    max: 0.5,
    step: 0.01,
  }),
  entry('relations.pursuitWeight', '关系', '捕猎凝聚 weight', 'live', {
    min: 0,
    max: 4,
    step: 0.05,
  }),
  entry(
    'relations.burstRadiusFactor',
    '关系',
    'burst radius × 大范围',
    'live',
    { min: 0.05, max: 1, step: 0.01 }
  ),
  entry('relations.burstWeight', '关系', 'burst weight', 'live', {
    min: 0,
    max: 20,
    step: 0.25,
  }),
  entry('relations.evadeWeight', '关系', 'evade weight', 'live', {
    min: 0,
    max: 4,
    step: 0.05,
  }),
  entry(
    'relations.evadeLateralWeight',
    '关系',
    'evade lateral',
    'live',
    { min: 0, max: 2, step: 0.02 }
  ),
  entry(
    'relations.directThreatPanic',
    '关系',
    'threat panic target',
    'live',
    { min: 0, max: 1, step: 0.01 }
  ),
  entry('relations.panicRiseRate', '关系', 'panic rise /s', 'live', {
    min: 0.1,
    max: 20,
    step: 0.1,
  }),
  entry('relations.panicDecayRate', '关系', 'panic decay /s', 'live', {
    min: 0.1,
    max: 10,
    step: 0.05,
  }),
  entry('locomotion.burstFactor', '运动', 'pursuit burst ×', 'live', {
    min: 1,
    max: 3,
    step: 0.01,
  }),
  entry(
    'locomotion.panicSpeedFactor',
    '运动',
    'panic speed ×',
    'live',
    { min: 1, max: 3, step: 0.01 }
  ),
  entry('locomotion.maxForce', '运动', 'max steering', 'live', {
    min: 0.05,
    max: 10,
    step: 0.01,
  }),
  entry(
    'locomotion.interceptLookAhead',
    '运动',
    'intercept look-ahead',
    'live',
    { min: 0, max: 5, step: 0.05 }
  ),
  entry('locomotion.boundaryWeight', '运动', 'boundary weight', 'live', {
    min: 0,
    max: 6,
    step: 0.05,
  }),
  entry('locomotion.avoidanceWeight', '运动', 'avoidance weight', 'live', {
    min: 0,
    max: 8,
    step: 0.05,
  }),
  entry(
    'locomotion.panicAvoidanceSuppression',
    '运动',
    'panic avoidance suppression',
    'live',
    { min: 0, max: 1.5, step: 0.01 }
  ),
  entry(
    'locomotion.avoidanceInertia',
    '运动',
    'avoidance inertia',
    'live',
    { min: 0, max: 0.99, step: 0.01 }
  ),
  entry('locomotion.wanderWeight', '运动', 'wander weight', 'live', {
    min: 0,
    max: 1,
    step: 0.01,
  }),
  entry('traits.enabled', 'Trait Coupling', '体型耦合启用', 'live'),
  entry(
    'traits.sizeSpeedPenaltyExponent',
    'Trait Coupling',
    'size → speed exponent',
    'live',
    { min: 0, max: 2, step: 0.01 }
  ),
  entry(
    'traits.minSustainedSpeedFactor',
    'Trait Coupling',
    'min sustained speed ×',
    'live',
    { min: 0.1, max: 1, step: 0.01 }
  ),
  entry(
    'traits.sizeTurnPenaltyExponent',
    'Trait Coupling',
    'size → turn exponent',
    'live',
    { min: 0, max: 2, step: 0.01 }
  ),
  entry(
    'traits.minTurnFactor',
    'Trait Coupling',
    'min turn ×',
    'live',
    { min: 0.1, max: 1, step: 0.01 }
  ),
  entry(
    'ecology.energyCapacity',
    '生态能量',
    'energy capacity',
    'reset',
    { min: 0.05, max: 20, step: 0.05 }
  ),
  entry(
    'ecology.initialEnergyRatio',
    '生态能量',
    'initial energy',
    'reset',
    { min: 0.01, max: 1, step: 0.01 }
  ),
  entry('ecology.basalRate', '生态能量', 'basal drain /s', 'live', {
    min: 0,
    max: 1,
    step: 0.001,
  }),
  entry(
    'ecology.basalSizeExponent',
    '生态能量',
    'basal size exponent',
    'live',
    { min: 0, max: 3, step: 0.01 }
  ),
  entry(
    'ecology.burstMetabolicRate',
    '生态能量',
    'burst drain /s',
    'live',
    { min: 0, max: 2, step: 0.005 }
  ),
  entry(
    'ecology.captureEnergyPerSize',
    '生态能量',
    'capture energy / prey size',
    'live',
    { min: 0, max: 10, step: 0.05 }
  ),
  entry(
    'ecology.starvationVfxEnabled',
    '生态能量',
    'starvation effect',
    'live'
  ),
  entry('plankton.enabled', '浮游资源', 'plankton enabled', 'live'),
  entry('plankton.capacity', '浮游资源', 'carrying capacity', 'reset', {
    min: 1,
    max: 10000,
    step: 1,
  }),
  entry(
    'plankton.initialFraction',
    '浮游资源',
    'initial fraction',
    'reset',
    { min: 0, max: 1, step: 0.01 }
  ),
  entry('plankton.growthRate', '浮游资源', 'logistic growth /s', 'live', {
    min: 0,
    max: 3,
    step: 0.01,
  }),
  entry(
    'plankton.halfSaturationFraction',
    '浮游资源',
    'half saturation',
    'live',
    { min: 0.001, max: 1, step: 0.001 }
  ),
  entry(
    'plankton.maxIntakePerFish',
    '浮游资源',
    'max intake / fish /s',
    'live',
    { min: 0, max: 2, step: 0.001 }
  ),
  entry(
    'plankton.energyConversion',
    '浮游资源',
    'energy / plankton',
    'live',
    { min: 0, max: 10, step: 0.01 }
  ),
  entry(
    'plankton.visualCount',
    '浮游资源',
    'visible particles',
    'rebuildScene',
    { min: 0, max: 10000, step: 1 }
  ),
  entry('plankton.pointSize', '浮游资源', 'particle size', 'live', {
    min: 0.001,
    max: 0.08,
    step: 0.001,
  }),
  entry('plankton.color', '浮游资源', 'particle color', 'live'),
  entry('plankton.opacity', '浮游资源', 'particle opacity', 'live', {
    min: 0.05,
    max: 1,
    step: 0.01,
  }),
  entry('visual.bodyLength', 'Advanced · Visual', 'body length', 'rebuildScene', {
    min: 0.005,
    max: 0.12,
    step: 0.001,
  }),
  entry('visual.bodyRadius', 'Advanced · Visual', 'body radius', 'rebuildScene', {
    min: 0.002,
    max: 0.04,
    step: 0.001,
  }),
  entry(
    'visual.radialSegments',
    'Advanced · Visual',
    'radial segments',
    'rebuildScene',
    { min: 3, max: 16, step: 1 }
  ),
  entry('visual.opacity', 'Advanced · Visual', 'fish opacity', 'live', {
    min: 0.1,
    max: 1,
    step: 0.01,
  }),
  entry('debug.perceptionRadii', '可视化', '0号鱼 · 同群三力半径', 'live'),
  entry('debug.combatRadii', '可视化', '0号鱼 · 捕食/逃逸半径', 'live'),
  entry('capture.targetCaptureRate', '捕食', 'captures /s / school', 'live', {
    min: 0.05,
    max: 20,
    step: 0.05,
  }),
  entry(
    'capture.captureLengthFactor',
    '捕食',
    'capture length ×',
    'live',
    { min: 0.1, max: 2, step: 0.01 }
  ),
  entry('captureVfx.enabled', '捕获特效', '特效启用', 'live'),
  entry('captureVfx.particleCount', '捕获特效', '碎片数量上限', 'live', {
    min: 1,
    max: 24,
    step: 1,
  }),
  entry('captureVfx.density', '捕获特效', '碎片密度', 'live', {
    min: 0,
    max: 12,
    step: 0.1,
  }),
  entry('captureVfx.spawnRadius', '捕获特效', '生成半径', 'live', {
    min: 0,
    max: 0.3,
    step: 0.002,
  }),
  entry('captureVfx.spawnInterval', '捕获特效', '碎片间隔', 'live', {
    min: 0,
    max: 0.2,
    step: 0.002,
  }),
  entry('captureVfx.lifetime', '捕获特效', '碎片寿命', 'live', {
    min: 0.05,
    max: 3,
    step: 0.05,
  }),
  entry('captureVfx.cubeSize', '捕获特效', '碎片尺寸', 'live', {
    min: 0.002,
    max: 0.08,
    step: 0.001,
  }),
  entry('captureVfx.cubeColor', '捕获特效', '碎片颜色', 'live'),
  entry('captureVfx.upwardSpeed', '捕获特效', '上浮速度', 'live', {
    min: 0,
    max: 2,
    step: 0.01,
  }),
  entry(
    'captureVfx.reverseVelocityFactor',
    '捕获特效',
    '捕食者反向速度',
    'live',
    { min: 0, max: 2, step: 0.01 }
  ),
  entry('captureVfx.radialSpeed', '捕获特效', '径向速度', 'live', {
    min: 0,
    max: 2,
    step: 0.01,
  }),
  entry('captureVfx.biteGlowEnabled', '捕获特效', '咬合闪光', 'live'),
  entry('captureVfx.biteGlowRadius', '捕获特效', '闪光半径', 'live', {
    min: 0.01,
    max: 1,
    step: 0.01,
  }),
  entry('captureVfx.biteGlowDuration', '捕获特效', '闪光时长', 'live', {
    min: 0.02,
    max: 2,
    step: 0.01,
  }),
  entry('captureVfx.biteGlowStrength', '捕获特效', '闪光强度', 'live', {
    min: 0,
    max: 3,
    step: 0.01,
  }),
  entry('captureVfx.biteGlowFalloff', '捕获特效', '闪光衰减', 'live', {
    min: 0,
    max: 12,
    step: 0.1,
  }),
  entry('spatialHash.enabled', 'Advanced · Spatial Hash', 'hash enabled', 'reset'),
  entry('distanceField.enabled', '障碍距离场', 'distance field enabled', 'rebuildField'),
  entry('distanceField.cellSize', '障碍距离场', 'field cell size', 'rebuildField', {
    min: 0.02,
    max: 0.2,
    step: 0.005,
  }),
  entry(
    'distanceField.paddingCells',
    'Advanced · Distance Field',
    'padding cells',
    'rebuildField',
    { min: 1, max: 4, step: 1 }
  ),
  entry(
    'distanceField.analyticRefineDistance',
    '障碍距离场',
    'analytic refine distance',
    'live',
    { min: 0, max: 0.5, step: 0.005 }
  ),
  entry(
    'distanceField.gradientEpsilon',
    'Advanced · Distance Field',
    'gradient epsilon',
    'live',
    { min: 0.005, max: 0.2, step: 0.005 }
  ),
  entry('obstacles.enabled', '障碍', 'map enabled', 'rebuildField'),
  entry('physics.enabled', 'Rapier 物理', 'physics enabled', 'rebuildScene'),
  entry('physics.spawnDefaults', 'Rapier 物理', 'spawn defaults', 'rebuildScene'),
  entry('physics.gravityX', 'Rapier 物理', 'gravity X', 'live', {
    min: -3,
    max: 3,
    step: 0.01,
  }),
  entry('physics.gravityY', 'Rapier 物理', 'gravity Y', 'live', {
    min: -3,
    max: 3,
    step: 0.01,
  }),
  entry('physics.gravityZ', 'Rapier 物理', 'gravity Z', 'live', {
    min: -3,
    max: 3,
    step: 0.01,
  }),
  entry('physics.linearDamping', 'Rapier 物理', 'linear damping', 'live', {
    min: 0,
    max: 10,
    step: 0.05,
  }),
  entry('physics.angularDamping', 'Rapier 物理', 'angular damping', 'live', {
    min: 0,
    max: 10,
    step: 0.05,
  }),
  entry('physics.restitution', 'Rapier 物理', 'restitution', 'rebuildScene', {
    min: 0,
    max: 1,
    step: 0.01,
  }),
  entry('physics.density', 'Rapier 物理', 'density', 'rebuildScene', {
    min: 0.01,
    max: 10,
    step: 0.01,
  }),
  entry('physics.fishImpulseStrength', 'Rapier 物理', 'fish impulse', 'live', {
    min: 0,
    max: 0.05,
    step: 0.0001,
  }),
  entry('physics.fishImpulseLimit', 'Rapier 物理', 'impulse limit', 'live', {
    min: 0,
    max: 0.1,
    step: 0.0001,
  }),
  entry('physics.interactionRadius', 'Rapier 物理', 'interaction radius', 'live', {
    min: 0.005,
    max: 0.3,
    step: 0.005,
  }),
  entry('physics.aabbPadding', 'Rapier 物理', 'AABB padding', 'live', {
    min: 0,
    max: 0.5,
    step: 0.005,
  }),
  entry('physics.dynamicRingRadius', 'Rapier 物理', 'ring radius', 'rebuildScene', {
    min: 0.03,
    max: 0.4,
    step: 0.005,
  }),
  entry('physics.dynamicRingTube', 'Rapier 物理', 'ring tube', 'rebuildScene', {
    min: 0.005,
    max: 0.12,
    step: 0.002,
  }),
  entry('physics.dynamicCubeSize', 'Rapier 物理', 'cube size', 'rebuildScene', {
    min: 0.03,
    max: 0.5,
    step: 0.005,
  }),
  entry(
    'physics.dynamicColumnRadius',
    'Rapier 物理',
    'column radius',
    'rebuildScene',
    { min: 0.01, max: 0.2, step: 0.002 }
  ),
  entry(
    'physics.dynamicColumnHeight',
    'Rapier 物理',
    'column height',
    'rebuildScene',
    { min: 0.04, max: 0.6, step: 0.005 }
  ),
  entry('physics.dynamicBaseRadius', 'Rapier 物理', 'base radius', 'rebuildScene', {
    min: 0.02,
    max: 0.3,
    step: 0.002,
  }),
  entry('physics.dynamicBaseHeight', 'Rapier 物理', 'base height', 'rebuildScene', {
    min: 0.01,
    max: 0.2,
    step: 0.002,
  }),
  entry('camera.fov', '相机', 'FOV', 'live', {
    min: 20,
    max: 100,
    step: 1,
  }),
  entry('camera.globalNear', 'Advanced · Camera', 'global near', 'live', {
    min: 0.001,
    max: 0.2,
    step: 0.001,
  }),
  entry('camera.focusDistance', '相机', '跟随后距 / size', 'live', {
    min: 0.08,
    max: 2,
    step: 0.01,
  }),
  entry('camera.focusHeight', '相机', '跟随高度 / size', 'live', {
    min: -0.5,
    max: 1,
    step: 0.01,
  }),
  entry('camera.closeupDistance', '相机', '特写后距 / size', 'live', {
    min: 0.04,
    max: 1,
    step: 0.01,
  }),
  entry('camera.closeupSide', '相机', '特写侧移 / size', 'live', {
    min: -1,
    max: 1,
    step: 0.01,
  }),
  entry('camera.closeupHeight', '相机', '特写高度 / size', 'live', {
    min: -0.5,
    max: 1,
    step: 0.01,
  }),
  entry('camera.closeupFov', '相机', '特写 FOV', 'live', {
    min: 15,
    max: 90,
    step: 1,
  }),
  entry('camera.lookAhead', '相机', 'look ahead', 'live', {
    min: 0.02,
    max: 1,
    step: 0.01,
  }),
  entry('camera.positionDamping', '相机', 'position damping', 'live', {
    min: 0.1,
    max: 40,
    step: 0.1,
  }),
  entry('camera.orientationDamping', '相机', 'orientation damping', 'live', {
    min: 0.1,
    max: 40,
    step: 0.1,
  }),
];

function schoolEntries(config) {
  return config.schools.flatMap((item, index) => {
    const p = `schools.${index}`;
    const group = `鱼群 · ${item.name}`;
    return [
      entry(`${p}.id`, group, 'id', 'rebuildScene'),
      entry(`${p}.name`, group, 'name', 'rebuildScene'),
      entry(`${p}.color`, group, 'color', 'live'),
      entry(`${p}.count`, group, 'count', 'rebuildScene', {
        min: 1,
        max: 2000,
        step: 1,
      }),
      entry(`${p}.size`, group, 'size', 'live', {
        min: 0.2,
        max: 5,
        step: 0.01,
      }),
      entry(
        `${p}.targetNeighbors`,
        group,
        'target neighbors（当前鱼群）',
        'reset',
        {
          min: 1,
          max: 64,
          step: 1,
        }
      ),
      entry(`${p}.cruiseSpeed`, group, 'cruise speed', 'live', {
        min: 0.01,
        max: 2,
        step: 0.01,
      }),
      entry(`${p}.maxSpeed`, group, 'max speed', 'live', {
        min: 0.01,
        max: 3,
        step: 0.01,
      }),
      entry(`${p}.turnSpeed`, group, 'turn speed', 'live', {
        min: 0.1,
        max: 12,
        step: 0.1,
      }),
      entry(`${p}.grazeRate`, group, 'plankton graze ×', 'live', {
        min: 0,
        max: 4,
        step: 0.01,
      }),
      entry(`${p}.separationWeight`, group, 'weight（当前鱼群）', 'live', {
        min: 0,
        max: 6,
        step: 0.05,
      }),
      entry(`${p}.alignmentWeight`, group, 'weight（当前鱼群）', 'live', {
        min: 0,
        max: 6,
        step: 0.05,
      }),
      entry(`${p}.cohesionWeight`, group, 'weight（当前鱼群）', 'live', {
        min: 0,
        max: 6,
        step: 0.05,
      }),
      ...['centerX', 'centerY', 'centerZ'].map((axis) =>
        entry(`${p}.spawnRegion.${axis}`, group, `spawn ${axis}`, 'reset', {
          min: -0.5,
          max: 0.5,
          step: 0.01,
        })
      ),
      entry(`${p}.spawnRegion.radius`, group, 'spawn radius', 'reset', {
        min: 0.02,
        max: 1.5,
        step: 0.01,
      }),
      ...['x', 'y', 'z'].map((axis) =>
        entry(`${p}.initialHeading.${axis}`, group, `heading ${axis}`, 'reset', {
          min: -1,
          max: 1,
          step: 0.05,
        })
      ),
    ];
  });
}

function obstacleEntries(config) {
  const result = [];
  for (const [key, obstacle] of Object.entries(config.obstacles)) {
    if (key === 'enabled') continue;
    const group = `障碍 · ${key}`;
    for (const [field, value] of Object.entries(obstacle)) {
      const path = `obstacles.${key}.${field}`;
      if (field === 'type') {
        result.push(
          entry(path, group, 'type', 'rebuildField', {
            options: { Ring: 'ring', Box: 'box' },
          })
        );
      } else if (typeof value === 'boolean') {
        result.push(entry(path, group, field, 'rebuildField'));
      } else {
        const rotation = field.startsWith('rotation');
        const dimension = [
          'width',
          'height',
          'depth',
          'thickness',
          'holeDiameter',
          'frameDepth',
        ].includes(field);
        result.push(
          entry(path, group, field, 'rebuildField', {
            min: rotation ? -Math.PI : dimension ? 0.01 : -3,
            max: rotation ? Math.PI : 3,
            step: rotation ? TAU / 360 : 0.01,
          })
        );
      }
    }
  }
  return result;
}

function physicsSpawnEntries() {
  const result = [];
  for (const kind of ['ring', 'cube', 'column']) {
    for (const axis of ['X', 'Y', 'Z']) {
      result.push(
        entry(
          `physics.${kind}Spawn${axis}`,
          'Advanced · Physics Spawn',
          `${kind} spawn ${axis}`,
          'rebuildScene',
          { min: -3, max: 3, step: 0.01 }
        )
      );
    }
  }
  return result;
}

export function createParameterRegistry(config = createDefaultConfig()) {
  return [
    ...scalarEntries,
    ...schoolEntries(config),
    ...obstacleEntries(config),
    ...physicsSpawnEntries(),
  ];
}

export function getPath(root, path) {
  return path.split('.').reduce((value, key) => value?.[key], root);
}

export function setPath(root, path, value) {
  const keys = path.split('.');
  const leaf = keys.pop();
  const parent = keys.reduce((object, key) => object[key], root);
  parent[leaf] = value;
}

export function listLeafPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') return [prefix];
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(...listLeafPaths(child, path));
  }
  return paths;
}

export function validateConfig(candidate) {
  const errors = [];
  const warnings = [];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, errors: ['配置必须是对象'], warnings };
  }
  if (!Array.isArray(candidate.schools) || candidate.schools.length < 2) {
    errors.push('至少需要两个鱼群');
    return { valid: false, errors, warnings };
  }
  let registry;
  try {
    registry = createParameterRegistry(candidate);
  } catch {
    errors.push('配置结构不完整');
    return { valid: false, errors, warnings };
  }
  const registered = new Set(registry.map((item) => item.path));
  for (const path of listLeafPaths(candidate)) {
    if (!registered.has(path)) errors.push(`未注册参数: ${path}`);
  }
  for (const spec of registry) {
    const value = getPath(candidate, spec.path);
    if (value === undefined) {
      errors.push(`缺少参数: ${spec.path}`);
      continue;
    }
    if (spec.options && !Object.values(spec.options).includes(value)) {
      errors.push(`${spec.path} 不是允许值`);
    }
    if (spec.min !== undefined) {
      if (!Number.isFinite(value)) errors.push(`${spec.path} 必须是有限数`);
      if (value < spec.min || value > spec.max) {
        errors.push(`${spec.path} 超出 ${spec.min}–${spec.max}`);
      }
      if (spec.step === 1 && !Number.isInteger(value)) {
        errors.push(`${spec.path} 必须是整数`);
      }
    }
  }
  const ids = candidate.schools?.map((item) => item.id) ?? [];
  if (new Set(ids).size !== ids.length) errors.push('鱼群 id 必须唯一');
  for (const school of candidate.schools) {
    if (school.maxSpeed < school.cruiseSpeed) {
      errors.push(`${school.id}: maxSpeed 必须不小于 cruiseSpeed`);
    }
    const headingLength = Math.hypot(
      school.initialHeading.x,
      school.initialHeading.y,
      school.initialHeading.z
    );
    if (headingLength <= 1e-8) {
      errors.push(`${school.id}: initialHeading 不能为零向量`);
    }
  }
  for (const [id, obstacle] of Object.entries(candidate.obstacles)) {
    if (id === 'enabled' || obstacle.type !== 'ring') continue;
    if (
      obstacle.holeDiameter >= obstacle.width ||
      obstacle.holeDiameter >= obstacle.height
    ) {
      errors.push(`${id}: holeDiameter 必须小于面板宽高`);
    }
  }
  if (
    candidate.locomotion?.burstFactor <=
    candidate.locomotion?.panicSpeedFactor
  ) {
    warnings.push('burstFactor ≤ panicSpeedFactor：捕食者可能无法闭合距离');
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function exportConfigJson(config) {
  return JSON.stringify(config, null, 2);
}

export function importConfigJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败: ${error.message}`);
  }
  const result = validateConfig(parsed);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  return { config: deepClone(parsed), warnings: result.warnings };
}
