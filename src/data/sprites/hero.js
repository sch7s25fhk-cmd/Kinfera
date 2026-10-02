// Lio, der Laternenträger (16×16, Blick nach rechts; links wird gespiegelt).
// Oberkörper + Beinvarianten werden zu Frames zusammengesetzt.
// Laterne auf dem Rücken: Rahmen 9/a, Glut 8/4.

const TOP = [
  '................',
  '......00000.....',
  '.....0ccccc0....',
  '....0cddcccc0...',
  '....0cdccbbbc0..',
  '...00cdcbbb0b0..',
  '..0990cdcbbbbb0.',
  '.09840ccfbbbb0..',
  '.04880cfffff0...',
  '.08840cff1ccf0..',
  '..0990c1cccc0...',
  '...000c1cccc0...',
];

// Arm nach vorn gestreckt (Funke werfen)
const TOP_SHOOT = [
  '................',
  '......00000.....',
  '.....0ccccc0....',
  '....0cddcccc0...',
  '....0cdccbbbc0..',
  '...00cdcbbb0b0..',
  '..0990cdcbbbbb0.',
  '.09840ccfbbbb0..',
  '.04880cfffff00..',
  '.08840cff1cccbb0',
  '..0990c1cccc000.',
  '...000c1cccc0...',
];

const LEGS = {
  stand: ['.....0111110....', '.....010.010....', '.....090.090....', '....0990.0990...'],
  run1: ['.....0111110....', '....010...0100..', '...090.....0990.', '..0990..........'],
  run2: ['.....0111110....', '.....0101100....', '......0990......', '......09990.....'],
  run3: ['.....0111110....', '....0100..010...', '...0990....090..', '...........0990.'],
  jump: ['.....0111110....', '....01100110....', '....0990.0990...', '................'],
  fall: ['.....0111110....', '....010...010...', '...090.....090..', '..0990.....0990.'],
};

const make = (top, legs) => [...top, ...LEGS[legs]];

export const HERO = {
  idle: make(TOP, 'stand'),
  run: [make(TOP, 'run1'), make(TOP, 'run2'), make(TOP, 'run3'), make(TOP, 'run2')],
  jump: make(TOP, 'jump'),
  fall: make(TOP, 'fall'),
  shoot: make(TOP_SHOOT, 'stand'),
  shootAir: make(TOP_SHOOT, 'jump'),
};
