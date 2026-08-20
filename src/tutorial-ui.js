/**
 * 教学关 UI。
 *
 * 刻意做得比正式关卡的 UI 简陋：正式 UI 眼下的问题就是「信息太多、排版
 * 莫名其妙，很多人看了不知道要做什么」（设计者原话，UI 重做已排期）。
 * 教学关是玩家见到的第一屏，屏上每多一个数字都是一次分心，所以这里
 * 只留【一个滑块 + 三个数 + 一句状态】。
 *
 * 三个数就是「体型数值显示」：你的体型、参照鱼体型、两者之比。之所以
 * 三个都给而不是只给比值 —— 玩家在正式关卡里看到的是绝对体型，只教比值
 * 会让他回到正式关卡时对不上号。
 */

import {
  RELATION_COPY,
  tutorialRelation,
  tutorialSizeRatio,
} from './tutorial-mode.js';

const STYLE_ID = 'tutorial-ui-style';

const CSS = `
#tutorial-ui {
  position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
  z-index: 40; width: min(560px, calc(100vw - 32px));
  display: flex; flex-direction: column; gap: 14px;
  padding: 18px 20px 16px;
  background: rgba(7, 20, 38, 0.86);
  border: 1px solid rgba(180, 208, 232, 0.22);
  color: #dce8f4;
  font: 400 13px/1.5 system-ui, -apple-system, "PingFang SC", sans-serif;
  backdrop-filter: blur(10px);
}
#tutorial-ui[hidden] { display: none; }
#tutorial-ui .tutorial-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
}
#tutorial-ui .tutorial-label {
  font-size: 12px; letter-spacing: 0.22em; color: #7fa8c9; text-transform: uppercase;
}
#tutorial-ui .tutorial-brief { color: #b8cde0; }
#tutorial-ui .tutorial-hint {
  color: #7fa8c9; font-size: 12px;
  padding-left: 10px; border-left: 2px solid rgba(127, 168, 201, 0.4);
}
#tutorial-ui .tutorial-slider-row {
  display: flex; align-items: center; gap: 14px;
}
#tutorial-ui .tutorial-slider-row label {
  letter-spacing: 0.1em; color: #9fc0da; white-space: nowrap;
}
#tutorial-ui input[type="range"] { flex: 1; accent-color: #5aa6e0; }
#tutorial-ui .tutorial-readout {
  display: flex; align-items: stretch; gap: 10px;
}
#tutorial-ui .tutorial-cell {
  flex: 1; display: flex; flex-direction: column; gap: 3px;
  padding: 8px 10px; background: rgba(255, 255, 255, 0.04);
}
#tutorial-ui .tutorial-cell span {
  font-size: 11px; letter-spacing: 0.12em; color: #7fa8c9;
}
#tutorial-ui .tutorial-cell strong {
  font-size: 17px; font-weight: 500; font-variant-numeric: tabular-nums;
}
#tutorial-ui .tutorial-state {
  flex: 1.1; align-items: center; justify-content: center; text-align: center;
}
#tutorial-ui .tutorial-state[data-tone="eat"]   { background: rgba(90, 200, 140, 0.16); }
#tutorial-ui .tutorial-state[data-tone="eaten"] { background: rgba(224, 96, 96, 0.16); }
#tutorial-ui .tutorial-state[data-tone="peer"]  { background: rgba(255, 255, 255, 0.04); }
#tutorial-ui .tutorial-state[data-tone="eat"]   strong { color: #7fe0a8; }
#tutorial-ui .tutorial-state[data-tone="eaten"] strong { color: #ff9a9a; }
#tutorial-ui .tutorial-actions { display: flex; gap: 10px; }
#tutorial-ui button {
  flex: 1; padding: 9px 12px; cursor: pointer;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(180, 208, 232, 0.26);
  color: #dce8f4; font: inherit; letter-spacing: 0.08em;
}
#tutorial-ui button:hover { background: rgba(255, 255, 255, 0.12); }
#tutorial-ui button.tutorial-primary {
  background: rgba(90, 166, 224, 0.22); border-color: rgba(90, 166, 224, 0.55);
}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export class TutorialUI {
  constructor({ spec, onValueChange, onReset, onNext, onExit } = {}) {
    ensureStyle();
    this.spec = spec;
    this.callbacks = { onValueChange, onReset, onNext, onExit };
    this.value = spec.slider.initial;
    this.root = this._build();
    document.getElementById('app').appendChild(this.root);
    this.render(this.value);
  }

  _build() {
    const root = document.createElement('section');
    root.id = 'tutorial-ui';
    root.setAttribute('aria-label', '教学关操作面板');
    const { min, max, step, initial } = this.spec.slider;
    root.innerHTML = `
      <div class="tutorial-head">
        <span class="tutorial-label">${this.spec.label}</span>
      </div>
      <p class="tutorial-brief">${this.spec.brief}</p>
      <p class="tutorial-hint">${this.spec.controlHint}</p>
      <div class="tutorial-slider-row">
        <label for="tutorial-slider">体型</label>
        <input type="range" id="tutorial-slider"
               min="${min}" max="${max}" step="${step}" value="${initial}" />
      </div>
      <div class="tutorial-readout">
        <div class="tutorial-cell"><span>你的体型</span><strong id="tutorial-size">—</strong></div>
        <div class="tutorial-cell"><span>灰鱼体型</span><strong id="tutorial-ref">—</strong></div>
        <div class="tutorial-cell"><span>体型比</span><strong id="tutorial-ratio">—</strong></div>
        <div class="tutorial-cell tutorial-state" id="tutorial-state">
          <span>结果</span><strong id="tutorial-state-text">—</strong>
        </div>
      </div>
      <div class="tutorial-actions">
        <button type="button" id="tutorial-reset">重新开始本场</button>
        <button type="button" id="tutorial-next" class="tutorial-primary">我明白了 · 继续</button>
        <button type="button" id="tutorial-exit">跳过教学</button>
      </div>
    `;
    const slider = root.querySelector('#tutorial-slider');
    // 拖动过程中就生效，不等松手。体型是 live 应用的（不重建场景），
    // 构建一次配置实测 0.035ms，每帧跑一次也毫无压力，没必要节流。
    slider.addEventListener('input', () => {
      this.value = Number(slider.value);
      this.render(this.value);
      this.callbacks.onValueChange?.(this.value);
    });
    root
      .querySelector('#tutorial-reset')
      .addEventListener('click', () => this.callbacks.onReset?.());
    root
      .querySelector('#tutorial-next')
      .addEventListener('click', () => this.callbacks.onNext?.());
    root
      .querySelector('#tutorial-exit')
      .addEventListener('click', () => this.callbacks.onExit?.());
    return root;
  }

  render(value = this.value) {
    const spec = this.spec;
    const ratio = tutorialSizeRatio(spec, value);
    const relation = tutorialRelation(spec, value);
    const copy = RELATION_COPY[relation] ?? RELATION_COPY.peer;
    this.root.querySelector('#tutorial-size').textContent = (
      spec.referenceSize * ratio
    ).toFixed(2);
    this.root.querySelector('#tutorial-ref').textContent =
      spec.referenceSize.toFixed(2);
    this.root.querySelector('#tutorial-ratio').textContent = ratio.toFixed(2);
    this.root.querySelector('#tutorial-state-text').textContent = copy.text;
    this.root.querySelector('#tutorial-state').dataset.tone = copy.tone;
  }

  setHidden(hidden) {
    this.root.hidden = Boolean(hidden);
  }

  dispose() {
    this.root.remove();
  }
}
