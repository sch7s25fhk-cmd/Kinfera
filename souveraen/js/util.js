/* Souverän – Hilfsfunktionen: Zufall, Rauschen, Formatierung */
'use strict';
var S = (typeof window !== 'undefined' ? window : globalThis).S = (typeof window !== 'undefined' ? window : globalThis).S || {};

(function (S) {
  S.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  S.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  };

  S.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /** Wertrauschen mit weicher Interpolation, Werte 0..1 */
  S.makeNoise = function (seed) {
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = S.hash2(xi, yi, seed), b = S.hash2(xi + 1, yi, seed);
      const c = S.hash2(xi, yi + 1, seed), d = S.hash2(xi + 1, yi + 1, seed);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  };

  S.fbm = function (noise, x, y, oct) {
    let s = 0, amp = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += noise(x * f + i * 17.3, y * f - i * 9.1) * amp;
      n += amp; amp *= 0.5; f *= 2.03;
    }
    return s / n;
  };

  S.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  S.lerp = (a, b, t) => a + (b - a) * t;

  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  S.fmt = (v) => nf0.format(Math.round(v));
  S.fmt1 = (v) => nf1.format(v);

  /** Bevölkerung in gut lesbarer Form */
  S.fmtPop = function (v) {
    v = Math.max(0, v);
    if (v >= 1e9) return nf1.format(v / 1e9) + ' Mrd.';
    if (v >= 1e6) return nf1.format(v / 1e6) + ' Mio.';
    if (v >= 1e4) return nf0.format(v / 1e3) + ' Tsd.';
    return nf0.format(v);
  };

  /** Geld in Mio. Taler */
  S.fmtMoney = function (v, sign) {
    const s = sign && v > 0 ? '+' : '';
    if (Math.abs(v) >= 10000) return s + nf1.format(v / 1000) + ' Mrd. T';
    return s + nf0.format(Math.round(v)) + ' Mio. T';
  };

  S.MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  S.START_YEAR = 2026;
  S.dateStr = (m) => S.MONTHS[m % 12] + ' ' + (S.START_YEAR + Math.floor(m / 12));

  S.esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  S.N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  S.N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];

  // Base64 für typisierte Arrays (Speicherstände)
  S.toB64 = function (arr) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  S.fromB64 = function (b64, Type) {
    const s = atob(b64);
    const u8 = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
    return new Type(u8.buffer);
  };
})(S);
