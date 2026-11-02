# Publishing-Pipeline: autonom bauen, prüfen, veröffentlichen

Diese Pipeline erzeugt ohne Handarbeit ein druckfertiges KDP-Paket, prüft es gegen
die KDP-Geometrie und stellt es auf einem Digital-Marktplatz bereit. Sie läuft
vollständig im Free-Tier der GitHub-Actions-Runner und braucht keinen Server.

```
Cron (Di + Fr, 04:00 UTC) / workflow_dispatch
        │
        ▼
scripts/harvest_keywords.mjs   Nische aus dem Datum, Keywords live oder offline
        │                       → artifacts/metadata.json
        ▼
scripts/build_package.mjs      Buchblock rendern → Paritäts-Gate (Vakatseite)
        │                       → Cover mit korrigierter Seitenzahl → Gate 2
        │                       → Preflight → manifest.json
        ▼
scripts/preflight_checker.mjs  unabhängige Nachprüfung der Dateien auf der Platte
        │                       (Cover-Drift ≤ 1 pt, gerade Seitenzahl)
        ▼
scripts/deploy_digital.mjs     Gumroad: Produkt anlegen/aktualisieren, PDF anhängen
        │
        ▼
actions/upload-artifact        KDP-Paket 14 Tage gesichert
```

## Was die Gates tun

| Gate | Prüft | Selbstheilung |
| --- | --- | --- |
| Parität (`enforceParity`) | gerade Seitenzahl, Seiten > 0 | hängt eine echte Vakatseite im Format der letzten Seite an und meldet die neue Zahl zurück |
| Cover-Geometrie (`auditCover`) | genau eine Seite, Sollmaß `2 × Trim + Rücken + 2 × Beschnitt`, Toleranz **1 pt**; Barcode-Freizone 2″ × 1,2″ auf der Rückseite, 0,25″ von unten; Rückentext erst ab 80 Seiten | keine – Drift bricht ab (Exit 1), fehlerhafte Daten werden nie veröffentlicht |
| Preflight (`server/lib/preflight.mjs`) | Trimmaß aller Seiten, Bundsteg gegen die KDP-Staffel, eingebettete Schriften, Covermaß | keine – Status `fail` blockiert |
| Compliance (`server/lib/policy.mjs`) | Marken, Werbesprache, Low-Content-Risiko, KI-Offenlegung | Blocker verhindern die Veröffentlichung |

Alle Sollwerte stammen aus einer einzigen Quelle: `server/lib/kdp.mjs`. Es gibt
keine zweite, abweichende Zahlenquelle – die Rückenformel (`0,002252″` pro Blatt
Weißpapier) wird im Gate gegen die Rohformel nachgerechnet (`spine-formula`).

## Ausgabe-Vertrag der Skripte

Damit `PAGES=$(node scripts/preflight_checker.mjs --check-parity b.pdf)` in der
Shell funktioniert:

- **stdout**: genau ein maschinenlesbarer Wert (Seitenzahl bzw. JSON).
- **stderr**: alle Protokollzeilen.

Exit-Codes: `0` bestanden (ggf. repariert), `1` Gate verletzt, `2` Aufruffehler,
`3` Deploy ohne `GUMROAD_TOKEN` übersprungen.

## Activation

1. Repository ist bereit – keine weiteren Dateien nötig.
2. Optional, für die Veröffentlichung: **Settings → Secrets and variables →
   Actions → New repository secret** → `GUMROAD_TOKEN` (Gumroad: Settings →
   Advanced → Applications → „Generate access token").
3. Testlauf: **Actions → Publishing Pipeline → Run workflow**. Eingaben:
   `niche` (leer = automatisch), `skip_deploy` (nur bauen), `price_cents`.

Ohne Token läuft die Pipeline bis zum Artefakt durch und überspringt den Deploy
mit sichtbarem Status – es gibt keinen stillen Fallback und keinen Schlüssel im
Repository.

## Abweichungen von der ursprünglichen Spezifikation – und warum

| Spezifikation | Umsetzung | Grund |
| --- | --- | --- |
| Upload via **Payhip** | **Gumroad** | Payhips öffentliche API (`/api/v2`) kann nur Coupons und Lizenzschlüssel; Produkte lassen sich dort nicht anlegen ([API-Referenz](https://payhip.com/api-reference)). |
| **Typst**-Templates (`layout/*.typ`) | vorhandener Renderer (`server/lib/pdf/*`, pdf-lib) | Zweite Layout-Engine = zwei Wahrheiten für dieselbe Geometrie. Zusätzlich liefert GitHub die Typst-Binaries über `release-assets.githubusercontent.com`, das in der Entwicklungsumgebung gesperrt ist – die Templates wären ungetestet geblieben. |
| Python (`pypdf`, `structlog`, `tenacity`) | Node (`pdf-lib`, `node:test`) | Eine Laufzeit, eine Testsuite, keine zweite Abhängigkeitskette. Die Python-Teile der Vorlage hatten zwei echte Fehler: `page = reader.pages` (Liste hat kein `mediabox`) und eine Keyword-Schleife über alle Top-Level-Elemente der Amazon-Antwort (Listen haben kein `.get`). |
| Cron `0 4 */2 * *` | `0 4 * * 2,5` | `*/2` zählt Monatstage: am 31. und 1. laufen zwei Jobs direkt hintereinander, dann bis zu drei Tage Pause. Zwei feste Wochentage sind deterministisch. |
| „3 Titel/24 h"-Guard | Idempotenz | Die Pipeline lädt nicht bei KDP hoch, sondern bei Gumroad. Schutz gegen Dubletten ist deshalb: existiert ein Produkt mit demselben Namen, wird es aktualisiert statt neu angelegt. |
| CMYK als Pflicht | nicht erzwungen | KDP nimmt RGB-PDFs an und wandelt selbst; erzwungenes CMYK ohne Farbprofil wäre ein Risiko, kein Vorteil. |
| KI-generierter Fließtext | nicht Teil der Pipeline | Inhalt kommt aus den verifizierten Generatoren (Rätsel, Wortsuche, Labyrinthe, Journale); die KI-Offenlegung wird korrekt als „AI-assisted" ausgewiesen. |

## Betrieb und Fehlerfälle

| Symptom | Ursache | Reaktion |
| --- | --- | --- |
| `gate.failed … Drift 3.4 pt` | Cover und Buchblock rechnen mit unterschiedlichen Seitenzahlen | Log zeigt Soll und Ist; `build_package.mjs` erzeugt beide aus einer Quelle, Drift entsteht nur bei manuell eingespielten PDFs |
| `parity.repaired` im Log | ungerades PDF eingespielt | Datei wurde korrigiert, Pipeline läuft weiter |
| `deploy.skipped reason=GUMROAD_TOKEN_missing` | Secret fehlt | Secret setzen oder `skip_deploy` nutzen |
| `Gumroad … HTTP 401` | Token ungültig/abgelaufen | Neuen Token erzeugen; der Token erscheint nie in Logs |
| `Gumroad … HTTP 429` | Rate-Limit | Lauf wiederholen; bei zwei Läufen pro Woche praktisch ausgeschlossen |
| `Manifest nicht freigabefähig` | Preflight/Gate/Compliance hat blockiert | Report im Artefakt lesen, Ursache beheben – nie das Gate umgehen |

Kosten: 2 Läufe pro Woche × ca. 2 Minuten auf `ubuntu-latest` – weit innerhalb des
Free-Tier-Kontingents von 2 000 Minuten/Monat für öffentliche Repositories.

## Lokal reproduzieren

```bash
npm ci
npm run pipeline                 # Harvest + Bau + Gate, ohne Netz-Zwang
npm run pipeline:dry-run         # zeigt, was der Deployer tun würde
GUMROAD_TOKEN=… npm run pipeline:deploy
```

Einzelne Stufen:

```bash
node scripts/harvest_keywords.mjs --niche raetsel-senioren --offline --out artifacts/metadata.json
node scripts/build_package.mjs --config artifacts/metadata.json --out artifacts
node scripts/preflight_checker.mjs --check-parity artifacts/*_buchblock_6x9.pdf
node scripts/preflight_checker.mjs --verify-cover artifacts/*_cover.pdf --pages 48
```
