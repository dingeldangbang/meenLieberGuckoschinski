#!/usr/bin/env node
/**
 * Buchmaschine CLI: baut ein komplettes KDP-Paket ohne Browser.
 *
 *   node bin/buchmaschine.mjs build --niche raetsel-senioren --pages 134 --out ./paket
 *   node bin/buchmaschine.mjs preflight --manuscript ./paket/*_buchblock.pdf --trim 6x9
 *   node bin/buchmaschine.mjs niches
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';
import { renderManuscriptPdf } from '../server/lib/pdf/manuscript.mjs';
import { renderCoverPdf } from '../server/lib/pdf/cover.mjs';
import { renderMetadataSheet } from '../server/lib/pdf/metadata-sheet.mjs';
import { buildEpub } from '../server/lib/epub.mjs';
import { preflightPdf } from '../server/lib/preflight.mjs';
import { complianceReport } from '../server/lib/policy.mjs';
import { listNiches, sampleTitleFor } from '../server/lib/niches.mjs';

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const args = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return { command, args };
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'buch';
}

function printHelp() {
  console.log(`
Buchmaschine - KDP-Pakete ohne Browser bauen

  build      Buchblock, Cover, EPUB, Metadaten-Blatt und Report erzeugen
             --title "..." --subtitle "..." --author "..." --niche <id>
             --gen sudoku|wordsearch|maze|journal|workbook|notebook
             --pages 134 --trim 6x9 --paper white|cream --price 9.99
             --marketplace de|com|uk --seed <text> --out ./paket
             --keywords "a,b,c" --no-epub

  preflight  PDF gegen die KDP-Geometrie prüfen
             --manuscript <datei.pdf> | --cover <datei.pdf>
             --trim 6x9 --pages 134 --paper white

  niches     Kuratierte Nischen-Pakete anzeigen
  help       Diese Hilfe
`);
}

async function loadPdfMagic(file) {
  const { readFile } = await import('node:fs/promises');
  return readFile(file);
}

async function commandBuild(args) {
  const niche = args.niche
    ? listNiches().find((entry) => entry.id === args.niche)
    : undefined;
  if (args.niche && !niche) throw new Error(`Unbekannte Nische: ${args.niche}`);

  const sample = niche ? sampleTitleFor(niche.id) : { title: 'Mein neues Buch', subtitle: '' };
  const input = {
    title: args.title ?? sample.title,
    subtitle: args.subtitle ?? sample.subtitle,
    author: args.author ?? 'Vorname Nachname',
    description: args.description ?? niche?.description ?? '',
    generator: args.gen ?? niche?.generator ?? 'sudoku',
    difficulty: args.difficulty ?? niche?.difficulty ?? 'medium',
    pageCount: Number(args.pages ?? niche?.pageCount ?? 120),
    trim: args.trim ?? niche?.trim ?? '6x9',
    paper: args.paper ?? 'white',
    priceEur: Number(args.price ?? niche?.priceEur ?? 9.99),
    marketplace: args.marketplace ?? 'de',
    seed: args.seed ?? 'cli-1',
    nicheId: niche?.id ?? 'raetsel-senioren',
    coverStyle: args.style ?? 'navy',
    keywords: typeof args.keywords === 'string' ? args.keywords.split(',').map((k) => k.trim()) : [],
    categories: niche?.categories ?? ['Krimis & Rätsel > Rätsel'],
  };

  const validation = validateBookConfig(input);
  if (!validation.ok) {
    throw new Error(`Konfiguration ungültig:\n  - ${validation.errors.join('\n  - ')}`);
  }

  const config = validation.config;
  const plan = composeBook(config);
  const outDir = path.resolve(args.out ?? `./${slugify(config.title)}`);
  await mkdir(outDir, { recursive: true });

  console.log(`[1/5] Inhalt: ${plan.stats.pageCount} Seiten, ${plan.stats.puzzleCount || plan.stats.exerciseCount || plan.stats.journalEntries || 0} Einheiten`);

  const manuscript = await renderManuscriptPdf(plan);
  console.log('[2/5] Buchblock gesetzt');

  const cover = await renderCoverPdf(plan, { guides: Boolean(args.guides) });
  console.log('[3/5] Cover gesetzt');

  const manuscriptFlight = await preflightPdf(manuscript, { kind: 'manuscript', config: plan, expectedPages: config.pageCount });
  const coverFlight = await preflightPdf(cover, { kind: 'cover', config: plan });
  const compliance = complianceReport(config, plan);
  console.log(`[4/5] Preflight Buchblock: ${manuscriptFlight.status.toUpperCase()} (${manuscriptFlight.passed}/${manuscriptFlight.total}) · Cover: ${coverFlight.status.toUpperCase()}`);

  const base = slugify(config.title);
  const files = [];
  const write = async (name, data) => {
    const file = path.join(outDir, name);
    await writeFile(file, data);
    files.push(file);
    return file;
  };

  await write(`${base}_buchblock_${config.trim}.pdf`, manuscript);
  await write(`${base}_cover.pdf`, cover);

  if (!args['no-epub']) {
    const epub = buildEpub(plan);
    await write(`${base}_kindle.epub`, epub);
  }

  const metadata = {
    title: config.title,
    subtitle: config.subtitle || null,
    author: config.author,
    description: config.description || null,
    keywords: config.keywords,
    categories: config.categories,
    language: 'Deutsch',
    printOptions: {
      format: config.trim,
      interior: `Schwarzweiß auf ${config.paper === 'cream' ? 'cremefarbenem' : 'weißem'} Papier`,
      pageCount: plan.stats.pageCount,
      coverFinish: config.coverFinish ?? 'matt',
      bleed: 'Buchblock ohne Beschnitt, Cover mit 0,125 Zoll',
    },
    coverGeometry: {
      totalWidthIn: plan.cover.totalWidthIn,
      totalHeightIn: plan.cover.totalHeightIn,
      spineIn: plan.cover.spineIn,
    },
    pricing: {
      listPriceEur: plan.royalties.listPriceEur,
      printingCostEur: plan.royalties.printingCostEur,
      royaltyPerSaleEur: plan.royalties.payoutEur,
      minimumListPriceEur: plan.royalties.minimumListPriceEur,
      royaltyRate: plan.royalties.royaltyRate,
    },
  };

  await write(`${base}_kdp_metadaten.json`, JSON.stringify({ metadata, compliance, preflight: { manuscript: manuscriptFlight, cover: coverFlight } }, null, 2));
  const sheet = await renderMetadataSheet(plan, { metadata, compliance, preflight: manuscriptFlight });
  await write(`${base}_metadaten_arbeitsblatt.pdf`, sheet);
  await write(`${base}_report.txt`, renderReport({ config, plan, manuscriptFlight, coverFlight, compliance }));

  console.log(`[5/5] Fertig: ${files.length} Dateien in ${outDir}`);
  console.log(`      Tantieme: ${plan.royalties.payoutEur.toFixed(2)} EUR je Verkauf bei ${plan.royalties.listPriceEur.toFixed(2)} EUR (${Math.round(plan.royalties.royaltyRate * 100)} %)`);
  if (compliance.blockers.length) {
    console.log(`      ACHTUNG Compliance: ${compliance.blockers.join(' · ')}`);
  }
  if (manuscriptFlight.status === 'fail' || coverFlight.status === 'fail') {
    process.exitCode = 2;
    console.log('      Preflight enthält Fehler - siehe Report.');
  }
  for (const file of files) console.log(`      ${path.relative(process.cwd(), file)}`);
}

function renderReport({ config, plan, manuscriptFlight, coverFlight, compliance }) {
  const lines = [
    `Buchmaschine - Report für "${config.title}"`,
    `Erstellt: ${new Date().toISOString()}`,
    '',
    '--- Geometrie ---',
    `Format: ${config.trim} · Seiten: ${plan.stats.pageCount} · Papier: ${config.paper}`,
    `Rücken: ${plan.cover.spineIn} Zoll · Cover: ${plan.cover.totalWidthIn} × ${plan.cover.totalHeightIn} Zoll`,
    `Innenrand: ${plan.margins.insideIn} Zoll (KDP-Minimum ${plan.margins.gutterMinIn}) · Außen: ${plan.margins.outsideIn} Zoll`,
    '',
    '--- Kalkulation ---',
    `Listenpreis: ${plan.royalties.listPriceEur.toFixed(2)} EUR · Druckkosten: ${plan.royalties.printingCostEur.toFixed(2)} EUR`,
    `Tantiemensatz: ${Math.round(plan.royalties.royaltyRate * 100)} % · Tantieme: ${plan.royalties.payoutEur.toFixed(2)} EUR`,
    `Mindestpreis: ${plan.royalties.minimumListPriceEur.toFixed(2)} EUR`,
    `Hinweis: ${plan.royalties.recommendation}`,
    '',
    '--- Preflight Buchblock ---',
    ...manuscriptFlight.checks.map((check) => `${check.ok ? '[OK]  ' : '[!!]  '} ${check.id}: ${check.detail}`),
    '',
    '--- Preflight Cover ---',
    ...coverFlight.checks.map((check) => `${check.ok ? '[OK]  ' : '[!!]  '} ${check.id}: ${check.detail}`),
    '',
    '--- KI-Offenlegung ---',
    `${compliance.aiDisclosure.category}: ${compliance.aiDisclosure.answer}`,
    compliance.aiDisclosure.explanation,
    '',
    '--- Marken & Sprache ---',
    compliance.trademark.message,
    `Werbesprache: ${compliance.hype.hits.length ? compliance.hype.hits.join(', ') : 'keine Auffälligkeiten'}`,
    `Low-Content-Risiko: ${compliance.lowContent.level} (${compliance.lowContent.structuredPageShare}% strukturierte Seiten)`,
    ...compliance.lowContent.reasons.map((reason) => `  - ${reason}`),
    '',
    compliance.disclaimer,
  ];
  return lines.join('\n');
}

async function commandPreflight(args) {
  const trim = args.trim ?? '6x9';
  const paper = args.paper ?? 'white';
  const pageCount = Number(args.pages ?? 0);
  const { coverDimensions, interiorMargins } = await import('../server/lib/kdp.mjs');

  const results = [];
  if (args.manuscript) {
    const bytes = await loadPdfMagic(args.manuscript);
    const config = { trim, paper, pageCount, margins: pageCount ? interiorMargins({ pageCount, trim }) : undefined };
    results.push({ file: args.manuscript, result: await preflightPdf(bytes, { kind: 'manuscript', config, expectedPages: pageCount || undefined }) });
  }
  if (args.cover) {
    const bytes = await loadPdfMagic(args.cover);
    const config = { trim, paper, pageCount, cover: pageCount ? coverDimensions({ pageCount, trim, paper }) : undefined };
    results.push({ file: args.cover, result: await preflightPdf(bytes, { kind: 'cover', config }) });
  }
  if (!results.length) throw new Error('Bitte --manuscript <datei> und/oder --cover <datei> angeben.');

  let failed = false;
  for (const { file, result } of results) {
    console.log(`\n${file}: ${result.status.toUpperCase()} (${result.passed}/${result.total}) - ${result.summary}`);
    for (const check of result.checks) {
      console.log(`  ${check.ok ? 'OK ' : '!! '} ${check.id.padEnd(20)} ${check.detail}`);
    }
    if (result.status === 'fail') failed = true;
  }
  if (failed) process.exitCode = 1;
}

async function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  try {
    if (command === 'build') return await commandBuild(args);
    if (command === 'preflight') return await commandPreflight(args);
    if (command === 'niches') {
      for (const niche of listNiches()) {
        const sample = sampleTitleFor(niche.id);
        console.log(`${niche.id.padEnd(24)} ${niche.name}`);
        console.log(`${' '.repeat(24)} Chance ${niche.opportunity}/100 · ${niche.generatorLabel} · ${niche.trim} · ${niche.pageCount} Seiten · ${niche.priceEur} EUR`);
        console.log(`${' '.repeat(24)} Titelvorschlag: ${sample.title}`);
      }
      return undefined;
    }
    printHelp();
    return undefined;
  } catch (error) {
    console.error(`Fehler: ${error.message}`);
    process.exitCode = 1;
    return undefined;
  }
}

main();
