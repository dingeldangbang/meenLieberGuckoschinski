import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildOnix, ONIX_NAMESPACE } from '../scripts/onix.mjs';
import {
  SCHEMA_SOURCE,
  detectValidator,
  preflightXml,
  validateOnix,
} from '../scripts/validate_onix.mjs';

const BOOK = {
  isbn: '9783161484100',
  title: 'Der Hund, der zu viel wusste',
  subtitle: 'Ein Trainingsroman',
  author: 'A. Beispiel',
  pageCount: 120,
  trim: '6x9',
  format: 'print',
};

function sampleXml(overrides = {}) {
  return buildOnix({ ...BOOK, ...overrides }, { publisher: 'Beispielverlag', sentAt: new Date('2025-03-04T05:06:07Z') }).xml;
}

/* ------------------------- Struktur (immer geprüft) ----------------------- */

test('ONIX: DateFormat steht innerhalb von PublishingDate vor Date', () => {
  const xml = sampleXml();
  const block = xml.match(/<PublishingDate>[\s\S]*?<\/PublishingDate>/);
  assert.ok(block, 'PublishingDate fehlt');
  const content = block[0];
  const formatAt = content.indexOf('<DateFormat>');
  const dateAt = content.indexOf('<Date>');
  assert.ok(formatAt > -1, 'DateFormat fehlt – ONIX 3.0 verlangt es vor Date');
  assert.ok(dateAt > -1, 'Date fehlt');
  assert.ok(formatAt < dateAt, 'Reihenfolge falsch: DateFormat muss vor Date stehen');
  assert.match(content, /<DateFormat>00<\/DateFormat>/);
});

test('ONIX: SupplyDetail nutzt das Composite <Supplier> mit SupplierRole + SupplierName', () => {
  const xml = sampleXml();
  const block = xml.match(/<SupplyDetail>[\s\S]*?<\/SupplyDetail>/);
  assert.ok(block, 'SupplyDetail fehlt');
  const content = block[0];
  assert.match(content, /<Supplier>/, 'Composite <Supplier> fehlt');
  assert.match(content, /<SupplierRole>01<\/SupplierRole>/, 'SupplierRole 01 fehlt');
  assert.match(content, /<SupplierName>/, 'SupplierName fehlt');

  const supplier = content.match(/<Supplier>[\s\S]*?<\/Supplier>/);
  assert.ok(supplier);
  assert.ok(
    supplier[0].indexOf('<SupplierRole>') < supplier[0].indexOf('<SupplierName>'),
    'Innerhalb von Supplier muss SupplierRole vor SupplierName stehen',
  );

  // Die fehlerhafte Variante: SupplierRole direkt unter SupplyDetail.
  const directChild = content.replace(/<Supplier>[\s\S]*?<\/Supplier>/, '').includes('<SupplierRole>');
  assert.equal(directChild, false, 'SupplierRole darf nicht direkt unter SupplyDetail stehen');
});

test('ONIX: ohne Preis ersetzt UnpricedItemType (Liste 57) das Price-Element', () => {
  const xml = sampleXml({ priceEur: undefined });
  const block = xml.match(/<SupplyDetail>[\s\S]*?<\/SupplyDetail>/);
  assert.ok(block);
  assert.match(block[0], /<UnpricedItemType>04<\/UnpricedItemType>/);
  assert.doesNotMatch(block[0], /<Price>/);
});

test('ONIX: mit Preis steht <Price> und kein UnpricedItemType', () => {
  const xml = sampleXml({ priceEur: 12.99 });
  const block = xml.match(/<SupplyDetail>[\s\S]*?<\/SupplyDetail>/);
  assert.ok(block);
  assert.match(block[0], /<PriceAmount>12\.99<\/PriceAmount>/);
  assert.match(block[0], /<CurrencyCode>EUR<\/CurrencyCode>/);
  assert.doesNotMatch(block[0], /UnpricedItemType/);
});

test('ONIX: Wurzel trägt Namespace und release="3.0"', () => {
  const xml = sampleXml();
  assert.match(xml, new RegExp(`<ONIXMessage xmlns="${ONIX_NAMESPACE.replace(/\./g, '\\.')}" release="3\\.0">`));
});

/* --------------------------- Preflight-Prüfung --------------------------- */

test('preflightXml akzeptiert korrektes ONIX', () => {
  const result = preflightXml(sampleXml());
  assert.deepEqual(result, { ok: true });
});

test('preflightXml lehnt falschen Namespace ab (2009er editeur-Schema)', () => {
  const legacy = sampleXml().replace(ONIX_NAMESPACE, 'http://www.editeur.org/onix/3.0/reference');
  const result = preflightXml(legacy);
  assert.equal(result.ok, false);
  assert.match(result.reason, /Namespace/);
});

test('preflightXml lehnt fehlendes release="3.0" ab', () => {
  const result = preflightXml(sampleXml().replace(' release="3.0"', ''));
  assert.equal(result.ok, false);
  assert.match(result.reason, /release/);
});

test('preflightXml lehnt Nicht-ONIX ab', () => {
  const result = preflightXml('<html><body/></html>');
  assert.equal(result.ok, false);
});

/* ------------------------------ Schema-Daten ----------------------------- */

test('Schemaquelle ist auf feste Blob-SHAs gepinnt', () => {
  assert.ok(SCHEMA_SOURCE.files.length >= 3);
  for (const file of SCHEMA_SOURCE.files) {
    assert.match(file.sha, /^[0-9a-f]{40}$/, `${file.name} ohne gültige SHA`);
    assert.match(file.name, /\.xsd$/);
  }
});

/* ----------------- XSD-Validierung (nur wenn verfügbar) ------------------ */

const schemaDir = process.env.ONIX_SCHEMA_DIR ?? path.join(process.cwd(), '.onix-schema');
const schemaReady = existsSync(path.join(schemaDir, 'reference.xsd'));

test(
  'ONIX-Ausgabe ist gültig gegen ONIX 3.0 XSD',
  { skip: schemaReady ? false : `Schema fehlt (${schemaDir}) – mit "npm run onix:schema" holen` },
  async (t) => {
    const validator = await detectValidator();
    if (!validator) {
      t.skip('Kein Validator installiert (xmllint oder python3-lxml)');
      return;
    }
    const dir = await mkdtemp(path.join(tmpdir(), 'onix-'));

    // Beide Varianten müssen gültig sein: mit Preis und ohne (UnpricedItemType).
    const variants = [
      ['mit Preis', { priceEur: 12.99 }],
      ['ohne Preis', { priceEur: undefined }],
      ['E-Book', { format: 'ebook', priceEur: 4.99 }],
    ];
    for (const [label, overrides] of variants) {
      const file = path.join(dir, `${label.replace(/[^a-z]+/gi, '-')}.xml`);
      await writeFile(file, sampleXml(overrides));
      const result = await validateOnix({ file, schemaDir });
      assert.equal(result.ok, true, `${label}: ${result.errors.join(' | ')}`);
      assert.equal(result.errors.length, 0, label);
    }
  },
);
