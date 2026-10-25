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
      R.globe = S.makeGlobe({ noIdle: true, noInput: true, cy: 0.5, maxZoom: 1e9, maxDpr: 2, noBorders: true, texture: () => S.Sat.get(), overlay: (c, g) => { if (R.G && !World.city) S.Terr.drawGlobe(c, g, terrColor); S.FX.globeClouds(c, g, performance.now() / 1000); } });
      R.globe.init(canvas, () => {});
    }
    S.Terr.reset(G);
    S.Terr.update(G, true);
    R.globe.hidden = new Set(Object.keys((G.mil && G.mil.annexed) || {}).map(e => R.globe.items[e - 1]));
    R.globe.sel = R.globe.itemById(G.meta.id) || null;
    R.resize();
    // Größe des Kartenbereichs ändert sich auch ohne Fenster-Resize (Leisten, Schriften, Panels)
    if (R._ro) R._ro.disconnect();
    if (window.ResizeObserver) { R._ro = new ResizeObserver(() => R.syncSize()); R._ro.observe(canvas); }
  };

  /** Zeichenfläche an die tatsächliche Größe auf dem Bildschirm anpassen, sonst liegen Tipp und Feld auseinander */
  R.syncSize = function () {
    const c = R.canvas;
    if (!c) return;
    const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w && h && (Math.abs(w - R.cw) > 0.5 || Math.abs(h - R.ch) > 0.5 || dpr !== R.dpr)) { R.resize(); if (R.G) R.clampCam(); }
  };

  /** Punkt eines Zeiger-Ereignisses in Kartenkoordinaten (CSS-Pixel), unabhängig von Rändern und Skalierung */
  R.eventPos = function (e) {
    const r = R.canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * (R.cw / (r.width || 1)), (e.clientY - r.top) * (R.ch / (r.height || 1))];
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
    S.Terr.touch(gx, gy);
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

  /** Ein Land wurde annektiert: Gebietsebene und alle Kartenblöcke neu */
  R.annexed = function () {
    S.Terr.reset(R.G);
    S.Terr.update(R.G, true);
    for (const e of R.chunks.values()) e.stale = true;
    for (const e of R.ochunks.values()) e.stale = true;
    R.globe.hidden = new Set(Object.keys(R.G.mil.annexed || {}).map(e => R.globe.items[e - 1]));
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
    const occ = G.mil ? G.mil.occ : null, annexed = G.mil && G.mil.annexed;
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
        let v = occ[(((gx0 + i) % WTw) + WTw) % WTw + ',' + (gy0 + j)];
        if (v === undefined && annexed && annexed[bo] !== undefined) v = homeIdx;
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
  // Catmull-Rom-Gewichte für weiche Übergänge ohne Treppenstufen
  function cubicW(t, w) {
    const t2 = t * t, t3 = t2 * t;
    w[0] = -0.5 * t3 + t2 - 0.5 * t; w[1] = 1.5 * t3 - 2.5 * t2 + 1; w[2] = -1.5 * t3 + 2 * t2 + 0.5 * t; w[3] = 0.5 * t3 - 0.5 * t2;
  }
  /** Feld weichzeichnen (Binomialfilter 3×3), damit Wald- und Wiesenränder nicht dem Raster folgen */
  function blurField(src, W, H) {
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = y + oy; if (yy < 0 || yy >= H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox; if (xx < 0 || xx >= W) continue;
          const w = (ox ? 1 : 2) * (oy ? 1 : 2);
          s += src[yy * W + xx] * w; n += w;
        }
      }
      out[y * W + x] = Math.min(1.3, s / n * 1.6);
    }
    return out;
  }

  /**
   * Gelände als Luftbild: Höhe kubisch interpoliert, Abtastpunkt leicht verwirbelt (natürliche Küsten und Waldränder),
   * Wald aus einem weichgezeichneten Feld, Feinstruktur je Pixel.
   */
  function terrainImage(Bk, PX) {
    const { W, H, t } = Bk;
    const cv = document.createElement('canvas');
    cv.width = W * PX; cv.height = H * PX;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W * PX, H * PX);
    const data = img.data, IW = W * PX;
    const E = t.elev, M = t.moist, T = t.temp, IR = t.irrig;
    const F = blurField(t.forest, W, H);
    const nA = R.noiseA, nB = R.noiseB, seed = Bk.meta.seed;
    const gpx = World.wrapGx(Bk.gx0) * PX, gpy = Bk.gy0 * PX;
    const NS = PX * (Bk.noiseScale || 1);   // Rauschen grober bei Übersichtsbildern
    const wx = [0, 0, 0, 0], wy = [0, 0, 0, 0];
    for (let py = 0; py < H * PX; py++) {
      for (let px = 0; px < W * PX; px++) {
        const qx = gpx + px, qy = gpy + py;
        const n1 = nA(qx * 1.32 / NS, qy * 1.32 / NS), n2 = nB(qx * 0.68 / NS, qy * 0.68 / NS);
        // verwirbelter Abtastpunkt (in Feldern)
        let fx = (px + 0.5) / PX - 0.5 + (n2 - 0.5) * 0.7, fy = (py + 0.5) / PX - 0.5 + (n1 - 0.5) * 0.7;
        fx = Math.max(0, Math.min(W - 1.001, fx)); fy = Math.max(0, Math.min(H - 1.001, fy));
        const i0 = Math.floor(fx), j0 = Math.floor(fy), u = fx - i0, v = fy - j0;
        // Höhe: Catmull-Rom über 4×4 Felder
        cubicW(u, wx); cubicW(v, wy);
        let e = 0;
        for (let m = 0; m < 4; m++) {
          const jj = Math.max(0, Math.min(H - 1, j0 - 1 + m)) * W;
          let row = 0;
          for (let k = 0; k < 4; k++) row += E[jj + Math.max(0, Math.min(W - 1, i0 - 1 + k))] * wx[k];
          e += row * wy[m];
        }
        const i1 = Math.min(W - 1, i0 + 1), j1 = Math.min(H - 1, j0 + 1);
        const a = j0 * W + i0, b = j0 * W + i1, c = j1 * W + i0, d = j1 * W + i1;
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
        const grain = S.hash2(qx, qy, seed) - 0.5;
        e += (n1 - 0.5) * 0.035 + grain * 0.006;
        const m = M[a] * w00 + M[b] * w10 + M[c] * w01 + M[d] * w11 + (n2 - 0.5) * 0.12;
        const tt = T[a] * w00 + T[b] * w10 + T[c] * w01 + T[d] * w11;
        const f = F[a] * w00 + F[b] * w10 + F[c] * w01 + F[d] * w11 + (n1 - 0.5) * 0.5 + grain * 0.12;
        const ir = IR[a] * w00 + IR[b] * w10 + IR[c] * w01 + IR[d] * w11 + (n2 - 0.5) * 0.4;
        // Gefälle für das Relief aus den Nachbarfeldern
        const gx = (1 - v) * (E[b] - E[a]) + v * (E[d] - E[c]), gy = (1 - u) * (E[c] - E[a]) + u * (E[d] - E[b]);
        const col = landColor(e, m, tt, f, ir, gx, gy, grain, qx, qy, PX, n1, n2);
        const o = (py * IW + px) * 4;
        data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  const _col = [0, 0, 0];
  // Feldfrüchte aus der Luft: Weizen, Raps, gepflügter Acker, junges Grün, Wiese, Stoppelfeld
  const FIELDS = [[196, 178, 108], [176, 170, 70], [128, 104, 76], [104, 132, 62], [92, 120, 58], [168, 152, 112], [118, 140, 74]];
  /**
   * Bodenfarbe wie auf einem Luftbild: natürliche Landschaftsfarben, Äcker als Flickenteppich,
   * Kronendach im Wald, Fels und Schnee im Gebirge, Licht von Nordwesten.
   */
  function landColor(e, m, tt, f, ir, dx, dy, grain, qx, qy, PX, n1, n2) {
    let r, g, bl;
    if (e < 0) {
      // Wasser: flach türkisgrün, tief dunkelblau, leichte Wellen
      const dep = S.clamp(-e / 0.35, 0, 1), sh = 1 - Math.pow(1 - dep, 2);
      r = 58 - 42 * sh; g = 118 - 70 * sh; bl = 132 - 50 * sh;
      if (e > -0.02) { const k = (e + 0.02) / 0.02; r += 40 * k; g += 34 * k; bl += 18 * k; }
      const wave = (n1 - 0.5) * 10 + grain * 4;
      r += wave * 0.6; g += wave * 0.8; bl += wave;
    } else {
      const bio = S.biomeOf(e, m, tt, f > 0.5 ? 1 : 0, ir > 0.5 ? 1 : 0);
      const col = S.BIOME_RGB[bio];
      r = col[0]; g = col[1]; bl = col[2];
      const open = bio === B.GRASS || bio === B.STEPPE || bio === B.SAVANNA;
      if (open) {
        const lush = S.clamp((m - 0.35) * 1.6, -0.4, 0.5);
        r -= lush * 22; g += lush * 8; bl -= lush * 10;
        // Wiesen und Weiden wechseln großflächig
        const meadow = (n2 - 0.5) * 18;
        r += meadow * 0.6; g += meadow; bl += meadow * 0.3;
        // Äcker: rechteckige Parzellen, je Gegend anders ausgerichtet
        const farm = S.clamp((m - 0.22) * 3, 0, 1) * (1 - S.clamp((e - 0.32) * 4, 0, 1)) * S.clamp((0.62 - f) * 3, 0, 1) * (bio === B.SAVANNA ? 0.4 : 1);
        if (farm > 0.02 && tt > 0.22) {
          const sz = Math.max(1.6, PX * 0.55);   // Felder sind klein: einige hundert Meter
          const ang = Math.floor(S.hash2(Math.floor(qx / (PX * 9)), Math.floor(qy / (PX * 9)), 91) * 4) * 0.4;
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const fv = (-qx * sa + qy * ca) / (sz * 0.6), cv = Math.floor(fv);
          const fu = (qx * ca + qy * sa) / (sz * (0.7 + S.hash2(cv, 7, 97) * 1.6)) + S.hash2(cv, 3, 95) * 3;
          const cu = Math.floor(fu);
          const F = FIELDS[Math.floor(S.hash2(cu, cv, 93) * FIELDS.length)];
          const k = 0.45 * farm;
          r += (F[0] - r) * k; g += (F[1] - g) * k; bl += (F[2] - bl) * k;
          const du = fu - cu, dv = fv - cv;
          if (sz > 3 && (Math.min(du, 1 - du) < 0.08 || Math.min(dv, 1 - dv) < 0.1)) { r *= 1 - 0.15 * farm; g *= 1 - 0.08 * farm; bl *= 1 - 0.16 * farm; }
        }
      } else if (bio === B.FOREST || bio === B.JUNGLE || bio === B.TAIGA) {
        // Kronendach: helle Wipfel, dunkle Lücken
        const crown = (S.hash2(qx, qy, 17) - 0.5) * 0.7 + (n2 - 0.5) * 0.6;
        const k = crown * 26 + (n1 - 0.5) * 22;
        r += k * 0.7; g += k; bl += k * 0.6;
      } else if (bio === B.MOUNTAIN || bio === B.HILLS) {
        // Fels: Streifen und Geröll
        const rock = (n1 - 0.5) * 22 + (n2 - 0.5) * 16 + grain * 10;
        r += rock; g += rock; bl += rock * 0.9;
      } else if (bio === B.DESERT) {
        const dune = Math.sin((qx * 0.8 + qy * 0.35) / PX + n1 * 6) * 8;
        r += dune; g += dune * 0.85; bl += dune * 0.6;
      }
      // Schnee auf hohen Gipfeln, weicher Übergang
      const snow = S.clamp((e - 0.95) * 6, 0, 1) + S.clamp((0.18 - (tt - Math.max(0, e - 0.4) * 0.5)) * 6, 0, 1) * (e > 0.6 ? 1 : 0);
      if (snow > 0) { const k = Math.min(1, snow); r += (238 - r) * k; g += (242 - g) * k; bl += (246 - bl) * k; }
      // Relief: Licht von Nordwesten, stärker im Gebirge
      const relief = e > 0.45 ? 1.6 : 1;
      const sh = S.clamp(-(dx + dy) * 260 * relief, -60, 60);
      r += sh; g += sh; bl += sh * 0.92;
      r += grain * 7; g += grain * 7; bl += grain * 6;
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
    // feine Bodenstruktur in voller Auflösung: wirkt scharf wie ein Luftbild
    c.globalAlpha = 0.5; c.globalCompositeOperation = 'overlay';
    c.fillStyle = grainPattern(c); c.fillRect((x0 - 1) * TS, (y0 - 1) * TS, (x1 - x0 + 3) * TS, (y1 - y0 + 3) * TS);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const gx0 = x0 - 2, gy0 = y0 - 2, gx1 = x1 + 2, gy1 = y1 + 2;
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) drawGround(c, Bk, x, y);
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) drawRoads(c, Bk, x, y);
    if (!World.city) drawBorders(c, Bk, gx0, gy0, gx1, gy1, TS, { w: 3, dash: [7, 5] });
    const oy1 = Math.min(H - 1, y1 + 3);
    for (let y = gy0; y <= oy1; y++) for (let x = gx0; x <= gx1; x++) drawObject(c, Bk, x, y);
    c.restore();
  }

  let _grain = null;
  function grainPattern(c) {
    if (!_grain) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 96;
      const g = cv.getContext('2d'), img = g.createImageData(96, 96), d = img.data;
      const nz = S.makeNoise(4242);
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        // Feinkorn plus kleine Flecken (Büsche, Hecken, Bodenunterschiede), nahtlos kachelbar
        const v = 128 + (S.hash2(x, y, 77) - 0.5) * 50 + (nz(x * 0.25, y * 0.25) - 0.5) * 60;
        const o = (y * 96 + x) * 4; d[o] = d[o + 1] = d[o + 2] = Math.max(0, Math.min(255, v)); d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      _grain = cv;
    }
    return c.createPattern(_grain, 'repeat');
  }

  /** Detailblock in Auflösung res (Pixel pro Weltpixel) zeichnen */
  function renderChunk(cx, cy, res, reuse) {
    const Bk = makeBlock('d', cx, cy, CH, BP);
    Bk.terr = terrainImage(Bk, res >= 3 ? 8 : res >= 2 ? 6 : 4);
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
    // Städte aus der Luft: versiegelter Boden, viele kleine Dächer mit Schatten statt Kacheln
    const roofs = { R: ['#a2563f', '#8c4a38', '#7b7570', '#b0644a', '#6f6a66'], C: ['#8a8f96', '#a3a7ab', '#6e757d'], I: ['#a9adb0', '#9a9d9f', '#c0c3c5'] };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const id = y * W + x, bl = t.bld[id];
      const city = Bk.cities[t.city[id] - 1];
      if (!bl || bl >= 10) continue;
      const X = x * OVR, Y = y * OVR, lv = t.lvl[id] || 1;
      c.fillStyle = bl === S.U.R && lv <= 2 ? 'rgba(130,128,110,0.45)' : 'rgba(150,146,138,0.75)';
      c.fillRect(X, Y, OVR, OVR);
      const pal = bl === S.U.C ? roofs.C : bl === S.U.I ? roofs.I : roofs.R;
      const n = bl === S.U.I ? 1 : lv <= 2 ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const h = S.hash2(x * 7 + k, y * 5 + k, 61), h2 = S.hash2(x * 3 + k, y * 11, 62);
        const w = bl === S.U.I ? OVR * 0.8 : lv >= 3 ? OVR * 0.55 : OVR * 0.32, d = bl === S.U.I ? OVR * 0.6 : lv >= 3 ? OVR * 0.45 : OVR * 0.28;
        const rx = X + h * (OVR - w), ry = Y + h2 * (OVR - d);
        c.fillStyle = 'rgba(10,14,18,0.35)'; c.fillRect(rx + 0.8, ry + 0.7, w, d);
        c.fillStyle = bl === S.U.HALL ? '#c8b07a' : pal[Math.floor(S.hash2(x + k, y, 63) * pal.length)];
        c.fillRect(rx, ry, w, d);
      }
    }
    // Staatsbauten als Flächen in ihrer Grundfarbe
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const bl = t.bld[y * W + x];
      if (bl < 10) continue;
      c.fillStyle = bl === 10 ? 'rgba(190,170,96,0.8)' : bl === 21 ? '#2a4a72' : bl === 32 ? '#6f9f50' : bl === 23 ? '#3f6f88' : 'rgba(150,146,138,0.85)';
      c.fillRect(x * OVR + 0.5, y * OVR + 0.5, OVR - 1, OVR - 1);
    }
    c.strokeStyle = '#4a4b4c'; c.lineWidth = 1.6; c.lineCap = 'round';
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
    if (!World.city) drawBorders(c, Bk, 0, 0, W - 1, H - 1, OVR, { w: 2.4, dash: [7, 5] });
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
  // ---------------- Umland (Stadtmodus): grobe Geländebilder rund um die Stadt ----------------
  const REGION_LEVELS = [[8, 512], [2, 512]];   // [Felder je Pixel, Pixel]
  function regionImage(G, step, n) {
    const cx = G.gx0 + G.W / 2, cy = G.gy0 + G.H / 2;
    const gx0 = Math.round((cx - n * step / 2) / step) * step, gy0 = Math.round((cy - n * step / 2) / step) * step;
    const Bk = World.sampleBlock(gx0, gy0, n, n, step);
    Bk.noiseScale = step >= 8 ? 4 : 2;
    const cv = terrainImage(Bk, 1);
    // Ränder weich ausblenden
    const ctx = cv.getContext('2d'), img = ctx.getImageData(0, 0, n, n), d = img.data, fe = n * 0.2;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = Math.min(x, y, n - 1 - x, n - 1 - y) / fe;
      if (k < 1) d[(y * n + x) * 4 + 3] = 255 * k * k * (3 - 2 * k);
    }
    ctx.putImageData(img, 0, 0);
    return { cv, gx0, gy0, size: n * step };
  }
  function drawRegion(c, G, flatA) {
    if (!R.region || R.region.G !== G) R.region = { G, levels: [], next: 0, t: 0 };
    const Rg = R.region;
    // eine Stufe pro Bild nachbauen, sobald die Karte ruht
    if (Rg.next < REGION_LEVELS.length && performance.now() - Rg.t > 300 && R.renderedNow === 0) {
      const [step, n] = REGION_LEVELS[Rg.next++];
      Rg.levels.push(regionImage(G, step, n));
      Rg.t = performance.now(); R.renderedNow++;
    }
    c.globalAlpha = flatA;
    for (const L of Rg.levels) {
      for (const k of [-1, 0, 1]) {
        const wx = (L.gx0 - G.gx0 + k * World.WT) * TS, wy = (L.gy0 - G.gy0) * TS;
        c.drawImage(L.cv, wx, wy, L.size * TS, L.size * TS);
      }
    }
  }

  function worldTexture() {
    if (R.wtex) return R.wtex;
    S.Sat.build();
    R.wtex = S.Sat.cv; R.wtexData = S.Sat.data;
    return R.wtex;
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
  const GROUND = { historisch: '#a9a396', modern: '#a2a6a8', garten: '#8ea86a', industrie: '#958f84', mediterran: '#cdbfa2' };

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
      // Stadtboden wie im Luftbild: Vororte zeigen Gärten (das Gelände bleibt sichtbar), dichte Viertel sind versiegelt
      const city = G.cities[t.city[id] - 1];
      const lv = t.lvl[id] || 1, h = S.hash2(x, y, 23);
      const garden = b === U.R && (lv <= 2 || (city && city.style === 'garten'));
      if (garden) {
        c.fillStyle = 'rgba(96,124,70,0.35)'; c.fillRect(X, Y, TS, TS);
        // Gartenparzellen mit Hecken
        c.strokeStyle = 'rgba(52,74,40,0.35)'; c.lineWidth = 0.6;
        c.beginPath(); c.moveTo(X + 12 + (h - 0.5) * 4, Y); c.lineTo(X + 12 + (h - 0.5) * 4, Y + TS); c.stroke();
      } else if (b) {
        c.globalAlpha *= lv >= 3 || b !== U.R ? 0.85 : 0.6;
        c.fillStyle = city ? GROUND[city.style] : '#a6a196';
        c.fillRect(X, Y, TS, TS);
        c.globalAlpha = c.globalAlpha / (lv >= 3 || b !== U.R ? 0.85 : 0.6);
        c.fillStyle = 'rgba(0,0,0,' + (0.04 + h * 0.06).toFixed(3) + ')'; c.fillRect(X + h * 8, Y + 2, 6, 6);
      } else {
        // Straße in der Stadt: Gehweg beidseitig, sonst Gelände
        c.fillStyle = 'rgba(150,146,138,0.45)'; c.fillRect(X + 4, Y + 4, TS - 8, TS - 8);
      }
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
      const passes = water ? [['#5a4c3e', 9], ['#8a7a64', 7]] : city ? [['#3c3e40', 8], ['#56585b', 6.4]] : [['#3f3f3c', 7], ['#626360', 5.2]];
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
        c.strokeStyle = 'rgba(235,235,225,0.7)'; c.lineWidth = 0.7; c.setLineDash([2.5, 3]);
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
  // ---------------- Draufsicht wie im Luftbild: Dächer, Schatten nach Südosten ----------------
  const SUN_X = 0.5, SUN_Y = 0.38;   // Schattenlänge je Höhe (Sonne aus Nordwesten)
  function shadow(c, x, y, w, d, h) {
    const ox = h * SUN_X, oy = h * SUN_Y;
    c.fillStyle = 'rgba(10,14,18,0.36)';
    c.beginPath();
    c.moveTo(x + w, y); c.lineTo(x + w + ox, y + oy); c.lineTo(x + w + ox, y + d + oy); c.lineTo(x + ox, y + d + oy); c.lineTo(x, y + d);
    c.lineTo(x + w, y + d); c.closePath(); c.fill();
  }
  function roundShadow(c, x, y, r, h) {
    const ox = h * SUN_X, oy = h * SUN_Y;
    c.fillStyle = 'rgba(10,14,18,0.34)';
    c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = r * 2; c.strokeStyle = 'rgba(10,14,18,0.34)'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + ox, y + oy); c.stroke();
  }
  /**
   * Gebäude von oben: Grundfläche (x, y, w, d), Höhe h nur über den Schatten.
   * opt.pitched: Satteldach mit First (Nordwesthälfte hell, Südosthälfte dunkel); sonst Flachdach mit Aufbauten.
   */
  function box(c, x, y, w, d, h, wall, roof, opt) {
    opt = opt || {};
    shadow(c, x, y, w, d, h);
    if (opt.pitched) {
      const along = w >= d;   // First entlang der längeren Seite
      c.fillStyle = roof; c.fillRect(x, y, w, d);
      c.fillStyle = 'rgba(255,248,235,0.16)';
      if (along) c.fillRect(x, y, w, d / 2); else c.fillRect(x, y, w / 2, d);
      c.fillStyle = 'rgba(0,0,0,0.2)';
      if (along) c.fillRect(x, y + d / 2, w, d / 2); else c.fillRect(x + w / 2, y, w / 2, d);
      c.strokeStyle = 'rgba(30,20,15,0.35)'; c.lineWidth = 0.5;
      c.beginPath();
      if (along) { c.moveTo(x + 0.3, y + d / 2); c.lineTo(x + w - 0.3, y + d / 2); } else { c.moveTo(x + w / 2, y + 0.3); c.lineTo(x + w / 2, y + d - 0.3); }
      c.stroke();
    } else {
      c.fillStyle = opt.flat || roof; c.fillRect(x, y, w, d);
      if (opt.glass) {
        const g = c.createLinearGradient(x, y, x + w, y + d);
        g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
        c.fillStyle = g; c.fillRect(x, y, w, d);
      } else if (w * d > 50) {
        // Dachaufbauten: Lüftung, Oberlichter
        c.fillStyle = 'rgba(235,235,230,0.55)';
        const n = Math.min(4, Math.floor(w * d / 50));
        for (let k = 0; k < n; k++) { const hx = S.hash2(Math.round(x * 3) + k, Math.round(y * 3), 31), hy = S.hash2(Math.round(x * 3), Math.round(y * 3) + k, 32); c.fillRect(x + 1 + hx * (w - 3.5), y + 1 + hy * (d - 3), 2.2, 1.6); }
      }
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 0.6;
      c.strokeRect(x + 0.3, y + 0.3, w - 0.6, d - 0.6);
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x + 0.6, y + 0.6, w - 1.2, 0.9);
    }
  }
  // Baumkronen von oben: weiche Kugeln mit Licht von Nordwesten, Schatten nach Südosten
  const treeCache = new Map();
  function treeSprite(kind, v) {
    const key = kind + v;
    let e = treeCache.get(key);
    if (e) return e;
    const k = 4, Wd = 16;
    const cv = document.createElement('canvas');
    cv.width = Wd * k; cv.height = Wd * k;
    const c = cv.getContext('2d');
    c.scale(k, k);
    const rnd = S.rng(v * 31 + kind.length * 7);
    const x = Wd / 2, y = Wd / 2;
    const base = kind === 'conifer' ? [[34, 62, 44], [30, 56, 40], [40, 70, 50]][v % 3]
      : kind === 'jungle' ? [[30, 82, 40], [38, 92, 44], [26, 72, 36]][v % 3]
      : [[60, 94, 44], [72, 104, 48], [54, 86, 42], [82, 108, 52], [66, 96, 40], [58, 100, 50]][v % 6];
    const col = (q, f) => 'rgb(' + base.map(b => Math.round(b + q)).join(',') + ')';
    if (kind === 'palm') {
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2 + rnd() * 0.3;
        c.strokeStyle = i % 2 ? '#4a7f3a' : '#3a6c30'; c.lineWidth = 1.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3 - 1, x + Math.cos(a) * 6, y + Math.sin(a) * 6); c.stroke();
      }
    } else {
      const blobs = kind === 'conifer' ? 1 : 4;
      const R0 = kind === 'conifer' ? 3.4 : kind === 'jungle' ? 5 : 4.3;
      for (let i = 0; i < blobs; i++) {
        const bx = x + (i ? (rnd() - 0.5) * 3.4 : 0), by = y + (i ? (rnd() - 0.5) * 3.4 : 0), br = R0 * (i ? 0.62 + rnd() * 0.25 : 0.85);
        const g = c.createRadialGradient(bx - br * 0.4, by - br * 0.45, br * 0.1, bx, by, br);
        g.addColorStop(0, col(44)); g.addColorStop(0.6, col(0)); g.addColorStop(1, col(-24));
        c.fillStyle = g;
        if (kind === 'conifer') {
          // Nadelbaum: gezackter Rand
          c.beginPath();
          for (let s = 0; s < 14; s++) { const a = s / 14 * Math.PI * 2, rr = s % 2 ? br * 0.72 : br; s ? c.lineTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr) : c.moveTo(bx + Math.cos(a) * rr, by + Math.sin(a) * rr); }
          c.closePath(); c.fill();
        } else { c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill(); }
      }
    }
    e = { cv, w: Wd };
    treeCache.set(key, e);
    return e;
  }
  function tree(c, x, y, r, kind) {
    const v = Math.floor(S.hash2(Math.round(x * 3), Math.round(y * 3), 5) * 6);
    const sc = r / 3.8;
    // Schlagschatten nach Südosten
    c.fillStyle = 'rgba(10,18,10,0.32)';
    c.beginPath(); c.ellipse(x + r * 0.75, y + r * 0.55, r * 1.05, r * 0.85, 0.5, 0, Math.PI * 2); c.fill();
    const e = treeSprite(kind, v);
    c.drawImage(e.cv, x - e.w / 2 * sc, y - e.w / 2 * sc, e.w * sc, e.w * sc);
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
      const n = kind === 'jungle' ? 5 : 6;
      for (let k = 0; k < n; k++) {
        const hx = S.hash2(x * 7 + k, y * 13, 77), hy = S.hash2(x * 5, y * 11 + k, 78);
        tree(c, X + 4 + hx * (TS - 8), Y + 6 + hy * (TS - 8), kind === 'jungle' ? 4.6 : 3.6 + hx, kind);
      }
    } else if (t.elev[id] >= S.MOUNTAIN_E) {
      // Fels und Geröll; die Berge selbst zeigt das Relief
      for (let k = 0; k < 3; k++) {
        const hx = X + 4 + S.hash2(x * 3 + k, y, 3) * (TS - 8), hy = Y + 6 + S.hash2(x, y * 3 + k, 4) * (TS - 10), rr = 1.6 + S.hash2(x + k, y + k, 9) * 2.4;
        c.fillStyle = 'rgba(30,26,22,0.25)'; c.beginPath(); c.ellipse(hx + rr * 0.6, hy + rr * 0.4, rr * 1.1, rr * 0.55, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#8d8579'; c.beginPath(); c.moveTo(hx - rr, hy + rr * 0.4); c.lineTo(hx - rr * 0.3, hy - rr); c.lineTo(hx + rr, hy - rr * 0.2); c.lineTo(hx + rr * 0.8, hy + rr * 0.5); c.closePath(); c.fill();
        c.fillStyle = '#b3aa9c'; c.beginPath(); c.moveTo(hx - rr, hy + rr * 0.4); c.lineTo(hx - rr * 0.3, hy - rr); c.lineTo(hx + rr * 0.1, hy); c.closePath(); c.fill();
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
    const med = sk === 'mediterran', mod = sk === 'modern';
    const flatC = med ? st.wall : mod ? '#8f9296' : '#8a8780';
    if (b === U.HALL) {
      c.fillStyle = 'rgba(205,198,184,0.9)'; c.fillRect(X + 1, Y + 16, TS - 2, 7);   // Platz
      box(c, X + 3, Y + 3, 18, 13, 9, st.wallD, med || mod ? flatC : st.roof, { pitched: !(med || mod) });
      box(c, X + 9.5, Y + 6.5, 5, 5, 22, st.wallD, st.roofD, { pitched: false, flat: st.roofD });
      c.fillStyle = R.flagColor || '#c0392b'; c.fillRect(X + 18, Y + 18, 3, 2);
      return;
    }
    if (b === U.R) {
      if (l === 1 || (l === 2 && sk === 'garten')) {
        const n = l === 1 ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const hx = X + 2 + ((k * 9 + h1 * 6) % 12), hy = Y + 2 + ((k * 7 + h2 * 9) % 13);
          box(c, hx, hy, 7 + h2 * 2, 5.5 + h1 * 1.5, 4, st.wallD, med ? st.wall : st.roof, { pitched: !med });
        }
        tree(c, X + 18 - h2 * 10, Y + 19 - h1 * 4, 2.8, 'leaf');
        if (sk === 'garten' || h1 < 0.4) tree(c, X + 5 + h1 * 6, Y + 19, 2.4, 'leaf');
        return;
      }
      if (l === 2) {
        if (med) {
          box(c, X + 2, Y + 2, 9, 8, 5, st.wallD, st.wall); box(c, X + 12, Y + 4, 10, 8, 6, st.wallD, st.wall);
          box(c, X + 3, Y + 13, 10, 8, 5, st.wallD, st.wall); tree(c, X + 18, Y + 17, 2.4, 'leaf');
        } else {
          box(c, X + 2, Y + 2, 20, 7, 6, st.wallD, mod ? flatC : st.roof, { pitched: !mod });
          box(c, X + 2, Y + 13, 20, 7, 6, st.wallD, mod ? flatC : st.roof, { pitched: !mod });
        }
        return;
      }
      if (l === 3) {
        if (sk === 'historisch' || sk === 'industrie') {
          // Blockrand mit begrüntem Innenhof
          c.fillStyle = '#7d9a5c'; c.fillRect(X + 7, Y + 7, 10, 10);
          box(c, X + 2, Y + 2, 20, 5, 9, st.wallD, st.roof, { pitched: true });
          box(c, X + 2, Y + 7, 5, 10, 9, st.wallD, st.roof, { pitched: true });
          box(c, X + 17, Y + 7, 5, 10, 9, st.wallD, st.roof, { pitched: true });
          box(c, X + 2, Y + 17, 20, 5, 9, st.wallD, st.roof, { pitched: true });
        } else if (sk === 'garten') {
          box(c, X + 2, Y + 3, 13, 10, 9, st.wallD, st.roof, { flat: '#6f9a52' });
          tree(c, X + 19, Y + 9, 3, 'leaf'); tree(c, X + 7, Y + 19, 2.8, 'leaf');
        } else box(c, X + 3, Y + 3, 18, 15, 11, st.wallD, flatC);
        return;
      }
      if (l === 4) { box(c, X + 3, Y + 3, 17, 15, 20, st.wallD, '#8d8b86'); return; }
      // Stufe 5: Hochhaus mit Glasdach und langem Schatten
      box(c, X + 5, Y + 5, 13, 12, 38 + h1 * 10, st.wallD, '#6d8aa0', { glass: true });
      return;
    }
    if (b === U.C) {
      if (l <= 2) {
        const n = l === 1 ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const hx = X + 2 + k * (20 / n), hy = Y + 4 + (k % 2) * 6;
          box(c, hx, hy, 20 / n - 1.5, 9, 5 + l, st.wallD, med ? st.wall : k % 2 ? '#9a958c' : '#7f7a72');
        }
        c.fillStyle = 'rgba(70,72,76,0.5)'; c.fillRect(X + 2, Y + 18, 20, 4);   // Parkplatz
        return;
      }
      if (l === 3) { box(c, X + 3, Y + 4, 18, 14, 13, st.wallD, sk === 'historisch' ? st.roof : '#7f8b96', { pitched: sk === 'historisch' }); return; }
      const h = l === 4 ? 26 : 44 + h2 * 10;
      box(c, X + 4, Y + 5, 15, 13, h, st.wallD, '#5f7f99', { glass: true });
      return;
    }
    if (b === U.I) {
      // Hallen mit Oberlichtbändern, Schornstein, Tanks
      box(c, X + 2, Y + 3, 16, 13, 6 + l, '#9a9690', sk === 'industrie' ? '#a49a8e' : '#a9adb0');
      c.fillStyle = 'rgba(200,215,225,0.55)';
      for (let k = 0; k < 4; k++) c.fillRect(X + 3.5 + k * 3.8, Y + 4.5, 1.4, 10);
      if (l >= 2) box(c, X + 19, Y + 4, 3, 3, 14 + l * 3, '#7d4a3a', '#5a3328');
      if (l >= 3) for (const ox of [6, 13]) { roundShadow(c, X + ox, Y + 20, 2.6, 3); dot(c, X + ox, Y + 20, 2.6, '#c8c4bd'); dot(c, X + ox - 0.7, Y + 19.3, 1.2, '#e2ded7'); }
      c.fillStyle = 'rgba(70,72,76,0.45)'; c.fillRect(X + 2, Y + 17, l >= 3 ? 2 : 18, 4);
    }
  }

  // ---------------- Staatsgebäude ----------------
  function drawBuilding(c, G, b, X, Y, x, y) {
    switch (b) {
      case 10: { // Bauernhof: Feldstreifen und Hof von oben
        const crops = ['#c9b766', '#8fae55', '#a98f58', '#7aa04c'];
        for (let k = 0; k < 4; k++) {
          c.fillStyle = crops[(k + x + y) % 4];
          c.fillRect(X, Y + k * 6, TS, 6);
          c.fillStyle = 'rgba(0,0,0,0.07)';
          for (let s = 0; s < TS; s += 2.5) c.fillRect(X + s, Y + k * 6, 0.8, 6);
        }
        box(c, X + 14, Y + 13, 8, 6, 5, '#a8432f', '#8a3a2a', { pitched: true });
        box(c, X + 15, Y + 6, 5, 4, 3, '#8a7a6a', '#7a6a5a');
        break;
      }
      case 11: { // Fischerei
        box(c, X + 3, Y + 4, 12, 9, 6, '#8a6d4d', '#5d7f99', { pitched: true });
        c.fillStyle = '#7a5a3a'; c.fillRect(X + 13, Y + 14, 10, 2.2);
        c.fillStyle = '#e8e4da'; c.beginPath(); c.ellipse(X + 18, Y + 20, 4.5, 1.6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#c0392b'; c.fillRect(X + 16.5, Y + 19.3, 3, 1.4);
        break;
      }
      case 12: { // Sägewerk mit Holzstapeln
        box(c, X + 2, Y + 3, 13, 10, 6, '#9b7650', '#6a5038', { pitched: true });
        for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) dot(c, X + 4 + k * 3, Y + 17 + r * 3, 1.4, (k + r) % 2 ? '#a77b45' : '#c9995a');
        c.fillStyle = '#b7894f'; c.fillRect(X + 17, Y + 15, 5, 7);
        break;
      }
      case 13: { // Bergwerk: Tagebau-Terrassen und Förderturm von oben
        for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#8a7d6c' : '#6e6355'; c.beginPath(); c.ellipse(X + 9, Y + 15, 8 - k * 1.8, 6 - k * 1.3, 0, 0, Math.PI * 2); c.fill(); }
        dot(c, X + 9, Y + 15, 1.6, '#2f2a26');
        box(c, X + 17, Y + 3, 4, 4, 14, '#5a524a', '#4a4440');
        box(c, X + 15, Y + 10, 7, 5, 4, '#9a8f84', '#7d746b');
        break;
      }
      case 14: { // Ölpumpe: Betonplatz, Pumpenbalken mit Schatten
        c.fillStyle = '#a39e94'; c.fillRect(X + 4, Y + 6, 16, 12);
        c.strokeStyle = 'rgba(10,14,18,0.35)'; c.lineWidth = 2; c.beginPath(); c.moveTo(X + 9, Y + 15); c.lineTo(X + 21, Y + 15); c.stroke();
        c.strokeStyle = '#2a2a2a'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(X + 6, Y + 11); c.lineTo(X + 18, Y + 11); c.stroke();
        c.fillStyle = '#c0392b'; c.fillRect(X + 4.5, Y + 9.5, 3, 3);
        dot(c, X + 12, Y + 11, 1.6, '#555');
        break;
      }
      case 15: { // Fabrik: Sheddach, Schornstein mit langem Schatten
        box(c, X + 2, Y + 4, 17, 14, 8, '#8e6a58', '#7a736c');
        c.fillStyle = 'rgba(190,205,215,0.6)';
        for (let k = 0; k < 4; k++) c.fillRect(X + 3.5 + k * 4, Y + 5, 1.5, 12);
        box(c, X + 19, Y + 3, 3.5, 3.5, 20, '#8a4d3b', '#5a3328');
        break;
      }
      case 16: { // Hafen: Kai, Container, Kran
        c.fillStyle = '#8c8577'; c.fillRect(X + 1, Y + 10, TS - 2, 13);
        const cols = ['#b5422f', '#2e76a8', '#d9a12a', '#2f8f57', '#8a8f96', '#b5422f'];
        for (let k = 0; k < 6; k++) box(c, X + 3 + (k % 3) * 6, Y + 12 + ((k / 3) | 0) * 4.5, 5, 3.4, 2.5, cols[k], cols[k]);
        c.strokeStyle = 'rgba(10,14,18,0.35)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X + 21, Y + 3); c.lineTo(X + 23.5, Y + 12); c.stroke();
        c.strokeStyle = '#d4a017'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(X + 19, Y + 1); c.lineTo(X + 19, Y + 10); c.moveTo(X + 16, Y + 2); c.lineTo(X + 22, Y + 2); c.stroke();
        break;
      }
      case 17: { // Flughafen: Rollbahn mit Markierungen, Terminal, Tower
        c.fillStyle = '#55585c'; c.fillRect(X, Y + 13, TS, 7);
        c.fillStyle = '#f2f2f2';
        for (let k = 0; k < 4; k++) c.fillRect(X + 2 + k * 6, Y + 16.2, 3, 0.8);
        box(c, X + 2, Y + 3, 13, 7, 5, '#c9d3dc', '#b9c3cc');
        box(c, X + 18, Y + 4, 3, 3, 12, '#d8dde2', '#7fb3d6', { glass: true });
        c.fillStyle = '#e8ecef'; c.beginPath(); c.moveTo(X + 10, Y + 22); c.lineTo(X + 14, Y + 21); c.lineTo(X + 10, Y + 20); c.closePath(); c.fill();
        break;
      }
      case 18: { // Kaserne: Exerzierplatz und Blöcke
        c.fillStyle = '#a99f8a'; c.fillRect(X + 2, Y + 12, 20, 10);
        c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.6; c.strokeRect(X + 4, Y + 14, 16, 6);
        box(c, X + 2, Y + 2, 9, 8, 6, '#6b6a55', '#5e6146', { pitched: true });
        box(c, X + 13, Y + 2, 9, 8, 6, '#6b6a55', '#5e6146', { pitched: true });
        break;
      }
      case 19: { // Festung: sternförmiger Wall
        c.fillStyle = '#8f8a7c';
        c.beginPath();
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 6 : 10.5; k ? c.lineTo(X + 12 + Math.cos(a) * r, Y + 12 + Math.sin(a) * r) : c.moveTo(X + 12 + Math.cos(a) * r, Y + 12 + Math.sin(a) * r); }
        c.closePath(); c.fill();
        c.strokeStyle = 'rgba(10,14,18,0.35)'; c.lineWidth = 1.2; c.stroke();
        c.fillStyle = '#6f8a58'; c.beginPath(); c.arc(X + 12, Y + 12, 4.5, 0, Math.PI * 2); c.fill();
        break;
      }
      case 20: { // Kohlekraftwerk: Kühlturm von oben, Halle, Schornstein, Kohlehalde
        roundShadow(c, X + 8, Y + 8, 6.5, 14);
        dot(c, X + 8, Y + 8, 6.5, '#a8a29a'); dot(c, X + 8, Y + 8, 4.6, '#5f5a55');
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.beginPath(); c.arc(X + 8, Y + 8, 6.5, Math.PI * 1.05, Math.PI * 1.6); c.lineTo(X + 8, Y + 8); c.fill();
        box(c, X + 15, Y + 12, 7, 9, 6, '#6e6660', '#6a635d');
        box(c, X + 17, Y + 3, 2.6, 2.6, 18, '#7a3a2c', '#3e2a24');
        dot(c, X + 6, Y + 19, 3.2, '#2b2a28');
        break;
      }
      case 21: { // Solarpark
        for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
          c.fillStyle = 'rgba(10,14,18,0.3)'; c.fillRect(X + 2.6 + k * 11, Y + 3.8 + r * 7, 9.5, 5);
          c.fillStyle = '#20406a'; c.fillRect(X + 2 + k * 11, Y + 3 + r * 7, 9.5, 5);
          c.fillStyle = 'rgba(140,180,230,0.35)'; c.fillRect(X + 2 + k * 11, Y + 3 + r * 7, 9.5, 1.2);
          c.strokeStyle = 'rgba(200,220,255,0.3)'; c.lineWidth = 0.4;
          c.beginPath(); for (let q = 1; q < 4; q++) { c.moveTo(X + 2 + k * 11 + q * 2.4, Y + 3 + r * 7); c.lineTo(X + 2 + k * 11 + q * 2.4, Y + 8 + r * 7); } c.stroke();
        }
        break;
      }
      case 22: { // Windpark: Rotoren von oben, lange Mastschatten
        for (const [ox, oy, hgt] of [[7, 8, 18], [17, 16, 15]]) {
          const hx = X + ox, hy = Y + oy, a0 = S.hash2(x, y, ox) * 6;
          c.strokeStyle = 'rgba(10,14,18,0.3)'; c.lineWidth = 1.2;
          c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + hgt * SUN_X, hy + hgt * SUN_Y); c.stroke();
          c.strokeStyle = '#f4f6f8'; c.lineWidth = 1.3;
          c.beginPath();
          for (let k = 0; k < 3; k++) { const a = a0 + k * 2.094; c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a) * 7, hy + Math.sin(a) * 7); }
          c.stroke();
          dot(c, hx, hy, 1.3, '#d0d4d8');
        }
        break;
      }
      case 23: { // Wasserkraft: Stausee und Mauer
        c.fillStyle = '#3f6f88'; c.fillRect(X, Y, TS, TS * 0.42);
        c.fillStyle = '#c7c3bb'; c.fillRect(X, Y + 10, TS, 4);
        c.fillStyle = 'rgba(10,14,18,0.3)'; c.fillRect(X, Y + 14, TS, 2);
        c.fillStyle = 'rgba(235,245,250,0.75)';
        for (let k = 0; k < 3; k++) c.fillRect(X + 4 + k * 7, Y + 14, 2, 6);
        break;
      }
      case 24: { // Kernkraftwerk: zwei Kühltürme, Reaktorkuppel
        for (const [ox, oy] of [[6, 7], [17, 7]]) {
          roundShadow(c, X + ox, Y + oy, 5.5, 16);
          dot(c, X + ox, Y + oy, 5.5, '#c4c0b8'); dot(c, X + ox, Y + oy, 3.8, '#6d6862');
          c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.arc(X + ox, Y + oy, 5.5, Math.PI * 1.05, Math.PI * 1.6); c.lineTo(X + ox, Y + oy); c.fill();
        }
        roundShadow(c, X + 12, Y + 18, 3.6, 5);
        const g = c.createRadialGradient(X + 10.8, Y + 16.8, 0.5, X + 12, Y + 18, 3.6);
        g.addColorStop(0, '#fbf8f2'); g.addColorStop(1, '#bdb8ae');
        c.fillStyle = g; c.beginPath(); c.arc(X + 12, Y + 18, 3.6, 0, Math.PI * 2); c.fill();
        break;
      }
      case 30: { // Universität: Flügelbau mit Hof und Kuppel
        c.fillStyle = '#8fae6a'; c.fillRect(X + 6, Y + 9, 12, 8);
        box(c, X + 2, Y + 3, 20, 6, 8, '#e9e2d0', '#a9573f', { pitched: true });
        box(c, X + 2, Y + 9, 4, 11, 8, '#e9e2d0', '#a9573f', { pitched: true });
        box(c, X + 18, Y + 9, 4, 11, 8, '#e9e2d0', '#a9573f', { pitched: true });
        roundShadow(c, X + 12, Y + 6, 2.6, 6); dot(c, X + 12, Y + 6, 2.6, '#5f8f7a');
        break;
      }
      case 31: { // Krankenhaus: Flachdach mit Hubschrauberlandeplatz
        box(c, X + 2, Y + 3, 20, 17, 12, '#eef0f2', '#d9dde1');
        c.fillStyle = '#6f7378'; c.beginPath(); c.arc(X + 15, Y + 13, 4.2, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#ffffff'; c.lineWidth = 0.7; c.beginPath(); c.arc(X + 15, Y + 13, 3.4, 0, Math.PI * 2); c.stroke();
        c.fillStyle = '#ffffff'; c.font = 'bold 4px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', X + 15, Y + 13.2);
        c.fillStyle = '#d6322b'; c.fillRect(X + 5.5, Y + 6, 2.2, 6); c.fillRect(X + 3.6, Y + 7.9, 6, 2.2);
        break;
      }
      case 32: { // Park
        c.fillStyle = '#6f9f50'; c.fillRect(X + 1, Y + 1, TS - 2, TS - 2);
        c.strokeStyle = '#d9cfb4'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(X + 1, Y + 16); c.quadraticCurveTo(X + 12, Y + 8, X + 23, Y + 13); c.stroke();
        c.fillStyle = '#3f6f88'; c.beginPath(); c.ellipse(X + 8, Y + 7, 4, 2.5, 0, 0, Math.PI * 2); c.fill();
        tree(c, X + 17, Y + 7, 3.2, 'leaf'); tree(c, X + 6, Y + 19, 3, 'leaf'); tree(c, X + 18, Y + 19, 2.6, 'leaf');
        break;
      }
      case 33: { // Stadion von oben
        roundShadow(c, X + 12, Y + 12, 10, 4);
        c.fillStyle = '#c9c4ba'; c.beginPath(); c.ellipse(X + 12, Y + 12, 11, 9, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#9d978d'; c.beginPath(); c.ellipse(X + 12, Y + 12, 8.5, 6.6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#4f8f40'; c.fillRect(X + 7, Y + 9, 10, 6);
        c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 0.5; c.strokeRect(X + 7.4, Y + 9.4, 9.2, 5.2);
        c.beginPath(); c.moveTo(X + 12, Y + 9.4); c.lineTo(X + 12, Y + 14.6); c.stroke();
        break;
      }
      case 34: drawMonument(c, G, X, Y, x, y); break;
    }
  }

  /** Wahrzeichen im Stil der nächsten Stadt (von oben) */
  function drawMonument(c, G, X, Y, x, y) {
    const city = S.nearestCity(G, x, y);
    const sk = city ? city.style : 'historisch';
    const st = S.STYLES[sk];
    if (sk === 'historisch') { // Dom mit zwei Türmen
      box(c, X + 4, Y + 6, 16, 14, 14, '#d9cdb4', '#6f7a83', { pitched: true });
      for (const ox of [4, 15]) box(c, X + ox, Y + 2, 5, 5, 32, '#d2c5aa', '#56606a');
    } else if (sk === 'modern') { // Fernsehturm: Kugel, sehr langer Schatten
      c.strokeStyle = 'rgba(10,14,18,0.35)'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(X + 12, Y + 12); c.lineTo(X + 12 + 50 * SUN_X, Y + 12 + 50 * SUN_Y); c.stroke();
      c.fillStyle = 'rgba(10,14,18,0.35)'; c.beginPath(); c.arc(X + 12 + 32 * SUN_X, Y + 12 + 32 * SUN_Y, 4, 0, Math.PI * 2); c.fill();
      const g = c.createRadialGradient(X + 10.6, Y + 10.6, 0.5, X + 12, Y + 12, 4.5);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9aa3ab');
      c.fillStyle = g; c.beginPath(); c.arc(X + 12, Y + 12, 4.5, 0, Math.PI * 2); c.fill();
    } else if (sk === 'garten') { // Gewächshaus-Kuppel
      roundShadow(c, X + 12, Y + 12, 9, 5);
      c.fillStyle = 'rgba(170,215,230,0.9)'; c.beginPath(); c.arc(X + 12, Y + 12, 9, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.6;
      c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; c.moveTo(X + 12 + Math.cos(a) * 9, Y + 12 + Math.sin(a) * 9); c.lineTo(X + 12 - Math.cos(a) * 9, Y + 12 - Math.sin(a) * 9); } c.stroke();
    } else if (sk === 'industrie') { // Stahlturm: Gitter von oben, langer Schatten
      c.strokeStyle = 'rgba(10,14,18,0.3)'; c.lineWidth = 3; c.beginPath(); c.moveTo(X + 12, Y + 12); c.lineTo(X + 12 + 44 * SUN_X, Y + 12 + 44 * SUN_Y); c.stroke();
      c.strokeStyle = '#6b5a4c'; c.lineWidth = 1;
      c.strokeRect(X + 6, Y + 6, 12, 12); c.beginPath(); c.moveTo(X + 6, Y + 6); c.lineTo(X + 18, Y + 18); c.moveTo(X + 18, Y + 6); c.lineTo(X + 6, Y + 18); c.stroke();
    } else { // Kuppelpalast
      box(c, X + 3, Y + 6, 18, 14, 9, '#f4efe4', '#e8dfcc');
      roundShadow(c, X + 12, Y + 13, 5.5, 8);
      const g = c.createRadialGradient(X + 10.5, Y + 11.5, 0.5, X + 12, Y + 13, 5.5);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, st.accent);
      c.fillStyle = g; c.beginPath(); c.arc(X + 12, Y + 13, 5.5, 0, Math.PI * 2); c.fill();
      for (const ox of [3, 20]) box(c, X + ox - 1, Y + 4, 2.5, 2.5, 22, '#f4efe4', st.accent);
    }
  }

  // ---------------- Schrägansicht für Werkzeug-Symbole (die Karte zeigt Draufsicht) ----------------
  function shadowIcon(c, x, y, w, d, h) {
    // Sonne aus Nordwesten: Schatten fällt nach Südosten
    const ox = h * 0.42 + 0.8, oy = h * 0.2 + 0.6;
    c.fillStyle = 'rgba(14,18,22,0.3)';
    c.beginPath();
    c.moveTo(x + w, y); c.lineTo(x + w + ox, y + oy); c.lineTo(x + w + ox, y + d + oy); c.lineTo(x + ox, y + d + oy); c.lineTo(x, y + d); c.lineTo(x + w, y + d);
    c.closePath(); c.fill();
  }
  /** Quader in Schrägansicht: Grundfläche (x,y,w,d), Höhe h */
  function boxIcon(c, x, y, w, d, h, wall, roof, opt) {
    opt = opt || {};
    shadowIcon(c, x, y, w, d, h);
    c.fillStyle = wall;
    c.fillRect(x, y + d - h, w, h);
    // Wand: unten dunkler (Umgebungsverdeckung), rechte Kante im Schatten
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(x, y + d - h * 0.35, w, h * 0.35);
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x + w - Math.min(2, w * 0.2), y + d - h, Math.min(2, w * 0.2), h);
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
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y - h, w, Math.min(1.2, d * 0.2));
      c.strokeStyle = 'rgba(0,0,0,0.22)'; c.lineWidth = 0.6;
      c.strokeRect(x + 0.3, y - h + 0.3, w - 0.6, d - 0.6);
    }
  }
  // Bäume als vorgezeichnete Bilder: schattierte Kronen, Licht von Nordwesten
  const treeCacheIcon = new Map();
  function treeSpriteIcon(kind, v) {
    const key = kind + v;
    let e = treeCacheIcon.get(key);
    if (e) return e;
    const k = 4, Wd = 16, Hd = 22;
    const cv = document.createElement('canvas');
    cv.width = Wd * k; cv.height = Hd * k;
    const c = cv.getContext('2d');
    c.scale(k, k);
    const rnd = S.rng(v * 31 + kind.length * 7);
    const x = Wd / 2, y = Hd - 4;
    if (kind === 'conifer') {
      c.fillStyle = '#4a3a28'; c.fillRect(x - 0.5, y - 2, 1, 3);
      const base = [[38, 70, 52], [32, 62, 46], [44, 78, 58]][v % 3];
      for (let i = 0; i < 4; i++) {
        const w = 5.6 - i * 1.1, top = y - 3 - i * 3.2, h = 5.2;
        const g = c.createLinearGradient(x - w, 0, x + w, 0);
        g.addColorStop(0, 'rgb(' + base.map(q => q + 26).join(',') + ')'); g.addColorStop(1, 'rgb(' + base.map(q => q - 14).join(',') + ')');
        c.fillStyle = g;
        c.beginPath(); c.moveTo(x, top - h); c.lineTo(x + w, top + 1); c.quadraticCurveTo(x, top + 2, x - w, top + 1); c.closePath(); c.fill();
      }
    } else if (kind === 'palm') {
      c.strokeStyle = '#7d6444'; c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 1.5, y - 6, x + 1, y - 12); c.stroke();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        c.strokeStyle = i % 2 ? '#3f7a3a' : '#2f6a30'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x + 1, y - 12); c.quadraticCurveTo(x + 1 + Math.cos(a) * 3, y - 14 + Math.sin(a) * 1.5, x + 1 + Math.cos(a) * 6, y - 11 + Math.sin(a) * 3); c.stroke();
      }
    } else {
      const jungle = kind === 'jungle';
      const base = jungle ? [[30, 82, 40], [38, 92, 44], [26, 72, 36]][v % 3] : [[62, 98, 46], [74, 108, 50], [56, 88, 44], [86, 112, 54]][v % 4];
      c.fillStyle = '#4b3a28'; c.fillRect(x - 0.6, y - 4, 1.2, 4.5);
      const blobs = 5;
      for (let i = 0; i < blobs; i++) {
        const bx = x + (rnd() - 0.5) * 6, by = y - 8 + (rnd() - 0.5) * 5, br = 2.6 + rnd() * 2;
        const g = c.createRadialGradient(bx - br * 0.4, by - br * 0.5, br * 0.1, bx, by, br);
        g.addColorStop(0, 'rgb(' + base.map(q => q + 46).join(',') + ')');
        g.addColorStop(0.55, 'rgb(' + base.join(',') + ')');
        g.addColorStop(1, 'rgb(' + base.map(q => q - 22).join(',') + ')');
        c.fillStyle = g; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      }
    }
    e = { cv, w: Wd, h: Hd };
    treeCacheIcon.set(key, e);
    return e;
  }
  function treeIcon(c, x, y, r, kind) {
    const v = Math.floor(S.hash2(Math.round(x * 3), Math.round(y * 3), 5) * 6);
    const sc = r / 3.8;
    // Schlagschatten nach Südosten
    c.fillStyle = 'rgba(16,26,14,0.3)';
    c.beginPath(); c.ellipse(x + r * 0.9, y + r * 0.35, r * 1.15, r * 0.5, 0.3, 0, Math.PI * 2); c.fill();
    const e = treeSpriteIcon(kind, v);
    c.drawImage(e.cv, x - e.w / 2 * sc, y - (e.h - 4) * sc, e.w * sc, e.h * sc);
  }
  function drawUrbanIcon(c, G, id, X, Y, b, l, city) {
    const st = S.STYLES[city ? city.style : 'historisch'];
    const sk = city ? city.style : 'historisch';
    const h1 = S.hash2(id, 3, 11), h2 = S.hash2(id, 5, 13);
    const win = 'rgba(255,248,220,0.55)';
    const glass = sk === 'modern' ? '#7fb3d6' : '#9fb8c8';
    if (b === U.HALL) {
      if (sk === 'mediterran' || sk === 'modern') {
        boxIcon(c, X + 3, Y + 9, 18, 12, 9, st.wallD, st.wall, { win });
        dot(c, X + 12, Y + 2, 5.5, sk === 'modern' ? '#7fb3d6' : st.accent);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(X + 10.5, Y + 0.5, 2.5, 0, Math.PI * 2); c.fill();
      } else {
        boxIcon(c, X + 2, Y + 10, 20, 11, 8, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
        boxIcon(c, X + 10, Y + 6, 5, 5, 20, st.wall, st.roofD);
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
          if (sk === 'mediterran') boxIcon(c, hx, hy, 8, 6, 4, st.wallD, st.wall);
          else boxIcon(c, hx, hy, 8, 6, 4, st.wallD, st.roof, { pitched: true, roofD: st.roofD });
        }
        if (sk === 'garten' || h1 < 0.4) treeIcon(c, X + 18 - h2 * 10, Y + 20, 2.6, 'leaf');
        return;
      }
      if (l === 2) {
        if (sk === 'mediterran') {
          boxIcon(c, X + 2, Y + 4, 9, 7, 5, st.wallD, st.wall); boxIcon(c, X + 12, Y + 6, 10, 7, 6, st.wallD, st.wall);
          boxIcon(c, X + 4, Y + 14, 10, 7, 5, st.wallD, st.wall); dot(c, X + 18, Y + 15, 2.4, st.accent);
        } else {
          boxIcon(c, X + 2, Y + 3, 20, 7, 6, st.wallD, st.roof, { pitched: sk !== 'modern', roofD: st.roofD, win });
          boxIcon(c, X + 2, Y + 14, 20, 7, 6, st.wallD, st.roof, { pitched: sk !== 'modern', roofD: st.roofD, win });
        }
        return;
      }
      if (l === 3) {
        if (sk === 'historisch' || sk === 'industrie') {
          // Blockrand mit Innenhof
          boxIcon(c, X + 2, Y + 2, 20, 6, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
          boxIcon(c, X + 2, Y + 8, 6, 8, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
          boxIcon(c, X + 16, Y + 8, 6, 8, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
          boxIcon(c, X + 2, Y + 16, 20, 6, 9, st.wallD, st.roof, { pitched: true, roofD: st.roofD, win });
        } else if (sk === 'garten') {
          boxIcon(c, X + 2, Y + 4, 13, 9, 9, st.wallD, st.roof, { win });
          c.fillStyle = '#6ea851'; c.fillRect(X + 2, Y - 5, 13, 9);
          treeIcon(c, X + 19, Y + 12, 3, 'leaf'); treeIcon(c, X + 7, Y + 20, 2.6, 'leaf');
        } else {
          boxIcon(c, X + 3, Y + 4, 18, 15, 11, st.wallD, st.roof, { win });
        }
        return;
      }
      if (l === 4) {
        boxIcon(c, X + 3, Y + 6, 17, 14, 20, st.wallD, st.roof, { win });
        c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(X + 6, Y - 12, 5, 4);
        return;
      }
      // Stufe 5: Wolkenkratzer
      boxIcon(c, X + 5, Y + 8, 13, 12, 38 + h1 * 10, glass, '#5f8fb0', { win: 'rgba(230,245,255,0.55)' });
      c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(X + 5, Y + 20 - 38 - h1 * 10, 2, 38 + h1 * 10);
      return;
    }
    if (b === U.C) {
      if (l <= 2) {
        const n = l === 1 ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const hx = X + 2 + k * (20 / n), hy = Y + 6 + (k % 2) * 7;
          boxIcon(c, hx, hy, 20 / n - 1.5, 7, 5 + l, st.wallD, sk === 'mediterran' ? st.wall : '#8d8780', { win });
          c.fillStyle = k % 2 ? st.accent : '#d9534f';
          c.fillRect(hx, hy + 7 - 2.5, 20 / n - 1.5, 2);
        }
        return;
      }
      if (l === 3) {
        boxIcon(c, X + 3, Y + 5, 18, 14, 13, sk === 'historisch' ? st.wallD : '#8fa3b6', sk === 'historisch' ? st.roof : '#6f7f8e', { win: 'rgba(220,240,255,0.6)', pitched: sk === 'historisch', roofD: st.roofD });
        c.fillStyle = st.accent; c.fillRect(X + 3, Y + 17, 18, 2);
        return;
      }
      const h = l === 4 ? 26 : 44 + h2 * 10;
      boxIcon(c, X + 4, Y + 7, 15, 13, h, glass, '#4f7fa3', { win: 'rgba(230,245,255,0.6)' });
      c.fillStyle = st.accent; c.fillRect(X + 4, Y + 20 - h, 15, 2);
      return;
    }
    if (b === U.I) {
      const wall = sk === 'industrie' ? st.wall : '#9a9690', roof = '#6c6762';
      boxIcon(c, X + 2, Y + 7, 16, 12, 6 + l, wall, roof);
      // Sägezahndach
      c.fillStyle = '#84807a';
      for (let k = 0; k < 4; k++) c.fillRect(X + 3 + k * 4, Y + 7 - 6 - l, 2, 12);
      if (l >= 2) { boxIcon(c, X + 19, Y + 9, 3, 3, 14 + l * 3, '#7d4a3a', '#5a3328'); }
      if (l >= 3) { dot(c, X + 6, Y + 21, 3, '#c8c4bd'); dot(c, X + 13, Y + 21, 3, '#c8c4bd'); }
    }
  }

  function drawBuildingIcon(c, G, b, X, Y, x, y) {
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
        boxIcon(c, X + 14, Y + 13, 8, 7, 5, '#a8432f', '#7c2f22', { pitched: true, roofD: '#5e231a' });
        break;
      }
      case 11: { // Fischerei
        boxIcon(c, X + 4, Y + 8, 12, 9, 6, '#8a6d4d', '#5d7f99', { pitched: true, roofD: '#4a6a82' });
        c.fillStyle = '#7a5a3a'; c.fillRect(X + 14, Y + 16, 9, 2);
        c.fillStyle = '#d24b3a';
        c.beginPath(); c.moveTo(X + 16, Y + 20); c.lineTo(X + 23, Y + 20); c.lineTo(X + 21, Y + 23); c.lineTo(X + 17, Y + 23); c.closePath(); c.fill();
        break;
      }
      case 12: { // Sägewerk
        boxIcon(c, X + 3, Y + 7, 13, 10, 6, '#9b7650', '#6a5038', { pitched: true, roofD: '#4f3a28' });
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
        boxIcon(c, X + 2, Y + 4, 8, 6, 5, '#9a8f84', '#6d645c');
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
        boxIcon(c, X + 2, Y + 8, 17, 12, 8, '#8e6a58', '#5e5550');
        c.fillStyle = '#76706a';
        for (let k = 0; k < 4; k++) c.fillRect(X + 3 + k * 4, Y - 1, 2.2, 12);
        boxIcon(c, X + 18, Y + 6, 4, 4, 20, '#8a4d3b', '#5a3328');
        c.fillStyle = '#e6e2da'; c.fillRect(X + 18, Y - 9, 4, 1.5);
        break;
      }
      case 16: { // Hafen
        c.fillStyle = '#8c8577'; c.fillRect(X + 1, Y + 12, TS - 2, 11);
        const cols = ['#c0392b', '#2e86c1', '#f0b429', '#27ae60'];
        for (let k = 0; k < 4; k++) boxIcon(c, X + 3 + (k % 2) * 7, Y + 14 + ((k / 2) | 0) * 4, 6, 3, 2.5, cols[k], cols[k]);
        c.strokeStyle = '#d4a017'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(X + 19, Y + 21); c.lineTo(X + 19, Y + 2); c.lineTo(X + 10, Y + 4); c.moveTo(X + 19, Y + 2); c.lineTo(X + 23, Y + 4); c.stroke();
        break;
      }
      case 17: { // Flughafen
        c.fillStyle = '#5c5f63'; c.fillRect(X, Y + 13, TS, 7);
        c.fillStyle = '#f2f2f2';
        for (let k = 0; k < 4; k++) c.fillRect(X + 2 + k * 6, Y + 16, 3, 1);
        boxIcon(c, X + 3, Y + 4, 12, 6, 5, '#c9d3dc', '#9fb0bf', { win: 'rgba(120,170,210,0.8)' });
        boxIcon(c, X + 17, Y + 4, 3, 3, 12, '#d8dde2', '#7fb3d6');
        break;
      }
      case 20: { // Kohlekraftwerk
        c.fillStyle = '#9b958c';
        c.beginPath();
        c.moveTo(X + 3, Y + 21); c.quadraticCurveTo(X + 7, Y + 10, X + 4, Y + 1); c.lineTo(X + 14, Y + 1); c.quadraticCurveTo(X + 11, Y + 10, X + 15, Y + 21); c.closePath(); c.fill();
        c.fillStyle = '#b8b2a8';
        c.beginPath(); c.moveTo(X + 3, Y + 21); c.quadraticCurveTo(X + 7, Y + 10, X + 4, Y + 1); c.lineTo(X + 7, Y + 1); c.quadraticCurveTo(X + 9, Y + 10, X + 7, Y + 21); c.closePath(); c.fill();
        c.fillStyle = '#3a3633'; c.beginPath(); c.ellipse(X + 9, Y + 1, 5, 1.4, 0, 0, Math.PI * 2); c.fill();
        boxIcon(c, X + 17, Y + 12, 5, 8, 6, '#6e6660', '#4d4743');
        boxIcon(c, X + 19, Y + 8, 2.5, 2.5, 18, '#7a3a2c', '#3e2a24');
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
        boxIcon(c, X + 2, Y + 9, 20, 11, 8, '#e9e2d0', '#a9573f', { pitched: true, roofD: '#87432f' });
        c.fillStyle = '#fbf7ec';
        for (let k = 0; k < 5; k++) c.fillRect(X + 3.5 + k * 4, Y + 13, 1.5, 7);
        dot(c, X + 12, Y - 1, 4.2, '#5f8f7a');
        break;
      }
      case 31: { // Krankenhaus
        boxIcon(c, X + 2, Y + 7, 20, 13, 12, '#eef0f2', '#d7dbe0', { win: 'rgba(110,160,200,0.7)' });
        c.fillStyle = '#d6322b';
        c.fillRect(X + 10, Y - 3, 4, 10); c.fillRect(X + 7, Y, 10, 4);
        break;
      }
      case 32: { // Park
        c.fillStyle = '#7fbd5e'; c.fillRect(X + 1, Y + 1, TS - 2, TS - 2);
        c.strokeStyle = '#e6dcc1'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(X + 1, Y + 16); c.quadraticCurveTo(X + 12, Y + 8, X + 23, Y + 13); c.stroke();
        c.fillStyle = '#5aa0cf'; c.beginPath(); c.ellipse(X + 8, Y + 7, 4, 2.5, 0, 0, Math.PI * 2); c.fill();
        treeIcon(c, X + 17, Y + 8, 3.2, 'leaf'); treeIcon(c, X + 6, Y + 20, 3, 'leaf'); treeIcon(c, X + 18, Y + 21, 2.6, 'leaf');
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
      case 34: drawMonumentIcon(c, G, X, Y, x, y); break;
    }
  }

  /** Wahrzeichen im Stil der nächsten Stadt */
  function drawMonumentIcon(c, G, X, Y, x, y) {
    const city = S.nearestCity(G, x, y);
    const sk = city ? city.style : 'historisch';
    const st = S.STYLES[sk];
    if (sk === 'historisch') { // Dom
      boxIcon(c, X + 4, Y + 8, 16, 13, 12, '#d9cdb4', '#6f7a83', { pitched: true, roofD: '#56606a' });
      for (const ox of [4, 15]) {
        boxIcon(c, X + ox, Y + 6, 5, 5, 26, '#d2c5aa', '#56606a');
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
      treeIcon(c, X + 12, Y + 16, 3, 'palm');
    } else if (sk === 'industrie') { // Stahlturm
      c.strokeStyle = '#6b5a4c'; c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(X + 3, Y + 21); c.quadraticCurveTo(X + 10, Y + 5, X + 12, Y - 30); c.quadraticCurveTo(X + 14, Y + 5, X + 21, Y + 21);
      c.moveTo(X + 6, Y + 12); c.lineTo(X + 18, Y + 12); c.moveTo(X + 9, Y - 2); c.lineTo(X + 15, Y - 2);
      c.stroke();
    } else { // Kuppelpalast
      boxIcon(c, X + 3, Y + 9, 18, 12, 9, '#f4efe4', '#e8dfcc');
      dot(c, X + 12, Y + 1, 6.5, st.accent);
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(X + 10, Y - 1, 3, 0, Math.PI * 2); c.fill();
      for (const ox of [3, 20]) { boxIcon(c, X + ox - 1, Y + 9, 2.5, 2.5, 22, '#f4efe4', st.accent); }
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
      drawBuildingIcon(c, fakeG, tool.bld, 0, 0, 1, 1);
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
      drawUrbanIcon(c, fakeG, 0, 0, 2, U.HALL, 1, city);
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
        treeIcon(c, 7, 14, 4, 'leaf'); treeIcon(c, 16, 18, 4.5, 'leaf'); treeIcon(c, 17, 9, 3.5, 'conifer');
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
    R.syncSize();
    R.frame++;
    R.flush();
    S.Terr.update(G);
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
    // Umland der Stadt in zwei feineren Stufen, damit die Zwischenzoomstufen nicht verschwimmen
    if (World.city) drawRegion(c, G, flatA);
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
    const polA = ppt < 1 ? 0.22 : Math.max(0, 0.22 * (1 - (ppt - 1) / 4));   // Länder nur leicht getönt, das Satellitenbild bleibt sichtbar
    if (ppt < 9 && !World.city) {
      drawPolitical(c, G, z, dpr, polA, ppt, vx0, vy0, vx1, vy1);
      // verschobene Grenzen über die ursprünglichen Ländergrenzen legen
      S.Terr.drawFlat(c, G, {
        z, dpr, polA, ppt, vx0, vy0, vx1, vy1, base: flatA, colorOf: terrColor
      });
      c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (R.cw / 2 - cam.x * z), dpr * (R.ch / 2 - cam.y * z));
      c.globalAlpha = flatA;
    }
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
    // Frontlinien und Wolken
    const Tsec = (time || 0) / 1000;
    if (G.mil) S.FX.front(c, G, z, dpr, ppt, Tsec);
    S.FX.clouds(c, G, z, dpr, ppt, Tsec);
    c.globalAlpha = flatA;
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
    if (ppt < 7 && !World.city) drawCountryNames(c, G, ppt);
    if (ppt >= 2.2) { const placed = R._placed = []; drawLabels(c, G, placed); if (!World.city) drawForeignLabels(c, G, ppt, gA, gB, hA, hB, placed); }
    if (World.city && S.Online && flatA >= 1) drawPlayerCities(c, G, ppt >= 2.2 ? R._placed : []);
    if (G.mil && ppt >= 0.5) { c.globalAlpha = R.flatA; c.textBaseline = 'alphabetic'; drawUnits(c, G, time); }
    if (R.loupe && flatA >= 1) drawLoupe(c, dpr);
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
      c.lineWidth = 1 / sc; c.strokeStyle = 'rgba(245,240,225,0.8)';
      for (const p of paths) {
        const b = p.nbox;
        if (b && (b[2] < nx0 || b[0] > nx1 || b[3] < ny0 || b[1] > ny1)) continue;
        if (p.idx !== World.homeIdx) c.stroke(p.p);
      }
      const home = paths[World.homeIdx - 1];
      if (home) { c.globalAlpha = base; c.lineWidth = 2.2 / sc; c.strokeStyle = '#f0c45a'; c.stroke(home.p); }
      c.restore();
    }
    c.globalAlpha = base;
  }
  /** Farbe eines Landes auf Weltkarte und Globus (eigenes Land gold, Rebellen grau) */
  function terrColor(o) {
    if (o === World.homeIdx) return '#e8b23a';
    const p = politicalPaths()[o - 1];
    return p ? p.color : '#6b6f75';
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
      const p = R.unitPos && R.unitPos.get(u.id);
      const [x, y] = p ? [p.x, p.y] : R.gToScreen(u.x, u.y);
      const d = Math.hypot(x - sx, y - 6 - sy);   // Figur steht über ihrem Bodenpunkt
      if (d < bd) { bd = d; best = u; }
    }
    return best;
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
    // Figuren: von hinten nach vorn (weiter unten im Bild = davor)
    S.Sprites.markOf = R.unitColor;
    const dpr = R.dpr;
    const sc = S.clamp(0.42 + R.ppt / 45, 0.5, 1.12);   // Größe wächst mit dem Zoom
    // Bildschirmplätze: dicht stehende Einheiten weichen zu einer lockeren Formation aus
    const pos = new Map(), vis = [];
    for (const u of G.mil.units) {
      const [x, y] = R.gToScreen(u.x, u.y);
      if (x < -80 || y < -80 || x > R.cw + 80 || y > R.ch + 80) continue;
      const p = { u, x, y, r: (u.type === 'inf' ? 13 : 23) * sc };
      pos.set(u.id, p); vis.push(p);
    }
    for (let it = 0; it < 8; it++) {
      for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
        const a = vis[i], b = vis[j];
        let dx = b.x - a.x, dy = (b.y - a.y) * 1.6;
        const d = Math.hypot(dx, dy), min = a.r + b.r;
        if (d >= min) continue;
        if (d < 0.01) { dx = Math.cos(a.u.id + b.u.id); dy = Math.sin(a.u.id + b.u.id); }
        const k = (min - Math.max(d, 0.01)) / 2 / (Math.max(d, 0.01));
        a.x -= dx * k * 0.5; b.x += dx * k * 0.5; a.y -= dy * k * 0.3; b.y += dy * k * 0.3;
      }
    }
    R.unitPos = pos;
    vis.sort((a, b) => a.y - b.y);
    for (const p of vis) {
      const u = p.u;
      let x = p.x, y = p.y;
      const training = u.ready > now;
      const engaged = u.fight || u.under, moving = u.path && !engaged && !training;
      const col = R.unitColor(u.o);
      const face = unitFace(u, byId);
      const gy = y + 9 * sc;                  // Bodenpunkt unter der Figur
      c.globalAlpha = (training ? 0.6 : 1) * R.flatA;
      // Bodenring in Landesfarbe (im Gefecht pulsierend rot)
      const rx = (u.type === 'inf' ? 15 : 24) * sc, ry = (u.type === 'inf' ? 5 : 7) * sc;
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(x + 2, gy + 1, rx, ry, 0, 0, Math.PI * 2); c.fill();
      if (engaged) {
        c.fillStyle = 'rgba(230,60,40,' + (0.25 + 0.2 * Math.sin(T * 8)).toFixed(2) + ')';
        c.beginPath(); c.ellipse(x, gy, rx + 6, ry + 3, 0, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = col; c.lineWidth = sel.has(u.id) ? 3 : 2;
      c.globalAlpha = (training ? 0.6 : 0.95) * R.flatA;
      c.beginPath(); c.ellipse(x, gy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
      if (sel.has(u.id)) { c.strokeStyle = '#ffffff'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(x, gy, rx + 4, ry + 2.5, 0, 0, Math.PI * 2); c.stroke(); }
      c.globalAlpha = (training ? 0.6 : 1) * R.flatA;
      // Figur
      const pose = u.type === 'inf' ? (engaged ? 'aim' : moving ? 'walk' : 'stand') : moving ? 'walk' : 'stand';
      const frame = moving ? Math.floor(T * (u.type === 'inf' ? 7 : 10) + u.id) % 4 : 0;
      S.Sprites.draw(c, u.type, u.o, x, gy + (moving && u.type !== 'inf' ? Math.sin(T * 14 + u.id) * 0.4 : 0), face, pose, frame, sc, dpr);
      // Stärke als schmaler Balken über der Figur
      const top = gy - S.Sprites.height(u.type, sc) + 4 * sc;
      const bw = (u.type === 'inf' ? 22 : 30) * sc;
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(x - bw / 2, top - 6, bw, 3.5);
      c.fillStyle = u.hp > 60 ? '#5fbf7f' : u.hp > 30 ? '#f0b23a' : '#e5574e';
      c.fillRect(x - bw / 2, top - 6, bw * Math.max(0, u.hp) / 100, 3.5);
      if (sc > 0.7 || sel.has(u.id)) S.FX.unitDeco(c, u, x, (top + gy) / 2 - 2, bw + 10, gy - top + 6, T);
      if (training) { c.fillStyle = '#fff'; c.font = '600 9px "Public Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('Ausbildung', x, top - 10); }
    }
    // Gefechte und Explosionen über den Spielsteinen
    c.globalAlpha = R.flatA;
    S.FX.combat(c, G, T, byId);
    S.FX.events(c, G, time || performance.now());
    c.globalAlpha = R.flatA;
  }

  /** Lupe über dem Finger: vergrößerter Ausschnitt mit Fadenkreuz und dem Feld, das getroffen wird */
  function drawLoupe(c, dpr) {
    const { x, y } = R.loupe, r = 56, mag = 2.3;
    let lx = S.clamp(x, r + 6, R.cw - r - 6), ly = y - r - 52;
    if (ly - r < 6) ly = y + r + 52;
    const rs = r / mag;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.arc(lx + 2, ly + 3, r + 3, 0, Math.PI * 2); c.fill();
    c.save();
    c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#0f2133'; c.fillRect(lx - r, ly - r, r * 2, r * 2);
    c.imageSmoothingEnabled = true;
    c.drawImage(R.canvas, (x - rs) * dpr, (y - rs) * dpr, rs * 2 * dpr, rs * 2 * dpr, lx - r, ly - r, r * 2, r * 2);
    // getroffenes Feld
    const [tx, ty] = R.screenToTile(x, y);
    const [sx0, sy0] = R.worldToScreen(tx * TS, ty * TS), s = TS * R.cam.z;
    const fx = lx + (sx0 - x) * mag, fy = ly + (sy0 - y) * mag, fs = s * mag;
    c.lineWidth = 3; c.strokeStyle = 'rgba(10,15,20,0.8)'; c.strokeRect(fx, fy, fs, fs);
    c.lineWidth = 1.6; c.strokeStyle = '#ffffff'; c.strokeRect(fx, fy, fs, fs);
    // Fadenkreuz am genauen Berührpunkt
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(lx - 9, ly); c.lineTo(lx - 3, ly); c.moveTo(lx + 3, ly); c.lineTo(lx + 9, ly); c.moveTo(lx, ly - 9); c.lineTo(lx, ly - 3); c.moveTo(lx, ly + 3); c.lineTo(lx, ly + 9); c.stroke();
    c.restore();
    c.strokeStyle = '#e3ad3c'; c.lineWidth = 3;
    c.beginPath(); c.arc(lx, ly, r, 0, Math.PI * 2); c.stroke();
    c.restore();
  }

  function drawCountryNames(c, G, ppt) {
    const items = R.globe.items;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '700 12px "Big Shoulders Display", "Public Sans", system-ui, sans-serif';
    const a = c.globalAlpha;
    c.globalAlpha = a * S.clamp((7 - ppt) / 3, 0, 1);
    for (const it of items) {
      if (R.globe.hidden && R.globe.hidden.has(it)) continue;
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

  /** Städte der anderen Spielerinnen und Spieler auf der flachen Karte */
  function drawPlayerCities(c, G, placed) {
    const WT = World.WT, cgx = R.camGX();
    c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const pc of S.Online.cities) {
      if (pc.id === S.Online.me) continue;
      let gx = World.gxOf(pc.lon);
      gx += Math.round((cgx - gx) / WT) * WT;
      const gy = World.gyOf(pc.lat);
      const [sx, sy] = R.worldToScreen((gx - G.gx0) * TS, (gy - G.gy0) * TS);
      if (sx < -60 || sy < -20 || sx > R.cw + 20 || sy > R.ch + 20) continue;
      const label = S.Online.label(pc), sub = S.fmtPop(pc.pop) + ' Einw.';
      c.font = '700 12px "Public Sans", system-ui, sans-serif';
      const w = Math.max(c.measureText(label).width, 60) + 14;
      const box = [sx - 6, sy - 9, sx + 10 + w, sy + 22];
      if (overlaps(placed, box[0], box[1], box[2], box[3])) continue;
      placed.push(box);
      c.fillStyle = '#f4efe2'; c.strokeStyle = '#1a2633'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(sx, sy, 4.5, 0, Math.PI * 2); c.fill(); c.stroke();
      c.lineWidth = 3; c.strokeStyle = 'rgba(10,18,28,0.75)';
      c.strokeText(label, sx + 9, sy); c.fillText(label, sx + 9, sy);
      c.font = '500 11px "Public Sans", system-ui, sans-serif';
      c.strokeText(sub, sx + 9, sy + 14);
      c.fillStyle = 'rgba(244,239,226,0.85)'; c.fillText(sub, sx + 9, sy + 14);
    }
  }

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
      const ours = G.mil && S.Mil.owner(G, gx, gy) === World.homeIdx;
      c.fillStyle = ours ? 'rgba(232,178,58,0.92)' : 'rgba(245,240,228,0.85)';
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
      if (b === U.I && t.lvl[id] >= 2) { sx = 20.5; sy = 5.5; }
      else if (b === 15) { sx = 20.7; sy = 4.7; }
      else if (b === 20) { sx = 8; sy = 8; white = true; big = 1.3; }
      else if (b === 24) { sx = 6; sy = 7; white = true; big = 1.4; }
      else continue;
      const bx = x * TS + sx, by = y * TS + sy;
      // Rauchfahne von oben: zieht mit dem Wind nach Osten und weitet sich
      for (let k = 0; k < 4; k++) {
        const ph = (T * 0.45 + k / 4 + S.hash2(x, y, k) * 0.3) % 1;
        const r = (1.6 + ph * 5.5) * big;
        c.fillStyle = white ? 'rgba(245,245,245,' + (0.5 * (1 - ph)).toFixed(3) + ')' : 'rgba(90,85,80,' + (0.4 * (1 - ph)).toFixed(3) + ')';
        const dx = ph * 18 + Math.sin(T + k) * 1.2, dy = -ph * 4 + Math.cos(T * 0.7 + k) * 1;
        c.beginPath(); c.arc(bx + dx, by + dy, r, 0, Math.PI * 2); c.fill();
        if (b === 24) { c.beginPath(); c.arc(bx + 11 + dx, by + dy, r, 0, Math.PI * 2); c.fill(); }
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
      // nur Steine direkt an der Stadt zählen, sonst wandert das Schild an fremden Truppen entlang
      for (let i = 0; i < tokens.length; i += 2) {
        if (Math.abs(tokens[i] - cx) < 34 && Math.abs(tokens[i + 1] - cy) < 26 && tokens[i + 1] + 21 > y) y = tokens[i + 1] + 21;
      }
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
