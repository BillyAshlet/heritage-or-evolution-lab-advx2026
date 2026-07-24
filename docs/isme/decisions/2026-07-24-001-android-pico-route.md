# SKMB-2026-07-24-001: Android / PICO Platform Route

- status: accepted
- decided_by: designer
- approval_source: 用户明确指示“走安卓路线”，并提供 Steam Godot 路径、授权通过 Homebrew 安装 JDK 17
- date: 2026-07-24
- commit: pending
- patterns:
  - D_external_dependency
- scope: Android / PICO platform route

## Decision

主交付改为 Godot 4 原生项目生成的 Android APK。普通屏幕模式必须独立
成立；PICO OpenXR 作为同一 Godot 项目的隔离导出能力，不能成为主流程
的硬依赖。

本机工具链使用：

- Steam Godot 4.7.1 stable
- Homebrew OpenJDK 17
- Android SDK `/Users/Apple/Library/Android/sdk`
- Compatibility/OpenGL 渲染器优先

## Applies To

- `godot/` 主项目
- Android 导出预设
- 后续 PICO OpenXR vendor 插件
- 桌面与 Android 共用的游戏逻辑

## Rationale

Android APK 是团队选择的 PICO 交付路径；普通屏幕与 XR 隔离继续遵守
`ARCHITECTURE.md` 的 VR 可拔除红线。

## Alternatives

- 继续以 Vite/Three.js Web 项目作为主交付
- Unity/PICO SDK 原生路线
- Android Studio/PICO Spatial Plugin 路线

## Supersedes

None.

## Superseded By

None.

