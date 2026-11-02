# Änderungen

Alle nennenswerten Änderungen an diesem Projekt. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionen nach
[SemVer](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Hinzugefügt
- `npm run verify`: Abnahmelauf mit 39 Prüfungen (Umgebung, Syntax, Tests,
  Pipeline mit echten Bytes, echter HTTP-Server), Bericht als JSON.
- `scripts/validate_onix.mjs`: XSD-Validierung gegen ONIX 3.0 Revision 1,
  Schema über gepinnte Blob-SHAs, Validator `xmllint` oder `lxml`.
- Sicherheits-Header inklusive strikter CSP, Rate-Limit für Export-Routen,
  `ETag`/`304`, korrekte `HEAD`-Antworten, `robots.txt`.
- Projekt-Import über Oberfläche und `POST /api/projects/import`.
- Skip-Link, Label für die Keyword-Eingabe, Live-Region für Exportmeldungen,
  vollständige EPUB-Accessibility-Metadaten.
- CI-Workflow `Verify` für jeden Push und Pull Request, Dependabot,
  `SECURITY.md`, `CONTRIBUTING.md`, `docs/todo.md`, `docs/abnahme.md`.

### Behoben
- Fehlende Dateien mit Endung lieferten HTML mit Status 200 statt 404.
- `HEAD`-Requests enthielten einen Body.
- ONIX: `DateFormat` stand nach `Date`; `SupplyDetail` ohne `Supplier`-Composite;
  ohne Preis fehlte `UnpricedItemType`.

### Geändert
- README nennt den tatsächlichen Teststand (164 → 203) und den Abnahmelauf.

## [1.0.0]

Erste vollständige Fassung: Nischen, Inhaltsgeneratoren, PDF-Export, EPUB,
Preflight, Portfolio, Pipeline mit Gates und Gumroad-Deploy, ONIX, DNB-Paket.
