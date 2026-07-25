import { Pane } from 'tweakpane';
import {
  createParameterRegistry,
  getPath,
  setPath,
} from './experiment-config.js';

const PROJECTS = {
  aquarium: {
    eyebrow: 'MAIN PROJECT',
    title: '主水族馆',
    description: '体型实时决定捕食者与被捕食者；捕获后死亡永久生效。',
    dashboard: 'LIVE FOOD WEB',
  },
  cascade: {
    eyebrow: 'SUB-EXPERIMENT 01',
    title: '营养级联',
    description: '尺寸窗口隔离大—小直接关系，holding 释放后只测级联传导。',
    dashboard: 'CASCADE PROBE',
  },
  obstacle: {
    eyebrow: 'SUB-EXPERIMENT 02',
    title: '地图与水中刚体',
    description: '穿孔地图、距离场和 Rapier 六自由度物体的独立验证场。',
    dashboard: 'MAP / PHYSICS',
  },
  ecology: {
    eyebrow: 'SUB-EXPERIMENT 03',
    title: '生态淘汰',
    description: '可耗竭浮游、真实饥饿与有限耐力捕食；仅剩一个种群时结算。',
    dashboard: 'ECOLOGY LEDGER',
  },
};

const SCHOOL_SECTIONS = [
  {
    title: '身份与形态',
    expanded: true,
    fields: ['id', 'name', 'color', 'count', 'size', 'targetNeighbors'],
  },
  {
    title: '运动',
    expanded: true,
    fields: ['cruiseSpeed', 'maxSpeed', 'turnSpeed'],
  },
  {
    title: '生态角色',
    expanded: false,
    fields: ['grazeRate'],
  },
  {
    title: '群游',
    expanded: false,
    fields: [
      'separationWeight',
      'alignmentWeight',
      'cohesionWeight',
    ],
  },
  {
    title: '出生布局',
    expanded: false,
    fields: ['spawnRegion', 'initialHeading'],
  },
];

const CASCADE_GROUPS = new Set([
  'Holding / Cascade',
  'Cascade 判据',
  'Advanced · Cascade',
]);
const MAP_GROUPS = new Set([
  '障碍距离场',
  'Advanced · Distance Field',
  '障碍',
  'Rapier 物理',
  'Advanced · Physics Spawn',
]);
const ECOLOGY_GROUPS = new Set([
  'Trait Coupling',
  '生态能量',
  '浮游资源',
]);
const CAPTURE_GROUPS = new Set(['捕食', '捕获特效']);

function downloadText(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function relationGlyph(relation) {
  return {
    pursuit: '追',
    evade: '逃',
    peer: '同',
    ignore: '·',
  }[relation];
}

function relationLabel(relation) {
  return {
    pursuit: '捕食',
    evade: '逃逸',
    peer: '同级',
    ignore: '忽略',
  }[relation];
}

function roleLabel(relations = []) {
  const pursuit = relations.includes('pursuit');
  const evade = relations.includes('evade');
  if (pursuit && evade) return '双重角色：捕食者 + 被捕食者';
  if (pursuit) return '捕食者';
  if (evade) return '被捕食者';
  return '同级群体';
}

function groupVisible(project, group) {
  if (CASCADE_GROUPS.has(group)) return project === 'cascade';
  if (MAP_GROUPS.has(group) || group.startsWith('障碍 ·')) {
    return project === 'obstacle';
  }
  if (ECOLOGY_GROUPS.has(group)) return project === 'ecology';
  if (CAPTURE_GROUPS.has(group)) {
    if (project === 'cascade') return false;
    return true;
  }
  return group !== '项目';
}

export function createExperimentDebug({
  controller,
  simulation,
  spawnRigidBody,
}) {
  let pane = null;
  let selectedSchoolIndex = 0;
  let releaseButton = null;
  let roleState = null;
  let roleBindings = [];
  const holder = document.getElementById('panel-holder');
  const dashboard = document.createElement('section');
  dashboard.id = 'experiment-dashboard';
  dashboard.setAttribute('aria-label', '鱼群关系与实验实时指标');
  dashboard.innerHTML = `
    <header>
      <span id="dashboard-kind">LIVE FOOD WEB</span>
      <strong id="probe-state" aria-live="polite">running</strong>
    </header>
    <canvas id="rog-chart" width="360" height="150" role="img" aria-label="小、中、大三群回转半径时间曲线"></canvas>
    <pre id="experiment-metrics">…</pre>
  `;
  document.getElementById('app').appendChild(dashboard);
  const chart = dashboard.querySelector('#rog-chart');
  const context = chart.getContext('2d');
  const dashboardKind = dashboard.querySelector('#dashboard-kind');
  const stateLabel = dashboard.querySelector('#probe-state');
  const metricsText = dashboard.querySelector('#experiment-metrics');
  let lastUpdate = 0;

  function projectMeta() {
    return (
      PROJECTS[controller.stage.runtime.project] ?? PROJECTS.aquarium
    );
  }

  function switchProject(project) {
    if (project === controller.stage.runtime.project) return;
    controller.stage.runtime.project = project;
    controller.applyConfig('rebuildScene', 'runtime.project');
    selectedSchoolIndex = Math.min(
      selectedSchoolIndex,
      controller.stage.schools.length - 1
    );
    rebuildPane();
  }

  function addProjectSwitcher() {
    const current = controller.stage.runtime.project;
    const meta = projectMeta();
    const switcher = document.createElement('section');
    switcher.id = 'project-switcher';
    switcher.innerHTML = `
      <header>
        <span>${meta.eyebrow}</span>
        <strong>${meta.title}</strong>
      </header>
      <div class="project-tabs" role="tablist" aria-label="项目与子实验">
        ${Object.entries(PROJECTS)
          .map(
            ([id, item]) => `
              <button
                type="button"
                role="tab"
                data-project="${id}"
                aria-selected="${id === current}"
              >${item.title}</button>
            `
          )
          .join('')}
      </div>
      <p>${meta.description}</p>
    `;
    for (const button of switcher.querySelectorAll('[data-project]')) {
      button.addEventListener('click', () => {
        switchProject(button.dataset.project);
      });
    }
    holder.appendChild(switcher);
  }

  function addActionButtons(root) {
    const project = controller.stage.runtime.project;
    const run = root.addFolder({
      title:
        project === 'aquarium'
          ? '主项目操作'
          : project === 'ecology'
            ? '生态实验操作'
            : '子实验操作',
      expanded: true,
    });
    if (project === 'cascade') {
      releaseButton = run.addButton({ title: 'release holding' });
      releaseButton.on('click', () => simulation.releaseHolding());
      run.addButton({ title: 'run current seed' }).on('click', () => {
        simulation.runSeed(controller.stage.runtime.seed);
      });
      run.addButton({ title: 'run batch seeds' }).on('click', async () => {
        stateLabel.textContent = 'batch running…';
        const result = await simulation.runBatch();
        stateLabel.textContent =
          `${result.pairedPasses}/${result.total} paired evidence`;
      });
    } else {
      releaseButton = null;
    }
    run.addButton({ title: 'reset current project' }).on('click', () => {
      controller.reset();
    });
    if (project === 'obstacle') {
      for (const type of ['ring', 'cube', 'column']) {
        run
          .addButton({ title: `spawn ${type}` })
          .on('click', () => spawnRigidBody(type));
      }
    }
  }

  function addConfigButtons(root) {
    const actions = root.addFolder({ title: '配置文件', expanded: false });
    actions.addButton({ title: '恢复默认值' }).on('click', () => {
      controller.restoreDefaults();
      selectedSchoolIndex = 0;
      rebuildPane();
    });
    actions.addButton({ title: '导出 JSON' }).on('click', () => {
      downloadText(
        `experiment-${controller.stage.runtime.seed}.json`,
        controller.exportConfig()
      );
    });
    actions.addButton({ title: '导入 JSON' }).on('click', () => {
      const text = window.prompt('粘贴完整 ExperimentConfig JSON');
      if (!text) return;
      try {
        controller.importConfig(text);
        selectedSchoolIndex = 0;
        rebuildPane();
      } catch (error) {
        window.alert(error.message);
      }
    });
    actions.addButton({ title: '保存到浏览器' }).on('click', () => {
      localStorage.setItem(
        'experiment-config-v2',
        controller.exportConfig()
      );
    });
    actions.addButton({ title: '读取浏览器配置' }).on('click', () => {
      const text = localStorage.getItem('experiment-config-v2');
      if (!text) return;
      controller.importConfig(text);
      selectedSchoolIndex = 0;
      rebuildPane();
    });
    actions.addButton({ title: '复制 seed' }).on('click', () => {
      navigator.clipboard?.writeText(String(controller.stage.runtime.seed));
    });
    actions.addButton({ title: '导出实验报告' }).on('click', () => {
      downloadText(
        `experiment-report-${controller.stage.runtime.seed}.json`,
        JSON.stringify(simulation.metrics(), null, 2)
      );
    });
  }

  function bindSpec(folder, spec) {
    const keys = spec.path.split('.');
    const key = keys.pop();
    const parent = keys.reduce(
      (value, part) => value[part],
      controller.stage
    );
    const options = { label: spec.label };
    if (spec.min !== undefined) {
      options.min = spec.min;
      options.max = spec.max;
      options.step = spec.step;
    }
    if (spec.options) options.options = spec.options;
    const binding = folder.addBinding(parent, key, options);
    binding.on('change', (event) => {
      if (spec.applyMode !== 'live' && !event.last) return;
      try {
        controller.applyConfig(spec.applyMode, spec.path);
        if (
          spec.path === 'tank.preset' ||
          spec.path === 'runtime.populationPreset'
        ) {
          setTimeout(rebuildPane, 0);
        } else if (
          spec.path.endsWith('.name') ||
          spec.path.endsWith('.id') ||
          spec.path.endsWith('.count')
        ) {
          setTimeout(rebuildPane, 0);
        }
      } catch (error) {
        setPath(
          controller.stage,
          spec.path,
          getPath(controller.current, spec.path)
        );
        window.alert(error.message);
        binding.refresh();
      }
    });
    return binding;
  }

  function schoolSectionFor(spec, prefix) {
    const relative = spec.path.slice(prefix.length);
    return (
      SCHOOL_SECTIONS.find((section) =>
        section.fields.some(
          (field) =>
            relative === field || relative.startsWith(`${field}.`)
        )
      ) ?? SCHOOL_SECTIONS.at(-1)
    );
  }

  function addSchoolEditor(root, registry) {
    selectedSchoolIndex = Math.max(
      0,
      Math.min(
        selectedSchoolIndex,
        controller.stage.schools.length - 1
      )
    );
    const schools = controller.stage.schools;
    const school = schools[selectedSchoolIndex];
    const editor = root.addFolder({
      title: `鱼群 ${selectedSchoolIndex + 1}/${schools.length} · ${school.name}`,
      expanded: true,
    });
    editor
      .addButton({ title: '← 上一个鱼群' })
      .on('click', () => {
        selectedSchoolIndex =
          (selectedSchoolIndex - 1 + schools.length) % schools.length;
        rebuildPane();
      });
    editor
      .addButton({ title: '下一个鱼群 →' })
      .on('click', () => {
        selectedSchoolIndex =
          (selectedSchoolIndex + 1) % schools.length;
        rebuildPane();
      });
    editor
      .addButton({ title: '+ 新增鱼群（复制当前）' })
      .on('click', () => {
        controller.addSchool(selectedSchoolIndex);
        selectedSchoolIndex = controller.stage.schools.length - 1;
        rebuildPane();
      });
    editor
      .addButton({ title: '− 删除当前鱼群' })
      .on('click', () => {
        try {
          controller.removeSchool(selectedSchoolIndex);
          selectedSchoolIndex = Math.min(
            selectedSchoolIndex,
            controller.stage.schools.length - 1
          );
          rebuildPane();
        } catch (error) {
          window.alert(error.message);
        }
      });

    roleState = {
      role: '计算中…',
      relations: '—',
      derived: '—',
    };
    roleBindings = [
      editor.addBinding(roleState, 'role', {
        label: '体型自动角色',
        readonly: true,
      }),
      editor.addBinding(roleState, 'relations', {
        label: '对其他鱼群',
        readonly: true,
      }),
      editor.addBinding(roleState, 'derived', {
        label: '派生感知',
        readonly: true,
      }),
    ];

    const prefix = `schools.${selectedSchoolIndex}.`;
    const specs = registry.filter((spec) => spec.path.startsWith(prefix));
    const folders = new Map();
    for (const spec of specs) {
      const section = schoolSectionFor(spec, prefix);
      let folder = folders.get(section.title);
      if (!folder) {
        folder = editor.addFolder({
          title: section.title,
          expanded: section.expanded,
        });
        folders.set(section.title, folder);
      }
      bindSpec(folder, spec);
    }
  }

  function addGlobalParameters(root, registry) {
    const project = controller.stage.runtime.project;
    const folders = new Map();
    for (const spec of registry) {
      if (
        spec.path.startsWith('schools.') ||
        spec.path === 'runtime.project' ||
        !groupVisible(project, spec.group)
      ) {
        continue;
      }
      let folder = folders.get(spec.group);
      if (!folder) {
        folder = root.addFolder({
          title: spec.group,
          expanded:
            !spec.group.startsWith('Advanced') &&
            ['运行', '关系'].includes(spec.group),
        });
        folders.set(spec.group, folder);
      }
      bindSpec(folder, spec);
    }
  }

  function rebuildPane() {
    // Structural changes intentionally destroy the whole pane. The project
    // switcher and selected-school editor therefore cannot retain listeners.
    pane?.dispose();
    holder.replaceChildren();
    addProjectSwitcher();
    const meta = projectMeta();
    pane = new Pane({
      title: `${meta.eyebrow} · 参数`,
      container: holder,
    });
    addActionButtons(pane);
    const registry = createParameterRegistry(controller.stage);
    addSchoolEditor(pane, registry);
    addGlobalParameters(pane, registry);
    addConfigButtons(pane);
  }

  function drawChart(metrics) {
    if (metrics.project !== 'cascade') return;
    const batchRecord =
      metrics.batch?.results.find((item) => item.seed === metrics.seed) ??
      metrics.batch?.results?.[0];
    const pairedSamples = batchRecord?.paired?.samples ?? [];
    const liveSamples = metrics.cascade.eventSamples;
    const pairedView = liveSamples.length < 2 && pairedSamples.length >= 2;
    const samples = pairedView ? pairedSamples : liveSamples;
    context.clearRect(0, 0, chart.width, chart.height);
    context.fillStyle = '#f8f4ec';
    context.fillRect(0, 0, chart.width, chart.height);
    context.strokeStyle = '#c8d8e6';
    context.beginPath();
    context.moveTo(30, 10);
    context.lineTo(30, chart.height - 20);
    context.lineTo(chart.width - 8, chart.height - 20);
    context.stroke();
    if (samples.length < 2) return;
    const keys = pairedView
      ? [
          ['eventSmall', '#4f9fcf', 2, []],
          ['controlSmall', '#4f9fcf', 1, [4, 3]],
          ['eventMedium', '#e5a441', 2, []],
          ['controlMedium', '#e5a441', 1, [4, 3]],
        ]
      : [
          ['rogSmall', '#4f9fcf', 2, []],
          ['rogMedium', '#e5a441', 2, []],
          ['rogLarge', '#c95252', 1, []],
        ];
    const maxTime = Math.max(...samples.map((sample) => sample.time), 1);
    const maxValue = Math.max(
      ...samples.flatMap((sample) => keys.map(([key]) => sample[key])),
      0.01
    );
    for (const [key, color, width, dash] of keys) {
      context.strokeStyle = color;
      context.lineWidth = width;
      context.setLineDash(dash);
      context.globalAlpha = key === 'rogLarge' ? 0.5 : 1;
      context.beginPath();
      samples.forEach((sample, index) => {
        const x = 30 + (sample.time / maxTime) * (chart.width - 40);
        const y =
          chart.height -
          20 -
          (sample[key] / maxValue) * (chart.height - 34);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
    context.setLineDash([]);
    const result = pairedView
      ? batchRecord.paired
      : metrics.cascade.result;
    if (result) {
      for (const [role, key, color] of [
        [
          'medium',
          pairedView ? 'eventMedium' : 'rogMedium',
          '#e5a441',
        ],
        [
          'small',
          pairedView ? 'eventSmall' : 'rogSmall',
          '#4f9fcf',
        ],
      ]) {
        const peak = result.peaks[role];
        if (!peak) continue;
        const x = 30 + (peak.time / maxTime) * (chart.width - 40);
        const y =
          chart.height -
          20 -
          (peak[key] / maxValue) * (chart.height - 34);
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, 3.5, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.globalAlpha = 1;
    context.font = '9px ui-monospace';
    context.fillStyle = '#6d8497';
    context.fillText(
      pairedView ? '实线释放 · 虚线 holding 对照' : '大群曲线仅供参考',
      34,
      18
    );
  }

  function updateSelectedSchool(metrics) {
    const school = metrics.population[selectedSchoolIndex];
    const row = metrics.relationMatrix[selectedSchoolIndex];
    if (!school || !row || !roleState) return;
    roleState.role = roleLabel(row);
    roleState.relations = row
      .map((relation, index) => {
        if (index === selectedSchoolIndex) return null;
        return `${metrics.population[index].name}:${relationLabel(relation)}`;
      })
      .filter(Boolean)
      .join(' · ');
    roleState.derived =
      `size ${school.size.toFixed(2)} · r ${school.neighborRadius.toFixed(3)}`;
    for (const binding of roleBindings) binding.refresh();
  }

  function update(nowMs) {
    if (nowMs - lastUpdate < 120) return;
    lastUpdate = nowMs;
    const metrics = simulation.metrics();
    const meta = PROJECTS[metrics.project] ?? PROJECTS.aquarium;
    const status = metrics.cascade.result;
    dashboard.dataset.project = metrics.project;
    dashboardKind.textContent = meta.dashboard;
    chart.hidden = metrics.project !== 'cascade';
    document.getElementById('lab-title').textContent = meta.title;
    document.getElementById('lab-subtitle').textContent =
      `${meta.eyebrow} · Three.js + Rapier Web`;
    let stateText = 'running';
    if (simulation.batchRunning) {
      stateText = 'batch running…';
    } else if (metrics.project === 'aquarium') {
      stateText = 'LIVE · SIZE ROLES';
    } else if (metrics.project === 'obstacle') {
      stateText = 'LIVE · FIELD';
    } else if (metrics.project === 'ecology') {
      stateText =
        metrics.ecology.state === 'winner'
          ? `WIN · ${metrics.ecology.winnerName}`
          : metrics.ecology.state === 'collapse'
            ? 'COLLAPSE · NO WINNER'
            : 'LIVE · ENERGY';
    } else if (metrics.batch && !metrics.released) {
      stateText =
        `${metrics.batch.pairedPasses}/${metrics.batch.total} paired evidence`;
    } else if (status) {
      stateText = 'event-only diagnostic';
    } else {
      stateText = metrics.released
        ? 'recording event'
        : metrics.canRelease.ready
          ? 'ready'
          : metrics.canRelease.reason;
    }
    stateLabel.textContent = stateText;
    if (releaseButton) {
      releaseButton.disabled =
        metrics.mode !== 'cascade' ||
        metrics.released ||
        !metrics.canRelease.ready;
    }
    updateSelectedSchool(metrics);
    const matrix = metrics.relationMatrix
      .map(
        (row, index) =>
          `${metrics.population[index].name.padEnd(4, ' ')} ${row
            .map(relationGlyph)
            .join('  ')}`
      )
      .join('\n');
    const population = metrics.population
      .map((item) => {
        const ecology =
          metrics.project === 'ecology'
            ? ` E=${(item.averageEnergy * 100).toFixed(0)}% S=${(item.averageStamina * 100).toFixed(0)}% dead=${item.deaths.captured}/${item.deaths.starved}`
            : '';
        return `${item.name} ${item.alive}/${item.target} size=${item.size.toFixed(2)} r=${item.neighborRadius.toFixed(3)}${ecology}`;
      })
      .join('\n');
    const result =
      metrics.project === 'cascade' && status
        ? `lag=${status.peaks.lag?.toFixed(2) ?? '—'}s  impulse=${Number.isFinite(status.impulseRatio) ? status.impulseRatio.toFixed(3) : '∞'}\nattribution Δ=${status.attributionGain.toFixed(3)} n=${status.attributionSamples}`
        : metrics.project === 'cascade'
          ? 'lag=—  impulse=—  attribution=—'
          : '';
    const pairedRecord =
      metrics.batch?.results.find((item) => item.seed === metrics.seed) ??
      metrics.batch?.results?.[0];
    const paired = metrics.batch
      ? `paired=${metrics.batch.pairedPasses}/${metrics.batch.total}（诊断，不作交付硬门）` +
        `${
          pairedRecord
            ? `\nseed ${pairedRecord.seed} ΔM=${(pairedRecord.paired.effects.medium * 100).toFixed(1)}% ΔS=${(pairedRecord.paired.effects.small * 100).toFixed(1)}% lag=${pairedRecord.paired.peaks.lag?.toFixed(2) ?? '—'}s`
            : ''
        }`
      : '';
    const capture = metrics.predatorPairs
      .map((pair) => {
        const closure = Number.isFinite(pair.nominalClosureSeconds)
          ? `${pair.nominalClosureSeconds.toFixed(2)}s`
          : '∞';
        return `${pair.actor}→${pair.target} cap=${pair.captures}/${pair.chaseStarts} ${(pair.conversion * 100).toFixed(1)}% chase=${pair.averageChaseSeconds.toFixed(2)}s close=${closure}`;
      })
      .join('\n');
    const bodies = metrics.rigidBodies
      .map((body) => `${body.type}@y=${body.position[1].toFixed(2)}`)
      .join(' ');
    metricsText.textContent =
      `${population}\n\n体型派生关系（行作用于列）\n${matrix}` +
      `${capture ? `\n${capture}` : ''}` +
      `${result ? `\n\n${result}` : ''}` +
      `${paired ? `\n${paired}` : ''}` +
      `${
        metrics.project === 'ecology'
          ? `\n\nplankton=${metrics.ecology.plankton.level.toFixed(1)}/${metrics.ecology.plankton.capacity.toFixed(0)} consumed=${metrics.ecology.plankton.consumed.toFixed(1)}\noutcome=${metrics.ecology.state}${metrics.ecology.winnerName ? ` winner=${metrics.ecology.winnerName}` : ''}`
          : ''
      }` +
      `\npairs=${metrics.pairCount} sim=${metrics.simulationMs.toFixed(1)}ms render=${metrics.renderFps.toFixed(0)}fps` +
      `\ncaptures=${metrics.captures} fx=${metrics.captureParticles} deaths=permanent` +
      `\nbodies=${bodies || '—'} contacts=${metrics.dynamicContacts}` +
      `${metrics.warnings.length ? `\nwarning: ${metrics.warnings.join(' · ')}` : ''}`;
    drawChart(metrics);
  }

  rebuildPane();
  return {
    update,
    rebuildPane,
    dispose() {
      pane?.dispose();
      dashboard.remove();
    },
    get pane() {
      return pane;
    },
  };
}
