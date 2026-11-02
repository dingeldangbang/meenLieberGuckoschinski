import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

/**
 * Frontend-Budget und Abhängigkeitsfreiheit.
 *
 * Das Budget ist eine harte Zusage: < 200 KB gzip für alles, was der Browser
 * laden muss. Ohne Test wandert die Grenze mit jeder bequemen Zeile nach oben.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const BUDGET_BYTES = 200 * 1024;

const assets = ['public/index.html', 'public/styles.css', 'public/app.js'];
const contents = new Map();
for (const asset of assets) {
  contents.set(asset, await readFile(path.join(ROOT, asset), 'utf8'));
}

test('Budget: alles, was der Browser lädt, bleibt unter 200 KB gzip', () => {
  const rows = [];
  let total = 0;
  for (const [asset, source] of contents) {
    const gzipped = gzipSync(Buffer.from(source, 'utf8')).length;
    total += gzipped;
    rows.push(`${asset}: ${(gzipped / 1024).toFixed(1)} KB`);
  }
  const message = `${rows.join(', ')} – Summe ${(total / 1024).toFixed(1)} KB`;
  assert.ok(total < BUDGET_BYTES, `Budget überschritten: ${message}`);
  // Ausgabe nur bei Bedarf sichtbar; der Testlauf zeigt sie im Fehlerfall.
  assert.ok(total > 0);
});

test('Frontend lädt nichts von fremden Hosts', () => {
  for (const [asset, source] of contents) {
    const external = [...source.matchAll(/(?:src|href)="(https?:)?\/\/[^"]+"/g)]
      .map((match) => match[0])
      .filter((ref) => !ref.includes('www.w3.org'));
    assert.deepEqual(external, [], `${asset} lädt extern: ${external.join(', ')}`);
  }
});

test('Kein Inline-Skript und kein eval – die CSP verbietet beides ohnehin', () => {
  const html = contents.get('public/index.html');
  assert.doesNotMatch(html, /<script(?![^>]*src=)/i, 'Inline-Skript würde von der CSP blockiert');
  assert.doesNotMatch(html, /\son[a-z]+="/i, 'Inline-Handler würde von der CSP blockiert');
  const js = contents.get('public/app.js');
  assert.doesNotMatch(js, /\beval\(/);
  assert.doesNotMatch(js, /new Function\(/);
});

test('Keine Telemetrie und keine Fremd-Requests aus dem Frontend', () => {
  const js = contents.get('public/app.js');
  assert.doesNotMatch(js, /\bsendBeacon\b/, 'sendBeacon riecht nach Tracking');
  assert.doesNotMatch(js, /google-analytics|googletagmanager|plausible|matomo|sentry/i);
  // Alle fetch-Ziele sind relative API-Pfade derselben Herkunft.
  const targets = [...js.matchAll(/api\(\s*[`'"]([^`'"]+)/g)].map((match) => match[1]);
  assert.ok(targets.length > 5);
  for (const target of targets) {
    assert.match(target, /^\/api\//, `fremdes Ziel: ${target}`);
  }
});

test('Assets sind kleiner als ihr Rohmaß vermuten lässt (Kompression greift)', () => {
  const css = contents.get('public/styles.css');
  const ratio = gzipSync(Buffer.from(css, 'utf8')).length / Buffer.byteLength(css);
  assert.ok(ratio < 0.4, `CSS komprimiert nur auf ${(ratio * 100).toFixed(0)} %`);
});
