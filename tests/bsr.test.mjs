import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOK_MODEL,
  CATEGORIES,
  estimateFromRank,
  rankForSales,
  salesPerDay,
} from '../server/lib/bsr.mjs';
import { royaltyBreakdown } from '../server/lib/kdp.mjs';

test('Potenzgesetz fällt monoton mit steigendem Rang', () => {
  const ranks = [1000, 10000, 100000, 500000];
  const sales = ranks.map((rank) => salesPerDay(rank));
  for (let i = 1; i < sales.length; i += 1) {
    assert.ok(sales[i] < sales[i - 1], `Rang ${ranks[i]} muss weniger verkaufen als ${ranks[i - 1]}`);
  }
  assert.ok(BOOK_MODEL.a > 0);
  assert.ok(BOOK_MODEL.b > 0 && BOOK_MODEL.b < 2, 'Exponent muss im plausiblen Bereich liegen');
});

test('Kalibrierungsanker liegen in der Größenordnung der Vorgaben', () => {
  // Das Modell ist ein Ausgleichsfilter über drei Anker, kein exakter Treffer:
  // 20 % Toleranz, damit ein einzelner Ausreißer den Fit nicht sprengt.
  for (const [rank, expected] of [[1000, 50], [10000, 8], [100000, 0.7]]) {
    const value = salesPerDay(rank);
    assert.ok(Math.abs(value - expected) / expected < 0.2, `Rang ${rank}: ${value} statt ~${expected}`);
  }
});

test('Ungültige Ränge werden abgelehnt', () => {
  assert.throws(() => salesPerDay(0), /positiv/);
  assert.throws(() => salesPerDay(Number.NaN), /positiv/);
  assert.throws(() => rankForSales(0), /positiv/);
});

test('Kategorie-Faktoren skalieren den Absatz', () => {
  const base = salesPerDay(20000, { category: 'books' });
  const puzzles = salesPerDay(20000, { category: 'puzzles' });
  assert.equal(puzzles, base * CATEGORIES.puzzles.factor);
  assert.equal(salesPerDay(20000, { category: 'gibtsnicht' }), base);
});

test('estimateFromRank verknüpft Absatz mit der echten Tantieme', () => {
  const estimate = estimateFromRank({ rank: 100000, price: 9.99, pageCount: 134 });
  const royalty = royaltyBreakdown({ pageCount: 134, priceEur: 9.99 });
  assert.equal(estimate.royaltyPerSale, royalty.payoutEur);
  assert.equal(estimate.salesPerMonth, Math.round(estimate.salesPerDay * 30 * 10) / 10);
  assert.equal(estimate.monthlyRevenue, Math.round(estimate.salesPerMonth * royalty.payoutEur * 100) / 100);
  assert.ok(estimate.monthlyRevenue > 0);
  assert.match(estimate.disclaimer, /keine Verkaufszahlen/i);
});

test('rankForSales ist die Umkehrung von salesPerDay', () => {
  const rank = rankForSales(5);
  const back = salesPerDay(rank);
  // Rundung auf ganze Ränge: 2 % Toleranz genügen.
  assert.ok(Math.abs(back - 5) / 5 < 0.02, `${back} statt 5 Verkäufen pro Tag`);
  // Weniger Absatz pro Rang in einer Nische heißt: für dieselben Verkäufe braucht es einen besseren (kleineren) Rang.
  assert.ok(rankForSales(5, { category: 'puzzles' }) < rankForSales(5));
});
