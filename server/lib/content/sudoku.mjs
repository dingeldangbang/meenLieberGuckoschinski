/**
 * Sudoku-Generator mit garantierter eindeutiger Lösung.
 * Vollständig deterministisch: gleicher Seed -> gleiches Rätsel, 0 API-Kosten.
 */
import { createRng } from '../rng.mjs';

const ALL = 0x1ff;

function popcount(mask) {
  let m = mask;
  let c = 0;
  while (m) {
    m &= m - 1;
    c += 1;
  }
  return c;
}

/** Belegungsmasken für Zeilen, Spalten und Blöcke aufbauen. */
function buildMasks(grid) {
  const rows = new Int16Array(9);
  const cols = new Int16Array(9);
  const boxes = new Int16Array(9);
  for (let idx = 0; idx < 81; idx += 1) {
    const v = grid[idx];
    if (!v) continue;
    const r = (idx / 9) | 0;
    const c = idx % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    const bit = 1 << (v - 1);
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  return { rows, cols, boxes };
}

/** Zählt Lösungen (Abbruch bei `limit`) mit MRV-Heuristik. */
export function countSolutions(grid, limit = 2) {
  const work = Int8Array.from(grid);
  const { rows, cols, boxes } = buildMasks(work);
  let found = 0;

  function search() {
    if (found >= limit) return;
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let idx = 0; idx < 81; idx += 1) {
      if (work[idx] !== 0) continue;
      const r = (idx / 9) | 0;
      const c = idx % 9;
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      const avail = ~(rows[r] | cols[c] | boxes[b]) & ALL;
      const count = popcount(avail);
      if (count === 0) return;
      if (count < bestCount) {
        bestCount = count;
        best = idx;
        bestMask = avail;
        if (count === 1) break;
      }
    }
    if (best === -1) {
      found += 1;
      return;
    }
    const r = (best / 9) | 0;
    const c = best % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    let mask = bestMask;
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      const value = 31 - Math.clz32(bit) + 1;
      work[best] = value;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      search();
      work[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      if (found >= limit) return;
    }
  }

  search();
  return found;
}

/** Vollständig gelöstes Gitter erzeugen (randomisiertes Backtracking). */
function solvedGrid(rng) {
  const grid = new Int8Array(81);
  const { rows, cols, boxes } = buildMasks(grid);

  function fill() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let idx = 0; idx < 81; idx += 1) {
      if (grid[idx] !== 0) continue;
      const r = (idx / 9) | 0;
      const c = idx % 9;
      const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
      const avail = ~(rows[r] | cols[c] | boxes[b]) & ALL;
      const count = popcount(avail);
      if (count === 0) return false;
      if (count < bestCount) {
        bestCount = count;
        best = idx;
        bestMask = avail;
      }
    }
    if (best === -1) return true;

    const options = [];
    let mask = bestMask;
    while (mask) {
      const bit = mask & -mask;
      mask ^= bit;
      options.push(bit);
    }
    const shuffled = rng.shuffle(options);
    const r = (best / 9) | 0;
    const c = best % 9;
    const b = ((r / 3) | 0) * 3 + ((c / 3) | 0);
    for (const bit of shuffled) {
      grid[best] = 31 - Math.clz32(bit) + 1;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (fill()) return true;
      grid[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    return false;
  }

  fill();
  return grid;
}

export const SUDOKU_HOLES = { easy: 34, medium: 44, hard: 52 };

function toMatrix(flat) {
  const out = [];
  for (let r = 0; r < 9; r += 1) out.push(Array.from(flat.slice(r * 9, r * 9 + 9)));
  return out;
}

/**
 * Erzeugt ein Sudoku mit eindeutiger Lösung.
 * @param {string|number} seed
 * @param {'easy'|'medium'|'hard'} difficulty
 */
export function generateSudoku(seed, difficulty = 'medium') {
  const rng = createRng(`sudoku:${seed}`);
  const target = SUDOKU_HOLES[difficulty] ?? SUDOKU_HOLES.medium;
  const solution = solvedGrid(rng);
  const puzzle = Int8Array.from(solution);

  // Zellen paarweise (180°-Symmetrie) entfernen - sieht im Druck hochwertiger aus.
  const pairs = [];
  for (let idx = 0; idx < 41; idx += 1) {
    const mirror = 80 - idx;
    pairs.push(idx === mirror ? [idx] : [idx, mirror]);
  }
  let holes = 0;
  for (const pair of rng.shuffle(pairs)) {
    if (holes >= target) break;
    const backup = pair.map((i) => puzzle[i]);
    pair.forEach((i) => {
      puzzle[i] = 0;
    });
    if (countSolutions(puzzle, 2) === 1) {
      holes += pair.length;
    } else {
      pair.forEach((i, k) => {
        puzzle[i] = backup[k];
      });
    }
  }

  return {
    kind: 'sudoku',
    difficulty,
    holes,
    puzzle: toMatrix(puzzle),
    solution: toMatrix(solution),
    // Prüfsumme für Qualitätssicherung/Anzeige
    unique: countSolutions(puzzle, 2) === 1,
  };
}
