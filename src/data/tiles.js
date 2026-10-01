// Tile-Grafiken (16×16) und Tileset-Definitionen.
// Zeichen siehe palette.js, '.' = transparent.

/** Spiegelt ein Pixel-Array an der Diagonale (z. B. waagerechte → senkrechte Brücke) */
export function transpose(rows) {
  return rows[0].split('').map((_, x) => rows.map((row) => row[x]).join(''));
}

const GRASS = [
  '6666666666666666',
  '6666766666666666',
  '6667666666665666',
  '6666666666656666',
  '6666666666666666',
  '6656666666666666',
  '6566666667666666',
  '6666666676666666',
  '6666666666666666',
  '6666666666666656',
  '6666566666666566',
  '6665666666666666',
  '6666666766666666',
  '6666667666666666',
  '6666666666666666',
  '6666666666666666',
];

const FLOWERS = [
  '6666666666666666',
  '6666766666666666',
  '6667666666646666',
  '6666666666484666',
  '6666666666646666',
  '6656666666666666',
  '6566666666666666',
  '666f666666666666',
  '66f8f66666666666',
  '666f666666666656',
  '6666666666666566',
  '6666666666666666',
  '6666666666466666',
  '6666667666484666',
  '6666676666646666',
  '6666666666666666',
];

const MOSS = [
  '5555555555555555',
  '5566655555666555',
  '5667765556677655',
  '5666665556666655',
  '5566655555666555',
  '5555555555555555',
  '5555566655555555',
  '5555667765555555',
  '5555666665555555',
  '5555566655555555',
  '5555555555556665',
  '5666555555566776',
  '6677655555566666',
  '6666655555556665',
  '5666555555555555',
  '5555555555555555',
];

const PATH = [
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbabbbb',
  'bbabbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbb9abbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbab',
  'babbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbabbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbb9abbbbbbbabb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
  'bbbbbbbbbbbbbbbb',
];


const ROCK = [
  '................',
  '................',
  '................',
  '.....000000.....',
  '....03333220....',
  '...0333322220...',
  '..033332222210..',
  '..032322222210..',
  '.0322222222110..',
  '.0222222221110..',
  '.02222222111110.',
  '.01222211111110.',
  '..011111111110..',
  '...0000000000...',
  '...5555555555...',
  '................',
];

const WATER_A = [
  'dddddddddddddddd',
  'ddeeeddddddddddd',
  'dddddddddddddddd',
  'dddddddddcdddddd',
  'ddddddddcccddddd',
  'dddddddddddddddd',
  'ddddddddddddeeed',
  'dddddddddddddddd',
  'dddcdddddddddddd',
  'ddcccddddddddddd',
  'dddddddddddddddd',
  'dddddddeeedddddd',
  'dddddddddddddddd',
  'ddddddddddddcddd',
  'dddddddddddcccdd',
  'dddddddddddddddd',
];

const WATER_B = [
  'dddddddddddddddd',
  'dddeeedddddddddd',
  'dddddddddddddddd',
  'ddddddddddcddddd',
  'dddddddddcccdddd',
  'dddddddddddddddd',
  'dddddddddddeeedd',
  'dddddddddddddddd',
  'ddddcddddddddddd',
  'dddcccdddddddddd',
  'dddddddddddddddd',
  'ddddddeeeddddddd',
  'dddddddddddddddd',
  'dddddddddddddcdd',
  'ddddddddddddcccd',
  'dddddddddddddddd',
];

// Felswand unter einer Inselkante (wird automatisch erzeugt, siehe world/mapLoader.js)
const CLIFF = [
  '6766676667666766',
  '5665566556655665',
  '9a9aa99a9aa9a99a',
  'aa9aaa9aaa9aaa9a',
  '9aaa9aaa5aaa9aaa',
  'a9aaaa9a5a9aaa9a',
  'aaa9aaaa5aaaa9aa',
  '9aaaa9aa9aa9aaaa',
  'aa9aaaaaaaaaa9aa',
  'a9aa9aa9aaa9aaa9',
  'aaaa9aaaa9aaaaaa',
  '9a5aaa9aaaaa9aaa',
  'aa5a9aaa9aaaaa9a',
  'a9a5aaaaaaa9aaaa',
  'aaa9aa9aa9aaaa9a',
  '9aaaaaaaaaaa9aaa',
];

// Ausfransende Unterseite der Insel
const CLIFF_BOTTOM = [
  '9a9aaa99aaa99aa9',
  '99aa9aa9a99aa999',
  'a999a9a999a99a99',
  '9a99999a99999a99',
  '99999a99999a999.',
  '.99999991999999.',
  '.99919999991999.',
  '..999919999999..',
  '..199999919999..',
  '...9999199999...',
  '...1999999991...',
  '....99991999....',
  '.....199991.....',
  '......9991......',
  '.......11.......',
  '................',
];

const BRIDGE_H = [
  '................',
  '................',
  '................',
  'aaaaaaaaaaaaaaaa',
  '9..9..9..9..9..9',
  'bbb9bbb9bbb9bbb9',
  'bbb9bbb9bbb9bbb9',
  'bab9bbb9bab9bbb9',
  'bbb9bab9bbb9bab9',
  'bbb9bbb9bbb9bbb9',
  'bbb9bbb9bbb9bbb9',
  'aaa9aaa9aaa9aaa9',
  '9999999999999999',
  'aaaaaaaaaaaaaaaa',
  '................',
  '................',
];

const GRASS_B = [
  '6666666666666666',
  '6666666666666666',
  '6666666666676666',
  '6676666666766666',
  '6766666666666666',
  '6666666566666666',
  '6666665666666666',
  '6666666666666666',
  '6666666666666676',
  '6666666666666766',
  '6656666666666666',
  '6566666666666666',
  '6666666667666666',
  '6666666676666666',
  '6666666666665666',
  '6666666666656666',
];

const GRASS_C = [
  '6666666666666666',
  '6666666666666666',
  '6666667766666666',
  '6666677876666666',
  '6666667766666666',
  '6666666666666566',
  '6666666666665666',
  '6766666666666666',
  '7666666666666666',
  '6666666666666666',
  '6666666666766666',
  '6666666667666666',
  '6666566666666666',
  '6665666666666666',
  '6666666666666666',
  '6666666666666666',
];

// Hohes Gras, wiegt sich im Wind (2 Frames)
const TALL_GRASS_A = [
  '6666666666666666',
  '6676666666666766',
  '6676667666676766',
  '6576657666576756',
  '5576557665576755',
  '5566555665566555',
  '6555665556555666',
  '6666666666666666',
  '6676666676666666',
  '6676667676667666',
  '6576657657657666',
  '5576557557557656',
  '5566555556555556',
  '6555666655566555',
  '6666666666666666',
  '6666666666666666',
];

const TALL_GRASS_B = [
  '6666666666666666',
  '6667666666666676',
  '6667666766667676',
  '6576657666576756',
  '5576557665576755',
  '5566555665566555',
  '6555665556555666',
  '6666666666666666',
  '6667666667666666',
  '6667666767666766',
  '6576657657657666',
  '5576557557557656',
  '5566555556555556',
  '6555666655566555',
  '6666666666666666',
  '6666666666666666',
];

// Baum über zwei Felder: Krone (Feld darüber, über Figuren) + Stamm (eigenes Feld, blockiert)
const TREE_TOP = [
  '................',
  '................',
  '......0000......',
  '....00778700....',
  '...0778877770...',
  '..077887777760..',
  '.07777777776660.',
  '.07787777766660.',
  '0777777776666660',
  '0677777766666650',
  '0667776666665560',
  '0666666666655550',
  '0666666666555550',
  '0566666665555550',
  '0666665555555550',
  '0566655555555550',
];

const TREE_BASE = [
  '0556555555555550',
  '0555555555555550',
  '.05555555555550.',
  '..055555555550..',
  '...0055995500...',
  '.....009900.....',
  '......09a0......',
  '......09a0......',
  '......09a0......',
  '......09a0......',
  '.....099a90.....',
  '....0999aa90....',
  '...0000000000...',
  '...5555555555...',
  '................',
  '................',
];

// Übergänge: Gras franst in den Weg hinein (Kante oben; andere Seiten werden gedreht)
export const PATH_FRINGE_TOP = [
  '6666666666666666',
  '6676666.66676666',
  'a66aa6aa.6aa66aa',
  '.aa..a...a..aa..',
];

// Ufer: Schatten der Böschung im Wasser (Kante oben)
export const SHORE_TOP = [
  '5555555555555555',
  'cccccccccccccccc',
  'cdcdcccdcdcdcccd',
];

// Ufer unten: heller Schaum am Rand
export const SHORE_BOTTOM = [
  'eeddeeeeedeeeede',
  '4ee4eee44ee4e4e4',
];

/** Dreht eine Kanten-Grafik (für "oben" gezeichnet) auf die anderen Seiten */
export function edgeVariants(top) {
  const left = transpose(top);
  return {
    top,
    bottom: [...top].reverse(),
    left,
    right: left.map((row) => row.split('').reverse().join('')),
  };
}

export const TILE_SIZE = 16;

/** @type {Record<string, import('../engine/Tilemap.js').TileDef>} */
export const TILESET = {
  void: { solid: true },
  // Mehrfach gelistete Varianten = häufiger
  grass: { frames: [GRASS, GRASS, GRASS, GRASS_B, GRASS_B, GRASS_C], variants: true },
  flowers: { frames: [FLOWERS] },
  tallGrass: { frames: [TALL_GRASS_A, TALL_GRASS_B], frameTime: 0.8 },
  moss: { frames: [MOSS] },
  path: { frames: [PATH] },
  tree: { frames: [TREE_BASE], top: TREE_TOP, under: 'grass', solid: true },
  rock: { frames: [ROCK], under: 'grass', solid: true },
  water: { frames: [WATER_A, WATER_B], frameTime: 0.6, solid: true },
  cliff: { frames: [CLIFF], solid: true },
  cliffBottom: { frames: [CLIFF_BOTTOM], solid: true },
  bridgeH: { frames: [BRIDGE_H] },
  bridgeV: { frames: [transpose(BRIDGE_H)] },
};

// Tiles, auf denen die Insel "steht" (darunter entsteht automatisch eine Felswand)
export const GROUND_TILES = new Set(['grass', 'flowers', 'tallGrass', 'moss', 'path', 'tree', 'rock', 'water']);

// Bewachsener Boden: franst an Wegen aus
export const GREEN_TILES = new Set(['grass', 'flowers', 'tallGrass', 'moss', 'tree', 'rock']);
