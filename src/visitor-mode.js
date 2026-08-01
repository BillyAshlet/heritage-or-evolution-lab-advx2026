// Presentation-only visitor shell.
//
// GameSession and GameUI remain the sole owners of traits, timers, reports,
// verdicts and inheritance. This module owns only the title/menu, narrative
// cutscenes and the final experience screen.

import { mountTitleFish } from './title-fish.js';

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

// Resolves a public/ asset against the deploy base. Vite rewrites asset
// URLs it can see in CSS/HTML, but NOT string literals in JS — a bare
// '/output/video/x.m4v' stays absolute and 404s wherever the site is not
// served from the domain root (project pages, /downstream/ subpaths...),
// which looks exactly like "the video never loads" on the deployed build.
const asset = (path) =>
  `${import.meta.env.BASE_URL}${path}`.replace(/([^:])\/{2,}/g, '$1/');

// A6 reading brochure, published to public/output/pdf/. Downloaded via
// the title menu; goes through asset() so it resolves on any deploy base.
const BROCHURE_PDF = Object.freeze({
  src: asset('output/pdf/downstream-brochure-reading-a6.pdf'),
  filename: 'Downstream-下游-introduction.pdf',
});

const TITLE_MEDIA = Object.freeze({
  // Web-compressed asset published from public/output/video/. The 30–40 MB .mov
  // masters stay out via .gitignore, so this can run enabled.
  src: asset('output/video/inheritance-lab-loop.m4v'),
  enabled: true,
});

const FALLBACK_LEVEL_MEDIA = Object.freeze([
  Object.freeze({
    src: asset('output/video/predator-shadow-loop.m4v'),
    enabled: true,
    tone: 'dark',
    flipY: true,
  }),
  Object.freeze({
    src: asset('output/video/golden-age-pixel-dawn-loop.m4v'),
    enabled: true,
    tone: 'bright',
    flipY: true,
  }),
  Object.freeze({
    src: asset('output/video/drained-paradise-loop.m4v'),
    enabled: true,
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
    developer: '开发者模式',
    moreAbout: '了解更多（下载介绍册）',
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
    developer: 'Developer Mode',
    moreAbout: 'More About (Download Introduction PDF)',
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

const CONCEPT_ZH_MARKDOWN = `# 下游 / Downstream

逝者如斯——彼时的最优解，或是下一代的桎梏。

## 引子

家里不缺钱，老太太却每天把纸箱和塑料瓶捡回来，堆满阳台；三十七度的夏天，她舍不得开空调，一边摇扇子一边说"吹风扇就够了"。你劝不动她，甚至有点恼火——**这不是不可理喻吗？**

饭桌另一头，长辈放下筷子说：现在的年轻人就是不肯吃苦，我们那时候什么都没有，胆子大一点、肯干一点，房子车子不都有了？机会遍地都是，是你们不够努力。你没有反驳，只是低下头——**这不是不可理喻吗？**

都不是。捡纸箱的手，是被一个物资匮乏的年代训练出来的：在那里，极限节省是最优解，它救过命。"努力就有收获"的信念，是被一个高速上升的年代验证过的：在那里，胆大确实等于发财。他们没有错，只是**他们身体里住着的那个时代，已经不在了**——而他们把那个时代的生存策略，原封不动地递给了你。

「下游」把这个过程做成了一场可以亲手经历的实验。玩家在了解 boids 鱼群算法如何让群体行为自发涌现的同时，也会亲手制造出这些现象的成因：**为一群鱼选择三代进化方向，看着每一代无可指摘的最优解，如何一步步变成下一代身上解不开的桎梏。**

## 概念

「下游」是一件关于**代际继承**的叙事交互装置。它的概念取自两处：

其一是布迪厄（Pierre Bourdieu）的**惯习（habitus）**。布迪厄说，惯习是"被结构的结构，同时又是促结构的结构"（structured structures functioning as structuring structures）——上一代在特定生存境况中习得的策略，不会停留在"经验"层面，而是内化进身体，融于血肉，成为下一代**与生俱来的身体倾向**：还没有思考，身体已经先做了选择。惯习是历史被遗忘的方式——它把过去变成了本能。

其二是中文语境里**遗产的双面性**：遗产既是馈赠，也是债务。你继承一笔财富的同时也继承了它的抵押；正如在精神上，你继承一种品质的同时，往往也继承了铸成它的那道创伤。节俭是馈赠，节俭背后的匮乏恐惧是债务——二者签在同一份契约上，无法只签一半。

## 玩法

玩家扮演实验员，站在一群鱼的时间上游。鱼群由 **boids 算法**驱动——每条鱼只遵循分离、对齐、凝聚三条局部规则，群体行为自发涌现，不受任何个体剧本控制；正如没有人"设计"过一代人的性格，它只是从千万次局部互动中涌现出来。

玩家不控制任何一条鱼，玩家选择的是**进化方向**：每代开局时，在一个三角形控制器上，于**速度、体型、耐力**之间做一次**真实的此消彼长的取舍**——强化任何一项，另外两项必然被削弱，没有全都要的位置。随后参数锁死，玩家只能旁观这一代在生存压力下的结局。

关键在于继承规则：每一次取舍都会**永久地改变下一代参数的调节权重**——本代的取舍与历代累计系数逐项相乘，强制继承、不可回档。下一代不是从白纸出发，而是从历代选择的**连乘积**出发：上一代压缩过的方向，这一代要付出加倍的代价才能扳回来，而扳回的动作本身又会挤压别的方向。这正是融于血肉的惯习与路径依赖的机械本体——**你调节的不是这一代的鱼，而是下一代还能怎样调节自己的余地。**

## 水面之下：为叙事而生的模拟

「下游」的鱼不是动画，是模拟。我们在经典 boids 三力（分离、对齐、凝聚）之上，自行生长出一套两层捕食-逃逸生态：

- **两层捕猎力**：大半径的猎物群凝聚让捕食者远远地被鱼群吸引；进入小半径后锁定单条猎物、权重陡增，进入 burst 冲刺——追逐因此有了"盯上你了"的戏剧张力，而不是粒子间的随机碰撞。
- **恐慌的社会传播**：被盯上的鱼发出离散的警报脉冲，沿邻居网络扩散成肉眼可见的惊扰波；脉冲带指数衰减和不应期，恐慌会平息，不会无限回响——就像谣言与创伤在人群中的传播方式。
- **感知是局部的**：捕猎与恐慌只在局部半径内触发，半径之外捕食者就是一条普通的鱼。没有全局导航，没有上帝视角——每条鱼都只活在自己看得见的那一小片水里，正如每一代人都只活在自己经历过的那个时代里。

这套机制存在的唯一理由是一条红线：**死因必须来自真实模拟。** 当第三代的鱼被吃掉时，那是一次真实发生的追逐、恐慌与力竭——所以当玩家回头指认第一代的选择时，那份因果是算出来的，不是编出来的。

## 三代

三代压力对应三个真实的时代切面，也构成一个环环相扣的连环套：

**一、不周山**
> 共工怒触不周山，天倾西北，地陷东南。——《淮南子》

天塌地陷、物资极度匮乏的年代（暗指新中国建设时期）。捕食者环伺，食物不多但勉强充饥，获胜的存活线放得很低——活下来就是胜利。玩家几乎必然倾向**减小体型、把余量押给耐力或速度**：小的身体消耗少、跑得快，这是匮乏年代无可指摘的最优解。

**二、黄金时代**
> 这是最好的时代，这是最坏的时代。——狄更斯《双城记》

机会遍地的膨胀年代（暗指千禧年前后、房地产蓬勃时期）。浮游生物不够吃，捕食者却很少，水里出现了一群**原本与你平行的鱼**；获胜的存活线陡然抬高——温饱不再是及格线，扩张才是。环境引导玩家**增大体型，去捕食昨天还与自己平级的对手**。但债务的第一次利息在此结清：因为第一代把权重押给了耐力或速度，这一代的体型是在被压缩过的基数上扳回的——增大体型必然再度 trade off 掉耐力或速度中的一项。胆大者赢，但赢的账单记在了下一代名下。

**三、东海车辙**
> 周昨来，有中道而呼者……曰："我，东海之波臣也。君岂有斗升之水而活我哉？"——《庄子·外物》

曾经畅游东海的鱼，如今困于车辙的一洼水中（暗指当代，某种后疫情时代）。食物与捕食者同时减少，整个水体活动降低——不是激烈的绞杀，是漫长的低温。此时的正解是**增加耐力、压低长期代谢**，熬过去。但连环套在此收口：耐力在第一代被透支、速度或耐力又在第二代被交易，玩家环顾三角形，可能发现唯一还有余量可以卖出的只剩**体型**——而一旦缩小体型，那群本来可以和平相处的平行鱼，就在体型差跨过阈值的一瞬间，**变成了捕食你的鱼**。没有新的敌人入场，敌人是你自己的历代取舍在旧邻居身上折射出来的。债务，此刻显形。

三代没有任何一步是玩家犯错：每一步都是当时局面下的理性选择。反噬不来自愚蠢，来自**时间**。

## 核心哲学

现在可以回答引子里的那两个"不可理喻"了。

捡纸箱的老太太，是从不周山游过来的鱼：匮乏年代把"把需求压到最低"刻进了她的身体，时代变了，身体没有变。劝你胆大努力的长辈，是黄金时代的赢家：他们的策略被那个上升期真实地验证过，所以他们无法相信同一套动作在下行的水温里会失灵。**没有哪种策略天然正确，策略只在孕育它的时代里正确。** 但策略对下一代的塑造是真实的、物质的、不可撤销的。这正是三个相互勾连的理论所共同描述的困境：

- **惯习（布迪厄）**：策略经由身体代际传递。惯习天然带有"滞后效应"（hysteresis）——它总是为一个已经消失的世界做好了准备。
- **路径依赖（Paul David / Brian Arthur）**：早期选择通过收益递增自我锁定（lock-in）。QWERTY 键盘早已不是最优布局，却因为每一代人都在它上面训练手指而无法废除；游戏里的乘法继承就是这种锁定的直译——每一代都只能在上一代的连乘积之上做微调，永远回不到原点。
- **反脆弱（塔勒布）**：对单一环境的极致优化就是对环境变化的极致脆弱。一代人越是完美适应他们的时代，他们留给下游的身体就越是过拟合（overfitting）——在演化的适应度地形上，爬上局部峰顶的种群，恰恰最难走向新的高峰。

再往上追一层是曼海姆（Karl Mannheim）《代的问题》：一"代"人之所以为一代，是因为他们在人格成型期共享了同一组历史事件——不周山的一代、黄金时代的一代、东海车辙的一代，各自被不同的水文塑形，却在同一条河里相遇、彼此不解。

「下游」不为任何一代辩护，也不审判任何一代。它只是让玩家亲手扮演一次"上游"，然后站在下游，看着水流过来。当第三代的鱼被那群本可以和平相处的鱼吃掉时，玩家无法愤怒——**因为导致这一切的每个选择，在当时确实都是对的。**

## 耐力，或休息的债

三代里唯一贯穿始终的暗线，是**耐力（stamina）——它就是恢复能力**：代谢多快见底、能量多快回满、能不能扛过食物稀薄的长夜。

回看三代：不周山的匮乏教会鱼群透支恢复力去换速度；黄金时代教会它们透支恢复力去换扩张；直到东海车辙——那个整体降速、必须靠"熬"活下来的时代——玩家才发现，恢复力是唯一还不起的债。L3 唯一稳定的活法，恰恰是把耐力加满、什么都不争：让鱼群慢下来、少动、恢复。**在这个时代，休息本身就是生存策略。**

这也是「下游」想对屏幕外的人说的话：休息不是可以永远向后代赊账的资源。每一次牺牲恢复力换来的"最优解"，都会在下一个时代连本带利显形——对一群鱼如此，对连轴转的一代人也如此。

**关键词：** boids 算法 · 模拟进化 · 代际选择 · 惯习（habitus） · 路径依赖 · 反脆弱 · 休息与恢复 · 交互装置`;

const SWEEP_SCREENS = new Set(VISITOR_OWNED_SCREENS);
const FX_RING_RADIUS = 90;
const TITLE_FISH_DETECTION_RADIUS = FX_RING_RADIUS;
const FX_PUSH_REACH = 3;
const FX_MAX_PUSH = 12;
const FX_DAMP = 0.16;
const FX_FOLLOW = 0.18;
const AUTO_SWEEP_DURATION = 1800;
const AUTO_SWEEP_DELAYS = Object.freeze([3000, 5000, 7000]);

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

function inlineConceptMarkup(value) {
  return escapeHtml(value).replace(
    /\*\*(.+?)\*\*/g,
    '<strong>$1</strong>',
  );
}

function conceptMarkup(source) {
  const blocks = [];
  let paragraph = [];
  let list = [];
  let quote = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      `<p>${inlineConceptMarkup(paragraph.join(' '))}</p>`,
    );
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      `<ul>${list
        .map((item) => `<li>${inlineConceptMarkup(item)}</li>`)
        .join('')}</ul>`,
    );
    list = [];
  };
  const flushQuote = () => {
    if (!quote.length) return;
    blocks.push(
      `<blockquote>${quote.map(inlineConceptMarkup).join('<br>')}</blockquote>`,
    );
    quote = [];
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flushAll();
      continue;
    }
    if (line.startsWith('# ')) {
      flushAll();
      blocks.push(
        `<h1 class="vo-concept__title">${inlineConceptMarkup(line.slice(2))}</h1>`,
      );
      continue;
    }
    if (line.startsWith('## ')) {
      flushAll();
      blocks.push(`<h2>${inlineConceptMarkup(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      flushQuote();
      list.push(line.slice(2));
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      flushList();
      quote.push(line.slice(2));
      continue;
    }
    const subheading = line.match(/^\*\*(.+)\*\*$/);
    if (subheading) {
      flushAll();
      blocks.push(`<h3>${escapeHtml(subheading[1])}</h3>`);
      continue;
    }
    flushList();
    flushQuote();
    paragraph.push(line);
  }
  flushAll();
  return blocks.join('');
}

function mediaMarkup(media, className) {
  if (!media?.enabled || !media.src) return '';
  const src = escapeHtml(media.src);
  const extension = String(media.src).split('.').at(-1)?.toLowerCase();
  if (['mp4', 'm4v', 'webm', 'ogg'].includes(extension)) {
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

// Deep-clones a screen and freezes its live media into still frames, so the
// clone can act as a curtain after the original is torn down.
function snapshotScreen(el) {
  if (!el) return null;
  const clone = el.cloneNode(true);
  const liveMedia = el.querySelectorAll('video, canvas');
  const cloneMedia = clone.querySelectorAll('video, canvas');
  liveMedia.forEach((src, index) => {
    const cw = src.clientWidth || 1;
    const ch = src.clientHeight || 1;
    const frame = document.createElement('canvas');
    frame.width = cw;
    frame.height = ch;
    frame.className = src.className; // inherit position/opacity CSS
    try {
      const vw = src.videoWidth || src.width || cw;
      const vh = src.videoHeight || src.height || ch;
      const scale = Math.max(cw / vw, ch / vh); // object-fit: cover
      frame
        .getContext('2d')
        .drawImage(
          src,
          (cw - vw * scale) / 2,
          (ch - vh * scale) / 2,
          vw * scale,
          vh * scale,
        );
    } catch {
      /* tainted/blank source — keep the transparent frame */
    }
    cloneMedia[index]?.replaceWith(frame);
  });
  for (const span of clone.querySelectorAll('.vo-blur-word')) {
    span.style.animation = 'none';
    span.style.opacity = '1';
  }
  return clone;
}

// Composite reveal for era changes. Two curtains carrying a snapshot of the
// OUTGOING screen sit above the freshly rendered one and animate away
// together, so the swap reads old→new directly, never through a blank frame:
//   · .vo-wipe-ring — thick annulus; its snapshot is eaten by a conic sweep
//   · .vo-wipe-flat — inner disc + outside; eaten by a horizontal wipe
// Geometry, duration and easing live in visitor.css (--vo-wipe-* vars).
function runRingWipe(overlay, forward, snapFlat, snapRing) {
  const flat = document.createElement('div');
  flat.className = `vo-wipe-flat vo-wipe-flat--${forward ? 'fwd' : 'back'}`;
  if (snapFlat) flat.appendChild(snapFlat);
  const ring = document.createElement('div');
  ring.className = 'vo-wipe-ring';
  const sweep = document.createElement('div');
  sweep.className = `vo-wipe-sweep vo-wipe-sweep--${forward ? 'cw' : 'ccw'}`;
  if (snapRing) sweep.appendChild(snapRing);
  ring.appendChild(sweep);
  overlay.append(flat, ring);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    flat.remove();
    ring.remove();
  };
  // Snapshot descendants bubble their own animationend — only the flat
  // curtain's clip-path animation counts. The timeout covers the case where
  // a re-render nukes the curtains before animationend can fire.
  flat.addEventListener('animationend', (event) => {
    if (event.target === flat) done();
  });
  window.setTimeout(done, 1200);
}

function prefersReducedMotion() {
  return (
    typeof window === 'object' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function setupVariableProximity(
  overlay,
  targets,
  pointerFollower = null,
  { autoTextSweep = false } = {},
) {
  const list = targets.map((target) => ({
    ...target,
    spans: [...target.element.querySelectorAll('.vo-blur-word')],
  }));
  const autoList = list.filter(({ element }) =>
    element.matches('.vo-title__name'),
  );
  const manualOnlyList = list.filter(({ element }) =>
    !element.matches('.vo-title__name'),
  );
  if (!list.length && !pointerFollower) return () => {};

  const ring = document.createElement('div');
  ring.className = 'vo-cursor-ring';
  ring.style.width = ring.style.height = `${FX_RING_RADIUS * 2}px`;
  overlay.appendChild(ring);

  const mouse = { x: 0, y: 0 };
  const cursor = { x: 0, y: 0 };
  let hasMouse = false;
  let raf = 0;
  let autoSweepStartedAt = null;

  const randomAutoDelay = () =>
    AUTO_SWEEP_DELAYS[
      Math.floor(Math.random() * AUTO_SWEEP_DELAYS.length)
    ];
  let nextAutoSweepAt = performance.now() + randomAutoDelay();

  const easeInOutQuad = (progress) =>
    progress < 0.5
      ? 2 * progress * progress
      : 1 - ((-2 * progress + 2) ** 2) / 2;

  const updateText = (targetList, x = null, y = null) => {
    for (const { element, fromWeight, toWeight, spans } of targetList) {
      if (!element.isConnected) continue;
      for (const span of spans) {
        const state =
          span._visitorFx ??
          (span._visitorFx = { weight: fromWeight, tx: 0, ty: 0 });
        let targetWeight = fromWeight;
        let targetX = 0;
        let targetY = 0;

        if (x !== null && y !== null) {
          const bounds = span.getBoundingClientRect();
          const dx =
            bounds.left + bounds.width / 2 - state.tx - x;
          const dy =
            bounds.top + bounds.height / 2 - state.ty - y;
          const distance = Math.hypot(dx, dy) || 1;

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

  const frame = (now) => {
    raf = requestAnimationFrame(frame);

    if (hasMouse) {
      cursor.x += (mouse.x - cursor.x) * FX_FOLLOW;
      cursor.y += (mouse.y - cursor.y) * FX_FOLLOW;
      ring.style.transform =
        `translate(${cursor.x - FX_RING_RADIUS}px, ${cursor.y - FX_RING_RADIUS}px)`;
      ring.classList.add('vo-cursor-ring--on');
      pointerFollower?.setCohesionPointer?.(cursor.x, cursor.y, true);
    }

    if (autoTextSweep && autoList.length && now >= nextAutoSweepAt) {
      autoSweepStartedAt ??= now;
      const progress = Math.min(
        1,
        (now - autoSweepStartedAt) / AUTO_SWEEP_DURATION,
      );
      const bounds = autoList[0].element.getBoundingClientRect();
      const x =
        bounds.left -
        FX_RING_RADIUS +
        (bounds.width + FX_RING_RADIUS * 2) *
          easeInOutQuad(progress);
      updateText(autoList, x, bounds.top + bounds.height / 2);
      if (hasMouse) {
        updateText(manualOnlyList, cursor.x, cursor.y);
      } else {
        updateText(manualOnlyList);
      }

      if (progress >= 1) {
        autoSweepStartedAt = null;
        nextAutoSweepAt = now + randomAutoDelay();
      }
      return;
    }

    if (hasMouse) {
      updateText(list, cursor.x, cursor.y);
    } else {
      updateText(list);
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
    pointerFollower?.clearCohesionPointer?.();
  };

  window.addEventListener('mousemove', onMove);
  document.documentElement.addEventListener('mouseleave', onLeave);
  window.addEventListener('blur', onLeave);
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    pointerFollower?.clearCohesionPointer?.();
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

function applyTextEffects(
  overlay,
  pointerFollower = null,
  options = {},
) {
  const targets = [];
  if (!prefersReducedMotion()) {
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
  }
  return setupVariableProximity(
    overlay,
    targets,
    pointerFollower,
    options,
  );
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
  onEnterDeveloperMode = () => {},
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
  let titleFishHandle = null;
  let titleFishCleanup = () => {};
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
    // The title flock owns a THREE renderer + rAF loop; leaking one per
    // screen change would stack renderers behind every later screen.
    titleFishCleanup();
    window.clearTimeout(dismissTimer);
    dismissTimer = 0;
  };

  const renderTitle = () => {
    const circumference = 2 * Math.PI * 85;
    const arc = (circumference * 0.4).toFixed(1);
    const gap = (circumference * 0.6).toFixed(1);
    // Same media/fallback gating the cutscene uses: the fallback gradient
    // is opaque, so it must not paint when there is real footage behind it.
    const titleMediaHtml = mediaMarkup(TITLE_MEDIA, 'vo-title__bg');
    overlay.innerHTML = `
      <div class="vo-screen vo-title ${titleMediaHtml ? 'vo-title--media' : 'vo-title--fallback'}">
        ${titleMediaHtml}
        <canvas class="vo-title__fish" aria-hidden="true"></canvas>
        <div class="vo-title__lang" aria-label="${escapeHtml(t('language'))}">
          <button class="vo-btn vo-btn--${language === 'zh' ? 'active' : 'ghost'} vo-lang-btn" data-lang="zh" type="button">中</button>
          <button class="vo-btn vo-btn--${language === 'en' ? 'active' : 'ghost'} vo-lang-btn" data-lang="en" type="button">EN</button>
        </div>
        <div class="vo-title__hero">
          <h1 class="vo-title__name" tabindex="-1" data-screen-title data-fx="letters" data-fx-dir="top" data-fx-delay="60" data-fx-from="100" data-fx-to="900">${escapeHtml(t('title'))}</h1>
          <p class="vo-title__sub" data-fx="letters" data-fx-delay="35" data-fx-from="200">${escapeHtml(t('subtitle'))}</p>
        </div>
        <button class="vo-title__portal" data-action="start" type="button">
          <svg class="vo-title__ring" viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <circle class="vo-ring-track" cx="100" cy="100" r="85"></circle>
            <circle class="vo-ring-arc" cx="100" cy="100" r="85" stroke-dasharray="${arc} ${gap}"></circle>
          </svg>
          <span class="vo-title__start" data-fx="letters">${escapeHtml(t('start'))}</span>
        </button>
        <nav class="vo-title__menu" aria-label="${escapeHtml(t('title'))}">
          <button class="vo-menu-link" data-action="concept" type="button">
            <span class="vo-menu-link__idx">01</span><span data-fx="letters">${escapeHtml(t('concept'))}</span>
          </button>
          <button class="vo-menu-link" data-action="credits" type="button">
            <span class="vo-menu-link__idx">02</span><span data-fx="letters">${escapeHtml(t('credits'))}</span>
          </button>
          <button class="vo-menu-link" data-action="settings" type="button">
            <span class="vo-menu-link__idx">03</span><span data-fx="letters">${escapeHtml(t('settings'))}</span>
          </button>
          <button class="vo-menu-link" data-action="developer" type="button">
            <span class="vo-menu-link__idx">04</span><span data-fx="letters">${escapeHtml(t('developer'))}</span>
          </button>
          <a class="vo-menu-link" href="${escapeHtml(BROCHURE_PDF.src)}"
             download="${escapeHtml(BROCHURE_PDF.filename)}">
            <span class="vo-menu-link__idx">05</span><span data-fx="letters">${escapeHtml(t('moreAbout'))}</span>
          </a>
        </nav>
      </div>
    `;
    // Interactive boid flock on the title screen — the pointer attracts it.
    // Disposed via titleFishCleanup on every screen change.
    titleFishCleanup();
    const fishCanvas = overlay.querySelector('.vo-title__fish');
    if (fishCanvas) {
      const handle = mountTitleFish(fishCanvas, {
        count: 16,
        cohesionRadius: TITLE_FISH_DETECTION_RADIUS,
      });
      titleFishHandle = handle;
      titleFishCleanup = () => {
        handle?.dispose?.();
        if (titleFishHandle === handle) titleFishHandle = null;
        titleFishCleanup = () => {};
      };
    }
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
    const body =
      language === 'zh'
        ? conceptMarkup(CONCEPT_ZH_MARKDOWN)
        : `<p>${lineBreaks(t('conceptBody'))}</p>`;
    overlay.innerHTML = `
      <div class="vo-screen vo-subscreen vo-concept">
        <header class="vo-subscreen__header">
          <button class="vo-btn vo-btn--back" data-action="back" data-fx="letters" type="button">← ${escapeHtml(t('back'))}</button>
          <h1 tabindex="-1" data-screen-title data-fx="letters" data-fx-from="400" data-fx-to="900">${escapeHtml(t('conceptTitle'))}</h1>
        </header>
        <main class="vo-subscreen__body">
          <article class="vo-concept__article">${body}</article>
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
    // Snapshot the outgoing screen BEFORE it is torn down, so a ring wipe
    // can carry it as a curtain over the incoming one (no blank frame).
    const outgoing =
      direction && direction.startsWith('ring') && !prefersReducedMotion()
        ? snapshotScreen(overlay.firstElementChild)
        : null;
    const outgoingRing = outgoing ? snapshotScreen(overlay.firstElementChild) : null;
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
    effectCleanup = applyTextEffects(overlay, titleFishHandle, {
      autoTextSweep:
        language === 'en' && screen === VISITOR_SCREEN.TITLE,
    });
    const content = overlay.firstElementChild;
    if (outgoing) {
      // Era change: composite ring wipe instead of the plain conic sweep.
      runRingWipe(overlay, !direction.includes('ccw'), outgoing, outgoingRing);
    } else if (
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

  // Entering a generation is an era change — default to the ring wipe.
  const showCutscene = (levelIndex, direction = 'ring-cw') => {
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
        // Era change → composite ring wipe, not the plain conic sweep.
        showCutscene(0, 'ring-cw');
      } catch (error) {
        console.error('[visitor shell] Failed to begin experience.', error);
      }
      return;
    }
    if (action === 'settings') {
      setScreen(VISITOR_SCREEN.SETTINGS, 'ccw');
      return;
    }
    if (action === 'developer') {
      try {
        onEnterDeveloperMode();
        hide({ animate: true });
      } catch (error) {
        console.error('[visitor shell] Failed to enter developer mode.', error);
      }
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
