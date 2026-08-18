import * as THREE from 'three';
import {
  RelationMatrix,
  SeededRng,
  SpatialHash3D,
  captureRadius,
  captureSpeedFactor,
  deriveExperiment,
  ecologyOutcome,
  effectiveSchoolCaptureRate,
  effectiveMaxSpeed,
  effectiveTurnSpeed,
  metabolicRate,
  perPredatorCooldown,
  planktonIntake,
  relationBetween,
  stepPlankton,
  sustainedSpeedScale,
  tankVolume,
} from './experiment-model.js';
import { sceneClearance, tankWallClearance } from './distance-field.js';
import { CaptureVfx } from './capture-vfx.js';

const EPSILON = 1e-8;
const FORWARD = new THREE.Vector3(0, 0, 1);
const LOCOMOTION = Object.freeze({
  CRUISE: 0,
  BURST: 1,
  EVADE: 2,
});
const LOCOMOTION_LABEL = Object.freeze([
  'cruise',
  'burst',
  'evade',
]);

// ── 性状可读性：只影响外观，不参与任何判定 ──────────────────────────
// 三角形控制器把权重映射成系数时中段很平（w≥1/3 时 m = 0.75+0.75w），
// 拖到一半只有 ×1.1~1.2 —— 在 1.5 的基数上是 10% 的变化，肉眼分不出。
// 下面两组常数把"玩家选了什么"放大到看得见，判定继续用真实数值。
// 三个常数都可以设为关闭值，出问题直接回滚。

// 体型：视觉尺寸 = 锚点 × (真实尺寸 / 锚点) ^ γ × 全局倍率
//
// 为什么是"抬地板 + 压指数"这个组合：
//   浮游颗粒 pointSize = 0.03；鱼的视觉长度 = 0.046 × 视觉尺寸。
//   玩家把体型让给速度/耐力时真实体型 0.75，旧参数(γ=1.8)算出来的
//   视觉长度正好也是 0.030 —— 和浮游一模一样，鱼消失在食物里。
//   但只抬地板不压指数会让另一端爆炸：要让最小的鱼达到浮游 3 倍，
//   红鱼会涨到 0.65 m，而缸只有 6 m 宽。两件事必须一起做。
//
// γ<1 把两端都朝锚点收拢，最小的不消失、最大的不塞满缸；全局倍率
// 再把整体抬起来。绝对尺寸变大后，同样百分比的变化反而更容易看见
// （0.15 m 的鱼变化 20% 一眼可见，0.03 m 的看不出来）。
//
// 判定完全不受影响：捕食半径、谁吃谁、代谢、速度惩罚读的都是
// school.size；这里只改 setMatrixAt 的缩放。γ=1 且全局=1 即关闭。
// 结论：用线性（γ=1），靠【全局放大】而不是靠指数解决可见性。
//   试过 γ=1.8（放大差距）会让最小的鱼掉到浮游大小；试过 γ=0.9
//   （压缩两端）效果和线性几乎相同，却要多一个概念。线性还白拿三点：
//   ① 视觉不撒谎，看起来两倍大就是真的两倍大，比例精确保留；
//   ② "玩家拉满体型 == 大群"这个相等关系保住（指数会破坏它），
//      而那正是叙事上的高光时刻；③ 只剩一个旋钮。
//   可见性由绝对尺寸保证：0.18 m 的鱼变化 20% 一眼可见，
//   0.03 m 的看不出来 —— 所以把基准做大本身就够了。
const VISUAL_SIZE_EXPONENT = 1; // 1 = 线性。改成 ≠1 会启用非线性映射
const VISUAL_SIZE_ANCHOR = 1.5; // 仅当 γ≠1 时作为映射锚点
const VISUAL_SIZE_GLOBAL = 2.6; // ← 唯一要调的旋钮：全体视觉放大倍率

// 逐鱼群微调，在上面之后再乘。现在三群一致；要单独放大某群改这里。
const VISUAL_SIZE_BOOST = Object.freeze({
  small: 1,
  medium: 1,
  large: 1,
});

// 耐力明度：亮度 ∝ 【还能活多久】= 当前能量 ÷ 每秒代谢。
//
// 为什么是这个量而不是代谢倍率本身：
//   耐力 → 代谢是倒数（代谢 ∝ 1/耐力），代谢 → 存活时间又是倒数
//   （时间 = 能量/代谢），两个倒数抵消，所以【存活时间与耐力系数
//   严格线性】—— 实测耐力 0.5/0.75/1.0/1.25/1.5 对应 22.6/33.9/
//   45.2/56.5/67.8 秒，比值恒为 45.18。拖一半就是一半亮度。
//
// 而直接映射代谢倍率是错的：拉满速度时代谢 ×1.01、均衡 ×1.00 —— 明度
// 纹丝不动；拉满体型却 ×2.66 大亮，可体型已经用尺寸表示了。等于明度
// 变成第二根体型条，而速度轴完全隐形。
//
// 这一个量还同时解决了"性状 vs 状态"：TUNING 时能量恒满，亮度显示的
// 是【这套选择能撑多久】；RUNNING 时能量下降，亮度就成了【现在还能
// 撑多久】。一个通道，两层含义，且都是玩家真正关心的那个数。
// 强度设 0 即关闭染色。
const STAMINA_TINT_STRENGTH = 0.45;
const STAMINA_TINT_REFERENCE_SECONDS = 45; // 均衡选择的续航，作为亮度基准
const STAMINA_TINT_MIN = 0.35; // 濒死时最暗
const STAMINA_TINT_MAX = 1.45; // 满耐力时最亮，防止过曝

function visualSizeOf(size, schoolId) {
  const boost = (VISUAL_SIZE_BOOST[schoolId] ?? 1) * VISUAL_SIZE_GLOBAL;
  if (VISUAL_SIZE_EXPONENT === 1) return size * boost;
  const ratio = Math.max(EPSILON, size / VISUAL_SIZE_ANCHOR);
  return VISUAL_SIZE_ANCHOR * ratio ** VISUAL_SIZE_EXPONENT * boost;
}

// 还能活多久 → 亮度倍率。撑得久 = 亮，快饿死 = 暗。
function staminaTintFactor(survivalSeconds) {
  if (STAMINA_TINT_STRENGTH === 0) return 1;
  if (!Number.isFinite(survivalSeconds)) return STAMINA_TINT_MAX;
  const relative = survivalSeconds / STAMINA_TINT_REFERENCE_SECONDS;
  return clamp(
    1 + STAMINA_TINT_STRENGTH * (relative - 1),
    STAMINA_TINT_MIN,
    STAMINA_TINT_MAX
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function approach(current, target, rate, dt) {
  const alpha = 1 - Math.exp(-Math.max(0, rate) * dt);
  return current + (target - current) * alpha;
}

function normalize3(x, y, z) {
  const magnitude = Math.hypot(x, y, z);
  if (magnitude <= EPSILON) return [0, 0, 0, 0];
  return [x / magnitude, y / magnitude, z / magnitude, magnitude];
}

// 原版 boids.js 的核心：每条规则先归一化成"期望速度"，减去当前速度，
// 钳到 maxForce，之后才乘权重。实验版原来是原始量级直接加权求和 ——
// cohesion ∝ 到群心距离、alignment ∝ 速度差、separation ∝ 1/d²，
// 三者量纲不同，权重比值随密度和距离乱变。这是"不像原版"的根因。
function steerToward(dx, dy, dz, vx, vy, vz, maxSpeed, maxForce, out) {
  const length = Math.hypot(dx, dy, dz);
  if (length <= EPSILON) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  const scale = maxSpeed / length;
  let sx = dx * scale - vx;
  let sy = dy * scale - vy;
  let sz = dz * scale - vz;
  const magnitude = Math.hypot(sx, sy, sz);
  if (magnitude > maxForce) {
    const clamp = maxForce / magnitude;
    sx *= clamp;
    sy *= clamp;
    sz *= clamp;
  }
  out[0] = sx;
  out[1] = sy;
  out[2] = sz;
  return out;
}

const STEER_SCRATCH = new Float64Array(3);

function add3(array, index, x, y, z) {
  const offset = index * 3;
  array[offset] += x;
  array[offset + 1] += y;
  array[offset + 2] += z;
}

function set3(array, index, x, y, z) {
  const offset = index * 3;
  array[offset] = x;
  array[offset + 1] = y;
  array[offset + 2] = z;
}

export class ExperimentSimulation {
  constructor({ scene, config, distanceField, physics }) {
    this.scene = scene;
    this.config = config;
    this.distanceField = distanceField;
    this.physics = physics;
    this.relations = new RelationMatrix();
    this.hash = new SpatialHash3D(1);
    this.hiddenFish = -1;
    this.locomotionPreview = false;
    this.captureVfx = null;
    this.planktonMesh = null;
    this.metricsState = {
      frameMs: 0,
      fps: 0,
      pairCount: 0,
      captures: 0,
      dynamicContacts: 0,
    };
    this.rebuild(config);
  }

  dispose() {
    if (this.mesh) {
      this.mesh.removeFromParent();
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
    if (this.planktonMesh) {
      this.planktonMesh.removeFromParent();
      this.planktonMesh.geometry.dispose();
      this.planktonMesh.material.dispose();
      this.planktonMesh = null;
    }
    this.captureVfx?.dispose();
    this.captureVfx = null;
  }

  rebuild(config = this.config) {
    this.config = config;
    this.dispose();
    this.derived = deriveExperiment(config);
    this.count = this.derived.totalCount;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    this.forces = new Float32Array(this.count * 3);
    this.separation = new Float32Array(this.count * 3);
    this.cohesionSums = new Float32Array(this.count * 3);
    this.predationSums = new Float32Array(this.count * 3);
    this.alignmentSums = new Float32Array(this.count * 3);
    this.evadeForces = new Float32Array(this.count * 3);
    this.avoidanceDirections = new Float32Array(this.count * 3);
    this.schoolIds = new Uint16Array(this.count);
    this.alive = new Uint8Array(this.count);
    this.panic = new Float32Array(this.count);
    // --- 恐慌传播（惊扰波）：直接感知强度、邻居恐慌、邻居逃逸方向 ---
    this.threatLevel = new Float32Array(this.count);
    this.neighborPanic = new Float32Array(this.count);
    this.neighborEvade = new Float32Array(this.count * 3);
    // 应急对齐通道：恐慌航向不进普通 alignment 平均
    this.emergencyAlign = new Float32Array(this.count * 3);
    this.emergencyUrgency = new Float32Array(this.count);
    // 目标锁定：原版 targetLockTime 0.8s。不锁定的话捕食者会在几条猎物
    // 之间每帧乱跳，那是最像粒子的一种运动。
    this.lockedTargets = new Int32Array(this.count).fill(-1);
    this.lockTimers = new Float32Array(this.count);
    // --- 脉冲/闩锁式恐慌（移植自 dev 分支 boids.js）---
    // 连续跟踪不会产生"惊吓"，而且社会传播没有不应期会无限回响。
    this.alarm = new Float32Array(this.count);       // 离散脉冲，指数衰减
    this.heardSignal = new Float32Array(this.count); // 本帧收到的社会信号
    this.panicHold = new Float32Array(this.count);   // 满恐慌保持计时
    this.refractory = new Float32Array(this.count);  // 不应期
    this.directLatch = new Uint8Array(this.count);   // 直接威胁闩锁（滞回）
    // 侧倾：转弯时鱼体侧过来。不改行为，但决定"像不像鱼"。
    this.rollAngles = new Float32Array(this.count);
    this.prevHeadings = new Float32Array(this.count * 3);
    this.escapeDir = new Float32Array(this.count * 3);
    this.energy = new Float32Array(this.count);
    // 每族一个能量共享池（进食所得的一部分汇入，逐帧平均分发）
    this.energyPools = new Float64Array(config.schools.length);
    // 尸体 = 鱼模型本身。1 = 浮尸（可见、灰色、上浮、可被吃），0 = 活着或已被吃掉。
    this.corpse = new Uint8Array(this.count);
    // 死后经过的秒数，驱动颜色渐变 / 翻身 / 上浮渐入
    this.corpseAge = new Float32Array(this.count);
    // 上一次写入的耐力明度倍率，用来跳过没有变化的 setColorAt。
    this.tintFactors = new Float32Array(this.count).fill(-1);
    this.corpseColor = new THREE.Color('#6b6f74');
    this.schoolColors = config.schools.map((sc) => new THREE.Color(sc.color));
    this.locomotionStates = new Uint8Array(this.count);
    this.cooldowns = new Float32Array(this.count);
    this.initialCooldownPhases = new Float32Array(this.count);
    this.wanderPhases = new Float32Array(this.count);
    this.wanderRates = new Float32Array(this.count);
    this.sameNeighbors = new Uint16Array(this.count);
    this.cohesionCounts = new Uint16Array(this.count);
    this.predationCounts = new Uint16Array(this.count);
    this.alignmentCounts = new Uint16Array(this.count);
    this.threatCounts = new Uint16Array(this.count);
    this.pursuitTargets = new Int32Array(this.count);
    this.lastPursuitTargets = new Int32Array(this.count);
    this.chaseStartTimes = new Float64Array(this.count);
    this.targetAlignment = new Float32Array(this.count);
    this.targetDistance2 = new Float32Array(this.count);
    this.schoolRanges = [];
    let cursor = 0;
    for (
      let schoolIndex = 0;
      schoolIndex < config.schools.length;
      schoolIndex += 1
    ) {
      const start = cursor;
      cursor += this.derived.schools[schoolIndex].count;
      this.schoolRanges.push({ start, end: cursor });
      this.schoolIds.fill(schoolIndex, start, cursor);
    }
    if (this.scene?.add) {
      this.captureVfx = new CaptureVfx(
        this.scene,
        this.config.captureVfx,
        this.config.starvationVfx
      );
    }
    this._buildMesh();
    this._buildPlanktonMesh();
    this.reset(config.runtime.seed);
  }

  _buildMesh() {
    if (!this.scene?.add) {
      this.mesh = null;
      return;
    }
    const radialSegments = Math.max(
      3,
      Math.round(this.config.visual.radialSegments)
    );
    const geometry = new THREE.CapsuleGeometry(
      this.config.visual.bodyRadius,
      this.config.visual.bodyLength,
      2,
      radialSegments
    );
    geometry.rotateX(Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: this.config.visual.opacity < 1,
      opacity: this.config.visual.opacity,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, this.count);
    this.mesh.name = 'experiment-fish';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < this.count; index += 1) {
      const school = this.config.schools[this.schoolIds[index]];
      this.mesh.setColorAt(index, new THREE.Color(school.color));
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  _buildPlanktonMesh() {
    if (!this.scene?.add || this.config.plankton.visualCount <= 0) {
      this.planktonMesh = null;
      return;
    }
    const count = Math.max(
      0,
      Math.round(this.config.plankton.visualCount)
    );
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const rng = new SeededRng(
      (Number(this.config.runtime.seed) ^ 0x9e3779b9) >>> 0
    );
    const margin = this.config.tank.wallMargin;
    const half = [
      Math.max(0, this.config.tank.width / 2 - margin),
      Math.max(0, this.config.tank.height / 2 - margin),
      Math.max(0, this.config.tank.depth / 2 - margin),
    ];
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset] = rng.range(-half[0], half[0]);
      positions[offset + 1] = rng.range(-half[1], half[1]);
      positions[offset + 2] = rng.range(-half[2], half[2]);
    }
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    const material = new THREE.PointsMaterial({
      color: this.config.plankton.color,
      size: this.config.plankton.pointSize,
      transparent: true,
      opacity: this.config.plankton.opacity,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.planktonMesh = new THREE.Points(geometry, material);
    this.planktonMesh.name = 'experiment-plankton';
    this.planktonMesh.frustumCulled = false;
    this.scene.add(this.planktonMesh);
  }

  reset(seed = undefined) {
    // 每局随机种子：不然初始位置、初速度、wander 相位全部相同，
    // 而模拟本身是确定性的 —— 每局都会跑出一模一样的结果。
    if (seed === undefined) {
      seed = this.config.runtime.randomizeSeed
        ? (Math.random() * 0xffffffff) >>> 0
        : this.config.runtime.seed;
    }
    this.rng = new SeededRng(seed);
    this.seed = Number(seed);
    this.config.runtime.seed = this.seed;
    this.elapsed = 0;
    this.relations.reset();
    this.relationMatrix = this.relations.update(
      this.config.schools,
      this.config.relations
    );
    this.metricsState.pairCount = 0;
    this.metricsState.captures = 0;
    this.metricsState.dynamicContacts = 0;
    this.chaseTelemetry = new Map();
    this.deathCounts = this.config.schools.map(() => ({
      captured: 0,
      starved: 0,
    }));
    this.planktonLevel =
      this.config.plankton.capacity *
      this.config.plankton.initialFraction;
    this.planktonConsumed = 0;
    this.ecologyStatus = { state: 'running', winnerIndex: null };
    this.captureVfx?.reset();
    this.alive.fill(1);
    this.panic.fill(0);
    this.escapeDir.fill(0);
    this.lockedTargets.fill(-1);
    this.lockTimers.fill(0);
    this.alarm.fill(0);
    this.heardSignal.fill(0);
    this.panicHold.fill(0);
    this.refractory.fill(0);
    this.directLatch.fill(0);
    this.rollAngles.fill(0);
    this.prevHeadings.fill(0);
    // 初始能量必须有个体差异。原来同种族每条鱼起点完全相同，而代谢
    // 也是确定的（basalRate/size^0.75），所以第一波必然在同一秒集体饿死。
    {
      const capacity = this.config.ecology.energyCapacity;
      const base = capacity * this.config.ecology.initialEnergyRatio;
      const jitter = Math.max(0, this.config.ecology.initialEnergyJitter ?? 0);
      for (let index = 0; index < this.count; index += 1) {
        const factor = jitter > 0 ? 1 + this.rng.range(-jitter, jitter) : 1;
        this.energy[index] = Math.min(capacity, Math.max(0, base * factor));
      }
    }
    this.energyPools.fill(0);
    this.corpse.fill(0);
    this.corpseAge.fill(0);
    this.locomotionStates.fill(LOCOMOTION.CRUISE);
    this.pursuitTargets.fill(-1);
    this.targetAlignment.fill(-Infinity);
    this.targetDistance2.fill(Infinity);
    this.lastPursuitTargets.fill(-1);
    this.chaseStartTimes.fill(-1);
    this.hiddenFish = -1;

    for (
      let schoolIndex = 0;
      schoolIndex < this.config.schools.length;
      schoolIndex += 1
    ) {
      const school = this.config.schools[schoolIndex];
      const range = this.schoolRanges[schoolIndex];
      const rawMode = this.config.runtime.spawnMode;
      const spawnMode =
        rawMode === 'cluster' || rawMode === 'pods' ? rawMode : 'random';
      const center = [
        school.spawnRegion.centerX * this.config.tank.width,
        school.spawnRegion.centerY * this.config.tank.height,
        school.spawnRegion.centerZ * this.config.tank.depth,
      ];
      const heading = normalize3(
        school.initialHeading.x,
        school.initialHeading.y,
        school.initialHeading.z
      );
      const pursuitSchool = this.relationMatrix[schoolIndex].includes(
        'pursuit'
      );
      const period = pursuitSchool
        ? perPredatorCooldown(
            this.derived.schools[schoolIndex].count,
            effectiveSchoolCaptureRate(this.config, school),
            captureSpeedFactor(this.config, school)
          )
        : Infinity;
      const wall = this.config.tank.wallMargin;
      const half = [
        this.config.tank.width / 2 - wall,
        this.config.tank.height / 2 - wall,
        this.config.tank.depth / 2 - wall,
      ];

      // --- 分群出生（fission-fusion）---
      // 一个鱼种散成若干互不相邻的小群。合并与再分裂不需要额外逻辑：
      // 只要小群内间距 < cohesionRadius、小群间距 > cohesionRadius，
      // boids 自己就会维持小群、偶遇时合并、被冲散后重组。
      let podCenters = null;
      let podRadius = 0;
      if (spawnMode === 'pods') {
        const desired = Math.max(1, Math.round(school.podCount ?? 1));
        const count = Math.max(1, range.end - range.start);
        const pods = Math.min(desired, count);
        // 小群半径必须由【每群条数】推导，不能只看 cohesionRadius：
        //   群内平均间距 = podRadius × (4π/3m)^(1/3)，要求它 ≈ k × separationRadius
        //   → podRadius = k × sepR × (3m/4π)^(1/3)
        // 太小则整群出生即互斥爆开；太大则相邻小群表面进入 cohesionRadius，
        // 开局就并成一团（这是"看不出小群"的原因）。
        const perPod = count / pods;
        podRadius =
          (this.config.perception.podSpacingFactor ?? 1.5) *
          this.derived.schools[schoolIndex].separationRadius *
          Math.cbrt((3 * perPod) / (4 * Math.PI));
        podCenters = [];
        for (let p = 0; p < pods; p += 1) {
          let best = null;
          let bestScore = -Infinity;
          // 采样若干候选，挑离已有小群最远的那个，避免开局就挤在一起
          for (let attempt = 0; attempt < 12; attempt += 1) {
            const candidate = [
              this.rng.range(-half[0] + podRadius, half[0] - podRadius),
              this.rng.range(-half[1] + podRadius, half[1] - podRadius),
              this.rng.range(-half[2] + podRadius, half[2] - podRadius),
            ];
            let nearest = Infinity;
            for (const existing of podCenters) {
              const dx = candidate[0] - existing[0];
              const dy = candidate[1] - existing[1];
              const dz = candidate[2] - existing[2];
              nearest = Math.min(nearest, dx * dx + dy * dy + dz * dz);
            }
            if (nearest > bestScore) {
              bestScore = nearest;
              best = candidate;
            }
          }
          podCenters.push(best);
        }
      }

      for (let index = range.start; index < range.end; index += 1) {
        const podCenter = podCenters
          ? podCenters[(index - range.start) % podCenters.length]
          : null;
        let spawn =
          spawnMode === 'cluster'
            ? center.slice()
            : podCenter
            ? podCenter.slice()
            : [
                this.rng.range(-half[0], half[0]),
                this.rng.range(-half[1], half[1]),
                this.rng.range(-half[2], half[2]),
              ];
        for (
          let attempt = 0;
          attempt < this.config.runtime.initialSpawnAttempts;
          attempt += 1
        ) {
          let candidate;
          if (spawnMode === 'cluster' || podCenter) {
            const point = this.rng.inUnitSphere();
            const origin = podCenter ?? center;
            const radius = podCenter ? podRadius : school.spawnRegion.radius;
            candidate = [
              clamp(origin[0] + point[0] * radius, -half[0], half[0]),
              clamp(origin[1] + point[1] * radius, -half[1], half[1]),
              clamp(origin[2] + point[2] * radius, -half[2], half[2]),
            ];
          } else {
            candidate = [
              this.rng.range(-half[0], half[0]),
              this.rng.range(-half[1], half[1]),
              this.rng.range(-half[2], half[2]),
            ];
          }
          spawn = candidate;
          if (
            sceneClearance(candidate, this.config) >
            this.derived.schools[schoolIndex].visualLength / 2
          ) {
            break;
          }
        }
        set3(
          this.positions,
          index,
          spawn[0],
          spawn[1],
          spawn[2]
        );
        let direction;
        if (spawnMode === 'cluster') {
          const jitter = this.rng.unitVector();
          // 散布太窄会让整群列队同向出发，一起撞墙。
          const spread = this.config.perception.spawnHeadingJitter ?? 0.6;
          direction = normalize3(
            heading[0] + jitter[0] * spread,
            heading[1] + jitter[1] * spread,
            heading[2] + jitter[2] * spread
          );
        } else {
          direction = this.rng.unitVector();
        }
        set3(
          this.velocities,
          index,
          direction[0] * school.cruiseSpeed,
          direction[1] * school.cruiseSpeed,
          direction[2] * school.cruiseSpeed
        );
        if (Number.isFinite(period)) {
          this.initialCooldownPhases[index] = this.rng.next();
          this.cooldowns[index] =
            this.initialCooldownPhases[index] * period;
        } else {
          // Keep a deterministic latent phase for live tooling without
          // perturbing the established spawn/wander RNG sequence.
          const phaseSeed =
            (this.seed ^
              Math.imul(index + 1, 0x9e3779b1)) >>>
            0;
          this.initialCooldownPhases[index] =
            new SeededRng(phaseSeed).next();
          this.cooldowns[index] = Infinity;
        }
        this.wanderPhases[index] = this.rng.range(0, Math.PI * 2);
        // 原来频率只有 index%13 共 13 档，整群会呈现可见的周期同步。
        this.wanderRates[index] = this.rng.range(0.55, 0.95);
      }
    }
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this._syncVfxBounds();
    this._syncPlanktonVisual();
    this.updateMesh();
    return this;
  }

  setConfig(config, mode = 'live') {
    this.config = config;
    if (this.captureVfx) {
      this.captureVfx.params = config.captureVfx;
      this.captureVfx.starvationParams = config.starvationVfx;
    }
    this.derived = deriveExperiment(config);
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this.relationMatrix = this.relations.update(
      config.schools,
      config.relations
    );
    if (mode !== 'live') this.reset(config.runtime.seed);
    if (this.mesh) {
      this.mesh.material.opacity = config.visual.opacity;
      this.mesh.material.transparent = config.visual.opacity < 1;
      // 基色只在这里重置；耐力明度由 updateMesh 每帧按实时能量叠加。
      for (let index = 0; index < this.count; index += 1) {
        this.mesh.setColorAt(
          index,
          new THREE.Color(config.schools[this.schoolIds[index]].color)
        );
      }
      this.mesh.instanceColor.needsUpdate = true;
    }
    this._syncPlanktonVisual();
  }

  setLocomotionPreview(enabled) {
    const next = Boolean(enabled);
    if (next === this.locomotionPreview) return;
    this.locomotionPreview = next;
    if (!next) return;
    this._clearGameplayInteractionState();
  }

  _clearGameplayInteractionState() {
    // TUNING is a clean, non-scoring preview. Clearing every interaction
    // latch here guarantees a previous scene can never leak panic or pursuit
    // state into the selection screen.
    this.panic.fill(0);
    this.threatLevel.fill(0);
    this.neighborPanic.fill(0);
    this.neighborEvade.fill(0);
    this.emergencyAlign.fill(0);
    this.emergencyUrgency.fill(0);
    this.evadeForces.fill(0);
    this.escapeDir.fill(0);
    this.lockedTargets.fill(-1);
    this.lockTimers.fill(0);
    this.alarm.fill(0);
    this.heardSignal.fill(0);
    this.panicHold.fill(0);
    this.refractory.fill(0);
    this.directLatch.fill(0);
    this.pursuitTargets.fill(-1);
    this.lastPursuitTargets.fill(-1);
    this.chaseStartTimes.fill(-1);
    this.locomotionStates.fill(LOCOMOTION.CRUISE);
  }

  beginGameplayFromPreview() {
    const visibleMotion = {
      positions: this.positions.slice(),
      velocities: this.velocities.slice(),
      rollAngles: this.rollAngles.slice(),
      prevHeadings: this.prevHeadings.slice(),
      avoidanceDirections: this.avoidanceDirections.slice(),
    };
    this.locomotionPreview = false;
    // Reset from the submitted config so relation hysteresis, cooldowns,
    // energy and the future ecology RNG exactly match direct balance trials.
    // Restore only visible kinematics afterward; no frame is rendered between
    // reset and restore, so Start remains spatially continuous.
    this.reset(this.config.runtime.seed);
    this.positions.set(visibleMotion.positions);
    this.velocities.set(visibleMotion.velocities);
    this.rollAngles.set(visibleMotion.rollAngles);
    this.prevHeadings.set(visibleMotion.prevHeadings);
    this.avoidanceDirections.set(visibleMotion.avoidanceDirections);
    this.updateMesh();
  }

  _syncVfxBounds() {
    this.captureVfx?.setBounds?.([
      this.config.tank.width / 2,
      this.config.tank.height / 2,
      this.config.tank.depth / 2,
    ]);
  }

  _syncPlanktonVisual() {
    if (!this.planktonMesh) return;
    const visible =
      this.config.ecology?.enabled &&
      this.config.plankton.enabled;
    this.planktonMesh.visible = visible;
    const fraction =
      this.config.plankton.capacity > EPSILON
        ? clamp(
            this.planktonLevel / this.config.plankton.capacity,
            0,
            1
          )
        : 0;
    const visibleCount = visible
      ? Math.round(this.config.plankton.visualCount * fraction)
      : 0;
    this.planktonMesh.geometry.setDrawRange(0, visibleCount);
    this.planktonMesh.material.size = this.config.plankton.pointSize;
    this.planktonMesh.material.opacity = this.config.plankton.opacity;
    this.planktonMesh.material.color.set(this.config.plankton.color);
  }

  _clearAccumulators() {
    this.forces.fill(0);
    this.separation.fill(0);
    this.cohesionSums.fill(0);
    this.predationSums.fill(0);
    this.alignmentSums.fill(0);
    this.evadeForces.fill(0);
    this.sameNeighbors.fill(0);
    this.cohesionCounts.fill(0);
    this.predationCounts.fill(0);
    this.alignmentCounts.fill(0);
    this.threatCounts.fill(0);
    this.threatLevel.fill(0);
    this.neighborPanic.fill(0);
    this.heardSignal.fill(0);
    this.neighborEvade.fill(0);
    this.emergencyAlign.fill(0);
    this.emergencyUrgency.fill(0);
    this.pursuitTargets.fill(-1);
    this.targetAlignment.fill(-Infinity);
    this.targetDistance2.fill(Infinity);
    this.metricsState.pairCount = 0;
    this.metricsState.dynamicContacts = 0;
  }

  _telemetryFor(actorSchool, targetSchool) {
    const key = `${actorSchool}>${targetSchool}`;
    let record = this.chaseTelemetry.get(key);
    if (!record) {
      record = {
        starts: 0,
        pursuitFrames: 0,
        captures: 0,
        abandoned: 0,
        active: 0,
        completedDuration: 0,
        capturedDuration: 0,
        burstSeconds: 0,
      };
      this.chaseTelemetry.set(key, record);
    }
    return record;
  }

  _finishChase(predator, prey, captured) {
    if (prey < 0 || this.chaseStartTimes[predator] < 0) return;
    const actorSchool = this.schoolIds[predator];
    const targetSchool = this.schoolIds[prey];
    const record = this._telemetryFor(actorSchool, targetSchool);
    const duration = Math.max(
      0,
      this.elapsed - this.chaseStartTimes[predator]
    );
    record.completedDuration += duration;
    if (captured) {
      record.captures += 1;
      record.capturedDuration += duration;
    } else {
      record.abandoned += 1;
    }
    this.lastPursuitTargets[predator] = -1;
    this.chaseStartTimes[predator] = -1;
  }

  _updateChaseTelemetry(dt) {
    for (const record of this.chaseTelemetry.values()) record.active = 0;
    for (let predator = 0; predator < this.count; predator += 1) {
      if (!this.alive[predator]) {
        this._finishChase(
          predator,
          this.lastPursuitTargets[predator],
          false
        );
        continue;
      }
      const next = this.pursuitTargets[predator];
      const previous = this.lastPursuitTargets[predator];
      if (next !== previous) {
        this._finishChase(predator, previous, false);
        if (next >= 0 && this.alive[next]) {
          const actorSchool = this.schoolIds[predator];
          const targetSchool = this.schoolIds[next];
          const record = this._telemetryFor(actorSchool, targetSchool);
          record.starts += 1;
          this.lastPursuitTargets[predator] = next;
          this.chaseStartTimes[predator] = this.elapsed;
        }
      }
      const activeTarget = this.lastPursuitTargets[predator];
      if (activeTarget < 0 || !this.alive[activeTarget]) continue;
      const record = this._telemetryFor(
        this.schoolIds[predator],
        this.schoolIds[activeTarget]
      );
      record.active += 1;
      record.pursuitFrames += 1;
      if (this.locomotionStates[predator] === LOCOMOTION.BURST) {
        record.burstSeconds += dt;
      }
    }
  }

  _sameSchoolPair(
    i,
    j,
    dx,
    dy,
    dz,
    distance2,
    interactionsEnabled = true
  ) {
    const schoolIndex = this.schoolIds[i];
    const derived = this.derived.schools[schoolIndex];
    const perception = this.config.perception;
    const relations = this.config.relations;

    // --- 视锥：只门控 alignment / cohesion，separation 保持全向 ---
    // 前向视锥打破配对对称性 → 方向信息必须逐层传播，而不是瞬间同步。
    // 这是"像鱼群"而不是"像一坨粒子"的主要来源。
    let seeIJ = true;
    let seeJI = true;
    if (perception.fovDegrees < 360) {
      const cosHalf = Math.cos((perception.fovDegrees * Math.PI) / 360);
      const inverse = 1 / Math.sqrt(Math.max(distance2, EPSILON));
      const io = i * 3;
      const jo = j * 3;
      const hi = normalize3(
        this.velocities[io],
        this.velocities[io + 1],
        this.velocities[io + 2]
      );
      const hj = normalize3(
        this.velocities[jo],
        this.velocities[jo + 1],
        this.velocities[jo + 2]
      );
      seeIJ = (dx * hi[0] + dy * hi[1] + dz * hi[2]) * inverse >= cosHalf;
      seeJI = (-dx * hj[0] - dy * hj[1] - dz * hj[2]) * inverse >= cosHalf;
    }

    // --- 应急对齐：恐慌航向走独立通道 ---
    const signalRadius = derived.alignmentRadius * relations.signalRadiusFactor;
    const signalRadius2 = signalRadius * signalRadius;
    const emitEmergency = (receiver, sender, canSee) => {
      if (!canSee || distance2 >= signalRadius2) return false;
      const urgency = this.panic[sender];
      if (urgency < relations.signalThreshold) return false;
      const distance = Math.sqrt(Math.max(distance2, EPSILON));
      const proximity = 1 - distance / signalRadius;
      const boost = relations.alignmentSourceBoost;
      const weight = proximity * urgency * (1 + boost * urgency * urgency);
      if (weight <= 1e-6) return false;
      const so = sender * 3;
      const heading = normalize3(
        this.velocities[so],
        this.velocities[so + 1],
        this.velocities[so + 2]
      );
      add3(
        this.emergencyAlign,
        receiver,
        heading[0] * weight,
        heading[1] * weight,
        heading[2] * weight
      );
      const urgencySignal = proximity * urgency;
      if (urgencySignal > this.emergencyUrgency[receiver]) {
        this.emergencyUrgency[receiver] = urgencySignal;
      }
      return true;
    };
    const emergencyIJ = interactionsEnabled
      ? emitEmergency(i, j, seeIJ)
      : false;
    const emergencyJI = interactionsEnabled
      ? emitEmergency(j, i, seeJI)
      : false;

    if (distance2 <= derived.cohesionRadius ** 2) {
      this.sameNeighbors[i] += 1;
      this.sameNeighbors[j] += 1;
      // 惊扰波：恐慌与逃逸方向沿邻居链传播（读的是上一帧的值）。
      // 同样走视锥 —— 波因此有方向性，而不是向四面八方瞬间铺开。
      const jo3 = j * 3;
      const io3 = i * 3;
      if (interactionsEnabled && seeIJ) {
        // 社会信号传的是 alarm【脉冲】，不是 panic 值 —— 脉冲会衰减到零，
        // 不会像连续值那样在鱼群里无限回响。
        const signal =
          this.alarm[j] * (1 - Math.sqrt(distance2) / derived.cohesionRadius);
        if (signal > this.heardSignal[i]) this.heardSignal[i] = signal;
        if (this.panic[j] > this.neighborPanic[i]) {
          this.neighborPanic[i] = this.panic[j];
        }
        add3(
          this.neighborEvade,
          i,
          this.escapeDir[jo3],
          this.escapeDir[jo3 + 1],
          this.escapeDir[jo3 + 2]
        );
      }
      if (interactionsEnabled && seeJI) {
        const signalBack =
          this.alarm[i] * (1 - Math.sqrt(distance2) / derived.cohesionRadius);
        if (signalBack > this.heardSignal[j]) this.heardSignal[j] = signalBack;
        if (this.panic[i] > this.neighborPanic[j]) {
          this.neighborPanic[j] = this.panic[i];
        }
        add3(
          this.neighborEvade,
          j,
          this.escapeDir[io3],
          this.escapeDir[io3 + 1],
          this.escapeDir[io3 + 2]
        );
      }
      // cohesion 权重：'inverse' 时按 1/(d²+ε) 加权。
      // 这是拓扑式交互的廉价近似（Ballerini 等人发现椋鸟只跟约 7 个最近邻
      // 互动，与距离无关）。效果是每条鱼被【自己所在的小群】主导，
      // 远处的另一个小群拉不动它 —— 小群才能维持，而不是一碰就并成一团。
      let cohW = 1;
      if (perception.cohesionFalloff === 'inverse') {
        const soft = derived.cohesionRadius * 0.15;
        cohW = 1 / (distance2 + soft * soft);
      }
      if (seeIJ) {
        this.cohesionCounts[i] += cohW;
        add3(
          this.cohesionSums,
          i,
          this.positions[j * 3] * cohW,
          this.positions[j * 3 + 1] * cohW,
          this.positions[j * 3 + 2] * cohW
        );
      }
      if (seeJI) {
        this.cohesionCounts[j] += cohW;
        add3(
          this.cohesionSums,
          j,
          this.positions[i * 3] * cohW,
          this.positions[i * 3 + 1] * cohW,
          this.positions[i * 3 + 2] * cohW
        );
      }
    }
    if (distance2 <= derived.alignmentRadius ** 2) {
      if (seeIJ && !emergencyIJ) {
        this.alignmentCounts[i] += 1;
        add3(
          this.alignmentSums,
          i,
          this.velocities[j * 3],
          this.velocities[j * 3 + 1],
          this.velocities[j * 3 + 2]
        );
      }
      if (seeJI && !emergencyJI) {
        this.alignmentCounts[j] += 1;
        add3(
          this.alignmentSums,
          j,
          this.velocities[i * 3],
          this.velocities[i * 3 + 1],
          this.velocities[i * 3 + 2]
        );
      }
    }
    if (distance2 <= derived.separationRadius ** 2) {
      // Identical positions produce 0 * Infinity = NaN; skip or floor distance.
      if (distance2 <= EPSILON) {
        // Deterministic tiny push so overlapping agents do not poison forces.
        const push = 1 / EPSILON;
        add3(this.separation, i, -push, 0, 0);
        add3(this.separation, j, push, 0, 0);
      } else {
        const distance = Math.sqrt(distance2);
        const radius = derived.separationRadius;
        // 原版默认 inverse：近距离斥力远强于线性，鱼群能压得很紧而不穿模
        let scale;
        if (perception.separationFalloff === 'linear') {
          scale = (radius - distance) / (radius * distance);
        } else if (perception.separationFalloff === 'invlog') {
          scale = Math.log(radius / distance) / distance;
        } else {
          scale = 1 / distance2;
        }
        add3(this.separation, i, -dx * scale, -dy * scale, -dz * scale);
        add3(this.separation, j, dx * scale, dy * scale, dz * scale);
      }
    }
  }

  _crossSchoolPair(
    i,
    j,
    dx,
    dy,
    dz,
    distance2,
    interactionsEnabled = true
  ) {
    const schoolI = this.schoolIds[i];
    const schoolJ = this.schoolIds[j];
    const configSchoolI = this.config.schools[schoolI];
    const configSchoolJ = this.config.schools[schoolJ];
    const distance = Math.sqrt(Math.max(EPSILON, distance2));
    const crossRadius =
      this.config.perception.crossSeparationScale *
      Math.max(configSchoolI.size, configSchoolJ.size);
    if (distance < crossRadius) {
      const strength = 1 - distance / crossRadius;
      const scale = strength / distance;
      add3(this.separation, i, -dx * scale, -dy * scale, -dz * scale);
      add3(this.separation, j, dx * scale, dy * scale, dz * scale);
    }

    if (interactionsEnabled) {
      this._directedRelation(i, j, dx, dy, dz, distance, distance2);
      this._directedRelation(j, i, -dx, -dy, -dz, distance, distance2);
    }
  }

  _directedRelation(
    actor,
    target,
    dx,
    dy,
    dz,
    distance,
    distance2
  ) {
    const actorSchool = this.schoolIds[actor];
    const targetSchool = this.schoolIds[target];
    const relation = this.relationMatrix[actorSchool][targetSchool];
    if (relation !== 'pursuit') return;
    const actorDetection =
      this.derived.schools[actorSchool].detectionLength;
    // 第一层：远距离朝猎物群质心巡航。独立捕食者版本用的是
    // schoolSenseRadius 1.0，比 detectionLength 大 6 倍 —— 所以它会从很远
    // 处平滑靠拢，而不是贴近了才猛窜。
    const senseRadius =
      actorDetection * this.config.relations.schoolSenseFactor;
    if (distance2 <= senseRadius * senseRadius) {
      add3(
        this.predationSums,
        actor,
        this.positions[target * 3],
        this.positions[target * 3 + 1],
        this.positions[target * 3 + 2]
      );
      this.predationCounts[actor] += 1;
    }

    const burstRadius =
      actorDetection * this.config.relations.burstRadiusFactor;
    if (distance2 <= burstRadius * burstRadius) {
      const actorOffset = actor * 3;
      const speed = normalize3(
        this.velocities[actorOffset],
        this.velocities[actorOffset + 1],
        this.velocities[actorOffset + 2]
      );
      const inverseDistance = 1 / Math.max(distance, EPSILON);
      const alignment =
        speed[0] * dx * inverseDistance +
        speed[1] * dy * inverseDistance +
        speed[2] * dz * inverseDistance;
      if (
        alignment > this.targetAlignment[actor] ||
        (alignment === this.targetAlignment[actor] &&
          distance2 < this.targetDistance2[actor])
      ) {
        this.pursuitTargets[actor] = target;
        this.targetAlignment[actor] = alignment;
        this.targetDistance2[actor] = distance2;
      }
    }

    // directThreat belongs to the prey and is proximity-driven. It does
    // not care whether this predator won target selection or is cooling down.
    const preyDetection =
      this.derived.schools[targetSchool].panicRadius;
    if (distance2 <= preyDetection * preyDetection) {
      this.threatCounts[target] += 1;
      // 距离衰减：贴脸的捕食者和边缘的捕食者不该产生同样的恐慌。
      // 没有这一条，小缸里所有鱼永远处于满恐慌。
      const proximity = 1 - distance / Math.max(preyDetection, EPSILON);
      if (proximity > this.threatLevel[target]) {
        this.threatLevel[target] = proximity;
      }
      // 逃向捕食者【预测位置】的反方向，而不是它此刻在哪
      const lead = this.config.relations.escapePredictionTime;
      const ao = actor * 3;
      // dx 由 actor(捕食者) 指向 target(猎物)。捕食者前进 vel*lead 之后，
      // 从它的未来位置指向猎物的向量 = dx − vel*lead。
      const px = dx - this.velocities[ao] * lead;
      const py = dy - this.velocities[ao + 1] * lead;
      const pz = dz - this.velocities[ao + 2] * lead;
      const inverse = 1 / Math.max(Math.hypot(px, py, pz), EPSILON);
      const awayX = px * inverse;
      const awayY = py * inverse;
      const awayZ = pz * inverse;
      const velocityOffset = target * 3;
      const lateral = normalize3(
        this.velocities[velocityOffset + 1] * awayZ -
          this.velocities[velocityOffset + 2] * awayY,
        this.velocities[velocityOffset + 2] * awayX -
          this.velocities[velocityOffset] * awayZ,
        this.velocities[velocityOffset] * awayY -
          this.velocities[velocityOffset + 1] * awayX
      );
      add3(
        this.evadeForces,
        target,
        awayX +
          lateral[0] * this.config.relations.evadeLateralWeight,
        awayY +
          lateral[1] * this.config.relations.evadeLateralWeight,
        awayZ +
          lateral[2] * this.config.relations.evadeLateralWeight
      );
    }
  }

  _pairPasses(interactionsEnabled = true) {
    this.hash.forEachPair((i, j) => {
      this.metricsState.pairCount += 1;
      const io = i * 3;
      const jo = j * 3;
      const dx = this.positions[jo] - this.positions[io];
      const dy = this.positions[jo + 1] - this.positions[io + 1];
      const dz = this.positions[jo + 2] - this.positions[io + 2];
      const distance2 = dx * dx + dy * dy + dz * dz;
      if (this.schoolIds[i] === this.schoolIds[j]) {
        this._sameSchoolPair(
          i,
          j,
          dx,
          dy,
          dz,
          distance2,
          interactionsEnabled
        );
      }
    });
    this.hash.forEachPair((i, j) => {
      if (this.schoolIds[i] === this.schoolIds[j]) return;
      const io = i * 3;
      const jo = j * 3;
      const dx = this.positions[jo] - this.positions[io];
      const dy = this.positions[jo + 1] - this.positions[io + 1];
      const dz = this.positions[jo + 2] - this.positions[io + 2];
      const distance2 = dx * dx + dy * dy + dz * dz;
      this._crossSchoolPair(
        i,
        j,
        dx,
        dy,
        dz,
        distance2,
        interactionsEnabled
      );
    });
  }

  _boundaryForce(index) {
    const offset = index * 3;
    const half = [
      this.config.tank.width / 2,
      this.config.tank.height / 2,
      this.config.tank.depth / 2,
    ];
    const softness = this.config.tank.edgeSoftness;
    const force = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      const value = this.positions[offset + axis];
      const negativeDistance = value + half[axis];
      const positiveDistance = half[axis] - value;
      if (negativeDistance < softness) {
        force[axis] += 1 - negativeDistance / softness;
      }
      if (positiveDistance < softness) {
        force[axis] -= 1 - positiveDistance / softness;
      }
    }
    return force;
  }

  _energyRatio(index) {
    const capacity = Math.max(EPSILON, this.config.ecology.energyCapacity);
    return this.energy[index] / capacity;
  }

  _canBurst(index) {
    if (!this.config.ecology?.enabled) return true;
    const minRatio = Number.isFinite(this.config.ecology.minBurstEnergyRatio)
      ? this.config.ecology.minBurstEnergyRatio
      : 1 / 3;
    return this._energyRatio(index) >= minRatio;
  }

  _movementState(index, target, threatened) {
    const state =
      target >= 0 && this.alive[target] && this._canBurst(index)
        ? 'burst'
        : threatened
          ? 'evade'
          : 'cruise';
    this.locomotionStates[index] =
      state === 'burst'
        ? LOCOMOTION.BURST
        : state === 'evade'
          ? LOCOMOTION.EVADE
          : LOCOMOTION.CRUISE;
    return state;
  }

  _resolveLock(index, dt) {
    const previous = this.lockedTargets[index];
    this.lockTimers[index] = Math.max(0, this.lockTimers[index] - dt);
    const stillValid =
      previous >= 0 && this.alive[previous] && this.lockTimers[index] > 0;
    if (stillValid) {
      // 锁定期内沿用旧目标，即使本帧选出了更"顺"的一条
      this.pursuitTargets[index] = previous;
      return;
    }
    const fresh = this.pursuitTargets[index];
    if (fresh >= 0 && this.alive[fresh]) {
      this.lockedTargets[index] = fresh;
      this.lockTimers[index] = this.config.relations.targetLockTime;
    } else {
      this.lockedTargets[index] = -1;
      this.lockTimers[index] = 0;
    }
  }

  _steerFish(index, dt, interactionsEnabled = true) {
    if (!this.alive[index]) return;
    if (interactionsEnabled) this._resolveLock(index, dt);
    const offset = index * 3;
    const schoolIndex = this.schoolIds[index];
    const school = this.config.schools[schoolIndex];
    const cohesionCount = this.cohesionCounts[index];
    const alignmentCount = this.alignmentCounts[index];

    // --- 恐慌：先算，因为它要放大 alignment / cohesion ---
    // 自己看见的（连续，按距离衰减） vs 从邻居继承的（惊扰波）
    const relations = this.config.relations;
    // --- 脉冲/闩锁式恐慌 ---
    // 直接威胁走滞回：越过 directOn 才闩上，掉到 directOff 以下才松开。
    let panic = 0;
    if (interactionsEnabled) {
      const threat = this.threatLevel[index];
      const wasLatched = this.directLatch[index] === 1;
      if (!wasLatched && threat >= relations.directOn) {
        this.directLatch[index] = 1;
      } else if (wasLatched && threat < relations.directOff) {
        this.directLatch[index] = 0;
      }
      const latched = this.directLatch[index] === 1;
      const enteredDirect = latched && !wasLatched;

      this.panicHold[index] = Math.max(0, this.panicHold[index] - dt);
      this.refractory[index] = Math.max(0, this.refractory[index] - dt);

      // 社会触发：收到的脉冲够强、自己没被直接威胁闩住、且不在不应期内。
      // 不应期是关键 —— 没有它，脉冲会在鱼群里来回反射永不停止。
      let emitPulse = enteredDirect;
      if (
        !latched &&
        this.heardSignal[index] >= relations.signalThreshold &&
        this.refractory[index] <= 0
      ) {
        emitPulse = true;
        this.refractory[index] = relations.refractoryTime;
      }
      if (emitPulse) this.panicHold[index] = relations.holdTime;
      if (enteredDirect) {
        this.refractory[index] = Math.max(
          this.refractory[index],
          relations.refractoryTime
        );
      }

      // 惊吓期间恐慌被【钉在满值】，这才有四散而逃
      const panicTarget = Math.max(
        latched ? threat : 0,
        this.panicHold[index] > 0 ? 1 : 0
      );
      const rising = panicTarget > this.panic[index];
      this.panic[index] = approach(
        this.panic[index],
        panicTarget,
        rising ? relations.panicRiseRate : relations.panicDecayRate,
        dt
      );
      this.alarm[index] = emitPulse
        ? 1
        : this.alarm[index] *
          Math.exp(-dt / Math.max(relations.signalDecayTime, 1e-6));
      panic = this.panic[index];
    }
    // 受惊时凝聚力下降 —— flash expansion（原版验证过的方向）。
    // 同步不靠放大 alignmentWeight，而靠下面独立的应急对齐通道。
    // 冲刺时压低社交权重（而不是把追击力放大 10 倍）。捕食者会"脱队扑食"，
    // 但整体力量级不变，运动仍然平滑；松开后自己归队。
    const lockedOn =
      interactionsEnabled &&
      this.pursuitTargets[index] >= 0 && this.alive[this.pursuitTargets[index]];
    const socialScale = lockedOn
      ? this.config.locomotion.burstSocialSuppression
      : 1;
    // 体型越大越倾向个体行动：社群权重按 size^-exponent 衰减。
    // 真实生态里小鱼靠成群反捕食，大鱼基本独来独往。
    const sizeSocial = Math.pow(
      Math.max(school.size, EPSILON),
      -this.config.perception.socialSizeExponent
    );
    const cohesionWeight =
      school.cohesionWeight *
      Math.max(0, 1 - panic * relations.cohesionDrop) *
      socialScale *
      sizeSocial;
    // 接收方增益：自己越慌，越会去听邻居 —— 波才能一层层推下去
    const receiverBoost = interactionsEnabled
      ? Math.min(
          1 + relations.alignmentReceiverBoost * this.neighborPanic[index],
          relations.alignmentReceiverMax
        )
      : 1;
    const alignmentWeight =
      school.alignmentWeight * receiverBoost * socialScale * sizeSocial;

    const vx = this.velocities[offset];
    const vy = this.velocities[offset + 1];
    const vz = this.velocities[offset + 2];
    const ruleMaxSpeed = school.maxSpeed;
    const ruleMaxForce = this.config.locomotion.maxForce;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    const applyRule = (dxr, dyr, dzr, weight) => {
      if (weight === 0) return;
      steerToward(
        dxr,
        dyr,
        dzr,
        vx,
        vy,
        vz,
        ruleMaxSpeed,
        ruleMaxForce,
        STEER_SCRATCH
      );
      fx += STEER_SCRATCH[0] * weight;
      fy += STEER_SCRATCH[1] * weight;
      fz += STEER_SCRATCH[2] * weight;
    };

    // 分离在恐慌时用更高的 safetySpeed —— 逃窜中互相让位的力更强
    const safetySpeed = ruleMaxSpeed * (1 + 0.25 * panic);
    steerToward(
      this.separation[offset],
      this.separation[offset + 1],
      this.separation[offset + 2],
      vx,
      vy,
      vz,
      safetySpeed,
      ruleMaxForce,
      STEER_SCRATCH
    );
    fx += STEER_SCRATCH[0] * school.separationWeight;
    fy += STEER_SCRATCH[1] * school.separationWeight;
    fz += STEER_SCRATCH[2] * school.separationWeight;
    if (cohesionCount > 0) {
      applyRule(
        this.cohesionSums[offset] / cohesionCount - this.positions[offset],
        this.cohesionSums[offset + 1] / cohesionCount -
          this.positions[offset + 1],
        this.cohesionSums[offset + 2] / cohesionCount -
          this.positions[offset + 2],
        cohesionWeight
      );
    }
    if (alignmentCount > 0) {
      applyRule(
        this.alignmentSums[offset] / alignmentCount,
        this.alignmentSums[offset + 1] / alignmentCount,
        this.alignmentSums[offset + 2] / alignmentCount,
        alignmentWeight
      );
    }

    // 逃逸方向：自己看见了就用自己的，没看见就用邻居传来的。
    // 这样没看见捕食者的鱼也会跟着整群一起转向。
    // 原版设计声明：只有【直接】感知到捕食者的鱼才获得几何逃逸向量。
    // 社会性恐慌的鱼只知道邻居的航向，不知道捕食者的位置 —— 否则等于全知。
    const ex = this.evadeForces[offset];
    const ey = this.evadeForces[offset + 1];
    const ez = this.evadeForces[offset + 2];
    const escapeMagnitude = Math.hypot(ex, ey, ez);
    if (escapeMagnitude > EPSILON) {
      const inverseEscape = 1 / escapeMagnitude;
      this.escapeDir[offset] = ex * inverseEscape;
      this.escapeDir[offset + 1] = ey * inverseEscape;
      this.escapeDir[offset + 2] = ez * inverseEscape;
    } else {
      this.escapeDir[offset] = 0;
      this.escapeDir[offset + 1] = 0;
      this.escapeDir[offset + 2] = 0;
    }
    // 应急对齐：一条鱼看见危险，它的航向会压过二十条镇定邻居的平均值。
    // 这是惊扰波真正的载体。
    if (interactionsEnabled && this.emergencyUrgency[index] > 0) {
      const emergency = normalize3(
        this.emergencyAlign[offset],
        this.emergencyAlign[offset + 1],
        this.emergencyAlign[offset + 2]
      );
      applyRule(
        emergency[0],
        emergency[1],
        emergency[2],
        relations.emergencyAlignmentWeight * this.emergencyUrgency[index]
      );
    }

    // 逃逸强度随恐慌连续变化，不再是"看见/没看见"的开关
    const directThreat = interactionsEnabled
      ? this.threatLevel[index]
      : 0;
    const threatened =
      interactionsEnabled && panic > relations.panicMinTrigger;
    if (directThreat > 0) {
      applyRule(
        this.escapeDir[offset],
        this.escapeDir[offset + 1],
        this.escapeDir[offset + 2],
        relations.evadeWeight * directThreat
      );
    }

    const localPredationCount = interactionsEnabled
      ? this.predationCounts[index]
      : 0;
    if (localPredationCount > 0) {
      applyRule(
        this.predationSums[offset] / localPredationCount -
          this.positions[offset],
        this.predationSums[offset + 1] / localPredationCount -
          this.positions[offset + 1],
        this.predationSums[offset + 2] / localPredationCount -
          this.positions[offset + 2],
        this.config.relations.pursuitWeight
      );
    }

    const target = interactionsEnabled
      ? this.pursuitTargets[index]
      : -1;
    if (target >= 0 && this.alive[target] && this._canBurst(index)) {
      const targetOffset = target * 3;
      const distance = Math.sqrt(this.targetDistance2[index]);
      const lookAhead = Math.min(
        this.config.locomotion.interceptLookAhead,
        distance / Math.max(EPSILON, school.maxSpeed)
      );
      const ix =
        this.positions[targetOffset] +
        this.velocities[targetOffset] * lookAhead;
      const iy =
        this.positions[targetOffset + 1] +
        this.velocities[targetOffset + 1] * lookAhead;
      const iz =
        this.positions[targetOffset + 2] +
        this.velocities[targetOffset + 2] * lookAhead;
      const pursuit = normalize3(
        ix - this.positions[offset],
        iy - this.positions[offset + 1],
        iz - this.positions[offset + 2]
      );
      // 冲刺追击也走归一化转向。原来是裸力 ×10，量级是其它所有规则总和的
      // 2 倍以上，且不减速度、不钳 maxForce —— 锁定目标的鱼等于脱离了鱼群，
      // 这就是多群下"像离子对撞"的直接来源。
      applyRule(
        pursuit[0],
        pursuit[1],
        pursuit[2],
        this.config.relations.burstWeight
      );
    }

    // 边界力的【量级】就是紧急度（软斜坡 0..1）。steerToward 会 normalize
    // 方向，所以必须把斜坡量级作为权重带回来，否则一进边界区就吃满力、硬弹。
    const boundary = this._boundaryForce(index);
    const boundaryUrgency = Math.min(
      1,
      Math.hypot(boundary[0], boundary[1], boundary[2])
    );
    if (boundaryUrgency > EPSILON) {
      applyRule(
        boundary[0],
        boundary[1],
        boundary[2],
        this.config.locomotion.boundaryWeight *
          boundaryUrgency *
          (1 + boundaryUrgency * 2)
      );
    }

    const point = [
      this.positions[offset],
      this.positions[offset + 1],
      this.positions[offset + 2],
    ];
    const query = this.distanceField?.query(point);
    if (query && query.clearance < this.config.tank.edgeSoftness) {
      const closeness =
        1 -
        clamp(
          query.clearance / Math.max(EPSILON, this.config.tank.edgeSoftness),
          0,
          1
        );
      const inertia = this.config.locomotion.avoidanceInertia;
      this.avoidanceDirections[offset] =
        this.avoidanceDirections[offset] * inertia +
        query.gradient[0] * (1 - inertia);
      this.avoidanceDirections[offset + 1] =
        this.avoidanceDirections[offset + 1] * inertia +
        query.gradient[1] * (1 - inertia);
      this.avoidanceDirections[offset + 2] =
        this.avoidanceDirections[offset + 2] * inertia +
        query.gradient[2] * (1 - inertia);
      const suppression = Math.max(
        0.15,
        1 -
          this.panic[index] *
            this.config.locomotion.panicAvoidanceSuppression
      );
      const weight =
        this.config.locomotion.avoidanceWeight * closeness * suppression;
      fx += this.avoidanceDirections[offset] * weight;
      fy += this.avoidanceDirections[offset + 1] * weight;
      fz += this.avoidanceDirections[offset + 2] * weight;
    }

    this.wanderPhases[index] += dt * this.wanderRates[index];
    const phase = this.wanderPhases[index];
    fx += Math.sin(phase * 1.31) * this.config.locomotion.wanderWeight;
    fy += Math.sin(phase * 1.73 + 2.1) * this.config.locomotion.wanderWeight;
    fz += Math.cos(phase * 1.17) * this.config.locomotion.wanderWeight;

    const dynamic = interactionsEnabled
      ? this.physics?.interactFish(point, [
          this.velocities[offset],
          this.velocities[offset + 1],
          this.velocities[offset + 2],
        ])
      : null;
    if (dynamic) {
      fx += dynamic.force[0] * this.config.locomotion.avoidanceWeight;
      fy += dynamic.force[1] * this.config.locomotion.avoidanceWeight;
      fz += dynamic.force[2] * this.config.locomotion.avoidanceWeight;
      this.metricsState.dynamicContacts += dynamic.contacts;
    }

    const force = normalize3(fx, fy, fz);
    // 冲刺时给一点额外力预算即可。原来是 ×burstWeight(10)，
    // 直接把总力钳制从 5.2 抬到 52，等于取消了钳制。
    const forceBudget =
      target >= 0 && this.alive[target]
        ? this.config.locomotion.maxForce *
          this.config.locomotion.burstForceBudget
        : this.config.locomotion.maxForce;
    const forceMagnitude = Math.min(
      forceBudget,
      force[3]
    );
    const oldVx = this.velocities[offset];
    const oldVy = this.velocities[offset + 1];
    const oldVz = this.velocities[offset + 2];
    let nextVx = oldVx + force[0] * forceMagnitude * dt;
    let nextVy = oldVy + force[1] * forceMagnitude * dt;
    let nextVz = oldVz + force[2] * forceMagnitude * dt;
    const nextDirection = normalize3(nextVx, nextVy, nextVz);
    const oldDirection = normalize3(oldVx, oldVy, oldVz);
    const dot = clamp(
      oldDirection[0] * nextDirection[0] +
        oldDirection[1] * nextDirection[1] +
        oldDirection[2] * nextDirection[2],
      -1,
      1
    );
    const angle = Math.acos(dot);
    // 冲刺中转向能力大幅下降：猎物一躲，捕食者会冲过头再绕回来。
    // 直接用本帧的锁定状态，避免读到上一帧的 locomotionStates。
    const burstingNow = target >= 0 && this.alive[target];
    const turnSpeed =
      effectiveTurnSpeed(this.config, school) *
      (burstingNow ? this.config.locomotion.burstTurnFactor : 1) *
      (1 + this.panic[index] * this.config.relations.panicTurnBoost);
    const turnAlpha =
      angle <= EPSILON
        ? 1
        : Math.min(1, (turnSpeed * dt) / angle);
    let turned = normalize3(
      oldDirection[0] * (1 - turnAlpha) + nextDirection[0] * turnAlpha,
      oldDirection[1] * (1 - turnAlpha) + nextDirection[1] * turnAlpha,
      oldDirection[2] * (1 - turnAlpha) + nextDirection[2] * turnAlpha
    );
    // 俯仰钳制：鱼不像潜艇那样垂直上下游。没有这条，逃窜时会直上直下。
    const maxPitch = (this.config.locomotion.maxPitchDegrees * Math.PI) / 180;
    const horizontal = Math.hypot(turned[0], turned[2]);
    const pitch = Math.atan2(turned[1], Math.max(horizontal, EPSILON));
    if (Math.abs(pitch) > maxPitch) {
      turned = normalize3(
        turned[0],
        Math.max(horizontal, EPSILON) * Math.tan(Math.sign(pitch) * maxPitch),
        turned[2]
      );
    }
    let desiredSpeed = nextDirection[3];
    const cruiseSpeed =
      school.cruiseSpeed * sustainedSpeedScale(this.config, school);
    if (desiredSpeed < cruiseSpeed) {
      desiredSpeed = approach(desiredSpeed, cruiseSpeed, 3, dt);
    }
    const state = this._movementState(index, target, threatened);
    const maxSpeed = effectiveMaxSpeed(this.config, school, state);
    desiredSpeed = Math.min(maxSpeed, desiredSpeed);
    nextVx = turned[0] * desiredSpeed;
    nextVy = turned[1] * desiredSpeed;
    nextVz = turned[2] * desiredSpeed;
    set3(this.velocities, index, nextVx, nextVy, nextVz);
  }

  _integrate(index, dt) {
    if (!this.alive[index]) return;
    const offset = index * 3;
    this.positions[offset] += this.velocities[offset] * dt;
    this.positions[offset + 1] += this.velocities[offset + 1] * dt;
    this.positions[offset + 2] += this.velocities[offset + 2] * dt;
    const half = [
      this.config.tank.width / 2 - this.config.tank.wallMargin,
      this.config.tank.height / 2 - this.config.tank.wallMargin,
      this.config.tank.depth / 2 - this.config.tank.wallMargin,
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      if (this.positions[offset + axis] < -half[axis]) {
        this.positions[offset + axis] = -half[axis];
        this.velocities[offset + axis] = Math.abs(
          this.velocities[offset + axis]
        );
      } else if (this.positions[offset + axis] > half[axis]) {
        this.positions[offset + axis] = half[axis];
        this.velocities[offset + axis] = -Math.abs(
          this.velocities[offset + axis]
        );
      }
    }
  }

  _activeSchoolCount(schoolIndex) {
    const range = this.schoolRanges[schoolIndex];
    let count = 0;
    for (let index = range.start; index < range.end; index += 1) {
      count += this.alive[index];
    }
    return count;
  }

  /** 浮尸缓慢上浮到水面并停在那里。 */
  _floatCorpses(dt) {
    const rise = Math.max(0, this.config.ecology.corpseRiseSpeed ?? 0.06);
    const fade = Math.max(
      0.01,
      this.config.ecology.corpseFadeTime ?? 1.6
    );
    const drag = Math.max(0, this.config.ecology.corpseDrag ?? 2.4);
    const margin = this.config.tank.wallMargin;
    const half = [
      this.config.tank.width / 2 - margin,
      this.config.tank.height / 2 - margin,
      this.config.tank.depth / 2 - margin,
    ];
    for (let index = 0; index < this.count; index += 1) {
      if (!this.corpse[index]) continue;
      this.corpseAge[index] += dt;
      const t = Math.min(1, this.corpseAge[index] / fade);
      const offset = index * 3;
      // 残余动量指数衰减 —— 滑行一段后停住
      const damping = Math.exp(-drag * dt);
      this.velocities[offset] *= damping;
      this.velocities[offset + 1] *= damping;
      this.velocities[offset + 2] *= damping;
      // 上浮渐入：刚死时几乎不动，随渐变推进逐渐浮起
      const vy = this.velocities[offset + 1] + rise * t;
      this.positions[offset] += this.velocities[offset] * dt;
      this.positions[offset + 1] += vy * dt;
      this.positions[offset + 2] += this.velocities[offset + 2] * dt;
      for (let axis = 0; axis < 3; axis += 1) {
        const limit = half[axis];
        const value = this.positions[offset + axis];
        if (value > limit) this.positions[offset + axis] = limit;
        else if (value < -limit) this.positions[offset + axis] = -limit;
      }
    }
  }

  _killFish(index, reason) {
    if (!this.alive[index]) return false;
    this.alive[index] = 0;
    const schoolIndex = this.schoolIds[index];
    if (reason === 'captured') {
      this.deathCounts[schoolIndex].captured += 1;
    } else if (reason === 'starved') {
      this.deathCounts[schoolIndex].starved += 1;
      // 尸体不再是碎屑粒子，而是鱼模型本身：留在原地、变灰、缓慢上浮到水面。
      // 真实的死鱼因鱼鳔残气多半是浮起来的。
      this.corpse[index] = 1;
      this.corpseAge[index] = 0;
      // 不清零速度 —— 让它带着原来的动量滑行一段再停，死亡才有过程感
    }
    return true;
  }

  _updateEcology(dt) {
    if (!this.config.ecology?.enabled) return;
    // 浮游生物重新启用：logistic 再生的场模型。浮尸能量更高，所以
    // 觅食时先找浮尸，没有才吃浮游。
    let planktonFloorLevel = 0;
    if (this.config.plankton.enabled) {
      const stepped = stepPlankton({
        level: this.planktonLevel,
        capacity: this.config.plankton.capacity,
        growthRate: this.config.plankton.growthRate,
        requestedConsumption: 0,
        halfSaturation:
          this.config.plankton.capacity *
          this.config.plankton.halfSaturationFraction,
        dt,
      });
      // 下限：logistic 在 level=0 时 growth=0，一旦吃光就永不恢复。
      planktonFloorLevel =
        this.config.plankton.capacity *
        (this.config.plankton.minFraction ?? 0.01);
      this.planktonLevel = Math.max(
        planktonFloorLevel,
        stepped.level ?? stepped
      );
    } else {
      this.planktonLevel = 0;
    }
    this._syncPlanktonVisual();

    const carrionEnergy = Math.max(
      0,
      this.config.ecology.carrionEnergy ?? 0.18
    );
    const carrionRadius = Math.max(
      0,
      this.config.ecology.carrionRadius ?? 0.08
    );
    let carrionEaten = 0;
    const shareFraction = clamp(
      this.config.ecology.energyShareFraction ?? 0,
      0,
      1
    );
    const forageMul = this.config.ecology.forageEnergyMultiplier ?? 1;
    const planktonEnergy = Math.max(
      0,
      this.config.ecology.planktonEnergy ?? 0.06
    );
    const capacityLimit = this.config.ecology.energyCapacity;
    const planktonOn =
      this.config.plankton.enabled &&
      this.planktonLevel > planktonFloorLevel + EPSILON;

    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      const schoolIndex = this.schoolIds[index];
      const school = this.config.schools[schoolIndex];
      if (!(school.grazeRate > 0)) continue;
      // 【优先吃鱼】正在锁定猎物的鱼不觅食。中群/大群几乎总在追猎，
      // 所以主动吃浮游的概率天然最低；小群从不追猎（体型比落在 evade 侧），
      // 所以它只能靠浮游和浮尸。
      if (this.pursuitTargets[index] >= 0) continue;
      // 【饥饿门控】吃饱了就不吃。这一条是浮游可持续的关键：
      // 无约束觅食是 64/s 消耗 vs 18/s 再生（几秒吃光且 level=0 后永不恢复）；
      // 只在能量低于阈值时进食，系统自动收敛到约 4/s，有 4.5 倍余量。
      const hungerGate =
        capacityLimit * (this.config.ecology.grazeHungerRatio ?? 0.8);
      if (this.energy[index] >= hungerGate) continue;
      const attemptChance = Math.min(1, school.grazeRate * dt * 4);
      if (this.rng.next() > attemptChance) continue;

      const offset = index * 3;
      let gain = 0;
      let ate = false;

      // 先找浮尸（能量高），没有再吃浮游
      let corpseTarget = -1;
      let bestDistance2 = carrionRadius * carrionRadius;
      for (let other = 0; other < this.count; other += 1) {
        if (!this.corpse[other]) continue;
        const oo = other * 3;
        const dx = this.positions[oo] - this.positions[offset];
        const dy = this.positions[oo + 1] - this.positions[offset + 1];
        const dz = this.positions[oo + 2] - this.positions[offset + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestDistance2) {
          bestDistance2 = d2;
          corpseTarget = other;
        }
      }
      if (corpseTarget >= 0) {
        this.corpse[corpseTarget] = 0;
        gain = carrionEnergy * school.grazeRate * forageMul;
        ate = true;
        carrionEaten += 1;
      } else if (planktonOn) {
        const maxIntake = Math.max(
          0,
          this.config.plankton.maxIntakePerFish
        );
        // minFraction 是维持 logistic 再生的种源，不是每帧可重复领取的
        // 免费食物。只有高于种源线的真实存量可以被摄食。
        const available = Math.max(
          0,
          this.planktonLevel - planktonFloorLevel
        );
        const intake = planktonIntake({
          available,
          maxIntake,
          halfSaturation:
            this.config.plankton.capacity *
            Math.max(
              0,
              this.config.plankton.halfSaturationFraction ?? 0
            ),
        });
        if (intake > 0) {
          this.planktonLevel -= intake;
          this.planktonConsumed += intake;
          // 满摄入保持既有恢复量；资源不足时按真实摄入等比下降。
          // energyConversion 终于成为有效参数，而不是只出现在面板。
          const intakeFraction =
            maxIntake > EPSILON ? intake / maxIntake : 0;
          gain =
            planktonEnergy *
            intakeFraction *
            Math.max(0, this.config.plankton.energyConversion ?? 1) *
            school.grazeRate *
            forageMul;
          ate = true;
        }
      }

      if (!ate || gain <= 0) continue;
      this.energyPools[schoolIndex] += gain * shareFraction;
      this.energy[index] = Math.min(
        capacityLimit,
        this.energy[index] + gain * (1 - shareFraction)
      );
      // 进食特效
      this.captureVfx?.emitFeed?.(
        this.positions[offset],
        this.positions[offset + 1],
        this.positions[offset + 2]
      );
    }
    this.planktonConsumed += carrionEaten;

    // 分发共享池：按各族存活数平均。超出容量的部分丢弃（不累积到下一帧）。
    const capacity = this.config.ecology.energyCapacity;
    const perFishShare = this.energyPools.map((pool, schoolIndex) => {
      if (!(pool > 0)) return 0;
      const alive = this._activeSchoolCount(schoolIndex);
      return alive > 0 ? pool / alive : 0;
    });
    this.energyPools.fill(0);
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      const bonus = perFishShare[this.schoolIds[index]];
      if (bonus > 0) {
        this.energy[index] = Math.min(capacity, this.energy[index] + bonus);
      }
    }

    const starved = [];
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      const school = this.config.schools[this.schoolIds[index]];
      const drain =
        metabolicRate(
          this.config,
          school,
          this.locomotionStates[index] === LOCOMOTION.BURST
        ) * dt;
      this.energy[index] = Math.min(
        this.config.ecology.energyCapacity,
        this.energy[index] - drain
      );
      if (this.energy[index] <= 0) starved.push(index);
    }
    for (const index of starved) this._killFish(index, 'starved');
    this._floatCorpses(dt);
    if (this.config.runtime.mode === 'ecology') {
      const aliveCounts = this.config.schools.map((_, schoolIndex) =>
        this._activeSchoolCount(schoolIndex)
      );
      this.ecologyStatus = ecologyOutcome(aliveCounts);
    }
    this._syncPlanktonVisual();
  }

  _capture(dt) {
    for (let index = 0; index < this.count; index += 1) {
      if (!this.alive[index]) continue;
      this.cooldowns[index] = Math.max(0, this.cooldowns[index] - dt);
    }
    for (let predator = 0; predator < this.count; predator += 1) {
      const prey = this.pursuitTargets[predator];
      if (
        !this.alive[predator] ||
        prey < 0 ||
        !this.alive[prey] ||
        this.cooldowns[predator] > 0
      ) {
        continue;
      }
      const predatorSchool = this.schoolIds[predator];
      const preySchool = this.schoolIds[prey];
      if (
        relationBetween(
          this.config.schools[predatorSchool],
          this.config.schools[preySchool],
          this.config.relations
        ) !== 'pursuit'
      ) {
        continue;
      }
      const po = predator * 3;
      const qo = prey * 3;
      const distance = Math.hypot(
        this.positions[qo] - this.positions[po],
        this.positions[qo + 1] - this.positions[po + 1],
        this.positions[qo + 2] - this.positions[po + 2]
      );
      const radius = captureRadius(
        this.config,
        this.config.schools[predatorSchool],
        this.config.schools[preySchool]
      );
      if (distance > radius) continue;
      this.captureVfx?.emit(
        new THREE.Vector3(
          this.positions[qo],
          this.positions[qo + 1],
          this.positions[qo + 2]
        ),
        new THREE.Vector3(
          this.velocities[po],
          this.velocities[po + 1],
          this.velocities[po + 2]
        ),
        new THREE.Vector3(
          this.positions[po],
          this.positions[po + 1],
          this.positions[po + 2]
        )
      );
      this._finishChase(predator, prey, true);
      this._killFish(prey, 'captured');
      this.metricsState.captures += 1;
      if (this.config.ecology?.enabled) {
        const captureGain =
          this.config.ecology.captureEnergyPerSize *
          this.config.schools[preySchool].size;
        const captureShare = clamp(
          this.config.ecology.energyShareFraction ?? 0,
          0,
          1
        );
        this.energyPools[predatorSchool] += captureGain * captureShare;
        this.energy[predator] = Math.min(
          this.config.ecology.energyCapacity,
          this.energy[predator] + captureGain * (1 - captureShare)
        );
      }
      this.cooldowns[predator] = perPredatorCooldown(
        this._activeSchoolCount(predatorSchool),
        effectiveSchoolCaptureRate(
          this.config,
          this.config.schools[predatorSchool]
        ),
        captureSpeedFactor(
          this.config,
          this.config.schools[predatorSchool]
        )
      );
    }
  }

  _advance(dt) {
    if (
      this.config.runtime.mode === 'ecology' &&
      this.ecologyStatus.state !== 'running'
    ) {
      return;
    }
    this.elapsed += dt;
    this.derived = deriveExperiment(this.config);
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this.relationMatrix = this.relations.update(
      this.config.schools,
      this.config.relations
    );
    this._clearAccumulators();
    this.hash.build(this.positions, this.alive, this.count);
    this._pairPasses();
    for (let index = 0; index < this.count; index += 1) {
      this._steerFish(index, dt);
    }
    this._updateChaseTelemetry(dt);
    for (let index = 0; index < this.count; index += 1) {
      this._integrate(index, dt);
    }
    this._capture(dt);
    this._updateEcology(dt);
    this.physics?.step(dt);
    this.updateMesh();
  }

  _advanceLocomotionPreview(dt) {
    this.derived = deriveExperiment(this.config);
    this.hash.cellSize = Math.max(EPSILON, this.derived.cellSize);
    this.relationMatrix = this.relations.update(
      this.config.schools,
      this.config.relations
    );
    this._clearAccumulators();
    this.hash.build(this.positions, this.alive, this.count);
    this._pairPasses(false);
    for (let index = 0; index < this.count; index += 1) {
      this._steerFish(index, dt, false);
    }
    for (let index = 0; index < this.count; index += 1) {
      this._integrate(index, dt);
    }
    this.updateMesh();
  }

  step(dt) {
    const start = performance.now();
    if (this.locomotionPreview) {
      this._advanceLocomotionPreview(dt);
    } else {
      this._advance(dt);
    }
    const frameMs = performance.now() - start;
    this.metricsState.frameMs = approach(
      this.metricsState.frameMs,
      frameMs,
      4,
      dt
    );
    this.metricsState.fps =
      this.metricsState.frameMs > 0
        ? Math.min(999, 1000 / this.metricsState.frameMs)
        : 0;
    if (!this.locomotionPreview) this.captureVfx?.step(dt);
  }

  updateMesh() {
    if (!this.mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const rollQuaternion = new THREE.Quaternion();
    const corpseTint = new THREE.Color();
    const scale = new THREE.Vector3();
    const direction = new THREE.Vector3();
    for (let index = 0; index < this.count; index += 1) {
      const offset = index * 3;
      position.set(
        this.positions[offset],
        this.positions[offset + 1],
        this.positions[offset + 2]
      );
      if (index === this.hiddenFish) {
        scale.setScalar(0);
        quaternion.identity();
      } else if (!this.alive[index]) {
        // 浮尸：保留鱼模型，肚皮朝上，灰色
        if (this.corpse[index]) {
          const schoolIndex = this.schoolIds[index];
          const school = this.config.schools[schoolIndex];
          // 尺寸就是鱼自身的体型（同样走视觉放大，死后不该突然改变大小）
          scale.setScalar(visualSizeOf(school.size, school.id));
          const fade = Math.max(
            0.01,
            this.config.ecology.corpseFadeTime ?? 1.6
          );
          const t = clamp(this.corpseAge[index] / fade, 0, 1);
          // 逐渐翻身：从死亡时的朝向平滑转到肚皮朝上
          direction
            .set(
              this.prevHeadings[offset],
              this.prevHeadings[offset + 1],
              this.prevHeadings[offset + 2]
            )
            .normalize();
          if (direction.lengthSq() <= EPSILON) direction.copy(FORWARD);
          quaternion.setFromUnitVectors(FORWARD, direction);
          rollQuaternion.setFromAxisAngle(FORWARD, Math.PI * t);
          quaternion.multiply(rollQuaternion);
          // 颜色渐变：本族颜色 → 灰
          if (this.mesh.instanceColor) {
            corpseTint
              .copy(this.schoolColors[schoolIndex])
              .lerp(this.corpseColor, t);
            this.mesh.setColorAt(index, corpseTint);
            this._instanceColorDirty = true;
          }
        } else {
          scale.setScalar(0);
          quaternion.identity();
        }
      } else {
        const school = this.config.schools[this.schoolIds[index]];
        // 视觉放大：判定用 school.size，画面用 visualSizeOf(size)
        scale.setScalar(visualSizeOf(school.size, school.id));
        // 耐力明度：亮度 ∝ 还能活多久 = 当前能量 ÷ 每秒代谢。
        // TUNING 时能量恒满 → 显示"这套选择能撑多久"；RUNNING 时能量
        // 下降 → 显示"现在还能撑多久"。冲刺不计入，否则亮度会闪。
        if (this.mesh.instanceColor && STAMINA_TINT_STRENGTH !== 0) {
          const drain = metabolicRate(this.config, school, false);
          const seconds =
            drain > EPSILON ? this.energy[index] / drain : Infinity;
          const factor = staminaTintFactor(seconds);
          if (Math.abs(factor - this.tintFactors[index]) > 0.004) {
            this.tintFactors[index] = factor;
            corpseTint
              .copy(this.schoolColors[this.schoolIds[index]])
              .multiplyScalar(factor);
            this.mesh.setColorAt(index, corpseTint);
            this._instanceColorDirty = true;
          }
        }
        direction
          .set(
            this.velocities[offset],
            this.velocities[offset + 1],
            this.velocities[offset + 2]
          )
          .normalize();
        if (direction.lengthSq() <= EPSILON) direction.copy(FORWARD);
        // --- 侧倾（banking）：转弯时鱼体侧过来 ---
        // 用上一帧与本帧朝向的叉积估转向率；其竖直分量就是水平转向的方向。
        const visual = this.config.visual;
        const px = this.prevHeadings[offset];
        const py = this.prevHeadings[offset + 1];
        const pz = this.prevHeadings[offset + 2];
        let targetRoll = 0;
        if (px !== 0 || py !== 0 || pz !== 0) {
          const yawRate = pz * direction.x - px * direction.z;
          const maxRoll = (visual.maxRollDegrees * Math.PI) / 180;
          targetRoll = clamp(yawRate * visual.bankingGain, -maxRoll, maxRoll);
        }
        this.rollAngles[index] +=
          (targetRoll - this.rollAngles[index]) * visual.bankingSmoothing;
        this.prevHeadings[offset] = direction.x;
        this.prevHeadings[offset + 1] = direction.y;
        this.prevHeadings[offset + 2] = direction.z;
        quaternion.setFromUnitVectors(FORWARD, direction);
        if (Math.abs(this.rollAngles[index]) > 1e-4) {
          rollQuaternion.setFromAxisAngle(FORWARD, this.rollAngles[index]);
          quaternion.multiply(rollQuaternion);
        }
      }
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(index, matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this._instanceColorDirty && this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
      this._instanceColorDirty = false;
    }
  }

  averageNeighbors(schoolIndex) {
    const range = this.schoolRanges[schoolIndex];
    let total = 0;
    let count = 0;
    for (let index = range.start; index < range.end; index += 1) {
      if (!this.alive[index]) continue;
      total += this.sameNeighbors[index];
      count += 1;
    }
    return count > 0 ? total / count : 0;
  }

  averageEnergy(schoolIndex) {
    const range = this.schoolRanges[schoolIndex];
    let total = 0;
    let count = 0;
    for (let index = range.start; index < range.end; index += 1) {
      if (!this.alive[index]) continue;
      total +=
        this.energy[index] /
        Math.max(EPSILON, this.config.ecology.energyCapacity);
      count += 1;
    }
    return count > 0 ? total / count : 0;
  }

  aliveCount(schoolIndex) {
    return this._activeSchoolCount(schoolIndex);
  }

  fish(index) {
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.count
    ) {
      return null;
    }
    const offset = index * 3;
    return {
      index,
      alive: Boolean(this.alive[index]),
      schoolIndex: this.schoolIds[index],
      school: this.config.schools[this.schoolIds[index]],
      position: [
        this.positions[offset],
        this.positions[offset + 1],
        this.positions[offset + 2],
      ],
      velocity: [
        this.velocities[offset],
        this.velocities[offset + 1],
        this.velocities[offset + 2],
      ],
      panic: this.panic[index],
      energy: this.energy[index],
      locomotionState: LOCOMOTION_LABEL[this.locomotionStates[index]],
    };
  }

  nearestAliveSameSchool(index) {
    const source = this.fish(index);
    if (!source) return -1;
    let result = -1;
    let distance2 = Infinity;
    const range = this.schoolRanges[source.schoolIndex];
    for (let other = range.start; other < range.end; other += 1) {
      if (other === index || !this.alive[other]) continue;
      const offset = other * 3;
      const dx = this.positions[offset] - source.position[0];
      const dy = this.positions[offset + 1] - source.position[1];
      const dz = this.positions[offset + 2] - source.position[2];
      const candidate = dx * dx + dy * dy + dz * dz;
      if (candidate < distance2) {
        result = other;
        distance2 = candidate;
      }
    }
    return result;
  }

  setHiddenFish(index = -1) {
    this.hiddenFish = index;
    this.updateMesh();
  }

  metrics() {
    const predatorPairs = [];
    for (let actor = 0; actor < this.config.schools.length; actor += 1) {
      for (let target = 0; target < this.config.schools.length; target += 1) {
        if (this.relationMatrix[actor][target] !== 'pursuit') continue;
        const actorSchool = this.config.schools[actor];
        const targetSchool = this.config.schools[target];
        const telemetry = this._telemetryFor(actor, target);
        const radius = captureRadius(
          this.config,
          actorSchool,
          targetSchool
        );
        const pursuitSpeed = effectiveMaxSpeed(
          this.config,
          actorSchool,
          'burst'
        );
        const evadeSpeed = effectiveMaxSpeed(
          this.config,
          targetSchool,
          'evade'
        );
        const closingSpeed = pursuitSpeed - evadeSpeed;
        predatorPairs.push({
          actor: actorSchool.id,
          target: targetSchool.id,
          captureRadius: radius,
          perPredatorCooldown: perPredatorCooldown(
            this._activeSchoolCount(actor),
            effectiveSchoolCaptureRate(this.config, actorSchool),
            captureSpeedFactor(this.config, actorSchool)
          ),
          pursuitSpeed,
          evadeSpeed,
          closingSpeed,
          nominalClosureSeconds:
            closingSpeed > EPSILON
              ? Math.max(
                  0,
                  this.derived.schools[actor].detectionLength - radius
                ) / closingSpeed
              : Infinity,
          chaseStarts: telemetry.starts,
          pursuitFrames: telemetry.pursuitFrames,
          activeChases: telemetry.active,
          captures: telemetry.captures,
          abandoned: telemetry.abandoned,
          conversion:
            telemetry.starts > 0
              ? telemetry.captures / telemetry.starts
              : 0,
          averageChaseSeconds:
            telemetry.captures + telemetry.abandoned > 0
              ? telemetry.completedDuration /
                (telemetry.captures + telemetry.abandoned)
              : 0,
          averageCaptureChaseSeconds:
            telemetry.captures > 0
              ? telemetry.capturedDuration / telemetry.captures
              : 0,
          burstSeconds: telemetry.burstSeconds,
        });
      }
    }
    const ecologyWinner =
      this.ecologyStatus.winnerIndex === null
        ? null
        : this.config.schools[this.ecologyStatus.winnerIndex];
    const warnings = [];
    if (
      this.config.locomotion.burstFactor <=
      this.config.locomotion.panicSpeedFactor
    ) {
      warnings.push('burstFactor ≤ panicSpeedFactor');
    }
    if (predatorPairs.some((pair) => pair.closingSpeed <= 0)) {
      warnings.push('至少一条捕食关系的名义闭合速度 ≤ 0');
    }
    return {
      seed: this.seed,
      elapsed: this.elapsed,
      project: this.config.runtime.project,
      mode: this.config.runtime.mode,
      population: this.config.schools.map((school, index) => ({
        id: school.id,
        name: school.name,
        color: school.color,
        size: school.size,
        alive: this.aliveCount(index),
        target: this.derived.schools[index].count,
        neighborRadius: this.derived.schools[index].neighborRadius,
        separationRadius:
          this.derived.schools[index].separationRadius,
        alignmentRadius:
          this.derived.schools[index].alignmentRadius,
        cohesionRadius:
          this.derived.schools[index].cohesionRadius,
        detectionLength: this.derived.schools[index].detectionLength,
        panicRadius: this.derived.schools[index].panicRadius,
        burstRadius:
          this.derived.schools[index].detectionLength *
          this.config.relations.burstRadiusFactor,
        measuredNeighbors: this.averageNeighbors(index),
        averageEnergy: this.averageEnergy(index),
        deaths: { ...this.deathCounts[index] },
      })),
      relationMatrix: this.relationMatrix,
      pairCount: this.metricsState.pairCount,
      captures: this.metricsState.captures,
      captureParticles: this.captureVfx?.particles.length ?? 0,
      dynamicContacts: this.metricsState.dynamicContacts,
      rigidBodies: this.physics?.metrics?.() ?? [],
      simulationMs: this.metricsState.frameMs,
      simulationFps: this.metricsState.fps,
      renderFps: this.metricsState.renderFps ?? 0,
      predatorPairs,
      ecology: {
        state: this.ecologyStatus.state,
        winnerId: ecologyWinner?.id ?? null,
        winnerName: ecologyWinner?.name ?? null,
        plankton: {
          // Legacy field names kept for dashboard compatibility: level =
          // current brown corpse fragments, consumed = eaten corpse count.
          level: this.captureVfx?.starvationCount?.() ?? 0,
          capacity: 0,
          fraction: 0,
          consumed: this.planktonConsumed,
        },
        deaths: this.deathCounts.map((entry, schoolIndex) => ({
          schoolId: this.config.schools[schoolIndex].id,
          ...entry,
        })),
      },
      tankVolume: tankVolume(this.config.tank),
      warnings,
    };
  }
}
