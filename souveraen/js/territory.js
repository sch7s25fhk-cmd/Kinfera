/* Souverän – verschobene Grenzen: eroberte Gebiete auf Globus und Weltkarte */
'use strict';
(function (S) {
  const R = S.R, World = S.World;
  const P = 64;        // Felder pro Gebietsblock
  const DIL = 3;       // so weit um geänderte Felder wird die alte Karte überdeckt (alte Grenzlinien verschwinden)
  const M = DIL + 1;   // Rand eines Blocks
  const T = S.Terr = { patches: new Map(), dirty: new Set(), bases: new Map(), last: 0 };

  /** Neues Spiel oder geladener Stand: alle Blöcke mit Änderungen neu aufbauen */
  T.reset = function (G) {
    T.patches.clear(); T.dirty.clear(); T.bases.clear();
    if (!G || !G.mil) return;
    for (const k in G.mil.occ) { const p = k.indexOf(','); T.touch(+k.slice(0, p), +k.slice(p + 1)); }
    // annektierte Länder: alle Blöcke über ihrem Gebiet
    const nx = Math.ceil(World.WT / P);
    for (const e in (G.mil.annexed || {})) {
      const c = S.WORLD[e - 1];
      if (!c) continue;
      let lon0 = 180, lon1 = -180, lat0 = 90, lat1 = -90;
      for (const r of c.r) for (let k = 0; k < r.length; k += 2) {
        const lo = r[k] / 100, la = r[k + 1] / 100;
        if (lo < lon0) lon0 = lo; if (lo > lon1) lon1 = lo; if (la < lat0) lat0 = la; if (la > lat1) lat1 = la;
      }
      const cx0 = Math.floor((World.gxOf(lon0) - M) / P), cx1 = Math.floor((World.gxOf(lon1) + M) / P);
      const cy0 = Math.floor((World.gyOf(lat1) - M) / P), cy1 = Math.floor((World.gyOf(lat0) + M) / P);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) T.dirty.add(((cx % nx) + nx) % nx + ',' + cy);
    }
    T.last = 0;
  };

  /** Ein Feld hat den Besitzer gewechselt */
  T.touch = function (gx, gy) {
    const WT = World.WT, nx = Math.ceil(WT / P);
    const x = World.wrapGx(Math.floor(gx)), y = Math.floor(gy);
    for (let cy = Math.floor((y - M) / P); cy <= Math.floor((y + M) / P); cy++) {
      for (let cxu = Math.floor((x - M) / P); cxu <= Math.floor((x + M) / P); cxu++) T.dirty.add(((cxu % nx) + nx) % nx + ',' + cy);
    }
  };

  function baseOf(cx, cy, w, h) {
    const key = cx + ',' + cy;
    let b = T.bases.get(key);
    if (!b) {
      b = World.ownerBlock(cx * P - M, cy * P - M, w, h);
      if (T.bases.size > 400) T.bases.clear();
      T.bases.set(key, b);
    }
    return b;
  }

  /** Blöcke mit Änderungen neu berechnen (gedrosselt, damit Kämpfe nicht jedes Bild bremsen) */
  T.update = function (G, force) {
    if (!T.dirty.size || !G.mil) return;
    const now = performance.now();
    if (!force && now - T.last < 300) return;
    T.last = now;
    const keys = [...T.dirty];
    T.dirty.clear();
    // Besetzungen den betroffenen Blöcken zuordnen
    const want = new Set(keys), buckets = new Map();
    const WT = World.WT, nx = Math.ceil(WT / P);
    for (const k in G.mil.occ) {
      const p = k.indexOf(','), gx = +k.slice(0, p), gy = +k.slice(p + 1);
      for (let cy = Math.floor((gy - M) / P); cy <= Math.floor((gy + M) / P); cy++) {
        for (let cxu = Math.floor((gx - M) / P); cxu <= Math.floor((gx + M) / P); cxu++) {
          const key = ((cxu % nx) + nx) % nx + ',' + cy;
          if (!want.has(key)) continue;
          let l = buckets.get(key);
          if (!l) buckets.set(key, l = []);
          l.push(gx, gy, G.mil.occ[k]);
        }
      }
    }
    for (const key of keys) {
      const [cx, cy] = key.split(',').map(Number);
      const p = build(G, cx, cy, buckets.get(key) || []);
      if (p) T.patches.set(key, p); else T.patches.delete(key);
    }
    R.terrVer = (R.terrVer || 0) + 1;
  };

  function build(G, cx, cy, occ) {
    const WT = World.WT;
    const pw = Math.min(P, WT - cx * P), ph = P;
    if (pw <= 0 || cy * P >= WT || (cy + 1) * P <= 0) return null;
    const w = pw + 2 * M, h = ph + 2 * M, gx0 = cx * P - M, gy0 = cy * P - M;
    const base = baseOf(cx, cy, w, h);
    const cur = base.slice();
    if (G.mil.annexed) for (let i = 0; i < cur.length; i++) if (G.mil.annexed[cur[i]] !== undefined) cur[i] = World.homeIdx;
    for (let i = 0; i < occ.length; i += 3) {
      let lx = occ[i] - gx0;
      if (lx < -WT / 2) lx += WT; else if (lx > WT / 2) lx -= WT;
      const ly = occ[i + 1] - gy0;
      if (lx >= 0 && ly >= 0 && lx < w && ly < h) cur[ly * w + lx] = occ[i + 2] < 0 ? 65535 : occ[i + 2];
    }
    // geänderte Felder und ihr Umkreis
    const changed = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < w * h; i++) if (cur[i] !== base[i]) { changed[i] = 1; any = true; }
    if (!any) return null;
    const cov = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!changed[y * w + x]) continue;
      for (let oy = -DIL; oy <= DIL; oy++) for (let ox = -DIL; ox <= DIL; ox++) {
        const X = x + ox, Y = y + oy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && ox * ox + oy * oy <= DIL * DIL + 1) cov[Y * w + X] = 1;
      }
    }
    // geänderte Felder als Zeilenläufe je Besitzer (Globus), Kern des Blocks
    const diff = [];
    let core = false;
    for (let y = M; y < M + ph; y++) {
      for (let x = M; x < M + pw && !core; x++) if (cov[y * w + x]) core = true;
      // geänderte Felder für den Globus
      let x = M;
      while (x < M + pw) {
        const i = y * w + x;
        if (!changed[i] || !cur[i]) { x++; continue; }
        const o = cur[i];
        let x2 = x + 1;
        while (x2 < M + pw && changed[y * w + x2] && cur[y * w + x2] === o) x2++;
        diff.push(x + gx0, y + gy0, x2 - x, o);
        x = x2;
      }
    }
    if (!core) return null;
    // Grenzlinien: jede Kante genau einmal (siehe Regel unten), Stil nach Beteiligung des eigenen Landes
    const home = World.homeIdx;
    const segs = { home: [], other: [] };
    const edge = (a, b, x0, y0, x1, y1) => {
      const oa = cur[a], ob = cur[b];
      if (oa === ob || (!oa && !ob)) return;
      (oa === home || ob === home ? segs.home : segs.other).push(x0 + gx0, y0 + gy0, x1 + gx0, y1 + gy0);
    };
    for (let y = M; y < M + ph; y++) for (let x = M; x < M + pw; x++) {
      const i = y * w + x;
      // rechts/unten: zeichnet der Block des linken/oberen Feldes, wenn dieses überdeckt ist,
      // sonst der Block des überdeckten rechten/unteren Feldes
      if (cov[i] || (cov[i + 1] && x + 1 < M + pw)) edge(i, i + 1, x + 1, y, x + 1, y + 1);
      if (cov[i] || (cov[i + w] && y + 1 < M + ph)) edge(i, i + w, x, y + 1, x + 1, y + 1);
      if (x === M && cov[i] && !cov[i - 1]) edge(i - 1, i, x, y, x, y + 1);
      if (y === M && cov[i] && !cov[i - w]) edge(i - w, i, x, y, x + 1, y);
    }
    // Kern plus ein Feld Rand fürs Bild (überlappt den Nachbarblock nahtlos)
    const iw = pw + 2, ih = ph + 2, icov = new Uint8Array(iw * ih), iown = new Uint16Array(iw * ih);
    for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) {
      const i = (y + M - 1) * w + x + M - 1;
      icov[y * iw + x] = cov[i]; iown[y * iw + x] = cur[i];
    }
    const p = { cx, cy, x0: cx * P, y0: cy * P, w: pw, h: ph, iw, ih, icov, iown, diff, segs: { home: merge(segs.home), other: merge(segs.other) } };
    p.ll = null;
    return p;
  }

  /** gleichgerichtete, aneinanderstoßende Kanten zu langen Linien zusammenfassen */
  function merge(a) {
    const hs = [], vs = [];
    for (let i = 0; i < a.length; i += 4) (a[i + 1] === a[i + 3] ? hs : vs).push([a[i], a[i + 1], a[i + 2], a[i + 3]]);
    const out = [];
    hs.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
    for (let i = 0; i < hs.length;) {
      const s = hs[i]; let x1 = s[2], j = i + 1;
      while (j < hs.length && hs[j][1] === s[1] && hs[j][0] === x1) { x1 = hs[j][2]; j++; }
      out.push(s[0], s[1], x1, s[1]); i = j;
    }
    vs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (let i = 0; i < vs.length;) {
      const s = vs[i]; let y1 = s[3], j = i + 1;
      while (j < vs.length && vs[j][0] === s[0] && vs[j][1] === y1) { y1 = vs[j][3]; j++; }
      out.push(s[0], s[1], s[0], y1); i = j;
    }
    return out;
  }

  // ---------------- Flache Weltkarte ----------------
  const _rgb = {};
  const rgbOf = (hex) => _rgb[hex] || (_rgb[hex] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);

  /**
   * Bild eines Blocks: je Feld Untergrund der Weltkarte, darüber die Landesfarbe mit Deckkraft a.
   * Ein Bild statt vieler Rechtecke: keine Haarlinien zwischen den Feldern.
   */
  function image(p, a, colorOf) {
    const q = Math.round(a * 25);
    if (p.img && p.img.q === q && p.img.ver === T.colVer) return p.img.cv;
    const tex = R.wtexData, N = 1024, WT = World.WT;
    const cv = (p.img && p.img.cv) || document.createElement('canvas');
    cv.width = p.iw; cv.height = p.ih;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(p.iw, p.ih), d = img.data;
    const al = q / 25;
    for (let y = 0; y < p.ih; y++) {
      const gy = p.y0 - 1 + y;
      const fy = S.clamp((gy + 0.5) / WT * N - 0.5, 0, N - 1.001);
      const j = Math.floor(fy), v = fy - j;
      for (let x = 0; x < p.iw; x++) {
        const k = y * p.iw + x;
        if (!p.icov[k]) continue;
        let fx = World.wrapGx(p.x0 - 1 + x) + 0.5;
        fx = fx / WT * N - 0.5;
        const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), u = S.clamp(fx - i, 0, 1);
        const o00 = (j * N + i) * 4, o10 = o00 + 4, o01 = o00 + N * 4, o11 = o01 + 4;
        const o = k * 4;
        for (let ch = 0; ch < 3; ch++) d[o + ch] = (tex[o00 + ch] * (1 - u) + tex[o10 + ch] * u) * (1 - v) + (tex[o01 + ch] * (1 - u) + tex[o11 + ch] * u) * v;
        const own = p.iown[k];
        if (own && al > 0) {
          const c = rgbOf(colorOf(own));
          for (let ch = 0; ch < 3; ch++) d[o + ch] = d[o + ch] * (1 - al) + c[ch] * al;
        }
        d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    p.img = { q, ver: T.colVer, cv };
    return cv;
  }

  function lines(p) {
    if (p.lines) return p.lines;
    const mk = (l) => { const pa = new Path2D(); for (let i = 0; i < l.length; i += 4) { pa.moveTo(l[i], l[i + 1]); pa.lineTo(l[i + 2], l[i + 3]); } return pa; };
    p.lines = { home: mk(p.segs.home), other: mk(p.segs.other) };
    return p.lines;
  }

  /**
   * Über die politische Karte zeichnen: im Umkreis der Änderungen die alte Karte durch ein Bild
   * nach heutigem Besitz ersetzen, dann die neuen Grenzlinien.
   */
  T.drawFlat = function (c, G, opt) {
    if (!T.patches.size || !R.wtexData) return;
    const { z, dpr, polA, ppt, vx0, vy0, vx1, vy1, base, colorOf } = opt;
    const TS = S.TS, WT = World.WT, span = WT * TS, cam = R.cam;
    const lineA = base * S.clamp(1.2 - ppt / 8, 0.2, 0.8);
    c.save();
    for (const p of T.patches.values()) {
      for (const k of [-1, 0, 1]) {
        const ox = (p.x0 - G.gx0) * TS + k * span, oy = (p.y0 - G.gy0) * TS;
        if (ox + p.w * TS < vx0 || ox > vx1 || oy + p.h * TS < vy0 || oy > vy1) continue;
        const tx = dpr * (R.cw / 2 + ((-G.gx0) * TS + k * span - cam.x) * z), ty = dpr * (R.ch / 2 + ((-G.gy0) * TS - cam.y) * z);
        c.setTransform(dpr * z * TS, 0, 0, dpr * z * TS, tx, ty);
        c.imageSmoothingEnabled = false;
        c.globalAlpha = base;
        c.drawImage(image(p, polA, colorOf), p.x0 - 1, p.y0 - 1, p.iw, p.ih);
        const pa = lines(p);
        c.lineCap = 'round';
        c.globalAlpha = lineA; c.lineWidth = 1 / (z * TS); c.strokeStyle = 'rgba(30,40,50,0.9)';
        c.stroke(pa.other);
        c.globalAlpha = base; c.lineWidth = 2.2 / (z * TS); c.strokeStyle = '#f0c45a';
        c.stroke(pa.home);
      }
    }
    c.restore();
    c.imageSmoothingEnabled = true;
  };

  // ---------------- Globus ----------------
  function lonlat(p) {
    if (p.ll) return p.ll;
    const lon = (gx) => World.lonOfGx(gx), lat = (gy) => World.latOfGy(gy);
    const diff = [];
    for (let i = 0; i < p.diff.length; i += 4) {
      const gx = p.diff[i], gy = p.diff[i + 1], n = p.diff[i + 2];
      diff.push(lon(gx), lat(gy), lon(gx + n), lat(gy + 1), p.diff[i + 3]);
    }
    const seg = (l) => { const o = []; for (let i = 0; i < l.length; i += 4) o.push(lon(l[i]), lat(l[i + 1]), lon(l[i + 2]), lat(l[i + 3])); return o; };
    p.ll = { diff, home: seg(p.segs.home), other: seg(p.segs.other) };
    return p.ll;
  }

  T.drawGlobe = function (c, g, colorOf) {
    if (!T.patches.size) return;
    const proj = g.project;
    const lw = Math.min(1.2, 0.5 + g.zoom * 0.08);
    for (const p of T.patches.values()) {
      const ll = lonlat(p);
      // eroberte und verlorene Felder in der Farbe des heutigen Besitzers
      for (let i = 0; i < ll.diff.length; i += 5) {
        const a = proj(ll.diff[i], ll.diff[i + 1]), b = proj(ll.diff[i + 2], ll.diff[i + 1]);
        const d = proj(ll.diff[i + 2], ll.diff[i + 3]), e = proj(ll.diff[i], ll.diff[i + 3]);
        if (a[2] < 0 && d[2] < 0) continue;
        c.fillStyle = colorOf(ll.diff[i + 4], true);
        c.strokeStyle = c.fillStyle; c.lineWidth = 0.8;
        c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(d[0], d[1]); c.lineTo(e[0], e[1]); c.closePath();
        c.fill(); c.stroke();
      }
    }
    const lines = (key, style, width) => {
      c.strokeStyle = style; c.lineWidth = width;
      c.beginPath();
      for (const p of T.patches.values()) {
        const l = lonlat(p)[key];
        for (let i = 0; i < l.length; i += 4) {
          const a = proj(l[i], l[i + 1]), b = proj(l[i + 2], l[i + 3]);
          if (a[2] < 0 || b[2] < 0) continue;
          c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
        }
      }
      c.stroke();
    };
    lines('other', 'rgba(30,40,50,0.5)', lw);
    lines('home', '#fff6dc', 2);
  };
})(S);
