# Die Driftlande

2D-Kreaturen-Sammelspiel im Pixel-Art-Stil – HTML5 Canvas + Vanilla JavaScript, ohne Build-Tools.
Konzept & Konventionen: [CLAUDE.md](CLAUDE.md) · Plan: [docs/PLAN.md](docs/PLAN.md)

## Starten
ES-Module brauchen einen lokalen Webserver (Doppelklick auf `index.html` funktioniert nicht):

```
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Debug-Modus: `http://localhost:8000/?debug`

## Steuerung
| Handy (Touch)  | PC (Tastatur)      | Aktion                 |
|----------------|--------------------|------------------------|
| Steuerkreuz    | Pfeiltasten / WASD | Laufen                 |
| A              | Enter / Leertaste  | Aktion / Untersuchen   |
| B              | Esc                | Menü / Zurück          |
| –              | F1 (nur `?debug`)  | Raster & Kollision     |

Auf dem Handy: Rechner und Handy im selben WLAN, Server starten und am Handy `http://<IP-des-Rechners>:8000` öffnen.
Touch-Steuerung am PC erzwingen: `?touch`.

## Tests
Reine Logik-/Datentests ohne Abhängigkeiten (Node ≥ 18): `node --test`
