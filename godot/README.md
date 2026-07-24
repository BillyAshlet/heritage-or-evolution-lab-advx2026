# Godot Android 主项目

`godot/` 是当前主交付。仓库根目录原 Three.js 版本暂时保留为模拟算法
参考，不再作为 PICO APK 的运行入口。

## 已确认工具链

- Godot: Steam `4.7.1.stable`
- JDK: `/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`
- Android SDK: `/Users/Apple/Library/Android/sdk`
- Renderer: Compatibility / OpenGL
- Android ABI: `arm64-v8a`
- Tests: GUT `godot_4_7` branch at `aeb5d4f3f7f0a6c9b5e178876d6c99b791fda605`

## 命令行

```bash
GODOT="/Users/Apple/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"

"$GODOT" --headless --path godot --import
"$GODOT" --headless --path godot --quit-after 3
"$GODOT" --headless --path godot \
  -s addons/gut/gut_cmdln.gd -gdir=res://tests/unit -gexit

mkdir -p build/android
"$GODOT" --headless --path godot \
  --export-debug Android ../build/android/evolution-debug.apk
```

## 平台边界

普通桌面与 Android 屏幕模式必须完整可玩。PICO OpenXR 只通过独立导出
预设和适配节点接入，不允许游戏状态机或模拟逻辑直接依赖 XR。
