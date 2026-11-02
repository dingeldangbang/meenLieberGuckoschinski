/** Buchmaschine - HTTP-Server: statisches Studio + Export-API. */
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRIM_SIZES, PAPER_THICKNESS, PRINT_PRICING, ROYALTY_TIERS, priceLadder } from './lib/kdp.mjs';
import { GENERATORS, NICHE_PACKS, buildKeywordIdeas, listNiches, sampleTitleFor } from './lib/niches.mjs';
import { wordsetList } from './lib/content/words.mjs';
import { validateBookConfig } from './lib/validate.mjs';
import { composeBook, summarizePlan } from './lib/compose.mjs';
import { renderManuscriptPdf } from './lib/pdf/manuscript.mjs';
import { renderCoverPdf, COVER_STYLES } from './lib/pdf/cover.mjs';
import { buildEpub } from './lib/epub.mjs';
import { expandAlphabet, keywordResearch } from './lib/suggest.mjs';
import { CATEGORIES, estimateFromRank, rankForSales } from './lib/bsr.mjs';
import { buildPortfolio } from './lib/portfolio.mjs';
import { listProjects, saveProject, deleteProject } from './lib/store.mjs';
import { preflightPdf } from './lib/preflight.mjs';
import { complianceReport, KNOWN_TRADEMARKS, HYPE_WORDS, GENERIC_TERMS } from './lib/policy.mjs';
import { renderMetadataSheet } from './lib/pdf/metadata-sheet.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendPdf(res, bytes, filename) {
  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': bytes.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.end(Buffer.from(bytes));
}

async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Anfrage zu groß'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Ungültiges JSON im Request-Body'), { status: 400 });
  }
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'buch';
}

function buildPlan(input) {
  const result = validateBookConfig(input);
  if (!result.ok) {
    throw Object.assign(new Error('Konfiguration unvollständig'), { status: 400, details: result.errors });
  }
  return composeBook(result.config);
}

function sampleFrom(plan) {
  const first = plan.pages.find((p) => ['sudoku', 'wordsearch', 'maze'].includes(p.type));
  if (!first) return null;
  if (first.type === 'sudoku') {
    return {
      kind: 'sudoku',
      index: first.index,
      difficulty: first.puzzle.difficulty,
      puzzle: first.puzzle.puzzle,
      solution: first.puzzle.solution,
    };
  }
  if (first.type === 'wordsearch') {
    return {
      kind: 'wordsearch',
      index: first.index,
      size: first.puzzle.size,
      grid: first.puzzle.grid,
      words: first.puzzle.placements.map((p) => p.word),
    };
  }
  return {
    kind: 'maze',
    index: first.index,
    cols: first.puzzle.cols,
    rows: first.puzzle.rows,
    walls: first.puzzle.walls,
    path: first.puzzle.path,
  };
}

function metadataFor(plan) {
  const { config, cover, royalties, stats } = plan;
  return {
    title: config.title,
    subtitle: config.subtitle || null,
    author: config.author,
    description: config.description || null,
    keywords: config.keywords,
    categories: config.categories,
    language: 'Deutsch',
    publicationDate: new Date().toISOString().slice(0, 10),
    imprint: 'Unabhängig veröffentlicht (Amazon KDP)',
    isbn: 'Kostenlose KDP-ISBN im Dashboard zuweisen',
    printOptions: {
      format: config.trim,
      interior: `Schwarzweiß auf ${config.paper === 'cream' ? 'cremefarbenem' : config.paper === 'color' ? 'farbigem' : 'weißem'} Papier`,
      bleed: 'Kein Beschnitt im Buchblock (Cover mit 0,125 Zoll Beschnitt)',
      pageCount: stats.pageCount,
      coverFinish: config.coverFinish || 'matt',
    },
    coverGeometry: {
      totalWidthIn: cover.totalWidthIn,
      totalHeightIn: cover.totalHeightIn,
      spineIn: cover.spineIn,
      bleedIn: cover.bleedIn,
      pixels300dpi: cover.pixels300dpi,
    },
    ebook: {
      format: 'EPUB 3 (Kindle-kompatibel)',
      royaltyBand: '70 % nur zwischen 2,99 € und 9,99 €, sonst 35 %',
      note: 'Im KDP-Dashboard als E-Book hochladen; Titelbild separat als JPG/PNG.',
    },
    pricing: {
      listPriceEur: royalties.listPriceEur,
      printingCostEur: royalties.printingCostEur,
      royaltyPerSaleEur: royalties.payoutEur,
      minimumListPriceEur: royalties.minimumListPriceEur,
    },
  };
}

function copyPasteText(plan) {
  const meta = metadataFor(plan);
  return [
    `TITEL: ${meta.title}`,
    `UNTERTITEL: ${meta.subtitle ?? '-'}`,
    `AUTOR: ${meta.author}`,
    `SPRACHE: ${meta.language}`,
    '',
    'BESCHREIBUNG:',
    meta.description ?? '-',
    '',
    `7 KEYWORDS: ${meta.keywords.join(' | ')}`,
    `KATEGORIEN: ${meta.categories.join(' | ')}`,
    '',
    `FORMAT: ${meta.printOptions.format} · ${meta.printOptions.interior} · ${meta.printOptions.pageCount} Seiten`,
    `COVER: ${meta.coverGeometry.totalWidthIn} x ${meta.coverGeometry.totalHeightIn} Zoll (Rücken ${meta.coverGeometry.spineIn})`,
    `PREIS: ${meta.pricing.listPriceEur} EUR · Tantieme je Verkauf: ${meta.pricing.royaltyPerSaleEur} EUR`,
    '',
    `Checkliste: Titel, Untertitel, Autor, Beschreibung, 7 Keywords, 2 Kategorien, Preis und beide PDFs im KDP-Dashboard hochladen.`,
  ].join('\n');
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, { status: 'ok', service: 'buchmaschine', time: new Date().toISOString() });
  }

  if (pathname === '/api/catalog' && req.method === 'GET') {
    return sendJson(res, 200, {
      generators: GENERATORS,
      trims: TRIM_SIZES,
      papers: PAPER_THICKNESS,
      coverStyles: COVER_STYLES,
      wordsets: wordsetList(),
    });
  }

  if (pathname === '/api/niches' && req.method === 'GET') {
    const niches = listNiches().map((n) => ({ ...n, sample: sampleTitleFor(n.id) }));
    return sendJson(res, 200, { niches });
  }

  if (pathname === '/api/keywords' && req.method === 'POST') {
    const body = await readBody(req);
    const seed = String(body.seed ?? '').slice(0, 80);
    const ideas = buildKeywordIdeas(seed || 'rätselbuch', { limit: 24 });
    const niche = NICHE_PACKS.find((n) => n.id === body.nicheId);
    const curated = niche ? niche.keywords.map((k) => ({ ...k, score: Math.round((k.demand / Math.max(k.competition, 5)) * 100) })) : [];
    return sendJson(res, 200, { ideas, curated });
  }

  if (pathname === '/api/preview' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const summary = summarizePlan(plan);
    return sendJson(res, 200, {
      ...summary,
      sample: sampleFrom(plan),
      coverBadge: plan.coverBadge,
      backCoverBullets: plan.backCoverBullets,
      priceLadder: priceLadder({ pageCount: plan.config.pageCount }),
    });
  }

  if (pathname === '/api/export/manuscript.pdf' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const bytes = await renderManuscriptPdf(plan);
    return sendPdf(res, bytes, `${slugify(plan.config.title)}_buchblock_${plan.config.trim}.pdf`);
  }

  if (pathname === '/api/export/cover.pdf' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const guides = url.searchParams.get('guides') === '1';
    const bytes = await renderCoverPdf(plan, { guides });
    return sendPdf(res, bytes, `${slugify(plan.config.title)}_cover${guides ? '_hilfslinien' : ''}.pdf`);
  }

  if (pathname === '/api/export/ebook.epub' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const epub = buildEpub(plan);
    res.writeHead(200, {
      'Content-Type': 'application/epub+zip',
      'Content-Length': epub.length,
      'Content-Disposition': `attachment; filename="${slugify(plan.config.title)}_kindle.epub"`,
      'Cache-Control': 'no-store',
    });
    return res.end(epub);
  }

  if (pathname === '/api/export/metadata.json' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    return sendJson(res, 200, {
      metadata: metadataFor(plan),
      copyPasteText: copyPasteText(plan),
    });
  }

  if (pathname === '/api/suggest' && req.method === 'GET') {
    const query = String(url.searchParams.get('q') ?? '').slice(0, 80);
    const marketplace = ['de', 'com', 'co.uk'].includes(url.searchParams.get('mkt') ?? '')
      ? url.searchParams.get('mkt')
      : 'de';
    if (query.trim().length < 2) {
      return sendJson(res, 200, { source: 'invalid', live: false, ideas: [], suggestions: [], note: 'Mindestens zwei Zeichen eingeben.' });
    }
    const result = await keywordResearch(query, { marketplace });
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/suggest/expand' && req.method === 'GET') {
    const query = String(url.searchParams.get('q') ?? '').slice(0, 60);
    const requested = url.searchParams.get('mkt') ?? 'de';
    const marketplace = requested === 'uk' ? 'co.uk' : ['de', 'com', 'co.uk'].includes(requested) ? requested : 'de';
    return sendJson(res, 200, await expandAlphabet(query, { marketplace }));
  }

  if (pathname === '/api/bsr' && req.method === 'GET') {
    const rank = Number(url.searchParams.get('rank') ?? 0);
    if (!Number.isFinite(rank) || rank < 1) {
      return sendJson(res, 400, { error: 'Parameter rank muss eine positive Zahl sein.', categories: Object.keys(CATEGORIES) });
    }
    const category = url.searchParams.get('category') ?? 'books';
    if (!CATEGORIES[category]) {
      return sendJson(res, 400, { error: `Unbekannte Kategorie: ${category}`, categories: Object.keys(CATEGORIES) });
    }
    return sendJson(res, 200, {
      categories: CATEGORIES,
      estimate: estimateFromRank({
        rank,
        category,
        price: Number(url.searchParams.get('price') ?? 9.99),
        pageCount: Number(url.searchParams.get('pages') ?? 134),
        trim: url.searchParams.get('trim') ?? '6x9',
        marketplace: ['de', 'com', 'uk'].includes(url.searchParams.get('mkt') ?? '') ? url.searchParams.get('mkt') : 'de',
      }),
    });
  }

  if (pathname === '/api/bsr/reverse' && req.method === 'GET') {
    const target = Number(url.searchParams.get('sales') ?? 0);
    const category = url.searchParams.get('category') ?? 'books';
    if (!Number.isFinite(target) || target <= 0) {
      return sendJson(res, 400, { error: 'Parameter sales muss positiv sein.' });
    }
    if (!CATEGORIES[category]) {
      return sendJson(res, 400, { error: `Unbekannte Kategorie: ${category}`, categories: Object.keys(CATEGORIES) });
    }
    return sendJson(res, 200, { salesPerDay: target, category, rank: rankForSales(target, { category }) });
  }

  if (pathname === '/api/pricing' && req.method === 'GET') {
    // Rechenmodell offenlegen - KDP ändert Preise und Tantiemestufen
    return sendJson(res, 200, {
      pricing: PRINT_PRICING,
      royaltyTiers: ROYALTY_TIERS,
      marketplace: url.searchParams.get('mkt') ?? 'de',
      pageCount: Number(url.searchParams.get('pages') ?? 120),
      ladder: priceLadder({
        pageCount: Number(url.searchParams.get('pages') ?? 120),
        marketplace: url.searchParams.get('mkt') ?? 'de',
      }),
      disclaimer: 'Rechenmodell, keine Zusage. Verbindlich ist die KDP-Druckkosten-Vorschau.',
    });
  }

  if (pathname === '/api/compliance' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    return sendJson(res, 200, {
      compliance: complianceReport(plan.config, plan),
      lists: { trademarks: KNOWN_TRADEMARKS, generic: GENERIC_TERMS, hypeWords: HYPE_WORDS },
    });
  }

  if (pathname === '/api/preflight' && req.method === 'POST' && url.searchParams.get('kind') !== 'cover') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const bytes = await renderManuscriptPdf(plan);
    const result = await preflightPdf(bytes, { kind: 'manuscript', config: plan, expectedPages: plan.config.pageCount });
    return sendJson(res, 200, { kind: 'manuscript', ...result, compliance: complianceReport(plan.config, plan) });
  }

  if (pathname === '/api/preflight' && req.method === 'POST' && url.searchParams.get('kind') === 'cover') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const bytes = await renderCoverPdf(plan);
    const result = await preflightPdf(bytes, { kind: 'cover', config: plan });
    return sendJson(res, 200, { kind: 'cover', ...result });
  }

  if (pathname === '/api/export/metadata-sheet.pdf' && req.method === 'POST') {
    const body = await readBody(req);
    const plan = buildPlan(body.config ?? body);
    const metadata = metadataFor(plan);
    const compliance = complianceReport(plan.config, plan);
    const flight = await preflightPdf(await renderManuscriptPdf(plan), {
      kind: 'manuscript',
      config: plan,
      expectedPages: plan.config.pageCount,
    });
    const sheet = await renderMetadataSheet(plan, { metadata, compliance, preflight: flight });
    return sendPdf(res, sheet, `${slugify(plan.config.title)}_metadaten.pdf`);
  }

  if (pathname === '/api/projects' && req.method === 'GET') {
    return sendJson(res, 200, { projects: await listProjects() });
  }

  if (pathname === '/api/dashboard' && req.method === 'GET') {
    const projects = await listProjects();
    const salesPerBook = Number(url.searchParams.get('sales') ?? 10);
    return sendJson(res, 200, buildPortfolio(projects, { salesPerBook }));
  }

  if (pathname === '/api/projects' && req.method === 'POST') {
    const body = await readBody(req);
    const config = body.config ?? body;
    const projection = buildPlan(config);
    const record = await saveProject({ id: body.id, name: body.name, config: projection.config });
    return sendJson(res, 201, { project: record });
  }

  if (pathname.startsWith('/api/projects/') && req.method === 'DELETE') {
    const id = pathname.split('/').pop();
    const removed = await deleteProject(id);
    if (!removed) return sendJson(res, 404, { error: 'Projekt nicht gefunden' });
    return sendJson(res, 200, { deleted: id });
  }

  return sendJson(res, 404, { error: 'Unbekannter API-Endpunkt' });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Zugriff verweigert');
    return;
  }
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    // SPA-Fallback für unbekannte Pfade
    try {
      const fallback = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fallback);
    } catch {
      res.writeHead(404).end('Nicht gefunden');
    }
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else if (req.method === 'GET' || req.method === 'HEAD') {
        await serveStatic(req, res, url);
      } else {
        res.writeHead(405).end('Methode nicht erlaubt');
      }
    } catch (error) {
      const status = error.status ?? 500;
      if (status >= 500) console.error('[buchmaschine]', error);
      sendJson(res, status, {
        error: error.message ?? 'Interner Fehler',
        details: error.details,
      });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Buchmaschine läuft auf http://${HOST}:${PORT}`);
    console.log('Keine Anmeldung, keine API-Keys, keine Cloudkosten.');
  });
}
