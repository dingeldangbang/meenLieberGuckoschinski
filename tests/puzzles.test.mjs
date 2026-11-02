import test from 'node:test';
import assert from 'node:assert/strict';

import { countSolutions, generateSudoku, SUDOKU_HOLES } from '../server/lib/content/sudoku.mjs';
import { generateWordSearch, suggestGridSize } from '../server/lib/content/wordsearch.mjs';
import { generateMaze, solveMaze } from '../server/lib/content/maze.mjs';
import { WORDSETS, wordsForCategories } from '../server/lib/content/words.mjs';

function isSolved(grid) {
  if (grid.length !== 9) return false;
  for (let i = 0; i < 9; i += 1) {
    const row = new Set(grid[i]);
    const col = new Set(grid.map((r) => r[i]));
    if (row.size !== 9 || col.size !== 9) return false;
  }
  for (let br = 0; br < 3; br += 1) {
    for (let bc = 0; bc < 3; bc += 1) {
      const box = new Set();
      for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) box.add(grid[br * 3 + r][bc * 3 + c]);
      if (box.size !== 9) return false;
    }
  }
  return true;
}

test('Sudoku: Lösung ist vollständig und regelkonform', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const puzzle = generateSudoku(`test-${difficulty}`, difficulty);
    assert.equal(isSolved(puzzle.solution), true, difficulty);
    assert.equal(puzzle.puzzle.length, 9);
  }
});

test('Sudoku: Rätsel hat genau eine Lösung', () => {
  for (const seed of ['a', 'b', 'c']) {
    const puzzle = generateSudoku(seed, 'medium');
    const flat = Int8Array.from(puzzle.puzzle.flat());
    assert.equal(countSolutions(flat, 2), 1, `Seed ${seed} ist nicht eindeutig`);
    assert.equal(puzzle.unique, true);
  }
});

test('Sudoku: Vorgaben der Lösung stimmen mit dem Rätsel überein', () => {
  const puzzle = generateSudoku('konsistenz', 'hard');
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      if (puzzle.puzzle[r][c] !== 0) assert.equal(puzzle.puzzle[r][c], puzzle.solution[r][c]);
    }
  }
  assert.ok(puzzle.holes >= SUDOKU_HOLES.hard - 2);
});

test('Sudoku: gleicher Seed erzeugt identisches Rätsel', () => {
  const a = generateSudoku('determinismus', 'medium');
  const b = generateSudoku('determinismus', 'medium');
  assert.deepEqual(a.puzzle, b.puzzle);
  const c = generateSudoku('anderer-seed', 'medium');
  assert.notDeepEqual(a.puzzle, c.puzzle);
});

test('Wortsuche: alle Wörter sind im Gitter auffindbar', () => {
  const words = wordsForCategories(['tiere', 'garten']);
  const puzzle = generateWordSearch(words, { size: 15, seed: 'ws-1', wordCount: 12 });
  assert.equal(puzzle.grid.length, 15);
  assert.ok(puzzle.placements.length >= 8);
  for (const placement of puzzle.placements) {
    const letters = [...placement.word];
    letters.forEach((letter, i) => {
      const r = placement.row + placement.dRow * i;
      const c = placement.col + placement.dCol * i;
      assert.equal(puzzle.grid[r][c], letter, `${placement.word} bei ${r},${c}`);
    });
  }
});

test('Wortsuche: Gittergröße richtet sich nach dem längsten Wort', () => {
  assert.equal(suggestGridSize(['IGEL'], 11), 11);
  assert.equal(suggestGridSize(['SCHMETTERLING'], 11), 14);
  assert.equal(suggestGridSize(['X'.repeat(40)]), 19);
});

test('Wortlisten enthalten nur gültige Großbuchstaben', () => {
  for (const [id, set] of Object.entries(WORDSETS)) {
    assert.ok(set.words.length >= 25, `${id} hat zu wenige Wörter`);
    for (const word of set.words) {
      assert.match(word, /^[A-ZÄÖÜÉ]{3,}$/, `${id}: ${word}`);
    }
  }
});

test('Labyrinth: Start und Ziel sind verbunden, Pfad ist lückenlos', () => {
  const maze = generateMaze('maze-1', { cols: 15, rows: 21 });
  const path = solveMaze(maze);
  assert.ok(path.length > 10);
  assert.deepEqual(path[0], { x: 1, y: 1 });
  assert.deepEqual(path[path.length - 1], maze.goal);
  for (let i = 1; i < path.length; i += 1) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);
    assert.equal(dx + dy, 1, 'Pfad springt');
    assert.equal(maze.walls[path[i].y][path[i].x], 0, 'Pfad läuft durch eine Wand');
  }
});

test('Labyrinth: gleicher Seed erzeugt identisches Labyrinth', () => {
  const a = generateMaze('gleich', { cols: 11, rows: 11 });
  const b = generateMaze('gleich', { cols: 11, rows: 11 });
  assert.deepEqual(a.walls, b.walls);
});
