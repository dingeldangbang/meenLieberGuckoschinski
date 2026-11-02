/** Portfolio-Auswertung: gespeicherte Projekte als Umsatz-Dashboard. */
import { coverDimensions, royaltyBreakdown, printingCostEur } from './kdp.mjs';

/**
 * @param {object[]} projects gespeicherte Projekte (mit config)
 * @param {{salesPerBook?:number, priceOverride?:number}} options
 */
export function buildPortfolio(projects, options = {}) {
  const salesPerBook = Math.max(0, Number(options.salesPerBook ?? 10) || 0);

  const rows = projects.map((project) => {
    const config = project.config ?? {};
    const pageCount = Number(config.pageCount) || 0;
    const price = Number(config.priceEur) || 0;
    const royalty = pageCount ? royaltyBreakdown({ pageCount, priceEur: price }) : null;
    const cover = pageCount ? coverDimensions({ pageCount, trim: config.trim ?? '6x9', paper: config.paper ?? 'white' }) : null;
    return {
      id: project.id,
      name: project.name ?? config.title ?? 'Unbenannt',
      title: config.title ?? project.name,
      generator: config.generator ?? 'sudoku',
      trim: config.trim ?? '6x9',
      pageCount,
      priceEur: price,
      keywords: Array.isArray(config.keywords) ? config.keywords.length : 0,
      printingCostEur: pageCount ? printingCostEur(pageCount) : 0,
      royaltyPerSaleEur: royalty?.payoutEur ?? 0,
      marginPercent: royalty?.marginPercent ?? 0,
      belowMinimum: royalty?.belowMinimum ?? false,
      spineIn: cover?.spineIn ?? 0,
      monthlyEur: royalty ? round(royalty.payoutEur * salesPerBook) : 0,
      updatedAt: project.updatedAt ?? null,
    };
  });

  const summary = {
    projectCount: rows.length,
    salesPerBook,
    totalPages: rows.reduce((sum, row) => sum + row.pageCount, 0),
    averagePriceEur: rows.length ? round(rows.reduce((sum, row) => sum + row.priceEur, 0) / rows.length) : 0,
    averageRoyaltyEur: rows.length ? round(rows.reduce((sum, row) => sum + row.royaltyPerSaleEur, 0) / rows.length) : 0,
    monthlyEurAllEur: round(rows.reduce((sum, row) => sum + row.monthlyEur, 0)),
    yearlyEurAllEur: round(rows.reduce((sum, row) => sum + row.monthlyEur * 12, 0)),
    bestSeller: rows.slice().sort((a, b) => b.royaltyPerSaleEur - a.royaltyPerSaleEur)[0] ?? null,
    warnings: rows.filter((row) => row.belowMinimum).map((row) => `${row.name}: Preis unter Mindestpreis`),
    byGenerator: tallyBy(rows, 'generator'),
    byTrim: tallyBy(rows, 'trim'),
  };

  return {
    summary,
    rows: rows.sort((a, b) => b.royaltyPerSaleEur - a.royaltyPerSaleEur),
    pricingHint:
      'Umsatz = Tantieme je Verkauf × angenommene Verkäufe. Die Verkaufsannahme ist eine Rechnung, keine Prognose.',
  };
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function tallyBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unbekannt';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
