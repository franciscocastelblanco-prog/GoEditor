import { EMPTY, BLACK, WHITE, starPoints } from './engine.js';

export class CanvasRenderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.hover = null;
    this.deadStones = [];
    this.hintValue = null;
    this._dpr = 1;
    this.cell = 0;
    this.margin = 0;
    this._resizeObserver = null;
  }

  setup() {
    this._resizeObserver = new ResizeObserver(() => {
      this._fit();
      this.draw();
    });
    this._resizeObserver.observe(this.canvas.parentElement);
    this._fit();
  }

  _fit() {
    const el = this.canvas.parentElement;
    if (!el) return;
    const w = el.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    const max = Math.min(w, window.innerHeight - 90);
    const size = Math.max(300, Math.floor(max));
    this._dpr = dpr;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.cell = size / this.engine.size;
    this.margin = this.cell * 0.6;
  }

  boardToPixel(r, c) {
    return {
      x: this.margin + (c < 0 ? 0 : c > this.engine.size - 1 ? this.engine.size - 1 : c) * this.cell,
      y: this.margin + (r < 0 ? 0 : r > this.engine.size - 1 ? this.engine.size - 1 : r) * this.cell,
    };
  }

  pixelToBoard(px, py) {
    const size = this.engine.size;
    const c = Math.round((px - this.margin) / this.cell);
    const r = Math.round((py - this.margin) / this.cell);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return { r, c };
  }

  redraw() {
    this._fit();
    this.draw();
  }

  draw() {
    const { ctx } = this;
    const dpr = this._dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this._drawBoard();
    this._drawTerritory();
    this._drawStones();
    this._drawMarkers();
    this._drawHover();
    this._drawCoordinates();

    ctx.restore();
  }

  _drawBoard() {
    const { ctx } = this;
    const size = this.engine.size;
    const cell = this.cell;
    const margin = this.margin;
    const last = (size - 1) * cell;
    const dpr = this._dpr;

    ctx.fillStyle = '#c8b89e';
    ctx.fillRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);

    ctx.strokeStyle = '#554433';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < size; i++) {
      const pos = margin + i * cell;
      ctx.moveTo(pos + 0.5, margin + 0.5);
      ctx.lineTo(pos + 0.5, margin + last + 0.5);
      ctx.moveTo(margin + 0.5, pos + 0.5);
      ctx.lineTo(margin + last + 0.5, pos + 0.5);
    }
    ctx.stroke();

    const stars = starPoints(size);
    ctx.fillStyle = '#333';
    for (const [sr, sc] of stars) {
      const p = this.boardToPixel(sr, sc);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStones() {
    const { ctx } = this;
    const { board } = this.engine.state;
    const size = this.engine.size;
    const dead = new Set();
    for (const d of this.deadStones) dead.add(`${d.r},${d.c}`);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = board[r][c];
        if (v === EMPTY) continue;
        const p = this.boardToPixel(r, c);
        const radius = this.cell * 0.42;
        this._drawStone(ctx, p.x, p.y, v, radius);
        if (dead.has(`${r},${c}`)) {
          const k = radius * 0.18;
          ctx.strokeStyle = '#a52a2a';
          ctx.lineWidth = k;
          ctx.beginPath();
          ctx.moveTo(p.x - radius * 0.65, p.y - radius * 0.65);
          ctx.lineTo(p.x + radius * 0.65, p.y + radius * 0.65);
          ctx.moveTo(p.x + radius * 0.65, p.y - radius * 0.65);
          ctx.lineTo(p.x - radius * 0.65, p.y + radius * 0.65);
          ctx.stroke();
        }
      }
    }
  }

  _drawStone(ctx, x, y, color, radius) {
    const light = color === BLACK ? '#fafafa' : '#ffffff';
    const dark = color === BLACK ? '#222222' : '#bbbbbb';
    const grad = ctx.createRadialGradient(
      x - radius * 0.35,
      y - radius * 0.35,
      radius * 0.22,
      x,
      y,
      radius,
    );
    grad.addColorStop(0, light);
    grad.addColorStop(1, dark);
    ctx.fillStyle = grad;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = radius * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = color === BLACK ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  _drawMarkers() {
    const { ctx } = this;
    const { lastMove } = this.engine.state;
    if (lastMove) {
      const p = this.boardToPixel(lastMove.r, lastMove.c);
      const radius = this.cell * 0.13;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#554433';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  _drawHover() {
    const { ctx } = this;
    const { board } = this.engine.state;
    if (!this.hover || board[this.hover.r][this.hover.c] !== EMPTY) return;
    const p = this.boardToPixel(this.hover.r, this.hover.c);
    let marker = 'rgba(0,0,0,0.12)';
    let radius = this.cell * 0.2;
    if (this.hintValue === 'valid') {
      marker = 'rgba(120,150,220,0.55)';
    } else if (this.hintValue === 'invalid') {
      marker = 'rgba(220,80,80,0.55)';
    } else if (this.hintValue === 'territory') {
      return;
    }
    ctx.fillStyle = marker;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawTerritory() {
    if (this.engine.mode !== 'scoring') return;
    const res = this.engine.score(this.deadStones);
    const terr = res.territoryMap;
    const size = this.engine.size;
    const { ctx } = this;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (terr[r][c] === EMPTY) continue;
        const a = this.boardToPixel(r, c);
        const b = this.boardToPixel(r, c + 1);
        const d = this.boardToPixel(r + 1, c);
        ctx.fillStyle =
          terr[r][c] === BLACK ? 'rgba(40,90,220,0.28)' : 'rgba(230,80,80,0.28)';
        ctx.fillRect(a.x, a.y, b.x - a.x, d.y - a.y);
      }
    }
  }

  _drawCoordinates() {
    const { ctx } = this;
    const size = this.engine.size;
    const cell = this.cell;
    const margin = this.margin;
    const last = (size - 1) * cell;
    ctx.fillStyle = '#554433';
    ctx.font = `${Math.max(8, cell * 0.36)}px monospace`;
    ctx.textAlign = 'center';
    const letter = (i) => String.fromCharCode(65 + i);
    const num = (i) => String(i + 1);
    for (let i = 0; i < size; i++) {
      const pos = margin + i * cell;
      ctx.fillText(letter(i), pos, margin - cell * 0.33);
      ctx.fillText(letter(i), pos, margin + last + cell * 0.9);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i < size; i++) {
      const pos = margin + i * cell;
      ctx.fillText(num(i), margin - cell * 0.33, pos + 4);
      ctx.fillText(num(i), margin + last + cell * 0.33, pos + 4);
    }
    ctx.textAlign = 'center';
  }
}
