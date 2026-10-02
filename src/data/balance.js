// Alle Spielwerte an einem Ort (Pixel, Sekunden). Zum Feintuning hier drehen.

export const PHYSICS = {
  gravity: 900,
  maxFall: 280,
  runAccel: 900,
  airAccel: 650,
  runFriction: 1100,
  maxRun: 92,
  jumpSpeed: 290,
  jumpCut: 0.45, // Sprungtaste früh loslassen → kürzerer Sprung
  coyoteTime: 0.09, // nach Kante noch springen
  jumpBuffer: 0.12, // Sprung kurz vor Landung merken
  stompBounce: 210,
  windLift: 1500, // Aufwind-Beschleunigung
  windMaxRise: 170,
};

export const LANTERN = {
  max: 100,
  hitDamage: 25,
  shotCost: 4,
  minToShoot: 12, // darunter flackert die Laterne nur
  sparkGain: 6,
  invulnTime: 1.2,
  knockbackX: 120,
  knockbackY: 170,
  shotSpeed: 230,
  shotLife: 0.6,
  shotCooldown: 0.22,
};

export const ENEMIES = {
  beetle: { hp: 1, speed: 24, stompable: true, w: 13, h: 10, score: 1 },
  snail: { hp: 2, speed: 11, stompable: false, w: 14, h: 12, score: 2 },
  jelly: { hp: 1, speed: 0, stompable: true, w: 13, h: 10, score: 1, floatRange: 18, floatPeriod: 2.6 },
};
