/**
 * Live-Keywords über die öffentliche Amazon-Autocomplete-Schnittstelle.
 *
 * Die Anfrage läuft serverseitig (kein CORS, kein API-Key). Fällt sie aus -
 * kein Netz, Amazon blockt, Format geändert - greift automatisch die
 * Offline-Keyword-Werkstatt. Der Client sieht immer, woher die Daten kommen.
 */
import { buildKeywordIdeas } from './niches.mjs';

const MARKETPLACES = { de: 'completion.amazon.de', com: 'completion.amazon.com', 'co.uk': 'completion.amazon.co.uk' };
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();
let lastCallAt = 0;
const MIN_INTERVAL_MS = 600; // höflich bleiben: höchstens ~100 Anfragen/Minute

export function parseSuggestions(raw) {
  // Amazon antwortet mit: ["prefix", ["vorschlag 1", ...], ["alias", ...], ...]
  if (!Array.isArray(raw)) return [];
  const list = raw[1];
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((entry) => typeof entry === 'string' && entry.trim()))]
    .map((entry) => entry.trim())
    .slice(0, 12);
}

/** Wertet einen Amazon-Vorschlag ein: Nachfrage/Wettbewerb sind heuristisch, nicht gemessen. */
export function scoreSuggestion(term, index) {
  const words = term.trim().split(/\s+/).length;
  const demand = Math.max(30, 78 - index * 4);
  const competition = Math.max(12, 60 - Math.min(28, (words - 1) * 7) + index);
  const score = Math.round((demand / Math.max(competition, 5)) * 100);
  return {
    term,
    demand,
    competition,
    effectiveCompetition: competition,
    longtail: words >= 4,
    score,
    verdict: score >= 150 ? 'stark' : score >= 100 ? 'solide' : score >= 60 ? 'nischig' : 'schwach',
    source: 'amazon-suggest',
  };
}

export async function fetchAmazonSuggestions(prefix, { marketplace = 'de', timeoutMs = 4000, fetchImpl = fetch } = {}) {
  const host = MARKETPLACES[marketplace];
  const query = String(prefix ?? '').trim();
  if (!host || query.length < 2) return { source: 'invalid', suggestions: [] };

  const cacheKey = `${marketplace}:${query.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { source: 'amazon-suggest', suggestions: cached.suggestions, cached: true };
  }

  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();

  const url = `https://${host}/search/complete?method=completion&mkt=1&client=amazon-search-ui&search-alias=stripbooks&q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'de-DE,de;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    if (!response.ok) return { source: 'amazon-error', suggestions: [], status: response.status };
    const body = await response.json();
    const suggestions = parseSuggestions(body);
    if (!suggestions.length) return { source: 'amazon-empty', suggestions: [] };
    cache.set(cacheKey, { at: Date.now(), suggestions });
    return { source: 'amazon-suggest', suggestions };
  } catch (error) {
    return { source: 'amazon-error', suggestions: [], message: error.name === 'AbortError' ? 'Zeitüberschreitung' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kombiniert Live-Vorschläge mit der Offline-Werkstatt.
 * Bei Ausfall bleibt die App voll funktionsfähig.
 */
export async function keywordResearch(seed, { marketplace = 'de', fetchImpl } = {}) {
  const query = String(seed ?? '').trim();
  const live = await fetchAmazonSuggestions(query, { marketplace, fetchImpl });
  const offline = buildKeywordIdeas(query || 'rätselbuch', { limit: 20 });

  if (live.suggestions.length) {
    const liveIdeas = live.suggestions.map((term, index) => scoreSuggestion(term, index));
    return {
      source: 'amazon-suggest',
      live: true,
      note: 'Live-Vorschläge aus der Amazon-Suche (Bücher). Nachfrage und Wettbewerb sind heuristisch geschätzt.',
      ideas: [...liveIdeas, ...offline.filter((idea) => !live.suggestions.includes(idea.term))].slice(0, 24),
      suggestions: live.suggestions,
    };
  }

  return {
    source: live.source,
    live: false,
    note:
      live.source === 'amazon-error'
        ? `Amazon nicht erreichbar (${live.message ?? 'Netzwerkfehler'}) – Vorschläge aus der Offline-Werkstatt.`
        : 'Keine Live-Treffer – Vorschläge aus der Offline-Werkstatt.',
    ideas: offline,
    suggestions: [],
  };
}

export function clearSuggestCache() {
  cache.clear();
}
