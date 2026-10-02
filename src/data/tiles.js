// Tile-Grafiken (16×16) und Tileset für die Level.
// Zeichen siehe palette.js, '.' = transparent.

export const TILE_SIZE = 16;

// Boden mit Grasnarbe (oben frei)
const GROUND_TOP = [
  '.7...7.7....7..7',
  '7877787787778777',
  '7777777777777777',
  '6676677667766766',
  '6566656666566656',
  '5a55a5a55a5a55a5',
  'a5aaaa9aa5aaaaa9',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaa99aa',
  'aa99aaaaaaaaaaaa',
  'aaaaaaaa232aaaaa',
  'aaaaaaa22222aaaa',
  'aaaaaaaa999aaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaa99aaaaaaaa9aa',
  'aaaaaaaaaaaaaaaa',
];

// Erde innen (Varianten gegen Wiederholung)
const DIRT_A = [
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaa9aaa',
  'a99aaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaa2322aaaaaa',
  'aaaaa222222aaaaa',
  'aaaaaa9999aaaa99',
  'aaaaaaaaaaaaaaaa',
  'aa9aaaaaaaaaaaaa',
  'aaaaaaaaaaa99aaa',
  'aaaaaaaaaaaaaaaa',
  '9aaaaaaaaaaaaaaa',
  'aaaaaaa99aaaaaaa',
  'aaaaaaaaaaaaa232',
  'aaa9aaaaaaaa2222',
  'aaaaaaaaaaaaa999',
];

const DIRT_B = [
  'aaaaaaaaaaaaaaaa',
  'aaaaa99aaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaa9aaa',
  '99aaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaa99aaaaa',
  'aaa232aaaaaaaaaa',
  'aa22222aaaaaaa9a',
  'aaa999aaaaaaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaa9aaaa',
  'aaaaaaaaaaaaaaaa',
  'a9aaaaaa99aaaaaa',
  'aaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaa9aaa',
];

// Unterseite einer Schwebeinsel (Deko, ausfransend)
const UNDERSIDE = [
  '9a9aaa99aaa99aa9',
  '99aa9aa9a99aa999',
  '1999a9a999a99a99',
  '9199999199999199',
  '99199a19999a199.',
  '.99991991199991.',
  '.9911999991199..',
  '..9919199999....',
  '..11999991999...',
  '...991919199....',
  '...1199119......',
  '....99919.......',
  '.....1991.......',
  '......91........',
  '................',
  '................',
];

// Wolkenplattform: von unten durchspringbar. Mittelstück + abgerundete Enden.
const CLOUD_MID = [
  '2222222222222222',
  '4444444444444444',
  '4444444444444444',
  '4443444444434444',
  '3333433333334333',
  '3333333333333333',
  '2332332333233323',
  '2222222222222222',
];
const CLOUD_CAP = ['..', '.2', '24', '24', '23', '23', '.2', '..'];

function cloud(left, right) {
  const rows = CLOUD_MID.map((row, y) => {
    let r = row;
    if (left) r = CLOUD_CAP[y] + r.slice(2);
    if (right) r = r.slice(0, 14) + CLOUD_CAP[y].split('').reverse().join('');
    return r;
  });
  return [...rows, ...Array(8).fill('................')];
}

// Holzbrücke: von unten durchspringbar
const BRIDGE = [
  'aaaaaaaaaaaaaaaa',
  '9..9..9..9..9..9',
  'bbb9bbb9bbb9bbb9',
  'bab9bbb9bab9bbb9',
  'bbb9bab9bbb9bab9',
  'aaa9aaa9aaa9aaa9',
  '9999999999999999',
  '.9...........9..',
  '.9...........9..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Dornen: Schaden bei Berührung
const THORNS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..0.....0.....0.',
  '..30...030...03.',
  '.032..0320..032.',
  '.0320.0320.0320.',
  '0322003222003220',
  '0322203222003222',
  '5222252222552225',
  '5655556555655565',
  '6666666666666666',
  '6666666666666666',
];

// Deko (nicht fest)
const BUSH = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....0000.......',
  '...00777700.000.',
  '..0778777770770.',
  '.07787777766770.',
  '.07777776666660.',
  '0677776666665560',
  '0666666655555550',
  '0555555555555550',
  '.00000000000000.',
  '................',
];

const FLOWERS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....4.......f...',
  '...484.....f8f..',
  '....4...4...f...',
  '....6..484..6...',
  '...66...4..66...',
  '....6...6...6...',
  '....6..66...6...',
  '................',
];

const GLOWSHROOM = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......0000.....',
  '.....00e4ee00...',
  '....0eee4eeee0..',
  '....00dddddd00..',
  '......0330......',
  '..00..0330......',
  '.0e40.0330......',
  '.0dd0.0330......',
  '..33...33.......',
];

const TALL_GRASS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..7.......7.....',
  '..7..7....7..7..',
  '.67..7.7.67..7..',
  '.67.67.7.67.67..',
  '.6676767.6676767',
  '5666667656666676',
  '................',
  '................',
  '................',
];

const VINE = [
  '.....5..........',
  '.....56.........',
  '......6.........',
  '.....67.........',
  '.....6..........',
  '....56..........',
  '.....6..7.......',
  '.....66.........',
  '......6.........',
  '.....76.........',
  '.....6..........',
  '....56..........',
  '.....6..........',
  '......6.........',
  '.....7..........',
  '................',
];

/** Spiegelt ein Pixel-Array waagerecht */
export function mirror(rows) {
  return rows.map((row) => row.split('').reverse().join(''));
}

/** @type {Record<string, import('../engine/Tilemap.js').TileDef & { oneWay?: boolean, hazard?: boolean }>} */
export const TILESET = {
  air: {},
  groundTop: { frames: [GROUND_TOP], solid: true },
  dirt: { frames: [DIRT_A, DIRT_A, DIRT_B], variants: true, solid: true },
  underside: { frames: [UNDERSIDE, mirror(UNDERSIDE)], variants: true },
  cloudL: { frames: [cloud(true, false)], oneWay: true },
  cloudM: { frames: [cloud(false, false)], oneWay: true },
  cloudR: { frames: [cloud(false, true)], oneWay: true },
  cloudS: { frames: [cloud(true, true)], oneWay: true },
  bridge: { frames: [BRIDGE], oneWay: true },
  thorns: { frames: [THORNS], hazard: true },
  bush: { frames: [BUSH, mirror(BUSH)], variants: true },
  flowers: { frames: [FLOWERS, mirror(FLOWERS)], variants: true },
  glowshroom: { frames: [GLOWSHROOM, mirror(GLOWSHROOM)], variants: true },
  tallGrass: { frames: [TALL_GRASS, mirror(TALL_GRASS)], variants: true },
  vine: { frames: [VINE, mirror(VINE)], variants: true },
  wind: {}, // Aufwind-Zone: unsichtbares Tile, Effekt wird gezeichnet
};

/** Fester Boden (für Autotiling und Kanten) */
export const SOLID_GROUND = new Set(['groundTop', 'dirt']);
