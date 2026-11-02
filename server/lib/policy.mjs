/**
 * KDP-Compliance-Prüfungen vor dem Export.
 *
 *  - AI-Disclosure: "AI-generated" muss im KDP-Dashboard offengelegt werden,
 *    "AI-assisted" nicht. Die Buchmaschine erzeugt keine generativen Fließtexte,
 *    strukturierte Inhalte (Übungen, Prompts, Rätsel) sind aber generiert.
 *  - Low-Content-Risiko: reine Linien-/Notizbücher werden strenger geprüft.
 *  - Marken-Scan: Kollisionen mit bekannten Marken und Kategorien,
 *    die im Titel Werbe- oder Superlativsprache verbieten.
 */

/**
 * Gattungsbegriffe, die wie Marken aussehen, aber frei verwendet werden dürfen.
 * "Sudoku", "Kreuzworträtsel" oder "Mandala" sind Rätselarten, keine Marken.
 */
export const GENERIC_TERMS = ['sudoku', 'kreuzworträtsel', 'suchsel', 'labyrinth', 'mandala', 'notizbuch', 'tagebuch', 'logbuch'];

/** Bekannte Marken, die in Titel/Untertitel/Keywords nicht auftauchen dürfen. */
export const KNOWN_TRADEMARKS = [
  'scrabble', 'monopoly', 'uno', 'rubik', 'lego', 'duplo', 'playmobil',
  'pokemon', 'pokémon', 'disney', 'mickey', 'star wars', 'harry potter', 'marvel',
  'nintendo', 'minecraft', 'peppa', 'paw patrol', 'barbie', 'hello kitty',
  'kindle', 'amazon', 'audible', 'prime', 'alexa',
  'kleinanzeigen', 'tupperware', 'tempo', 'tesa', 'faber-castell', 'stabilo',
  'pictionary', 'jenga', 'twister', 'catan', 'risiko',
];

/**
 * Wörter, die bei KDP als Werbe- oder Heilversprechen auffallen können.
 * Kein Verbot, aber ein Hinweis wert.
 */
export const HYPE_WORDS = [
  'bestseller', 'nr. 1', 'nummer 1', '#1', 'weltneuheit', 'garantiert',
  'heilt', 'heilung', 'wunder', 'sofort reich', 'reich werden', 'garantierter erfolg',
  '100%', 'einmalig', 'revolutionär', 'genial',
];

const AI_GENERATED_GENERATORS = new Set(['sudoku', 'wordsearch', 'maze', 'journal', 'workbook', 'notebook']);

/** Prüft Titel, Untertitel, Beschreibung und Keywords gegen die Markenliste. */
export function scanTrademarks({ title = '', subtitle = '', description = '', keywords = [] }) {
  const haystack = [title, subtitle, description, ...keywords].join(' \n ').toLowerCase();
  const hits = KNOWN_TRADEMARKS.filter((brand) => {
    const needle = brand.toLowerCase();
    // Wortgrenzen, damit "uno" nicht in "Buchungen" anschlägt
    const pattern = new RegExp(`(^|[^a-zäöüß])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zäöüß]|$)`, 'i');
    return pattern.test(haystack);
  });
  return {
    clean: hits.length === 0,
    hits,
    severity: hits.length ? 'block' : 'none',
    message: hits.length
      ? `Mögliche Markenrechts-Kollision: ${hits.join(', ')}. Vor dem Upload prüfen oder Begriff ersetzen.`
      : 'Keine bekannten Marken in Titel, Untertitel, Beschreibung oder Keywords gefunden.',
    note: 'Automatischer Abgleich gegen eine Kurzliste bekannter Marken – keine Rechtsberatung und kein Registerauszug (DPMA/USPTO).',
  };
}

/** Sucht Werbe-/Heilversprechen, die KDP beanstanden kann. */
export function scanHype({ title = '', subtitle = '', description = '' }) {
  const text = [title, subtitle, description].join(' \n ').toLowerCase();
  const hits = HYPE_WORDS.filter((word) => {
    const needle = word.toLowerCase();
    const pattern = new RegExp(`(^|[^a-zäöüß0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zäöüß]|$)`, 'i');
    return pattern.test(text);
  });
  return { hits, severity: hits.length ? 'warn' : 'none' };
}

/**
 * KI-Offenlegung nach KDP-Regel.
 * @param {{generator:string, humanWrittenText?:boolean}} config
 */
export function aiDisclosure(config) {
  const generated = AI_GENERATED_GENERATORS.has(config.generator);
  const humanText = config.humanWrittenText !== false;
  const category = generated ? 'AI-generated' : 'AI-assisted';

  if (!generated) {
    return {
      category: 'human',
      requiresDisclosure: false,
      answer: 'Nein – keine KI-generierten Inhalte',
      explanation:
        'Der Inhalt stammt vollständig aus der Vorlage der Buchmaschine bzw. aus menschlicher Arbeit. Keine Offenlegung nötig.',
    };
  }

  return {
    category,
    requiresDisclosure: true,
    answer: 'Ja – Teile des Inhalts wurden mit KI-Unterstützung erzeugt',
    explanation: humanText
      ? 'Die Struktur, Übungen und Rätsel wurden programmatisch erzeugt; der Fließtext stammt von dir. Trage im KDP-Dashboard "Teile des Inhalts wurden mit KI erstellt" ein und beschreibe, welche Teile das sind – das ist die sicherste und ehrlichste Angabe.'
      : 'Alle Inhalte wurden automatisch erzeugt. Trage im KDP-Dashboard " KI-generiert" ein. Reine KI-Texte ohne menschliche Bearbeitung riskieren die Ablehnung.',
    checklist: [
      'Bei "KI-generierte Inhalte" die Option "Text" (und ggf. "Bilder") auswählen',
      'Kurzbeschreibung eintragen: "Rätsel und Struktur programmatisch erzeugt, Texte redaktionell bearbeitet"',
      'Keine erfundenen Quellen, Studien oder Zitate im Buch',
    ],
  };
}

/**
 * Risiko-Einschätzung für Low-Content-Bücher (Notizbuch, reine Linien).
 * KDP prüft solche Titel strenger und vergibt teils keine reguläre ISBN.
 */
export function lowContentRisk(config, plan) {
  const structuredPages = (plan?.pages ?? []).filter((page) =>
    ['journalDay', 'weekly', 'chapter', 'exercise', 'sudoku', 'wordsearch', 'maze'].includes(page.type),
  ).length;
  const total = plan?.pages?.length ?? config.pageCount ?? 1;
  const share = total ? structuredPages / total : 0;
  const reasons = [];

  if (config.generator === 'notebook') {
    reasons.push('Notizbuch: keine strukturierten Impulse, nur Raster');
  }
  if (share < 0.4) {
    reasons.push(`Nur ${Math.round(share * 100)} % der Seiten haben strukturierte Impulse (Empfehlung: über 40 %)`);
  }
  if (!config.description || config.description.length < 120) {
    reasons.push('Beschreibung kürzer als 120 Zeichen – KDP sieht das als dünnen Inhalt');
  }
  if (!Array.isArray(config.keywords) || config.keywords.length < 3) {
    reasons.push('Weniger als 3 Keywords gesetzt');
  }

  const level = reasons.length >= 3 ? 'high' : reasons.length >= 1 ? 'medium' : 'low';
  return {
    level,
    structuredPageShare: Math.round(share * 100),
    reasons,
    advice:
      level === 'low'
        ? 'Gute Ausgangslage: strukturierte Seiten, Beschreibung und Keywords sind gesetzt.'
        : 'Mehr strukturierte Seiten (Übungen, Prompts, Datums-Header) und eine ausführlichere Beschreibung senken das Risiko verlängerter Prüfungen.',
  };
}

/** Kompaktes Gesamturteil für den Preflight. */
export function complianceReport(config, plan) {
  const trademark = scanTrademarks(config);
  const hype = scanHype(config);
  const ai = aiDisclosure(config);
  const lowContent = lowContentRisk(config, plan);
  const blockers = [];
  if (!trademark.clean) blockers.push(`Markenfund: ${trademark.hits.join(', ')}`);
  if (lowContent.level === 'high') blockers.push('Low-Content-Risiko hoch');

  return {
    status: blockers.length ? 'review' : 'pass',
    blockers,
    warnings: hype.hits.length ? [`Werbesprache gefunden: ${hype.hits.join(', ')}`] : [],
    trademark,
    hype,
    aiDisclosure: ai,
    lowContent,
    disclaimer:
      'Diese Prüfung ist eine Vorstufe, keine Freigabe. Verbindlich sind die KDP-Richtlinien und die Prüfung im Dashboard.',
  };
}
