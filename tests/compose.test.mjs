import test from 'node:test';
import assert from 'node:assert/strict';

import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook, summarizePlan } from '../server/lib/compose.mjs';

const base = {
  title: 'Große Rätsel für kluge Köpfe',
  subtitle: 'Sudoku in Großdruck',
  author: 'Test Autorin',
  description: 'Ein Testbuch.',
  generator: 'sudoku',
  pageCount: 64,
  trim: '6x9',
  paper: 'white',
  priceEur: 9.99,
  seed: 'test-seed',
};

test('Validierung normalisiert eine gültige Konfiguration', () => {
  const result = validateBookConfig(base);
  assert.equal(result.ok, true);
  assert.equal(result.config.pageCount, 64);
  assert.equal(result.config.seed, 'test-seed');
});

test('Validierung erzwingt eine gerade Seitenzahl', () => {
  const result = validateBookConfig({ ...base, pageCount: 65 });
  assert.equal(result.ok, true);
  assert.equal(result.config.pageCount, 66);
});

test('Validierung lehnt unzulässige Eingaben ab', () => {
  const cases = [
    [{ ...base, pageCount: 12 }, 'Seitenzahl'],
    [{ ...base, pageCount: 900 }, 'Seitenzahl'],
    [{ ...base, paper: 'color' }, 'Schwarzweiß'],
    [{ ...base, keywords: ['1', '2', '3', '4', '5', '6', '7', '8'] }, '7 Keyword'],
    [{ ...base, generator: 'hologramm' }, 'Buch-Typ'],
    [{ ...base, trim: 'din-a4' }, 'Format'],
    [{ ...base, priceEur: 0.1 }, 'Verkaufspreis'],
  ];
  for (const [input, expected] of cases) {
    const result = validateBookConfig(input);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.ok(
      result.errors.some((e) => e.includes(expected)),
      `erwartete "${expected}" in ${JSON.stringify(result.errors)}`,
    );
  }
});

test('Seitenplan trifft die gewünschte Seitenzahl exakt', () => {
  for (const pageCount of [24, 48, 100, 134, 200]) {
    const { config } = validateBookConfig({ ...base, pageCount });
    const plan = composeBook(config);
    assert.equal(plan.pages.length, config.pageCount);
    assert.equal(plan.stats.pageCount, config.pageCount);
  }
});

test('Seitenplan beginnt mit Titel, Impressum und Anleitung', () => {
  const { config } = validateBookConfig(base);
  const plan = composeBook(config);
  assert.deepEqual(plan.pages.slice(0, 4).map((p) => p.type), ['title', 'copyright', 'howto', 'belongs']);
  assert.equal(plan.pages.at(-2).type, 'closing');
});

test('Rätselbuch enthält Rätsel und Lösungsseiten mit Seitenzahlen', () => {
  const { config } = validateBookConfig({ ...base, pageCount: 100 });
  const plan = composeBook(config);
  const puzzles = plan.pages.filter((p) => p.type === 'sudoku');
  const solutions = plan.pages.filter((p) => p.type === 'sudokuSolutions');
  assert.ok(puzzles.length > 20);
  assert.equal(solutions.length, Math.ceil(puzzles.length / 4));
  assert.equal(plan.stats.puzzleCount, puzzles.length);
  const numbered = plan.pages.filter((p) => p.number !== null);
  assert.equal(numbered[0].number, 5);
});

test('Übungsbuch enthält Kapitel mit Übungen', () => {
  const { config } = validateBookConfig({ ...base, generator: 'workbook', nicheId: 'overthinking-workbook', theme: 'overthinking', pageCount: 80 });
  const plan = composeBook(config);
  const chapters = plan.pages.filter((p) => p.type === 'chapter');
  const exercises = plan.pages.filter((p) => p.type === 'exercise');
  assert.ok(chapters.length >= 4);
  assert.ok(exercises.length >= chapters.length);
});

test('Journal wechselt Tagesseiten und Wochenrückblicke', () => {
  const { config } = validateBookConfig({ ...base, generator: 'journal', pageCount: 60 });
  const plan = composeBook(config);
  assert.ok(plan.pages.some((p) => p.type === 'journalDay'));
  assert.ok(plan.pages.some((p) => p.type === 'weekly'));
});

test('Notizbuch füllt mit dem gewählten Raster', () => {
  const { config } = validateBookConfig({ ...base, generator: 'notebook', notebookStyle: 'dotted', pageCount: 40 });
  const plan = composeBook(config);
  const lines = plan.pages.filter((p) => p.type === 'lines');
  const dotted = lines.filter((p) => p.style === 'dotted');
  assert.ok(lines.length > 20);
  assert.ok(dotted.length >= lines.length - 2, 'Innenseiten nutzen das Punkt-Raster');
});

test('Determinismus: gleicher Seed erzeugt identischen Plan', () => {
  const { config } = validateBookConfig({ ...base, pageCount: 48, seed: 'gleich' });
  const a = composeBook(config);
  const b = composeBook(config);
  assert.deepEqual(a.pages.map((p) => p.type), b.pages.map((p) => p.type));
  const firstA = a.pages.find((p) => p.type === 'sudoku').puzzle.puzzle;
  const firstB = b.pages.find((p) => p.type === 'sudoku').puzzle.puzzle;
  assert.deepEqual(firstA, firstB);
});

test('Zusammenfassung enthält Kalkulation und Seitentypen', () => {
  const { config } = validateBookConfig(base);
  const summary = summarizePlan(composeBook(config));
  assert.equal(summary.pageCount, 64);
  assert.ok(summary.royalties.payoutEur > 0);
  assert.equal(summary.pages.length, 64);
  assert.equal(typeof summary.pages[0].label, 'string');
});
