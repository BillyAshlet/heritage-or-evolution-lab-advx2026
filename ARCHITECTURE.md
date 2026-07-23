# evolution — 架构宪法 ARCHITECTURE.md
*AdventureX 2026 · v1 · 2026-07-23 · 由 fable 5 起草，Billy 批准后生效*

> **本文件是本项目唯一的宪法。** 与任何其他来源（包括水族馆主线的
> 文档和历史决策）冲突时，以本文件为准。水族馆源目录只读，永不回写。

---

## 0. 核心思想（灵魂，不许丢）

不是进化模拟器，是**债的模拟器**。每一代为了活下去被迫做特征取舍；
取舍**强制继承**给下一代，**不可回档**；几代之后，当年"正确"的选择
反噬。玩家不是在优化鱼群，是在**替祖先还债、同时给子孙欠债**。

**唯一验证点：** 玩家在后面某一代受苦时，能回头指着前面某一代说
"是那时候那个选择害的"。做到了就成立，做不到就是失败——一切架构
决策都为这一句话服务。

**一个必须尊重的张力：** "此消彼长当场可见"（预算）和"代价延迟
显形"（后果）是两种相反的显示哲学。解法是分层：**预算层即时可见**
（拉一个滑块，其他滑块当场动），**后果层刻意隐藏**（环境序列不预告，
下一代的痛苦只能事后归因）。别让任何 UI 把未来环境泄漏给玩家。

---

## 1. 从水族馆继承什么 / 抛弃什么（基于真实代码的判断）

### 保留（这些是白捡的，别重写）
| 模块 | 保留理由 |
|---|---|
| `world.js` — 固定时步引擎 + `systems` 数组 | 60Hz 物理与渲染解耦，新系统即插即用 |
| `boids.js` — flock 内核 | sep/ali/coh + 空间网格（500+鱼不卡）+ **perceptionFOV（视野角本身就是一个现成的可演化 trait！）** + 转向限速/俯仰限制（体型大转向慢 ← turnSpeed 现成通道） |
| `scene.js` — 渲染循环/灯光/InstancedMesh | 一次 draw call 画全群 |
| **OrbitControls 相机（拖动环绕/滚轮缩放，0=复位）** | 队友直觉说删——我反对：黑客松演示台上能绕着鱼群转一圈是免费的舞台感，且调试必备。保留。 |
| `debug.js` 的 **addParam 面板**（范围+默认值+↺+缩放） | **这就是北辰的调参工作台**，现成的 |
| 面板的 copy/paste JSON | 队友之间传数值的桥（北辰调好→一行 JSON 发群里） |

### 删除（第一次代码手术清单，动手时照此执行）
- `input.js` **整个删掉**（DeviceMotion / One Euro / 三帧模型——手机器官，本项目无手机）
- `scene.js` 里的 presentation rotation（90/270/180 CSS 旋转）与 `viewportToCanonical`
- `debug.js` 里的 presets 文件夹（localStorage 存档/★内置/load/save/delete）——**只留 copy/paste JSON**；同时删掉顶部 `import m1StandingWave`（此 import 是 `presets/m1-standing-wave.json` 还留在仓库里的唯一原因，删完 import 后把 presets/ 目录一并删除）
- `debug.js` 里的 input 面板文件夹、重力箭头、hold frame
- `world.js` 里的 TANK_PRESETS 平台分支（一个桌面缸即可）、gravity 保留常量即可
- `sepFalloff` 下拉、`centeringWeight` 可留可删（留着无害，是免费的调参维度）

---

## 2. 总体架构：一张图

```
engine/（现成，冻结面——队友不进）
  world.js   boids.js   scene.js   panel(debug.js)
        ▲ 表型参数         ▲ 自动生成滑块
        │                  │
  traits.js ————————— 【北辰的文件】TRAIT_TABLE + allocate() + phenotype()
        ▲ 初始分配
        │
  lineage.js ———————— 【Billy】代际记录，append-only，不可回档
        ▲ 当代环境
        │
  environments.js ——— 【三金的文件】ENV_SEQUENCE（手工编排的债务闭环）
        │
  game.js ——————————— 回合循环：调参 → 快进演化 → 判定 → 封代 → 下一代
        │
  ui/ ————————————————【Billy】脊椎（继承链可视化）、风格、结算画面
```

**铁律：每人一个文件。** 北辰只改 `traits.js`，三金只改
`environments.js`，两个文件都是"纯数据 + 纯函数"，不 import 引擎、
不碰渲染。接口契约见 §3/§5，改契约需三人同意。

---

## 3. 零和预算（此消彼长）的数据结构

**共享预算池 + 比例再归一。** 所有 trait 的分配值共享一个总预算：

```js
// traits.js —— 北辰的领地
export const BUDGET = 100;

export const TRAIT_TABLE = {
  speed:   { label: '速度',  min: 5, init: 30 },
  size:    { label: '体型',  min: 5, init: 30 },
  vision:  { label: '视野',  min: 5, init: 20 },
  stomach: { label: '耐饿',  min: 5, init: 20 },
  // 加第五个 trait = 加一行。面板滑块自动生成。
};

// 唯一会改分配的函数——零和不变量只活在这一个地方：
// 玩家把 trait k 拉到 v，其余 trait 按比例吃掉/吐出差额（尊重 min）。
export function allocate(alloc, k, v) { /* 比例再归一，见实现 */ }

// 分配 → 表型（引擎参数）。纯函数，公式全在这，北辰随便改：
export function phenotype(alloc) {
  return {
    cruiseSpeed:  0.1 + alloc.speed * 0.004,
    maxSpeed:     0.2 + alloc.speed * 0.006,
    bodyScale:    0.6 + alloc.size  * 0.02,
    turnSpeed:    5.0 - alloc.size  * 0.05,   // 体型大 → 转向慢（债）
    perceptionFOV: 90 + alloc.vision * 3,
    alignmentRadius: 0.06 + alloc.vision * 0.002,
    hungerDrain:  1.5 - alloc.stomach * 0.01, // 耐饿高 → 掉饥饿慢
    // …北辰在这里雕：每个"好处"旁边配一个"债"
  };
}
```

为什么选比例再归一而不是显式点数池：**滑块会自己动**。玩家拉高
"速度"，"体型/视野/耐饿"三根滑块当场肉眼可见地缩——这就是需求里
"改一个，另一个当场动"的最直接实现，零额外 UI。面板从 TRAIT_TABLE
自动生成滑块（复用 addParam），北辰加 trait 不用求任何人。

**可见性加成（Billy 的 UI 层，可后做）：** 分配雷达图/堆叠条 +
鱼当场变（体型=缩放、速度=游速、视野=现成的 vision cone 可视化）。

---

## 4. 继承链（不可回档）的组织

**append-only 的代际记录数组。整个项目里不存在任何回滚 API。**

```js
// lineage.js —— Billy 的领地
// 每代封存一条记录，Object.freeze 冻死：
// { gen, allocBefore, allocAfter, locked:[...], env: 'ice-age',
//   verdict: 'survived'|'died', notes }
// 规则：
// 1. 只有 closeGeneration() 能写 lineage，且只能 push。
// 2. 下一代初始分配 = 上一代 allocAfter 的深拷贝。
// 3. 遗产锁：上一代玩家改过的 trait，本代锁死不可再改
//    （locked 数组驱动滑块 disable）——"你的指纹变成子孙的镣铐"。
// 4. 一代→三代 = 数组自然生长 + ENV_SEQUENCE 多写两项。零改架构。
```

**脊椎 UI = lineage 数组的可视化**，不是装饰——它就是"回头指认
那个选择"的证据链，是唯一验证点的载体。每代节点至少展示：当时
改了什么(→locked)、环境是什么、结局。

---

## 5. 环境契约（三金的文件）

```js
// environments.js —— 三金的领地
export const ENV_SEQUENCE = [
  {
    id: 'gen1-predator', label: '掠食者之年',
    story: '……',                     // 结算画面文案
    yearsPerRound: 10,               // 快进跨度
    // v0 判定 = 查表，不做真模拟（见 §6 的诚实建议）：
    require: { speed: { min: 35 } }, // 表型/分配阈值
    prefer:  { size:  { max: 40 } }, // 软加分项
    dressing: { bg: '#0a1a2e', props: [...] }, // 场景皮肤钩子
    music: 'gen1.mp3',
  },
  // gen2, gen3 —— 债务闭环在这里编排：
  // gen1 逼你点速度 → gen3 的环境惩罚"速度高+体型小"的后代
];
```

判定函数 `judge(phenotype, env) → verdict` 住在 game.js，只读
这两个契约。三金编排"债的闭环"完全不需要碰代码逻辑。

---

## 6. 一代 demo 最短路径（按此顺序，每步结束都能跑）

1. **代码手术**（§1 删除清单）→ 素鱼在素缸里游。〔半天，Billy+fable〕
2. **traits.js + 面板自动滑块** → 拉"速度"，其他滑块当场缩、
   鱼当场变快变小。**这一步完成即达成"第一块砖"的验证点。**〔半天〕
3. **game.js 回合骨架**：确认分配 → 快进（时间加速×N 或直接跳） →
   `judge()` 查表判生死 → 结算画面。〔半天〕
4. **lineage.js + 遗产锁 + 极简脊椎**（哪怕是三行文字的家谱）。〔半天〕

到第 2 步队友即可并行：北辰进 traits.js 雕数值，三金进
environments.js 编排三代闭环。第 3、4 步不阻塞他们。

**一个诚实的减负建议（fable 5 的强烈意见）：** v0 的生死判定用
**查表**（表型 vs 环境阈值），不做真实的掠食者追逐/饥饿模拟。
屏幕上的鱼负责"看起来像那么回事"（速度/体型/视野肉眼可见），
判定负责逻辑自洽。真模拟（掠食者 boid、食物颗粒、饥饿条）是
v1 锦上添花——黑客松评委看的是债的闭环成立不成立，不是流体力学。
需要真掠食者时，它就是一条 zero-row 特殊鱼（大 boid 追逐），
引擎现成支持，别提前做。

---

## 7. 分工与协作规则

| 谁 | 文件领地 | 工具 | 不许碰 |
|---|---|---|---|
| 北辰 | `traits.js`（TRAIT_TABLE + phenotype 公式） | 面板滑块实时调 + copy JSON 发群 | engine/、lineage、env |
| 三金 | `environments.js`（三代序列）+ 场景资产 + 配乐 | env 预览开关（game.js 提供跳代预览） | engine/、traits 公式 |
| Billy | `lineage.js`、`game.js`、`ui/`、视觉风格、engine 手术 | fable 5 | ——（仲裁者） |

- 接口契约（TRAIT_TABLE 形状、ENV 形状、phenotype 输出字段）改动
  需三人知情——这三个形状就是你们的 API。
- 数值分享用面板的 copy/paste JSON，不用截图、不用口头报数。
- git：本仓库已断开水族馆 remote。**建新 GitHub repo 后再 push**；
  三人协作建议 main 直推 + 领地文件天然不冲突。

## 8. 留给团队的开放问题（不阻塞第一块砖）

1. 黑客松具体日期/剩余天数？（决定 §6 之后还砍不砍）
2. 快进的呈现：瞬间跳（快）还是加速播放鱼群挣扎（有戏剧性但费时间）？
3. 三代之后有没有"结局"画面（家谱回放 = 指认时刻的仪式化）？——
   强烈建议有，这是唯一验证点的舞台。
4. 鱼的关节自由度（Billy 暂定简单几何）——v1 以后再议，engine 的
   InstancedMesh 换骨骼动画是大手术，别在黑客松里做。
