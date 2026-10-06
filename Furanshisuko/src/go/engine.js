export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

const PLAYER_COLOR = [
  [BLACK, '#1a1a1a'],
  [WHITE, '#f0f0f0'],
];

function neighbors(r, c, size) {
  const n = [];
  if (r > 0) n.push([r - 1, c]);
  if (r < size - 1) n.push([r + 1, c]);
  if (c > 0) n.push([r, c - 1]);
  if (c < size - 1) n.push([r, c + 1]);
  return n;
}

export function starPoints(size) {
  let offset;
  if (size >= 13) offset = 3;
  else if (size >= 9) offset = 2;
  else if (size >= 5) offset = 1;
  else offset = 0;
  const lines = [offset, size - 1 - offset];
  if (size % 2 === 1) lines.push((size - 1) / 2);
  const pts = [];
  for (const r of lines) for (const c of lines) pts.push([r, c]);
  return pts;
}

function groupOnBoard(board, r, c, size) {
  const color = board[r][c];
  if (color === EMPTY) return { stonesArr: [], libertiesArr: [] };
  const stones = [];
  const liberties = new Set();
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  const stack = [[r, c]];
  seen[r][c] = true;
  while (stack.length) {
    const [cr, cc] = stack.pop();
    stones.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc, size)) {
      const v = board[nr][nc];
      if (v === EMPTY) {
        liberties.add(`${nr},${nc}`);
      } else if (v === color && !seen[nr][nc]) {
        seen[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  return {
    stonesArr: stones,
    libertiesArr: [...liberties].map((s) => s.split(',').map(Number)),
    libCount: liberties.size,
  };
}

function signature(board, size) {
  return board.map((row) => row.join('')).join('|');
}

export class GoEngine {
  constructor(size = 19, komi = 6.5, superko = true) {
    this.size = size;
    this.komi = komi;
    this.superkoEnabled = superko;
    this.reset();
  }

  reset() {
    this.board = Array.from({ length: this.size }, () =>
      new Array(this.size).fill(EMPTY),
    );
    this.turn = BLACK;
    this.prisoners = { [BLACK]: 0, [WHITE]: 0 };
    this.history = [signature(this.board, this.size)];
    this.moveHistory = [];
    this.lastMove = null;
    this.passes = 0;
    this.gameOver = false;
    this.editStones = [];
    this.snapshot(0);
  }

  snapshot(index) {
    if (index === undefined) return;
    this.moveHistory[index] = {
      board: this.board.map((row) => row.slice()),
      turn: this.turn,
      prisoners: { [BLACK]: this.prisoners[BLACK], [WHITE]: this.prisoners[WHITE] },
      history: this.history.slice(),
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      passes: this.passes,
      gameOver: this.gameOver,
      editStones: this.editStones.slice(),
    };
  }

  get canUndo() {
    return this.moveHistory.length > 1;
  }
  get canRedo() {
    return this._cursor < this.moveHistory.length - 1;
  }

  _computeMove(r, c, player) {
    const b = this.board.map((row) => row.slice());
    const opponent = player === BLACK ? WHITE : BLACK;
    b[r][c] = player;
    const checked = Array.from({ length: this.size }, () =>
      new Array(this.size).fill(false),
    );
    const captured = [];
    for (const [nr, nc] of neighbors(r, c, this.size)) {
      if (b[nr][nc] === opponent && !checked[nr][nc]) {
        const g = groupOnBoard(b, nr, nc, this.size);
        for (const [sr, sc] of g.stonesArr) checked[sr][sc] = true;
        if (g.libCount === 0) {
          for (const [sr, sc] of g.stonesArr) {
            b[sr][sc] = EMPTY;
            captured.push([sr, sc]);
          }
        }
      }
    }
    const myGroup = groupOnBoard(b, r, c, this.size);
    let legal = true;
    let reason = null;
    if (myGroup.libCount === 0) {
      legal = false;
      reason = 'suicide';
    }
    const sig = signature(b, this.size);
    if (this.superkoEnabled && legal && this.history.includes(sig)) {
      legal = false;
      reason = 'superko';
    }
    return { legal, reason, board: b, captured, sig };
  }

  playMove(r, c) {
    if (this.gameOver) return { legal: false, reason: 'game-over' };
    if (this.board[r][c] !== EMPTY) {
      return { legal: false, reason: 'occupied' };
    }
    const res = this._computeMove(r, c, this.turn);
    if (!res.legal) return { legal: false, reason: res.reason };
    this.board = res.board;
    this.prisoners[this.turn] += res.captured.length;
    this.history.push(res.sig);
    this.lastMove = { r, c };
    this.passes = 0;
    this.turn = this.turn === BLACK ? WHITE : BLACK;
    this.moveHistory.push({
      board: this.board.map((row) => row.slice()),
      turn: this.turn,
      prisoners: { [BLACK]: this.prisoners[BLACK], [WHITE]: this.prisoners[WHITE] },
      history: this.history.slice(),
      lastMove: this.lastMove ? { ...this.lastMove } : null,
      passes: this.passes,
      gameOver: this.gameOver,
      editStones: this.editStones.slice(),
    });
    this._cursor = this.moveHistory.length - 1;
    return { legal: true, captured: res.captured, sig: res.sig };
  }

  pass() {
    if (this.gameOver) return { legal: false, reason: 'game-over' };
    this.passes += 1;
    this.turn = this.turn === BLACK ? WHITE : BLACK;
    if (this.passes >= 2) this.gameOver = true;
    this.moveHistory.push({
      board: this.board.map((row) => row.slice()),
      turn: this.turn,
      prisoners: { [BLACK]: this.prisoners[BLACK], [WHITE]: this.prisoners[WHITE] },
      history: this.history.slice(),
      lastMove: null,
      passes: this.passes,
      gameOver: this.gameOver,
      editStones: this.editStones.slice(),
    });
    this._cursor = this.moveHistory.length - 1;
    return { legal: true, gameOver: this.gameOver };
  }

  canMove(r, c) {
    if (this.board[r][c] !== EMPTY) return { legal: false, reason: 'occupied' };
    const res = this._computeMove(r, c, this.turn);
    return { legal: res.legal, reason: res.reason };
  }

  undo() {
    if (!this.canUndo) return false;
    const prev = this._cursor - 1;
    this._restore(prev);
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this._restore(this._cursor + 1);
    return true;
  }

  _restore(index) {
    const s = this.moveHistory[index];
    this.board = s.board.map((row) => row.slice());
    this.turn = s.turn;
    this.prisoners = { [BLACK]: s.prisoners[BLACK], [WHITE]: s.prisoners[WHITE] };
    this.history = s.history.slice();
    this.lastMove = s.lastMove ? { ...s.lastMove } : null;
    this.passes = s.passes;
    this.gameOver = s.gameOver;
    this.editStones = s.editStones.slice();
    this._cursor = index;
  }

  get state() {
    return {
      board: this.board,
      size: this.size,
      turn: this.turn,
      prisoners: this.prisoners,
      lastMove: this.lastMove,
      gameOver: this.gameOver,
      passes: this.passes,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      editStones: this.editStones,
    };
  }

  placeEditStone(r, c, color) {
    this.board[r][c] = color;
  }

  removeEditStone(r, c) {
    this.board[r][c] = EMPTY;
  }

  setSize(size) {
    this.size = size;
    this.reset();
  }

  setKomi(k) {
    this.komi = k;
  }

  setSuperko(on) {
    this.superkoEnabled = on;
  }

  score(deadStones = []) {
    const b = this.board.map((row) => row.slice());
    const prisoners = { [BLACK]: this.prisoners[BLACK], [WHITE]: this.prisoners[WHITE] };
    for (const ds of deadStones) {
      const { r, c, color } = ds;
      if (b[r][c] === color) {
        b[r][c] = EMPTY;
        const owner = color === BLACK ? WHITE : BLACK;
        prisoners[owner] += 1;
      }
    }
    const size = this.size;
    const visited = Array.from({ length: size }, () => new Array(size).fill(false));
    let blackTerr = 0;
    let whiteTerr = 0;
    let dame = 0;
    const terr = Array.from({ length: size }, () => new Array(size).fill(EMPTY));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (visited[r][c] || b[r][c] !== EMPTY) continue;
        const region = [];
        const borders = new Set();
        const stack = [[r, c]];
        visited[r][c] = true;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          region.push([cr, cc]);
          for (const [nr, nc] of neighbors(cr, cc, size)) {
            const v = b[nr][nc];
            if (v === EMPTY && !visited[nr][nc]) {
              visited[nr][nc] = true;
              stack.push([nr, nc]);
            } else if (v === BLACK) {
              borders.add(BLACK);
            } else if (v === WHITE) {
              borders.add(WHITE);
            }
          }
        }
        if (borders.size === 1) {
          const bor = borders.values().next().value;
          if (bor === BLACK) {
            blackTerr += region.length;
            for (const [rr, cc] of region) terr[rr][cc] = BLACK;
          } else {
            whiteTerr += region.length;
            for (const [rr, cc] of region) terr[rr][cc] = WHITE;
          }
        } else {
          dame += region.length;
          for (const [rr, cc] of region) terr[rr][cc] = EMPTY;
        }
      }
    }
    const blackScore = blackTerr + prisoners[BLACK];
    const whiteScore = whiteTerr + prisoners[WHITE] + this.komi;
    const winner = blackScore > whiteScore ? BLACK : whiteScore > blackScore ? WHITE : null;
    return {
      black: blackScore,
      white: whiteScore,
      blackTerritory: blackTerr,
      whiteTerritory: whiteTerr,
      prisonersBlack: prisoners[BLACK],
      prisonersWhite: prisoners[WHITE],
      dame,
      komi: this.komi,
      territoryMap: terr,
      winner,
      margin: Math.abs(blackScore - whiteScore),
    };
  }
}

GoEngine.PLAYER_COLOR = PLAYER_COLOR;
GoEngine.BLACK = BLACK;
GoEngine.WHITE = WHITE;
GoEngine.EMPTY = EMPTY;
