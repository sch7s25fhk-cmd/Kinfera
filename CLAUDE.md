# CLAUDE.md – Funkenflug

2D-Jump'n'Run im Pixel-Art-Stil – **ein Handyspiel im Querformat**. HTML5 Canvas + Vanilla JavaScript (ES-Module), ohne Build-Tools, ohne externe Assets.

> **Originalitäts-Regel (verbindlich):** Vom Genre (klassische Jump'n'Runs) inspiriert, aber **keine** Figuren, Namen, Designs, Gegner, Items, Orte oder Erkennungsmerkmale aus Mario, Donkey Kong oder anderen bestehenden Spielen. Keine Klempner, Pilze, Röhren, Fragezeichen-Blöcke, Fässer, Affen, Münzen-Blöcke. Bei jedem neuen Element prüfen: „Erinnert das an etwas Bekanntes?" – im Zweifel umgestalten.

---

## 1. Spielkonzept

### Welt: Die Driftlande
Schwebende Inseln über einem Wolkenmeer. Der Sturm **„Graue Sog"** hat die Lichter der Inseln gestohlen und die Bewohner in rostige Maschinenwesen verwandelt. Welten: Mooswald, Kristallhöhlen, Sturmklippen, Glutfelder, versunkene Ruinen – je 3–4 Level + Boss.

### Held: Lio, der Laternenträger
- Kleine Gestalt mit blauer Kapuze, rotem Schal und einer **Laterne auf dem Rücken**.
- **Die Laterne ist Lebensanzeige und Munition zugleich:** Treffer kosten Licht, jeder geworfene **Funke** kostet etwas Licht, eingesammelte Funken laden auf. Unter einem Mindestwert kann Lio nicht mehr werfen. Laterne leer oder Sturz ins Wolkenmeer → zurück zum letzten Kontrollpunkt.
- Fähigkeiten: Laufen, Springen (variable Höhe), Funken werfen, auf Gegner springen.

### Gegner (eigene Designs)
| Gegner        | Verhalten                                  | Besiegen                         |
|---------------|--------------------------------------------|----------------------------------|
| Rostkäfer     | läuft, dreht an Kanten und Wänden um       | draufspringen oder 1 Funke       |
| Dornschnecke  | langsam, Stachelhaus                       | nur Funken (2), Draufspringen tut weh |
| Nebelqualle   | schwebt auf und ab                         | draufspringen oder 1 Funke       |
| Kurbelvogel   | (geplant) stößt von oben herab             |                                  |

### Level-Elemente
Feste Inseln, **Wolkenplattformen** und **Brücken** (von unten durchspringbar), **Dornen**, **Aufwind** (trägt nach oben), **Kontrollpunkt-Laternen**, **Funken** zum Sammeln, am Ende das **verlorene Licht** (Levelziel). Geplant: bröckelnde Wolken, Ranken zum Klettern, Windstöße seitwärts, Bosse.

---

## 2. Technik & Architektur

### Rahmen
- **Nur Querformat.** Die Höhe beträgt immer **180 Spielpixel**, die Breite passt sich dem Gerät an (z. B. 422×180). Im Hochformat pausiert das Spiel und zeigt „Bitte Handy quer halten".
- UI und Szenen nie mit fester Breite bauen – immer `r.width`/`r.height`.
- Skalierung möglichst in ganzen Gerätepixeln, `image-rendering: pixelated`, kein Glätten.
- Tiles **16×16**, Figuren 16×16. Level sind 14 Tiles hoch (Kamera scrollt leicht vertikal).
- **Fester Zeitschritt** 1/60 s (Physik stabil), Rendern per requestAnimationFrame.
- **Starten:** `python3 -m http.server 8000` → `http://localhost:8000` (ES-Module brauchen einen Server).

### Ordnerstruktur
```
index.html, style.css     Vollbild-Canvas, Safe-Area, kein Zoomen/Scrollen
src/
  main.js                 Einstieg (Querformat-Pflicht, Titelbild)
  engine/                 Generisch, spielunabhängig
    Game.js               Loop, Szenen-Stack, Querformat-Sperre
    Renderer.js           Canvas, Skalierung, Pixel-Schrift (auch vergrößert)
    Input.js              Mehrfinger-Touch, Taps, Tastatur (Entwicklerhilfe)
    Tilemap.js            Tile-Raster, Varianten, Rendering
    SpriteSheet.js        Pixel-Arrays → gecachte Canvases
    Particles.js          Partikel
    Scene.js, Camera.js, rng.js
  level/                  Level-Laufzeit
    Level.js              Objekte, Kollisionen, Spielregeln, Ereignisse
    levelLoader.js        Textzeilen → Tiles + Objekte (Autotiling)
    physics.js            Rechteck-gegen-Raster-Kollision (rein, getestet)
    Background.js         Parallax-Hintergrund
    levelDecor.js         Inselkanten, Tiefenschatten, Aufwind-Linien
  entities/               Hero.js, Enemy.js, items.js (Funken, Schüsse, Kontrollpunkt, Licht)
  scenes/                 TitleScene, LevelScene, PauseScene
  ui/                     TouchControls.js (Bildschirmtasten), hud.js
  data/                   Reine Daten: palette, font, tiles, balance, sprites/, levels/
tests/                    node --test (Physik, Daten, Level)
```

### Architekturregeln
- **Daten getrennt von Logik:** Sprites, Tiles, Level und alle Spielwerte (`data/balance.js`) liegen in `src/data/`. Neue Level = neue Datei in `data/levels/`.
- **Logik testbar halten:** `level/physics.js` und `level/levelLoader.js` greifen nicht auf Canvas/DOM zu.
- `Level` meldet Ereignisse (`jump`, `hurt`, `stomp`, `spark`, `complete` …) über `takeEvents()`; Szene/Sound reagieren darauf (Kamera-Wackeln, später Töne).
- `engine/` importiert nie aus anderen Ordnern außer `data/font.js`.
- Szenen-Stack: `TitleScene` → `LevelScene` (+ `PauseScene` als transparentes Overlay).

### Level-Format
Level sind Textzeilen (`data/levels/*.js`). Legende:
`#` Boden (wird automatisch zu Grasnarbe/Erde, darunter Insel-Unterseite), `=` Wolke, `-` Brücke, `^` Dornen, `w` Aufwind, `b f g t v` Deko (Busch, Blumen, Leuchtpilz, Gras, Ranke), `P` Start, `k` Rostkäfer, `s` Dornschnecke, `q` Nebelqualle, `*` Funke, `c` Kontrollpunkt, `L` verlorenes Licht.

### Pixel-Art
- Sprites als String-Arrays, ein Zeichen = ein Pixel, `.` = transparent, Zeichen → Farbe über **eine globale 16-Farben-Palette** (`data/palette.js`).
- Figuren blicken nach rechts; links wird gespiegelt.
- Effekte (Lichtschein, Partikel, Wackeln) im Code, nicht als zusätzliche Farben.
- Schrift: eigene 3×5-Pixelschrift (`data/font.js`), Großbuchstaben + Umlaute, per `scale` vergrößerbar.

### Handy-Steuerung (verbindlich)
- Bildschirmtasten im Pixel-Stil **im Canvas** (`ui/TouchControls.js`): links ◀ ▶, rechts **B = Funke**, **A = Sprung**. Mehrere Finger gleichzeitig; jeder Finger zählt für die nächstgelegene Taste (großzügige Trefferfläche).
- Menüs/Pause werden **per Tippen** bedient (Pause-Symbol oben rechts).
- Spielgefühl: Coyote-Time, Sprungpuffer, variable Sprunghöhe – Werte in `data/balance.js`.
- Tastatur nur als Entwicklerhilfe: Pfeile/WASD, Leertaste/↑ springen, X schießen, Esc Pause.

### Speichern (ab Phase 4)
`localStorage`-Key `funkenflug.save.v1`, JSON mit `version`. Gespeichert: freigeschaltete Level, beste Zeiten, gesammelte Funken/Lichter, Einstellungen.

---

## 3. Coding-Konventionen
- Bezeichner auf **Englisch**, Spieltexte und Kommentare auf **Deutsch**.
- ES2020+, `const`/`let`, benannte Exporte, keine Bibliotheken, kein Build, kein TypeScript (JSDoc für zentrale Strukturen).
- Klassen in `PascalCase.js`, Funktionsmodule/Daten in `camelCase.js`.
- Pixel-Koordinaten beim Zeichnen immer runden.
- Zufall nur über `engine/rng.js` (seedbar).
- Spielwerte nie in die Logik schreiben, sondern in `data/balance.js`.
- Nach jeder Phase muss das Spiel lauffähig sein; Tests mit `node --test` grün.

## 4. Testen
- Am PC: Server starten, Entwicklertools → Gerätemodus (Handy quer). `?touch` erzwingt die Bildschirmtasten, `?debug` zeigt FPS.
- Auf dem Handy: gleiches WLAN, `http://<IP-des-Rechners>:8000`.
- `node --test` für Physik, Level-Parser und Sprite-Daten.

## 5. Entwicklungsplan
Siehe `docs/PLAN.md`. Nach jeder Phase: lauffähig, Testanleitung, auf Feedback warten.
