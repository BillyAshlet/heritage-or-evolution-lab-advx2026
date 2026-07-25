import { writeFile } from 'node:fs/promises';
import {
  createDefaultConfig,
  createParameterRegistry,
  getPath,
} from '../src/experiment-config.js';
import {
  LEVEL_SPECS,
  PLAYER_IDEAL_BASE_VALUES,
  PLAYER_PHENOTYPE_COUPLING,
} from '../src/game-mode.js';

const OUTPUT_PATH = new URL('../docs/EXPERIMENT_PARAMETERS.md', import.meta.url);

function cell(value) {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value, null, 0);
  return String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function constraint(spec) {
  if (spec.options) {
    return Object.entries(spec.options)
      .map(([label, value]) => `${label}=${cell(value)}`)
      .join('；');
  }
  if (spec.min !== undefined) {
    return `${spec.min}…${spec.max}，步长 ${spec.step}`;
  }
  return '布尔/文本';
}

function leafEntries(value, prefix = '') {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return Object.entries(value).flatMap(([key, child]) =>
      leafEntries(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [[prefix, value]];
}

export function buildParameterReference() {
  const config = createDefaultConfig();
  const registry = createParameterRegistry(config);
  const lines = [
    '# Web 实验版完整参数清单',
    '',
    '> 本文件由 `node tools/export_experiment_parameters.mjs --write` 从统一配置注册表生成。',
    '> 它列出实验与调试层的全部参数；Game 模式不会把这张表直接展示给玩家。',
    '',
    `当前共 **${registry.length}** 个可配置叶字段。`,
    '',
    '## Game 模式的三角形参数翻译',
    '',
    '| 三角方向 | 直接翻译 | 主要代价 |',
    '| --- | --- | --- |',
    '| 速度 | 蓝鱼巡航速度、最高速度、捕获处理时间 | 高速提高蓝鱼代谢 |',
    '| 体型 | 蓝鱼真实渲染尺寸、捕食关系、捕获距离、持续速度与转向 | 变大会变慢、转向更迟钝，并可能进入新的捕食窗口 |',
    '| 耐力 | 只降低蓝鱼代谢倍率 | 不提高觅食率，不直接回血 |',
    '',
    '三角位置使用非负重心权重 `w_size + w_stamina + w_speed = 1`。每轴按同一分段公式映射：',
    '',
    '```text',
    'w ≤ 1/3：m = 0.5 + 1.5w',
    'w ≥ 1/3：m = 0.75 + 0.75w',
    '```',
    '',
    '中心点三项均为 `×1`；任一顶点为偏好轴 `×1.5`、另外两轴各 `×0.5`。',
    '当前尝试先把本代系数与已继承累计系数逐项相乘，再从同一套理想基础参数派生实际表型。',
    '只有成功封代才提交新的累计系数，且累计不 clamp；失败不改变已继承值。',
    '',
    '## Game 固定关卡与理想基础参数',
    '',
    '> 下列参数参与 Game 模拟，但不会作为额外控件暴露给玩家；玩家仍只操作三角形。',
    '',
    '### 蓝鱼理想基础值',
    '',
    '| 路径 | 固定值 |',
    '| --- | --- |',
    ...leafEntries(PLAYER_IDEAL_BASE_VALUES, 'playerIdealBase').map(
      ([path, value]) => `| \`${cell(path)}\` | \`${cell(value)}\` |`
    ),
    '',
    '### 三项表型耦合',
    '',
    '| 路径 | 固定值 |',
    '| --- | --- |',
    ...leafEntries(PLAYER_PHENOTYPE_COUPLING, 'playerCoupling').map(
      ([path, value]) => `| \`${cell(path)}\` | \`${cell(value)}\` |`
    ),
    '',
    '### 三关 LevelSpec',
    '',
    '| 路径 | 固定值 |',
    '| --- | --- |',
    ...LEVEL_SPECS.flatMap((level) =>
      leafEntries(level, `levels.${level.id}`).map(
        ([path, value]) => `| \`${cell(path)}\` | \`${cell(value)}\` |`
      )
    ),
    '',
    '## 全部实验参数',
    '',
    '| 路径 | 默认值 | 分组 | 面板标签 | 生效方式 | 安全范围 / 选项 |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const spec of registry) {
    lines.push(
      `| \`${cell(spec.path)}\` | \`${cell(getPath(config, spec.path))}\` | ${cell(spec.group)} | ${cell(spec.label)} | \`${cell(spec.applyMode)}\` | ${cell(constraint(spec))} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

const markdown = buildParameterReference();
if (process.argv.includes('--write')) {
  await writeFile(OUTPUT_PATH, markdown, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH.pathname}`);
} else {
  process.stdout.write(markdown);
}
