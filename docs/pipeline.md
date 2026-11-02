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
scripts/onix.mjs               ONIX 3.0 für den Buchhandel (nur mit eigener ISBN)
scripts/validate_onix.mjs      XSD-Prüfung gegen ONIX 3.0 Revision 1
        │                       → artifacts/onix3.xml
        ▼
scripts/legal_deposit.mjs      Pflichtablieferung § 14 DNBG: Transferpaket + Checkliste
        │                       → artifacts/dnb/*
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

## Buchhandel und Pflichtablieferung

### ONIX 3.0 (`scripts/onix.mjs`)

Erzeugt eine ONIX-3.0-Nachricht mit einem Produkt: ISBN-13 (Typ 15), Produktform
`BC`/`EB`, Maße in Millimetern (Höhe 228,6 / Breite 152,4 / Dicke aus der
Papierstärke), Titel, Autor, Sprache `ger`, Umfang, Beschreibung, Verlag,
Erscheinungsdatum, Verfügbarkeit, Preis (Typ 02, inkl. USt, EUR) und
Verkaufsrechte für DE/AT/CH.

Bewusste Grenzen:

- **Nur das Kernset.** Reihen, Rechte- und Klappentexte, BISAC-Feinheiten und
  mehrere Produkte pro Nachricht gehören in die Redaktion. Subject läuft über
  `SubjectSchemeIdentifier 20` (freie Schlagworte), nicht über BISAC-Codes.
- **Die Ausgabe wird gegen das offizielle XSD validiert.** `scripts/validate_onix.mjs`
  prüft jede Meldung gegen ONIX 3.0 Revision 1 (Namespace
  `http://ns.editeur.org/onix/3.0/reference`). Das Schema (© EDItEUR) wird nicht
  mitgeliefert, sondern zur Laufzeit über fest gepinnte Git-Blob-SHAs aus einem
  öffentlichen Spiegel geholt (`npm run pipeline:onix:check`, Ablage `.onix-schema/`,
  per `.gitignore` ausgeschlossen). Validator ist `xmllint --schema` oder Python mit
  `lxml`; fehlt beides, endet das Skript mit Code 3 statt still „ok" zu sagen.
  Die CI prüft den Schritt „Validate ONIX against official XSD" nach jeder Erzeugung.

  Diese Prüfung hat drei echte Fehler gefunden, die ohne Schema niemand gesehen
  hätte: `<DateFormat>` stand **nach** `<Date>` (richtig ist davor),
  `<SupplyDetail>` enthielt flaches `<SupplierRole>` statt des Composites
  `<Supplier>` mit `<SupplierRole>` + `<SupplierName>`, und ohne Preis fehlte das
  Pflichtelement `<UnpricedItemType>` (Code 04 „Contact supplier", Code List 57 ist
  genau dafür vorgesehen). Alle drei Fälle sind als Regressionstests in
  `tests/onix-schema.test.mjs` festgehalten.
- **Ohne ISBN keine Meldung.** Die ISBN vergibt in Deutschland die ISBN-Agentur
  (MVB) an den Verlag; sie ist nicht erfindbar. `scripts/lib/isbn.mjs` prüft
  Prüfziffer und Format und lehnt Platzhalter ab. Ein „VLB-Gold-Status" ist eine
  vertragliche Sache mit MVB und entsteht nicht durch ein XML.

Beispiel:

```bash
node scripts/onix.mjs --manifest artifacts/manifest.json --isbn 9783161484100 \
  --publisher "Verlag GmbH" --out artifacts/onix3.xml
npm run onix:schema          # holt nur das XSD nach .onix-schema/
npm run onix:validate        # prüft artifacts/onix3.xml
npm run pipeline:onix:check  # erzeugt neu und prüft in einem Schritt
# {"ok":true,"validator":"xmllint","file":".../onix3.xml"}
```

Exit-Codes von `validate_onix.mjs`: `0` gültig, `1` ungültig, `2` Aufruf- oder
Downloadfehler, `3` kein Validator installiert.

### Pflichtablieferung DNB (`scripts/legal_deposit.mjs`)

Rechtslage (§ 14 DNBG, geprüft):

| Konstellation | Stückzahl | Frist |
| --- | --- | --- |
| Gedrucktes Buch (§ 14 Abs. 1) | **2 Ausfertigungen** | 1 Woche ab Verbreitung (§ 14 Abs. 4) |
| E-Book/PDF (§ 14 Abs. 3) | **1 Ausfertigung** | dieselbe Frist |
| Verstoß | – | Mahnung, +3 Wochen, Beschaffung auf Kosten des Pflichtigen; Bußgeld bis **10 000 €** (§ 19) |

Die Ausnahme „unter 25 Stück" gilt **nicht** für Print-on-Demand – und genau das
sind die Bücher dieser Pipeline.

**Es gibt keine öffentliche DNB-API mit Bearer-Token.** Automatisiert wird über
einen bei der DNB beantragten **Hotfolder** (SFTP/WebDAV) oder **OAI-PMH**, jeweils
nach Registrierung und Testphase; für einzelne Monografien gibt es ein
Webformular. Das Skript erzeugt deshalb das Transferpaket (PDF + EPUB +
`metadaten.json` im Kernset + `ablieferung.md` mit Fristen) und legt es nur dann
in einen Hotfolder, wenn `DNB_HOTFOLDER` auf ein gemountetes Verzeichnis zeigt.
Ein gesetztes `DNB_ACCESS_TOKEN` wird ausdrücklich ignoriert und geloggt – es
gibt keinen Endpunkt, an den es gehören würde.

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
| `deploy_dnb.py` mit `DNB_ACCESS_TOKEN` + `DNB_API_URL` | Paketbau + Hotfolder-Ablage | Eine öffentliche DNB-API mit Token existiert nicht; Ablieferung läuft über beantragten Hotfolder, OAI-PMH oder Webformular. |
| `--isbn "9783982000000"` fest im Workflow | ISBN aus Secret `BOOK_ISBN`, vorher geprüft | Die Zahl ist keine gültige ISBN: korrekte Prüfziffer wäre 8 (`9783982000008`) – und eine ISBN gehört immer dem Verlag, der sie erworben hat. |
| **Creem** als dritter Kanal | nicht implementiert | Creems API (`POST /v1/products`, `x-api-key`) legt Produkte an, aber **Datei-Downloads werden im Dashboard aktiviert** – ein Produkt ohne Datei wäre eine leere Produktseite. Gumroad kann das per API. |
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

### Free-Tier-Rechnung für dieses Repository

| Punkt | Fakt | Folge hier |
| --- | --- | --- |
| Minuten | 2 000 Linux-Minuten/Monat gelten für **private** Repos; **öffentliche** Repos sind unbegrenzt | Dieses Repo ist öffentlich → das Minutenbudget ist irrelevant. Zwei Läufe/Woche à ~2 min wären selbst privat nur ~16 min/Monat. |
| Runner | `ubuntu-latest` = Faktor 1×; Windows 2×, macOS 10× | Nur Linux-Runner im Workflow. |
| Artefakte | 500 MB Speicher im Free-Plan, `retention-days: 14` | Ein Paket wiegt ~1 MB; bei 2 Läufen/Woche bleibt es bei wenigen MB. |
| **Cron-Falle** | In **öffentlichen** Repos deaktiviert GitHub geplante Workflows nach **60 Tagen ohne Repository-Aktivität** – stillschweigend | Betrifft dieses Repo. Abhilfe: regelmäßig committen, `gh workflow enable` ausführen oder extern per `workflow_dispatch` anstoßen. Private Repos sind von dieser Regel **nicht** betroffen (die Spezifikation hatte es umgekehrt). |
| KDP-Drossel | KDP-Limits gelten für Uploads zu KDP | Diese Pipeline lädt nichts zu KDP hoch; der Deploy geht an Gumroad. Schutz gegen Dubletten ist die Idempotenz über den Produktnamen. |

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
