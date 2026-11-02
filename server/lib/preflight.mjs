/**
 * Preflight-Validierung: prüft ein fertiges PDF gegen die KDP-Geometrie.
 * Arbeitet auf echten Bytes - kein Mock, kein Sonderpfad.
 */
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { INCH_TO_PT, PAGE_LIMITS, SPINE_TEXT_MIN_PAGES, TRIM_SAFE_MARGIN_IN, PAPER_THICKNESS, trimSize } from './kdp.mjs';

const TOLERANCE_PT = 1;

/**
 * @param {Uint8Array|Buffer} bytes PDF-Datei
 * @param {{kind:'manuscript'|'cover', config:object|{config:object,cover?:object,margins?:object}, expectedPages?:number}} options
 */
export async function preflightPdf(bytes, { kind, config: rawConfig, expectedPages }) {
  // Akzeptiert sowohl den Plan (mit config/cover/margins) als auch die reine Konfiguration
  const config = rawConfig?.config
    ? { ...rawConfig.config, cover: rawConfig.cover, margins: rawConfig.margins }
    : (rawConfig ?? {});

  const checks = [];
  const add = (id, ok, detail, level = 'error') => checks.push({ id, ok, detail, level });

  const header = Buffer.from(bytes.slice(0, 5)).toString();
  add('pdf-header', header === '%PDF-', header === '%PDF-' ? 'PDF-Kennung vorhanden' : `Keine PDF-Kennung (${header})`);

  let doc;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    add('pdf-parse', false, `PDF nicht lesbar: ${error.message}`);
    return finish(checks, { kind });
  }

  const pages = doc.getPages();
  const sizes = pages.map((page) => page.getSize());
  add('pdf-parse', true, `${pages.length} Seiten lesbar`);

  if (kind === 'manuscript') {
    checkManuscript({ add, config, sizes, count: pages.length, expectedPages });
  } else {
    checkCover({ add, config, sizes, count: pages.length });
  }

  checkFonts({ add, doc });
  return finish(checks, { kind });
}

function checkManuscript({ add, config, sizes, count, expectedPages }) {
  const trim = trimSize(config.trim);
  const expectedW = trim.width * INCH_TO_PT;
  const expectedH = trim.height * INCH_TO_PT;

  const wrong = sizes.filter(
    (size) => Math.abs(size.width - expectedW) > TOLERANCE_PT || Math.abs(size.height - expectedH) > TOLERANCE_PT,
  );
  add(
    'trim-size',
    wrong.length === 0,
    wrong.length === 0
      ? `Alle Seiten messen ${expectedW} × ${expectedH} pt (${trim.width} × ${trim.height} Zoll)`
      : `${wrong.length} Seite(n) weichen vom Trim ab`,
  );

  add(
    'page-count-even',
    count % 2 === 0,
    count % 2 === 0 ? `${count} Seiten (gerade)` : `${count} Seiten - KDP verlangt eine gerade Zahl`,
  );
  add(
    'page-count-range',
    count >= PAGE_LIMITS.min && count <= PAGE_LIMITS.max,
    `Seitenzahl ${count} liegt ${count >= PAGE_LIMITS.min && count <= PAGE_LIMITS.max ? 'im' : 'außerhalb des'} KDP-Bereichs ${PAGE_LIMITS.min}-${PAGE_LIMITS.max}`,
  );
  if (typeof expectedPages === 'number') {
    add(
      'page-count-expected',
      count === expectedPages,
      count === expectedPages
        ? `Seitenzahl entspricht der Vorgabe (${expectedPages})`
        : `Tatsächlich ${count} statt ${expectedPages} Seiten`,
      'warn',
    );
  }

  const margins = config.margins;
  if (margins) {
    add(
      'live-element-margin',
      margins.outsideIn >= TRIM_SAFE_MARGIN_IN && margins.topIn >= TRIM_SAFE_MARGIN_IN && margins.bottomIn >= TRIM_SAFE_MARGIN_IN,
      `Außen/oben/unten ${margins.outsideIn}/${margins.topIn}/${margins.bottomIn} Zoll (Minimum ${TRIM_SAFE_MARGIN_IN})`,
    );
    add(
      'gutter',
      margins.insideIn >= margins.gutterMinIn,
      `Innensteg ${margins.insideIn} Zoll ≥ KDP-Minimum ${margins.gutterMinIn} Zoll`,
    );
  }
}

function checkCover({ add, config, sizes, count }) {
  const cover = config.cover;
  if (!cover) {
    add('cover-meta', false, 'Keine Cover-Maße übergeben');
    return;
  }
  const expectedW = cover.totalWidthIn * INCH_TO_PT;
  const expectedH = cover.totalHeightIn * INCH_TO_PT;
  add('cover-page-count', count === 1, `${count} Seite(n) im Umschlag`);

  const size = sizes[0] ?? { width: 0, height: 0 };
  add(
    'cover-canvas',
    Math.abs(size.width - expectedW) <= TOLERANCE_PT && Math.abs(size.height - expectedH) <= TOLERANCE_PT,
    `Cover ${size.width.toFixed(2)} × ${size.height.toFixed(2)} pt (erwartet ${expectedW.toFixed(2)} × ${expectedH.toFixed(2)})`,
  );
  add('cover-bleed', cover.bleedIn === 0.125, `Beschnitt ${cover.bleedIn} Zoll an allen Außenkanten`);

  const factor = PAPER_THICKNESS[config.paper ?? 'white'];
  add(
    'spine-width',
    factor ? Math.abs(cover.spineIn - (config.pageCount ?? 0) * factor) < 0.0002 : false,
    `Rücken ${cover.spineIn} Zoll bei ${config.pageCount} Seiten`,
  );
  add(
    'barcode-zone',
    cover.barcodeZone?.insideBackCover === true,
    'Barcode-Freizone 2 × 1,2 Zoll, unten rechts auf der Rückseite',
  );
  add(
    'spine-text-rule',
    cover.spineTextAllowed ? true : (config.pageCount ?? 0) < SPINE_TEXT_MIN_PAGES,
    cover.spineTextAllowed
      ? 'Rückenbeschriftung erlaubt (ab 80 Seiten)'
      : 'Kein Rückentext gesetzt (unter 80 Seiten)',
  );
}

/** Eine Schrift gilt als eingebettet, wenn ihr FontDescriptor eine FontFile-Datei hat. */
function checkFonts({ add, doc }) {
  const report = collectFonts(doc);
  const ok = report.embedded > 0 && report.missing.length === 0;
  add(
    'fonts-embedded',
    ok,
    ok
      ? `${report.embedded} eingebettete(r) Schriftschnitt(e): ${[...new Set(report.names)].slice(0, 4).join(', ')}`
      : report.missing.length
        ? `Nicht eingebettet: ${[...new Set(report.missing)].slice(0, 3).join(', ')}`
        : 'Keine Schriften gefunden',
  );
}

function collectFonts(doc) {
  // Schriften werden je Seite referenziert - für die Anzeige zählt jeder Schnitt einmal
  const embeddedNames = new Set();
  const missingNames = new Set();
  const missing = [];
  const names = [];
  const fileKeys = ['FontFile', 'FontFile2', 'FontFile3'];

  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict);
    if (!fonts) continue;

    for (const key of fonts.keys()) {
      const font = fonts.lookupMaybe(key, PDFDict);
      if (!font) continue;
      const baseFont = font.get(PDFName.of('BaseFont'))?.toString()?.replace(/^\//, '') ?? 'unbekannt';

      let descriptor = font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict);
      if (!descriptor) {
        const descendants = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray);
        const first = descendants ? descendants.lookupMaybe(0, PDFDict) : null;
        descriptor = first ? first.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict) : null;
      }
      const hasFile = descriptor ? fileKeys.some((name) => descriptor.has(PDFName.of(name))) : false;

      if (hasFile) {
        embeddedNames.add(baseFont);
        names.push(baseFont);
      } else {
        if (!missingNames.has(baseFont)) missing.push(baseFont);
        missingNames.add(baseFont);
      }
    }
  }

  return { embedded: embeddedNames.size, missing, names };
}

function finish(checks, meta) {
  const errors = checks.filter((check) => !check.ok && check.level === 'error');
  const warnings = checks.filter((check) => !check.ok && check.level === 'warn');
  return {
    kind: meta.kind,
    status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    passed: checks.filter((check) => check.ok).length,
    total: checks.length,
    checks,
    errors: errors.map((check) => check.detail),
    warnings: warnings.map((check) => check.detail),
    summary: errors.length
      ? `${errors.length} Fehler, ${warnings.length} Hinweise - so nicht hochladen.`
      : warnings.length
        ? `Alle Pflichtprüfungen bestanden, ${warnings.length} Hinweis(e).`
        : 'Alle Prüfungen bestanden.',
  };
}
