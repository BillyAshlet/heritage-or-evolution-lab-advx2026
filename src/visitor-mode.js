// visitor-mode.js — state machine and overlay UI for visitor mode.
// Visual styling lives in visitor.css.
// Simulation wiring goes through window.experiment + direct param imports.

import {
  TRAITS,
  PREDATOR_PARAMS,
  ENERGY_PARAMS,
} from './evolution-model.js';

// ── Background config ──────────────────────────────────────────────────────
// null  = Three.js canvas shows through (default)
// string = path to a video (.mp4/.webm) or image file
const TITLE_BG = '/output/video/inheritance-lab-loop.mp4';

// Per-level cutscene backgrounds, indexed by level (L1/L2/L3).
// 三金 fills L2/L3 here — same rule: null = canvas shows through.
const LEVEL_BG = [
  '/output/video/predator-shadow-loop.mp4',
  null,
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
// Stub values — fill in after parameter tuning is done.
const LEVEL_CONFIGS = [
  { id: 'L1', predatorCount: 1, drainMultiplier: 1.0, duration: 60, winThreshold: 0.50 },
  { id: 'L2', predatorCount: 3, drainMultiplier: 2.0, duration: 90, winThreshold: 0.45 },
  { id: 'L3', predatorCount: 0, drainMultiplier: 1.2, duration: 90, winThreshold: 0.50 },
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
        inherit: '你在这一局改变了选择。\n这些参数将在下一局被永久锁定。',
        cta: '调整参数 →',
      },
      {
        title: '第二局 · 资源匮乏',
        story: '掠食者更多了，食物却更少了。\n你上一局的选择已经封印——\n现在，用剩下的自由做出新的判断。',
        inherit: '两局的选择，已经成为下一代的起点。\n第三局的世界里，有一群和你一模一样的鱼。',
        cta: '调整参数 →',
      },
      {
        title: '第三局 · 镜中人',
        story: '这群鱼和你的鱼一模一样——\n它们继承了你在上一局结束时的所有选择。\n你现在面对的，是你自己的遗产。',
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
        inherit: 'Your choices this round are now sealed.\nThey will be locked in the next round.',
        cta: 'Adjust Traits →',
      },
      {
        title: 'Round 2 · Scarce',
        story: 'More predators. Less food.\nYour previous choices are locked in—\nuse what freedom remains to adapt.',
        inherit: 'Two rounds of choices, fixed forever.\nIn Round 3, you will meet fish just like yours.',
        cta: 'Adjust Traits →',
      },
      {
        title: 'Round 3 · Mirror',
        story: 'These fish are identical to yours—\nthey carry every choice you made last round.\nYou are now facing your own legacy.',
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
  _screen = nextScreen;
  _overlay.dataset.screen = nextScreen;
  render();

  if (!dir || _sweeping || !SWEEP_SCREENS.has(nextScreen)) return;
  const el = _overlay.firstElementChild;
  if (!el) return;
  _sweeping = true;
  el.classList.add(`vo-sweep-reveal--${dir}`);
  el.addEventListener('animationend', () => {
    el.classList.remove('vo-sweep-reveal--cw', 'vo-sweep-reveal--ccw');
    _sweeping = false;
  }, { once: true });
}

function startLevel() {
  _traitsOnEntry = { ...TRAIT_DEFAULTS };   // compare against neutral baseline
  resetSimForLevel();
  go('CUTSCENE');
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
    go('INHERIT');
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
  const bgHtml = bgMarkup(TITLE_BG, 'vo-title__bg');

  // r=85, circumference ≈ 534 — show ~40% of the arc
  const C = 2 * Math.PI * 85;
  const arcLen  = (C * 0.40).toFixed(1);
  const gapLen  = (C * 0.60).toFixed(1);

  _overlay.innerHTML = `
    <div class="vo-screen vo-title">
      ${bgHtml}
      <div class="vo-title__lang">
        <button class="vo-btn vo-btn--${_lang === 'zh' ? 'active' : 'ghost'} vo-lang-btn" data-lang="zh">中</button>
        <button class="vo-btn vo-btn--${_lang === 'en' ? 'active' : 'ghost'} vo-lang-btn" data-lang="en">EN</button>
      </div>
      <div class="vo-title__hero">
        <h1 class="vo-title__name"></h1>
        <p class="vo-title__sub">${t('subtitle')}</p>
      </div>
      <div class="vo-title__nav">
        <div class="vo-title__side vo-title__side--left">
          <button class="vo-btn vo-btn--ghost" data-action="settings">${t('settings')}</button>
        </div>
        <div class="vo-title__center">
          <div class="vo-title__ring-wrap">
            <svg class="vo-title__ring" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <circle class="vo-ring-track" cx="100" cy="100" r="85" />
              <circle class="vo-ring-arc"   cx="100" cy="100" r="85"
                stroke-dasharray="${arcLen} ${gapLen}" />
            </svg>
          </div>
          <button class="vo-btn vo-btn--primary vo-title__start" data-action="start">
            ${t('start')}
          </button>
        </div>
        <div class="vo-title__side vo-title__side--right">
          <button class="vo-btn vo-btn--ghost" data-action="concept">${t('concept')}</button>
          <button class="vo-btn vo-btn--ghost" data-action="credits">${t('credits')}</button>
        </div>
      </div>
    </div>
  `;

  // Animate all title-screen text in, then attach variable proximity to each
  if (_proximityCleanup) { _proximityCleanup(); _proximityCleanup = null; }
  const proxTargets = [];

  const titleEl = _overlay.querySelector('.vo-title__name');
  blurTextAnimate(titleEl, t('title'), { delay: 60, animateBy: 'letters', direction: 'top' });
  proxTargets.push({ el: titleEl, fromWeight: 100, toWeight: 900, radius: 180 });

  const subEl = _overlay.querySelector('.vo-title__sub');
  blurTextAnimate(subEl, t('subtitle'), { delay: 35, animateBy: 'letters', direction: 'bottom' });
  proxTargets.push({ el: subEl, fromWeight: 200, toWeight: 800, radius: 130 });

  _overlay.querySelectorAll('.vo-title__nav .vo-btn').forEach(btn => {
    blurTextAnimate(btn, btn.textContent.trim(), { delay: 40, animateBy: 'letters', direction: 'bottom' });
    proxTargets.push({ el: btn, fromWeight: 350, toWeight: 800, radius: 110 });
  });

  _proximityCleanup = setupVariableProximity(proxTargets);

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
        <button class="vo-btn vo-btn--back" data-action="back">← ${t('back')}</button>
        <h2>${t('settings')}</h2>
      </header>
      <div class="vo-subscreen__body">
        <div class="vo-settings__row">
          <span>${t('language')}</span>
          <div class="vo-lang-toggle">
            <button class="vo-btn ${_lang === 'zh' ? 'vo-btn--active' : 'vo-btn--ghost'}" data-lang="zh">中文</button>
            <button class="vo-btn ${_lang === 'en' ? 'vo-btn--active' : 'vo-btn--ghost'}" data-lang="en">EN</button>
          </div>
        </div>
      </div>
    </div>
  `;
  _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'cw');
  _overlay.querySelectorAll('[data-lang]').forEach(btn => {
    btn.onclick = () => { _lang = btn.dataset.lang; renderSettings(); };
  });
}

function renderConcept() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-subscreen">
      <header class="vo-subscreen__header">
        <button class="vo-btn vo-btn--back" data-action="back">← ${t('back')}</button>
        <h2>${t('conceptTitle')}</h2>
      </header>
      <div class="vo-subscreen__body">
        <p class="vo-body-text">${nl2br(t('conceptBody'))}</p>
      </div>
    </div>
  `;
  _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'ccw');
}

function renderCredits() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-subscreen">
      <header class="vo-subscreen__header">
        <button class="vo-btn vo-btn--back" data-action="back">← ${t('back')}</button>
        <h2>${t('creditsTitle')}</h2>
      </header>
      <div class="vo-subscreen__body">
        <p class="vo-body-text">${nl2br(t('creditsBody'))}</p>
      </div>
    </div>
  `;
  _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'ccw');
}

function renderCutscene() {
  const backBtn = _levelIndex === 0
    ? `<button class="vo-btn vo-btn--back vo-cutscene__back" data-action="back">← ${t('back')}</button>`
    : '';

  const bgHtml = bgMarkup(LEVEL_BG[_levelIndex], 'vo-cutscene__bg');

  _overlay.innerHTML = `
    <div class="vo-screen vo-cutscene ${bgHtml ? 'vo-cutscene--media' : ''}" data-level="${_levelIndex}">
      ${bgHtml}
      ${backBtn}
      <div class="vo-cutscene__content">
        <p class="vo-cutscene__level-tag">0${_levelIndex + 1} / 03</p>
        <h2 class="vo-cutscene__title">${levelT('title')}</h2>
        <p class="vo-cutscene__story">${nl2br(levelT('story'))}</p>
      </div>
      <button class="vo-btn vo-btn--primary vo-cutscene__cta" data-action="continue">
        ${levelT('cta')}
      </button>
    </div>
  `;
  _overlay.querySelector('[data-action="continue"]').onclick = openTuning;
  if (_levelIndex === 0) {
    _overlay.querySelector('[data-action="back"]').onclick = () => go('TITLE', 'ccw');
  }
}

function renderTuning() {
  const traitKeys = ['speed', 'size', 'stamina'];
  const slidersHtml = traitKeys.map(key => {
    const locked = _lockedTraits.has(key);
    return `
      <div class="vo-trait ${locked ? 'vo-trait--locked' : ''}" data-trait="${key}">
        <div class="vo-trait__header">
          <span class="vo-trait__name">${t('traits.' + key)}</span>
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
        <p class="vo-trait__hint">${t('traitHints.' + key)}</p>
      </div>
    `;
  }).join('');

  _overlay.innerHTML = `
    <div class="vo-tuning" data-level="${_levelIndex}">
      <div class="vo-tuning__header">
        <span class="vo-level-tag">0${_levelIndex + 1} / 03</span>
        <h2 class="vo-tuning__title">${levelT('title')}</h2>
        <span class="vo-preview-badge">${t('preview')}</span>
      </div>
      <div class="vo-traits">${slidersHtml}</div>
      <button class="vo-btn vo-btn--primary vo-tuning__confirm" data-action="confirm">
        ${t('confirm')}
      </button>
    </div>
  `;

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

  _overlay.innerHTML = `
    <div class="vo-screen vo-verdict ${v.won ? 'vo-verdict--win' : 'vo-verdict--lose'}">
      <div class="vo-verdict__result">${v.won ? t('win') : t('lose')}</div>
      <div class="vo-verdict__stats">
        <div class="vo-stat">
          <span class="vo-stat__value">${pct}%</span>
          <span class="vo-stat__label">${t('survived')}</span>
        </div>
        <div class="vo-stat">
          <span class="vo-stat__value">${v.eaten}</span>
          <span class="vo-stat__label">${t('eaten')}</span>
        </div>
        <div class="vo-stat">
          <span class="vo-stat__value">${v.starved}</span>
          <span class="vo-stat__label">${t('starved')}</span>
        </div>
      </div>
      <button class="vo-btn vo-btn--primary" data-action="next">
        ${isLast ? t('finish') : t('nextRound')} →
      </button>
    </div>
  `;
  _overlay.querySelector('[data-action="next"]').onclick = advanceLevel;
}

function renderInherit() {
  const last = _lineage.at(-1);
  const lockedNames = [...(last?.changed ?? [])].map(k => t('traits.' + k)).join('、');

  _overlay.innerHTML = `
    <div class="vo-screen vo-inherit" data-level="${_levelIndex}">
      <div class="vo-inherit__content">
        <p class="vo-inherit__message">${nl2br(levelT('inherit') || '')}</p>
        ${lockedNames ? `<p class="vo-inherit__locked">${lockedNames}</p>` : ''}
      </div>
      <button class="vo-btn vo-btn--primary" data-action="next">
        ${_lang === 'zh' ? '进入下一局 →' : 'Next Round →'}
      </button>
    </div>
  `;
  _overlay.querySelector('[data-action="next"]').onclick = startLevel;
}

function renderEnd() {
  _overlay.innerHTML = `
    <div class="vo-screen vo-end">
      <div class="vo-end__content">
        <h2 class="vo-end__title">${t('endTitle')}</h2>
        <p class="vo-end__body">${nl2br(t('endBody'))}</p>
      </div>
      <button class="vo-btn vo-btn--ghost" data-action="restart">${t('restart')}</button>
    </div>
  `;
  _overlay.querySelector('[data-action="restart"]').onclick = () => go('TITLE', 'ccw');
}

// ── Utils ──────────────────────────────────────────────────────────────────
// Variable font weight driven by mouse proximity (replicates Variable Proximity effect).
// Each letter span's 'wght' axis is interpolated: fromWeight (far) → toWeight (near cursor).
// Accepts one element or an array of { el, fromWeight, toWeight, radius } targets.
function setupVariableProximity(targets, {
  fromWeight = 100,
  toWeight   = 900,
  radius     = 180,   // px — effect reach
} = {}) {
  const list = (Array.isArray(targets) ? targets : [{ el: targets }])
    .map(tgt => ({ fromWeight, toWeight, radius, ...tgt }));

  function onMove(e) {
    for (const { el, fromWeight: fw, toWeight: tw, radius: rad } of list) {
      if (!el.isConnected) continue;
      el.querySelectorAll('.vo-blur-word').forEach(span => {
        const r = span.getBoundingClientRect();
        const dist = Math.hypot(
          e.clientX - (r.left + r.width  / 2),
          e.clientY - (r.top  + r.height / 2)
        );
        const proximity = Math.max(0, 1 - dist / rad);
        // sqrt easing — feels more snappy near the cursor
        const w = Math.round(fw + (tw - fw) * Math.sqrt(proximity));
        span.style.fontVariationSettings = `'wght' ${w}`;
      });
    }
  }
  window.addEventListener('mousemove', onMove);
  return () => window.removeEventListener('mousemove', onMove);
}
// Splits text into word/letter spans, each with a staggered animation-delay.
function blurTextAnimate(el, text, {
  delay     = 150,   // ms between each word
  animateBy = 'words',
  direction = 'top',
} = {}) {
  const segments = animateBy === 'words' ? text.split(' ') : text.split('');
  const dirClass = direction === 'top' ? 'vo-blur--from-top' : 'vo-blur--from-bottom';
  el.innerHTML = segments.map((seg, i) => {
    const spacer = (animateBy === 'words' && i < segments.length - 1) ? ' ' : '';
    return `<span class="vo-blur-word ${dirClass}" style="animation-delay:${i * delay}ms">${
      seg === ' ' ? ' ' : seg
    }${spacer}</span>`;
  }).join('');
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
}
