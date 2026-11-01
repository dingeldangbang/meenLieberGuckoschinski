/**
 * Kuratierte Textbausteine der Buchmaschine.
 *
 * Wichtig: Diese Texte liefern Struktur, Übungen und Reflexionsfragen.
 * Der Fließtext eines Ratgebers bleibt Autorensache - die App erfindet
 * keine Fakten und keine Fallstudien.
 */

export const HOW_TO_TEXT = {
  sudoku: {
    heading: 'So funktioniert dieses Buch',
    paragraphs: [
      'Jedes Rätsel ist ein klassisches 9×9-Sudoku. In jede Zeile, jede Spalte und jeden der neun fett umrandeten Blöcke gehört jede Zahl von 1 bis 9 genau einmal.',
      'Beginne mit den Feldern, in denen nur eine Zahl möglich ist. Arbeite dich danach zu den Reihen und Blöcken vor, die schon viele Zahlen enthalten - so löst sich das Gitter fast von selbst.',
      'Zu jedem Rätsel findest du am Ende des Buches die Lösung. Wer nicht weiterkommt, kann dort nachsehen, ohne den Rest des Buches zu verlieren.',
      'Ein Tipp gegen Frust: Nach zehn Minuten Pause sieht man die Blockade meist sofort.',
    ],
  },
  wordsearch: {
    heading: 'So funktioniert dieses Buch',
    paragraphs: [
      'Die Wörter stehen waagerecht, senkrecht und diagonal im Gitter - vorwärts und rückwärts. Groß- und Kleinschreibung spielt keine Rolle, Umlaute zählen als ein Buchstabe.',
      'Die gesuchten Wörter stehen unter jedem Gitter. Streiche sie beim Finden durch und markiere sie im Gitter mit einem leichten Strich.',
      'Am Ende des Buches findest du alle Lösungen mit eingezeichneten Wörtern.',
    ],
  },
  maze: {
    heading: 'So funktioniert dieses Buch',
    paragraphs: [
      'Jedes Labyrinth hat einen Eingang oben links und einen Ausgang unten rechts. Es gibt immer genau einen Weg - Sackgassen gehören dazu.',
      'Beginne mit dem Finger und fahre den Weg nach. Wer mit Stift arbeitet, nimmt am besten einen hellen Buntstift, damit Korrekturen möglich bleiben.',
      'Alle Lösungswege sind am Ende des Buches abgebildet.',
    ],
  },
  journal: {
    heading: 'So arbeitest du mit diesem Journal',
    paragraphs: [
      'Nimm dir pro Tag fünf bis zehn Minuten. Es geht nicht um ein schönes Ergebnis, sondern um einen ehrlichen Gedanken.',
      'Jede Tagesseite hat ein Datum, eine Frage und Linien für deine Antwort. Wenn dir nichts einfällt, schreibe einfach den ersten Satz, der dir in den Kopf kommt.',
      'Alle sieben Tage folgt eine Rückblickseite. Sie sammelt, was in der Woche wichtig war, und stellt zwei Fragen nach vorn.',
      'Du musst nicht jeden Tag ausfüllen. Ein übersprungenes Blatt ist kein Fehler, sondern eine Pause.',
    ],
  },
  workbook: {
    heading: 'So arbeitest du mit diesem Übungsbuch',
    paragraphs: [
      'Dieses Buch ist kein Lesebuch. Jedes Kapitel beginnt mit einer kurzen Einordnung und endet mit Übungen, die auf Schreiblinien Platz zum Ausfüllen lassen.',
      'Arbeite kapitelweise und in deinem Tempo. Lieber ein Kapitel wirklich durchdenken als drei Kapitel überfliegen.',
      'Die Übungen bauen aufeinander auf. Wenn du ein Kapitel überspringst, lohnt sich ein Blick auf die Zusammenfassung am Kapitelende.',
      'Wiederhole die Übungen nach vier Wochen. Die Antworten verändern sich - das ist der eigentliche Fortschritt.',
    ],
  },
  notebook: {
    heading: 'Über dieses Notizbuch',
    paragraphs: [
      'Dieses Notizbuch ist bewusst schlicht gehalten: kein festes System, keine Vorgaben, keine Kalenderdaten.',
      'Nutze die ersten Seiten für das, was du immer wieder brauchst - Adressen, Passwörter für Dienste, Ideen oder eine Einkaufsliste.',
      'Die Seitennummerierung unten hilft dir, ein eigenes Register zu führen.',
    ],
  },
};

export const CLOSING_TEXT = {
  heading: 'Zum Schluss',
  paragraphs: [
    'Danke, dass du zu diesem Buch gegriffen hast. Wenn es dir geholfen hat, freuen sich andere Leserinnen und Leser über eine ehrliche Rezension - sie ist für unabhängige Autorinnen und Autoren der wichtigste Weg zu Sichtbarkeit.',
    'Fehler, Druckprobleme oder Verbesserungsvorschläge? Schreib eine kurze Nachricht an die im Impressum genannte Adresse. Jede Rückmeldung fließt in die nächste Auflage ein.',
  ],
};

export const JOURNAL_PROMPTS = [
  'Was war heute der Moment, in dem ich mich am lebendigsten gefühlt habe?',
  'Wofür bin ich heute dankbar - auch wenn es klein war?',
  'Welcher Gedanke hat mich heute am längsten begleitet?',
  'Was habe ich heute getan, nur weil ich es wollte?',
  'Welche Person hat heute einen Unterschied gemacht - und wie?',
  'Was war heute schwer - und wie bin ich damit umgegangen?',
  'Welche Kleinigkeit hat mir heute Freude gemacht?',
  'Wann habe ich heute tief durchgeatmet - und warum genau da?',
  'Was hat mich heute überrascht?',
  'Welchen Satz habe ich heute gehört, den ich behalten möchte?',
  'Was habe ich heute vermieden - und was steckt dahinter?',
  'Welche Grenze habe ich heute gesetzt oder gebraucht?',
  'Womit war ich heute zufrieden, obwohl es unperfekt war?',
  'Was hat mir heute Energie gegeben, was hat sie gekostet?',
  'Welche Sorge von heute Morgen ist am Abend noch wichtig?',
  'Was habe ich heute gelernt, das ich gestern noch nicht wusste?',
  'Wann war ich heute freundlich zu mir selbst?',
  'Welche Aufgabe habe ich heute erledigt, die ich lange vor mir hergeschoben habe?',
  'Was wünsche ich mir für morgen - in einem Satz?',
  'Welcher Moment heute verdient es, festgehalten zu werden?',
  'Was hat mich heute geärgert - und wie groß ist es morgen noch?',
  'Wem habe ich heute zugehört, wirklich zugehört?',
  'Was war heute leise, aber wichtig?',
  'Wie hat sich mein Körper heute angefühlt - und was braucht er?',
  'Welche Entscheidung habe ich heute getroffen, zu der ich stehe?',
  'Was habe ich heute losgelassen?',
  'Wofür möchte ich mir heute selbst auf die Schulter klopfen?',
  'Welche Gewohnheit hat mir heute gutgetan?',
  'Was hätte ich heute gern anders gemacht - ohne Härte gegen mich?',
  'Welche Farbe, welcher Klang, welcher Geruch bleibt von heute?',
  'Was bedeutet für mich heute Ruhe?',
  'Wo habe ich heute Nein gesagt - und war das richtig?',
  'Was hat mich heute zum Lachen gebracht?',
  'Welche Frage stelle ich mir heute zum ersten Mal?',
  'Was steht heute auf meiner Liste ganz oben - und warum?',
  'Welchen Menschen möchte ich in dieser Woche danken?',
  'Womit habe ich heute Zeit verschwendet, die sich gut angefühlt hat?',
  'Welche Erinnerung hat mich heute begleitet?',
  'Was würde ich heute einer guten Freundin raten - und gilt das auch für mich?',
  'Welches Detail von heute möchte ich nicht vergessen?',
  'Wann war ich heute stolz auf mich, ohne es jemandem zu sagen?',
  'Wovon hatte ich heute zu viel, wovon zu wenig?',
  'Was hat mir heute Halt gegeben?',
  'Welche Sache habe ich heute zum ersten Mal ausprobiert?',
  'Was habe ich heute aufgeschoben - und was ist der kleinste erste Schritt?',
  'Wie möchte ich mich heute Abend fühlen?',
  'Welche Nachricht möchte ich meinem zukünftigen Ich schicken?',
  'Was war heute schön, obwohl es alltäglich war?',
];

export const WEEKLY_REFLECTIONS = [
  {
    title: 'Wochenrückblick',
    questions: [
      'Was war diese Woche der wichtigste Moment?',
      'Was hat mich diese Woche Energie gekostet?',
      'Was nehme ich mir für die nächste Woche vor - ein konkreter Schritt?',
    ],
  },
  {
    title: 'Wochenrückblick: Menschen',
    questions: [
      'Mit wem hatte ich diese Woche ein gutes Gespräch?',
      'Wo hätte ich aufmerksamer sein können?',
      'Wen möchte ich in der nächsten Woche ansprechen?',
    ],
  },
  {
    title: 'Wochenrückblick: Körper & Ruhe',
    questions: [
      'Wie oft habe ich diese Woche wirklich Pause gemacht?',
      'Was hat meinem Körper gutgetan?',
      'Was brauche ich in der kommenden Woche mehr?',
    ],
  },
  {
    title: 'Wochenrückblick: Arbeit & Fokus',
    questions: [
      'Welche Aufgabe hat diese Woche wirklich gezählt?',
      'Was war Ablenkung, was Fortschritt?',
      'Was lasse ich nächste Woche bewusst liegen?',
    ],
  },
];

/** Themen-Bänke für das Übungsbuch. */
export const WORKBOOK_THEMES = {
  overthinking: {
    label: 'Grübeln & innere Unruhe',
    chapters: [
      {
        title: 'Was Grübeln eigentlich ist',
        intro: [
          'Grübeln ist kein Denken, das zu weit geht, sondern Denken, das im Kreis läuft. Es fühlt sich produktiv an, weil es anstrengt - löst aber nichts.',
          'In diesem Kapitel trennst du zwei Dinge, die im Alltag ständig verwechselt werden: Probleme lösen und Sorgen wälzen.',
        ],
        exercises: [
          { title: 'Bestandsaufnahme', prompt: 'Notiere drei Gedanken, die in den letzten Tagen immer wieder aufgetaucht sind.' },
          { title: 'Lösen oder Wälzen?', prompt: 'Prüfe jeden Gedanken: Gibt es einen nächsten konkreten Schritt? Wenn nein, markiere ihn als Grübeln.' },
          { title: 'Der Unterschied im Körper', prompt: 'Wo spürst du Grübeln körperlich? Beschreibe Ort, Temperatur und Bewegung.' },
        ],
      },
      {
        title: 'Der Auslöser: Ungewissheit',
        intro: [
          'Grübeln beginnt meist dort, wo Sicherheit fehlt. Das Gehirn versucht, mit Nachdenken eine Garantie herzustellen, die es nicht geben kann.',
          'Wer den Auslöser kennt, kann früher aussteigen - lange bevor die Gedankenschleife Fahrt aufnimmt.',
        ],
        exercises: [
          { title: 'Meine typischen Auslöser', prompt: 'Wann beginnt es bei dir? Uhrzeit, Ort, Situation, Gegenüber.' },
          { title: 'Was will ich kontrollieren?', prompt: 'Schreibe auf, welche Sicherheit du dir in diesen Momenten erhoffst.' },
          { title: 'Die ehrliche Wahrscheinlichkeit', prompt: 'Was davon ist wirklich beeinflussbar - und was nicht?' },
        ],
      },
      {
        title: 'Gedanken auf Abstand bringen',
        intro: [
          'Du bist nicht deine Gedanken. Diese Erkenntnis ist keine Floskel, sondern eine Fähigkeit, die man üben kann.',
          'Der Trick heißt Distanzierung: aus "Ich bin ein Versager" wird "Ich habe gerade den Gedanken, ein Versager zu sein".',
        ],
        exercises: [
          { title: 'Umformulieren', prompt: 'Nimm drei belastende Sätze und stelle jedem "Ich habe gerade den Gedanken, dass ..." voran.' },
          { title: 'Der Zeuge', prompt: 'Beschreibe die Szene von außen, als würdest du einem Freund zusehen.' },
          { title: 'Der Gedanke als Wetter', prompt: 'Welches Wetter wäre dein heutiger Gedanke? Und wie lange dauert diese Wetterlage meist?' },
        ],
      },
      {
        title: 'Der Körper zuerst',
        intro: [
          'Grübeln lässt sich leichter von unten stoppen als von oben. Atmung, Haltung und Bewegung wirken schneller als jeder gute Vorsatz.',
          'Deshalb beginnt dieses Kapitel nicht mit Argumenten, sondern mit dem Körper.',
        ],
        exercises: [
          { title: 'Atemprotokoll', prompt: 'Vier Sekunden einatmen, sechs Sekunden ausatmen - fünf Runden. Notiere danach, was sich verändert hat.' },
          { title: 'Körperanker', prompt: 'Welche drei Körperstellen kannst du überall erreichen und bewusst spüren?' },
          { title: 'Bewegung als Unterbrechung', prompt: 'Plane drei kurze Bewegungen in deinen Tag ein und halte fest, wie sie gewirkt haben.' },
        ],
      },
      {
        title: 'Sorgenzeit statt Sorgenalltag',
        intro: [
          'Verbieten funktioniert nicht. Ein festes Zeitfenster schon eher: 15 Minuten am Tag dürfen die Sorgen kommen, danach ist Pause.',
          'Das klingt banal und entlastet erstaunlich zuverlässig, weil es dem Gehirn einen Termin gibt.',
        ],
        exercises: [
          { title: 'Mein Zeitfenster', prompt: 'Lege Uhrzeit und Dauer fest und schreibe sie hier auf.' },
          { title: 'Regeln für die Sorgenzeit', prompt: 'Was ist in diesen 15 Minuten erlaubt - und was nicht?' },
          { title: 'Nach dem Fenster', prompt: 'Was tust du direkt danach? Plane eine konkrete Handlung.' },
        ],
      },
      {
        title: 'Entscheiden statt endlos prüfen',
        intro: [
          'Viele Grübelrunden sind unentschiedene Entscheidungen. Zwei Optionen, dritte und vierte Prüfung, keine Bewegung.',
          'Das Gegenmittel ist ein Entscheidungsrahmen: Kriterien festlegen, Frist setzen, wählen, stehen lassen.',
        ],
        exercises: [
          { title: 'Eine offene Entscheidung', prompt: 'Welche Entscheidung liegt gerade bei dir? Schreibe sie in einem Satz.' },
          { title: 'Drei Kriterien', prompt: 'Nach welchen drei Punkten willst du entscheiden? Nicht mehr als drei.' },
          { title: 'Der Termin', prompt: 'Bis wann entscheidest du? Trage Datum und Uhrzeit ein.' },
        ],
      },
      {
        title: 'Nachtgedanken',
        intro: [
          'Zwischen zwei und vier Uhr nachts ist niemand gut im Relativieren. Wichtige Entscheidungen gehören nicht in diese Stunden.',
          'Sinnvoll ist eine Notiz statt einer Diskussion: aufschreiben, morgen ansehen, weiterschlafen.',
        ],
        exercises: [
          { title: 'Notizbuch am Bett', prompt: 'Was hilft dir, nachts nicht im Kopf zu verhandeln?' },
          { title: 'Mein Abendritual', prompt: 'Beschreibe die letzte Stunde vor dem Schlafen - so wie sie heute aussieht.' },
          { title: 'Die wachfreundliche Version', prompt: 'Was willst du morgen anders machen? Ein Punkt genügt.' },
        ],
      },
      {
        title: 'Nachhaltig statt perfekt',
        intro: [
          'Ziel ist nicht ein Kopf ohne Gedanken, sondern ein Kopf, in dem du wieder wählen kannst.',
          'Rückfälle gehören zum Lernprozess. Entscheidend ist, wie schnell du wieder aufstehst.',
        ],
        exercises: [
          { title: 'Mein Fortschritt', prompt: 'Vergleiche heute mit dem Beginn des Buches. Was ist leichter geworden?' },
          { title: 'Mein Notfallplan', prompt: 'Was tust du in einem schlechten Tag? Drei Schritte, die immer gehen.' },
          { title: 'Brief an mich in einem Jahr', prompt: 'Schreibe fünf Sätze an dein zukünftiges Ich.' },
        ],
      },
    ],
  },
  humor: {
    label: 'Humor & Ruhestand',
    chapters: [
      {
        title: 'Der erste Tag ohne Wecker',
        intro: [
          'Der Ruhestand beginnt nicht mit einem Knall, sondern mit einem verdächtig leeren Montag.',
          'Dieses Kapitel sammelt die kleinen Beobachtungen, die alle kennen, die plötzlich Zeit haben.',
        ],
        exercises: [
          { title: 'Die ersten drei Tage', prompt: 'Was hast du an deinem ersten freien Montag gemacht? Sei ehrlich.' },
          { title: 'Ausschlafen - Theorie und Praxis', prompt: 'Wie lange hat es gedauert, bis dein innerer Wecker kapituliert hat?' },
          { title: 'Der neue Rhythmus', prompt: 'Welche Tageszeit ist jetzt deine beste? Notiere sie.' },
        ],
      },
      {
        title: 'Meinungen, die niemand bestellt hat',
        intro: [
          'Mit dem Alter kommt eine seltene Freiheit: Man darf Dinge sagen, für die man früher Ärger bekommen hätte.',
          'Die Kunst ist, sie so zu sagen, dass alle lachen - auch die, über die gesprochen wird.',
        ],
        exercises: [
          { title: 'Meine beste Ungefragtheit', prompt: 'Welchen Satz sagst du inzwischen regelmäßig, obwohl ihn keiner hören wollte?' },
          { title: 'Die Kunst der Pause', prompt: 'Wie lange schweigst du nach einem Satz, der gesessen hat?' },
          { title: 'Das freundliche Nein', prompt: 'Formuliere ein Nein, das trotzdem einlädt.' },
        ],
      },
      {
        title: 'Werkzeug, das ich noch brauche',
        intro: [
          'In jeder Garage liegt ein Werkzeug, das seit 1987 auf seinen Einsatz wartet.',
          'Dieses Kapitel ist eine Liebeserklärung an den Satz: Das kann man noch reparieren.',
        ],
        exercises: [
          { title: 'Inventur', prompt: 'Welches Werkzeug besitzt du am längsten, ohne es je benutzt zu haben?' },
          { title: 'Die Ausrede', prompt: 'Welche Begründung sagst du, wenn du es nicht wegwerfen willst?' },
          { title: 'Der Ehrenplatz', prompt: 'Wo hängt bei dir das Stück, das eigentlich ins Museum gehört?' },
        ],
      },
      {
        title: 'Enkel, Technik und Erklärungen',
        intro: [
          'Es gibt zwei Sorten von Technikproblemen: die eigenen und die der anderen, die man dann lösen soll.',
          'Dieses Kapitel behandelt den Klassiker: Der Router blinkt und du bist der einzige mit Geduld.',
        ],
        exercises: [
          { title: 'Der Support-Fall', prompt: 'Welche Anfrage hast du zuletzt bekommen? Beschreibe sie in drei Sätzen.' },
          { title: 'Meine Wunderlösung', prompt: 'Was war dein Trick, auf den du insgeheim stolz bist?' },
          { title: 'Der Satz, der immer hilft', prompt: 'Notiere deinen Standardsatz, wenn nichts mehr geht.' },
        ],
      },
      {
        title: 'Familienfeiern überstehen',
        intro: [
          'Jede Familie hat ein Ritual, das niemand mehr erklären kann, das aber trotzdem stattfindet.',
          'Hier darf es einmal aufgeschrieben werden.',
        ],
        exercises: [
          { title: 'Das unausgesprochene Gesetz', prompt: 'Welche Regel gilt bei euch auf jeder Feier?' },
          { title: 'Der Klassiker', prompt: 'Welche Geschichte wird jedes Jahr neu erzählt? Eine Version genügt.' },
          { title: 'Die Rolle, die keiner will', prompt: 'Welche Aufgabe landet auf deiner Seite des Tisches?' },
        ],
      },
      {
        title: 'Sport, nein danke',
        intro: [
          'Joggen ist ein Trend, Spazieren eine Lebenseinstellung.',
          'Dieses Kapitel verteidigt die langsame Fortbewegung mit überzeugenden Argumenten.',
        ],
        exercises: [
          { title: 'Meine Strecke', prompt: 'Beschreibe deinen liebsten Weg - mit Bank, Aussicht und Abkürzung.' },
          { title: 'Die Ausrede', prompt: 'Welche Antwort gibst du auf: "Und, treibst du Sport?"' },
          { title: 'Die neue Bestleistung', prompt: 'Was war dein größter Erfolg dieser Woche? (Bitte realistisch bleiben.)' },
        ],
      },
      {
        title: 'Reisen ohne Plan',
        intro: [
          'Früher fuhr man in den Urlaub, um etwas zu sehen. Heute fährt man, um zu sitzen - und zwar mit Aussicht.',
          'Dieses Kapitel ist ein Plädoyer für den zweiten Kaffee.',
        ],
        exercises: [
          { title: 'Der perfekte Platz', prompt: 'Beschreibe den Ort, an dem du am liebsten nichts tust.' },
          { title: 'Die beste Unterkunft', prompt: 'Was muss eine Unterkunft haben, damit du wiederkommst?' },
          { title: 'Das nächste Ziel', prompt: 'Wohin soll es gehen? Auch wenn es nur 30 Kilometer sind.' },
        ],
      },
      {
        title: 'Das Erbe des Gelassenen',
        intro: [
          'Am Ende bleibt nicht die Uhrzeit des Aufstehens, sondern die Haltung.',
          'Dieses Kapitel fragt, was wirklich bleiben soll - und was man getrost liegen lassen kann.',
        ],
        exercises: [
          { title: 'Was ich weitergebe', prompt: 'Welche Eigenschaft oder Gewohnheit soll über dich hinaus bestehen?' },
          { title: 'Was ich loslasse', prompt: 'Welche Sache darf endlich Platz machen? Beschreibe sie.' },
          { title: 'Der letzte gute Satz', prompt: 'Welchen Satz sollen andere von dir behalten?' },
        ],
      },
    ],
  },
  generic: {
    label: 'Allgemeines Übungsbuch',
    chapters: [
      {
        title: 'Wo du stehst',
        intro: [
          'Jedes Lernen beginnt mit einer ehrlichen Bestandsaufnahme - ohne Bewertung, nur mit Beobachtung.',
        ],
        exercises: [
          { title: 'Ist-Zustand', prompt: 'Beschreibe die Situation, in der du dich gerade befindest.' },
          { title: 'Was gut läuft', prompt: 'Nenne drei Dinge, die bereits funktionieren.' },
          { title: 'Was fehlt', prompt: 'Was brauchst du, um den nächsten Schritt zu gehen?' },
        ],
      },
      {
        title: 'Dein Ziel',
        intro: ['Ziele wirken, wenn sie klein, konkret und überprüfbar sind.'],
        exercises: [
          { title: 'Das Ziel in einem Satz', prompt: 'Formuliere ein Ziel, das du in vier Wochen erreichen kannst.' },
          { title: 'Woran du es merkst', prompt: 'Wie genau erkennst du, dass du es erreicht hast?' },
          { title: 'Der erste Schritt', prompt: 'Was tust du innerhalb der nächsten 24 Stunden?' },
        ],
      },
      {
        title: 'Hindernisse',
        intro: ['Wer Hindernisse vorher kennt, wird seltener von ihnen überrascht.'],
        exercises: [
          { title: 'Der typische Bremser', prompt: 'Was hat dich in der Vergangenheit am häufigsten ausgebremst?' },
          { title: 'Gegenstrategie', prompt: 'Was genau machst du, wenn es wieder auftritt?' },
          { title: 'Notfallkontakt', prompt: 'Wen rufst du an, wenn du Unterstützung brauchst?' },
        ],
      },
      {
        title: 'Gewohnheiten',
        intro: ['Gewohnheiten entstehen durch Wiederholung am gleichen Ort und zur gleichen Zeit.'],
        exercises: [
          { title: 'Die neue Gewohnheit', prompt: 'Welche kleine Handlung willst du täglich wiederholen?' },
          { title: 'Der Anker', prompt: 'An welche bestehende Handlung hängst du sie?' },
          { title: 'Die erste Woche', prompt: 'Trage für sieben Tage ein, ob es geklappt hat.' },
        ],
      },
      {
        title: 'Rückschläge',
        intro: ['Ein Rückschlag ist ein Messpunkt, kein Urteil.'],
        exercises: [
          { title: 'Was ist passiert', prompt: 'Beschreibe den letzten Rückschlag sachlich, ohne Vorwurf.' },
          { title: 'Was du gelernt hast', prompt: 'Was weißt du jetzt, was du vorher nicht wusstest?' },
          { title: 'Der Wiedereinstieg', prompt: 'Welche Handlung bringt dich innerhalb einer Stunde zurück?' },
        ],
      },
      {
        title: 'Der Rückblick',
        intro: ['Erst der Abstand zeigt, was sich bewegt hat.'],
        exercises: [
          { title: 'Der Vergleich', prompt: 'Was ist heute anders als am Anfang?' },
          { title: 'Was bleibt', prompt: 'Welche Übung willst du behalten?' },
          { title: 'Der nächste Zyklus', prompt: 'Welches Thema nimmst du dir als nächstes vor?' },
        ],
      },
    ],
  },
};

export function themeForNiche(nicheId) {
  if (nicheId === 'overthinking-workbook') return 'overthinking';
  if (nicheId === 'humor-geschenk-knacker') return 'humor';
  return 'generic';
}
