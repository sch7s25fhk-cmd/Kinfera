/* Souverän – Kartendarstellung: Gelände, Städte, Gebäude, Überlagerungen */
'use strict';
(function (S) {
  const B = S.B, U = S.U;
  const TS = S.TS = 24;   // Pixel pro Kachel im Zwischenspeicher
  const PX = S.PX = 4;    // Geländepixel pro Kachel (wird weich hochskaliert)
  const R = S.R = { cam: { x: 0, y: 0, z: 1 }, dpr: 1, view: 'none', anim: 0, hover: null, preview: null, sel: null };

  // ---------------- Initialisierung ----------------
  const CH = 16;          // Kacheln pro Zwischenspeicher-Block
  const OV = 8;           // Pixel pro Kachel in der Übersicht (weit herausgezoomt)
  const CM = 2;           // Rand in Pixeln, damit Blöcke nahtlos aneinanderstoßen
  const PIX_BUDGET = 22e6;

  R.init = function (G, canvas) {
    R.G = G;
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    R.terr = document.createElement('canvas');
    R.terr.width = G.W * PX; R.terr.height = G.H * PX;
    R.tctx = R.terr.getContext('2d');
    R.img = R.tctx.createImageData(G.W * PX, G.H * PX);
    R.foreign = new Float32Array(G.W * G.H);
    for (let i = 0; i < G.W * G.H; i++) R.foreign[i] = G.t.region[i] === 2 ? 1 : 0;
    R.noiseA = S.makeNoise(G.meta.seed + 501);
    R.noiseB = S.makeNoise(G.meta.seed + 502);
    R.dirty = null;
    R.border = buildBorder(G);
    R.chunks = new Map();
    R.pix = 0;
    R.frame = 0;
    R.ov = document.createElement('canvas');
    R.ov.width = G.W * OV; R.ov.height = G.H * OV;
    R.octx = R.ov.getContext('2d');
    R.viewCv = document.createElement('canvas');
    R.viewCv.width = G.W; R.viewCv.height = G.H;
    R.viewKey = null;
    terrainPixels(G, 0, 0, G.W - 1, G.H - 1);
    paintOverview(0, 0, G.W - 1, G.H - 1);
    R.resize();
  };

  R.resize = function () {
    const c = R.canvas;
    R.dpr = Math.min(3, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(r.width * R.dpr));
    c.height = Math.max(1, Math.round(r.height * R.dpr));
    R.cw = r.width; R.ch = r.height;
  };

  R.markDirty = function (x0, y0, x1, y1) {
    const d = R.dirty;
    if (!d) R.dirty = [x0, y0, x1, y1];
    else { d[0] = Math.min(d[0], x0); d[1] = Math.min(d[1], y0); d[2] = Math.max(d[2], x1); d[3] = Math.max(d[3], y1); }
    R.viewKey = null;
  };
  R.flush = function () {
    if (!R.dirty) return;
    const G = R.G;
    let [x0, y0, x1, y1] = R.dirty;
    R.dirty = null;
    x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(G.W - 1, x1 + 2); y1 = Math.min(G.H - 1, y1 + 2);
    terrainPixels(G, x0, y0, x1, y1);
    paintOverview(x0, y0, x1, y1);
    // betroffene Blöcke als veraltet markieren (hohe Gebäude ragen nach oben)
    const cx0 = Math.floor(x0 / CH), cx1 = Math.floor(x1 / CH), cy0 = Math.floor((y0 - 3) / CH), cy1 = Math.floor((y1 + 1) / CH);
    for (const e of R.chunks.values()) if (e.cx >= cx0 && e.cx <= cx1 && e.cy >= cy0 && e.cy <= cy1) e.stale = true;
  };

  // ---------------- Gelände als Pixelbild ----------------
  function terrainPixels(G, tx0, ty0, tx1, ty1) {
    const { W, H, t } = G;
    const data = R.img.data, IW = W * PX;
    const E = t.elev, M = t.moist, T = t.temp, F = t.forest, IR = t.irrig, FG = R.foreign;
    const nA = R.noiseA, nB = R.noiseB, seed = G.meta.seed;
    const px0 = Math.max(0, tx0 * PX), py0 = Math.max(0, ty0 * PX);
    const px1 = Math.min(W * PX, (tx1 + 1) * PX), py1 = Math.min(H * PX, (ty1 + 1) * PX);
    for (let py = py0; py < py1; py++) {
      const fy = (py + 0.5) / PX - 0.5;
      let j0 = Math.floor(fy); let v = fy - j0;
      if (j0 < 0) { j0 = 0; v = 0; } else if (j0 > H - 2) { j0 = H - 2; v = 1; }
      for (let px = px0; px < px1; px++) {
        const fx = (px + 0.5) / PX - 0.5;
        let i0 = Math.floor(fx); let u = fx - i0;
        if (i0 < 0) { i0 = 0; u = 0; } else if (i0 > W - 2) { i0 = W - 2; u = 1; }
        const a = j0 * W + i0, b = a + 1, c = a + W, d = c + 1;
        const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
        const n1 = nA(px * 0.33, py * 0.33), n2 = nB(px * 0.17, py * 0.17);
        const grain = S.hash2(px, py, seed) - 0.5;
        const e = E[a] * w00 + E[b] * w10 + E[c] * w01 + E[d] * w11 + (n1 - 0.5) * 0.03;
        const m = M[a] * w00 + M[b] * w10 + M[c] * w01 + M[d] * w11 + (n2 - 0.5) * 0.12;
        const tt = T[a] * w00 + T[b] * w10 + T[c] * w01 + T[d] * w11;
        const f = F[a] * w00 + F[b] * w10 + F[c] * w01 + F[d] * w11 + (n1 - 0.5) * 0.7;
        const ir = IR[a] * w00 + IR[b] * w10 + IR[c] * w01 + IR[d] * w11 + (n2 - 0.5) * 0.4;
        const fg = FG[a] * w00 + FG[b] * w10 + FG[c] * w01 + FG[d] * w11;
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
          // Relief: Licht aus Nordwest
          const dx = (1 - v) * (E[b] - E[a]) + v * (E[d] - E[c]);
          const dy = (1 - u) * (E[c] - E[a]) + u * (E[d] - E[b]);
          const sh = S.clamp((dx + dy) * 150, -38, 38) + (e > 0.3 ? (e - 0.3) * 18 : 0);
          r += sh; g += sh; bl += sh * 0.9;
          r += grain * 9; g += grain * 9; bl += grain * 7;
        }
        if (fg > 0.01) {
          const grey = (r * 0.3 + g * 0.55 + bl * 0.15);
          const k = fg * 0.62;
          r = r + (grey * 0.92 + 18 - r) * k; g = g + (grey * 0.92 + 18 - g) * k; bl = bl + (grey * 0.92 + 22 - bl) * k;
        }
        const o = (py * IW + px) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
      }
    }
    R.tctx.putImageData(R.img, 0, 0, px0, py0, px1 - px0, py1 - py0);
  }

  // ---------------- Grenze aus Kacheln ----------------
  function buildBorder(G) {
    const { W, H, t } = G;
    const segs = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (t.region[y * W + x] !== 1) continue;
      const other = (nx, ny) => !S.inb(G, nx, ny) || t.region[ny * W + nx] === 2;
      if (other(x + 1, y)) segs.push([x + 1, y, x + 1, y + 1]);
      if (other(x - 1, y)) segs.push([x, y, x, y + 1]);
      if (other(x, y + 1)) segs.push([x, y + 1, x + 1, y + 1]);
      if (other(x, y - 1)) segs.push([x, y, x + 1, y]);
    }
    return segs;
  }

  // ---------------- Bereich zeichnen (Weltkoordinaten) ----------------
  function paintRegion(c, x0, y0, x1, y1) {
    const G = R.G, { W, H } = G;
    c.save();
    c.beginPath();
    c.rect(x0 * TS, y0 * TS, (x1 - x0 + 1) * TS, (y1 - y0 + 1) * TS);
    c.clip();
    const sx0 = Math.max(0, x0 - 2), sy0 = Math.max(0, y0 - 2), sx1 = Math.min(W, x1 + 3), sy1 = Math.min(H, y1 + 3);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(R.terr, sx0 * PX, sy0 * PX, (sx1 - sx0) * PX, (sy1 - sy0) * PX, sx0 * TS, sy0 * TS, (sx1 - sx0) * TS, (sy1 - sy0) * TS);
    const gx0 = Math.max(0, x0 - 2), gy0 = Math.max(0, y0 - 2), gx1 = Math.min(W - 1, x1 + 2), gy1 = Math.min(H - 1, y1 + 2);
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) drawGround(c, G, x, y);
    for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) drawRoads(c, G, x, y);
    c.strokeStyle = 'rgba(70,40,30,0.55)';
    c.lineWidth = 3;
    c.setLineDash([7, 5]);
    c.beginPath();
    for (const s of R.border) {
      if (s[2] < gx0 || s[0] > gx1 + 1 || s[3] < gy0 || s[1] > gy1 + 1) continue;
      c.moveTo(s[0] * TS, s[1] * TS); c.lineTo(s[2] * TS, s[3] * TS);
    }
    c.stroke();
    c.setLineDash([]);
    const oy1 = Math.min(H - 1, y1 + 3);
    for (let y = gy0; y <= oy1; y++) for (let x = gx0; x <= gx1; x++) drawObject(c, G, x, y);
    c.restore();
  }

  /** Einen Block in der gewünschten Auflösung (Pixel pro Weltpixel) zeichnen */
  function renderChunk(cx, cy, res, reuse) {
    const G = R.G;
    const x0 = cx * CH, y0 = cy * CH, x1 = Math.min(G.W - 1, x0 + CH - 1), y1 = Math.min(G.H - 1, y0 + CH - 1);
    const w = Math.ceil((x1 - x0 + 1) * TS * res) + CM * 2, h = Math.ceil((y1 - y0 + 1) * TS * res) + CM * 2;
    const cv = reuse && reuse.width === w && reuse.height === h ? reuse : document.createElement('canvas');
    if (cv !== reuse) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(res, 0, 0, res, CM - x0 * TS * res, CM - y0 * TS * res);
    // Rand mitzeichnen: Bereich um eine Kachel erweitert, dann auf den Block plus Rand beschneiden
    paintRegion(c, Math.max(0, x0 - 1), Math.max(0, y0 - 1), Math.min(G.W - 1, x1 + 1), Math.min(G.H - 1, y1 + 1));
    return { cv, x0, y0, x1, y1, w, h };
  }

  function getChunk(cx, cy, res, allowRender) {
    const key = cx + ',' + cy + ',' + res;
    let e = R.chunks.get(key);
    if (e && !e.stale) { e.used = R.frame; return e; }
    if (!allowRender) return null;
    const r = renderChunk(cx, cy, res, e && e.cv);
    if (!e) { e = { cx, cy, res }; R.chunks.set(key, e); }
    else R.pix -= e.w * e.h;
    Object.assign(e, r, { stale: false, used: R.frame });
    R.pix += e.w * e.h;
    evict();
    return e;
  }

  function evict() {
    if (R.pix <= PIX_BUDGET) return;
    const list = [...R.chunks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k, e] of list) {
      if (R.pix <= PIX_BUDGET * 0.8 || e.used >= R.frame) break;
      R.pix -= e.w * e.h;
      R.chunks.delete(k);
    }
  }

  // ---------------- Übersichtskarte (weit herausgezoomt) ----------------
  const OV_URBAN = { 2: '#8fa3b6', 3: '#8a7f74', 4: '#e8b23a' };
  function paintOverview(x0, y0, x1, y1) {
    const G = R.G, t = G.t, W = G.W, c = R.octx;
    c.save();
    c.beginPath(); c.rect(x0 * OV, y0 * OV, (x1 - x0 + 1) * OV, (y1 - y0 + 1) * OV); c.clip();
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    const sx0 = Math.max(0, x0 - 1), sy0 = Math.max(0, y0 - 1), sx1 = Math.min(W, x1 + 2), sy1 = Math.min(G.H, y1 + 2);
    c.drawImage(R.terr, sx0 * PX, sy0 * PX, (sx1 - sx0) * PX, (sy1 - sy0) * PX, sx0 * OV, sy0 * OV, (sx1 - sx0) * OV, (sy1 - sy0) * OV);
    const ex0 = Math.max(0, x0 - 1), ey0 = Math.max(0, y0 - 1), ex1 = Math.min(W - 1, x1 + 1), ey1 = Math.min(G.H - 1, y1 + 1);
    c.lineCap = 'round';
    // Flüsse
    c.strokeStyle = '#3f86b8'; c.lineWidth = 2;
    c.beginPath();
    for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) {
      const id = y * W + x;
      if (!t.river[id] || t.rdir[id] < 0) continue;
      const [ox, oy] = S.N4[t.rdir[id]];
      c.moveTo((x + 0.5) * OV, (y + 0.5) * OV); c.lineTo((x + ox + 0.5) * OV, (y + oy + 0.5) * OV);
    }
    c.stroke();
    for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) {
      const id = y * W + x, b = t.bld[id];
      if (!b) continue;
      if (b === U.R) {
        const city = G.cities[t.city[id] - 1];
        c.fillStyle = city ? S.STYLES[city.style].roof : '#b5533a';
        c.fillRect(x * OV + 0.5, y * OV + 0.5, OV - 1, OV - 1);
        if (t.lvl[id] >= 3) { c.fillStyle = 'rgba(0,0,0,' + (t.lvl[id] * 0.06).toFixed(2) + ')'; c.fillRect(x * OV + 2, y * OV + 2, OV - 4, OV - 4); }
      } else if (b <= 4) {
        c.fillStyle = OV_URBAN[b]; c.fillRect(x * OV + 0.5, y * OV + 0.5, OV - 1, OV - 1);
      } else {
        const d = S.BLD[b];
        c.fillStyle = b === 10 ? '#d8c25a' : b === 32 ? '#6fae55' : d.cat === 'energie' ? '#3b3e4a' : d.cat === 'gesellschaft' ? '#e9e2d0' : '#7a5a44';
        c.fillRect(x * OV + 1, y * OV + 1, OV - 2, OV - 2);
      }
    }
    // Straßen und Bahn
    for (const [bit, col, w] of [[1, '#6f6a62', 2], [2, '#2e2b29', 1.5]]) {
      c.strokeStyle = col; c.lineWidth = w;
      c.beginPath();
      for (let y = ey0; y <= ey1; y++) for (let x = ex0; x <= ex1; x++) {
        const id = y * W + x;
        if (!(t.road[id] & bit)) continue;
        let any = false;
        for (const [ox, oy] of S.N8) {
          const nx = x + ox, ny = y + oy;
          if (!S.inb(G, nx, ny) || !(t.road[ny * W + nx] & bit)) continue;
          if (ox && oy && ((t.road[y * W + nx] & bit) || (t.road[ny * W + x] & bit))) continue;
          c.moveTo((x + 0.5) * OV, (y + 0.5) * OV); c.lineTo((x + 0.5 + ox * 0.5) * OV, (y + 0.5 + oy * 0.5) * OV);
          any = true;
        }
        if (!any) { c.moveTo((x + 0.3) * OV, (y + 0.5) * OV); c.lineTo((x + 0.7) * OV, (y + 0.5) * OV); }
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(70,40,30,0.6)'; c.lineWidth = 1.5; c.setLineDash([4, 3]);
    c.beginPath();
    for (const s of R.border) {
      if (s[2] < ex0 || s[0] > ex1 + 1 || s[3] < ey0 || s[1] > ey1 + 1) continue;
      c.moveTo(s[0] * OV, s[1] * OV); c.lineTo(s[2] * OV, s[3] * OV);
    }
    c.stroke(); c.setLineDash([]);
    c.restore();
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
    const foreign = t.region[id] === 2;
    if (foreign) c.globalAlpha = 0.42;
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
    c.globalAlpha = 1;
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
  R.minZoom = () => Math.min(Math.min(R.cw / (R.G.W * TS), R.ch / (R.G.H * TS)) * 0.8, 0.3);
  R.worldToScreen = (wx, wy) => [(wx - R.cam.x) * R.cam.z + R.cw / 2, (wy - R.cam.y) * R.cam.z + R.ch / 2];
  R.screenToWorld = (sx, sy) => [(sx - R.cw / 2) / R.cam.z + R.cam.x, (sy - R.ch / 2) / R.cam.z + R.cam.y];
  R.screenToTile = (sx, sy) => { const [wx, wy] = R.screenToWorld(sx, sy); return [Math.floor(wx / TS), Math.floor(wy / TS)]; };

  R.clampCam = function () {
    const G = R.G, cam = R.cam;
    const minZ = Math.min(R.cw / (G.W * TS), R.ch / (G.H * TS)) * 0.8;
    cam.z = S.clamp(cam.z, Math.min(minZ, 0.3), R.MAX_Z);
    const ax = (size, view) => {
      const half = view / 2 / cam.z;
      if (size <= 2 * half) return [size / 2 - (half - size / 2) * 0.5, size / 2 + (half - size / 2) * 0.5];
      const m = half * 0.25;
      return [half - m, size - half + m];
    };
    const [x0, x1] = ax(G.W * TS, R.cw), [y0, y1] = ax(G.H * TS, R.ch);
    cam.x = S.clamp(cam.x, x0, x1);
    cam.y = S.clamp(cam.y, y0, y1);
  };

  R.fit = function () {
    const G = R.G;
    R.cam.z = Math.min(R.cw / (G.W * TS), R.ch / (G.H * TS)) * 0.95;
    R.cam.x = G.W * TS / 2; R.cam.y = G.H * TS / 2;
  };

  R.centerOn = function (x, y, z) {
    R.cam.x = (x + 0.5) * TS; R.cam.y = (y + 0.5) * TS;
    if (z) R.cam.z = z;
    R.clampCam();
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

  R.draw = function (time) {
    const G = R.G, c = R.ctx, cam = R.cam, z = cam.z;
    if (!G) return;
    R.frame++;
    R.flush();
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    c.fillStyle = '#16283a';
    c.fillRect(0, 0, R.cw, R.ch);
    c.setTransform(R.dpr * z, 0, 0, R.dpr * z, R.dpr * (R.cw / 2 - cam.x * z), R.dpr * (R.ch / 2 - cam.y * z));
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(6 / z, 8 / z, G.W * TS, G.H * TS);
    // sichtbarer Ausschnitt in Kacheln
    const [wx0, wy0] = R.screenToWorld(0, 0), [wx1, wy1] = R.screenToWorld(R.cw, R.ch);
    const x0 = Math.max(0, Math.floor(wx0 / TS) - 1), y0 = Math.max(0, Math.floor(wy0 / TS) - 1);
    const x1 = Math.min(G.W - 1, Math.ceil(wx1 / TS) + 1), y1 = Math.min(G.H - 1, Math.ceil(wy1 / TS) + 2);
    const need = z * R.dpr;
    const ovRes = OV / TS;
    // Übersicht immer als Grundlage (verdeckt Lücken, solange Blöcke entstehen)
    c.drawImage(R.ov, 0, 0, G.W * TS, G.H * TS);
    if (need > ovRes * 1.3) {
      const res = need <= 0.6 ? 0.5 : need <= 1.2 ? 1 : need <= 2.4 ? 2 : need <= 3.4 ? 3 : 4;
      const cx0 = Math.floor(x0 / CH), cx1 = Math.floor(x1 / CH), cy0 = Math.floor(y0 / CH), cy1 = Math.floor(y1 / CH);
      let budget = 3;
      const ccx = (cam.x / TS) / CH, ccy = (cam.y / TS) / CH;
      const order = [];
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([cx, cy, Math.hypot(cx + 0.5 - ccx, cy + 0.5 - ccy)]);
      order.sort((a, b) => a[2] - b[2]);
      for (const [cx, cy] of order) {
        let e = getChunk(cx, cy, res, false);
        if (!e && budget > 0) { e = getChunk(cx, cy, res, true); budget--; }
        if (!e) {
          // Ersatz: andere Auflösung oder veraltete Fassung
          for (const r2 of [res, 2, 1, 4, 3, 0.5]) { const f = R.chunks.get(cx + ',' + cy + ',' + r2); if (f) { e = f; f.used = R.frame; break; } }
        }
        if (!e) continue;
        const r = e.res, iw = (e.x1 - e.x0 + 1) * TS, ih = (e.y1 - e.y0 + 1) * TS;
        const ex = 1 / need;
        c.drawImage(e.cv, CM, CM, Math.min(e.w - CM, iw * r + ex * r), Math.min(e.h - CM, ih * r + ex * r), e.x0 * TS, e.y0 * TS, iw + ex, ih + ex);
      }
      if (budget <= 0 || [...R.chunks.values()].some(e => e.stale && e.used >= R.frame - 1)) R.needsMore = true;
    }
    // Datenansicht
    if (VIEW_FN[R.view]) {
      viewLayer(G);
      c.imageSmoothingEnabled = false;
      c.drawImage(R.viewCv, 0, 0, G.W * TS, G.H * TS);
      c.imageSmoothingEnabled = true;
    }
    // Rauch und Dampf
    if (z > 0.55 && !R.reduceMotion) drawSmoke(c, G, x0, y0, x1, y1, time);
    // Auswahl und Vorschau
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
    // Bildschirm-Ebene: Warnungen und Stadtnamen
    c.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
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
    drawLabels(c, G);
  };

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

  function drawLabels(c, G) {
    const z = R.cam.z;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const city of G.cities) {
      const [sx, sy] = R.worldToScreen((city.x + 0.5) * TS, (city.y + 1.2) * TS);
      if (sx < -80 || sy < -40 || sx > R.cw + 80 || sy > R.ch + 40) continue;
      const big = city.capital || city.pop * S.cityScale(G) > 1e6;
      if (z < 0.35 && !big) continue;
      const name = city.name;
      const pop = S.fmtPop(city.pop * S.cityScale(G));
      c.font = (big ? '700 13px ' : '600 12px ') + '"Big Shoulders Display", "Public Sans", system-ui, sans-serif';
      const w1 = c.measureText(name.toUpperCase()).width;
      c.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      const w2 = c.measureText(pop).width;
      const w = Math.max(w1, w2) + 16;
      const sel = R.selCity === city.id;
      c.fillStyle = sel ? 'rgba(232,178,58,0.95)' : 'rgba(18,28,38,0.78)';
      roundRect(c, sx - w / 2, sy - 2, w, 30, 6);
      c.fill();
      if (city.capital) {
        c.fillStyle = sel ? '#1a2633' : '#e8b23a';
        c.beginPath(); c.arc(sx - w / 2 + 7, sy + 7, 2.6, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = sel ? '#1a2633' : '#f3ecdd';
      c.font = (big ? '700 13px ' : '600 12px ') + '"Big Shoulders Display", "Public Sans", system-ui, sans-serif';
      c.fillText(name.toUpperCase(), sx, sy + 7);
      c.fillStyle = sel ? '#1a2633' : '#b9c4cf';
      c.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      c.fillText(pop, sx, sy + 20);
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
