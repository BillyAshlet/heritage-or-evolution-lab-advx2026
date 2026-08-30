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
import { effectiveMaxSpeed, relationForRatio } from './experiment-model.js';
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
  // step 是【拖动】的最小单位，keyStep 是 A/D 一次跳多少。两者分开：
  // 0.05 一格等于把一条连续的量切成 20 格，玩家没法停在阈值附近看它翻转
  // （T1 的两个边界在 0.80 和 1.25，正好卡在格与格之间）。细到 0.01 拖动
  // 才连续；但 A/D 若也用 0.01，敲一下只动一点点，跨过整个区间要 145 下。
  // 悬停读数由本课自己声明（UI 只负责渲染，见 tutorial-ui.js 的说明）。
  readout: [
    {
      label: { en: 'You', zh: '你的体型' },
      value: (spec, v) => (spec.referenceSize * tutorialSizeRatio(spec, v)).toFixed(2),
    },
    {
      label: { en: 'Grey', zh: '灰鱼' },
      value: (spec) => spec.referenceSize.toFixed(2),
    },
    {
      label: { en: 'Ratio', zh: '体型比' },
      value: (spec, v) => tutorialSizeRatio(spec, v).toFixed(2),
    },
  ],
  slider: { min: 0.55, max: 2, step: 0.01, keyStep: 0.05, initial: 1 },
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

/**
 * 第二课 · 速度。设计者原话：
 *   「速度时就是两个迷你浴缸。一个里面是大型鱼，一个是小型鱼，玩家调整
 *     中型鱼只能调整速度，大了就可以逃跑，可以追上，小了就不能做到。」
 *
 * 两个缸靠 school.bounds（硬钳制的每鱼群包围盒）+ school.chamber
 * （跨隔间关系降为 ignore）实现 —— 引擎里 TANK 是单例，真开两个缸是
 * 结构级改动；细节见 experiment-simulation.js。
 *
 * 玩家在【两个缸里各有一份】：上缸和大鱼比"能不能逃"，下缸和小鱼比
 * "能不能追"。一个鱼群只能属于一个隔间，所以需要四个鱼群。
 */
export const T2_SPEC = deepFreeze({
  id: 'T2',
  axis: 'speed',
  label: { en: 'Lesson 02', zh: '第二课' },
  axisName: { en: 'Speed', zh: '速度' },
  brief: {
    en: 'Only speed can change. Watch both tanks at once: fast enough and you outrun the big fish above and catch the small fish below.',
    zh: '只有速度可以调。同时看两个缸：够快就能甩掉上面的大鱼、追上下面的小鱼。',
  },
  controlHint: {
    en: 'Hold SPACE to slow time down — chases are easier to read at half speed.',
    zh: '按住 SPACE 放慢时间 —— 追逐在半速下看得清楚得多。',
  },
  // 比 T1 大：这一课要演示【追与逃】，而追逃需要空间。
  //
  // 一开始沿用 T1 的 3.6×1.5，子缸只有 0.70m 高、而捕食半径 0.28m ——
  // 高度只有捕食半径的 2.1 倍，"逃"在几何上不成立。实测那一版把这一课
  // 教反了：玩家【越快死得越快】（45→11→10 秒），因为在那种盒子里提速
  // 只是提高遭遇频率。解析闭合速度假设的是开阔水域，小盒子里不适用。
  //
  // 缸高提到 2.0（子缸 0.95），宽度同步提到 4.8 好维持 2.4 的比例 ——
  // 那个比例是给底部控制条带留空水用的（见 T1 的 tank 注释）。
  // 宽度跟着高度走，维持 2.4 的比例 —— 那个比例是给底部控制条带留空水用的。
  // 高度提到 2.4 后若维持 4.8 宽，比例变 2.0，下面那个缸会被条带切掉一截。
  tank: { width: 5.8, height: 2.4, depth: 1.6 },
  // 两个子缸之间的空气。隔离早由关系矩阵保证，这条缝【纯粹是给眼睛看的】。
  //
  // 第一版只留 0.1m（缸高的 5%），设计者的反馈是"看上去是一个缸莫名其妙
  // 分成两个"—— 太窄的缝读起来是"切开"，不是"两个"。开到 0.5m 之后
  // 两个盒子之间有真正的空气，才读得对。
  // 总缸高同步提到 2.4，好让子缸维持 0.95 —— 那是验证过能让「逃」成立的
  // 尺寸（0.70 时这一课是反的，见上面 tank 的注释）。
  chamberGap: 0.5,
  // 两个缸整体上移多少（世界单位）。
  //
  // 底部控制条带占掉画面下方约四成，而相机是对着原点自动取景的 —— 缸正好
  // 骑在条带上，下面那个会被切掉一截。与其去动那套为 iPad 横屏写的取景
  // 逻辑，不如把内容抬上来：这一个数同时作用于视觉盒子和鱼的活动范围，
  // 两者不会脱节。调大 = 整体更靠上。
  stageShiftY: 0.42,
  chambers: [
    { id: 'top', role: 'flee' },
    { id: 'bottom', role: 'chase' },
  ],
  playerSize: 1.5,
  playerCount: 6,
  // 两个缸的对手数量【必须分开配】。
  // 上缸只放 2 条大鱼：6 条时玩家是被包围的，速度再快也没地方去 ——
  // 实测 6 条时慢/快档存活 0.0 vs 2.0，2 条时是 1.4 vs 4.0，分离度翻倍。
  // 下缸保持 6 条小鱼：追这一课需要足够的猎物才看得出"追得上"。
  rivalCount: { top: 2, bottom: 6 },
  // NPC 速度：让「能逃」与「能追」在同一点翻转。
  //
  // NPC 与玩家同速时两个阈值差 1.94 倍（s>1.391 才逃得掉，s>0.719 就追得上），
  // 也就是中性位上「追得上但永远逃不掉」—— 一课两个分界，玩家会以为速度
  // 对两件事的作用不一样。把大鱼放慢到 panicSpeed/burst、小鱼加快到
  // burst/panicSpeed，两个阈值就都落在 s=1。
  // 这不是作弊：游戏本身的表型耦合就是「越大越慢」（size^-0.2），
  // 这里只是把它放大到足以给这一课一个干净的分界。
  rivalSpeed: { top: 0.719, bottom: 1.391 },
  rivalSize: { top: 2.25, bottom: 1 },
  rivalName: {
    top: { en: 'Big fish', zh: '大鱼' },
    bottom: { en: 'Small fish', zh: '小鱼' },
  },
  playerName: { en: 'You', zh: '你的鱼' },
  relations: { k: 1.25, KMax: 6 },
  // captureLengthFactor 比 T1 小得多（1.6 → 1.0）。T1 调大它是为了"吃得快"，
  // 但对逃跑这一课那恰好是毒药：捕食半径越大，可逃的空间越小。
  // 实测同一缸里 1.6 只能拉开 13→19→22 秒，1.0 能拉开 20→27→59 秒。
  capture: { targetCaptureRate: 3, captureLengthFactor: 1 },
  locomotion: { burstFactor: 1.6 },
  captureVfx: {
    biteGlowColor: '#16211f',
    biteGlowRadius: 0.34,
    biteGlowDuration: 0.55,
    biteGlowStrength: 0.5,
  },
  // 刻度样式：连续渐变，【不分段】。
  //
  // T1 用分段是因为那里的机制本身就是离散的（pursuit/peer/evade 是引擎的
  // 真实状态，画成三段不是谎言，是事实）。T2 的量是连续的 —— 解析翻转点
  // 在 s=1，实测 0.8 就已经追得上、1.0 以上逃的一侧就饱和。这种情况下
  // 画分段等于宣称"这里是阈值"，而那个宣称会说谎。
  //
  // 所以这条只表达【你比对手快还是慢】—— 一个玩家直接控制的客观事实，
  // 不对结果做任何预测。中点 = 与对手同速。
  // UI 之所以两课不同，是因为机制本身不同，不是没统一。
  scaleStyle: 'gradient',
  gradientCopy: {
    mid: { en: 'Same speed', zh: '与对手同速' },
    above: { en: 'Faster', zh: '比对手快' },
    below: { en: 'Slower', zh: '比对手慢' },
    same: { en: 'Matched', zh: '同速' },
  },
  // 初始值刻意放在【做不到】那一侧：T1 的中性档什么都不发生，被指出
  // "画面上没有在发生事情"。这一课一进来就该看到自己被追上、也追不上。
  readout: [
    { label: { en: 'You', zh: '你的鱼' }, value: (spec, v) => `×${v.toFixed(2)}` },
    {
      label: { en: 'Big fish', zh: '大鱼' },
      value: (spec) => `×${spec.rivalSpeed.top.toFixed(2)}`,
    },
    {
      label: { en: 'Small fish', zh: '小鱼' },
      value: (spec) => `×${spec.rivalSpeed.bottom.toFixed(2)}`,
    },
  ],
  slider: { min: 0.6, max: 1.6, step: 0.01, keyStep: 0.05, initial: 0.85 },
  ecology: false,
});

/**
 * 第三课 · 耐力。设计者原话：
 *   「耐力时就是只有玩家和浮游生物/小型鱼。大了就可以存活很长时间，
 *     小了就不行。」
 *
 * 这是三课里唯一【打开生态系统】的一课 —— T1/T2 都把 ecology 关掉了，
 * 好让画面上只发生捕食这一件事。这里反过来：没有捕食者、没有猎物，
 * 缸里只有你和食物，唯一会杀死你的是你自己的代谢。
 *
 * 而且它教的不是"电池能撑多久"，是【可持续性】：缸里有浮游生物在按
 * logistic 再生，你摄食的速度是固定的，所以真正决定生死的是
 * 代谢率跟不跟得上摄食率。耐力高 = 代谢慢 = 吃得回来；耐力低 = 烧得比
 * 吃得快 = 迟早归零。这比倒计时深一层，而且是生态学里真实的那条线。
 */
export const T3_SPEC = deepFreeze({
  id: 'T3',
  axis: 'stamina',
  label: { en: 'Lesson 03', zh: '第三课' },
  axisName: { en: 'Stamina', zh: '耐力' },
  brief: {
    en: 'Only stamina can change. No predators here — the only thing that can kill you is your own metabolism. Watch how long the school lasts.',
    zh: '只有耐力可以调。这里没有捕食者 —— 唯一能杀死你的是你自己的代谢。看这群鱼能撑多久。',
  },
  controlHint: {
    en: 'Press ENTER to fast-forward — starvation takes longer to watch than a chase.',
    zh: '按 ENTER 快进 —— 饿死比追逐慢得多，值得快进着看。',
  },
  tank: { width: 3.6, height: 1.5, depth: 1.6 },
  playerCount: 12,
  playerSize: 1.5,
  playerName: { en: 'You', zh: '你的鱼' },
  relations: { k: 1.25, KMax: 6 },
  // 生态打开 —— 这一课的全部机制都在这里。
  ecology: true,
  // 食物做成【会被吃完的存粮】，不是会再生的牧场（growthRate: 0）。
  //
  // 一开始按默认的再生式做，结果是所有耐力档全员存活 120 秒 —— 因为
  // grazeHungerRatio 0.8 让鱼只在能量低于 80% 时才进食，于是它们稳稳
  // 钉在 80%，而再生远快于消耗，食物从来没有稀缺过。
  // 调稀之后确实出现了阈值，但那是【二元】的：摄食≥代谢就永远活着，
  // 否则归零 —— 而设计者要的是"大了活很久，小了不行"，那是【时长】判断。
  // 存粮式食物才给得出时长梯度：所有鱼最终都会死，区别只在什么时候。
  plankton: {
    capacity: 3,
    initialFraction: 1,
    growthRate: 0,
    minFraction: 0,
    maxIntakePerFish: 0.02,
    energyConversion: 1,
    // 默认 1200 颗点配这一缸的存粮像静态噪点，盖住了鱼。
    // 稀到看得清单颗，"食物在被吃光"这件事才读得出来。
    visualCount: 260,
    pointSize: 0.045,
  },
  // 基础代谢翻倍（默认 0.02）。只为压缩时长，不改变任何比例关系 ——
  // 0.02 时全灭要 38–131 秒，太长；0.04 是 20–68 秒，配 ENTER 快进
  // 正好看得完，而耐力两端的差距仍是 3.4 倍。
  ecology: { basalRate: 0.04 },
  scaleStyle: 'gradient',
  // 这一课没有对手，所以中点不是"和谁一样"，是【基准代谢】本身。
  gradientCopy: {
    mid: { en: 'Baseline burn', zh: '基准代谢' },
    above: { en: 'Tougher', zh: '更耐' },
    below: { en: 'Frailer', zh: '更不耐' },
    same: { en: 'Baseline', zh: '基准' },
  },
  solo: true,
  // 耐力的直接后果就是代谢的倒数 —— 把两个数并排摆出来，玩家不用心算
  // 也能看出"耐力翻倍 = 烧得慢一半"。
  readout: [
    { label: { en: 'Stamina', zh: '耐力' }, value: (spec, v) => `×${v.toFixed(2)}` },
    {
      label: { en: 'Burn rate', zh: '代谢' },
      value: (spec, v) => `×${(1 / v).toFixed(2)}`,
    },
  ],
  slider: { min: 0.55, max: 2, step: 0.01, keyStep: 0.05, initial: 0.8 },
});

export const TUTORIAL_SPECS = Object.freeze([T1_SPEC, T2_SPEC, T3_SPEC]);

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

/**
 * 这一课的两个缸各自会发生什么。
 *
 * 和 T1 的 tutorialRelation 同一个原则：【转发引擎自己的量】，不在 UI 层
 * 另写一套阈值。这里用的是 effectiveMaxSpeed —— 追击方用 burst、逃逸方用
 * evade，两者之差为正才追得上。面板上写"逃得掉"，引擎里就必须真的逃得掉。
 */
export function tutorialSpeedOutcome(spec, value) {
  const config = createTutorialConfig(spec, value);
  const find = (id) => config.schools.find((school) => school.id === id);
  const playerTop = find('medium');
  const playerBottom = find('medium2') ?? playerTop;
  const big = find('large');
  const small = find('small');
  // 上缸：大鱼追、玩家逃 —— 玩家的逃逸速度压过大鱼的追击速度才甩得掉。
  const fleeMargin =
    effectiveMaxSpeed(config, playerTop, 'evade') -
    effectiveMaxSpeed(config, big, 'burst');
  // 下缸：玩家追、小鱼逃。
  const chaseMargin =
    effectiveMaxSpeed(config, playerBottom, 'burst') -
    effectiveMaxSpeed(config, small, 'evade');
  return {
    flee: fleeMargin > 0,
    chase: chaseMargin > 0,
    fleeMargin,
    chaseMargin,
  };
}

/**
 * 两个子缸的几何。【唯一来源】—— 视觉盒子（main.js）、鱼的活动范围
 * 与出生点（本文件）、点击命中判定（main.js）都读它。
 * 之前这段算式在两处各写了一遍，任何一处改了另一处就会错位。
 */
export function tutorialChamberBoxes(spec) {
  if (!spec?.chambers) return [];
  const half = (spec.tank.height - spec.chamberGap) / 2;
  const offset = (spec.chamberGap + half) / 2;
  const shift = spec.stageShiftY ?? 0;
  return spec.chambers.map((chamber) => ({
    id: chamber.id,
    centerY: (chamber.id === 'top' ? offset : -offset) + shift,
    height: half,
  }));
}

function buildChamberedConfig(spec, value) {
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
  Object.assign(result.capture, spec.capture);
  Object.assign(result.locomotion, spec.locomotion);
  Object.assign(result.captureVfx, spec.captureVfx);

  const boxes = new Map(
    tutorialChamberBoxes(spec).map((box) => [box.id, box])
  );
  const boxFor = (chamber) => {
    const box = boxes.get(chamber);
    return { centerY: box.centerY, height: box.height };
  };
  const spawnY = (chamber) => boxFor(chamber).centerY / spec.tank.height;

  // 玩家在两个缸里各一份。一个鱼群只能属于一个隔间，所以复制 medium。
  const base = result.schools.find((school) => school.id === PLAYER_SCHOOL_ID);
  const playerBottom = JSON.parse(JSON.stringify(base));
  playerBottom.id = 'medium2';
  result.schools.push(playerBottom);

  const assign = (school, chamber, patch) => {
    Object.assign(school, patch);
    school.chamber = chamber;
    school.bounds = boxFor(chamber);
    school.spawnRegion = { ...school.spawnRegion, centerY: spawnY(chamber) };
  };

  const speed = (school, multiplier) => {
    school.cruiseSpeed *= multiplier;
    school.maxSpeed *= multiplier;
  };

  assign(base, 'top', {
    name: t(spec.playerName, 'zh'),
    count: spec.playerCount,
    size: spec.playerSize,
  });
  assign(playerBottom, 'bottom', {
    name: t(spec.playerName, 'zh'),
    count: spec.playerCount,
    size: spec.playerSize,
  });
  assign(result.schools.find((school) => school.id === 'large'), 'top', {
    name: t(spec.rivalName.top, 'zh'),
    count: spec.rivalCount.top,
    size: spec.rivalSize.top,
  });
  assign(result.schools.find((school) => school.id === 'small'), 'bottom', {
    name: t(spec.rivalName.bottom, 'zh'),
    count: spec.rivalCount.bottom,
    size: spec.rivalSize.bottom,
  });
  speed(result.schools.find((school) => school.id === 'large'), spec.rivalSpeed.top);
  speed(result.schools.find((school) => school.id === 'small'), spec.rivalSpeed.bottom);

  // 只动速度这一个轴，两份玩家都要动。
  speed(base, value);
  speed(playerBottom, value);
  return result;
}

function buildSoloConfig(spec, value) {
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
  result.ecology.enabled = true;
  Object.assign(result.ecology, spec.ecology, { enabled: true });
  Object.assign(result.plankton, spec.plankton, { enabled: true });
  Object.assign(result.relations, spec.relations);

  // 只留玩家一个鱼群。这一课没有对手 —— 多留任何一群都会引入一条
  // 没解释过的捕食关系，把"唯一能杀死你的是代谢"这个前提破坏掉。
  const player = requireSchool(result, PLAYER_SCHOOL_ID);
  Object.assign(player, {
    name: t(spec.playerName, 'zh'),
    count: spec.playerCount,
    size: spec.playerSize,
  });
  result.schools = [player];

  return applyAxisOnly(result, spec.axis, value);
}

export function createTutorialConfig(spec = T1_SPEC, value = spec.slider.initial) {
  if (spec.chambers) return buildChamberedConfig(spec, value);
  if (spec.solo) return buildSoloConfig(spec, value);
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
