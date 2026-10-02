# Funkenflug

Ein Jump'n'Run im Pixel-Art-Stil für das Handy (Querformat): Lio, der Laternenträger, holt die gestohlenen Lichter der schwebenden Driftlande zurück.
HTML5 Canvas + Vanilla JavaScript, ohne Build-Tools.
Konzept & Konventionen: [CLAUDE.md](CLAUDE.md) · Plan: [docs/PLAN.md](docs/PLAN.md)

## Starten
```
python3 -m http.server 8000
```
Dann `http://localhost:8000` öffnen (auf dem Handy: gleiches WLAN, `http://<IP-des-Rechners>:8000`).
`?touch` zeigt die Bildschirmtasten auch am PC, `?debug` zeigt FPS.

## Steuerung
| Handy (Bildschirmtasten) | PC (Entwicklerhilfe)   | Aktion               |
|--------------------------|------------------------|----------------------|
| ◀ ▶                      | Pfeile / A, D          | Laufen               |
| A                        | Leertaste / ↑ / W      | Springen (halten = höher) |
| B                        | X / J                  | Funke werfen         |
| Pause-Symbol oben rechts | Esc                    | Pause                |

## Tests
`node --test` (Node ≥ 18, keine Abhängigkeiten)
