import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.BUCHMASCHINE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'buchmaschine-harden-'));

const { createServer, resetRateLimit, SECURITY_HEADERS } = await import('../server/index.mjs');

const server = createServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => new Promise((resolve) => server.close(resolve)));

/* -------------------------------- Header --------------------------------- */

test('Sicherheits-Header stehen auf jeder Antwort', async () => {
  for (const route of ['/', '/app.js', '/api/health', '/gibtsnicht']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer', route);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'self'/, route);
  }
});

test('CSP verbietet Inline-Skripte und fremde Quellen', () => {
  const csp = SECURITY_HEADERS['Content-Security-Policy'];
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
});

test('Kein Framing-Verbot – die Vorschau läuft in einem iframe', () => {
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], undefined);
  assert.doesNotMatch(SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors/);
});

/* ------------------------------ Fehlende Datei ---------------------------- */

test('Fehlende Datei mit Endung liefert 404 statt HTML mit Status 200', async () => {
  const response = await fetch(`${base}/gibtsnicht.js`);
  assert.equal(response.status, 404);
  const body = await response.text();
  assert.doesNotMatch(body, /<html/i, 'Es darf kein HTML-Fallback kommen');
});

test('Unbekannter Pfad ohne Endung liefert weiterhin die App', async () => {
  const response = await fetch(`${base}/irgendein/pfad`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
});

test('Pfad-Traversal bleibt gesperrt', async () => {
  const response = await fetch(`${base}/../package.json`);
  assert.ok([403, 404].includes(response.status), `Status ${response.status}`);
});

/* --------------------------------- HEAD ---------------------------------- */

test('HEAD liefert Header, aber keinen Body', async () => {
  const response = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers.get('content-length')) > 0);
  const body = await response.text();
  assert.equal(body, '');
});

/* ---------------------------- Cache und ETag ----------------------------- */

test('Zweite Anfrage mit If-None-Match bekommt 304', async () => {
  const first = await fetch(`${base}/styles.css`);
  const etag = first.headers.get('etag');
  assert.ok(etag, 'ETag fehlt');
  assert.match(first.headers.get('cache-control') ?? '', /max-age/);

  const second = await fetch(`${base}/styles.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
  assert.equal((await second.text()).length, 0);
});

test('HTML wird nicht aggressiv zwischengespeichert', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
});

/* ------------------------------ Kleinigkeiten ---------------------------- */

test('robots.txt sperrt Crawler aus', async () => {
  const response = await fetch(`${base}/robots.txt`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Disallow: \//);
});

test('favicon.ico antwortet ohne Fehler', async () => {
  const response = await fetch(`${base}/favicon.ico`);
  assert.equal(response.status, 204);
});

test('Unbekannte API-Route liefert 404 als JSON', async () => {
  const response = await fetch(`${base}/api/gibtsnicht`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
});

/* ------------------------------- Rate-Limit ------------------------------ */

test('Rate-Limit greift auf teuren Routen und nennt Retry-After', async () => {
  resetRateLimit();
  const body = JSON.stringify({ config: { title: 'X', author: 'Y', pageCount: 40, generator: 'sudoku' } });
  let limited = null;
  for (let i = 0; i < 130 && !limited; i += 1) {
    const response = await fetch(`${base}/api/compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.status === 429) limited = response;
  }
  // /api/compliance ist bewusst nicht limitiert – die Grenze gilt den Exporten.
  assert.equal(limited, null, 'Compliance darf nicht limitiert werden');

  let exportLimited = null;
  for (let i = 0; i < 130 && !exportLimited; i += 1) {
    const response = await fetch(`${base}/api/export/metadata.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.status === 429) exportLimited = response;
  }
  assert.ok(exportLimited, 'Export hätte nach 120 Anfragen blockieren müssen');
  assert.ok(Number(exportLimited.headers.get('retry-after')) > 0);
  const payload = await exportLimited.json();
  assert.match(payload.error, /Zu viele Anfragen/);
  resetRateLimit();
});
