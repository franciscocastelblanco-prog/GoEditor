import { EMPTY, BLACK, WHITE, starPoints, moveResult } from './engine.js';

function neighbors(r, c, size) {
  const n = [];
  if (r > 0) n.push([r - 1, c]);
  if (r < size - 1) n.push([r + 1, c]);
  if (c > 0) n.push([r, c - 1]);
  if (c < size - 1) n.push([r, c + 1]);
  return n;
}

function groupStones(board, r, c, size) {
  const color = board[r][c];
  if (color === EMPTY) return [];
  const stones = [];
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  const stack = [[r, c]];
  seen[r][c] = true;
  while (stack.length) {
    const [cr, cc] = stack.pop();
    stones.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc, size)) {
      if (board[nr][nc] === color && !seen[nr][nc]) {
        seen[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  return stones;
}

export function groupInfo(board, r, c, size) {
  const color = board[r][c];
  if (color === EMPTY) return { stones: [], lib: 0 };
  const stones = [];
  const libs = new Set();
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  const stack = [[r, c]];
  seen[r][c] = true;
  while (stack.length) {
    const [cr, cc] = stack.pop();
    stones.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc, size)) {
      const v = board[nr][nc];
      if (v === EMPTY) libs.add(`${nr},${nc}`);
      else if (v === color && !seen[nr][nc]) {
        seen[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  return { stones, lib: libs.size };
}

export function isRealEye(board, r, c, color, size) {
  if (board[r][c] !== EMPTY) return false;
  for (const [nr, nc] of neighbors(r, c, size)) {
    if (board[nr][nc] !== color) return false;
  }
  let bad = 0;
  let ndiag = 0;
  for (let dr = -1; dr <= 1; dr += 2) {
    for (let dc = -1; dc <= 1; dc += 2) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      ndiag++;
      if (board[nr][nc] !== color) bad++;
    }
  }
  if (ndiag <= 2) return bad === 0;
  return bad <= 1;
}

export function eyeRegionCount(board, r0, c0, size) {
  const color = board[r0][c0];
  if (color === EMPTY) return 0;
  const stones = groupStones(board, r0, c0, size);
  const seenEmpty = Array.from({ length: size }, () => new Array(size).fill(false));
  let regions = 0;
  for (const [sr, sc] of stones) {
    for (const [nr, nc] of neighbors(sr, sc, size)) {
      if (board[nr][nc] !== EMPTY || seenEmpty[nr][nc]) continue;
      const q = [[nr, nc]];
      seenEmpty[nr][nc] = true;
      const border = new Set();
      while (q.length) {
        const [cr, cc] = q.pop();
        for (const [nnr, nnc] of neighbors(cr, cc, size)) {
          const v = board[nnr][nnc];
          if (v === EMPTY) {
            if (!seenEmpty[nnr][nnc]) {
              seenEmpty[nnr][nnc] = true;
              q.push([nnr, nnc]);
            }
          } else {
            border.add(v);
          }
        }
      }
      if (border.size === 1 && border.has(color)) regions++;
    }
  }
  return regions;
}

function positionValue(r, c, size) {
  const x = Math.min(r, size - 1 - r);
  const y = Math.min(c, size - 1 - c);
  let v = 0;
  if (x === 0 || y === 0) {
    v += 0.5;
  } else if (x === 1 || y === 1) {
    v += 1;
  } else if (x <= 3 && y <= 3) {
    if (x === 3 && y === 3) v += 8;
    else if (x <= 2 && y <= 2) v += 12;
    else v += 7;
  } else if (x <= 4 || y <= 4) {
    v += 3;
  } else if (x <= 6 || y <= 6) {
    v += 1;
  }
  const center = (size - 1) / 2;
  if (size % 2 === 1 && Math.abs(r - center) <= 1 && Math.abs(c - center) <= 1) v += 0.5;
  return v;
}

function positionValueScaled(r, c, size, fillRatio) {
  let v = positionValue(r, c, size);
  const gamePhase = Math.min(fillRatio * 3, 1.0);
  if (gamePhase > 0.34) {
    const centerDist = Math.abs(r - (size - 1) / 2) + Math.abs(c - (size - 1) / 2);
    const centerBias = Math.max(0, 1 - centerDist / (size - 1)) * (gamePhase - 0.34) * 2;
    v += centerBias * 2;
  }
  return v * Math.max(1 - gamePhase * 0.3, 0.4);
}

export function boardFill(board, size) {
  let stones = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (board[r][c] !== EMPTY) stones++;
  return stones / (size * size);
}

function hasAtari(board, color, size) {
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== color || seen[r][c]) continue;
      const g = groupInfo(board, r, c, size);
      if (g.lib === 1) return true;
    }
  }
  return false;
}

function isHane(board, r, c, color, size) {
  let own = 0;
  let opp = false;
  for (const [nr, nc] of neighbors(r, c, size)) {
    if (board[nr][nc] === color) own++;
    else if (board[nr][nc] !== EMPTY) opp = true;
  }
  return own >= 1 && opp;
}

function doubleAtari(board, r, c, color, size) {
  const opponent = color === BLACK ? WHITE : BLACK;
  let hits = 0;
  for (const [nr, nc] of neighbors(r, c, size)) {
    if (board[nr][nc] !== opponent) continue;
    const g = groupInfo(board, nr, nc, size);
    if (g.lib === 2) hits++;
  }
  return hits >= 2;
}

function areaEval(board, size, komi) {
  const visited = Array.from({ length: size }, () => new Array(size).fill(false));
  let black = 0;
  let white = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] === BLACK) black++;
      else if (board[r][c] === WHITE) white++;
    }
  }
  white += komi;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== EMPTY || visited[r][c]) continue;
      const region = [];
      const border = new Set();
      const q = [[r, c]];
      visited[r][c] = true;
      while (q.length) {
        const [cr, cc] = q.pop();
        region.push([cr, cc]);
        for (const [nr, nc] of neighbors(cr, cc, size)) {
          const v = board[nr][nc];
          if (v === EMPTY) {
            if (!visited[nr][nc]) {
              visited[nr][nc] = true;
              q.push([nr, nc]);
            }
          } else {
            border.add(v);
          }
        }
      }
      if (border.size === 1) {
        if (border.has(BLACK)) black += region.length;
        else if (border.has(WHITE)) white += region.length;
      }
    }
  }
  return { black, white };
}

function areaAdvantage(board, aiColor, size, komi) {
  const a = areaEval(board, size, komi);
  return aiColor === BLACK ? a.black - a.white : a.white - a.black;
}

function candidateMoves(board, size) {
  const sz = size;
  const seen = Array.from({ length: sz }, () => new Array(sz).fill(false));
  const arr = [];
  const add = (r, c) => {
    if (r < 0 || r >= sz || c < 0 || c >= sz) return;
    if (board[r][c] !== EMPTY || seen[r][c]) return;
    seen[r][c] = true;
    arr.push([r, c]);
  };
  let stones = 0;
  for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) if (board[r][c] !== EMPTY) stones++;
  if (stones === 0) {
    for (const [sr, sc] of starPoints(sz)) add(sr, sc);
    return arr.length ? arr : [[Math.floor(sz / 2), Math.floor(sz / 2)]];
  }
  for (let r = 0; r < sz; r++) {
    for (let c = 0; c < sz; c++) {
      if (board[r][c] !== EMPTY) {
         for (let dr = -4; dr <= 4; dr++) {
           for (let dc = -4; dc <= 4; dc++) {
             if (Math.abs(dr) + Math.abs(dc) <= 4) add(r + dr, c + dc);
           }
         }
      }
    }
  }
  if (arr.length === 0) for (let r = 0; r < sz; r++) for (let c = 0; c < sz; c++) if (board[r][c] === EMPTY) add(r, c);
  return arr;
}

function moveBonus(board, b1, r, c, aiColor, size, lastMove) {
  let score = 0;
  const res = moveResult(board, r, c, aiColor, size);
  if (!res.legal) return -Infinity;
  const captured = res.captured.length;
  score += captured * 1000;
  const g = groupInfo(b1, r, c, size);
  const eyesAfter = eyeRegionCount(b1, r, c, size);
  if (captured > 0) {
    if (g.lib <= 1) score -= 250;
  } else {
    if (g.lib === 1) score -= 950;
    else if (g.lib === 2) score -= 80;
  }
  if (eyesAfter >= 2 && g.lib <= 2) score += 100;
  if (captured === 0 && isRealEye(board, r, c, aiColor, size)) score -= 400;
  if (isHane(b1, r, c, aiColor, size)) score += 10;
  if (doubleAtari(b1, r, c, aiColor, size)) score += 150;
  for (const [sr, sc] of res.captured) {
    score += 20;
  }

  const myGroupsInAtari = countAtariGroups(board, aiColor, size);
  const oppGroupsInAtari = countAtariGroups(board, oppColor(aiColor), size);
  if (myGroupsInAtari > 0 && g.lib > 1) score += 40;
  if (oppGroupsInAtari > 0) score += 30;
  if (g.lib === 1 && !captured) score -= 950;

  if (g.stones.length >= 3 && g.lib <= 1 && !captured && eyesAfter === 0) {
    score -= 200;
  }
  if (g.stones.length >= 2 && g.lib === 2 && !captured && eyesAfter === 0) {
    const oppAdj = countAdjacentOpponentGroups(b1, r, c, oppColor(aiColor), size);
    if (oppAdj > 0) score -= 100;
  }

  if (lastMove) {
    const dist = Math.abs(r - lastMove.r) + Math.abs(c - lastMove.c);
    if (dist <= 2) score += 15;
    else if (dist <= 4) score += 5;
  }

  const posScale = boardFill(board, size);
  score += positionValueScaled(r, c, size, posScale) * 3;
  return score;
}

function countAdjacentOpponentGroups(board, r, c, oppColor, size) {
  let count = 0;
  const seen = new Set();
  for (const [nr, nc] of neighbors(r, c, size)) {
    if (board[nr][nc] !== oppColor) continue;
    const key = `${nr},${nc}`;
    let isPart = false;
    for (const s of seen) {
      const [sr, sc] = s.split(',').map(Number);
      try {
        const gi = groupInfo(board, sr, sc, size);
        if (gi.stones.some(([x, y]) => x === nr && y === nc)) isPart = true;
      } catch { void 0; }
    }
    if (!isPart) {
      seen.add(key);
      count++;
    }
  }
  return count;
}

function oppColor(color) {
  return color === BLACK ? WHITE : BLACK;
}

function countAtariGroups(board, color, size) {
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  let count = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== color || seen[r][c]) continue;
      const g = groupInfo(board, r, c, size);
      for (const [sr, sc] of g.stones) seen[sr][sc] = true;
      if (g.lib === 1) count++;
    }
  }
  return count;
}

function countWeakGroups(board, color, size) {
  const seen = Array.from({ length: size }, () => new Array(size).fill(false));
  let totalLib = 0;
  let groups = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (board[r][c] !== color || seen[r][c]) continue;
      const g = groupInfo(board, r, c, size);
      for (const [sr, sc] of g.stones) seen[sr][sc] = true;
      groups++;
      totalLib += g.lib;
    }
  }
  return groups > 0 ? totalLib / groups : Infinity;
}

export function selectMove(engine, aiColor, strength = 2) {
  const size = engine.size;
  const board = engine.board;
  const komi = engine.komi;
  const opp = aiColor === BLACK ? WHITE : BLACK;
  const allLegal = engine.legalMoves(aiColor);
  if (allLegal.length === 0) return null;

  const maxCap = allLegal.reduce((m, x) => Math.max(m, x.captured), 0);
  const fillRatio = boardFill(board, size);

  const passThreshold = 0.2 + (strength >= 2 ? 0.5 : 0);
  const hasTactical = maxCap > 0 || hasAtari(board, opp, size) || hasAtari(board, aiColor, size);
  if (maxCap === 0 && fillRatio >= passThreshold && !hasTactical) {
    return null;
  }

  const legalSet = new Set(allLegal.map((m) => `${m.r},${m.c}`));
  let cands = candidateMoves(board, size).filter(([r, c]) => legalSet.has(`${r},${c}`));
  for (const { r, c, captured } of allLegal) {
    if (captured > 0 && !cands.some(([ar, ac]) => ar === r && ac === c)) cands.push([r, c]);
  }
  if (cands.length === 0) cands = allLegal.map((m) => [m.r, m.c]);

  if (cands.length > 40) {
    cands.sort((a, b) => {
      const ca = capOf(allLegal, a);
      const cb = capOf(allLegal, b);
      return cb - ca || positionValueScaled(a[0], a[1], size, fillRatio) - positionValueScaled(b[0], b[1], size, fillRatio);
    });
    cands = cands.slice(0, 40);
  }

  let best = null;
  let bestScore = -Infinity;
  const scored = [];

  for (const [r, c] of cands) {
    const res = moveResult(board, r, c, aiColor, size);
    if (!res.legal) continue;
    const b1 = res.board;
    const bonus = moveBonus(board, b1, r, c, aiColor, size, engine.lastMove);

    let value;
    if (strength >= 2) {
      const baseAdv = areaAdvantage(board, aiColor, size, komi);
      const oppMoves = candidateMoves(b1, size);
      const oppSet = new Set();
      const oppCaptures = [];
      for (const [or, oc] of oppMoves) {
        const rr = moveResult(b1, or, oc, opp, size);
        if (!rr.legal) continue;
        oppSet.add(`${or},${oc}`);
        oppCaptures.push({ move: [or, oc], captured: rr.captured.length });
      }
      let minAdv = areaAdvantage(b1, aiColor, size, komi);
      let maxOppCap = 0;
      for (const [or, oc] of oppMoves) {
        if (!oppSet.has(`${or},${oc}`)) continue;
        const rr = moveResult(b1, or, oc, opp, size);
        const adv = areaAdvantage(rr.board, aiColor, size, komi);
        if (adv < minAdv) minAdv = adv;
        if (rr.captured.length > maxOppCap) maxOppCap = rr.captured.length;
      }
      value = bonus + (minAdv - baseAdv) - maxOppCap * 100;
    } else {
      value = bonus + areaAdvantage(b1, aiColor, size, komi);
    }

    scored.push({ r, c, score: value });
    if (value > bestScore) {
      bestScore = value;
      best = { r, c };
    }
  }

  if (!best) {
    const m = allLegal[Math.floor(Math.random() * allLegal.length)];
    return { r: m.r, c: m.c };
  }

  const threshold = bestScore - 0.1;
  const near = scored.filter((s) => s.score >= threshold);
  const pick = near[Math.floor(Math.random() * near.length)] || best;
  return { r: pick.r, c: pick.c };
}

function capOf(allLegal, [r, c]) {
  const m = allLegal.find((x) => x.r === r && x.c === c);
  return m ? m.captured : 0;
}

selectMove.human = false;
