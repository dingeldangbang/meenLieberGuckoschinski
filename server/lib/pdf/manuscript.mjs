/** Buchblock-PDF im KDP-Format (exaktes Trim, gespiegelte Innenränder, Seitenzahlen). */
import { PDFDocument, StandardFonts, rgb, degrees, LineCapStyle } from 'pdf-lib';
import { INCH_TO_PT, trimSize } from '../kdp.mjs';
import {
  COLORS,
  sanitizeText,
  wrapText,
  drawParagraph,
  drawWritingLines,
  drawDotGrid,
  drawSquareGrid,
  formatDateDe,
} from './text.mjs';

function drawSpaced(page, text, { x, y, size, font, color, spacing = 1.6, align = 'left', width = 0 }) {
  const clean = sanitizeText(text).toUpperCase();
  const chars = [...clean];
  const total = chars.reduce((sum, ch) => sum + font.widthOfTextAtSize(ch, size) + spacing, 0) - spacing;
  let cursor = align === 'center' ? x + (width - total) / 2 : align === 'right' ? x + width - total : x;
  for (const ch of chars) {
    page.drawText(ch, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(ch, size) + spacing;
  }
  return total;
}

function drawRule(page, x, y, width, { thickness = 0.8, color = COLORS.rule } = {}) {
  page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness, color });
}

/* ---------------------------------- Seiten ---------------------------------- */

function renderTitle(page, ctx) {
  const { fonts, W, H, left, contentW, config } = ctx;
  drawSpaced(page, 'Ein Buch von ' + (config.author || 'Unbekannt'), {
    x: left,
    y: H * 0.86,
    size: 8.5,
    font: fonts.sans,
    color: COLORS.muted,
    spacing: 2.2,
  });
  drawRule(page, left, H * 0.845, contentW * 0.32, { thickness: 1.2, color: COLORS.accent });

  const titleLines = wrapText(config.title, fonts.bodyBold, 30, contentW);
  let y = H * 0.7;
  for (const line of titleLines) {
    page.drawText(line, { x: left, y, size: 30, font: fonts.bodyBold, color: COLORS.black });
    y -= 36;
  }

  if (config.subtitle) {
    y -= 8;
    const subLines = wrapText(config.subtitle, fonts.bodyItalic, 14, contentW);
    for (const line of subLines) {
      page.drawText(line, { x: left, y, size: 14, font: fonts.bodyItalic, color: COLORS.muted });
      y -= 20;
    }
  }

  drawRule(page, left, H * 0.26, contentW * 0.5, { thickness: 0.8 });
  drawSpaced(page, config.author || 'Unbekannt', {
    x: left,
    y: H * 0.22,
    size: 11,
    font: fonts.sansBold,
    color: COLORS.ink,
    spacing: 2.6,
  });

  drawSpaced(page, `${ctx.generatorLabel}`, {
    x: left,
    y: H * 0.16,
    size: 8,
    font: fonts.sans,
    color: COLORS.muted,
    spacing: 1.8,
  });
}

function renderCopyright(page, ctx) {
  const { fonts, H, left, contentW, config, plan } = ctx;
  const year = new Date(config.year ?? Date.now()).getFullYear();
  let y = H * 0.62;
  drawSpaced(page, 'Impressum', { x: left, y, size: 10, font: fonts.sansBold, color: COLORS.ink, spacing: 2.4 });
  y -= 26;

  const blocks = [
    `${config.title}${config.subtitle ? ` - ${config.subtitle}` : ''}`,
    `© ${year} ${config.author}. Alle Rechte vorbehalten.`,
    'Das Werk einschließlich aller Inhalte ist urheberrechtlich geschützt. Jede Verwertung außerhalb der engen Grenzen des Urheberrechtsgesetzes ist ohne Zustimmung der Autorin oder des Autors unzulässig.',
    'Unabhängig veröffentlicht über Amazon Kindle Direct Publishing. Die ISBN wird kostenlos von Amazon KDP vergeben.',
    'Umschlag und Innengestaltung: erstellt mit der Buchmaschine.',
    `1. Auflage ${year}`,
    'Haftungsausschluss: Dieses Buch dient der Unterhaltung und der Wissensvermittlung. Es ersetzt keine medizinische, rechtliche oder finanzielle Beratung. Für Handlungen, die aus dem Inhalt abgeleitet werden, übernehmen Autor und Verlag keine Haftung.',
    `Umfang: ${plan.stats.pageCount} Seiten · Format ${ctx.trimLabel} · ${config.paper === 'cream' ? 'Cremefarbenes' : 'Weißes'} Papier`,
  ];

  for (const block of blocks) {
    y = drawParagraph(page, block, {
      x: left,
      y,
      width: contentW * 0.92,
      font: fonts.body,
      size: 8.4,
      lineHeight: 12,
      color: COLORS.muted,
      paragraphGap: 7,
    });
    y -= 6;
  }
}

function renderHowTo(page, ctx) {
  const { fonts, topY, left, contentW, config } = ctx;
  drawSpaced(page, 'Hinweise', { x: left, y: topY, size: 8.5, font: fonts.sans, color: COLORS.muted, spacing: 2 });
  let y = topY - 26;
  page.drawText(sanitizeText(ctx.pageData.heading), {
    x: left,
    y,
    size: 20,
    font: fonts.bodyBold,
    color: COLORS.black,
  });
  y -= 16;
  drawRule(page, left, y, contentW * 0.4, { thickness: 1, color: COLORS.accent });
  y -= 26;

  for (const paragraph of ctx.pageData.paragraphs ?? []) {
    y = drawParagraph(page, paragraph, {
      x: left,
      y,
      width: contentW,
      font: fonts.body,
      size: 11,
      lineHeight: 16.5,
      color: COLORS.ink,
      paragraphGap: 8,
    });
    y -= 10;
  }

  if (config.generator === 'sudoku' || config.generator === 'wordsearch' || config.generator === 'maze') {
    y -= 6;
    page.drawText('Beispiel:', { x: left, y, size: 9, font: fonts.sansBold, color: COLORS.muted });
  }
}

function renderBelongs(page, ctx) {
  const { fonts, W, H, left, contentW, config } = ctx;
  const boxW = contentW * 0.86;
  const boxH = 210;
  const boxX = left + (contentW - boxW) / 2;
  const boxY = H * 0.48;
  page.drawRectangle({ x: boxX, y: boxY, width: boxW, height: boxH, borderColor: COLORS.rule, borderWidth: 0.8 });
  drawSpaced(page, 'Dieses Buch gehört', {
    x: boxX + 24,
    y: boxY + boxH - 40,
    size: 9,
    font: fonts.sansBold,
    color: COLORS.ink,
    spacing: 2,
  });
  let y = boxY + boxH - 74;
  const labels = ['Name', 'Ort', 'Begonnen am'];
  for (const label of labels) {
    page.drawText(label, { x: boxX + 24, y, size: 9, font: fonts.sans, color: COLORS.muted });
    page.drawLine({
      start: { x: boxX + 96, y: y - 2 },
      end: { x: boxX + boxW - 24, y: y - 2 },
      thickness: 0.6,
      color: COLORS.rule,
    });
    y -= 34;
  }
  y = drawParagraph(
    page,
    'Wenn du dieses Buch gefunden hast: Melde dich gern - oder gib es einfach an jemanden weiter, der Freude daran hat.',
    { x: boxX + 24, y: boxY + 44, width: boxW - 48, font: fonts.bodyItalic, size: 8.6, lineHeight: 12, color: COLORS.muted },
  );
  drawSpaced(page, config.title, {
    x: left,
    y: H * 0.2,
    size: 7.5,
    font: fonts.sans,
    color: COLORS.light,
    spacing: 1.6,
    width: contentW,
    align: 'center',
  });
}

function renderSection(page, ctx) {
  const { fonts, H, left, contentW, pageData } = ctx;
  drawSpaced(page, 'Abschnitt', {
    x: left,
    y: H * 0.58,
    size: 9,
    font: fonts.sans,
    color: COLORS.muted,
    spacing: 3,
    width: contentW,
    align: 'center',
  });
  const lines = wrapText(pageData.title, fonts.bodyBold, 28, contentW);
  let y = H * 0.54;
  for (const line of lines) {
    const w = fonts.bodyBold.widthOfTextAtSize(line, 28);
    page.drawText(line, { x: left + (contentW - w) / 2, y, size: 28, font: fonts.bodyBold, color: COLORS.black });
    y -= 34;
  }
  drawRule(page, left + contentW / 2 - 40, y - 6, 80, { thickness: 1.2, color: COLORS.accent });
}

function pageHeader(page, ctx, leftLabel, rightLabel = '') {
  const { fonts, topY, left, contentW } = ctx;
  page.drawText(sanitizeText(leftLabel), {
    x: left,
    y: topY,
    size: 12,
    font: fonts.sansBold,
    color: COLORS.ink,
  });
  if (rightLabel) {
    drawSpaced(page, rightLabel, {
      x: left,
      y: topY + 1,
      size: 7.5,
      font: fonts.sans,
      color: COLORS.muted,
      spacing: 1.6,
      width: contentW,
      align: 'right',
    });
  }
  drawRule(page, left, topY - 10, contentW, { thickness: 0.7 });
  return topY - 30;
}

const DIFFICULTY_LABEL = { easy: 'leicht', medium: 'mittel', hard: 'schwer' };

function renderSudoku(page, ctx) {
  const { fonts, left, contentW, bottomY, pageData } = ctx;
  let y = pageHeader(page, ctx, `Sudoku ${pageData.index}`, `Schwierigkeit ${DIFFICULTY_LABEL[pageData.puzzle.difficulty] ?? ''}`);

  const availH = y - bottomY - 44;
  const cell = Math.min(contentW / 9, availH / 9);
  const gridW = cell * 9;
  const x = left + (contentW - gridW) / 2;
  const top = y - 6;

  // Zellen
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const cx = x + c * cell;
      const cy = top - (r + 1) * cell;
        page.drawRectangle({ x: cx, y: cy, width: cell, height: cell, borderColor: COLORS.rule, borderWidth: 0.4, lineCap: LineCapStyle.Butt });
      const value = pageData.puzzle.puzzle[r][c];
      if (value) {
        const size = cell * 0.6;
        const text = String(value);
        const w = fonts.sans.widthOfTextAtSize(text, size);
        page.drawText(text, {
          x: cx + (cell - w) / 2,
          y: cy + (cell - size) / 2 + size * 0.14,
          size,
          font: fonts.sans,
          color: COLORS.black,
        });
      }
    }
  }

  // Blocklinien
  for (let i = 0; i <= 9; i += 1) {
    const thick = i % 3 === 0 ? 1.8 : 0.4;
    const color = i % 3 === 0 ? COLORS.black : COLORS.rule;
    page.drawLine({ start: { x: x + i * cell, y: top }, end: { x: x + i * cell, y: top - cell * 9 }, thickness: thick, color, lineCap: LineCapStyle.Butt, miterLimit: 0 });
    page.drawLine({ start: { x, y: top - i * cell }, end: { x: x + cell * 9, y: top - i * cell }, thickness: thick, color, lineCap: LineCapStyle.Butt, miterLimit: 0 });
  }

  drawSpaced(page, ctx.config.title, {
    x: left,
    y: bottomY + 8,
    size: 7,
    font: fonts.sans,
    color: COLORS.light,
    spacing: 1.2,
    width: contentW,
    align: 'center',
  });
}

function renderWordSearch(page, ctx) {
  const { fonts, left, contentW, bottomY, pageData } = ctx;
  const { puzzle } = pageData;
  const words = puzzle.placements.map((p) => p.word);
  const listRows = Math.ceil(words.length / 3);
  const listHeight = listRows * 13 + 26;

  let y = pageHeader(page, ctx, `Wortsuche ${pageData.index}`, `${puzzle.wordCount} Wörter`);
  const availH = y - bottomY - listHeight - 26;
  const cell = Math.min(contentW / puzzle.size, availH / puzzle.size);
  const gridW = cell * puzzle.size;
  const x = left + (contentW - gridW) / 2;
  const top = y - 4;

  for (let r = 0; r < puzzle.size; r += 1) {
    for (let c = 0; c < puzzle.size; c += 1) {
      const letter = puzzle.grid[r][c];
      const size = cell * 0.62;
      const w = fonts.sans.widthOfTextAtSize(letter, size);
      page.drawText(letter, {
        x: x + c * cell + (cell - w) / 2,
        y: top - (r + 1) * cell + (cell - size) / 2 + size * 0.12,
        size,
        font: fonts.sans,
        color: COLORS.black,
      });
    }
  }
  page.drawRectangle({ x, y: top - cell * puzzle.size, width: gridW, height: cell * puzzle.size, borderColor: COLORS.light, borderWidth: 0.6 });

  // Wortliste in drei Spalten
  const listTop = top - cell * puzzle.size - 26;
  const colWidth = contentW / 3;
  drawRule(page, left, listTop + 12, contentW, { thickness: 0.6 });
  words.forEach((word, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    page.drawText(sanitizeText(word), {
      x: left + col * colWidth,
      y: listTop - row * 13,
      size: 8.6,
      font: fonts.sans,
      color: COLORS.ink,
    });
  });
}

function renderMaze(page, ctx, { solutionMode = false, box = null, label = '' } = {}) {
  const { fonts, pageData } = ctx;
  const maze = pageData.puzzle;
  let x;
  let top;
  let cell;

  if (solutionMode && box) {
    cell = Math.min(box.width / maze.cols, box.height / maze.rows);
    x = box.x;
    top = box.y;
  } else {
    const { left, contentW, bottomY } = ctx;
    const y = pageHeader(page, ctx, `Labyrinth ${pageData.index}`, 'Eingang oben links');
    const availH = y - bottomY - 40;
    cell = Math.min(contentW / maze.cols, availH / maze.rows);
    x = left + (contentW - maze.cols * cell) / 2;
    top = y - 6;
  }

  const w = maze.cols * cell;
  const h = maze.rows * cell;

  if (!solutionMode) {
    page.drawRectangle({ x, y: top - h, width: w, height: h, borderColor: COLORS.rule, borderWidth: 0.5 });
  }

  for (let r = 0; r < maze.rows; r += 1) {
    for (let c = 0; c < maze.cols; c += 1) {
      if (maze.walls[r][c] === 1) {
        page.drawRectangle({
          x: x + c * cell,
          y: top - (r + 1) * cell,
          width: cell + 0.4,
          height: cell + 0.4,
          color: solutionMode ? COLORS.light : COLORS.black,
        });
      }
    }
  }

  if (solutionMode) {
    const points = maze.path.map((p) => ({ x: x + p.x * cell + cell / 2, y: top - p.y * cell - cell / 2 }));
    for (let i = 1; i < points.length; i += 1) {
      page.drawLine({
        start: points[i - 1],
        end: points[i],
        thickness: Math.max(0.8, cell * 0.22),
        color: rgb(0.72, 0.25, 0.28),
      });
    }
    if (label) {
      page.drawText(sanitizeText(label), { x, y: top + 6, size: 7, font: fonts.sans, color: COLORS.muted });
    }
    return;
  }

  // Start- und Zielfeld markieren
  const startX = x + maze.start.x * cell + cell / 2;
  const startY = top - maze.start.y * cell - cell / 2;
  page.drawCircle({ x: startX, y: startY, size: cell * 0.2, color: COLORS.accent });
  const goalX = x + maze.goal.x * cell + cell / 2;
  const goalY = top - maze.goal.y * cell - cell / 2;
  page.drawRectangle({
    x: goalX - cell * 0.2,
    y: goalY - cell * 0.2,
    width: cell * 0.4,
    height: cell * 0.4,
    color: COLORS.accent,
  });
}

function renderSolutions(page, ctx) {
  const { fonts, left, contentW, bottomY, pageData, generator } = ctx;
  const y = pageHeader(page, ctx, 'Lösungen', `Seite ${ctx.physical + 1}`);

  if (generator === 'sudoku') {
    const cols = 2;
    const rows = Math.ceil(pageData.items.length / cols);
    const cell = Math.min((contentW - 24) / cols / 9, (y - bottomY - 40) / rows / 9);
    pageData.items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const gx = left + col * (contentW / cols) + 8;
      const gtop = y - row * (cell * 9 + 26) - 14;
      page.drawText(`#${item.index}`, { x: gx, y: gtop + cell * 9 + 6, size: 8, font: fonts.sansBold, color: COLORS.muted });
      for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          const size = cell * 0.68;
          const text = String(item.solution[r][c]);
          const w = fonts.sans.widthOfTextAtSize(text, size);
          page.drawText(text, {
            x: gx + c * cell + (cell - w) / 2,
            y: gtop - (r + 1) * cell + (cell - size) / 2 + size * 0.12,
            size,
            font: fonts.sans,
            color: COLORS.ink,
          });
        }
      }
      for (let i2 = 0; i2 <= 9; i2 += 1) {
        const thick = i2 % 3 === 0 ? 1 : 0.35;
        const color = i2 % 3 === 0 ? COLORS.ink : COLORS.rule;
        page.drawLine({ start: { x: gx + i2 * cell, y: gtop }, end: { x: gx + i2 * cell, y: gtop - cell * 9 }, thickness: thick, color, lineCap: LineCapStyle.Butt, miterLimit: 0 });
        page.drawLine({ start: { x: gx, y: gtop - i2 * cell }, end: { x: gx + cell * 9, y: gtop - i2 * cell }, thickness: thick, color, lineCap: LineCapStyle.Butt, miterLimit: 0 });
      }
    });
    return;
  }

  if (generator === 'wordsearch') {
    const half = (y - bottomY) / 2;
    pageData.items.forEach((item, i) => {
      const puzzle = item.solution;
      const cell = Math.min((contentW * 0.55) / puzzle.size, (half - 30) / puzzle.size);
      const gx = left;
      const gtop = y - i * half - 12;
      page.drawText(`#${item.index}`, { x: gx, y: gtop + 4, size: 8, font: fonts.sansBold, color: COLORS.muted });
      const top = gtop - 8;
      for (let r = 0; r < puzzle.size; r += 1) {
        for (let c = 0; c < puzzle.size; c += 1) {
          const size = cell * 0.72;
          const letter = puzzle.grid[r][c];
          const w = fonts.sans.widthOfTextAtSize(letter, size);
          page.drawText(letter, {
            x: gx + c * cell + (cell - w) / 2,
            y: top - (r + 1) * cell + (cell - size) / 2 + size * 0.12,
            size,
            font: fonts.sans,
            color: COLORS.ink,
          });
        }
      }
      for (const placement of puzzle.placements) {
        const sx = gx + placement.col * cell + cell / 2;
        const sy = top - placement.row * cell - cell / 2;
        const ex = gx + (placement.col + placement.dCol * (placement.word.length - 1)) * cell + cell / 2;
        const ey = top - (placement.row + placement.dRow * (placement.word.length - 1)) * cell - cell / 2;
        page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness: 1.1, color: rgb(0.78, 0.32, 0.35) });
      }
      // Wortliste rechts
      const listX = gx + puzzle.size * cell + 18;
      const listTop = top - 12;
      puzzle.placements.forEach((placement, idx) => {
        if (listTop - idx * 12 < top - puzzle.size * cell) return;
        page.drawText(sanitizeText(placement.word), {
          x: listX,
          y: listTop - idx * 12,
          size: 7.6,
          font: fonts.sans,
          color: COLORS.muted,
        });
      });
    });
    return;
  }

  // Labyrinthe: 6 pro Seite (2 Spalten × 3 Reihen)
  const cols = 2;
  const rows = Math.ceil(pageData.items.length / cols);
  const slotW = contentW / cols - 10;
  const slotH = (y - bottomY) / rows - 16;
  pageData.items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const box = {
      x: left + col * (contentW / cols) + 5,
      y: y - row * (slotH + 16) - 14,
      width: slotW,
      height: slotH,
    };
    renderMaze(page, { ...ctx, pageData: { ...pageData, puzzle: item.solution } }, {
      solutionMode: true,
      box,
      label: `#${item.index}`,
    });
  });
}

function renderJournalDay(page, ctx) {
  const { fonts, topY, left, contentW, bottomY, pageData } = ctx;
  drawSpaced(page, `Tag ${pageData.index}`, { x: left, y: topY, size: 8.5, font: fonts.sans, color: COLORS.muted, spacing: 2.4 });
  const dateLabel = 'Datum:';
  const dateW = fonts.sans.widthOfTextAtSize(dateLabel, 8.5);
  const dateX = left + contentW - 150;
  page.drawText(dateLabel, { x: dateX, y: topY, size: 8.5, font: fonts.sans, color: COLORS.muted });
  page.drawLine({
    start: { x: dateX + dateW + 6, y: topY - 1 },
    end: { x: left + contentW, y: topY - 1 },
    thickness: 0.6,
    color: COLORS.rule,
  });

  let y = topY - 46;
  y = drawParagraph(page, pageData.prompt, {
    x: left,
    y,
    width: contentW,
    font: fonts.bodyItalic,
    size: 14,
    lineHeight: 20,
    color: COLORS.black,
  });
  y -= 12;
  drawRule(page, left, y, contentW * 0.3, { thickness: 1, color: COLORS.accent });
  y -= 28;

  const spacing = 26;
  const count = Math.floor((y - bottomY) / spacing);
  drawWritingLines(page, { x: left, y, width: contentW, count, spacing });
}

function renderWeekly(page, ctx) {
  const { fonts, topY, left, contentW, bottomY, pageData } = ctx;
  drawSpaced(page, `Woche ${pageData.week}`, { x: left, y: topY, size: 8.5, font: fonts.sans, color: COLORS.muted, spacing: 2.4 });
  let y = topY - 30;
  page.drawText(sanitizeText(pageData.title), { x: left, y, size: 19, font: fonts.bodyBold, color: COLORS.black });
  y -= 14;
  drawRule(page, left, y, contentW * 0.4, { thickness: 1, color: COLORS.accent });
  y -= 30;

  const questions = pageData.questions ?? [];
  const block = (y - bottomY) / Math.max(questions.length, 1);
  questions.forEach((question, i) => {
    const qy = y - i * block;
    const next = drawParagraph(page, `${i + 1}. ${question}`, {
      x: left,
      y: qy,
      width: contentW,
      font: fonts.body,
      size: 11.5,
      lineHeight: 16,
      color: COLORS.ink,
    });
    drawWritingLines(page, {
      x: left,
      y: next - 14,
      width: contentW,
      count: Math.max(2, Math.floor((qy - (y - (i + 1) * block) - 34) / 24)),
      spacing: 24,
    });
  });
}

function renderChapter(page, ctx) {
  const { fonts, H, left, contentW, pageData, config } = ctx;
  drawSpaced(page, `Kapitel ${pageData.index}`, {
    x: left,
    y: H * 0.66,
    size: 9,
    font: fonts.sans,
    color: COLORS.muted,
    spacing: 3,
  });
  const titleLines = wrapText(pageData.title, fonts.bodyBold, 26, contentW);
  let y = H * 0.62;
  for (const line of titleLines) {
    page.drawText(line, { x: left, y, size: 26, font: fonts.bodyBold, color: COLORS.black });
    y -= 32;
  }
  drawRule(page, left, y - 4, contentW * 0.35, { thickness: 1.4, color: COLORS.accent });
  y -= 34;

  for (const paragraph of pageData.intro ?? []) {
    y = drawParagraph(page, paragraph, {
      x: left,
      y,
      width: contentW,
      font: fonts.body,
      size: 11.5,
      lineHeight: 17,
      color: COLORS.ink,
      paragraphGap: 8,
    });
    y -= 12;
  }

  drawSpaced(page, config.title, {
    x: left,
    y: H * 0.16,
    size: 7.5,
    font: fonts.sans,
    color: COLORS.light,
    spacing: 1.4,
    width: contentW,
    align: 'center',
  });
}

function renderExercise(page, ctx) {
  const { fonts, topY, left, contentW, bottomY, pageData } = ctx;
  drawSpaced(page, `Kapitel ${pageData.chapterIndex} · Übung`, {
    x: left,
    y: topY,
    size: 8,
    font: fonts.sans,
    color: COLORS.muted,
    spacing: 2,
  });
  let y = topY - 30;
  page.drawText(sanitizeText(pageData.title), { x: left, y, size: 17, font: fonts.bodyBold, color: COLORS.black });
  y -= 26;
  y = drawParagraph(page, pageData.prompt, {
    x: left,
    y,
    width: contentW,
    font: fonts.bodyItalic,
    size: 11,
    lineHeight: 16,
    color: COLORS.ink,
  });
  y -= 24;
  const spacing = 24;
  const count = Math.max(4, Math.floor((y - bottomY) / spacing));
  drawWritingLines(page, { x: left, y, width: contentW, count, spacing });
}

function renderLines(page, ctx) {
  const { fonts, topY, left, contentW, bottomY, pageData } = ctx;
  let y = topY;
  if (pageData.heading) {
    drawSpaced(page, pageData.heading, { x: left, y, size: 8.5, font: fonts.sans, color: COLORS.muted, spacing: 2.2 });
    y -= 20;
    drawRule(page, left, y + 8, contentW, { thickness: 0.6 });
    y -= 12;
  }
  const style = pageData.style ?? 'lined';
  if (style === 'dotted') {
    drawDotGrid(page, { x: left, y, width: contentW, height: y - bottomY });
  } else if (style === 'grid') {
    drawSquareGrid(page, { x: left, y, width: contentW, height: y - bottomY });
  } else {
    const spacing = 24;
    const count = Math.floor((y - bottomY) / spacing);
    drawWritingLines(page, { x: left, y, width: contentW, count, spacing });
  }
}

function renderClosing(page, ctx) {
  const { fonts, H, left, contentW, pageData, config } = ctx;
  let y = H * 0.58;
  page.drawText(sanitizeText(pageData.heading), { x: left, y, size: 20, font: fonts.bodyBold, color: COLORS.black });
  y -= 14;
  drawRule(page, left, y, contentW * 0.35, { thickness: 1, color: COLORS.accent });
  y -= 26;
  for (const paragraph of pageData.paragraphs ?? []) {
    y = drawParagraph(page, paragraph, {
      x: left,
      y,
      width: contentW,
      font: fonts.body,
      size: 11,
      lineHeight: 16.5,
      color: COLORS.ink,
      paragraphGap: 8,
    });
    y -= 10;
  }
  y -= 20;
  drawSpaced(page, config.author, { x: left, y, size: 9, font: fonts.sansBold, color: COLORS.muted, spacing: 2.4 });
}

const RENDERERS = {
  title: renderTitle,
  copyright: renderCopyright,
  howto: renderHowTo,
  belongs: renderBelongs,
  section: renderSection,
  sudoku: renderSudoku,
  wordsearch: renderWordSearch,
  maze: renderMaze,
  sudokuSolutions: renderSolutions,
  wordsearchSolutions: renderSolutions,
  mazeSolutions: renderSolutions,
  journalDay: renderJournalDay,
  weekly: renderWeekly,
  chapter: renderChapter,
  exercise: renderExercise,
  lines: renderLines,
  closing: renderClosing,
};

/**
 * Erzeugt das Buchblock-PDF.
 * @param {object} plan Ergebnis von composeBook()
 * @returns {Promise<Uint8Array>}
 */
export async function renderManuscriptPdf(plan) {
  const { config, pages, margins } = plan;
  const trim = trimSize(config.trim);
  const W = trim.width * INCH_TO_PT;
  const H = trim.height * INCH_TO_PT;

  const doc = await PDFDocument.create();
  doc.setTitle(sanitizeText(config.title));
  doc.setAuthor(sanitizeText(config.author));
  doc.setSubject(sanitizeText(config.subtitle || config.description || ''));
  doc.setCreator('Buchmaschine (KDP-Studio)');
  doc.setProducer('Buchmaschine / pdf-lib');

  const fonts = {
    body: await doc.embedFont(StandardFonts.TimesRoman),
    bodyBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    bodyItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  for (let physical = 0; physical < pages.length; physical += 1) {
    const pageData = pages[physical];
    const isRecto = (physical + 1) % 2 === 1;
    const left = (isRecto ? margins.insideIn : margins.outsideIn) * INCH_TO_PT;
    const right = (isRecto ? margins.outsideIn : margins.insideIn) * INCH_TO_PT;
    const top = margins.topIn * INCH_TO_PT;
    const bottom = margins.bottomIn * INCH_TO_PT;

    const page = doc.addPage([W, H]);
    const renderer = RENDERERS[pageData.type];
    const ctx = {
      fonts,
      W,
      H,
      left,
      right,
      contentW: W - left - right,
      topY: H - top,
      bottomY: bottom,
      config,
      plan,
      pageData,
      generator: config.generator,
      physical,
      trimLabel: `${trim.width} x ${trim.height} Zoll`,
      generatorLabel: plan.config.generator,
    };

    if (pageData.type !== 'blank' && renderer) {
      renderer(page, ctx);
    }

    if (pageData.number) {
      const label = String(pageData.number);
      const size = 8.5;
      const w = fonts.sans.widthOfTextAtSize(label, size);
      page.drawText(label, {
        x: (W - w) / 2,
        y: Math.max(18, bottom * 0.5),
        size,
        font: fonts.sans,
        color: COLORS.muted,
      });
    }
  }

  return doc.save();
}
