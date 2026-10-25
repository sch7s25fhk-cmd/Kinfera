# Souverän

Eine Stadt-Aufbausimulation fürs Handy (Hochformat, Touch) auf einer Weltkarte im Satellitenbild-Stil – ohne Ländergrenzen. Gib echte Koordinaten ein (oder tippe auf den Globus), gib deiner Stadt einen Namen und gründe sie genau dort. Jede Spielerin und jeder Spieler besitzt eine eigene Stadt; auf dem Globus sieht man die Städte aller anderen.

Das vollständige Spielkonzept steht in [SPIELKONZEPT.md](SPIELKONZEPT.md).

## Spielen

`index.html` lädt die Skripte als einzelne Dateien. Manche Browser blockieren das bei `file://`, deshalb am besten über einen kleinen Webserver starten:

```bash
cd souveraen
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Alternativ eine einzelne, eigenständige HTML-Datei bauen, die sich direkt per Doppelklick öffnen lässt:

```bash
python3 tools/build_single.py            # schreibt dist/souveraen.html
```

### Stadt gründen

Auf dem Startbildschirm Koordinaten eintragen – Dezimal (`48.137, 11.575`, auch mit Komma `48,137 11,575`) oder in Grad, Minuten, Sekunden (`48°08'13"N 11°34'30"E`, O oder E für Ost) – und „Zeigen“ tippen, oder direkt auf den Globus tippen. Das Spiel prüft, ob dort Land ist und ob schon eine andere Stadt steht (Mindestabstand 1,5 km). Dann Namen und Baustil wählen und gründen. Das Stadtgebiet ist 32 × 32 km groß (ein Feld = 250 m) und liegt maßstabsgetreu an der echten Stelle der Welt.

### Gemeinsame Welt

Als veröffentlichtes Artefakt trägt das Spiel jede gegründete Stadt in eine gemeinsame Datenbank ein (Name, Koordinaten, Baustil, Einwohnerzahl – keine persönlichen Daten außer der Spieler-Kennung). Jeder sieht die Städte der anderen auf dem Globus, auf der Karte und in der Liste „Städte in der Welt“. Wer das Artefakt nur ansehen darf, spielt lokal und sieht die anderen trotzdem. Lokal per `index.html` gestartet, läuft das Spiel ohne gemeinsame Welt.

### Steuerung (Touch)

| Aktion | Geste |
|---|---|
| Globus drehen | mit einem Finger wischen (mit Schwung) |
| Ort wählen | auf dem Startbildschirm auf den Globus tippen |
| Zoomen (Globus und Karte) | zwei Finger (mit Schwung), doppelt tippen, doppelt tippen und ziehen (eine Hand), mit zwei Fingern kurz tippen zum Herauszoomen, oder die Knöpfe + / − |
| Karte verschieben | ein Finger |
| Welt erkunden | stufenlos herauszoomen bis zum Globus; „Zu meiner Stadt“ fliegt zurück |
| Gebäude, Ortsteil gründen, Abriss | Werkzeug wählen, Bauplatz antippen (die Lupe zeigt das getroffene Feld), Bauplatz bei Bedarf mit dem Finger verschieben, „Bauen“ bestätigen |
| Straße/Bahn | Start antippen, Ziel antippen, „Bauen“ – das Ziel wird zum nächsten Start |
| Zonen, Gelände formen | mit einem Finger malen, zwei Finger verschieben |
| Regieren | Tab „Gesetze“: Wohnungsbau, Zuwanderung, Familie, Umwelt, Steuern und mehr |

Ein Spielmonat dauert einen echten Tag (schnell: 1 Stunde, Zeitraffer: 2 Minuten). Die Stadt lebt weiter, wenn die App geschlossen ist; beim Öffnen wird bis zu ein Jahr nachgerechnet und ein Lagebericht gezeigt. Am Computer läuft das Spiel als Handy-Rahmen in der Fenstermitte; Mausrad zoomt.

## Entwicklung

```bash
node tools/citytest.js 48.137,11.575              # Stadt an Koordinaten gründen, zwei Jahre wachsen lassen
node tools/simtest.js DEU EGY JPN --months=120   # Simulation ohne Browser testen (alter Ländermodus)
node tools/wartest.js DEU FRA 20                  # Krieg ohne Browser durchspielen (alter Ländermodus)
node tools/growtest.js DEU FRA 25                 # erobertes Land ins Raster übernehmen und dort eine Stadt gründen
node tools/annextest.js DEU LUX 10                # Hauptstadt erobern, Kapitulation, ganzes Land annektieren
python3 tools/build_data.py ne_50m_admin_0_countries.geojson ne_50m_populated_places_simple.geojson > js/data/world.js
```

Kartendaten: [Natural Earth](https://www.naturalearthdata.com/) (gemeinfrei).
