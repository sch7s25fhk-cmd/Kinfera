# Entwicklungsplan – Die Driftlande

Jede Phase endet mit einem lauffähigen Spiel, einer kurzen Testanleitung und einer Pause für Feedback.
Start immer: `python3 -m http.server 8000` → `http://localhost:8000`.

---

## Phase 1 – Engine-Grundlage
**Ziel:** Eine Figur läuft über eine kleine Testinsel, Kamera folgt.
- `index.html`, `style.css`: 320×180-Canvas, ganzzahliges Hochskalieren, `pixelated`.
- `engine/Game.js`: Fixed-Timestep-Loop (60 Hz), Szenen-Stack.
- `engine/Renderer.js`: Skalierung bei Fenstergröße, Zeichen-Helfer, Bitmap-Schrift.
- `engine/Input.js`: Pfeile/WASD, Enter, Esc → abstrakte Aktionen, „gerade gedrückt"-Erkennung.
- `engine/SpriteSheet.js` + `data/palette.js`: Pixel-Arrays → gecachte Canvases.
- `engine/Tilemap.js`, `engine/Camera.js`: Tile-Ebenen (Boden, Deko, Kollision), Wolkenmeer-Rand.
- `world/Player.js`: Tile-basiertes, flüssig interpoliertes Laufen (4 Richtungen, 2-Frame-Laufanimation), Kollision.
- Erste Tiles: Gras, Moos, Weg, Baum, Fels, Wasser, Wolkenkante, Brücke.
- Debug-Overlay (`?debug`): FPS, Grid, Kollision.

**Test:** Herumlaufen, an Bäume/Kanten stoßen, Kamera klemmt am Kartenrand, Fenster skalieren.

## Phase 2 – Overworld mit sichtbaren Hallis
**Ziel:** Lebendige Insel mit herumlaufenden Hallis, Begegnungen per Berührung.
- `world/WorldClock.js`: Tag-Nacht-Zyklus (Morgen/Tag/Abend/Nacht) mit Farb-Tint.
- `world/Weather.js`: Wetter pro Insel (klar/Regen/Nebel/Sturm) mit Partikeln.
- `world/Spawner.js`: Spawn-Tabellen pro Zone abhängig von Tageszeit/Wetter, max. Anzahl gleichzeitig.
- `world/WildHalli.js`: Verhalten nach Wesenszug – scheu (flieht), neugierig (nähert sich, bleibt stehen), aggressiv (verfolgt), gelassen (wandert). Sicht-/Fluchtradius.
- Erste 4 Hallis mit 16×16-Sprites als Platzhalter-Datensatz.
- Berührung → Übergangseffekt → Platzhalter-Kampfszene → zurück.
- Zweite Insel + Brücke und eine Windströmung als Kartenwechsel.

**Test:** Mit `?debug` Zeit/Wetter umschalten und beobachten, wie sich Spawns ändern; scheue Hallis fliehen, aggressive verfolgen.

## Phase 3 – Kampfsystem „Resonanz-Zeitleiste"
**Ziel:** Vollständiger 2-gegen-2-Kampf.
- `battle/BattleState.js` (reine Logik), `battle/Timeline.js`, `battle/Resonance.js`, `battle/Mood.js`, `battle/AI.js`.
- `data/skills.js`: Fähigkeiten mit Essenz, Zeitkosten, Energiekosten, Wirkung, Stimmungseffekt.
- `battle/BattleScene.js` + `ui/`: Zeitleiste oben mit Vorschau, Resonanz-Anzeige pro Seite (Stufe 0–3), Stimmungs-Icons, Ausdauer-/Energiebalken, Aktionsmenü (Fähigkeit / Tauschen / Annähern / Rückzug).
- Assists bei Resonanz-Stufe 3, Partnertausch, Ausweichen aus dem Kampf.
- Kampf-Sprites 32×32 für die ersten Hallis.
- Node-Tests für Zeitleiste & Resonanz in `/tests`.

**Test:** Gegen ein wildes Halli kämpfen; beobachten, wie starke Aktionen auf der Leiste nach hinten schieben, Resonanz aufbaut/bricht, Stille alles löscht, Assist bei Stufe 3.

## Phase 4 – Fangsystem „Pakt statt Gefangenschaft"
**Ziel:** Hallis per Vertrauen und Rhythmus-Minispiel gewinnen.
- Unruhe-/Vertrauens-Leisten im Kampf-UI für wilde Hallis.
- `data/temperaments.js`: Wirkung von Futter/ruhige Essenz/Abwarten/Zurückziehen je Wesenszug.
- `creatures/Pact.js` + `ui/EchoMinigame.js`: Tonfolge vorspielen (Pfeil-Icons + Töne), Nachspielen im Takt, Timing-Fenster, Erfolg/Fehlschlag.
- Ausdauer 0 → Flucht; Unruhe 100 → Flucht.
- `creatures/Bond.js` + `creatures/Transform.js`: Bindung und Wandlungsbedingungen (Bindung + Biom + Tageszeit + Wetter).

**Test:** Ein scheues Halli durch Abwarten/Zurückziehen beruhigen, Echo nachsingen, Pakt schließen; Gegenprobe mit Angriffen → Flucht.

## Phase 5 – Team-Menü, Speichern, Dialoge, NPCs
**Ziel:** Ein zusammenhängendes, speicherbares Spiel.
- Esc-Menü: Team (Reihenfolge, Aktiv/Partner, Fähigkeiten wählen max. 4), Halli-Details (Werte, Bindung, Wesenszug), Inventar (Futter), Speichern, Optionen.
- `world/Npc.js`, `ui/DialogBox.js`: Dialoge mit Schreibmaschinen-Effekt, Auswahlantworten, Flags.
- Startdorf **Windkehr**: Haus des Spielers, Echo-Hüterin (Heilung/Ruheplatz), Futterhändler, 3–4 NPCs mit Hinweisen.
- Speichern/Laden über `localStorage` (versioniert), Titelbildschirm mit „Fortsetzen / Neues Spiel".
- Intro: Wahl eines ersten Hallis (eines von drei).

**Test:** Neues Spiel, Startpartner wählen, mit NPCs reden, Team umstellen, speichern, Seite neu laden, fortsetzen.

## Phase 6 – Inhalte, Balancing, Polishing
**Ziel:** Erster vollständiger Spielabschnitt mit Ziel.
- Alle 12 Hallis mit 16×16- und 32×32-Sprites, 4–6 Fähigkeiten, Wandlungsbedingungen.
- Beide Inseln ausgebaut, Gleiter als Ausblick/Freischaltung nach dem Sieg.
- Erste Herausforderin auf **Sturmkamm** (2-gegen-2, eigene KI-Strategie mit Resonanzketten) + 2 Trainer davor.
- `engine/Audio.js`: Web-Audio-Synth – Essenz-Klangfarben, Echo-Töne fürs Minispiel, kurze Musik-Loops pro Insel, UI-Sounds.
- Animationen: Treffer-Wackeln, Resonanz-Aufleuchten, Bildschirmübergänge, Wasser/Wolken-Animation.
- Balancing-Durchlauf über `data/balance.js`.

**Test:** Komplett von Windkehr bis zum Sieg über die Herausforderin durchspielen.

---

## Vorschlag: Die ersten 12 Hallis (Arbeitstitel)
10 Grundformen + 2 Wandlungen. Biome: **M** = Mooshain (Mooswald), **S** = Sturmkamm (Sturmklippen).

| # | Name         | Essenz     | Wesenszug  | Biom | Beschreibung |
|---|--------------|------------|------------|------|--------------|
| 1 | Pipwiek      | Klang      | neugierig  | M/S  | Daunenkugel mit Trichterschnabel, pfeift Echos nach. |
| 2 | Brummkrug    | Klang      | gelassen   | M    | Krötenartiges Wesen mit tönernem Bauch, der summt. |
| 3 | Funzling     | Licht      | scheu      | M    | Kleiner Laternenpilz auf Wurzelbeinchen, glüht nachts. |
| 4 | Prismaus     | Licht      | neugierig  | S    | Flinker Nager mit Kristallschwanz, der Licht bricht; startet Kämpfe oft übermütig. |
| 5 | Moosbock     | Wurzel     | gelassen   | M    | Gedrungenes Huftierchen mit Moosrücken und Pilzhörnchen. |
| 6 | Knorrkin     | Wurzel     | aggressiv  | M    | Lebender Wurzelknoten mit Bernsteinaugen. |
| 7 | Zirrflosse   | Strömung   | neugierig  | S    | Fischwesen, das durch Wolken schwimmt. |
| 8 | Böling       | Strömung   | aggressiv  | S    | Wieselartiger Wirbel aus Wind und Fell. |
| 9 | Hüllkauz     | Stille     | gelassen   | M    | Eule aus Nebel, deren Flügel jeden Laut schlucken. |
|10 | Schweigling  | Stille     | scheu      | S    | Schneckchen mit Spiralhaus, in dem Geräusche verschwinden. |
|11 | Sturmpip     | Klang/Strömung | neugierig | S | Wandlung von Pipwiek: Bindung ≥ 70, Kampf **bei Nacht** auf den **Sturmklippen**. |
|12 | Laternhüter  | Licht      | gelassen   | M    | Wandlung von Funzling: Bindung ≥ 60, Kampf **bei Regen** im **Mooswald**. |

Startpartner-Auswahl: Pipwiek, Moosbock, Zirrflosse.

Herausforderin auf Sturmkamm (Arbeitstitel): **Ilva Windhallerin** – setzt auf Strömungs-Resonanzketten und zwingt den Spieler, sie mit Essenzwechseln oder Stille zu brechen.

---

## Offene Fragen an dich
1. Sind die 12 Hallis / Namen so in Ordnung, oder willst du eigene Namen/Ideen einbringen?
2. Sollen Hallis zwei Essenzen haben dürfen (wie Sturmpip), oder streng eine pro Halli?
3. Tag-Nacht-Dauer: 20 Min. Echtzeit pro Spieltag okay?
4. Bestätigst du den Plan, damit ich mit **Phase 1** starte?
