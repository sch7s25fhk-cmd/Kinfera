/* Souverän – Kartendarstellung: Gelände, Städte, Gebäude, Überlagerungen */
'use strict';
(function (S) {
  const B = S.B, U = S.U;
  const TS = S.TS = 24;   // Pixel pro Kachel im Zwischenspeicher
  const PX = S.PX = 4;    // Geländepixel pro Kachel (wird weich hochskaliert)
  const R = S.R = { cam: { x: 0, y: 0, z: 1 }, dpr: 1, view: 'none', anim: 0, hover: null, preview: null, sel: null };

  // ---------------- Initialisierung ----------------
  // Alle Weltpixel-Koordinaten (cam.x/cam.y) zählen ab der linken oberen Ecke des eigenen Landesrasters.
  // Globale Feldkoordinate = lokale Feldkoordinate + G.gx0 / G.gy0.
  const CH = 16;          // Felder pro Detailblock
  const OCH = 64;         // Felder pro Übersichtsblock
  const BP = 3;           // Rand eines Detailblocks in Feldern
  const CM = 2;           // Rand in Pixeln, damit Blöcke nahtlos aneinanderstoßen
  const PIX_BUDGET = 26e6;
  const World = S.World;

  R.init = function (G, canvas) {
    R.G = G;
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.noiseA = S.makeNoise(G.meta.seed + 501);
    R.noiseB = S.makeNoise(G.meta.seed + 502);
    R.dirty = null;
    R.dirtyG = [];
    R.lastZ = 0; R.zoomingUntil = 0;
    R.chunks = new Map();     // Detailblöcke (gezeichnet)
    R.ochunks = new Map();    // Übersichtsblöcke
    R.bases = new Map();      // reine Weltdaten je Block (unveränderlich)
    R.pix = 0;
    R.frame = 0;
    R.stats = { renders: 0, ms: 0 };
    R.viewCv = document.createElement('canvas');
    R.viewCv.width = G.W; R.viewCv.height = G.H;
    R.viewKey = null;
    if (!R.globe) {
      R.globe = S.makeGlobe({ noIdle: true, noInput: true, cy: 0.5, maxZoom: 1e9, maxDpr: 2 });
      R.globe.init(canvas, () => {});
    }
    R.globe.sel = R.globe.itemById(G.meta.id) || null;
    R.resize();
  };

  R.resize = function () {
    const c = R.canvas;
    R.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * R.dpr));
    c.height = Math.max(1, Math.round(r.height * R.dpr));
    R.cw = r.width; R.ch = r.height;
    if (R.globe) R.globe.resize();
  };

  /** Geänderte Felder sammeln (einzelne Rechtecke, damit Wachstum hier nicht das ganze Land neu zeichnen lässt) */
  R.markDirty = function (x0, y0, x1, y1) {
    const d = R.dirty || (R.dirty = []);
    for (const r of d) {
      // überlappende oder benachbarte Rechtecke zusammenfassen
      if (x0 <= r[2] + 4 && x1 >= r[0] - 4 && y0 <= r[3] + 4 && y1 >= r[1] - 4) {
        r[0] = Math.min(r[0], x0); r[1] = Math.min(r[1], y0); r[2] = Math.max(r[2], x1); r[3] = Math.max(r[3], y1);
        R.viewKey = null;
        return;
      }
    }
    if (d.length >= 48) {
      const r = d[d.length - 1];
      r[0] = Math.min(r[0], x0); r[1] = Math.min(r[1], y0); r[2] = Math.max(r[2], x1); r[3] = Math.max(r[3], y1);
    } else d.push([x0, y0, x1, y1]);
    R.viewKey = null;
  };
  /** Geänderter Besitz irgendwo auf der Welt (Eroberung) */
  R.markDirtyGlobal = function (gx, gy) {
    (R.dirtyG || (R.dirtyG = [])).push(gx, gy);
    R.occVer = (R.occVer || 0) + 1;
  };
  function flushGlobal() {
    const d = R.dirtyG;
    if (!d || !d.length) return;
    R.dirtyG = [];
    const WT = World.WT;
    const touch = (map, size) => {
      for (const e of map.values()) {
        if (e.stale) continue;
        for (let i = 0; i < d.length; i += 2) {
          let dx = d[i] - e.cx * size; dx = ((dx + WT / 2) % WT + WT) % WT - WT / 2;
          const dy = d[i + 1] - e.cy * size;
          if (dx >= -BP - 1 && dx <= size + BP && dy >= -BP - 1 && dy <= size + BP) { e.stale = true; break; }
        }
      }
    };
    touch(R.chunks, CH); touch(R.ochunks, OCH);
  }

  /** Geänderte Felder des eigenen Landes: betroffene Blöcke als veraltet markieren */
  R.flush = function () {
    flushGlobal();
    if (!R.dirty) return;
    const G = R.G, WT = World.WT;
    const rects = R.dirty.map(([x0, y0, x1, y1]) => [x0 + G.gx0 - 2, y0 + G.gy0 - 4, x1 + G.gx0 + 2, y1 + G.gy0 + 2]);
    R.dirty = null;
    const hit = (e, size) => {
      for (const [gx0, gy0, gx1, gy1] of rects) for (const k of [-WT, 0, WT]) {
        const ex0 = e.cx * size + k, ey0 = e.cy * size;
        if (ex0 <= gx1 + BP && ex0 + size >= gx0 - BP && ey0 <= gy1 + BP && ey0 + size >= gy0 - BP) return true;
      }
      return false;
    };
    for (const e of R.chunks.values()) if (!e.stale && hit(e, CH)) e.stale = true;
    for (const e of R.ochunks.values()) if (!e.stale && hit(e, OCH)) e.stale = true;
  };

  /** Das eigene Raster ist gewachsen (erobertes Land): Kamera mitschieben, alles neu zeichnen */
  R.gridGrown = function (dx, dy) {
    const G = R.G;
    if (!G) return;
    R.cam.x += dx * TS; R.cam.y += dy * TS;
    const a = R.zoomAnim;
    if (a) for (const k of ['wx', 'x0', 'x1']) if (a[k] !== undefined) a[k] += dx * TS;
    if (a) for (const k of ['wy', 'y0', 'y1']) if (a[k] !== undefined) a[k] += dy * TS;
    if (R.sel) { R.sel[0] += dx; R.sel[1] += dy; }
    R.hover = null;
    R.viewCv.width = G.W; R.viewCv.height = G.H;
    R.viewKey = null;
    for (const e of R.chunks.values()) e.stale = true;
    for (const e of R.ochunks.values()) e.stale = true;
  };

  // ---------------- Kamera-Umrechnungen ----------------
  R.camGX = () => R.cam.x / TS + R.G.gx0;
  R.camGY = () => R.cam.y / TS + R.G.gy0;
  R.camLat = () => World.latOfGy(R.camGY());
  R.camLon = () => World.lonOfGx(R.camGX());
  /** Radius, den der Globus bei dieser Kamera hätte (CSS-Pixel) */
  R.globeR = (z) => (z || R.cam.z) * TS * World.WT / (2 * Math.PI) / Math.cos(R.camLat() * Math.PI / 180);
  const md = () => Math.min(R.cw, R.ch);
  R.zForGlobeR = (gr) => gr * 2 * Math.PI * Math.cos(R.camLat() * Math.PI / 180) / (TS * World.WT);
  R.GLOBE_FULL = 1.35; R.GLOBE_FLAT = 2.2;   // Übergang Globus → Karte (Radius / Bildschirm)

  // ---------------- Weltdaten eines Blocks ----------------
  const wrapC = (c, n) => ((c % n) + n) % n;
  function baseFor(kind, cx, cy, size, pad) {
    const key = kind + cx + ',' + cy;
    let b = R.bases.get(key);
    if (b) { b.used = R.frame; return b; }
    b = { t: World.tileBlock(cx * size - pad, cy * size - pad, size + 2 * pad, size + 2 * pad), used: R.frame };
    R.bases.set(key, b);
    if (R.bases.size > 260) {
      const list = [...R.bases.entries()].sort((a, c2) => a[1].used - c2[1].used);
      for (let i = 0; i < 60; i++) R.bases.delete(list[i][0]);
    }
    return b;
  }

  /** Feldblock (wie G aufgebaut) aus Weltdaten + eigenem Land + fremden Städten */
  function makeBlock(kind, cx, cy, size, pad) {
    const G = R.G, WT = World.WT;
    const base = baseFor(kind, cx, cy, size, pad).t;
    const W = size + 2 * pad, H = W, N = W * H;
    const t = {};
    for (const k in base) t[k] = base[k].slice();
    const gx0 = cx * size - pad, gy0 = cy * size - pad;
    // Lage relativ zum eigenen Raster (Umlauf in Länge beachten)
    let ox = gx0 - G.gx0;
    while (ox < -WT / 2) ox += WT; while (ox > WT / 2) ox -= WT;
    const oy = gy0 - G.gy0;
    const cities = G.cities.map(c => ({ style: c.style, x: c.x - ox, y: c.y - oy, name: c.name }));
    const nHome = cities.length;
    const near = World.citiesNear(gx0, gy0, W, H).filter(n => n.c.cid !== G.meta.id);
    const foreignIdx = new Map();
    const GT = G.t;
    const occ = G.mil ? G.mil.occ : null;
    const homeIdx = World.homeIdx, WTw = World.WT;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const id = j * W + i;
      const lx = i + ox, ly = j + oy;
      const bo = base.owner[id]; // ursprüngliches Land (für die Stadtform)
      if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H) {
        const gi = ly * G.W + lx;
        for (const k in t) if (GT[k]) t[k][id] = GT[k][gi];
        if (t.bld[id] || t.road[id]) continue;
      } else if (occ) {
        const v = occ[(((gx0 + i) % WTw) + WTw) % WTw + ',' + (gy0 + j)];
        if (v !== undefined) { t.owner[id] = v; t.region[id] = v === 0 ? 0 : v === homeIdx ? 1 : 2; }
      }
      if (!bo || bo === homeIdx || t.elev[id] < 0) continue;
      const u = World.urbanAt(near, gx0 + i, gy0 + j, bo);
      if (!u) continue;
      let ci = foreignIdx.get(u.city);
      if (ci === undefined) { ci = cities.length; foreignIdx.set(u.city, ci); cities.push({ style: u.city.style, x: Math.floor(u.city.gx) - gx0, y: Math.floor(u.city.gy) - gy0, name: u.city.name, foreign: true }); }
      t.forest[id] = 0;
      if (u.road) { t.road[id] = 1; t.city[id] = ci + 1; }
      else { t.bld[id] = u.type; t.lvl[id] = u.lvl; t.city[id] = ci + 1; }
    }
    return { W, H, t, cities, nHome, meta: G.meta, gx0, gy0, ox, oy, pad };
  }

  // ---------------- Gelände als Pixelbild eines Blocks ----------------
  function terrainImage(Bk, PX) {
    const { W, H, t } = Bk;
    const cv = document.createElement('canvas');
    cv.width = W * PX; cv.height = H * PX;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W * PX, H * PX);
    const data = img.data, IW = W * PX;
    const E = t.elev, M = t.moist, T = t.temp, F = t.forest, IR = t.irrig;
    const nA = R.noiseA, nB = R.noiseB, seed = Bk.meta.seed;
    const gpx = World.wrapGx(Bk.gx0) * PX, gpy = Bk.gy0 * PX;
    for (let py = 0; py < H * PX; py++) {
      const fy = (py + 0.5) / PX - 0.5;
      let j0 = Math.floor(fy); let v = fy - j0;
      if (j0 < 0) { j0 = 0; v = 0; } else if (j0 > H - 2) { j0 = H - 2; v = 1; }
      for (let px = 0; px < W * PX; px++) {
        const fx = (px + 0.5) / PX - 0.5;
        let i0 = Math.floor(fx); let u = fx - i0;
        if (i0 < 0) { i0 = 0; u = 0; } else if (i0 > W - 2) { i0 = W - 2; u = 1; }
        const a = j0 * W + i0, b = a + 1, c = a + W, d = c + 1;
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
        const qx = gpx + px, qy = gpy + py;
        const n1 = nA(qx * 1.32 / PX, qy * 1.32 / PX), n2 = nB(qx * 0.68 / PX, qy * 0.68 / PX);
        const grain = S.hash2(qx, qy, seed) - 0.5;
        const e = E[a] * w00 + E[b] * w10 + E[c] * w01 + E[d] * w11 + (n1 - 0.5) * 0.03;
        const m = M[a] * w00 + M[b] * w10 + M[c] * w01 + M[d] * w11 + (n2 - 0.5) * 0.12;
        const tt = T[a] * w00 + T[b] * w10 + T[c] * w01 + T[d] * w11;
        const f = F[a] * w00 + F[b] * w10 + F[c] * w01 + F[d] * w11 + (n1 - 0.5) * 0.7;
        const ir = IR[a] * w00 + IR[b] * w10 + IR[c] * w01 + IR[d] * w11 + (n2 - 0.5) * 0.4;
        const col = landColor(e, m, tt, f, ir, (1 - v) * (E[b] - E[a]) + v * (E[d] - E[c]), (1 - u) * (E[c] - E[a]) + u * (E[d] - E[b]), grain);
        const o = (py * IW + px) * 4;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  const _col = [0, 0, 0];
  function landColor(e, m, tt, f, ir, dx, dy, grain) {
    let r, g, bl;
    if (e < 0) {
      const dep = S.clamp(-e / 0.4, 0, 1);
      r = 70 - 48 * dep; g = 146 - 84 * dep; bl = 182 - 74 * dep;
      if (e > -0.025) { r += 30; g += 26; bl += 14; }
      r += grain * 4; g += grain * 4; bl += grain * 5;
    } else {
      const bio = S.biomeOf(e, m, tt, f > 0.5 ? 1 : 0, ir > 0.5 ? 1 : 0);
      const col = S.BIOME_RGB[bio];
      r = col[0]; g = col[1]; bl = col[2];
      if (bio === B.GRASS || bio === B.STEPPE || bio === B.SAVANNA) {
        const lush = S.clamp((m - 0.35) * 1.6, -0.4, 0.5);
        r -= lush * 26; g += lush * 10; bl -= lush * 12;
      }
      if (bio === B.MOUNTAIN && e > 1.0) { r = 236; g = 240; bl = 244; }
      const sh = S.clamp((dx + dy) * 150, -38, 38) + (e > 0.3 ? (e - 0.3) * 18 : 0);
      r += sh; g += sh; bl += sh * 0.9;
      r += grain * 9; g += grain * 9; bl += grain * 7;
    }
    _col[0] = r; _col[1] = g; _col[2] = bl;
    return _col;
  }

  // ---------------- Grenzen (zwischen Ländern, das eigene in Gold) ----------------
  function drawBorders(c, Bk, x0, y0, x1, y1, scale, home) {
    const { W, t } = Bk;
    const homeIdx = World.homeIdx;
    const segs = [[], []];
    for (let y = Math.max(0, y0); y <= Math.min(Bk.H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const o = t.owner[y * W + x];
      if (!o) continue;
      if (x + 1 < W) { const p = t.owner[y * W + x + 1]; if (p && p !== o) segs[(o === homeIdx || p === homeIdx) ? 1 : 0].push(x + 1, y, x + 1, y + 1); }
      if (y + 1 < Bk.H) { const p = t.owner[(y + 1) * W + x]; if (p && p !== o) segs[(o === homeIdx || p === homeIdx) ? 1 : 0].push(x, y + 1, x + 1, y + 1); }
    }
    const draw = (arr, col, w, dash) => {
      if (!arr.length) return;
      c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash);
      c.beginPath();
      for (let i = 0; i < arr.length; i += 4) { c.moveTo(arr[i] * scale, arr[i + 1] * scale); c.lineTo(arr[i + 2] * scale, arr[i + 3] * scale); }
      c.stroke(); c.setLineDash([]);
    };
    draw(segs[0], 'rgba(70,40,30,0.6)', home.w * 0.8, home.dash);
    draw(segs[1], 'rgba(232,178,58,0.95)', home.w, []);
  }

  // ---------------- Detailblock zeichnen ----------------
  function paintBlock(c, Bk) {
    const { W, H, pad } = Bk;
    const x0 = pad, y0 = pad, x1 = W - pad - 1, y1 = H - pad - 1;
    c.save();
    c.beginPath();
    c.rect((x0 - 1) * TS, (y0 - 1) * TS, (x1 - x0 + 3) * TS, (y1 - y0 + 3) * TS);
    c.clip();
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(Bk.terr, 0, 0, W * TS, H * TS);
    const gx0 = x0 - 2, gy0 = y0 - 2, gx1 = x1 + 2, gy1 = y1 + 2;
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) drawGround(c, Bk, x, y);
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) drawRoads(c, Bk, x, y);
    drawBorders(c, Bk, gx0, gy0, gx1, gy1, TS, { w: 3, dash: [7, 5] });
    const oy1 = Math.min(H - 1, y1 + 3);
    for (let y = gy0; y <= oy1; y++) for (let x = gx0; x <= gx1; x++) drawObject(c, Bk, x, y);
    c.restore();
  }

  /** Detailblock in Auflösung res (Pixel pro Weltpixel) zeichnen */
  function renderChunk(cx, cy, res, reuse) {
    const Bk = makeBlock('d', cx, cy, CH, BP);
    Bk.terr = terrainImage(Bk, S.PX);
    const w = Math.ceil(CH * TS * res) + CM * 2, h = w;
    const cv = reuse && reuse.width === w ? reuse : document.createElement('canvas');
    if (cv !== reuse) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(res, 0, 0, res, CM - BP * TS * res, CM - BP * TS * res);
    paintBlock(c, Bk);
    return { cv, w, h };
  }

  // ---------------- Übersichtsblock (weit herausgezoomt) ----------------
  const OVR = 8; // Pixel pro Feld
  const OV_URBAN = { 2: [143, 163, 182], 3: [138, 127, 116], 4: [232, 178, 58] };
  function renderOverview(cx, cy) {
    const P = 1;
    const Bk = makeBlock('o', cx, cy, OCH, P);
    const { W, H, t } = Bk;
    const small = terrainImage(Bk, 4);
    const size = OCH * OVR + CM * 2;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.setTransform(1, 0, 0, 1, CM - P * OVR, CM - P * OVR);
    c.drawImage(small, 0, 0, W * OVR, H * OVR);
    // Städte und Straßen scharf darüber
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = y * W + x, bl = t.bld[id];
      const city = Bk.cities[t.city[id] - 1];
      if (!bl) {
        // Stadtstraßen als Pflaster
        if (t.road[id] && city) { c.fillStyle = '#b9b2a6'; c.fillRect(x * OVR, y * OVR, OVR, OVR); }
        continue;
      }
      c.fillStyle = bl === S.U.R ? (city ? S.STYLES[city.style].roof : '#b5533a') : bl === S.U.HALL ? '#e8b23a' : bl === S.U.C ? '#8fa3b6' : bl === S.U.I ? '#8a7f74' : bl === 10 ? '#d8c25a' : '#5d5248';
      c.fillRect(x * OVR + 0.8, y * OVR + 0.8, OVR - 1.6, OVR - 1.6);
    }
    c.strokeStyle = '#6f6a62'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = y * W + x;
      if (!(t.road[id] & 1) || t.city[id] && !t.bld[id] && Bk.cities[t.city[id] - 1] && Bk.cities[t.city[id] - 1].foreign) continue;
      for (const [ox, oy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const nx = x + ox, ny = y + oy;
        if (nx >= W || ny < 0 || ny >= H || !(t.road[ny * W + nx] & 1)) continue;
        if (ox && oy && ((t.road[y * W + nx] & 1) || (t.road[ny * W + x] & 1))) continue;
        c.moveTo((x + 0.5) * OVR, (y + 0.5) * OVR); c.lineTo((nx + 0.5) * OVR, (ny + 0.5) * OVR);
      }
    }
    c.stroke();
    c.strokeStyle = '#3f86b8'; c.lineWidth = 2.4;
    c.beginPath();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = y * W + x;
      if (!t.river[id] || t.rdir[id] < 0) continue;
      const [ox, oy] = S.N4[t.rdir[id]];
      c.moveTo((x + 0.5) * OVR, (y + 0.5) * OVR); c.lineTo((x + ox + 0.5) * OVR, (y + oy + 0.5) * OVR);
    }
    c.stroke();
    drawBorders(c, Bk, 0, 0, W - 1, H - 1, OVR, { w: 2.4, dash: [7, 5] });
    return { cv, w: size, h: size };
  }
  const _hex = {};
  function hexRgb(h) { return _hex[h] || (_hex[h] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]); }

  function getChunk(map, key, make, allowRender) {
    let e = map.get(key);
    if (e && !e.stale) { e.used = R.frame; return e; }
    if (!allowRender) return null;
    const t0 = performance.now();
    const r = make(e && e.cv);
    R.stats.renders++; R.stats.ms += performance.now() - t0;
    if (!e) { e = {}; map.set(key, e); } else R.pix -= e.w * e.h;
    Object.assign(e, r, { stale: false, used: R.frame });
    R.pix += e.w * e.h;
    evict();
    return e;
  }
  function evict() {
    if (R.pix <= PIX_BUDGET) return;
    const all = [];
    for (const m of [R.chunks, R.ochunks]) for (const [k, e] of m) all.push([m, k, e]);
    all.sort((a, b) => a[2].used - b[2].used);
    for (const [m, k, e] of all) {
      // nur Blöcke verwerfen, die seit einigen Bildern nicht mehr gezeigt wurden
      if (R.pix <= PIX_BUDGET * 0.8 || e.used >= R.frame - 3) break;
      R.pix -= e.w * e.h;
      m.delete(k);
    }
  }

  // ---------------- Grobe Weltkarte (ganz weit draußen, flach) ----------------
  function worldTexture() {
    if (R.wtex) return R.wtex;
    const N = 1024;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(N, N), d = img.data;
    const co = World.coarse;
    const nz = S.makeNoise(97);
    for (let y = 0; y < N; y++) {
      const lat = World.invMercY(Math.PI - (y + 0.5) / N * 2 * Math.PI), alat = Math.abs(lat);
      const tb = S.clamp(1.0 - Math.pow(alat / 80, 1.6), 0, 1);
      const dry = 0.46 * Math.exp(-Math.pow((alat - 25) / 9, 2)), wet = 0.18 * Math.exp(-Math.pow(alat / 11, 2));
      for (let x = 0; x < N; x++) {
        const lon = (x + 0.5) / N * 360 - 180;
        const fx = (lon + 180) / 0.5 - 0.5, fy = (85 - lat) / 0.5 - 0.5;
        const i0 = Math.max(0, Math.min(719, Math.round(fx))), j0 = Math.max(0, Math.min(339, Math.round(fy)));
        const land = alat < 85 && co.land[j0 * 720 + i0];
        let r, g, b;
        const n = nz(x * 0.04, y * 0.04);
        if (!land) {
          const dep = S.clamp(World.distLandKm(lon, lat) / 300, 0, 1);
          r = 62 - 40 * dep; g = 134 - 72 * dep; b = 176 - 68 * dep;
        } else {
          const dsk = World.distSeaKm(lon, lat);
          const m = S.clamp(0.25 + n * 0.55 - dry + wet + Math.max(0, 1 - dsk / 500) * 0.18 - Math.min(1, dsk / 1600) * 0.22, 0, 1);
          const e = 0.12 + Math.min(1, dsk / 400) * 0.12;
          const col = S.BIOME_RGB[S.biomeOf(e, m, tb, m > 0.55 && tb > 0.2 ? 1 : 0, 0)];
          r = col[0]; g = col[1]; b = col[2];
        }
        const o = (y * N + x) * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    R.wtex = cv;
    return cv;
  }

  // ---------------- Politische Karte (Länderflächen, flach) ----------------
  function politicalPaths() {
    if (R.ppaths) return R.ppaths;
    const twoPi = 2 * Math.PI;
    R.ppaths = S.WORLD.map((c, i) => {
      const p = new Path2D();
      for (const r of c.r) {
        for (let k = 0; k < r.length; k += 2) {
          const x = (r[k] / 100 + 180) / 360, y = (Math.PI - World.mercY(r[k + 1] / 100)) / twoPi;
          if (k === 0) p.moveTo(x, y); else p.lineTo(x, y);
        }
        p.closePath();
      }
      const it = R.globe && R.globe.items[i];
      return { p, idx: i + 1, color: it ? it.color : '#c9b98f', item: it };
    });
    return R.ppaths;
  }

  // ---------------- Boden ----------------
  const GROUND = { historisch: '#c9bca2', modern: '#b4b9be', garten: '#a9c785', industrie: '#a2978a', mediterran: '#e6d9bd' };

  function drawGround(c, G, x, y) {
    const t = G.t, id = y * G.W + x, X = x * TS, Y = y * TS;
    // Fluss: weiche Kurven durch leicht versetzte Kachelmitten
    if (t.river[id]) {
      const W = G.W;
      const cp = (q) => { const qx = q % W, qy = (q / W) | 0; return [qx * TS + TS / 2 + (S.hash2(qx, qy, 61) - 0.5) * 9, qy * TS + TS / 2 + (S.hash2(qx, qy, 62) - 0.5) * 9]; };
      const me = cp(id);
      const d = t.rdir[id];
      let nx = null;
      if (d >= 0) { const [ox, oy] = S.N4[d]; if (S.inb(G, x + ox, y + oy)) nx = cp(id + ox + oy * W); }
      const m2 = nx ? [(me[0] + nx[0]) / 2, (me[1] + nx[1]) / 2] : me;
      const ups = [];
      for (let k = 0; k < 4; k++) {
        const [ox, oy] = S.N4[k];
        if (!S.inb(G, x + ox, y + oy)) continue;
        const n = id + ox + oy * W;
        if (t.river[n] && t.rdir[n] >= 0 && S.N4[t.rdir[n]][0] === -ox && S.N4[t.rdir[n]][1] === -oy) ups.push(cp(n));
      }
      const w = 2.2 + Math.min(5, t.flow[id] / 10);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const [col, ww] of [['#2f6f9c', w + 1.6], ['#4a92c4', w]]) {
        c.strokeStyle = col; c.lineWidth = ww;
        c.beginPath();
        if (!ups.length) { c.moveTo(me[0], me[1]); c.lineTo(m2[0], m2[1]); }
        for (const u of ups) {
          c.moveTo((u[0] + me[0]) / 2, (u[1] + me[1]) / 2);
          c.quadraticCurveTo(me[0], me[1], m2[0], m2[1]);
        }
        if (nx && G.t.elev[id + S.N4[d][0] + S.N4[d][1] * W] < 0) { c.moveTo(m2[0], m2[1]); c.lineTo(nx[0], nx[1]); }
        c.stroke();
      }
    }
    if (t.irrig[id] && !t.bld[id] && t.elev[id] >= 0) {
      c.strokeStyle = 'rgba(70,140,190,0.75)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(X + 2, Y + TS * 0.33); c.lineTo(X + TS - 2, Y + TS * 0.33);
      c.moveTo(X + 2, Y + TS * 0.7); c.lineTo(X + TS - 2, Y + TS * 0.7);
      c.stroke();
    }
    const z = t.zone[id];
    if (z && !t.bld[id]) {
      const zc = S.ZONES[z].color;
      c.fillStyle = zc + (z === 4 ? '55' : '3a');
      c.fillRect(X + 1, Y + 1, TS - 2, TS - 2);
      c.strokeStyle = zc;
      c.lineWidth = 1.2;
      c.setLineDash([3, 3]);
      c.strokeRect(X + 2.5, Y + 2.5, TS - 5, TS - 5);
      c.setLineDash([]);
      if (z === 4) { dot(c, X + 7, Y + 8, 3, '#5f9a4a'); dot(c, X + 16, Y + 15, 3.5, '#5f9a4a'); }
    }
    const b = t.bld[id];
    if (S.isUrban(b) || (t.road[id] && t.city[id])) {
      const city = G.cities[t.city[id] - 1];
      c.fillStyle = city ? GROUND[city.style] : '#b9b4aa';
      c.fillRect(X, Y, TS, TS);
      if (city && city.style === 'garten' && b === U.R) { c.fillStyle = '#93bd6e'; c.fillRect(X + 1, Y + 1, TS - 2, TS - 2); }
    }
  }

  function dot(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }

  // ---------------- Straßen und Schienen ----------------
  function linkTargets(G, x, y, bit) {
    const t = G.t, W = G.W;
    const ok = (nx, ny) => {
      if (!S.inb(G, nx, ny)) return false;
      const n = ny * W + nx;
      if (t.road[n] & bit) return true;
      if (bit === 1 && (t.bld[n] === U.HALL || t.bld[n] >= 10)) return 'b';
      return false;
    };
    const res = [];
    const card = {};
    for (const [ox, oy] of S.N4) { const k = ok(x + ox, y + oy); if (k) { res.push([ox, oy, k === 'b']); card[ox + ',' + oy] = true; } }
    for (const [ox, oy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (ok(x + ox, y + oy) === true && !card[ox + ',0'] && !card['0,' + oy]) res.push([ox, oy, false]);
    }
    return res;
  }

  function drawRoads(c, G, x, y) {
    const t = G.t, id = y * G.W + x, r = t.road[id];
    if (!r) return;
    const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
    const water = t.elev[id] < 0 || t.river[id];
    c.lineCap = 'round';
    if (r & 1) {
      const links = linkTargets(G, x, y, 1);
      const city = t.city[id] > 0;
      const passes = water ? [['#6b5a48', 9], ['#a08a6c', 7]] : city ? [['#6f6c66', 8], ['#8f8c86', 6]] : [['#5d5850', 7], ['#9c968a', 5]];
      for (const [col, w] of passes) {
        c.strokeStyle = col; c.lineWidth = w;
        c.beginPath();
        if (!links.length) { c.moveTo(cx - 3, cy); c.lineTo(cx + 3, cy); }
        for (const [ox, oy, toB] of links) {
          c.moveTo(cx, cy);
          c.lineTo(cx + ox * TS * (toB ? 0.3 : 0.5), cy + oy * TS * (toB ? 0.3 : 0.5));
        }
        c.stroke();
      }
      if (!city && !water && links.length === 2) {
        c.strokeStyle = 'rgba(240,226,160,0.7)'; c.lineWidth = 0.8; c.setLineDash([2.5, 3]);
        c.beginPath();
        for (const [ox, oy] of links) { c.moveTo(cx, cy); c.lineTo(cx + ox * TS * 0.5, cy + oy * TS * 0.5); }
        c.stroke(); c.setLineDash([]);
      }
      if (water) {
        c.strokeStyle = '#4b3d30'; c.lineWidth = 1;
        for (const [ox, oy] of links) {
          const nx = -oy, ny = ox;
          for (const s of [-1, 1]) {
            c.beginPath();
            c.moveTo(cx + nx * 4.5 * s, cy + ny * 4.5 * s);
            c.lineTo(cx + ox * TS * 0.5 + nx * 4.5 * s, cy + oy * TS * 0.5 + ny * 4.5 * s);
            c.stroke();
          }
        }
      }
    }
    if (r & 2) {
      const links = linkTargets(G, x, y, 2);
      // Schwellen
      c.strokeStyle = '#6a5440'; c.lineWidth = 1.6; c.lineCap = 'butt';
      for (const [ox, oy] of links) {
        const len = Math.hypot(ox, oy) * TS * 0.5;
        const ux = ox / Math.hypot(ox, oy), uy = oy / Math.hypot(ox, oy);
        for (let s = 2; s < len; s += 4) {
          const px = cx + ux * s, py = cy + uy * s;
          c.beginPath(); c.moveTo(px - uy * 4, py + ux * 4); c.lineTo(px + uy * 4, py - ux * 4); c.stroke();
        }
      }
      c.strokeStyle = '#2e2b29'; c.lineWidth = 1.1;
      for (const s of [-2, 2]) {
        c.beginPath();
        for (const [ox, oy] of links) {
          const l = Math.hypot(ox, oy), nx = -oy / l * s, ny = ox / l * s;
          c.moveTo(cx + nx, cy + ny); c.lineTo(cx + ox * TS * 0.5 + nx, cy + oy * TS * 0.5 + ny);
        }
        c.stroke();
      }
      c.lineCap = 'round';
    }
  }

  // ---------------- Grundformen für Gebäude ----------------
  function shadow(c, x, y, w, d, h) {
    c.fillStyle = 'rgba(20,24,30,0.22)';
    c.beginPath();
    c.moveTo(x + w, y + d);
    c.lineTo(x + w + h * 0.45, y + d - h * 0.15);
    c.lineTo(x + w + h * 0.45, y - h * 0.15);
    c.lineTo(x + w, y);
    c.closePath();
    c.fill();
  }
  /** Quader in Schrägansicht: Grundfläche (x,y,w,d), Höhe h */
  function box(c, x, y, w, d, h, wall, roof, opt) {
    opt = opt || {};
    shadow(c, x, y, w, d, h);
    c.fillStyle = wall;
    c.fillRect(x, y + d - h, w, h);
    if (opt.win && h > 5) {
      c.fillStyle = opt.win;
      const rows = Math.floor((h - 2) / 3.2), cols = Math.max(1, Math.floor((w - 2) / 3));
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        c.fillRect(x + 1.6 + k * ((w - 2) / cols), y + d - h + 1.4 + r * 3.2, 1.3, 1.6);
      }
    }
    if (opt.pitched) {
      c.fillStyle = roof;
      c.fillRect(x - 0.5, y - h, w + 1, d / 2);
      c.fillStyle = opt.roofD || roof;
      c.fillRect(x - 0.5, y - h + d / 2, w + 1, d / 2);
      c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(x - 0.5, y - h + d / 2); c.lineTo(x + w + 0.5, y - h + d / 2); c.stroke();
    } else {
      c.fillStyle = roof;
      c.fillRect(x, y - h, w, d);
      c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.6;
      c.strokeRect(x + 0.3, y - h + 0.3, w - 0.6, d - 0.6);
    }
  }
  function tree(c, x, y, r, kind) {
    c.fillStyle = 'rgba(20,30,20,0.25)';
    c.beginPath(); c.ellipse(x + r * 0.5, y + r * 0.6, r * 0.9, r * 0.45, 0, 0, Math.PI * 2); c.fill();
    if (kind === 'conifer') {
      c.fillStyle = '#2c5640';
      c.beginPath(); c.moveTo(x, y - r * 2); c.lineTo(x + r, y + r * 0.4); c.lineTo(x - r, y + r * 0.4); c.closePath(); c.fill();
      c.fillStyle = '#3d7056';
      c.beginPath(); c.moveTo(x, y - r * 2); c.lineTo(x - r, y + r * 0.4); c.lineTo(x - r * 0.1, y + r * 0.4); c.closePath(); c.fill();
    } else if (kind === 'palm') {
      c.strokeStyle = '#7a6040'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x, y + r * 0.4); c.lineTo(x + 1, y - r * 1.4); c.stroke();
      c.fillStyle = '#3f8a3e';
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        c.beginPath(); c.ellipse(x + 1 + Math.cos(a) * r * 0.7, y - r * 1.4 + Math.sin(a) * r * 0.35, r * 0.7, r * 0.25, a, 0, Math.PI * 2); c.fill();
      }
    } else {
      const dark = kind === 'jungle' ? '#1d6136' : '#3b7232';
      const lite = kind === 'jungle' ? '#2f8547' : '#5a9446';
      dot(c, x, y - r * 0.6, r, dark);
      dot(c, x - r * 0.3, y - r * 0.9, r * 0.55, lite);
    }
  }
  S.drawTree = tree;

  // ---------------- Objekte pro Kachel ----------------
  function drawObject(c, G, x, y) {
    const t = G.t, id = y * G.W + x, X = x * TS, Y = y * TS;
    const b = t.bld[id];
    if (b) {
      if (S.isUrban(b)) drawUrban(c, G, id, X, Y, b, t.lvl[id], G.cities[t.city[id] - 1]);
      else drawBuilding(c, G, b, X, Y, x, y);
      return;
    }
    if (t.road[id]) return;
    const bio = t.biome[id];
    const foreign = false;
    if (t.forest[id] && t.elev[id] >= 0) {
      const kind = bio === B.TAIGA ? 'conifer' : bio === B.JUNGLE ? 'jungle' : 'leaf';
      const n = kind === 'jungle' ? 4 : 5;
      for (let k = 0; k < n; k++) {
        const hx = S.hash2(x * 7 + k, y * 13, 77), hy = S.hash2(x * 5, y * 11 + k, 78);
        tree(c, X + 4 + hx * (TS - 8), Y + 6 + hy * (TS - 8), kind === 'jungle' ? 4.6 : 3.6 + hx, kind);
      }
    } else if (t.elev[id] >= S.MOUNTAIN_E) {
      const h = 9 + (t.elev[id] - S.MOUNTAIN_E) * 30 + S.hash2(x, y, 3) * 5;
      const px = X + TS / 2 + (S.hash2(x, y, 4) - 0.5) * 6, py = Y + TS * 0.8;
      c.fillStyle = '#7d7466';
      c.beginPath(); c.moveTo(px - 11, py); c.lineTo(px, py - h); c.lineTo(px + 11, py); c.closePath(); c.fill();
      c.fillStyle = '#a49a8a';
      c.beginPath(); c.moveTo(px - 11, py); c.lineTo(px, py - h); c.lineTo(px - 1, py); c.closePath(); c.fill();
      const tt = t.temp[id] - (t.elev[id] - 0.4) * 0.5;
      if (tt < 0.35 || t.elev[id] > 0.95) {
        c.fillStyle = '#f4f7f9';
        c.beginPath(); c.moveTo(px - 4, py - h * 0.62); c.lineTo(px, py - h); c.lineTo(px + 4, py - h * 0.62); c.lineTo(px + 1, py - h * 0.68); c.closePath(); c.fill();
      }
    } else if ((bio === B.SAVANNA || bio === B.DESERT) && S.hash2(x, y, 41) < 0.12 && t.elev[id] >= 0) {
      tree(c, X + 8 + S.hash2(x, y, 42) * 8, Y + 14, 2.8, bio === B.DESERT ? 'palm' : 'leaf');
    } else if (bio === B.SWAMP && t.elev[id] >= 0) {
      c.strokeStyle = '#4f7a52'; c.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const hx = X + 5 + S.hash2(x + k, y, 5) * 14, hy = Y + 8 + S.hash2(x, y + k, 6) * 10;
        c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx - 1, hy - 4); c.moveTo(hx, hy); c.lineTo(hx + 1.5, hy - 3.5); c.stroke();
      }
    }
    const res = t.res[id];
    if (res && t.elev[id] >= 0 && !foreign) drawResource(c, X + TS - 8, Y + TS - 7, res);
  }

  function drawResource(c, x, y, res) {
    if (res === S.RES.ORE) {
      c.fillStyle = '#8a7fa8';
      c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x + 2, y - 2); c.lineTo(x + 4, y + 4); c.closePath(); c.fill();
      c.fillStyle = '#b4a8d6';
      c.beginPath(); c.moveTo(x + 3, y + 4); c.lineTo(x + 5, y); c.lineTo(x + 7, y + 4); c.closePath(); c.fill();
    } else if (res === S.RES.COAL) {
      dot(c, x + 2, y + 2, 2.2, '#2b2b2b'); dot(c, x + 5, y + 3, 1.8, '#3c3c3c'); dot(c, x + 4, y, 1.5, '#1f1f1f');
    } else if (res === S.RES.OIL) {
      c.fillStyle = '#151515';
      c.beginPath(); c.moveTo(x + 3, y - 3); c.quadraticCurveTo(x + 6.5, y + 2, x + 3, y + 4.5); c.quadraticCurveTo(x - 0.5, y + 2, x + 3, y - 3); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x + 1.8, y + 0.5, 0.9, 1.6);
    }
  }
  S.drawResource = drawResource;

  // ---------------- Stadtgebäude ----------------
  function drawUrban(c, G, id, X, Y, b, l, city) {
    const st = S.STYLES[city ? city.style : 'historisch'];
    const sk = city ? city.style : 'historisch';
    const h1 = S.hash2(id, 3, 11), h2 = S.hash2(id, 5, 13);
    const win = 'rgba(255,248,220,0.55)';
    const glass = sk === 'modern' ? '#7fb3d6' : '#9fb8c8';
    if (b === U.HALL) {
      if (sk === 'mediterran' || sk === 'modern') {
        box(c, X + 3, Y + 9, 18, 12, 9, st.wallD, st.wall, { win });
        dot(c, X + 12, Y + 2, 5.5, sk === 'modern' ? '#7fb3d6' : st.accent);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(X + 10.5, Y + 0.5, 2.5, 0, Math.PI * 2); c.fill();
      } else {
        box(c, X + 2, Y + 10, 20, 11, 8, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
        box(c, X + 10, Y + 6, 5, 5, 20, st.wall, st.roofD);
        c.fillStyle = st.roofD;
        c.beginPath(); c.moveTo(X + 9.5, Y - 14); c.lineTo(X + 12.5, Y - 22); c.lineTo(X + 15.5, Y - 14); c.closePath(); c.fill();
      }
      // Fahne
      c.strokeStyle = '#333'; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(X + 20, Y + 6); c.lineTo(X + 20, Y - 8); c.stroke();
      c.fillStyle = R.flagColor || '#c0392b'; c.fillRect(X + 20, Y - 8, 6, 4);
      return;
    }
    if (b === U.R) {
      if (l === 1 || (l === 2 && sk === 'garten')) {
        const n = l === 1 ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const hx = X + 2 + ((k * 9 + h1 * 6) % 12), hy = Y + 5 + ((k * 7 + h2 * 9) % 11);
          if (sk === 'mediterran') box(c, hx, hy, 8, 6, 4, st.wallD, st.wall);
          else box(c, hx, hy, 8, 6, 4, st.wallD, st.roof, { pitched: true, roofD: st.roofD });
        }
        if (sk === 'garten' || h1 < 0.4) tree(c, X + 18 - h2 * 10, Y + 20, 2.6, 'leaf');
        return;
      }
      if (l === 2) {
        if (sk === 'mediterran') {
          box(c, X + 2, Y + 4, 9, 7, 5, st.wallD, st.wall); box(c, X + 12, Y + 6, 10, 7, 6, st.wallD, st.wall);
          box(c, X + 4, Y + 14, 10, 7, 5, st.wallD, st.wall); dot(c, X + 18, Y + 15, 2.4, st.accent);
        } else {
          box(c, X + 2, Y + 3, 20, 7, 6, st.wallD, st.roof, { pitched: sk !== 'modern', roofD: st.roofD, win });
          box(c, X + 2, Y + 14, 20, 7, 6, st.wallD, st.roof, { pitched: sk !== 'modern', roofD: st.roofD, win });
        }
        return;
      }
      if (l === 3) {
        if (sk === 'historisch' || sk === 'industrie') {
          // Blockrand mit Innenhof
          box(c, X + 2, Y + 2, 20, 6, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
          box(c, X + 2, Y + 8, 6, 8, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
          box(c, X + 16, Y + 8, 6, 8, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
          box(c, X + 2, Y + 16, 20, 6, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
        } else if (sk === 'garten') {
          box(c, X + 2, Y + 4, 13, 9, 9, st.wallD, st.roof, { win });
          c.fillStyle = '#6ea851'; c.fillRect(X + 2, Y - 5, 13, 9);
          tree(c, X + 19, Y + 12, 3, 'leaf'); tree(c, X + 7, Y + 20, 2.6, 'leaf');
        } else {
          box(c, X + 3, Y + 4, 18, 15, 11, st.wallD, st.roof, { win });
        }
        return;
      }
      if (l === 4) {
        box(c, X + 3, Y + 6, 17, 14, 20, st.wallD, st.roof, { win });
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(X + 6, Y - 12, 5, 4);
        return;
      }
      // Stufe 5: Wolkenkratzer
      box(c, X + 5, Y + 8, 13, 12, 38 + h1 * 10, glass, '#5f8fb0', { win: 'rgba(230,245,255,0.55)' });
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(X + 5, Y + 20 - 38 - h1 * 10, 2, 38 + h1 * 10);
      return;
    }
    if (b === U.C) {
      if (l <= 2) {
        const n = l === 1 ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const hx = X + 2 + k * (20 / n), hy = Y + 6 + (k % 2) * 7;
          box(c, hx, hy, 20 / n - 1.5, 7, 5 + l, st.wallD, sk === 'mediterran' ? st.wall : '#8d8780', { win });
          c.fillStyle = k % 2 ? st.accent : '#d9534f';
          c.fillRect(hx, hy + 7 - 2.5, 20 / n - 1.5, 2);
        }
        return;
      }
      if (l === 3) {
        box(c, X + 3, Y + 5, 18, 14, 13, sk === 'historisch' ? st.wallD : '#8fa3b6', sk === 'historisch' ? st.roof : '#6f7f8e', { win: 'rgba(220,240,255,0.6)', pitched: sk === 'historisch', roofD: st.roofD });
        c.fillStyle = st.accent; c.fillRect(X + 3, Y + 17, 18, 2);
        return;
      }
      const h = l === 4 ? 26 : 44 + h2 * 10;
      box(c, X + 4, Y + 7, 15, 13, h, glass, '#4f7fa3', { win: 'rgba(230,245,255,0.6)' });
      c.fillStyle = st.accent; c.fillRect(X + 4, Y + 20 - h, 15, 2);
      return;
    }
    if (b === U.I) {
      const wall = sk === 'industrie' ? st.wall : '#9a9690', roof = '#6c6762';
      box(c, X + 2, Y + 7, 16, 12, 6 + l, wall, roof);
      // Sägezahndach
      c.fillStyle = '#84807a';
      for (let k = 0; k < 4; k++) c.fillRect(X + 3 + k * 4, Y + 7 - 6 - l, 2, 12);
      if (l >= 2) { box(c, X + 19, Y + 9, 3, 3, 14 + l * 3, '#7d4a3a', '#5a3328'); }
      if (l >= 3) { dot(c, X + 6, Y + 21, 3, '#c8c4bd'); dot(c, X + 13, Y + 21, 3, '#c8c4bd'); }
    }
  }

  // ---------------- Staatsgebäude ----------------
  function drawBuilding(c, G, b, X, Y, x, y) {
    const t = G.t, id = y * G.W + x;
    switch (b) {
      case 10: { // Bauernhof: Felder und Scheune
        const crops = ['#d8c25a', '#9cc357', '#c9a446', '#7fb24c'];
        for (let k = 0; k < 4; k++) {
          c.fillStyle = crops[(k + x + y) % 4];
          c.fillRect(X + 1, Y + 1 + k * 5.5, TS - 2, 5);
          c.fillStyle = 'rgba(0,0,0,0.08)';
          for (let s = 0; s < TS - 2; s += 3) c.fillRect(X + 1 + s, Y + 1 + k * 5.5, 1, 5);
        }
        box(c, X + 14, Y + 13, 8, 7, 5, '#a8432f', '#7c2f22', { pitched: true, roofD: '#5e231a' });
        break;
      }
      case 11: { // Fischerei
        box(c, X + 4, Y + 8, 12, 9, 6, '#8a6d4d', '#5d7f99', { pitched: true, roofD: '#4a6a82' });
        c.fillStyle = '#7a5a3a'; c.fillRect(X + 14, Y + 16, 9, 2);
        c.fillStyle = '#d24b3a';
        c.beginPath(); c.moveTo(X + 16, Y + 20); c.lineTo(X + 23, Y + 20); c.lineTo(X + 21, Y + 23); c.lineTo(X + 17, Y + 23); c.closePath(); c.fill();
        break;
      }
      case 12: { // Sägewerk
        box(c, X + 3, Y + 7, 13, 10, 6, '#9b7650', '#6a5038', { pitched: true, roofD: '#4f3a28' });
        c.fillStyle = '#b7894f';
        for (let k = 0; k < 3; k++) dot(c, X + 17 + k * 2.2, Y + 19 - k * 0.5, 1.7, k % 2 ? '#a77b45' : '#c9995a');
        c.fillRect(X + 4, Y + 19, 10, 2.5);
        break;
      }
      case 13: { // Bergwerk: Förderturm
        dot(c, X + 8, Y + 17, 5, '#2f2a26');
        c.strokeStyle = '#4a4440'; c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(X + 13, Y + 20); c.lineTo(X + 16, Y - 2); c.lineTo(X + 19, Y + 20);
        c.moveTo(X + 14, Y + 10); c.lineTo(X + 18, Y + 10);
        c.stroke();
        dot(c, X + 16, Y - 1, 2.6, '#7c726a');
        box(c, X + 2, Y + 4, 8, 6, 5, '#9a8f84', '#6d645c');
        break;
      }
      case 14: { // Ölpumpe
        c.fillStyle = '#2a2a2a';
        c.fillRect(X + 6, Y + 19, 14, 2);
        c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(X + 13, Y + 19); c.lineTo(X + 13, Y + 8); c.stroke();
        c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(X + 5, Y + 10); c.lineTo(X + 21, Y + 6); c.stroke();
        c.fillStyle = '#c0392b';
        c.beginPath(); c.moveTo(X + 3, Y + 8); c.lineTo(X + 7, Y + 7); c.lineTo(X + 7, Y + 14); c.lineTo(X + 4, Y + 14); c.closePath(); c.fill();
        break;
      }
      case 15: { // Fabrik
        box(c, X + 2, Y + 8, 17, 12, 8, '#8e6a58', '#5e5550');
        c.fillStyle = '#76706a';
        for (let k = 0; k < 4; k++) c.fillRect(X + 3 + k * 4, Y - 1, 2.2, 12);
        box(c, X + 18, Y + 6, 4, 4, 20, '#8a4d3b', '#5a3328');
        c.fillStyle = '#e6e2da'; c.fillRect(X + 18, Y - 9, 4, 1.5);
        break;
      }
      case 16: { // Hafen
        c.fillStyle = '#8c8577'; c.fillRect(X + 1, Y + 12, TS - 2, 11);
        const cols = ['#c0392b', '#2e86c1', '#f0b429', '#27ae60'];
        for (let k = 0; k < 4; k++) box(c, X + 3 + (k % 2) * 7, Y + 14 + ((k / 2) | 0) * 4, 6, 3, 2.5, cols[k], cols[k]);
        c.strokeStyle = '#d4a017'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(X + 19, Y + 21); c.lineTo(X + 19, Y + 2); c.lineTo(X + 10, Y + 4); c.moveTo(X + 19, Y + 2); c.lineTo(X + 23, Y + 4); c.stroke();
        break;
      }
      case 17: { // Flughafen
        c.fillStyle = '#5c5f63'; c.fillRect(X, Y + 13, TS, 7);
        c.fillStyle = '#f2f2f2';
        for (let k = 0; k < 4; k++) c.fillRect(X + 2 + k * 6, Y + 16, 3, 1);
        box(c, X + 3, Y + 4, 12, 6, 5, '#c9d3dc', '#9fb0bf', { win: 'rgba(120,170,210,0.8)' });
        box(c, X + 17, Y + 4, 3, 3, 12, '#d8dde2', '#7fb3d6');
        break;
      }
      case 20: { // Kohlekraftwerk
        c.fillStyle = '#9b958c';
        c.beginPath();
        c.moveTo(X + 3, Y + 21); c.quadraticCurveTo(X + 7, Y + 10, X + 4, Y + 1); c.lineTo(X + 14, Y + 1); c.quadraticCurveTo(X + 11, Y + 10, X + 15, Y + 21); c.closePath(); c.fill();
        c.fillStyle = '#b8b2a8';
        c.beginPath(); c.moveTo(X + 3, Y + 21); c.quadraticCurveTo(X + 7, Y + 10, X + 4, Y + 1); c.lineTo(X + 7, Y + 1); c.quadraticCurveTo(X + 9, Y + 10, X + 7, Y + 21); c.closePath(); c.fill();
        c.fillStyle = '#3a3633'; c.beginPath(); c.ellipse(X + 9, Y + 1, 5, 1.4, 0, 0, Math.PI * 2); c.fill();
        box(c, X + 17, Y + 12, 5, 8, 6, '#6e6660', '#4d4743');
        box(c, X + 19, Y + 8, 2.5, 2.5, 18, '#7a3a2c', '#3e2a24');
        break;
      }
      case 21: { // Solarpark
        for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
          c.fillStyle = '#21436b'; c.fillRect(X + 2 + k * 11, Y + 3 + r * 7, 9.5, 5);
          c.fillStyle = '#4f7fb0'; c.fillRect(X + 2 + k * 11, Y + 3 + r * 7, 9.5, 1.4);
          c.strokeStyle = 'rgba(200,220,255,0.4)'; c.lineWidth = 0.5;
          c.beginPath(); c.moveTo(X + 2 + k * 11 + 4.75, Y + 3 + r * 7); c.lineTo(X + 2 + k * 11 + 4.75, Y + 8 + r * 7); c.stroke();
        }
        break;
      }
      case 22: { // Windpark
        for (const [ox, oy, hgt] of [[7, 20, 18], [17, 15, 15]]) {
          c.strokeStyle = '#eef1f3'; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(X + ox, Y + oy); c.lineTo(X + ox, Y + oy - hgt); c.stroke();
          c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(X + ox, Y + oy - 1, hgt * 0.5, 1.2);
          c.strokeStyle = '#ffffff'; c.lineWidth = 1.2;
          const hx = X + ox, hy = Y + oy - hgt, a0 = S.hash2(x, y, ox) * 6;
          c.beginPath();
          for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094; c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * 7, hy + Math.sin(a) * 7); }
          c.stroke();
          dot(c, hx, hy, 1.2, '#d0d4d8');
        }
        break;
      }
      case 23: { // Wasserkraft: Staumauer
        c.fillStyle = '#5a9ac7'; c.fillRect(X, Y, TS, TS * 0.45);
        c.fillStyle = '#c7c3bb'; c.fillRect(X, Y + 9, TS, 6);
        c.fillStyle = '#a8a39a'; c.fillRect(X, Y + 13, TS, 2);
        c.fillStyle = 'rgba(255,255,255,0.8)';
        for (let k = 0; k < 3; k++) c.fillRect(X + 4 + k * 7, Y + 15, 2, 6);
        break;
      }
      case 24: { // Kernkraftwerk
        for (const ox of [2, 12]) {
          c.fillStyle = '#c4c0b8';
          c.beginPath();
          c.moveTo(X + ox, Y + 22); c.quadraticCurveTo(X + ox + 4, Y + 10, X + ox + 1, Y - 2); c.lineTo(X + ox + 9, Y - 2); c.quadraticCurveTo(X + ox + 6, Y + 10, X + ox + 10, Y + 22); c.closePath(); c.fill();
          c.fillStyle = '#ddd9d1';
          c.beginPath(); c.moveTo(X + ox, Y + 22); c.quadraticCurveTo(X + ox + 4, Y + 10, X + ox + 1, Y - 2); c.lineTo(X + ox + 3.5, Y - 2); c.quadraticCurveTo(X + ox + 5.5, Y + 10, X + ox + 4, Y + 22); c.closePath(); c.fill();
        }
        dot(c, X + 12, Y + 20, 3.5, '#e8e4dc');
        break;
      }
      case 30: { // Universität
        box(c, X + 2, Y + 9, 20, 11, 8, '#e9e2d0', '#a9573f', { pitched: true, roofD: '#87432f' });
        c.fillStyle = '#fbf7ec';
        for (let k = 0; k < 5; k++) c.fillRect(X + 3.5 + k * 4, Y + 13, 1.5, 7);
        dot(c, X + 12, Y - 1, 4.2, '#5f8f7a');
        break;
      }
      case 31: { // Krankenhaus
        box(c, X + 2, Y + 7, 20, 13, 12, '#eef0f2', '#d7dbe0', { win: 'rgba(110,160,200,0.7)' });
        c.fillStyle = '#d6322b';
        c.fillRect(X + 10, Y - 3, 4, 10); c.fillRect(X + 7, Y, 10, 4);
        break;
      }
      case 32: { // Park
        c.fillStyle = '#7fbd5e'; c.fillRect(X + 1, Y + 1, TS - 2, TS - 2);
        c.strokeStyle = '#e6dcc1'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(X + 1, Y + 16); c.quadraticCurveTo(X + 12, Y + 8, X + 23, Y + 13); c.stroke();
        c.fillStyle = '#5aa0cf'; c.beginPath(); c.ellipse(X + 8, Y + 7, 4, 2.5, 0, 0, Math.PI * 2); c.fill();
        tree(c, X + 17, Y + 8, 3.2, 'leaf'); tree(c, X + 6, Y + 20, 3, 'leaf'); tree(c, X + 18, Y + 21, 2.6, 'leaf');
        break;
      }
      case 33: { // Stadion
        c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(X + 14, Y + 15, 11, 8, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#d5d0c7'; c.beginPath(); c.ellipse(X + 12, Y + 12, 11, 8.5, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#b8b2a8'; c.beginPath(); c.ellipse(X + 12, Y + 12, 8.5, 6.3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4f9a45'; c.fillRect(X + 7, Y + 9, 10, 6);
        c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.6; c.strokeRect(X + 7.5, Y + 9.5, 9, 5);
        break;
      }
      case 34: drawMonument(c, G, X, Y, x, y); break;
    }
  }

  /** Wahrzeichen im Stil der nächsten Stadt */
  function drawMonument(c, G, X, Y, x, y) {
    const city = S.nearestCity(G, x, y);
    const sk = city ? city.style : 'historisch';
    const st = S.STYLES[sk];
    if (sk === 'historisch') { // Dom
      box(c, X + 4, Y + 8, 16, 13, 12, '#d9cdb4', '#6f7a83', { pitched: true, roofD: '#56606a' });
      for (const ox of [4, 15]) {
        box(c, X + ox, Y + 6, 5, 5, 26, '#d2c5aa', '#56606a');
        c.fillStyle = '#56606a';
        c.beginPath(); c.moveTo(X + ox - 0.5, Y - 20); c.lineTo(X + ox + 2.5, Y - 32); c.lineTo(X + ox + 5.5, Y - 20); c.closePath(); c.fill();
      }
    } else if (sk === 'modern') { // Fernsehturm
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(X + 12, Y + 19, 20, 2);
      c.fillStyle = '#d8dde2'; c.fillRect(X + 10.5, Y - 30, 3, 50);
      dot(c, X + 12, Y - 18, 5, '#c9d0d6'); dot(c, X + 11, Y - 19, 2, '#ffffff');
      c.fillStyle = '#e74c3c'; c.fillRect(X + 11.3, Y - 40, 1.4, 10);
    } else if (sk === 'garten') { // Gewächshaus-Kuppel
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(X + 14, Y + 19, 10, 3, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(170,220,235,0.85)';
      c.beginPath(); c.arc(X + 12, Y + 18, 10, Math.PI, 0); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.7;
      for (let k = 1; k < 4; k++) { c.beginPath(); c.arc(X + 12, Y + 18, 10, Math.PI + k * 0.78, Math.PI + k * 0.78 + 0.01); c.lineTo(X + 12, Y + 18); c.stroke(); }
      tree(c, X + 12, Y + 16, 3, 'palm');
    } else if (sk === 'industrie') { // Stahlturm
      c.strokeStyle = '#6b5a4c'; c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(X + 3, Y + 21); c.quadraticCurveTo(X + 10, Y + 5, X + 12, Y - 30); c.quadraticCurveTo(X + 14, Y + 5, X + 21, Y + 21);
      c.moveTo(X + 6, Y + 12); c.lineTo(X + 18, Y + 12); c.moveTo(X + 9, Y - 2); c.lineTo(X + 15, Y - 2);
      c.stroke();
    } else { // Kuppelpalast
      box(c, X + 3, Y + 9, 18, 12, 9, '#f4efe4', '#e8dfcc');
      dot(c, X + 12, Y + 1, 6.5, st.accent);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(X + 10, Y - 1, 3, 0, Math.PI * 2); c.fill();
      for (const ox of [3, 20]) { box(c, X + ox - 1, Y + 9, 2.5, 2.5, 22, '#f4efe4', st.accent); }
    }
  }

  // ---------------- Werkzeug-Symbole ----------------
  /** Zeichnet eine Miniatur für die Werkzeugleiste */
  R.toolIcon = function (tool, size) {
    const cv = document.createElement('canvas');
    const dpr = 2;
    cv.width = size * dpr; cv.height = size * dpr;
    const c = cv.getContext('2d');
    c.scale(size * dpr / 32, size * dpr / 32);
    c.translate(4, 6);
    const fakeG = R.iconG || (R.iconG = makeIconWorld());
    if (tool.kind === 'build') {
      if (tool.bld === 23) { c.fillStyle = '#5a9ac7'; c.fillRect(0, 0, 24, 24); }
      drawBuilding(c, fakeG, tool.bld, 0, 0, 1, 1);
    } else if (tool.kind === 'road' || tool.kind === 'rail') {
      c.fillStyle = '#9ec27a'; c.fillRect(0, 2, 24, 20);
      c.lineCap = 'round';
      if (tool.kind === 'road') {
        c.strokeStyle = '#5d5850'; c.lineWidth = 7; c.beginPath(); c.moveTo(0, 18); c.lineTo(24, 6); c.stroke();
        c.strokeStyle = '#9c968a'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 18); c.lineTo(24, 6); c.stroke();
      } else {
        c.strokeStyle = '#6a5440'; c.lineWidth = 1.6;
        for (let s = 0; s < 24; s += 4) { c.beginPath(); c.moveTo(s, 8); c.lineTo(s, 16); c.stroke(); }
        c.strokeStyle = '#2e2b29'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(0, 10); c.lineTo(24, 10); c.moveTo(0, 14); c.lineTo(24, 14); c.stroke();
      }
    } else if (tool.kind === 'zone') {
      const z = S.ZONES[tool.zone];
      c.fillStyle = z.color + '55'; c.fillRect(1, 1, 22, 22);
      c.strokeStyle = z.color; c.lineWidth = 2; c.setLineDash([3, 3]); c.strokeRect(2, 2, 20, 20); c.setLineDash([]);
      c.fillStyle = z.color; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(z.key, 12, 13);
    } else if (tool.kind === 'city') {
      const city = { style: 'historisch' };
      R.flagColor = R.flagColor || '#c0392b';
      drawUrban(c, fakeG, 0, 0, 2, U.HALL, 1, city);
    } else if (tool.kind === 'bulldoze') {
      c.fillStyle = '#e0a43a'; c.fillRect(2, 10, 16, 8);
      c.fillStyle = '#3a3633'; c.fillRect(0, 18, 20, 4);
      c.fillStyle = '#8b8f94'; c.fillRect(18, 6, 5, 14);
      c.fillStyle = '#5a5f66'; c.fillRect(6, 4, 8, 6);
    } else if (tool.kind === 'inspect') {
      c.strokeStyle = '#e8dcc0'; c.lineWidth = 3;
      c.beginPath(); c.arc(10, 10, 7, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(15, 15); c.lineTo(22, 22); c.stroke();
    } else if (tool.kind === 'terra') {
      const op = tool.op;
      c.fillStyle = '#8fb06a';
      c.beginPath(); c.moveTo(0, 22); c.lineTo(8, 10); c.lineTo(13, 15); c.lineTo(18, 8); c.lineTo(24, 22); c.closePath(); c.fill();
      c.fillStyle = '#6e9150';
      c.beginPath(); c.moveTo(13, 15); c.lineTo(18, 8); c.lineTo(24, 22); c.closePath(); c.fill();
      c.strokeStyle = '#f4ead0'; c.fillStyle = '#f4ead0'; c.lineWidth = 2.4; c.lineCap = 'round';
      if (op === 'raise' || op === 'lower') {
        const up = op === 'raise';
        c.beginPath(); c.moveTo(12, up ? 8 : -2); c.lineTo(12, up ? -2 : 8); c.stroke();
        c.beginPath(); c.moveTo(8, up ? 2 : 4); c.lineTo(12, up ? -3 : 9); c.lineTo(16, up ? 2 : 4); c.closePath(); c.fill();
      } else if (op === 'flat') {
        c.beginPath(); c.moveTo(2, 4); c.lineTo(22, 4); c.stroke();
      } else if (op === 'forest') {
        c.clearRect(-4, -6, 32, 32);
        c.fillStyle = '#9ec27a'; c.fillRect(0, 2, 24, 20);
        tree(c, 7, 14, 4, 'leaf'); tree(c, 16, 18, 4.5, 'leaf'); tree(c, 17, 9, 3.5, 'conifer');
      } else if (op === 'clear') {
        c.clearRect(-4, -6, 32, 32);
        c.fillStyle = '#c9b78a'; c.fillRect(0, 2, 24, 20);
        c.fillStyle = '#7a5a3a'; dot(c, 7, 12, 2.5, '#8a6a46'); dot(c, 16, 16, 2.5, '#8a6a46'); dot(c, 15, 7, 2, '#8a6a46');
      } else if (op === 'irrig') {
        c.clearRect(-4, -6, 32, 32);
        c.fillStyle = '#dcc48a'; c.fillRect(0, 2, 24, 20);
        c.fillStyle = '#8fbf5a'; c.fillRect(0, 2, 24, 9);
        c.strokeStyle = '#4a8cc0'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 8); c.lineTo(24, 8); c.moveTo(0, 16); c.lineTo(24, 16); c.moveTo(12, 2); c.lineTo(12, 22); c.stroke();
      }
    }
    return cv;
  };

  function makeIconWorld() {
    const W = 3, H = 3, t = S.newTiles(9);
    for (let i = 0; i < 9; i++) { t.temp[i] = 0.5; t.elev[i] = 0.2; t.region[i] = 1; }
    return { W, H, t, cities: [{ x: 1, y: 1, style: 'historisch' }], meta: { seed: 1 } };
  }

  // ---------------- Bildaufbau pro Frame ----------------
  R.MAX_Z = 4;
  /** kleinster Zoom: der Globus schrumpft auf ein Drittel des Bildschirms */
  R.minZoom = () => R.zForGlobeR(md() * 0.32);
  R.worldToScreen = (wx, wy) => [(wx - R.cam.x) * R.cam.z + R.cw / 2, (wy - R.cam.y) * R.cam.z + R.ch / 2];
  R.screenToWorld = (sx, sy) => [(sx - R.cw / 2) / R.cam.z + R.cam.x, (sy - R.ch / 2) / R.cam.z + R.cam.y];
  R.screenToTile = (sx, sy) => { const [wx, wy] = R.screenToWorld(sx, sy); return [Math.floor(wx / TS), Math.floor(wy / TS)]; };

  R.clampCam = function () {
    const G = R.G, cam = R.cam, WT = World.WT;
    cam.y = S.clamp(cam.y, (World.gyOf(80) - G.gy0) * TS, (World.gyOf(-80) - G.gy0) * TS);
    cam.z = S.clamp(cam.z, R.minZoom(), R.MAX_Z);
    // Länge läuft um die Erde herum
    const mid = G.W * TS / 2, span = WT * TS;
    while (cam.x - mid > span / 2) cam.x -= span;
    while (cam.x - mid < -span / 2) cam.x += span;
  };

  R.fit = function () {
    const G = R.G;
    R.cam.x = G.W * TS / 2; R.cam.y = G.H * TS / 2;
    R.cam.z = Math.min(R.cw / (G.W * TS), R.ch / (G.H * TS)) * 0.95;
  };
  R.fitZoom = () => Math.min(R.cw / (R.G.W * TS), R.ch / (R.G.H * TS)) * 0.95;

  /** Weicher Kameraflug auf eine Zoomstufe (Mitte bleibt) */
  R.flyTo = function (x, y, z1, ms) {
    R.zoomAnim = { z0: R.cam.z, z1, x0: R.cam.x, y0: R.cam.y, x1: x, y1: y, t: 0, ms: ms || 1200, fly: true };
  };

  R.centerOn = function (x, y, z) {
    R.cam.x = (x + 0.5) * TS; R.cam.y = (y + 0.5) * TS;
    if (z) R.cam.z = z;
    R.clampCam();
  };

  /** Bildschirmpunkt -> [lon, lat] (auch in der Globus-Ansicht) */
  R.pickLonLat = function (sx, sy) {
    if (R.flatA < 0.5) return R.globe.unproject(sx, sy);
    const [wx, wy] = R.screenToWorld(sx, sy);
    return [World.lonOfGx(wx / TS + R.G.gx0), World.latOfGy(wy / TS + R.G.gy0)];
  };

  const VIEW_FN = {
    pop: (G, i) => {
      const t = G.t;
      if (t.bld[i] === U.R) return [S.clamp(t.lvl[i] / 5, 0, 1), '255,120,60'];
      if (t.bld[i] === U.HALL) return [0.6, '255,120,60'];
      return null;
    },
    poll: (G, i) => G.t.poll[i] > 0.02 && G.t.region[i] === 1 ? [S.clamp(G.t.poll[i] * 2, 0, 1), '150,70,40'] : null,
    fert: (G, i) => G.t.region[i] === 1 && G.t.elev[i] >= 0 && !G.t.bld[i] ? [S.clamp(S.tileFertility(G, i) / 1.3, 0, 1), '70,170,50'] : null,
    res: (G, i) => {
      const r = G.t.res[i];
      if (!r || G.t.region[i] !== 1) return null;
      return [0.85, r === 1 ? '150,120,210' : r === 2 ? '40,40,40' : '230,140,30'];
    },
    net: (G, i) => {
      const comp = G._comp;
      if (!comp || comp[i] < 0) return null;
      const cap = G.cities.find(c => c.capital) || G.cities[0];
      const ok = cap && comp[i] === comp[S.idx(G, cap.x, cap.y)];
      return [0.7, ok ? '60,170,90' : '220,70,60'];
    },
    happy: (G, i) => {
      const cid = G.t.city[i];
      if (!cid || !S.isUrban(G.t.bld[i])) return null;
      const h = G.cities[cid - 1].happy / 100;
      return [0.65, h > 0.6 ? '60,170,90' : h > 0.45 ? '230,180,40' : '220,70,60'];
    }
  };

  function viewLayer(G) {
    const vf = VIEW_FN[R.view];
    const key = R.view + ':' + G.month;
    if (R.viewKey === key) return;
    R.viewKey = key;
    const c = R.viewCv.getContext('2d');
    const img = c.createImageData(G.W, G.H), d = img.data;
    for (let i = 0; i < G.W * G.H; i++) {
      const v = vf(G, i);
      if (!v) continue;
      const rgb = v[1].split(',');
      d[i * 4] = +rgb[0]; d[i * 4 + 1] = +rgb[1]; d[i * 4 + 2] = +rgb[2]; d[i * 4 + 3] = Math.round((0.15 + v[0] * 0.55) * 255);
    }
    c.putImageData(img, 0, 0);
  }

  /** Bildausschnitt eines großen Bildes zeichnen, das die Weltfläche (x, y, w, h) bedeckt */
  function drawPart(c, img, x, y, w, h, vx0, vy0, vx1, vy1) {
    const ix0 = Math.max(x, vx0), iy0 = Math.max(y, vy0), ix1 = Math.min(x + w, vx1), iy1 = Math.min(y + h, vy1);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    const sx = img.width / w, sy = img.height / h;
    const s0x = (ix0 - x) * sx, s0y = (iy0 - y) * sy, s1x = (ix1 - x) * sx, s1y = (iy1 - y) * sy;
    // mindestens ein Quellpixel, sonst verschwindet das Bild bei starkem Zoom
    const pw = Math.max(1, s1x - s0x), ph = Math.max(1, s1y - s0y);
    c.drawImage(img, s0x, s0y, pw, ph, ix0, iy0, pw / sx, ph / sy);
  }

  R.draw = function (time) {
    const G = R.G, c = R.ctx, cam = R.cam;
    if (!G) return;
    R.frame++;
    R.flush();
    // Zeitbudget für neue Kartenblöcke: das Bild bleibt flüssig, fehlende Blöcke kommen über mehrere Bilder
    const tNow = performance.now();
    R.frameT0 = tNow; R.renderedNow = 0;
    if (Math.abs(cam.z - R.lastZ) > cam.z * 1e-4) { R.zoomingUntil = tNow + 220; R.lastZ = cam.z; }
    const zooming = R.zoomingUntil > tNow;
    const z = cam.z, dpr = R.dpr, WT = World.WT, span = WT * TS;
    const gr = R.globeR(), m = md();
    const flatA = S.clamp((gr / m - R.GLOBE_FULL) / (R.GLOBE_FLAT - R.GLOBE_FULL), 0, 1);
    const ppt = z * TS * dpr;
    R.flatA = flatA; R.ppt = ppt;
    // 1) Globus (weit draußen)
    if (flatA < 1) {
      const g = R.globe;
      g.lon = R.camLon(); g.lat = R.camLat(); g.zoom = gr / g.baseR;
      g.vLon = 0; g.vLat = 0; g.anim = null;
      g.draw(time);
    }
    if (flatA <= 0) return;
    // 2) flache Weltkarte
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = flatA;
    if (flatA >= 1) { c.fillStyle = '#0f2133'; c.fillRect(0, 0, R.cw, R.ch); }
    c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.cw / 2 - cam.x * z), dpr * (R.ch / 2 - cam.y * z));
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const [vx0, vy0] = R.screenToWorld(0, 0), [vx1, vy1] = R.screenToWorld(R.cw, R.ch);
    const tex = worldTexture();
    const ty = -G.gy0 * TS;
    for (const k of [-1, 0, 1]) drawPart(c, tex, -G.gx0 * TS + k * span, ty, span, span, vx0, vy0, vx1, vy1);
    // globale Feldbereiche
    const gA = vx0 / TS + G.gx0, gB = vx1 / TS + G.gx0, hA = Math.max(0, vy0 / TS + G.gy0), hB = Math.min(WT - 1, vy1 / TS + G.gy0);
    const centerG = [R.camGX(), R.camGY()];
    const canRender = () => R.renderedNow === 0 || performance.now() - R.frameT0 < 9;
    const drawChunks = (map, size, alpha, keyOf, make, res, srcPx) => {
      const list = [];
      for (let cy = Math.floor(hA / size); cy <= Math.floor(hB / size); cy++) for (let cx = Math.floor(gA / size); cx <= Math.floor(gB / size); cx++) {
        list.push([cx, cy, Math.hypot(cx * size + size / 2 - centerG[0], cy * size + size / 2 - centerG[1])]);
      }
      list.sort((a, b) => a[2] - b[2]);
      // Ersatzauflösungen: nächstgelegene zuerst, bei Gleichstand die schärfere
      const alt = [1, 2, 3, 4].filter(r => r !== res).sort((a, b) => Math.abs(a - res) - Math.abs(b - res) || b - a);
      let missing = 0;
      c.globalAlpha = flatA * alpha;
      // bilinear statt „high“: Blöcke liegen schon fast in Bildschirmauflösung vor
      c.imageSmoothingQuality = 'low';
      for (const [cx, cy] of list) {
        const wcx = wrapC(cx, WT / size);
        const key = keyOf(wcx, cy, res);
        let e = map.get(key);
        if (e && !e.stale) e.used = R.frame;
        else {
          // vorhandenen (auch veralteten) Block als Ersatz suchen
          let fb = e || null;
          if (!fb && res) for (const r2 of alt) { const f = map.get(keyOf(wcx, cy, r2)); if (f) { fb = f; break; } }
          // während des Zoomens nur Lücken füllen, die genaue Auflösung folgt, sobald der Zoom ruht
          if ((!fb || !zooming) && canRender()) { e = getChunk(map, key, (reuse) => make(wcx, cy, res, reuse), true); R.renderedNow++; }
          else { e = fb; missing++; R.stats.missing = (R.stats.missing || 0) + 1; }
          if (e) e.used = R.frame;
        }
        if (!e) continue;
        const wx = (cx * size - G.gx0) * TS, wy = (cy * size - G.gy0) * TS, ws = size * TS;
        const sp = srcPx(e), ex = 1 / (z * dpr);
        c.drawImage(e.cv, CM, CM, sp + ex * sp / ws, sp + ex * sp / ws, wx, wy, ws + ex, ws + ex);
      }
      return missing;
    };
    // 3) politische Flächen weit draußen
    const polA = ppt < 1 ? 0.62 : Math.max(0, 0.62 * (1 - (ppt - 1) / 4));
    if (ppt < 9) drawPolitical(c, G, z, dpr, polA, ppt, vx0, vy0, vx1, vy1);
    // 4) Übersicht: Gelände, Städte, Straßen je Feld
    if (ppt >= 3.2) {
      const oA = S.clamp((ppt - 3.2) / 2, 0, 1);
      drawChunks(R.ochunks, OCH, oA, (x, y) => x + ',' + y, (x, y) => renderOverview(x, y), 0, () => OCH * OVR);
    }
    // 5) Details: Häuser, Bäume, Straßen
    const need = z * dpr;
    if (need >= 0.62) {
      const res = need <= 1.2 ? 1 : need <= 2.4 ? 2 : need <= 3.4 ? 3 : 4;
      const dA = S.clamp((need - 0.62) / 0.22, 0, 1);
      drawChunks(R.chunks, CH, dA, (x, y, r) => x + ',' + y + ',' + r, (x, y, r, reuse) => renderChunk(x, y, r, reuse), res, (e) => (e.w - CM * 2));
    }
    c.imageSmoothingQuality = 'high';
    c.globalAlpha = flatA;
    // 6) eigenes Land: Datenansicht, Rauch, Auswahl
    const x0 = Math.max(0, Math.floor(vx0 / TS) - 1), y0 = Math.max(0, Math.floor(vy0 / TS) - 1);
    const x1 = Math.min(G.W - 1, Math.ceil(vx1 / TS) + 1), y1 = Math.min(G.H - 1, Math.ceil(vy1 / TS) + 2);
    if (ppt >= 3) {
      if (VIEW_FN[R.view]) {
        viewLayer(G);
        c.imageSmoothingEnabled = false;
        c.drawImage(R.viewCv, 0, 0, G.W * TS, G.H * TS);
        c.imageSmoothingEnabled = true;
      }
      if (z > 0.55 && !R.reduceMotion) drawSmoke(c, G, x0, y0, x1, y1, time);
      if (R.sel) {
        c.strokeStyle = '#ffffff'; c.lineWidth = 2 / z;
        c.strokeRect(R.sel[0] * TS + 1, R.sel[1] * TS + 1, TS - 2, TS - 2);
      }
      if (R.preview) {
        const p = R.preview;
        for (const tile of p.tiles) {
          c.fillStyle = tile.ok ? 'rgba(120,230,140,0.38)' : 'rgba(240,80,70,0.42)';
          c.fillRect(tile.x * TS, tile.y * TS, TS, TS);
        }
        if (p.radius) {
          c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1.5 / z; c.setLineDash([6 / z, 5 / z]);
          c.beginPath(); c.arc((p.tiles[0].x + 0.5) * TS, (p.tiles[0].y + 0.5) * TS, p.radius * TS, 0, Math.PI * 2); c.stroke();
          c.setLineDash([]);
        }
      } else if (R.hover) {
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.5 / z;
        c.strokeRect(R.hover[0] * TS + 0.5, R.hover[1] * TS + 0.5, TS - 1, TS - 1);
      }
    }
    // 7) Bildschirm-Ebene: Warnungen und Namen
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (z > 0.45) {
      for (const b of G.blds) {
        if (b.conn !== false || b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
        const [sx, sy] = R.worldToScreen((b.x + 0.5) * TS, b.y * TS);
        c.fillStyle = '#d6322b';
        c.beginPath(); c.arc(sx, sy - 4, 6.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.font = 'bold 10px "Public Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('!', sx, sy - 3.5);
      }
    }
    if (ppt < 7) drawCountryNames(c, G, ppt);
    if (ppt >= 2.2) { const placed = []; drawLabels(c, G, placed); drawForeignLabels(c, G, ppt, gA, gB, hA, hB, placed); }
    if (G.mil && ppt >= 0.5) { c.globalAlpha = R.flatA; c.textBaseline = 'alphabetic'; drawUnits(c, G, time); }
    c.globalAlpha = 1;
  };

  function drawPolitical(c, G, z, dpr, polA, ppt, vx0, vy0, vx1, vy1) {
    const paths = politicalPaths();
    const WT = World.WT, span = WT * TS, sc = z * TS * WT;
    const base = c.globalAlpha;
    for (const k of [-1, 0, 1]) {
      const ox = (-G.gx0 * TS + k * span), oy = -G.gy0 * TS;
      if (ox + span < vx0 || ox > vx1) continue;
      c.save();
      c.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (R.cw / 2 + (ox - R.cam.x) * z), dpr * (R.ch / 2 + (oy - R.cam.y) * z));
      const nx0 = (vx0 - ox) / span, nx1 = (vx1 - ox) / span, ny0 = (vy0 - oy) / span, ny1 = (vy1 - oy) / span;
      for (const p of paths) {
        const b = p.nbox || (p.nbox = nbox(p.item));
        if (b && (b[2] < nx0 || b[0] > nx1 || b[3] < ny0 || b[1] > ny1)) continue;
        if (polA > 0.01) {
          c.globalAlpha = base * polA;
          c.fillStyle = p.idx === World.homeIdx ? '#e8b23a' : p.color;
          c.fill(p.p);
        }
      }
      c.globalAlpha = base * S.clamp(1.2 - ppt / 8, 0.2, 0.8);
      c.lineWidth = 1 / sc; c.strokeStyle = 'rgba(30,40,50,0.9)';
      for (const p of paths) {
        const b = p.nbox;
        if (b && (b[2] < nx0 || b[0] > nx1 || b[3] < ny0 || b[1] > ny1)) continue;
        if (p.idx !== World.homeIdx) c.stroke(p.p);
      }
      const home = paths[World.homeIdx - 1];
      if (home) { c.globalAlpha = base; c.lineWidth = 2.2 / sc; c.strokeStyle = '#f0c45a'; c.stroke(home.p); }
      // eroberte Gebiete
      const occ = occList(G);
      if (occ.length) {
        c.globalAlpha = base * Math.max(0.55, polA + 0.2);
        for (let i = 0; i < occ.length; i += 3) {
          const o = occ[i + 2];
          c.fillStyle = o === World.homeIdx ? '#e8b23a' : (paths[o - 1] ? darken(paths[o - 1].color) : '#777');
          c.fillRect(occ[i] / WT, occ[i + 1] / WT, 1.05 / WT, 1.05 / WT);
        }
      }
      c.restore();
    }
    c.globalAlpha = base;
  }
  function occList(G) {
    if (!G.mil) return [];
    if (R._occVer === R.occVer && R._occList) return R._occList;
    const out = [];
    for (const k in G.mil.occ) { const p = k.indexOf(','); out.push(+k.slice(0, p), +k.slice(p + 1), G.mil.occ[k]); }
    R._occList = out; R._occVer = R.occVer;
    return out;
  }
  const _dk = {};
  function darken(hex) {
    if (_dk[hex]) return _dk[hex];
    const [r, g, b] = hexRgb(hex);
    return (_dk[hex] = 'rgb(' + Math.round(r * 0.62) + ',' + Math.round(g * 0.62) + ',' + Math.round(b * 0.62) + ')');
  }
  R.unitColor = (o) => o === World.homeIdx ? '#e3ad3c' : o === -1 ? '#555b63' : darken((R.globe.items[o - 1] || {}).color || '#888888');

  function nbox(it) {
    if (!it) return null;
    const [x0, y0, x1, y1] = it.box;
    const twoPi = 2 * Math.PI;
    return [(x0 + 180) / 360, (Math.PI - World.mercY(y1)) / twoPi, (x1 + 180) / 360, (Math.PI - World.mercY(y0)) / twoPi];
  }

  /** Bildschirmposition eines Längen-/Breitengrads, nächster Umlauf zur Kamera */
  function lonLatToScreen(G, lon, lat) {
    const WT = World.WT;
    let gx = World.gxOf(lon);
    const cgx = R.camGX();
    while (gx - cgx > WT / 2) gx -= WT; while (gx - cgx < -WT / 2) gx += WT;
    return R.worldToScreen((gx - G.gx0) * TS, (World.gyOf(lat) - G.gy0) * TS);
  }

  /** Globale Feldkoordinate -> Bildschirm (nächster Umlauf zur Kamera) */
  R.gToScreen = function (gx, gy) {
    const G = R.G, WT = World.WT;
    let lx = gx - G.gx0;
    const cx = R.cam.x / TS;
    while (lx - cx > WT / 2) lx -= WT; while (lx - cx < -WT / 2) lx += WT;
    return R.worldToScreen(lx * TS, (gy - G.gy0) * TS);
  };
  R.screenToG = function (sx, sy) {
    const [wx, wy] = R.screenToWorld(sx, sy);
    return [wx / TS + R.G.gx0, wy / TS + R.G.gy0];
  };
  /** Einheit unter einem Bildschirmpunkt */
  R.unitAt = function (sx, sy) {
    const G = R.G;
    if (!G.mil || R.flatA < 0.5) return null;
    let best = null, bd = 24;
    for (const u of G.mil.units) {
      const [x, y] = R.gToScreen(u.x, u.y);
      const d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  };

  /**
   * Bild einer Einheit (Seitenansicht, Blick nach rechts; face = -1 spiegelt).
   * s = Breite in Pixeln, ink = Zeichenfarbe, bg = Grundfarbe des Spielsteins.
   */
  S.drawUnitPic = function (c, type, cx, cy, s, ink, bg, face) {
    c.save();
    c.translate(cx, cy);
    c.scale((face < 0 ? -1 : 1) * s / 24, s / 24);
    c.fillStyle = ink; c.strokeStyle = ink;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (type === 'inf') {
      // Soldat mit Helm und Gewehr
      c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(-0.2, 2.6); c.lineTo(-2.6, 7.4); c.moveTo(0.8, 2.6); c.lineTo(2.9, 7.4); c.stroke();  // Beine
      c.beginPath(); c.moveTo(-3.6, 7.4); c.lineTo(-1.8, 7.4); c.moveTo(2.5, 7.4); c.lineTo(4.2, 7.4); c.stroke();  // Stiefel
      roundRect(c, -1.9, -2.2, 3.8, 5.3, 1.2); c.fill();                                                          // Rumpf
      c.beginPath(); c.arc(0.3, -3.7, 1.55, 0, Math.PI * 2); c.fill();                                              // Kopf
      c.beginPath(); c.arc(0.1, -4.6, 2.5, Math.PI, 0); c.closePath(); c.fill();                                    // Helm
      c.lineWidth = 1; c.beginPath(); c.moveTo(-2.9, -4.5); c.lineTo(3.1, -4.5); c.stroke();                        // Helmrand
      c.lineWidth = 1.3; c.beginPath(); c.moveTo(-3.2, 2.8); c.lineTo(7.2, -3.6); c.stroke();                       // Gewehr
      c.lineWidth = 2; c.beginPath(); c.moveTo(-3.4, 3); c.lineTo(-1.6, 1.9); c.stroke();                           // Kolben
      c.lineWidth = 1.2; c.beginPath(); c.moveTo(0.6, -1.2); c.lineTo(2.6, 0.6); c.stroke();                        // Arm
    } else if (type === 'tank') {
      // Panzer: Ketten mit Laufrollen, Wanne, Turm, Kanone
      roundRect(c, -10.5, 1.2, 21, 5.6, 2.8); c.fill();
      c.fillStyle = bg;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * 3.9, 4, 1.35, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = ink;
      c.beginPath(); c.moveTo(-10.5, 1.6); c.lineTo(-9.4, -1.6); c.lineTo(8.6, -1.6); c.lineTo(11.2, 1.6); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-5.5, -1.6); c.lineTo(-4.4, -5.4); c.lineTo(2.6, -5.4); c.lineTo(4.6, -1.6); c.closePath(); c.fill();
      c.fillRect(3, -4.4, 9.4, 1.5);
      c.fillRect(11.4, -4.7, 1.4, 2.1);
    } else {
      // Artillerie: Feldgeschütz mit Lafette, Rad und langem Rohr
      c.lineWidth = 1.9;
      c.beginPath(); c.moveTo(0, 3.2); c.lineTo(-11, 7.2); c.stroke();                                              // Lafette
      c.lineWidth = 1.4; c.beginPath(); c.moveTo(-11.4, 5.6); c.lineTo(-10.6, 8.4); c.stroke();                     // Sporn
      c.save(); c.translate(0, 0.6); c.rotate(-0.5);
      c.fillRect(-4, -1.3, 4.6, 2.6);                                                                               // Verschluss
      c.fillRect(0, -0.85, 13, 1.7);                                                                                // Rohr
      c.fillRect(12, -1.2, 1.6, 2.4);                                                                               // Mündung
      c.restore();
      c.beginPath(); c.moveTo(-1.6, -2.4); c.lineTo(2.2, -4.2); c.lineTo(3, 1.6); c.lineTo(-1, 2.2); c.closePath(); c.fill(); // Schild
      c.fillStyle = bg; c.beginPath(); c.arc(0.4, 4.2, 3.7, 0, Math.PI * 2); c.fill();
      c.lineWidth = 1.5; c.beginPath(); c.arc(0.4, 4.2, 3.5, 0, Math.PI * 2); c.stroke();                          // Rad
      c.lineWidth = 0.8; c.beginPath();
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; c.moveTo(0.4 + Math.cos(a) * 3.3, 4.2 + Math.sin(a) * 3.3); c.lineTo(0.4 - Math.cos(a) * 3.3, 4.2 - Math.sin(a) * 3.3); }
      c.stroke();
      c.fillStyle = ink; c.beginPath(); c.arc(0.4, 4.2, 1, 0, Math.PI * 2); c.fill();                              // Nabe
    }
    c.restore();
  };

  /** Blickrichtung einer Einheit: Marschrichtung, sonst zum Gegner, sonst die letzte */
  function unitFace(u, byId) {
    let dx = 0;
    if (u.path && u.path.length) dx = u.path[0][0] - u.x;
    else if (u.fight && byId && byId.get(u.fight)) dx = byId.get(u.fight).x - u.x;
    if (Math.abs(dx) > 0.05) u.face = dx < 0 ? -1 : 1;
    return u.face || 1;
  }
  R.unitFace = unitFace;

  function drawUnits(c, G, time) {
    const T = (time || 0) / 1000, home = World.homeIdx, now = G.mil.hours;
    const sel = new Set(R.selUnits || []);
    const byId = new Map(G.mil.units.map(u => [u.id, u]));
    // Marschwege
    c.lineWidth = 1.6; c.setLineDash([5, 4]);
    for (const u of G.mil.units) {
      if (u.o !== home || !u.path) continue;
      const [x0, y0] = R.gToScreen(u.x, u.y);
      const [tx, ty] = R.gToScreen(u.path[u.path.length - 1][0], u.path[u.path.length - 1][1]);
      c.strokeStyle = sel.has(u.id) ? 'rgba(255,255,255,0.95)' : 'rgba(255,240,200,0.45)';
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(tx, ty); c.stroke();
      if (sel.has(u.id)) { c.fillStyle = '#fff'; c.beginPath(); c.arc(tx, ty, 4, 0, Math.PI * 2); c.fill(); }
    }
    c.setLineDash([]);
    // Gefechte
    for (const u of G.mil.units) {
      if (!u.fight) continue;
      const v = byId.get(u.fight);
      if (!v) continue;
      const [x0, y0] = R.gToScreen(u.x, u.y), [x1, y1] = R.gToScreen(v.x, v.y);
      const ph = (T * 3 + u.id * 0.37) % 1;
      c.strokeStyle = 'rgba(255,' + Math.round(120 + 100 * ph) + ',60,' + (0.85 - ph * 0.6).toFixed(2) + ')';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + (x1 - x0) * ph, y0 + (y1 - y0) * ph); c.stroke();
      if (ph > 0.75) { c.fillStyle = 'rgba(255,200,80,0.9)'; c.beginPath(); c.arc(x1 + (Math.sin(u.id + T * 7) * 5), y1 + Math.cos(u.id + T * 5) * 5, 3 + (ph - 0.75) * 16, 0, Math.PI * 2); c.fill(); }
    }
    // Einnahmeradius ausgewählter Infanterie
    const tpx = TS * R.cam.z;
    c.setLineDash([4, 4]); c.lineWidth = 1.4;
    for (const u of G.mil.units) {
      if (u.o !== home || u.type !== 'inf' || !sel.has(u.id)) continue;
      const [x, y] = R.gToScreen(u.x, u.y);
      const r = S.Mil.captureRadius(u) * tpx;
      if (r < 20 || r > Math.max(R.cw, R.ch) * 2) continue;
      c.fillStyle = 'rgba(227,173,60,0.10)'; c.strokeStyle = 'rgba(227,173,60,0.85)';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.setLineDash([]);
    // Spielsteine (eigene zuletzt, damit sie oben liegen)
    const list = G.mil.units.slice().sort((a, b) => (a.o === home) - (b.o === home));
    for (const u of list) {
      const [x, y] = R.gToScreen(u.x, u.y);
      if (x < -30 || y < -30 || x > R.cw + 30 || y > R.ch + 30) continue;
      const w = 34, h = 25;
      const training = u.ready > now;
      c.globalAlpha = (training ? 0.55 : 1) * R.flatA;
      if (u.fight || u.under) {
        c.fillStyle = 'rgba(230,60,40,' + (0.35 + 0.3 * Math.sin(T * 8)).toFixed(2) + ')';
        c.beginPath(); c.arc(x, y, 23, 0, Math.PI * 2); c.fill();
      }
      const col = R.unitColor(u.o);
      c.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(c, x - w / 2 + 2, y - h / 2 + 2, w, h, 6); c.fill();
      c.fillStyle = col; roundRect(c, x - w / 2, y - h / 2, w, h, 6); c.fill();
      const ink = u.o === home ? '#1b2531' : '#ffffff';
      c.strokeStyle = u.o === home ? 'rgba(27,37,49,0.55)' : 'rgba(255,255,255,0.5)'; c.lineWidth = 1;
      roundRect(c, x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1, 6); c.stroke();
      S.drawUnitPic(c, u.type, x, y - 0.5, 27, ink, col, unitFace(u, byId));
      // Stärke
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x - w / 2, y + h / 2 + 2, w, 4);
      c.fillStyle = u.hp > 60 ? '#5fbf7f' : u.hp > 30 ? '#f0b23a' : '#e5574e';
      c.fillRect(x - w / 2, y + h / 2 + 2, w * Math.max(0, u.hp) / 100, 4);
      if (sel.has(u.id)) { c.strokeStyle = '#ffffff'; c.lineWidth = 2.5; roundRect(c, x - w / 2 - 3, y - h / 2 - 3, w + 6, h + 12, 8); c.stroke(); }
      if (training) { c.fillStyle = '#fff'; c.font = '600 9px "Public Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('Ausbildung', x, y - h / 2 - 6); }
    }
    c.globalAlpha = R.flatA;
  }

  function drawCountryNames(c, G, ppt) {
    const items = R.globe.items;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '700 12px "Big Shoulders Display", "Public Sans", system-ui, sans-serif';
    const a = c.globalAlpha;
    c.globalAlpha = a * S.clamp((7 - ppt) / 3, 0, 1);
    for (const it of items) {
      const [sx, sy] = lonLatToScreen(G, it.cLon, it.cLat);
      if (sx < -60 || sy < -20 || sx > R.cw + 60 || sy > R.ch + 20) continue;
      const w = (it.lbox[2] - it.lbox[0]) / 360 * World.WT * TS * R.cam.z;
      if (w < 60) continue;
      const home = it.c.id === G.meta.id;
      c.fillStyle = home ? '#1a2633' : 'rgba(20,30,40,0.8)';
      if (home) { c.font = '800 14px "Big Shoulders Display", "Public Sans", system-ui, sans-serif'; }
      c.fillText(it.c.n.toUpperCase(), sx, sy);
      if (home) c.font = '700 12px "Big Shoulders Display", "Public Sans", system-ui, sans-serif';
    }
    c.globalAlpha = a;
  }

  const overlaps = (placed, x0, y0, x1, y1) => placed.some(r => x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]);

  function drawForeignLabels(c, G, ppt, gA, gB, hA, hB, placed) {
    const near = World.citiesNear(Math.floor(gA), Math.floor(hA), Math.ceil(gB - gA) + 1, Math.ceil(hB - hA) + 1);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const { c: city, gx, gy } of near) {
      if (city.cid === G.meta.id) continue;
      if (ppt < 6 && !city.capital && city.pop < 2e6) continue;
      if (ppt < 14 && !city.capital && city.pop < 4e5) continue;
      const [sx, sy] = R.worldToScreen((gx - G.gx0) * TS, (gy - G.gy0 + 0.9) * TS);
      if (sx < -80 || sy < -30 || sx > R.cw + 80 || sy > R.ch + 30) continue;
      c.font = '600 11px "Big Shoulders Display", "Public Sans", system-ui, sans-serif';
      const name = city.name.toUpperCase();
      const w = c.measureText(name).width + 12;
      if (overlaps(placed, sx - w / 2, sy - 1, sx + w / 2, sy + 16)) continue;
      placed.push([sx - w / 2, sy - 1, sx + w / 2, sy + 16]);
      c.fillStyle = 'rgba(245,240,228,0.85)';
      roundRect(c, sx - w / 2, sy - 1, w, 17, 5); c.fill();
      if (city.capital) { c.fillStyle = '#8a3b2c'; c.beginPath(); c.arc(sx - w / 2 + 5, sy + 7.5, 2.2, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#2b3440';
      c.fillText(name, sx + (city.capital ? 2 : 0), sy + 8);
    }
  }

  function drawSmoke(c, G, x0, y0, x1, y1, time) {
    const t = G.t;
    const T = time / 1000;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const id = y * G.W + x, b = t.bld[id];
      let sx, sy, white = false, big = 1;
      if (b === U.I && t.lvl[id] >= 2) { sx = 20.5; sy = 9 - 14 - t.lvl[id] * 3; }
      else if (b === 15) { sx = 20; sy = -14; }
      else if (b === 20) { sx = 9; sy = 0; white = true; big = 1.3; }
      else if (b === 24) { sx = 7; sy = -2; white = true; big = 1.4; }
      else continue;
      const bx = x * TS + sx, by = y * TS + sy;
      for (let k = 0; k < 4; k++) {
        const ph = (T * 0.45 + k / 4 + S.hash2(x, y, k) * 0.3) % 1;
        const r = (2 + ph * 6) * big;
        c.fillStyle = white ? 'rgba(245,245,245,' + (0.55 * (1 - ph)).toFixed(3) + ')' : 'rgba(90,85,80,' + (0.45 * (1 - ph)).toFixed(3) + ')';
        c.beginPath(); c.arc(bx + ph * 10 + Math.sin(T + k) * 1.5, by - ph * 18, r, 0, Math.PI * 2); c.fill();
        if (b === 24) { c.beginPath(); c.arc(bx + 10 + ph * 10, by - ph * 18, r, 0, Math.PI * 2); c.fill(); }
      }
    }
  }

  /**
   * Namen der eigenen Städte. Keine Stadt verschwindet beim Herauszoomen: weit draußen zeigt ein Punkt die Lage,
   * kleine Städte bekommen ein schmales Schild. Überlappen sich Schilder, gewinnen Auswahl, Hauptstadt,
   * selbst gegründete Städte und dann die größeren.
   */
  function drawLabels(c, G, placed) {
    const z = R.cam.z, ppt = R.ppt, sc = S.cityScale(G);
    const font = '"Big Shoulders Display", "Public Sans", system-ui, sans-serif';
    const prio = (city) => (R.selCity === city.id ? 1e12 : 0) + (city.capital ? 1e11 : 0) + (city.isNew ? 1e10 : 0) + city.pop;
    const list = G.cities.slice().sort((a, b) => prio(b) - prio(a));
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const pos = new Map();
    // Spielsteine in der Stadt: Schild darunter setzen, damit beides lesbar bleibt
    const tokens = [];
    if (G.mil && ppt >= 0.5) for (const u of G.mil.units) {
      const [x, y] = R.gToScreen(u.x, u.y);
      if (x > -60 && y > -60 && x < R.cw + 60 && y < R.ch + 60) tokens.push(x, y);
    }
    const below = (cx, cy, y0) => {
      let y = y0;
      for (let i = 0; i < tokens.length; i += 2) if (Math.abs(tokens[i] - cx) < 34 && tokens[i + 1] + 21 > y && tokens[i + 1] - 16 < y + 30) y = tokens[i + 1] + 21;
      return y;
    };
    for (const city of list) {
      const [cx, cy] = R.worldToScreen((city.x + 0.5) * TS, (city.y + 0.5) * TS);
      if (cx < -90 || cy < -50 || cx > R.cw + 90 || cy > R.ch + 50) continue;
      pos.set(city.id, [cx, cy]);
    }
    // Lagepunkte, solange die Häuser selbst noch zu klein sind
    if (ppt < 14) {
      const r = ppt < 5 ? 3.2 : 4;
      for (const city of list) {
        const p = pos.get(city.id);
        if (!p) continue;
        c.fillStyle = 'rgba(18,28,38,0.85)';
        c.beginPath(); c.arc(p[0], p[1], r + 1.6, 0, Math.PI * 2); c.fill();
        c.fillStyle = city.capital ? '#e8b23a' : city.isNew ? '#9fe0b0' : '#f3ecdd';
        c.beginPath(); c.arc(p[0], p[1], r, 0, Math.PI * 2); c.fill();
      }
    }
    for (const city of list) {
      const p = pos.get(city.id);
      if (!p) continue;
      const big = city.capital || city.pop * sc > 1e6;
      const sel = R.selCity === city.id;
      const compact = z < 0.35 && !big && !sel;
      const name = city.name.toUpperCase();
      const sx = p[0];
      let sy = below(sx, p[1], ppt < 14 ? p[1] + 7 : R.worldToScreen(0, (city.y + 1.2) * TS)[1]);
      let w, h;
      const pop = S.fmtPop(city.pop * sc);
      if (compact) {
        c.font = '600 11px ' + font;
        w = c.measureText(name).width + 12; h = 17;
      } else {
        c.font = (big ? '700 13px ' : '600 12px ') + font;
        const w1 = c.measureText(name).width;
        c.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
        w = Math.max(w1, c.measureText(pop).width) + 16; h = 30;
      }
      let box = [sx - w / 2, sy - 2, sx + w / 2, sy - 2 + h];
      if (!sel && overlaps(placed, box[0], box[1], box[2], box[3])) {
        // kein Platz unter der Stadt: darüber versuchen
        const up = p[1] - 9 - h;
        if (overlaps(placed, box[0], up - 2, box[2], up - 2 + h)) continue;
        sy = up; box = [sx - w / 2, sy - 2, sx + w / 2, sy - 2 + h];
      }
      placed.push(box);
      c.fillStyle = sel ? 'rgba(232,178,58,0.95)' : 'rgba(18,28,38,0.78)';
      roundRect(c, box[0], box[1], w, h, compact ? 5 : 6);
      c.fill();
      const dotY = sy + 7;
      if (city.capital || city.isNew) {
        c.fillStyle = sel ? '#1a2633' : city.capital ? '#e8b23a' : '#9fe0b0';
        c.beginPath(); c.arc(box[0] + 7, dotY, compact ? 2.2 : 2.6, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = sel ? '#1a2633' : '#f3ecdd';
      c.font = compact ? '600 11px ' + font : (big ? '700 13px ' : '600 12px ') + font;
      c.fillText(name, sx + (compact && (city.capital || city.isNew) ? 2 : 0), dotY);
      if (!compact) {
        c.fillStyle = sel ? '#1a2633' : '#b9c4cf';
        c.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
        c.fillText(pop, sx, sy + 20);
      }
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
})(S);
