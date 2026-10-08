/* Souverän – Spieldaten: Landschaften, Gebäude, Stadtstile, Regierungsformen */
'use strict';
(function (S) {
  // ---------- Landschaften ----------
  const B = S.B = {
    DEEP: 0, SEA: 1, BEACH: 2, GRASS: 3, STEPPE: 4, SAVANNA: 5, DESERT: 6, FOREST: 7,
    JUNGLE: 8, TAIGA: 9, HILLS: 10, MOUNTAIN: 11, SNOW: 12, TUNDRA: 13, SWAMP: 14
  };
  S.BIOME_NAMES = ['Tiefsee', 'Gewässer', 'Strand', 'Grasland', 'Steppe', 'Savanne', 'Wüste', 'Mischwald',
    'Regenwald', 'Nadelwald', 'Hügelland', 'Gebirge', 'Eis & Schnee', 'Tundra', 'Sumpf'];
  // Grundfarben pro Landschaft (RGB)
  S.BIOME_RGB = [
    [28, 72, 112], [46, 112, 158], [226, 211, 158], [128, 172, 88], [168, 166, 104], [186, 178, 100],
    [222, 196, 138], [86, 138, 66], [48, 118, 64], [70, 112, 82], [140, 160, 96], [138, 128, 112],
    [236, 241, 245], [160, 172, 150], [96, 128, 92]
  ];
  // Fruchtbarkeit für Landwirtschaft
  S.FERTILITY = [0, 0, 0.3, 1.0, 0.7, 0.75, 0.15, 0.6, 0.55, 0.4, 0.6, 0.05, 0, 0.25, 0.45];

  S.isWaterE = (e) => e < 0;
  S.MOUNTAIN_E = 0.78;
  S.HILL_E = 0.55;

  /** Leitet die Landschaft aus Höhe, Feuchte, Temperatur, Wald und Bewässerung ab */
  S.biomeOf = function (e, m, t, forest, irrig) {
    if (e < -0.2) return B.DEEP;
    if (e < 0) return B.SEA;
    const tt = t - Math.max(0, e - 0.4) * 0.5;
    const mm = Math.min(1, m + irrig * 0.4);
    if (e >= S.MOUNTAIN_E) return tt < 0.2 ? B.SNOW : B.MOUNTAIN;
    if (tt < 0.1) return B.SNOW;
    if (e < 0.035 && tt > 0.3 && mm < 0.75) return B.BEACH;
    if (tt < 0.2) return forest > 0.5 ? B.TAIGA : B.TUNDRA;
    if (forest > 0.5) return tt > 0.74 && mm > 0.55 ? B.JUNGLE : tt < 0.36 ? B.TAIGA : B.FOREST;
    if (e >= S.HILL_E) return mm < 0.2 && tt > 0.55 ? B.DESERT : B.HILLS;
    if (mm > 0.84 && e < 0.14) return B.SWAMP;
    if (tt > 0.6) return mm < 0.24 ? B.DESERT : mm < 0.42 ? B.SAVANNA : B.GRASS;
    return mm < 0.2 ? B.DESERT : mm < 0.36 ? B.STEPPE : B.GRASS;
  };

  // ---------- Rohstoffvorkommen ----------
  S.RES = { NONE: 0, ORE: 1, COAL: 2, OIL: 3 };
  S.RES_NAMES = ['–', 'Erz', 'Kohle', 'Erdöl'];

  // ---------- Stadtstile ----------
  S.STYLES = {
    historisch: {
      name: 'Historische Altstadt', short: 'Historisch', maxLvl: 4, dens: 0.3, ind: 0.1, capMul: 1.0,
      happy: 3, tourism: 0.7, gdp: 1.0, poll: 1.0,
      desc: 'Rote Ziegeldächer, enge Gassen, Kirchtürme. Beliebt bei Touristen, wächst nicht in den Himmel.',
      wall: '#e6d6bb', wallD: '#c9b28c', roof: '#b5533a', roofD: '#8f3f2c', accent: '#2f5d8a'
    },
    modern: {
      name: 'Moderne Metropole', short: 'Modern', maxLvl: 5, dens: 0.55, ind: 0.1, capMul: 1.15,
      happy: 0, tourism: 0.3, gdp: 1.12, poll: 1.05,
      desc: 'Glas, Stahl und Hochhäuser. Höchste Dichte und Wirtschaftskraft.',
      wall: '#c6d0da', wallD: '#93a3b3', roof: '#7d8995', roofD: '#5d6873', accent: '#4ea3d8'
    },
    garten: {
      name: 'Gartenstadt', short: 'Gartenstadt', maxLvl: 3, dens: 0.12, ind: 0.05, capMul: 0.85,
      happy: 8, tourism: 0.25, gdp: 0.95, poll: 0.6,
      desc: 'Niedrige Häuser, viel Grün, Alleen. Die Menschen sind zufrieden, die Stadt braucht viel Fläche.',
      wall: '#f2ede1', wallD: '#d4cbb5', roof: '#4d7a52', roofD: '#365a3a', accent: '#d98b3a'
    },
    industrie: {
      name: 'Industriestadt', short: 'Industrie', maxLvl: 4, dens: 0.3, ind: 0.38, capMul: 1.0,
      happy: -4, tourism: 0.05, gdp: 1.08, poll: 1.35,
      desc: 'Backstein, Schlote und Lagerhallen. Viele Arbeitsplätze, aber schlechte Luft.',
      wall: '#a8644b', wallD: '#7f4836', roof: '#5b4d47', roofD: '#3f3531', accent: '#e0b23c'
    },
    mediterran: {
      name: 'Mediterrane Stadt', short: 'Mediterran', maxLvl: 4, dens: 0.32, ind: 0.1, capMul: 1.0,
      happy: 4, tourism: 0.5, gdp: 1.0, poll: 0.9,
      desc: 'Weiße Mauern, flache Dächer und blaue Kuppeln. Hitzefest und malerisch.',
      wall: '#f4f0e6', wallD: '#d9d1bf', roof: '#e8dfcc', roofD: '#c9bfa8', accent: '#2f6fb3'
    }
  };
  S.STYLE_KEYS = Object.keys(S.STYLES);

  S.LAYOUTS = {
    organisch: { name: 'Organisch', desc: 'Gewundene Gassen, die mit der Stadt wachsen.' },
    raster: { name: 'Schachbrett', desc: 'Geplante Blöcke mit geraden Straßen.' },
    radial: { name: 'Sternförmig', desc: 'Ringe und Ausfallstraßen um das Zentrum.' }
  };

  // ---------- Stadtkacheln ----------
  S.U = { R: 1, C: 2, I: 3, HALL: 4 };
  S.URBAN_NAMES = { 1: 'Wohngebiet', 2: 'Gewerbe', 3: 'Industrie', 4: 'Rathaus' };
  S.CAP_R = [0, 150, 450, 1200, 2800, 6000];
  S.JOBS_C = [0, 120, 360, 960, 2240, 4800];
  S.JOBS_I = [0, 110, 320, 860, 2000, 4000];

  // ---------- Zonen ----------
  S.ZONES = {
    1: { key: 'W', name: 'Wohnzone', color: '#5fb85a' },
    2: { key: 'G', name: 'Gewerbezone', color: '#4b8fd6' },
    3: { key: 'I', name: 'Industriezone', color: '#e0a43a' },
    4: { key: 'P', name: 'Grüngürtel', color: '#9fd27a' }
  };

  // ---------- Gebäude des Staates ----------
  // id ab 10. place: Bedingung für den Bauplatz. jobs/energy in Spiel-Einheiten, upkeep in Mio. T/Monat
  S.BLD = {
    10: { key: 'farm', name: 'Bauernhof', cost: 40, upkeep: 0.5, jobs: 25, energy: 0.5, poll: 0.02, cat: 'wirtschaft',
      desc: 'Erzeugt Nahrung. Ertrag hängt von Boden, Klima, Flüssen und Bewässerung ab.' },
    11: { key: 'fish', name: 'Fischerei', cost: 50, upkeep: 0.5, jobs: 20, energy: 0.5, poll: 0.02, cat: 'wirtschaft',
      desc: 'Nahrung aus dem Wasser. Muss an der Küste oder am See liegen.' },
    12: { key: 'lumber', name: 'Sägewerk', cost: 45, upkeep: 0.5, jobs: 20, energy: 1, poll: 0.05, cat: 'wirtschaft',
      desc: 'Rohstoffe aus Holz. Je mehr Wald ringsum, desto mehr Ertrag.' },
    13: { key: 'mine', name: 'Bergwerk', cost: 90, upkeep: 1, jobs: 50, energy: 4, poll: 0.25, cat: 'wirtschaft',
      desc: 'Rohstoffe aus dem Berg. Auf Erz- oder Kohlevorkommen deutlich ergiebiger.' },
    14: { key: 'oil', name: 'Ölpumpe', cost: 120, upkeep: 1.5, jobs: 35, energy: 3, poll: 0.35, cat: 'wirtschaft',
      desc: 'Sehr viele Rohstoffe, aber nur auf Erdölvorkommen.' },
    15: { key: 'factory', name: 'Fabrik', cost: 160, upkeep: 1.5, jobs: 105, energy: 12.5, poll: 0.35, cat: 'wirtschaft',
      desc: 'Verarbeitet Rohstoffe zu Gütern. Braucht Arbeitskräfte und Strom.' },
    16: { key: 'harbor', name: 'Hafen', cost: 380, upkeep: 3, jobs: 100, energy: 5, poll: 0.12, cat: 'wirtschaft',
      desc: 'Bessere Exportpreise (+12 % je Hafen, max. 3). Nur an der Küste.' },
    17: { key: 'airport', name: 'Flughafen', cost: 750, upkeep: 6, jobs: 165, energy: 15, poll: 0.18, cat: 'wirtschaft',
      desc: 'Mehr Tourismus und schnelleres Wachstum der nächsten Stadt.' },
    20: { key: 'coal', name: 'Kohlekraftwerk', cost: 280, upkeep: 2.5, jobs: 50, energy: 0, poll: 0.55, cat: 'energie',
      desc: 'Liefert zuverlässig 120 MW, verbraucht Rohstoffe und verschmutzt die Luft.' },
    21: { key: 'solar', name: 'Solarpark', cost: 170, upkeep: 1, jobs: 5, energy: 0, poll: 0, cat: 'energie',
      desc: 'Sauberer Strom. Ertrag hängt von der Sonne ab: in Wüsten am höchsten.' },
    22: { key: 'wind', name: 'Windpark', cost: 160, upkeep: 1, jobs: 5, energy: 0, poll: 0, cat: 'energie',
      desc: 'Sauberer Strom. An Küsten und auf Hügeln am ergiebigsten.' },
    23: { key: 'hydro', name: 'Wasserkraftwerk', cost: 420, upkeep: 2, jobs: 20, energy: 0, poll: 0, cat: 'energie',
      desc: 'Staudamm an einem Fluss. Liefert 90 MW sauberen Strom.' },
    24: { key: 'nuclear', name: 'Kernkraftwerk', cost: 1500, upkeep: 10, jobs: 135, energy: 0, poll: 0.05, cat: 'energie',
      desc: '400 MW ohne Abgase. Teuer, braucht Kühlwasser und ist unbeliebt in der Nachbarschaft.' },
    30: { key: 'uni', name: 'Universität', cost: 480, upkeep: 5, jobs: 135, energy: 7.5, poll: 0, cat: 'gesellschaft',
      desc: 'Bildung für die Städte im Umkreis. Steigert langfristig die Produktivität.' },
    31: { key: 'hospital', name: 'Krankenhaus', cost: 340, upkeep: 4.5, jobs: 135, energy: 7.5, poll: 0, cat: 'gesellschaft',
      desc: 'Gesundheit für die Städte im Umkreis. Mehr Geburten, zufriedenere Menschen.' },
    32: { key: 'park', name: 'Park', cost: 15, upkeep: 0.2, jobs: 5, energy: 0, poll: -0.15, cat: 'gesellschaft',
      desc: 'Grünfläche. Macht die Nachbarschaft lebenswerter und schluckt Abgase.' },
    33: { key: 'stadium', name: 'Stadion', cost: 600, upkeep: 4, jobs: 40, energy: 5, poll: 0.02, cat: 'gesellschaft',
      desc: 'Großes Plus an Zufriedenheit in der Stadt.' },
    18: { key: 'barracks', name: 'Kaserne', cost: 250, upkeep: 3, jobs: 60, energy: 3, poll: 0.03, cat: 'militaer',
      desc: 'Bildet Infanterie, Panzer und Artillerie aus. Neue Truppen erscheinen hier.' },
    19: { key: 'fort', name: 'Festung', cost: 180, upkeep: 1.5, jobs: 10, energy: 1, poll: 0, cat: 'militaer',
      desc: 'Bunker und Gräben: Eigene Truppen auf diesem Feld verteidigen fast doppelt so stark.' },
    34: { key: 'monument', name: 'Wahrzeichen', cost: 900, upkeep: 2, jobs: 15, energy: 1, poll: 0, cat: 'gesellschaft',
      desc: 'Prägt das Stadtbild im Stil der Stadt. Tourismus und Nationalstolz.' }
  };
  S.BLD_BY_KEY = {};
  for (const id in S.BLD) { S.BLD[id].id = +id; S.BLD_BY_KEY[S.BLD[id].key] = +id; }

  S.SERVICE_RADIUS = 14;

  // ---------- Werkzeuge ----------
  // kind: inspect | road | rail | build | zone | terra | city | bulldoze
  S.TOOL_CATS = [
    { key: 'inspect', name: 'Ansehen', tools: [{ id: 'inspect', name: 'Ansehen', kind: 'inspect', desc: 'Kacheln, Städte und Gebäude untersuchen. Ziehen verschiebt die Karte.' }] },
    { key: 'verkehr', name: 'Verkehr', tools: [
      { id: 'road', name: 'Straße', kind: 'road', cost: 2, desc: 'Ziehen, um eine Straße zu bauen. Über Wasser entsteht eine Brücke (×5).' },
      { id: 'rail', name: 'Bahnstrecke', kind: 'rail', cost: 6, desc: 'Verbindet Städte schnell. Per Bahn angebundene Städte wachsen schneller.' },
      { id: 'bulldoze', name: 'Abriss', kind: 'bulldoze', cost: 1, desc: 'Entfernt Straßen, Gebäude, Zonen und Stadtkacheln.' }
    ] },
    { key: 'staedte', name: 'Städte', tools: [
      { id: 'city', name: 'Stadt gründen', kind: 'city', cost: 500, desc: 'Gründet eine neue Stadt. Wähle Namen, Stil und Straßennetz.' },
      { id: 'zone1', name: 'Wohnzone', kind: 'zone', zone: 1, cost: 1, desc: 'Hier wachsen Wohnhäuser, wenn eine Stadt angrenzt.' },
      { id: 'zone2', name: 'Gewerbezone', kind: 'zone', zone: 2, cost: 1, desc: 'Läden und Büros: Arbeitsplätze und Steuern.' },
      { id: 'zone3', name: 'Industriezone', kind: 'zone', zone: 3, cost: 1, desc: 'Werkhallen: viele Jobs, produziert Güter, verschmutzt.' },
      { id: 'zone4', name: 'Grüngürtel', kind: 'zone', zone: 4, cost: 1, desc: 'Schützt Land vor Bebauung. Lenkt das Wachstum.' }
    ] },
    { key: 'wirtschaft', name: 'Wirtschaft', short: 'Betriebe', tools: [10, 11, 12, 13, 14, 15, 16, 17].map(id => ({ id: 'b' + id, bld: id, kind: 'build' })) },
    { key: 'energie', name: 'Energie', tools: [20, 21, 22, 23, 24].map(id => ({ id: 'b' + id, bld: id, kind: 'build' })) },
    { key: 'gesellschaft', name: 'Gesellschaft', short: 'Soziales', tools: [30, 31, 32, 33, 34].map(id => ({ id: 'b' + id, bld: id, kind: 'build' })) },
    { key: 'militaer', name: 'Militär', tools: [18, 19].map(id => ({ id: 'b' + id, bld: id, kind: 'build' })) },
    { key: 'landschaft', name: 'Landschaft', short: 'Gelände', tools: [
      { id: 't_raise', name: 'Anheben', kind: 'terra', op: 'raise', cost: 6, desc: 'Hebt das Gelände an. Aus Wasser wird Land, aus Hügeln Berge.' },
      { id: 't_lower', name: 'Absenken', kind: 'terra', op: 'lower', cost: 6, desc: 'Senkt das Gelände ab. Tief genug entsteht ein See oder eine Bucht.' },
      { id: 't_flat', name: 'Einebnen', kind: 'terra', op: 'flat', cost: 4, desc: 'Gleicht die Höhe an die Umgebung an.' },
      { id: 't_forest', name: 'Aufforsten', kind: 'terra', op: 'forest', cost: 3, desc: 'Pflanzt Wald. Wald filtert Abgase und macht Städte lebenswerter.' },
      { id: 't_clear', name: 'Roden', kind: 'terra', op: 'clear', cost: 2, desc: 'Entfernt Wald und macht Platz für Felder und Städte.' },
      { id: 't_irrig', name: 'Bewässern', kind: 'terra', op: 'irrig', cost: 8, desc: 'Kanäle machen trockenes Land fruchtbar. Wüsten werden grün.' }
    ] }
  ];
  S.TOOLS = {};
  for (const c of S.TOOL_CATS) for (const t of c.tools) {
    if (t.kind === 'build') {
      const b = S.BLD[t.bld];
      t.name = b.name; t.cost = b.cost; t.desc = b.desc;
    }
    t.cat = c.key;
    S.TOOLS[t.id] = t;
  }

  // ---------- Regierungsformen ----------
  S.GOVS = {
    demokratie: { name: 'Demokratie', title: 'Präsident·in', happy: 4, prod: 1.0, desc: 'Alle 4 Jahre Wahlen. Unter 50 % Zustimmung wirst du abgewählt. Die Menschen sind etwas zufriedener.' },
    monarchie: { name: 'Monarchie', title: 'Monarch·in', happy: -2, prod: 1.0, desc: 'Keine Wahlen, Wahrzeichen wirken stärker. Fällt die Zustimmung lange unter 25 %, droht die Revolution.' },
    technokratie: { name: 'Technokratie', title: 'Kanzler·in', happy: -5, prod: 1.1, desc: 'Expertenregierung: +10 % Produktion, Bildung wächst schneller, aber weniger Zufriedenheit.' }
  };

  // Einkommensgruppen aus Natural Earth: 1 = hoch … 5 = niedrig
  S.INCOME = {
    1: { name: 'Hohes Einkommen', wage: 1.35, edu: 0.85, expect: -6, money: 1600, diff: 'Anspruchsvoll' },
    2: { name: 'Hohes Einkommen (Nicht-OECD)', wage: 1.2, edu: 0.75, expect: -4, money: 1400, diff: 'Anspruchsvoll' },
    3: { name: 'Mittleres Einkommen', wage: 1.0, edu: 0.6, expect: -1, money: 1100, diff: 'Ausgewogen' },
    4: { name: 'Unteres mittleres Einkommen', wage: 0.85, edu: 0.45, expect: 2, money: 900, diff: 'Aufbauspiel' },
    5: { name: 'Niedriges Einkommen', wage: 0.7, edu: 0.3, expect: 5, money: 750, diff: 'Großes Potenzial' }
  };

  // Marktpreise (Mio. T pro Einheit)
  S.PRICES = { food: 0.55, raw: 0.6, goods: 1.6 };
})(S);
