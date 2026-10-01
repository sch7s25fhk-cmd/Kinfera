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

const TREE = [
  '.....000000.....',
  '...0066776600...',
  '..067777777660..',
  '.06777677776660.',
  '.06776667766560.',
  '0677766666665560',
  '0667766676655560',
  '0666666666655550',
  '0566666665555550',
  '.05566655555550.',
  '..055555555550..',
  '...0005995000...',
  '......0990......',
  '......09a0......',
  '.....09aa90.....',
  '....55555555....',
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

export const TILE_SIZE = 16;

/** @type {Record<string, import('../engine/Tilemap.js').TileDef>} */
export const TILESET = {
  void: { solid: true },
  grass: { frames: [GRASS] },
  flowers: { frames: [FLOWERS] },
  moss: { frames: [MOSS] },
  path: { frames: [PATH] },
  tree: { frames: [TREE], under: 'grass', solid: true },
  rock: { frames: [ROCK], under: 'grass', solid: true },
  water: { frames: [WATER_A, WATER_B], frameTime: 0.6, solid: true },
  cliff: { frames: [CLIFF], solid: true },
  cliffBottom: { frames: [CLIFF_BOTTOM], solid: true },
  bridgeH: { frames: [BRIDGE_H] },
  bridgeV: { frames: [transpose(BRIDGE_H)] },
};

// Tiles, auf denen die Insel "steht" (darunter entsteht automatisch eine Felswand)
export const GROUND_TILES = new Set(['grass', 'flowers', 'moss', 'path', 'tree', 'rock', 'water']);
