/** Projekt-Speicher: lokale JSON-Datei, keine Cloud, kein Konto. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.BUCHMASCHINE_DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'projects.json');
const MAX_PROJECTS = 200;

async function readAll() {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

async function writeAll(projects) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(projects, null, 2), 'utf8');
  await fs.rename(tmp, FILE);
}

export async function listProjects() {
  const projects = await readAll();
  return projects.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function saveProject(input) {
  const projects = await readAll();
  const now = new Date().toISOString();
  const id = input.id && projects.some((p) => p.id === input.id) ? input.id : crypto.randomUUID();
  const existing = projects.find((p) => p.id === id);
  const record = {
    id,
    name: String(input.name || input.config?.title || 'Unbenannt').slice(0, 120),
    config: input.config,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const next = existing ? projects.map((p) => (p.id === id ? record : p)) : [...projects, record];
  await writeAll(next.slice(-MAX_PROJECTS));
  return record;
}

export async function deleteProject(id) {
  const projects = await readAll();
  const next = projects.filter((p) => p.id !== id);
  if (next.length === projects.length) return false;
  await writeAll(next);
  return true;
}

export async function getProject(id) {
  const projects = await readAll();
  return projects.find((p) => p.id === id) ?? null;
}

/**
 * Importiert Projekte aus einer zuvor exportierten JSON-Datei.
 *
 * Akzeptiert drei Formen, weil alle drei im Umlauf sind:
 *   - ein einzelnes Projekt `{ name, config }`
 *   - ein Array von Projekten
 *   - das Dashboard-Format `{ projects: [...] }`
 *
 * Der Import ist idempotent über `id`: existiert die ID schon, wird der Datensatz
 * aktualisiert statt verdoppelt. Einträge ohne `config` werden übersprungen und
 * im Ergebnis gemeldet – lieber eine klare Zahl als ein halber Import.
 */
export async function importProjects(payload, { overwrite = true } = {}) {
  const raw = Array.isArray(payload) ? payload : payload?.projects ?? [payload];
  const candidates = raw.filter((entry) => entry && typeof entry === 'object' && entry.config);
  const existing = await readAll();
  const byId = new Map(existing.map((project) => [project.id, project]));
  const now = new Date().toISOString();

  const imported = [];
  let skipped = raw.length - candidates.length;

  for (const entry of candidates) {
    const id = typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID();
    const current = byId.get(id);
    if (current && !overwrite) {
      skipped += 1;
      continue;
    }
    const record = {
      id,
      name: String(entry.name || entry.config?.title || 'Unbenannt').slice(0, 120),
      config: entry.config,
      createdAt: current?.createdAt ?? entry.createdAt ?? now,
      updatedAt: now,
    };
    byId.set(id, record);
    imported.push(record);
  }

  if (imported.length) {
    const next = [...byId.values()].slice(-MAX_PROJECTS);
    await writeAll(next);
  }

  return { imported: imported.length, skipped, projects: imported };
}
