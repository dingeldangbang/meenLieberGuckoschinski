import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PDFDocument } from 'pdf-lib';

import { auditCover, enforceParity, expectedCoverGeometry } from '../scripts/lib/gates.mjs';
import { assembleSlots, harvestMetadata, pickNicheForDate, KDP_KEYWORD_MAX_LENGTH, KDP_KEYWORD_SLOTS } from '../scripts/harvest_keywords.mjs';
import { DeployError, deploy, findProductByName } from '../scripts/deploy_digital.mjs';
import { buildPackage } from '../scripts/build_package.mjs';
import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';
import { renderCoverPdf } from '../server/lib/pdf/cover.mjs';

const tmp = await mkdtemp(path.join(tmpdir(), 'pipeline-test-'));

async function pdfWithPages(count, { width = 432, height = 648 } = {}) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i += 1) doc.addPage([width, height]);
  return doc.save();
}

/* --------------------------- Gate 1: Parität ----------------------------- */

test('Paritäts-Gate lässt gerade Seitenzahlen unangetastet', async () => {
  const bytes = await pdfWithPages(48);
  const result = await enforceParity(bytes);
  assert.equal(result.pageCount, 48);
  assert.equal(result.repaired, false);
  assert.equal(result.bytes, bytes, 'ohne Reparatur müssen dieselben Bytes zurückkommen');
});

test('Paritäts-Gate hängt bei ungerader Seitenzahl genau eine Vakatseite an', async () => {
  const bytes = await pdfWithPages(47);
  const result = await enforceParity(bytes);
  assert.equal(result.repaired, true);
  assert.equal(result.pageCount, 48);

  const doc = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert.equal(doc.getPageCount(), 48);
  const last = doc.getPage(47).getSize();
  assert.equal(last.width, 432, 'Vakatseite übernimmt das Format der letzten Seite');
  assert.equal(last.height, 648);
});

test('Paritäts-Gate ist idempotent: zweiter Lauf hängt nichts an', async () => {
  const first = await enforceParity(await pdfWithPages(47));
  const second = await enforceParity(first.bytes);
  assert.equal(second.pageCount, 48);
  assert.equal(second.repaired, false);
});

test('Paritäts-Gate repariert auch ein einseitiges PDF', async () => {
  // pdf-lib legt bei create() automatisch eine Seite an – genau der Fall,
  // in dem ein einzelnes Deckblatt ohne Innenleben entsteht.
  const doc = await PDFDocument.create();
  const bytes = await doc.save();
  const result = await enforceParity(bytes);
  assert.equal(result.repaired, true);
  assert.equal(result.pageCount, 2);
});

/* ----------------------- Gate 2: Cover-Geometrie ------------------------- */

test('Sollmaß des Covers folgt der KDP-Formel: 2 × Trim + Rücken + 2 × Beschnitt', () => {
  const geometry = expectedCoverGeometry({ pageCount: 134, trim: '6x9', paper: 'white' });
  assert.equal(geometry.spineIn, 0.3018);
  assert.equal(geometry.widthIn, 12.5518);
  assert.equal(geometry.heightIn, 9.25);
  assert.equal(geometry.widthIn, geometry.formulaWidthIn);
  assert.equal(geometry.heightIn, geometry.formulaHeightIn);
  assert.equal(geometry.widthPt, 903.73);
  assert.equal(geometry.heightPt, 666);
});

test('Cover-Audit besteht bei einem echten Renderer-Cover', async () => {
  const config = validateBookConfig({
    title: 'Cover Audit',
    author: 'Test',
    generator: 'sudoku',
    pageCount: 200,
    trim: '6x9',
  }).config;
  const plan = composeBook(config);
  const cover = await renderCoverPdf(plan);
  const audit = await auditCover({ bytes: cover, pageCount: 200, trim: '6x9', paper: 'white' });

  assert.equal(audit.ok, true, audit.summary);
  assert.ok(audit.checks.some((check) => check.id === 'canvas' && check.ok));
  assert.ok(audit.checks.some((check) => check.id === 'barcode-zone' && check.ok));
  assert.ok(audit.checks.some((check) => check.id === 'spine-text' && check.ok));
});

test('Cover-Audit schlägt bei Drift über einem PostScript-Punkt fehl', async () => {
  // Buchblockmaß als "Cover" deklarieren: 639 pt statt ~890 pt Breite.
  const bytes = await pdfWithPages(1, { width: 432, height: 648 });
  const audit = await auditCover({ bytes, pageCount: 60, trim: '6x9', paper: 'white' });
  assert.equal(audit.ok, false);
  const canvas = audit.checks.find((check) => check.id === 'canvas');
  assert.equal(canvas.ok, false);
  assert.match(canvas.detail, /Drift/);
});

test('Cover-Audit erkennt einen mehrseitigen "Vollumschlag"', async () => {
  const bytes = await pdfWithPages(2, { width: 890, height: 666 });
  const audit = await auditCover({ bytes, pageCount: 60 });
  assert.equal(audit.ok, false);
  assert.equal(audit.checks.find((check) => check.id === 'single-page').ok, false);
});

/* ------------------------- Ingestion: Keywords --------------------------- */

test('Keyword-Slots halten die KDP-Grenzen ein', () => {
  const candidates = [
    'rätselbuch für senioren',
    'Rätselbuch für Senioren',              // Dublette, andere Schreibweise
    'su',                                   // zu kurz
    'x'.repeat(KDP_KEYWORD_MAX_LENGTH + 1), // zu lang
    'sudoku großdruck',
  ];
  const slots = assembleSlots(candidates);
  assert.ok(slots.length <= KDP_KEYWORD_SLOTS);
  assert.equal(slots.includes('sudoku großdruck'), true);
  assert.ok(slots.every((slot) => slot.length <= KDP_KEYWORD_MAX_LENGTH));
  assert.equal(slots.filter((slot) => slot.toLowerCase() === 'rätselbuch für senioren').length, 1);
});

test('Keyword-Slots bevorzugen Longtail-Phrasen', () => {
  const slots = assembleSlots(['sudoku', 'sudoku großdruck für senioren', 'rätsel', 'rätselbuch mit lösungen']);
  assert.equal(slots[0], 'sudoku großdruck für senioren');
  assert.equal(slots.length, 4);
});

test('Keyword-Slots respektieren ein eigenes Limit', () => {
  const slots = assembleSlots(['alpha eins', 'beta zwei', 'gamma drei', 'delta vier'], { limit: 2 });
  assert.equal(slots.length, 2);
});

test('Nischenwahl aus dem Datum ist deterministisch und wechselt', () => {
  const first = pickNicheForDate('2026-11-02');
  assert.equal(pickNicheForDate('2026-11-02').id, first.id);
  assert.ok(first.id && first.name);
  const ids = new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((date) => pickNicheForDate(date).id));
  assert.ok(ids.size > 1, 'aufeinanderfolgende Tage sollen unterschiedliche Nischen liefern');
  assert.throws(() => pickNicheForDate('kein-datum'), /Datum/);
});

test('Offline-Harvest erzeugt eine gültige Buchkonfiguration samt Herkunft', async () => {
  const { config, provenance } = await harvestMetadata({ date: '2026-11-02', offline: true });
  const validation = validateBookConfig(config);
  assert.equal(validation.ok, true, validation.errors?.join(', '));
  assert.equal(provenance.keywordSource, 'offline');
  assert.equal(provenance.liveTerms, 0);
  assert.ok(validation.config.keywords.length >= 3);
  assert.ok(validation.config.keywords.length <= 7);
});

test('Harvest meldet unbekannte Nischen mit Liste der bekannten', async () => {
  await assert.rejects(
    () => harvestMetadata({ date: '2026-11-02', offline: true, nicheId: 'gibtsnicht' }),
    /Unbekannte Nische/,
  );
});

/* ---------------------------- Paketbau ----------------------------------- */

test('Paketbau erzeugt alle Dateien und ein freigabefähiges Manifest', async () => {
  const outDir = path.join(tmp, 'paket');
  const result = await buildPackage(
    {
      title: 'Pipeline Paket',
      author: 'Test Autorin',
      description: 'Eine ausreichend lange Beschreibung für die Pipeline-Prüfung mit mehr als einhundertzwanzig Zeichen Inhalt.',
      generator: 'sudoku',
      pageCount: 48,
      trim: '6x9',
      priceEur: 9.99,
      seed: 'pipeline',
      keywords: ['rätselbuch senioren', 'sudoku großdruck', 'geschenk oma'],
    },
    { outDir, epub: true, provenance: { nicheId: 'raetsel-senioren' } },
  );

  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.ok, true, JSON.stringify(manifest.compliance));
  assert.equal(manifest.pageCount, 48);
  assert.equal(manifest.parityRepaired, false);
  assert.equal(manifest.coverAudit.ok, true);
  assert.equal(manifest.files.manuscript.endsWith('.pdf'), true);
  assert.equal(manifest.files.cover.endsWith('.pdf'), true);
  assert.equal(manifest.files.epub.endsWith('.epub'), true);
  assert.equal(manifest.provenance.nicheId, 'raetsel-senioren');

  const manuscript = await readFile(manifest.files.manuscript);
  assert.equal(manuscript.subarray(0, 5).toString(), '%PDF-');
  const coverBytes = await readFile(manifest.files.cover);
  const audit = await auditCover({ bytes: coverBytes, pageCount: 48, trim: '6x9', paper: 'white' });
  assert.equal(audit.ok, true);
});

/* ------------------------------ Deployer --------------------------------- */

function manifestFixture(overrides = {}) {
  return {
    schemaVersion: 1,
    ok: true,
    title: 'Pipeline Paket',
    subtitle: 'Untertitel',
    description: 'Beschreibung',
    priceEur: 9.99,
    pageCount: 48,
    files: { manuscript: path.join(tmp, 'paket', 'buchblock.pdf') },
    ...overrides,
  };
}

/** Minimale Gumroad-Attrappe: hält Produkte im Speicher und prüft Auth. */
function fakeGumroad({ products = [], failUpload = null, requireToken = 't' } = {}) {
  const calls = [];
  const store = [...products];
  const fetchImpl = async (url, init = {}) => {
    // Presigned S3-URLs gehören nicht zur Gumroad-API und tragen keinen Token.
    if (url.startsWith('https://s3.example/')) {
      calls.push({ method: init.method ?? 'PUT', endpoint: url });
      return { ok: true, status: 200, text: async () => '' };
    }
    const method = init.method ?? 'GET';
    const endpoint = url.replace('https://api.gumroad.com/v2', '');
    calls.push({ method, endpoint, auth: init.headers?.Authorization });
    const json = (status, body) => ({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    });

    if (init.headers?.Authorization !== `Bearer ${requireToken}`) {
      return json(401, { success: false, message: 'Bad access token' });
    }
    if (method === 'GET' && endpoint === '/products') {
      return json(200, { success: true, products: store });
    }
    if (method === 'POST' && endpoint === '/products') {
      const product = { id: `prod-${store.length + 1}`, short_url: 'https://gum.co/test', name: 'neu' };
      store.push(product);
      return json(200, { success: true, product });
    }
    if (method === 'POST' && /^\/products\/[^/]+\/product_files$/.test(endpoint)) {
      if (failUpload) return json(failUpload, { success: false, message: 'nicht unterstützt' });
      return json(200, { success: true, product_file: { id: 'file-1' } });
    }
    if (method === 'POST' && endpoint === '/files/presign') {
      return json(200, {
        success: true,
        file_url: 'https://s3.example/datei.pdf',
        parts: [{ part_number: 1, presigned_url: 'https://s3.example/part-1' }],
      });
    }
    if (method === 'PUT' && /^\/products\/[^/]+$/.test(endpoint)) {
      return json(200, { success: true, product: store[0] ?? { id: 'prod-1' } });
    }
    return json(404, { success: false, message: 'unbekannter Endpunkt' });
  };
  return { fetchImpl, calls, store };
}

async function prepareManifest(overrides) {
  const dir = path.join(tmp, 'deploy');
  await import('node:fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
  const bytes = await pdfWithPages(2);
  const file = path.join(dir, 'buchblock.pdf');
  await writeFile(file, bytes);
  const manifest = manifestFixture({ files: { manuscript: file }, ...overrides });
  return { dir, manifest };
}

test('Deployer veröffentlicht nicht, wenn das Manifest nicht freigabefähig ist', async () => {
  const { dir, manifest } = await prepareManifest({ ok: false, coverAudit: { summary: 'Drift 3 pt' } });
  await assert.rejects(
    () => deploy({ manifest, manifestDir: dir, token: 't' }),
    (error) => error instanceof DeployError && /nicht freigabefähig/.test(error.message),
  );
});

test('Deployer bricht ohne Token mit sprechender Meldung ab', async () => {
  const { dir, manifest } = await prepareManifest();
  await assert.rejects(() => deploy({ manifest, manifestDir: dir, token: '' }), /GUMROAD_TOKEN/);
});

test('Deployer legt ein neues Produkt an, lädt die Datei hoch und veröffentlicht', async () => {
  const { dir, manifest } = await prepareManifest();
  const { fetchImpl, calls } = fakeGumroad();
  const result = await deploy({ manifest, manifestDir: dir, token: 't', fetchImpl });

  assert.equal(result.action, 'created');
  assert.equal(result.productId, 'prod-1');
  assert.equal(result.published, true);
  assert.equal(result.fileBytes > 0, true);
  assert.ok(calls.some((call) => call.method === 'POST' && call.endpoint === '/products'));
  assert.ok(calls.some((call) => call.endpoint === '/products/prod-1/product_files'));
  assert.ok(calls.some((call) => call.method === 'PUT' && call.endpoint === '/products/prod-1'));
});

test('Deployer aktualisiert ein vorhandenes Produkt statt zu duplizieren', async () => {
  const { dir, manifest } = await prepareManifest();
  const { fetchImpl, calls } = fakeGumroad({ products: [{ id: 'prod-7', name: manifest.title }] });
  const result = await deploy({ manifest, manifestDir: dir, token: 't', fetchImpl });

  assert.equal(result.action, 'updated');
  assert.equal(result.productId, 'prod-7');
  assert.equal(calls.filter((call) => call.method === 'POST' && call.endpoint === '/products').length, 0);
});

test('Deployer fällt auf den Presign-Flow zurück, wenn der Multipart-Upload fehlt', async () => {
  const { dir, manifest } = await prepareManifest();
  const { fetchImpl, calls } = fakeGumroad({ failUpload: 404 });
  const result = await deploy({ manifest, manifestDir: dir, token: 't', fetchImpl });

  assert.equal(result.strategy, 'presign');
  assert.ok(calls.some((call) => call.endpoint === '/files/presign'));
});

test('Deployer reicht Gumroad-Fehler mit Statuscode weiter und loggt kein Token', async () => {
  const { dir, manifest } = await prepareManifest();
  const { fetchImpl } = fakeGumroad({ requireToken: 'richtig' });
  await assert.rejects(
    () => deploy({ manifest, manifestDir: dir, token: 'falsch', fetchImpl }),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.message.includes('falsch'), false, 'Token darf nie in der Meldung stehen');
      return true;
    },
  );
});

test('findProductByName vergleicht exakt und liefert null', async () => {
  const { fetchImpl } = fakeGumroad({ products: [{ id: 'prod-1', name: 'Anderes Buch' }] });
  assert.equal(await findProductByName('Pipeline Paket', { token: 't', fetchImpl }), null);
  const hit = await findProductByName('Anderes Buch', { token: 't', fetchImpl });
  assert.equal(hit.id, 'prod-1');
});
