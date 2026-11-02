/**
 * KDP-Geometrie, Ränder, Druckkosten und Tantiemen.
 *
 * Quellen (Stand 2026, alle Werte bleiben Rechenmodell - verbindlich ist immer
 * die Vorschau im KDP-Dashboard):
 *  - Papierstärke je Seite: offizielle KDP-Rückenformel.
 *  - Innensteg (Gutter) nach Seitenzahl: KDP-Mindesttabelle.
 *  - Druckkosten: KDP-Preisliste, Staffel "24–110 Seiten Pauschale", darüber
 *    Fixum + Seitenpreis; Großformate teurer.
 *  - Tantieme: 60 % ab 9,99 €, darunter 50 % (seit Juni 2025 gestaffelt).
 */

export const INCH_TO_PT = 72;

export const BLEED_IN = 0.125;

/** Mindestabstand für Text/Seitenzahlen zur Schnittkante (Live Element Margin). */
export const TRIM_SAFE_MARGIN_IN = 0.25;

/** Sicherheitsabstand der Rückenbeschriftung zu jeder Falzkante. */
export const SPINE_TEXT_SAFE_IN = 0.0625;

/** Papierstärke pro Buchseite in Zoll (KDP-Rückenrechner). */
export const PAPER_THICKNESS = {
  white: 0.002252,
  cream: 0.0025,
  color: 0.002347,
  premiumColor: 0.002347,
  groundwood: 0.00235,
};

/** Zusätzliche Rückenbreite beim Hardcover (Pappendicke). */
export const HARDCOVER_SPINE_ADDITION_IN = 0.189;

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

/** Ab dieser Seitenzahl druckt KDP eine Rückenbeschriftung. */
export const SPINE_TEXT_MIN_PAGES = 80;

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
export function spineWidthInches(pageCount, paper = 'white', { hardcover = false } = {}) {
  const factor = PAPER_THICKNESS[paper];
  if (!factor) throw new Error(`Unbekannte Papierart: ${paper}`);
  const base = pageCount * factor;
  return round(hardcover ? base + HARDCOVER_SPINE_ADDITION_IN : base, 4);
}

/** Ist eine Rückenbeschriftung nach KDP-Regel überhaupt erlaubt? */
export function spineTextAllowed(pageCount, { hardcover = false } = {}) {
  return pageCount >= SPINE_TEXT_MIN_PAGES || (hardcover && pageCount >= 75);
}

/**
 * Vollständige Cover-Maße (Rückseite + Rücken + Vorderseite + Beschnitt).
 * Barcode-Freizone sitzt laut KDP unten RECHTS auf der Rückseite,
 * also an der dem Rücken zugewandten Seite.
 */
export function coverDimensions({ pageCount, trim = '6x9', paper = 'white', hardcover = false }) {
  const size = trimSize(trim);
  const spine = spineWidthInches(pageCount, paper, { hardcover });
  const width = round(BLEED_IN + size.width + spine + size.width + BLEED_IN, 4);
  const height = round(size.height + BLEED_IN * 2, 4);
  const backLeft = BLEED_IN;
  const backRight = BLEED_IN + size.width;
  const barcodeW = 2;
  const barcodeH = 1.2;
  return {
    trim,
    trimWidth: size.width,
    trimHeight: size.height,
    paper,
    hardcover,
    pageCount,
    bleedIn: BLEED_IN,
    spineIn: spine,
    totalWidthIn: width,
    totalHeightIn: height,
    spineTextAllowed: spineTextAllowed(pageCount, { hardcover }),
    spineTextSafeIn: SPINE_TEXT_SAFE_IN,
    // Barcode: 0,25" vom unteren Rand, 0,25" von der Innenkante der Rückseite
    barcode: {
      widthIn: barcodeW,
      heightIn: barcodeH,
      leftIn: round(backRight - 0.25 - barcodeW, 4),
      bottomIn: round(BLEED_IN + 0.25, 4),
      rightOffsetIn: 0.25,
    },
    barcodeZone: {
      x: round(backRight - 0.25 - barcodeW, 4),
      y: round(BLEED_IN + 0.25, 4),
      width: barcodeW,
      height: barcodeH,
      insideBackCover: true,
      backCoverRange: [backLeft, backRight],
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

/** KDP-Mindestinnensteg (Gutter) nach Seitenzahl - offizielle Staffel. */
export function kdpGutterInches(pageCount) {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

/**
 * Satzspiegel. Der Innensteg beginnt beim KDP-Minimum und bekommt einen
 * Komfortzuschlag; außen/oben/unten bleibt deutlich über dem Minimum von 0,25".
 */
export function interiorMargins({ pageCount, trim = '6x9' }) {
  const size = trimSize(trim);
  const compact = size.width < 5.5;
  const gutterMin = kdpGutterInches(pageCount);
  const comfort = compact ? 0.0625 : 0.125;
  const inside = round(Math.min(gutterMin + comfort, size.width * 0.18), 4);
  const outside = compact ? 0.5 : 0.625;
  const vertical = pageCount > 500 ? 0.75 : 0.625;
  return {
    insideIn: inside,
    outsideIn: outside,
    topIn: vertical,
    bottomIn: vertical,
    gutterMinIn: gutterMin,
    gutterSurplusIn: round(inside - gutterMin, 4),
    trimSafeIn: TRIM_SAFE_MARGIN_IN,
    contentWidthIn: round(size.width - inside - outside, 4),
    contentHeightIn: round(size.height - vertical * 2, 4),
    kdpCompliant: inside >= gutterMin && outside >= TRIM_SAFE_MARGIN_IN && vertical >= TRIM_SAFE_MARGIN_IN,
  };
}

/* ----------------------------- Druckkosten ------------------------------ */

/**
 * Preistabellen je Marktplatz. "regular" = Trim bis 6,12 × 9",
 * "large" = größere Formate (z. B. 8,5 × 11").
 */
export const PRINT_PRICING = {
  de: {
    currency: 'EUR',
    label: 'Amazon.de',
    black: {
      regular: { flatMaxPages: 110, flat: 2.3, fixed: 1.0, perPage: 0.012 },
      large: { flatMaxPages: 110, flat: 2.84, fixed: 1.0, perPage: 0.017 },
    },
  },
  com: {
    currency: 'USD',
    label: 'Amazon.com',
    black: {
      regular: { flatMaxPages: 110, flat: 2.3, fixed: 1.0, perPage: 0.012 },
      large: { flatMaxPages: 110, flat: 2.84, fixed: 1.0, perPage: 0.017 },
    },
  },
  uk: {
    currency: 'GBP',
    label: 'Amazon.co.uk',
    black: {
      regular: { flatMaxPages: 110, flat: 2.3, fixed: 0.85, perPage: 0.01 },
      large: { flatMaxPages: 110, flat: 2.84, fixed: 0.85, perPage: 0.014 },
    },
  },
};

export const DEFAULT_MARKETPLACE = 'de';

/** Ist das Format "large trim" (> 6,12 × 9 Zoll)? */
export function isLargeTrim(trimKey) {
  const size = trimSize(trimKey);
  return size.width > 6.12 || size.height > 9;
}

export function printTierFor({ trim = '6x9', marketplace = DEFAULT_MARKETPLACE }) {
  const table = PRINT_PRICING[marketplace];
  if (!table) throw new Error(`Unbekannter Marktplatz: ${marketplace}`);
  return isLargeTrim(trim) ? table.black.large : table.black.regular;
}

/**
 * Druckkosten nach KDP-Staffel: kleine Bücher zahlen eine Pauschale,
 * größere Fixum + Seitenpreis.
 */
export function printingCost(pageCount, { trim = '6x9', marketplace = DEFAULT_MARKETPLACE, ink = 'black' } = {}) {
  if (ink !== 'black') throw new Error('Farbdruck wird von der Buchmaschine nicht erzeugt.');
  const tier = printTierFor({ trim, marketplace });
  const cost = pageCount <= tier.flatMaxPages ? tier.flat : tier.fixed + pageCount * tier.perPage;
  return round(cost, 2);
}

/** Rückwärtskompatibler Name für den bisherigen Aufrufer. */
export function printingCostEur(pageCount, options = {}) {
  return printingCost(pageCount, options);
}

/* ------------------------------ Tantiemen -------------------------------- */

export const ROYALTY_TIERS = {
  de: { high: 0.6, low: 0.5, threshold: 9.99 },
  com: { high: 0.6, low: 0.5, threshold: 9.99 },
  uk: { high: 0.6, low: 0.5, threshold: 7.99 },
};

export const EBOOK_ROYALTY_BAND = { min: 2.99, max: 9.99, rate: 0.7, deliveryPerMb: 0.12 };

export function royaltyRateFor(price, marketplace = DEFAULT_MARKETPLACE) {
  const tier = ROYALTY_TIERS[marketplace] ?? ROYALTY_TIERS.de;
  return Number(price) >= tier.threshold ? tier.high : tier.low;
}

/**
 * Mindestpreis, bei dem die Tantieme nicht negativ wird.
 *
 * Die Tantiemestufe hängt selbst vom Preis ab: unter der Schwelle gelten 50 %.
 * Ein Preis knapp unter der Schwelle kann deshalb trotz höherem Preis weniger
 * abwerfen - der Mindestpreis springt in diesem Fall direkt auf die Schwelle.
 */
export function minimumListPrice(printingCostValue, marketplace = DEFAULT_MARKETPLACE) {
  const tier = ROYALTY_TIERS[marketplace] ?? ROYALTY_TIERS.de;
  const cents = (value) => Math.ceil(value * 100) / 100;
  const atHighTier = cents(printingCostValue / tier.high);
  if (atHighTier >= tier.threshold) return round(atHighTier, 2);
  const atLowTier = cents(printingCostValue / tier.low);
  return round(atLowTier <= tier.threshold - 0.01 ? atLowTier : tier.threshold, 2);
}

/** Preisformatierung für Hinweistexte im deutschen Zahlenformat. */
export function formatEur(value) {
  return `${Number(value).toFixed(2).replace('.', ',')} €`;
}

/** Tantiemen-Aufstellung für einen Verkaufspreis. */
export function royaltyBreakdown({
  pageCount,
  priceEur,
  trim = '6x9',
  paper = 'white',
  marketplace = DEFAULT_MARKETPLACE,
}) {
  const cost = printingCost(pageCount, { trim, marketplace });
  const price = round(Number(priceEur) || 0, 2);
  const rate = royaltyRateFor(price, marketplace);
  const minPrice = minimumListPrice(cost, marketplace);
  const threshold = (ROYALTY_TIERS[marketplace] ?? ROYALTY_TIERS.de).threshold;
  const gross = round(price * rate, 2);
  const payout = round(gross - cost, 2);
  const margin = price > 0 ? round((payout / price) * 100, 1) : 0;
  const gapToThreshold = round(threshold - price, 2);
  const ebookInBand = price >= EBOOK_ROYALTY_BAND.min && price <= EBOOK_ROYALTY_BAND.max;
  const ebookDelivery = round(1.2 * EBOOK_ROYALTY_BAND.deliveryPerMb, 2);
  const payoutAtThreshold = round(threshold * (ROYALTY_TIERS[marketplace] ?? ROYALTY_TIERS.de).high - cost, 2);

  return {
    marketplace,
    trim,
    paper,
    pageCount,
    listPriceEur: price,
    printingCostEur: cost,
    minimumListPriceEur: minPrice,
    royaltyRate: rate,
    royaltyThreshold: threshold,
    grossRoyaltyEur: gross,
    payoutEur: payout,
    marginPercent: margin,
    belowMinimum: price < minPrice,
    belowThreshold: rate < 0.6,
    // Der Sprung von 50 % auf 60 % schluckt kleine Preiserhöhungen komplett
    thresholdJumpEur: round(payoutAtThreshold - payout, 2),
    gapToThresholdEur: gapToThreshold > 0 ? gapToThreshold : 0,
    recommendation:
      rate < 0.6 && gapToThreshold > 0
        ? `Preis um ${formatEur(gapToThreshold)} auf ${formatEur(threshold)} anheben: die Tantieme springt von ${formatEur(payout)} auf ${formatEur(payoutAtThreshold)}.`
        : 'Preis liegt im 60-%-Band.',
    ebook: {
      eligibleFor70: ebookInBand,
      rate: ebookInBand ? EBOOK_ROYALTY_BAND.rate : 0.35,
      estimatedDeliveryEur: ebookDelivery,
      estimatedPayoutEur: round(price * (ebookInBand ? 0.7 : 0.35) - ebookDelivery, 2),
    },
    disclaimer:
      'Rechenmodell für Schwarzweißdruck und Amazon-Direktverkauf. Verbindlich ist die Vorschau im KDP-Dashboard.',
  };
}

/** Umsatz-Szenarien für Preis-/Absatzannahmen. */
export function revenueScenarios({ pageCount, priceEur, monthlySales = [10, 30, 100], trim, paper, marketplace }) {
  const base = royaltyBreakdown({ pageCount, priceEur, trim, paper, marketplace });
  return monthlySales.map((sales) => ({
    salesPerMonth: sales,
    monthlyEur: round(base.payoutEur * sales, 2),
    yearlyEur: round(base.payoutEur * sales * 12, 2),
  }));
}

/** Preis-Optimierung: Kandidaten mit Tantieme und Abstand zum Mindestpreis. */
export function priceLadder({ pageCount, from = 7.99, to = 19.99, step = 1, trim = '6x9', marketplace = DEFAULT_MARKETPLACE }) {
  const cost = printingCost(pageCount, { trim, marketplace });
  const min = minimumListPrice(cost, marketplace);
  const threshold = (ROYALTY_TIERS[marketplace] ?? ROYALTY_TIERS.de).threshold;
  const prices = [];
  for (let p = Math.max(from, min); p <= to + 0.001; p += step) {
    const price = round(p, 2);
    const rate = royaltyRateFor(price, marketplace);
    prices.push({
      price,
      rate,
      payout: round(price * rate - cost, 2),
      inHighBand: rate >= 0.6,
    });
  }
  return { printingCostEur: cost, minimumListPriceEur: min, royaltyThreshold: threshold, prices };
}
