#!/usr/bin/env node
/**
 * Nischen- und Keyword-Ingestion für die Pipeline.
 *
 *   node scripts/harvest_keywords.mjs --out artifacts/metadata.json
 *   node scripts/harvest_keywords.mjs --niche raetsel-senioren --date 2026-11-02
 *   node scripts/harvest_keywords.mjs --offline --niche raetsel-senioren
 *
 * Ablauf:
 *  1. Nische wählen – explizit oder deterministisch aus dem Datum (jeder Lauf
 *     bekommt eine andere Nische, derselbe Tag aber immer dieselbe: reproduzierbar).
 *  2. Bis zu drei Saatbegriffe live bei Amazon abfragen (über den bereits
 *     getesteten Client aus `suggest.mjs` inkl. Drossel, Cache und Fallback).
 *  3. Aus den Treffern die sieben KDP-Slots bauen: höchstens 50 Zeichen je Slot,
 *     keine Dubletten, Longtail-Phrasen vor Einzelwörtern.
 *
 * Ohne Netz (oder mit `--offline`) entstehen die Slots aus den kuratierten
 * Nischen-Keywords. Das Ergebnis trägt immer seine Herkunft in `provenance`,
 * damit niemand geschätzte Daten für Marktdaten hält.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { listNiches, sampleTitleFor } from '../server/lib/niches.mjs';
import { keywordResearch, scoreSuggestion } from '../server/lib/suggest.mjs';

/** KDP erlaubt sieben Keyword-Slots mit je höchstens 50 Zeichen. */
export const KDP_KEYWORD_SLOTS = 7;
export const KDP_KEYWORD_MAX_LENGTH = 50;

/** Nische deterministisch aus dem Datum wählen (YYYY-MM-DD). */
export function pickNicheForDate(date, niches = listNiches()) {
  const digits = String(date).replace(/\D/g, '');
  if (!digits) throw new Error(`Datum unbrauchbar: ${date}. Erwartet YYYY-MM-DD.`);
  const index = Number(digits.slice(-8)) % niches.length;
  return niches[index];
}

/**
 * Baut aus einer Kandidatenliste die KDP-Slots.
 *
 * Regeln (alle in Tests abgedeckt):
 *  - höchstens 7 Slots, jeder höchstens 50 Zeichen,
 *  - keine doppelten Phrasen (case-insensitiv),
 *  - lange, spezifische Phrasen zuerst, Einzelwörter nur als Lückenfüller,
 *  - bereits vergebene Phrasen werden nicht erneut verwendet.
 *
 * @param {string[]} candidates
 * @param {{limit?:number}} options
 * @returns {string[]}
 */
export function assembleSlots(candidates, { limit = KDP_KEYWORD_SLOTS } = {}) {
  const normalise = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
  const seen = new Set();
  const usable = [];

  for (const raw of candidates) {
    const phrase = normalise(raw);
    if (phrase.length < 3 || phrase.length > KDP_KEYWORD_MAX_LENGTH) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    usable.push(phrase);
  }

  // Lange Phrasen (Longtail) zuerst, dann nach Wortzahl und Länge.
  usable.sort((a, b) => {
    const wordsB = b.split(' ').length;
    const wordsA = a.split(' ').length;
    if (wordsB !== wordsA) return wordsB - wordsA;
    return b.length - a.length;
  });

  return usable.slice(0, limit);
}

/**
 * Sammelt Kandidaten aus Live-Vorschlägen und kuratierten Keywords.
 * @param {object} niche
 * @param {{offline?:boolean, marketplace?:string, fetchImpl?:Function, seeds?:number}} options
 */
export async function harvestCandidates(niche, options = {}) {
  const curated = niche.keywords
    .slice()
    .sort((a, b) => b.demand - a.demand)
    .map((entry) => entry.term);

  if (options.offline) {
    return { candidates: curated, live: false, source: 'offline', seeds: [], liveTerms: 0 };
  }

  const seeds = curated.slice(0, options.seeds ?? 3);
  const liveTerms = [];
  let source = 'amazon-suggest';

  for (const seed of seeds) {
    const result = await keywordResearch(seed, {
      marketplace: options.marketplace ?? 'de',
      fetchImpl: options.fetchImpl,
    });
    if (!result.live) source = result.source;
    for (const suggestion of result.suggestions ?? []) {
      liveTerms.push(suggestion);
    }
  }

  // Live-Treffer nach demselben Score sortieren, den die App auch anzeigt.
  const scored = liveTerms
    .map((term, index) => scoreSuggestion(term, index))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.term);

  return {
    candidates: [...scored, ...curated],
    live: liveTerms.length > 0,
    source: liveTerms.length ? 'amazon-suggest' : source,
    seeds,
    liveTerms: liveTerms.length,
  };
}

/**
 * Erzeugt die vollständige Buch-Konfiguration für einen Pipeline-Lauf.
 * @param {{nicheId?:string, date:string, offline?:boolean, marketplace?:string, fetchImpl?:Function}} options
 */
export async function harvestMetadata(options) {
  const niches = listNiches();
  const niche = options.nicheId
    ? niches.find((entry) => entry.id === options.nicheId)
    : pickNicheForDate(options.date, niches);
  if (!niche) {
    throw new Error(`Unbekannte Nische: ${options.nicheId} (bekannt: ${niches.map((entry) => entry.id).join(', ')})`);
  }

  const harvest = await harvestCandidates(niche, options);
  const slots = assembleSlots(harvest.candidates);
  const sample = sampleTitleFor(niche.id);

  // Zu wenige Slots sind kein Fehler, aber ein Nachteil – der Preflight warnt.
  const config = {
    title: sample.title,
    subtitle: sample.subtitle ?? '',
    author: options.author ?? 'Buchmaschine Studio',
    description: niche.description,
    generator: niche.generator,
    difficulty: niche.difficulty,
    pageCount: niche.pageCount,
    trim: niche.trim,
    paper: 'white',
    priceEur: niche.priceEur,
    marketplace: options.marketplace ?? 'de',
    seed: `${niche.id}-${options.date}`,
    nicheId: niche.id,
    coverStyle: 'navy',
    keywords: slots,
    categories: niche.categories,
  };

  return {
    config,
    provenance: {
      nicheId: niche.id,
      nicheName: niche.name,
      date: options.date,
      keywordSource: harvest.source,
      liveTerms: harvest.liveTerms,
      seeds: harvest.seeds,
      slots: slots.length,
      note: harvest.live
        ? 'Keywords aus der Amazon-Vervollständigung; Nachfrage und Wettbewerb sind heuristisch, nicht gemessen.'
        : 'Amazon nicht erreichbar oder Offline-Modus: Keywords stammen aus den kuratierten Nischen-Paketen.',
    },
  };
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
  const date = args.date ?? new Date().toISOString().slice(0, 10);
  const out = path.resolve(args.out ?? 'artifacts/metadata.json');

  const { config, provenance } = await harvestMetadata({
    nicheId: typeof args.niche === 'string' ? args.niche : undefined,
    date,
    offline: Boolean(args.offline),
    marketplace: typeof args.marketplace === 'string' ? args.marketplace : 'de',
    author: typeof args.author === 'string' ? args.author : undefined,
  });

  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify({ ...config, provenance }, null, 2));

  process.stderr.write(
    `harvest niche=${config.nicheId} source=${provenance.keywordSource} live_terms=${provenance.liveTerms} slots=${provenance.slots}\n`,
  );
  for (const [index, slot] of config.keywords.entries()) {
    process.stderr.write(`  slot ${index + 1}: ${slot} (${slot.length} Zeichen)\n`);
  }
  process.stdout.write(`${JSON.stringify({ out, nicheId: config.nicheId, keywords: config.keywords, provenance })}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`error ${error.message}\n`);
    process.exitCode = 1;
  });
}
