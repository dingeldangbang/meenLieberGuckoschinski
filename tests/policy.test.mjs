import test from 'node:test';
import assert from 'node:assert/strict';

import {
  aiDisclosure,
  complianceReport,
  lowContentRisk,
  scanHype,
  scanTrademarks,
  GENERIC_TERMS,
  HYPE_WORDS,
  KNOWN_TRADEMARKS,
} from '../server/lib/policy.mjs';
import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';

function planFor(overrides = {}) {
  const result = validateBookConfig({
    title: 'Rätsel für lange Abende',
    author: 'Test Autorin',
    description:
      'Ein Rätselbuch mit 60 Sudokus in Großdruck, gestaffelt nach Schwierigkeit und mit allen Lösungen am Ende des Buches. Geeignet für gemütliche Abende und lange Zugfahrten.',
    generator: 'sudoku',
    pageCount: 120,
    priceEur: 9.99,
    seed: 'policy-test',
    keywords: ['rätselbuch großdruck', 'sudoku für senioren', 'geschenk rentner'],
    ...overrides,
  });
  assert.equal(result.ok, true, result.errors?.join(', '));
  return composeBook(result.config);
}

test('Marken-Scan findet Wortmarken, aber keine Gattungsbegriffe', () => {
  const clean = scanTrademarks({ title: 'Sudoku für Einsteiger', keywords: ['sudoku großdruck'] });
  assert.equal(clean.clean, true, 'Sudoku ist ein Gattungsbegriff');
  assert.ok(GENERIC_TERMS.includes('sudoku'));

  const dirty = scanTrademarks({ title: 'Scrabble Training für Kinder', keywords: [] });
  assert.equal(dirty.clean, false);
  assert.equal(dirty.severity, 'block');
  assert.match(dirty.message, /scrabble/i);
});

test('Marken-Scan prüft Wortgrenzen (kein Fehlalarm in zusammengesetzten Wörtern)', () => {
  assert.equal(scanTrademarks({ title: 'Buchungen im Uno-Format' }).clean, false, 'Uno mit Wortgrenze wird gefunden');
  assert.equal(scanTrademarks({ title: 'Buchungen, Notizen und Rechnungen' }).clean, true, 'uno in Buchungen ist kein Treffer');
  assert.equal(scanTrademarks({ title: 'Mein Prime Tagebuch' }).clean, false);
});

test('Werbesprache wird als Warnung und nicht als Blocker gemeldet', () => {
  assert.ok(HYPE_WORDS.includes('bestseller'));
  assert.deepEqual(scanHype({ title: 'Bestseller Rätselbuch' }).hits, ['bestseller']);
  assert.equal(scanHype({ title: 'Bestseller Rätselbuch' }).severity, 'warn');
  assert.deepEqual(scanHype({ title: 'Ruhige Rätsel' }).hits, []);
});

test('KI-Offenlegung: programmatische Rätsel gelten als KI-erzeugt', () => {
  const report = aiDisclosure({ generator: 'sudoku' });
  assert.equal(report.requiresDisclosure, true);
  assert.equal(report.category, 'AI-generated');
  assert.match(report.answer, /Ja/);

  const withHumanText = aiDisclosure({ generator: 'sudoku', humanWrittenText: true });
  assert.match(withHumanText.explanation, /Fließtext stammt von dir/);
});

test('Low-Content-Risiko: Linien-Notizbuch ist hohes Risiko, Rätselbuch nicht', () => {
  const notebook = planFor({ generator: 'notebook', pageCount: 120 });
  const risky = lowContentRisk(notebook.config, notebook);
  assert.notEqual(risky.level, 'low');
  assert.equal(risky.level, 'medium', 'Notizbuch ohne weitere Mängel: mittleres Risiko');
  assert.ok(risky.reasons.some((r) => r.includes('Notizbuch')));
  assert.ok(risky.structuredPageShare < 40, 'Linienseiten zählen nicht als strukturiert');

  const puzzle = planFor();
  const ok = lowContentRisk(puzzle.config, puzzle);
  assert.equal(ok.level, 'low');
  assert.ok(ok.structuredPageShare > 60);
});

test('Compliance-Report: sauberer Titel passiert, Markenfund blockiert', () => {
  const plan = planFor();
  const passed = complianceReport(plan.config, plan);
  assert.equal(passed.status, 'pass');
  assert.equal(passed.blockers.length, 0);
  assert.ok(KNOWN_TRADEMARKS.length > 10);

  const blocked = complianceReport({ ...plan.config, title: 'Pokemon Rätselbuch' }, plan);
  assert.equal(blocked.status, 'review');
  assert.match(blocked.blockers[0], /pokemon/i);
});
