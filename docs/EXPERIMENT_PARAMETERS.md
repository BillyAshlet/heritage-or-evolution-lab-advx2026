# Web 实验版完整参数清单

> 本文件由 `node tools/export_experiment_parameters.mjs --write` 从统一配置注册表生成。
> 它列出实验与调试层的全部参数；Game 模式不会把这张表直接展示给玩家。

当前共 **313** 个可配置叶字段。

## Game 模式的三角形参数翻译

| 三角方向 | 直接翻译 | 主要代价 |
| --- | --- | --- |
| 速度 | 蓝鱼巡航速度、最高速度、捕获处理时间 | 高速提高蓝鱼代谢 |
| 体型 | 蓝鱼真实渲染尺寸、捕食关系、捕获距离、持续速度与转向 | 变大会变慢、转向更迟钝，并可能进入新的捕食窗口 |
| 耐力 | 只降低蓝鱼代谢倍率 | 不提高觅食率，不直接回血 |

三角位置使用非负重心权重 `w_size + w_stamina + w_speed = 1`。每轴按同一分段公式映射：

```text
w ≤ 1/3：m = 0.5 + 1.5w
w ≥ 1/3：m = 0.75 + 0.75w
```

中心点三项均为 `×1`；任一顶点为偏好轴 `×1.5`、另外两轴各 `×0.5`。
当前尝试先把本代系数与已继承累计系数逐项相乘，再从同一套理想基础参数派生实际表型。
只有成功封代才提交新的累计系数，且累计不 clamp；失败不改变已继承值。

## Game 固定关卡与理想基础参数

> 下列参数参与 Game 模拟，但不会作为额外控件暴露给玩家；玩家仍只操作三角形。

### 蓝鱼理想基础值

| 路径 | 固定值 |
| --- | --- |
| `playerIdealBase.size` | `1.5` |
| `playerIdealBase.cruiseSpeed` | `0.23` |
| `playerIdealBase.maxSpeed` | `0.46` |
| `playerIdealBase.turnSpeed` | `2.8` |
| `playerIdealBase.metabolismMultiplier` | `1` |

### 三项表型耦合

| 路径 | 固定值 |
| --- | --- |
| `playerCoupling.sizeSpeedPenaltyExponent` | `0.2` |
| `playerCoupling.sizeTurnPenaltyExponent` | `0.55` |
| `playerCoupling.sizeMetabolismExponent` | `1.25` |
| `playerCoupling.activeSpeedMetabolismShare` | `0.4` |

### 三关 LevelSpec

| 路径 | 固定值 |
| --- | --- |
| `levels.L1.id` | `L1` |
| `levels.L1.label` | `第一代 · 匮乏年代` |
| `levels.L1.story` | `捕食者环伺，浮游只够勉强充饥。活下来比壮大更重要。` |
| `levels.L1.durationSec` | `90` |
| `levels.L1.winSurvivalPct` | `35` |
| `levels.L1.plankton.enabled` | `true` |
| `levels.L1.plankton.capacity` | `300` |
| `levels.L1.plankton.initialFraction` | `0.58` |
| `levels.L1.plankton.growthRate` | `0.09` |
| `levels.L1.plankton.maxIntakePerFish` | `0.035` |
| `levels.L1.plankton.energyConversion` | `0.6` |
| `levels.L1.preyFish.id` | `small` |
| `levels.L1.preyFish.name` | `稀少食物鱼` |
| `levels.L1.preyFish.count` | `72` |
| `levels.L1.preyFish.sizeClass` | `1` |
| `levels.L1.preyFish.captureRateMultiplier` | `5` |
| `levels.L1.rivalFish.id` | `large` |
| `levels.L1.rivalFish.name` | `饥荒捕食者` |
| `levels.L1.rivalFish.count` | `24` |
| `levels.L1.rivalFish.sizeClass` | `3` |
| `levels.L1.rivalFish.speedMultiplier` | `1.2` |
| `levels.L1.playerFish.id` | `medium` |
| `levels.L1.playerFish.name` | `蓝色进化鱼` |
| `levels.L1.playerFish.count` | `40` |
| `levels.L1.simulation.captureRate` | `0.8` |
| `levels.L1.simulation.playerCaptureRateMultiplier` | `0.35` |
| `levels.L1.simulation.rivalCaptureRateMultiplier` | `0.3` |
| `levels.L1.simulation.relationK` | `1.25` |
| `levels.L1.simulation.relationKMax` | `2.9` |
| `levels.L1.simulation.captureLengthFactor` | `1.5` |
| `levels.L1.simulation.activityScale` | `1` |
| `levels.L1.rules.reproduction` | `false` |
| `levels.L1.rules.respawn` | `false` |
| `levels.L1.terrain.narrowGaps` | `false` |
| `levels.L1.dressing.bg` | `#071426` |
| `levels.L1.dressing.propsRef` | `scarcity` |
| `levels.L1.dressing.musicRef` | `scarcity` |
| `levels.L2.id` | `L2` |
| `levels.L2.label` | `第二代 · 黄金时代` |
| `levels.L2.story` | `浮游见底，少量捕食者之外出现了与你原本平行的鱼群。` |
| `levels.L2.durationSec` | `75` |
| `levels.L2.winSurvivalPct` | `75` |
| `levels.L2.plankton.enabled` | `true` |
| `levels.L2.plankton.capacity` | `180` |
| `levels.L2.plankton.initialFraction` | `0.28` |
| `levels.L2.plankton.growthRate` | `0.04` |
| `levels.L2.plankton.maxIntakePerFish` | `0.03` |
| `levels.L2.preyFish.id` | `small` |
| `levels.L2.preyFish.name` | `平行鱼` |
| `levels.L2.preyFish.count` | `110` |
| `levels.L2.preyFish.sizeClass` | `1.2` |
| `levels.L2.preyFish.captureRateMultiplier` | `5` |
| `levels.L2.rivalFish.id` | `large` |
| `levels.L2.rivalFish.name` | `稀少捕食者` |
| `levels.L2.rivalFish.count` | `2` |
| `levels.L2.rivalFish.sizeClass` | `2.25` |
| `levels.L2.playerFish.id` | `medium` |
| `levels.L2.playerFish.name` | `蓝色进化鱼` |
| `levels.L2.playerFish.count` | `40` |
| `levels.L2.playerFish.grazeRate` | `0.02` |
| `levels.L2.simulation.captureRate` | `0.8` |
| `levels.L2.simulation.playerCaptureRateMultiplier` | `2` |
| `levels.L2.simulation.rivalCaptureRateMultiplier` | `0.04` |
| `levels.L2.simulation.relationKMax` | `3.3` |
| `levels.L2.simulation.captureLengthFactor` | `2` |
| `levels.L2.simulation.ecology.captureEnergyPerSize` | `9` |
| `levels.L2.simulation.ecology.burstMetabolicRate` | `0.005` |
| `levels.L2.simulation.relations.targetLockTime` | `5` |
| `levels.L2.simulation.relations.burstRadiusFactor` | `1` |
| `levels.L2.simulation.locomotion.burstFactor` | `2.5` |
| `levels.L2.simulation.locomotion.burstForceBudget` | `3` |
| `levels.L2.simulation.activityScale` | `1` |
| `levels.L2.rules.reproduction` | `false` |
| `levels.L2.rules.respawn` | `false` |
| `levels.L2.terrain.narrowGaps` | `false` |
| `levels.L2.dressing.bg` | `#12324a` |
| `levels.L2.dressing.propsRef` | `golden-age` |
| `levels.L2.dressing.musicRef` | `golden-age` |
| `levels.L3.id` | `L3` |
| `levels.L3.label` | `第三代 · 后疫情时代` |
| `levels.L3.story` | `食物与猎食者都已稀少，整个生态降低活动，耐力决定谁能熬到最后。` |
| `levels.L3.durationSec` | `105` |
| `levels.L3.winSurvivalPct` | `50` |
| `levels.L3.plankton.enabled` | `true` |
| `levels.L3.plankton.capacity` | `46` |
| `levels.L3.plankton.initialFraction` | `0.34` |
| `levels.L3.plankton.growthRate` | `0.03` |
| `levels.L3.plankton.maxIntakePerFish` | `0.025` |
| `levels.L3.preyFish.id` | `small` |
| `levels.L3.preyFish.name` | `零散鱼群` |
| `levels.L3.preyFish.count` | `10` |
| `levels.L3.preyFish.sizeClass` | `1` |
| `levels.L3.rivalFish.id` | `large` |
| `levels.L3.rivalFish.name` | `迟缓捕食者` |
| `levels.L3.rivalFish.count` | `2` |
| `levels.L3.rivalFish.sizeClass` | `2.25` |
| `levels.L3.playerFish.id` | `medium` |
| `levels.L3.playerFish.name` | `蓝色进化鱼` |
| `levels.L3.playerFish.count` | `40` |
| `levels.L3.simulation.captureRate` | `0.8` |
| `levels.L3.simulation.playerCaptureRateMultiplier` | `0.1` |
| `levels.L3.simulation.rivalCaptureRateMultiplier` | `0.04` |
| `levels.L3.simulation.relationKMax` | `1.667` |
| `levels.L3.simulation.activityScale` | `0.72` |
| `levels.L3.rules.reproduction` | `false` |
| `levels.L3.rules.respawn` | `false` |
| `levels.L3.terrain.narrowGaps` | `false` |
| `levels.L3.dressing.bg` | `#111c28` |
| `levels.L3.dressing.propsRef` | `post-pandemic` |
| `levels.L3.dressing.musicRef` | `post-pandemic` |

## 全部实验参数

| 路径 | 默认值 | 分组 | 面板标签 | 生效方式 | 安全范围 / 选项 |
| --- | --- | --- | --- | --- | --- |
| `runtime.project` | `aquarium` | 项目 | project | `rebuildScene` | 游戏 · 三代进化=game；主项目 · 水族馆=aquarium；子实验 · 地图与刚体=obstacle；子实验 · 生态淘汰=ecology |
| `runtime.mode` | `steady` | Advanced · Runtime | mode | `reset` | Predation · permanent death=steady；Ecology=ecology |
| `runtime.populationPreset` | `full` | 运行 | population preset | `rebuildScene` | 完整 680=full；性能 320=performance；自定义=custom |
| `runtime.randomizeSeed` | `true` | 运行 | 每局随机种子 | `live` | 布尔/文本 |
| `runtime.seed` | `1001` | 运行 | seed | `reset` | 1…999999，步长 1 |
| `runtime.timeScale` | `1` | 运行 | time scale | `live` | 0…4，步长 0.1 |
| `runtime.fixedDt` | `0.016666666666666666` | Advanced · Runtime | fixed dt | `reset` | 0.004166666666666667…0.05，步长 0.004166666666666667 |
| `runtime.initialSpawnAttempts` | `16` | Advanced · Runtime | initial spawn attempts | `rebuildScene` | 1…100，步长 1 |
| `runtime.spawnMode` | `pods` | 运行 | spawn mode | `reset` | 分小群（fission-fusion）=pods；全缸随机=random；整群一团=cluster |
| `tank.preset` | `aquarium` | 缸体 | preset | `rebuildScene` | Game=game；Aquarium=aquarium；Obstacle=obstacle；Ecology=ecology；Custom=custom |
| `tank.width` | `6` | 缸体 | width | `rebuildScene` | 1…12，步长 0.05 |
| `tank.height` | `3.6` | 缸体 | height | `rebuildScene` | 0.6…7.2，步长 0.05 |
| `tank.depth` | `2.4` | 缸体 | depth | `rebuildScene` | 0.4…4.8，步长 0.05 |
| `tank.wallMargin` | `0.035` | Advanced · Tank | wall margin · 硬边界 | `live` | 0…0.2，步长 0.005 |
| `tank.edgeSoftness` | `0.16` | Advanced · Tank | edge softness · 软转向带 | `live` | 0.02…0.5，步长 0.01 |
| `perception.minNeighborRadiusFactor` | `3` | 感知 | min radius / body | `reset` | 1…8，步长 0.1 |
| `perception.alignmentRadiusFactor` | `0.533` | 感知 | radius ×（全局） | `live` | 0.05…1，步长 0.01 |
| `perception.separationRadiusFactor` | `0.222` | 感知 | radius ×（全局） | `live` | 0.05…1，步长 0.01 |
| `perception.detectionLengthFactor` | `0.511` | 感知 | hunt / panic radius × cohesion | `live` | 0.1…2，步长 0.01 |
| `perception.fovDegrees` | `300` | 感知 | 视锥角度 | `live` | 60…360，步长 5 |
| `perception.separationFalloff` | `inverse` | 感知 | 分离衰减 | `live` | Inverse=inverse；Linear=linear；InvLog=invlog |
| `perception.podSpacingFactor` | `1.5` | 感知 | 小群内间距 × | `reset` | 0.6…4，步长 0.05 |
| `perception.cohesionFalloff` | `inverse` | 感知 | cohesion 衰减 | `live` | Inverse（小群可维持）=inverse；Uniform（经典 boids）=uniform |
| `perception.spawnHeadingJitter` | `0.6` | 感知 | 出生朝向散布 | `reset` | 0…1.5，步长 0.05 |
| `perception.socialSizeExponent` | `0.6` | 感知 | 体型→独行倾向 | `live` | 0…3，步长 0.05 |
| `perception.crossSeparationScale` | `0.15` | 跨鱼群作用 | cross separation radius / size | `live` | 0.02…0.5，步长 0.01 |
| `relations.KMax` | `1.667` | 关系 | 猎物体型窗口上界 | `live` | 1.05…6，步长 0.01 |
| `relations.k` | `1.35` | 关系 | 捕食体型阈值 k | `live` | 1.01…2，步长 0.01 |
| `relations.hysteresis` | `0.1` | 关系 | hysteresis δ | `live` | 0…0.5，步长 0.01 |
| `relations.pursuitWeight` | `1.05` | 关系 | 捕猎凝聚 weight | `live` | 0…4，步长 0.05 |
| `relations.burstRadiusFactor` | `0.75` | 关系 | burst radius × 大范围 | `live` | 0.05…1，步长 0.01 |
| `relations.burstWeight` | `2.2` | 关系 | burst weight | `live` | 0…20，步长 0.25 |
| `relations.evadeWeight` | `1.3` | 关系 | evade weight | `live` | 0…4，步长 0.05 |
| `relations.evadeLateralWeight` | `0.32` | 关系 | evade lateral | `live` | 0…2，步长 0.02 |
| `relations.directThreatPanic` | `0.85` | 关系 | threat panic target | `live` | 0…1，步长 0.01 |
| `relations.panicRiseRate` | `4.5` | 关系 | panic rise /s | `live` | 0.1…20，步长 0.1 |
| `relations.panicDecayRate` | `1.35` | 关系 | panic decay /s | `live` | 0.1…10，步长 0.05 |
| `relations.panicPropagation` | `0.92` | 关系 | panic 邻居传播 | `live` | 0…1，步长 0.01 |
| `relations.schoolSenseFactor` | `5` | 关系 | 群体感知 × | `live` | 1…12，步长 0.25 |
| `relations.targetLockTime` | `0.8` | 关系 | 目标锁定时长 | `live` | 0…5，步长 0.05 |
| `relations.signalRadiusFactor` | `0.8` | 关系 | 应急信号半径 × | `live` | 0.1…3，步长 0.05 |
| `relations.signalThreshold` | `0.35` | 关系 | 应急信号阈值 | `live` | 0…1，步长 0.01 |
| `relations.directOn` | `0.55` | 关系 | 直接威胁闩上 | `live` | 0…1，步长 0.01 |
| `relations.directOff` | `0.25` | 关系 | 直接威胁松开 | `live` | 0…1，步长 0.01 |
| `relations.holdTime` | `0.5` | 关系 | 惊吓保持时长 | `live` | 0…3，步长 0.05 |
| `relations.refractoryTime` | `1.4` | 关系 | 不应期 | `live` | 0…6，步长 0.05 |
| `relations.signalDecayTime` | `0.35` | 关系 | 脉冲衰减时间 | `live` | 0.05…2，步长 0.01 |
| `relations.emergencyAlignmentWeight` | `4` | 关系 | 应急对齐权重 | `live` | 0…12，步长 0.1 |
| `relations.alignmentSourceBoost` | `10` | 关系 | 应急航向优先度 | `live` | 0…30，步长 0.5 |
| `relations.alignmentReceiverBoost` | `1.5` | 关系 | 恐慌时倾听增益 | `live` | 0…6，步长 0.05 |
| `relations.alignmentReceiverMax` | `2.5` | 关系 | 倾听增益上限 | `live` | 1…6，步长 0.05 |
| `relations.escapePredictionTime` | `0.15` | 关系 | 逃逸预判时间 | `live` | 0…1，步长 0.01 |
| `relations.cohesionDrop` | `0.6` | 关系 | panic → cohesion 下降 | `live` | 0…1，步长 0.01 |
| `relations.panicTurnBoost` | `1.2` | 关系 | panic → 转向加成 | `live` | 0…4，步长 0.05 |
| `relations.panicMinTrigger` | `0.06` | 关系 | panic 触发下限 | `live` | 0…0.5，步长 0.01 |
| `locomotion.burstTurnFactor` | `0.4` | 运动 | 冲刺转向 × | `live` | 0.05…1，步长 0.01 |
| `locomotion.maxPitchDegrees` | `57` | 运动 | 最大俯仰角 | `live` | 5…90，步长 1 |
| `locomotion.burstSocialSuppression` | `0.3` | 运动 | 冲刺时社交压低 × | `live` | 0…1，步长 0.01 |
| `locomotion.burstForceBudget` | `1.6` | 运动 | 冲刺力预算 × | `live` | 1…6，步长 0.05 |
| `locomotion.burstFactor` | `1.35` | 运动 | pursuit burst × | `live` | 1…3，步长 0.01 |
| `locomotion.panicSpeedFactor` | `1.15` | 运动 | panic speed × | `live` | 1…3，步长 0.01 |
| `locomotion.maxForce` | `5.2` | 运动 | max steering | `live` | 0.05…10，步长 0.01 |
| `locomotion.interceptLookAhead` | `1.3` | 运动 | intercept look-ahead | `live` | 0…5，步长 0.05 |
| `locomotion.boundaryWeight` | `1.8` | 运动 | boundary weight | `live` | 0…6，步长 0.05 |
| `locomotion.avoidanceWeight` | `2.2` | 运动 | avoidance weight | `live` | 0…8，步长 0.05 |
| `locomotion.panicAvoidanceSuppression` | `0.72` | 运动 | panic avoidance suppression | `live` | 0…1.5，步长 0.01 |
| `locomotion.avoidanceInertia` | `0.72` | 运动 | avoidance inertia | `live` | 0…0.99，步长 0.01 |
| `locomotion.wanderWeight` | `0.08` | 运动 | wander weight | `live` | 0…1，步长 0.01 |
| `traits.enabled` | `false` | Trait Coupling | 体型耦合启用 | `live` | 布尔/文本 |
| `traits.sizeSpeedPenaltyExponent` | `0.2` | Trait Coupling | size → speed exponent | `live` | 0…2，步长 0.01 |
| `traits.minSustainedSpeedFactor` | `0.55` | Trait Coupling | min sustained speed × | `live` | 0.1…1，步长 0.01 |
| `traits.sizeTurnPenaltyExponent` | `0.55` | Trait Coupling | size → turn exponent | `live` | 0…2，步长 0.01 |
| `traits.minTurnFactor` | `0.45` | Trait Coupling | min turn × | `live` | 0.1…1，步长 0.01 |
| `ecology.enabled` | `true` | 生态能量 | 耐力系统启用 | `reset` | 布尔/文本 |
| `ecology.energyCapacity` | `0.6666666666666666` | 生态能量 | energy capacity | `reset` | 0.05…20，步长 0.05 |
| `ecology.initialEnergyRatio` | `0.82` | 生态能量 | initial energy | `reset` | 0.01…1，步长 0.01 |
| `ecology.initialEnergyJitter` | `0.25` | 生态能量 | 初始能量抖动 ± | `reset` | 0…0.8，步长 0.01 |
| `ecology.forageEnergyMultiplier` | `2.2` | 生态能量 | 进食能量 × | `live` | 0.1…8，步长 0.05 |
| `ecology.energyShareFraction` | `0.4` | 生态能量 | 族群共享比例 | `live` | 0…1，步长 0.01 |
| `ecology.basalRate` | `0.02` | 生态能量 | basal drain /s | `live` | 0…1，步长 0.001 |
| `ecology.basalSizeExponent` | `0.75` | 生态能量 | basal size exponent | `live` | 0…3，步长 0.01 |
| `ecology.burstMetabolicRate` | `0.035` | 生态能量 | burst drain /s | `live` | 0…2，步长 0.005 |
| `ecology.captureEnergyPerSize` | `1` | 生态能量 | capture energy / prey size | `live` | 0…10，步长 0.05 |
| `ecology.starvationVfxEnabled` | `true` | 生态能量 | starvation effect | `live` | 布尔/文本 |
| `ecology.minBurstEnergyRatio` | `0.3333333333333333` | 生态能量 | min energy to burst | `live` | 0…1，步长 0.01 |
| `ecology.corpseFadeTime` | `1.6` | 生态能量 | 死亡渐变时长 | `live` | 0.1…8，步长 0.1 |
| `ecology.corpseDrag` | `2.4` | 生态能量 | 尸体阻尼 | `live` | 0…12，步长 0.1 |
| `ecology.burstSizeScaled` | `true` | 生态能量 | 冲刺代谢按体型缩放 | `live` | 布尔/文本 |
| `ecology.corpseRiseSpeed` | `0.06` | 生态能量 | 浮尸上浮速度 | `live` | 0…0.5，步长 0.005 |
| `ecology.planktonEnergy` | `0.06` | 生态能量 | 浮游单次能量 | `live` | 0…1，步长 0.005 |
| `ecology.grazeHungerRatio` | `0.8` | 生态能量 | 觅食饥饿阈值 | `live` | 0.1…1，步长 0.01 |
| `ecology.carrionEnergy` | `0.18` | 生态能量 | 尸体能量 / 碎片 | `live` | 0…2，步长 0.01 |
| `ecology.carrionRadius` | `0.08` | 生态能量 | 尸体进食半径 | `live` | 0.01…0.5，步长 0.005 |
| `plankton.enabled` | `true` | 浮游资源 | plankton enabled | `live` | 布尔/文本 |
| `plankton.capacity` | `600` | 浮游资源 | carrying capacity | `reset` | 1…10000，步长 1 |
| `plankton.initialFraction` | `0.8` | 浮游资源 | initial fraction | `reset` | 0…1，步长 0.01 |
| `plankton.growthRate` | `0.12` | 浮游资源 | logistic growth /s | `live` | 0…3，步长 0.01 |
| `plankton.halfSaturationFraction` | `0.2` | 浮游资源 | half saturation | `live` | 0.001…1，步长 0.001 |
| `plankton.maxIntakePerFish` | `0.04` | 浮游资源 | max intake / fish /s | `live` | 0…2，步长 0.001 |
| `plankton.energyConversion` | `1` | 浮游资源 | energy / plankton | `live` | 0…10，步长 0.01 |
| `plankton.visualCount` | `1200` | 浮游资源 | visible particles | `rebuildScene` | 0…10000，步长 1 |
| `plankton.minFraction` | `0.01` | 浮游资源 | 存量下限比例 | `live` | 0…0.3，步长 0.005 |
| `plankton.pointSize` | `0.03` | 浮游资源 | particle size | `live` | 0.001…0.08，步长 0.001 |
| `plankton.color` | `#14532d` | 浮游资源 | particle color | `live` | 布尔/文本 |
| `plankton.opacity` | `0.75` | 浮游资源 | particle opacity | `live` | 0.05…1，步长 0.01 |
| `visual.bodyLength` | `0.03` | Advanced · Visual | body length | `rebuildScene` | 0.005…0.12，步长 0.001 |
| `visual.bodyRadius` | `0.008` | Advanced · Visual | body radius | `rebuildScene` | 0.002…0.04，步长 0.001 |
| `visual.radialSegments` | `6` | Advanced · Visual | radial segments | `rebuildScene` | 3…16，步长 1 |
| `visual.bankingGain` | `12` | 视觉 | 侧倾强度 | `live` | 0…40，步长 0.5 |
| `visual.maxRollDegrees` | `35` | 视觉 | 最大侧倾角 | `live` | 0…80，步长 1 |
| `visual.bankingSmoothing` | `0.18` | 视觉 | 侧倾平滑 | `live` | 0.02…1，步长 0.01 |
| `visual.opacity` | `0.92` | Advanced · Visual | fish opacity | `live` | 0.1…1，步长 0.01 |
| `debug.perceptionRadii` | `false` | 可视化 | 0号鱼 · 同群三力半径 | `live` | 布尔/文本 |
| `debug.combatRadii` | `false` | 可视化 | 0号鱼 · 捕食/逃逸半径 | `live` | 布尔/文本 |
| `capture.targetCaptureRate` | `0.8` | 捕食 | captures /s / school | `live` | 0.05…20，步长 0.05 |
| `capture.referenceCruiseSpeed` | `0.23` | 捕食 | reference cruise speed | `live` | 0.01…2，步长 0.01 |
| `capture.captureLengthFactor` | `0.5` | 捕食 | capture length × | `live` | 0.1…2，步长 0.01 |
| `captureVfx.enabled` | `true` | 捕获特效 | 特效启用 | `live` | 布尔/文本 |
| `captureVfx.particleCount` | `12` | 捕获特效 | 碎片数量上限 | `live` | 1…24，步长 1 |
| `captureVfx.density` | `2` | 捕获特效 | 碎片密度 | `live` | 0…12，步长 0.1 |
| `captureVfx.spawnRadius` | `0.055` | 捕获特效 | 生成半径 | `live` | 0…0.3，步长 0.002 |
| `captureVfx.spawnInterval` | `0.02` | 捕获特效 | 碎片间隔 | `live` | 0…0.2，步长 0.002 |
| `captureVfx.lifetime` | `0.75` | 捕获特效 | 碎片寿命 | `live` | 0.05…3，步长 0.05 |
| `captureVfx.cubeSize` | `0.022` | 捕获特效 | 碎片尺寸 | `live` | 0.002…0.08，步长 0.001 |
| `captureVfx.cubeColor` | `#1e4f8c` | 捕获特效 | 碎片颜色 | `live` | 布尔/文本 |
| `captureVfx.upwardSpeed` | `0.12` | 捕获特效 | 上浮速度 | `live` | 0…2，步长 0.01 |
| `captureVfx.reverseVelocityFactor` | `0.4` | 捕获特效 | 捕食者反向速度 | `live` | 0…2，步长 0.01 |
| `captureVfx.radialSpeed` | `0.22` | 捕获特效 | 径向速度 | `live` | 0…2，步长 0.01 |
| `captureVfx.biteGlowEnabled` | `true` | 捕获特效 | 咬合闪光 | `live` | 布尔/文本 |
| `captureVfx.biteGlowRadius` | `0.28` | 捕获特效 | 闪光半径 | `live` | 0.01…1，步长 0.01 |
| `captureVfx.biteGlowDuration` | `0.45` | 捕获特效 | 闪光时长 | `live` | 0.02…2，步长 0.01 |
| `captureVfx.biteGlowStrength` | `0.85` | 捕获特效 | 闪光强度 | `live` | 0…3，步长 0.01 |
| `captureVfx.feedEnabled` | `true` | 捕获特效 | 进食特效 | `live` | 布尔/文本 |
| `captureVfx.feedParticles` | `3` | 捕获特效 | 进食碎屑数 | `live` | 1…12，步长 1 |
| `captureVfx.feedSpeed` | `0.12` | 捕获特效 | 进食扩散速度 | `live` | 0…1，步长 0.01 |
| `captureVfx.feedSize` | `0.009` | 捕获特效 | 进食碎屑尺寸 | `live` | 0.002…0.04，步长 0.001 |
| `captureVfx.feedLifetime` | `0.32` | 捕获特效 | 进食碎屑寿命 | `live` | 0.05…2，步长 0.01 |
| `captureVfx.feedColor` | `#14532d` | 捕获特效 | 进食碎屑颜色 | `live` | 布尔/文本 |
| `captureVfx.maxParticles` | `600` | 捕获特效 | 粒子上限 | `live` | 32…4000，步长 8 |
| `captureVfx.biteGlowFalloff` | `2.4` | 捕获特效 | 闪光衰减 | `live` | 0…12，步长 0.1 |
| `starvationVfx.particleCount` | `10` | 耐力死亡特效 | 碎片数量上限 | `live` | 1…24，步长 1 |
| `starvationVfx.density` | `1.6` | 耐力死亡特效 | 碎片密度 | `live` | 0…12，步长 0.1 |
| `starvationVfx.spawnRadius` | `0.05` | 耐力死亡特效 | 生成半径 | `live` | 0…0.3，步长 0.002 |
| `starvationVfx.spawnInterval` | `0.03` | 耐力死亡特效 | 碎片间隔 | `live` | 0…0.2，步长 0.002 |
| `starvationVfx.cubeSize` | `0.02` | 耐力死亡特效 | 碎片尺寸 | `live` | 0.002…0.08，步长 0.001 |
| `starvationVfx.cubeColor` | `#8B5A2B` | 耐力死亡特效 | 碎片颜色 | `live` | 布尔/文本 |
| `starvationVfx.persist` | `true` | 耐力死亡特效 | 尸体不消失 | `live` | 布尔/文本 |
| `starvationVfx.radialSpeed` | `0.035` | 耐力死亡特效 | 初始散射速度 | `live` | 0…0.5，步长 0.001 |
| `starvationVfx.gravity` | `-0.05` | 耐力死亡特效 | 竖直加速度 | `live` | -1…0，步长 0.001 |
| `spatialHash.enabled` | `true` | Advanced · Spatial Hash | hash enabled | `reset` | 布尔/文本 |
| `distanceField.enabled` | `true` | 障碍距离场 | distance field enabled | `rebuildField` | 布尔/文本 |
| `distanceField.cellSize` | `0.05` | 障碍距离场 | field cell size | `rebuildField` | 0.02…0.2，步长 0.005 |
| `distanceField.paddingCells` | `1` | Advanced · Distance Field | padding cells | `rebuildField` | 1…4，步长 1 |
| `distanceField.analyticRefineDistance` | `0.1` | 障碍距离场 | analytic refine distance | `live` | 0…0.5，步长 0.005 |
| `distanceField.gradientEpsilon` | `0.025` | Advanced · Distance Field | gradient epsilon | `live` | 0.005…0.2，步长 0.005 |
| `obstacles.enabled` | `false` | 障碍 | map enabled | `rebuildField` | 布尔/文本 |
| `physics.enabled` | `true` | Rapier 物理 | physics enabled | `rebuildScene` | 布尔/文本 |
| `physics.spawnDefaults` | `false` | Rapier 物理 | spawn defaults | `rebuildScene` | 布尔/文本 |
| `physics.gravityX` | `0` | Rapier 物理 | gravity X | `live` | -3…3，步长 0.01 |
| `physics.gravityY` | `-0.34` | Rapier 物理 | gravity Y | `live` | -3…3，步长 0.01 |
| `physics.gravityZ` | `0` | Rapier 物理 | gravity Z | `live` | -3…3，步长 0.01 |
| `physics.linearDamping` | `1.45` | Rapier 物理 | linear damping | `live` | 0…10，步长 0.05 |
| `physics.angularDamping` | `1.2` | Rapier 物理 | angular damping | `live` | 0…10，步长 0.05 |
| `physics.restitution` | `0.25` | Rapier 物理 | restitution | `rebuildScene` | 0…1，步长 0.01 |
| `physics.density` | `0.55` | Rapier 物理 | density | `rebuildScene` | 0.01…10，步长 0.01 |
| `physics.fishImpulseStrength` | `0.0024` | Rapier 物理 | fish impulse | `live` | 0…0.05，步长 0.0001 |
| `physics.fishImpulseLimit` | `0.009` | Rapier 物理 | impulse limit | `live` | 0…0.1，步长 0.0001 |
| `physics.interactionRadius` | `0.055` | Rapier 物理 | interaction radius | `live` | 0.005…0.3，步长 0.005 |
| `physics.aabbPadding` | `0.08` | Rapier 物理 | AABB padding | `live` | 0…0.5，步长 0.005 |
| `physics.dynamicRingRadius` | `0.12` | Rapier 物理 | ring radius | `rebuildScene` | 0.03…0.4，步长 0.005 |
| `physics.dynamicRingTube` | `0.025` | Rapier 物理 | ring tube | `rebuildScene` | 0.005…0.12，步长 0.002 |
| `physics.dynamicCubeSize` | `0.14` | Rapier 物理 | cube size | `rebuildScene` | 0.03…0.5，步长 0.005 |
| `physics.dynamicColumnRadius` | `0.045` | Rapier 物理 | column radius | `rebuildScene` | 0.01…0.2，步长 0.002 |
| `physics.dynamicColumnHeight` | `0.18` | Rapier 物理 | column height | `rebuildScene` | 0.04…0.6，步长 0.005 |
| `physics.dynamicBaseRadius` | `0.09` | Rapier 物理 | base radius | `rebuildScene` | 0.02…0.3，步长 0.002 |
| `physics.dynamicBaseHeight` | `0.035` | Rapier 物理 | base height | `rebuildScene` | 0.01…0.2，步长 0.002 |
| `camera.fov` | `45` | 相机 | FOV | `live` | 20…100，步长 1 |
| `camera.globalNear` | `0.01` | Advanced · Camera | global near | `live` | 0.001…0.2，步长 0.001 |
| `camera.focusDistance` | `0.3` | 相机 | 跟随后距 / size | `live` | 0.08…2，步长 0.01 |
| `camera.focusHeight` | `0.09` | 相机 | 跟随高度 / size | `live` | -0.5…1，步长 0.01 |
| `camera.closeupDistance` | `0.11` | 相机 | 特写后距 / size | `live` | 0.04…1，步长 0.01 |
| `camera.closeupSide` | `0.07` | 相机 | 特写侧移 / size | `live` | -1…1，步长 0.01 |
| `camera.closeupHeight` | `0.04` | 相机 | 特写高度 / size | `live` | -0.5…1，步长 0.01 |
| `camera.closeupFov` | `30` | 相机 | 特写 FOV | `live` | 15…90，步长 1 |
| `camera.lookAhead` | `0.2` | 相机 | look ahead | `live` | 0.02…1，步长 0.01 |
| `camera.positionDamping` | `12` | 相机 | position damping | `live` | 0.1…40，步长 0.1 |
| `camera.orientationDamping` | `9` | 相机 | orientation damping | `live` | 0.1…40，步长 0.1 |
| `schools.0.id` | `small` | 鱼群 · 小群 | id | `rebuildScene` | 布尔/文本 |
| `schools.0.name` | `小群` | 鱼群 · 小群 | name | `rebuildScene` | 布尔/文本 |
| `schools.0.color` | `#e5a441` | 鱼群 · 小群 | color | `live` | 布尔/文本 |
| `schools.0.count` | `400` | 鱼群 · 小群 | count | `rebuildScene` | 1…2000，步长 1 |
| `schools.0.size` | `1` | 鱼群 · 小群 | size | `live` | 0.2…5，步长 0.01 |
| `schools.0.podCount` | `10` | 鱼群 · 小群 | 小群数量 | `reset` | 1…80，步长 1 |
| `schools.0.targetNeighbors` | `8` | 鱼群 · 小群 | target neighbors（当前鱼群） | `reset` | 1…64，步长 1 |
| `schools.0.cruiseSpeed` | `0.23` | 鱼群 · 小群 | cruise speed | `live` | 0.01…2，步长 0.01 |
| `schools.0.maxSpeed` | `0.46` | 鱼群 · 小群 | max speed | `live` | 0.01…3，步长 0.01 |
| `schools.0.turnSpeed` | `2.8` | 鱼群 · 小群 | turn speed | `live` | 0.1…12，步长 0.1 |
| `schools.0.captureRateMultiplier` | `1` | 鱼群 · 小群 | capture rate × | `live` | 0…5，步长 0.01 |
| `schools.0.metabolismMultiplier` | `1` | 鱼群 · 小群 | metabolism × | `live` | 0.1…5，步长 0.01 |
| `schools.0.grazeRate` | `1` | 鱼群 · 小群 | 尸体觅食 × | `live` | 0…4，步长 0.01 |
| `schools.0.separationWeight` | `0.8` | 鱼群 · 小群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.0.alignmentWeight` | `0.45` | 鱼群 · 小群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.0.cohesionWeight` | `0.4` | 鱼群 · 小群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.0.spawnRegion.centerX` | `0.32` | 鱼群 · 小群 | spawn centerX | `reset` | -0.5…0.5，步长 0.01 |
| `schools.0.spawnRegion.centerY` | `0` | 鱼群 · 小群 | spawn centerY | `reset` | -0.5…0.5，步长 0.01 |
| `schools.0.spawnRegion.centerZ` | `0` | 鱼群 · 小群 | spawn centerZ | `reset` | -0.5…0.5，步长 0.01 |
| `schools.0.spawnRegion.radius` | `0.36` | 鱼群 · 小群 | spawn radius | `reset` | 0.02…1.5，步长 0.01 |
| `schools.0.initialHeading.x` | `1` | 鱼群 · 小群 | heading x | `reset` | -1…1，步长 0.05 |
| `schools.0.initialHeading.y` | `0` | 鱼群 · 小群 | heading y | `reset` | -1…1，步长 0.05 |
| `schools.0.initialHeading.z` | `0` | 鱼群 · 小群 | heading z | `reset` | -1…1，步长 0.05 |
| `schools.1.id` | `medium` | 鱼群 · 中群 | id | `rebuildScene` | 布尔/文本 |
| `schools.1.name` | `中群` | 鱼群 · 中群 | name | `rebuildScene` | 布尔/文本 |
| `schools.1.color` | `#4f9fcf` | 鱼群 · 中群 | color | `live` | 布尔/文本 |
| `schools.1.count` | `200` | 鱼群 · 中群 | count | `rebuildScene` | 1…2000，步长 1 |
| `schools.1.size` | `1.5` | 鱼群 · 中群 | size | `live` | 0.2…5，步长 0.01 |
| `schools.1.podCount` | `8` | 鱼群 · 中群 | 小群数量 | `reset` | 1…80，步长 1 |
| `schools.1.targetNeighbors` | `8` | 鱼群 · 中群 | target neighbors（当前鱼群） | `reset` | 1…64，步长 1 |
| `schools.1.cruiseSpeed` | `0.23` | 鱼群 · 中群 | cruise speed | `live` | 0.01…2，步长 0.01 |
| `schools.1.maxSpeed` | `0.46` | 鱼群 · 中群 | max speed | `live` | 0.01…3，步长 0.01 |
| `schools.1.turnSpeed` | `2.8` | 鱼群 · 中群 | turn speed | `live` | 0.1…12，步长 0.1 |
| `schools.1.captureRateMultiplier` | `1` | 鱼群 · 中群 | capture rate × | `live` | 0…5，步长 0.01 |
| `schools.1.metabolismMultiplier` | `1` | 鱼群 · 中群 | metabolism × | `live` | 0.1…5，步长 0.01 |
| `schools.1.grazeRate` | `0.25` | 鱼群 · 中群 | 尸体觅食 × | `live` | 0…4，步长 0.01 |
| `schools.1.separationWeight` | `0.8` | 鱼群 · 中群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.1.alignmentWeight` | `0.45` | 鱼群 · 中群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.1.cohesionWeight` | `0.4` | 鱼群 · 中群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.1.spawnRegion.centerX` | `-0.05` | 鱼群 · 中群 | spawn centerX | `reset` | -0.5…0.5，步长 0.01 |
| `schools.1.spawnRegion.centerY` | `0` | 鱼群 · 中群 | spawn centerY | `reset` | -0.5…0.5，步长 0.01 |
| `schools.1.spawnRegion.centerZ` | `0` | 鱼群 · 中群 | spawn centerZ | `reset` | -0.5…0.5，步长 0.01 |
| `schools.1.spawnRegion.radius` | `0.36` | 鱼群 · 中群 | spawn radius | `reset` | 0.02…1.5，步长 0.01 |
| `schools.1.initialHeading.x` | `1` | 鱼群 · 中群 | heading x | `reset` | -1…1，步长 0.05 |
| `schools.1.initialHeading.y` | `0` | 鱼群 · 中群 | heading y | `reset` | -1…1，步长 0.05 |
| `schools.1.initialHeading.z` | `0` | 鱼群 · 中群 | heading z | `reset` | -1…1，步长 0.05 |
| `schools.2.id` | `large` | 鱼群 · 大群 | id | `rebuildScene` | 布尔/文本 |
| `schools.2.name` | `大群` | 鱼群 · 大群 | name | `rebuildScene` | 布尔/文本 |
| `schools.2.color` | `#c95252` | 鱼群 · 大群 | color | `live` | 布尔/文本 |
| `schools.2.count` | `80` | 鱼群 · 大群 | count | `rebuildScene` | 1…2000，步长 1 |
| `schools.2.size` | `2.25` | 鱼群 · 大群 | size | `live` | 0.2…5，步长 0.01 |
| `schools.2.podCount` | `8` | 鱼群 · 大群 | 小群数量 | `reset` | 1…80，步长 1 |
| `schools.2.targetNeighbors` | `5` | 鱼群 · 大群 | target neighbors（当前鱼群） | `reset` | 1…64，步长 1 |
| `schools.2.cruiseSpeed` | `0.23` | 鱼群 · 大群 | cruise speed | `live` | 0.01…2，步长 0.01 |
| `schools.2.maxSpeed` | `0.46` | 鱼群 · 大群 | max speed | `live` | 0.01…3，步长 0.01 |
| `schools.2.turnSpeed` | `2.8` | 鱼群 · 大群 | turn speed | `live` | 0.1…12，步长 0.1 |
| `schools.2.captureRateMultiplier` | `1` | 鱼群 · 大群 | capture rate × | `live` | 0…5，步长 0.01 |
| `schools.2.metabolismMultiplier` | `1` | 鱼群 · 大群 | metabolism × | `live` | 0.1…5，步长 0.01 |
| `schools.2.grazeRate` | `0.01` | 鱼群 · 大群 | 尸体觅食 × | `live` | 0…4，步长 0.01 |
| `schools.2.separationWeight` | `0.8` | 鱼群 · 大群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.2.alignmentWeight` | `0.45` | 鱼群 · 大群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.2.cohesionWeight` | `0.4` | 鱼群 · 大群 | weight（当前鱼群） | `live` | 0…6，步长 0.05 |
| `schools.2.spawnRegion.centerX` | `-0.38` | 鱼群 · 大群 | spawn centerX | `reset` | -0.5…0.5，步长 0.01 |
| `schools.2.spawnRegion.centerY` | `0` | 鱼群 · 大群 | spawn centerY | `reset` | -0.5…0.5，步长 0.01 |
| `schools.2.spawnRegion.centerZ` | `0` | 鱼群 · 大群 | spawn centerZ | `reset` | -0.5…0.5，步长 0.01 |
| `schools.2.spawnRegion.radius` | `0.45` | 鱼群 · 大群 | spawn radius | `reset` | 0.02…1.5，步长 0.01 |
| `schools.2.initialHeading.x` | `1` | 鱼群 · 大群 | heading x | `reset` | -1…1，步长 0.05 |
| `schools.2.initialHeading.y` | `0` | 鱼群 · 大群 | heading y | `reset` | -1…1，步长 0.05 |
| `schools.2.initialHeading.z` | `0` | 鱼群 · 大群 | heading z | `reset` | -1…1，步长 0.05 |
| `obstacles.ringA.enabled` | `true` | 障碍 · ringA | enabled | `rebuildField` | 布尔/文本 |
| `obstacles.ringA.type` | `ring` | 障碍 · ringA | type | `rebuildField` | Ring=ring；Box=box |
| `obstacles.ringA.x` | `-0.42` | 障碍 · ringA | x | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.ringA.y` | `0.05` | 障碍 · ringA | y | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.ringA.z` | `0` | 障碍 · ringA | z | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.ringA.rotationX` | `0` | 障碍 · ringA | rotationX | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.ringA.rotationY` | `0.22` | 障碍 · ringA | rotationY | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.ringA.rotationZ` | `0` | 障碍 · ringA | rotationZ | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.ringA.width` | `0.82` | 障碍 · ringA | width | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringA.height` | `0.72` | 障碍 · ringA | height | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringA.thickness` | `0.08` | 障碍 · ringA | thickness | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringA.holeDiameter` | `0.48` | 障碍 · ringA | holeDiameter | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringA.frameDepth` | `0.12` | 障碍 · ringA | frameDepth | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringB.enabled` | `true` | 障碍 · ringB | enabled | `rebuildField` | 布尔/文本 |
| `obstacles.ringB.type` | `ring` | 障碍 · ringB | type | `rebuildField` | Ring=ring；Box=box |
| `obstacles.ringB.x` | `0.46` | 障碍 · ringB | x | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.ringB.y` | `-0.08` | 障碍 · ringB | y | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.ringB.z` | `-0.06` | 障碍 · ringB | z | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.ringB.rotationX` | `0` | 障碍 · ringB | rotationX | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.ringB.rotationY` | `-0.28` | 障碍 · ringB | rotationY | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.ringB.rotationZ` | `0` | 障碍 · ringB | rotationZ | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.ringB.width` | `0.76` | 障碍 · ringB | width | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringB.height` | `0.68` | 障碍 · ringB | height | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringB.thickness` | `0.08` | 障碍 · ringB | thickness | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringB.holeDiameter` | `0.48` | 障碍 · ringB | holeDiameter | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.ringB.frameDepth` | `0.12` | 障碍 · ringB | frameDepth | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.blockA.enabled` | `true` | 障碍 · blockA | enabled | `rebuildField` | 布尔/文本 |
| `obstacles.blockA.type` | `box` | 障碍 · blockA | type | `rebuildField` | Ring=ring；Box=box |
| `obstacles.blockA.x` | `-0.68` | 障碍 · blockA | x | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.blockA.y` | `-0.54` | 障碍 · blockA | y | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.blockA.z` | `0.28` | 障碍 · blockA | z | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.blockA.rotationX` | `0` | 障碍 · blockA | rotationX | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.blockA.rotationY` | `0.15` | 障碍 · blockA | rotationY | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.blockA.rotationZ` | `0` | 障碍 · blockA | rotationZ | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.blockA.width` | `0.42` | 障碍 · blockA | width | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.blockA.height` | `0.28` | 障碍 · blockA | height | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.blockA.depth` | `0.34` | 障碍 · blockA | depth | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.blockB.enabled` | `true` | 障碍 · blockB | enabled | `rebuildField` | 布尔/文本 |
| `obstacles.blockB.type` | `box` | 障碍 · blockB | type | `rebuildField` | Ring=ring；Box=box |
| `obstacles.blockB.x` | `0.58` | 障碍 · blockB | x | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.blockB.y` | `-0.48` | 障碍 · blockB | y | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.blockB.z` | `0.22` | 障碍 · blockB | z | `rebuildField` | -3…3，步长 0.01 |
| `obstacles.blockB.rotationX` | `0` | 障碍 · blockB | rotationX | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.blockB.rotationY` | `-0.22` | 障碍 · blockB | rotationY | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.blockB.rotationZ` | `0` | 障碍 · blockB | rotationZ | `rebuildField` | -3.141592653589793…3.141592653589793，步长 0.017453292519943295 |
| `obstacles.blockB.width` | `0.54` | 障碍 · blockB | width | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.blockB.height` | `0.2` | 障碍 · blockB | height | `rebuildField` | 0.01…3，步长 0.01 |
| `obstacles.blockB.depth` | `0.3` | 障碍 · blockB | depth | `rebuildField` | 0.01…3，步长 0.01 |
| `physics.ringSpawnX` | `-0.62` | Advanced · Physics Spawn | ring spawn X | `rebuildScene` | -3…3，步长 0.01 |
| `physics.ringSpawnY` | `0.45` | Advanced · Physics Spawn | ring spawn Y | `rebuildScene` | -3…3，步长 0.01 |
| `physics.ringSpawnZ` | `0.18` | Advanced · Physics Spawn | ring spawn Z | `rebuildScene` | -3…3，步长 0.01 |
| `physics.cubeSpawnX` | `0` | Advanced · Physics Spawn | cube spawn X | `rebuildScene` | -3…3，步长 0.01 |
| `physics.cubeSpawnY` | `0.52` | Advanced · Physics Spawn | cube spawn Y | `rebuildScene` | -3…3，步长 0.01 |
| `physics.cubeSpawnZ` | `-0.14` | Advanced · Physics Spawn | cube spawn Z | `rebuildScene` | -3…3，步长 0.01 |
| `physics.columnSpawnX` | `0.66` | Advanced · Physics Spawn | column spawn X | `rebuildScene` | -3…3，步长 0.01 |
| `physics.columnSpawnY` | `0.44` | Advanced · Physics Spawn | column spawn Y | `rebuildScene` | -3…3，步长 0.01 |
| `physics.columnSpawnZ` | `0.14` | Advanced · Physics Spawn | column spawn Z | `rebuildScene` | -3…3，步长 0.01 |
