import test from 'node:test';
import assert from 'node:assert/strict';

import { createZip, crc32, listZipEntries, readZipEntry } from '../server/lib/zip.mjs';
import { buildEpub, buildEpubSections } from '../server/lib/epub.mjs';
import { validateBookConfig } from '../server/lib/validate.mjs';
import { composeBook } from '../server/lib/compose.mjs';

const base = {
  title: 'Große Rätsel für kluge Köpfe',
  subtitle: 'Sudoku in Großdruck – mit Lösungen',
  author: 'Marlene Beispiel',
  description: 'Rätselspaß für 9,99 € – mit über 100 Sudokus.',
  generator: 'sudoku',
  pageCount: 48,
  trim: '6x9',
  priceEur: 9.99,
  seed: 'epub-test',
  keywords: ['rätselbuch senioren', 'sudoku großdruck'],
};

function planFor(overrides = {}) {
  const { config } = validateBookConfig({ ...base, ...overrides });
  return composeBook(config);
}

test('CRC32 trifft die bekannten Prüfwerte', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.from('')), 0);
  assert.equal(crc32(Buffer.from('hello world')), 0x0d4a1185);
});

test('ZIP-Writer erzeugt lesbare Einträge mit korrekter Größe', () => {
  const zip = createZip([
    { name: 'a.txt', data: 'Hallo' },
    { name: 'ordner/b.txt', data: 'Welt' },
  ]);
  const entries = listZipEntries(zip);
  assert.deepEqual(entries.map((e) => e.name), ['a.txt', 'ordner/b.txt']);
  assert.equal(entries[0].size, Buffer.byteLength('Hallo'));
  assert.equal(entries[0].method, 0);
  assert.equal(readZipEntry(zip, 'ordner/b.txt').toString(), 'Welt');
  assert.throws(() => readZipEntry(zip, 'fehlt.txt'), /fehlt/);
});

test('EPUB: mimetype ist erster und unkomprimierter Eintrag', () => {
  const epub = buildEpub(planFor());
  const entries = listZipEntries(epub);
  assert.equal(entries[0].name, 'mimetype');
  assert.equal(entries[0].method, 0);
  assert.equal(readZipEntry(epub, 'mimetype').toString(), 'application/epub+zip');
  assert.equal(entries[0].localOffset, 0);
});

test('EPUB: Pflichtdateien und Paketdokument sind vorhanden', () => {
  const epub = buildEpub(planFor());
  const names = listZipEntries(epub).map((e) => e.name);
  assert.ok(names.includes('META-INF/container.xml'));
  assert.ok(names.includes('OEBPS/content.opf'));
  assert.ok(names.includes('OEBPS/nav.xhtml'));
  assert.ok(names.includes('OEBPS/style.css'));
  assert.ok(names.some((n) => n.startsWith('OEBPS/text/sec')));

  const container = readZipEntry(epub, 'META-INF/container.xml').toString();
  assert.match(container, /full-path="OEBPS\/content\.opf"/);

  const opf = readZipEntry(epub, 'OEBPS/content.opf').toString();
  assert.match(opf, /<dc:title>Große Rätsel für kluge Köpfe<\/dc:title>/);
  assert.match(opf, /<dc:creator>Marlene Beispiel<\/dc:creator>/);
  assert.match(opf, /<dc:language>de<\/dc:language>/);
  assert.match(opf, /<dc:subject>rätselbuch senioren<\/dc:subject>/);
  assert.match(opf, /version="3.0"/);
  assert.match(opf, /properties="nav"/);
  assert.match(opf, /property="dcterms:modified"/);
});

test('EPUB: jedes Spine-Element hat ein Manifest-Item', () => {
  const epub = buildEpub(planFor());
  const opf = readZipEntry(epub, 'OEBPS/content.opf').toString();
  const ids = [...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)].map((m) => ({ id: m[1], href: m[2] }));
  const refs = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3);
  for (const ref of refs) {
    const item = ids.find((i) => i.id === ref);
    assert.ok(item, `itemref ${ref} ohne Manifest-Eintrag`);
  }
  assert.equal(refs.length, ids.filter((i) => i.id !== 'nav' && i.id !== 'css').length);
});

test('EPUB: Navigationsdokument verlinkt alle Kapitel', () => {
  const plan = planFor();
  const epub = buildEpub(plan);
  const nav = readZipEntry(epub, 'OEBPS/nav.xhtml').toString();
  const sections = buildEpubSections(plan);
  assert.match(nav, /epub:type="toc"/);
  for (let i = 1; i <= sections.length; i += 1) {
    assert.match(nav, new RegExp(`href="text/sec${i}\\.xhtml"`));
  }
});

test('EPUB: Rätselbuch enthält Gitter und Lösungen', () => {
  const epub = buildEpub(planFor({ pageCount: 40 }));
  const text = listZipEntries(epub)
    .filter((e) => e.name.startsWith('OEBPS/text/'))
    .map((e) => readZipEntry(epub, e.name).toString())
    .join('\n');
  assert.match(text, /<table class="grid"/);
  assert.match(text, /<h1>Lösungen<\/h1>/);
  assert.match(text, /Lösung 1</);
});

test('EPUB: Wortsuche nutzt Monospace-Blöcke', () => {
  const epub = buildEpub(planFor({ generator: 'wordsearch', pageCount: 40 }));
  const text = listZipEntries(epub)
    .filter((e) => e.name.startsWith('OEBPS/text/'))
    .map((e) => readZipEntry(epub, e.name).toString())
    .join('\n');
  assert.match(text, /<pre class="puzzle">/);
  assert.match(text, /<ol class="words">/);
});

test('EPUB: Übungsbuch gruppiert Kapitel mit Übungen', () => {
  const plan = planFor({ generator: 'workbook', nicheId: 'overthinking-workbook', theme: 'overthinking', pageCount: 60 });
  const sections = buildEpubSections(plan);
  const chapterLabels = sections.filter((s) => s.label.startsWith('Kapitel'));
  assert.ok(chapterLabels.length >= 4);
  const withExercises = sections.filter((s) => s.body.includes('class="writing-lines"'));
  assert.ok(withExercises.length >= 4);
});

test('EPUB: Journal gruppiert Wochen', () => {
  const plan = planFor({ generator: 'journal', pageCount: 60 });
  const sections = buildEpubSections(plan);
  const weeks = sections.filter((s) => s.id.startsWith('woche-'));
  assert.ok(weeks.length >= 6);
  assert.match(weeks[0].body, /class="lead"/);
});

test('EPUB: Sonderzeichen werden korrekt maskiert', () => {
  const plan = planFor({ title: 'Tom & Jerry <Test> "Zitat"', pageCount: 24 });
  const epub = buildEpub(plan);
  const opf = readZipEntry(epub, 'OEBPS/content.opf').toString();
  assert.match(opf, /Tom &amp; Jerry &lt;Test&gt; &quot;Zitat&quot;/);
  const title = readZipEntry(epub, 'OEBPS/text/sec1.xhtml').toString();
  assert.match(title, /Tom &amp; Jerry/);
  assert.doesNotMatch(title, /<Test>/);
});

test('EPUB: keine nbsp-Entities ohne DTD (XML muss parsbar bleiben)', () => {
  const epub = buildEpub(planFor({ pageCount: 40 }));
  for (const entry of listZipEntries(epub)) {
    if (!entry.name.endsWith(('.xhtml', '.opf', '.xml'))) continue;
    const content = readZipEntry(epub, entry.name).toString();
    assert.doesNotMatch(content, /&nbsp;/, `${entry.name} enthält &nbsp;`);
    assert.doesNotMatch(content, /&(?!amp;|lt;|gt;|quot;|apos;|#)/, `${entry.name} enthält unmaskierte Entity`);
  }
});

test('EPUB: deterministisch bei gleichem Seed', () => {
  const a = buildEpub(planFor({ seed: 'gleich' }), { date: new Date('2025-01-01T10:00:00Z') });
  const b = buildEpub(planFor({ seed: 'gleich' }), { date: new Date('2025-01-01T10:00:00Z') });
  assert.deepEqual(a, b);
  const c = buildEpub(planFor({ seed: 'anders' }), { date: new Date('2025-01-01T10:00:00Z') });
  assert.notDeepEqual(a, c);
});
