# Web 行为沙盒参数参考

> 适用范围：仓库根目录的 Vite / Three.js Web 行为沙盒。  
> 正式交付仍是 `godot/`；本文不定义三局游戏规则，也不修改
> `ARCHITECTURE.md` 的接口契约。

本文回答四个问题：

1. 每个可调字段的源码默认值是什么；
2. 它在数学或物理上控制什么；
3. 数值调大后，画面和动力学会怎样变化；
4. 哪些参数会增强、抵消或掩盖它。

默认值以以下源码对象为准：

| 参数组 | 源码 |
|---|---|
| `TRAITS`、`TRAIT_MAPPING`、`ENERGY_PARAMS`、`PANIC_PARAMS`、`PREDATOR_PARAMS`、`CAPTURE_FX_PARAMS` | `src/evolution-model.js` |
| `BOID_PARAMS` | `src/boids.js` |
| `TANK`、`TANK_PRESETS` | `src/world.js` |
| `cameraSettings` | `src/scene.js` |
| 调参范围、按钮、可视化开关 | `src/debug.js` |
| 捕食者运行时消费方式 | `src/predator.js` |
| 吞食方块生命周期与渲染 | `src/capture-vfx.js` |

浏览器控制台可通过 `window.aquarium` 读取这些对象。例如：

```js
window.aquarium.traits.size = 70;
window.aquarium.panicParams.escapeWeight = 3.2;
window.aquarium.metrics();
```

除布尔值、枚举和角度外，本文约定：

- 长度使用米 `m`；
- 速度使用 `m/s`；
- 加速度或转向力上限使用 `m/s²`；
- 时间使用秒 `s`；
- 角速度使用 `rad/s`；
- `weight` 和 `factor` 均为无量纲倍率。

## 1. 参数如何进入一次物理更新

Web 沙盒以固定的 \(1/60\) 秒步长更新。参数按以下顺序生效：

1. `TRAITS` 经过 `TRAIT_MAPPING`，把原始 `BOID_PARAMS` 翻译为当前表型；
2. 当前能量把速度、对齐和聚合响应压低；
3. panic 改变目标速度、社会跟随、聚合和直接逃逸；
4. 分离、对齐、聚合、逃逸、避墙、向心和速度维持力相加；
5. `maxForce`、`turnSpeed`、`maxPitch` 和速度上下限约束最终运动；
6. 实际游速和身体缩放决定本步能耗。

因此，某个权重调大却“看不出效果”，通常不是字段失效，而是后面的转向角速度
或速度上限成为了瓶颈。

## 2. Traits：玩家可见的遗传参数

三个 trait 的范围都是 \(0\) 到 \(100\)。源码先把它们转换为
\([-1,1]\) 的轴：

\[
a(x)=2\,\operatorname{clamp}\left(\frac{x}{100},0,1\right)-1.
\]

记速度、体型和耐力轴分别为 \(s,\ell,h\)。数值 \(50\) 是中性点。

| 字段 | 默认值 | 数学 / 物理意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `speed` | `50` | 通过 \(2^{s\,k_v}\) 同时缩放巡航和最高速度 | 整群游得更快，追逐和逃逸位移更明显 | 实际速度进入能耗的三次方项；大体型的速度惩罚会抵消它 |
| `size` | `40` | 同时控制身体缩放、速度、力、转向、三个社会半径与三个社会权重 | 变大、个人空间扩大、转弯更钝、群体更松散 | 还通过 `ENERGY_PARAMS.sizeExponent` 提高能耗；目前不改变初始鱼数 |
| `stamina` | `50` | 只缩放遗传能量容量 \(E_{\max}\) | 满能量时没有瞬时动作差异，但更久以后才疲劳和掉队 | 不直接修改 boid 权重；在线调节时保持当前能量百分比，不会瞬间回血 |

重要边界：

- `size` 当前不改变 `fishCount`；
- `stamina` 是容量，不是当前能量；
- Web 沙盒当前能量归零只会进入最低行为倍率，不会自动调用
  `kill(..., "starved")`。真正饿死仍属于主游戏待接机制。

## 3. Trait mapping：遗传参数到表型的翻译

所有翻译采用二倍频程：

\[
M(a,k)=2^{ak}.
\]

中性 trait \(a=0\) 时，任何映射系数都不改变基线。正负 trait 得到互为倒数的
倍率。

当前表型为：

\[
\begin{aligned}
B &= 2^{\ell k_B},\\
v_c &= v_{c,0}\,2^{s k_v-\ell k_{sv}},\\
v_{\max} &= v_{\max,0}\,2^{s k_v-\ell k_{sv}},\\
F_{\max} &= F_{\max,0}\,2^{-\ell k_{sF}},\\
\omega_{\max} &= \omega_{\max,0}\,2^{-\ell k_{s\omega}},\\
r_x &= r_{x,0}\,2^{\ell k_{rx}},\\
w_x &= w_{x,0}\,2^{\ell k_{wx}},\\
E_{\max} &= E_0\,2^{h k_E}.
\end{aligned}
\]

其中 \(B\) 是身体视觉缩放，\(x\in\{\mathrm{sep},\mathrm{ali},\mathrm{coh}\}\)。

### 3.1 速度、身体和机动性映射

| 字段 | 默认值；面板范围 | 数学意义 | 调大后的效果 | 关键耦合 |
|---|---:|---|---|---|
| `speedOctaves` | `0.50`；`0–2` | \(k_v\)，速度 trait 的灵敏度 | `speed > 50` 时更快，`speed < 50` 时更慢；扩大两端差距 | `speed = 50` 时调它无效；高端速度会被能耗迅速惩罚 |
| `bodyScaleOctaves` | `0.45`；`0–1.5` | \(k_B\)，体型 trait 到渲染缩放的灵敏度 | 大鱼更大、小鱼更小，尺寸差更明显 | 身体缩放同时进入能耗；它不自动改变捕获半径 |
| `sizeSpeedPenaltyOctaves` | `0.20`；`0–1.5` | \(k_{sv}\)，体型对巡航 / 最高速度的惩罚 | `size > 50` 时更慢；`size < 50` 时获得更强速度奖励 | 与 `speedOctaves` 共同进入同一个指数 |
| `sizeForcePenaltyOctaves` | `0.25`；`0–1.5` | \(k_{sF}\)，体型对每条规则转向力上限的惩罚 | 大鱼改变速度方向更慢，小鱼响应更敏捷 | 即使力足够大，`turnSpeed` 仍可能成为最终瓶颈 |
| `sizeTurnPenaltyOctaves` | `0.55`；`0–1.5` | \(k_{s\omega}\)，体型对角速度上限的惩罚 | 大鱼转弯半径明显增大，轨迹更笨重 | panic 和疲劳会继续乘到角速度预算上 |

### 3.2 体型到三条 boid 规则的映射

| 字段 | 默认值；面板范围 | 数学意义 | 提高字段数值后的效果 | 关键耦合 |
|---|---:|---|---|---|
| `separationRadiusOctaves` | `+0.70`；`-1.5–1.5` | \(k_{r,\mathrm{sep}}\) | 加强“大鱼排斥范围更大、小鱼范围更小”的差异 | 与原始 `separationRadius` 相乘 |
| `separationWeightOctaves` | `+0.60`；`-1.5–1.5` | \(k_{w,\mathrm{sep}}\) | 加强“大鱼排斥更强、小鱼排斥更弱”的差异 | 半径决定谁参与，权重决定该方向在总力中的话语权 |
| `alignmentRadiusOctaves` | `-0.15`；`-1.5–1.5` | \(k_{r,\mathrm{ali}}\) | 从负值向零提高，会削弱“小鱼读取更广、大鱼读取更窄”的设计；变正后关系反转 | 受 `perceptionFOV` 限制 |
| `alignmentWeightOctaves` | `-0.20`；`-1.5–1.5` | \(k_{w,\mathrm{ali}}\) | 从负值向零提高，会削弱小鱼的对齐优势；变正后大鱼对齐更强 | 能量和 panic 接收倍率会继续乘它 |
| `cohesionRadiusOctaves` | `-0.35`；`-1.5–1.5` | \(k_{r,\mathrm{coh}}\) | 从负值向零提高，会削弱“小鱼更广地寻找群中心”的差异 | 邻居数量还受鱼数和缸体积影响 |
| `cohesionWeightOctaves` | `-0.65`；`-1.5–1.5` | \(k_{w,\mathrm{coh}}\) | 从负值向零提高，会削弱“小鱼抱团、大鱼松散”的主要来源 | 疲劳和 panic 都会压低最终聚合力 |
| `staminaCapacityOctaves` | `1.00`；`0–2` | \(k_E\)，耐力 trait 到能量容量的灵敏度 | `stamina > 50` 时容量更大，低端容量更小 | `stamina = 50` 时调它无效 |

注意“调大”的方向取决于字段本身的正负号。六个社会映射允许负值，数值从
`-0.65` 提高到 `-0.20` 是削弱既有反相关，而不是加强它。

### 3.3 当前默认 trait 的实际表型

原始 boid 值只在 `speed = size = stamina = 50` 时等于表型值。当前
`size = 40`，所以启动后的鱼并不等于裸基线。近似值为：

| 表型输出 | 当前近似值 |
|---|---:|
| `bodyScale` | `0.940×` |
| `cruiseSpeed` / `maxSpeed` | `0.236 / 0.473 m/s` |
| `maxForce` / `turnSpeed` | `5.383 m/s² / 3.022 rad/s` |
| 分离半径 / 权重 | `0.091 m / 0.736` |
| 对齐半径 / 权重 | `0.245 m / 0.463` |
| 聚合半径 / 权重 | `0.472 m / 0.438` |
| `energyCapacity` | `1.000` |

调参面板 `traits` 下的只读行显示实时表型，应以该读数为最终依据。

## 4. Energy：当前能量与疲劳

令 \(q_i=E_i/E_{\max}\) 为当前能量比例，身体缩放为 \(B\)，实际速度为
\(\|\mathbf v_i\|\)。每秒消耗为：

\[
-\frac{\mathrm dE_i}{\mathrm dt}
=c_E B^{p_B}
\left[
b+(1-b)
\left(
\frac{\|\mathbf v_i\|}{v_{c,0}}
\right)^{p_v}
\right].
\]

分母 \(v_{c,0}\) 是原始 boid 巡航速度，不是 trait 翻译后的巡航速度。
因此提高 `speed` 后，真实速度会自然推高能耗。

疲劳使用平滑阶跃：

\[
A(q)=S\left(\frac{q-q_{\mathrm{exhausted}}}
{q_{\mathrm{tired}}-q_{\mathrm{exhausted}}}\right),
\qquad
f(q)=f_{\min}+(1-f_{\min})A(q).
\]

| 字段 | 默认值；面板范围 | 数学 / 物理意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `capacityBase` | `1.0`；`0.1–4` | 中性耐力的 \(E_0\) | 全体更久才进入疲劳；满能量动作不变 | 在线修改时保持 \(q\)，只改变后续可持续时间 |
| `drainPerSecond` | `0.012`；`0.001–0.1` | 总能耗系数 \(c_E\) | 所有鱼更快减速和掉队 | 当前不会自动饿死，只会停在最低倍率 |
| `basalShare` | `0.35`；`0–1` | 速度无关成本占比 \(b\) | 低于基线速度时消耗提高；高于基线速度时反而削弱速度项的占比 | 当相对速度恰为 `1` 时，总括号恒为 `1` |
| `speedExponent` | `3.0`；`0.5–6` | 相对速度成本指数 \(p_v\) | 高速爆发更昂贵，快鱼更快疲劳；低速时运动成本更接近基础项 | 是 `speed` 与 stamina 取舍的主要非线性来源 |
| `sizeExponent` | `2.0`；`0.5–5` | 身体缩放成本指数 \(p_B\) | 大鱼能耗增长更陡，小鱼节能优势更强 | 与 `bodyScaleOctaves` 共同决定体型代价 |
| `tiredStart` | `0.55`；`0–1` | \(q_{\mathrm{tired}}\)，从满响应进入疲劳曲线的上边界 | 提高后更早出现减速和社会响应下降 | 必须大于 `exhaustedAt` |
| `exhaustedAt` | `0.15`；`0–1` | \(q_{\mathrm{exhausted}}\)，到达最低倍率的下边界 | 提高后更早达到最低动作能力，过渡区也会缩短 | 必须小于 `tiredStart` |
| `minSpeedFactor` | `0.38`；`0–1` | 空能量时的最低目标速度倍率 | 疲劳鱼仍游得更快，掉队视觉减弱 | 同时影响最终速度下限与角速度中的能量项 |
| `minAlignmentFactor` | `0.35`；`0–1` | 空能量时的最低对齐倍率 | 疲劳鱼仍能复制邻鱼方向，不容易方向失配 | panic 的接收倍率仍会乘在它之后 |
| `minCohesionFactor` | `0.30`；`0–1` | 空能量时的最低聚合倍率 | 疲劳鱼仍会追回群中心，不容易从边缘脱落 | `cohesionDrop` 会进一步压低它 |

分离和避墙权重不直接乘疲劳倍率。疲劳鱼仍会试图避免重叠和穿墙，但最终位移仍
受低能量速度上限约束。能量与 panic 均不改变鱼的颜色；所有活鱼始终使用精确
的 `#7eb6d9`，状态只通过运动呈现。

## 5. Panic：直接逃逸与局部传播

### 5.1 直接威胁

鱼到捕食者的距离为 \(d\) 时：

\[
\tau(d)=1-
S\left(
\frac{d-r_{\mathrm{panic}}}
{r_{\mathrm{alert}}-r_{\mathrm{panic}}}
\right).
\]

在 `panicRadius` 内，\(\tau=1\)；在 `alertRadius` 外，\(\tau=0\)。
直接逃逸方向使用捕食者的短时预测位置：

\[
\mathbf d_i^{\mathrm{escape}}
=\mathbf x_i-
\left(\mathbf x_P+t_{\mathrm{prediction}}\mathbf v_P\right).
\]

### 5.2 社会报警

邻鱼 \(j\) 的报警信号为：

\[
g_{ij}=a_j
\left[
1-S\left(\frac{d_{ij}}{r_{\mathrm{signal}}}\right)
\right],
\qquad
g_i=\max_j g_{ij}.
\]

紧急航向不再进入普通对齐平均。令
\(u_j=\max(p_j,a_j)\)，距离衰减为
\(\phi_{ij}=1-S(d_{ij}/r_{\mathrm{signal}})\)，则接收者收集：

\[
\mathbf h_i
=\sum_j
\phi_{ij}u_j
\left(1+k_{\mathrm{source}}u_j^2\right)
\,\widehat{\mathbf v}_j,
\qquad
U_i=\max_j(\phi_{ij}u_j).
\]

紧急转向力为：

\[
\mathbf F_i^{\mathrm{emergency}}
=w_{\mathrm{em}}f_{\mathrm{ali}}(q_i)U_i\,
\mathcal T(\mathbf h_i,\mathbf v_i).
\]

其中 \(k_{\mathrm{source}}\) 只改变多个报警来源之间的方向投票：
紧急程度更高的鱼会更强地主导航向；独立紧急力的绝对幅度仍由
\(w_{\mathrm{em}}\) 控制。因此大量平静邻鱼无法把唯一报警鱼的方向平均掉。
普通对齐仍可根据接收到的社会信号乘以：

\[
m_i=\min(1+k_{\mathrm{receiver}}\,\hat g_i,\ m_{\max}).
\]

### 5.3 参数表

| 字段 | 默认值；面板范围 | 数学 / 状态机意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `alertRadius` | `0.38 m`；`0.05–1` | 直接威胁衰减到零的外半径 | 更多鱼更早直接感到捕食者，逃逸面扩大 | 应大于 `panicRadius`；还会提高直接信息而非社会传播的占比 |
| `panicRadius` | `0.14 m`；`0.01–0.5` | 直接威胁达到 `1` 的内半径 | 捕食者附近出现更大面积的满强度逃逸 | 应小于 `alertRadius` |
| `directOn` | `0.55`；`0–1` | 直接威胁进入报警锁存的阈值 | 提高后必须更靠近捕食者才发出报警脉冲 | 只控制报警进入，不关闭半径内连续的直接逃逸 |
| `directOff` | `0.25`；`0–1` | 报警锁存退出阈值 | 提高后离开直接报警更早，迟滞区缩小 | 应小于 `directOn` |
| `signalRadius` | `0.24 m`；`0.02–1` | alarm 在邻鱼之间传播和紧急航向可见的半径 | 波前每步覆盖更多邻鱼，传播更快、更整片 | 同时扩大邻域配对成本；当前还受 `perceptionFOV` 方向门控 |
| `signalThreshold` | `0.35`；`0–1` | 平滑后的社会信号触发报警的阈值 | 更难被邻鱼感染，传播更容易中断 | 与距离衰减、`senseTime` 和鱼群密度共同决定是否跨过阈值 |
| `signalDecayTime` | `0.35 s`；`0.01–3` | 报警脉冲指数衰减时间常数 | 报警源持续更久，传播链更不容易断 | 太大可能与 `refractoryTime` 形成长时间自激 |
| `senseTime` | `0.12 s`；`0.01–3` | 接收信号的低通时间常数 | 感知上升和回落都更慢，传播更平滑但延迟更大 | 较短的报警可能在达到阈值前已消失 |
| `holdTime` | `0.50 s`；`0.01–3` | 触发后保持满 panic 的时间 | 每条鱼的逃逸动作持续更久，波纹拖尾更长 | 与 `fallTime` 共同决定总可见持续时间 |
| `refractoryTime` | `1.40 s`；`0.01–3` | 社会报警再次触发前的不应期 | 减少反复闪烁和永久自激，但也可能阻断第二次真实威胁 | 直接重新进入仍会建立报警 |
| `riseTime` | `0.08 s`；`0.01–3` | panic 上升的指数时间常数 | 提高后惊跳变慢、响应更柔和 | 太大时可能在捕食者到达前来不及转向 |
| `fallTime` | `0.75 s`；`0.01–3` | panic 回落的指数时间常数 | 恐慌、加速和松散状态保留更久 | 与 `holdTime` 叠加 |
| `alignmentSourceBoost` | `10.0`；`0–20` | 报警来源的方向投票增益 \(1+k_{\mathrm{source}}u_j^2\) | 多个报警鱼给出不同航向时，更紧急者更强地主导方向 | 只改变紧急航向的相对投票，不决定独立紧急力的绝对幅度；后者由 `emergencyAlignmentWeight` 控制 |
| `alignmentReceiverBoost` | `1.5`；`0–8` | 接收者普通对齐力的信号增益 \(k_{\mathrm{receiver}}\) | 听见报警的鱼更快复制邻鱼方向 | 受 `alignmentReceiverMax` 封顶 |
| `alignmentReceiverMax` | `2.5`；`0–8` | 接收者普通对齐倍率上限 \(m_{\max}\) | 允许更强的社会转向峰值 | 若小于 `1`，甚至会压低普通对齐；最终仍受转角上限 |
| `emergencyAlignmentWeight` | `4.0`；`0–12` | 独立紧急航向力的 \(w_{\mathrm{em}}\) | 报警鱼方向更强地主导接收者，传播波更清晰 | 不乘普通 `alignmentWeight`，但仍乘能量对齐倍率和紧急度 \(U_i\) |
| `panicTurnBoost` | `1.2`；`0–4` | 紧急状态对角速度预算的增益 \(1+k_{\omega}U_i^*\) | 受惊鱼更快转身，减少“想逃但拐不过来” | \(U_i^*\) 取自身 panic、直接威胁和紧急航向强度的最大值 |
| `cohesionDrop` | `0.60`；`0–1` | panic 时聚合倍率 \(1-k_cp\) | 鱼更少回头追群中心，受惊区域展开和拉长 | 过高会让报警后鱼群碎裂；回群速度还受 `fallTime` 控制 |
| `speedBoost` | `0.65`；`0–2` | panic 时目标和最高速度倍率 \(1+k_vp\) | 逃逸段更快、更长 | 速度成本按 `speedExponent` 增长，会留下能量债 |
| `escapeWeight` | `2.4`；`0–8` | 直接看见捕食者时，径向逃逸转向力的权重 | 近捕食者的鱼更明确地向外炸开 | 只有直接威胁鱼使用；社会感染鱼只应跟随报警航向 |
| `predictionTime` | `0.15 s`；`0–1` | 鱼预测捕食者未来位置的时间 | 更早避开捕食者前进路线，而非只躲当前位置 | 过大时会对捕食者转弯产生过度预判 |

当前实现每个物理步最多传播一个邻接跳，因此传播速度取决于固定步长、鱼间距、
`signalRadius` 和信号状态机，而不是一次性全局广播。

## 6. Predator：捕食者

### 6.1 多捕食者力模型

`src/predator.js` 是一个 pack manager。每个捕食者有独立的位置、速度、目标锁和
捕获冷却。旧消费者读取的 `predator.position`、`velocity` 和 `targetIndex`
继续代理第一条捕食者；新逻辑通过 `predator.agents` 读取整群。

每个捕食者追逐目标的预测位置：

\[
\mathbf x_{\mathrm{target}}^*
=\mathbf x_{\mathrm{target}}
+t_{\mathrm{lead}}\mathbf v_{\mathrm{target}}.
\]

对方向 \(\mathbf d\)，捕食者通道先产生未裁剪加速度：

\[
\mathcal A(\mathbf d,\mathbf v)
=v_c\frac{\mathbf d}{\|\mathbf d\|}-\mathbf v.
\]

宏观追群通道、捕食者分离通道和避障通道分别裁剪：

\[
\begin{aligned}
\mathbf a_{\mathrm{macro}}&=
\operatorname{clip}_{F_{\max}}
\left[
w_s\mathcal A(\mathbf c_k-\mathbf x_k,\mathbf v_k)
+w_t\mathcal A(\mathbf x_{\mathrm{target}}^*-\mathbf x_k,\mathbf v_k)
\right],\\
\mathbf a_{\mathrm{sep}}&=
\operatorname{clip}_{F_{\max}}
\left[w_p\mathcal A(\mathbf d_k^{\mathrm{sep}},\mathbf v_k)\right],\\
\mathbf a_{\mathrm{avoid}}&=
\operatorname{clip}_{F_{\mathrm{avoid}}}
\left[w_a(1+2u_a)\mathcal A(\mathbf d_k^{\mathrm{avoid}},\mathbf v_k)\right].
\end{aligned}
\]

\[
F_{\mathrm{avoid}}
=F_{\max}\max\left(1,\;w_a(1+2u_a)\right).
\]

避障不是“进入墙边带后向中心推”。捕食者从当前位置沿当前航向发射射线
\(\mathbf r(t)=\mathbf x_k+t\hat{\mathbf v}_k\)，求它与水槽内壁的距离
\(d_{\mathrm{wall}}\)。只有 \(d_{\mathrm{wall}}<L_{\mathrm{detect}}\) 时才搜索
一个射线长度范围内无碰撞的新航向，并令

\[
u_a=1-\frac{d_{\mathrm{wall}}}{L_{\mathrm{detect}}}.
\]

令 \(g_a=w_a(1+2u_a)\)。`detectionLength` 只决定何时发现障碍，
`avoidanceWeight` 决定发现后避障加速度、独立力预算与让权幅度。定义：

\[
y_a=1-\min(1,g_a)\left[1-(1-u_a)^3\right].
\]

仅当 `avoidanceWeight > 0`、避障向量实际存在时才使用 \(y_a\)，最终为：

\[
\mathbf a_k=y_a
\left(\mathbf a_{\mathrm{macro}}+\mathbf a_{\mathrm{sep}}\right)
+\mathbf a_{\mathrm{avoid}}.
\]

三个预算彼此独立，因此 `alarmPredatorWeight` 不会暗中放大分离或避障。
若极端参数下仍越界，最后兜底只夹取位置并删除朝外法向速度；不再把速度
反向，所以不会产生突然弹墙。

### 6.2 近距离 alarmPredator 冲刺

宏观追群只负责把捕食者送到鱼群附近。处于普通状态的捕食者每步检查半径
\(R_a\) 内的存活鱼：

\[
t^*
=
\arg\min_{i:\ \mathrm{alive}_i,\ \|\mathbf x_i-\mathbf x_P\|\le R_a}
\|\mathbf x_i-\mathbf x_P\|^2.
\]

发现目标后进入 `STRIKE`：目标立即抢占普通锁，并一直保持到该鱼死亡、被捕获、
重置，或 alarm 功能被关闭。冲刺期停止叠加鱼群质心吸引和普通个体追逐，改用：

\[
\mathbf a_{\mathrm{alarm}}
=
W_a
\left(
v_{\max}
\frac{\mathbf x_{t^*}+t_{\mathrm{lead}}\mathbf v_{t^*}-\mathbf x_P}
{\|\mathbf x_{t^*}+t_{\mathrm{lead}}\mathbf v_{t^*}-\mathbf x_P\|}
-\mathbf v_P
\right).
\]

alarm 通道先单独裁剪，力上限为
\(F_{\mathrm{strike}}=F_{\max}\max(1,W_a)\)。这是刻意与普通通道不同：
否则很大的 alarm 权重仍会被普通 `maxForce` 截成同一大小，只改变方向而无法
形成肉眼可见的加速。若此时前向射线探测到墙，该通道同样乘 \(y_a\)，
捕食者分离也同步让权，逐步把控制权交给独立避障通道。
`maxSpeed` 与 `turnSpeed` 仍是最终安全上限。

每条玩家鱼都选择距离自己最近的活跃捕食者计算直接威胁与径向逃逸，而不是
全群共享第一条捕食者。

| 字段 | 默认值；面板范围 | 数学 / 物理意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `enabled` | `true`；布尔 | 是否更新并显示捕食者 | 由关闭变为开启后开始追逐和制造直接威胁 | 关闭时 panic 的捕食者输入为零 |
| `captureEnabled` | `true`；布尔 | 是否执行捕获判定 | 开启后接触会真实减少存活数 | 即使关闭，追逐和 panic 仍可运行 |
| `cruiseSpeed` | `0.80 m/s`；`0.02–1` | 捕食者期望巡航速度 | 追逐节奏更快，给鱼群的反应时间更短 | 实际速度下限为其 `0.55×`；应不高于 `maxSpeed` |
| `maxSpeed` | `0.96 m/s`；`0.05–1.5` | 捕食者速度硬上限 | 更能追上快鱼和完成长距离截击 | 若 `maxForce` 或 `turnSpeed` 太低，未必能达到 |
| `maxForce` | `1.10 m/s²`；`0.05–10` | 捕食转向目标速度时的加速度上限 | 起步和改变追逐方向更积极 | 最终航向仍受 `turnSpeed` 限制 |
| `turnSpeed` | `3.80 rad/s`；`0.1–8` | 每秒最大航向变化 | 转弯更灵敏，更不容易被鱼群绕开 | 与 `maxForce` 中较小的瓶颈决定实际转向 |
| `bodyScale` | `1.80×`；`0.5–4` | 捕食者网格的视觉缩放 | 看起来更大、更有压迫感 | 当前不自动改变 `captureRadius` 或威胁半径 |
| `captureRadius` | `0.065 m`；`0.005–0.25` | 捕食者三角尖端扫掠线段之外的交互余量 | 更容易“擦到即吃”，死亡更频繁 | 实际接触距离还加鱼胶囊包围半径；尖端偏移随捕食者 `bodyScale` 改变 |
| `captureCooldown` | `0.70 s`；`0–4` | 每条捕食者一次捕获后再次捕获的等待时间 | 提高后单条捕食者连续吞食变慢，鱼群有喘息窗口 | 冷却逐捕食者独立；增加 `count` 仍会提高总捕获吞吐 |
| `targetLeadTime` | `0.12 s`；`0–1` | 对猎物位置的线性前馈预测 | 更倾向拦截猎物前方，而不是追尾 | 过大时会在猎物频繁转弯时左右摆动 |

捕获仍不是只比较帧末点。每条捕食者根据步前 / 步后速度计算三角尖端位置，
再计算尖端本步扫掠线段到每条存活鱼的最短距离；距离不大于
`captureRadius + fishVisualBoundingRadius` 才调用
`flock.kill(i, "eaten")`。鱼包围半径随其视觉体型缩放；因此视觉尖端已经
碰到贴墙猎物时，不会因两个模型的中心仍较远而永久锁死。

### 6.3 数量、围群、锁定与互斥

| 字段 | 默认值；面板范围 | 数学 / 状态意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `count` | `3`；`1–15` | 同时存在的捕食者数量；`setCount()` 重建实例槽位 | 威胁从单点追逐变为包围和分区驱赶，死亡压力上升 | `3` 是便于隔离行为的 Web 沙盒起点；主游戏 `ARCHITECTURE.md` 的关卡参考仍是 `8–15`。面板最小为 `1`，控制台可设为 `0` |
| `schoolSenseRadius` | `1.0 m`；`0.05–3` | 捕食者计算局部鱼群质心时纳入猎物的范围 | 更大时捕食者更像朝整群移动，更小则只读附近局部 | 半径内没有鱼时自动回退到全体存活鱼的全局质心 |
| `schoolAttractionWeight` | `1.6`；`0–6` | 朝局部鱼群质心移动的权重 \(w_s\) | 更稳定地压向鱼群主体，不易被单鱼引走 | 默认高于个体追逐；过强会把多条捕食者拉向同一区域 |
| `targetPursuitWeight` | `0.85`；`0–6` | 朝锁定个体预测位置追逐的权重 \(w_t\) | 追杀更明确、更容易完成捕获 | 与 `schoolAttractionWeight` 决定“围群”还是“咬单鱼” |
| `targetLockTime` | `0.80 s`；`0–3` | 目标重新选择前的锁定时长 | 轨迹更连贯、少抖动，但可能执着于难追目标 | 有效锁会预留目标，尽量避免捕食者抢同一条鱼；目标死亡立即解锁 |
| `alarmPredatorRadius` | `0.18 m`；`0–0.8` | 从宏观追群进入近距单鱼冲刺的触发半径 \(R_a\) | 更早锁定单鱼，微观捕食区扩大 | 只负责进入；锁定后目标跑出半径也不会换鱼 |
| `alarmPredatorWeight` | `10.0`；`0–20` | 近距冲刺加速度权重 \(W_a\)，同时扩大 STRIKE 力预算 | 冲向最近鱼更果断，捕获不再停留在群心附近 | `0` 关闭 STRIKE；最终速度和转角仍受 `maxSpeed`、`turnSpeed` 限制 |
| `detectionLength` | `0.32 m`；`0.02–1.5` | 沿捕食者当前航向发出的障碍探测向量长度 \(L_{\mathrm{detect}}\) | 更早发现前方内壁，获得更长的转弯距离 | 只改变触发位置，不直接增强避障加速度 |
| `avoidanceWeight` | `2.4`；`0–8` | 探测到障碍后避障加速度的基础权重 \(w_a\) | 转离碰撞航向更坚决 | 只在射线命中时生效，并按紧迫度放大到最多约 `3×` |
| `predatorSeparationRadius` | `0.18 m`；`0–0.8` | 捕食者之间开始相互排斥的距离 | 多个捕食者站位更分散，包围面更宽 | `count <= 1` 时无效果 |
| `predatorSeparationWeight` | `1.1`；`0–6` | 捕食者间排斥通道权重 \(w_p\) | 减少模型重叠和同路追逐 | 使用独立的普通 `maxForce` 预算，不会被 alarm 权重放大 |

### 6.4 Capture FX：吞食交互反馈

捕获成功时，系统复制鱼消失位置 \(\mathbf p_0\) 和捕食者该时刻的瞬时速度
\(\mathbf v_P\)。第 \(i\) 个黑色方块延迟 \(i\Delta t\) 出现，初速度为：

\[
\mathbf v_0=s_{\mathrm{up}}(0,1,0)-w_{\mathrm{reverse}}\mathbf v_P.
\]

以出现后的局部时间 \(\tau\) 和寿命 \(T\) 计：

\[
\mathbf v(\tau)=\mathbf v_0(1-\tau/T),
\qquad
\mathbf p(\tau)=\mathbf p_0+\mathbf v_0
\left(\tau-\frac{\tau^2}{2T}\right),
\]

\[
\mathrm{size}(\tau)=s_0(1-\tau/T).
\]

位置使用线性速度的解析积分，因此不随帧率改变轨迹。鱼实例在 `kill()` 成功时
立即缩为零，第一个方块同帧出现，不会残留一帧“鱼和死亡效果同时存在”。

| 字段 | 默认值；面板范围 | 意义 | 调大后的视觉效果 |
|---|---:|---|---|
| `enabled` | `true`；布尔 | 是否显示吞食方块 | 关闭会立即清空当前与待出现方块 |
| `particleCount` | `3`；`1–8` | 每次捕获按时间顺序出现的方块数量 | 尾迹更长；产品默认固定表达为三个 |
| `spawnInterval` | `0.07 s`；`0–0.3` | 相邻方块出现的时间间隔 \(\Delta t\) | 三段节奏拉开、更容易逐个看清 |
| `lifetime` | `0.50 s`；`0.05–1.5` | 速度和尺寸线性衰减到零的时间 \(T\) | 方块飞得更远、停留更久 |
| `cubeSize` | `0.018 m`；`0.003–0.06` | 方块刚出现时的边长 \(s_0\) | 死亡反馈更醒目 |
| `upwardSpeed` | `0.24 m/s`；`0–1` | 初速度的竖直向上分量 \(s_{\mathrm{up}}\) | 黑方块上扬更高 |
| `reverseVelocityFactor` | `0.40`；`0–2` | 捕食者瞬时速度反向分量的倍率 \(w_{\mathrm{reverse}}\) | 方块更明显地从捕食者来向反喷 |

## 7. Raw boids：Reynolds 基线

对任意非零期望方向 \(\mathbf d\)，转向函数为：

\[
\mathcal T(\mathbf d,\mathbf v;v_{\max},F_{\max})
=
\operatorname{clip}_{F_{\max}}
\left(
v_{\max}\frac{\mathbf d}{\|\mathbf d\|}-\mathbf v
\right).
\]

每条规则先各自裁剪，再乘权重后相加。因此 `maxForce` 是“每条转向通道的裁剪
上限”，不是最终合力的统一上限。最终航向还会经过 `turnSpeed` 限制。

### 7.1 数量与速度

| 字段 | 默认值；面板范围 | 数学 / 物理意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `fishCount` | `36`；`1–3000` | 实例数、初始数和邻域密度 | 鱼群更密、局部邻居更多，画面更有量感；计算量增加 | 修改后重建并重置鱼群；`>=200` 时可能切到空间网格配对 |
| `cruiseSpeed` | `0.23 m/s`；`0.02–0.6` | 裸基线期望速度 \(v_{c,0}\) | 全群常态游速提高 | 被 speed / size trait 翻译；也是能耗相对速度的固定分母 |
| `maxSpeed` | `0.46 m/s`；`0.05–0.8` | 裸基线速度硬上限 | 允许追逐、避障和 panic 达到更高峰值 | 应高于巡航速度；同样被 traits 翻译 |
| `maxForce` | `5.20 m/s²`；`0.05–8` | 每条期望方向的转向力裁剪 | 动作响应更快、轨迹更硬朗 | 太大后常由 `turnSpeed` 成为瓶颈；大体型会压低它 |
| `turnSpeed` | `2.80 rad/s`；`0.2–10` | 裸基线最大角速度 | 转向更敏捷、弯曲半径更小 | 受体型、能量和 panic 乘法共同影响 |

当前角速度预算为：

\[
\omega_i=
\omega_{\mathrm{derived}}
\left(0.55+0.45f_E(q_i)\right)
\left(1+\texttt{panicTurnBoost}\cdot U_i^*\right).
\]

其中 \(U_i^*\) 是自身 panic、直接威胁和紧急社会航向强度的最大值。

### 7.2 分离、对齐、聚合

| 字段 | 默认值；面板范围 | 数学 / 物理意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `separationRadius` | `0.10 m`；`0.01–0.3` | 进入个人空间排斥的距离 | 鱼之间平均间距增大，群体膨胀 | 经过 size 映射；与鱼数 / 缸体积共同决定邻居数 |
| `separationWeight` | `0.80`；`0–5` | 分离方向在合力中的倍率 | 近邻更快弹开，重叠减少；过强会抖动和碎群 | `sepFalloff` 决定近邻如何争夺方向 |
| `sepFalloff` | `"inverse"`；枚举 | 单个邻鱼随距离的方向投票曲线 | 改变近邻与远邻对“往哪里躲”的相对话语权 | 汇总向量随后归一化，所以主要改方向，不直接改最终力幅 |
| `alignmentRadius` | `0.24 m`；`0.02–0.6` | 读取邻鱼速度的范围 | 更多邻鱼共享方向，极化度通常提高、信息传播更远 | 经过 size 映射；受 FOV、能量和 panic 影响 |
| `alignmentWeight` | `0.45`；`0–5` | 普通对齐方向在合力中的倍率 | 转向更同步，局部方向差减小 | panic 接收增益会乘普通对齐；独立紧急航向不乘此字段 |
| `cohesionRadius` | `0.45 m`；`0.05–0.8` | 计算邻鱼位置中心的范围 | 更远的鱼也互相牵引，群体更容易保持整体 | 半径过大可能把多个局部群强行合并 |
| `cohesionWeight` | `0.40`；`0–5` | 回到邻居位置中心的力倍率 | 鱼群更紧、更不容易掉队 | 经过 size 映射，并被能量与 panic 压低 |

三种 `sepFalloff` 的单邻鱼贡献幅值 \(m(d)\) 为：

\[
\begin{aligned}
\texttt{inverse}:&\quad m(d)=1/d,\\
\texttt{linear}:&\quad m(d)=(r-d)/r,\\
\texttt{invlog}:&\quad m(d)=\ln(r/d).
\end{aligned}
\]

### 7.3 感知、避墙与姿态

| 字段 | 默认值；面板范围 | 数学 / 物理意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---:|---|---|---|
| `perceptionFOV` | `300°`；`60–360` | 前向可见圆锥；`360` 关闭方向门控 | 更多身后邻鱼参与，方向与聚合信息传播更快、更对称 | 分离始终全向；当前源码也用该门控过滤社会 alarm |
| `detectionLength` | `0.23 m`；`0.02–2.5` | 沿当前航向探测内壁的射线长度 | 更早避墙、转弯更从容；过大时产生类似隐形向心力 | 生物尺度固定，不随水槽一起缩放 |
| `avoidanceWeight` | `1.00`；`0–8` | 缸壁回避方向的权重 | 离墙更坚决，撞墙后硬反弹减少 | 紧迫度还把权重放大到最多约 `3×` |
| `centeringWeight` | `0`；`0–2` | 朝水槽原点的恒幅牵引 | 鱼群更常回到画面中心，减少贴壁 | 不是随距离增大的弹簧；会掩盖自然 wall / boid 结构 |
| `angleStep` | `18°`；`5–45` | 避墙寻找空方向时，每次水平旋转试探的角度 | 搜索更粗、更快，避障方向可能更突然 | 数值更小会尝试更多方向，计算略增 |
| `maxPitch` | `57°`；`0–80` | 相对水平面的最大俯仰角 | 允许更陡的上潜 / 下潜，三维感更强 | 过高会出现“潜艇式”直上直下 |

水槽之外还有硬夹取与速度分量反弹，作为极端参数下防穿墙的最后保护。它不是
主要避障行为。

## 8. Tank：水槽

启动时通过 `navigator.maxTouchPoints` 选择平台预设：

| 平台 | `width` | `height` | `depth` |
|---|---:|---:|---:|
| desktop | `2.0 m` | `1.2 m` | `0.8 m` |
| mobile | `1.2 m` | `0.8 m` | `0.5 m` |

面板范围分别为：

- `width`: `0.4–4 m`；
- `height`: `0.3–3 m`；
- `depth`: `0.2–3 m`。

| 字段 | 几何意义 | 调大后的视觉与动力学 | 关键耦合 |
|---|---|---|---|
| `width` | X 轴左右跨度 | 水平回转空间增加，单位体积密度下降 | 摄像机重新构图；社会半径和鱼身不缩放 |
| `height` | Y 轴上下跨度 | 垂直分层空间增加，俯仰运动更明显 | 受 `maxPitch` 限制 |
| `depth` | Z 轴前后跨度 | 前后层次增加，正面视角遮挡减少 | 摄像机距离与透视感同时变化 |

本项目采用“只缩放水槽”的模型。鱼身、社会半径、捕获半径、壁面 margin 和
`detectionLength` 都保持生物尺度。于是改变水槽会真实改变：

\[
\text{密度}\propto
\frac{\texttt{fishCount}}
{\texttt{width}\cdot\texttt{height}\cdot\texttt{depth}}.
\]

水槽尺寸不属于行为 preset。复制 preset 时会记录 `tank` 作为调参环境元数据，
加载时只提示尺寸不一致，不会自动覆盖当前水槽。

## 9. Camera：观察方式

| 字段 | 默认值；面板范围 | 观察意义 | 调大 / 开启后的画面 | 是否影响模拟 |
|---|---:|---|---|---|
| `fov` | `45°`；`25–80` | 透视相机垂直视场角 | 画面更广、透视更强、单条鱼更小 | 否 |
| `orbitEnabled` | `true`；布尔 | 桌面端是否允许拖拽 OrbitControls | 开启后可自由绕缸观察 | 否；触摸端没有自由 orbit |
| `autoRotate` | `false`；布尔 | 是否让桌面轨道相机自动旋转 | 开启后持续绕缸展示 | 否 |
| `autoRotateSpeed` | `0.65`；`-4–4` | Three.js 自动旋转速度倍率和方向 | 绝对值越大旋转越快；正负号改变方向 | 否 |
| `damping` | `0.08`；`0.01–0.25` | OrbitControls 阻尼系数 | 提高后输入响应和惯性衰减更快，拖尾更短 | 否；`0` 在启用阻尼时不是实用值 |
| `view` | `"home"`；枚举 | 一次性的预设视角命令 | 可切换 home / front / side / top | 否；它不是持久行为参数 |

键盘 `0 / 1 / 3 / 7` 分别对应 home / front / side / top。桌面用户手动移动过
相机后，普通窗口 resize 不再强制覆盖其视角；水槽尺寸变化仍会重新 home。

## 10. Visualizers：诊断可视化

正式画面使用硬边纯色体系：

- 外部空间与参数面板为淡米色；
- 三维水槽远侧内壁与结构为淡蓝，并可叠加可调透明度的面网格辅助深度；
- 玩家鱼群始终为 `#7eb6d9`；
- 捕食者使用 `#c9a27b` 的三棱尖锐箭头；
- 吞食交互方块为淡蓝灰。

鱼、捕食者和方块使用不受灯光改变色值的 `MeshBasicMaterial`。疲劳和 panic
只通过动作表达，不改变鱼色。

这些开关只读取模拟状态，不写入任何力。

| 字段 | 默认值 | 显示内容 | 解读注意 |
|---|---:|---|---|
| `gravityArrow` | `true` | 水槽中心的重力方向和相对标准重力的长度 | 当前 boid 行为不消费 `world.gravity`，因此它主要验证移动设备输入坐标 |
| `perceptionRadii` | `false` | 第一条存活鱼周围的分离 / 对齐 / 聚合三个线框球 | 显示的是 traits 翻译后的实时半径，不是裸 `BOID_PARAMS` |
| `steeringArrows` | `false` | 每条鱼本步净转向向量，显示长度为力的 `0.15×` | 是诊断缩放，不是实际一秒位移；大量鱼时有额外绘制成本 |
| `visionCone` | `false` | 第一条存活鱼的 FOV 边界射线扇 | 长度取对齐 / 聚合半径较大者；分离仍是全向 |

`live` 区域还显示：

- `alive`：存活数 / 初始数；
- `panic`：`panic >= 0.35` 的存活鱼数；
- `energy`：存活鱼平均能量比例。
- `predators / eaten`：当前捕食者实例数 / 它们累计捕获数。

`status` 角标额外显示 FPS。`flock.metrics()` 可读取存活比例、死因、平均能量、
中位最近邻距离、回转半径、极化度、配对模式和单步耗时。

## 11. Preset、重置与参数所有权

行为 preset 保存以下七组：

```text
boids
traits
mapping
energy
panic
predator
captureFx
```

它不保存 input、camera、visualizer 或当前 tank 尺寸。加载完整分组 preset 时，
旧版本缺失的新字段会回落到当前源码默认值。

导入采用事务式校验：先在临时快照中检查整份 preset，全部通过后才一次性写入。
所有数值必须有限，并受 `src/preset-validation.js` 的绝对安全边界约束；鱼数与
捕食者数量和 capture FX 方块数量必须是整数，`angleStep` 不能为零，panic
半径 / 迟滞阈值与能量阈值必须保持正确顺序。任一已知字段非法时整份拒绝，
当前模拟不会被改一半。
未知字段只会被忽略，不能写入对象原型。

几个重置动作的范围不同：

- `reset simulation`：重建鱼群并重置捕食者，不恢复参数；
- `recharge school`：仅把存活鱼恢复到当前容量的满能量；
- `reset predator`：仅重置捕食者位置、目标、捕获数和冷却；
- 每个字段旁的 `↺`：恢复该字段注册面板时的默认值；
- `reset all`：恢复所有面板参数和面板范围，重建鱼群、重置捕食者与相机。

## 12. 最重要的跨参数耦合

调参时优先记住以下关系：

1. **速度不是免费收益。**
   `speed ↑ → 实际速度 ↑ → speedExponent 能耗 ↑ → 疲劳 → 速度 / 对齐 / 聚合 ↓`。
2. **体型不是一个视觉缩放。**
   它同时改变机动性、六个社会参数和能耗，但目前不改变鱼数和捕获半径。
3. **半径决定“听谁”，权重决定“听了以后多用力”。**
   两者需要分开调。
4. **`maxForce` 大不等于能急转。**
   最终航向仍受 `turnSpeed × 体型 × 能量 × panic` 的角速度预算限制。
5. **扩大水槽等于降低无量纲密度。**
   生物尺度参数不会自动跟着水槽放大。
6. **panic 有两条信息路径。**
   直接看到捕食者的鱼使用径向逃逸；只听见邻鱼报警的鱼使用社会航向。
7. **捕食者视觉体型与碰撞是两回事。**
   `bodyScale`、`captureRadius`、`alertRadius` 必须成组校准。
8. **观察工具不应成为玩法。**
   camera 和 visualizer 只帮助解释系统，不改变胜负。

建议按以下顺序平衡：

1. 固定 traits 和能耗，先稳定裸 separation / alignment / cohesion；
2. 调 `size = 20 / 50 / 80`，验证“小鱼聚、大鱼散”；
3. 调能量，让疲劳掉队可见但不瞬间停摆；
4. 单捕食者下调直接逃逸；
5. 再启用社会 alarm，逐项调传播；
6. 最后增加捕食者数量，并平衡围群、锁定、互斥和捕获吞吐。
