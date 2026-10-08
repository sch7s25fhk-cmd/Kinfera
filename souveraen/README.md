# Souverän

Eine Staats- und Aufbausimulation fürs Handy (Hochformat, Touch): Wähle ein echtes Land von der Weltkarte, regiere es, baue Infrastruktur und Wirtschaft auf, forme die Landschaft und lass Städte in deinem Stil wachsen.

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

### Steuerung (Touch)

| Aktion | Geste |
|---|---|
| Globus drehen | mit einem Finger wischen (mit Schwung) |
| Zoomen (Globus und Karte) | zwei Finger (mit Schwung), doppelt tippen, doppelt tippen und ziehen (eine Hand), mit zwei Fingern kurz tippen zum Herauszoomen, oder die Knöpfe + / − |
| Karte verschieben | ein Finger |
| Welt erkunden | stufenlos herauszoomen bis zum Globus, mit einem Finger über die Landesgrenzen hinaus scrollen; „Zu meinem Land“ fliegt zurück |
| Gebäude, Stadt gründen, Abriss | Werkzeug wählen, Bauplatz antippen, „Bauen“ bestätigen |
| Straße/Bahn | Start antippen, Ziel antippen, „Bauen“ – das Ziel wird zum nächsten Start |
| Zonen, Gelände formen | mit einem Finger malen, zwei Finger verschieben |
| Regieren | Tab „Gesetze“: Wohnungsbau, Zuwanderung, Familie, Umwelt, Wehrdienst, Rüstung, Ausbildung, Propaganda, Fürsorge |
| Truppen führen | Militär-Panel: Haltung des Oberkommandos je Krieg (verteidigen, halten, angreifen) – oder selbst: Einheit antippen, „+ Truppen ringsum“, „Marschziel“, Ziel antippen |
| Land erobern | mit Infanterie über die Grenze marschieren (Umkreis ~15 km); eine Stadt fällt, wenn Infanterie ihren Mittelpunkt erreicht. Eingeschlossenes Feindesland ohne feindliche Truppen fällt automatisch zu. Fällt die Hauptstadt des Gegners, kapituliert er, und du kannst das ganze Land annektieren. Erobertes Land ist danach normal bebaubar, auch mit neuen Städten; die neue Grenze zeigen Globus, Weltkarte und Landkarte |

Ein Spielmonat dauert einen echten Tag (schnell: 1 Stunde, Zeitraffer: 2 Minuten). Die Welt läuft weiter, wenn die App geschlossen ist; beim Öffnen wird bis zu ein Jahr nachgerechnet und ein Lagebericht gezeigt. Am Computer läuft das Spiel als Handy-Rahmen in der Fenstermitte; Mausrad zoomt.

## Entwicklung

```bash
node tools/simtest.js DEU EGY JPN --months=120   # Simulation ohne Browser testen
node tools/wartest.js DEU FRA 20                  # Krieg ohne Browser durchspielen (Tage)
node tools/growtest.js DEU FRA 25                 # erobertes Land ins Raster übernehmen und dort eine Stadt gründen
node tools/annextest.js DEU LUX 10                # Hauptstadt erobern, Kapitulation, ganzes Land annektieren
python3 tools/build_data.py ne_50m_admin_0_countries.geojson ne_50m_populated_places_simple.geojson > js/data/world.js
```

Kartendaten: [Natural Earth](https://www.naturalearthdata.com/) (gemeinfrei).
