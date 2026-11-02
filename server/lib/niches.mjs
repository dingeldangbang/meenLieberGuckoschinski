/**
 * Nischen-Datenbank und Keyword-Werkstatt.
 *
 * Die Nischen-Pakete sind redaktionell kuratierte Startpunkte für den
 * deutschen Markt: Suchbegriffe, Kategorien, Preisanker und passender
 * Buch-Generator. Die Nachfrage-/Wettbewerbs-Indizes sind heuristische
 * Einschätzungen (0-100), keine Live-Daten von Amazon.
 */

export const GENERATORS = {
  sudoku: { label: 'Sudoku-Buch', hint: 'Mathematisch eindeutige Rätsel, 0 KI-Token' },
  wordsearch: { label: 'Wortsuchrätsel', hint: 'Themen-Gitter mit Lösungsteil' },
  maze: { label: 'Labyrinth-Buch', hint: 'Perfekte Labyrinthe, garantiert lösbar' },
  journal: { label: 'Geführtes Journal', hint: 'Tagesprompts und Schreiblinien' },
  workbook: { label: 'Übungsbuch / Workbook', hint: 'Kapitel mit Reflexionsübungen' },
  notebook: { label: 'Notizbuch (Low Content)', hint: 'Liniert, punktiert oder blanko' },
};

export const NICHE_PACKS = [
  {
    id: 'raetsel-senioren',
    name: 'Rätsel für Senioren',
    audience: 'Best Agers 65+, Geschenkkäufer (Kinder/Enkel)',
    description:
      'Große Schrift, klare Gitter, keine Überforderung. Der stärkste Dauerbrenner im deutschen Rätselmarkt, weil Käufer regelmäßig nachkaufen.',
    generator: 'sudoku',
    trim: '8.5x11',
    pageCount: 134,
    priceEur: 9.99,
    difficulty: 'easy',
    competition: 'medium',
    demandIndex: 82,
    categories: ['Krimis & Rätsel > Rätsel', 'Ratgeber > Gesundheit & Alter'],
    keywords: [
      { term: 'rätselbuch für senioren', demand: 88, competition: 44 },
      { term: 'sudoku großdruck', demand: 84, competition: 51 },
      { term: 'rätselheft senioren große schrift', demand: 76, competition: 33 },
      { term: 'gedächtnistraining senioren buch', demand: 71, competition: 48 },
      { term: 'geschenk für oma', demand: 79, competition: 62 },
      { term: 'rätsel gegen langeweile', demand: 63, competition: 38 },
      { term: 'seniorenbeschäftigung buch', demand: 58, competition: 29 },
      { term: 'denksport für rentner', demand: 54, competition: 26 },
    ],
  },
  {
    id: 'raetsel-kinder',
    name: 'Rätselblock für Kinder',
    audience: 'Eltern, Großeltern, Kinder 8-12',
    description:
      'Rätselblöcke sind Klassiker für Autofahrten und Ferien. Wichtig: Altersangabe im Untertitel und ein Lösungsteil.',
    generator: 'wordsearch',
    trim: '6x9',
    pageCount: 118,
    priceEur: 7.99,
    difficulty: 'easy',
    competition: 'high',
    demandIndex: 90,
    categories: ['Kinderbücher > Beschäftigungsbücher', 'Kinderbücher > Rätsel & Quiz'],
    keywords: [
      { term: 'rätselbuch kinder ab 8', demand: 92, competition: 68 },
      { term: 'wortsuchrätsel für kinder', demand: 74, competition: 47 },
      { term: 'rätselblock ab 10 jahre', demand: 81, competition: 59 },
      { term: 'beschäftigung für autoreise kinder', demand: 66, competition: 41 },
      { term: 'ferienrätsel grundschule', demand: 59, competition: 34 },
      { term: 'suchbilder kinder buch', demand: 61, competition: 44 },
      { term: 'geschenk einschulung', demand: 72, competition: 64 },
    ],
  },
  {
    id: 'humor-geschenk-knacker',
    name: 'Humor-Geschenkbuch für Männer 60+',
    audience: 'Kinder/Partner als Geschenkkäufer, Männer 55-75',
    description:
      'Der Klassiker aus dem Umfeld "111 Wege, kein meckernder alter Knacker zu werden": kurze Sprüche, Kapitel zum Weiterblättern und Rätsel-Einlagen. Extrem geschenkfähig, schwankt aber saisonal (Vatertag, Weihnachten).',
    generator: 'workbook',
    trim: '6x9',
    pageCount: 134,
    priceEur: 12.99,
    difficulty: 'medium',
    competition: 'medium',
    demandIndex: 74,
    categories: ['Humor > Humor & Unterhaltung', 'Geschenkbücher'],
    keywords: [
      { term: 'geschenk für männer 60', demand: 86, competition: 55 },
      { term: 'lustiges buch für rentner', demand: 78, competition: 42 },
      { term: 'geschenk vatertag', demand: 89, competition: 71 },
      { term: 'alt werden mit humor', demand: 64, competition: 31 },
      { term: 'knackerbuch', demand: 58, competition: 22 },
      { term: 'ruhestand geschenk', demand: 83, competition: 66 },
      { term: 'sprüchebuch für männer', demand: 55, competition: 37 },
    ],
  },
  {
    id: 'overthinking-workbook',
    name: 'Overthinking / Grübeln Workbook',
    audience: 'Frauen und Männer 25-45, Selbsthilfe-Käufer',
    description:
      'Selbsthilfe mit Übungscharakter verkauft sich deutlich besser als reine Theorie. Die Buchmaschine erzeugt Kapitelstruktur, Übungsseiten und Reflexionslinien - den Text ergänzt du.',
    generator: 'workbook',
    trim: '6x9',
    pageCount: 134,
    priceEur: 14.99,
    difficulty: 'medium',
    competition: 'medium',
    demandIndex: 71,
    categories: ['Ratgeber > Persönlichkeit & Selbsthilfe', 'Ratgeber > Stressbewältigung'],
    keywords: [
      { term: 'overthinking buch deutsch', demand: 67, competition: 39 },
      { term: 'grübeln stoppen', demand: 58, competition: 27 },
      { term: 'selbsthilfe workbook', demand: 63, competition: 45 },
      { term: 'angst loslassen übungen buch', demand: 61, competition: 49 },
      { term: 'innerer frieden buch', demand: 56, competition: 43 },
      { term: 'achtsamkeit übungen für zuhause', demand: 68, competition: 58 },
      { term: 'journal für mehr selbstvertrauen', demand: 52, competition: 33 },
    ],
  },
  {
    id: 'achtsamkeit-journal',
    name: 'Achtsamkeits-Journal',
    audience: 'Frauen 25-50, Journaling-Community',
    description:
      'Journale funktionieren über die Optik. Die Buchmaschine liefert Struktur, Tagesprompts und Linien; Umschlagdesign und Titel entscheiden über den Klick.',
    generator: 'journal',
    trim: '6x9',
    pageCount: 120,
    priceEur: 11.99,
    difficulty: 'medium',
    competition: 'high',
    demandIndex: 78,
    categories: ['Ratgeber > Achtsamkeit', 'Kreatives Schreiben & Journaling'],
    keywords: [
      { term: 'achtsamkeitstagebuch', demand: 61, competition: 38 },
      { term: 'journal für dankbarkeit', demand: 72, competition: 54 },
      { term: '5 minuten journal deutsch', demand: 77, competition: 61 },
      { term: 'tagebuch zum ausfüllen', demand: 69, competition: 52 },
      { term: 'selbstfindung journal', demand: 55, competition: 31 },
      { term: 'bullet journal vorlage buch', demand: 64, competition: 57 },
    ],
  },
  {
    id: 'labyrinthe-gross',
    name: 'Labyrinthe & Denksport Großformat',
    audience: 'Rätselfans 10+, Erwachsene',
    description:
      'Labyrinthe sind rechnerisch erzeugbar, haben aber wenig Konkurrenz in guter Qualität. Im Großformat (8.5×11) wirken sie wertig.',
    generator: 'maze',
    trim: '8.5x11',
    pageCount: 110,
    priceEur: 9.99,
    difficulty: 'medium',
    competition: 'low',
    demandIndex: 58,
    categories: ['Krimis & Rätsel > Rätsel', 'Kinderbücher > Rätsel & Quiz'],
    keywords: [
      { term: 'labyrinthe buch erwachsene', demand: 57, competition: 29 },
      { term: 'irrgarten rätselbuch', demand: 48, competition: 21 },
      { term: 'denksport buch großformat', demand: 53, competition: 34 },
      { term: 'konzentrationsübungen kinder', demand: 62, competition: 46 },
      { term: 'rätselbuch für kopf und auge', demand: 41, competition: 18 },
    ],
  },
  {
    id: 'hundetraining',
    name: 'Hundetraining & Beschäftigung',
    audience: 'Hundebesitzer, Ersthund-Käufer',
    description:
      'Sehr kaufkräftige Zielgruppe, hohe Wiederkäuferquote. Als Workbook mit Trainingsplänen und Protokollseiten umsetzbar.',
    generator: 'workbook',
    trim: '6x9',
    pageCount: 128,
    priceEur: 13.99,
    difficulty: 'medium',
    competition: 'low',
    demandIndex: 66,
    categories: ['Ratgeber > Haustiere', 'Ratgeber > Hundeerziehung'],
    keywords: [
      { term: 'hundetraining buch anfänger', demand: 64, competition: 41 },
      { term: 'hundebeschäftigung für zuhause', demand: 58, competition: 33 },
      { term: 'welpe erziehung buch', demand: 71, competition: 55 },
      { term: 'hundetricks buch', demand: 49, competition: 28 },
      { term: 'hundetraining protokoll', demand: 37, competition: 14 },
    ],
  },
  {
    id: 'notizbuch-low-content',
    name: 'Notizbuch / Low Content (Einstieg)',
    audience: 'Alle - Geschenk- und Bürobedarf',
    description:
      'Schnellster Weg zum ersten veröffentlichten Buch, aber der höchste Wettbewerb. Nur mit klarer Nische im Titel (Beruf, Hobby, Anlass) sinnvoll.',
    generator: 'notebook',
    trim: '6x9',
    pageCount: 120,
    priceEur: 6.99,
    difficulty: 'easy',
    competition: 'very-high',
    demandIndex: 85,
    categories: ['Büro & Schreibwaren > Notizbücher'],
    keywords: [
      { term: 'notizbuch a5 kariert', demand: 74, competition: 88 },
      { term: 'geschenk für kollegen notizbuch', demand: 57, competition: 62 },
      { term: 'tagebuch ohne linien', demand: 46, competition: 51 },
      { term: 'arbeitsbuch für pflegekräfte', demand: 39, competition: 24 },
      { term: 'hundehalter notizbuch', demand: 31, competition: 17 },
    ],
  },
];

export function listNiches() {
  return NICHE_PACKS.map((pack) => ({
    ...pack,
    generatorLabel: GENERATORS[pack.generator]?.label ?? pack.generator,
    keywordCount: pack.keywords.length,
    opportunity: nicheOpportunity(pack),
  }));
}

export function getNiche(id) {
  const pack = NICHE_PACKS.find((n) => n.id === id);
  if (!pack) throw new Error(`Unbekannte Nische: ${id}`);
  return pack;
}

const COMPETITION_FACTOR = {
  low: 1,
  medium: 0.72,
  high: 0.5,
  'very-high': 0.34,
};

/** Chancen-Score 0-100: Nachfrage gegen Wettbewerb und Preisstärke. */
export function nicheOpportunity(pack) {
  const factor = COMPETITION_FACTOR[pack.competition] ?? 0.6;
  const keywordAvg = pack.keywords.length
    ? pack.keywords.reduce((sum, k) => sum + k.demand, 0) / pack.keywords.length
    : 0;
  const score = keywordAvg * 0.55 * factor + pack.demandIndex * 0.25 * factor + Math.min(pack.priceEur, 20) * 0.6;
  return Math.round(Math.min(100, score));
}

/** Einzelbewertung eines Suchbegriffs. */
export function keywordScore({ term, demand = 50, competition = 50 }) {
  const words = term.trim().split(/\s+/).length;
  // Longtail-Formulierungen (4+ Wörter) haben strukturell weniger Wettbewerb
  const longtailBonus = Math.min(12, Math.max(0, words - 3) * 4);
  const effectiveCompetition = Math.max(5, competition - longtailBonus);
  const score = Math.round((demand / Math.max(effectiveCompetition, 5)) * 100);
  return {
    term,
    demand,
    competition,
    effectiveCompetition,
    longtail: words >= 4,
    score,
    verdict: score >= 150 ? 'stark' : score >= 100 ? 'solide' : score >= 60 ? 'nischig' : 'schwach',
  };
}

const MODIFIERS = {
  audience: ['für senioren', 'für kinder ab 8', 'für erwachsene', 'für anfänger', 'für männer', 'für frauen', 'für rentner'],
  format: ['großdruck', 'große schrift', 'als geschenk', 'zum ausfüllen', 'mit lösungen', 'band 1'],
};

/**
 * Keyword-Werkstatt: erzeugt aus einem Nischen-Stamm lange Suchphrasen.
 * Deterministisch, ohne externe API - ideal als Basis für die 7 KDP-Slots.
 */
export function buildKeywordIdeas(seed = '', { limit = 24 } = {}) {
  const base = String(seed).trim().toLowerCase();
  const words = base.split(/\s+/).filter(Boolean);
  const stems = [];
  if (words.length) {
    stems.push(base);
    for (let i = 1; i < words.length; i += 1) stems.push(words.slice(0, i + 1).join(' '));
  }
  const ideas = [];
  const push = (term, demand, competition) => {
    if (!term || ideas.some((i) => i.term === term)) return;
    ideas.push(keywordScore({ term, demand, competition }));
  };

  for (const stem of stems) {
    push(stem, 45 + Math.min(stem.length, 30), 58);
    for (const mod of MODIFIERS.audience) push(`${stem} ${mod}`, 40, 26);
    for (const mod of MODIFIERS.format) push(`${stem} ${mod}`, 36, 22);
  }
  // Nach Score sortieren, damit die stärksten Vorschläge oben stehen
  return ideas.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Titelvorschläge je Nische - als Startpunkt, nicht als fertige Lösung. */
export const SAMPLE_TITLES = {
  'raetsel-senioren': {
    title: 'Große Rätsel für kluge Köpfe',
    subtitle: 'Sudoku in Großdruck mit Lösungen - entspannt knobeln ohne Brille',
  },
  'raetsel-kinder': {
    title: 'Wortsuche für Weltentdecker',
    subtitle: 'Rätselblock für Kinder ab 8 Jahren - mit allen Lösungen',
  },
  'humor-geschenk-knacker': {
    title: '111 Wege, kein meckernder alter Knacker zu werden',
    subtitle: 'Das humorvolle Übungsbuch für Männer mit Zeit, Meinung und Werkzeugkiste',
  },
  'overthinking-workbook': {
    title: 'Stille im Kopf',
    subtitle: 'Das Übungsbuch gegen Grübeln - mit Reflexionsseiten für 8 Wochen',
  },
  'achtsamkeit-journal': {
    title: 'Fünf Minuten für mich',
    subtitle: 'Das Achtsamkeits-Journal mit Tagesfragen und Wochenrückblick',
  },
  'labyrinthe-gross': {
    title: 'Irrgarten-Werkstatt',
    subtitle: 'Labyrinthe in Großformat - vom leichten Weg bis zur echten Sackgasse',
  },
  hundetraining: {
    title: 'Trainingsbuch für den Hund',
    subtitle: 'Übungspläne, Protokollseiten und Trainingsideen für jeden Tag',
  },
  'notizbuch-low-content': {
    title: 'Einfach notiert',
    subtitle: 'Notizbuch mit Seitenzahlen und Platz für alles, was bleiben soll',
  },
};

export function sampleTitleFor(nicheId) {
  return SAMPLE_TITLES[nicheId] ?? { title: 'Mein neues Buch', subtitle: 'Ein Projekt der Buchmaschine' };
}
