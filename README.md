# evolution 债的模拟器

AdventureX 2026 黑客松项目。不是进化模拟器，是**债的模拟器**：
每代鱼群的特征取舍被强制继承、不可回档，几代之后当年"正确"的
选择反噬。玩家在替祖先还债、同时给子孙欠债。

架构与分工见 **ARCHITECTURE.md**。

主交付已经切换到 Godot 4 Android APK：

```bash
GODOT="/Users/Apple/Library/Application Support/Steam/steamapps/common/Godot Engine/Godot.app/Contents/MacOS/Godot"

"$GODOT" --headless --path godot --import
"$GODOT" --headless --path godot \
  -s addons/gut/gut_cmdln.gd -gdir=res://tests/unit -gexit

mkdir -p build/android
"$GODOT" --headless --path godot \
  --export-debug Android ../build/android/evolution-debug.apk
```

根目录的 Vite/Three.js 代码暂时保留为旧模拟原型和算法参考，不再是
正式 APK 入口。

Web 算法说明：

- [行为模型与验收](docs/WEB_BEHAVIOR_MVP.md)
- [全部调参项的源码级参考](docs/PARAMETER_REFERENCE.md)

团队：北辰（模拟、trait 数值与代码架构）· 三金（环境、场景、配乐与
PICO）· Billy（产品规则、UI、继承链与最终拍板）
# heritage-or-evolution-lab-advx2026
