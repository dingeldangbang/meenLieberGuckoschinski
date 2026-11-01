/** Vollumschlag-PDF (Rückseite + Rücken + Vorderseite + Beschnitt) nach KDP-Vorgabe. */
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { INCH_TO_PT, coverDimensions } from '../kdp.mjs';
import { sanitizeText, wrapText } from './text.mjs';

export const COVER_STYLES = {
  navy: { label: 'Marine & Gold', bg: '#152037', accent: '#e3bd77', text: '#f8f6f1', sub: '#c9cfdd', mode: 'dark' },
  sage: { label: 'Salbei & Sand', bg: '#2f4a3f', accent: '#e0cfae', text: '#f7f5ef', sub: '#cbd8ce', mode: 'dark' },
  sand: { label: 'Sand & Terrakotta', bg: '#efe6d6', accent: '#a35d3b', text: '#2b2118', sub: '#63513f', mode: 'light' },
  crimson: { label: 'Bordeaux & Creme', bg: '#5d1a24', accent: '#e8c98d', text: '#fdf8f1', sub: '#e0b9b9', mode: 'dark' },
  mono: { label: 'Schwarz auf Weiß', bg: '#f6f6f4', accent: '#111111', text: '#141414', sub: '#4a4a4a', mode: 'light' },
  midnight: { label: 'Mitternacht & Mint', bg: '#101a1c', accent: '#8fd3c1', text: '#f3fbf9', sub: '#a9c6c0', mode: 'dark' },
};

function hexColor(hex) {
  const v = hex.replace('#', '');
  return rgb(parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255);
}

function fitText(text, font, maxWidth, maxSize, minSize = 10, maxLines = 4) {
  for (let size = maxSize; size >= minSize; size -= 0.5) {
    const lines = wrapText(text, font, size, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: minSize, lines: wrapText(text, font, minSize, maxWidth).slice(0, maxLines) };
}

function drawLines(page, lines, { x, y, size, font, color, align = 'left', width = 0, lineHeight = size * 1.25 }) {
  let cursor = y;
  for (const line of lines) {
    let lx = x;
    if (align === 'center') lx = x + (width - font.widthOfTextAtSize(line, size)) / 2;
    page.drawText(line, { x: lx, y: cursor, size, font, color });
    cursor -= lineHeight;
  }
  return cursor;
}

/**
 * @param {object} plan Ergebnis von composeBook()
 * @param {{guides?: boolean}} options guides=true zeichnet Beschnitt-/Falz-/Sicherheitslinien
 */
export async function renderCoverPdf(plan, options = {}) {
  const { config } = plan;
  const dims = coverDimensions({ pageCount: config.pageCount, trim: config.trim, paper: config.paper });
  const style = COVER_STYLES[config.coverStyle] ?? COVER_STYLES.navy;

  const W = dims.totalWidthIn * INCH_TO_PT;
  const H = dims.totalHeightIn * INCH_TO_PT;
  const bleed = dims.bleedIn * INCH_TO_PT;
  const trimW = dims.trimWidth * INCH_TO_PT;
  const trimH = dims.trimHeight * INCH_TO_PT;
  const spineW = dims.spineIn * INCH_TO_PT;

  const backX = bleed;
  const spineX = bleed + trimW;
  const frontX = spineX + spineW;
  const safe = 0.25 * INCH_TO_PT;
  const safeBleed = 0.375 * INCH_TO_PT;

  const doc = await PDFDocument.create();
  doc.setTitle(`${sanitizeText(config.title)} - Cover`);
  doc.setAuthor(sanitizeText(config.author));
  doc.setCreator('Buchmaschine (KDP-Studio)');

  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const body = await doc.embedFont(StandardFonts.TimesRoman);
  const bodyItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);

  const page = doc.addPage([W, H]);
  const bg = hexColor(style.bg);
  const accent = hexColor(style.accent);
  const text = hexColor(style.text);
  const sub = hexColor(style.sub);

  // Grundfläche über den gesamten Beschnitt (kein weißer Rand)
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });

  // Deterministische Deko-Elemente auf der Vorderseite
  const seedNum = [...String(config.seed)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = seedNum % 3;
  if (variant === 0) {
    page.drawRectangle({ x: frontX, y: bleed + trimH * 0.58, width: trimW, height: trimH * 0.42, color: accent, opacity: style.mode === 'dark' ? 0.16 : 0.22 });
    page.drawCircle({ x: frontX + trimW * 0.82, y: bleed + trimH * 0.24, size: trimW * 0.26, color: accent, opacity: 0.18 });
  } else if (variant === 1) {
    page.drawRectangle({ x: frontX, y: bleed + trimH * 0.18, width: trimW, height: trimH * 0.1, color: accent, opacity: 0.28 });
    page.drawCircle({ x: frontX + trimW * 0.2, y: bleed + trimH * 0.78, size: trimW * 0.3, color: accent, opacity: 0.16 });
  } else {
    for (let i = 0; i < 7; i += 1) {
      page.drawRectangle({
        x: frontX + (i * trimW) / 7,
        y: bleed + trimH * 0.66,
        width: trimW / 14,
        height: trimH * 0.3,
        color: accent,
        opacity: 0.06 + i * 0.02,
      });
    }
  }

  /* ------------------------------ Vorderseite ------------------------------ */
  const frontInnerX = frontX + safe + 8;
  const frontInnerW = trimW - safe * 2 - 16;

  const titleFit = fitText(config.title, bold, frontInnerW, 44, 20, 5);
  let titleTop = bleed + trimH * 0.74;
  // Titelblock optisch zentrieren
  const titleHeight = titleFit.lines.length * titleFit.size * 1.2;
  titleTop = Math.max(bleed + trimH * 0.55, bleed + trimH * 0.76 - titleHeight / 2);
  drawLines(page, titleFit.lines, {
    x: frontInnerX,
    y: titleTop,
    size: titleFit.size,
    font: bold,
    color: text,
    lineHeight: titleFit.size * 1.18,
  });

  let cursor = titleTop - titleFit.lines.length * titleFit.size * 1.18 - 10;
  page.drawRectangle({ x: frontInnerX, y: cursor, width: 54, height: 2.4, color: accent });
  cursor -= 26;

  if (config.subtitle) {
    const subFit = fitText(config.subtitle, regular, frontInnerW * 0.9, 15, 9, 4);
    cursor = drawLines(page, subFit.lines, {
      x: frontInnerX,
      y: cursor,
      size: subFit.size,
      font: regular,
      color: sub,
      lineHeight: subFit.size * 1.35,
    });
  }

  // Autor unten
  const authorSize = 15;
  page.drawText(sanitizeText(config.author).toUpperCase(), {
    x: frontInnerX,
    y: bleed + trimH * 0.11,
    size: authorSize,
    font: bold,
    color: text,
    characterSpacing: 1.6,
  });
  page.drawLine({
    start: { x: frontInnerX, y: bleed + trimH * 0.11 + authorSize + 8 },
    end: { x: frontInnerX + 40, y: bleed + trimH * 0.11 + authorSize + 8 },
    thickness: 1.2,
    color: accent,
  });

  // Kleiner Serien-/Genre-Hinweis oben
  page.drawText(sanitizeText(plan.coverBadge ?? ''), {
    x: frontInnerX,
    y: bleed + trimH - safe - 16,
    size: 8,
    font: regular,
    color: sub,
    characterSpacing: 1.2,
  });

  /* --------------------------------- Rücken -------------------------------- */
  const spineCenter = spineX + spineW / 2;
  const spineLabel = sanitizeText(`${config.title} · ${config.author}`);
  if (spineW >= 12) {
    let size = 9;
    while (size > 5 && bold.widthOfTextAtSize(spineLabel, size) > trimH - safe * 2) size -= 0.5;
    const w = bold.widthOfTextAtSize(spineLabel, size);
    if (w <= trimH - safe * 2) {
      page.drawText(spineLabel, {
        x: spineCenter + size * 0.35,
        y: (H - w) / 2,
        size,
        font: bold,
        color: style.mode === 'dark' ? text : hexColor('#2b2118'),
        rotate: degrees(90),
      });
    }
  }

  /* ------------------------------- Rückseite ------------------------------- */
  const backInnerX = backX + safe;
  const backInnerW = trimW - safe * 2;
  const barcodeW = 2 * INCH_TO_PT;
  const barcodeH = 1.2 * INCH_TO_PT;

  let backY = bleed + trimH - safe - 10;
  page.drawText('ÜBER DIESES BUCH', {
    x: backInnerX,
    y: backY,
    size: 8,
    font: bold,
    color: accent,
    characterSpacing: 1.6,
  });
  backY -= 24;

  const blurb = config.description || config.subtitle || 'Ein liebevoll gestaltetes Buch - gedruckt auf Papier, das man in die Hand nehmen kann.';
  const blurbLines = wrapText(blurb, body, 10.5, backInnerW);
  const maxBlurbLines = Math.floor((trimH * 0.5) / 14.5);
  backY = drawLines(page, blurbLines.slice(0, maxBlurbLines), {
    x: backInnerX,
    y: backY,
    size: 10.5,
    font: body,
    color: style.mode === 'dark' ? text : hexColor('#2b2118'),
    lineHeight: 14.5,
  });

  // Drei Stichpunkte (aus Struktur abgeleitet, keine Erfindungen)
  backY -= 22;
  const bullets = plan.backCoverBullets ?? [];
  for (const bullet of bullets) {
    page.drawCircle({ x: backInnerX + 3, y: backY + 3, size: 1.8, color: accent });
    const lines = wrapText(bullet, regular, 8.6, backInnerW - 16);
    for (const line of lines) {
      page.drawText(sanitizeText(line), { x: backInnerX + 14, y: backY, size: 8.6, font: regular, color: sub });
      backY -= 11.5;
    }
    backY -= 4;
  }

  // Barcode-Freizone: weiß, damit Amazon den Code sauber einsetzen kann
  page.drawRectangle({
    x: backX + safe,
    y: bleed + safe,
    width: barcodeW,
    height: barcodeH,
    color: rgb(1, 1, 1),
  });
  page.drawText('ISBN / Barcode', {
    x: backX + safe + 10,
    y: bleed + safe + barcodeH / 2 + 2,
    size: 7,
    font: regular,
    color: hexColor('#9a9a9a'),
  });

  // Verlagszeile
  page.drawText(sanitizeText(`Unabhängig veröffentlicht · ${config.author}`), {
    x: backX + safe,
    y: bleed + safe + barcodeH + 16,
    size: 7.2,
    font: regular,
    color: sub,
  });

  /* --------------------------- Hilfslinien (QA) ---------------------------- */
  if (options.guides) {
    const guide = rgb(0.95, 0.15, 0.25);
    const dash = { borderDashArray: [4, 3] };
    // Beschnittkante = Seitenrand des PDFs
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, borderColor: guide, borderWidth: 0.8, ...dash });
    // Falzkanten (Rücken)
    for (const x of [spineX, spineX + spineW]) {
      page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: 0.7, color: guide, ...dash });
    }
    // Sicherheitsabstand (Trim + 0.25")
    page.drawRectangle({
      x: bleed + safe,
      y: bleed + safe,
      width: W - (bleed + safe) * 2,
      height: trimH - safe * 2,
      borderColor: rgb(0.2, 0.55, 0.9),
      borderWidth: 0.6,
      ...dash,
    });
    page.drawRectangle({
      x: backX + safe,
      y: bleed + safe,
      width: barcodeW,
      height: barcodeH,
      borderColor: guide,
      borderWidth: 0.8,
    });
    const label = `${dims.totalWidthIn} x ${dims.totalHeightIn} Zoll · Ruecken ${dims.spineIn} Zoll · Beschnitt 0,125 Zoll`;
    page.drawText(sanitizeText(label), {
      x: bleed + 6,
      y: H - 14,
      size: 7,
      font: regular,
      color: guide,
    });
  }

  return doc.save();
}
