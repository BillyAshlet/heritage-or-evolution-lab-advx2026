# evolution · Web 鱼群水族馆

`experiment` 分支是纯 Vite + Three.js Web 版本。默认入口是持续运行的
**主水族馆**：鱼群的捕食者、被捕食者或双重角色完全由实时体型推导。
同一页面还包含营养级联与地图刚体两个隔离的子实验。

## 本地运行

```bash
npm install
npm run dev
```

Vite 会打印局域网访问地址。手机和桌面浏览器都直接打开这个地址，不需要
Electron、Tauri、Godot 或其他套壳。

## 验证生产版本

```bash
npm test
npm run build
npm run preview
```

生产预览需要确认 Rapier WASM 正常加载。目标浏览器为最新版 Chromium、
Safari 与 Firefox。

## 项目与子实验

- **主水族馆**：开放体型规则。超过 `k` 的大鱼会捕食所有更小鱼群；
  拖动任一鱼群的 `size` 会立即重算全部角色。
- **营养级联**：使用 `k–K_max` 尺寸窗口，刻意让大、小群互相忽略。
  等基线变为 ready 后点击 `release holding`。
- **地图与水中刚体**：启用穿孔障碍、距离场和 Rapier 动态物体。

## 观察与调参

- 单击鱼后，相机拉近并持续跟随。
- 再次单击同一条鱼会打开操作列表；双击直接进入第一人称。
- ESC、右键或双击空白退出第一人称。
- 吃掉一条鱼时会显示碎片爆发与咬合闪光；全部特效参数均可调整。
- **鱼群**编辑器使用前后箭头切换当前鱼群，并支持复制新增或删除。
  体型、数量、颜色、运动、群游和出生布局都收在当前鱼群内部。
- 控制台可通过 `window.experiment` 重置、导入配置、跑 seed/batch、
读取指标、切换项目或生成动态刚体。

完整实施约束见 [EXPERIMENT-DEVELOPMENT.md](./EXPERIMENT-DEVELOPMENT.md)，
分支架构优先级见 [ARCHITECTURE.md](./ARCHITECTURE.md)。
