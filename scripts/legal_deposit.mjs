#!/usr/bin/env node
/**
 * Pflichtablieferung an die Deutsche Nationalbibliothek – als Paket, nicht als Fake-API.
 *
 *   node scripts/legal_deposit.mjs --manifest artifacts/manifest.json --out artifacts/dnb
 *   node scripts/legal_deposit.mjs --manifest artifacts/manifest.json --hotfolder /mnt/dnb-hotfolder
 *
 * Faktenlage (geprüft, Quellen in docs/pipeline.md):
 *  - § 14 Abs. 1 DNBG: körperliche Medienwerke in **zwei** Ausfertigungen.
 *  - § 14 Abs. 3 DNBG: Medienwerke in unkörperlicher Form (E-Book/PDF) in **einer**
 *    Ausfertigung. Frist: eine Woche ab Beginn der Verbreitung (§ 14 Abs. 4);
 *    danach Mahnung, weitere drei Wochen, dann Beschaffung auf Kosten des
 *    Ablieferungspflichtigen. Verstoß ist eine Ordnungswidrigkeit bis 10 000 €
 *    (§ 19 DNBG).
 *  - Die DNB hat **keine** öffentliche REST-API mit Bearer-Token. Automatisiert
 *    wird über einen beantragten **Hotfolder** (SFTP/WebDAV) oder **OAI-PMH**,
 *    jeweils nach Registrierung und Testphase; für Einzelfälle gibt es ein
 *    Webformular.
 *
 * Dieses Skript erzeugt deshalb das vollständige Transferpaket samt Metadaten
 * und Checkliste. Liegt ein Hotfolder-Verzeichnis vor (per SSHFS, rclone oder
 * WebDAV-Mount), wird das ZIP dort abgelegt. Es wird nichts erfunden und
 * nichts ohne Ablageort als „übermittelt" gemeldet.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createZip, listZipEntries } from '../server/lib/zip.mjs';
import { validateIsbn } from './lib/isbn.mjs';

/** Pflichtangaben des DNB-Metadaten-Kernsets für Monografien. */
export const DNB_CORE_FIELDS = [
  'title',
  'author',
  'publisher',
  'publicationDate',
  'language',
  'resourceType',
  'fileFormat',
  'accessRights',
  'identifiers',
];

/**
 * Baut den Metadatensatz für die Ablieferung.
 * @param {object} manifest Manifest aus build_package.mjs
 * @param {{publisher?:string, publicationDate?:string, accessRights?:string, urn?:string, isbn?:string}} options
 */
export function buildDepositMetadata(manifest, options = {}) {
  const isbnCheck = options.isbn ? validateIsbn(options.isbn) : { ok: false };
  if (options.isbn && !isbnCheck.ok) {
    throw new Error(`Ungültige ISBN für die DNB-Meldung: ${isbnCheck.reason}`);
  }

  const identifiers = [];
  if (isbnCheck.ok) identifiers.push({ type: 'ISBN-13', value: isbnCheck.isbn13 });
  if (options.urn) identifiers.push({ type: 'URN', value: options.urn });

  const metadata = {
    title: manifest.title,
    subtitle: manifest.subtitle ?? undefined,
    author: manifest.author,
    publisher: options.publisher ?? 'Selbstverlag',
    publicationDate: options.publicationDate ?? new Date().toISOString().slice(0, 10),
    language: 'ger',
    resourceType: 'Monografie',
    extent: manifest.pageCount ? `${manifest.pageCount} Seiten` : undefined,
    fileFormat: 'PDF',
    accessRights: options.accessRights ?? 'frei zugänglich',
    identifiers,
    origin: {
      generator: 'Buchmaschine',
      generatedAt: manifest.generatedAt,
      nicheId: manifest.provenance?.nicheId ?? null,
    },
    note:
      'Metadaten-Kernset für Netzpublikationen. Die DNB vergibt bei Bedarf selbst eine URN; '
      + 'Format und Übertragungsweg werden im Rahmen der Registrierung abgestimmt.',
  };

  const missing = DNB_CORE_FIELDS.filter((field) => metadata[field] === undefined || metadata[field] === null);
  if (missing.length) throw new Error(`Metadatensatz unvollständig: ${missing.join(', ')}`);
  return metadata;
}

/** Klartext-Checkliste mit den gesetzlichen Fristen – kommt mit ins ZIP. */
export function depositChecklist(manifest, metadata) {
  return [
    `# Pflichtablieferung: ${manifest.title}`,
    '',
    `Metadaten erzeugt: ${new Date().toISOString()}`,
    `Umfang: ${manifest.pageCount} Seiten · Format: 6×9 in · Sprache: ${metadata.language}`,
    '',
    '## Gesetzliche Pflicht (§ 14 DNBG)',
    '',
    '- **Gedrucktes Buch: zwei Ausfertigungen** (§ 14 Abs. 1). Der Druckdienstleister liefert',
    '  in der Regel direkt an die DNB, wenn die Adresse im Druckauftrag hinterlegt ist;',
    '  sonst selbst versenden: Deutsche Nationalbibliothek, Adickesallee 1, 60322 Frankfurt am Main.',
    '- **Digitales Werk (PDF/EPUB): eine Ausfertigung** (§ 14 Abs. 3).',
    '- **Frist: eine Woche** ab Beginn der Verbreitung (§ 14 Abs. 4). Danach Mahnung,',
    '  weitere drei Wochen, anschließend Beschaffung auf Kosten des Ablieferungspflichtigen.',
    '- **Bußgeld bis 10 000 €** bei Verstoß (§ 19 DNBG).',
    '- **Ausnahme unter 25 Stück** gilt nicht für Druck auf Anforderung (Print-on-Demand).',
    '',
    '## Übertragungswege (kein öffentlicher API-Schlüssel)',
    '',
    '1. **Webformular** für einzelne Monografien (schnellster Weg für ein Buch).',
    '2. **Hotfolder** per SFTP/WebDAV – wird von der DNB eingerichtet, nach Registrierung',
    '   und Testphase. Liegt der Ordner gemountet vor, legt `--hotfolder <pfad>` dieses',
    '   ZIP dort ab.',
    '3. **OAI-PMH** für eigene Repositorien mit Metadaten-Endpunkt.',
    '',
    '## In diesem Paket',
    '',
    '- Buchblock-PDF (druckfertig)',
    '- EPUB, falls erzeugt',
    '- `metadaten.json` (Metadaten-Kernset)',
    '- `ablieferung.md` (diese Datei)',
    '',
    '## Noch zu erledigen (menschlich)',
    '',
    '- [ ] Registrierung des Ablieferungsverfahrens bei der DNB (einmalig)',
    '- [ ] Zugriffsrechte bestätigen: frei zugänglich oder nur Lesesaal',
    '- [ ] Versand der zwei Pflichtexemplare der Druckausgabe',
    '- [ ] Übertragung dieses Pakets über den vereinbarten Weg',
    '',
    'Quellen: § 14 DNBG (gesetze-im-internet.de/dnbg/__14.html), DNB-Merkblatt',
    '„Sammlung unkörperlicher Medienwerke".',
  ].join('\n');
}

/**
 * Packt das Ablieferungspaket.
 * @param {{manifest:object, manifestDir:string, outDir:string, publisher?:string, isbn?:string, accessRights?:string, urn?:string, publicationDate?:string}} input
 */
export async function buildDepositPackage(input) {
  const { manifest, manifestDir, outDir } = input;
  if (!manifest || manifest.ok !== true) {
    throw new Error(`Manifest nicht freigabefähig (ok=${manifest?.ok}) – kein Ablieferungspaket für ein abgelehntes Buch.`);
  }

  const metadata = buildDepositMetadata(manifest, input);
  const checklist = depositChecklist(manifest, metadata);
  const entries = [];

  const addFile = async (filePath, name, required) => {
    if (!filePath) {
      if (required) throw new Error(`Pflichtdatei fehlt im Manifest: ${name}`);
      return false;
    }
    const full = path.join(manifestDir, path.basename(filePath));
    try {
      const data = await readFile(full);
      entries.push({ name, data });
      return true;
    } catch (error) {
      if (required) throw new Error(`Pflichtdatei nicht lesbar (${full}): ${error.message}`);
      return false;
    }
  };

  await addFile(manifest.files?.manuscript, 'buch.pdf', true);
  await addFile(manifest.files?.epub, 'buch.epub', false);

  entries.push({ name: 'metadaten.json', data: Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, 'utf8') });
  entries.push({ name: 'ablieferung.md', data: Buffer.from(checklist, 'utf8') });

  const zip = createZip(entries);
  await mkdir(outDir, { recursive: true });
  const slug = manifest.title
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'buch';
  const zipPath = path.join(outDir, `${slug}_dnb_paket.zip`);
  await writeFile(zipPath, zip);
  await writeFile(path.join(outDir, `${slug}_metadaten.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(path.join(outDir, `${slug}_ablieferung.md`), checklist);

  return {
    zipPath,
    metadataPath: path.join(outDir, `${slug}_metadaten.json`),
    checklistPath: path.join(outDir, `${slug}_ablieferung.md`),
    metadata,
    entries: listZipEntries(zip).map((entry) => entry.name),
    bytes: zip.length,
  };
}

/**
 * Legt das Paket in einem gemounteten Hotfolder ab.
 * Es gibt keine HTTP-API – der Hotfolder ist der offizielle automatisierte Weg.
 */
export async function deliverToHotfolder(zipPath, hotfolder) {
  const info = await stat(hotfolder).catch(() => null);
  if (!info || !info.isDirectory()) {
    throw new Error(`Hotfolder ${hotfolder} ist kein Verzeichnis. Erst mounten (SSHFS/rclone), dann erneut starten.`);
  }
  const target = path.join(hotfolder, path.basename(zipPath));
  await writeFile(target, await readFile(zipPath));
  return { delivered: true, target, note: 'Im Hotfolder abgelegt. Die DNB holt das Paket ab.' };
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
  const outDir = path.resolve(args.out ?? 'artifacts/dnb');

  const result = await buildDepositPackage({
    manifest,
    manifestDir: path.dirname(manifestPath),
    outDir,
    publisher: args.publisher ?? 'Selbstverlag',
    isbn: typeof args.isbn === 'string' ? args.isbn : undefined,
    accessRights: args['access-rights'],
    urn: args.urn,
    publicationDate: args.date,
  });

  let delivery = { delivered: false, note: 'Kein Hotfolder angegeben – Paket liegt zum manuellen Abholen bereit.' };
  if (args.hotfolder) {
    delivery = await deliverToHotfolder(result.zipPath, path.resolve(args.hotfolder));
  }

  process.stderr.write(`dnb.package zip=${result.zipPath} entries=${result.entries.join(',')}\n`);
  if (process.env.DNB_ACCESS_TOKEN) {
    process.stderr.write(
      'dnb.warning DNB_ACCESS_TOKEN gesetzt, aber es gibt keine öffentliche DNB-API mit Token – der Wert wird ignoriert.\n',
    );
  }
  process.stdout.write(`${JSON.stringify({
    zip: result.zipPath,
    metadata: result.metadataPath,
    checklist: result.checklistPath,
    entries: result.entries,
    delivery,
  })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`error ${error.message}\n`);
    process.exitCode = 1;
  });
}
