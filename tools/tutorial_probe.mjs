/**
 * 教学关探针：无头跑教学场景，检查【UI 上写的预测】和【仿真真实结果】
 * 是否一致。
 *
 * 教学关唯一的失败模式不是"不好玩"，是"说了谎" —— 面板上写「你吃它」
 * 而玩家等半天什么也没发生，那这一课就白上了，而且玩家会连带不信任
 * 正式关卡的所有提示。所以每次动 T1/T2/T3 的参数，都跑一遍这个：
 *
 *   node tools/tutorial_probe.mjs
 *
 * 判读标准：「它吃你」档玩家必须掉鱼、「互不理睬」档必须零死亡、
 * 「你吃它」档必须是灰鱼掉鱼而玩家不掉。任何一档反过来就是回归。
 */

import { ExperimentSimulation } from '../src/experiment-simulation.js';
import {
  createTutorialConfig,
  T1_SPEC,
  T2_SPEC,
  tutorialRelation,
  RELATION_COPY,
  t,
} from '../src/tutorial-mode.js';

const DT = 1 / 30;
const DURATION = 30;

function run(value, seed) {
  const config = createTutorialConfig(T1_SPEC, value);
  config.runtime.randomizeSeed = false;
  config.runtime.seed = seed;
  const sim = new ExperimentSimulation({ scene: null, config, distanceField: null, physics: null });
  // 灰鱼分摊在 small 与 large 两个鱼群里（见 tutorial-mode.js 的说明），
  // 统计时必须合起来算，否则会把「灰鱼被吃光」误判成还剩一条。
  const iP = config.schools.findIndex((s) => s.id === 'medium');
  const refIdx = config.schools
    .map((s, i) => (s.id === 'medium' ? -1 : i))
    .filter((i) => i >= 0);
  const nP = config.schools[iP].count;
  const nR = refIdx.reduce((sum, i) => sum + config.schools[i].count, 0);
  const refAlive = () => refIdx.reduce((sum, i) => sum + sim.aliveCount(i), 0);
  let first = null;
  while (sim.elapsed + 1e-9 < DURATION) {
    sim._advance(DT);
    const p = sim.aliveCount(iP), r = refAlive();
    if (first === null && (p < nP || r < nR)) first = sim.elapsed;
    if (p === 0 || r === 0) break;
  }
  return { p: sim.aliveCount(iP), r: refAlive(), first, end: sim.elapsed };
}

const SEEDS = [1001, 2003, 3001, 4001, 5003];
console.log('滑块  预测      30s后 玩家/灰鱼(5种子)        首杀秒');
for (const v of [0.55, 0.7, 1.0, 1.25, 1.6, 2.0]) {
  const label = t(RELATION_COPY[tutorialRelation(T1_SPEC, v)], 'zh');
  const rows = SEEDS.map((s) => run(v, s));
  const pop = rows.map((r) => `${r.p}/${r.r}`).join(' ');
  const fk = rows.map((r) => (r.first === null ? '--' : r.first.toFixed(1))).join(' ');
  console.log(`${v.toFixed(2)}  ${label.padEnd(5)}  ${pop.padEnd(22)}  ${fk}`);
}


// ── T2 · 速度 ────────────────────────────────────────────────────────
// 判读标准：上缸我方存活必须【随速度递增】（快了逃得掉），下缸小鱼存活
// 必须【随速度递减】（快了追得上）。任何一列反过来就是回归 —— 早期版本
// 子缸只有 0.7m 高时，上缸那一列就是反的（越快死得越快），因为在只有
// 捕食半径两倍高的盒子里提速只是提高遭遇频率。
function runT2(value, seed, duration = 50) {
  const config = createTutorialConfig(T2_SPEC, value);
  config.runtime.randomizeSeed = false;
  config.runtime.seed = seed;
  const sim = new ExperimentSimulation({
    scene: null,
    config,
    distanceField: null,
    physics: null,
  });
  const at = (id) => config.schools.findIndex((school) => school.id === id);
  while (sim.elapsed < duration) sim._advance(DT);
  return {
    top: sim.aliveCount(at('medium')),
    small: sim.aliveCount(at('small')),
    bottom: sim.aliveCount(at('medium2')),
    big: sim.aliveCount(at('large')),
  };
}

const mean = (list) => list.reduce((sum, x) => sum + x, 0) / list.length;

console.log('\n第二课 · 速度（50 秒 × 5 种子）');
console.log('滑块   上缸我方存活/6   下缸小鱼存活/6');
const t2rows = [];
for (const value of [0.6, 0.8, 1.0, 1.2, 1.6]) {
  const runs = SEEDS.map((seed) => runT2(value, seed));
  const row = {
    value,
    top: mean(runs.map((r) => r.top)),
    small: mean(runs.map((r) => r.small)),
    bad: runs.filter((r) => r.big < 2 || r.bottom < 6).length,
  };
  t2rows.push(row);
  console.log(
    ` ${value.toFixed(2)}        ${row.top.toFixed(1)}              ${row.small.toFixed(1)}`
  );
}
const topOk = t2rows.at(-1).top > t2rows[0].top;
const smallOk = t2rows.at(-1).small < t2rows[0].small;
const cleanOk = t2rows.every((row) => row.bad === 0);
console.log(
  `  方向: 逃 ${topOk ? '✓' : '✗ 反了'} · 追 ${smallOk ? '✓' : '✗ 反了'}` +
    ` · 对照(大鱼/下缸我方不该死) ${cleanOk ? '✓' : '✗'}`
);
