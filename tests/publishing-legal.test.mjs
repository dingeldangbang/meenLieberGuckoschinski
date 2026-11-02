import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  formatIsbn,
  isbn10CheckCharacter,
  isbn13CheckDigit,
  strip,
  toIsbn10,
  toIsbn13,
  validateIsbn,
} from '../scripts/lib/isbn.mjs';
import { buildOnix, escapeXml, onixTimestamp, ONIX_CODES } from '../scripts/onix.mjs';
import {
  DNB_CORE_FIELDS,
  buildDepositMetadata,
  buildDepositPackage,
  depositChecklist,
  deliverToHotfolder,
} from '../scripts/legal_deposit.mjs';
import { buildPackage } from '../scripts/build_package.mjs';
import { readZipEntry } from '../server/lib/zip.mjs';

const tmp = await mkdtemp(path.join(tmpdir(), 'publishing-legal-'));

/** Minimaler Wohlgeformtheits-Prüfer: Stack über Start-/End-Tags. */
function assertWellFormed(xml) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack = [];
  const tagPattern = /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let match;
  let consumed = 0;
  while ((match = tagPattern.exec(body)) !== null) {
    consumed += match[0].length;
    const [, closing, name, , selfClosing] = match;
    if (closing) {
      const open = stack.pop();
      assert.equal(open, name, `End-Tag </${name}> passt nicht zu <${open}>`);
    } else if (!selfClosing) {
      stack.push(name);
    }
  }
  assert.equal(stack.length, 0, `Nicht geschlossene Elemente: ${stack.join(', ')}`);
  assert.ok(consumed > 0, 'keine Tags gefunden');
}

/* --------------------------------- ISBN ---------------------------------- */

test('ISBN-13-Prüfziffer wird korrekt berechnet', () => {
  assert.equal(isbn13CheckDigit('978316148410'), 0);
  assert.equal(isbn13CheckDigit('978398200000'), 8);
  assert.throws(() => isbn13CheckDigit('123'), /12 Ziffern/);
});

test('gültige ISBN-13 und ISBN-10 werden erkannt und umgerechnet', () => {
  const thirteen = validateIsbn('978-3-16-148410-0');
  assert.equal(thirteen.ok, true);
  assert.equal(thirteen.isbn13, '9783161484100');
  assert.equal(thirteen.isbn10, '316148410X');

  const ten = validateIsbn('ISBN 3-16-148410-X');
  assert.equal(ten.ok, true);
  assert.equal(ten.isbn13, '9783161484100');
  assert.equal(toIsbn13('316148410X'), '9783161484100');
  assert.equal(toIsbn10('9783161484100'), '316148410X');
  assert.equal(toIsbn10('9791234567896'), null, '979er Blöcke haben keine ISBN-10');
});

test('Prüfzeichen der ISBN-10 kennt X', () => {
  assert.equal(isbn10CheckCharacter('316148410'), 'X');
  assert.equal(validateIsbn('3161484100').ok, false, 'falsches Prüfzeichen muss auffallen');
});

test('falsche Prüfziffer wird mit Korrekturvorschlag gemeldet', () => {
  const result = validateIsbn('9783982000000');
  assert.equal(result.ok, false);
  assert.match(result.reason, /Prüfziffer falsch/);
  assert.match(result.reason, /9783982000008/);
  assert.equal(result.checkDigit, '8');
});

test('Platzhalter und Unsinn werden abgelehnt', () => {
  assert.equal(validateIsbn('9780000000000').ok, false);
  assert.equal(validateIsbn('').ok, false);
  assert.match(validateIsbn('12345').reason, /weder 13/);
  assert.equal(validateIsbn('9771234567890').ok, false, 'ISSN-Präfix 977 ist keine ISBN');
  assert.equal(formatIsbn('978-3-16-148410-0'), '9783161484100');
  assert.equal(strip('ISBN-13: 978-3-16-148410-0'), '9783161484100');
});

/* --------------------------------- ONIX ---------------------------------- */

const book = {
  isbn: '9783161484100',
  title: 'Systemarchitektur & Plattform-Engineering',
  subtitle: 'Praxis-Workbook',
  author: 'Beispiel Autorin',
  description: 'Ein <Workbook> mit "Übungen".',
  categories: ['Rätsel & Spiele', 'Technik'],
  priceEur: 9.99,
  pageCount: 134,
  trim: '6x9',
  paper: 'white',
};

test('ONIX 3.0 ist wohlgeformt und enthält die Pflichtangaben', () => {
  const { xml, isbn } = buildOnix(book, { publisher: 'Beispiel Verlag', sentAt: new Date('2026-11-02T04:00:00Z') });
  assertWellFormed(xml);

  assert.match(xml, /<ONIXMessage xmlns="http:\/\/ns\.editeur\.org\/onix\/3\.0\/reference" release="3\.0">/);
  assert.match(xml, new RegExp(`<IDValue>${isbn}</IDValue>`));
  assert.match(xml, /<ProductIDType>15<\/ProductIDType>/);
  assert.match(xml, new RegExp(`<ProductForm>${ONIX_CODES.productFormPaperback}</ProductForm>`));
  assert.match(xml, /<SentDateTime>20261102T040000Z<\/SentDateTime>/);
  assert.match(xml, /<CountriesIncluded>DE AT CH<\/CountriesIncluded>/);
  assert.match(xml, /<PriceType>02<\/PriceType>/);
  assert.match(xml, /<PriceAmount>9\.99<\/PriceAmount>/);
  assert.match(xml, /<CurrencyCode>EUR<\/CurrencyCode>/);
  assert.match(xml, /<ExtentValue>134<\/ExtentValue>/);
});

test('ONIX maskiert Sonderzeichen und lässt keine Steuerzeichen durch', () => {
  const { xml } = buildOnix(book, { publisher: 'Verlag & Co <KG>' });
  assertWellFormed(xml);
  assert.match(xml, /Systemarchitektur &amp; Plattform-Engineering/);
  assert.match(xml, /Verlag &amp; Co &lt;KG&gt;/);
  assert.match(xml, /Ein &lt;Workbook&gt; mit &quot;Übungen&quot;\./);
  assert.equal(escapeXml('a\u0000b\u0007c'), 'abc');
});

test('ONIX rechnet das Format in Millimeter um', () => {
  const { measuresMm } = buildOnix(book, { publisher: 'Beispiel Verlag' });
  assert.equal(measuresMm.width, 152.4);
  assert.equal(measuresMm.height, 228.6);
  // 134 Seiten × 0,002252" => 0,3018" => 7,7 mm
  assert.equal(measuresMm.thickness, 7.7);
  assert.equal(measuresMm.unit, 'mm');
});

test('ONIX lehnt ungültige oder fremde ISBN ab', () => {
  assert.throws(
    () => buildOnix({ ...book, isbn: '9783982000000' }, { publisher: 'X' }),
    /Prüfziffer falsch/,
  );
  assert.throws(() => buildOnix({ ...book, isbn: undefined }, { publisher: 'X' }), /Keine ISBN/);
  assert.throws(() => buildOnix(book, {}), /Verlag/);
  assert.throws(() => buildOnix({ ...book, author: undefined }, { publisher: 'X' }), /Titel und Autor/);
});

test('ONIX kennzeichnet E-Books mit anderer Produktform und ohne Maße', () => {
  const { xml } = buildOnix({ ...book, format: 'ebook' }, { publisher: 'X' });
  assertWellFormed(xml);
  assert.match(xml, new RegExp(`<ProductForm>${ONIX_CODES.productFormDigital}</ProductForm>`));
  assert.equal(/<Measure>/.test(xml), false);
});

test('ONIX-Zeitstempel folgt dem ONIX-Format', () => {
  assert.equal(onixTimestamp(new Date('2026-01-02T03:04:05Z')), '20260102T030405Z');
});

/* --------------------------- DNB-Pflichtablieferung ----------------------- */

async function manifestWithFiles() {
  const dir = path.join(tmp, 'paket');
  const result = await buildPackage(
    {
      title: 'Ablieferung Testbuch',
      author: 'Test Autorin',
      description: 'Beschreibung mit ausreichender Länge für die Ablieferungsprüfung, mehr als einhundertzwanzig Zeichen.',
      generator: 'sudoku',
      pageCount: 48,
      trim: '6x9',
      priceEur: 9.99,
      seed: 'dnb',
      keywords: ['rätselbuch', 'sudoku', 'geschenk'],
    },
    { outDir: dir },
  );
  return { dir, manifest: JSON.parse(await readFile(result.manifestPath, 'utf8')) };
}

test('DNB-Metadatensatz enthält das Kernset vollständig', async () => {
  const { manifest } = await manifestWithFiles();
  const metadata = buildDepositMetadata(manifest, { publisher: 'Beispiel Verlag', isbn: '978-3-16-148410-0' });

  for (const field of DNB_CORE_FIELDS) {
    assert.notEqual(metadata[field], undefined, `Feld ${field} fehlt`);
  }
  assert.equal(metadata.language, 'ger');
  assert.equal(metadata.fileFormat, 'PDF');
  assert.equal(metadata.identifiers[0].value, '9783161484100');
  assert.equal(metadata.publisher, 'Beispiel Verlag');
});

test('DNB-Metadatensatz lehnt eine ungültige ISBN ab', async () => {
  const { manifest } = await manifestWithFiles();
  assert.throws(() => buildDepositMetadata(manifest, { isbn: '9783982000000' }), /Prüfziffer falsch/);
});

test('Ablieferungspaket enthält PDF, EPUB, Metadaten und Checkliste', async () => {
  const { dir, manifest } = await manifestWithFiles();
  const result = await buildDepositPackage({
    manifest,
    manifestDir: dir,
    outDir: path.join(tmp, 'dnb'),
    publisher: 'Beispiel Verlag',
  });

  assert.deepEqual(result.entries.sort(), ['ablieferung.md', 'buch.epub', 'buch.pdf', 'metadaten.json']);
  const zip = await readFile(result.zipPath);
  const pdf = readZipEntry(zip, 'buch.pdf');
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');
  const meta = JSON.parse(Buffer.from(readZipEntry(zip, 'metadaten.json')).toString('utf8'));
  assert.equal(meta.title, 'Ablieferung Testbuch');
});

test('Ablieferungspaket verweigert ein nicht freigegebenes Manifest', async () => {
  const { dir, manifest } = await manifestWithFiles();
  await assert.rejects(
    () => buildDepositPackage({ manifest: { ...manifest, ok: false }, manifestDir: dir, outDir: path.join(tmp, 'x') }),
    /nicht freigabefähig/,
  );
});

test('Checkliste nennt Fristen, Stückzahlen und Bußgeldrahmen', async () => {
  const { manifest } = await manifestWithFiles();
  const metadata = buildDepositMetadata(manifest, {});
  const text = depositChecklist(manifest, metadata);

  assert.match(text, /§ 14 Abs\. 1/);
  assert.match(text, /zwei Ausfertigungen/);
  assert.match(text, /eine Ausfertigung/);
  assert.match(text, /eine Woche/);
  assert.match(text, /10 000/);
  assert.match(text, /Print-on-Demand/);
  assert.match(text, /Hotfolder/);
});

test('Hotfolder-Ablage schreibt das ZIP und prüft den Pfad', async () => {
  const { dir, manifest } = await manifestWithFiles();
  const result = await buildDepositPackage({ manifest, manifestDir: dir, outDir: path.join(tmp, 'dnb2') });
  const hotfolder = path.join(tmp, 'hotfolder');
  await import('node:fs/promises').then((fs) => fs.mkdir(hotfolder, { recursive: true }));

  const delivery = await deliverToHotfolder(result.zipPath, hotfolder);
  assert.equal(delivery.delivered, true);
  const written = await readFile(delivery.target);
  assert.equal(written.length, result.bytes);

  await assert.rejects(() => deliverToHotfolder(result.zipPath, path.join(tmp, 'fehlt')), /kein Verzeichnis/);
});
