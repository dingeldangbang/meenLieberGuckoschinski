import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';
import { renderManuscriptPdf } from '../server/lib/pdf/manuscript.mjs';
import { renderCoverPdf } from '../server/lib/pdf/cover.mjs';
import { sanitizeText, wrapText } from '../server/lib/pdf/text.mjs';
import { INCH_TO_PT } from '../server/lib/kdp.mjs';
import { StandardFonts } from 'pdf-lib';

const config = {
  title: 'Große Rätsel für kluge Köpfe',
  subtitle: 'Sudoku in Großdruck mit Lösungen',
  author: 'Test Autorin',
  description: 'Ein Buch über das Rätseln, mit Übungen und Lösungen.',
  generator: 'sudoku',
  pageCount: 40,
  trim: '6x9',
  paper: 'white',
  priceEur: 9.99,
  seed: 'pdf-test',
};

async function loadPdf(bytes) {
  return PDFDocument.load(bytes, { updateMetadata: false });
}

test('Buchblock-PDF hat gültige Struktur und trimgenaue Seiten', async () => {
  const { config: cfg } = validateBookConfig(config);
  const plan = composeBook(cfg);
  const bytes = await renderManuscriptPdf(plan);
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');

  const pdf = await loadPdf(bytes);
  assert.equal(pdf.getPageCount(), cfg.pageCount);
  const { width, height } = pdf.getPage(0).getSize();
  assert.equal(Math.round(width), 6 * INCH_TO_PT);
  assert.equal(Math.round(height), 9 * INCH_TO_PT);
  assert.equal(pdf.getTitle(), config.title);
  assert.equal(pdf.getAuthor(), config.author);
});

test('Buchblock-PDF unterstützt alle Formate', async () => {
  for (const [trim, width] of [['5.5x8.5', 5.5], ['8.5x11', 8.5], ['7x10', 7]]) {
    const { config: cfg } = validateBookConfig({ ...config, trim, pageCount: 24, seed: `fmt-${trim}` });
    const bytes = await renderManuscriptPdf(composeBook(cfg));
    const pdf = await loadPdf(bytes);
    const size = pdf.getPage(0).getSize();
    assert.equal(Math.round(size.width), Math.round(width * INCH_TO_PT), trim);
  }
});

test('Cover-PDF matcht die berechnete Vollumschlaggröße', async () => {
  const { config: cfg } = validateBookConfig({ ...config, pageCount: 134 });
  const plan = composeBook(cfg);
  const bytes = await renderCoverPdf(plan);
  const pdf = await loadPdf(bytes);
  const { width, height } = pdf.getPage(0).getSize();
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(Math.round(width), Math.round(plan.cover.totalWidthIn * INCH_TO_PT));
  assert.equal(Math.round(height), Math.round(plan.cover.totalHeightIn * INCH_TO_PT));
  assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
});

test('Cover-PDF mit Hilfslinien bleibt geometrisch identisch', async () => {
  const { config: cfg } = validateBookConfig({ ...config, pageCount: 120 });
  const plan = composeBook(cfg);
  const plain = await loadPdf(await renderCoverPdf(plan, { guides: false }));
  const guided = await loadPdf(await renderCoverPdf(plan, { guides: true }));
  assert.deepEqual(plain.getPage(0).getSize(), guided.getPage(0).getSize());
});

test('Alle Buch-Typen erzeugen ein PDF', async () => {
  const generators = ['sudoku', 'wordsearch', 'maze', 'journal', 'workbook', 'notebook'];
  for (const generator of generators) {
    const { config: cfg } = validateBookConfig({ ...config, generator, pageCount: 32, seed: `gen-${generator}` });
    const bytes = await renderManuscriptPdf(composeBook(cfg));
    const pdf = await loadPdf(bytes);
    assert.equal(pdf.getPageCount(), 32, generator);
    assert.equal(String.fromCharCode(...bytes.slice(0, 5)), '%PDF-');
  }
});

test('Textsanitizing entfernt zeichen, die WinAnsi nicht kennt', () => {
  assert.equal(sanitizeText('Grüße – „Zitat“ … 漢字'), 'Grüße - "Zitat" ... ');
  assert.equal(sanitizeText('Euro 9,99 €'), 'Euro 9,99 €');
  assert.equal(sanitizeText(null), '');
  assert.equal(sanitizeText('ẞ'), 'SS');
});

test('Zeilenumbruch respektiert die Spaltenbreite', async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const text = 'Dies ist ein längerer Satz, der über mehrere Zeilen umbrochen werden muss, damit er in die Spalte passt.';
  const lines = wrapText(text, font, 11, 200);
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(font.widthOfTextAtSize(line, 11) <= 200.5, `zu breit: ${line}`);
  }
  assert.equal(lines.join(' '), text);
});

test('Euro-Zeichen und cp1252-Sonderzeichen überleben die PDF-Erzeugung', async () => {
  const { config: cfg } = validateBookConfig({
    ...config,
    pageCount: 24,
    description: 'Preis 9,99 € · Größe 6×9" · „Zitat“ · Marke™',
    seed: 'cp1252',
  });
  assert.equal(sanitizeText('Preis 9,99 €'), 'Preis 9,99 €');
  const bytes = await renderManuscriptPdf(composeBook(cfg));
  const pdf = await loadPdf(bytes);
  assert.equal(pdf.getPageCount(), 24);
  const cover = await renderCoverPdf(composeBook(cfg));
  assert.equal(String.fromCharCode(...cover.slice(0, 5)), '%PDF-');
});
