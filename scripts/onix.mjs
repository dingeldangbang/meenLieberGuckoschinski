#!/usr/bin/env node
/**
 * ONIX 3.0 für den deutschen Buchhandel (VLB/MVB, Barsortimente).
 *
 *   node scripts/onix.mjs --manifest artifacts/manifest.json --isbn 9783161484100 \
 *                         --publisher "Beispiel Verlag" --out artifacts/onix3.xml
 *
 * Umfang: das für Meldung und Auslieferung nötige Kernset – Produktkennung,
 * Form, Maße, Titel, Autor, Sprache, Umfang, Beschreibung, Verlag,
 * Erscheinungsdatum, Verfügbarkeit, Preis und Verkaufsrechte. Das ist bewusst
 * kein vollständiges ONIX: Rechte, Reihen, Klappentexte und BISAC-Feinheiten
 * gehören in die Redaktion, nicht in einen Generator.
 *
 * Wichtig: Eine ONIX-Meldung ohne gültige, *eigene* ISBN wird abgelehnt. Die
 * ISBN vergibt in Deutschland die ISBN-Agentur (MVB) an den Verlag; sie ist
 * nicht erfindbar – siehe `scripts/lib/isbn.mjs`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { INCH_TO_PT, PAPER_THICKNESS, TRIM_SIZES, trimSize } from '../server/lib/kdp.mjs';
import { validateIsbn } from './lib/isbn.mjs';

export const ONIX_NAMESPACE = 'http://ns.editeur.org/onix/3.0/reference';
export const ONIX_RELEASE = '3.0';

/** ONIX-Codes, die dieser Generator verwendet (Listennummer jeweils angegeben). */
export const ONIX_CODES = {
  recordSourceType: '01', // Liste 3
  notificationType: '03', // Liste 1 – Bestätigung zur Veröffentlichung
  productIdTypeIsbn13: '15', // Liste 5
  productComposition: '00', // Liste 2 – Einzelprodukt
  productFormPaperback: 'BC', // Liste 7 – Paperback
  productFormDigital: 'EB', // Liste 7 – E-Book (Download)
  measureHeight: '01', // Liste 48
  measureWidth: '02',
  measureThickness: '03',
  measureUnitMm: 'mm', // Liste 50
  titleTypeDistinctive: '01', // Liste 15
  titleElementProduct: '01', // Liste 149
  contributorAuthor: 'A01', // Liste 17
  languageRoleOriginal: '01', // Liste 22
  extentMainContent: '00', // Liste 23
  extentUnitPages: '03', // Liste 24
  subjectKeywords: '20', // Liste 27
  textTypeDescription: '03', // Liste 153
  contentAudienceUnrestricted: '00', // Liste 154
  publishingRolePublisher: '01', // Liste 45
  publishingStatusActive: '04', // Liste 64
  publishingDatePublication: '01', // Liste 163
  dateFormatYyyymmdd: '00', // Liste 55 – exaktes Datum YYYYMMDD
  // Liste 57 – Pflicht, wenn kein <Price>-Element gesendet wird.
  unpricedContactSupplier: '04',
  salesRightsForSale: '01', // Liste 46
  supplierRolePublisher: '01', // Liste 93
  productAvailabilityAvailable: '20', // Liste 65
  priceTypeRrpInclTax: '02', // Liste 58
};

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Escaped Text für Elementinhalte und Attribute. Steuerzeichen fliegen raus. */
export function escapeXml(value) {
  return String(value ?? '')
    // XML 1.0 erlaubt nur #x9, #xA, #xD und #x20–#xD7FF
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

const inchesToMm = (inches) => Math.round(inches * 25.4 * 10) / 10;

/** ONIX-Zeitstempel: YYYYMMDDThhmmssZ. */
export function onixTimestamp(date = new Date()) {
  const iso = date.toISOString(); // 2026-11-02T04:00:00.000Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/** ONIX-Datum: YYYYMMDD. */
export function onixDate(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

const element = (name, value, indent) =>
  value === undefined || value === null || value === '' ? '' : `${indent}<${name}>${escapeXml(value)}</${name}>\n`;

const block = (name, inner, indent) => `${indent}<${name}>\n${inner}${indent}</${name}>\n`;

/**
 * Baut eine ONIX-3.0-Nachricht mit genau einem Produkt.
 *
 * @param {object} book
 * @param {string} book.isbn                 ISBN-10 oder -13 (wird geprüft)
 * @param {string} book.title
 * @param {string} [book.subtitle]
 * @param {string} book.author
 * @param {string} [book.description]
 * @param {string[]} [book.categories]       Schlagworte für Subject (Code 20)
 * @param {number} book.priceEur
 * @param {number} book.pageCount
 * @param {string} [book.trim]               z. B. "6x9"
 * @param {string} [book.paper]              "white" | "cream"
 * @param {string} [book.format]             "print" | "ebook"
 * @param {string} publisher
 * @param {string} [imprint]
 * @param {string} [senderName]              Meldender im ONIX-Header
 * @param {string} [language]                ISO 639-2/B, Standard „ger"
 * @param {Date} [sentAt]
 * @param {string} [recordReference]
 * @returns {{xml:string, isbn:string, productForm:string, measuresMm:object}}
 */
export function buildOnix(book, options = {}) {
  const check = validateIsbn(book.isbn);
  if (!check.ok) {
    throw new Error(
      `ONIX abgelehnt: ${check.reason} Ohne gültige, eigene ISBN darf nichts an den Buchhandel gemeldet werden.`,
    );
  }
  if (!book.title || !book.author) throw new Error('ONIX braucht mindestens Titel und Autor.');
  if (!options.publisher) throw new Error('ONIX braucht einen Verlag (PublishingRole 01) – Selbstverlag eintragen.');

  const isbn = check.isbn13;
  const format = book.format ?? 'print';
  const productForm = format === 'ebook' ? ONIX_CODES.productFormDigital : ONIX_CODES.productFormPaperback;
  const language = options.language ?? 'ger';
  const sentAt = options.sentAt ?? new Date();
  const trim = trimSize(book.trim ?? '6x9');
  const thicknessIn = (book.pageCount ?? 0) * (PAPER_THICKNESS[book.paper ?? 'white'] ?? PAPER_THICKNESS.white);
  const measuresMm = {
    height: inchesToMm(trim.height),
    width: inchesToMm(trim.width),
    thickness: inchesToMm(thicknessIn),
    unit: ONIX_CODES.measureUnitMm,
    ptPerInch: INCH_TO_PT,
  };

  const indent = '  ';
  const year = onixDate(sentAt).slice(0, 4);

  /* --------------------------------- Kopf --------------------------------- */
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<ONIXMessage xmlns="${ONIX_NAMESPACE}" release="${ONIX_RELEASE}">\n`;
  xml += `${indent}<Header>\n`;
  xml += `${indent}${indent}<Sender>\n`;
  xml += `${indent}${indent}${indent}<SenderName>${escapeXml(options.senderName ?? options.publisher)}</SenderName>\n`;
  xml += `${indent}${indent}</Sender>\n`;
  xml += `${indent}${indent}<SentDateTime>${onixTimestamp(sentAt)}</SentDateTime>\n`;
  xml += `${indent}</Header>\n`;

  /* -------------------------------- Produkt -------------------------------- */
  const recordReference = options.recordReference ?? `${isbn}-${onixDate(sentAt)}`;
  xml += `${indent}<Product>\n`;
  const p = `${indent}${indent}`;
  xml += element('RecordReference', recordReference, p);
  xml += element('NotificationType', ONIX_CODES.notificationType, p);
  xml += element('RecordSourceType', ONIX_CODES.recordSourceType, p);

  xml += block(
    'ProductIdentifier',
    element('ProductIDType', ONIX_CODES.productIdTypeIsbn13, `${p}  `) + element('IDValue', isbn, `${p}  `),
    p,
  );

  /* ----------------------------- Beschreibung ------------------------------ */
  let descriptive = '';
  descriptive += element('ProductComposition', ONIX_CODES.productComposition, `${p}  `);
  descriptive += element('ProductForm', productForm, `${p}  `);
  if (format !== 'ebook') {
    for (const [type, value] of [
      [ONIX_CODES.measureHeight, measuresMm.height],
      [ONIX_CODES.measureWidth, measuresMm.width],
      [ONIX_CODES.measureThickness, measuresMm.thickness],
    ]) {
      descriptive += block(
        'Measure',
        element('MeasureType', type, `${p}    `)
          + element('Measurement', value, `${p}    `)
          + element('MeasureUnitCode', ONIX_CODES.measureUnitMm, `${p}    `),
        `${p}  `,
      );
    }
  }

  let titleElement = element('TitleElementLevel', ONIX_CODES.titleElementProduct, `${p}      `);
  titleElement += element('TitleText', book.title, `${p}      `);
  titleElement += element('Subtitle', book.subtitle, `${p}      `);
  descriptive += block(
    'TitleDetail',
    element('TitleType', ONIX_CODES.titleTypeDistinctive, `${p}    `) + block('TitleElement', titleElement, `${p}    `),
    `${p}  `,
  );

  descriptive += block(
    'Contributor',
    element('SequenceNumber', 1, `${p}    `)
      + element('ContributorRole', ONIX_CODES.contributorAuthor, `${p}    `)
      + element('PersonName', book.author, `${p}    `),
    `${p}  `,
  );

  descriptive += block(
    'Language',
    element('LanguageRole', ONIX_CODES.languageRoleOriginal, `${p}    `)
      + element('LanguageCode', language, `${p}    `),
    `${p}  `,
  );

  if (format !== 'ebook' && book.pageCount) {
    descriptive += block(
      'Extent',
      element('ExtentType', ONIX_CODES.extentMainContent, `${p}    `)
        + element('ExtentValue', book.pageCount, `${p}    `)
        + element('ExtentUnit', ONIX_CODES.extentUnitPages, `${p}    `),
      `${p}  `,
    );
  }

  for (const subject of book.categories ?? []) {
    descriptive += block(
      'Subject',
      element('SubjectSchemeIdentifier', ONIX_CODES.subjectKeywords, `${p}    `)
        + element('SubjectHeadingText', subject, `${p}    `),
      `${p}  `,
    );
  }
  xml += block('DescriptiveDetail', descriptive, p);

  /* ------------------------------- Werbetext ------------------------------- */
  if (book.description) {
    let collateral = '';
    collateral += element('TextType', ONIX_CODES.textTypeDescription, `${p}    `);
    collateral += element('ContentAudience', ONIX_CODES.contentAudienceUnrestricted, `${p}    `);
    collateral += element('Text', book.description, `${p}    `);
    xml += block('CollateralDetail', block('TextContent', collateral, `${p}  `), p);
  }

  /* ----------------------------- Veröffentlichung --------------------------- */
  let publishing = '';
  if (options.imprint) {
    publishing += block('Imprint', element('ImprintName', options.imprint, `${p}    `), `${p}  `);
  }
  publishing += block(
    'Publisher',
    element('PublishingRole', ONIX_CODES.publishingRolePublisher, `${p}    `)
      + element('PublisherName', options.publisher, `${p}    `),
    `${p}  `,
  );
  publishing += element('PublishingStatus', ONIX_CODES.publishingStatusActive, `${p}  `);
  // Reihenfolge laut Schema: PublishingDateRole, DateFormat (optional), Date.
  publishing += block(
    'PublishingDate',
    element('PublishingDateRole', ONIX_CODES.publishingDatePublication, `${p}    `)
      + element('DateFormat', ONIX_CODES.dateFormatYyyymmdd, `${p}    `)
      + element('Date', onixDate(sentAt), `${p}    `),
    `${p}  `,
  );
  publishing += block(
    'SalesRights',
    element('SalesRightsType', ONIX_CODES.salesRightsForSale, `${p}    `)
      + block('Territory', element('CountriesIncluded', 'DE AT CH', `${p}      `), `${p}    `),
    `${p}  `,
  );
  xml += block('PublishingDetail', publishing, p);

  /* ------------------------------- Lieferweg ------------------------------- */
  let supply = '';
  // SupplyDetail verlangt zwingend das Composite <Supplier> mit SupplierRole + SupplierName.
  supply += block(
    'Supplier',
    element('SupplierRole', ONIX_CODES.supplierRolePublisher, `${p}      `)
      + element('SupplierName', options.publisher, `${p}      `),
    `${p}    `,
  );
  supply += element('ProductAvailability', ONIX_CODES.productAvailabilityAvailable, `${p}    `);
  if (book.priceEur) {
    supply += block(
      'Price',
      element('PriceType', ONIX_CODES.priceTypeRrpInclTax, `${p}      `)
        + element('PriceAmount', Number(book.priceEur).toFixed(2), `${p}      `)
        + element('CurrencyCode', options.currency ?? 'EUR', `${p}      `),
      `${p}    `,
    );
  } else {
    // <SupplyDetail> verlangt entweder <Price> oder <UnpricedItemType>.
    // Code 04 „Contact supplier" ist laut Code List 57 genau für Bücher ohne
    // empfohlenen Verkaufspreis in Broadcast-ONIX-Dateien vorgesehen.
    supply += element('UnpricedItemType', ONIX_CODES.unpricedContactSupplier, `${p}    `);
  }
  xml += block(
    'ProductSupply',
    block('Market', block('Territory', element('CountriesIncluded', 'DE AT CH', `${p}      `), `${p}    `), `${p}  `)
      + block('SupplyDetail', supply, `${p}  `),
    p,
  );

  xml += `${indent}</Product>\n`;
  xml += '</ONIXMessage>\n';

  return { xml, isbn, productForm, measuresMm, recordReference, publishedYear: year, check };
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
  const manifestPath = path.resolve(args.manifest ?? 'artifacts/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const out = path.resolve(args.out ?? 'artifacts/onix3.xml');

  const result = buildOnix(
    {
      isbn: typeof args.isbn === 'string' ? args.isbn : undefined,
      title: manifest.title,
      subtitle: manifest.subtitle,
      author: manifest.author,
      description: manifest.description,
      categories: manifest.categories,
      priceEur: manifest.priceEur,
      pageCount: manifest.pageCount,
      trim: manifest.trim ?? '6x9',
      paper: manifest.paper ?? 'white',
      format: args.format ?? 'print',
    },
    {
      publisher: args.publisher ?? 'Selbstverlag',
      imprint: args.imprint,
      senderName: args.sender,
      language: args.language,
    },
  );

  await writeFile(out, result.xml);
  process.stderr.write(
    `onix.generated isbn=${result.isbn} form=${result.productForm} mm=${result.measuresMm.height}x${result.measuresMm.width}x${result.measuresMm.thickness}\n`,
  );
  process.stdout.write(`${JSON.stringify({ out, isbn: result.isbn, recordReference: result.recordReference })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`error ${error.message}\n`);
    process.exitCode = 1;
  });
}
