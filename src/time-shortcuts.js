const DOUBLE_SPACE_MS = 150;

export function resolveTimeShortcut({
  code,
  now,
  lastSpaceAt = -Infinity,
  hasPendingSpace = false,
  doubleSpaceMs = DOUBLE_SPACE_MS,
}) {
  if (code === 'Enter') return 'double-speed';
  if (code !== 'Space') return 'ignore';
  if (hasPendingSpace && now - lastSpaceAt < doubleSpaceMs) return 'pause';
  return 'slow-motion';
}

export function isEditableShortcutTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tagName = String(target.tagName ?? '').toUpperCase();
  return (
    ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(tagName) ||
    Boolean(target.isContentEditable) ||
    Boolean(target.closest?.('[contenteditable="true"]'))
  );
}

export class TimeShortcutController {
  constructor({
    root = document.getElementById('app'),
    target = window,
    setTimeScale,
    doubleSpaceMs = DOUBLE_SPACE_MS,
  }) {
    this.root = root;
    this.target = target;
    this.setTimeScale = setTimeScale;
    this.doubleSpaceMs = doubleSpaceMs;
    this.pendingSpace = null;
    this.lastSpaceAt = -Infinity;
    this.hud = this._createHud();
    this.valueLabel = this.hud.querySelector('#time-shortcut-value');
    this.lastDisplayedValue = null;
    this.onKeyDown = (event) => this._handleKeyDown(event);
    target.addEventListener('keydown', this.onKeyDown);
    this.update(1);
  }

  _createHud() {
    const hud = document.createElement('section');
    hud.id = 'time-shortcut-hud';
    hud.setAttribute('aria-label', '时间快捷键');
    hud.innerHTML = `
      <strong id="time-shortcut-value">1×</strong>
      <span>ENTER&nbsp; 2×</span>
      <span>SPACE&nbsp; 0.2×</span>
      <span>SPACE×2&nbsp; PAUSE</span>
    `;
    this.root.appendChild(hud);
    return hud;
  }

  _apply(value) {
    const applied = this.setTimeScale(value);
    this.update(applied ?? value);
  }

  _handleKeyDown(event) {
    if (
      event.repeat ||
      event.defaultPrevented ||
      isEditableShortcutTarget(event.target)
    ) {
      return;
    }
    const code =
      event.code === 'Enter' || event.key === 'Enter'
        ? 'Enter'
        : event.code === 'Space' || event.key === ' '
          ? 'Space'
          : event.code;
    const now = Number.isFinite(event.timeStamp)
      ? event.timeStamp
      : performance.now();
    const action = resolveTimeShortcut({
      code,
      now,
      lastSpaceAt: this.lastSpaceAt,
      hasPendingSpace: this.pendingSpace !== null,
      doubleSpaceMs: this.doubleSpaceMs,
    });
    if (action === 'double-speed') {
      event.preventDefault();
      this._clearPendingSpace();
      this._apply(2);
      return;
    }
    if (action === 'ignore') return;
    event.preventDefault();
    if (action === 'pause') {
      this._clearPendingSpace();
      this.lastSpaceAt = -Infinity;
      this._apply(0);
      return;
    }
    this._clearPendingSpace();
    this.lastSpaceAt = now;
    this.pendingSpace = setTimeout(() => {
      this.pendingSpace = null;
      this.lastSpaceAt = -Infinity;
      this._apply(0.2);
    }, this.doubleSpaceMs);
  }

  _clearPendingSpace() {
    if (this.pendingSpace !== null) clearTimeout(this.pendingSpace);
    this.pendingSpace = null;
  }

  update(value) {
    const safe = Number.isFinite(Number(value)) ? Number(value) : 1;
    if (safe === this.lastDisplayedValue) return;
    this.lastDisplayedValue = safe;
    this.hud.dataset.paused = safe <= 0 ? 'true' : 'false';
    this.valueLabel.textContent =
      safe <= 0 ? 'PAUSED' : `${safe.toFixed(safe < 1 ? 1 : 0)}×`;
  }

  dispose() {
    this._clearPendingSpace();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.hud.remove();
  }
}
