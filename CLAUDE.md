# CLAUDE.md – Die Driftlande

Ein 2D-Kreaturen-Sammelspiel im Pixel-Art-Stil. HTML5 Canvas + Vanilla JavaScript (ES-Module), ohne Build-Tools, ohne externe Assets.

> **Originalitäts-Regel (verbindlich):** Das Spiel ist vom Genre inspiriert, kopiert aber **keine** Namen, Kreaturen, Designs, Typen, Items, Orte oder Mechaniken aus Pokémon oder anderen bestehenden Spielen. Keine Bälle/Kapseln zum Fangen, keine Typ-Effektivitätstabelle, keine Arenen/Orden, keine Level-basierte Entwicklung als Hauptmechanik. Bei jedem neuen Namen oder Design kurz prüfen: „Klingt das nach etwas Bekanntem?" – im Zweifel umbenennen.

---

## 1. Spielkonzept

### Welt: „Die Driftlande"
- Ein Archipel schwebender Inseln über einem Wolkenmeer. Jede Insel = ein Biom:
  Mooswald, Kristallhöhlen, Sturmklippen, Glutfelder, versunkene Ruinen.
- Verbindungen: Brücken, Windströmungen (feste Routen, auf die man tritt), später ein freischaltbarer Gleiter.
- **Tag-Nacht-Zyklus** (Spielzeit, ca. 1 Spieltag = 20 Min. Echtzeit) und **Wetter** (klar, Regen, Nebel, Sturm) pro Insel. Beide beeinflussen, welche Hallis erscheinen.
- Startumfang: Insel **Mooshain** (Mooswald + Startdorf **Windkehr**) und Insel **Sturmkamm** (Sturmklippen, Sitz der ersten Herausforderin).

### Hallis
- Wesen aus verdichtetem Echo der Welt. Sie sind **sichtbar in der Overworld** und bewegen sich frei.
- **Wesenszug** (fest, pro Art mit Varianz): `scheu` (flieht vor dem Spieler), `neugierig` (nähert sich, beobachtet), `aggressiv` (verfolgt den Spieler), `gelassen` (ignoriert den Spieler weitgehend).
- **Stimmung** (dynamisch im Kampf): `ruhig`, `gereizt`, `ängstlich`, `übermütig`. Verändert sich durch Aktionen und modifiziert Werte (siehe 3.).
- Werte: `ausdauer` (HP), `kraft`, `schutz`, `tempo`, `fokus`, `energie` (Ressource für Fähigkeiten).
- Max. 4 aktive Fähigkeiten (aus 4–6 erlernbaren). Fähigkeiten kosten **Energie**, keine festen Anwendungen.
- **Bindung** (0–100) wächst durch gemeinsame Kämpfe, Füttern, Zeit im Team.

### Die fünf Essenzen
`klang`, `licht`, `wurzel`, `stroemung`, `stille`. Jedes Halli hat **genau eine Essenz** (eine Wandlung darf sie wechseln). **Keine Stärke-Schwäche-Tabelle.** Stattdessen Resonanz (siehe 3.).

---

## 2. Kampfsystem: „Resonanz-Zeitleiste"

### Zeitleiste
- Jeder Kämpfer hat einen Zeitpunkt `t` auf der Leiste. Es handelt immer der Kämpfer mit dem kleinsten `t`.
- Jede Aktion hat **Zeitkosten** `cost`. Nach der Aktion: `t += cost * (100 / tempo)`.
  Schnelle/schwache Aktionen (cost ~40) → oft dran. Starke Aktionen (cost ~120) → weit nach hinten.
- Die Leiste zeigt die nächsten ~8 Züge als Vorschau (Icons). Aktionen können gegnerische `t` verschieben (z. B. „Verzögern").
- Gleichstand: höheres Tempo zuerst, dann Spielerseite.

### Resonanz (pro Seite)
- Zustand: `{ essenz, stufe }` mit Stufe 0–3.
- Gleiche Essenz wie die letzte eigene Aktion → Stufe +1 (max. 3). Bonus: Stufe 1 = +10 %, 2 = +25 %, 3 = +45 % Wirkung.
- Andere Essenz → eigene Resonanz beginnt neu (Stufe 1 mit neuer Essenz).
- Trifft man den Gegner mit einer **anderen** Essenz als dessen aktueller Resonanz → gegnerische Stufe −1 („Brechen").
- **Stille** löscht die Resonanz **beider** Seiten komplett.
- Bei Stufe 3 kann der **Partner** einen **Assist** auslösen (verbraucht die Resonanz, kostet den aktiven Kämpfer keine Zeit).

### 2-gegen-2
- Jede Seite: ein **aktives** Halli + ein **Partner**. Nur das aktive steht auf der Zeitleiste; der Partner assistiert.
- Tausch aktiv ↔ Partner ist eine Aktion mit Zeitkosten.
- Wilde Begegnungen: meist 1 Halli (mit Partner-Slot leer), Gruppen möglich; Trainer/Meister: immer 2-gegen-2.

### Stimmung
| Stimmung   | Effekt                                          | typische Auslöser                         |
|------------|-------------------------------------------------|-------------------------------------------|
| ruhig      | +Fokus, normale Werte                           | Abwarten, Stille, Futter                  |
| gereizt    | +Kraft, −Schutz                                 | getroffen werden, Resonanz gebrochen      |
| ängstlich  | +Tempo, −Kraft                                  | niedrige Ausdauer, starke Treffer         |
| übermütig  | +Kraft, +Tempo, −Fokus (Fehlschlagrisiko)       | Resonanz Stufe 3, Gegner besiegt          |

---

## 3. Fangsystem: „Pakt statt Gefangenschaft"
- Ausdauer eines wilden Hallis auf 0 → es **flieht**. Kein Fang durch Schwächen.
- Jedes wilde Halli hat **Unruhe** (0–100, Start je nach Wesenszug) und **Vertrauen** (0–100).
- Annäherungs-Aktionen (statt Angriff wählbar): **Futter anbieten**, **ruhige Essenz einsetzen**, **Abwarten**, **Zurückziehen** (aktives Halli tritt einen Schritt zurück).
  Wirkung hängt vom Wesenszug ab (Tabelle in `src/data/temperaments.js`), z. B. scheu: Abwarten/Zurückziehen stark, Futter mittel; aggressiv: ruhige Essenz stark, Abwarten schwach.
- Angriffe erhöhen Unruhe. Unruhe 100 → Halli flieht.
- Vertrauen ≥ Schwelle **und** Unruhe ≤ Schwelle → Option **„Echo nachsingen"**: Rhythmus-Minispiel. Das Halli spielt eine Tonfolge (Pfeiltasten, je Richtung ein Ton) vor, der Spieler wiederholt sie im Takt. Länge/Tempo je nach Art. Erfolg → **Pakt** (Halli schließt sich an). Fehlschlag → Unruhe steigt.

### Wandlung (statt Level-Entwicklung)
- Ein Halli wandelt sich nur, wenn **Bindung + Umgebung** passen, z. B. „Bindung ≥ 70, Kampf bei Nacht auf den Sturmklippen".
- Bedingungen sind deklarativ in den Artdaten (`wandlung: { zu, bindung, biom, tageszeit, wetter }`) und werden nach jedem Kampf geprüft.

---

## 4. Technik & Architektur

### Rahmen
- Interne Auflösung **320×180**, ganzzahlig hochskaliert, CSS `image-rendering: pixelated`, `ctx.imageSmoothingEnabled = false`.
- Tiles **16×16**. Overworld-Sprites 16×16, Kampf-Sprites 32×32.
- **Fester Zeitschritt**: `update(dt)` mit 1/60 s, `render()` einmal pro Frame (requestAnimationFrame, Akkumulator).
- **Starten:** ES-Module funktionieren nicht über `file://`. Lokal mit einem statischen Server starten:
  `python3 -m http.server 8000` im Projektordner → `http://localhost:8000`. (Kein Build, keine Abhängigkeiten.)

### Ordnerstruktur
```
index.html              Canvas + Laden von src/main.js
style.css               Vollbild, Skalierung, pixelated
src/
  main.js               Einstieg: Game erstellen, erste Szene pushen
  engine/               Generisch, spielunabhängig
    Game.js             Game Loop, Szenen-Stack, globale Systeme
    Renderer.js         Canvas, Skalierung, Zeichen-Helfer, Text (Pixel-Font)
    Input.js            Tastatur → abstrakte Aktionen (up/down/left/right/confirm/cancel)
    Camera.js           Folgt Ziel, klemmt an Kartenrand
    Tilemap.js          Ebenen, Kollision, Rendering sichtbarer Tiles
    SpriteSheet.js      Pixel-Arrays → gecachte Offscreen-Canvases
    Scene.js            Basisklasse (enter/exit/update/render)
    Audio.js            Web Audio API (Phase 6)
    rng.js              Seedbarer Zufall
  world/                Overworld: Spieler, Karten, Hallis in der Welt, Zeit, Wetter
  battle/               Zeitleiste, Resonanz, Stimmung, Kampf-KI, Kampfszene
  creatures/            Halli-Instanzen, Werte, Bindung, Wandlung, Pakt-Logik
  ui/                   Menüs, Dialogboxen, HUD, Rhythmus-Minispiel-UI
  data/                 Reine Daten: Arten, Fähigkeiten, Karten, Paletten, Sprites, NPCs
```

### Architekturregeln
- **Szenen-Stack** im `Game`: z. B. `OverworldScene` → `BattleScene` → `PactScene`. Nur die oberste Szene erhält Input; darunterliegende können optional weiter gerendert werden.
- **Logik und Darstellung trennen**: `battle/` enthält eine reine Kampf-Logik (`BattleState`, ohne Canvas-Zugriff), die Szene liest nur ihren Zustand und zeichnet. Dadurch ist die Logik im Browser-Konsolen-Test oder per Node prüfbar.
- **Datengetrieben**: Arten, Fähigkeiten, Karten, NPCs, Dialoge liegen als exportierte Objekte in `src/data/`. Neue Inhalte = neue Daten, kein neuer Code.
- `engine/` importiert **nie** aus `world/`, `battle/` usw.
- Kein globaler Zustand außer der `Game`-Instanz; Systeme werden über den Konstruktor weitergereicht.

### Pixel-Art
- Sprites als Arrays von Strings, ein Zeichen = ein Pixel, `.` = transparent. Zeichen werden über eine Palette (max. 16 Farben) auf Farben gemappt:
  ```js
  export const PALETTE = { a: '#1a1c2c', b: '#5d275d', ... };
  export const moosbock = { size: 16, frames: [[ '....aa....', ... ]] };
  ```
- `SpriteSheet` rendert jedes Sprite einmalig in einen Offscreen-Canvas und cached ihn.
- Eine **globale Hauptpalette** (16 Farben) in `src/data/palette.js`. Tag/Nacht und Wetter werden als Farbüberlagerung (Tint) gerendert, nicht über eigene Paletten.
- Text über eine eigene 5×7- bzw. 4×6-Pixel-Bitmap-Schrift (`src/data/font.js`), inkl. Umlaute.

### Speichern
- `localStorage`-Key `driftlande.save.v1`. JSON mit `version`-Feld; beim Laden Migration über `version`.
- Gespeichert: Position/Karte, Team, Halli-Instanzen (Art, Werte, Fähigkeiten, Bindung), Inventar, Flags (Story/NPC), Spielzeit.

---

## 5. Coding-Konventionen
- **Sprache:** Bezeichner (Variablen, Funktionen, Klassen, Dateinamen) auf **Englisch**; **Spieltexte und Daten-Schlüssel der Spielwelt** (Essenzen, Stimmungen, Wesenszüge, Namen) auf **Deutsch**, ohne Umlaute in Schlüsseln (`stroemung`, `aengstlich`). Kommentare auf Deutsch, knapp.
- ES2020+, `const`/`let`, keine `var`. Strikte ES-Module, benannte Exporte (kein `export default`).
- Klassen in `PascalCase.js` (eine Hauptklasse pro Datei), Funktionsmodule/Daten in `camelCase.js`.
- Keine externen Bibliotheken, keine Build-Tools, kein TypeScript. JSDoc-Typen für zentrale Strukturen.
- Pixel-Koordinaten immer ganzzahlig zeichnen (`Math.round` bzw. `| 0`) – kein Subpixel-Verwischen.
- Zufall nur über `engine/rng.js` (seedbar, für reproduzierbare Tests).
- Magic Numbers für Balancing gehören in `src/data/` (z. B. `balance.js`), nicht in die Logik.
- Kleine, fokussierte Commits pro Feature. Nach jeder Phase muss das Spiel lauffähig sein.

## 6. Testen
- Server starten: `python3 -m http.server 8000`, Browser auf `http://localhost:8000`.
- Debug-Tasten (nur bei `?debug` in der URL): F1 Kollisionen/Grid, F2 Tageszeit vorspulen, F3 Wetter wechseln, F4 sofortige Begegnung.
- Reine Logikmodule (Zeitleiste, Resonanz, Pakt) können mit `node --test` geprüft werden (Node ≥ 18, keine Abhängigkeiten) – Tests liegen in `/tests`.

## 7. Entwicklungsplan
Siehe `docs/PLAN.md`. Nach jeder Phase: lauffähig, Testanleitung, auf Feedback warten.
