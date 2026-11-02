#!/usr/bin/env node
/**
 * SRE-Quality-Gate als eigenständiges Kommando – für CI und für die Hand.
 *
 *   node scripts/preflight_checker.mjs --check-parity artifacts/interior.pdf
 *   node scripts/preflight_checker.mjs --verify-cover artifacts/cover.pdf --pages 48
 *   node scripts/preflight_checker.mjs --all artifacts/manifest.json
 *
 * Ausgabe-Vertrag (wichtig für die Pipeline):
 *   stdout  = genau ein Wert, maschinell lesbar (Seitenzahl bzw. JSON-Ergebnis)
 *   stderr  = alle Protokollzeilen
 * Damit funktioniert `PAGES=$(node scripts/preflight_checker.mjs --check-parity b.pdf)`
 * ohne, dass Log-Text in die Variable läuft.
 *
 * Exit-Codes: 0 = bestanden (ggf. selbst repariert), 1 = Gate verletzt, 2 = Aufruffehler.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { enforceParity, auditCover } from './lib/gates.mjs';

const log = (message) => process.stderr.write(`${message}\n`);

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

/** Parität prüfen und bei Bedarf eine Vakatseite anhängen (in-place). */
async function checkParity(file) {
  const bytes = await readFile(file);
  const result = await enforceParity(bytes);

  if (result.repaired) {
    await writeFile(file, result.bytes);
    log(`parity.repaired  datei=${file} neu=${result.pageCount} seiten (Vakatseite ergänzt)`);
  } else {
    log(`parity.ok        datei=${file} seiten=${result.pageCount} (bereits gerade)`);
  }
  return result.pageCount;
}

/** Cover-Geometrie gegen die KDP-Sollmaße prüfen. */
async function verifyCover(file, pageCount, trim, paper) {
  const bytes = await readFile(file);
  const audit = await auditCover({ bytes, pageCount, trim, paper });

  for (const check of audit.checks) {
    log(`${check.ok ? 'ok  ' : 'FAIL'} ${check.id.padEnd(13)} ${check.detail}`);
  }
  return audit;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const trim = args.trim ?? '6x9';
  const paper = args.paper ?? 'white';

  if (args['check-parity']) {
    const pageCount = await checkParity(path.resolve(args['check-parity']));
    // Nur die Zahl nach stdout – der Vertrag, auf den die Pipeline baut.
    process.stdout.write(`${pageCount}\n`);
    return 0;
  }

  if (args['verify-cover']) {
    const pageCount = Number(args.pages);
    if (!Number.isInteger(pageCount) || pageCount < 2) {
      throw new Error('--pages <gerade Seitenzahl> fehlt oder ist ungültig.');
    }
    if (pageCount % 2 !== 0) {
      throw new Error(`--pages ${pageCount} ist ungerade: erst --check-parity laufen lassen.`);
    }
    const audit = await verifyCover(path.resolve(args['verify-cover']), pageCount, trim, paper);
    process.stdout.write(`${JSON.stringify({
      ok: audit.ok,
      pageCount,
      trim,
      paper,
      actual: audit.actual,
      expected: { widthPt: audit.expected.widthPt, heightPt: audit.expected.heightPt, spineIn: audit.expected.spineIn },
      checks: audit.checks,
    })}\n`);
    if (!audit.ok) {
      log(`gate.failed ${audit.summary}`);
      return 1;
    }
    log(`gate.passed ${audit.summary}`);
    return 0;
  }

  if (args.all) {
    const manifest = JSON.parse(await readFile(path.resolve(args.all), 'utf8'));
    const failures = [];

    const pageCount = await checkParity(manifest.files.manuscript);
    if (pageCount !== manifest.pageCount) {
      failures.push(`Seitenzahl ${pageCount} weicht vom Manifest (${manifest.pageCount}) ab.`);
    }

    const audit = await verifyCover(manifest.files.cover, pageCount, manifest.trim ?? trim, manifest.paper ?? paper);
    if (!audit.ok) failures.push(audit.summary);

    process.stdout.write(`${JSON.stringify({ ok: failures.length === 0, pageCount, cover: audit.summary, failures })}\n`);
    return failures.length ? 1 : 0;
  }

  throw new Error(
    'Nichts zu tun. Nutze --check-parity <pdf>, --verify-cover <pdf> --pages <n> oder --all <manifest.json>.',
  );
}

main()
  .then((code) => {
    process.exitCode = code ?? 0;
  })
  .catch((error) => {
    log(`error ${error.message}`);
    process.exitCode = 2;
  });
