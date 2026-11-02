import test from 'node:test';
import assert from 'node:assert/strict';

import { keywordResearch, parseSuggestions, scoreSuggestion, clearSuggestCache } from '../server/lib/suggest.mjs';
import { buildPortfolio } from '../server/lib/portfolio.mjs';

/* --------------------------- Amazon Suggest ------------------------------ */

test('parseSuggestions liest das Amazon-Format', () => {
  const raw = ['rätselbuch für', ['rätselbuch für senioren', 'rätselbuch für kinder', 'rätselbuch für'], ['stripbooks'], [], {}];
  assert.deepEqual(parseSuggestions(raw), ['rätselbuch für senioren', 'rätselbuch für kinder', 'rätselbuch für']);
});

test('parseSuggestions verträgt kaputte Antworten', () => {
  assert.deepEqual(parseSuggestions(null), []);
  assert.deepEqual(parseSuggestions({}), []);
  assert.deepEqual(parseSuggestions(['prefix']), []);
  assert.deepEqual(parseSuggestions(['prefix', [null, 42, 'ok']]), ['ok']);
});

test('Longtail-Phrasen bekommen einen besseren Score als Einzelwörter', () => {
  const broad = scoreSuggestion('rätsel', 0);
  const long = scoreSuggestion('rätselbuch für senioren große schrift', 0);
  assert.ok(long.score > broad.score);
  assert.equal(long.longtail, true);
  assert.equal(broad.longtail, false);
  assert.equal(long.source, 'amazon-suggest');
});

test('Live-Antwort wird übernommen und angereichert', async () => {
  clearSuggestCache();
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ['senioren rätsel', ['senioren rätsel großdruck', 'senioren rätselbuch mit lösungen'], [], [], {}],
  });
  const result = await keywordResearch('senioren rätsel', { fetchImpl: fakeFetch });
  assert.equal(result.live, true);
  assert.equal(result.source, 'amazon-suggest');
  assert.ok(result.ideas.length > 2);
  assert.ok(result.ideas.some((idea) => idea.term === 'senioren rätsel großdruck'));
  assert.ok(result.ideas.every((idea) => typeof idea.score === 'number'));
});

test('HTTP-Fehler fallen auf die Offline-Werkstatt zurück', async () => {
  clearSuggestCache();
  const failing = async () => ({ ok: false, status: 503 });
  const result = await keywordResearch('overthinking buch', { fetchImpl: failing });
  assert.equal(result.live, false);
  assert.equal(result.source, 'amazon-error');
  assert.ok(result.ideas.length > 5);
  assert.match(result.note, /Offline-Werkstatt/);
});

test('Netzwerkfehler und Zeitüberschreitung werden abgefangen', async () => {
  clearSuggestCache();
  const throwing = async () => {
    const error = new Error('ECONNREFUSED');
    throw error;
  };
  const result = await keywordResearch('hundetraining', { fetchImpl: throwing });
  assert.equal(result.live, false);
  assert.ok(result.ideas.length > 0);
});

test('zu kurze Eingaben werden nicht an Amazon geschickt', async () => {
  let called = false;
  const spy = async () => {
    called = true;
    return { ok: true, json: async () => ['x', []] };
  };
  const result = await keywordResearch('a', { fetchImpl: spy });
  assert.equal(called, false);
  assert.equal(result.live, false);
});

/* ------------------------------ Portfolio -------------------------------- */

const projects = [
  {
    id: 'p1',
    name: 'Rätsel für Senioren',
    updatedAt: '2025-01-02T10:00:00Z',
    config: { title: 'Große Rätsel', generator: 'sudoku', trim: '8.5x11', pageCount: 134, priceEur: 9.99, keywords: ['a', 'b'] },
  },
  {
    id: 'p2',
    name: 'Notizbuch',
    updatedAt: '2025-01-03T10:00:00Z',
    config: { title: 'Einfach notiert', generator: 'notebook', trim: '6x9', pageCount: 120, priceEur: 6.99 },
  },
  {
    id: 'p3',
    name: 'Unterpreis',
    updatedAt: '2025-01-04T10:00:00Z',
    config: { title: 'Zu billig', generator: 'sudoku', trim: '6x9', pageCount: 400, priceEur: 5.99 },
  },
];

test('Portfolio berechnet Tantiemen je Projekt', () => {
  const { rows, summary } = buildPortfolio(projects, { salesPerBook: 10 });
  assert.equal(rows.length, 3);
  assert.equal(summary.projectCount, 3);
  assert.equal(summary.totalPages, 134 + 120 + 400);
  assert.equal(summary.salesPerBook, 10);

  const senioren = rows.find((r) => r.id === 'p1');
  assert.equal(senioren.printingCostEur, 2.61);
  assert.equal(senioren.royaltyPerSaleEur, 3.38);
  assert.equal(senioren.monthlyEur, 33.8);
  assert.ok(senioren.spineIn > 0.29 && senioren.spineIn < 0.31);
});

test('Portfolio sortiert nach Tantieme und markiert Unterpreis-Projekte', () => {
  const { rows, summary } = buildPortfolio(projects, { salesPerBook: 5 });
  assert.equal(rows[0].id, 'p1');
  assert.ok(summary.warnings.some((w) => w.includes('Unterpreis')));
  assert.equal(summary.bestSeller.id, 'p1');
});

test('Portfolio kommt mit leerer Liste klar', () => {
  const { rows, summary } = buildPortfolio([], { salesPerBook: 10 });
  assert.equal(rows.length, 0);
  assert.equal(summary.monthlyEurAllEur, 0);
  assert.equal(summary.bestSeller, null);
  assert.equal(summary.averagePriceEur, 0);
});

test('Portfolio zählt Buch-Typen und Formate', () => {
  const { summary } = buildPortfolio(projects, { salesPerBook: 1 });
  assert.equal(summary.byGenerator.sudoku, 2);
  assert.equal(summary.byGenerator.notebook, 1);
  assert.equal(summary.byTrim['6x9'], 2);
});
