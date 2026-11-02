/** Labyrinth-Generator: perfekte Labyrinthe (genau ein Weg zwischen zwei Punkten). */
import { createRng } from '../rng.mjs';

/**
 * @param {string|number} seed
 * @param {{cols?:number, rows?:number, braid?:number}} options
 *   cols/rows sollten ungerade sein; braid entfernt zusätzliche Wände (mehr Abkürzungen)
 */
export function generateMaze(seed, options = {}) {
  const rng = createRng(`maze:${seed}`);
  const cols = options.cols % 2 === 1 ? options.cols : (options.cols ?? 15) + 1;
  const rows = options.rows % 2 === 1 ? options.rows : (options.rows ?? 21) + 1;

  const walls = new Uint8Array(cols * rows).fill(1);
  const idx = (x, y) => y * cols + x;
  walls[idx(1, 1)] = 0;

  const stack = [[1, 1]];
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const neighbours = [];
    for (const [dx, dy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx <= 0 || ny <= 0 || nx >= cols - 1 || ny >= rows - 1) continue;
      if (walls[idx(nx, ny)] === 1) neighbours.push([nx, ny, dx, dy]);
    }
    if (!neighbours.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = rng.pick(neighbours);
    walls[idx(x + dx / 2, y + dy / 2)] = 0;
    walls[idx(nx, ny)] = 0;
    stack.push([nx, ny]);
  }

  // Optionale Abkürzungen: einzelne Innenwände entfernen (macht es kniffliger)
  const braid = options.braid ?? 0;
  for (let i = 0; i < braid; i += 1) {
    const x = 1 + 2 * rng.int((cols - 1) / 2);
    const y = 1 + 2 * rng.int((rows - 1) / 2);
    const candidates = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ].filter(([cx, cy]) => cx > 0 && cy > 0 && cx < cols - 1 && cy < rows - 1);
    const [cx, cy] = rng.pick(candidates);
    walls[idx(cx, cy)] = 0;
  }

  const start = { x: 1, y: 1 };
  const goal = { x: cols - 2, y: rows - 2 };
  const path = solveMaze({ cols, rows, walls }, start, goal);

  return {
    kind: 'maze',
    cols,
    rows,
    walls: Array.from({ length: rows }, (_, y) => Array.from(walls.slice(y * cols, y * cols + cols))),
    start,
    goal,
    path,
    perfect: true,
  };
}

/** Kürzester Pfad per Breitensuche. */
export function solveMaze(maze, start = { x: 1, y: 1 }, goal = null) {
  const { cols, rows, walls } = maze;
  const target = goal ?? { x: cols - 2, y: rows - 2 };
  const nested = Array.isArray(walls[0]);
  const isWall = (x, y) => (nested ? walls[y][x] === 1 : walls[y * cols + x] === 1);
  const seen = new Uint8Array(cols * rows);
  const prev = new Int32Array(cols * rows).fill(-1);
  const queue = [start.y * cols + start.x];
  seen[queue[0]] = 1;
  const goalIdx = target.y * cols + target.x;

  while (queue.length) {
    const current = queue.shift();
    if (current === goalIdx) break;
    const x = current % cols;
    const y = (current / cols) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const nIdx = ny * cols + nx;
      if (seen[nIdx] || isWall(nx, ny)) continue;
      seen[nIdx] = 1;
      prev[nIdx] = current;
      queue.push(nIdx);
    }
  }

  const path = [];
  let cursor = goalIdx;
  if (!seen[goalIdx]) return path;
  while (cursor !== -1) {
    path.push({ x: cursor % cols, y: (cursor / cols) | 0 });
    if (cursor === start.y * cols + start.x) break;
    cursor = prev[cursor];
  }
  return path.reverse();
}
