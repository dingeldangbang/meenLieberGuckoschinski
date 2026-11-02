# To-do: fehlende Teile

Stand: 2. November 2026 · Branch `arena/82eb4e86-meenlieberguckoschinski`

Diese Liste ist das Ergebnis einer vollständigen Bestandsaufnahme: jede Zeile ist
gegen den Code geprüft (Datei, Verhalten, Test), nicht geschätzt. Alle Einträge mit
P0–P2 sind abgearbeitet; die P3-Zeilen sind bewusste Entscheidungen und bleiben
offen, weil sie außerhalb des Codes liegen (Konten, Verträge, Default-Branch).

Legende: **P0** = Fehler, den ein Nutzer merkt · **P1** = fehlende Absicherung ·
**P2** = fehlende Bequemlichkeit · **P3** = bewusst offen (dokumentiert).

| ID | Prio | Fehlender Teil | Beleg | Status |
| --- | --- | --- | --- | --- |
| S1 | P0 | SPA-Fallback liefert **HTTP 200 + HTML** für fehlende Dateien (`/gibtsnicht.js`) | `server/index.mjs` `serveStatic` fängt jeden Fehler und liefert `index.html` | erledigt |
| S2 | P0 | **HEAD**-Requests bekommen einen Body | `serveStatic` ruft immer `res.end(data)` | erledigt |
| S3 | P1 | Keine **Security-Header** (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) | `grep` in `server/index.mjs`: keine Treffer | erledigt |
| S4 | P1 | Keine **Cache-Strategie**: alles `no-cache`, kein `ETag`/`304` | `serveStatic`: `Cache-Control: no-cache`, kein `ETag` | erledigt |
| S5 | P1 | Kein **Rate-Limit** auf den teuren Export-Routen (PDF-Rendern pro Request) | keine Begrenzung in `handleApi` | erledigt |
| S6 | P2 | Kein `robots.txt` (App ist lokal, Crawler unnötig) | `public/` enthält nur drei Dateien | erledigt |
| A1 | P1 | Kein **Skip-Link** zum Hauptinhalt | `public/index.html`: kein `Zum Inhalt` | erledigt |
| A2 | P1 | Kein **automatischer A11y-Test** (Struktur, Labels, Alt-Texte) | `tests/`: kein A11y-Test | erledigt |
| A3 | P1 | **Kontrast** der Farbpalette nie nachgerechnet (WCAG AA 4,5:1) | CSS-Variablen ungeprüft | erledigt |
| A4 | P2 | Export-Meldungen (`#export-note`) werden nicht angekündigt | kein `aria-live` am Element | erledigt |
| P1 | P1 | **Performance-Budget** (<200 KB gzip) nicht geprüft | kein Test; Ist: 21 KB gzip | erledigt |
| P2 | P2 | Kein **Import** gespeicherter Projekte (nur Anlegen/Löschen) | `store.mjs` hat kein `importProjects` | erledigt |
| C1 | P1 | Kein **PR-CI**: `publishing-pipeline.yml` läuft nur per Cron/manuell | `.github/workflows/` enthält einen Workflow ohne `pull_request` | erledigt |
| C2 | P2 | Kein **Dependabot** | `.github/dependabot.yml` fehlt | erledigt |
| C3 | P2 | Keine `SECURITY.md` / `CONTRIBUTING.md` / `CHANGELOG.md` | Repo-Wurzel | erledigt |
| E1 | P2 | EPUB ohne `accessMode`/`accessModeSufficient` (EPUB Accessibility 1.1) | `server/lib/epub.mjs` setzt nur `accessibilityFeature` + Summary | erledigt |
| D1 | P1 | Kein Protokoll der offenen Punkte im Repo | diese Datei | erledigt |
| D2 | P3 | Kein automatischer KDP-Upload | bewusst: KDP-ToS | bewusst offen |
| D3 | P3 | Keine DNB-Ablieferung (nur Paket) | kein Hotfolder in dieser Umgebung | bewusst offen |
| D4 | P3 | Kein Creem-Kanal | Datei-Downloads nur im Dashboard | bewusst offen |
| D5 | P3 | Keine Marktforschung/Bildimport/BISAC (Gap A–C der Analyse) | `docs/kdp-engine-analyse.md` §3 | bewusst offen |
| D6 | P3 | Workflow nie remote gelaufen | GitHub registriert Workflows nur aus dem Default-Branch; PR #1 offen | blockiert |

---

## Wie die Abarbeitung geprüft ist

| Punkt | Beweis |
| --- | --- |
| S1, S2 | `tests/server-hardening.test.mjs` – 404 für fehlende Datei mit Endung, leerer HEAD-Body |
| S3 | Header auf `/`, `/app.js`, `/api/health` und im 404-Fall geprüft; CSP ohne `unsafe-inline` |
| S4 | zweite Anfrage mit `If-None-Match` liefert 304, HTML bleibt `no-cache` |
| S5 | 130 Export-Anfragen → 429 mit `Retry-After`; `/api/compliance` bleibt frei |
| S6 | `robots.txt` liefert `Disallow: /` |
| A1–A4 | `tests/a11y.test.mjs` – 12 Prüfungen inkl. Kontrastrechnung mit Gegenprobe |
| P1 | `tests/frontend-budget.test.mjs` – Summe gzip < 200 KB, keine Fremd-Hosts |
| P2 | `tests/import.test.mjs` – 8 Prüfungen für Store und API |
| C1, C2 | `.github/workflows/verify.yml`, `.github/dependabot.yml` (YAML geparst) |
| C3 | `SECURITY.md`, `CONTRIBUTING.md`, `CHANGELOG.md` |
| E1 | `tests/epub.test.mjs` – Accessibility-Metadaten vollständig |

Der Kontrasttest wurde absichtlich gebrochen (`--muted: #6f6f6f`), um zu zeigen,
dass er wirklich rechnet statt nur zu existieren.
