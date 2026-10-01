# Die Driftlande

2D-Kreaturen-Sammelspiel im Pixel-Art-Stil für das Handy – HTML5 Canvas + Vanilla JavaScript, ohne Build-Tools.
Konzept & Konventionen: [CLAUDE.md](CLAUDE.md) · Plan: [docs/PLAN.md](docs/PLAN.md)

## Starten
ES-Module brauchen einen lokalen Webserver (Doppelklick auf `index.html` funktioniert nicht):

```
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen. Debug-Modus: `http://localhost:8000/?debug`

## Steuerung (Handy)
| Geste                     | Wirkung                                  |
|---------------------------|------------------------------------------|
| Auf ein Feld tippen       | Figur läuft dorthin                      |
| Auf Baum/Stein/Wasser tippen | hingehen und untersuchen              |
| Finger halten / ziehen    | Figur läuft in Richtung des Fingers      |
| Menü-Symbol oben rechts   | Pause                                    |

Auf dem Handy testen: Rechner und Handy im selben WLAN, Server starten, am Handy `http://<IP-des-Rechners>:8000` öffnen.
Am PC: Entwicklertools → Gerätemodus. Tastatur (Pfeile, Enter, Esc) funktioniert nur als Entwicklerhilfe.

## Tests
Reine Logik-/Datentests ohne Abhängigkeiten (Node ≥ 18): `node --test`
