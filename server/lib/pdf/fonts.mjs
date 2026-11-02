/**
 * Schrifteinbettung.
 *
 * KDP verlangt eingebettete Schriften. pdf-lib kann mit den Standard-14-Schriften
 * (Helvetica & Co.) keine Fontdatei einbetten - diese PDFs enthalten nur Verweise
 * und werden im Druckprüfer beanstandet. Deshalb liefert die Buchmaschine
 * EB Garamond (SIL Open Font License) als echte TTF mit und bettet sie ein.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { StandardFonts } from 'pdf-lib';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FONT_DIR = path.resolve(here, '..', '..', '..', 'assets', 'fonts');

export const FONT_FILES = {
  regular: 'EBGaramond_400Regular.ttf',
  italic: 'EBGaramond_400Regular_Italic.ttf',
  bold: 'EBGaramond_700Bold.ttf',
};

const cache = new Map();

function readFont(name) {
  if (cache.has(name)) return cache.get(name);
  const file = FONT_FILES[name];
  if (!file) throw new Error(`Unbekannte Schrift: ${name}`);
  const bytes = readFileSync(path.join(FONT_DIR, file));
  cache.set(name, bytes);
  return bytes;
}

export function fontsAvailable() {
  try {
    Object.keys(FONT_FILES).forEach(readFont);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ligaturen abschalten.
 *
 * pdf-lib übernimmt die Standard-Ligaturen der Schrift (fl, ff, fi ...) und
 * schreibt dafür ein eigenes Zeichen ins PDF. Beim Kopieren, Suchen und in der
 * KDP-Druckvorprüfung kommt dann Buchstabensalat an ("Oberflaeche" wird zu
 * "Oberfl?che"). Ohne Ligaturen bleibt der Text zeichengetreu.
 */
export const LAYOUT_FEATURES = { liga: false, clig: false, rlig: false, dlig: false, hlig: false, calt: false };

/**
 * Bettet die Buchschriften in ein PDF-Dokument ein.
 * Fällt auf die Standard-14-Schriften zurück, falls die Dateien fehlen -
 * dann meldet der Preflight fehlende Einbettung.
 */
export async function embedBookFonts(doc) {
  if (fontsAvailable()) {
    doc.registerFontkit(fontkit);
    // Drei Schnitte genügen: Regular, Italic, Bold. Halbfett wird auf Bold gelegt,
    // damit nur drei Fontprogramme im PDF landen.
    const [regular, italic, bold] = await Promise.all([
      doc.embedFont(readFont('regular'), { features: LAYOUT_FEATURES }),
      doc.embedFont(readFont('italic'), { features: LAYOUT_FEATURES }),
      doc.embedFont(readFont('bold'), { features: LAYOUT_FEATURES }),
    ]);
    return {
      body: regular,
      bodyBold: bold,
      bodyHeavy: bold,
      bodyItalic: italic,
      sans: regular,
      sansBold: bold,
      embedded: true,
    };
  }

  const [helvetica, helveticaBold, times, timesBold, timesItalic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.TimesRoman),
    doc.embedFont(StandardFonts.TimesRomanBold),
    doc.embedFont(StandardFonts.TimesRomanItalic),
  ]);
  return {
    body: times,
    bodyBold: timesBold,
    bodyHeavy: timesBold,
    bodyItalic: timesItalic,
    sans: helvetica,
    sansBold: helveticaBold,
    embedded: false,
  };
}
