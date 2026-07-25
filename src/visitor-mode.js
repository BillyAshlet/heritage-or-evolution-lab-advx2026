// Presentation-only visitor shell.
//
// GameSession and GameUI remain the sole owners of traits, timers, reports,
// verdicts and inheritance. This module owns only the title/menu, narrative
// cutscenes and the final experience screen.

export const VISITOR_SCREEN = Object.freeze({
  HIDDEN: 'HIDDEN',
  TITLE: 'TITLE',
  SETTINGS: 'SETTINGS',
  CONCEPT: 'CONCEPT',
  CREDITS: 'CREDITS',
  CUTSCENE: 'CUTSCENE',
  END: 'END',
});

export const VISITOR_OWNED_SCREENS = Object.freeze([
  VISITOR_SCREEN.TITLE,
  VISITOR_SCREEN.SETTINGS,
  VISITOR_SCREEN.CONCEPT,
  VISITOR_SCREEN.CREDITS,
  VISITOR_SCREEN.CUTSCENE,
  VISITOR_SCREEN.END,
]);

const TITLE_MEDIA = Object.freeze({
  // The teammate-authored asset is not in Git yet. Keep the intended path as
  // metadata and fail closed to the CSS fallback until the file is delivered.
  src: '/output/video/inheritance-lab-loop.mp4',
  enabled: false,
});

const FALLBACK_LEVEL_MEDIA = Object.freeze([
  Object.freeze({
    src: '/output/video/predator-shadow-loop.mp4',
    enabled: false,
    tone: 'dark',
    flipY: true,
  }),
  Object.freeze({
    src: '/output/video/golden-age-pixel-dawn-loop.mp4',
    enabled: false,
    tone: 'bright',
    flipY: true,
  }),
  Object.freeze({
    src: '/output/video/drained-paradise-loop.mp4',
    enabled: false,
    tone: 'dark',
    flipY: true,
  }),
]);

const COPY = Object.freeze({
  zh: Object.freeze({
    title: '下游',
    subtitle: '进化与遗传的代价',
    start: '开始体验',
    settings: '设置',
    concept: '作品理念',
    credits: '团队',
    back: '返回',
    language: '语言',
    conceptTitle: '作品理念',
    conceptBody:
      '我们每一个选择，都会成为后代必须承受的环境。\n\n' +
      '《遗产》用三代鱼群的生死，让你亲手体验进化的代价——\n' +
      '不是教科书里的图表，而是你亲手造成的结果。',
    creditsTitle: '创作团队',
    creditsBody: 'Billy Ashlet\n北辰\n三金\n\nAdventureX 2026',
    endTitle: '体验结束',
    endBody:
      '你的选择，塑造了它们的世界。\n' +
      '它们的命运，源于你的每一次决定。\n\n' +
      '这就是遗产。',
    restart: '返回标题',
    levels: Object.freeze([
      Object.freeze({
        title: '共工怒触不周山，天倾西北，地陷东南',
        story: '天既以倾，何以为北？\n泥土，饥饿与画饼充饥。',
        cta: '调整参数 →',
      }),
      Object.freeze({
        title: '这是最好的时代，这是最坏的时代',
        story: '水既已涨，何以为岸？\n吞咽，膨胀，与来不及计算的重量。',
        cta: '调整参数 →',
      }),
      Object.freeze({
        title: '昔为东海之波臣，今困于车辙之中',
        story: '水既已涸，何以为继？\n等待，蛰伏，与远水解不了的近渴。',
        cta: '确认 →',
      }),
    ]),
  }),
  en: Object.freeze({
    title: 'Downstream',
    subtitle: 'The Price of Evolution',
    start: 'Begin',
    settings: 'Settings',
    concept: 'Concept',
    credits: 'Team',
    back: 'Back',
    language: 'Language',
    conceptTitle: 'Concept',
    conceptBody:
      'Every choice we make becomes the environment our descendants must survive.\n\n' +
      'Legacy uses three generations of fish to let you experience the cost of evolution firsthand—\n' +
      'not as a textbook diagram, but as something you caused.',
    creditsTitle: 'Creative Team',
    creditsBody: 'Billy Ashlet\nNorth Star\nSanjin\n\nAdventureX 2026',
    endTitle: 'Experience Complete',
    endBody:
      'Your choices shaped their world.\n' +
      'Their fate began with every decision you made.\n\n' +
      'This is legacy.',
    restart: 'Return to Title',
    levels: Object.freeze([
      Object.freeze({
        title:
          'Gong Gong struck Mount Buzhou — the sky tilts northwest, the earth caves southeast',
        story:
          'The sky already leans. Where, then, is north?\n' +
          'Soil, hunger, and pictured cakes for a starving mouth.',
        cta: 'Adjust Traits →',
      }),
      Object.freeze({
        title: 'It was the best of times, it was the worst of times',
        story:
          'The water has risen. Where, then, is the shore?\n' +
          'Swallowing, swelling, and weight no one stopped to count.',
        cta: 'Adjust Traits →',
      }),
      Object.freeze({
        title: 'Once a subject of the Eastern Sea — now stranded in a wheel rut',
        story:
          'The water has dried. What, then, carries on?\n' +
          'Waiting, lying low, and distant rivers that cannot wet a near thirst.',
        cta: 'Confirm →',
      }),
    ]),
  }),
});

const SWEEP_SCREENS = new Set(VISITOR_OWNED_SCREENS);
const FX_RING_RADIUS = 90;
const FX_PUSH_REACH = 3;
const FX_MAX_PUSH = 12;
const FX_DAMP = 0.16;
const FX_FOLLOW = 0.18;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function lineBreaks(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function mediaMarkup(media, className) {
  if (!media?.enabled || !media.src) return '';
  const src = escapeHtml(media.src);
  const extension = String(media.src).split('.').at(-1)?.toLowerCase();
  if (['mp4', 'webm', 'ogg'].includes(extension)) {
    return (
      `<video class="${className} vo-media" src="${src}" ` +
      'autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>'
    );
  }
  return `<img class="${className} vo-media" src="${src}" alt="" aria-hidden="true">`;
}

function safeLanguage(language) {
  return language === 'en' ? 'en' : 'zh';
}

function defaultLanguage() {
  const browserLanguage =
    typeof navigator === 'object' ? navigator.language : 'zh-CN';
  return browserLanguage?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function normalizeLevelIndex(index, levelCount) {
  const numeric = Number(index);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(Math.max(0, levelCount - 1), Math.round(numeric)));
}

function levelMedia(level, index) {
  return level?.dressing?.video ?? FALLBACK_LEVEL_MEDIA[index] ?? null;
}

export function resolveVisitorLevelCopy(levels, index, language = 'zh') {
  const lang = safeLanguage(language);
  const safeIndex = normalizeLevelIndex(index, Math.max(1, levels?.length ?? 0));
  const level = levels?.[safeIndex] ?? {};
  const localized = COPY[lang].levels[safeIndex] ?? COPY.zh.levels[safeIndex];
  if (lang === 'zh') {
    return Object.freeze({
      title: level.title ?? level.label ?? localized?.title ?? '',
      story: level.story ?? localized?.story ?? '',
      cta: localized?.cta ?? '继续 →',
    });
  }
  return Object.freeze({
    title: localized?.title ?? level.title ?? level.label ?? '',
    story: localized?.story ?? level.story ?? '',
    cta: localized?.cta ?? 'Continue →',
  });
}

function prefersReducedMotion() {
  return (
    typeof window === 'object' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function setupVariableProximity(overlay, targets) {
  if (prefersReducedMotion()) return () => {};
  const list = targets.map((target) => ({
    ...target,
    spans: [...target.element.querySelectorAll('.vo-blur-word')],
  }));
  if (!list.length) return () => {};

  const ring = document.createElement('div');
  ring.className = 'vo-cursor-ring';
  ring.style.width = ring.style.height = `${FX_RING_RADIUS * 2}px`;
  overlay.appendChild(ring);

  const mouse = { x: 0, y: 0 };
  const cursor = { x: 0, y: 0 };
  let hasMouse = false;
  let raf = 0;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!hasMouse) return;

    cursor.x += (mouse.x - cursor.x) * FX_FOLLOW;
    cursor.y += (mouse.y - cursor.y) * FX_FOLLOW;
    ring.style.transform =
      `translate(${cursor.x - FX_RING_RADIUS}px, ${cursor.y - FX_RING_RADIUS}px)`;
    ring.classList.add('vo-cursor-ring--on');

    for (const { element, fromWeight, toWeight, spans } of list) {
      if (!element.isConnected) continue;
      for (const span of spans) {
        const state =
          span._visitorFx ??
          (span._visitorFx = { weight: fromWeight, tx: 0, ty: 0 });
        const bounds = span.getBoundingClientRect();
        const dx =
          bounds.left + bounds.width / 2 - state.tx - cursor.x;
        const dy =
          bounds.top + bounds.height / 2 - state.ty - cursor.y;
        const distance = Math.hypot(dx, dy) || 1;

        let targetWeight = fromWeight;
        let targetX = 0;
        let targetY = 0;
        if (distance <= FX_RING_RADIUS) {
          targetWeight =
            fromWeight +
            (toWeight - fromWeight) *
              Math.sqrt(1 - distance / FX_RING_RADIUS);
        } else if (distance < FX_RING_RADIUS * FX_PUSH_REACH) {
          const progress =
            (distance - FX_RING_RADIUS) /
            (FX_RING_RADIUS * (FX_PUSH_REACH - 1));
          const push = FX_MAX_PUSH * Math.sin(Math.PI * (1 - progress));
          targetX = (dx / distance) * push;
          targetY = (dy / distance) * push;
        }

        state.weight += (targetWeight - state.weight) * FX_DAMP;
        state.tx += (targetX - state.tx) * FX_DAMP;
        state.ty += (targetY - state.ty) * FX_DAMP;
        span.style.fontVariationSettings = `'wght' ${Math.round(state.weight)}`;
        if (span.dataset.fxSettled) {
          span.style.transform =
            `translate(${state.tx.toFixed(2)}px, ${state.ty.toFixed(2)}px)`;
        }
      }
    }
  };

  const onMove = (event) => {
    if (!hasMouse) {
      cursor.x = event.clientX;
      cursor.y = event.clientY;
    }
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    hasMouse = true;
  };
  const onLeave = () => {
    hasMouse = false;
    ring.classList.remove('vo-cursor-ring--on');
  };

  window.addEventListener('mousemove', onMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  window.addEventListener('blur', onLeave);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('mousemove', onMove);
    document.documentElement.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('blur', onLeave);
    ring.remove();
  };
}

function blurSplitElement(element, {
  delay = 40,
  animateBy = 'letters',
  direction = 'bottom',
  baseWeight = null,
} = {}) {
  const directionClass =
    direction === 'top' ? 'vo-blur--from-top' : 'vo-blur--from-bottom';
  let sequence = 0;

  const makeSpan = (content) => {
    const span = document.createElement('span');
    span.className = `vo-blur-word ${directionClass}`;
    span.style.animationDelay = `${sequence * delay}ms`;
    if (baseWeight !== null) {
      span.style.fontVariationSettings = `'wght' ${baseWeight}`;
    }
    span.textContent = content;
    span.addEventListener(
      'animationend',
      () => {
        span.style.animation = 'none';
        span.style.opacity = '1';
        // Prevent the base translateY(±30px) from returning when the entrance
        // animation releases, including on a booth display with no mouse.
        span.style.transform = 'translate(0px, 0px)';
        span.dataset.fxSettled = '1';
      },
      { once: true },
    );
    sequence += 1;
    return span;
  };

  const process = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const fragment = document.createDocumentFragment();
      if (animateBy === 'words') {
        for (const segment of node.textContent.split(/(\s+)/)) {
          if (!segment) continue;
          fragment.appendChild(
            /^\s+$/.test(segment)
              ? document.createTextNode(' ')
              : makeSpan(segment),
          );
        }
      } else {
        const characters = [...node.textContent.replace(/\s+/g, ' ').trim()];
        for (const character of characters) {
          fragment.appendChild(
            makeSpan(character === ' ' ? '\u00a0' : character),
          );
        }
      }
      node.replaceWith(fragment);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') {
      [...node.childNodes].forEach(process);
    }
  };

  [...element.childNodes].forEach(process);
}

function applyTextEffects(overlay) {
  if (prefersReducedMotion()) return () => {};
  const targets = [];
  overlay.querySelectorAll('[data-fx]').forEach((element) => {
    const animateBy = element.dataset.fx === 'words' ? 'words' : 'letters';
    const fromWeight = Number(element.dataset.fxFrom ?? 350);
    blurSplitElement(element, {
      animateBy,
      delay: Number(
        element.dataset.fxDelay ?? (animateBy === 'words' ? 18 : 40),
      ),
      direction: element.dataset.fxDir ?? 'bottom',
      baseWeight: fromWeight,
    });
    targets.push({
      element,
      fromWeight,
      toWeight: Number(element.dataset.fxTo ?? 800),
    });
  });
  return setupVariableProximity(overlay, targets);
}

function wireMediaFallback(overlay) {
  overlay.querySelectorAll('.vo-media').forEach((media) => {
    media.addEventListener(
      'error',
      () => {
        media.hidden = true;
        media.closest('.vo-screen')?.classList.add('vo-media-missing');
      },
      { once: true },
    );
  });
}

function focusScreen(overlay) {
  requestAnimationFrame(() => {
    overlay
      .querySelector('[data-screen-title]')
      ?.focus({ preventScroll: true });
  });
}

export function mountVisitorMode({
  root = document.getElementById('app'),
  levels = [],
  initialLanguage = defaultLanguage(),
  onBeginExperience = () => {},
  onEnterLevel = () => {},
  onReturnToTitle = () => {},
  onScreenChange = () => {},
} = {}) {
  if (!(root instanceof HTMLElement)) {
    throw new TypeError('mountVisitorMode requires an HTMLElement root.');
  }

  let language = safeLanguage(initialLanguage);
  let screen = VISITOR_SCREEN.HIDDEN;
  let cutsceneLevelIndex = 0;
  let effectCleanup = () => {};
  let dismissTimer = 0;
  let disposed = false;

  const overlay = document.createElement('div');
  overlay.id = 'visitor-overlay';
  overlay.hidden = true;
  overlay.inert = true;
  overlay.setAttribute('aria-hidden', 'true');
  root.appendChild(overlay);

  const t = (key) => COPY[language][key] ?? COPY.zh[key] ?? key;

  const notifyScreenChange = () => {
    root.dataset.visitorBlocking = String(screen !== VISITOR_SCREEN.HIDDEN);
    onScreenChange({
      screen,
      blocking: screen !== VISITOR_SCREEN.HIDDEN,
      levelIndex:
        screen === VISITOR_SCREEN.CUTSCENE
          ? cutsceneLevelIndex
          : null,
    });
  };

  const cleanupEffects = () => {
    effectCleanup();
    effectCleanup = () => {};
    window.clearTimeout(dismissTimer);
    dismissTimer = 0;
  };

  const renderTitle = () => {
    const circumference = 2 * Math.PI * 85;
    const arc = (circumference * 0.4).toFixed(1);
    const gap = (circumference * 0.6).toFixed(1);
    overlay.innerHTML = `
      <div class="vo-screen vo-title">
        ${mediaMarkup(TITLE_MEDIA, 'vo-title__bg')}
        <div class="vo-title__lang" aria-label="${escapeHtml(t('language'))}">
          <button class="vo-btn vo-btn--${language === 'zh' ? 'active' : 'ghost'} vo-lang-btn" data-lang="zh" type="button">中</button>
          <button class="vo-btn vo-btn--${language === 'en' ? 'active' : 'ghost'} vo-lang-btn" data-lang="en" type="button">EN</button>
        </div>
        <div class="vo-title__hero">
          <h1 class="vo-title__name" tabindex="-1" data-screen-title data-fx="letters" data-fx-dir="top" data-fx-delay="60" data-fx-from="100" data-fx-to="900">${escapeHtml(t('title'))}</h1>
          <p class="vo-title__sub" data-fx="letters" data-fx-delay="35" data-fx-from="200">${escapeHtml(t('subtitle'))}</p>
        </div>
        <nav class="vo-title__nav" aria-label="${escapeHtml(t('title'))}">
          <div class="vo-title__side vo-title__side--left">
            <button class="vo-btn vo-btn--ghost" data-action="settings" data-fx="letters" type="button">${escapeHtml(t('settings'))}</button>
          </div>
          <div class="vo-title__center">
            <div class="vo-title__ring-wrap" aria-hidden="true">
              <svg class="vo-title__ring" viewBox="0 0 200 200" fill="none">
                <circle class="vo-ring-track" cx="100" cy="100" r="85"></circle>
                <circle class="vo-ring-arc" cx="100" cy="100" r="85" stroke-dasharray="${arc} ${gap}"></circle>
              </svg>
            </div>
            <button class="vo-btn vo-btn--primary vo-title__start" data-action="start" data-fx="letters" type="button">${escapeHtml(t('start'))}</button>
          </div>
          <div class="vo-title__side vo-title__side--right">
            <button class="vo-btn vo-btn--ghost" data-action="concept" data-fx="letters" type="button">${escapeHtml(t('concept'))}</button>
            <button class="vo-btn vo-btn--ghost" data-action="credits" data-fx="letters" type="button">${escapeHtml(t('credits'))}</button>
          </div>
        </nav>
      </div>
    `;
  };

  const renderSettings = () => {
    overlay.innerHTML = `
      <div class="vo-screen vo-subscreen vo-settings">
        <header class="vo-subscreen__header">
          <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters" type="button">← ${escapeHtml(t('back'))}</button>
          <h1 tabindex="-1" data-screen-title data-fx="letters" data-fx-from="400" data-fx-to="900">${escapeHtml(t('settings'))}</h1>
        </header>
        <main class="vo-subscreen__body">
          <div class="vo-settings__row">
            <span data-fx="letters">${escapeHtml(t('language'))}</span>
            <div class="vo-lang-toggle">
              <button class="vo-btn ${language === 'zh' ? 'vo-btn--active' : 'vo-btn--ghost'}" data-lang="zh" type="button">中文</button>
              <button class="vo-btn ${language === 'en' ? 'vo-btn--active' : 'vo-btn--ghost'}" data-lang="en" type="button">EN</button>
            </div>
          </div>
        </main>
      </div>
    `;
  };

  const renderConcept = () => {
    overlay.innerHTML = `
      <div class="vo-screen vo-subscreen">
        <header class="vo-subscreen__header">
          <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters" type="button">← ${escapeHtml(t('back'))}</button>
          <h1 tabindex="-1" data-screen-title data-fx="letters" data-fx-from="400" data-fx-to="900">${escapeHtml(t('conceptTitle'))}</h1>
        </header>
        <main class="vo-subscreen__body">
          <p class="vo-body-text" data-fx="words" data-fx-from="300" data-fx-to="700">${lineBreaks(t('conceptBody'))}</p>
        </main>
      </div>
    `;
  };

  const renderCredits = () => {
    overlay.innerHTML = `
      <div class="vo-screen vo-subscreen">
        <header class="vo-subscreen__header">
          <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters" type="button">← ${escapeHtml(t('back'))}</button>
          <h1 tabindex="-1" data-screen-title data-fx="letters" data-fx-from="400" data-fx-to="900">${escapeHtml(t('creditsTitle'))}</h1>
        </header>
        <main class="vo-subscreen__body">
          <p class="vo-body-text" data-fx="words" data-fx-from="300" data-fx-to="700">${lineBreaks(t('creditsBody'))}</p>
        </main>
      </div>
    `;
  };

  const renderCutscene = () => {
    const level = levels[cutsceneLevelIndex] ?? {};
    const copy = resolveVisitorLevelCopy(
      levels,
      cutsceneLevelIndex,
      language,
    );
    const media = levelMedia(level, cutsceneLevelIndex);
    const mediaHtml = mediaMarkup(media, 'vo-cutscene__bg');
    const classes = [
      'vo-screen',
      'vo-cutscene',
      `vo-cutscene--level-${cutsceneLevelIndex + 1}`,
      mediaHtml ? 'vo-cutscene--media' : 'vo-cutscene--fallback',
      media?.tone === 'bright' ? 'vo-cutscene--bright' : '',
      media?.flipY === false ? 'vo-cutscene--no-flip' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const backButton =
      cutsceneLevelIndex === 0
        ? `<button class="vo-btn vo-btn--back vo-cutscene__back" data-action="back" data-fx="letters" type="button">← ${escapeHtml(t('back'))}</button>`
        : '';

    overlay.innerHTML = `
      <section class="${classes}" data-level="${cutsceneLevelIndex}">
        ${mediaHtml}
        ${backButton}
        <div class="vo-cutscene__content">
          <p class="vo-cutscene__level-tag" data-fx="letters" data-fx-delay="30">${String(cutsceneLevelIndex + 1).padStart(2, '0')} / ${String(levels.length || 3).padStart(2, '0')}</p>
          <h1 class="vo-cutscene__title" tabindex="-1" data-screen-title data-fx="letters" data-fx-dir="top" data-fx-from="300" data-fx-to="900">${escapeHtml(copy.title)}</h1>
          <p class="vo-cutscene__story" data-fx="words" data-fx-from="300" data-fx-to="700">${lineBreaks(copy.story)}</p>
        </div>
        <button class="vo-btn vo-btn--primary vo-cutscene__cta" data-action="continue" data-fx="letters" type="button">${escapeHtml(copy.cta)}</button>
      </section>
    `;
  };

  const renderEnd = () => {
    overlay.innerHTML = `
      <section class="vo-screen vo-end">
        <div class="vo-end__content">
          <h1 class="vo-end__title" tabindex="-1" data-screen-title data-fx="letters" data-fx-dir="top" data-fx-delay="50" data-fx-from="300" data-fx-to="900">${escapeHtml(t('endTitle'))}</h1>
          <p class="vo-end__body" data-fx="words" data-fx-from="300" data-fx-to="700">${lineBreaks(t('endBody'))}</p>
        </div>
        <button class="vo-btn vo-btn--ghost" data-action="restart" data-fx="letters" type="button">${escapeHtml(t('restart'))}</button>
      </section>
    `;
  };

  const render = (direction = null) => {
    if (disposed || screen === VISITOR_SCREEN.HIDDEN) return;
    cleanupEffects();
    overlay.classList.remove('vo-shell--dismissing');
    overlay.hidden = false;
    overlay.inert = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.dataset.screen = screen;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';

    switch (screen) {
      case VISITOR_SCREEN.TITLE:
        renderTitle();
        break;
      case VISITOR_SCREEN.SETTINGS:
        renderSettings();
        break;
      case VISITOR_SCREEN.CONCEPT:
        renderConcept();
        break;
      case VISITOR_SCREEN.CREDITS:
        renderCredits();
        break;
      case VISITOR_SCREEN.CUTSCENE:
        renderCutscene();
        break;
      case VISITOR_SCREEN.END:
        renderEnd();
        break;
      default:
        return;
    }

    wireMediaFallback(overlay);
    effectCleanup = applyTextEffects(overlay);
    const content = overlay.firstElementChild;
    if (
      content &&
      direction &&
      SWEEP_SCREENS.has(screen) &&
      !prefersReducedMotion()
    ) {
      content.classList.add(
        direction.includes('ccw')
          ? 'vo-sweep-reveal--ccw'
          : 'vo-sweep-reveal--cw',
      );
    }
    focusScreen(overlay);
    notifyScreenChange();
  };

  const setScreen = (nextScreen, direction = null) => {
    if (!VISITOR_OWNED_SCREENS.includes(nextScreen)) {
      throw new RangeError(`Visitor shell cannot own screen ${nextScreen}.`);
    }
    screen = nextScreen;
    render(direction);
  };

  const hide = ({ animate = true } = {}) => {
    if (disposed || screen === VISITOR_SCREEN.HIDDEN) return;
    cleanupEffects();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(dismissTimer);
      dismissTimer = 0;
      overlay.classList.remove('vo-shell--dismissing');
      overlay.hidden = true;
      overlay.inert = true;
      overlay.setAttribute('aria-hidden', 'true');
      overlay.replaceChildren();
      screen = VISITOR_SCREEN.HIDDEN;
      overlay.dataset.screen = screen;
      notifyScreenChange();
    };
    const content = overlay.firstElementChild;
    if (!animate || prefersReducedMotion() || !content) {
      finish();
      return;
    }
    overlay.classList.add('vo-shell--dismissing');
    content.classList.add('vo-sweep-exit--cw');
    content.addEventListener('animationend', (event) => {
      if (event.target === content) finish();
    });
    dismissTimer = window.setTimeout(finish, 750);
  };

  const showTitle = (direction = 'ccw') => {
    setScreen(VISITOR_SCREEN.TITLE, direction);
  };

  const showCutscene = (levelIndex, direction = 'cw') => {
    cutsceneLevelIndex = normalizeLevelIndex(
      levelIndex,
      Math.max(1, levels.length),
    );
    setScreen(VISITOR_SCREEN.CUTSCENE, direction);
  };

  const showEnd = (direction = 'cw') => {
    setScreen(VISITOR_SCREEN.END, direction);
  };

  const handleAction = (action) => {
    if (action === 'start') {
      try {
        onBeginExperience();
        showCutscene(0, 'cw');
      } catch (error) {
        console.error('[visitor shell] Failed to begin experience.', error);
      }
      return;
    }
    if (action === 'settings') {
      setScreen(VISITOR_SCREEN.SETTINGS, 'ccw');
      return;
    }
    if (action === 'concept') {
      setScreen(VISITOR_SCREEN.CONCEPT, 'cw');
      return;
    }
    if (action === 'credits') {
      setScreen(VISITOR_SCREEN.CREDITS, 'cw');
      return;
    }
    if (action === 'back') {
      if (screen === VISITOR_SCREEN.CUTSCENE) onReturnToTitle();
      showTitle(screen === VISITOR_SCREEN.SETTINGS ? 'cw' : 'ccw');
      return;
    }
    if (action === 'continue') {
      try {
        onEnterLevel(cutsceneLevelIndex);
        hide({ animate: true });
      } catch (error) {
        console.error('[visitor shell] Failed to reveal Game UI.', error);
      }
      return;
    }
    if (action === 'restart') {
      onReturnToTitle();
      showTitle('ccw');
    }
  };

  const handleClick = (event) => {
    const languageButton = event.target.closest('button[data-lang]');
    if (languageButton) {
      language = safeLanguage(languageButton.dataset.lang);
      render();
      return;
    }
    const actionButton = event.target.closest('button[data-action]');
    if (actionButton) handleAction(actionButton.dataset.action);
  };

  overlay.addEventListener('click', handleClick);

  const previousDownstream = window.downstream;
  const downstreamApi = {
    ...(previousDownstream && typeof previousDownstream === 'object'
      ? previousDownstream
      : {}),
    title: () => showTitle(),
    cutscene: (index) => showCutscene(index),
    end: () => showEnd(),
    setLang: (nextLanguage) => {
      language = safeLanguage(nextLanguage);
      if (screen !== VISITOR_SCREEN.HIDDEN) render();
    },
  };
  window.downstream = downstreamApi;

  showTitle(null);

  return {
    get screen() {
      return screen;
    },
    get blocking() {
      return screen !== VISITOR_SCREEN.HIDDEN;
    },
    get language() {
      return language;
    },
    showTitle,
    showCutscene,
    showEnd,
    hide,
    dispose() {
      if (disposed) return;
      disposed = true;
      cleanupEffects();
      overlay.removeEventListener('click', handleClick);
      overlay.remove();
      delete root.dataset.visitorBlocking;
      if (window.downstream !== downstreamApi) return;
      if (previousDownstream === undefined) {
        delete window.downstream;
      } else {
        window.downstream = previousDownstream;
      }
    },
  };
}
