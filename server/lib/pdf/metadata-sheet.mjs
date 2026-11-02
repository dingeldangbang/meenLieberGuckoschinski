/**
 * Metadaten-Blatt als PDF: eine Seite zum Abarbeiten beim KDP-Upload.
 * Bewusst ohne Rätsel/Buchblock - nur die Angaben, die im Dashboard eingetippt
 * oder kopiert werden müssen, plus Preflight-Ergebnis.
 */
import { PDFDocument, rgb } from 'pdf-lib';
import { INCH_TO_PT } from '../kdp.mjs';
import { embedBookFonts } from './fonts.mjs';
import { sanitizeText, wrapText, COLORS } from './text.mjs';

const A4 = { width: 8.27, height: 11.69 };

function rule(page, x, y, width, color = COLORS.rule) {
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.6, color });
}

/**
 * @param {object} plan Ergebnis von composeBook()
 * @param {{metadata:object, compliance:object, preflight?:object}} report
 */
export async function renderMetadataSheet(plan, report) {
  const { config } = plan;
  const { metadata, compliance, preflight } = report;

  const doc = await PDFDocument.create();
  doc.setTitle(`KDP-Metadaten - ${sanitizeText(config.title)}`);
  doc.setAuthor(sanitizeText(config.author));
  doc.setCreator('Buchmaschine (KDP-Studio)');

  const fonts = await embedBookFonts(doc);
  const W = A4.width * INCH_TO_PT;
  const H = A4.height * INCH_TO_PT;
  const margin = 0.7 * INCH_TO_PT;
  const contentW = W - margin * 2;
  let page = doc.addPage([W, H]);
  let y = H - margin;

  const heading = (text, size = 15) => {
    page.drawText(sanitizeText(text), { x: margin, y, size, font: fonts.sansBold, color: COLORS.black });
    y -= size * 0.9;
    rule(page, margin, y, contentW * 0.4, COLORS.accent);
    y -= 14;
  };

  const field = (label, value, { size = 9.5, lines = 6 } = {}) => {
    page.drawText(sanitizeText(label).toUpperCase(), {
      x: margin,
      y,
      size: 7,
      font: fonts.sansBold,
      color: COLORS.muted,
      characterSpacing: 1.2,
    });
    y -= 13;
    const wrapped = wrapText(value || '-', fonts.body, size, contentW).slice(0, lines);
    for (const line of wrapped) {
      page.drawText(line, { x: margin, y, size, font: fonts.body, color: COLORS.ink });
      y -= size * 1.35;
    }
    y -= 8;
  };

  page.drawText('KDP-METADATEN', { x: margin, y: H - margin, size: 8, font: fonts.sansBold, color: COLORS.accent, characterSpacing: 2 });
  y -= 22;
  page.drawText(sanitizeText(config.title), { x: margin, y, size: 20, font: fonts.bodyBold, color: COLORS.black });
  y -= 26;
  if (config.subtitle) {
    page.drawText(sanitizeText(config.subtitle), { x: margin, y, size: 11, font: fonts.bodyItalic, color: COLORS.muted });
    y -= 18;
  }
  y -= 6;

  heading('Titel & Person');
  field('Titel', metadata.title);
  field('Untertitel', metadata.subtitle ?? '-');
  field('Autor', metadata.author);
  field('Sprache', metadata.language);

  heading('Beschreibung');
  field('Beschreibung', metadata.description ?? '-', { size: 9, lines: 8 });

  heading('Keywords (max. 7)');
  metadata.keywords.concat(Array(7).fill(null)).slice(0, 7).forEach((keyword, index) => {
    page.drawText(`${index + 1}.`, { x: margin, y, size: 9, font: fonts.sansBold, color: COLORS.muted });
    page.drawText(sanitizeText(keyword ?? ''), { x: margin + 18, y, size: 9.5, font: fonts.body, color: COLORS.ink });
    page.drawLine({
      start: { x: margin + 18, y: y - 3 },
      end: { x: margin + contentW, y: y - 3 },
      thickness: 0.4,
      color: COLORS.rule,
    });
    y -= 17;
  });
  y -= 6;

  heading('Kategorien');
  (metadata.categories.length ? metadata.categories : ['-']).forEach((category) => {
    page.drawCircle({ x: margin + 3, y: y + 3, size: 1.8, color: COLORS.accent });
    page.drawText(sanitizeText(category), { x: margin + 12, y, size: 9.5, font: fonts.body, color: COLORS.ink });
    y -= 15;
  });
  y -= 8;

  heading('Druck & Preis');
  const rows = [
    ['Format', metadata.printOptions.format],
    ['Innenleben', metadata.printOptions.interior],
    ['Seiten', String(metadata.printOptions.pageCount)],
    ['Beschnitt', metadata.printOptions.bleed],
    ['Cover-Oberfläche', metadata.printOptions.coverFinish],
    ['Cover-Maße', `${metadata.coverGeometry.totalWidthIn} × ${metadata.coverGeometry.totalHeightIn} Zoll (Rücken ${metadata.coverGeometry.spineIn})`],
    ['Listenpreis', `${metadata.pricing.listPriceEur.toFixed(2)} EUR`],
    ['Druckkosten', `${metadata.pricing.printingCostEur.toFixed(2)} EUR`],
    ['Tantieme je Verkauf', `${metadata.pricing.royaltyPerSaleEur.toFixed(2)} EUR`],
    ['Mindestpreis', `${metadata.pricing.minimumListPriceEur.toFixed(2)} EUR`],
  ];
  for (const [label, value] of rows) {
    page.drawText(sanitizeText(label), { x: margin, y, size: 9, font: fonts.body, color: COLORS.muted });
    page.drawText(sanitizeText(value), { x: margin + 150, y, size: 9, font: fonts.sansBold, color: COLORS.ink });
    y -= 15;
  }

  // Zweite Seite: Compliance + Checkliste
  page = doc.addPage([W, H]);
  y = H - margin;
  heading('KI-Offenlegung im KDP-Dashboard', 14);
  field('Antwort', compliance.aiDisclosure.answer, { lines: 3 });
  field('Hinweis', compliance.aiDisclosure.explanation, { size: 9, lines: 6 });
  y -= 4;

  heading('Marken- und Sprachprüfung', 14);
  field('Marken', compliance.trademark.message, { size: 9, lines: 4 });
  field('Werbesprache', compliance.hype.hits.length ? compliance.hype.hits.join(', ') : 'keine Auffälligkeiten', { size: 9 });
  field('Low-Content-Risiko', `${compliance.lowContent.level} (${compliance.lowContent.structuredPageShare}% strukturierte Seiten)`, { size: 9 });
  if (compliance.lowContent.reasons.length) {
    field('Gründe', compliance.lowContent.reasons.join(' · '), { size: 8.6, lines: 5 });
  }
  y -= 4;

  if (preflight) {
    heading('Preflight (Buchblock)', 14);
    for (const check of preflight.checks) {
      const color = check.ok ? rgb(0.2, 0.5, 0.3) : rgb(0.75, 0.25, 0.25);
      page.drawText(check.ok ? 'OK' : '!', { x: margin, y, size: 9, font: fonts.sansBold, color });
      const lines = wrapText(check.detail, fonts.body, 8.8, contentW - 26);
      page.drawText(sanitizeText(lines[0] ?? ''), { x: margin + 22, y, size: 8.8, font: fonts.body, color: COLORS.ink });
      y -= 13;
    }
    y -= 6;
  }

  heading('Ablauf im Dashboard', 14);
  const steps = [
    'Taschenbuch anlegen: Titel, Untertitel, Autor und Beschreibung übernehmen.',
    'Die 7 Keywords eintragen, zwei Kategorien wählen, kostenlose KDP-ISBN zuweisen.',
    'Buchblock-PDF hochladen, Druckvorschau starten und Warnungen prüfen.',
    'Cover-PDF als "fertige Datei" hochladen - Rückenbreite muss zum Seitenumfang passen.',
    'Preis setzen (mindestens Mindestpreis), KI-Offenlegung ausfüllen, veröffentlichen.',
    'Nach der Freigabe: erste Rezensionen beobachten und Auflage 2 planen.',
  ];
  steps.forEach((step, index) => {
    page.drawText(`${index + 1}.`, { x: margin, y, size: 9, font: fonts.sansBold, color: COLORS.accent });
    const lines = wrapText(step, fonts.body, 9.2, contentW - 20);
    lines.forEach((line, lineIndex) => {
      page.drawText(sanitizeText(line), { x: margin + 16, y: y - lineIndex * 12, size: 9.2, font: fonts.body, color: COLORS.ink });
    });
    y -= lines.length * 12 + 6;
  });

  y -= 8;
  page.drawText(sanitizeText(compliance.disclaimer), {
    x: margin,
    y,
    size: 7.6,
    font: fonts.bodyItalic,
    color: COLORS.light,
  });

  return doc.save();
}
