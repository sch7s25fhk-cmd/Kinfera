// Spielfigur (16×16): Reisende mit rotem Schal und Lila-Umhang.
// Frames werden aus Oberkörper + Beinvarianten zusammengesetzt.

const DOWN_TOP = [
  '................',
  '.....000000.....',
  '....0a9999a0....',
  '...0a999999a0...',
  '...0999999990...',
  '...09bbbbbb90...',
  '...0b0bbbb0b0...',
  '....0bbbbbb0....',
  '....0ffffff0....',
  '...012ffff210...',
  '...0122222210...',
  '...0b122221b0...',
  '....01222210....',
];

const UP_TOP = [
  '................',
  '.....000000.....',
  '....0a9999a0....',
  '...0a999999a0...',
  '...0999999990...',
  '...0999999990...',
  '...09a9999a90...',
  '....09999990....',
  '....0ffffff0....',
  '...0122ff2210...',
  '...0122222210...',
  '...0b122221b0...',
  '....01222210....',
];

const SIDE_TOP = [
  '................',
  '.....000000.....',
  '....0a999990....',
  '...0a99999990...',
  '...09999999990..',
  '...0999bbbbb0...',
  '...099bbbb0b0...',
  '....09bbbbbb0...',
  '....0ffffff0....',
  '....0f122220....',
  '....01222220....',
  '....012b2220....',
  '....01222210....',
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
