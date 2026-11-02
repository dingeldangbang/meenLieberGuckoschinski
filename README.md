# Buchmaschine

**Ein KDP-Studio, das druckfertige Bücher baut – lokal, ohne Konto, ohne laufende Kosten.**

Buchmaschine nimmt dir die handwerkliche Arbeit ab, die beim Selbstverlag sonst Stunden kostet:
Nische wählen, Buchblock setzen, Buchrücken berechnen, Cover bauen, Tantiemen rechnen.
Am Ende stehen zwei PDFs und eine Metadaten-Liste, die du direkt in das Amazon-KDP-Dashboard lädst.

```bash
npm install
npm start        # http://localhost:3000
```

Es gibt keine Anmeldung, keine API-Keys, keine Cloud. Alles läuft auf deinem Rechner.

---

## Was die App wirklich automatisiert

| Bereich | Automatisiert | Bewusst manuell |
| --- | --- | --- |
| Rätsel & Übungen | Sudoku (eindeutige Lösung), Wortsuche, Labyrinthe, Journale, Übungsseiten | – |
| Buchblock | Satzspiegel, gespiegelte Innenränder, Titel, Impressum, Seitenzahlen, Lösungsverzeichnis | – |
| Cover | Vollumschlag mit Rückenbreite, Beschnitt, Barcode-Freizone, 6 Farbwelten | Grafik/Illustration |
| Kalkulation | Druckkosten, Mindestpreis, Tantieme, Umsatzszenarien, E-Book-Band | – |
| Metadaten | Titel, Untertitel, Beschreibung, 7 Keywords, Kategorien, Copy-Paste-Text | Textqualität |
| E-Book | EPUB 3 mit Inhaltsverzeichnis, Kapiteln, Rätseln und Lösungen | Titelbild, Preisband |
| Recherche | Kuratierte Nischen-Pakete, Keyword-Werkstatt, optionale Live-Suche bei Amazon | Marktprüfung |
| Portfolio | Tantiemen, Mindestpreis-Warnungen und Umsatzmodell je gespeichertem Projekt | Verkaufsannahmen |
| Prüfung | Preflight gegen KDP-Geometrie, Markenscan, KI-Offenlegung, Low-Content-Risiko | rechtliche Endkontrolle |
| Veröffentlichung | PDF-Export, Metadaten-Arbeitsblatt, Checkliste | Upload, Preis, Freigabe |

**Kein KI-Text.** Diese Entscheidung ist Absicht: Ratgeber-Fließtext, der aus einem Sprachmodell
kommt, fliegt bei Amazon regelmäßig raus und bringt keine Rezensionen. Struktur, Übungen und
Reflexionsfragen liefert die App – den Text schreibst du. Genau dafür sind die Schreiblinien da.

**Kein Auto-Upload bei KDP.** Der Upload zu Amazon bleibt ein bewusster Klick – automatisierte
KDP-Uploads verstoßen gegen die Bedingungen. Für den *eigenen* Digital-Vertrieb (Gumroad) gibt es
dagegen eine echte API; dorthin darf die Pipeline autonom veröffentlichen, wenn du ein Token hinterlegst.

---

## Schnellstart

```bash
npm install     # zwei Abhängigkeiten: pdf-lib + fontkit (für eingebettete Schriften)
npm start       # Server auf 0.0.0.0:3000
npm test        # 105 Tests, keine Test-Frameworks, nur node:test
```

Ohne Browser geht es auch – die CLI baut dasselbe Paket:

```bash
node bin/buchmaschine.mjs niches                       # kuratierte Nischen
node bin/buchmaschine.mjs build --niche raetsel-senioren --pages 134 --out ./paket
node bin/buchmaschine.mjs preflight --manuscript ./paket/*_buchblock_6x9.pdf --pages 134
```

`build` legt Buchblock-PDF, Cover-PDF, EPUB, Metadaten-JSON, das Metadaten-Arbeitsblatt und
einen Text-Report in den Zielordner. Exit-Code 2, wenn der Preflight Fehler findet.

Umgebung:

| Variable | Standard | Zweck |
| --- | --- | --- |
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `BUCHMASCHINE_DATA_DIR` | `./data` | Ablage der gespeicherten Projekte |

Voraussetzung: Node.js 20 oder neuer.

---

## Ablauf in fünf Schritten

1. **Nische** – acht kuratierte Pakete (Rätsel für Senioren, Kinder-Rätselblock, Humor-Geschenkbuch,
   Overthinking-Workbook, Achtsamkeits-Journal, Labyrinthe, Hundetraining, Low-Content-Notizbuch).
   Jedes Paket bringt Suchbegriffe, Preisanker, Format und Buch-Typ mit.
2. **Buch** – Titel, Untertitel, Autor, Beschreibung, Format, Papier, Seitenzahl, Preis, Seed.
   Kalkulation und Preisleiter aktualisieren sich sofort.
3. **Inhalt** – Schwierigkeit, Wort-Themen, Kapitelzahl. Der Seitenplan zeigt jede Seite mit Nummer.
4. **Cover** – Farbwelt, Hilfslinien für Beschnitt/Falz/Sicherheitsabstand/Barcode.
5. **Export** – Buchblock-PDF, Cover-PDF, EPUB für Kindle, Metadaten-JSON, Projekt speichern.

Über **Projekte** oben rechts öffnet sich das Portfolio: alle gespeicherten Bücher mit Tantieme,
Mindestpreis-Warnung und einem Umsatzmodell für eine frei wählbare Verkaufszahl je Monat.

---

## Die Rechenmodelle (und woher sie kommen)

**Rückenbreite** (KDP-Standard für Taschenbücher, Papierstärke pro Seite):

```
weiß  0,002252"   creme 0,0025"   farbig 0,002347"
Rücken = Seiten × Papierstärke  (kaufmännisch auf 4 Stellen gerundet)
```

**Vollumschlag:**

```
Breite  = 0,125 + Trim + Rücken + Trim + 0,125   (Beschnitt links/rechts)
Höhe    = Trim + 0,125 + 0,125                   (Beschnitt oben/unten)
Barcode = 2,0" × 1,2", unten rechts auf der Rückseite (0,25" von Unterkante und Rücken)
```

Rückenbeschriftung ist erst ab **80 Seiten** erlaubt und hält 0,0625" Abstand zu beiden Falzen;
darunter bleibt der Rücken leer und der Preflight meldet das als bestanden
(„Kein Rückentext: unter 80 Seiten“).

Beispiel 134 Seiten, 6 × 9 Zoll, weißes Papier: Rücken **0,3018"**, Cover **12,5518" × 9,25"**
(= 3.766 × 2.775 px bei 300 dpi).

**Druckkosten & Tantieme** (Amazon.de, Schwarzweiß, KDP-Staffel):

```
24–110 Seiten   Druckkosten = 2,30 €  (Pauschale, Standardformat)
ab 111 Seiten   Druckkosten = 1,00 € + 0,012 € × Seiten
Großformat      Druckkosten = 2,84 €  bzw. 1,00 € + 0,017 € × Seiten
Amazon.co.uk    Druckkosten = 0,85 £  + 0,010 £ × Seiten

Tantieme     = Tantiemensatz × Verkaufspreis − Druckkosten
Tantiemensatz = 60 % ab 9,99 €,  50 % bis 9,98 €
Mindestpreis  = kleinster Preis, bei dem die Tantieme ≥ 0 ist
```

Der Sprung an der 9,99-€-Schwelle ist die häufigste Fehlkalkulation im Selbstverlag:
bei 134 Seiten bringt ein Preis von 9,50 € **1,35 €** Tantieme, bei 9,99 € sind es **3,38 €**.
Das Modell rechnet das aus (`thresholdJumpEur`) und rät zum Anheben (`recommendation`).

Diese Werte sind ein **Rechenmodell**, keine Zusage von Amazon. Verbindlich ist immer die
Vorschau im KDP-Dashboard; Preise und Druckkosten ändern sich dort gelegentlich.

**E-Book:** 70 % nur im Band 2,99–9,99 €, sonst 35 %, abzüglich Zustellkosten (Modell: 0,12 €/MB).

---

## Was in der PDF steckt

**Buchblock** (`*_buchblock_*.pdf`)

- exaktes Trim-Maß, kein Beschnitt
- gespiegelte Innenränder nach KDP-Staffel (Innensteg 0,375" bis 150 Seiten, dann 0,5"/0,625"/0,75"/0,875",
  plus Komfortzugabe; außen/oben/unten mindestens 0,625")
- Titel, Impressum mit Haftungsausschluss, Anleitung, „Dieses Buch gehört“, Inhalt, Lösungen, Schlussseite
- Seitenzahlen mittig unten, Vorlaufseiten ohne Nummer, Grundlinie nie unter 0,25" Sicherheitsabstand
- eingebettete **EB Garamond** (Regular, Italic, Bold, OFL-lizenziert, keine Netzabhängigkeit beim Rendern),
  Ligaturen abgeschaltet, damit Text kopierbar, durchsuchbar und für KDP prüfbar bleibt

**Cover** (`*_cover*.pdf`)

- einseitiger Vollumschlag inklusive 0,125" Beschnitt auf allen Seiten
- Rückenbeschriftung erst ab 80 Seiten, mit 0,0625" Abstand zu beiden Falzen; darunter bewusst leer
- weiße Barcode-Freizone 2 × 1,2" unten rechts auf der Rückseite (Amazon setzt den Code dort ein)
- Sicherheitsabstand 0,25" zu allen Kanten, Texte nie unter 7 pt
- optionale Hilfslinien (`?guides=1` oder Schalter in der App)

**Metadaten-Arbeitsblatt** (`*_metadaten.pdf`)

- Seite 1: Titel, Untertitel, Autor, Beschreibung, 7 Keyword-Zeilen zum Abschreiben, Kategorien,
  Druckoptionen, Cover-Maße und Preiskalkulation
- Seite 2: KI-Offenlegung im Wortlaut, Marken-/Sprachprüfung, Low-Content-Risiko, kompletter
  Preflight-Bericht und der Ablauf im KDP-Dashboard

**E-Book** (`*_kindle.epub`)

- EPUB 3 mit `mimetype` als erstem, unkomprimiertem Eintrag, `container.xml`, `content.opf`, `nav.xhtml`
- Metadaten: Titel, Untertitel, Autor, Sprache, Beschreibung, Keywords als Schlagwörter
- Kapitel je Buch-Typ: Übungsbuch = ein Kapitel pro Abschnitt mit Übungen; Journal = Woche für Woche;
  Rätselbuch = zehn Rätsel je Kapitel plus gesammelter Lösungsteil; Sudoku als Tabelle, Wortsuche und
  Labyrinthe als Monospace-Blöcke
- Schreiblinien als gestrichelte Absätze, damit Übungen auch im E-Book funktionieren

**Rätselqualität**

- Sudoku: Lösungsgitter per Backtracking, Vorgaben werden paarweise (180°-Symmetrie) entfernt –
  jede Entfernung wird nur akzeptiert, wenn die Lösung eindeutig bleibt
- Wortsuche: Wörter werden garantiert ins Gitter gelegt (waagerecht, senkrecht, diagonal),
  Restfelder mit deutscher Buchstabenverteilung gefüllt
- Labyrinthe: perfekte Labyrinthe; der Lösungspfad wird per Breitensuche verifiziert

**Determinismus:** derselbe Seed erzeugt exakt dasselbe Buch. Praktisch für Nachdrucke und
für die Frage „welche Version habe ich veröffentlicht?“.

---

## HTTP-API

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/api/health` | Lebenszeichen |
| GET | `/api/catalog` | Formate, Papierarten, Buch-Typen, Farbwelten, Wortlisten |
| GET | `/api/niches` | Nischen-Pakete inkl. Chancen-Score und Titelvorschlag |
| POST | `/api/keywords` | `{ seed, nicheId }` → Longtail-Vorschläge mit Score |
| POST | `/api/preview` | `{ config }` → Seitenplan, Cover-Maße, Kalkulation, Beispielrätsel |
| POST | `/api/export/manuscript.pdf` | Buchblock als PDF |
| POST | `/api/export/cover.pdf[?guides=1]` | Cover als PDF |
| POST | `/api/export/metadata.json` | KDP-Metadaten + Copy-Paste-Text |
| POST | `/api/export/ebook.epub` | EPUB 3 für Kindle |
| GET | `/api/suggest?q=…&mkt=de` | Live-Suche bei Amazon (serverseitig), Fallback auf Offline-Werkstatt |
| GET/POST | `/api/projects` | Projekte listen / speichern (lokal, `data/projects.json`) |
| DELETE | `/api/projects/:id` | Projekt löschen |
| GET | `/api/dashboard?sales=10` | Portfolio-Auswertung: Tantiemen, Summen, Warnungen |
| GET | `/api/bsr?rank=100000&category=books&pages=134` | Absatz- und Umsatzschätzung aus dem Bestseller-Rang (Potenzmodell) |
| GET | `/api/bsr/reverse?sales=5` | Umkehrung: welcher Rang entspricht 5 Verkäufen pro Tag? |
| GET | `/api/suggest/expand?q=sudoku&mkt=de` | A–Z-Expansion der Live-Suche (8 Wellen parallel, 8 s Zeitbudget, Offline-Fallback) |

Konfigurationsobjekt (`config`), alle Felder optional außer `title` und `author`:

```json
{
  "title": "Große Rätsel für kluge Köpfe",
  "subtitle": "Sudoku in Großdruck mit Lösungen",
  "author": "Marlene Beispiel",
  "description": "Rückseitentext, max. 4000 Zeichen",
  "generator": "sudoku",
  "difficulty": "medium",
  "pageCount": 134,
  "trim": "6x9",
  "paper": "white",
  "priceEur": 9.99,
  "marketplace": "de",
  "seed": "buch-1",
  "nicheId": "raetsel-senioren",
  "coverStyle": "sand",
  "keywords": ["rätselbuch für senioren", "sudoku großdruck"],
  "categories": ["Krimis & Rätsel > Rätsel"],
  "wordCategories": ["tiere", "garten"],
  "wordsPerPuzzle": 12,
  "chapterLimit": 12,
  "notebookStyle": "lined"
}
```

Buch-Typen: `sudoku`, `wordsearch`, `maze`, `journal`, `workbook`, `notebook`
Formate: `5x8`, `5.25x8`, `5.5x8.5`, `6x9`, `6.69x9.61`, `7x10`, `7.5x9.25`, `8x10`, `8.5x11`
Farbwelten: `navy`, `sage`, `sand`, `crimson`, `mono`, `midnight`

---

## Live-Keywords (optional)

Der Button **„Amazon live“** fragt die öffentliche Autocomplete-Schnittstelle der Amazon-Büchersuche
ab (`completion.amazon.de`, serverseitig, ohne Konto und ohne API-Key). Das Ergebnis wird zehn Minuten
gecacht, Anfragen werden auf etwa eine pro Sekunde gedrosselt.

Klappt das nicht – kein Netz, Amazon blockt, Format geändert – fällt die App sichtbar auf die
Offline-Werkstatt zurück („Amazon nicht erreichbar … Offline-Werkstatt“) und bleibt voll nutzbar.
Nachfrage- und Wettbewerbswerte sind in beiden Fällen **Heuristiken**, keine gemessenen Marktdaten.

## Tests

```bash
npm test      # 164 Unit- und Vertragstests
npm run verify  # vollständige Abnahme: Tests + Pipeline + echter HTTP-Server
```

`npm run verify` prüft in einem Lauf, was ein Nutzer tatsächlich merkt: Node-Version,
`node --check` über alle Module, die komplette Testsuite, die Pipeline mit echten
Bytes auf der Platte (Buchblock-PDF, Cover, EPUB, ONIX gegen XSD, DNB-Paket) und
einen echten Serverprozess auf einem freien Port, dessen 19 Routen über HTTP
abgefragt werden – PDFs und EPUB inklusive Dateisignatur. Fehlt ein optionales
Werkzeug (z. B. XSD-Validator), steht das als `skip` mit Begründung im Bericht,
nie als `ok`. Ergebnis: Exit-Code 0 oder 1 und `artifacts/verify-report.json`.

Stand des letzten Laufs: **32 von 32 Prüfungen grün, 164 von 164 Tests grün**,
zusätzlich in einem frischen Klon verifiziert. Protokoll und Grenzen:
[`docs/abnahme.md`](docs/abnahme.md).

164 Tests mit `node:test`, ohne Test-Framework-Abhängigkeit:

- **kdp** – Rückenformel, Beschnitt, Barcode-Zone, Ränder, Druckkostenstaffel, Tantiemensprung
  an der 9,99-€-Schwelle, Mindestpreis ≥ Druckkosten, Rückenbeschriftung ab 80 Seiten
- **preflight** – echter Buchblock und Cover gegen die KDP-Geometrie, Fehlerfälle (fehlende
  PDF-Kennung, falscher Beschnitt, abweichende Seitenzahl), Schrift-Einbettung und
  Ligatur-Regression, Metadaten-Blatt
- **policy** – Markenscan mit Wortgrenzen, Gattungsbegriffe, Werbesprache, KI-Offenlegung,
  Low-Content-Risiko
- **puzzles** – Sudoku-Regelkonformität, Eindeutigkeit der Lösung, Determinismus; Wortsuche-Auffindbarkeit;
  Labyrinth-Perfektheit und lückenlose Lösungspfade
- **compose** – Validierung, gerade Seitenzahl, exakte Seitenzahl im Plan, alle Buch-Typen
- **pdf** – gültiger PDF-Header, exakte MediaBox, alle Formate, Cover-Geometrie, WinAnsi-Textumbruch
- **epub** – CRC32-Prüfwerte, ZIP-Struktur, mimetype-Regel, Manifest/Spine-Konsistenz, Kapitel je Buch-Typ,
  XML-Maskierung und Determinismus
- **research** – Amazon-Antwortparser inkl. kaputter Formate, Longtail-Scoring, Fallback bei HTTP- und
  Netzwerkfehlern, Portfolio-Aggregation und Unterpreis-Warnungen
- **api** – alle Endpunkte inkl. Fehlerfälle, Export-Dateinamen, EPUB-Download, Preflight, Compliance,
  Preisstaffel, Projekt-CRUD, Dashboard, Path-Traversal-Schutz
- **isbn** – Prüfziffern nach ISBN-10 und ISBN-13, Konvertierung, Ablehnung von Platzhaltern
- **onix** – Elementreihenfolge, `Supplier`-Composite, Preis vs. `UnpricedItemType`,
  XSD-Validierung gegen ONIX 3.0 Revision 1
- **legal_deposit** – DNB-Kernfelder, Paketinhalt, Hotfolder-Ablage, Checkliste

---

## Ehrliche Grenzen

- **Nischen-Daten sind Einschätzungen.** Nachfrage- und Wettbewerbswerte sind redaktionell
  geschätzt, keine Live-Abfragen bei Amazon. Vor dem Schreiben gehört ein Blick in die echte Suche.
- **Der Text ist deine Arbeit.** Ausnahme: die kuratierten Kapitel-Intros und Übungsfragen im
  Übungsbuch – die sind als Gerüst gedacht und dürfen angepasst werden.
- **KDP-Regeln ändern sich.** Formate, Mindestpreise und Papierstärken sind Modellwerte; prüfe sie
  vor dem ersten Upload in der KDP-Hilfe.
- **Kein ISBN-Kauf, kein Marketing.** Sichtbarkeit entsteht über Cover, Titel und Rezensionen – nicht
  über die Anzahl veröffentlichter Bücher.
- **Die Schrift ist eingebettet und lizenziert.** EB Garamond steht unter der SIL Open Font License 1.1
  (`assets/fonts/OFL.txt`), Einbettung in Druckdateien ist ausdrücklich erlaubt. Fehlen die Dateien,
  fällt der Export auf die Standard-14-Schriften zurück – der Preflight markiert das dann als Fehler,
  weil KDP eingebettete Schriften verlangt.
- **Kein automatischer Upload zu KDP.** Die App erzeugt Dateien und Text; das Einstellen bei Amazon
  bleibt ein bewusster, manueller Schritt. Automatisierte KDP-Uploads verstoßen gegen die Bedingungen.
  Die optionale CI-Pipeline veröffentlicht nur auf Gumroad, also auf einem eigenen Vertriebsweg.
- **Der Gumroad-Deploy ist gegen die dokumentierten Endpunkte gebaut, nicht live verifiziert.** Ohne
  Token lief er nie gegen das echte Konto; die Vertragstests prüfen Produktanlage, Idempotenz,
  Datei-Upload und den Presign-Fallback gegen eine Attrappe. Der erste echte Lauf gehört beobachtet.
- **Das E-Book hat Grenzen.** Rätsel und Labyrinthe im EPUB sind für kleine Displays gedacht; für
  Puzzle-Bücher bleibt das Taschenbuch das bessere Produkt. Ein Titelbild (JPG/PNG) musst du im
  KDP-Dashboard separat hochladen – EPUB und Cover-PDF sind dort zwei verschiedene Uploads.
- **Die Live-Suche ist eine Abkürzung, kein Marktforschungstool.** Sie zeigt, was Amazon vorschlägt –
  nicht, ob ein Buch sich verkauft.

---

## Autonome Publishing-Pipeline (CI)

Ein GitHub-Actions-Workflow baut, prüft und veröffentlicht ohne Handarbeit:

```
scripts/harvest_keywords.mjs   Nische aus dem Datum, 7 Keyword-Slots (live oder offline)
scripts/build_package.mjs      Buchblock → Paritäts-Gate → Cover → Gate 2 → Manifest
scripts/preflight_checker.mjs  unabhängige Nachprüfung: Cover-Drift ≤ 1 pt, gerade Seiten
scripts/onix.mjs               ONIX 3.0 für den Buchhandel (nur mit eigener ISBN)
scripts/legal_deposit.mjs      Pflichtablieferung § 14 DNBG: Transferpaket + Checkliste
scripts/deploy_digital.mjs     Gumroad: Produkt anlegen/aktualisieren, PDF anhängen
```

- Takt: **Di + Fr, 04:00 UTC** (`0 4 * * 2,5`). Bewusst nicht `0 4 */2 * *`, weil
  Cron dort Monatstage zählt – am 31. und 1. liefen zwei Jobs direkt hintereinander.
- Self-Healing: ungerade Seitenzahl → echte Vakatseite wird angehängt, die
  korrigierte Zahl fließt in Cover und Manifest.
- Fail-Closed: Cover-Drift über 1 pt, Preflight-Fehler oder Compliance-Blocker
  beenden den Lauf, **bevor** etwas veröffentlicht wird.
- Idempotent: existiert schon ein Produkt mit demselben Namen, wird es
  aktualisiert statt dupliziert.
- Ohne `GUMROAD_TOKEN` endet der Lauf mit dem KDP-Paket als Artefakt (14 Tage) und
  sichtbarem Skip-Status – kein Schlüssel im Repo, kein stiller Fallback.

Details, Abweichungen von der Vorlage und Incident-Playbook: [`docs/pipeline.md`](docs/pipeline.md).

```bash
npm run pipeline        # Harvest + Bau + Gate, lokal ohne Token
npm run pipeline:dry-run
```

- **Buchhandel:** `scripts/onix.mjs` erzeugt ONIX 3.0 mit ISBN-13, Maßen in mm,
  Preis in EUR und Verkaufsrechten DE/AT/CH. Ohne gültige, **eigene** ISBN wird
  nichts gemeldet – die Prüfziffer wird vorher geprüft (`scripts/lib/isbn.mjs`).
  Die Meldung wird gegen das offizielle ONIX-3.0-XSD validiert
  (`scripts/validate_onix.mjs`, `npm run pipeline:onix:check`); dieses XSD hat drei
  Reihenfolge-/Pflichtfeld-Fehler aufgedeckt, die jetzt als Tests abgesichert sind.
- **Pflichtablieferung:** `scripts/legal_deposit.mjs` schnürt das DNB-Paket
  (PDF + EPUB + Metadaten-Kernset + Checkliste). § 14 DNBG verlangt **zwei**
  Druckexemplare, **ein** digitales, binnen einer Woche; die 25-Stück-Ausnahme
  gilt nicht für Print-on-Demand. Die DNB hat keine Token-API – abgeliefert wird
  über beantragten Hotfolder, OAI-PMH oder Webformular.

> Warum Gumroad und nicht Payhip: Payhips öffentliche API kann nur Coupons und
> Lizenzschlüssel verwalten – Produkte lassen sich dort nicht anlegen.
> Creem kann Produkte per API anlegen, aber Datei-Downloads nur im Dashboard
> aktivieren – ein Produkt ohne Datei wäre eine leere Seite, deshalb nicht eingebaut.

---

## Projektstruktur

```
scripts/                            CI-Pipeline (Node, ohne Zusatzabhängigkeiten)
  harvest_keywords.mjs              Nischen-/Keyword-Ingestion
  build_package.mjs                 Paketbau mit beiden Gates + manifest.json
  preflight_checker.mjs             Standalone-Gate (Parität, Cover-Geometrie)
  onix.mjs                          ONIX-3.0-Meldung für den Buchhandel
  validate_onix.mjs                 XSD-Prüfung der ONIX-Meldung (ONIX 3.0 R1)
  verify.mjs                        Abnahmelauf: Tests, Pipeline, echter HTTP-Server
  legal_deposit.mjs                 DNB-Pflichtablieferung als Transferpaket
  deploy_digital.mjs                Gumroad-Deployer (idempotent, token-sicher)
  lib/gates.mjs                     Paritäts- und Geometrie-Prüfungen
  lib/isbn.mjs                      ISBN-Prüfung (Prüfziffer, Platzhalter)
.github/workflows/
  publishing-pipeline.yml           Cron + workflow_dispatch, Artefakte, Deploy
server/
  index.mjs                 HTTP-Server, API, statische Auslieferung
  lib/
    kdp.mjs                 Geometrie, Druckkosten, Tantiemen, Mindestpreis
    preflight.mjs           Prüfung fertiger PDFs (Trim, Ränder, Seiten, Schriften)
    policy.mjs              KI-Offenlegung, Markenscan, Low-Content-Risiko
    niches.mjs              Nischen-Pakete, Keyword-Werkstatt, Titelvorschläge
    validate.mjs            Validierung und Normalisierung der Konfiguration
    compose.mjs             Seitenplan, Statistiken, Cover-Texte
    store.mjs               Projekt-Ablage (JSON, lokal)
    zip.mjs                 ZIP-Writer/Leser (Basis für EPUB)
    epub.mjs                EPUB-3-Builder
    suggest.mjs             Amazon-Autocomplete-Proxy mit Cache und Fallback
    portfolio.mjs           Umsatz-Auswertung gespeicherter Projekte
    rng.mjs                 deterministischer Zufall
    content/
      sudoku.mjs            Sudoku mit Eindeutigkeitsprüfung
      wordsearch.mjs        Wortsuchrätsel
      maze.mjs              Labyrinthe + Breitensuche
      words.mjs             deutsche Wortlisten
      text.mjs              kuratierte Kapitel, Prompts, Übungen
    pdf/
      text.mjs              WinAnsi-Sanitizing, Umbruch, Linien, Raster
      fonts.mjs             Einbettung von EB Garamond (Regular/Italic/Bold)
      manuscript.mjs        Buchblock-Renderer
      cover.mjs             Vollumschlag-Renderer
      metadata-sheet.mjs    Metadaten-Arbeitsblatt als PDF
assets/fonts/               EB Garamond (SIL Open Font License 1.1) + OFL.txt
bin/buchmaschine.mjs        CLI: build, preflight, niches
public/
  index.html, styles.css, app.js    Studio-Oberfläche (ohne Framework, ohne Build)
tests/                              node:test-Suite (inkl. Pipeline- und Deployer-Vertragstests)
docs/pipeline.md                    Pipeline, freie Kontingente, Abweichungen, Incident-Playbook
docs/abnahme.md                     Abnahmeprotokoll: was geprüft wurde und was nicht
```

## Warum diese Grenzen?

Die mitgelieferte Konzeptstudie (Typst + ReportLab, Cron-Veröffentlichung, KI-Texte, gescrapte
Marktdaten) wird in [docs/kdp-engine-analyse.md](docs/kdp-engine-analyse.md) Punkt für Punkt geprüft:
zwölf sachliche Fehler, vier offene Lücken (Marktdaten, Satzqualität, Bildstrecke, Betrieb) und
die Begründung, was übernommen und was abgelehnt wurde.

## Lizenz

Apache License 2.0 – siehe [LICENSE](LICENSE).
