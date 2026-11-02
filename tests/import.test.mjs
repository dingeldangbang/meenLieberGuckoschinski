import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.BUCHMASCHINE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'buchmaschine-import-'));

const { createServer } = await import('../server/index.mjs');
const { importProjects, listProjects } = await import('../server/lib/store.mjs');

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => new Promise((resolve) => server.close(resolve)));

const fresh = (title) => ({
  name: title,
  config: { title, author: 'Import Test', pageCount: 48, generator: 'sudoku', trim: '6x9' },
});

async function postProjects(payload) {
  return fetch(`${base}/api/projects/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/* --------------------------------- Store --------------------------------- */

test('Import: einzelnes Projekt landet im Speicher', async () => {
  const result = await importProjects(fresh('Einzelnes Buch'));
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 0);
  const stored = await listProjects();
  assert.ok(stored.some((project) => project.name === 'Einzelnes Buch'));
});

test('Import: Array und { projects: [...] } werden beide akzeptiert', async () => {
  const first = await importProjects([fresh('Array A'), fresh('Array B')]);
  assert.equal(first.imported, 2);
  const second = await importProjects({ projects: [fresh('Objekt C')] });
  assert.equal(second.imported, 1);
});

test('Import: Einträge ohne config werden übersprungen und gezählt', async () => {
  const result = await importProjects([fresh('Gültig'), { name: 'Ohne Config' }, null, 'kaputt']);
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 3);
});

test('Import: gleiche ID aktualisiert statt zu verdoppeln', async () => {
  const entry = { id: 'feste-id', ...fresh('Erste Fassung') };
  await importProjects(entry);
  const before = (await listProjects()).length;
  const updated = { id: 'feste-id', name: 'Zweite Fassung', config: fresh('Zweite Fassung').config };
  const result = await importProjects(updated);
  assert.equal(result.imported, 1);
  const after = await listProjects();
  assert.equal(after.length, before, 'keine Dublette erwartet');
  assert.equal(after.find((project) => project.id === 'feste-id').name, 'Zweite Fassung');
});

test('Import: ohne overwrite bleiben vorhandene Datensätze unangetastet', async () => {
  const entry = { id: 'behalten', ...fresh('Original') };
  await importProjects(entry);
  const result = await importProjects({ id: 'behalten', ...fresh('Neu') }, { overwrite: false });
  assert.equal(result.imported, 0);
  assert.equal(result.skipped, 1);
  const stored = await listProjects();
  assert.equal(stored.find((project) => project.id === 'behalten').name, 'Original');
});

/* ---------------------------------- API ---------------------------------- */

test('API: Import antwortet mit 201 und den angelegten Projekten', async () => {
  const response = await postProjects({ projects: [fresh('Über die API')] });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(data.imported, 1);
  assert.ok(Array.isArray(data.projects));
  assert.ok(data.projects.every((project) => project.id && project.name));
});

test('API: leerer oder unsinniger Import wird abgelehnt', async () => {
  const response = await postProjects({ projects: [] });
  assert.ok([200, 400].includes(response.status));
  const data = await response.json();
  assert.equal(data.imported, 0);
});

test('API: importierte Projekte sind danach über GET /api/projects sichtbar', async () => {
  await postProjects(fresh('Sichtbar nach Import'));
  const response = await fetch(`${base}/api/projects`);
  const data = await response.json();
  assert.ok(data.projects.some((project) => project.name === 'Sichtbar nach Import'));
});
