#!/usr/bin/env node
/**
 * Autonomer Deployer für den Digital-Vertrieb (Gumroad).
 *
 *   node scripts/deploy_digital.mjs --manifest artifacts/manifest.json
 *   node scripts/deploy_digital.mjs --manifest artifacts/manifest.json --dry-run
 *   node scripts/deploy_digital.mjs --manifest artifacts/manifest.json --no-publish
 *
 * Warum Gumroad und nicht Payhip: Payhips öffentliche API (`/api/v2`) kann nur
 * Coupons und Lizenzschlüssel verwalten – Produkte lassen sich dort nicht
 * anlegen. Gumroad hat dafür echte Endpunkte (`POST /v2/products`).
 *
 * Sicherheitsregeln:
 *  - Der Token kommt ausschließlich aus `GUMROAD_TOKEN`, nie aus Args oder Datei.
 *  - Er wird nie geloggt; Fehlermeldungen nennen nur Statuscode und Nachricht.
 *  - Ein Paket mit `ok: false` im Manifest (Gate verletzt) wird nie veröffentlicht.
 *  - Idempotent: existiert schon ein Produkt mit demselben Namen, wird es
 *    aktualisiert statt dupliziert – ein erneuter Lauf erzeugt keine zweite
 *    Produktseite (und keine zweite Gebühr).
 *
 * Exit-Codes: 0 = Erfolg/übersprungen, 1 = Fehler, 3 = Token fehlt.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const GUMROAD_API = 'https://api.gumroad.com/v2';

/** Fehler, der einen Abbruch ohne Wiederholung rechtfertigt (z. B. 401). */
export class DeployError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'DeployError';
    this.status = status;
    this.retryable = retryable;
  }
}

const log = (message) => process.stderr.write(`${message}\n`);

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

function gumroadMessage(body) {
  if (!body || typeof body !== 'object') return 'ohne Antwortkörper';
  const message = body.message || body.error || body.raw;
  return message ? String(message).slice(0, 300) : 'ohne Nachricht';
}

/** Zentrale Anfrage-Funktion: prüft Status und wirft sprechende Fehler. */
async function request(fetchImpl, apiBase, method, endpoint, { token, body, headers = {}, form } = {}) {
  const init = {
    method,
    headers: { ...headers },
  };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const response = await fetchImpl(`${apiBase}${endpoint}`, init);
  const parsed = await readJson(response);
  const status = typeof response.status === 'number' ? response.status : response.ok === false ? 500 : 200;
  if (response.ok === false || status >= 400) {
    const retryable = status === 429 || status >= 500;
    throw new DeployError(`Gumroad ${method} ${endpoint} → HTTP ${status}: ${gumroadMessage(parsed)}`, {
      status,
      retryable,
    });
  }
  return parsed;
}

/** Sucht ein Produkt mit exakt diesem Namen (Idempotenz). */
export async function findProductByName(name, { token, fetchImpl = fetch, apiBase = GUMROAD_API }) {
  const body = await request(fetchImpl, apiBase, 'GET', '/products', { token });
  const products = Array.isArray(body.products) ? body.products : [];
  const match = products.find((entry) => entry?.name === name);
  return match ?? null;
}

/**
 * Lädt eine Datei an ein Produkt.
 * Primär: `POST /v2/products/:id/product_files` (multipart).
 * Fallback: Presign-Flow (`POST /v2/files/presign`) plus `PUT /v2/products/:id`
 * mit `files[][url]` – so beschreibt Gumroad selbst den Upload großer Dateien.
 */
export async function uploadProductFile(productId, file, { token, fetchImpl = fetch, apiBase = GUMROAD_API }) {
  const form = new FormData();
  const blob = new Blob([file.bytes], { type: file.type ?? 'application/pdf' });
  form.append('file', blob, file.name);

  try {
    const body = await request(fetchImpl, apiBase, 'POST', `/products/${productId}/product_files`, { token, form });
    const productFile = body.product_file ?? body.file ?? null;
    return { strategy: 'multipart', productFile };
  } catch (error) {
    if (!(error instanceof DeployError) || ![404, 405, 415].includes(error.status)) throw error;
    log(`upload.multipart_unavailable status=${error.status} → Presign-Flow`);
  }

  // Fallback: Presign + anschließendes Anhängen über die Datei-URL.
  const presign = await request(fetchImpl, apiBase, 'POST', '/files/presign', {
    token,
    body: { filename: file.name, file_size: file.bytes.length },
  });
  const fileUrl = presign.file_url ?? presign.url;
  const parts = presign.parts ?? [];
  if (!fileUrl) throw new DeployError('Presign-Antwort ohne file_url – Upload nicht möglich.');

  for (const part of parts) {
    const upload = await fetchImpl(part.presigned_url, { method: 'PUT', body: file.bytes });
    if (upload.ok === false) {
      throw new DeployError(`S3-Upload von Teil ${part.part_number ?? '?'} fehlgeschlagen (HTTP ${upload.status}).`, {
        status: upload.status,
        retryable: upload.status >= 500,
      });
    }
  }

  await request(fetchImpl, apiBase, 'PUT', `/products/${productId}`, {
    token,
    form: toForm({ 'files[][url]': fileUrl }),
  });
  return { strategy: 'presign', productFile: { url: fileUrl } };
}

/** Form-Encoding für Endpunkte, die `x-www-form-urlencoded` erwarten. */
function toForm(fields) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  return form;
}

/**
 * Legt das Produkt an oder aktualisiert es und hängt die Datei an.
 * @param {{manifest:object, manifestDir:string, token:string, priceCents?:number, publish?:boolean, fetchImpl?:Function, apiBase?:string}} options
 */
export async function deploy(options) {
  const { manifest, manifestDir, token, publish = true, fetchImpl = fetch, apiBase = GUMROAD_API } = options;

  if (!manifest || manifest.ok !== true) {
    throw new DeployError(
      `Manifest nicht freigabefähig (ok=${manifest?.ok}). Gate-Verletzungen werden nicht veröffentlicht: ${
        manifest?.coverAudit?.summary ?? 'siehe Report'
      }`,
    );
  }
  if (!token) {
    throw new DeployError('GUMROAD_TOKEN fehlt – ohne Token wird nichts veröffentlicht.', { status: 401 });
  }

  const priceCents = options.priceCents ?? Math.round(Number(manifest.priceEur ?? 9.99) * 100);
  const manuscriptPath = manifest.files?.manuscript;
  if (!manuscriptPath) throw new DeployError('Manifest nennt keine Buchblock-Datei (files.manuscript).');

  const productFields = {
    name: manifest.title,
    description: [manifest.subtitle, manifest.description].filter(Boolean).join('\n\n'),
    price: priceCents,
    native_type: 'digital',
    price_currency_type: 'eur',
  };

  const existing = await findProductByName(manifest.title, { token, fetchImpl, apiBase });
  let product;
  let action;

  if (existing) {
    // Nur eigene Felder setzen. Gumroad ersetzt bei PUT ganze Sammlungen –
    // deshalb keine fremden Collections (z. B. files) mitschicken.
    const body = await request(fetchImpl, apiBase, 'PUT', `/products/${existing.id}`, {
      token,
      form: toForm(productFields),
    });
    product = body.product ?? existing;
    action = 'updated';
    log(`deploy.product_updated id=${product.id}`);
  } else {
    const body = await request(fetchImpl, apiBase, 'POST', '/products', {
      token,
      form: toForm({ ...productFields, published: false }),
    });
    product = body.product;
    if (!product?.id) throw new DeployError('Produktanlage lieferte keine ID.');
    action = 'created';
    log(`deploy.product_created id=${product.id}`);
  }

  const bytes = new Uint8Array(await readFile(path.join(manifestDir, path.basename(manuscriptPath))));

  const upload = await uploadProductFile(
    product.id,
    { bytes, name: path.basename(manuscriptPath), type: 'application/pdf' },
    { token, fetchImpl, apiBase },
  );
  log(`deploy.file_uploaded strategy=${upload.strategy} bytes=${bytes.length}`);

  if (publish) {
    await request(fetchImpl, apiBase, 'PUT', `/products/${product.id}`, {
      token,
      form: toForm({ published: true }),
    });
    log(`deploy.published id=${product.id}`);
  } else {
    log(`deploy.publish_skipped id=${product.id} (--no-publish)`);
  }

  return {
    action,
    productId: product.id,
    url: product.short_url ?? product.url ?? null,
    fileBytes: bytes.length,
    strategy: upload.strategy,
    published: Boolean(publish),
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
  const manifestPath = path.resolve(args.manifest ?? 'artifacts/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestDir = path.dirname(manifestPath);
  const priceCents = args['price-cents'] === undefined ? undefined : Number(args['price-cents']);

  if (args['dry-run']) {
    const planned = {
      dryRun: true,
      title: manifest.title,
      priceCents: priceCents ?? Math.round(Number(manifest.priceEur ?? 9.99) * 100),
      file: manifest.files?.manuscript ? path.basename(manifest.files.manuscript) : null,
      ok: manifest.ok === true,
      publish: !args['no-publish'],
    };
    process.stdout.write(`${JSON.stringify(planned)}\n`);
    log(`dry_run title="${manifest.title}" ok=${manifest.ok}`);
    return 0;
  }

  const token = process.env.GUMROAD_TOKEN;
  if (!token) {
    log('deploy.skipped reason=GUMROAD_TOKEN_missing');
    process.stdout.write(`${JSON.stringify({ skipped: true, reason: 'GUMROAD_TOKEN missing' })}\n`);
    return 3;
  }

  const result = await deploy({
    manifest,
    manifestDir,
    token,
    priceCents,
    publish: !args['no-publish'],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => {
      process.exitCode = code ?? 0;
    })
    .catch((error) => {
      log(`deploy.failed ${error.message}`);
      process.exitCode = error instanceof DeployError && error.status === 401 ? 3 : 1;
    });
}
