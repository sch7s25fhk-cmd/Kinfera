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
| Taste            | Aktion                 |
|------------------|------------------------|
| Pfeiltasten/WASD | Laufen                 |
| Enter / Leertaste| Aktion / Untersuchen   |
| Esc              | Menü (Pause)           |
| F1 (Debug)       | Raster & Kollision     |

## Tests
Reine Logik-/Datentests ohne Abhängigkeiten (Node ≥ 18): `node --test`
