/* Souverän – Einheiten als Figuren: Soldat, Panzer, Geschütz (vorgezeichnet und zwischengespeichert)
   Zeichenraum: Boden bei y = 0, Blick nach +x. Jede Einheit ist ein eigenes Bild ohne Kasten;
   die Zugehörigkeit zeigt der Ring am Boden (siehe render.js). Neue Typen tragen sich in SPRITES ein. */
'use strict';
(function (S) {
  const SP = S.Sprites = {};

  // ---------------- Farben ----------------
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb = (a) => 'rgb(' + a.map(v => Math.round(Math.max(0, Math.min(255, v)))).join(',') + ')';
  const shade = (hex, f) => { const c = hexRgb(hex); return rgb(f >= 0 ? c.map(v => v + (255 - v) * f) : c.map(v => v * (1 + f))); };
  // Uniform- und Tarnfarben echter Armeen: Oliv, Feldgrau, Khaki, Waldgrün, Sand, Graublau
  const UNIFORMS = ['#5b6142', '#686b5c', '#7a7155', '#4d5a45', '#8b7d5a', '#58626a'];
  SP.uniformOf = function (o) {
    const home = S.World && S.World.homeIdx;
    if (o === -1) return '#5d5a50';                 // Partisanen
    let i = Math.abs((o * 2654435761) | 0) % UNIFORMS.length;
    const hi = home ? Math.abs((home * 2654435761) | 0) % UNIFORMS.length : -1;
    if (o !== home && i === hi) i = (i + 2) % UNIFORMS.length;   // Gegner nie in der eigenen Farbe
    return UNIFORMS[i];
  };

  function grad(c, x0, y0, x1, y1, stops) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    return g;
  }
  const OUT = 'rgba(18,16,12,0.6)';

  // ---------------- Soldat ----------------
  /** pose: 'walk' (frame 0–3), 'stand', 'aim' */
  function soldier(c, uni, mark, pose, frame) {
    const dark = shade(uni, -0.35), light = shade(uni, 0.22), boot = '#2a2219', skin = '#d29e78';
    const sw = pose === 'walk' ? Math.sin(frame / 4 * Math.PI * 2) * 0.42 : 0;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const leg = (a, col, bootCol) => {
      const hx = 0, hy = -27;
      const kx = hx + Math.sin(a) * 13 + 1.5, ky = hy + Math.cos(a) * 13;
      const fx = kx + Math.sin(a * 0.6) * 12 - 1, fy = ky + 12.5;
      c.strokeStyle = col; c.lineWidth = 6.4;
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(kx, ky); c.lineTo(fx, fy - 5); c.stroke();
      c.fillStyle = bootCol;
      c.beginPath(); c.moveTo(fx - 3.4, fy - 5); c.lineTo(fx + 2.6, fy - 5); c.quadraticCurveTo(fx + 7, fy - 3, fx + 6.5, fy); c.lineTo(fx - 3.6, fy); c.closePath(); c.fill();
    };
    // hinteres Bein, Rucksack, hinterer Arm
    leg(-sw, dark, '#1d1812');
    c.fillStyle = grad(c, -15, -50, -6, -30, [[0, shade(uni, -0.15)], [1, shade(uni, -0.45)]]);
    c.beginPath(); c.moveTo(-15, -47); c.quadraticCurveTo(-16, -38, -14, -30); c.lineTo(-6, -30); c.lineTo(-6, -48); c.closePath(); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = shade(uni, -0.5); c.fillRect(-15, -42, 9, 2.2);
    if (pose !== 'aim') { c.strokeStyle = dark; c.lineWidth = 5; c.beginPath(); c.moveTo(-2, -45); c.lineTo(2, -36); c.lineTo(9, -35); c.stroke(); }
    // vorderes Bein
    leg(sw, shade(uni, -0.12), boot);
    // Rumpf (Licht von links oben)
    c.fillStyle = grad(c, -8, -50, 9, -27, [[0, light], [0.55, uni], [1, dark]]);
    c.beginPath(); c.moveTo(-7, -49); c.quadraticCurveTo(0, -51, 8, -49); c.lineTo(8.5, -27); c.lineTo(-7.5, -27); c.closePath(); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    // Koppel, Taschen, Knopfleiste
    c.fillStyle = '#3b2f22'; c.fillRect(-7.5, -30.5, 16, 3);
    c.fillStyle = '#b9a46a'; c.fillRect(1.6, -30.2, 2.2, 2.4);
    c.fillStyle = shade(uni, -0.25); c.fillRect(4.2, -34, 4, 3.6); c.fillRect(-5.5, -34, 4, 3.6);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(1, -48); c.lineTo(1, -31); c.stroke();
    // Gewehr
    const rifle = () => {
      if (pose === 'aim') {
        c.fillStyle = '#5a3d24'; c.beginPath(); c.moveTo(-2, -41); c.lineTo(9, -43.5); c.lineTo(9, -40.5); c.lineTo(-1, -37.5); c.closePath(); c.fill();
        c.fillStyle = '#26262a'; c.fillRect(9, -43.6, 9, 2.6); c.fillRect(18, -43, 14, 1.4); c.fillRect(12, -41.4, 2.2, 4);
      } else {
        c.save(); c.translate(1, -33); c.rotate(-0.55);
        c.fillStyle = '#5a3d24'; c.beginPath(); c.moveTo(-9, -1.5); c.lineTo(3, -1.6); c.lineTo(3, 1.6); c.lineTo(-8, 2.6); c.closePath(); c.fill();
        c.fillStyle = '#26262a'; c.fillRect(3, -1.7, 9, 3.2); c.fillRect(12, -1, 15, 1.5); c.fillRect(6, 1.4, 2.2, 3.6);
        c.restore();
      }
    };
    rifle();
    // vorderer Arm mit Binde in Landesfarbe
    c.strokeStyle = shade(uni, -0.05); c.lineWidth = 5.2;
    c.beginPath();
    if (pose === 'aim') { c.moveTo(3, -46); c.lineTo(9, -42); c.lineTo(15, -42.5); }
    else { c.moveTo(3, -46); c.lineTo(6, -37); c.lineTo(12, -40); }
    c.stroke();
    c.strokeStyle = mark; c.lineWidth = 5.4; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(3.9, -43.6); c.lineTo(4.5, -41.6); c.stroke(); c.lineCap = 'round';
    c.fillStyle = skin;
    c.beginPath(); c.arc(pose === 'aim' ? 15 : 12, pose === 'aim' ? -42.5 : -40, 1.9, 0, Math.PI * 2); c.fill();
    // Kopf und Helm
    c.fillStyle = shade('#d29e78', -0.15); c.fillRect(0, -52, 4.5, 4);
    c.fillStyle = grad(c, -1, -58, 7, -48, [[0, '#e6b892'], [1, '#b27f5c']]);
    c.beginPath(); c.ellipse(3, -53.5, 4.6, 5.2, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#7a523a'; c.fillRect(6.3, -54.2, 1.2, 1.2);
    const hel = grad(c, -4, -63, 8, -53, [[0, shade(uni, 0.18)], [0.6, shade(uni, -0.1)], [1, shade(uni, -0.4)]]);
    c.fillStyle = hel;
    c.beginPath(); c.moveTo(-5, -55); c.quadraticCurveTo(-4, -63.5, 3, -63.5); c.quadraticCurveTo(10, -63.5, 10, -55.5); c.closePath(); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = shade(uni, -0.45);
    c.beginPath(); c.ellipse(2.5, -55.2, 8.6, 1.5, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = 1;
    c.beginPath(); c.arc(2, -57, 5, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
    c.strokeStyle = '#2d2a20'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-1.5, -55); c.lineTo(1, -49); c.stroke();
  }

  // ---------------- Panzer ----------------
  function tank(c, uni, mark, pose, frame) {
    const light = shade(uni, 0.25), dark = shade(uni, -0.4);
    // Ketten
    const track = new Path2D();
    track.moveTo(-40, -15); track.lineTo(34, -15); track.quadraticCurveTo(44, -15, 43, -8); track.quadraticCurveTo(41, 0, 32, 0);
    track.lineTo(-36, 0); track.quadraticCurveTo(-45, 0, -45, -7); track.quadraticCurveTo(-46, -15, -40, -15); track.closePath();
    c.fillStyle = grad(c, 0, -15, 0, 0, [[0, '#3b3a35'], [1, '#1c1b18']]); c.fill(track);
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 0.9; c.stroke(track);
    c.strokeStyle = 'rgba(120,118,108,0.55)'; c.lineWidth = 0.9;
    c.beginPath();
    const off = (frame % 2) * 2;
    for (let x = -40 + off; x < 34; x += 4) { c.moveTo(x, -0.8); c.lineTo(x + 1.2, -2.6); c.moveTo(x, -14.4); c.lineTo(x + 1.2, -12.8); }
    c.stroke();
    // Laufrollen, Antriebs- und Leitrad
    for (let i = 0; i < 6; i++) {
      const x = -30 + i * 11.6;
      c.fillStyle = grad(c, x - 5, -11, x + 5, -1, [[0, '#7c7b72'], [1, '#33322d']]);
      c.beginPath(); c.arc(x, -6.2, 5.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#26251f'; c.beginPath(); c.arc(x, -6.2, 1.6, 0, Math.PI * 2); c.fill();
    }
    for (const [x, r] of [[37.5, 4.2], [-39.5, 3.8]]) {
      c.fillStyle = '#4a4943'; c.beginPath(); c.arc(x, -8.5, r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#24231f'; c.lineWidth = 0.8; c.stroke();
    }
    // Wanne
    const hull = new Path2D();
    hull.moveTo(-47, -14); hull.lineTo(-45, -25); hull.lineTo(28, -25.5); hull.lineTo(47, -17.5); hull.lineTo(44, -13); hull.lineTo(-45, -12.5); hull.closePath();
    const turret = new Path2D();
    turret.moveTo(-22, -25); turret.lineTo(-18, -35.5); turret.lineTo(8, -37); turret.lineTo(20, -30); turret.lineTo(19, -25); turret.closePath();
    c.fillStyle = grad(c, 0, -26, 0, -12, [[0, light], [0.35, uni], [1, dark]]); c.fill(hull);
    c.fillStyle = grad(c, -10, -38, 6, -24, [[0, light], [0.6, uni], [1, dark]]); c.fill(turret);
    // Tarnflecken
    c.save();
    const both = new Path2D(); both.addPath(hull); both.addPath(turret);
    c.clip(both);
    const blots = [[-34, -20, 9, 4, -0.2, -0.32], [-8, -17, 11, 4, 0.1, 0.18], [18, -21, 8, 3.5, 0.3, -0.3], [-12, -33, 7, 3, 0, -0.3], [6, -31, 6, 2.6, 0.2, 0.15]];
    for (const [x, y, rx, ry, a, f] of blots) { c.fillStyle = shade(uni, f); c.globalAlpha = 0.75; c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.strokeStyle = OUT; c.lineWidth = 0.9; c.stroke(hull); c.stroke(turret);
    // Kettenschürze, Kanten, Luken
    c.fillStyle = shade(uni, -0.3); c.fillRect(-43, -15.5, 80, 2.8);
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-44, -24.6); c.lineTo(27, -25); c.moveTo(-17, -35); c.lineTo(7, -36.4); c.stroke();
    c.fillStyle = shade(uni, -0.2); c.fillRect(-11, -40, 8, 3.6);
    c.strokeStyle = OUT; c.lineWidth = 0.7; c.strokeRect(-11, -40, 8, 3.6);
    c.strokeStyle = 'rgba(30,30,25,0.8)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-16, -36); c.quadraticCurveTo(-19, -48, -24, -60); c.stroke();
    // Kanone mit Blende und Mündungsbremse
    c.fillStyle = shade(uni, -0.15); c.fillRect(15, -34, 7, 7.5);
    c.fillStyle = grad(c, 0, -32.8, 0, -29.2, [[0, '#5f5e55'], [0.5, '#3b3a34'], [1, '#22211d']]);
    c.fillRect(21, -32.6, 37, 3.2);
    c.fillStyle = '#26251f'; c.fillRect(56, -33.6, 5, 5.2);
    // Hoheitszeichen in Landesfarbe
    c.fillStyle = '#f2efe6'; c.beginPath(); c.arc(-6, -30, 3.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = mark; c.beginPath(); c.arc(-6, -30, 2.5, 0, Math.PI * 2); c.fill();
  }

  // ---------------- Geschütz (Feldhaubitze mit Bedienung) ----------------
  function artillery(c, uni, mark, pose, frame) {
    const dark = shade(uni, -0.4);
    // Kanonier hinter dem Geschütz
    c.save(); c.translate(-30, 0); c.scale(0.72, 0.72); soldier(c, uni, mark, 'stand', 0); c.restore();
    // Holm (Lafette) mit Sporn
    c.fillStyle = grad(c, 0, -14, 0, 0, [[0, shade(uni, -0.05)], [1, dark]]);
    c.beginPath(); c.moveTo(2, -14); c.lineTo(-46, -3); c.lineTo(-47, 0.5); c.lineTo(-40, 0.5); c.lineTo(4, -9); c.closePath(); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = '#2a2925'; c.beginPath(); c.moveTo(-47, -3); c.lineTo(-50, 1); c.lineTo(-42, 1); c.closePath(); c.fill();
    // Rohr mit Rohrwiege, schräg nach oben
    c.save(); c.translate(6, -22); c.rotate(-0.42);
    c.fillStyle = grad(c, 0, -4, 0, 4, [[0, shade(uni, 0.15)], [1, dark]]);
    c.fillRect(-12, -3.6, 26, 7.2);
    c.strokeStyle = OUT; c.lineWidth = 0.8; c.strokeRect(-12, -3.6, 26, 7.2);
    c.fillStyle = grad(c, 0, -2, 0, 2, [[0, '#6a695f'], [0.5, '#3f3e37'], [1, '#22211d']]);
    c.fillRect(12, -1.9, 44, 3.8);
    c.fillStyle = '#26251f'; c.fillRect(54, -2.9, 6, 5.8);
    c.restore();
    // Schutzschild
    c.fillStyle = grad(c, 0, -38, 12, -12, [[0, shade(uni, 0.22)], [0.6, uni], [1, dark]]);
    c.beginPath(); c.moveTo(-2, -36); c.lineTo(9, -38.5); c.lineTo(12, -13); c.lineTo(0, -13); c.closePath(); c.fill();
    c.strokeStyle = OUT; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = '#f2efe6'; c.beginPath(); c.arc(5, -24, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = mark; c.beginPath(); c.arc(5, -24, 2, 0, Math.PI * 2); c.fill();
    // Rad mit Gummireifen und Speichen
    const wx = 2, wy = -11.5, R = 11;
    c.strokeStyle = '#1b1a17'; c.lineWidth = 3.6; c.beginPath(); c.arc(wx, wy, R - 1.8, 0, Math.PI * 2); c.stroke();
    c.fillStyle = grad(c, wx - 8, wy - 8, wx + 8, wy + 8, [[0, '#7a7a70'], [1, '#3a3933']]);
    c.beginPath(); c.arc(wx, wy, R - 3.6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2e2d28'; c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; c.moveTo(wx, wy); c.lineTo(wx + Math.cos(a) * (R - 3.8), wy + Math.sin(a) * (R - 3.8)); }
    c.stroke();
    c.fillStyle = '#22211d'; c.beginPath(); c.arc(wx, wy, 2.2, 0, Math.PI * 2); c.fill();
  }

  /**
   * Einheitentypen: Zeichenfunktion, Bildausschnitt (Zeichenraum) und Bildschirmgröße.
   * Neue Einheiten (z. B. Flugzeuge, Schiffe) tragen hier ihre Zeichnung ein.
   */
  const SPRITES = SP.TYPES = {
    inf: { draw: soldier, box: [-20, -66, 36, 70], px: 0.62 },
    tank: { draw: tank, box: [-50, -64, 115, 68], px: 0.5 },
    art: { draw: artillery, box: [-54, -52, 118, 56], px: 0.5 }
  };

  const cache = new Map();
  /** fertiges Bild (Leinwand) einer Einheit */
  SP.get = function (type, o, face, pose, frame, dpr) {
    const T = SPRITES[type] || SPRITES.inf;
    const mark = SP.markOf ? SP.markOf(o) : '#e3ad3c';
    const uni = SP.uniformOf(o);
    const key = type + '|' + uni + '|' + mark + '|' + (face < 0 ? 'l' : 'r') + '|' + pose + '|' + frame + '|' + dpr;
    let e = cache.get(key);
    if (e) return e;
    const [bx, by, bw, bh] = T.box, k = T.px * dpr * 1.25;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(bw * k); cv.height = Math.ceil(bh * k);
    const c = cv.getContext('2d');
    c.setTransform(face < 0 ? -k : k, 0, 0, k, face < 0 ? (bx + bw) * k : -bx * k, -by * k);
    T.draw(c, uni, mark, pose, frame);
    e = { cv, k, bx, by, bw, bh, face };
    if (cache.size > 600) cache.clear();
    cache.set(key, e);
    return e;
  };

  /** Einheit an (x, y) zeichnen: (x, y) ist der Bodenpunkt unter der Figur, scale 1 = Normalgröße */
  SP.draw = function (c, type, o, x, y, face, pose, frame, scale, dpr) {
    const T = SPRITES[type] || SPRITES.inf, e = SP.get(type, o, face, pose, frame, dpr || 1), f = T.px * (scale || 1);
    const left = face < 0 ? x - (e.bx + e.bw) * f : x + e.bx * f;
    c.drawImage(e.cv, left, y + e.by * f, e.bw * f, e.bh * f);
  };
  /** Höhe der Figur über dem Boden in Bildschirmpunkten */
  SP.height = (type, scale) => { const T = SPRITES[type] || SPRITES.inf; return -T.box[1] * T.px * (scale || 1); };
})(S);
