# Analyse der mitgelieferten „End-to-End Amazon KDP Publishing Engine“

Diese Datei ist die ehrliche Abrechnung mit dem gelieferten Konzeptpapier: was daran stimmt,
was daran falsch ist, was übernommen wurde – und was bewusst draußen bleibt.

Stand: 2. November 2026, Branch `arena/82eb4e86-meenlieberguckoschinski`.

---

## 1. Fehler im Papier (mit Beleg)

| # | Behauptung im Papier | Warum das falsch ist |
| --- | --- | --- |
| 1 | Ausgabe mit ungerader Seitenzahl (z. B. 30 Seiten) | KDP druckt in Bögen; ungerade Seitenzahlen werden abgelehnt. Die Buchmaschine rundet jede Vorgabe auf eine gerade Zahl. |
| 2 | Fester linker Rand für alle Seiten | KDP verlangt **gespiegelte** Ränder: der Bundsteg (Gutter) wechselt mit der Seite. Ein fester linker Rand produziert auf jeder zweiten Seite zu wenig Bund. |
| 3 | Kolumnentitel: gerade Seiten links, ungerade rechts | Genau umgekehrt. In einem Buch steht der Außentitel auf der **linken** Seite links und auf der **rechten** Seite rechts. |
| 4 | Typst platziert den Barcode „unten mittig auf der Rückseite“ | KDP setzt den Barcode unten **rechts** auf die Rückseite, 2 × 1,2 Zoll, mindestens 0,25 Zoll von Unterkante und Rücken entfernt. Unten mittig verdeckt der Code Text oder liegt im Beschnitt. |
| 5 | Typst **und** ReportLab als Layout-Engine | Zwei Engines, zwei Wahrheiten über Seitenzahl, Ränder und Schriftmetriken. Genau daraus entstehen Rückenbreiten-Fehler. Die Buchmaschine hat eine Engine. |
| 6 | Druckkosten = 0,60 € + 0,012 € × Seiten | Für Amazon.de gilt: **2,30 € pauschal bis 110 Seiten**, darüber 1,00 € + 0,012 €/Seite. Bei 134 Seiten sind das 2,61 €, nicht 2,21 €. Die Pauschale fehlt im Papier komplett. |
| 7 | Tantieme = 60 % × Preis − Druckkosten, immer | Seit Juni 2025 gilt für E-Books **und** Taschenbücher unter 9,99 €: 50 %. Die Margenmatrix im Papier ist damit bei jedem Preis unter 9,99 € zu optimistisch – und übersieht den Sprung von 50 % auf 60 %. |
| 8 | Cover in CMYK, PDF/X-1a zwingend | KDP nimmt RGB-PDFs an. CMYK ist eine Empfehlung für Farbsicherheit, keine Vorgabe. Ein PDF/X-Export wäre schön, ist aber kein Ablehnungsgrund. |
| 9 | KI-Fließtext als Kern der Engine | Widerspricht der Kostenvorgabe (0,00 €/Monat) und dem KDP-Risiko: reine KI-Texte ohne Bearbeitung werden regelmäßig abgelehnt. |
| 10 | `cron: '0 4 */2 * *'` baut und veröffentlicht Bücher | Bücher entstehen nicht im Zwei-Tage-Takt. Ein Zeitplan, der ohne Prüfung veröffentlicht, ist ein ToS-Verstoß (KDP verbietet automatisierte Uploads) und bei GitHub Actions zudem ein sinnloser Minutenverbrauch. |
| 11 | Marktintelligenz durch Scraping der Amazon-Suchergebnisse | Verstößt gegen die Amazon-Nutzungsbedingungen, bricht bei jeder Layout-Änderung und liefert BSR-Zahlen, die keine Absätze sind. |
| 12 | „Druckfertig“ ohne Preflight | Ohne Trim-, Gutter-, Seitenzahl- und Schriftprüfung ist „druckfertig“ eine Behauptung. KDP lehnt fehlende Schrift-Einbettung ab – pdf-lib-Standardschriften sind nicht eingebettet. |

---

## 2. Was übernommen wurde (und geprüft ist)

- **Druckkosten- und Tantiemenmodell** mit echter KDP-Staffel (`server/lib/kdp.mjs`):
  Pauschale bis 110 Seiten, danach pro Seite, Großformat teurer, UK mit eigenen Sätzen;
  60-%-Band ab 9,99 €, darunter 50 %, Mindestpreis so, dass die Tantieme nie negativ wird.
- **Geometrie** nach KDP: Papierstärken je Papierart, Hardcover-Zugabe 0,189 Zoll,
  Rückenbeschriftung erst ab 80 Seiten mit 0,0625 Zoll Abstand zu beiden Falzen,
  Barcode-Zone unten rechts, Sicherheitsabstand 0,25 Zoll, Gutter-Staffel
  0,375 / 0,5 / 0,625 / 0,75 / 0,875 Zoll.
- **Preflight auf echten Bytes** (`server/lib/preflight.mjs`): Trimmaß, gerade Seitenzahl,
  Seitenbereich, Ränder, Bundsteg, Cover-Maße, Rückenbreite, Barcode-Zone, Schrift-Einbettung
  (FontDescriptor → FontFile). Ergebnis `pass | warn | fail`, genutzt in API, CLI und UI.
- **Content Governance** (`server/lib/policy.mjs`): KI-Offenlegung im Wortlaut des KDP-Dialogs,
  Markenscan mit Wortgrenzen, Gattungsbegriffe (Sudoku, Mandala …) als Ausnahme,
  Werbesprache-Liste, Low-Content-Risiko aus dem Seitenplan.
- **Automatisierung ohne Cloud**: CLI (`bin/buchmaschine.mjs`) baut Buchblock, Cover, EPUB,
  Metadaten-JSON, Metadaten-Arbeitsblatt und Report in einem Aufruf, Exit-Code 2 bei Preflight-Fehlern.
  Kein GitHub-Actions-Cron, kein Upload.

**Nachgerechnetes Beispiel:** 134 Seiten, 6 × 9 Zoll, weißes Papier, 9,99 €
→ Druckkosten 2,61 €, Tantieme 3,38 €, Rücken 0,3018 Zoll, Cover 12,5518 × 9,25 Zoll.
Bei 9,50 € wären es 1,35 € – der Sprung an der Schwelle ist 1,24 € und wird aktiv ausgewiesen.

---

## 3. Lücken, die bleiben (Gap A–D)

### Gap A – Marktdaten
Kuratierte Nischen, Keyword-Heuristiken und Amazons Autocomplete sind **keine** Marktforschung.
Es gibt keine Absatzschätzung, keinen BSR-Verlauf, keine Konkurrenz-Analyse über Rezensionszahlen.
Wer das braucht, zahlt entweder für Daten (Publisher Rocket, Helium 10) oder recherchiert manuell.
Bewusst so: jede Zahl in der App ist als Schätzung gekennzeichnet.

### Gap B – Satzqualität
Die Engine bricht Text manuell um. Es gibt **keine** Silbentrennung, keinen Blocksatz mit
Optical Margin, keine Hurenkinder-/Schusterjungen-Kontrolle und keine PDF/X-Ausgabe.
Für Rätselbücher, Journale und Arbeitsbücher ist das ausreichend – für einen 300-Seiten-Roman nicht.
Ein Typst- oder LaTeX-Backend wäre der nächste Schritt, aber nur mit **einer** Engine.

### Gap C – Bild und Umschlag
Cover bestehen aus Typografie und Flächen: kein Bildimport, keine 300-dpi-Prüfung von Bildern,
kein CMYK, kein eingebetteter ISBN-Barcode (den druckt Amazon selbst).
Wer Illustrationen will, liefert eine Grafik und setzt sie im KDP-Cover-Tool zusammen.

### Gap D – Betrieb
Kein CI-Job, der nachts Bücher baut (absichtlich), keine KDP-API (existiert nicht),
keine Preisumrechnung für Marktplätze außer de/com/uk, kein Lager-/Bestandsdenken.
Automatisiert ist der Handwerksteil, nicht die Veröffentlichung.

---

## 4. Bewusst abgelehnt

- Automatischer Upload oder Auto-Publish: KDP-ToS-Verstoß, Kontosperre als Risiko.
- Generative Fließtexte: Kosten, Qualität, Ablehnungsrisiko.
- Zwei Layout-Engines parallel: eine Quelle der Wahrheit oder keine.
- Scraping der Amazon-Suchergebnisse: rechtlich und technisch fragil.
- Zeitplan-getriebene Veröffentlichung: Bücher sind keine Cronjobs.

---

## 5. Was das für den Umsatz heißt

Die Rechnung bleibt ernüchternd: bei 3,38 € Tantieme und 10 Verkäufen im Monat sind das 33,80 €.
Ein Portfolio aus zehn Titeln mit je 10 Verkäufen liegt bei 338 € – vor Steuern und ohne Garantie.
Die App verkürzt die Produktionszeit pro Titel von Tagen auf Minuten. Sie ersetzt keine Nachfrage.
