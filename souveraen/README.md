# Souverän

Eine Staats- und Aufbausimulation im Browser: Wähle ein echtes Land von der Weltkarte, regiere es, baue Infrastruktur und Wirtschaft auf, forme die Landschaft und lass Städte in deinem Stil wachsen.

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

### Steuerung

| Aktion | Maus | Touch |
|---|---|---|
| Karte verschieben | mit „Ansehen“ ziehen, oder rechte/mittlere Taste | mit einem Finger ziehen (Ansehen) oder zwei Fingern |
| Zoomen | Mausrad | zwei Finger |
| Straße/Bahn bauen | Werkzeug wählen, ziehen | Werkzeug wählen, ziehen |
| Zonen, Landschaft, Abriss | über die Karte malen | über die Karte malen |
| Gebäude, Stadt gründen | klicken | antippen |

Tasten: Leertaste Pause · 1–3 Geschwindigkeit · Pfeile/WASD verschieben · +/− zoomen · Esc zurück zu „Ansehen“.

## Entwicklung

```bash
node tools/simtest.js DEU EGY JPN --months=120   # Simulation ohne Browser testen
python3 tools/build_data.py ne_50m_admin_0_countries.geojson ne_50m_populated_places_simple.geojson > js/data/world.js
```

Kartendaten: [Natural Earth](https://www.naturalearthdata.com/) (gemeinfrei).
