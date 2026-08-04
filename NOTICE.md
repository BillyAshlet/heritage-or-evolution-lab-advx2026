# 版权与授权说明 / Copyright & Licensing Notice

**《下游》Downstream — 一个债的模拟器 / a debt simulator**
AdventureX 2026

---

## 1. 双许可结构 / Dual Licensing

本作品由**软件**与**创意内容**两部分组成，分别适用不同许可：

| 部分 | 范围 | 许可 | 文件 |
|---|---|---|---|
| **软件 Software** | `src/**/*.js`、`tools/**`、构建配置（`vite.config.js`、`package.json`） | **GPL-3.0** | [`LICENSE`](./LICENSE) |
| **创意内容 Content** | 见下方 §1.1 | **CC BY-NC 4.0** | [`LICENSE-CONTENT.txt`](./LICENSE-CONTENT.txt) |

依赖项许可均与 GPL-3.0 兼容：three.js (MIT)、Tweakpane (MIT)、
Rapier (Apache-2.0 — 仅与 GPL-**3.0** 兼容，不可降级为 GPL-2.0)。

### 1.1 创意内容的范围

CC BY-NC 4.0 覆盖以下内容，**无论它们存放在哪个文件中**：

- 设计与概念文档：`ARCHITECTURE.md`、`README.md`、本文件、
  `output/brochure/*.md`
- 叙事文案：三关标题与故事文本、结算文案、作品理念长文
  （即使这些文本以字符串形式内嵌在 `src/visitor-mode.js`、
  `src/game-mode.js` 等源码文件中，其著作权仍按本条处理）
- 视觉与影音资产：`output/brochure/*.png`、`output/pdf/*.pdf`、
  `public/output/video/*.m4v`、`public/output/pdf/*`
- 视觉设计规范、UI 版式、手册排版

**署名与非商业性使用为强制条件。** 商业使用需事先取得著作权人书面许可。

---

## 2. 著作权归属 / Copyright

```
Copyright (c) 2026 Billy Ashlet (岳昆林 / 栀归零)
Copyright (c) 2026 北辰 (NorthStar)
Copyright (c) 2026 叁金 (Sanjin)
```

本作品为**共同作品**。各著作权人**保留就其自身贡献另行授权的权利**
（包括以其他许可条款或商业条款另行授权）。

### 2.1 分工归属（与 `output/brochure/CREDITS.md` 一致）

**Billy Ashlet 栀归零（岳昆林）** — billyashlet.com
> 产品与叙事架构、概念设计、**核心模拟算法的基础设计与原型实现**、
> **群体运动与物理交互规则设计及效果调校**、玩法与关卡设计、
> UI 与视觉设计、手册设计、文献研究与理论框架的交互转译

**北辰（NorthStar）** — NorthStarXyz@proton.me
> 技术架构与系统工程化、WebSpatial 集成与空间端适配、
> 底层模拟参数向玩家可玩参数的映射实现、玩法参数调优与数值平衡、
> 开源技术调研与方案验证

**叁金（Sanjin）** — akbptech@gmail.com
> 模型形态参数化与躯体自由度系统实现、模型渲染优化、
> 相机视锥剔除（Frustum Culling）与可见性渲染优化、
> 3D 场景架构、渲染风格定义与规范

---

## 3. ⚠️ 关于 git 提交记录的重要说明

**本仓库的 git 提交作者字段不能作为设计或撰写归属的依据。**

开发期间，Billy Ashlet 的大量编码工作是在北辰的设备上完成的
（原因：Billy 的 AI 订阅额度耗尽，改用北辰的环境继续开发）。
因此这些提交在 git 中记录的作者为 `NorthStarXyz`，
但其**设计与实现**归属见 §2.1。

同理，部分提交的作者字段为 `Billy Ashlet <billyashlet@gmail.com>`，
其中包含由 AI 助手（Claude）协助生成的代码，已在提交信息中以
`Co-Authored-By` 标注。

**git 作者字段记录的是"提交所使用的设备与配置"，不是著作权归属。**
著作权归属以本文件 §2 及 `output/brochure/CREDITS.md` 为准。

---

## 4. 关于机制设计的说明 / On Mechanism Design

本作品的核心机制构想 —— 以零和特征取舍、强制乘法继承与延迟代价显形
构成的"债的模拟器"结构，及其与布迪厄惯习（habitus）理论的交互转译 ——
由 Billy Ashlet 提出并设计，相关设计过程记录见仓库文档与提交历史。

**须知：** 著作权保护的是表达（文档、代码、文案、图形），
不保护思想、方法或算法本身。本节为归属声明，其法律效力限于
对上述**表达性材料**的著作权主张。

---

## 5. 引用 / Citation

学术或展示场合引用本作品时，请注明：

> 《下游》Downstream — 一个债的模拟器.
> Billy Ashlet (岳昆林), 北辰, 叁金. AdventureX 2026.
> https://github.com/BillyAshlet/heritage-or-evolution-lab-advx2026
