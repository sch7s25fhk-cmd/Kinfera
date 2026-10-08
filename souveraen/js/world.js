/* Souverän – die ganze Welt als ein Feldraster (Mercator-Projektion)
   Jedes Feld der Erde ist eine reine Funktion seiner globalen Koordinaten: Gelände, Klima, Wald,
   Rohstoffe und Landeszugehörigkeit sehen deshalb überall gleich aus, egal wann und in welchem
   Ausschnitt sie berechnet werden. Das eigene Land ist ein Fenster in diese Welt, das zusätzlich
   simuliert und bebaut wird. Über die Landeszugehörigkeit (owner) lassen sich später Gebiete erobern. */
'use strict';
(function (S) {
  const D2R = Math.PI / 180;
  const Wd = S.World = {};

  // ---------------- Projektion ----------------
  Wd.mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + S.clamp(lat, -85.05, 85.05) * D2R / 2));
  Wd.invMercY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / D2R;
  Wd.gxOf = (lon) => (lon + 180) / 360 * Wd.WT;
  Wd.gyOf = (lat) => (Math.PI - Wd.mercY(lat)) / (2 * Math.PI) * Wd.WT;
  Wd.lonOfGx = (gx) => { let l = gx / Wd.WT * 360 - 180; l = ((l + 180) % 360 + 360) % 360 - 180; return l; };
  Wd.latOfGy = (gy) => Wd.invMercY(Math.PI - gy / Wd.WT * 2 * Math.PI);
  Wd.wrapGx = (gx) => ((gx % Wd.WT) + Wd.WT) % Wd.WT;
  Wd.kmPerTile = (lat) => 40075 * Math.cos(lat * D2R) / Wd.WT;

  /** Weltparameter für ein Spiel: WT = Felder rund um den Äquator */
  Wd.setup = function (p) {
    Wd.WT = p.WT; Wd.seed = p.seed; Wd.sc = p.sc; Wd.home = p.home;
    const s = p.seed;
    Wd.nE = S.makeNoise(s + 11); Wd.nR = S.makeNoise(s + 23); Wd.nM = S.makeNoise(s + 37); Wd.nX = S.makeNoise(s + 51);
    Wd.nL = S.makeNoise(s + 71); Wd.nRes = S.makeNoise(s + 91); Wd.nF = S.makeNoise(s + 101);
    ensureCoarse();
    Wd.countryIndex = {};
    S.WORLD.forEach((c, i) => { Wd.countryIndex[c.id] = i + 1; });
    Wd.homeIdx = Wd.countryIndex[p.home] || 0;
    buildCityTable();
  };

  // ---------------- Grobes Weltraster (0,5°) für Küstenabstände ----------------
  const CR = 0.5, CW = 720, CHh = 340; // Breiten 85 … -85
  function ensureCoarse() {
    if (Wd.coarse) return;
    const land = new Uint8Array(CW * CHh);
    for (const c of S.WORLD) {
      for (const r of c.r) {
        const pts = S.decodeRing(r);
        // Scanline auf Zellmitten
        for (let j = 0; j < CHh; j++) {
          const lat = 85 - (j + 0.5) * CR;
          const xs = [];
          for (let i = 0, k = pts.length - 1; i < pts.length; k = i++) {
            const [xa, ya] = pts[k], [xb, yb] = pts[i];
            if ((ya > lat) !== (yb > lat)) xs.push(xa + (lat - ya) / (yb - ya) * (xb - xa));
          }
          if (xs.length < 2) continue;
          xs.sort((a, b) => a - b);
          for (let q = 0; q + 1 < xs.length; q += 2) {
            const i0 = Math.max(0, Math.ceil((xs[q] + 180) / CR - 0.5)), i1 = Math.min(CW - 1, Math.floor((xs[q + 1] + 180) / CR - 0.5));
            for (let i = i0; i <= i1; i++) land[j * CW + i] = 1;
          }
        }
        // kleine Inseln: jede Ecke markiert ihre Zelle
        for (const [lon, lat] of pts) {
          const i = Math.min(CW - 1, Math.max(0, Math.floor((lon + 180) / CR))), j = Math.min(CHh - 1, Math.max(0, Math.floor((85 - lat) / CR)));
          land[j * CW + i] = 1;
        }
      }
    }
    const dist = (isSrc) => {
      const d = new Float32Array(CW * CHh);
      for (let i = 0; i < d.length; i++) d[i] = isSrc(i) ? 0 : 1e7;
      const cellH = CR * 111;
      // Chamfer-Abstandstransformation, horizontal mit Breitenkorrektur und Umlauf in Länge
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < CHh; j++) {
          const cw = Math.max(5, cellH * Math.cos((85 - (j + 0.5) * CR) * D2R)), dg = Math.hypot(cw, cellH);
          for (let i = 0; i < CW; i++) {
            const id = j * CW + i;
            let v = d[id];
            const l = j * CW + (i + CW - 1) % CW;
            v = Math.min(v, d[l] + cw);
            if (j > 0) { v = Math.min(v, d[id - CW] + cellH, d[(j - 1) * CW + (i + CW - 1) % CW] + dg, d[(j - 1) * CW + (i + 1) % CW] + dg); }
            d[id] = v;
          }
        }
        for (let j = CHh - 1; j >= 0; j--) {
          const cw = Math.max(5, cellH * Math.cos((85 - (j + 0.5) * CR) * D2R)), dg = Math.hypot(cw, cellH);
          for (let i = CW - 1; i >= 0; i--) {
            const id = j * CW + i;
            let v = d[id];
            v = Math.min(v, d[j * CW + (i + 1) % CW] + cw);
            if (j < CHh - 1) { v = Math.min(v, d[id + CW] + cellH, d[(j + 1) * CW + (i + 1) % CW] + dg, d[(j + 1) * CW + (i + CW - 1) % CW] + dg); }
            d[id] = v;
          }
        }
      }
      return d;
    };
    Wd.coarse = { land, dSea: dist(i => !land[i]), dLand: dist(i => land[i] === 1) };
  }
  function sampleCoarse(arr, lon, lat) {
    const fx = (lon + 180) / CR - 0.5, fy = (85 - lat) / CR - 0.5;
    let i0 = Math.floor(fx), j0 = Math.floor(fy);
    const u = fx - i0, v = S.clamp(fy - j0, 0, 1);
    j0 = S.clamp(j0, 0, CHh - 2);
    const i1 = (i0 + 1 + CW) % CW; i0 = (i0 + CW) % CW;
    const a = arr[j0 * CW + i0], b = arr[j0 * CW + i1], c = arr[(j0 + 1) * CW + i0], d = arr[(j0 + 1) * CW + i1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  Wd.distSeaKm = (lon, lat) => sampleCoarse(Wd.coarse.dSea, lon, lat);
  Wd.distLandKm = (lon, lat) => sampleCoarse(Wd.coarse.dLand, lon, lat);

  // ---------------- Landeszugehörigkeit pro Feld ----------------
  function countryBoxes() {
    if (Wd._boxes) return Wd._boxes;
    Wd._boxes = S.WORLD.map((c, ci) => ({
      ci, rings: c.r.map(r => { const p = S.decodeRing(r); return { p, box: S.ringBox(p) }; }),
      box: c._box || (c._box = S.ringBox(c.r.flatMap(r => S.decodeRing(r))))
    }));
    return Wd._boxes;
  }

  /** Füllt owner (Index+1) für den Ausschnitt [gx0, gx0+w) × [gy0, gy0+h) */
  function rasterOwner(owner, gx0, gy0, w, h) {
    const lat0 = Wd.latOfGy(gy0 + h), lat1 = Wd.latOfGy(gy0);
    const lonSpan = w / Wd.WT * 360;
    const lonA = gx0 / Wd.WT * 360 - 180;
    const xs = [];
    for (const cb of countryBoxes()) {
      const b = cb.box;
      if (b.y1 < lat0 || b.y0 > lat1) continue;
      for (const shift of [-360, 0, 360]) {
        if (b.x1 + shift < lonA || b.x0 + shift > lonA + lonSpan) continue;
        for (const r of cb.rings) {
          const rb = r.box;
          if (rb.y1 < lat0 || rb.y0 > lat1 || rb.x1 + shift < lonA || rb.x0 + shift > lonA + lonSpan) continue;
          const pts = r.p, n = pts.length;
          for (let j = 0; j < h; j++) {
            const lat = Wd.latOfGy(gy0 + j + 0.5);
            if (lat < rb.y0 || lat > rb.y1) continue;
            xs.length = 0;
            for (let i = 0, k = n - 1; i < n; k = i++) {
              const [xa, ya] = pts[k], [xb, yb] = pts[i];
              if ((ya > lat) !== (yb > lat)) xs.push(xa + shift + (lat - ya) / (yb - ya) * (xb - xa));
            }
            if (xs.length < 2) continue;
            xs.sort((a, b2) => a - b2);
            for (let q = 0; q + 1 < xs.length; q += 2) {
              let i0 = Math.ceil(Wd.gxOf(xs[q]) - gx0 - 0.5), i1 = Math.floor(Wd.gxOf(xs[q + 1]) - gx0 - 0.5);
              if (i0 < 0) i0 = 0; if (i1 >= w) i1 = w - 1;
              for (let i = i0; i <= i1; i++) owner[j * w + i] = cb.ci + 1;
            }
          }
        }
      }
    }
  }

  // ---------------- Gelände eines Ausschnitts ----------------
  /** Liefert G.t-kompatible Arrays (plus owner) für einen beliebigen Weltausschnitt */
  Wd.tileBlock = function (gx0, gy0, w, h) {
    const P = 2, ww = w + 2 * P, hh = h + 2 * P;
    const own = new Uint16Array(ww * hh);
    rasterOwner(own, gx0 - P, gy0 - P, ww, hh);
    const t = S.newTiles(w * h);
    t.owner = new Uint16Array(w * h);
    const sc = Wd.sc, seed = Wd.seed;
    const nE = Wd.nE, nR = Wd.nR, nX = Wd.nX, nL = Wd.nL, nM = Wd.nM, nF = Wd.nF, nRes = Wd.nRes;
    for (let j = 0; j < h; j++) {
      const gy = gy0 + j;
      const lat = Wd.latOfGy(gy + 0.5), alat = Math.abs(lat);
      const tb = S.clamp(1.0 - Math.pow(alat / 80, 1.6), 0, 1);
      const dry = 0.46 * Math.exp(-Math.pow((alat - 25) / 9, 2));
      const wet = 0.18 * Math.exp(-Math.pow(alat / 11, 2));
      for (let i = 0; i < w; i++) {
        const gxu = gx0 + i, gx = Wd.wrapGx(gxu);
        const id = j * w + i;
        const o = own[(j + P) * ww + i + P];
        t.owner[id] = o;
        t.region[id] = o === 0 ? 0 : o === Wd.homeIdx ? 1 : 2;
        const lon = Wd.lonOfGx(gx + 0.5);
        // Nachbarschaft im feinen Raster (Küste)
        let seaN = 0, landN = 0;
        for (let oy = -P; oy <= P; oy++) for (let ox = -P; ox <= P; ox++) {
          const v = own[(j + P + oy) * ww + i + P + ox];
          if (v) landN++; else if (Math.abs(ox) <= 1 && Math.abs(oy) <= 1) seaN++;
        }
        const base = S.fbm(nE, gx * sc, gy * sc, 5);
        let e;
        if (o) {
          const ridge = 1 - Math.abs(S.fbm(nR, gx * sc * 0.9 + 40, gy * sc * 0.9, 4) * 2 - 1);
          const mzone = S.clamp((S.fbm(nX, gx * sc * 0.45, gy * sc * 0.45, 2) - 0.54) * 3.2, 0, 1);
          const dsk = Wd.distSeaKm(lon, lat);
          e = 0.03 + (base - 0.38) * 0.7 + Math.pow(ridge, 3) * mzone * 0.95 + Math.min(1, dsk / 400) * 0.12;
          e = Math.max(seaN ? 0.02 : 0.05, e);
          if (!seaN && dsk > 30 && landN >= 24 && S.fbm(nL, gx * sc * 1.6 + 7, gy * sc * 1.6, 3) < 0.24) e = -0.06;
          e = Math.min(1.25, e);
        } else {
          e = -0.03 - Math.min(1, Wd.distLandKm(lon, lat) / 140) * 0.4 + (base - 0.5) * 0.08;
          if (landN) e = Math.max(e, -0.045);
        }
        t.elev[id] = e;
        t.temp[id] = S.clamp(tb + (S.hash2(gx, gy, seed) - 0.5) * 0.02, 0, 1);
        const dsk = o ? Wd.distSeaKm(lon, lat) : 0;
        const coast = Math.max(0, 1 - dsk / 500) * 0.18;
        const cont = Math.min(1, dsk / 1600) * 0.22;
        t.moist[id] = S.clamp(0.25 + S.fbm(nM, gx * sc * 1.2, gy * sc * 1.2, 4) * 0.55 - dry + wet + coast - cont, 0, 1);
        if (o && e >= 0) {
          const tt = t.temp[id] - Math.max(0, e - 0.4) * 0.5;
          const f = S.fbm(nF, gx * sc * 2, gy * sc * 2, 3) + t.moist[id] * 0.55 - 0.35;
          if (e < S.MOUNTAIN_E && tt > 0.12 && t.moist[id] > 0.45 && f > 0.57) t.forest[id] = 1;
          const rn = S.fbm(nRes, gx * sc * 3, gy * sc * 3, 2), hh2 = S.hash2(gx, gy, seed + 5);
          if (e > 0.5 && rn > 0.62 && hh2 < 0.35) t.res[id] = S.RES.ORE;
          else if (e > 0.15 && e < 0.6 && rn < 0.3 && hh2 < 0.18) t.res[id] = S.RES.COAL;
          else if (e < 0.4 && S.fbm(nRes, gx * sc * 2 + 50, gy * sc * 2 - 30, 2) > 0.68 && hh2 < 0.3 && t.moist[id] < 0.55) t.res[id] = S.RES.OIL;
        }
        t.biome[id] = S.biomeOf(e, t.moist[id], t.temp[id], t.forest[id], 0);
      }
    }
    return t;
  };

  // ---------------- Städte der Welt (fremde Länder) ----------------
  function buildCityTable() {
    const list = [];
    S.WORLD.forEach((c, ci) => {
      for (const p of (c.pl || [])) {
        const gx = Wd.wrapGx(Wd.gxOf(p[1])), gy = Wd.gyOf(p[2]);
        const tiles = S.clamp(3 + Math.sqrt(p[3] / 50000) * 1.2, 3, 30);
        const lat = p[2];
        const hot = Math.abs(lat) > 10 && Math.abs(lat) < 38;
        const style = p[3] > 6e6 ? 'modern' : p[3] > 3e6 && c.inc <= 3 ? 'modern' : hot ? 'mediterran' : 'historisch';
        list.push({ name: p[0], ci: ci + 1, cid: c.id, gx, gy, pop: p[3], capital: !!p[4], r: Math.sqrt(tiles / Math.PI) + 0.4, style, maxLvl: S.STYLES[style].maxLvl });
      }
    });
    Wd.cities = list;
    Wd.cityGrid = new Map();
    for (const c of list) {
      const k = Math.floor(c.gx / 32) + ',' + Math.floor(c.gy / 32);
      if (!Wd.cityGrid.has(k)) Wd.cityGrid.set(k, []);
      Wd.cityGrid.get(k).push(c);
    }
  }

  /** Fremde Städte in der Nähe eines Ausschnitts */
  Wd.citiesNear = function (gx0, gy0, w, h) {
    const out = [];
    const WT32 = Math.ceil(Wd.WT / 32);
    for (let cy = Math.floor((gy0 - 8) / 32); cy <= Math.floor((gy0 + h + 8) / 32); cy++) {
      for (let cxu = Math.floor((gx0 - 8) / 32); cxu <= Math.floor((gx0 + w + 8) / 32); cxu++) {
        const cx = ((cxu % WT32) + WT32) % WT32;
        const l = Wd.cityGrid.get(cx + ',' + cy);
        if (!l) continue;
        const shift = (cxu - cx) * 32;
        for (const c of l) out.push({ c, gx: c.gx + shift, gy: c.gy });
      }
    }
    return out;
  };

  /** Stadtfeld einer fremden Stadt (reine Funktion): null oder { type, lvl, city } */
  Wd.urbanAt = function (near, gx, gy, owner) {
    for (const { c, gx: cgx, gy: cgy } of near) {
      if (c.ci !== owner) continue;
      const dx = gx + 0.5 - cgx, dy = gy + 0.5 - cgy;
      if (Math.abs(dx) > c.r + 1.5 || Math.abs(dy) > c.r + 1.5) continue;
      const wg = Wd.wrapGx(gx);
      const d = Math.hypot(dx, dy) + (S.hash2(wg, gy, 401) - 0.5) * 0.9;
      if (d > c.r) continue;
      const hx = Math.floor(cgx), hy = Math.floor(cgy);
      if (gx === hx && gy === hy) return { type: S.U.HALL, lvl: 1, city: c };
      if (d < c.r * 0.92 && ((((gx - hx) % 4) + 4) % 4 === 0 || (((gy - hy) % 4) + 4) % 4 === 0)) return { road: true, city: c };
      const size = S.clamp(c.r / 3, 0.3, 1);
      const lvl = S.clamp(1 + Math.round((c.maxLvl - 1) * Math.max(0, 1 - d / c.r) * size + S.hash2(wg, gy, 402) * 0.6), 1, c.maxLvl);
      const hsh = S.hash2(wg, gy, 403);
      const type = d < c.r * 0.45 && hsh < 0.4 ? S.U.C : d > c.r * 0.6 && hsh < 0.15 ? S.U.I : S.U.R;
      return { type, lvl: type === S.U.I ? Math.min(3, lvl) : lvl, city: c };
    }
    return null;
  };

  /** Land unter einem globalen Feld (für Infos und später fürs Militär) */
  Wd.ownerAt = function (gx, gy) {
    const o = new Uint16Array(1);
    rasterOwner(o, Math.floor(gx), Math.floor(gy), 1, 1);
    return o[0];
  };
})(S);
