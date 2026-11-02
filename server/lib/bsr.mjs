/**
 * BSR-Schätzung: Umsatzpotenzial aus dem Amazon Best Sellers Rank.
 * Potenzgesetz S(r) = a · r^(−b), kalibriert an grob publizierten Ankerpunkten.
 * Das ist ein Modell, keine Messung - Amazon veröffentlicht keine Verkaufszahlen.
 */
import { royaltyBreakdown } from './kdp.mjs';

/** Ankerpunkte: (Rank, ~Verkäufe/Tag) für Bücher auf Amazon.com. */
const CALIBRATION = [
  { rank: 1_000, perDay: 50 },
  { rank: 10_000, perDay: 8 },
  { rank: 100_000, perDay: 0.7 },
];

function fitPowerLaw(points) {
  // Kleinste-Quadrate im log-log-Raum: log S = log a - b log r
  const xs = points.map((p) => Math.log(p.rank));
  const ys = points.map((p) => Math.log(p.perDay));
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const b = -(num / den);
  const a = Math.exp(meanY + b * meanX);
  return { a, b };
}

export const BOOK_MODEL = fitPowerLaw(CALIBRATION);

/** Kategorie-Multiplikatoren (grob, aus Kategoriegröße abgeleitet). */
export const CATEGORIES = {
  books: { label: 'Bücher (allgemein)', factor: 1 },
  fiction: { label: 'Belletristik', factor: 1.15 },
  selfhelp: { label: 'Ratgeber & Selbsthilfe', factor: 0.95 },
  puzzles: { label: 'Rätsel & Spiele', factor: 0.8 },
  children: { label: 'Kinderbücher', factor: 1.05 },
  business: { label: 'Business & Karriere', factor: 0.7 },
};

/** Verkäufe pro Tag aus einem Rank (Potenzgesetz). */
export function salesPerDay(rank, { category = 'books' } = {}) {
  const value = Number(rank);
  if (!Number.isFinite(value) || value < 1) throw new Error('Rank muss eine positive Zahl sein.');
  const factor = CATEGORIES[category]?.factor ?? 1;
  return BOOK_MODEL.a * value ** -BOOK_MODEL.b * factor;
}

/**
 * Schätzt Absatz und Umsatz für einen Rank.
 * @param {{rank:number, category?:string, price:number, pageCount:number, trim?:string, marketplace?:string}} input
 */
export function estimateFromRank(input) {
  const { rank, category = 'books', price, pageCount, trim = '6x9', marketplace = 'de' } = input;
  const perDay = Math.round(salesPerDay(rank, { category }) * 100) / 100;
  const royalty = royaltyBreakdown({ pageCount, priceEur: price, trim, marketplace });
  const monthlySales = perDay * 30;
  return {
    rank: Number(rank),
    category,
    categoryLabel: CATEGORIES[category]?.label ?? category,
    model: { a: Math.round(BOOK_MODEL.a), b: Number(BOOK_MODEL.b.toFixed(3)), formula: 'S(r) = a · r^(−b)' },
    salesPerDay: perDay,
    salesPerMonth: Math.round(monthlySales * 10) / 10,
    royaltyPerSale: royalty.payoutEur,
    monthlyRevenue: Math.round(monthlySales * royalty.payoutEur * 100) / 100,
    yearlyRevenue: Math.round(monthlySales * royalty.payoutEur * 12 * 100) / 100,
    disclaimer:
      'Potenzgesetz-Schätzung aus drei öffentlich diskutierten Ankerpunkten. Amazon veröffentlicht keine Verkaufszahlen; echte Absätze streuen stark nach Kategorie, Preis und Werbung.',
  };
}

/** Rank, der für eine gewünschte Verkaufszahl nötig wäre (Umkehrung). */
export function rankForSales(targetPerDay, { category = 'books' } = {}) {
  const factor = CATEGORIES[category]?.factor ?? 1;
  const target = Number(targetPerDay);
  if (!Number.isFinite(target) || target <= 0) throw new Error('Ziel-Absatz muss positiv sein.');
  return Math.round((BOOK_MODEL.a * factor / target) ** (1 / BOOK_MODEL.b));
}
