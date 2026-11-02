#!/usr/bin/env node
/**
 * Baut ein vollständiges, druckfertiges KDP-Paket und führt dabei beide
 * SRE-Qualitäts-Gates aus.
 *
 *   node scripts/build_package.mjs --config artifacts/metadata.json --out artifacts
 *   node scripts/build_package.mjs --niche raetsel-senioren --pages 134 --out artifacts
 *
 * Das Skript ist die einzige Stelle, die Buchblock und Cover zusammen erzeugt:
 * erst der Buchblock, dann die Paritäts-Korrektur, dann das Cover mit der
 * *korrigierten* Seitenzahl. Genau diese Reihenfolge verhindert den klassischen
 * Fehler, dass Cover und Innenleben mit unterschiedlichen Seitenzahlen rechnen.
 *
 * Ergebnis: Dateien in `--out` plus `manifest.json`, das der Deployer liest.
 * Exit-Code 2, wenn ein Gate oder der Preflight Fehler meldet.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';
import { renderManuscriptPdf } from '../server/lib/pdf/manuscript.mjs';
import { renderCoverPdf } from '../server/lib/pdf/cover.mjs';
import { renderMetadataSheet } from '../server/lib/pdf/metadata-sheet.mjs';
import { buildEpub } from '../server/lib/epub.mjs';
import { preflightPdf } from '../server/lib/preflight.mjs';
import { complianceReport } from '../server/lib/policy.mjs';
import { enforceParity, auditCover, expectedCoverGeometry } from './lib/gates.mjs';

/** Dateiname aus dem Titel – identisch zur Logik der CLI. */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'buch';
}

function metadataFrom(config, plan) {
  return {
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
}

function renderReport({ config, plan, manuscriptFlight, coverFlight, compliance, parity, coverAudit }) {
  const line = (check) => `${check.ok ? '[OK]  ' : '[!!]  '} ${check.id}: ${check.detail}`;
  return [
    `Buchmaschine - Report für "${config.title}"`,
    `Erstellt: ${new Date().toISOString()}`,
    '',
    '--- Geometrie ---',
    `Format: ${config.trim} · Seiten: ${plan.stats.pageCount} · Papier: ${config.paper}`,
    `Rücken: ${plan.cover.spineIn} Zoll · Cover: ${plan.cover.totalWidthIn} × ${plan.cover.totalHeightIn} Zoll`,
    `Innenrand: ${plan.margins.insideIn} Zoll (KDP-Minimum ${plan.margins.gutterMinIn}) · Außen: ${plan.margins.outsideIn} Zoll`,
    `Paritäts-Gate: ${parity.repaired ? 'Vakatseite ergänzt' : 'Seitenzahl bereits gerade'} (${parity.pageCount} Seiten)`,
    '',
    '--- Kalkulation ---',
    `Listenpreis: ${plan.royalties.listPriceEur.toFixed(2)} EUR · Druckkosten: ${plan.royalties.printingCostEur.toFixed(2)} EUR`,
    `Tantiemensatz: ${Math.round(plan.royalties.royaltyRate * 100)} % · Tantieme: ${plan.royalties.payoutEur.toFixed(2)} EUR`,
    `Mindestpreis: ${plan.royalties.minimumListPriceEur.toFixed(2)} EUR`,
    `Hinweis: ${plan.royalties.recommendation}`,
    '',
    '--- Gate 2: Cover-Geometrie (Toleranz 1 pt) ---',
    ...coverAudit.checks.map(line),
    '',
    '--- Preflight Buchblock ---',
    ...manuscriptFlight.checks.map(line),
    '',
    '--- Preflight Cover ---',
    ...coverFlight.checks.map(line),
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
  ].join('\n');
}

/**
 * Erzeugt das komplette Paket.
 *
 * @param {object} input Buch-Konfiguration (wie beim API-Endpunkt `/api/preview`)
 * @param {{outDir?:string, epub?:boolean, guides?:boolean, provenance?:object}} options
 */
export async function buildPackage(input, options = {}) {
  const validation = validateBookConfig(input);
  if (!validation.ok) {
    throw new Error(`Konfiguration ungültig:\n  - ${validation.errors.join('\n  - ')}`);
  }

  let config = validation.config;
  const outDir = path.resolve(options.outDir ?? 'artifacts');
  await mkdir(outDir, { recursive: true });

  /* ------------------------- Gate 1: Buchblock bauen ----------------------- */
  let plan = composeBook(config);
  let manuscript = await renderManuscriptPdf(plan);
  let parity = await enforceParity(manuscript);

  if (parity.repaired) {
    // Die Vakatseite verändert die Seitenzahl – Inhalt und Cover neu ableiten,
    // damit beide mit derselben Zahl rechnen.
    config = { ...config, pageCount: parity.pageCount };
    plan = composeBook(config);
    manuscript = await renderManuscriptPdf(plan);
    parity = await enforceParity(manuscript);
    if (parity.repaired) {
      throw new Error('Paritäts-Gate konnte die Seitenzahl nicht auf einen geraden Wert bringen.');
    }
  }

  const pageCount = parity.pageCount;

  /* --------------------------- Gate 2: Cover ------------------------------- */
  const cover = await renderCoverPdf(plan, { guides: Boolean(options.guides) });
  const coverAudit = await auditCover({
    bytes: cover,
    pageCount,
    trim: config.trim,
    paper: config.paper,
  });

  /* ------------------------- Fachlicher Preflight -------------------------- */
  const manuscriptFlight = await preflightPdf(manuscript, {
    kind: 'manuscript',
    config: plan,
    expectedPages: pageCount,
  });
  const coverFlight = await preflightPdf(cover, { kind: 'cover', config: plan });
  const compliance = complianceReport(config, plan);

  /* ------------------------------ Dateien --------------------------------- */
  const base = slugify(config.title);
  const files = {};
  const write = async (key, name, data) => {
    const file = path.join(outDir, name);
    await writeFile(file, data);
    files[key] = file;
    return file;
  };

  await write('manuscript', `${base}_buchblock_${config.trim}.pdf`, manuscript);
  await write('cover', `${base}_cover.pdf`, cover);
  if (options.epub !== false) {
    await write('epub', `${base}_kindle.epub`, buildEpub(plan));
  }

  const metadata = metadataFrom(config, plan);
  const sheet = await renderMetadataSheet(plan, { metadata, compliance, preflight: manuscriptFlight });
  await write('sheet', `${base}_metadaten_arbeitsblatt.pdf`, sheet);
  await write(
    'metadataJson',
    `${base}_kdp_metadaten.json`,
    JSON.stringify({ metadata, compliance, preflight: { manuscript: manuscriptFlight, cover: coverFlight } }, null, 2),
  );
  await write(
    'report',
    `${base}_report.txt`,
    renderReport({ config, plan, manuscriptFlight, coverFlight, compliance, parity, coverAudit }),
  );

  /* ------------------------------ Manifest -------------------------------- */
  const gateFailures = [...coverAudit.checks.filter((entry) => !entry.ok)];
  const preflightFailures = [...manuscriptFlight.checks, ...coverFlight.checks].filter(
    (entry) => !entry.ok && entry.level !== 'warn',
  );
  const ok = gateFailures.length === 0 && preflightFailures.length === 0 && compliance.blockers.length === 0;

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provenance: options.provenance ?? {},
    ok,
    title: config.title,
    subtitle: config.subtitle || null,
    author: config.author,
    description: config.description || null,
    keywords: config.keywords,
    categories: config.categories,
    priceEur: config.priceEur,
    pageCount,
    parityRepaired: parity.repaired,
    geometry: expectedCoverGeometry({ pageCount, trim: config.trim, paper: config.paper }),
    coverAudit: { ok: coverAudit.ok, summary: coverAudit.summary },
    preflight: {
      manuscript: manuscriptFlight.status,
      cover: coverFlight.status,
    },
    compliance: {
      status: compliance.status,
      blockers: compliance.blockers,
      aiDisclosure: compliance.aiDisclosure.category,
    },
    files,
  };

  const manifestPath = await write('manifest', 'manifest.json', JSON.stringify(manifest, null, 2));

  return { manifest, manifestPath, plan, config, files, coverAudit, manuscriptFlight, coverFlight, compliance };
}

/* --------------------------------- CLI ----------------------------------- */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let input;

  if (args.config) {
    input = JSON.parse(await readFile(path.resolve(args.config), 'utf8'));
  } else {
    input = {
      title: args.title,
      subtitle: args.subtitle,
      author: args.author,
      description: args.description,
      generator: args.gen ?? 'sudoku',
      pageCount: Number(args.pages ?? 120),
      trim: args.trim ?? '6x9',
      paper: args.paper ?? 'white',
      priceEur: Number(args.price ?? 9.99),
      seed: args.seed ?? 'pipeline-1',
      keywords: typeof args.keywords === 'string' ? args.keywords.split(',').map((entry) => entry.trim()) : [],
    };
  }

  const result = await buildPackage(input, {
    outDir: args.out ?? 'artifacts',
    epub: !args['no-epub'],
    guides: Boolean(args.guides),
  });

  const { manifest } = result;
  console.log(`Buchblock: ${manifest.pageCount} Seiten · Parität: ${manifest.parityRepaired ? 'korrigiert' : 'ok'}`);
  console.log(`Cover: ${manifest.geometry.widthIn}" × ${manifest.geometry.heightIn}" · Rücken ${manifest.geometry.spineIn}"`);
  console.log(`Gate 2 (Cover): ${manifest.coverAudit.ok ? 'PASS' : 'FAIL'} – ${manifest.coverAudit.summary}`);
  console.log(`Preflight: Buchblock ${manifest.preflight.manuscript.toUpperCase()} · Cover ${manifest.preflight.cover.toUpperCase()}`);
  console.log(`Compliance: ${manifest.compliance.status.toUpperCase()}${manifest.compliance.blockers.length ? ` (${manifest.compliance.blockers.join(' · ')})` : ''}`);
  console.log(`Tantieme: ${result.plan.royalties.payoutEur.toFixed(2)} EUR je Verkauf`);
  for (const [key, file] of Object.entries(manifest.files)) {
    console.log(`  ${key.padEnd(13)} ${path.relative(process.cwd(), file)}`);
  }

  if (!manifest.ok) {
    console.error('Paket nicht freigabefähig – siehe Report.');
    process.exitCode = 2;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`Fehler: ${error.message}`);
    process.exitCode = 1;
  });
}
