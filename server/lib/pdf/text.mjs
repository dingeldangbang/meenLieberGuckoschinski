/** Text-Helfer für PDFs: WinAnsi-sichere Zeichen, Umbruch, Absätze. */
import { rgb } from 'pdf-lib';

const REPLACEMENTS = [
  [/[\u2018\u2019\u201a\u201b]/g, "'"],
  [/[\u201c\u201d\u201e\u201f]/g, '"'],
  [/[\u2013\u2014]/g, '-'],
  [/\u2026/g, '...'],
  [/\u00a0/g, ' '],
  [/\u2022/g, '-'],
  [/\u1e9e/g, 'SS'],
  [/[\u200b\u200c\u200d\uFEFF]/g, ''],
];

/**
 * Wandelt beliebigen Text in WinAnsi-kompatiblen Text um.
 * Erlaubt sind Latin-1 plus die cp1252-Sonderzeichen (u. a. €, ™, Œ, Š),
 * weil die Standard-PDF-Schriften genau diese Kodierung nutzen.
 */
const WIN_ANSI_EXTRAS = new Set(['€', '‚', 'ƒ', '„', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', 'Ž', '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', 'ž', 'Ÿ']);
export function sanitizeText(input) {
  if (input === undefined || input === null) return '';
  let text = String(input);
  for (const [pattern, replacement] of REPLACEMENTS) text = text.replace(pattern, replacement);
  // Alles außerhalb von Latin-1/cp1252 fliegt raus, damit pdf-lib nie wirft
  return [...text]
    .filter((char) => char.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRAS.has(char))
    .join('');
}

/** Bricht Text auf eine Breite um (Wortgrenzen, lange Wörter werden getrennt). */
export function wrapText(text, font, size, maxWidth) {
  const paragraphs = sanitizeText(text).split('\n');
  const lines = [];
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        // Sehr langes Wort: hart trennen
        let chunk = '';
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export const COLORS = {
  black: rgb(0.09, 0.09, 0.11),
  ink: rgb(0.16, 0.16, 0.19),
  muted: rgb(0.42, 0.42, 0.46),
  light: rgb(0.72, 0.72, 0.75),
  rule: rgb(0.78, 0.78, 0.8),
  accent: rgb(0.23, 0.32, 0.55),
  white: rgb(1, 1, 1),
};

/**
 * Zeichnet einen Textblock ab `y` (Oberkante) nach unten.
 * @returns {number} neue y-Position unterhalb des Blocks
 */
export function drawParagraph(page, text, options) {
  const {
    x,
    y,
    width,
    font,
    size = 11,
    lineHeight = size * 1.45,
    color = COLORS.ink,
    align = 'left',
    paragraphGap = size * 0.6,
  } = options;

  let cursor = y;
  const paragraphs = sanitizeText(text).split('\n\n');
  paragraphs.forEach((block, blockIndex) => {
    const lines = wrapText(block, font, size, width);
    lines.forEach((line) => {
      let lineX = x;
      if (align === 'center') {
        lineX = x + (width - font.widthOfTextAtSize(line, size)) / 2;
      } else if (align === 'right') {
        lineX = x + width - font.widthOfTextAtSize(line, size);
      }
      if (line) {
        page.drawText(line, { x: lineX, y: cursor, size, font, color });
      }
      cursor -= lineHeight;
    });
    if (blockIndex < paragraphs.length - 1) cursor -= paragraphGap;
  });

  return cursor;
}

/** Rahmenloses Schreiblinien-Raster. */
export function drawWritingLines(page, { x, y, width, count, spacing = 24, color = COLORS.rule, thickness = 0.6 }) {
  let cursor = y;
  for (let i = 0; i < count; i += 1) {
    page.drawLine({
      start: { x, y: cursor },
      end: { x: x + width, y: cursor },
      thickness,
      color,
    });
    cursor -= spacing;
  }
  return cursor;
}

/** Punktraster für Notizbuchseiten. */
export function drawDotGrid(page, { x, y, width, height, spacing = 18, color = COLORS.rule }) {
  const cols = Math.floor(width / spacing);
  const rows = Math.floor(height / spacing);
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c <= cols; c += 1) {
      page.drawCircle({
        x: x + c * spacing,
        y: y - r * spacing,
        size: 0.7,
        color,
      });
    }
  }
}

/** Quadratraster für karierte Seiten. */
export function drawSquareGrid(page, { x, y, width, height, spacing = 18, color = COLORS.rule }) {
  const cols = Math.floor(width / spacing);
  const rows = Math.floor(height / spacing);
  for (let r = 0; r <= rows; r += 1) {
    page.drawLine({
      start: { x, y: y - r * spacing },
      end: { x: x + cols * spacing, y: y - r * spacing },
      thickness: 0.5,
      color,
    });
  }
  for (let c = 0; c <= cols; c += 1) {
    page.drawLine({
      start: { x: x + c * spacing, y },
      end: { x: x + c * spacing, y: y - rows * spacing },
      thickness: 0.5,
      color,
    });
  }
}

export function formatDateDe(date = new Date()) {
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}
