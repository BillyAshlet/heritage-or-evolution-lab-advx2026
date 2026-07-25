# experiment 分支 Web 实验开发基线

本文件是 `experiment` 分支的实施与验收基线。它把需求文档中的研究目标
落实为可运行、可调参、可复现实验。生态淘汰子实验覆盖可耗竭浮游、饥饿
与真实灭绝结局；遗传、继承和四阶段回合系统仍单独排期。

## 1. 范围与红线

- 运行入口是根目录 Vite 应用，渲染使用 Three.js，动态刚体使用
  `@dimforge/rapier3d-compat@0.19.3`。
- 不引入 Godot、Electron、Tauri 或任何桌面套壳。
- 默认三群数量为小/中/大 `400/200/40`。
- 页面分为主水族馆、营养级联、地图刚体和生态淘汰四个项目上下文。子实验不得反向
  修改主水族馆的默认生物规则。
- 提供 `200/80/20` 的 300 条性能预设；手工改数量进入 Custom，不偷偷
  覆盖用户值。
- `REQUIREMENTS-experiment.md`、`赛道信息.md`、`docs/`、`test/`、`godot/`
  继续由 `.gitignore` 排除；本地 `地图演示图.png` 只作布局参考。
- 所有实验参数必须进入统一配置和面板注册表。行为代码不得藏有只能改源码
  才能调节的实验常量。

## 2. 系统边界

每个固定步只建立一次全局空间哈希。鱼以联合数组存储，并以 `schoolId`
区分群体；同群 Reynolds 力、跨群斥力、捕食窗口与威胁均由同一轮邻居遍历
累加。静态障碍通过预计算距离场查询，Rapier 仅处理缸壁、静态碰撞体和少量
动态刚体，鱼本身不注册刚体。

```text
seeded RNG → 联合鱼群 → 全局空间哈希 → steering / 捕食关系
                    ↘ 距离场 → 静态避障
                    ↘ Rapier → 动态物体查询与偏心冲量
                    ↘ CascadeProbe → 曲线、判据、报告
                    ↘ EcologyLedger → 浮游、能量、死亡与胜者
```

配置分为 `live`、`reset`、`rebuildField`、`rebuildScene` 四种生效方式。
JSON 导入先完整校验，再一次性替换运行配置；模拟和面板不能处于不同版本。

## 3. 尺度、动态角色与捕食

同群感知半径从目标邻居数反推：

```text
rawRadius = cbrt(3 × min(targetNeighbors, count - 1) × tankVolume
                 / (4π × count))
visualLength = 0.046 × size
neighborRadius = max(rawRadius, minNeighborRadiusFactor × visualLength)
```

凝聚、对齐、分离、威胁探测半径分别是邻域半径的
`1 / 0.35 / 0.40 / 0.75` 倍。跨群斥力半径为
`0.15 × max(sizeA, sizeB)`。空间哈希 cell 使用所有查询半径中的最大值，
统一查询 `3×3×3` 邻格。

鱼群没有固定的 predator/prey 类型。任何 `size` 修改都会在下一固定步
重新计算完整关系矩阵。

主水族馆默认采用开放体型规则：

```text
actorSize / targetSize ≥ k → pursuit
actorSize / targetSize ≤ 1/k → evade
其他                         → peer
```

因此默认大群会同时捕食中群和小群；如果把小群体型拖到大群以上，双方角色
会自动反转。方向性关系是派生结果，不为 N 个鱼群维护 N×N 参数矩阵。

营养级联子实验采用尺寸窗口：

```text
k ≤ actorSize / targetSize ≤ K_max → pursuit
1/K_max ≤ ratio ≤ 1/k              → evade
1/k < ratio < k                    → peer
其他                                → ignore
```

默认 `k=1.35`、`K_max=2.0`，退出边界带 `δ=0.10` 滞回。同群永不捕食。
只有级联子实验会让大群与小群互不产生 pursuit、directThreat、panic 或
capture。威胁由有效关系中的捕食者进入邻近范围触发，与目标选择和捕获冷却
无关。

捕食者只在 pursuit 激活时获得 `1.35×` 冲刺，逃逸者上限为 `1.15×`。
捕获距离使用双方真实渲染体长之和的一半。捕食模式按每个捕食鱼群
`3 次/秒` 的目标速率反推每鱼独立冷却，并用种子随机数打散相位。
捕获发生时从猎物死亡点发射可调的立方碎片，并在捕食者处产生咬合闪光。
每条有向捕食关系额外累计追击开始、追击帧、放弃、捕获、平均追击时长、
捕获追击时长、爆发秒数和捕获转化率。面板同时显示理论闭合时间；只有闭合
速度非正时警告，不使用未经实测支持的 `panic × 1.4` 硬阈值。

## 4. 主项目与隔离子实验

### Main Aquarium

默认打开主水族馆。它启用开放体型规则、捕获和捕获特效；死亡永久减少
当前种群，只有显式 reset/rebuild 才重新建立初始数量。它用于观察任意
数量鱼群形成的实时食物网。鱼群编辑器一次只展示一个群体：
使用前后箭头切换，通过加减按钮增删；形态、运动、群游和出生参数在该鱼群
内部分类。编辑器同时显示该群当前自动角色及其对其他鱼群的派生关系。

### Cascade Mode

级联模式关闭捕获。大群先在可视 holding zone 中保持同群行为，同时
从跨群查询排除；中、小群先完成可调的松弛期，再形成至少两秒基线。有效
基线会锁存并暂停在同一状态，避免操作者反应时间破坏 seed 复现；之后才
允许释放。释放时记 `t=0`，
之后不再脚本驱动。

单次释放仍保留以下旧指标，作为事件诊断而非交付结论：

- 中、小群基线 RoG 小于缸最短边一半，平均同群邻居数大于 3。
- 两群 RoG 都相对基线上升至少 10%。
- 小群峰值比中群峰值至少晚 `0.25s`。
- 释放至小群峰值，大→小斥力冲量小于中→小的 10%。
- 小群散开最快时，中群最近邻归因率比基线高至少 10 个百分点。
- 大→小 pursuit、directThreat、capture 始终为零。

RoG 始终相对实时群心计算，所以整群平移不会被误判为散开。默认批量种子
为 `1001–1010`。每个 seed 建立两份相同初态：事件组释放大群，对照组始终
保持 holding；最终测量：

```text
Δmedium = (RoG_event_medium - RoG_control_medium) / baseline_medium
Δsmall  = (RoG_event_small  - RoG_control_small)  / baseline_small
```

默认诊断阈值为中群 `5%`、小群 `10%`，并要求小群差分峰晚于中群至少
`0.25s`。批量结果报告 `pairedPasses / total`，但不再汇总成 7/10 的
交付 PASS/FAIL 硬门。图表以实线显示释放组、虚线显示 holding 对照。
随机指标算法只用合成时间序列做单元测试。

### Predation Mode

捕食模式开启真实捕获，但没有补充或繁殖。被捕获个体永久死亡，当前数量
单调减少，直到操作者显式 reset/rebuild。未来如果增加繁殖，必须以种群
当前数量和明确生态条件驱动，不得重新实现“按目标数量补缺口”。

### Ecology Mode

生态淘汰模式采用开放体型关系并允许捕获。每鱼保存独立能量：

```text
basalDrain = basalRate / size ^ basalSizeExponent
```

默认 `basalRate=0.020`、指数 `0.75`；小/中/大群浮游摄食系数为
`1.0 / 0.25 / 0.0`，大群是纯捕食者。浮游资源按 logistic 方程增长，
摄食受当前资源和半饱和参数限制；捕获按猎物体型为捕食者补能。所有容量、
增长、摄食、转化、代谢和捕获补能参数都在注册表与面板中。

该项目启用隔离的 trait coupling：体型会压低持续速度与转向，但捕食者使用
`stalk → burst → recover` 状态和独立 stamina 完成短时追击。爆发距离、
速度、恢复、耐力阈值与消耗全部可调。只剩一个种群时冻结模拟并报告胜者；
全部灭绝时冻结为 `collapse`。

## 5. 障碍、刚体与相机

障碍预设由两个穿孔面板、两个矩形障碍和缸体组成。一个 `ObstacleSpec`
同时生成 Three.js 网格、Rapier collider 和解析 SDF。默认 `0.05m` 距离场
在六面各带一圈 padding；采样和中心差分在边界 clamp。穿孔区域或靠近表面
时直接使用解析 SDF，避免低分辨率把洞口抹平。

动态圆环、立方体、柱子与底座由 Rapier 处理。穿孔物体使用挂在同一刚体上
的多个凸 collider；鱼仍是纯 boid，只在 AABB 预筛后查询动态物体，并通过
偏心 `applyImpulseAtPoint` 推动它们。

第一人称采用 Pointer Events：单击选择后相机拉近并持续跟随，再次单击显示
操作列表，双击直接进入。ESC、右键或双击空白退出。相机位置与朝向独立
阻尼，进入时隐藏当前鱼实例；目标死亡后优先切到最近同群活鱼。

## 6. 公共调试接口

浏览器控制台暴露：

```js
window.experiment = {
  config,
  stageConfig,
  applyConfig,
  exportConfig,
  importConfig,
  reset,
  releaseHolding,
  runSeed,
  runBatch,
  metrics,
  spawnRigidBody,
  setProject
}
```

面板还提供默认值恢复、JSON 导入导出、本地保存、seed 复制、实验报告导出、
实时关系矩阵、派生半径、捕获距离、追击转化、能量、耐力、浮游账本和
实测邻居数。

## 7. 阶段门与验收

进入动态刚体阶段前，三群必须已经通过群形、相邻层捕食关系、级联采集和
静态距离场性能检查。若最终只能交付两群，必须明确标为降级版本，不能宣称
完成三群级联。

自动测试放在可提交的 `src/*.test.js`，覆盖配置注册、半径、空间哈希、
关系窗口、威胁、速度与捕获、永久死亡、种子复现、合成级联判据
与同 seed 配对、生态能量、灭绝结局和距离场梯度。纯模型测试不导入
Three.js；渲染相关模拟测试单独放置。交付前必须通过 `npm test` 与
`npm run build`，再做 640 条鱼、paired seeds、生态账本、洞口拥堵、
三类刚体、第一人称及三大现代浏览器冒烟。
