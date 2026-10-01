// Spielfigur (16×16): Reisende mit rotem Schal und Lila-Umhang.
// Frames werden aus Oberkörper + Beinvarianten zusammengesetzt.

const DOWN_TOP = [
  '................',
  '.....000000.....',
  '....0a99a990....',
  '...0a9aa99990...',
  '...0999999990...',
  '...09bbbbbb90...',
  '...0b0bbbb0b0...',
  '....0fbbbbf0....',
  '....00ffff00....',
  '...01ffff2210...',
  '...0122a22210...',
  '...0b122a21b0...',
  '....01222a10....',
];

const UP_TOP = [
  '................',
  '.....000000.....',
  '....0a99a990....',
  '...0a9aa99990...',
  '...0999999990...',
  '...0999999990...',
  '...09a9999a90...',
  '....09999990....',
  '....0ffffff0....',
  '...0122ff2210...',
  '...01aaaaa210...',
  '...0b1a99a1b0...',
  '....01aaaa10....',
];

const SIDE_TOP = [
  '................',
  '.....000000.....',
  '....0a9a9990....',
  '...0a99a99990...',
  '...09999999990..',
  '...0999bbbbb0...',
  '...099bbbb0b0...',
  '....09bbbbfb0...',
  '....00ffff00....',
  '...0ff122220....',
  '...0aa222220....',
  '...0a9a2b220....',
  '....0a122210....',
];

const FRONT_LEGS = {
  stand: ['....0cc00cc0....', '....0cc00cc0....', '.....00..00.....'],
  stepA: ['....0cc00cc0....', '....0cc0.000....', '.....00.........'],
  stepB: ['....0cc00cc0....', '....000.0cc0....', '..........00....'],
};

const SIDE_LEGS = {
  stand: ['.....0ccc0......', '.....0ccc0......', '.....00000......'],
  stepA: ['....0cc0cc0.....', '...0cc0..0c0....', '...00.....00....'],
  stepB: ['.....0ccc0......', '.....0cc0.......', '.....000........'],
};

function build(top, legs) {
  return {
    stand: [...top, ...legs.stand],
    stepA: [...top, ...legs.stepA],
    stepB: [...top, ...legs.stepB],
  };
}

// 'left' wird zur Laufzeit aus 'right' gespiegelt
export const PLAYER_FRAMES = {
  down: build(DOWN_TOP, FRONT_LEGS),
  up: build(UP_TOP, FRONT_LEGS),
  right: build(SIDE_TOP, SIDE_LEGS),
};
