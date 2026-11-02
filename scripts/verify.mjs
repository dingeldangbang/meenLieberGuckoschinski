#!/usr/bin/env node
/**
 * Vollständige Abnahme in einem Lauf: `npm run verify`
 *
 * Prüft, was ein Nutzer tatsächlich merkt, und zwar in dieser Reihenfolge:
 *   1. Umgebung    – Node-Version, vorhandene Abhängigkeiten
 *   2. Syntax      – `node --check` über jede .mjs-Datei
 *   3. Tests       – komplette Suite über `npm test`
 *   4. Pipeline    – Harvest → Bau → Gate → ONIX (+ XSD) → DNB-Paket
 *   5. Server      – echter HTTP-Server auf freiem Port, alle API-Routen
 *   6. Bericht     – JSON + Klartext, Exit-Code 1 bei jedem Fehlschlag
 *
 * Es wird nichts vorgetäuscht: schlägt ein Schritt fehl, steht das im Bericht
 * und der Exit-Code ist 1. Fehlt ein optionaler Prüfbaustein (Schema-Validator
 * oder Netz), wird der Schritt als `skip` mit Begründung geführt, nicht als `ok`.
 */
import { spawn } from 'node:child_process';
import { readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts');
const REPORT_JSON = path.join(OUT_DIR, 'verify-report.json');

const results = [];
let currentStage = 'Umgebung';

function record(stage, name, status, detail = '') {
  results.push({ stage, name, status, detail });
  const mark = status === 'ok' ? 'ok  ' : status === 'skip' ? 'skip' : 'FAIL';
  process.stdout.write(`  ${mark} ${name}${detail ? ` – ${detail}` : ''}\n`);
}

function stage(name) {
  currentStage = name;
  process.stdout.write(`\n${name}\n`);
}

/** Startet einen Prozess und sammelt Ausgabe; löst nie, sondern liefert Code+AUsgabe. */
function runProcess(command, args, { cwd = ROOT, env = {}, timeoutMs = 600000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` });
    });
  });
}

const node = process.execPath;

/* ------------------------------ 1. Umgebung ------------------------------ */

async function checkEnvironment() {
  stage('1. Umgebung');
  const major = Number(process.versions.node.split('.')[0]);
  record(currentStage, `Node ${process.versions.node}`, major >= 20 ? 'ok' : 'fail', major >= 20 ? '>= 20 erfüllt' : 'Node >= 20 nötig');
  const modules = existsSync(path.join(ROOT, 'node_modules'));
  record(currentStage, 'Abhängigkeiten installiert', modules ? 'ok' : 'fail', modules ? 'node_modules vorhanden' : 'npm ci ausführen');
  return modules && major >= 20;
}

/* ------------------------------- 2. Syntax ------------------------------- */

async function listModules(dir, acc = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (['node_modules', '.git', 'artifacts', '.onix-schema'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listModules(full, acc);
    else if (entry.name.endsWith('.mjs')) acc.push(full);
  }
  return acc;
}

async function checkSyntax() {
  stage('2. Syntax');
  const files = await listModules(ROOT);
  let failed = 0;
  for (const file of files) {
    const { code, stderr } = await runProcess(node, ['--check', file], { timeoutMs: 30000 });
    if (code !== 0) {
      failed += 1;
      record(currentStage, path.relative(ROOT, file), 'fail', stderr.split('\n')[0]);
    }
  }
  if (!failed) record(currentStage, `${files.length} Module`, 'ok', 'node --check ohne Befund');
  return failed === 0;
}

/* -------------------------------- 3. Tests ------------------------------- */

async function checkTests() {
  stage('3. Testsuite');
  const { code, stdout, stderr } = await runProcess('npm', ['test']);
  const output = `${stdout}\n${stderr}`;
  const pass = Number(output.match(/^# pass (\d+)/m)?.[1] ?? 0);
  const fail = Number(output.match(/^# fail (\d+)/m)?.[1] ?? 0);
  const skipped = Number(output.match(/^# skipped (\d+)/m)?.[1] ?? 0);
  const total = Number(output.match(/^# tests (\d+)/m)?.[1] ?? 0);
  record(
    currentStage,
    `${pass}/${total} Tests grün`,
    code === 0 && fail === 0 ? 'ok' : 'fail',
    skipped ? `${skipped} übersprungen` : 'keine Fehlschläge',
  );
  return { ok: code === 0 && fail === 0, pass, fail, skipped, total };
}

/* ------------------------------ 4. Pipeline ------------------------------ */

const PIPELINE_CONFIG = {
  title: 'Abnahmetest Sudoku für Senioren',
  subtitle: '120 Rätsel in Großschrift',
  author: 'Abnahme Test',
  generator: 'sudoku',
  difficulty: 'medium',
  pageCount: 120,
  trim: '6x9',
  paper: 'white',
  priceEur: 9.99,
  seed: 'abnahme-2026',
  nicheId: 'raetsel-senioren',
  coverStyle: 'navy',
  coverFinish: 'matte',
  categories: ['Humor & Spiel', 'Rätsel & Quiz'],
  keywords: [],
  wordCategories: ['tiere', 'garten', 'kueche'],
  wordsPerPuzzle: 12,
  chapterLimit: 12,
};

async function checkPipeline() {
  stage('4. Pipeline');
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const harvest = await runProcess(node, ['scripts/harvest_keywords.mjs', '--offline', '--niche', 'raetsel-senioren', '--out', 'artifacts/metadata.json']);
  const metadataPath = path.join(OUT_DIR, 'metadata.json');
  const harvestOk = harvest.code === 0 && existsSync(metadataPath);
  record(currentStage, 'Nischen-Slots (offline)', harvestOk ? 'ok' : 'fail', harvestOk ? 'Fallback ohne Netz' : harvest.stderr.slice(0, 200));
  if (!harvestOk) return false;

  // Das geerntete Metadatenblatt mit festen Buchdaten überschreiben, damit der
  // Abnahmelauf deterministisch ist (kein Zufall bei Titel/Seed).
  const harvested = JSON.parse(await readFile(metadataPath, 'utf8'));
  const config = {
    ...PIPELINE_CONFIG,
    nicheId: harvested.niche?.id ?? PIPELINE_CONFIG.nicheId,
    keywords: (harvested.keywords ?? []).slice(0, 7).map((k) => (typeof k === 'string' ? k : k.keyword)).filter(Boolean),
    categories: harvested.categories ?? PIPELINE_CONFIG.categories,
  };
  await writeFile(metadataPath, `${JSON.stringify(config, null, 2)}\n`);

  const build = await runProcess(node, ['scripts/build_package.mjs', '--config', 'artifacts/metadata.json', '--out', 'artifacts']);
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  const manifestOk = build.code === 0 && existsSync(manifestPath);
  record(currentStage, 'Buchbau (Innenblock, Cover, Preflight)', manifestOk ? 'ok' : 'fail', manifestOk ? '' : build.stderr.slice(0, 300));
  if (!manifestOk) return false;

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const gate = await runProcess(node, ['scripts/preflight_checker.mjs', '--all', 'artifacts/manifest.json']);
  record(currentStage, 'Qualitäts-Gate auf den Bytes', gate.code === 0 ? 'ok' : 'fail', gate.code === 0 ? `pageCount=${manifest.pageCount}` : gate.stderr.slice(0, 300));

  // Die Dateinamen im Manifest sind absolut; genau diese Bytes müssen existieren.
  const artifactPaths = [manifest.files?.manuscript, manifest.files?.cover, manifest.files?.epub].filter(Boolean);
  if (artifactPaths.length !== 3) {
    record(currentStage, 'Manifest nennt alle drei Artefakte', 'fail', JSON.stringify(Object.keys(manifest)));
  }
  for (const candidate of artifactPaths) {
    const size = existsSync(candidate) ? (await readFile(candidate)).length : 0;
    record(
      currentStage,
      `Artefakt ${path.basename(candidate)}`,
      size > 0 ? 'ok' : 'fail',
      size ? `${size} B` : 'fehlt auf der Platte',
    );
  }

  const onix = await runProcess(node, ['scripts/onix.mjs', '--manifest', 'artifacts/manifest.json', '--isbn', '9783161484100', '--publisher', 'Abnahmeverlag', '--out', 'artifacts/onix3.xml']);
  const onixPath = path.join(OUT_DIR, 'onix3.xml');
  const onixOk = onix.code === 0 && existsSync(onixPath);
  record(currentStage, 'ONIX 3.0 erzeugt', onixOk ? 'ok' : 'fail', onixOk ? 'ISBN 9783161484100' : onix.stderr.slice(0, 300));

  if (onixOk) {
    const validation = await runProcess(node, ['scripts/validate_onix.mjs', '--file', 'artifacts/onix3.xml', '--schema-dir', '.onix-schema']);
    if (validation.code === 0) {
      const parsed = JSON.parse(validation.stdout.trim().split('\n').pop());
      record(currentStage, 'ONIX gegen XSD (ONIX 3.0 R1)', 'ok', `Validator: ${parsed.validator}`);
    } else if (validation.code === 3) {
      record(currentStage, 'ONIX gegen XSD (ONIX 3.0 R1)', 'skip', 'kein Validator installiert (xmllint oder python3-lxml)');
    } else {
      record(currentStage, 'ONIX gegen XSD (ONIX 3.0 R1)', 'fail', validation.stderr.trim().split('\n').slice(-3).join(' | '));
    }
  }

  const dnb = await runProcess(node, ['scripts/legal_deposit.mjs', '--manifest', 'artifacts/manifest.json', '--out', 'artifacts/dnb', '--publisher', 'Abnahmeverlag', '--isbn', '9783161484100']);
  const dnbFiles = existsSync(path.join(OUT_DIR, 'dnb')) ? await readdir(path.join(OUT_DIR, 'dnb')) : [];
  record(currentStage, 'DNB-Pflichtexemplar-Paket', dnb.code === 0 && dnbFiles.length > 0 ? 'ok' : 'fail', dnbFiles.join(', ') || dnb.stderr.slice(0, 200));

  return !results.some((r) => r.status === 'fail');
}

/* ------------------------------- 5. Server ------------------------------- */

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const reachable = await new Promise((resolve) => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (reachable) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function checkServer() {
  stage('5. HTTP-Server');
  const port = await freePort();
  const child = spawn(node, ['server/index.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => {
    log += chunk;
  });
  child.stderr.on('data', (chunk) => {
    log += chunk;
  });

  try {
    if (!(await waitForServer(port))) {
      record(currentStage, 'Serverstart', 'fail', log.slice(0, 300));
      return false;
    }
    const base = `http://127.0.0.1:${port}`;
    record(currentStage, 'Serverstart', 'ok', `Port ${port}`);

    const config = { ...PIPELINE_CONFIG };
    const json = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    const checks = [
      ['GET', '/', null, 'text/html'],
      ['GET', '/app.js', null, 'javascript'],
      ['GET', '/api/health', null, 'json'],
      ['GET', '/api/catalog', null, 'json'],
      ['GET', '/api/niches', null, 'json'],
      ['GET', '/api/pricing?pages=120&trim=6x9&paper=white', null, 'json'],
      ['GET', '/api/bsr?rank=50000', null, 'json'],
      ['POST', '/api/preview', { config }, 'json'],
      ['POST', '/api/compliance', { config }, 'json'],
      ['POST', '/api/export/manuscript.pdf', { config }, 'pdf'],
      ['POST', '/api/export/cover.pdf', { config }, 'pdf'],
      ['POST', '/api/export/ebook.epub', { config }, 'epub'],
      ['POST', '/api/export/metadata.json', { config }, 'json'],
      ['POST', '/api/export/metadata-sheet.pdf', { config }, 'pdf'],
      ['POST', '/api/preflight', { config }, 'json'],
      ['POST', '/api/preflight?kind=cover', { config }, 'json'],
      ['GET', '/api/dashboard', null, 'json'],
      ['GET', '/api/projects', null, 'json'],
    ];

    for (const [method, route, body, expect] of checks) {
      let status = 0;
      let bytes = 0;
      let head = '';
      try {
        const response = await fetch(base + route, method === 'GET' ? { method } : json(body));
        status = response.status;
        const buffer = Buffer.from(await response.arrayBuffer());
        bytes = buffer.length;
        head = buffer.subarray(0, 5).toString('latin1');
      } catch (error) {
        head = error.message;
      }
      const signatureOk =
        expect === 'pdf' ? head.startsWith('%PDF') : expect === 'epub' ? head.startsWith('PK') : true;
      const ok = status === 200 && bytes > 0 && signatureOk;
      record(currentStage, `${method} ${route.split('?')[0]}`, ok ? 'ok' : 'fail', `${status} · ${bytes} B`);
    }
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (!child.killed) child.kill('SIGKILL');
  }

  return !results.some((r) => r.status === 'fail');
}

/* -------------------------------- Bericht -------------------------------- */

async function writeReport(meta) {
  stage('6. Bericht');
  const fails = results.filter((r) => r.status === 'fail');
  const skips = results.filter((r) => r.status === 'skip');
  const summary = {
    generatedAt: new Date().toISOString(),
    node: process.versions.node,
    platform: `${process.platform}/${process.arch}`,
    ...meta,
    totals: {
      checks: results.length,
      ok: results.filter((r) => r.status === 'ok').length,
      skipped: skips.length,
      failed: fails.length,
    },
    results,
  };
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(REPORT_JSON, `${JSON.stringify(summary, null, 2)}\n`);
  record(currentStage, 'Bericht geschrieben', 'ok', path.relative(ROOT, REPORT_JSON));
  process.stdout.write(
    `\nGesamt: ${summary.totals.ok} ok · ${summary.totals.skipped} übersprungen · ${summary.totals.failed} Fehler\n`,
  );
  if (skips.length) {
    process.stdout.write('Übersprungen (mit Grund):\n');
    for (const skip of skips) process.stdout.write(`  - ${skip.name}: ${skip.detail}\n`);
  }
  if (fails.length) {
    process.stdout.write('Fehlgeschlagen:\n');
    for (const fail of fails) process.stdout.write(`  - ${fail.stage} / ${fail.name}: ${fail.detail}\n`);
  }
  return fails.length === 0;
}

async function main() {
  process.stdout.write('Buchmaschine – Abnahmelauf\n');
  process.stdout.write(`Wurzel: ${ROOT}\n`);

  const envOk = await checkEnvironment();
  if (!envOk) {
    await writeReport({});
    return 1;
  }
  await checkSyntax();
  const tests = await checkTests();
  await checkPipeline();
  await checkServer();
  const clean = await writeReport({ tests });
  return clean ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch(async (error) => {
    process.stderr.write(`verify abgebrochen: ${error.stack ?? error.message}\n`);
    await writeReport({ aborted: error.message }).catch(() => {});
    process.exitCode = 1;
  });
