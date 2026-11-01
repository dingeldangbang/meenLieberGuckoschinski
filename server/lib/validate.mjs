/** Eingabe-Validierung ohne externe Abhängigkeit. */
import { PAGE_LIMITS, TRIM_SIZES } from './kdp.mjs';
import { GENERATORS, NICHE_PACKS } from './niches.mjs';

const PAPERS = ['white', 'cream', 'color'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const NOTEBOOK_STYLES = ['lined', 'dotted', 'grid'];
const COVER_STYLES = ['navy', 'sage', 'sand', 'crimson', 'mono', 'midnight'];

function str(value, { field, min = 0, max = 500, fallback = '' }) {
  if (value === undefined || value === null) return { value: fallback };
  if (typeof value !== 'string') return { error: `${field} muss Text sein.` };
  const trimmed = value.trim();
  if (trimmed.length < min) return { error: `${field} muss mindestens ${min} Zeichen enthalten.` };
  if (trimmed.length > max) return { error: `${field} darf höchstens ${max} Zeichen enthalten.` };
  return { value: trimmed };
}

/**
 * Prüft und normalisiert eine Buch-Konfiguration.
 * @returns {{ok: true, config: object} | {ok: false, errors: string[]}}
 */
export function validateBookConfig(input = {}) {
  const errors = [];
  const config = {};

  const title = str(input.title, { field: 'Titel', min: 1, max: 200 });
  if (title.error) errors.push(title.error);
  else config.title = title.value || 'Mein neues Buch';

  const subtitle = str(input.subtitle, { field: 'Untertitel', max: 200, fallback: '' });
  if (subtitle.error) errors.push(subtitle.error);
  else config.subtitle = subtitle.value;

  const author = str(input.author, { field: 'Autor', min: 1, max: 100 });
  if (author.error) errors.push(author.error);
  else config.author = author.value || 'Unbekannt';

  const description = str(input.description, { field: 'Beschreibung', max: 4000, fallback: '' });
  if (description.error) errors.push(description.error);
  else config.description = description.value;

  config.generator = input.generator ?? 'sudoku';
  if (!GENERATORS[config.generator]) errors.push(`Unbekannter Buch-Typ: ${input.generator}`);

  config.difficulty = input.difficulty ?? 'medium';
  if (!DIFFICULTIES.includes(config.difficulty)) errors.push('Schwierigkeit muss easy, medium oder hard sein.');

  const pageCount = Number(input.pageCount ?? 120);
  if (!Number.isFinite(pageCount)) {
    errors.push('Seitenzahl muss eine Zahl sein.');
  } else if (pageCount < PAGE_LIMITS.min || pageCount > PAGE_LIMITS.max) {
    errors.push(`Seitenzahl muss zwischen ${PAGE_LIMITS.min} und ${PAGE_LIMITS.max} liegen.`);
  } else {
    // KDP druckt in Bögen - gerade Seitenzahl ist Pflicht
    config.pageCount = Math.round(pageCount / 2) * 2;
  }

  config.trim = input.trim ?? '6x9';
  if (!TRIM_SIZES[config.trim]) errors.push(`Unbekanntes Format: ${input.trim}`);

  config.paper = input.paper ?? 'white';
  if (!PAPERS.includes(config.paper)) errors.push('Papierart muss white, cream oder color sein.');
  if (config.paper === 'color') errors.push('Papierart "color" ist nicht verfügbar: Die Buchmaschine erzeugt Schwarzweiß-Innenleben.');

  config.seed = typeof input.seed === 'string' && input.seed.trim() ? input.seed.trim().slice(0, 64) : 'buchmaschine-1';

  const price = Number(input.priceEur ?? 9.99);
  if (!Number.isFinite(price) || price < 0.99 || price > 250) {
    errors.push('Verkaufspreis muss zwischen 0,99 € und 250 € liegen.');
  } else {
    config.priceEur = Math.round(price * 100) / 100;
  }

  config.nicheId = input.nicheId ?? 'raetsel-senioren';
  const niche = NICHE_PACKS.find((n) => n.id === config.nicheId);
  if (!niche) errors.push(`Unbekannte Nische: ${input.nicheId}`);

  config.theme = input.theme ?? (niche ? niche.id : 'generic');
  config.notebookStyle = NOTEBOOK_STYLES.includes(input.notebookStyle) ? input.notebookStyle : 'lined';
  config.coverStyle = COVER_STYLES.includes(input.coverStyle) ? input.coverStyle : 'navy';

  const rawKeywords = Array.isArray(input.keywords) ? input.keywords : [];
  const keywords = [...new Set(rawKeywords.map((k) => String(k).trim()).filter(Boolean))];
  if (keywords.length > 7) errors.push('Amazon KDP erlaubt maximal 7 Keyword-Phrasen.');
  config.keywords = keywords.slice(0, 7).map((k) => k.slice(0, 50));

  const rawCategories = Array.isArray(input.categories) ? input.categories : [];
  config.categories = rawCategories.map((c) => String(c).trim()).filter(Boolean).slice(0, 3);
  if (!config.categories.length) {
    config.categories = (input.category ? [String(input.category)] : ['Krimis & Rätsel > Rätsel']).slice(0, 3);
  }

  config.wordCategories = Array.isArray(input.wordCategories) && input.wordCategories.length
    ? input.wordCategories.map(String)
    : ['tiere', 'garten', 'kueche'];
  config.wordsPerPuzzle = Math.min(20, Math.max(6, Number(input.wordsPerPuzzle ?? 12) || 12));
  config.chapterLimit = Math.min(20, Math.max(1, Number(input.chapterLimit ?? 12) || 12));

  if (errors.length) return { ok: false, errors };
  return { ok: true, config };
}
