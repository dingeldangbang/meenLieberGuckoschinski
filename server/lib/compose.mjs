/**
 * Buch-Komposition: aus einer Konfiguration wird ein vollständiger Seitenplan.
 * Determinismus: gleicher Seed + gleiche Konfiguration => identisches Buch.
 */
import { coverDimensions, interiorMargins, royaltyBreakdown, revenueScenarios, printingCost } from './kdp.mjs';
import { generateSudoku } from './content/sudoku.mjs';
import { generateWordSearch, suggestGridSize } from './content/wordsearch.mjs';
import { generateMaze } from './content/maze.mjs';
import { wordsForCategories } from './content/words.mjs';
import {
  HOW_TO_TEXT,
  CLOSING_TEXT,
  JOURNAL_PROMPTS,
  WEEKLY_REFLECTIONS,
  WORKBOOK_THEMES,
  themeForNiche,
} from './content/text.mjs';

export const SOLUTIONS_PER_PAGE = { sudoku: 4, wordsearch: 2, maze: 6 };
const FRONT_MATTER_PAGES = 4; // Titel, Impressum, Anleitung, "Dieses Buch gehört"
const BACK_MATTER_PAGES = 2; // Schlussseite + Notizseite

const GRID_SIZE_BY_TRIM = { '5x8': 11, '5.25x8': 11, '5.5x8.5': 11, '6x9': 13, '6.69x9.61': 13, '7x10': 15, '7.5x9.25': 15, '8x10': 15, '8.5x11': 17 };

function themeKey(config) {
  const theme = config.theme;
  if (WORKBOOK_THEMES[theme]) return theme;
  return themeForNiche(config.nicheId);
}

function buildPuzzlePages(config, usable) {
  const pages = [];
  const spp = SOLUTIONS_PER_PAGE[config.generator];
  let count = 0;
  for (let n = usable; n >= 1; n -= 1) {
    const solutionPages = Math.ceil(n / spp);
    if (n + 1 + solutionPages <= usable) {
      count = n;
      break;
    }
  }

  const gridSize = GRID_SIZE_BY_TRIM[config.trim] ?? 13;
  const words = wordsForCategories(config.wordCategories);
  const evaluatedSize = config.generator === 'wordsearch' ? suggestGridSize(words, gridSize) : gridSize;

  const items = [];
  const puzzles = [];
  for (let i = 1; i <= count; i += 1) {
    const seed = `${config.seed}-${config.generator}-${i}`;
    if (config.generator === 'sudoku') {
      const puzzle = generateSudoku(seed, config.difficulty);
      puzzles.push(puzzle);
      pages.push({ type: 'sudoku', index: i, puzzle });
      items.push({ index: i, solution: puzzle.solution });
    } else if (config.generator === 'wordsearch') {
      const puzzle = generateWordSearch(words, {
        size: evaluatedSize,
        seed,
        difficulty: config.difficulty,
        wordCount: config.wordsPerPuzzle,
      });
      puzzles.push(puzzle);
      pages.push({ type: 'wordsearch', index: i, puzzle });
      items.push({ index: i, solution: puzzle });
    } else {
      const rows = config.trim === '8.5x11' ? 31 : config.trim === '6x9' ? 27 : 23;
      const cols = config.trim === '8.5x11' ? 23 : config.trim === '6x9' ? 19 : 17;
      const puzzle = generateMaze(seed, { cols, rows, braid: config.difficulty === 'hard' ? 12 : config.difficulty === 'medium' ? 5 : 0 });
      puzzles.push(puzzle);
      pages.push({ type: 'maze', index: i, puzzle });
      items.push({ index: i, solution: puzzle });
    }
  }

  if (count > 0) {
    pages.push({ type: 'section', title: 'Lösungen' });
    for (let i = 0; i < items.length; i += spp) {
      pages.push({
        type: `${config.generator}Solutions`,
        items: items.slice(i, i + spp),
        startIndex: items[i].index,
      });
    }
  }

  const filler = Math.max(0, usable - pages.length);
  for (let i = 0; i < filler; i += 1) {
    pages.push({ type: 'lines', heading: 'Notizen', style: 'lined' });
  }

  return { pages, puzzleCount: count, solutionPages: Math.ceil(count / spp), puzzles };
}

function buildJournalPages(config, usable) {
  const pages = [];
  let daysEmitted = 0;
  let weekIndex = 0;

  while (pages.length < usable) {
    // Eine Woche = sieben Tagesseiten ...
    for (let i = 0; i < 7 && pages.length < usable; i += 1) {
      pages.push({
        type: 'journalDay',
        index: daysEmitted + 1,
        prompt: JOURNAL_PROMPTS[daysEmitted % JOURNAL_PROMPTS.length],
      });
      daysEmitted += 1;
    }
    // ... danach die Rückblickseite
    if (pages.length < usable) {
      weekIndex += 1;
      const reflection = WEEKLY_REFLECTIONS[(weekIndex - 1) % WEEKLY_REFLECTIONS.length];
      pages.push({ type: 'weekly', ...reflection, week: weekIndex });
    }
  }

  return { pages, entryCount: daysEmitted };
}

function buildWorkbookPages(config, usable) {
  const key = themeKey(config);
  const theme = WORKBOOK_THEMES[key] ?? WORKBOOK_THEMES.generic;
  const chapters = theme.chapters.slice(0, config.chapterLimit);
  const pages = [];
  let exerciseCount = 0;

  for (let c = 0; c < chapters.length; c += 1) {
    const chapter = chapters[c];
    const chapterPages = 1 + chapter.exercises.length;
    if (pages.length + chapterPages > usable) break;
    pages.push({
      type: 'chapter',
      index: c + 1,
      total: chapters.length,
      title: chapter.title,
      intro: chapter.intro,
    });
    for (const exercise of chapter.exercises) {
      pages.push({
        type: 'exercise',
        chapterIndex: c + 1,
        chapterTitle: chapter.title,
        title: exercise.title,
        prompt: exercise.prompt,
      });
      exerciseCount += 1;
    }
  }

  const filler = Math.max(0, usable - pages.length);
  for (let i = 0; i < filler; i += 1) {
    pages.push({ type: 'lines', heading: 'Eigene Notizen', style: 'lined' });
  }

  return { pages, exerciseCount, chapterCount: Math.min(chapters.length, pages.filter((p) => p.type === 'chapter').length) };
}

function buildNotebookPages(config, usable) {
  const pages = [];
  for (let i = 0; i < usable; i += 1) {
    pages.push({ type: 'lines', heading: null, style: config.notebookStyle });
  }
  return { pages };
}

/**
 * Erzeugt den vollständigen Seitenplan inklusive Statistik und Kalkulation.
 */
export function composeBook(config) {
  const usable = Math.max(1, config.pageCount - FRONT_MATTER_PAGES - BACK_MATTER_PAGES);
  const front = [
    { type: 'title' },
    { type: 'copyright' },
    { type: 'howto', ...(HOW_TO_TEXT[config.generator] ?? HOW_TO_TEXT.sudoku) },
    { type: 'belongs' },
  ];

  let body;
  if (config.generator === 'journal') body = buildJournalPages(config, usable);
  else if (config.generator === 'workbook') body = buildWorkbookPages(config, usable);
  else if (config.generator === 'notebook') body = buildNotebookPages(config, usable);
  else body = buildPuzzlePages(config, usable);

  const back = [
    { type: 'closing', ...CLOSING_TEXT },
    { type: 'lines', heading: 'Notizen', style: 'lined' },
  ];

  let pages = [...front, ...body.pages, ...back];

  // Auf exakte Seitenzahl auffüllen bzw. kürzen (KDP braucht eine gerade Seitenzahl)
  while (pages.length < config.pageCount) {
    pages.splice(pages.length - BACK_MATTER_PAGES, 0, { type: 'lines', heading: 'Notizen', style: 'lined' });
  }
  if (pages.length > config.pageCount) {
    const overflow = pages.length - config.pageCount;
    pages.splice(Math.max(FRONT_MATTER_PAGES, pages.length - BACK_MATTER_PAGES - overflow), overflow);
    while (pages.length < config.pageCount) {
      pages.splice(pages.length - BACK_MATTER_PAGES, 0, { type: 'lines', heading: 'Notizen', style: 'lined' });
    }
  }

  pages = pages.map((page, i) => ({
    ...page,
    number: i >= FRONT_MATTER_PAGES ? i + 1 : null,
  }));

  const cover = coverDimensions({
    pageCount: config.pageCount,
    trim: config.trim,
    paper: config.paper,
  });
  const margins = interiorMargins({ pageCount: config.pageCount, trim: config.trim });
  const royalties = royaltyBreakdown({
    pageCount: config.pageCount,
    priceEur: config.priceEur,
    trim: config.trim,
    paper: config.paper,
    marketplace: config.marketplace ?? 'de',
  });
  const revenue = revenueScenarios({
    pageCount: config.pageCount,
    priceEur: config.priceEur,
    trim: config.trim,
    marketplace: config.marketplace ?? 'de',
  });

  const stats = {
    pageCount: pages.length,
    frontMatterPages: FRONT_MATTER_PAGES,
    puzzleCount: body.puzzleCount ?? 0,
    solutionPages: body.solutionPages ?? 0,
    exerciseCount: body.exerciseCount ?? 0,
    chapterCount: body.chapterCount ?? 0,
    journalEntries: body.entryCount ?? 0,
    printingCostEur: printingCost(config.pageCount, {
      trim: config.trim,
      marketplace: config.marketplace ?? 'de',
    }),
  };

  const extras = coverExtras(config, stats);
  return {
    config,
    pages,
    stats,
    coverBadge: extras.badge,
    backCoverBullets: extras.bullets,
    cover,
    margins,
    royalties,
    revenue,
    generatedAt: new Date().toISOString(),
    determinism: { seed: config.seed, note: 'Gleicher Seed erzeugt identische Inhalte.' },
  };
}

/** Kurztext und Stichpunkte für die Rückseite - aus der Buchstruktur abgeleitet. */
export function coverExtras(config, stats) {
  const bullets = [`${stats.pageCount} Seiten im Format ${config.trim.replace('x', ' × ')} Zoll`];
  switch (config.generator) {
    case 'sudoku':
      return {
        badge: `SUDOKU · ${config.difficulty === 'easy' ? 'LEICHT' : config.difficulty === 'hard' ? 'SCHWER' : 'MITTEL'}`,
        bullets: [...bullets, `${stats.puzzleCount} Rätsel mit garantiert eindeutiger Lösung`, 'Lösungen übersichtlich am Ende des Buches'],
      };
    case 'wordsearch':
      return {
        badge: 'WORTSUCHE · MIT LÖSUNGEN',
        bullets: [...bullets, `${stats.puzzleCount} Suchgitter mit insgesamt über ${stats.puzzleCount * config.wordsPerPuzzle} Wörtern`, 'Alle Lösungen mit eingezeichneten Wörtern'],
      };
    case 'maze':
      return {
        badge: 'LABYRINTHE · LÖSBAR GARANTIERT',
        bullets: [...bullets, `${stats.puzzleCount} Labyrinthe in drei Schwierigkeiten`, 'Lösungswege am Ende des Buches'],
      };
    case 'journal':
      return {
        badge: 'JOURNAL · TAGESFRAGEN',
        bullets: [...bullets, `${stats.journalEntries} Tagesfragen mit Schreiblinien`, 'Wöchentliche Rückblickseiten für den roten Faden'],
      };
    case 'workbook':
      return {
        badge: 'ÜBUNGSBUCH · MIT SCHREIBSEITEN',
        bullets: [...bullets, `${stats.chapterCount} Kapitel mit ${stats.exerciseCount} Übungen`, 'Platz zum Ausfüllen direkt im Buch'],
      };
    default:
      return {
        badge: 'NOTIZBUCH',
        bullets: [...bullets, config.notebookStyle === 'dotted' ? 'Punktraster für Skizzen und Pläne' : config.notebookStyle === 'grid' ? 'Kariertes Raster' : 'Liniert mit Seitenzahlen', 'Fadengebundenes Taschenbuchformat'],
      };
  }
}

/** Kompakte Vorschau ohne Rätsel-Daten (für die UI). */
export function summarizePlan(plan) {
  return {
    pageCount: plan.stats.pageCount,
    stats: plan.stats,
    cover: plan.cover,
    margins: plan.margins,
    royalties: plan.royalties,
    revenue: plan.revenue,
    config: plan.config,
    determinism: plan.determinism,
    pages: plan.pages.map((page, i) => ({
      position: i + 1,
      number: page.number,
      type: page.type,
      label: pageLabel(page),
    })),
  };
}

export function pageLabel(page) {
  switch (page.type) {
    case 'title':
      return 'Titelseite';
    case 'copyright':
      return 'Impressum';
    case 'howto':
      return 'Anleitung';
    case 'belongs':
      return 'Dieses Buch gehört';
    case 'section':
      return `Abschnitt: ${page.title}`;
    case 'sudoku':
      return `Sudoku #${page.index} (${page.puzzle.difficulty})`;
    case 'wordsearch':
      return `Wortsuche #${page.index} (${page.puzzle.wordCount} Wörter)`;
    case 'maze':
      return `Labyrinth #${page.index}`;
    case 'sudokuSolutions':
      return `Lösungen #${page.items[0].index}–${page.items[page.items.length - 1].index}`;
    case 'wordsearchSolutions':
      return `Lösungen #${page.startIndex}–${page.startIndex + page.items.length - 1}`;
    case 'mazeSolutions':
      return `Lösungen #${page.startIndex}–${page.startIndex + page.items.length - 1}`;
    case 'journalDay':
      return `Tag ${page.index}`;
    case 'weekly':
      return `Woche ${page.week}: ${page.title}`;
    case 'chapter':
      return `Kapitel ${page.index}: ${page.title}`;
    case 'exercise':
      return `Übung: ${page.title}`;
    case 'closing':
      return 'Schlussseite';
    default:
      return 'Schreibseite';
  }
}
