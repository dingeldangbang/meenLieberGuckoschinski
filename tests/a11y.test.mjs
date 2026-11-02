import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Statische Barrierefreiheitsprüfung der Oberfläche.
 *
 * Kein Ersatz für einen Screenreader-Test, aber es fängt genau die Fehler, die
 * man beim Umbauen übersieht: fehlende Sprache, unbenannte Formularfelder,
 * Buttons ohne Typ, Überschriften-Sprünge, Bilder ohne Alt-Text, zu schwache
 * Kontraste. Alles ohne Zusatzabhängigkeit – der Parser ist ein paar Zeilen.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const html = await readFile(path.join(ROOT, 'public/index.html'), 'utf8');
const css = await readFile(path.join(ROOT, 'public/styles.css'), 'utf8');
const appJs = await readFile(path.join(ROOT, 'public/app.js'), 'utf8');

/* ------------------------------ Mini-Parser ------------------------------ */

/** Alle Start-Tags als { name, attrs, raw, index } – Reihenfolge bleibt erhalten. */
function tags(source) {
  const result = [];
  const regex = /<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let match;
  while ((match = regex.exec(source)) !== null) {
    const attrs = {};
    const attrRegex = /([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
    let attr;
    while ((attr = attrRegex.exec(match[2])) !== null) {
      attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? true;
    }
    result.push({ name: match[1].toLowerCase(), attrs, raw: match[0], index: match.index });
  }
  return result;
}

const allTags = tags(html);

/* ------------------------------ Struktur --------------------------------- */

test('a11y: Dokument hat eine Sprache', () => {
  const htmlTag = allTags.find((tag) => tag.name === 'html');
  assert.ok(htmlTag, '<html> fehlt');
  assert.equal(htmlTag.attrs.lang, 'de');
});

test('a11y: genau eine h1 und keine Sprünge in der Überschriftenfolge', () => {
  const levels = allTags.filter((tag) => /^h[1-6]$/.test(tag.name)).map((tag) => Number(tag.name[1]));
  assert.equal(levels.filter((level) => level === 1).length, 1, 'genau eine h1 erwartet');
  assert.equal(levels[0], 1, 'die erste Überschrift muss h1 sein');
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(levels[i] - levels[i - 1] <= 1, `Sprung von h${levels[i - 1]} auf h${levels[i]}`);
  }
});

test('a11y: Skip-Link führt zum Hauptinhalt', () => {
  assert.match(html, /class="skip-link"[^>]*href="#main"/);
  assert.match(html, /<main[^>]*id="main"/);
  assert.match(css, /\.skip-link:focus/, 'Skip-Link braucht einen sichtbaren Fokuszustand');
});

test('a11y: Landmarks vorhanden (main, nav)', () => {
  assert.ok(allTags.some((tag) => tag.name === 'main'));
  assert.ok(allTags.some((tag) => tag.name === 'nav'));
});

/* ----------------------------- Formulare --------------------------------- */

test('a11y: jedes Eingabefeld hat ein Label oder aria-label', () => {
  const ids = new Set(allTags.filter((tag) => tag.attrs.id).map((tag) => tag.attrs.id));
  const labelFor = new Set(
    allTags.filter((tag) => tag.name === 'label' && tag.attrs.for).map((tag) => tag.attrs.for),
  );
  const labelledBy = new Set(
    [...html.matchAll(/aria-labelledby="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/)),
  );

  const fields = allTags.filter((tag) => ['input', 'select', 'textarea'].includes(tag.name));
  assert.ok(fields.length > 10, 'zu wenige Felder gefunden – Parser defekt?');

  for (const field of fields) {
    if (field.attrs.type === 'hidden') continue;
    const viaFor = field.attrs.id && labelFor.has(field.attrs.id);
    const viaLabel = field.attrs['aria-label'] || field.attrs['aria-labelledby'] || field.attrs.title;
    const viaWrapper = (() => {
      // <label class="field">…<input …>…</label>
      const before = html.slice(0, field.index);
      const open = before.lastIndexOf('<label');
      const close = before.lastIndexOf('</label>');
      return open > close;
    })();
    assert.ok(
      viaFor || viaLabel || viaWrapper,
      `Feld ohne Label: ${field.raw.slice(0, 80)}`,
    );
  }
});

test('a11y: Buttons haben einen Typ und sind nicht leer', () => {
  for (const button of allTags.filter((tag) => tag.name === 'button')) {
    assert.equal(button.attrs.type, 'button', `Button ohne type: ${button.raw.slice(0, 60)}`);
  }
  const emptyButtons = [...html.matchAll(/<button[^>]*>\s*<\/button>/g)];
  assert.equal(emptyButtons.length, 0, 'Button ohne zugänglichen Namen');
});

test('a11y: Bilder haben Alternativtext oder sind dekorativ markiert', () => {
  for (const img of allTags.filter((tag) => tag.name === 'img')) {
    assert.ok(
      img.attrs.alt !== undefined || img.attrs['aria-hidden'] === 'true',
      `Bild ohne alt: ${img.raw.slice(0, 80)}`,
    );
  }
});

test('a11y: Statusmeldungen sind als Live-Region ausgezeichnet', () => {
  assert.match(html, /id="status-pill"[^>]*role="status"/);
  assert.match(html, /id="export-note"[^>]*aria-live="polite"/);
  assert.match(html, /id="preflight-result"[^>]*aria-live="polite"/);
});

test('a11y: Modale sind echte <dialog>-Elemente', () => {
  const dialogs = allTags.filter((tag) => tag.name === 'dialog');
  assert.ok(dialogs.length >= 2);
  for (const dialog of dialogs) {
    assert.ok(dialog.attrs.id, '<dialog> ohne id');
  }
});

/* ------------------------------- Kontrast -------------------------------- */

function parseVars(source) {
  const vars = {};
  for (const match of source.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    vars[match[1]] = match[2];
  }
  return vars;
}

function toRgb(hex) {
  let value = hex.replace('#', '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  if (value.length === 8) value = value.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

test('a11y: Kontrast von Text auf Flächen erreicht WCAG AA (4,5:1)', () => {
  const vars = parseVars(css);
  const pairs = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text', 'surface-raised'],
    ['muted', 'bg'],
    ['muted', 'surface'],
    ['accent', 'bg'],
  ];
  const known = pairs.filter(([fg, bg]) => vars[fg] && vars[bg]);
  assert.ok(known.length >= 3, 'zu wenige Farbpaare gefunden');

  for (const [fg, bg] of known) {
    const ratio = contrastRatio(vars[fg], vars[bg]);
    assert.ok(ratio >= 4.5, `${fg} auf ${bg}: ${ratio.toFixed(2)}:1 – unter 4,5:1`);
  }
});

/* ------------------------- Bedienung ohne Maus --------------------------- */

test('a11y: globaler Fokusring und reduzierte Bewegung respektiert', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline/);
  assert.match(css, /prefers-reduced-motion/);
});

test('a11y: Dialoge nutzen showModal (Fokusfalle + Escape kostenlos) und schließen per data-close', () => {
  // showModal() bringt Fokusfalle, Hintergrund-Inert und Escape-Semantik mit –
  // das ist der Grund, warum hier <dialog> statt eines eigenen Overlays steht.
  assert.match(appJs, /showModal\(\)/);
  assert.match(appJs, /\[data-close\]/);
  assert.doesNotMatch(appJs, /\.show\(\)/, 'show() statt showModal() verliert die Fokusfalle');
});
