import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coverDimensions,
  interiorMargins,
  minimumListPrice,
  priceLadder,
  printingCostEur,
  revenueScenarios,
  royaltyBreakdown,
  spineWidthInches,
  PAGE_LIMITS,
} from '../server/lib/kdp.mjs';

test('Buchrücken entspricht der KDP-Formel', () => {
  assert.equal(spineWidthInches(134, 'white'), 0.3018);
  assert.equal(spineWidthInches(120, 'cream'), 0.3);
  assert.equal(spineWidthInches(24, 'white'), 0.054);
  assert.throws(() => spineWidthInches(100, 'gold'), /Unbekannte Papierart/);
});

test('Cover-Maße enthalten Beschnitt auf beiden Seiten', () => {
  const dims = coverDimensions({ pageCount: 134, trim: '6x9', paper: 'white' });
  assert.equal(dims.spineIn, 0.3018);
  assert.equal(dims.totalWidthIn, 12.5518);
  assert.equal(dims.totalHeightIn, 9.25);
  assert.equal(dims.pixels300dpi.width, Math.round(12.5518 * 300));
  assert.equal(dims.bleedIn, 0.125);
});

test('Barcode-Freizone sitzt 0,375 Zoll vom Rand', () => {
  const dims = coverDimensions({ pageCount: 200, trim: '5.5x8.5' });
  assert.equal(dims.barcode.leftIn, 0.375);
  assert.equal(dims.barcode.widthIn, 2);
  assert.equal(dims.barcode.heightIn, 1.2);
});

test('Großformat und Innenränder skalieren mit dem Format', () => {
  const dims = coverDimensions({ pageCount: 100, trim: '8.5x11' });
  assert.equal(dims.totalWidthIn, 0.125 + 8.5 + spineWidthInches(100, 'white') + 8.5 + 0.125);
  const margins = interiorMargins({ pageCount: 200, trim: '6x9' });
  assert.equal(margins.insideIn, 0.75);
  assert.ok(margins.insideIn > margins.outsideIn);
  const small = interiorMargins({ pageCount: 60, trim: '5x8' });
  assert.equal(small.insideIn, 0.5);
});

test('Druckkosten und Tantieme rechnen konsistent', () => {
  assert.equal(printingCostEur(134), 2.21);
  const r = royaltyBreakdown({ pageCount: 134, priceEur: 9.99 });
  assert.equal(r.printingCostEur, 2.21);
  assert.equal(r.grossRoyaltyEur, 5.99);
  assert.equal(r.payoutEur, 3.78);
  assert.equal(r.minimumListPriceEur, minimumListPrice(2.21));
  assert.equal(r.belowMinimum, false);
  assert.throws(() => printingCostEur(100, { ink: 'color' }), /Farbdruck/);
});

test('Preis unterhalb des Mindestpreises wird markiert', () => {
  const r = royaltyBreakdown({ pageCount: 400, priceEur: 5.99 });
  assert.equal(r.belowMinimum, true);
  assert.ok(r.payoutEur < 0);
});

test('E-Book-Tantieme trennt 70-%-Band und 35-%-Band', () => {
  const inBand = royaltyBreakdown({ pageCount: 100, priceEur: 4.99 });
  assert.equal(inBand.ebook.eligibleFor70, true);
  assert.equal(inBand.ebook.rate, 0.7);
  const outOfBand = royaltyBreakdown({ pageCount: 100, priceEur: 12.99 });
  assert.equal(outOfBand.ebook.eligibleFor70, false);
  assert.equal(outOfBand.ebook.rate, 0.35);
});

test('Preisleiter startet nicht unter dem Mindestpreis', () => {
  const ladder = priceLadder({ pageCount: 200 });
  assert.ok(ladder.prices.length > 0);
  for (const entry of ladder.prices) {
    assert.ok(entry.price >= ladder.minimumListPriceEur);
    assert.ok(entry.payout > 0);
  }
});

test('Umsatzszenarien sind linear in der Tantieme', () => {
  const rows = revenueScenarios({ pageCount: 134, priceEur: 9.99, monthlySales: [10, 100] });
  assert.equal(rows.length, 2);
  assert.equal(rows[1].monthlyEur, 378);
  assert.equal(rows[1].yearlyEur, 4536);
});

test('KDP-Seitengrenzen sind dokumentiert und plausibel', () => {
  assert.deepEqual(PAGE_LIMITS, { min: 24, max: 828 });
});
