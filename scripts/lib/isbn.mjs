/**
 * ISBN-Prüfung und -Normalisierung.
 *
 * Warum das ein eigenes Modul ist: ONIX, DNB-Ablieferung und KDP-Metadaten
 * hängen alle an einer gültigen ISBN. Eine falsche Prüfziffer fällt erst bei
 * der Meldung auf – nach dem Druck. Deshalb wird hier vor dem Bau geprüft.
 *
 * Regeln:
 *  - ISBN-13: 13 Ziffern, gewichtete Quersumme (1,3,1,3…), Prüfziffer = 10 − Rest.
 *  - ISBN-10: 10 Zeichen, letzte Stelle darf X sein (Wert 10), Gewichte 10…1.
 *  - Bindestriche und Leerzeichen werden entfernt, "ISBN" wird toleriert.
 *  - Platzhalter (z. B. 9780000000000) werden abgelehnt, auch wenn die Prüfziffer
 *    zufällig stimmt: eine erfundene ISBN gehört einem anderen Verlag.
 *
 * Was dieses Modul *nicht* kann: prüfen, ob die ISBN wirklich vergeben und ob
 * sie dir zugeteilt ist. In Deutschland vergibt die ISBN-Agentur (MVB) die
 * Nummernkreise; eine ISBN ist immer an einen Verlag gebunden.
 */

const PLACEHOLDER_BLOCKS = new Set([
  '9780000000000',
  '9790000000000',
  '9783982000000',
]);

/** Entfernt Trennzeichen und ein führendes "ISBN(-13/-10)". */
export function strip(value) {
  return String(value ?? '')
    .replace(/^\s*isbn[- ]?(1[03])?:?/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/** Prüfziffer einer ISBN-13 (EAN-13) berechnen. */
export function isbn13CheckDigit(twelveDigits) {
  const digits = String(twelveDigits).replace(/\D/g, '');
  if (digits.length !== 12) throw new Error('Für die Prüfziffer werden genau 12 Ziffern gebraucht.');
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

/** Prüfziffer einer ISBN-10 berechnen (Rückgabe: '0'…'9' oder 'X'). */
export function isbn10CheckCharacter(nineDigits) {
  const digits = String(nineDigits).replace(/\D/g, '');
  if (digits.length !== 9) throw new Error('Für die Prüfziffer werden genau 9 Ziffern gebraucht.');
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * Prüft eine ISBN und liefert normalisierte Formen.
 * @param {string} value
 * @returns {{ok:boolean, isbn13?:string, isbn10?:string|null, reason?:string, checkDigit?:string}}
 */
export function validateIsbn(value) {
  const raw = strip(value);
  if (!raw) return { ok: false, reason: 'Keine ISBN angegeben.' };

  if (/^\d{13}$/.test(raw)) {
    const expected = isbn13CheckDigit(raw.slice(0, 12));
    if (Number(raw[12]) !== expected) {
      return {
        ok: false,
        reason: `Prüfziffer falsch: ${raw} endet auf ${raw[12]}, korrekt wäre ${expected} (${raw.slice(0, 12)}${expected}).`,
        checkDigit: String(expected),
      };
    }
    if (PLACEHOLDER_BLOCKS.has(raw) || /^97[89]0{10}$/.test(raw)) {
      return { ok: false, reason: `${raw} ist ein Platzhalter, keine vergebene ISBN.` };
    }
    if (!/^97[89]/.test(raw)) {
      return { ok: false, reason: `${raw} beginnt nicht mit 978/979 und ist keine ISBN-13.` };
    }
    return { ok: true, isbn13: raw, isbn10: toIsbn10(raw), checkDigit: String(expected) };
  }

  if (/^\d{9}[\dX]$/.test(raw)) {
    const expected = isbn10CheckCharacter(raw.slice(0, 9));
    if (raw[9] !== expected) {
      return {
        ok: false,
        reason: `Prüfzeichen falsch: ${raw} endet auf ${raw[9]}, korrekt wäre ${expected}.`,
        checkDigit: expected,
      };
    }
    const isbn13 = `978${raw.slice(0, 9)}`;
    return { ok: true, isbn13: `${isbn13}${isbn13CheckDigit(isbn13)}`, isbn10: raw, checkDigit: expected };
  }

  return { ok: false, reason: `"${value}" hat weder 13 (ISBN-13) noch 10 (ISBN-10) gültige Zeichen.` };
}

/** ISBN-13 → ISBN-10 (nur für 978er Blöcke möglich). */
export function toIsbn10(isbn13) {
  const digits = strip(isbn13);
  if (!/^978\d{10}$/.test(digits)) return null;
  const nine = digits.slice(3, 12);
  return `${nine}${isbn10CheckCharacter(nine)}`;
}

/** ISBN-10 → ISBN-13. */
export function toIsbn13(isbn10) {
  const digits = strip(isbn10).replace(/X$/, '');
  if (!/^\d{9}$/.test(digits)) return null;
  const twelve = `978${digits}`;
  return `${twelve}${isbn13CheckDigit(twelve)}`;
}

/** Bindestrich-Darstellung ist ohne Agentur-Daten nur grob möglich – bewusst weggelassen. */
export function formatIsbn(value) {
  const result = validateIsbn(value);
  return result.ok ? result.isbn13 : null;
}
