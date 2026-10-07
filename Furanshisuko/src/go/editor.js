import { EMPTY, BLACK, WHITE } from './engine.js';
import { selectMove } from './ai.js';

const COLOR_NAMES = { [BLACK]: 'Black', [WHITE]: 'White' };

const el = (tag, props = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') (e.innerHTML = v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const ch of children) {
    if (typeof ch === 'string') e.appendChild(document.createTextNode(ch));
    else if (ch) e.appendChild(ch);
  }
  return e;
};

export class GoEditor {
  constructor(engine, renderer, container) {
    this.engine = engine;
    this.renderer = renderer;
    this.container = container;
    this.mode = 'edit';
    this.engine.mode = this.mode;
    this.editColor = BLACK;
    this.humanColor = BLACK;
    this.aiEnabled = true;
    this._aiScheduled = false;
    this.renderer.deadStones = [];
    this.renderer.engine.mode = this.mode;

    this._buildUI();
    this._bindCanvas();
    this._render();
  }

  _buildUI() {
    const bar = el('div', { class: 'go-toolbar' });

    bar.appendChild(
      el('div', { class: 'go-seg' },
        el('button', { class: 'go-mode-btn', 'data-mode': 'edit', onclick: () => this.setMode('edit') }, 'Edit'),
        el('button', { class: 'go-mode-btn', 'data-mode': 'play', onclick: () => this.setMode('play') }, 'Play'),
        el('button', { class: 'go-mode-btn', 'data-mode': 'scoring', onclick: () => this.setMode('scoring') }, 'Score'),
      ),
    );

    const sizeWrap = el('div', { class: 'go-field' });
    sizeWrap.appendChild(el('span', { class: 'go-field-label' }, 'Size'));
    for (const s of [9, 13, 19]) {
      sizeWrap.appendChild(
        el('button', { class: 'go-size-btn', 'data-size': s, onclick: () => this.setSize(s) }, `${s}x${s}`),
      );
    }
    bar.appendChild(sizeWrap);

    const komiWrap = el('div', { class: 'go-field' });
    komiWrap.appendChild(el('span', { class: 'go-field-label' }, 'Komi'));
    komiWrap.appendChild(
      el('input', {
        type: 'number',
        step: '0.5',
        min: '0',
        max: '13.5',
        class: 'go-komi',
        value: String(this.engine.komi),
        oninput: (e) => this.setKomi(parseFloat(e.target.value)),
      }),
    );
    bar.appendChild(komiWrap);

    const rulesWrap = el('div', { class: 'go-field' });
    rulesWrap.appendChild(el('span', { class: 'go-field-label' }, 'Superko'));
    this.superBtn = el('button', {
      class: 'go-toggle',
      'data-on': String(this.engine.superkoEnabled),
      html: this.engine.superkoEnabled ? 'ON' : 'OFF',
      onclick: () => this.toggleSuperko(),
    });
    rulesWrap.appendChild(this.superBtn);
    bar.appendChild(rulesWrap);

    bar.appendChild(
      el('button', { class: 'go-btn go-undo', onclick: () => this.undo() }, 'Undo'),
    );
    bar.appendChild(
      el('button', { class: 'go-btn go-redo', onclick: () => this.redo() }, 'Redo'),
    );
    bar.appendChild(
      el('button', { class: 'go-btn go-pass', onclick: () => this.pass() }, 'Pass'),
    );
    this.humanBtn = el('button', { class: 'go-btn go-human', onclick: () => this.toggleHumanColor() }, this._humanLabel());
    bar.appendChild(this.humanBtn);
    this.aiBtn = el('button', { class: 'go-btn go-ai', 'data-on': String(this.aiEnabled), onclick: () => this.toggleAI() }, this._aiLabel());
    bar.appendChild(this.aiBtn);
    bar.appendChild(
      el('button', { class: 'go-btn go-reset', onclick: () => this.reset() }, 'Reset'),
    );

    this.statusEl = el('div', { class: 'go-status' }, 'Ready');
    bar.appendChild(this.statusEl);

    this.scoreEl = el('div', { class: 'go-score hidden' });
    bar.appendChild(this.scoreEl);

    this.container.appendChild(bar);

    this.canvasContainer = el('div', { class: 'go-board-wrap' });
    this.canvasContainer.appendChild(this.renderer.canvas);
    this.container.appendChild(this.canvasContainer);

    this.renderer.setup();
    this._updateButtons();
  }

  _bindCanvas() {
    const canvas = this.renderer.canvas;
    canvas.style.cursor = 'pointer';

    const syncHover = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cell = this.renderer.pixelToBoard(e.clientX - rect.left, e.clientY - rect.top);
      if (!cell) {
        this.renderer.hintValue = null;
        this.renderer.setHover(null);
        this._refreshStatus(null);
        this.renderer.draw();
        return;
      }
      if (this.mode === 'play') {
        const { legal, reason } = this.engine.canMove(cell.r, cell.c);
        this.renderer.hintValue = legal ? 'valid' : 'invalid';
      } else if (this.mode === 'scoring') {
        this.renderer.hintValue = 'territory';
      } else {
        this.renderer.hintValue = null;
      }
      this.renderer.setHover(cell);
      this._refreshStatus(cell);
      this.renderer.draw();
    };

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const p = this.renderer.pixelToBoard(e.clientX - rect.left, e.clientY - rect.top);
      if (!p) return;
      this.handleCellClick(p.r, p.c);
    });
    canvas.addEventListener('mousemove', syncHover);
    canvas.addEventListener('mouseenter', syncHover);
    canvas.addEventListener('mouseleave', () => {
      this.renderer.hintValue = null;
      this.renderer.setHover(null);
      this._refreshStatus(null);
      this.renderer.draw();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _refreshStatus(cell) {
    const coord = cell
      ? `${String.fromCharCode(65 + cell.c)}${cell.r + 1}`
      : '—';
    if (this.mode === 'play') {
      const name = COLOR_NAMES[this.engine.turn];
      this.statusEl.textContent = this.engine.gameOver
        ? `Game over · ${coord}`
        : `${name} to play · ${coord}`;
    } else if (this.mode === 'edit') {
      this.statusEl.textContent = `Edit (${COLOR_NAMES[this.editColor]}) · ${coord}`;
    } else {
      this.statusEl.textContent = `Scoring mode · ${coord}`;
    }
  }

  handleCellClick(r, c) {
    if (this.mode === 'edit') {
      const v = this.engine.board[r][c];
      if (v === EMPTY) {
        this.engine.placeEditStone(r, c, this.editColor);
      } else {
        this.editColor = v;
        this.engine.removeEditStone(r, c);
      }
      this._render();
    } else if (this.mode === 'play') {
      if (this.engine.gameOver) return;
      if (this.engine.turn !== this.humanColor) return;
      const res = this.engine.playMove(r, c);
      if (!res.legal) {
        this._flashReason(res.reason);
      } else {
        this._afterHumanAction();
      }
      this._render();
    } else if (this.mode === 'scoring') {
      if (!this.engine.gameOver) return;
      this._toggleDead(r, c);
      this._render();
    }
  }

  _toggleDead(r, c) {
    const key = `${r},${c}`;
    const idx = this.renderer.deadStones.findIndex((d) => `${d.r},${d.c}` === key);
    if (idx >= 0) {
      this.renderer.deadStones.splice(idx, 1);
    } else {
      this.renderer.deadStones.push({ r, c, color: this.engine.board[r][c] });
    }
  }

  _flashReason(reason) {
    const msgs = { occupied: 'Point occupied', suicide: 'Suicide not allowed (Japanese rules)', superko: 'Illegal: positional repetition (Superko)' };
    this.statusEl.textContent = msgs[reason] || 'Illegal move';
    this.statusEl.classList.add('go-flash');
    setTimeout(() => this.statusEl.classList.remove('go-flash'), 1200);
  }

  setMode(mode) {
    if (mode === 'scoring' && !this.engine.gameOver) {
      this.statusEl.textContent =
        'Finish the game (two passes) before scoring.';
      this.statusEl.classList.add('go-flash');
      setTimeout(() => this.statusEl.classList.remove('go-flash'), 1200);
      return;
    }
    const prev = this.mode;
    this.mode = mode;
    this.engine.mode = mode;
    this.renderer.engine.mode = mode;
    if (mode === 'play' && prev === 'edit') {
      this.engine.beginPlay();
      if (this.aiEnabled && this.humanColor === WHITE) {
        this.scheduleAutoMove();
      }
    }
    if (mode === 'scoring') {
      this.renderer.deadStones = [];
    }
    this._updateButtons();
    this._render();
  }

  setSize(size) {
    this.engine.setSize(size);
    this.renderer.deadStones = [];
    this._updateButtons();
    this._render();
  }

  setKomi(k) {
    this.engine.setKomi(k);
    this._render();
  }

  toggleSuperko() {
    this.engine.setSuperko(!this.engine.superkoEnabled);
    if (this.superBtn) {
      this.superBtn.dataset.on = String(this.engine.superkoEnabled);
      this.superBtn.innerHTML = this.engine.superkoEnabled ? 'ON' : 'OFF';
    }
    this._render();
  }

  get aiColor() {
    return this.humanColor === BLACK ? WHITE : BLACK;
  }

  _humanLabel() {
    return `Play ${this.humanColor === BLACK ? '■ Black' : '○ White'}`;
  }

  _aiLabel() {
    return this.aiEnabled ? 'AI ○ ON' : 'AI OFF';
  }

  toggleHumanColor() {
    this.humanColor = this.humanColor === BLACK ? WHITE : BLACK;
    if (this.humanBtn) this.humanBtn.textContent = this._humanLabel();
  }

  toggleAI() {
    this.aiEnabled = !this.aiEnabled;
    if (this.aiBtn) {
      this.aiBtn.dataset.on = String(this.aiEnabled);
      this.aiBtn.textContent = this._aiLabel();
    }
    this._render();
  }

  scheduleAutoMove() {
    if (this._aiScheduled) return;
    this._aiScheduled = true;
    setTimeout(() => {
      this._aiScheduled = false;
      this.autoMove();
    }, 300);
  }

  autoMove() {
    if (this.mode !== 'play' || this.engine.gameOver || !this.aiEnabled) return;
    if (this.engine.turn !== this.aiColor) return;
    const move = selectMove(this.engine, this.aiColor, 2);
    if (!move) {
      this.engine.pass();
    } else {
      const res = this.engine.playMove(move.r, move.c);
      if (!res.legal) this.engine.pass();
    }
    this._render();
    if (!this.engine.gameOver && this.engine.turn === this.aiColor) {
      this.scheduleAutoMove();
    }
  }

  undo() {
    this.engine.undo();
    this._updateButtons();
    this._render();
  }

  redo() {
    this.engine.redo();
    this._updateButtons();
    this._render();
  }

  pass() {
    if (this.mode !== 'play' || this.engine.gameOver) return;
    this.engine.pass();
    this._render();
    this._afterHumanAction();
  }

  _afterHumanAction() {
    if (this.aiEnabled && !this.engine.gameOver && this.engine.turn === this.aiColor) {
      this.scheduleAutoMove();
    }
  }

  reset() {
    this.engine.reset();
    this.renderer.deadStones = [];
    this.mode = 'edit';
    this.engine.mode = this.mode;
    this.renderer.engine.mode = this.mode;
    this.humanColor = BLACK;
    this.aiEnabled = true;
    if (this.humanBtn) this.humanBtn.textContent = this._humanLabel();
    if (this.aiBtn) {
      this.aiBtn.dataset.on = String(this.aiEnabled);
      this.aiBtn.textContent = this._aiLabel();
    }
    this._updateButtons();
    this._render();
  }

  _updateButtons() {
    for (const b of this.container.querySelectorAll('.go-mode-btn')) {
      b.classList.toggle('active', b.dataset.mode === this.mode);
    }
    for (const b of this.container.querySelectorAll('.go-size-btn')) {
      b.classList.toggle('active', Number(b.dataset.size) === this.engine.size);
    }
    const sup = this.superBtn;
    if (sup) sup.dataset.on = String(this.engine.superkoEnabled);
    const undoBtn = this.container.querySelector('.go-undo');
    if (undoBtn) undoBtn.disabled = !this.engine.canUndo;
    const redoBtn = this.container.querySelector('.go-redo');
    if (redoBtn) redoBtn.disabled = !this.engine.canRedo;
    const passBtn = this.container.querySelector('.go-pass');
    if (passBtn) passBtn.disabled = this.mode !== 'play' || this.engine.gameOver;

    this.statusEl.classList.remove('go-flash');
    if (this.mode === 'play') {
      if (this.engine.gameOver) {
        this.statusEl.textContent = 'Game over — switch to Score mode';
      } else {
        this.statusEl.textContent = `${COLOR_NAMES[this.engine.turn]} to play`;
      }
    } else if (this.mode === 'edit') {
      this.statusEl.textContent = `Edit mode (${COLOR_NAMES[this.editColor]})`;
    }

    this._renderScore();
  }

  _renderScore() {
    if (this.mode === 'scoring' && this.engine.gameOver) {
      const res = this.engine.score(this.renderer.deadStones);
      const diff = res.black - res.white;
      const winner = diff > 0 ? 'Black' : diff < 0 ? 'White' : 'Jigo';
      this.scoreEl.classList.remove('hidden');
      this.scoreEl.innerHTML = `
        <div class="go-score-line"><span>Black</span><b>${res.black.toFixed(1)}</b></div>
        <div class="go-score-line"><span>White (+${res.komi} komi)</span><b>${res.white.toFixed(1)}</b></div>
        <div class="go-score-winner">${winner} wins by ${Math.abs(diff).toFixed(1)}</div>
        <div class="go-score-detail">Territory: B ${res.blackTerritory} / W ${res.whiteTerritory} · Dame ${res.dame} · Dead marked ${this.renderer.deadStones.length}</div>
      `;
    } else {
      this.scoreEl.classList.add('hidden');
      this.scoreEl.innerHTML = '';
    }
  }

  _render() {
    this._updateButtons();
    this.renderer.redraw();
  }

  render() {
    this._render();
  }
}
