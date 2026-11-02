/** Wortsuchrätsel-Generator (deterministisch, ohne externe Dienste). */
import { createRng } from '../rng.mjs';

const DIRECTIONS = {
  easy: [
    [0, 1],
    [1, 0],
    [1, 1],
  ],
  medium: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
    [0, -1],
    [-1, 0],
  ],
  hard: [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [-1, -1],
  ],
};

// Buchstabenverteilung nach deutscher Häufigkeit (für ein natürlicheres Gitter)
const LETTER_POOL =
  'EEEEEENNNNNIIIIISSSSSRRRRRAAATTTTDDDHHHUUULLLCCGGGMMMOOOBBWWFFKKZZPPVÄÖÜ'.split('');

function fits(grid, size, word, row, col, dRow, dCol) {
  for (let i = 0; i < word.length; i += 1) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    if (r < 0 || c < 0 || r >= size || c >= size) return false;
    const cell = grid[r * size + c];
    if (cell && cell !== word[i]) return false;
  }
  return true;
}

/**
 * @param {string[]} words Kandidaten (bereits in Großbuchstaben)
 * @param {{size?:number, seed?:string|number, difficulty?:string, wordCount?:number}} options
 */
export function generateWordSearch(words, options = {}) {
  const size = options.size ?? 13;
  const difficulty = options.difficulty ?? 'medium';
  const rng = createRng(`words:${options.seed ?? 'default'}`);
  const directions = DIRECTIONS[difficulty] ?? DIRECTIONS.medium;

  const pool = rng
    .shuffle([...new Set(words.map((w) => w.toUpperCase().replace(/[^A-ZÄÖÜÉ]/g, '')))])
    .filter((w) => w.length >= 3 && w.length <= size);

  const target = Math.min(options.wordCount ?? 12, pool.length);
  const grid = new Array(size * size).fill('');
  const placements = [];

  for (const word of pool) {
    if (placements.length >= target) break;
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt += 1) {
      const [dRow, dCol] = rng.pick(directions);
      const row = rng.int(size);
      const col = rng.int(size);
      if (!fits(grid, size, word, row, col, dRow, dCol)) continue;
      for (let i = 0; i < word.length; i += 1) {
        grid[(row + dRow * i) * size + (col + dCol * i)] = word[i];
      }
      placements.push({ word, row, col, dRow, dCol });
      placed = true;
    }
  }

  for (let i = 0; i < grid.length; i += 1) {
    if (!grid[i]) grid[i] = rng.pick(LETTER_POOL);
  }

  const rows = [];
  for (let r = 0; r < size; r += 1) {
    rows.push(grid.slice(r * size, r * size + size));
  }

  return {
    kind: 'wordsearch',
    size,
    difficulty,
    grid: rows,
    placements: placements.sort((a, b) => a.word.localeCompare(b.word, 'de')),
    wordCount: placements.length,
  };
}

/** Kleinste Gittergröße, in die die längsten Wörter passen. */
export function suggestGridSize(words, minimum = 11) {
  const longest = words.reduce((max, w) => Math.max(max, w.length), 0);
  return Math.max(minimum, Math.min(19, longest + 1));
}
