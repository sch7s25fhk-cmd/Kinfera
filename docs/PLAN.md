# Entwicklungsplan – Funkenflug

Handy-Jump'n'Run im Querformat. Jede Phase endet lauffähig, mit Testanleitung und Feedback-Pause.

## Phase 1 – Spielbarer Prototyp ✅
- Engine: Loop, Querformat-Vollbild, Mehrfinger-Touch, Bildschirmtasten, Partikel
- Lio: Laufen, Springen (Coyote-Time, Sprungpuffer, variable Höhe), Funken werfen, Laterne als Leben/Munition
- Gegner: Rostkäfer, Dornschnecke, Nebelqualle; Draufspringen und Abschießen
- Level 1-1 „Der erste Funke": Wolkenplattformen, Brücke, Dornen, Aufwind, Kontrollpunkte, Funken, verlorenes Licht
- Grafik: Parallax-Himmel (Sonne, ferne Inseln, Bergkämme, Wolkenbänke, Wolkenmeer), Grasnarbe, Tiefenschatten, Lichtschein der Laterne, Partikel, Kamera-Wackeln
- Titelbild, Pause (Weiter/Neustart), Ergebnisfenster

## Phase 2 – Sound & Spielgefühl
- Web-Audio-Synth: Sprung, Funke, Treffer, Sammeln, Kontrollpunkt, Musik-Loop pro Welt
- Feinschliff: Landeverformung, Schritt-Staub, Treffer-Pause (Hit-Stop), Übergänge zwischen Szenen
- Einstellungen: Ton an/aus, Tastengröße/-position, Linkshänder-Layout

## Phase 3 – Welt 1 komplett
- Level 1-2 bis 1-4 mit neuen Elementen: bröckelnde Wolken, Ranken zum Klettern, seitliche Windstöße, Kurbelvogel
- Geheimnisse: versteckte Funkenwege, ein „verborgener Funke" pro Level
- Boss 1: Sturmmaschine im Mooswald

## Phase 4 – Weltkarte & Speichern
- Weltkarte zum Antippen der Level, freischalten, beste Zeiten, Funken-Sterne
- Speichern in `localStorage`

## Phase 5 – Weitere Welten
- Kristallhöhlen (dunkel – Laterne als echte Lichtquelle), Sturmklippen, Glutfelder, versunkene Ruinen
- Je Welt neue Gegner, ein neues Element und ein Boss

## Phase 6 – Veröffentlichung
- Als installierbare Web-App (PWA) und optional als App für iOS/Android verpacken
- Balancing, Leistung auf älteren Handys, Barrierefreiheit (Farbkontraste, größere Tasten)

## Entscheidungen
- Projekt umgebaut von „Die Driftlande" (Kreaturen-Sammeln/Festungsbau) zu **Funkenflug** (Jump'n'Run).
- Handyspiel im **Querformat** mit Bildschirmtasten (für ein Jump'n'Run nötig).
- Held **Lio** mit Laterne; Welt bleibt **die Driftlande**.
