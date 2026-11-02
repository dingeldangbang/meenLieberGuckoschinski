import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coverDimensions,
  interiorMargins,
  minimumListPrice,
  priceLadder,
  printingCost,
  printingCostEur,
  revenueScenarios,
  round,
  royaltyBreakdown,
  spineTextAllowed,
  spineWidthInches,
  kdpGutterInches,
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

test('Barcode-Freizone sitzt unten rechts auf der Rückseite', () => {
  const dims = coverDimensions({ pageCount: 200, trim: '5.5x8.5' });
  // Rückseite endet am Rücken: 0,125 (Beschnitt) + 5,5 - 0,25 (Abstand) - 2 (Breite)
  const backRight = 0.125 + 5.5;
  assert.equal(dims.barcode.rightOffsetIn, 0.25);
  assert.equal(dims.barcode.leftIn, round(backRight - 0.25 - 2, 4));
  assert.equal(dims.barcode.bottomIn, 0.375);
  assert.equal(dims.barcode.widthIn, 2);
  assert.equal(dims.barcode.heightIn, 1.2);
  assert.equal(dims.barcodeZone.insideBackCover, true);
  const [from, to] = dims.barcodeZone.backCoverRange;
  assert.ok(dims.barcodeZone.x >= from && dims.barcodeZone.x + dims.barcodeZone.width <= to);
});

test('Großformat und Innenränder skalieren mit dem Format', () => {
  const dims = coverDimensions({ pageCount: 100, trim: '8.5x11' });
  assert.equal(dims.totalWidthIn, 0.125 + 8.5 + spineWidthInches(100, 'white') + 8.5 + 0.125);
  const margins = interiorMargins({ pageCount: 200, trim: '6x9' });
  assert.equal(margins.gutterMinIn, 0.5);
  assert.equal(margins.insideIn, 0.625, 'KDP-Minimum plus Komfortzugabe');
  assert.ok(margins.kdpCompliant);
  const thick = interiorMargins({ pageCount: 600, trim: '6x9' });
  assert.equal(thick.gutterMinIn, 0.75);
  assert.ok(thick.topIn > margins.topIn, 'dicke Bücher brauchen mehr Rand oben/unten');
  const small = interiorMargins({ pageCount: 60, trim: '5x8' });
  assert.equal(small.insideIn, 0.4375);
});

test('Druckkosten und Tantieme rechnen konsistent', () => {
  // 1,00 EUR Grundpreis + 0,012 EUR je Seite (KDP-Staffel ab 111 Seiten)
  assert.equal(printingCostEur(134), 2.61);
  const r = royaltyBreakdown({ pageCount: 134, priceEur: 9.99 });
  assert.equal(r.printingCostEur, 2.61);
  assert.equal(r.grossRoyaltyEur, 5.99);
  assert.equal(r.payoutEur, 3.38);
  assert.equal(r.marginPercent, 33.8);
  assert.equal(r.minimumListPriceEur, minimumListPrice(2.61));
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
  assert.equal(rows[1].monthlyEur, 338);
  assert.equal(rows[1].yearlyEur, 4056);
});

test('KDP-Seitengrenzen sind dokumentiert und plausibel', () => {
  assert.deepEqual(PAGE_LIMITS, { min: 24, max: 828 });
});

test('Tantiemensprung an der 9,99-EUR-Schwelle ist explizit ausgewiesen', () => {
  const below = royaltyBreakdown({ pageCount: 200, priceEur: 9.5 });
  const at = royaltyBreakdown({ pageCount: 200, priceEur: 9.99 });

  assert.equal(below.royaltyRate, 0.5);
  assert.equal(at.royaltyRate, 0.6);
  assert.equal(below.gapToThresholdEur, 0.49);
  assert.equal(below.thresholdJumpEur, 1.24);
  assert.match(below.recommendation, /9,99 €/);
  assert.ok(at.payoutEur > below.payoutEur);
});

test('Druckkosten folgen der KDP-Staffel: Pauschale bis 110 Seiten, danach pro Seite', () => {
  assert.equal(printingCost(110, { trim: '6x9' }), 2.3);
  assert.equal(printingCost(111, { trim: '6x9' }), 2.33);
  assert.ok(printingCost(400, { trim: '6x9' }) > printingCost(300, { trim: '6x9' }));
  // Großformat kostet pro Seite mehr, aber auch pauschal
  assert.ok(printingCost(400, { trim: '8.5x11' }) > printingCost(400, { trim: '6x9' }));
  assert.equal(printingCost(300, { trim: '6x9', marketplace: 'uk' }), 3.85);
});

test('Innensteg folgt der offiziellen KDP-Staffel', () => {
  assert.equal(kdpGutterInches(100), 0.375);
  assert.equal(kdpGutterInches(150), 0.375);
  assert.equal(kdpGutterInches(151), 0.5);
  assert.equal(kdpGutterInches(300), 0.5);
  assert.equal(kdpGutterInches(301), 0.625);
  assert.equal(kdpGutterInches(500), 0.625);
  assert.equal(kdpGutterInches(501), 0.75);
  assert.equal(kdpGutterInches(700), 0.75);
  assert.equal(kdpGutterInches(701), 0.875);
  assert.equal(kdpGutterInches(828), 0.875);
});

test('Rückenbeschriftung erst ab 80 Seiten', () => {
  assert.equal(spineTextAllowed(78), false);
  assert.equal(spineTextAllowed(80), true);
  assert.equal(spineTextAllowed(300), true);
});

test('Cremefarbenes Papier erzeugt einen dickeren Rücken als Weiß', () => {
  const white = spineWidthInches(200, 'white');
  const cream = spineWidthInches(200, 'cream');
  assert.ok(cream > white);
  assert.equal(round(cream - white, 4), 0.0496);
});

test('Mindestpreis deckt mindestens die Druckkosten', () => {
  for (const pages of [40, 200, 500]) {
    const min = minimumListPrice(printingCost(pages, { trim: '6x9' }));
    const revenue = royaltyBreakdown({ pageCount: pages, priceEur: min });
    assert.ok(revenue.payoutEur >= 0, `Mindestpreis bei ${pages} Seiten muss kostendeckend sein`);
  }
});
