import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'buchmaschine-test-'));
process.env.BUCHMASCHINE_DATA_DIR = dataDir;

const { createServer, slugify } = await import('../server/index.mjs');

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => new Promise((resolve) => server.close(resolve)));

const config = {
  title: 'Wortsuche für Weltentdecker',
  subtitle: 'Rätselblock ab 8 Jahren',
  author: 'Test Autor',
  description: 'Beschreibung für den Test.',
  generator: 'wordsearch',
  pageCount: 48,
  trim: '6x9',
  priceEur: 7.99,
  seed: 'api-test',
  keywords: ['rätselbuch kinder', 'wortsuche kinder'],
};

async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('Health-Endpunkt antwortet', async () => {
  const response = await fetch(`${base}/api/health`);
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'ok');
});

test('Katalog liefert Formate, Generatoren und Wortlisten', async () => {
  const data = await (await fetch(`${base}/api/catalog`)).json();
  assert.ok(data.trims['6x9']);
  assert.ok(data.generators.sudoku);
  assert.ok(data.wordsets.length >= 8);
  assert.ok(Object.keys(data.coverStyles).length >= 6);
});

test('Nischen-Liste enthält Chancen-Score und Titelvorschlag', async () => {
  const { niches } = await (await fetch(`${base}/api/niches`)).json();
  assert.ok(niches.length >= 6);
  for (const niche of niches) {
    assert.ok(niche.opportunity >= 0 && niche.opportunity <= 100);
    assert.ok(niche.sample.title.length > 0);
    assert.ok(niche.keywords.length >= 5);
  }
});

test('Keyword-Werkstatt erzeugt sortierte Longtail-Vorschläge', async () => {
  const data = await (await post('/api/keywords', { seed: 'rätselbuch für senioren', nicheId: 'raetsel-senioren' })).json();
  assert.ok(data.ideas.length > 5);
  assert.ok(data.curated.length >= 5);
  for (let i = 1; i < data.ideas.length; i += 1) {
    assert.ok(data.ideas[i - 1].score >= data.ideas[i].score, 'nicht absteigend sortiert');
  }
  assert.ok(data.ideas.some((idea) => idea.longtail));
});

test('Vorschau liefert Seitenplan, Cover und Tantieme', async () => {
  const response = await post('/api/preview', { config });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.pageCount, 48);
  assert.equal(data.pages.length, 48);
  assert.equal(data.sample.kind, 'wordsearch');
  assert.ok(data.cover.spineIn > 0.1);
  assert.ok(data.royalties.payoutEur > 0);
  assert.ok(data.priceLadder.prices.length > 0);
  assert.ok(data.backCoverBullets.length >= 2);
});

test('Ungültige Konfiguration liefert 400 mit Begründung', async () => {
  const response = await post('/api/preview', { config: { ...config, pageCount: 5 } });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.ok(data.details.some((d) => d.includes('Seitenzahl')));
});

test('Ungültiges JSON liefert 400', async () => {
  const response = await fetch(`${base}/api/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{kaputt',
  });
  assert.equal(response.status, 400);
});

test('Buchblock-Export liefert PDF mit sprechendem Dateinamen', async () => {
  const response = await post('/api/export/manuscript.pdf', { config });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.match(response.headers.get('content-disposition'), /wortsuche-fuer-weltentdecker_buchblock_6x9\.pdf/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
});

test('Cover-Export funktioniert mit und ohne Hilfslinien', async () => {
  for (const suffix of ['', '?guides=1']) {
    const response = await post(`/api/export/cover.pdf${suffix}`, { config });
    assert.equal(response.status, 200);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.ok(bytes.length > 1500);
  }
});

test('Metadaten-Export enthält KDP-Felder und Copy-Paste-Text', async () => {
  const data = await (await post('/api/export/metadata.json', { config })).json();
  assert.equal(data.metadata.title, config.title);
  assert.equal(data.metadata.language, 'Deutsch');
  assert.equal(data.metadata.keywords.length, 2);
  assert.ok(data.metadata.coverGeometry.spineIn > 0);
  assert.ok(data.metadata.printOptions.pageCount === 48);
  assert.match(data.copyPasteText, /7 KEYWORDS/);
  assert.match(data.copyPasteText, /BESCHREIBUNG/);
});

test('Projekte lassen sich speichern, laden und löschen', async () => {
  const created = await post('/api/projects', { name: 'Testprojekt', config });
  assert.equal(created.status, 201);
  const { project } = await created.json();
  assert.ok(project.id);

  const list = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(list.projects.length, 1);
  assert.equal(list.projects[0].name, 'Testprojekt');

  const updated = await post('/api/projects', { id: project.id, config: { ...config, title: 'Neuer Titel' } });
  const updatedBody = await updated.json();
  assert.equal(updatedBody.project.id, project.id);
  assert.equal(updatedBody.project.name, 'Neuer Titel');

  const del = await fetch(`${base}/api/projects/${project.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  const after = await (await fetch(`${base}/api/projects`)).json();
  assert.equal(after.projects.length, 0);

  const missing = await fetch(`${base}/api/projects/00000000-0000-0000-0000-000000000000`, { method: 'DELETE' });
  assert.equal(missing.status, 404);
});

test('E-Book-Export liefert ein EPUB mit korrektem mimetype', async () => {
  const response = await post('/api/export/ebook.epub', { config });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/epub+zip');
  assert.match(response.headers.get('content-disposition'), /wortsuche-fuer-weltentdecker_kindle\.epub/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.equal(bytes.subarray(30, 38).toString(), 'mimetype');
  assert.equal(bytes.subarray(38, 58).toString(), 'application/epub+zip');
});

test('Live-Keywords verlangen mindestens zwei Zeichen (kein Netzaufruf)', async () => {
  const response = await fetch(`${base}/api/suggest?q=a`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.live, false);
  assert.equal(data.source, 'invalid');
});

test('Keyword-Recherche liefert auch ohne Amazon-Netz eine Antwort', async () => {
  const response = await fetch(`${base}/api/suggest?q=r%C3%A4tselbuch%20f%C3%BCr`);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(Array.isArray(data.ideas));
  assert.ok(data.ideas.length > 0 || data.live === true);
  assert.ok(typeof data.note === 'string');
});

test('Dashboard aggregiert gespeicherte Projekte', async () => {
  await post('/api/projects', { name: 'Portfolio A', config });
  await post('/api/projects', { name: 'Portfolio B', config: { ...config, title: 'Zweites', pageCount: 200, priceEur: 12.99 } });

  const data = await (await fetch(`${base}/api/dashboard?sales=7`)).json();
  assert.equal(data.summary.projectCount, 2);
  assert.equal(data.summary.salesPerBook, 7);
  assert.equal(data.summary.totalPages, 248);
  assert.ok(data.summary.monthlyEurAllEur > 0);
  assert.equal(data.rows.length, 2);
  for (const row of data.rows) {
    assert.ok(row.royaltyPerSaleEur > 0);
    assert.ok(row.spineIn > 0);
  }
});

test('Unbekannte API-Pfade liefern 404', async () => {
  const response = await fetch(`${base}/api/gibtsnicht`);
  assert.equal(response.status, 404);
});

test('Statische Dateien werden mit korrektem Typ ausgeliefert', async () => {
  const html = await fetch(`${base}/`);
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type'), /text\/html/);
  assert.match(await html.text(), /Buchmaschine/);

  const css = await fetch(`${base}/styles.css`);
  assert.match(css.headers.get('content-type'), /text\/css/);

  const js = await fetch(`${base}/app.js`);
  assert.match(js.headers.get('content-type'), /javascript/);

  const fallback = await fetch(`${base}/irgendein/pfad`);
  assert.equal(fallback.status, 200);
});

test('Path-Traversal wird geblockt', async () => {
  const response = await fetch(`${base}/../package.json`);
  const text = await response.text();
  assert.equal(text.includes('pdf-lib'), false);
});

test('Slugify erzeugt URL-taugliche Namen', () => {
  assert.equal(slugify('Große Rätsel für kluge Köpfe'), 'grosse-raetsel-fuer-kluge-koepfe');
  assert.equal(slugify('   '), 'buch');
  assert.equal(slugify('111 Wege, kein meckernder Knacker'), '111-wege-kein-meckernder-knacker');
});
