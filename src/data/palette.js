// Globale Hauptpalette der Driftlande (16 Farben).
// Schlüssel sind die Zeichen in den Pixel-Arrays; '.' ist transparent.
export const PALETTE = {
  0: '#14121c', // Kontur / fast Schwarz
  1: '#3b2f4a', // dunkles Violett
  2: '#6b5a7a', // gedecktes Lila / Stein
  3: '#c8c0d8', // blasses Lila / Wolkenschatten
  4: '#f4f0ec', // Weiß
  5: '#24402e', // dunkles Grün
  6: '#3f7a3a', // Grün
  7: '#7fb04a', // helles Grün
  8: '#d7e07a', // Gelbgrün / Licht
  9: '#5a3a26', // dunkles Braun
  a: '#9a6a3a', // Braun
  b: '#e0a860', // Sand / Haut
  c: '#2c4a7a', // tiefes Blau
  d: '#4f8ad0', // Blau
  e: '#9fd4f0', // Himmel
  f: '#d0503a', // Rot / Glut
};

// Benannte Zugriffe für Code (UI, Hintergründe)
export const COLORS = {
  ink: PALETTE[0],
  night: PALETTE[1],
  stone: PALETTE[2],
  mist: PALETTE[3],
  white: PALETTE[4],
  forest: PALETTE[5],
  green: PALETTE[6],
  leaf: PALETTE[7],
  glow: PALETTE[8],
  bark: PALETTE[9],
  wood: PALETTE.a,
  sand: PALETTE.b,
  deep: PALETTE.c,
  water: PALETTE.d,
  sky: PALETTE.e,
  ember: PALETTE.f,
};
