// visitor-mode.js — state machine and overlay UI for visitor mode.
// Visual styling lives in visitor.css.
// Simulation wiring goes through window.experiment + direct param imports.

import {
  TRAITS,
  PREDATOR_PARAMS,
  ENERGY_PARAMS,
} from './evolution-model.js';
import { mountTitleFish } from './title-fish.js';

// ── Background config ──────────────────────────────────────────────────────
// null  = Three.js canvas shows through (default)
// string = path to a video (.mp4/.webm) or image file
const TITLE_BG = '/output/video/inheritance-lab-loop.mp4';

// Per-level cutscene backgrounds, indexed by level (L1/L2/L3).
// 三金 fills L2/L3 here — same rule: null = canvas shows through.
// Entry = path string, or { src, tone } where tone 'bright' lifts the
// footage and thins the scrim. The three eras are meant to read as dark
// → luminous → dry, so L2 must be allowed to actually blaze; the default
// treatment is tuned for dark footage and would bury a golden asset.
const LEVEL_BG = [
  '/output/video/predator-shadow-loop.mp4',
  { src: '/output/video/golden-age-pixel-dawn-loop.mp4', tone: 'bright' },
  null,
];

// Builds <video>/<img> markup for a background slot. Videos are muted +
// playsinline so autoplay is allowed everywhere incl. iOS Safari.
function bgMarkup(src, className) {
  if (!src) return '';
  const ext = src.split('.').pop().toLowerCase();
  return ['mp4', 'webm', 'ogg'].includes(ext)
    ? `<video class="${className}" src="${src}" autoplay muted loop playsinline></video>`
    : `<img class="${className}" src="${src}" alt="">`;
}

// ── Level configs ──────────────────────────────────────────────────────────
// Three eras, three intended player moves. Values express the DESIGN
// INTENT and still need 北辰's balance pass — in particular L2 assumes
// an edible rival-fish food source that the sim does not have yet.
const LEVEL_CONFIGS = [
  // 荒原 · 捕食者在，食物勉强 → 玩家倾向缩体型 / 提耐力。
  // 活下来一点就算赢：这个时代不承诺体面。
  { id: 'L1', predatorCount: 2, drainMultiplier: 1.30, duration: 60, winThreshold: 0.25 },
  // 黄金 · 捕食者少，浮游不够 → 玩家倾向增体型去吃同类。
  // 阈值最高：这个时代不该死人，死了说明你没跟上。
  { id: 'L2', predatorCount: 1, drainMultiplier: 1.15, duration: 90, winThreshold: 0.70 },
  // 后疫情 · 捕食者少且不活跃，食物也少 → 玩家倾向提耐力、蛰伏。
  // 债在这里到期：L2 调大的体型，在这里养不活。
  { id: 'L3', predatorCount: 1, drainMultiplier: 1.35, duration: 90, winThreshold: 0.45 },
];

const TRAIT_DEFAULTS = { speed: 50, size: 50, stamina: 50 };

// Baseline values to restore between levels.
const _baseDrain = ENERGY_PARAMS.drainPerSecond;
const _basePredatorCount = PREDATOR_PARAMS.count;

// ── i18n ───────────────────────────────────────────────────────────────────
const I18N = {
  zh: {
    title:     '下游',
    subtitle:  '进化与遗传的代价',
    start:     '开始体验',
    settings:  '设置',
    concept:   '作品理念',
    credits:   '团队',
    back:      '返回',
    language:  '语言',
    confirm:   '确认参数，开始',
    preview:   '参数预览中',
    nextRound: '下一局',
    finish:    '完成体验',
    restart:   '重新开始',
    win:       '存活',
    lose:      '灭绝',
    survived:  '存活率',
    eaten:     '被捕食',
    starved:   '饥饿',
    locked:    '已锁定',
    traits: { speed: '速度', size: '体型', stamina: '耐力' },
    traitHints: {
      speed:   '更快，但消耗更多能量',
      size:    '更大，但灵活度下降',
      stamina: '更持久，但体型受限',
    },
    levels: [
      {
        title: '共工怒触不周山，天倾西北，地陷东南',
        story: '天既以倾，何以为北？\n泥土，饥饿与画饼充饥。',
        // 结算文案：胜也不许庆祝，第二句就是债的声明。
        verdictWin:  '天终未补，而你们活着。\n活下来的方式，会变成活下去的方式。',
        verdictLose: '地陷东南，你们随之而下。',
        inherit: '你在这一局改变了选择。\n这些参数将在下一局被永久锁定。',
        cta: '调整参数 →',
      },
      {
        title: '这是最好的时代，这是最坏的时代',
        story: '水既已涨，何以为岸？\n吞咽，膨胀，与来不及计算的重量。',
        // 全场唯一一次让玩家飘。第二句在最得意的时刻埋债：
        // 风是时代，翅膀是你调大的体型——风会停，翅膀不会缩回去。
        verdictWin:  '鹏之徙于南冥也，水击三千里，抟扶摇而上者九万里，去以六月息者也。\n风停时，翅膀还在。',
        verdictLose: '最好的时代没有等你。',
        inherit: '两局的选择，已经成为下一代的起点。\n潮水退去时，它们不会问你当时为什么那样选。',
        cta: '调整参数 →',
      },
      {
        title: '昔为东海之波臣，今困于车辙之中',
        story: '水既已涸，何以为继？\n等待，蛰伏，与远水解不了的近渴。',
        // 败句是庄子原文的收尾，本身就是一句游戏结束。
        verdictWin:  '斗升之水，足以活我。\n你留下的不是繁盛，是一条还在喘气的血脉。',
        verdictLose: '不如早索我于枯鱼之肆。\n远水终于来了，河床上已经没有鱼。',
        inherit: '',
        cta: '确认 →',
      },
    ],
    conceptTitle: '作品理念',
    conceptBody:
      '我们每一个选择，都会成为后代必须承受的环境。\n\n' +
      '《遗产》用三代鱼群的生死，让你亲手体验进化的代价——\n' +
      '不是教科书里的图表，而是你亲手造成的结果。',
    creditsTitle: '创作团队',
    creditsBody: 'Billy Ashlet\n北辰\n三金\n\nAdventureX 2026',
    endTitle:    '体验结束',
    endBody:
      '你的选择，塑造了它们的世界。\n' +
      '它们的命运，源于你的每一次决定。\n\n' +
      '这就是遗产。',
  },
  en: {
    title:     'Downstream',
    subtitle:  'The Price of Evolution',
    start:     'Begin',
    settings:  'Settings',
    concept:   'Concept',
    credits:   'Team',
    back:      'Back',
    language:  'Language',
    confirm:   'Confirm & Start',
    preview:   'Live Preview',
    nextRound: 'Next Round',
    finish:    'Finish',
    restart:   'Restart',
    win:       'Survived',
    lose:      'Extinct',
    survived:  'Survival Rate',
    eaten:     'Eaten',
    starved:   'Starved',
    locked:    'Locked',
    traits: { speed: 'Speed', size: 'Size', stamina: 'Stamina' },
    traitHints: {
      speed:   'Faster, but burns more energy',
      size:    'Larger, but less agile',
      stamina: 'Lasts longer, but constrains size',
    },
    levels: [
      {
        // 共工 shattered Mount Buzhou, a pillar of heaven: the sky tilted
        // northwest, the earth caved southeast. Kept as myth, not glossed.
        title: 'Gong Gong struck Mount Buzhou — the sky tilts northwest, the earth caves southeast',
        story: 'The sky already leans. Where, then, is north?\nSoil, hunger, and pictured cakes for a starving mouth.',
        verdictWin:  'No one mended the sky. You lived anyway.\nHow you survived becomes how you must live.',
        verdictLose: 'The earth caved southeast. You went down with it.',
        inherit: 'Your choices this round are now sealed.\nThey will be locked in the next round.',
        cta: 'Adjust Traits →',
      },
      {
        // Dickens, A Tale of Two Cities — the sentence the boom years
        // used about themselves. English needs no translation here.
        title: 'It was the best of times, it was the worst of times',
        story: 'The water has risen. Where, then, is the shore?\nSwallowing, swelling, and weight no one stopped to count.',
        // The one moment the game lets the player feel magnificent —
        // and plants the debt in the second line: the wind is the era,
        // the wings are the size you grew. Wind stops, wings stay.
        verdictWin:  'The Peng migrates to the southern deep: it beats the water three thousand li, spirals ninety thousand li on the whirlwind, and departs on the six-month wind.\nWhen the wind stops, the wings remain.',
        verdictLose: 'The best of times did not wait for you.',
        inherit: 'Two rounds of choices, fixed forever.\nWhen the tide goes out, no one asks why you chose that way.',
        cta: 'Adjust Traits →',
      },
      {
        // Zhuangzi: a fish stranded in a wheel rut begs for a pint of
        // water, saying it was once a subject of the Eastern Sea.
        title: 'Once a subject of the Eastern Sea — now stranded in a wheel rut',
        story: 'The water has dried. What, then, carries on?\nWaiting, lying low, and distant rivers that cannot wet a near thirst.',
        // The lose line is Zhuangzi's own punchline — already a game over.
        verdictWin:  'A pint of water would be enough to keep me alive.\nWhat you leave behind is not abundance — it is a bloodline still breathing.',
        verdictLose: 'Better to look for me in the dried-fish shop.\nThe distant river arrived. There were no fish left in the bed.',
        inherit: '',
        cta: 'Confirm →',
      },
    ],
    conceptTitle: 'Concept',
    conceptBody:
      'Every choice we make becomes the environment our descendants must survive.\n\n' +
      'Legacy uses three generations of fish to let you experience the cost of evolution firsthand—\n' +
      'not as a textbook diagram, but as something you caused.',
    creditsTitle: 'Team',
    creditsBody: 'Billy Ashlet\n北辰\n三金\n\nAdventureX 2026',
    endTitle:    'Experience Complete',
    endBody:
      'Your choices shaped their world.\n' +
      'Their fate began with every decision you made.\n\n' +
      'This is legacy.',
  },
};

// ── State ──────────────────────────────────────────────────────────────────
let _lang           = 'en';
let _screen         = 'TITLE';
let _levelIndex     = 0;
let _playerTraits   = { ...TRAIT_DEFAULTS };
let _lockedTraits   = new Set();
let _lineage        = [];
let _traitsOnEntry  = { ...TRAIT_DEFAULTS };  // snapshot when TUNING opens
let _runInterval    = null;
let _runRemaining   = 0;
let _lastVerdict    = null;

let _runSkipRevealed = false;
let _sweeping        = false;
let _proximityCleanup = null;
let _titleFish = null;

let _overlay        = null;   // the #visitor-overlay element

// ── i18n helpers ──────────────────────────────────────────────────────────
function t(key) {
  const parts = key.split('.');
  let node = I18N[_lang];
  for (const k of parts) node = node?.[k];
  return node ?? key;
}
function levelT(key) {
  return I18N[_lang].levels[_levelIndex]?.[key] ?? '';
}

// ── Simulation helpers ─────────────────────────────────────────────────────
function sim() {
  return window.experiment;
}

function applyLevelEnv(index) {
  const cfg = LEVEL_CONFIGS[index];
  PREDATOR_PARAMS.count         = cfg.predatorCount;
  PREDATOR_PARAMS.enabled       = cfg.predatorCount > 0;
  ENERGY_PARAMS.drainPerSecond  = _baseDrain * cfg.drainMultiplier;
}

function applyTraitsToSim() {
  TRAITS.speed   = _playerTraits.speed;
  TRAITS.size    = _playerTraits.size;
  TRAITS.stamina = _playerTraits.stamina;
}

function resetSimForLevel() {
  applyLevelEnv(_levelIndex);
  applyTraitsToSim();
  sim()?.reset();
}

function getChangedTraits() {
  const changed = new Set();
  for (const key of ['speed', 'size', 'stamina']) {
    if (_playerTraits[key] !== _traitsOnEntry[key]) changed.add(key);
  }
  return changed;
}

// ── State machine ──────────────────────────────────────────────────────────
// Screens that get the conic sweep reveal (opaque-background screens only).
const SWEEP_SCREENS = new Set([
  'TITLE', 'SETTINGS', 'CONCEPT', 'CREDITS',
  'CUTSCENE', 'VERDICT', 'INHERIT', 'END',
]);

function go(nextScreen, dir = 'cw') {
  if (_proximityCleanup) { _proximityCleanup(); _proximityCleanup = null; }
  if (_titleFish) { _titleFish.dispose(); _titleFish = null; }
  _screen = nextScreen;
  _overlay.dataset.screen = nextScreen;
  render();

  if (!dir || _sweeping || !SWEEP_SCREENS.has(nextScreen)) return;
  if (dir === 'ring-cw' || dir === 'ring-ccw') {
    runRingWipe(dir === 'ring-cw');
    return;
  }
  const el = _overlay.firstElementChild;
  if (!el) return;
  _sweeping = true;
  el.classList.add(`vo-sweep-reveal--${dir}`);
  el.addEventListener('animationend', () => {
    el.classList.remove('vo-sweep-reveal--cw', 'vo-sweep-reveal--ccw');
    _sweeping = false;
  }, { once: true });
}

// Composite reveal for era changes (Begin, verdict → next level). Two
// bg-colored curtains sit above the freshly rendered screen and animate
// away together:
//   · .vo-wipe-ring — a thick annulus (the border of a circle div),
//     removed by a conic clock sweep (CW forward / CCW back);
//   · .vo-wipe-flat — everything else (inner disc + outside, cut out via
//     radial mask), removed by a horizontal wipe (right→left forward /
//     left→right back).
// Geometry, duration and easing live in visitor.css (--vo-wipe-* vars).
function runRingWipe(forward) {
  _sweeping = true;
  const ring = document.createElement('div');
  ring.className = `vo-wipe-ring vo-wipe-ring--${forward ? 'cw' : 'ccw'}`;
  const flat = document.createElement('div');
  flat.className = `vo-wipe-flat vo-wipe-flat--${forward ? 'fwd' : 'back'}`;
  _overlay.append(flat, ring);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    flat.remove(); ring.remove();
    _sweeping = false;
  };
  flat.addEventListener('animationend', done, { once: true });
  // If a re-render nukes the curtains mid-animation, animationend never
  // fires — don't leave _sweeping stuck.
  setTimeout(done, 1200);
}

function startLevel() {
  _traitsOnEntry = { ...TRAIT_DEFAULTS };   // compare against neutral baseline
  resetSimForLevel();
  go('CUTSCENE', 'ring-cw');
}

function openTuning() {
  resetSimForLevel();   // sim runs as live preview
  go('TUNING');
}

function confirmTuning() {
  resetSimForLevel();   // hard reset before real run
  _runRemaining = LEVEL_CONFIGS[_levelIndex].duration;
  clearInterval(_runInterval);
  _runInterval = setInterval(tickRun, 1000);
  go('RUNNING');
}

function tickRun() {
  _runRemaining = Math.max(0, _runRemaining - 1);
  updateRunHud();
  if (_runRemaining <= 0) endRun();
}

function endRun() {
  clearInterval(_runInterval);
  _runInterval = null;

  const m   = sim()?.metrics() ?? { survivors: 0, initial: 1, deaths: {} };
  const cfg = LEVEL_CONFIGS[_levelIndex];
  const ratio = (m.survivors ?? m.alive ?? 0) / Math.max(m.initial ?? 1, 1);

  _lastVerdict = {
    won:           ratio >= cfg.winThreshold,
    survivalRatio: ratio,
    survivors:     m.survivors ?? m.alive ?? 0,
    initial:       m.initial ?? 0,
    eaten:         m.deaths?.eaten  ?? 0,
    starved:       m.deaths?.starved ?? 0,
  };

  const changed = getChangedTraits();
  _lineage.push({
    level:   _levelIndex,
    traits:  { ..._playerTraits },
    changed,
    verdict: _lastVerdict.won,
  });
  for (const key of changed) _lockedTraits.add(key);

  go('VERDICT');
}

function advanceLevel() {
  if (_levelIndex >= LEVEL_CONFIGS.length - 1) {
    // Restore baseline env params before ending
    PREDATOR_PARAMS.count        = _basePredatorCount;
    PREDATOR_PARAMS.enabled      = true;
    ENERGY_PARAMS.drainPerSecond = _baseDrain;
    go('END');
    return;
  }
  _levelIndex++;

  // Free traits reset to defaults; locked ones keep their player value.
  for (const key of ['speed', 'size', 'stamina']) {
    if (!_lockedTraits.has(key)) _playerTraits[key] = TRAIT_DEFAULTS[key];
  }

  const last = _lineage.at(-1);
  if (last && last.changed.size > 0) {
    go('INHERIT', 'ring-cw');
  } else {
    startLevel();
  }
}

// ── Render dispatcher ──────────────────────────────────────────────────────
function render() {
  switch (_screen) {
    case 'TITLE':    renderTitle();    break;
    case 'SETTINGS': renderSettings(); break;
    case 'CONCEPT':  renderConcept();  break;
    case 'CREDITS':  renderCredits();  break;
    case 'CUTSCENE': renderCutscene(); break;
    case 'TUNING':   renderTuning();   break;
    case 'RUNNING':  renderRunning();  break;
    case 'VERDICT':  renderVerdict();  break;
    case 'INHERIT':  renderInherit();  break;
    case 'END':      renderEnd();      break;
  }
}

// ── Screen renderers ───────────────────────────────────────────────────────
function renderTitle() {
  if (_proximityCleanup) { _proximityCleanup(); _proximityCleanup = null; }
  if (_titleFish) { _titleFish.dispose(); _titleFish = null; }
  const bgHtml = bgMarkup(TITLE_BG, 'vo-title__bg');

  // r=85, circumference ≈ 534 — show ~40% of the arc
  const C = 2 * Math.PI * 85;
  const arcLen  = (C * 0.40).toFixed(1);
  const gapLen  = (C * 0.60).toFixed(1);

  _overlay.innerHTML = `
    <div class="vo-screen vo-title">
      ${bgHtml}
      <canvas class="vo-title__fish" aria-hidden="true"></canvas>
      <div class="vo-title__lang">
        <button class="vo-btn vo-btn--${_lang === 'zh' ? 'active' : 'ghost'} vo-lang-btn" data-lang="zh">中</button>
        <button class="vo-btn vo-btn--${_lang === 'en' ? 'active' : 'ghost'} vo-lang-btn" data-lang="en">EN</button>
      </div>
      <div class="vo-title__hero">
        <h1 class="vo-title__name" data-fx="letters" data-fx-dir="top" data-fx-delay="60" data-fx-from="100" data-fx-to="900">${t('title')}</h1>
        <p class="vo-title__sub" data-fx="letters" data-fx-delay="35" data-fx-from="200">${t('subtitle')}</p>
      </div>
      <div class="vo-title__nav">
        <div class="vo-title__side vo-title__side--left">
          <button class="vo-btn vo-btn--ghost" data-action="settings" data-fx="letters">${t('settings')}</button>
        </div>
        <div class="vo-title__center">
          <div class="vo-title__ring-wrap">
            <svg class="vo-title__ring" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <circle class="vo-ring-track" cx="100" cy="100" r="85" />
              <circle class="vo-ring-arc"   cx="100" cy="100" r="85"
                stroke-dasharray="${arcLen} ${gapLen}" />
            </svg>
          </div>
          <button class="vo-btn vo-btn--primary vo-title__start" data-action="start" data-fx="letters">
            ${t('start')}
          </button>
        </div>
        <div class="vo-title__side vo-title__side--right">
          <button class="vo-btn vo-btn--ghost" data-action="concept" data-fx="letters">${t('concept')}</button>
          <button class="vo-btn vo-btn--ghost" data-action="credits" data-fx="letters">${t('credits')}</button>
        </div>
      </div>
    </div>
  `;

  _titleFish = mountTitleFish(
    _overlay.querySelector('.vo-title__fish'),
    { count: 16, cohesionRadius: FX_RING_RADIUS }
  );
  applyTextFx();

  _overlay.querySelector('[data-action="start"]').onclick = () => {
    _levelIndex = 0;
    _lockedTraits.clear();
    _lineage = [];
    _playerTraits = { ...TRAIT_DEFAULTS };
    startLevel();
  };
  _overlay.querySelector('[data-action="settings"]').onclick = () => go('SETTINGS', 'ccw');
  _overlay.querySelector('[data-action="concept"]').onclick  = () => go('CONCEPT', 'cw');
  _overlay.querySelector('[data-action="credits"]').onclick  = () => go('CREDITS', 'cw');
  _overlay.querySelectorAll('.vo-lang-btn').forEach(btn => {
    btn.onclick = () => { _lang = btn.dataset.lang; renderTitle(); };
  });
}

function renderSettings() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-subscreen vo-settings">
      <header class="vo-subscreen__header">
        <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters">← ${t('back')}</button>
        <h2 data-fx="letters" data-fx-from="400" data-fx-to="900">${t('settings')}</h2>
      </header>
      <div class="vo-subscreen__body">
        <div class="vo-settings__row">
          <span data-fx="letters">${t('language')}</span>
          <div class="vo-lang-toggle">
            <button class="vo-btn ${_lang === 'zh' ? 'vo-btn--active' : 'vo-btn--ghost'}" data-lang="zh">中文</button>
            <button class="vo-btn ${_lang === 'en' ? 'vo-btn--active' : 'vo-btn--ghost'}" data-lang="en">EN</button>
          </div>
        </div>
      </div>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'cw');
  _overlay.querySelectorAll('[data-lang]').forEach(btn => {
    btn.onclick = () => { _lang = btn.dataset.lang; renderSettings(); };
  });
}

function renderConcept() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-subscreen">
      <header class="vo-subscreen__header">
        <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters">← ${t('back')}</button>
        <h2 data-fx="letters" data-fx-from="400" data-fx-to="900">${t('conceptTitle')}</h2>
      </header>
      <div class="vo-subscreen__body">
        <p class="vo-body-text" data-fx="words" data-fx-from="300" data-fx-to="700">${nl2br(t('conceptBody'))}</p>
      </div>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'ccw');
}

function renderCredits() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-subscreen">
      <header class="vo-subscreen__header">
        <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters">← ${t('back')}</button>
        <h2 data-fx="letters" data-fx-from="400" data-fx-to="900">${t('creditsTitle')}</h2>
      </header>
      <div class="vo-subscreen__body">
        <p class="vo-body-text" data-fx="words" data-fx-from="300" data-fx-to="700">${nl2br(t('creditsBody'))}</p>
      </div>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'ccw');
}

function renderCutscene() {
  const backBtn = _levelIndex === 0
    ? `<button class="vo-btn vo-btn--back vo-cutscene__back" data-action="back" data-fx="letters">← ${t('back')}</button>`
    : '';

  const bgCfg  = LEVEL_BG[_levelIndex];
  const bgSrc  = typeof bgCfg === 'string' ? bgCfg : bgCfg?.src;
  const bgTone = typeof bgCfg === 'object' && bgCfg ? bgCfg.tone : null;
  const bgHtml = bgMarkup(bgSrc, 'vo-cutscene__bg');
  const bgClass = [
    bgHtml ? 'vo-cutscene--media' : '',
    bgTone === 'bright' ? 'vo-cutscene--bright' : '',
  ].join(' ').trim();

  _overlay.innerHTML = `
    <div class="vo-screen vo-cutscene ${bgClass}" data-level="${_levelIndex}">
      ${bgHtml}
      ${backBtn}
      <div class="vo-cutscene__content">
        <p class="vo-cutscene__level-tag" data-fx="letters" data-fx-delay="30">0${_levelIndex + 1} / 03</p>
        <h2 class="vo-cutscene__title" data-fx="letters" data-fx-dir="top" data-fx-from="300" data-fx-to="900" data-fx-wave>${levelT('title')}</h2>
        <p class="vo-cutscene__story" data-fx="words" data-fx-from="300" data-fx-to="700">${nl2br(levelT('story'))}</p>
      </div>
      <button class="vo-btn vo-btn--primary vo-cutscene__cta" data-action="continue" data-fx="letters">
        ${levelT('cta')}
      </button>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="continue"]').onclick = openTuning;
  if (_levelIndex === 0) {
    _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'ring-ccw');
  }
}

function renderTuning() {
  const traitKeys = ['speed', 'size', 'stamina'];
  const slidersHtml = traitKeys.map(key => {
    const locked = _lockedTraits.has(key);
    return `
      <div class="vo-trait ${locked ? 'vo-trait--locked' : ''}" data-trait="${key}">
        <div class="vo-trait__header">
          <span class="vo-trait__name" data-fx="letters" data-fx-from="400">${t('traits.' + key)}</span>
          ${locked ? `<span class="vo-trait__lock">${t('locked')}</span>` : ''}
          <span class="vo-trait__value" id="vo-val-${key}">${_playerTraits[key]}</span>
        </div>
        <input
          type="range" min="0" max="100"
          value="${_playerTraits[key]}"
          class="vo-slider"
          data-trait="${key}"
          ${locked ? 'disabled' : ''}
        />
        <p class="vo-trait__hint" data-fx="words" data-fx-from="300" data-fx-to="650">${t('traitHints.' + key)}</p>
      </div>
    `;
  }).join('');

  _overlay.innerHTML = `
    <div class="vo-tuning" data-level="${_levelIndex}">
      <div class="vo-tuning__header">
        <span class="vo-level-tag" data-fx="letters" data-fx-delay="30">0${_levelIndex + 1} / 03</span>
        <h2 class="vo-tuning__title" data-fx="letters" data-fx-from="400" data-fx-to="900">${levelT('title')}</h2>
        <span class="vo-preview-badge">${t('preview')}</span>
      </div>
      <div class="vo-traits">${slidersHtml}</div>
      <button class="vo-btn vo-btn--primary vo-tuning__confirm" data-action="confirm" data-fx="letters">
        ${t('confirm')}
      </button>
    </div>
  `;

  applyTextFx();

  _overlay.querySelectorAll('.vo-slider').forEach(slider => {
    slider.oninput = () => {
      const key = slider.dataset.trait;
      _playerTraits[key] = Number(slider.value);
      const valEl = _overlay.querySelector(`#vo-val-${key}`);
      if (valEl) valEl.textContent = slider.value;
      applyTraitsToSim();
    };
  });
  _overlay.querySelector('[data-action="confirm"]').onclick = confirmTuning;
}

function renderRunning() {
  _runSkipRevealed = false;
  _overlay.innerHTML = `
    <div class="vo-screen vo-running" data-level="${_levelIndex}">
      <div class="vo-running__hud" id="vo-running-hud">
        <div class="vo-hud-main">
          <span class="vo-hud-timer" id="vo-hud-timer">${formatTime(_runRemaining)}</span>
          <span class="vo-hud-survival" id="vo-hud-survival"></span>
        </div>
        <div class="vo-hud-skip" id="vo-hud-skip">
          <button class="vo-btn vo-btn--ghost vo-hud-skip__btn" id="vo-skip-btn">
            ${_lang === 'zh' ? '跳过本轮' : 'Skip Round'}
          </button>
          <span class="vo-hud-skip__hint">${_lang === 'zh' ? '或按 Space' : 'or Space'}</span>
        </div>
      </div>
    </div>
  `;

  _overlay.querySelector('#vo-running-hud').addEventListener('click', (e) => {
    if (e.target.closest('#vo-skip-btn')) return;
    _runSkipRevealed = !_runSkipRevealed;
    _overlay.querySelector('#vo-hud-skip').classList.toggle('vo-hud-skip--open', _runSkipRevealed);
  });

  _overlay.querySelector('#vo-skip-btn').addEventListener('click', () => endRun());

  updateRunHud();
}

function updateRunHud() {
  const timerEl    = _overlay?.querySelector('#vo-hud-timer');
  const survivalEl = _overlay?.querySelector('#vo-hud-survival');
  if (timerEl)    timerEl.textContent = formatTime(_runRemaining);
  if (survivalEl) {
    const m      = sim()?.metrics() ?? {};
    const alive  = m.survivors ?? m.alive ?? 0;
    const total  = m.initial ?? alive;
    const pct    = total > 0 ? Math.round((alive / total) * 100) : 0;
    survivalEl.textContent = `${alive} / ${total}  (${pct}%)`;
  }
}

function renderVerdict() {
  const v      = _lastVerdict;
  const pct    = Math.round(v.survivalRatio * 100);
  const isLast = _levelIndex >= LEVEL_CONFIGS.length - 1;
  // Per-level, win/lose-specific line. Falls back to nothing if a level
  // hasn't been written yet — the stats screen still stands on its own.
  const verdictLine = levelT(v.won ? 'verdictWin' : 'verdictLose');

  _overlay.innerHTML = `
    <div class="vo-screen vo-verdict ${v.won ? 'vo-verdict--win' : 'vo-verdict--lose'}">
      <div class="vo-verdict__result" data-fx="letters" data-fx-dir="top" data-fx-delay="60" data-fx-from="300" data-fx-to="900">${v.won ? t('win') : t('lose')}</div>
      ${verdictLine ? `<p class="vo-verdict__line" data-fx="words" data-fx-from="300" data-fx-to="700">${nl2br(verdictLine)}</p>` : ''}
      <div class="vo-verdict__stats">
        <div class="vo-stat">
          <span class="vo-stat__value" data-fx="letters" data-fx-from="400" data-fx-to="900">${pct}%</span>
          <span class="vo-stat__label" data-fx="letters">${t('survived')}</span>
        </div>
        <div class="vo-stat">
          <span class="vo-stat__value" data-fx="letters" data-fx-from="400" data-fx-to="900">${v.eaten}</span>
          <span class="vo-stat__label" data-fx="letters">${t('eaten')}</span>
        </div>
        <div class="vo-stat">
          <span class="vo-stat__value" data-fx="letters" data-fx-from="400" data-fx-to="900">${v.starved}</span>
          <span class="vo-stat__label" data-fx="letters">${t('starved')}</span>
        </div>
      </div>
      <button class="vo-btn vo-btn--primary" data-action="next" data-fx="letters">
        ${isLast ? t('finish') : t('nextRound')} →
      </button>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="next"]').onclick = advanceLevel;
}

function renderInherit() {
  const last = _lineage.at(-1);
  const lockedNames = [...(last?.changed ?? [])].map(k => t('traits.' + k)).join('、');

  _overlay.innerHTML = `
    <div class="vo-screen vo-inherit" data-level="${_levelIndex}">
      <div class="vo-inherit__content">
        <p class="vo-inherit__message" data-fx="words" data-fx-from="300" data-fx-to="700">${nl2br(levelT('inherit') || '')}</p>
        ${lockedNames ? `<p class="vo-inherit__locked" data-fx="letters" data-fx-from="400" data-fx-to="900">${lockedNames}</p>` : ''}
      </div>
      <button class="vo-btn vo-btn--primary" data-action="next" data-fx="letters">
        ${_lang === 'zh' ? '进入下一局 →' : 'Next Round →'}
      </button>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="next"]').onclick = startLevel;
}

function renderEnd() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-end">
      <div class="vo-end__content">
        <h2 class="vo-end__title" data-fx="letters" data-fx-dir="top" data-fx-delay="50" data-fx-from="300" data-fx-to="900">${t('endTitle')}</h2>
        <p class="vo-end__body" data-fx="words" data-fx-from="300" data-fx-to="700">${nl2br(t('endBody'))}</p>
      </div>
      <button class="vo-btn vo-btn--ghost" data-action="restart" data-fx="letters">${t('restart')}</button>
    </div>
  `;
  applyTextFx();
  _overlay.querySelector('[data-action="restart"]').onclick = () => go('TITLE', 'ccw');
}

// ── Utils ──────────────────────────────────────────────────────────────────
// Ring-cursor text effect (asmobius.co.jp style):
//   inside the ring  → variable font weight swells toward the cursor center
//   outside the ring → letters get pushed away in a wave that fades with distance
// All values are damped in a rAF loop for the fluid follow feel.
const FX_RING_RADIUS = 90;   // px — weight zone; also the visible ring's radius
const FX_PUSH_REACH  = 3;    // push wave dies out at RADIUS * FX_PUSH_REACH
const FX_MAX_PUSH    = 12;   // px — peak displacement of the push wave
const FX_DAMP        = 0.16; // per-frame lerp factor for span weight/offset
const FX_FOLLOW      = 0.18; // per-frame lerp factor for the ring position

function setupVariableProximity(targets, {
  fromWeight = 100,
  toWeight   = 900,
} = {}) {
  const list = (Array.isArray(targets) ? targets : [{ el: targets }])
    .map(tgt => ({
      fromWeight, toWeight, ...tgt,
      spans: [...tgt.el.querySelectorAll('.vo-blur-word')],
    }));

  // Visible ring that trails the cursor
  const ring = document.createElement('div');
  ring.className = 'vo-cursor-ring';
  ring.style.width = ring.style.height = `${FX_RING_RADIUS * 2}px`;
  _overlay.appendChild(ring);

  const mouse  = { x: 0, y: 0 };
  const cursor = { x: 0, y: 0 };
  let hasMouse = false;

  function onMove(e) {
    if (!hasMouse) { cursor.x = e.clientX; cursor.y = e.clientY; }
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    hasMouse = true;
  }
  function onLeave() {
    hasMouse = false;
    ring.classList.remove('vo-cursor-ring--on');
    _titleFish?.clearCohesionPointer();
  }
  window.addEventListener('mousemove', onMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  window.addEventListener('blur', onLeave);

  let raf = requestAnimationFrame(function frame() {
    raf = requestAnimationFrame(frame);
    if (!hasMouse) return;

    cursor.x += (mouse.x - cursor.x) * FX_FOLLOW;
    cursor.y += (mouse.y - cursor.y) * FX_FOLLOW;
    ring.style.transform = `translate(${cursor.x - FX_RING_RADIUS}px, ${cursor.y - FX_RING_RADIUS}px)`;
    ring.classList.add('vo-cursor-ring--on');
    _titleFish?.setCohesionPointer(cursor.x, cursor.y, true);

    for (const { el, fromWeight: fw, toWeight: tw, spans } of list) {
      if (!el.isConnected) continue;
      for (const span of spans) {
        const st = span._fx ?? (span._fx = { w: fw, tx: 0, ty: 0 });
        const r  = span.getBoundingClientRect();
        // subtract our own offset → resting center (no feedback loop)
        const dx   = (r.left + r.width  / 2 - st.tx) - cursor.x;
        const dy   = (r.top  + r.height / 2 - st.ty) - cursor.y;
        const dist = Math.hypot(dx, dy) || 1;

        let wT = fw, txT = 0, tyT = 0;
        if (dist <= FX_RING_RADIUS) {
          // sqrt easing — snappier swell near the center
          wT = fw + (tw - fw) * Math.sqrt(1 - dist / FX_RING_RADIUS);
        } else if (dist < FX_RING_RADIUS * FX_PUSH_REACH) {
          // arch-shaped wave: 0 at the ring edge → peak → 0 at the outer reach
          const t    = (dist - FX_RING_RADIUS) / (FX_RING_RADIUS * (FX_PUSH_REACH - 1));
          const push = FX_MAX_PUSH * Math.sin(Math.PI * (1 - t));
          txT = (dx / dist) * push;
          tyT = (dy / dist) * push;
        }

        st.w  += (wT  - st.w)  * FX_DAMP;
        st.tx += (txT - st.tx) * FX_DAMP;
        st.ty += (tyT - st.ty) * FX_DAMP;

        span.style.fontVariationSettings = `'wght' ${Math.round(st.w)}`;
        // Wait for the blur-in animation to release its transform first
        if (span.dataset.fxSettled) {
          span.style.transform = `translate(${st.tx.toFixed(2)}px, ${st.ty.toFixed(2)}px)`;
        }
      }
    }
  });

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('blur', onLeave);
    _titleFish?.clearCohesionPointer();
    ring.remove();
  };
}
// Splits an element's existing text (preserving <br> and nested elements) into
// staggered blur-in spans — letters or words — for the BlurText entrance.
function blurSplitElement(el, {
  delay      = 40,        // ms between each segment
  animateBy  = 'letters',
  direction  = 'bottom',
  baseWeight = null,      // idle 'wght' — matches the proximity floor
} = {}) {
  const dirClass = direction === 'top' ? 'vo-blur--from-top' : 'vo-blur--from-bottom';
  let i = 0;
  const makeSpan = (content) => {
    const span = document.createElement('span');
    span.className = `vo-blur-word ${dirClass}`;
    span.style.animationDelay = `${i * delay}ms`;
    if (baseWeight != null) span.style.fontVariationSettings = `'wght' ${baseWeight}`;
    span.textContent = content;
    // Once the blur-in ends, release the CSS animation (fill:forwards would
    // otherwise override inline transforms) so the push effect can take over.
    span.addEventListener('animationend', () => {
      span.style.animation = 'none';
      span.style.opacity   = '1';
      // Pin the settled position. Without this the class's base
      // transform (translateY(±30px)) takes over the moment the
      // animation is released, and the text sits 30px off until the
      // proximity loop writes a transform — which it never does until
      // the mouse first moves. Booth projector / VR = no mouse = stuck.
      span.style.transform = 'translate(0px, 0px)';
      span.dataset.fxSettled = '1';
    }, { once: true });
    i++;
    return span;
  };
  const process = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const frag = document.createDocumentFragment();
      if (animateBy === 'words') {
        for (const seg of node.textContent.split(/(\s+)/)) {
          if (!seg) continue;
          if (/^\s+$/.test(seg)) frag.appendChild(document.createTextNode(' '));
          else frag.appendChild(makeSpan(seg));
        }
      } else {
        // Collapse template indentation, trim edges, keep in-word spaces as nbsp
        const chars = [...node.textContent.replace(/\s+/g, ' ')];
        while (chars[0] === ' ') chars.shift();
        while (chars.at(-1) === ' ') chars.pop();
        for (const ch of chars) frag.appendChild(makeSpan(ch === ' ' ? '\u00a0' : ch));
      }
      node.replaceWith(frag);
    } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
      [...node.childNodes].forEach(process);
    }
  };
  [...el.childNodes].forEach(process);
}

// Scans the current screen for [data-fx] elements: splits their text into
// blur-in spans and wires the shared ring-cursor effect for all of them.
// data-fx        = 'letters' | 'words'
// data-fx-dir    = 'top' | 'bottom'         (default bottom)
// data-fx-delay  = stagger ms               (default 40 letters / 18 words)
// data-fx-from / data-fx-to = weight range inside the ring
function applyTextFx() {
  if (_proximityCleanup) { _proximityCleanup(); _proximityCleanup = null; }
  const targets = [];
  _overlay.querySelectorAll('[data-fx]').forEach(el => {
    const animateBy  = el.dataset.fx === 'words' ? 'words' : 'letters';
    const fromWeight = Number(el.dataset.fxFrom ?? 350);
    blurSplitElement(el, {
      animateBy,
      delay:      Number(el.dataset.fxDelay ?? (animateBy === 'words' ? 18 : 40)),
      direction:  el.dataset.fxDir ?? 'bottom',
      baseWeight: fromWeight,
    });
    targets.push({
      el,
      fromWeight,
      toWeight: Number(el.dataset.fxTo ?? 800),
    });
  });
  if (targets.length) _proximityCleanup = setupVariableProximity(targets);
}
function nl2br(str) {
  return String(str).replace(/\n/g, '<br>');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = (s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
}

// ── Dev skip ───────────────────────────────────────────────────────────────
function devSkip() {
  switch (_screen) {
    case 'TITLE':    { _levelIndex = 0; _lockedTraits.clear(); _lineage = []; _playerTraits = { ...TRAIT_DEFAULTS }; startLevel(); break; }
    case 'CUTSCENE': openTuning(); break;
    case 'TUNING':   confirmTuning(); break;
    case 'RUNNING':  endRun(); break;
    case 'VERDICT':  advanceLevel(); break;
    case 'INHERIT':  startLevel(); break;
    case 'END':      go('TITLE'); break;
    case 'SETTINGS':
    case 'CONCEPT':
    case 'CREDITS':  go('TITLE'); break;
  }
}

// ── Mount ──────────────────────────────────────────────────────────────────
export function mountVisitorMode() {
  const app = document.getElementById('app');
  _overlay = document.createElement('div');
  _overlay.id = 'visitor-overlay';
  _overlay.dataset.screen = _screen;
  app.appendChild(_overlay);

  render();

  window.addEventListener('keydown', (e) => {
    if (_screen === 'RUNNING' && _runSkipRevealed && e.key === ' ') {
      e.preventDefault();
      endRun();
      return;
    }
    if (e.code !== 'Backslash') return;
    devSkip();
  }, { capture: true });

  window.addEventListener('keyup', (e) => {
    // intentionally empty — TimeShortcutController handles its own keyup
  }, { capture: true });

  // Dev hook: jump straight to a level's cutscene without playing the
  // rounds before it. Lets 三金 preview L2/L3 dressing and copy in two
  // seconds instead of 2.5 minutes. Console: downstream.cutscene(1)
  window.downstream = {
    // Goes through go() on purpose: it tears down the previous screen's
    // proximity loop. Rendering directly leaves the blur-in spans stuck
    // at their translateY(30px) start offset.
    cutscene(index) {
      _levelIndex = Math.max(0, Math.min(LEVEL_CONFIGS.length - 1, index));
      go('CUTSCENE');
    },
    // Preview a verdict screen with fake stats — lets copy be judged
    // without playing a full round. downstream.verdict(1, true)
    verdict(index, won = true) {
      _levelIndex = Math.max(0, Math.min(LEVEL_CONFIGS.length - 1, index));
      _lastVerdict = won
        ? { won: true,  survivalRatio: 0.72, eaten: 4,  starved: 3 }
        : { won: false, survivalRatio: 0.18, eaten: 12, starved: 9 };
      go('VERDICT');
    },
    setLang(lang) { _lang = lang; go(_screen, null); },
  };
}
