import {
  IDENTITY_COEFFICIENTS,
  NEUTRAL_BARYCENTRIC_POINT,
  TRIANGLE_VERTICES,
  barycentricToCartesian,
  cartesianToBarycentric,
  deriveRoundMultipliers,
  multiplyCoefficients,
  normalizeBarycentricPoint,
} from "./game-mode.js";

const COEFFICIENT_META = Object.freeze([
  {
    key: "size",
    label: "体型",
    specimenCode: "SIZ",
    vertexClass: "size",
  },
  {
    key: "stamina",
    label: "耐力",
    specimenCode: "END",
    vertexClass: "stamina",
  },
  {
    key: "speed",
    label: "速度",
    specimenCode: "MOT",
    vertexClass: "speed",
  },
]);

const PHASE_COPY = Object.freeze({
  tuning: {
    label: "开局定向",
    instruction:
      "拖动三角中的标本点，选择这一代的演化方向。确认后，本代系数将钉死。",
  },
  running: {
    label: "演化观察",
    instruction: "标本点已经封存。观察蓝色鱼群如何承担这一代的选择。",
  },
  verdict: {
    label: "本代结算",
    instruction: "本代实验已经结束。无论胜负，这组系数都会累乘进下一代。",
  },
  inherit: {
    label: "代际封存",
    instruction: "本代系数已写入谱系，累计结果会成为下一代的遗传底本。",
  },
  complete: {
    label: "谱系完成",
    instruction: "三代实验已经封存。回看每一次定向如何累积成最终谱系。",
  },
});

const NUMBER_FORMAT = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});
const TRIANGLE_HEIGHT = TRIANGLE_VERTICES.size.y;
const KEYBOARD_STEP = 0.025;
const KEYBOARD_LARGE_STEP = 0.075;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatInteger(value) {
  return NUMBER_FORMAT.format(Math.max(0, Math.round(asNumber(value))));
}

function formatPercent(value) {
  const number = clamp(asNumber(value), 0, 100);
  return Number.isInteger(number) ? `${number}%` : `${number.toFixed(1)}%`;
}

function formatWeight(value) {
  return `${(clamp(asNumber(value), 0, 1) * 100).toFixed(1)}%`;
}

function formatMultiplier(value) {
  return `×${Math.max(0, asNumber(value, 1)).toFixed(2)}`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(asNumber(seconds)));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

// 扇形钟面：已消耗的时间从 12 点顺时针被“吃掉”，剩余扇区代表剩余时间。
const CLOCK_RADIUS = 33;

function clockSectorPath(fraction) {
  const remaining = clamp(asNumber(fraction), 0, 1);
  if (remaining <= 0) return "";
  const top = 50 - CLOCK_RADIUS;
  if (remaining >= 1) {
    // 满盘：用两段半弧拼整圆，避免起终点重合时弧线坑掉。
    return (
      `M 50 ${top} ` +
      `A ${CLOCK_RADIUS} ${CLOCK_RADIUS} 0 1 1 50 ${50 + CLOCK_RADIUS} ` +
      `A ${CLOCK_RADIUS} ${CLOCK_RADIUS} 0 1 1 50 ${top} Z`
    );
  }
  const startAngle = -Math.PI / 2 + (1 - remaining) * Math.PI * 2;
  const startX = 50 + CLOCK_RADIUS * Math.cos(startAngle);
  const startY = 50 + CLOCK_RADIUS * Math.sin(startAngle);
  const largeArc = remaining > 0.5 ? 1 : 0;
  return (
    `M 50 50 L ${startX.toFixed(3)} ${startY.toFixed(3)} ` +
    `A ${CLOCK_RADIUS} ${CLOCK_RADIUS} 0 ${largeArc} 1 50 ${top} Z`
  );
}

const CLOCK_TICKS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
  const isCardinal = index % 3 === 0;
  const outer = 44;
  const inner = isCardinal ? 38 : 41;
  const x1 = (50 + inner * Math.cos(angle)).toFixed(3);
  const y1 = (50 + inner * Math.sin(angle)).toFixed(3);
  const x2 = (50 + outer * Math.cos(angle)).toFixed(3);
  const y2 = (50 + outer * Math.sin(angle)).toFixed(3);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${isCardinal ? ' class="game-ui__clock-tick--cardinal"' : ""}></line>`;
}).join("");

function normalizePhase(phase) {
  const normalized = String(phase ?? "tuning").trim().toLowerCase();
  if (normalized === "finished" || normalized === "summary") return "complete";
  if (normalized === "result") return "verdict";
  return PHASE_COPY[normalized] ? normalized : "tuning";
}

function resolveWin(result, survivalPct, threshold) {
  if (typeof result === "boolean") return result;
  if (typeof result?.won === "boolean") return result.won;
  if (typeof result?.success === "boolean") return result.success;

  const verdict = String(result?.verdict ?? result?.status ?? "").toLowerCase();
  if (["won", "win", "passed", "success"].includes(verdict)) return true;
  if (["lost", "lose", "failed", "failure"].includes(verdict)) return false;
  return asNumber(survivalPct) >= asNumber(threshold);
}

function safeWeights(candidate) {
  try {
    return normalizeBarycentricPoint(
      candidate ?? NEUTRAL_BARYCENTRIC_POINT,
      { project: true },
    );
  } catch {
    return { ...NEUTRAL_BARYCENTRIC_POINT };
  }
}

function safeCoefficients(candidate, fallback = IDENTITY_COEFFICIENTS) {
  const result = {};
  for (const { key } of COEFFICIENT_META) {
    const value = asNumber(candidate?.[key], fallback[key]);
    result[key] = value > 0 ? value : fallback[key];
  }
  return result;
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Player-facing overlay for the three-generation game mode.
 *
 * Callback contract:
 * - onTriangleInput({ size, stamina, speed }) where values are barycentric
 *   weights that are non-negative and total exactly 1.
 * - onStart(), onRetry(), onContinue(), onRestart(), onExit()
 * - onSkipLevel() —— 钟面拉伸栏的测试后门，栏打开时按空格触发
 */
export class GameUI {
  constructor({
    root,
    onTriangleInput,
    onStart,
    onRetry,
    onContinue,
    onRestart,
    onExit,
    onSkipLevel,
  } = {}) {
    if (!(root instanceof HTMLElement)) {
      throw new TypeError("GameUI requires an HTMLElement root.");
    }

    this.root = root;
    this.callbacks = {
      onTriangleInput,
      onStart,
      onRetry,
      onContinue,
      onRestart,
      onExit,
      onSkipLevel,
    };
    this.disposed = false;
    this.draggingPointerId = null;
    this.lastAnnouncementKey = "";
    this.levelIndex = 0;
    this.levelCount = 3;
    this.phase = "tuning";
    this.localWeights = { ...NEUTRAL_BARYCENTRIC_POINT };
    this.inheritedCoefficients = { ...IDENTITY_COEFFICIENTS };
    this.lastViewModel = null;

    this.root.classList.add("game-ui");
    this.root.setAttribute("aria-labelledby", "game-ui-level-title");
    this.root.innerHTML = `
      <div class="game-ui__wash" aria-hidden="true"></div>
      <div class="game-ui__clock" hidden>
        <button class="game-ui__clock-button" type="button" aria-expanded="false" title="展开测试拉伸栏">
          <svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
            <circle class="game-ui__clock-face" cx="50" cy="50" r="46"></circle>
            <g class="game-ui__clock-ticks">${CLOCK_TICKS}</g>
            <path class="game-ui__clock-sector" d=""></path>
            <circle class="game-ui__clock-pin" cx="50" cy="50" r="2.2"></circle>
          </svg>
          <strong class="game-ui__clock-time" role="timer" aria-label="剩余观察时间">00:00</strong>
        </button>
        <div class="game-ui__clock-drawer" hidden>
          <kbd>SPACE</kbd>
          <span>跳过本关 · 测试</span>
        </div>
      </div>
      <div class="game-ui__layout">
        <aside class="game-ui__lineage-rail" aria-label="三代演化时间轨">
          <header class="game-ui__rail-header">
            <span>LINEAGE / 03</span>
            <strong>蓝鱼谱系</strong>
          </header>
          <ol class="game-ui__lineage-list"></ol>
        </aside>

        <article class="game-ui__dossier">
          <header class="game-ui__dossier-header">
            <div>
              <p class="game-ui__kicker">
                <span class="game-ui__specimen-id">SPECIMEN BF–01</span>
                <span class="game-ui__phase-label">开局定向</span>
              </p>
              <h2 id="game-ui-level-title">未命名关卡</h2>
              <p class="game-ui__era"></p>
            </div>
            <button class="game-ui__exit" type="button" data-action="exit">
              <span aria-hidden="true">×</span>
              退出实验室
            </button>
          </header>

          <div class="game-ui__rule" aria-hidden="true">
            <span>OBSERVATION RECORD</span>
            <i></i>
            <span class="game-ui__level-counter">01 / 03</span>
          </div>

          <section class="game-ui__brief" aria-labelledby="game-ui-objective-title">
            <p class="game-ui__story"></p>
            <div class="game-ui__objective">
              <span>本代任务</span>
              <strong id="game-ui-objective-title"></strong>
            </div>
          </section>

          <section class="game-ui__telemetry" aria-label="鱼群实时状态">
            <div class="game-ui__metric game-ui__metric--primary">
              <span>蓝鱼存活率</span>
              <strong class="game-ui__survival">100%</strong>
              <small class="game-ui__population">0 / 0 尾</small>
            </div>
            <div class="game-ui__metric">
              <span>剩余观察时间</span>
              <strong class="game-ui__time">00:00</strong>
              <small class="game-ui__duration"></small>
            </div>
            <div class="game-ui__metric">
              <span>过关底线</span>
              <strong class="game-ui__threshold">≥ 0%</strong>
              <small>计时结束时</small>
            </div>
            <div class="game-ui__survival-track" aria-hidden="true">
              <i></i>
              <b></b>
            </div>
          </section>

          <section class="game-ui__result" hidden aria-label="本代实验结果">
            <div class="game-ui__result-stamp" aria-hidden="true"></div>
            <div>
              <span class="game-ui__result-eyebrow">GENERATION VERDICT</span>
              <strong class="game-ui__result-title"></strong>
              <p class="game-ui__result-copy"></p>
            </div>
            <dl class="game-ui__death-log">
              <div>
                <dt>被捕食</dt>
                <dd class="game-ui__death-eaten">0</dd>
              </div>
              <div>
                <dt>饥饿</dt>
                <dd class="game-ui__death-starved">0</dd>
              </div>
            </dl>
          </section>

          <section class="game-ui__evolution" aria-labelledby="game-ui-evolution-title">
            <div class="game-ui__evolution-heading">
              <div>
                <span>EVOLUTION VECTOR</span>
                <h3 id="game-ui-evolution-title">本代演化方向</h3>
              </div>
              <output class="game-ui__lock-state" aria-live="polite">
                <i aria-hidden="true"></i>
                <strong>可调整</strong>
              </output>
            </div>
            <p class="game-ui__phase-instruction" id="game-ui-triangle-help"></p>

            <div class="game-ui__coefficient-workbench">
              <div class="game-ui__triangle-card">
                <div class="game-ui__triangle-stage">
                  <span class="game-ui__vertex-label game-ui__vertex-label--speed">
                    <b>速度</b>
                    <output data-weight="speed">33.3%</output>
                  </span>
                  <span class="game-ui__vertex-label game-ui__vertex-label--size">
                    <b>体型</b>
                    <output data-weight="size">33.3%</output>
                  </span>
                  <span class="game-ui__vertex-label game-ui__vertex-label--stamina">
                    <b>耐力</b>
                    <output data-weight="stamina">33.3%</output>
                  </span>

                  <div class="game-ui__triangle-plane" data-triangle-surface>
                    <svg
                      viewBox="0 0 100 86.60254"
                      preserveAspectRatio="none"
                      focusable="false"
                      aria-hidden="true"
                    >
                      <defs>
                        <pattern
                          id="game-ui-triangle-grid"
                          width="10"
                          height="8.660254"
                          patternUnits="userSpaceOnUse"
                        >
                          <path d="M 10 0 L 0 0 0 8.660254" fill="none"></path>
                        </pattern>
                      </defs>
                      <polygon class="game-ui__triangle-fill" points="50,0 0,86.60254 100,86.60254"></polygon>
                      <polygon class="game-ui__triangle-grid" points="50,0 0,86.60254 100,86.60254"></polygon>
                      <path class="game-ui__triangle-axis" d="M50 57.735 L50 0 M50 57.735 L0 86.60254 M50 57.735 L100 86.60254"></path>
                      <polygon class="game-ui__triangle-outline" points="50,0 0,86.60254 100,86.60254"></polygon>
                      <circle class="game-ui__triangle-neutral" cx="50" cy="57.735" r="1.65"></circle>
                    </svg>
                    <button
                      class="game-ui__triangle-handle"
                      type="button"
                      aria-roledescription="三角形演化控制点"
                      aria-describedby="game-ui-triangle-help"
                      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
                    >
                      <span aria-hidden="true"></span>
                    </button>
                  </div>
                </div>
                <p class="game-ui__gesture-hint">
                  <span>拖动 / 触摸</span>
                  <span>方向键微调</span>
                  <span>Home 回到均衡</span>
                </p>
              </div>

              <div class="game-ui__coefficient-ledger" aria-label="本代与累计遗传系数">
                <header>
                  <span>方向</span>
                  <span>本代</span>
                  <span>累计</span>
                </header>
                <div class="game-ui__coefficient-rows"></div>
                <p class="game-ui__inheritance-base"></p>
              </div>
            </div>
          </section>

          <footer class="game-ui__footer">
            <div class="game-ui__footnote">
              <span aria-hidden="true">※</span>
              <p>遗传的是累计系数，不是个体。每一代的选择都会乘进下一代。</p>
            </div>
            <div class="game-ui__actions">
              <button class="game-ui__button game-ui__button--primary" type="button" data-action="start">
                封存系数，开始本代
              </button>
              <button class="game-ui__button game-ui__button--primary" type="button" data-action="continue" hidden>
                进入下一代
              </button>
              <button class="game-ui__button game-ui__button--primary" type="button" data-action="retry" hidden>
                重做本代实验
              </button>
              <button class="game-ui__button game-ui__button--primary" type="button" data-action="restart" hidden>
                从第一代重新开始
              </button>
              <span class="game-ui__running-note" hidden>
                <i aria-hidden="true"></i>
                系数已钉死 · 正在记录
              </span>
            </div>
          </footer>
        </article>
      </div>
      <div class="game-ui__announcer" role="status" aria-live="polite" aria-atomic="true"></div>
    `;

    this.elements = {
      clock: this.root.querySelector(".game-ui__clock"),
      clockButton: this.root.querySelector(".game-ui__clock-button"),
      clockDrawer: this.root.querySelector(".game-ui__clock-drawer"),
      clockSector: this.root.querySelector(".game-ui__clock-sector"),
      clockTime: this.root.querySelector(".game-ui__clock-time"),
      lineageList: this.root.querySelector(".game-ui__lineage-list"),
      specimenId: this.root.querySelector(".game-ui__specimen-id"),
      phaseLabel: this.root.querySelector(".game-ui__phase-label"),
      levelTitle: this.root.querySelector("#game-ui-level-title"),
      era: this.root.querySelector(".game-ui__era"),
      levelCounter: this.root.querySelector(".game-ui__level-counter"),
      story: this.root.querySelector(".game-ui__story"),
      objective: this.root.querySelector("#game-ui-objective-title"),
      survival: this.root.querySelector(".game-ui__survival"),
      population: this.root.querySelector(".game-ui__population"),
      time: this.root.querySelector(".game-ui__time"),
      duration: this.root.querySelector(".game-ui__duration"),
      threshold: this.root.querySelector(".game-ui__threshold"),
      survivalBar: this.root.querySelector(".game-ui__survival-track i"),
      thresholdMark: this.root.querySelector(".game-ui__survival-track b"),
      result: this.root.querySelector(".game-ui__result"),
      resultStamp: this.root.querySelector(".game-ui__result-stamp"),
      resultTitle: this.root.querySelector(".game-ui__result-title"),
      resultCopy: this.root.querySelector(".game-ui__result-copy"),
      deathEaten: this.root.querySelector(".game-ui__death-eaten"),
      deathStarved: this.root.querySelector(".game-ui__death-starved"),
      evolution: this.root.querySelector(".game-ui__evolution"),
      lockState: this.root.querySelector(".game-ui__lock-state"),
      lockStateLabel: this.root.querySelector(".game-ui__lock-state strong"),
      phaseInstruction: this.root.querySelector(".game-ui__phase-instruction"),
      triangleSurface: this.root.querySelector("[data-triangle-surface]"),
      triangleHandle: this.root.querySelector(".game-ui__triangle-handle"),
      coefficientRows: this.root.querySelector(".game-ui__coefficient-rows"),
      inheritanceBase: this.root.querySelector(".game-ui__inheritance-base"),
      start: this.root.querySelector('[data-action="start"]'),
      retry: this.root.querySelector('[data-action="retry"]'),
      continue: this.root.querySelector('[data-action="continue"]'),
      restart: this.root.querySelector('[data-action="restart"]'),
      exit: this.root.querySelector('[data-action="exit"]'),
      runningNote: this.root.querySelector(".game-ui__running-note"),
      announcer: this.root.querySelector(".game-ui__announcer"),
    };

    this.#buildCoefficientRows();
    this.#bindEvents();
  }

  #buildCoefficientRows() {
    for (const item of COEFFICIENT_META) {
      const row = makeElement("div", "game-ui__coefficient-row");
      row.dataset.coefficient = item.key;

      const label = makeElement("span", "game-ui__coefficient-name");
      label.append(
        makeElement("small", "", item.specimenCode),
        makeElement("strong", "", item.label),
      );

      const round = makeElement(
        "output",
        "game-ui__coefficient-round",
        "×1.00",
      );
      round.setAttribute("aria-label", `${item.label}本代系数`);

      const cumulative = makeElement(
        "output",
        "game-ui__coefficient-cumulative",
        "×1.00",
      );
      cumulative.setAttribute("aria-label", `${item.label}累计系数`);

      row.append(label, round, cumulative);
      this.elements.coefficientRows.append(row);
    }
  }

  #bindEvents() {
    this.handleClick = (event) => {
      if (this.disposed) return;
      const button = event.target.closest("button[data-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.action;
      this.callbacks[`on${action[0].toUpperCase()}${action.slice(1)}`]?.();
    };

    this.handlePointerDown = (event) => {
      if (
        this.disposed ||
        this.phase !== "tuning" ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      event.preventDefault();
      this.draggingPointerId = event.pointerId;
      this.elements.triangleSurface.setPointerCapture(event.pointerId);
      this.elements.triangleHandle.focus({ preventScroll: true });
      this.#updateFromPointer(event);
    };

    this.handlePointerMove = (event) => {
      if (
        this.disposed ||
        this.phase !== "tuning" ||
        event.pointerId !== this.draggingPointerId
      ) {
        return;
      }
      event.preventDefault();
      this.#updateFromPointer(event);
    };

    this.handlePointerEnd = (event) => {
      if (event.pointerId !== this.draggingPointerId) return;
      this.draggingPointerId = null;
      if (this.elements.triangleSurface.hasPointerCapture(event.pointerId)) {
        this.elements.triangleSurface.releasePointerCapture(event.pointerId);
      }
    };

    this.handleTriangleKeyDown = (event) => {
      if (this.disposed || this.phase !== "tuning") return;

      const current = barycentricToCartesian(this.localWeights);
      const step = event.shiftKey ? KEYBOARD_LARGE_STEP : KEYBOARD_STEP;
      let next = null;

      switch (event.key) {
        case "ArrowLeft":
          next = { x: current.x - step, y: current.y };
          break;
        case "ArrowRight":
          next = { x: current.x + step, y: current.y };
          break;
        case "ArrowUp":
          next = { x: current.x, y: current.y - step * TRIANGLE_HEIGHT };
          break;
        case "ArrowDown":
          next = { x: current.x, y: current.y + step * TRIANGLE_HEIGHT };
          break;
        case "Home":
          this.#commitWeights(NEUTRAL_BARYCENTRIC_POINT);
          event.preventDefault();
          return;
        default:
          return;
      }

      event.preventDefault();
      this.#commitWeights(
        cartesianToBarycentric(next, { project: true }),
      );
    };

    this.handleClockToggle = () => {
      if (this.disposed) return;
      this.#setSkipDrawer(this.elements.clockDrawer.hidden);
    };

    // 拉伸栏打开时，空格是“跳过本关”的测试后门：在捕获阶段拦截，
    // 避免同一次按键又触发 0.2× 慢速快捷键或聚焦按钮的默认激活。
    this.handleSkipKeyDown = (event) => {
      if (
        this.disposed ||
        this.root.hidden ||
        this.elements.clockDrawer.hidden ||
        event.repeat ||
        !(event.code === "Space" || event.key === " ")
      ) {
        return;
      }
      if (this.phase !== "running") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.#setSkipDrawer(false);
      this.callbacks.onSkipLevel?.();
    };

    this.root.addEventListener("click", this.handleClick);
    this.elements.clockButton.addEventListener(
      "click",
      this.handleClockToggle,
    );
    window.addEventListener("keydown", this.handleSkipKeyDown, true);
    this.elements.triangleSurface.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.elements.triangleSurface.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.elements.triangleSurface.addEventListener(
      "pointerup",
      this.handlePointerEnd,
    );
    this.elements.triangleSurface.addEventListener(
      "pointercancel",
      this.handlePointerEnd,
    );
    this.elements.triangleSurface.addEventListener(
      "lostpointercapture",
      this.handlePointerEnd,
    );
    this.elements.triangleHandle.addEventListener(
      "keydown",
      this.handleTriangleKeyDown,
    );
  }

  #setSkipDrawer(open) {
    this.elements.clockDrawer.hidden = !open;
    this.elements.clockButton.setAttribute("aria-expanded", String(open));
  }

  #updateFromPointer(event) {
    const bounds = this.elements.triangleSurface.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const point = {
      x: (event.clientX - bounds.left) / bounds.width,
      y:
        ((event.clientY - bounds.top) / bounds.height) *
        TRIANGLE_HEIGHT,
    };
    this.#commitWeights(
      cartesianToBarycentric(point, { project: true }),
    );
  }

  #commitWeights(candidate) {
    const weights = safeWeights(candidate);
    const changed = COEFFICIENT_META.some(
      ({ key }) => Math.abs(weights[key] - this.localWeights[key]) > 1e-6,
    );
    if (!changed) return;

    this.localWeights = weights;
    const roundMultipliers = deriveRoundMultipliers(weights);
    const previewCumulative = multiplyCoefficients(
      this.inheritedCoefficients,
      roundMultipliers,
    );
    this.#renderCoefficientControl({
      weights,
      roundMultipliers,
      inheritedCoefficients: this.inheritedCoefficients,
      previewCumulative,
    });
    this.callbacks.onTriangleInput?.({ ...weights });
  }

  #renderCoefficientControl({
    weights,
    roundMultipliers,
    inheritedCoefficients,
    previewCumulative,
  }) {
    const position = barycentricToCartesian(weights);
    this.elements.triangleHandle.style.left = `${position.x * 100}%`;
    this.elements.triangleHandle.style.top =
      `${(position.y / TRIANGLE_HEIGHT) * 100}%`;

    const valueText = COEFFICIENT_META.map(
      ({ key, label }) => `${label} ${formatWeight(weights[key])}`,
    ).join("，");
    this.elements.triangleHandle.setAttribute(
      "aria-label",
      `演化控制点：${valueText}。方向键调整，按 Home 回到均衡。`,
    );

    for (const { key, label } of COEFFICIENT_META) {
      const weightOutput = this.root.querySelector(`[data-weight="${key}"]`);
      const row = this.root.querySelector(`[data-coefficient="${key}"]`);
      const roundOutput = row?.querySelector(".game-ui__coefficient-round");
      const cumulativeOutput = row?.querySelector(
        ".game-ui__coefficient-cumulative",
      );

      if (weightOutput) weightOutput.textContent = formatWeight(weights[key]);
      if (roundOutput) {
        roundOutput.textContent = formatMultiplier(roundMultipliers[key]);
        roundOutput.setAttribute(
          "aria-label",
          `${label}本代系数${formatMultiplier(roundMultipliers[key])}`,
        );
      }
      if (cumulativeOutput) {
        cumulativeOutput.textContent = formatMultiplier(
          previewCumulative[key],
        );
        cumulativeOutput.setAttribute(
          "aria-label",
          `${label}累计系数${formatMultiplier(previewCumulative[key])}`,
        );
      }
    }

    this.elements.inheritanceBase.textContent =
      `上代底本 · ${COEFFICIENT_META.map(
        ({ key, label }) =>
          `${label}${formatMultiplier(inheritedCoefficients[key])}`,
      ).join(" · ")}`;
  }

  #renderLineage(lineage) {
    this.elements.lineageList.replaceChildren();

    for (let index = 0; index < this.levelCount; index += 1) {
      const record = Array.isArray(lineage) ? lineage[index] : null;
      const isCurrent =
        index === this.levelIndex && this.phase !== "complete";
      const isComplete = Boolean(record) || index < this.levelIndex;
      const state = isCurrent ? "current" : isComplete ? "complete" : "future";

      const item = makeElement("li", "game-ui__generation");
      item.dataset.state = state;
      if (isCurrent) item.setAttribute("aria-current", "step");

      const marker = makeElement("span", "game-ui__generation-marker");
      marker.textContent = String(index + 1).padStart(2, "0");
      marker.setAttribute("aria-hidden", "true");

      const copy = makeElement("div", "game-ui__generation-copy");
      const label = makeElement(
        "strong",
        "",
        `标本 ${String(index + 1).padStart(2, "0")} · 第${index + 1}代`,
      );
      const status = makeElement(
        "span",
        "",
        isCurrent
          ? PHASE_COPY[this.phase].label
          : isComplete
            ? "累计系数已封存"
            : "等待启封",
      );
      copy.append(label, status);

      const coefficients =
        record?.cumulativeAfter ??
        record?.report?.finalCoefficients ??
        record?.finalCoefficients;
      if (coefficients) {
        const coefficientLine = makeElement(
          "small",
          "game-ui__generation-coefficients",
        );
        coefficientLine.textContent = COEFFICIENT_META.map(
          ({ key, label: coefficientLabel }) =>
            `${coefficientLabel}${formatMultiplier(coefficients[key])}`,
        ).join(" · ");
        copy.append(coefficientLine);
      }

      item.append(marker, copy);
      this.elements.lineageList.append(item);
    }
  }

  #renderActions({ won, isLastLevel }) {
    const actions = ["start", "retry", "continue", "restart"];
    for (const action of actions) this.elements[action].hidden = true;
    this.elements.runningNote.hidden = true;
    this.elements.continue.textContent = isLastLevel
      ? "封存最终一代"
      : "进入下一代";

    if (this.phase === "tuning") {
      this.elements.start.hidden = false;
      return;
    }
    if (this.phase === "running") {
      this.elements.runningNote.hidden = false;
      return;
    }
    if (this.phase === "complete") {
      this.elements.restart.hidden = false;
      return;
    }
    if (this.phase === "inherit") {
      this.elements.continue.textContent = isLastLevel
        ? "完成三代谱系"
        : "进入下一代";
      this.elements.continue.hidden = false;
      return;
    }
    if (this.phase === "verdict") {
      // 单次判定：胜负都只判一次，失败也封代继续。不提供同关重试，
      // 避免展台演示卡在某一代。
      this.elements.continue.textContent = isLastLevel
        ? "封存最终一代"
        : won
          ? "封存本代遗产"
          : "带着代价进入下一代";
      this.elements.continue.hidden = false;
    }
  }

  render(viewModel = {}) {
    if (this.disposed) return;

    const active = Boolean(viewModel.active);
    this.root.hidden = !active;
    this.root.inert = !active;
    this.root.setAttribute("aria-hidden", String(!active));
    if (!active) return;

    this.lastViewModel = viewModel;
    this.phase = normalizePhase(viewModel.phase);
    this.levelCount = Math.max(1, Math.round(asNumber(viewModel.levelCount, 3)));
    this.levelIndex = clamp(
      Math.round(asNumber(viewModel.levelIndex, 0)),
      0,
      this.levelCount - 1,
    );

    const level = viewModel.level ?? {};
    const initial = Math.max(0, Math.round(asNumber(viewModel.initial)));
    const survivors = clamp(
      Math.round(asNumber(viewModel.survivors, initial)),
      0,
      Math.max(initial, 0),
    );
    const computedSurvival = initial > 0 ? (survivors / initial) * 100 : 0;
    const survivalPct = clamp(
      asNumber(viewModel.survivalPct, computedSurvival),
      0,
      100,
    );
    const threshold = clamp(asNumber(level.winSurvivalPct), 0, 100);
    const duration = Math.max(0, asNumber(level.durationSec));
    const timeRemaining = clamp(
      asNumber(viewModel.timeRemaining, duration),
      0,
      duration || Number.MAX_SAFE_INTEGER,
    );
    const won = resolveWin(viewModel.result, survivalPct, threshold);
    const isLastLevel = this.levelIndex >= this.levelCount - 1;
    const showResult =
      this.phase === "verdict" ||
      this.phase === "inherit" ||
      this.phase === "complete";
    const phaseCopy = PHASE_COPY[this.phase];
    const weights = safeWeights(
      viewModel.roundWeights ??
        viewModel.barycentric ??
        NEUTRAL_BARYCENTRIC_POINT,
    );
    const derivedRound = deriveRoundMultipliers(weights);
    const roundMultipliers = safeCoefficients(
      viewModel.roundMultipliers,
      derivedRound,
    );
    const inheritedCoefficients = safeCoefficients(
      viewModel.inheritedCoefficients,
      IDENTITY_COEFFICIENTS,
    );
    const derivedPreview = multiplyCoefficients(
      inheritedCoefficients,
      roundMultipliers,
    );
    const previewCumulative = safeCoefficients(
      viewModel.previewCumulative,
      derivedPreview,
    );

    this.localWeights = weights;
    this.inheritedCoefficients = inheritedCoefficients;
    this.root.dataset.phase = this.phase;
    this.root.dataset.result = showResult ? (won ? "won" : "lost") : "pending";
    this.elements.specimenId.textContent = `SPECIMEN BF–${String(this.levelIndex + 1).padStart(2, "0")}`;
    this.elements.phaseLabel.textContent = phaseCopy.label;
    const levelTitleText =
      level.title ?? level.label ?? `第 ${this.levelIndex + 1} 关`;
    this.elements.levelTitle.textContent = levelTitleText;
    // 典故标题是 15–17 字的对仗长句，用短标签的字号会碎成四行。
    // 超过 10 字切到长标题档；短标签保持原有版式不变。
    this.elements.levelTitle.classList.toggle(
      "game-ui__title--long",
      levelTitleText.length > 10,
    );
    this.elements.era.textContent = level.era ?? "未标记生态年代";
    this.elements.levelCounter.textContent =
      `${String(this.levelIndex + 1).padStart(2, "0")} / ${String(this.levelCount).padStart(2, "0")}`;
    this.elements.story.textContent = level.story ?? "";
    this.elements.objective.textContent =
      level.objective ??
      `观察结束时，让至少 ${formatPercent(threshold)} 的蓝色鱼存活。`;

    this.elements.survival.textContent = formatPercent(survivalPct);
    this.elements.population.textContent =
      `${formatInteger(survivors)} / ${formatInteger(initial)} 尾`;
    this.elements.time.textContent = formatTime(timeRemaining);

    // 扇形钟面：TUNING 中满格静止（elapsed 不推进），RUNNING 中随倒计时
    // 被消耗，结算后隐藏。最后 10 秒转入紧急态。
    this.elements.clock.hidden = showResult;
    if (showResult) this.#setSkipDrawer(false);
    if (!showResult) {
      const remainingFraction = duration > 0 ? timeRemaining / duration : 0;
      this.elements.clockSector.setAttribute(
        "d",
        clockSectorPath(remainingFraction),
      );
      this.elements.clockTime.textContent = formatTime(timeRemaining);
      this.elements.clock.dataset.urgent = String(
        this.phase === "running" && timeRemaining > 0 && timeRemaining <= 10,
      );
    }
    this.elements.duration.textContent = `本代共 ${formatTime(duration)}`;
    this.elements.threshold.textContent = `≥ ${formatPercent(threshold)}`;
    this.elements.survivalBar.style.width = `${survivalPct}%`;
    this.elements.thresholdMark.style.left = `${threshold}%`;

    const tuning = this.phase === "tuning";
    this.elements.exit.disabled = this.phase === "running";
    this.elements.exit.title =
      this.phase === "running" ? "本代观察结束后才可退出" : "";
    this.elements.evolution.dataset.locked = String(!tuning);
    this.elements.triangleHandle.disabled = !tuning;
    this.elements.triangleSurface.setAttribute(
      "aria-disabled",
      String(!tuning),
    );
    this.elements.lockState.dataset.locked = String(!tuning);
    this.elements.lockStateLabel.textContent = tuning ? "可调整" : "已钉死";
    this.elements.phaseInstruction.textContent = phaseCopy.instruction;
    this.#renderCoefficientControl({
      weights,
      roundMultipliers,
      inheritedCoefficients,
      previewCumulative,
    });

    this.elements.result.hidden = !showResult;
    if (showResult) {
      const deaths = viewModel.deaths ?? viewModel.result?.deaths ?? {};
      this.elements.resultStamp.textContent = won ? "PASS" : "FAIL";
      this.elements.resultTitle.textContent = won
        ? isLastLevel
          ? "三代谱系存续"
          : "本代获得遗传资格"
        : "本代未达存活底线";
      // 每关专属结算文案优先；没写的关卡回落到通用说明。
      const levelVerdict = won ? level.verdictWin : level.verdictLose;
      this.elements.resultCopy.textContent =
        levelVerdict ??
        viewModel.result?.message ??
        (won
          ? isLastLevel
            ? "最后一代已经完成观察，三次选择已累积为整条谱系的记录。"
            : "本代累计系数将写入谱系，成为下一代的遗传底本。"
          : "时间不会回头。这代的选择仍将写入谱系，由下一代承担。");
      this.elements.deathEaten.textContent = formatInteger(
        deaths.eaten ?? deaths.captured,
      );
      this.elements.deathStarved.textContent = formatInteger(
        deaths.starved ?? deaths.hunger,
      );
    }

    this.#renderLineage(viewModel.lineage);
    this.#renderActions({ won, isLastLevel });

    const announcementKey = [
      this.levelIndex,
      this.phase,
      showResult ? (won ? "won" : "lost") : "pending",
    ].join(":");
    if (announcementKey !== this.lastAnnouncementKey) {
      this.lastAnnouncementKey = announcementKey;
      this.elements.announcer.textContent = showResult
        ? `${this.elements.levelTitle.textContent}结算：${this.elements.resultTitle.textContent}`
        : `${this.elements.levelTitle.textContent}，${phaseCopy.label}。${phaseCopy.instruction}`;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeEventListener("click", this.handleClick);
    this.elements.clockButton.removeEventListener(
      "click",
      this.handleClockToggle,
    );
    window.removeEventListener("keydown", this.handleSkipKeyDown, true);
    this.elements.triangleSurface.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.elements.triangleSurface.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.elements.triangleSurface.removeEventListener(
      "pointerup",
      this.handlePointerEnd,
    );
    this.elements.triangleSurface.removeEventListener(
      "pointercancel",
      this.handlePointerEnd,
    );
    this.elements.triangleSurface.removeEventListener(
      "lostpointercapture",
      this.handlePointerEnd,
    );
    this.elements.triangleHandle.removeEventListener(
      "keydown",
      this.handleTriangleKeyDown,
    );
    this.root.replaceChildren();
    this.root.classList.remove("game-ui");
    this.root.hidden = true;
    this.root.inert = true;
    this.root.removeAttribute("aria-hidden");
    this.root.removeAttribute("aria-labelledby");
    this.root.removeAttribute("data-phase");
    this.root.removeAttribute("data-result");
  }
}
