# Sicherheit

## Was diese Anwendung ist

Ein lokaler Webserver, der auf `0.0.0.0:3000` lauscht und Bücher baut. Es gibt
**keine Anmeldung**, **keine Datenbank**, **keine Cloud** und **keine
Zugangsdaten im Browser**. Damit ist das Bedrohungsmodell klein – aber nicht
null, sobald der Port in einem Netzwerk erreichbar ist.

## Betriebsregeln

- **Nicht ins offene Internet stellen.** Der Server hat keine Authentifizierung.
  Für den Zugriff aus dem LAN: `HOST=127.0.0.1 npm start` und einen SSH-Tunnel
  verwenden. Für eine öffentliche Demo gehört ein Reverse-Proxy mit Auth davor.
- **Keine Secrets im Repo.** Die Pipeline liest `GUMROAD_TOKEN`, `BOOK_ISBN`,
  `PUBLISHER_NAME` und `DNB_HOTFOLDER` ausschließlich aus der Umgebung bzw. aus
  GitHub-Secrets. Fehlt ein Wert, wird der Schritt übersprungen, nicht geraten.
- **Schreibrechte prüfen.** Gespeicherte Projekte landen in `data/projects.json`
  (überschreibbar über `BUCHMASCHINE_DATA_DIR`). Wer den Prozess startet, kann
  diese Datei lesen – der Prozess läuft daher nicht als root.

## Was der Server technisch abwehrt

| Risiko | Maßnahme | Test |
| --- | --- | --- |
| Path-Traversal | Auflösung gegen `public/`, Prefix-Prüfung inkl. Trenner | `tests/server-hardening.test.mjs` |
| XSS über Antworten | strikte CSP ohne `unsafe-inline`/`unsafe-eval`, `nosniff` | dito |
| Fremde Einbettung von Ressourcen | `default-src 'self'`, `object-src 'none'`, `base-uri 'none'` | dito |
| Überschwemmung durch teure Exporte | Rate-Limit 120 Anfragen/Minute pro IP auf `/api/export/*`, `/api/preflight`, `/api/preview` | dito |
| Riesen-Requests | Body-Limit 2 MB, `413` | `tests/api.test.mjs` |
| Kaputtes JSON | `400` statt Absturz | dito |
| Verratene Interna | 500er loggen serverseitig, Antwort enthält nur die Meldung | `server/index.mjs` |

Bewusst **nicht** gesetzt: `X-Frame-Options` und `frame-ancestors`. Die
Oberfläche wird in einer Vorschau-Umgebung in einem iframe angezeigt; ein
Framing-Verbot würde sie unbrauchbar machen. Das ist eine bewusste Abwägung, kein
Versehen – und steht als Test in `tests/server-hardening.test.mjs`.

## Melden

Sicherheitslücken bitte **nicht** als öffentliches Issue, sondern über
GitHub → *Security* → *Report a vulnerability* (Private Vulnerability Reporting)
oder direkt an den Maintainer. Bitte mit Reproduktionsschritten und betroffener
Version. Antwort innerhalb von 7 Tagen, Fix oder Bewertung innerhalb von 30.

## Abhängigkeiten

Zwei Laufzeitabhängigkeiten (`pdf-lib`, `@pdf-lib/fontkit`). `npm audit` läuft
lokal und in der CI mit; Dependabot meldet Updates wöchentlich gruppiert.
