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
| Recherche | Kuratierte Nischen-Pakete, Keyword-Werkstatt mit Longtail-Score | Marktprüfung |
| Veröffentlichung | PDF-Export, Checkliste | Upload, Preis, Freigabe |

**Kein KI-Text.** Diese Entscheidung ist Absicht: Ratgeber-Fließtext, der aus einem Sprachmodell
kommt, fliegt bei Amazon regelmäßig raus und bringt keine Rezensionen. Struktur, Übungen und
Reflexionsfragen liefert die App – den Text schreibst du. Genau dafür sind die Schreiblinien da.

**Kein Auto-Upload.** Ein Klick zum Veröffentlichen ist keine Automatisierung, sondern ein Risiko.

---

## Schnellstart

```bash
npm install     # einzige Abhängigkeit: pdf-lib
npm start       # Server auf 0.0.0.0:3000
npm test        # 53 Tests, keine Test-Frameworks, nur node:test
```

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
5. **Export** – Buchblock-PDF, Cover-PDF, Metadaten-JSON, Projekt speichern.

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
Barcode = 2,0" × 1,2", 0,25" vom Beschnitt entfernt, unten links auf der Rückseite
```

Beispiel 134 Seiten, 6 × 9 Zoll, weißes Papier: Rücken **0,3018"**, Cover **12,5518" × 9,25"**
(= 3.766 × 2.775 px bei 300 dpi).

**Druckkosten & Tantieme** (Amazon.de, Schwarzweiß):

```
Druckkosten = 0,60 € + 0,012 € × Seiten
Tantieme    = 60 % × Verkaufspreis − Druckkosten
Mindestpreis = Druckkosten / 0,60   (aufgerundet auf Cent)
```

Diese Werte sind ein **Rechenmodell**, keine Zusage von Amazon. Verbindlich ist immer die
Vorschau im KDP-Dashboard; Preise und Druckkosten ändern sich dort gelegentlich.

**E-Book:** 70 % nur im Band 2,99–9,99 €, sonst 35 %, abzüglich Zustellkosten (Modell: 0,12 €/MB).

---

## Was in der PDF steckt

**Buchblock** (`*_buchblock_*.pdf`)

- exaktes Trim-Maß, kein Beschnitt
- gespiegelte Innenränder (Innen 0,625"/0,75", außen 0,625", ab 151 Seiten 0,75")
- Titel, Impressum mit Haftungsausschluss, Anleitung, „Dieses Buch gehört“, Inhalt, Lösungen, Schlussseite
- Seitenzahlen mittig unten, Vorlaufseiten ohne Nummer
- eingebettete Standardschriften (Times/Helvetica, WinAnsi inkl. € und Umlauten)

**Cover** (`*_cover*.pdf`)

- einseitiger Vollumschlag inklusive 0,125" Beschnitt auf allen Seiten
- Rückenbeschriftung ab ca. 0,17" Rückenbreite
- weiße Barcode-Freizone (Amazon setzt den Code dort ein)
- optionale Hilfslinien (`?guides=1` oder Schalter in der App)

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
| GET/POST | `/api/projects` | Projekte listen / speichern (lokal, `data/projects.json`) |
| DELETE | `/api/projects/:id` | Projekt löschen |

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

## Tests

```bash
npm test
```

53 Tests mit `node:test`, ohne Test-Framework-Abhängigkeit:

- **kdp** – Rückenformel, Beschnitt, Barcode-Zone, Ränder, Druckkosten, Tantiemen, Preisleiter
- **puzzles** – Sudoku-Regelkonformität, Eindeutigkeit der Lösung, Determinismus; Wortsuche-Auffindbarkeit;
  Labyrinth-Perfektheit und lückenlose Lösungspfade
- **compose** – Validierung, gerade Seitenzahl, exakte Seitenzahl im Plan, alle Buch-Typen
- **pdf** – gültiger PDF-Header, exakte MediaBox, alle Formate, Cover-Geometrie, WinAnsi-Textumbruch
- **api** – alle Endpunkte inkl. Fehlerfälle, Export-Dateinamen, Projekt-CRUD, Path-Traversal-Schutz

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

---

## Projektstruktur

```
server/
  index.mjs                 HTTP-Server, API, statische Auslieferung
  lib/
    kdp.mjs                 Geometrie, Druckkosten, Tantiemen
    niches.mjs              Nischen-Pakete, Keyword-Werkstatt, Titelvorschläge
    validate.mjs            Validierung und Normalisierung der Konfiguration
    compose.mjs             Seitenplan, Statistiken, Cover-Texte
    store.mjs               Projekt-Ablage (JSON, lokal)
    rng.mjs                 deterministischer Zufall
    content/
      sudoku.mjs            Sudoku mit Eindeutigkeitsprüfung
      wordsearch.mjs        Wortsuchrätsel
      maze.mjs              Labyrinthe + Breitensuche
      words.mjs             deutsche Wortlisten
      text.mjs              kuratierte Kapitel, Prompts, Übungen
    pdf/
      text.mjs              WinAnsi-Sanitizing, Umbruch, Linien, Raster
      manuscript.mjs        Buchblock-Renderer
      cover.mjs             Vollumschlag-Renderer
public/
  index.html, styles.css, app.js    Studio-Oberfläche (ohne Framework, ohne Build)
tests/                              node:test-Suite
```

## Lizenz

Apache License 2.0 – siehe [LICENSE](LICENSE).
