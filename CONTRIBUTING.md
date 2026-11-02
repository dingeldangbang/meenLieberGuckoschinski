# Mitwirken

## Schnellstart

```bash
npm ci
npm start          # http://localhost:3000
npm test           # 203 Tests
npm run verify     # vollständige Abnahme inkl. Pipeline und Server
```

## Regel: nichts ohne Prüfung

Jede Änderung muss `npm run verify` bestehen. Der Lauf prüft Syntax, Tests, die
Pipeline mit echten Bytes und einen echten Server – nicht nur Objekte im Speicher.
Ein Pull Request ohne grünen Lauf wird nicht gemergt.

## Regel: keine Attrappen

Keine Platzhalter, keine `TODO`s, keine Beispieldaten, die wie echte Daten
aussehen. Wenn etwas nicht geht, steht das im Code mit Begründung und im
[To-do-Protokoll](docs/todo.md) – nicht als leere Funktion.

## Regel: eine Quelle der Wahrheit

Die Buchgeometrie steht in `server/lib/kdp.mjs`. Wer sie woanders nachrechnet,
erzeugt zwei Wahrheiten; genau deshalb gibt es nur einen Renderer
(`server/lib/pdf/`) und keine zweite Layout-Engine.

## Regel: bescheiden rechnen

Alle Marktzahlen sind Schätzungen und müssen als solche gekennzeichnet sein.
Keine Zahl ohne Quelle, kein Versprechen ohne Test.

## Struktur

| Pfad | Inhalt |
| --- | --- |
| `server/` | HTTP-Server, Buchlogik, Renderer |
| `scripts/` | CI-Pipeline, ONIX, DNB, Abnahmelauf |
| `public/` | Oberfläche ohne Framework und ohne Build-Schritt |
| `tests/` | `node:test`, keine Test-Framework-Abhängigkeit |
| `docs/` | Analyse, Pipeline, Abnahme, To-do |

## Stil

ESM, keine Semikolon-Diskussion (das Repo nutzt sie), 2 Leerzeichen, deutsche
Kommentare dort, wo eine Entscheidung erklärt werden muss. Kein Linter-Zwang –
`npm run verify` ist die Instanz.

## Lizenz

Beiträge stehen unter Apache-2.0. Mit dem Pull Request bestätigst du, dass du den
Code beisteuern darfst.
