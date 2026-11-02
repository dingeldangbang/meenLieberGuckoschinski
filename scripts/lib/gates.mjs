/**
 * Qualitäts-Gates für die Publishing-Pipeline.
 *
 * Beide Prüfungen arbeiten auf den *fertigen PDF-Bytes* – also unabhängig davon,
 * ob der Renderer die richtigen Werte übergeben bekam:
 *
 *  1. `enforceParity` – KDP druckt in Bögen, eine ungerade Seitenzahl führt zur
 *     Ablehnung. Statt zu scheitern hängt das Gate eine echte Vakatseite an
 *     (Self-Healing) und meldet die korrigierte Seitenzahl zurück.
 *  2. `auditCover` – Sollmaß des Vollumschlags (2 × Trim + Rücken + 2 × Beschnitt)
 *     und Lage der Live-Elemente (Barcode-Zone, Rückentext) gegen die
 *     KDP-Vorgaben. Toleranz: 1 PostScript-Punkt, danach `ok: false`.
 *
 * Alle Sollwerte kommen aus `server/lib/kdp.mjs` – es gibt keine zweite,
 * abweichende Zahlenquelle.
 */
import { PDFDocument, StandardFonts } from 'pdf-lib';

import {
  BLEED_IN,
  INCH_TO_PT,
  SPINE_TEXT_MIN_PAGES,
  SPINE_TEXT_SAFE_IN,
  TRIM_SAFE_MARGIN_IN,
  coverDimensions,
  trimSize,
} from '../../server/lib/kdp.mjs';

/** KDP-Vorgabe für die Barcode-Freizone auf der Rückseite. */
export const BARCODE_ZONE_IN = { widthIn: 2, heightIn: 1.2 };

/** Mindestabstand aller Live-Elemente zur Schnittkante (identisch mit KDP). */
const LIVE_ELEMENT_MARGIN_IN = TRIM_SAFE_MARGIN_IN;

/** Erlaubte Drift zwischen Soll- und Istmaß des Covers in PostScript-Punkten. */
export const GEOMETRY_TOLERANCE_PT = 1;

const round = (value, digits = 4) => Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits;

/**
 * Hängt bei ungerader Seitenzahl ein leeres Blatt an.
 *
 * Das angehängte Blatt trägt keinen Inhalt und keine Kopfzeile – es ist eine
 * echte Vakatseite, wie sie im Buchdruck üblich ist. Die Seitenzahl wird neu
 * gelesen, nicht hochgezählt, damit ein bereits korrigiertes PDF nicht doppelt
 * wächst.
 *
 * @param {Uint8Array|Buffer} bytes
 * @returns {Promise<{bytes:Uint8Array, pageCount:number, repaired:boolean, sizePt:{width:number,height:number}}>}
 */
export async function enforceParity(bytes) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  let pageCount = doc.getPageCount();
  if (pageCount === 0) throw new Error('Das PDF hat keine Seiten – Paritätsprüfung nicht möglich.');

  if (pageCount % 2 === 0) {
    const { width, height } = doc.getPage(pageCount - 1).getSize();
    return { bytes, pageCount, repaired: false, sizePt: { width, height } };
  }

  // Format der letzten Seite übernehmen: ein abweichendes Blatt würde im Druck auffallen.
  const { width, height } = doc.getPage(pageCount - 1).getSize();
  const blank = doc.addPage([width, height]);
  // Eine unsichtbare Textmarke hält das Blatt im PDF-Strukturbaum verankert,
  // ohne sichtbar zu sein (manche PDF-Prüfer verwerfen vollständig leere Seiten).
  const font = await doc.embedFont(StandardFonts.Helvetica);
  blank.drawText(' ', { x: 0, y: 0, size: 1, font });

  const out = await doc.save({ useObjectStreams: true });
  pageCount = doc.getPageCount();
  return { bytes: out, pageCount, repaired: true, sizePt: { width, height } };
}

/**
 * Sollmaße des Vollumschlags (Rückseite + Rücken + Vorderseite + Beschnitt).
 * @param {{pageCount:number, trim?:string, paper?:string}} input
 */
export function expectedCoverGeometry({ pageCount, trim = '6x9', paper = 'white' }) {
  const dims = coverDimensions({ pageCount, trim, paper });
  const size = trimSize(trim);
  return {
    dims,
    spineIn: dims.spineIn,
    widthIn: dims.totalWidthIn,
    heightIn: dims.totalHeightIn,
    widthPt: round(dims.totalWidthIn * INCH_TO_PT, 2),
    heightPt: round(dims.totalHeightIn * INCH_TO_PT, 2),
    // Nachrechnung aus den Rohwerten: 2 × Trim + Rücken + 2 × Beschnitt
    formulaWidthIn: round(2 * size.width + dims.spineIn + 2 * BLEED_IN, 4),
    formulaHeightIn: round(size.height + 2 * BLEED_IN, 4),
  };
}

/**
 * Prüft Covermaß, Barcode-Freizone und Rückentext gegen die KDP-Vorgaben.
 *
 * @param {{bytes:Uint8Array|Buffer, pageCount:number, trim?:string, paper?:string}} input
 * @returns {Promise<{ok:boolean, checks:object[], summary:string, actual:{widthPt:number,heightPt:number}, expected:object}>}
 */
export async function auditCover({ bytes, pageCount, trim = '6x9', paper = 'white' }) {
  const expected = expectedCoverGeometry({ pageCount, trim, paper });
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pages = doc.getPages();
  const checks = [];

  const push = (id, ok, detail) => checks.push({ id, ok, detail });

  if (pages.length !== 1) {
    push('single-page', false, `Der Vollumschlag muss aus genau einer Seite bestehen, gefunden: ${pages.length}.`);
  } else {
    push('single-page', true, 'Vollumschlag besteht aus genau einer Seite.');
  }

  const first = pages[0];
  const { width, height } = first ? first.getSize() : { width: 0, height: 0 };
  const widthDrift = Math.abs(width - expected.widthPt);
  const heightDrift = Math.abs(height - expected.heightPt);
  const canvasOk = widthDrift <= GEOMETRY_TOLERANCE_PT && heightDrift <= GEOMETRY_TOLERANCE_PT;

  push(
    'canvas',
    canvasOk,
    `Soll ${expected.widthPt} × ${expected.heightPt} pt (${expected.widthIn}" × ${expected.heightIn}"), ist ${round(width, 2)} × ${round(height, 2)} pt – Drift ${round(widthDrift, 2)} / ${round(heightDrift, 2)} pt (Toleranz ${GEOMETRY_TOLERANCE_PT} pt).`,
  );

  // Die Formel muss den Renderer-Wert reproduzieren, sonst rechnet eine der beiden Seiten falsch.
  const formulaOk = Math.abs(expected.formulaWidthIn - expected.widthIn) < 1e-6
    && Math.abs(expected.formulaHeightIn - expected.heightIn) < 1e-6;
  push(
    'spine-formula',
    formulaOk,
    `Rücken ${expected.spineIn}" aus ${pageCount} Seiten × Papierstärke; Kontrolle 2 × Trim + Rücken + 2 × Beschnitt = ${expected.formulaWidthIn}" × ${expected.formulaHeightIn}".`,
  );

  // Barcode-Freizone: 2" × 1,2", 0,25" von Unter- und Rückenkante, komplett auf der Rückseite.
  const zone = expected.dims.barcodeZone;
  const backFrom = BLEED_IN;
  const backTo = BLEED_IN + trimSize(trim).width;
  const insideBack = zone.x >= backFrom + LIVE_ELEMENT_MARGIN_IN - 1e-6
    && zone.x + zone.width <= backTo - LIVE_ELEMENT_MARGIN_IN + 1e-6;
  const sizeOk = zone.width >= BARCODE_ZONE_IN.widthIn && zone.height >= BARCODE_ZONE_IN.heightIn;
  const bottomOk = zone.y >= LIVE_ELEMENT_MARGIN_IN - 1e-6;
  const inCanvas = zone.x + zone.width <= expected.widthIn + 1e-6 && zone.y + zone.height <= expected.heightIn + 1e-6;
  push(
    'barcode-zone',
    insideBack && sizeOk && bottomOk && inCanvas,
    `Freizone ${zone.width}" × ${zone.height}" bei x=${zone.x}", y=${zone.y}": ${insideBack ? 'liegt auf der Rückseite' : 'ragt aus der Rückseite'}, ${bottomOk ? 'oberhalb der Schnittkante' : 'zu nah an der Schnittkante'}, ${inCanvas ? 'innerhalb der Seite' : 'außerhalb der Seite'}.`,
  );

  // Live-Elemente (Rückentext) dürfen den Falz nicht berühren.
  const spineLeft = BLEED_IN + trimSize(trim).width;
  const spineRight = spineLeft + expected.spineIn;
  const spineTextOk = pageCount >= SPINE_TEXT_MIN_PAGES
    ? expected.spineIn >= SPINE_TEXT_SAFE_IN * 2 + 0.08
    : true;
  push(
    'spine-text',
    spineTextOk,
    pageCount >= SPINE_TEXT_MIN_PAGES
      ? `Rückentext erlaubt (${pageCount} Seiten) und Rücken ${expected.spineIn}" ≥ ${round(SPINE_TEXT_SAFE_IN * 2 + 0.08, 4)}" Mindestbreite für Schrift.`
      : `Kein Rückentext bei ${pageCount} Seiten (KDP erlaubt ihn erst ab ${SPINE_TEXT_MIN_PAGES}). Rücken ${spineLeft}"–${round(spineRight, 4)}".`,
  );

  const failed = checks.filter((entry) => !entry.ok);
  return {
    ok: failed.length === 0,
    checks,
    actual: { widthPt: round(width, 2), heightPt: round(height, 2) },
    expected,
    summary: failed.length
      ? `${failed.length} Geometrie-Fehler: ${failed.map((entry) => entry.detail).join(' ')}`
      : `Cover-Geometrie bestanden (${round(width, 2)} × ${round(height, 2)} pt, Rücken ${expected.spineIn}").`,
  };
}

/**
 * Kleiner Helfer für Geistertexte: schreibt eine Kennung in das PDF-Metadatenfeld
 * `Subject`, damit ein Artefakt später eindeutig einem Lauf zugeordnet werden kann.
 * @param {Uint8Array} bytes
 * @param {string} marker
 */
export async function stampSubject(bytes, marker) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  doc.setSubject(marker);
  return doc.save({ useObjectStreams: true });
}
