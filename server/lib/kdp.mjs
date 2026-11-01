/**
 * KDP-Geometrie, Druckkosten und Tantiemen.
 *
 * Quellen der Konstanten:
 *  - Papierstärke pro Seite (Inch): publizierte KDP-Werte für den Buchrücken-Rechner.
 *  - Druckkosten Amazon.de Taschenbuch, Schwarzweißdruck: Fixkosten + Seitenpreis.
 * Alle Geldbeträge in EUR (Amazon.de Marktplatz). Werte sind reproduzierbare
 * Rechenmodelle - die verbindliche Zahl zeigt immer das KDP-Dashboard an.
 */

export const INCH_TO_PT = 72;

export const BLEED_IN = 0.125;

/** Papierstärke pro Buchseite in Zoll (KDP-Rückenrechner). */
export const PAPER_THICKNESS = {
  white: 0.002252,
  cream: 0.0025,
  color: 0.002347,
};

export const TRIM_SIZES = {
  '5x8': { width: 5, height: 8, label: '5" × 8"' },
  '5.25x8': { width: 5.25, height: 8, label: '5.25" × 8"' },
  '5.5x8.5': { width: 5.5, height: 8.5, label: '5.5" × 8.5"' },
  '6x9': { width: 6, height: 9, label: '6" × 9" (Standard)' },
  '6.69x9.61': { width: 6.69, height: 9.61, label: '6.69" × 9.61"' },
  '7x10': { width: 7, height: 10, label: '7" × 10"' },
  '7.5x9.25': { width: 7.5, height: 9.25, label: '7.5" × 9.25"' },
  '8x10': { width: 8, height: 10, label: '8" × 10"' },
  '8.5x11': { width: 8.5, height: 11, label: '8.5" × 11" (Großformat)' },
};

export const PAGE_LIMITS = { min: 24, max: 828 };

export function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function trimSize(trimKey) {
  const trim = TRIM_SIZES[trimKey];
  if (!trim) throw new Error(`Unbekanntes Buchformat: ${trimKey}`);
  return trim;
}

/** Buchrückenbreite in Zoll, kaufmännisch auf 4 Stellen gerundet (wie KDP). */
export function spineWidthInches(pageCount, paper = 'white') {
  const factor = PAPER_THICKNESS[paper];
  if (!factor) throw new Error(`Unbekannte Papierart: ${paper}`);
  return round(pageCount * factor, 4);
}

/**
 * Vollständige Cover-Maße (Rückseite + Rücken + Vorderseite + Beschnitt).
 */
export function coverDimensions({ pageCount, trim = '6x9', paper = 'white' }) {
  const size = trimSize(trim);
  const spine = spineWidthInches(pageCount, paper);
  const width = round(BLEED_IN + size.width + spine + size.width + BLEED_IN, 4);
  const height = round(size.height + BLEED_IN * 2, 4);
  return {
    trim,
    trimWidth: size.width,
    trimHeight: size.height,
    paper,
    pageCount,
    bleedIn: BLEED_IN,
    spineIn: spine,
    totalWidthIn: width,
    totalHeightIn: height,
    // Barcode-Freizone: 2" × 1.2", unten links auf der Rückseite, 0.25" vom Beschnitt
    barcode: {
      widthIn: 2,
      heightIn: 1.2,
      leftIn: round(BLEED_IN + 0.25, 4),
      bottomIn: round(BLEED_IN + 0.25, 4),
    },
    pixels300dpi: {
      width: Math.round(width * 300),
      height: Math.round(height * 300),
      spine: Math.round(spine * 300),
    },
    points: {
      width: round(width * INCH_TO_PT, 2),
      height: round(height * INCH_TO_PT, 2),
      spine: round(spine * INCH_TO_PT, 2),
    },
  };
}

/**
 * Innenränder nach KDP-Vorgabe. Ab 151 Seiten ist innen 0.75" Pflicht,
 * darunter wären 0.375" erlaubt - wir setzen immer den komfortableren Wert.
 */
export function interiorMargins({ pageCount, trim = '6x9' }) {
  const size = trimSize(trim);
  const compact = size.width < 5.5;
  const inside = pageCount > 150 ? 0.75 : compact ? 0.5 : 0.625;
  const base = compact ? 0.5 : 0.625;
  return {
    insideIn: inside,
    outsideIn: base,
    topIn: pageCount > 150 ? 0.75 : base,
    bottomIn: pageCount > 150 ? 0.75 : base,
    gutterIn: inside - base,
  };
}

/** Druckkosten Taschenbuch (Amazon.de, Schwarzweiß). */
export function printingCostEur(pageCount, { ink = 'black' } = {}) {
  if (ink !== 'black') throw new Error('Farbdruck wird von der Buchmaschine nicht erzeugt.');
  const fixed = 0.6;
  const perPage = 0.012;
  return round(fixed + pageCount * perPage, 2);
}

export const ROYALTY_RATE_PRINT = 0.6;
export const EBOOK_ROYALTY_BAND = { min: 2.99, max: 9.99, rate: 0.7, deliveryPerMb: 0.12 };

/** Mindest-Verkaufspreis, damit die Tantieme nicht negativ wird. */
export function minimumListPrice(printingCost) {
  return round(Math.ceil((printingCost / ROYALTY_RATE_PRINT) * 100) / 100, 2);
}

/** Tantiemen-Aufstellung für einen Verkaufspreis. */
export function royaltyBreakdown({ pageCount, priceEur, trim = '6x9', paper = 'white' }) {
  const cost = printingCostEur(pageCount);
  const minPrice = minimumListPrice(cost);
  const price = round(Number(priceEur) || 0, 2);
  const gross = round(price * ROYALTY_RATE_PRINT, 2);
  const payout = round(gross - cost, 2);
  const margin = price > 0 ? round((payout / price) * 100, 1) : 0;
  const ebookInBand = price >= EBOOK_ROYALTY_BAND.min && price <= EBOOK_ROYALTY_BAND.max;
  const ebookDelivery = round(1.2 * EBOOK_ROYALTY_BAND.deliveryPerMb, 2);
  return {
    trim,
    paper,
    pageCount,
    listPriceEur: price,
    printingCostEur: cost,
    minimumListPriceEur: minPrice,
    royaltyRate: ROYALTY_RATE_PRINT,
    grossRoyaltyEur: gross,
    payoutEur: payout,
    marginPercent: margin,
    belowMinimum: price < minPrice,
    ebook: {
      eligibleFor70: ebookInBand,
      rate: ebookInBand ? EBOOK_ROYALTY_BAND.rate : 0.35,
      estimatedDeliveryEur: ebookDelivery,
      estimatedPayoutEur: round(price * (ebookInBand ? 0.7 : 0.35) - ebookDelivery, 2),
    },
    // Break-even: wie viele Verkäufe decken eine fiktive Monatsgebühr von 0 € ab
    disclaimer:
      'Rechenmodell für Amazon.de, Schwarzweißdruck. Verbindlich ist die Vorschau im KDP-Dashboard.',
  };
}

/** Umsatz-Szenarien für Preis-/Absatzannahmen. */
export function revenueScenarios({ pageCount, priceEur, monthlySales = [10, 30, 100] }) {
  const base = royaltyBreakdown({ pageCount, priceEur });
  return monthlySales.map((sales) => ({
    salesPerMonth: sales,
    monthlyEur: round(base.payoutEur * sales, 2),
    yearlyEur: round(base.payoutEur * sales * 12, 2),
  }));
}

/** Preis-Optimierung: Kandidaten mit Tantieme und Abstand zum Mindestpreis. */
export function priceLadder({ pageCount, from = 7.99, to = 19.99, step = 1 }) {
  const cost = printingCostEur(pageCount);
  const min = minimumListPrice(cost);
  const prices = [];
  for (let p = Math.max(from, min); p <= to + 0.001; p += step) {
    const price = round(p, 2);
    prices.push({ price, payout: round(price * ROYALTY_RATE_PRINT - cost, 2) });
  }
  return { printingCostEur: cost, minimumListPriceEur: min, prices };
}
