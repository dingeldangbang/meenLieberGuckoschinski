/**
 * EPUB-3-Export: druckbares Buch wird zum Kindle-E-Book.
 * Aufbau: mimetype → container.xml → content.opf (mit Metadaten) → nav.xhtml → Kapitel.
 * Bewusst ohne Fremdbibliothek: ein ZIP-Writer und XHTML-Vorlagen genügen.
 */
import crypto from 'node:crypto';
import { createZip } from './zip.mjs';
import { themeForNiche } from './content/text.mjs';

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const escapeAttr = (value) => escapeXml(value).replace(/\n/g, ' ');

function uuidFrom(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const DIFFICULTY_LABEL = { easy: 'leicht', medium: 'mittel', hard: 'schwer' };

const CSS = `/* Buchmaschine - E-Book-Stil */
body { font-family: Georgia, "Times New Roman", serif; line-height: 1.62; margin: 0 5%; color: #1b1b1b; }
h1 { font-size: 1.6em; line-height: 1.2; margin: 1.4em 0 0.4em; }
h2 { font-size: 1.15em; margin: 1.6em 0 0.4em; }
p { margin: 0 0 0.9em; text-align: justify; }
p.lead { font-style: italic; color: #444; }
p.small { font-size: 0.85em; color: #555; text-align: left; }
h1.title { margin-top: 25%; font-size: 2em; }
p.subtitle { font-style: italic; color: #444; font-size: 1.1em; }
p.author { margin-top: 2.4em; font-size: 1em; letter-spacing: 0.12em; text-transform: uppercase; }
hr { border: 0; border-top: 1px solid #bbb; margin: 2em 0; }
table.grid { border-collapse: collapse; margin: 1.2em auto; font-family: "Courier New", monospace; }
table.grid td { width: 1.6em; height: 1.6em; text-align: center; vertical-align: middle; font-size: 1em; border: 1px solid #cfc8bd; }
table.grid td.edge-b { border-bottom: 2px solid #333; }
table.grid td.edge-r { border-right: 2px solid #333; }
table.grid td.top { border-top: 2px solid #333; }
table.grid td.left { border-left: 2px solid #333; }
pre.puzzle { font-family: "Courier New", monospace; font-size: 0.8em; line-height: 1.35; white-space: pre; margin: 1.2em 0; }
ol.words { columns: 2; font-size: 0.9em; }
ol.answers { font-size: 0.9em; }
.writing-lines p { border-bottom: 1px solid #ddd; height: 1.7em; margin: 0; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.3em 0; }
`;

function xhtmlDocument({ title, body, lang = 'de' }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
${body}
</body>
</html>`;
}

/* --------------------------------- Rätsel --------------------------------- */

function sudokuTable(puzzle, { showSolution = false } = {}) {
  const rows = [];
  for (let r = 0; r < 9; r += 1) {
    const cells = [];
    for (let c = 0; c < 9; c += 1) {
      const value = showSolution ? puzzle.solution[r][c] : puzzle.puzzle[r][c];
      const classes = [];
      if (c === 2 || c === 5) classes.push('edge-r');
      if (c === 8) classes.push('edge-r');
      if (r === 2 || r === 5) classes.push('edge-b');
      if (r === 8) classes.push('edge-b');
      if (c === 0) classes.push('left');
      if (r === 0) classes.push('top');
      cells.push(`<td${classes.length ? ` class="${classes.join(' ')}"` : ''}>${value || '&#160;'}</td>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table class="grid" epub:type="presentation">${rows.join('')}</table>`;
}

function wordSearchBlock(puzzle) {
  const lines = puzzle.grid.map((row) => row.join(' ')).join('\n');
  const words = puzzle.placements.map((p) => `<li>${escapeXml(p.word)}</li>`).join('');
  return `<pre class="puzzle">${escapeXml(lines)}</pre>
<ol class="words">${words}</ol>`;
}

function wordSearchSolution(puzzle) {
  const lines = puzzle.grid.map((row) => row.join(' ')).join('\n');
  return `<pre class="puzzle">${escapeXml(lines)}</pre>
<p class="small">${puzzle.placements.map((p) => escapeXml(p.word)).join(' · ')}</p>`;
}

function mazeBlock(puzzle) {
  // Wände als Vollblock, Wege als Leerzeichen - bleibt in Monospace lesbar
  const lines = puzzle.walls.map((row) => row.map((cell) => (cell === 1 ? '\u2588' : ' ')).join('')).join('\n');
  return `<pre class="puzzle">${escapeXml(lines)}</pre>
<p class="small">Eingang oben links, Ausgang unten rechts. Lösung im Lösungsteil.</p>`;
}

function mazeSolution(puzzle) {
  const grid = puzzle.walls.map((row) => row.map((cell) => (cell === 1 ? '\u2588' : '\u00b7')));
  for (const point of puzzle.path) grid[point.y][point.x] = '\u2022';
  const lines = grid.map((row) => row.join('')).join('\n');
  return `<pre class="puzzle">${escapeXml(lines)}</pre>`;
}

/* -------------------------------- Kapitel --------------------------------- */

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

/** Gruppiert Seiten des Plans zu E-Book-Kapiteln. */
export function buildEpubSections(plan) {
  const { config, pages } = plan;
  const sections = [];

  sections.push({
    id: 'titel',
    label: 'Titel',
    body: `<h1 class="title">${escapeXml(config.title)}</h1>
${config.subtitle ? `<p class="subtitle">${escapeXml(config.subtitle)}</p>` : ''}
<p class="author">${escapeXml(config.author)}</p>
<hr />
<p class="small">${escapeXml(plan.coverBadge ?? '')} · ${pages.length} Seiten in Druckfassung</p>`,
  });

  const generator = config.generator;

  if (generator === 'workbook') {
    const chapters = pages.filter((p) => p.type === 'chapter');
    const exercises = pages.filter((p) => p.type === 'exercise');
    for (const chapter of chapters) {
      const chapterExercises = exercises.filter((e) => e.chapterIndex === chapter.index);
      const body = [
        `<h1>Kapitel ${chapter.index}: ${escapeXml(chapter.title)}</h1>`,
        ...(chapter.intro ?? []).map((text) => `<p>${escapeXml(text)}</p>`),
        chapterExercises.length ? '<hr />' : '',
        ...chapterExercises.flatMap((exercise) => [
          `<h2>${escapeXml(exercise.title)}</h2>`,
          `<p class="lead">${escapeXml(exercise.prompt)}</p>`,
          '<div class="writing-lines"><p></p><p></p><p></p><p></p></div>',
        ]),
      ].join('\n');
      sections.push({ id: `kapitel-${chapter.index}`, label: `Kapitel ${chapter.index}: ${chapter.title}`, body });
    }
  } else if (generator === 'journal') {
    const days = pages.filter((p) => p.type === 'journalDay');
    const weeks = pages.filter((p) => p.type === 'weekly');
    const dayChunks = chunk(days, 7);
    dayChunks.forEach((group, index) => {
      const week = weeks.find((w) => w.week === index + 1);
      const body = [
        `<h1>Woche ${index + 1}</h1>`,
        ...group.map((day) => `<h2>Tag ${day.index}</h2><p class="lead">${escapeXml(day.prompt)}</p><div class="writing-lines"><p></p><p></p><p></p><p></p><p></p></div>`),
        week ? `<h2>${escapeXml(week.title)}</h2>${week.questions.map((q) => `<p class="lead">${escapeXml(q)}</p><div class="writing-lines"><p></p><p></p><p></p></div>`).join('\n')}` : '',
      ].join('\n');
      sections.push({ id: `woche-${index + 1}`, label: `Woche ${index + 1}`, body });
    });
  } else if (generator === 'notebook') {
    sections.push({
      id: 'notizen',
      label: 'Notizen',
      body: `<h1>Notizen</h1>
<p class="lead">Dieses Notizbuch ist für die Hand gedacht. Im E-Book dient dieser Abschnitt als Gedankenstütze - die Seiten im Druckbuch bleiben liniert.</p>
<div class="writing-lines">${'<p></p>'.repeat(12)}</div>`,
    });
  } else {
    // Rätsel: 10 Rätsel je Kapitel, Lösungen gesammelt am Ende
    const puzzleTypes = { sudoku: 'sudoku', wordsearch: 'wordsearch', maze: 'maze' };
    const type = puzzleTypes[generator];
    const items = pages.filter((p) => p.type === type);
    chunk(items, 10).forEach((group, index) => {
      const heading = generator === 'sudoku' ? 'Sudoku' : generator === 'wordsearch' ? 'Wortsuche' : 'Labyrinthe';
      const body = [
        `<h1>${heading} ${group[0].index}–${group[group.length - 1].index}</h1>`,
        ...group.flatMap((item) => {
          const caption = generator === 'sudoku'
            ? `<h2>Rätsel ${item.index} <span class="small">(${DIFFICULTY_LABEL[item.puzzle.difficulty] ?? ''})</span></h2>`
            : `<h2>Rätsel ${item.index}</h2>`;
          const content = generator === 'sudoku'
            ? sudokuTable(item.puzzle)
            : generator === 'wordsearch'
              ? wordSearchBlock(item.puzzle)
              : mazeBlock(item.puzzle);
          return [caption, content];
        }),
      ].join('\n');
      sections.push({ id: `raetsel-${index + 1}`, label: `${heading} ${group[0].index}–${group[group.length - 1].index}`, body });
    });

    if (items.length) {
      const body = [
        '<h1>Lösungen</h1>',
        ...items.flatMap((item) => {
          const content = generator === 'sudoku'
            ? sudokuTable(item.puzzle, { showSolution: true })
            : generator === 'wordsearch'
              ? wordSearchSolution(item.puzzle)
              : mazeSolution(item.puzzle);
          return [`<h2>Lösung ${item.index}</h2>`, content];
        }),
      ].join('\n');
      sections.push({ id: 'loesungen', label: 'Lösungen', body });
    }
  }

  const howto = pages.find((p) => p.type === 'howto');
  if (howto) {
    sections.splice(1, 0, {
      id: 'anleitung',
      label: howto.heading,
      body: `<h1>${escapeXml(howto.heading)}</h1>${(howto.paragraphs ?? []).map((p) => `<p>${escapeXml(p)}</p>`).join('\n')}`,
    });
  }

  return sections;
}

/**
 * Erzeugt ein EPUB 3 als Buffer.
 * @param {object} plan Ergebnis von composeBook()
 * @param {{date?: Date}} options
 */
export function buildEpub(plan, options = {}) {
  const { config } = plan;
  const date = options.date ?? new Date();
  const sections = buildEpubSections(plan);
  const identifier = `urn:uuid:${uuidFrom(`buchmaschine:${config.seed}:${config.title}`)}`;
  const modified = date.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '<item id="css" href="style.css" media-type="text/css" />',
    ...sections.map((section, index) => `<item id="sec${index + 1}" href="text/sec${index + 1}.xhtml" media-type="application/xhtml+xml" />`),
  ].join('\n    ');

  const spine = sections.map((_, index) => `<itemref idref="sec${index + 1}" />`).join('\n    ');

  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="de">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(identifier)}</dc:identifier>
    <dc:title>${escapeXml(config.title)}</dc:title>
    ${config.subtitle ? `<dc:title id="subtitle">${escapeXml(config.subtitle)}</dc:title>` : ''}
    <dc:creator>${escapeXml(config.author)}</dc:creator>
    <dc:language>de</dc:language>
    <dc:description>${escapeXml(config.description || config.subtitle || '')}</dc:description>
    ${(config.keywords ?? []).map((keyword) => `<dc:subject>${escapeXml(keyword)}</dc:subject>`).join('\n    ')}
    <dc:publisher>Unabhängig veröffentlicht</dc:publisher>
    <dc:date>${date.toISOString().slice(0, 10)}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilitySummary">Strukturierte Überschriften und ein navigierbares Inhaltsverzeichnis.</meta>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>
`;

  const navList = sections
    .map((section, index) => `<li><a href="text/sec${index + 1}.xhtml">${escapeXml(section.label)}</a></li>`)
    .join('\n      ');

  const nav = xhtmlDocument({
    title: 'Inhalt',
    body: `<nav epub:type="toc" id="toc">
  <h1>Inhalt</h1>
  <ol>
      ${navList}
  </ol>
</nav>
<nav epub:type="landmarks" id="landmarks" hidden="hidden">
  <ol>
    <li><a epub:type="bodymatter" href="text/sec1.xhtml">Anfang</a></li>
  </ol>
</nav>`,
  });

  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>
`;

  const entries = [
    { name: 'mimetype', data: 'application/epub+zip' },
    { name: 'META-INF/container.xml', data: container },
    { name: 'OEBPS/content.opf', data: contentOpf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/style.css', data: CSS },
    ...sections.map((section, index) => ({
      name: `OEBPS/text/sec${index + 1}.xhtml`,
      data: xhtmlDocument({ title: section.label, body: section.body }),
    })),
  ];

  return createZip(entries, { date });
}
