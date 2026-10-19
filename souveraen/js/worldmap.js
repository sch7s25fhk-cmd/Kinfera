/* Souverän – 3D-Globus (orthografische Projektion, Touch-Steuerung)
   Zwei Instanzen: die Länderwahl (S.WM) und die Weltansicht im Spiel (herausgezoomt). */
'use strict';
(function (S) {
  const D2R = Math.PI / 180;
  let ITEMS = null; // Länderdaten werden von allen Globen geteilt

  S.makeGlobe = function (opts) {
  opts = opts || {};
  const WM = {
    lon: 10, lat: 25, zoom: 1, sel: null, hover: null,
    vLon: 0, vLat: 0, anim: null, idle: !opts.noIdle, maxZoom: opts.maxZoom || 60
  };

  const PALETTE = ['#c9b98f', '#a9bf8e', '#d4a77f', '#b7a6c9', '#9fc0b9', '#d9c27a', '#c4a0a0', '#a8b5c9'];
  const toXYZ = (lon, lat) => {
    const l = lon * D2R, p = lat * D2R, cp = Math.cos(p);
    return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)];
  };

  WM.init = function (canvas, onSelect) {
    WM.canvas = canvas;
    WM.ctx = canvas.getContext('2d');
    WM.onSelect = onSelect;
    WM.items = ITEMS || (ITEMS = S.WORLD.map(c => {
      const rings = [], ll = [];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, lbest = -1, lbox = null;
      let sx = 0, sy = 0, sz = 0;
      for (const r of c.r) {
        const n = r.length / 2;
        const xyz = new Float32Array(n * 3), lonlat = new Float32Array(n * 2);
        let rx0 = 1e9, ry0 = 1e9, rx1 = -1e9, ry1 = -1e9, area = 0;
        for (let i = 0; i < n; i++) {
          const lon = r[i * 2] / 100, lat = r[i * 2 + 1] / 100;
          lonlat[i * 2] = lon; lonlat[i * 2 + 1] = lat;
          const v = toXYZ(lon, lat);
          xyz[i * 3] = v[0]; xyz[i * 3 + 1] = v[1]; xyz[i * 3 + 2] = v[2];
          sx += v[0]; sy += v[1]; sz += v[2];
          if (lon < rx0) rx0 = lon; if (lon > rx1) rx1 = lon; if (lat < ry0) ry0 = lat; if (lat > ry1) ry1 = lat;
          const j = (i + 1) % n;
          area += lon * (r[j * 2 + 1] / 100) - (r[j * 2] / 100) * lat;
        }
        area = Math.abs(area) / 2 * Math.cos(((ry0 + ry1) / 2) * D2R);
        if (area > lbest) { lbest = area; lbox = [rx0, ry0, rx1, ry1]; }
        x0 = Math.min(x0, rx0); x1 = Math.max(x1, rx1); y0 = Math.min(y0, ry0); y1 = Math.max(y1, ry1);
        rings.push(xyz); ll.push({ pts: lonlat, box: [rx0, ry0, rx1, ry1] });
      }
      // Mittelpunkt und Winkelradius des Kernlands (für Kamera, Beschriftung, Sichtbarkeit)
      const cLon = (lbox[0] + lbox[2]) / 2, cLat = (lbox[1] + lbox[3]) / 2;
      const center = toXYZ(cLon, cLat);
      let rad = 0;
      for (const xyz of rings) for (let i = 0; i < xyz.length; i += 3) {
        const d = xyz[i] * center[0] + xyz[i + 1] * center[1] + xyz[i + 2] * center[2];
        rad = Math.max(rad, Math.acos(Math.min(1, d)));
      }
      let mainRad = Math.max(0.004, Math.max((lbox[2] - lbox[0]) * Math.cos(cLat * D2R), lbox[3] - lbox[1]) * D2R / 2);
      return { c, rings, ll, box: [x0, y0, x1, y1], lbox, center, cLon, cLat, rad, mainRad, area: lbest, color: PALETTE[(c.c || 1) % PALETTE.length] };
    }));
    // Gradnetz
    WM.grid = [];
    for (let lon = -180; lon < 180; lon += 30) { const l = []; for (let lat = -88; lat <= 88; lat += 4) l.push(toXYZ(lon, lat)); WM.grid.push(l); }
    for (let lat = -60; lat <= 60; lat += 30) { const l = []; for (let lon = -180; lon <= 180; lon += 4) l.push(toXYZ(lon, lat)); WM.grid.push(l); }
    // Sterne
    const rnd = S.rng(7);
    WM.stars = Array.from({ length: 160 }, () => [rnd(), rnd(), rnd() * 1.2 + 0.3, rnd() * 0.6 + 0.2]);
    if (!opts.noInput) bindInput(canvas);
    WM.resize();
  };

  WM.resize = function () {
    const c = WM.canvas, r = c.getBoundingClientRect();
    WM.dpr = Math.min(opts.maxDpr || 3, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * WM.dpr)); c.height = Math.max(1, Math.round(r.height * WM.dpr));
    WM.cw = r.width; WM.ch = r.height;
    WM.baseR = Math.min(WM.cw, WM.ch * 0.8) * 0.44;
  };

  /** Zeigerposition relativ zur Leinwand (unabhängig von Rändern und Skalierung) */
  WM.evX = (e) => { const r = WM.canvas.getBoundingClientRect(); return (e.clientX - r.left) * (WM.cw / (r.width || 1)); };
  WM.evY = (e) => { const r = WM.canvas.getBoundingClientRect(); return (e.clientY - r.top) * (WM.ch / (r.height || 1)); };
  /** Größe nachführen, wenn sich der Platz auf dem Bildschirm geändert hat */
  WM.syncSize = function () {
    const c = WM.canvas;
    if (c && c.clientWidth && c.clientHeight && (Math.abs(c.clientWidth - WM.cw) > 0.5 || Math.abs(c.clientHeight - WM.ch) > 0.5)) WM.resize();
  };
  const radius = () => WM.baseR * WM.zoom;
  const center = () => [WM.cw / 2, WM.ch * (opts.cy || 0.46)];

  function matrix() {
    const l = WM.lon * D2R, p = WM.lat * D2R;
    const sl = Math.sin(l), cl = Math.cos(l), sp = Math.sin(p), cp = Math.cos(p);
    return [-sl, cl, 0, -cl * sp, -sl * sp, cp, cl * cp, sl * cp, sp];
  }

  /** [lon, lat] -> Bildschirmpunkt [x, y, Tiefe] (Tiefe < 0: Rückseite) */
  WM.project = function (lon, lat) {
    const [cx, cy] = center(), R = radius(), m = WM._m || matrix();
    const v = toXYZ(lon, lat);
    const d = v[0] * m[6] + v[1] * m[7] + v[2] * m[8];
    return [cx + R * (v[0] * m[0] + v[1] * m[1]), cy - R * (v[0] * m[3] + v[1] * m[4] + v[2] * m[5]), d];
  };

  /** Bildschirmpunkt -> [lon, lat] oder null */
  function unproject(sx, sy) {
    const [cx, cy] = center(), R = radius();
    const r = (sx - cx) / R, u = -(sy - cy) / R;
    const q = r * r + u * u;
    if (q > 1) return null;
    const d = Math.sqrt(1 - q);
    const m = matrix();
    const x = m[0] * r + m[3] * u + m[6] * d, y = m[1] * r + m[4] * u + m[7] * d, z = m[2] * r + m[5] * u + m[8] * d;
    return [Math.atan2(y, x) / D2R, Math.asin(Math.max(-1, Math.min(1, z))) / D2R];
  }

  function hit(sx, sy) {
    const p = unproject(sx, sy);
    if (!p) return null;
    const [x, y] = p;
    let best = null;
    for (const it of WM.items) {
      const b = it.box;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      for (const ring of it.ll) {
        const rb = ring.box;
        if (x < rb[0] || x > rb[2] || y < rb[1] || y > rb[3]) continue;
        const pts = ring.pts;
        let inside = false;
        for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
          if ((pts[i + 1] > y) !== (pts[j + 1] > y) && x < (pts[j] - pts[i]) * (y - pts[i + 1]) / (pts[j + 1] - pts[i + 1]) + pts[i]) inside = !inside;
        }
        if (inside) { if (!best || it.area < best.area) best = it; break; }
      }
    }
    // Kleinstaaten: nächstgelegenes Land in Fingerreichweite
    if (!best) {
      const v = toXYZ(x, y);
      let bd = 22 / radius();
      for (const it of WM.items) {
        if (it.mainRad > 0.02) continue;
        const d = Math.acos(Math.min(1, v[0] * it.center[0] + v[1] * it.center[1] + v[2] * it.center[2]));
        if (d < bd) { bd = d; best = it; }
      }
    }
    return best;
  }

  // ---------- Kamera ----------
  WM.focus = function (item) {
    const R0 = WM.baseR;
    const want = Math.min(WM.cw, WM.ch) * 0.3;
    const zoom = S.clamp(want / (R0 * Math.sin(Math.min(1.2, item.mainRad * 1.15))), 1, WM.maxZoom);
    WM.anim = { lon0: WM.lon, lat0: WM.lat, z0: WM.zoom, lon1: item.cLon, lat1: S.clamp(item.cLat, -70, 75), z1: zoom, t: 0 };
    let d = WM.anim.lon1 - WM.anim.lon0;
    while (d > 180) d -= 360; while (d < -180) d += 360;
    WM.anim.lon1 = WM.anim.lon0 + d;
    WM.idle = false;
  };

  function step(dt) {
    if (WM.anim) {
      const a = WM.anim;
      a.t = Math.min(1, a.t + dt / (a.ms || 900));
      const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
      WM.lon = a.lon0 + (a.lon1 - a.lon0) * e;
      WM.lat = a.lat0 + (a.lat1 - a.lat0) * e;
      WM.zoom = Math.exp(Math.log(a.z0) + (Math.log(a.z1) - Math.log(a.z0)) * e);
      if (a.t >= 1) WM.anim = null;
    } else if (!WM.dragging) {
      if (Math.abs(WM.vLon) + Math.abs(WM.vLat) > 0.001) {
        WM.lon += WM.vLon * dt; WM.lat = S.clamp(WM.lat + WM.vLat * dt, -80, 80);
        const f = Math.pow(0.94, dt / 16);
        WM.vLon *= f; WM.vLat *= f;
      } else if (WM.idle) WM.lon += dt * 0.004;
    }
    if (WM.lon > 180) WM.lon -= 360; if (WM.lon < -180) WM.lon += 360;
  }

  // ---------- Satellitenkugel ----------
  let sphere = null;
  /**
   * Kugel Pixel für Pixel aus der Mercator-Textur abtasten. Das Ergebnis wird zwischengespeichert;
   * während sich die Ansicht bewegt, in geringerer Auflösung.
   */
  function texturedSphere(c, tex, cx, cy, R, m) {
    const key = WM.lon.toFixed(2) + ',' + WM.lat.toFixed(2) + ',' + Math.round(R);
    const moving = !sphere || sphere.key !== key;
    const still = sphere && sphere.lastKey === key;
    const maxS = Math.round(Math.min(2 * R * WM.dpr, 640));
    const Sz = Math.max(64, Math.min(maxS, still ? maxS : 300));
    if (moving || (still && sphere.size < Sz)) {
      const cv = (sphere && sphere.cv && sphere.cv.width === Sz) ? sphere.cv : document.createElement('canvas');
      cv.width = cv.height = Sz;
      const g = cv.getContext('2d'), img = g.createImageData(Sz, Sz), d = img.data;
      const N = tex.N, T = tex.data, TWO_PI = Math.PI * 2;
      for (let j = 0; j < Sz; j++) {
        const u = 1 - (j + 0.5) / Sz * 2;
        for (let i = 0; i < Sz; i++) {
          const r = (i + 0.5) / Sz * 2 - 1, q = r * r + u * u;
          if (q > 1) continue;
          const dd = Math.sqrt(1 - q);
          const x = m[0] * r + m[3] * u + m[6] * dd, y = m[1] * r + m[4] * u + m[7] * dd, z = m[2] * r + m[5] * u + m[8] * dd;
          const lon = Math.atan2(y, x), lat = Math.asin(z > 1 ? 1 : z < -1 ? -1 : z);
          const la = Math.max(-1.4844, Math.min(1.4844, lat));
          const o = (j * Sz + i) * 4;
          // polare Kappen jenseits der Textur
          if (Math.abs(lat) > 1.4844) { d[o] = 228; d[o + 1] = 234; d[o + 2] = 240; d[o + 3] = 255; continue; }
          // weich (bilinear) abtasten, damit die Textur aus der Nähe nicht pixelig wirkt
          const fu = (lon / TWO_PI + 0.5) * N - 0.5, fv = Math.max(0, Math.min(N - 1.001, (Math.PI - Math.log(Math.tan(Math.PI / 4 + la / 2))) / TWO_PI * N - 0.5));
          const u0 = Math.floor(fu), v0 = Math.floor(fv), au = fu - u0, av = fv - v0;
          const x0 = ((u0 % N) + N) % N, x1 = (x0 + 1) % N, y1 = Math.min(N - 1, v0 + 1);
          const s00 = (v0 * N + x0) * 4, s10 = (v0 * N + x1) * 4, s01 = (y1 * N + x0) * 4, s11 = (y1 * N + x1) * 4;
          const w00 = (1 - au) * (1 - av), w10 = au * (1 - av), w01 = (1 - au) * av, w11 = au * av;
          d[o] = T[s00] * w00 + T[s10] * w10 + T[s01] * w01 + T[s11] * w11;
          d[o + 1] = T[s00 + 1] * w00 + T[s10 + 1] * w10 + T[s01 + 1] * w01 + T[s11 + 1] * w11;
          d[o + 2] = T[s00 + 2] * w00 + T[s10 + 2] * w10 + T[s01 + 2] * w01 + T[s11 + 2] * w11;
          d[o + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
      sphere = { key, cv, size: Sz, lastKey: key };
    } else sphere.lastKey = key;
    c.imageSmoothingEnabled = true;
    c.drawImage(sphere.cv, cx - R, cy - R, R * 2, R * 2);
  }

  // ---------- Zeichnen ----------
  let lastT = 0;
  WM.draw = function (now) {
    const c = WM.ctx;
    if (!c) return;
    if (!opts.noInput) WM.syncSize();
    const dt = lastT ? Math.min(50, (now || performance.now()) - lastT) : 16;
    lastT = now || performance.now();
    step(dt);
    if (opts.onFrame) opts.onFrame(WM);
    const dpr = WM.dpr, W = WM.cw, H = WM.ch;
    const [cx, cy] = center(), R = radius();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Weltraum
    const bg = c.createRadialGradient(cx, cy, R * 0.5, cx, cy, Math.max(W, H));
    bg.addColorStop(0, '#13243a'); bg.addColorStop(1, '#070d16');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = '#dfe8f5';
    for (const [x, y, r, a] of WM.stars) { c.globalAlpha = a; c.fillRect(x * W, y * H, r, r); }
    c.globalAlpha = 1;
    // Atmosphäre
    const atm = c.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.12);
    atm.addColorStop(0, 'rgba(120,180,255,0.45)'); atm.addColorStop(1, 'rgba(120,180,255,0)');
    c.fillStyle = atm; c.beginPath(); c.arc(cx, cy, R * 1.12, 0, Math.PI * 2); c.fill();
    // Ozean
    const sea = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    sea.addColorStop(0, '#2f6d9e'); sea.addColorStop(1, '#173a5e');
    c.fillStyle = sea; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    const m = matrix();
    WM._m = m;
    const vx = m[6], vy = m[7], vz = m[8];
    // Gradnetz
    c.strokeStyle = 'rgba(170,210,240,0.14)'; c.lineWidth = 1;
    c.beginPath();
    for (const line of WM.grid) {
      let pen = false;
      for (const p of line) {
        const d = p[0] * vx + p[1] * vy + p[2] * vz;
        if (d < 0) { pen = false; continue; }
        const sx = cx + R * (p[0] * m[0] + p[1] * m[1]), sy = cy - R * (p[0] * m[3] + p[1] * m[4] + p[2] * m[5]);
        if (pen) c.lineTo(sx, sy); else { c.moveTo(sx, sy); pen = true; }
      }
    }
    c.stroke();
    // Länder
    const view = [vx, vy, vz];
    const visible = [];
    for (const it of WM.items) {
      const d = it.center[0] * vx + it.center[1] * vy + it.center[2] * vz;
      if (Math.acos(Math.max(-1, Math.min(1, d))) > Math.PI / 2 + it.rad + 0.02) continue;
      const path = new Path2D();
      let any = false;
      for (const xyz of it.rings) {
        let front = 0;
        const n = xyz.length / 3;
        for (let i = 0; i < n; i++) {
          const x = xyz[i * 3], y = xyz[i * 3 + 1], z = xyz[i * 3 + 2];
          const dd = x * view[0] + y * view[1] + z * view[2];
          let r = x * m[0] + y * m[1], u = x * m[3] + y * m[4] + z * m[5];
          if (dd < 0) { const l = Math.hypot(r, u) || 1; r /= l; u /= l; } else front++;
          const sx = cx + R * r, sy = cy - R * u;
          if (i === 0) path.moveTo(sx, sy); else path.lineTo(sx, sy);
        }
        if (front) { path.closePath(); any = true; }
      }
      if (any) visible.push([it, path, d]);
    }
    const tex = opts.texture ? opts.texture() : null;
    if (tex) {
      // Satellitenbild auf der Kugel, Länder nur als feine Grenzen, Auswahl leicht getönt
      texturedSphere(c, tex, cx, cy, R, m);
      for (const [it, path] of visible) {
        if (it !== WM.sel && it !== WM.hover) continue;
        c.globalAlpha = it === WM.sel ? 0.32 : 0.2;
        c.fillStyle = it === WM.sel ? '#e8b23a' : '#fff6dc';
        c.fill(path);
        c.globalAlpha = 1;
      }
      c.strokeStyle = 'rgba(250,245,232,0.55)'; c.lineWidth = Math.min(1, 0.4 + WM.zoom * 0.06);
      for (const [, path] of visible) c.stroke(path);
    } else {
      for (const [it, path] of visible) {
        c.fillStyle = it === WM.sel ? '#e8b23a' : it === WM.hover ? '#efe3c4' : it.color;
        c.fill(path);
      }
      c.strokeStyle = 'rgba(30,40,50,0.5)'; c.lineWidth = Math.min(1.2, 0.5 + WM.zoom * 0.08);
      for (const [, path] of visible) c.stroke(path);
    }
    if (WM.sel) {
      const v = visible.find(x => x[0] === WM.sel);
      if (v) { c.strokeStyle = '#fff6dc'; c.lineWidth = 2; c.stroke(v[1]); }
    }
    // Zusatzebene (z. B. eroberte Gebiete im Spiel)
    if (opts.overlay) opts.overlay(c, WM);
    // Licht und Schatten der Kugel
    const shade = c.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.05, cx, cy, R * 1.02);
    shade.addColorStop(0, 'rgba(255,250,235,0.16)');
    shade.addColorStop(0.55, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(2,8,20,0.55)');
    c.fillStyle = shade; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    c.restore();
    // Markierung für sehr kleine Länder
    if (WM.sel) {
      const s = WM.sel, p = s.center;
      const d = p[0] * vx + p[1] * vy + p[2] * vz;
      if (d > 0 && R * s.mainRad < 9) {
        const sx = cx + R * (p[0] * m[0] + p[1] * m[1]), sy = cy - R * (p[0] * m[3] + p[1] * m[4] + p[2] * m[5]);
        c.strokeStyle = '#e8b23a'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(sx, sy, 12, 0, Math.PI * 2); c.stroke();
      }
    }
    // Beschriftung
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '700 11px "Big Shoulders Display", "Public Sans", system-ui, sans-serif';
    for (const [it, , d] of visible) {
      if (d < 0.35 || (WM.hidden && WM.hidden.has(it))) continue;
      const w = R * Math.sin(Math.min(1.4, it.mainRad)) * 2;
      if (w < 64 && it !== WM.sel) continue;
      const p = it.center;
      const sx = cx + R * (p[0] * m[0] + p[1] * m[1]), sy = cy - R * (p[0] * m[3] + p[1] * m[4] + p[2] * m[5]);
      if (sx < 0 || sy < 0 || sx > W || sy > H) continue;
      c.fillStyle = it === WM.sel ? '#1a2633' : 'rgba(26,38,51,' + (0.35 + d * 0.45).toFixed(2) + ')';
      c.fillText(it.c.n.toUpperCase(), sx, sy);
    }
  };

  // ---------- Touch und Maus ----------
  function bindInput(cv) {
    const ptrs = new Map();
    let drag = null, pinch = null, lastTap = 0, lastMove = 0;
    const stopIdle = () => { WM.idle = false; WM.anim = null; };
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetische Zeiger */ }
      ptrs.set(e.pointerId, { x: WM.evX(e), y: WM.evY(e) });
      stopIdle();
      WM.vLon = 0; WM.vLat = 0;
      if (ptrs.size === 1) {
        drag = { x: WM.evX(e), y: WM.evY(e), lx: WM.evX(e), ly: WM.evY(e), moved: false, t: performance.now() };
        WM.dragging = true;
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: WM.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        if (drag) drag.moved = true;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') WM.hover = hit(WM.evX(e), WM.evY(e));
        return;
      }
      p.x = WM.evX(e); p.y = WM.evY(e);
      if (ptrs.size >= 2 && pinch) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        WM.zoom = S.clamp(pinch.z * d / pinch.d, 0.7, WM.maxZoom);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        rotateBy(mx - pinch.mx, my - pinch.my);
        pinch.mx = mx; pinch.my = my;
        return;
      }
      if (!drag) return;
      const dx = WM.evX(e) - drag.lx, dy = WM.evY(e) - drag.ly;
      if (Math.abs(WM.evX(e) - drag.x) + Math.abs(WM.evY(e) - drag.y) > 6) drag.moved = true;
      if (drag.moved) {
        rotateBy(dx, dy);
        const now = performance.now(), dtm = Math.max(8, now - lastMove);
        const R = radius();
        WM.vLon = -dx / R / D2R / dtm * 0.9 / Math.max(0.2, Math.cos(WM.lat * D2R));
        WM.vLat = dy / R / D2R / dtm * 0.9;
        lastMove = now;
      }
      drag.lx = WM.evX(e); drag.ly = WM.evY(e);
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) {
        WM.dragging = false;
        if (performance.now() - lastMove > 80) { WM.vLon = 0; WM.vLat = 0; }
        if (drag && !drag.moved) {
          const now = performance.now();
          if (now - lastTap < 300) {
            // Doppeltippen: hineinzoomen
            WM.anim = { lon0: WM.lon, lat0: WM.lat, z0: WM.zoom, lon1: WM.lon, lat1: WM.lat, z1: Math.min(WM.maxZoom, WM.zoom * 2.2), t: 0 };
            const p = unproject(WM.evX(e), WM.evY(e));
            if (p) { WM.anim.lon1 = WM.lon + angleDiff(p[0], WM.lon) * 0.6; WM.anim.lat1 = S.clamp(WM.lat + (p[1] - WM.lat) * 0.6, -75, 80); }
            lastTap = 0;
          } else {
            lastTap = now;
            const h = hit(WM.evX(e), WM.evY(e));
            if (h) { WM.sel = h; WM.onSelect(h); }
          }
        }
        drag = null; pinch = null;
      } else if (ptrs.size === 1) {
        pinch = null;
        const [q] = [...ptrs.values()];
        drag = { x: q.x, y: q.y, lx: q.x, ly: q.y, moved: true };
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') WM.hover = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault(); stopIdle();
      WM.zoom = S.clamp(WM.zoom * Math.exp(-e.deltaY * 0.0015), 0.7, WM.maxZoom);
    }, { passive: false });
  }
  const angleDiff = (a, b) => { let d = a - b; while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

  function rotateBy(dx, dy) {
    const R = radius();
    WM.lon -= dx / R / D2R / Math.max(0.25, Math.cos(WM.lat * D2R));
    WM.lat = S.clamp(WM.lat + dy / R / D2R, -80, 80);
  }

  WM.zoomBy = function (f) { stopAnim(); WM.zoom = S.clamp(WM.zoom * f, 0.7, WM.maxZoom); };
  function stopAnim() { WM.anim = null; WM.idle = false; }

  /** Kamera sofort auf ein Land setzen (Zoom so, dass es etwa `frac` des Bildschirms füllt) */
  WM.lookAt = function (item, frac) {
    WM.lon = item.cLon; WM.lat = S.clamp(item.cLat, -75, 80);
    WM.zoom = WM.zoomFor(item, frac);
    WM.vLon = 0; WM.vLat = 0; WM.anim = null; WM.idle = false;
  };
  WM.zoomFor = (item, frac) => S.clamp(Math.min(WM.cw, WM.ch) * frac / 2 / (WM.baseR * Math.sin(Math.min(1.2, item.mainRad * 1.1))), 0.7, WM.maxZoom);
  /** Weicher Kameraflug */
  WM.flyTo = function (lon, lat, zoom, ms) {
    let d = lon - WM.lon; while (d > 180) d -= 360; while (d < -180) d += 360;
    WM.anim = { lon0: WM.lon, lat0: WM.lat, z0: WM.zoom, lon1: WM.lon + d, lat1: lat, z1: zoom, t: 0, ms: ms || 900 };
    WM.idle = false;
  };
  WM.itemById = (id) => WM.items.find(it => it.c.id === id);
  WM.unproject = (sx, sy) => unproject(sx, sy);
  WM.hit = (sx, sy) => hit(sx, sy);

  return WM;
  };

  const WM = S.WM = S.makeGlobe({ texture: () => (S.Sat ? S.Sat.get() : null) });

  /** Kleine Umriss-Vorschau eines Landes für die Infokarte */
  WM.shapePreview = function (canvas, item) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = canvas.clientWidth || 120, H = canvas.clientHeight || 90;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const sel = S.selectRings(item.c);
    const b = sel.box, k = Math.cos((b.y0 + b.y1) / 2 * D2R);
    const sw = (b.x1 - b.x0) * k, sh = b.y1 - b.y0;
    const s = Math.min(W / sw, H / sh) * 0.86;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8b23a'; ctx.strokeStyle = '#fff6dc'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const r of sel.rings) {
      r.p.forEach(([lon, lat], i) => {
        const x = W / 2 + ((lon - (b.x0 + b.x1) / 2) * k) * s, y = H / 2 - (lat - (b.y0 + b.y1) / 2) * s;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
  };
})(S);
