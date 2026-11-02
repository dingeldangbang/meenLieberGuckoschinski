# Abnahme

Stand: 2. November 2026 · Commit `d2055f2` · Branch `arena/82eb4e86-meenlieberguckoschinski`

Dieses Dokument beschreibt, **wie** geprüft wurde und **was** dabei herauskam.
Alles hier ist mit einem Befehl reproduzierbar:

```bash
npm ci
npm run verify
```

`npm run verify` startet die App nicht dauerhaft, sondern prüft sie vollständig
und beendet sich mit Exit-Code `0` (alles grün) oder `1` (mindestens ein Fehler).
Der maschinenlesbare Bericht landet in `artifacts/verify-report.json`.

## Ergebnis des letzten Laufs

| Prüfblock | Prüfungen | Ergebnis |
|---|---|---|
| 1. Umgebung (Node ≥ 20, Abhängigkeiten) | 2 | ok |
| 2. Syntax (`node --check` über alle Module) | 1 (48 Dateien) | ok |
| 3. Testsuite (`node:test`) | 1 (164 Tests) | ok |
| 4. Pipeline (Harvest → Bau → Gate → ONIX+XSD → DNB) | 11 | ok |
| 5. HTTP-Server (19 Routen) | 19 | ok |
| 6. Bericht | 1 | ok |

**Gesamt: 32 von 32 Prüfungen grün, 164 von 164 Tests grün, 0 übersprungen.**

### Zwei Umgebungen, zwei Läufe

| Umgebung | Ergebnis |
|---|---|
| Frischer Klon, nur `npm ci`, **ohne** XSD-Validator | 31 ok · 1 übersprungen · 0 Fehler |
| Frischer Klon mit `python3-lxml` | 32 ok · 0 übersprungen · 0 Fehler |

Der Unterschied ist Absicht: ohne Validator wird der XSD-Schritt als
`skip` mit Begründung geführt, **niemals** als `ok`. So lügt der Bericht nicht,
wenn eine Maschine weniger Werkzeuge hat.

## Was die einzelnen Blöcke wirklich anfassen

**Pipeline.** Es werden echte Bytes erzeugt, nicht nur Objekte im Speicher:

- `harvest_keywords.mjs --offline` → Nischenblatt ohne Netzzugriff
- `build_package.mjs` → Buchblock-PDF (1 165 267 B), Cover-PDF (704 710 B),
  EPUB (≈ 373 KB), Manifest
- `preflight_checker.mjs --all` → Nachrechnung auf den Dateien auf der Platte
  (Rückenbreite, Parität, Barcode-Freizone), `pageCount = 120`
- `onix.mjs` → ONIX 3.0 mit ISBN `9783161484100`
- `validate_onix.mjs` → Gültigkeit gegen das offizielle XSD
- `legal_deposit.mjs` → DNB-Paket (Metadaten, ZIP, Checkliste)

**Server.** Es wird ein echter Serverprozess auf einem freien Port gestartet und
über HTTP geprüft. Bei PDFs und EPUB wird die **Dateisignatur** kontrolliert
(`%PDF`, `PK`), nicht nur der Statuscode – ein 200 mit leerem Body fällt durch.

## Was der Lauf gefunden hat

Der Abnahmelauf ist nicht dekorativ. Er hat in dieser Session drei echte Fehler
in der ONIX-Ausgabe aufgedeckt, die ohne ihn niemand gesehen hätte:

1. `<DateFormat>` stand **nach** `<Date>` (ONIX verlangt davor).
2. `<SupplyDetail>` enthielt ein flaches `<SupplierRole>` statt des Composites
   `<Supplier>` mit `<SupplierRole>` und `<SupplierName>`.
3. Ohne Preisangabe fehlte das Pflichtelement `<UnpricedItemType>`
   (Code 04, Code List 57 – genau dafür vorgesehen).

Alle drei sind behoben und durch Tests in `tests/onix-schema.test.mjs`
festgenagelt, damit sie nicht zurückkommen.

## Grenzen der Abnahme

Ehrlich benannt, weil ein grüner Haken sonst mehr verspricht, als er kann:

- **Kein echter KDP-Upload, kein echter Gumroad-Verkauf.** Beides ist gegen die
  dokumentierten Endpunkte gebaut, aber ohne Konto nicht live ausgeführt. Der
  Abnahmelauf prüft den Deployer nur über seine Vertragstests.
- **Keine DNB-Ablieferung.** Das Paket ist vollständig, der Hotfolder fehlt.
  § 14 DNBG verlangt die Übertragung binnen einer Woche – das bleibt ein
  menschlicher Schritt.
- **Kein XSD-Validator auf jeder Maschine.** Fehlt `xmllint` oder `lxml`, wird
  der Schritt übersprungen. `npm run onix:schema` holt das Schema, der Validator
  muss aus der Distribution kommen (`libxml2-utils` bzw. `python3-lxml`).
- **Das ONIX-Schema kommt aus einem öffentlichen Spiegel**, nicht von
  `ns.editeur.org` (im Sandbox nicht erreichbar). Die drei Dateien sind über
  Git-Blob-SHAs gepinnt, ein stiller Schematausch ist damit ausgeschlossen.
- **Die Serverprüfung läuft gegen `127.0.0.1`**, nicht durch den Browser. Die
  Oberfläche selbst ist zusätzlich manuell in der Vorschau geprüft.
- **Der GitHub-Workflow ist noch nie remotely gelaufen.** GitHub registriert
  Workflows nur aus dem Default-Branch; solange dieser Branch nicht gemergt ist,
  liefert `gh workflow run publishing-pipeline.yml` ein 404 und
  `GET /actions/workflows` meldet `total_count: 0`. Geprüft ist das YAML
  (Parsing, 15 Schritte, `if:`-Bedingungen) und der Ablauf lokal – der erste
  echte Lauf gehört nach dem Merge beobachtet.
