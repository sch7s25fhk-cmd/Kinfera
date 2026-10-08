/* Souverän – Weltkarte zur Wahl des Landes (Natural-Earth-Projektion) */
'use strict';
(function (S) {
  const WM = S.WM = { cam: { x: 0, y: 0, z: 1 }, hover: null, sel: null };

  function project(lon, lat) {
    const l = lon * Math.PI / 180, p = lat * Math.PI / 180;
    const p2 = p * p, p4 = p2 * p2;
    const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
    const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
    return [x, -y];
  }
  WM.project = project;

  const PALETTE = ['#c9b98f', '#a9bf8e', '#d4a77f', '#b7a6c9', '#9fc0b9', '#d9c27a', '#c4a0a0', '#a8b5c9'];

  WM.init = function (canvas, onSelect) {
    WM.canvas = canvas;
    WM.ctx = canvas.getContext('2d');
    WM.onSelect = onSelect;
    WM.items = S.WORLD.map(c => {
      const path = new Path2D();
      const rings = [];
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, area = 0, lbox = null, lbest = -1;
      for (const r of c.r) {
        let rx0 = 1e9, ry0 = 1e9, rx1 = -1e9, ry1 = -1e9, ra = 0;
        const pts = new Float32Array(r.length);
        for (let i = 0; i < r.length; i += 2) {
          const [x, y] = project(r[i] / 100, r[i + 1] / 100);
          pts[i] = x; pts[i + 1] = y;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x < rx0) rx0 = x; if (x > rx1) rx1 = x; if (y < ry0) ry0 = y; if (y > ry1) ry1 = y;
          if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
        }
        path.closePath();
        for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) ra += pts[j] * pts[i + 1] - pts[i] * pts[j + 1];
        ra = Math.abs(ra) / 2;
        area += ra;
        if (ra > lbest) { lbest = ra; lbox = [rx0, ry0, rx1, ry1]; }
        rings.push(pts);
      }
      return { c, path, rings, box: [x0, y0, x1, y1], lbox, area, color: PALETTE[(c.c || 1) % PALETTE.length] };
    });
    // Graticule
    WM.grid = new Path2D();
    for (let lon = -180; lon <= 180; lon += 30) for (let lat = -60; lat <= 84; lat += 2) {
      const [x, y] = project(lon, lat);
      if (lat === -60) WM.grid.moveTo(x, y); else WM.grid.lineTo(x, y);
    }
    for (let lat = -60; lat <= 80; lat += 20) for (let lon = -180; lon <= 180; lon += 3) {
      const [x, y] = project(lon, lat);
      if (lon === -180) WM.grid.moveTo(x, y); else WM.grid.lineTo(x, y);
    }
    WM.outline = new Path2D();
    for (let lat = -60; lat <= 84; lat += 2) { const [x, y] = project(-180, lat); if (lat === -60) WM.outline.moveTo(x, y); else WM.outline.lineTo(x, y); }
    for (let lat = 84; lat >= -60; lat -= 2) { const [x, y] = project(180, lat); WM.outline.lineTo(x, y); }
    WM.outline.closePath();
    bindInput(canvas);
    WM.resize();
    WM.fit();
  };

  WM.resize = function () {
    const c = WM.canvas, r = c.getBoundingClientRect();
    WM.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * WM.dpr)); c.height = Math.max(1, Math.round(r.height * WM.dpr));
    WM.cw = r.width; WM.ch = r.height;
  };

  WM.fit = function () {
    WM.cam.z = Math.min(WM.cw / 5.6, WM.ch / 2.6);
    WM.cam.x = 0.15; WM.cam.y = -0.25;
  };

  WM.focus = function (item) {
    const [x0, y0, x1, y1] = item.lbox;
    WM.cam.x = (x0 + x1) / 2; WM.cam.y = (y0 + y1) / 2;
    const span = Math.max(x1 - x0, (y1 - y0) * 1.3, 0.12);
    WM.cam.z = S.clamp(Math.min(WM.cw, WM.ch) / span * 0.45, Math.min(WM.cw / 5.6, WM.ch / 2.6), 6000);
  };

  const toWorld = (sx, sy) => [(sx - WM.cw / 2) / WM.cam.z + WM.cam.x, (sy - WM.ch / 2) / WM.cam.z + WM.cam.y];

  function hit(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    let best = null;
    for (const it of WM.items) {
      const b = it.box;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      let inside = false;
      for (const p of it.rings) {
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
          if ((p[i + 1] > y) !== (p[j + 1] > y) && x < (p[j] - p[i]) * (y - p[i + 1]) / (p[j + 1] - p[i + 1]) + p[i]) inside = !inside;
        }
        if (inside) break;
      }
      if (inside && (!best || it.area < best.area)) best = it;
    }
    return best;
  }

  WM.draw = function () {
    const c = WM.ctx, z = WM.cam.z;
    if (!c) return;
    c.setTransform(WM.dpr, 0, 0, WM.dpr, 0, 0);
    c.fillStyle = '#152536';
    c.fillRect(0, 0, WM.cw, WM.ch);
    c.setTransform(WM.dpr * z, 0, 0, WM.dpr * z, WM.dpr * (WM.cw / 2 - WM.cam.x * z), WM.dpr * (WM.ch / 2 - WM.cam.y * z));
    c.fillStyle = '#1d3a55';
    c.fill(WM.outline);
    c.strokeStyle = 'rgba(160,200,230,0.12)';
    c.lineWidth = 1 / z;
    c.stroke(WM.grid);
    const [vx0, vy0] = toWorld(0, 0), [vx1, vy1] = toWorld(WM.cw, WM.ch);
    for (const it of WM.items) {
      const b = it.box;
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      c.fillStyle = it === WM.sel ? '#e8b23a' : it === WM.hover ? '#efe3c4' : it.color;
      c.fill(it.path);
    }
    c.strokeStyle = 'rgba(30,40,50,0.55)';
    c.lineWidth = 0.7 / z;
    for (const it of WM.items) {
      const b = it.box;
      if (b[2] < vx0 || b[0] > vx1 || b[3] < vy0 || b[1] > vy1) continue;
      c.stroke(it.path);
    }
    if (WM.sel) {
      c.strokeStyle = '#fff6dc'; c.lineWidth = 2 / z;
      c.stroke(WM.sel.path);
      // Marker für kleine Länder
      const b = WM.sel.lbox;
      if ((b[2] - b[0]) * z < 14) {
        c.beginPath(); c.arc((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, 10 / z, 0, Math.PI * 2);
        c.strokeStyle = '#e8b23a'; c.lineWidth = 2.5 / z; c.stroke();
      }
    }
    // Ländernamen bei genügend Zoom
    c.setTransform(WM.dpr, 0, 0, WM.dpr, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '600 11px "Big Shoulders Display", "Public Sans", system-ui, sans-serif';
    for (const it of WM.items) {
      const b = it.lbox;
      const w = (b[2] - b[0]) * z;
      if (w < 70 && it !== WM.sel) continue;
      const sx = ((b[0] + b[2]) / 2 - WM.cam.x) * z + WM.cw / 2, sy = ((b[1] + b[3]) / 2 - WM.cam.y) * z + WM.ch / 2;
      if (sx < 0 || sy < 0 || sx > WM.cw || sy > WM.ch) continue;
      c.fillStyle = it === WM.sel ? '#1a2633' : 'rgba(26,38,51,0.75)';
      c.fillText(it.c.n.toUpperCase(), sx, sy);
    }
  };

  function bindInput(cv) {
    const ptrs = new Map();
    let drag = null, pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (ptrs.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: WM.cam.x, cy: WM.cam.y, moved: false };
      else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: WM.cam.z };
        drag = null;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (pinch && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        WM.cam.z = S.clamp(pinch.z * d / pinch.d, 60, 6000);
        return;
      }
      if (drag) {
        const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
        if (drag.moved) { WM.cam.x = drag.cx - dx / WM.cam.z; WM.cam.y = drag.cy - dy / WM.cam.z; }
        return;
      }
      if (e.pointerType === 'mouse') {
        const h = hit(e.offsetX, e.offsetY);
        WM.hover = h;
        cv.style.cursor = h ? 'pointer' : 'grab';
      }
    });
    const up = (e) => {
      ptrs.delete(e.pointerId);
      if (drag && !drag.moved) {
        const h = hit(e.offsetX, e.offsetY);
        if (h) { WM.sel = h; WM.onSelect(h); }
      }
      if (ptrs.size < 2) pinch = null;
      drag = null;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { WM.hover = null; });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wy] = toWorld(e.offsetX, e.offsetY);
      const f = Math.exp(-e.deltaY * 0.0015);
      WM.cam.z = S.clamp(WM.cam.z * f, 60, 6000);
      WM.cam.x = wx - (e.offsetX - WM.cw / 2) / WM.cam.z;
      WM.cam.y = wy - (e.offsetY - WM.ch / 2) / WM.cam.z;
    }, { passive: false });
  }

  /** Kleine Umriss-Vorschau eines Landes für die Infokarte */
  WM.shapePreview = function (canvas, item) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth || 120, H = canvas.clientHeight || 90;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const sel = S.selectRings(item.c);
    const b = sel.box, k = Math.cos((b.y0 + b.y1) / 2 * Math.PI / 180);
    const sw = (b.x1 - b.x0) * k, sh = b.y1 - b.y0;
    const s = Math.min(W / sw, H / sh) * 0.86;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#e8b23a';
    ctx.strokeStyle = '#fff6dc';
    ctx.lineWidth = 1;
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
