/**
 * 教学关 UI —— 实验室白。
 *
 * 视觉方向由 .claude/skills/downstream-design 定义，这里是它的落地。
 * 两条最要紧的：
 *
 * 1. **光线本身就是叙事。** 正式关卡是深水（#071426 一路到 #111c28），
 *    教学关是高调的实验室白。玩家从教学关跨进第一代时光线沉下去，
 *    那一下不需要任何文字解释 —— 安全试验是可复原的，第一代不是。
 *
 * 2. **这是实验装置，不是参数面板。** 这一课没有指标、没有输赢，玩家
 *    只负责看见。所以屏上常驻的只有一个控件、一条刻度、一句状态；
 *    具体数值收进悬停里 —— 读数是查阅出来的，不是一直杵在那儿的。
 *
 * 排版刻意做成【上下分区】而不是浮层：装置的样子是标本区和控制区各占
 * 各的地方。缸体比例改成 2.4 就是为了给底部条带腾出空水（见
 * tutorial-mode.js 的 tank 注释），而不是让面板压在鱼身上。
 * 另有两级让路：折叠收成细带（刻度与状态仍在，仍可调），H 键连它一起
 * 全隐藏 —— 后者是给录屏用的。
 */

import {
  RELATION_COPY,
  t,
  tutorialRelation,
  tutorialSizeRatio,
} from './tutorial-mode.js';

const STYLE_ID = 'tutorial-ui-style';

/* 实验室白。中性色带一点青绿偏色 —— 纯灰会显得没被选过。 */
const CSS = `
#tutorial-ui {
  --t-bg: #eef1f0;
  --t-raise: #f7f9f8;
  --t-ink: #16211f;
  --t-dim: #6d7c7a;
  --t-line: #c3cccb;
  --t-tick: #aab5b4;
  --t-eaten: #8b5f5c;
  --t-eaten-band: #e0d3d1;
  --t-peer-band: #e3e7e6;
  --t-eat: #1f6d4e;
  --t-eat-band: #cfdcd4;
  --t-amber: #c4892a;
  /* 连续刻度的两端与中点。沿用 T1 的语义色，做过 T1 的玩家直接读得懂。 */
  --t-slow: #b98a86;
  --t-neutral: #9aa7a4;
  --t-fast: #6aa98c;
  --t-now: #9aa7a4;

  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 40;
  background: var(--t-bg);
  border-top: 1px solid var(--t-line);
  color: var(--t-ink);
  font-family: 'Roboto Flex', system-ui, 'PingFang SC', sans-serif;
  font-variation-settings: 'wght' 300;
}
#tutorial-ui[hidden] { display: none; }
#app[data-ui-hidden="1"] #tutorial-ui { display: none !important; }

#tutorial-ui .t-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 16px clamp(18px, 4vw, 40px) 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

#tutorial-ui .t-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
#tutorial-ui .t-titles { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
#tutorial-ui .t-eyebrow {
  font-size: clamp(0.62rem, 1.1vw, 0.72rem);
  font-variation-settings: 'wght' 200;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--t-dim);
}
#tutorial-ui .t-title {
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  font-variation-settings: 'wght' 260;
  letter-spacing: -0.035em;
  line-height: 1;
}
#tutorial-ui .t-brief {
  margin: 0;
  max-width: 62ch;
  font-size: clamp(0.82rem, 1.3vw, 0.94rem);
  color: var(--t-dim);
  line-height: 1.55;
}
#tutorial-ui .t-hint {
  margin: 0;
  padding-left: 10px;
  border-left: 2px solid var(--t-line);
  font-size: clamp(0.74rem, 1.1vw, 0.82rem);
  color: var(--t-dim);
}
#tutorial-ui .t-corner { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

#tutorial-ui button {
  font-family: inherit;
  color: var(--t-dim);
  background: none;
  border: 1px solid var(--t-line);
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
}
#tutorial-ui button:hover { color: var(--t-ink); border-color: var(--t-ink); }
#tutorial-ui button:focus-visible { outline: 2px solid var(--t-amber); outline-offset: 2px; }

#tutorial-ui .t-lang { display: flex; }
#tutorial-ui .t-lang button {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  padding: 6px 10px;
}
#tutorial-ui .t-lang button + button { border-left: none; }
#tutorial-ui .t-lang button[aria-pressed="true"] {
  color: var(--t-raise);
  background: var(--t-ink);
  border-color: var(--t-ink);
}
#tutorial-ui .t-fold {
  font-size: 0.72rem;
  letter-spacing: 0.14em;
  padding: 6px 10px;
  text-transform: uppercase;
}

#tutorial-ui .t-rule-row { display: flex; align-items: center; gap: clamp(12px, 2vw, 22px); }
#tutorial-ui .t-rule-label {
  font-size: clamp(0.62rem, 1.1vw, 0.72rem);
  font-variation-settings: 'wght' 200;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--t-dim);
  white-space: nowrap;
}
#tutorial-ui .t-rule { position: relative; flex: 1; height: 46px; touch-action: none; }
#tutorial-ui .t-bands {
  position: absolute; left: 0; right: 0; top: 15px; height: 10px;
  display: flex; overflow: hidden;
}
#tutorial-ui .t-bands span { display: block; height: 100%; }
#tutorial-ui .t-band-eaten { background: var(--t-eaten-band); }
#tutorial-ui .t-band-peer  { background: var(--t-peer-band); }
#tutorial-ui .t-band-eat   { background: var(--t-eat-band); }

/* 连续刻度（T2）：不分段。
   两层叠加 —— 底层是固定的方向渐变（慢在左、快在右，这是"地图"），
   上层是按当前位置采样出的单色，整条因此随位置改变色调（这是"状态"）。
   地图不动、状态在动，两件事分开表达。 */
#tutorial-ui .t-gradient {
  position: absolute; left: 0; right: 0; top: 15px; height: 10px;
  background:
    linear-gradient(90deg, var(--t-now) 0%, var(--t-now) 100%),
    linear-gradient(90deg, var(--t-slow) 0%, var(--t-neutral) 50%, var(--t-fast) 100%);
  background-blend-mode: normal;
  transition: background 160ms ease;
}
#tutorial-ui .t-gradient::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--t-slow), var(--t-neutral), var(--t-fast));
  opacity: 0.45;
}
/* 中点刻度：唯一一条线，标的是"与对手同速"这个客观事实，不是阈值。 */
#tutorial-ui .t-midtick {
  position: absolute; top: 11px; width: 1px; height: 18px;
  background: var(--t-ink); opacity: 0.35; transform: translateX(-50%);
  pointer-events: none;
}
#tutorial-ui .t-midlabel {
  position: absolute; top: 31px;
  font-size: 0.6rem;
  font-variation-settings: 'wght' 200;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--t-dim); transform: translateX(-50%);
  white-space: nowrap; pointer-events: none;
}

#tutorial-ui .t-ticks { position: absolute; left: 0; right: 0; top: 15px; height: 10px; }
#tutorial-ui .t-ticks i { position: absolute; top: 0; width: 1px; height: 100%; background: var(--t-tick); }

#tutorial-ui .t-zone {
  position: absolute; top: 29px;
  font-size: 0.64rem;
  font-variation-settings: 'wght' 200;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}
#tutorial-ui .t-zone[data-tone="eaten"] { color: var(--t-eaten); }
#tutorial-ui .t-zone[data-tone="peer"]  { color: var(--t-dim); }
#tutorial-ui .t-zone[data-tone="eat"]   { color: var(--t-eat); }

#tutorial-ui .t-cursor {
  position: absolute; top: 6px; width: 2px; height: 28px;
  background: var(--t-ink); transform: translateX(-50%); pointer-events: none;
}
#tutorial-ui .t-cursor::before {
  content: ""; position: absolute; left: 50%; top: -6px;
  width: 10px; height: 10px; background: var(--t-ink);
  transform: translateX(-50%) rotate(45deg);
}
/* 原生 range 铺满整条轨道负责输入；视觉全部由上面那几层承担。 */
#tutorial-ui .t-rule input[type="range"] {
  position: absolute; inset: 0; width: 100%; height: 100%;
  margin: 0; opacity: 0; cursor: ew-resize;
}

#tutorial-ui .t-readout {
  position: absolute; bottom: 52px; transform: translateX(-50%);
  background: var(--t-raise); border: 1px solid var(--t-line);
  padding: 10px 14px;
  display: flex; gap: 18px; align-items: flex-end;
  white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 130ms ease;
}
#tutorial-ui .t-rule:hover .t-readout,
#tutorial-ui .t-rule:focus-within .t-readout { opacity: 1; }
#tutorial-ui .t-cell { display: flex; flex-direction: column; gap: 3px; }
#tutorial-ui .t-cell b {
  font-size: 0.6rem;
  font-variation-settings: 'wght' 200;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--t-dim);
}
#tutorial-ui .t-cell u {
  text-decoration: none;
  font-size: 1.05rem;
  font-variant-numeric: tabular-nums;
}

#tutorial-ui .t-foot { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
#tutorial-ui .t-state { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
#tutorial-ui .t-state b {
  font-size: clamp(0.62rem, 1.1vw, 0.72rem);
  font-variation-settings: 'wght' 200;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--t-dim);
}
#tutorial-ui .t-state strong {
  font-size: clamp(1.05rem, 2vw, 1.3rem);
  font-variation-settings: 'wght' 300;
  letter-spacing: 0.02em;
}
#tutorial-ui .t-state[data-tone="eaten"] strong { color: var(--t-eaten); }
#tutorial-ui .t-state[data-tone="peer"]  strong { color: var(--t-dim); }
#tutorial-ui .t-state[data-tone="eat"]   strong { color: var(--t-eat); }

/* 分缸暂停。两个缸同时在追逐时观察者应接不暇，而这一课的意义就是"看清"。
   按下的那一半用实底表示"这半停住了"，与语言开关的选中态同一套视觉。 */
#tutorial-ui .t-pause { display: flex; gap: 8px; }
#tutorial-ui .t-pause button {
  font-size: clamp(0.68rem, 1.1vw, 0.76rem);
  letter-spacing: 0.1em;
  padding: 7px 12px;
}
#tutorial-ui .t-pause button[aria-pressed="true"] {
  color: var(--t-raise);
  background: var(--t-ink);
  border-color: var(--t-ink);
}

#tutorial-ui .t-acts { display: flex; gap: 10px; flex-shrink: 0; }
#tutorial-ui .t-acts button {
  font-size: clamp(0.72rem, 1.2vw, 0.82rem);
  letter-spacing: 0.1em;
  padding: 9px 16px;
}
/* 唯一的主行动号召：全场最重的字重、最宽的字距、一层琥珀辉光。
   一屏只该有一个这样的东西（见 downstream-design）。 */
#tutorial-ui .t-acts button.t-primary {
  font-variation-settings: 'wght' 550;
  letter-spacing: 0.34em;
  padding-right: 12px;
  color: var(--t-ink);
  border-color: var(--t-ink);
  text-shadow: 0 0 18px rgba(196, 137, 42, 0.4);
}

/* 折叠：收成细带，刻度与状态仍在，仍可调。 */
#tutorial-ui[data-folded="1"] .t-titles,
#tutorial-ui[data-folded="1"] .t-hint,
#tutorial-ui[data-folded="1"] .t-acts { display: none; }
#tutorial-ui[data-folded="1"] .t-inner { padding-top: 8px; padding-bottom: 10px; gap: 6px; }
#tutorial-ui[data-folded="1"] .t-head { justify-content: flex-end; }
#tutorial-ui[data-folded="1"] .t-rule { height: 40px; }

/* 当前所在的区间轻微加深 —— 不是装饰动画，是"你在这一段里"的状态反馈。
   之前只有游标在动，区间条和标签是死的，玩家得自己把游标位置和区间对上。 */
#tutorial-ui .t-bands span { transition: filter 140ms ease; }
#tutorial-ui .t-bands span[data-active="1"] { filter: brightness(0.9) saturate(1.25); }
#tutorial-ui .t-zone { transition: color 140ms ease, font-variation-settings 140ms ease; }
#tutorial-ui .t-zone[data-active="1"] { font-variation-settings: 'wght' 420; }

/* 中文收字距。downstream-design 里写着：拉丁小标签的 0.22em 放到中文上
   会散架，因为中文本来就是等宽方块、字间已经有天然间隙。同理 uppercase
   对中文无意义（中文没有大小写），层级只能靠字号和颜色补回来。 */
#tutorial-ui[data-lang="zh"] :is(.t-eyebrow, .t-rule-label, .t-zone, .t-cell b, .t-state b) {
  letter-spacing: 0.08em;
}
#tutorial-ui[data-lang="zh"] .t-title { letter-spacing: 0; }
#tutorial-ui[data-lang="zh"] .t-acts button { letter-spacing: 0.04em; }
#tutorial-ui[data-lang="zh"] .t-acts button.t-primary {
  letter-spacing: 0.18em;
  padding-right: 16px;
}

@media (prefers-reduced-motion: reduce) {
  #tutorial-ui .t-readout,
  #tutorial-ui button { transition: none; }
}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

const UI_COPY = {
  size: { en: 'Size', zh: '体型' },
  you: { en: 'You', zh: '你的体型' },
  grey: { en: 'Grey', zh: '灰鱼' },
  ratio: { en: 'Ratio', zh: '体型比' },
  result: { en: 'Result', zh: '结果' },
  sameSpeed: { en: 'Same speed', zh: '与对手同速' },
  faster: { en: 'Faster', zh: '比对手快' },
  slower: { en: 'Slower', zh: '比对手慢' },
  matched: { en: 'Matched', zh: '同速' },
  bigFish: { en: 'Big fish', zh: '大鱼' },
  smallFish: { en: 'Small fish', zh: '小鱼' },
  pauseTop: { en: 'Pause top', zh: '暂停上缸' },
  pauseBottom: { en: 'Pause bottom', zh: '暂停下缸' },
  resumeTop: { en: 'Resume top', zh: '继续上缸' },
  resumeBottom: { en: 'Resume bottom', zh: '继续下缸' },
  rerun: { en: 'Re-run', zh: '重新开始' },
  understood: { en: 'I understand', zh: '我明白了' },
  skip: { en: 'Skip', zh: '跳过教学' },
  fold: { en: 'Fold', zh: '收起' },
  unfold: { en: 'Unfold', zh: '展开' },
};

/** 两个 #rrggbb 之间线性插值。用于把"你比对手快多少"变成一个色调。 */
function mixHex(from, to, ratio) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [a, b] = [parse(from), parse(to)];
  const k = Math.min(1, Math.max(0, ratio));
  return (
    '#' +
    a
      .map((channel, i) =>
        Math.round(channel + (b[i] - channel) * k)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  );
}

const SCALE_COLORS = { slow: '#b98a86', neutral: '#9aa7a4', fast: '#6aa98c' };

function toPercent(spec, value) {
  const { min, max } = spec.slider;
  return ((value - min) / (max - min)) * 100;
}

export class TutorialUI {
  constructor({
    spec,
    language = 'en',
    onValueChange,
    onPauseChange,
    onReset,
    onNext,
    onExit,
    onLanguageChange,
  } = {}) {
    ensureStyle();
    this.spec = spec;
    this.language = language === 'zh' ? 'zh' : 'en';
    this.callbacks = { onValueChange, onReset, onNext, onExit, onLanguageChange, onPauseChange };
    this.value = spec.slider.initial;
    this.folded = false;
    this.paused = new Set();
    this.bands = spec.scaleStyle === 'gradient' ? [] : this._bands();
    this.root = this._build();
    document.getElementById('app').appendChild(this.root);
    this.render(this.value);
  }

  _text(key) {
    return t(UI_COPY[key], this.language);
  }

  /**
   * 三段区间的边界【由引擎的判定扫出来】，不写死百分比。
   * 阈值以后要是改了（k、参照鱼体型），轨道上的分段会自己跟着变，
   * 不会出现「画的和判的不一样」—— 那正是教学关最不能犯的错。
   */
  _bands() {
    const { min, max, step } = this.spec.slider;
    const marks = [];
    let previous = null;
    for (let v = min; v <= max + 1e-9; v += step) {
      const value = Number(v.toFixed(4));
      const relation = tutorialRelation(this.spec, value);
      if (relation !== previous) {
        marks.push({ relation, from: value });
        previous = relation;
      }
    }
    return marks.map((mark, index) => {
      const left = toPercent(this.spec, mark.from);
      const right =
        index === marks.length - 1
          ? 100
          : toPercent(this.spec, marks[index + 1].from);
      return { ...mark, left, width: right - left };
    });
  }

  _build() {
    const spec = this.spec;
    const { min, max, step, initial } = spec.slider;
    const root = document.createElement('section');
    root.id = 'tutorial-ui';
    root.setAttribute('aria-label', t(spec.label, this.language));

    const gradient = spec.scaleStyle === 'gradient';
    // 中点 = 与对手同速。滑块值 1.0 就是那个点。
    const midPercent = toPercent(spec, 1);
    const bandMarkup = this.bands
      .map(
        (band) =>
          `<span class="t-band-${
            RELATION_COPY[band.relation]?.tone ?? 'peer'
          }" style="width:${band.width}%"></span>`
      )
      .join('');
    const zoneMarkup = this.bands
      .map(
        (band) =>
          `<span class="t-zone" data-tone="${
            RELATION_COPY[band.relation]?.tone ?? 'peer'
          }" style="left:${band.left + band.width / 2}%"></span>`
      )
      .join('');
    const tickMarkup =
      this.bands.map((band) => `<i style="left:${band.left}%"></i>`).join('') +
      '<i style="left:100%"></i>';

    root.innerHTML = `
      <div class="t-inner">
        <div class="t-head">
          <div class="t-titles">
            <span class="t-eyebrow" id="t-eyebrow"></span>
            <h2 class="t-title" id="t-title"></h2>
            <p class="t-brief" id="t-brief"></p>
          </div>
          <div class="t-corner">
            <div class="t-lang" role="group" aria-label="Language">
              <button type="button" data-lang="en">EN</button>
              <button type="button" data-lang="zh">中</button>
            </div>
            <button type="button" class="t-fold" id="t-fold"></button>
          </div>
        </div>
        <p class="t-hint" id="t-hint"></p>
        <div class="t-rule-row">
          <span class="t-rule-label" id="t-rule-label"></span>
          <div class="t-rule">
            ${
              gradient
                ? `<div class="t-gradient"></div>
            <div class="t-midtick" style="left:${midPercent}%"></div>
            <span class="t-midlabel" id="t-midlabel" style="left:${midPercent}%"></span>`
                : `<div class="t-bands">${bandMarkup}</div>
            <div class="t-ticks">${tickMarkup}</div>
            ${zoneMarkup}`
            }
            <div class="t-cursor" id="t-cursor"></div>
            <div class="t-readout" id="t-readout">
              <div class="t-cell"><b id="t-lbl-you"></b><u id="t-you">—</u></div>
              <div class="t-cell"><b id="t-lbl-grey"></b><u id="t-grey">—</u></div>
              <div class="t-cell"><b id="t-lbl-ratio"></b><u id="t-ratio">—</u></div>
            </div>
            <input type="range" id="t-slider"
                   min="${min}" max="${max}" step="${step}" value="${initial}" />
          </div>
        </div>
        <div class="t-foot">
          ${
            spec.chambers
              ? `<div class="t-pause" role="group" id="t-pause">
            <button type="button" data-chamber="top" aria-pressed="false"></button>
            <button type="button" data-chamber="bottom" aria-pressed="false"></button>
          </div>`
              : ''
          }
          <div class="t-state" id="t-state">
            <b id="t-lbl-result"></b><strong id="t-result">—</strong>
          </div>
          <div class="t-acts">
            <button type="button" id="t-reset"></button>
            <button type="button" id="t-next" class="t-primary"></button>
            <button type="button" id="t-exit"></button>
          </div>
        </div>
      </div>
    `;

    // 拖动过程中就生效：体型是 live 应用的，构建一次配置实测 0.035ms。
    const slider = root.querySelector('#t-slider');
    slider.addEventListener('input', () => {
      this.value = Number(slider.value);
      this.render(this.value);
      this.callbacks.onValueChange?.(this.value);
    });

    root.querySelector('.t-lang').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-lang]');
      if (!button) return;
      this.setLanguage(button.dataset.lang);
      this.callbacks.onLanguageChange?.(this.language);
    });
    root.querySelector('#t-pause')?.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-chamber]');
      if (!button) return;
      this.togglePause(button.dataset.chamber);
    });
    root.querySelector('#t-fold').addEventListener('click', () => this.toggleFold());
    root.querySelector('#t-reset').addEventListener('click', () => this.callbacks.onReset?.());
    root.querySelector('#t-next').addEventListener('click', () => this.callbacks.onNext?.());
    root.querySelector('#t-exit').addEventListener('click', () => this.callbacks.onExit?.());
    return root;
  }

  setLanguage(language) {
    this.language = language === 'zh' ? 'zh' : 'en';
    this.render(this.value);
  }

  /** 从外部（点击缸体）切换暂停。UI 与仿真只有这一条同步路径。 */
  togglePause(chamber) {
    if (this.paused.has(chamber)) this.paused.delete(chamber);
    else this.paused.add(chamber);
    this.callbacks.onPauseChange?.([...this.paused]);
    this.render(this.value);
  }

  toggleFold(next = !this.folded) {
    this.folded = Boolean(next);
    this.root.dataset.folded = this.folded ? '1' : '';
    this.render(this.value);
  }

  render(value = this.value) {
    const spec = this.spec;
    const q = (id) => this.root.querySelector(id);
    // T1 的读数是体型三件套，T2 是速度三件套 —— 字段都不一样，
    // 不分流会直接读到 undefined（第一版就是这么崩的：T2 没有
    // referenceSize，render 里 .toFixed 直接抛，整个 app 启动失败）。
    const gradient = spec.scaleStyle === 'gradient';
    const ratio = gradient ? value : tutorialSizeRatio(spec, value);
    const relation = gradient ? 'peer' : tutorialRelation(spec, value);
    const copy = RELATION_COPY[relation] ?? RELATION_COPY.peer;

    this.root.dataset.lang = this.language;
    q('#t-eyebrow').textContent = t(spec.label, this.language);
    q('#t-title').textContent = t(spec.axisName, this.language);
    q('#t-brief').textContent = t(spec.brief, this.language);
    q('#t-hint').textContent = t(spec.controlHint, this.language);
    q('#t-rule-label').textContent = t(spec.axisName, this.language);
    q('#t-lbl-you').textContent = this._text('you');
    q('#t-lbl-grey').textContent = gradient
      ? this._text('bigFish')
      : this._text('grey');
    q('#t-lbl-ratio').textContent = gradient
      ? this._text('smallFish')
      : this._text('ratio');
    q('#t-lbl-result').textContent = this._text('result');
    q('#t-reset').textContent = this._text('rerun');
    q('#t-next').textContent = this._text('understood');
    q('#t-exit').textContent = this._text('skip');
    q('#t-fold').textContent = this.folded ? this._text('unfold') : this._text('fold');
    this.root.querySelectorAll('#t-pause button').forEach((button) => {
      const chamber = button.dataset.chamber;
      const held = this.paused.has(chamber);
      button.setAttribute('aria-pressed', String(held));
      const key =
        chamber === 'top'
          ? held ? 'resumeTop' : 'pauseTop'
          : held ? 'resumeBottom' : 'pauseBottom';
      button.textContent = this._text(key);
    });

    this.root.querySelectorAll('.t-zone').forEach((node, index) => {
      const band = this.bands[index];
      if (!band) return;
      node.textContent = t(
        RELATION_COPY[band.relation] ?? RELATION_COPY.peer,
        this.language
      );
    });
    this.root
      .querySelectorAll('.t-lang button')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String(button.dataset.lang === this.language)
        )
      );

    if (spec.scaleStyle === 'gradient') {
      // 色调只跟【速度】走，不对结果做任何断言 —— 玩家读到的是"我比对手
      // 快还是慢"这个自己完全控制的事实，而不是一个可能落空的预测。
      // 中点 1.0 = 与对手同速。
      const span = value >= 1 ? spec.slider.max - 1 : 1 - spec.slider.min;
      const lean = span > 0 ? Math.abs(value - 1) / span : 0;
      const target = value >= 1 ? SCALE_COLORS.fast : SCALE_COLORS.slow;
      this.root.style.setProperty(
        '--t-now',
        mixHex(SCALE_COLORS.neutral, target, lean)
      );
      const midLabel = q('#t-midlabel');
      if (midLabel) midLabel.textContent = this._text('sameSpeed');
    } else {
      const activeIndex = this.bands.findIndex(
        (band) => band.relation === relation
      );
      this.root.querySelectorAll('.t-bands span').forEach((node, index) => {
        node.dataset.active = index === activeIndex ? '1' : '';
      });
      this.root.querySelectorAll('.t-zone').forEach((node, index) => {
        node.dataset.active = index === activeIndex ? '1' : '';
      });
    }

    const percent = toPercent(spec, value);
    q('#t-cursor').style.left = `${percent}%`;
    // 读数卡贴着游标走，两端要收住，否则会被轨道边缘裁掉。
    q('#t-readout').style.left = `${Math.min(88, Math.max(12, percent))}%`;
    if (gradient) {
      // 读数直接给出「你 / 大鱼 / 小鱼」三者的速度倍率 —— 玩家在比什么，
      // 就把什么摆出来，不用他心算。
      q('#t-you').textContent = `×${value.toFixed(2)}`;
      q('#t-grey').textContent = `×${spec.rivalSpeed.top.toFixed(2)}`;
      q('#t-ratio').textContent = `×${spec.rivalSpeed.bottom.toFixed(2)}`;
    } else {
      q('#t-you').textContent = (spec.referenceSize * ratio).toFixed(2);
      q('#t-grey').textContent = spec.referenceSize.toFixed(2);
      q('#t-ratio').textContent = ratio.toFixed(2);
    }
    if (spec.scaleStyle === 'gradient') {
      const delta = Math.round((value - 1) * 100);
      q('#t-lbl-result').textContent = t(spec.axisName, this.language);
      q('#t-result').textContent =
        delta === 0
          ? this._text('matched')
          : `${this._text(delta > 0 ? 'faster' : 'slower')} ${Math.abs(delta)}%`;
      q('#t-state').dataset.tone =
        delta === 0 ? 'peer' : delta > 0 ? 'eat' : 'eaten';
    } else {
      q('#t-result').textContent = t(copy, this.language);
      q('#t-state').dataset.tone = copy.tone;
    }
  }

  setHidden(hidden) {
    this.root.hidden = Boolean(hidden);
  }

  dispose() {
    this.root.remove();
  }
}
