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
| Zoomen (Globus und Karte) | zwei Finger, doppelt tippen oder die Knöpfe + / − |
| Karte verschieben | ein Finger |
| Welt erkunden | stufenlos herauszoomen bis zum Globus, mit einem Finger über die Landesgrenzen hinaus scrollen; „Zu meinem Land“ fliegt zurück |
| Gebäude, Stadt gründen, Abriss | Werkzeug wählen, Bauplatz antippen, „Bauen“ bestätigen |
| Straße/Bahn | Start antippen, Ziel antippen, „Bauen“ – das Ziel wird zum nächsten Start |
| Zonen, Gelände formen | mit einem Finger malen, zwei Finger verschieben |

Ein Spielmonat dauert 6 Sekunden (schnell: 3 s, sehr schnell: 1,3 s). Am Computer läuft das Spiel als Handy-Rahmen in der Fenstermitte; Mausrad zoomt.

## Entwicklung

```bash
node tools/simtest.js DEU EGY JPN --months=120   # Simulation ohne Browser testen
python3 tools/build_data.py ne_50m_admin_0_countries.geojson ne_50m_populated_places_simple.geojson > js/data/world.js
```

Kartendaten: [Natural Earth](https://www.naturalearthdata.com/) (gemeinfrei).
