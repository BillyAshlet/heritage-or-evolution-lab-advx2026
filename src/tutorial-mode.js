/**
 * 教学关（新手指引）。
 *
 * 设计出发点（Billy 原话）：
 *   「体型时，就是遇到一个中形鱼，只有一个体型可以调整。
 *     体型大可以吃中型鱼，体型小就会被吃。」
 *
 * 三条约束，全部来自设计者：
 *   1. 教学关【没有指标】—— 不计时、不判胜负，玩家觉得懂了就进下一场；
 *   2. 【不用失败重试】—— 一方被吃光就自动回到最初位置，让玩家反复摸索；
 *   3. 概念教学之外还要带【操作教学】—— T1 教「点鱼看视角」。
 *
 * 为什么不塞进 LEVEL_SPECS：正式关卡的 spec 参与继承链与平衡门禁
 * （tools/game_balance_search.mjs 会遍历 LEVEL_SPECS）。教学关既不继承
 * 也不该被平衡测试约束，混进去会同时污染两边。
 *
 * 机制上教学关【不造新轮子】：T1 演示的就是 relationForRatio() 本身
 * （见 experiment-model.js）——
 *     ratio = 玩家体型 / 参照鱼体型
 *     ratio >= k    → pursuit（你吃它）
 *     ratio <= 1/k  → evade  （它吃你）
 *     其间          → peer   （互不理睬）
 * 玩家基准体型 1.5、参照鱼固定 1.5，所以【滑块值恰好等于体型比】，
 * 阈值直接读得出来。教学不能教一个和正式关卡不一样的假机制。
 */

import { createDefaultConfig } from './experiment-config.js';
import { relationForRatio } from './experiment-model.js';
import { PLAYER_SCHOOL_ID } from './game-mode.js';

export const TUTORIAL_PROJECT = 'tutorial';

/** 参照鱼所借用的鱼群 id。教学关只用两个鱼群，large 数量置 0。 */
const REFERENCE_SCHOOL_ID = 'small';
const IDLE_SCHOOL_ID = 'large';

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

export const T1_SPEC = deepFreeze({
  id: 'T1',
  axis: 'size',
  // 文案双语。默认英文（见 visitor-mode.js 的 defaultLanguage），
  // 教学关自带切换 —— 进 /tutorial 时游客壳是关的，否则从链接直接
  // 进来的玩家切不了语言。
  label: { en: 'Lesson 01', zh: '第一课' },
  axisName: { en: 'Size', zh: '体型' },
  brief: {
    en: 'Only size can change. Grow until you can eat the grey fish — then shrink until they eat you.',
    zh: '只有体型可以调。把它调大到能吃掉灰鱼，再调小到会被灰鱼吃掉。',
  },
  // 操作教学：这一课顺带教「点鱼」。SPACE 慢放放在 T2、ENTER 快进放在
  // T3 —— 每个操作都在它第一次真正有用的那一刻才出现。
  controlHint: {
    en: 'Click any fish to open the inspector — "Orbit" lets you circle it.',
    zh: '点一条鱼 → 打开观察窗 →「绕看视角」可以绕着它看一圈。',
  },
  // 迷你水缸：正式关卡是 6×3.6×2.4，太大了两条鱼可能几十秒碰不上面。
  //
  // 高度从 1.8 压到 1.5 是为了排版：3.2×1.8 正好是 16:9，自动取景会让
  // 缸铺满整个屏幕高度，底部的控制条带必然压在鱼身上。压扁到 3.6×1.5
  // （比例 2.4）之后，按宽度取景就会在上下留出余量，条带落在空水里而
  // 不是盖住标本。宁可改缸的比例，也不去动那套为 iPad 横屏写的
  // 全屏旋转补偿（见 scene.js 的 apply()）。
  tank: { width: 3.6, height: 1.5, depth: 1.6 },
  // 数量：两边【相等】，密度对齐正式关卡。
  //
  // 一开始用的是 4v4，实测"太少了反而看不出来"。根因不是数量本身而是
  // 密度：4v4 在 9.2m³ 里只有 0.87 条/m³，而正式 L1 是 2.62 条/m³ ——
  // 教学关比真正的关卡稀了 3 倍，鱼互相碰不上，也很少出现蓝灰相邻、
  // 能直接比体型的时刻。12v12 把密度拉到 2.6，与正式关卡一致。
  //
  // 也考虑过 1v1（体型对比绝不会看错），但那样得等两条特定的鱼碰面，
  // 现象变得零星；提高密度其实能把 1v1 的好处一并拿到 —— 相邻时刻多了，
  // 对比机会自然就多。
  //
  // 两边必须相等：数量不等会让两个方向不对称（多的一方追得快），
  // 等于又引入一个与体型无关的变量。缸体也不能单纯放大 —— 同样的鱼数
  // 放进更大的缸密度更低，只会更看不出来。
  playerCount: 12,
  referenceCount: 12,
  referenceSize: 1.5,
  referenceName: { en: 'Grey · reference size', zh: '灰鱼 · 参照体型' },
  // 参照鱼必须是中性色。沿用 small 鱼群的橙色会出事：橙色在正式关卡里
  // 是「猎物」的颜色，玩家会以为它天生该被吃，而 T1 的全部意义恰恰是
  // 「同一条鱼，你调大就吃它、调小就被它吃」。灰色不预设立场。
  referenceColor: '#9aa7b2',
  playerName: { en: 'You', zh: '你的鱼' },
  // k=1.25 让阈值落在好念的数上：≥1.25 吃、≤0.80 被吃。
  //
  // KMax 是「猎物体型窗口上界」——正式关卡里那是「鲸不追磷虾」的生态
  // 约束，但在教学关里它会让玩家调得太大反而【无视】灰鱼，把「越大越强」
  // 这条唯一要教的规律打断。本想设 0（源码里 KMax<=k 即退回纯阈值），
  // 但配置校验器强制 KMax ∈ [1.05, 6]。取上限 6：滑块最大 2.0 时体型比
  // 也只有 2.0，远在窗口内，效果与关闭上界完全等价。
  relations: { k: 1.25, KMax: 6 },
  slider: { min: 0.55, max: 2, step: 0.05, initial: 1 },
  // 捕食参数放宽：正式关卡默认单体冷却 5.5 秒、捕食半径 0.09m，在 3.2m
  // 的迷你缸里要等十几秒才吃得到一口。教学关要的是「调完滑块几秒内就
  // 看见结果」，看不见结果的演示等于没演示。
  capture: { targetCaptureRate: 3, captureLengthFactor: 1.6 },
  // 追击爆发倍率（正式关卡 1.35 → 教学关 1.6）。
  //
  // 两个鱼群速度完全相同，净接近速度全靠引擎里"追击方用 burst、逃逸方
  // 用 evade"这一点点差值撑着，默认只有 0.092 m/s —— 在 3.2m 的缸里追近
  // 一米要 11 秒，慢到不像在捕食。调到 1.6 后是 0.207 m/s（2.3 倍），
  // 遭遇后约 1.5 秒见分晓。
  //
  // 为什么调这个而不是"让灰鱼慢一点"：灰鱼一旦慢过 15%，它的 burst 就
  // 追不过玩家的 evade，「变小会被吃」这半堂课在物理上就不可能发生了
  // （实测 f=0.85 时净接近 -0.001，f=0.7 时 -0.094）。远在撞墙之前就已经
  // 很糟：慢 10% 时一个方向快 1.6 倍、另一个方向慢 3 倍，玩家会得出
  // 「变大很致命、变小其实还好」这个错误结论。
  // burst 是唯一一个对两个方向【同步】生效、不破坏对称的旋钮。
  // 更高的值（1.75/2.0）会让鱼窜得失真，也容易出现擦身而过没吃到。
  locomotion: { burstFactor: 1.6 },
  // 白底下的咬合反馈。默认那层白色辉光在 #eef1f0 上完全看不见 ——
  // 而它正是「咬到了」这一瞬最主要的重音，等于这堂课最关键的事件少了
  // 一半分量。换成深墨色读成一次【暗脉冲】，并把半径与时长略放大：
  // 白底上没有辉光那种自然扩散感，得靠尺寸补回来。
  captureVfx: {
    biteGlowColor: '#16211f',
    biteGlowRadius: 0.34,
    biteGlowDuration: 0.55,
    biteGlowStrength: 0.5,
  },
  // 生态关掉：T1 只教捕食。开着的话鱼会饿死，玩家分不清「它死了」是
  // 因为被吃还是因为没饭吃。耐力留到 T3 再开。
  ecology: false,
});

export const TUTORIAL_SPECS = Object.freeze([T1_SPEC]);

export function findTutorialSpec(id) {
  const found = TUTORIAL_SPECS.find((item) => item.id === id);
  if (!found) throw new RangeError(`unknown tutorial lesson: ${id}`);
  return found;
}

function requireSchool(config, id) {
  const school = config.schools.find((item) => item.id === id);
  if (!school) throw new RangeError(`missing school: ${id}`);
  return school;
}

/** 玩家体型 / 参照鱼体型。滑块值即比值，但仍按真实体型算，避免口径漂移。 */
export function tutorialSizeRatio(spec, value) {
  const player = createDefaultConfig().schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  return (player.size * value) / spec.referenceSize;
}

/**
 * 当前滑块值下，玩家与参照鱼的关系。
 *
 * 【必须直接调用仿真那一份 relationForRatio】而不是照着阈值再写一遍：
 * 教学关的全部价值就是「所见即正式关卡的规则」，两份实现只要在边界上
 * 差一个浮点位（1/1.25 与 1.2/1.5 就不是同一个双精度数），UI 就会当着
 * 玩家的面说谎。所以这里不判断，只转发。
 */
export function tutorialRelation(spec, value) {
  return relationForRatio(tutorialSizeRatio(spec, value), {
    ...spec.relations,
    hysteresis: 0,
  });
}

/** 关系 → 玩家看得懂的中文。教学关不出现 pursuit/evade 这种内部词。 */
export const RELATION_COPY = Object.freeze({
  pursuit: { en: 'Eating', zh: '你吃它', tone: 'eat' },
  evade: { en: 'Eaten', zh: '它吃你', tone: 'eaten' },
  peer: { en: 'Ignored', zh: '互不理睬', tone: 'peer' },
  ignore: { en: 'Ignored', zh: '互不理睬', tone: 'peer' },
});

/** 取双语字段。传字符串就原样返回，方便逐步迁移。 */
export function t(value, language = 'en') {
  if (typeof value === 'string') return value;
  return value?.[language] ?? value?.en ?? '';
}

export function createTutorialConfig(spec = T1_SPEC, value = spec.slider.initial) {
  const result = createDefaultConfig();

  Object.assign(result.runtime, {
    project: TUTORIAL_PROJECT,
    mode: 'steady',
    populationPreset: 'custom',
    timeScale: 1,
  });
  Object.assign(result.tank, { preset: 'game', ...spec.tank });
  result.obstacles.enabled = false;
  result.traits.enabled = false;
  result.ecology.enabled = Boolean(spec.ecology);
  result.plankton.enabled = Boolean(spec.ecology);
  Object.assign(result.relations, spec.relations);

  const player = requireSchool(result, PLAYER_SCHOOL_ID);
  const reference = requireSchool(result, REFERENCE_SCHOOL_ID);

  Object.assign(player, {
    name: t(spec.playerName, 'zh'),
    count: spec.playerCount,
  });
  Object.assign(reference, {
    name: t(spec.referenceName, 'zh'),
    count: spec.referenceCount,
    size: spec.referenceSize,
    color: spec.referenceColor,
  });
  // 第三个鱼群【同化】成参照鱼：不删除，也不留成原样。
  //
  // 留不得：large 默认体型 2.25，会直接把玩家吃掉，等于教学关里混进一个
  // 没解释过的捕食者。
  // 不删除：纯属保守 —— 仿真实例是按 3 个鱼群构造的，不改变鱼群数量就
  // 少一类可能出问题的地方。
  // （历史记录：曾以为「浏览器里鱼不会被吃」是这里造成的索引错位。那个
  // 现象根本不是 bug —— 是自动化浏览器标签页处于 hidden 状态、rAF 被挂起，
  // 整个渲染与仿真循环没在跑。保留三鱼群只是保守，不是修复。）
  // 至于数量为什么不设 0：配置校验器要求每个鱼群 count ∈ [1, 2000]。
  // 所以把它设成和参照鱼完全一样（同体型、同颜色、同名字），玩家看到的
  // 就是一群灰鱼，分不出它属于哪个鱼群 —— referenceCount 是灰鱼总数，
  // 内部按 (总数-1) + 1 分摊。
  const filler = requireSchool(result, IDLE_SCHOOL_ID);
  Object.assign(filler, {
    name: t(spec.referenceName, 'zh'),
    count: 1,
    size: spec.referenceSize,
    color: spec.referenceColor,
  });
  reference.count = Math.max(1, spec.referenceCount - 1);

  Object.assign(result.capture, spec.capture);
  Object.assign(result.locomotion, spec.locomotion);
  Object.assign(result.captureVfx, spec.captureVfx);

  return applyAxisOnly(result, spec.axis, value);
}

/**
 * 只改一个轴，【不带表型耦合】。
 *
 * 正式关卡的 applyPlayerCoefficients 会连带算上耦合惩罚：体型大 →
 * 游速 ×size^-0.2、转向 ×size^-0.55、代谢 ×size^1.25。在 T1 里这会
 * 把唯一要教的变量彻底污染，而且方向恰好全反 ——
 *   调大想去追灰鱼，却因为变慢追不上（实测净接近速度只剩 0.036 m/s）；
 *   调小该被灰鱼吃掉，却因为变快跑得掉。
 * 结果是滑块拉到底也看不出区别，演示失败。
 *
 * 剥掉耦合不是教一个假机制：T1 要教的是 relationForRatio（谁吃谁由体型
 * 比决定），那条规则原封不动；耦合本身是「三个数值此消彼长」那一课的
 * 内容，按设计要留到三课结束后的收尾才揭示。先隔离变量，再讲耦合。
 * ⚠️ 因此 T2/T3 也必须走这个函数，不能改回 applyPlayerCoefficients。
 */
function applyAxisOnly(config, axis, value) {
  const player = config.schools.find(
    (school) => school.id === PLAYER_SCHOOL_ID
  );
  if (axis === 'size') {
    player.size *= value;
  } else if (axis === 'speed') {
    player.cruiseSpeed *= value;
    player.maxSpeed *= value;
  } else if (axis === 'stamina') {
    player.metabolismMultiplier = (player.metabolismMultiplier ?? 1) / value;
  } else {
    throw new RangeError(`unknown tutorial axis: ${axis}`);
  }
  return config;
}
