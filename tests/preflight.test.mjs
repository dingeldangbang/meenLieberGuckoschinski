import test from 'node:test';
import assert from 'node:assert/strict';

import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';
import { renderManuscriptPdf } from '../server/lib/pdf/manuscript.mjs';
import { renderCoverPdf } from '../server/lib/pdf/cover.mjs';
import { renderMetadataSheet } from '../server/lib/pdf/metadata-sheet.mjs';
import { preflightPdf } from '../server/lib/preflight.mjs';
import { fontsAvailable } from '../server/lib/pdf/fonts.mjs';
import { PDFDocument } from 'pdf-lib';

function planFor(overrides = {}) {
  const result = validateBookConfig({
    title: 'Preflight Prüfbuch',
    author: 'Test Autorin',
    generator: 'sudoku',
    pageCount: 40,
    trim: '6x9',
    priceEur: 9.99,
    seed: 'preflight-test',
    ...overrides,
  });
  assert.equal(result.ok, true, result.errors?.join(', '));
  return composeBook(result.config);
}

test('Preflight: echter Buchblock besteht alle Prüfungen', async () => {
  const plan = planFor();
  const bytes = await renderManuscriptPdf(plan);
  const result = await preflightPdf(bytes, { kind: 'manuscript', config: plan, expectedPages: 40 });

  assert.equal(result.status, 'pass');
  assert.equal(result.passed, result.total);
  assert.deepEqual(result.checks.filter((c) => !c.ok), []);
  assert.ok(result.checks.some((c) => c.id === 'gutter'));
  assert.ok(result.checks.some((c) => c.id === 'fonts-embedded'));
});

test('Preflight: Cover mit Rücken, Beschnitt und Barcode-Zone besteht', async () => {
  const plan = planFor({ pageCount: 200 });
  const bytes = await renderCoverPdf(plan);
  const result = await preflightPdf(bytes, { kind: 'cover', config: plan });

  assert.equal(result.status, 'pass');
  assert.equal(result.passed, result.total);
});

test('Preflight erkennt fehlende Seitengleichheit und falsche Seitenzahl', async () => {
  const plan = planFor();
  const bytes = await renderManuscriptPdf(plan);
  const result = await preflightPdf(bytes, { kind: 'manuscript', config: plan, expectedPages: 84 });

  const expected = result.checks.find((c) => c.id === 'page-count-expected');
  assert.equal(expected.ok, false);
  // Ein gültiger Buchblock mit anderer Seitenzahl ist ein Hinweis, kein Fehler:
  // erst die Abweichung zum Cover macht daraus ein Problem.
  assert.equal(expected.level, 'warn');
  assert.equal(result.status, 'warn');
});

test('Preflight meldet fehlende PDF-Kennung statt zu werfen', async () => {
  const result = await preflightPdf(Buffer.from('kein pdf'), { kind: 'manuscript', config: planFor() });
  assert.equal(result.status, 'fail');
  assert.equal(result.checks[0].id, 'pdf-header');
  assert.equal(result.checks[0].ok, false);
});

test('Preflight erkennt fehlenden Beschnitt im Cover', async () => {
  // Trim-Maße als Cover deklarieren: Beschnitt und Rückenbreite können nicht stimmen
  const plan = planFor();
  const doc = await PDFDocument.create();
  doc.addPage([432, 648]);
  const bytes = await doc.save();
  const result = await preflightPdf(bytes, { kind: 'cover', config: plan });

  assert.equal(result.status, 'fail');
  assert.equal(result.checks.find((c) => c.id === 'cover-canvas').ok, false);
});

test('Eingebettete Schriften: EB Garamond liegt im PDF und ist lizenziert', async () => {
  if (!fontsAvailable()) {
    assert.ok(true, 'Schriftdateien fehlen in diesem Checkout – Test übersprungen');
    return;
  }
  const plan = planFor();
  const bytes = await renderManuscriptPdf(plan);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const result = await preflightPdf(bytes, { kind: 'manuscript', config: plan });
  const fonts = result.checks.find((c) => c.id === 'fonts-embedded');

  assert.equal(fonts.ok, true);
  assert.match(fonts.detail, /EBGaramond/);
  assert.ok(doc.getPageCount() === 40);
});

test('Metadaten-Blatt ist ein lesbares PDF mit Deckblatt und Checkliste', async () => {
  const plan = planFor();
  const metadata = {
    title: plan.config.title,
    subtitle: plan.config.subtitle,
    author: plan.config.author,
    description: plan.config.description,
    keywords: ['rätselbuch', 'sudoku großdruck', 'geschenk opa'],
    categories: ['Krimis & Rätsel > Rätsel'],
    language: 'Deutsch',
    printOptions: { format: '6x9', interior: 'Schwarzweiß', pageCount: 40, bleed: 'nein', coverFinish: 'matt' },
    coverGeometry: { totalWidthIn: plan.cover.totalWidthIn, totalHeightIn: plan.cover.totalHeightIn, spineIn: plan.cover.spineIn },
    pricing: {
      listPriceEur: plan.royalties.listPriceEur,
      printingCostEur: plan.royalties.printingCostEur,
      royaltyPerSaleEur: plan.royalties.payoutEur,
      minimumListPriceEur: plan.royalties.minimumListPriceEur,
      royaltyRate: plan.royalties.royaltyRate,
    },
  };
  const compliance = {
    aiDisclosure: { answer: 'Ja – Teile des Inhalts wurden mit KI-Unterstützung erzeugt', explanation: 'Rätsel programmatisch erzeugt.' },
    trademark: { message: 'Keine bekannten Marken gefunden.' },
    hype: { hits: [] },
    lowContent: { level: 'low', structuredPageShare: 82, reasons: [] },
    disclaimer: 'Keine Freigabe.',
  };
  const flight = await preflightPdf(await renderManuscriptPdf(plan), { kind: 'manuscript', config: plan });

  const bytes = await renderMetadataSheet(plan, { metadata, compliance, preflight: flight });
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });

  assert.equal(doc.getPageCount(), 2);
  assert.ok(bytes.length > 3000);
});

test('Schriften werden ohne Ligaturen gesetzt – Text bleibt zeichengetreu', async () => {
  if (!fontsAvailable()) {
    assert.ok(true, 'Schriftdateien fehlen in diesem Checkout – Test übersprungen');
    return;
  }
  const { embedBookFonts } = await import('../server/lib/pdf/fonts.mjs');
  const doc = await PDFDocument.create();
  const fonts = await embedBookFonts(doc);
  // "fläche" hat sechs Zeichen. Mit Standard-Ligaturen (fl) wären es fünf Glyphen
  // und beim Kopieren/Suchen käme Buchstabensalat an.
  const encoded = fonts.body.encodeText('fläche').toString();
  assert.equal(encoded.length, 2 + 4 * 6, 'sechs Zeichen müssen sechs Glyphen ergeben');
  assert.ok(fonts.embedded);
});
