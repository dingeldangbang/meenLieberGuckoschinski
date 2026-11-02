#!/usr/bin/env node
/**
 * Validiert ONIX-3.0-Dateien gegen das offizielle XSD von EDItEUR.
 *
 *   node scripts/validate_onix.mjs --file artifacts/onix3.xml
 *   node scripts/validate_onix.mjs --file x.xml --schema-dir .onix-schema
 *
 * Warum das nötig ist: Das Schema erzwingt Reihenfolgen und Pflichtfelder, die
 * man nicht aus dem Gedächtnis trifft. Zwei echte Fehler hat diese Prüfung
 * gefunden: `<DateFormat>` muss in `<PublishingDate>` **vor** `<Date>` stehen,
 * und `<SupplyDetail>` verlangt das Composite `<Supplier>` statt flacher
 * Felder `<SupplierRole>`/`<SupplierName>`.
 *
 * Das Schema (© EDItEUR) wird **nicht** im Repository mitgeliefert, sondern zur
 * Laufzeit geholt und über Blob-SHAs gepinnt, damit derselbe Stand geprüft wird.
 * Quelle ist ein öffentlicher Spiegel; das Original liegt bei editeur.org.
 *
 * Validatoren: `xmllint --schema` (libxml2-utils) oder Python mit lxml.
 * Fehlt beides, endet das Skript mit Code 3 und einem Installationshinweis.
 *
 * Exit-Codes: 0 = gültig, 1 = ungültig, 2 = Aufruf-/Umgebungsfehler, 3 = kein Validator.
 */
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Gepinnte Schema-Dateien. Die SHA-Werte fixieren den geprüften Stand
 * (ONIX 3.0, Namespace ns.editeur.org, CodeLists Issue 21).
 */
export const SCHEMA_SOURCE = {
  repo: 'nbezzala/Onix',
  path: 'ONIX_Books_3.0_sample_1',
  files: [
    { name: 'reference.xsd', sha: 'c94bcebfcfe1dde3404bdfabe3b5d4ef46391ef8', size: 310773 },
    { name: 'ONIX_BookProduct_CodeLists.xsd', sha: '88ae122d5d56e08a8fa4ee8c206e501f4ed1892b', size: 973856 },
    { name: 'ONIX_XHTML_Subset.xsd', sha: '6beeaf8f61d04954960c16aa08b91566be873bf1', size: 42978 },
  ],
};

/** Erwarteter Wurzel-Namespace des geprüften Schemas. */
export const ONIX_NAMESPACE = 'http://ns.editeur.org/onix/3.0/reference';

/** Prüft vorab, ob die Datei überhaupt ONIX mit dem richtigen Namespace ist. */
export function preflightXml(xml) {
  const rootMatch = xml.match(/<ONIXMessage\b([^>]*)>/);
  if (!rootMatch) return { ok: false, reason: 'Kein <ONIXMessage>-Wurzelelement gefunden.' };
  const attrs = rootMatch[1];
  if (!attrs.includes('xmlns="' + ONIX_NAMESPACE + '"')) {
    const found = attrs.match(/xmlns="([^"]+)"/);
    return {
      ok: false,
      reason: `Falscher Namespace: ${found ? found[1] : 'keiner'} – erwartet ${ONIX_NAMESPACE}.`,
    };
  }
  if (!/release="3\.0"/.test(attrs)) {
    return { ok: false, reason: '<ONIXMessage> ohne release="3.0".' };
  }
  return { ok: true };
}

function blobUrl(sha) {
  return `https://api.github.com/repos/${SCHEMA_SOURCE.repo}/git/blobs/${sha}`;
}

/**
 * Holt einen Blob und liefert sein JSON. Drei Wege, weil keiner überall geht:
 * `fetch` (Standard), `curl` (nutzt den System-Zertifikatsspeicher, hilft hinter
 * TLS-Proxy) und `gh api` (nutzt vorhandene gh-Anmeldung ohne eigenen Token).
 */
async function fetchBlobJson(sha, { fetchImpl = fetch, token = process.env.GITHUB_TOKEN, prefer = 'fetch' } = {}) {
  const url = blobUrl(sha);
  const strategies = prefer === 'curl' ? ['curl', 'fetch', 'gh'] : ['fetch', 'curl', 'gh'];
  const problems = [];

  for (const strategy of strategies) {
    try {
      if (strategy === 'fetch') {
        const headers = { Accept: 'application/vnd.github+json' };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetchImpl(url, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      }
      if (strategy === 'curl') {
        const { stdout } = await run('curl', ['-fsSL', '--max-time', '60', '--retry', '2', url], {
          maxBuffer: 64 * 1024 * 1024,
        });
        return JSON.parse(stdout);
      }
      const { stdout } = await run('gh', ['api', url.slice('https://api.github.com/'.length)], {
        maxBuffer: 64 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } catch (error) {
      problems.push(`${strategy}: ${error.message}`);
    }
  }

  throw new Error(`Schema-Download fehlgeschlagen (${problems.join('; ')})`);
}

/** Lädt die gepinnten Schema-Dateien über die GitHub-Blob-API (Base64). */
export async function fetchSchema(targetDir, options = {}) {
  await mkdir(targetDir, { recursive: true });
  const written = [];
  for (const file of SCHEMA_SOURCE.files) {
    const body = await fetchBlobJson(file.sha, options);
    const content = Buffer.from(String(body.content ?? '').replace(/\s/g, ''), 'base64');
    if (!content.length) throw new Error(`Schema ${file.name} kam leer an.`);
    if (file.size && content.length !== file.size) {
      throw new Error(`Schema ${file.name}: ${content.length} Bytes, erwartet ${file.size}.`);
    }
    const target = path.join(targetDir, file.name);
    await writeFile(target, content);
    written.push({ name: file.name, bytes: content.length, target });
  }
  return written;
}

/** Welcher Validator ist verfügbar? Gibt `null`, wenn keiner installiert ist. */
export async function detectValidator() {
  try {
    await run('xmllint', ['--version']);
    return 'xmllint';
  } catch {
    // weiter mit Python
  }
  try {
    await run('python3', ['-c', 'import lxml.etree']);
    return 'lxml';
  } catch {
    return null;
  }
}

/** Baut das Python-Einzeiler-Programm für den lxml-Weg. */
function lxmlProgram() {
  return [
    'import sys',
    'from lxml import etree',
    'schema = etree.XMLSchema(etree.parse(sys.argv[1]))',
    'doc = etree.parse(sys.argv[2])',
    "print('OK' if schema.validate(doc) else 'INVALID')",
    "[print('ERR', e.line, e.message) for e in schema.error_log]",
  ].join('\n');
}

/**
 * Validiert eine Datei gegen das Schema.
 * @param {{file:string, schemaDir:string}} input
 * @returns {Promise<{ok:boolean, validator:string, errors:string[], output:string}>}
 */
export async function validateOnix({ file, schemaDir }) {
  const validator = await detectValidator();
  if (!validator) {
    const error = new Error(
      'Kein XSD-Validator gefunden. Installiere libxml2-utils (xmllint) oder python3-lxml.',
    );
    error.code = 'NO_VALIDATOR';
    throw error;
  }

  const schema = path.join(schemaDir, 'reference.xsd');

  if (validator === 'xmllint') {
    let stdout = '';
    let stderr = '';
    let code = 0;
    try {
      const result = await run('xmllint', ['--noout', '--schema', schema, file]);
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      code = error.code ?? 1;
      stdout = error.stdout ?? '';
      stderr = error.stderr ?? '';
    }
    const ok = code === 0;
    const errors = stderr
      .split('\n')
      .filter((line) => /error|fails to validate/i.test(line) && line.trim())
      .map((line) => line.trim());
    return { ok, validator, errors, output: [stdout, stderr].filter(Boolean).join('\n') };
  }

  const { stdout } = await run('python3', ['-c', lxmlProgram(), schema, file]);
  const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  const ok = lines.includes('OK');
  const errors = lines.filter((line) => line.startsWith('ERR')).map((line) => line.slice(4).trim());
  return { ok, validator, errors, output: stdout };
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
  const schemaDirArg = typeof args['schema-dir'] === 'string' ? args['schema-dir'] : '.onix-schema';

  // --download-only holt nur das Schema (npm run onix:schema).
  if (args['download-only']) {
    const target = path.resolve(schemaDirArg);
    const written = await fetchSchema(target);
    for (const file of written) process.stderr.write(`onix.schema ${file.name} ${file.bytes} B\n`);
    process.stdout.write(`${JSON.stringify({ ok: true, dir: target, files: written.length })}\n`);
    return 0;
  }

  if (!args.file) throw new Error('--file <onix.xml> fehlt.');

  const file = path.resolve(args.file);
  const xml = await readFile(file, 'utf8');

  const pre = preflightXml(xml);
  if (!pre.ok) {
    process.stderr.write(`onix.preflight_failed ${pre.reason}\n`);
    process.stdout.write(`${JSON.stringify({ ok: false, errors: [pre.reason] })}\n`);
    return 1;
  }

  const schemaDir = path.resolve(schemaDirArg);
  let downloaded = [];
  try {
    await readFile(path.join(schemaDir, 'reference.xsd'));
  } catch {
    process.stderr.write(`onix.schema_fetch dir=${schemaDir}\n`);
    downloaded = await fetchSchema(schemaDir);
  }

  const result = await validateOnix({ file, schemaDir });
  process.stderr.write(
    `onix.schema_validator=${result.validator} schema_files=${downloaded.length || 'vorhanden'}\n`,
  );

  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`  ${error}\n`);
    process.stderr.write('onix.invalid\n');
    process.stdout.write(`${JSON.stringify({ ok: false, validator: result.validator, errors: result.errors })}\n`);
    return 1;
  }

  process.stderr.write('onix.valid\n');
  process.stdout.write(`${JSON.stringify({ ok: true, validator: result.validator, file })}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => {
      process.exitCode = code ?? 0;
    })
    .catch((error) => {
      process.stderr.write(`error ${error.message}\n`);
      process.exitCode = error.code === 'NO_VALIDATOR' ? 3 : 2;
    });
}
