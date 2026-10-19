/* Souverän – Erde als Satellitenbild: eine gemeinsame Textur für Weltkarte und Globus
   Quadratische Mercator-Textur (N × N, Breiten bis ±85°), aus dem groben Landraster abgeleitet:
   weiche Küsten, Klimazonen, Wüsten, Wälder, Gebirge, Eis und Meerestiefe. */
'use strict';
(function (S) {
  const Sat = S.Sat = { N: 1024, cv: null, data: null };

  /** Textur bauen (einmalig, etwa eine halbe Sekunde) */
  Sat.build = function () {
    if (Sat.cv) return Sat.cv;
    const W = S.World;
    W.ensureCoarse();
    const N = Sat.N, co = W.coarse;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N), d = img.data;
    const nz = S.makeNoise(97), nm = S.makeNoise(131), nr = S.makeNoise(173);
    const land = (lon, lat) => {
      // Landanteil bilinear aus dem 0,5°-Raster: weiche Küsten statt Treppen
      const fx = (lon + 180) / 0.5 - 0.5, fy = (85 - lat) / 0.5 - 0.5;
      let i0 = Math.floor(fx), j0 = Math.floor(fy);
      const u = fx - i0, v = S.clamp(fy - j0, 0, 1);
      j0 = S.clamp(j0, 0, 338);
      const i1 = ((i0 + 1) % 720 + 720) % 720; i0 = (i0 % 720 + 720) % 720;
      const L = co.land;
      return (L[j0 * 720 + i0] * (1 - u) + L[j0 * 720 + i1] * u) * (1 - v) + (L[(j0 + 1) * 720 + i0] * (1 - u) + L[(j0 + 1) * 720 + i1] * u) * v;
    };
    for (let y = 0; y < N; y++) {
      const lat = W.invMercY(Math.PI - (y + 0.5) / N * 2 * Math.PI), alat = Math.abs(lat);
      const tb = S.clamp(1.0 - Math.pow(alat / 80, 1.6), 0, 1);
      const dry = 0.46 * Math.exp(-Math.pow((alat - 25) / 9, 2));
      // feucht: Tropen und die Westwindzone der mittleren Breiten
      const wet = 0.18 * Math.exp(-Math.pow(alat / 11, 2)) + 0.22 * Math.exp(-Math.pow((alat - 52) / 13, 2));
      for (let x = 0; x < N; x++) {
        const lon = (x + 0.5) / N * 360 - 180;
        const n = nz(x * 0.04, y * 0.04), n2 = nm(x * 0.13, y * 0.13), n3 = nr(x * 0.02, y * 0.02);
        // Küste leicht verwirbelt
        const l = land(lon + (n2 - 0.5) * 0.5, lat + (n - 0.5) * 0.4) + (n2 - 0.5) * 0.12;
        let r, g, b;
        if (l < 0.5 || alat >= 85) {
          const dep = S.clamp(W.distLandKm(lon, lat) / 320, 0, 1), sh = 1 - Math.pow(1 - dep, 2);
          r = 52 - 38 * sh + (n - 0.5) * 6; g = 110 - 64 * sh + (n - 0.5) * 8; b = 128 - 46 * sh + (n - 0.5) * 8;
          if (l > 0.38) { const k = (l - 0.38) / 0.12; r += 34 * k; g += 30 * k; b += 12 * k; }   // Flachwasser an der Küste
          if (alat > 70) {
            // Packeis: zusammenhängende Schollen, zum Pol hin geschlossen
            const k = S.clamp((alat - 70) / 6 + (n - 0.5) * 1.6 + (n3 - 0.5) * 0.8, 0, 1);
            r += (226 - r) * k; g += (233 - g) * k; b += (239 - b) * k;
          }
        } else {
          const dsk = W.distSeaKm(lon, lat);
          const m = S.clamp(0.28 + n * 0.5 - dry + wet + Math.max(0, 1 - dsk / 500) * 0.18 - Math.min(1, dsk / 1800) * 0.2, 0, 1);
          // Hügelland als Schattierung, ohne erfundene Schneegrate
          const ridge = Math.pow(1 - Math.abs(n3 * 2 - 1), 3) * 0.5;
          const e = 0.12 + Math.min(1, dsk / 400) * 0.12;
          const col = S.BIOME_RGB[S.biomeOf(e, m, tb, m > 0.52 && tb > 0.2 ? 1 : 0, 0)];
          r = col[0]; g = col[1]; b = col[2];
          const k = (n2 - 0.5) * 10 + (n - 0.5) * 14;   // Fleckigkeit wie im Luftbild
          r += k * 0.8; g += k; b += k * 0.6;
          const sh = (nr(x * 0.02 + 0.6, y * 0.02 + 0.6) - n3) * 160 * ridge;   // Relief der Gebirge
          r += sh; g += sh; b += sh * 0.9;
          if (alat > 64) { const q = S.clamp((alat - 66) / 10 + (n - 0.5) * 0.8, 0, 1); r += (236 - r) * q; g += (240 - g) * q; b += (244 - b) * q; }
          if (l < 0.56) { const q = (0.56 - l) / 0.06; r += (200 - r) * q * 0.3; g += (190 - g) * q * 0.3; b += (150 - b) * q * 0.3; } // Strand
        }
        const o = (y * N + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    blurLand(d, N);
    // feines Korn nach dem Weichzeichnen
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4, k = (S.hash2(x, y, 911) - 0.5) * 7;
      d[o] += k; d[o + 1] += k; d[o + 2] += k;
    }
    ctx.putImageData(img, 0, 0);
    Sat.cv = cv; Sat.data = d;
    return cv;
  };
  /** Landflächen weichzeichnen (Wasser bleibt scharf): Zonen gehen ineinander über wie im Luftbild */
  function blurLand(d, N) {
    const isLand = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) { const o = i * 4; isLand[i] = d[o + 2] < d[o + 1] + 8 || d[o] > 120 ? 1 : 0; }
    const tmp = new Float32Array(N * N * 3), R = 3;
    for (let pass = 0; pass < 2; pass++) {
      const horiz = pass === 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (!isLand[i]) { tmp[i * 3] = d[i * 4]; tmp[i * 3 + 1] = d[i * 4 + 1]; tmp[i * 3 + 2] = d[i * 4 + 2]; continue; }
        let r = 0, g = 0, b = 0, n = 0;
        for (let k = -R; k <= R; k++) {
          const xx = horiz ? (x + k + N) % N : x, yy = horiz ? y : Math.max(0, Math.min(N - 1, y + k));
          const j = yy * N + xx;
          if (!isLand[j]) continue;
          r += d[j * 4]; g += d[j * 4 + 1]; b += d[j * 4 + 2]; n++;
        }
        tmp[i * 3] = r / n; tmp[i * 3 + 1] = g / n; tmp[i * 3 + 2] = b / n;
      }
      for (let i = 0; i < N * N; i++) { d[i * 4] = tmp[i * 3]; d[i * 4 + 1] = tmp[i * 3 + 1]; d[i * 4 + 2] = tmp[i * 3 + 2]; }
    }
  }

  /** fertige Textur oder null (dann wird sie im Hintergrund gebaut) */
  Sat.get = function () {
    if (Sat.data) return Sat;
    if (!Sat._pending) { Sat._pending = true; setTimeout(() => { Sat.build(); }, 50); }
    return null;
  };
})(S);
