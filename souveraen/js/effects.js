/* Souverän – Effekte: Gefechte, Explosionen, Frontlinien, Wolken, Abzeichen der Einheiten */
'use strict';
(function (S) {
  const R = S.R, World = S.World;
  const FX = S.FX = { booms: [] };
  const hash = (a, b) => S.hash2(a, b, 7331);

  // ---------------- Explosion ----------------
  /** k: Verlauf 0..1, size: Radius in Pixeln */
  function boom(c, x, y, k, size) {
    const a = 1 - k;
    // Rauch
    c.fillStyle = 'rgba(70,64,58,' + (0.45 * a).toFixed(3) + ')';
    c.beginPath(); c.arc(x + k * 3, y - k * size * 0.6, size * (0.5 + k * 0.9), 0, Math.PI * 2); c.fill();
    // Feuerball
    if (k < 0.6) {
      const f = k / 0.6;
      const g = c.createRadialGradient(x, y, 0, x, y, size * (0.35 + f * 0.65));
      g.addColorStop(0, 'rgba(255,248,210,' + (1 - f).toFixed(3) + ')');
      g.addColorStop(0.45, 'rgba(255,170,50,' + (0.9 * (1 - f)).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(200,60,20,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, size * (0.35 + f * 0.65), 0, Math.PI * 2); c.fill();
    }
    // Druckwelle
    if (k < 0.5) {
      c.strokeStyle = 'rgba(255,235,200,' + (0.6 * (1 - k * 2)).toFixed(3) + ')';
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, size * (0.4 + k * 2.2), 0, Math.PI * 2); c.stroke();
    }
  }

  function flash(c, x, y, dx, dy, s) {
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    const g = c.createRadialGradient(x + ux * s * 0.6, y + uy * s * 0.6, 0, x + ux * s * 0.6, y + uy * s * 0.6, s);
    g.addColorStop(0, 'rgba(255,250,220,0.95)'); g.addColorStop(0.4, 'rgba(255,190,70,0.7)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x + ux * s * 0.6, y + uy * s * 0.6, s, 0, Math.PI * 2); c.fill();
  }

  /**
   * Gefechte zeichnen (Bildschirmkoordinaten): Infanterie mit Leuchtspurgarben, Panzer mit Schuss und Einschlag,
   * Artillerie mit Granatenbogen und Explosion. Alles aus dem aktuellen Gefechtszustand abgeleitet.
   */
  FX.combat = function (c, G, T, byId) {
    const off = (x, y) => x < -60 || y < -60 || x > R.cw + 60 || y > R.ch + 60;
    for (const u of G.mil.units) {
      if (!u.fight) continue;
      const v = byId.get(u.fight);
      if (!v) continue;
      const [x0, y0] = R.gToScreen(u.x, u.y), [x1, y1] = R.gToScreen(v.x, v.y);
      if (off(x0, y0) && off(x1, y1)) continue;
      const dx = x1 - x0, dy = y1 - y0, dist = Math.hypot(dx, dy) || 1;
      const seed = (u.id * 0.6180339) % 1;
      if (u.type === 'art') {
        const per = 1.7, cyc = T / per + seed, ph = cyc % 1, n = Math.floor(cyc);
        const jx = (hash(u.id, n) - 0.5) * 18, jy = (hash(n, u.id) - 0.5) * 12;
        if (ph < 0.1) flash(c, x0, y0 - 4, dx, dy - dist * 0.5, 9);
        if (ph < 0.62) {
          const k = ph / 0.62, h = Math.min(90, dist * 0.4) * Math.sin(k * Math.PI);
          const px = x0 + (dx + jx) * k, py = y0 + (dy + jy) * k - h;
          c.strokeStyle = 'rgba(255,230,180,0.35)'; c.lineWidth = 1.2;
          const k0 = Math.max(0, k - 0.08), h0 = Math.min(90, dist * 0.4) * Math.sin(k0 * Math.PI);
          c.beginPath(); c.moveTo(x0 + (dx + jx) * k0, y0 + (dy + jy) * k0 - h0); c.lineTo(px, py); c.stroke();
          c.fillStyle = '#2a2622'; c.beginPath(); c.arc(px, py, 2.2, 0, Math.PI * 2); c.fill();
        } else boom(c, x1 + jx, y1 + jy, (ph - 0.62) / 0.38, 15);
      } else if (u.type === 'tank') {
        const per = 1.25, cyc = T / per + seed, ph = cyc % 1, n = Math.floor(cyc);
        const jx = (hash(u.id, n) - 0.5) * 10, jy = (hash(n, u.id) - 0.5) * 8;
        if (ph < 0.12) flash(c, x0, y0, dx, dy, 8);
        if (ph < 0.22) {
          const k = ph / 0.22;
          c.strokeStyle = 'rgba(255,240,170,0.95)'; c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(x0 + dx * Math.max(0, k - 0.25), y0 + dy * Math.max(0, k - 0.25)); c.lineTo(x0 + (dx + jx) * k, y0 + (dy + jy) * k); c.stroke();
        } else if (ph < 0.62) boom(c, x1 + jx, y1 + jy, (ph - 0.22) / 0.4, 9);
      } else {
        // Infanterie: kurze Feuerstöße mit mehreren Leuchtspuren
        const per = 0.55, cyc = T / per + seed, ph = cyc % 1, n = Math.floor(cyc);
        if (ph < 0.5) {
          for (let i = 0; i < 3; i++) {
            const k = (ph / 0.5 + i * 0.33) % 1;
            const jx = (hash(u.id * 3 + i, n) - 0.5) * 16, jy = (hash(n, u.id * 3 + i) - 0.5) * 12;
            const ax = x0 + (dx + jx) * k, ay = y0 + (dy + jy) * k;
            const bx = x0 + (dx + jx) * Math.max(0, k - 0.12), by = y0 + (dy + jy) * Math.max(0, k - 0.12);
            c.strokeStyle = 'rgba(255,225,120,' + (0.9 - k * 0.4).toFixed(2) + ')'; c.lineWidth = 1.3;
            c.beginPath(); c.moveTo(bx, by); c.lineTo(ax, ay); c.stroke();
          }
          if (ph < 0.18) flash(c, x0, y0, dx, dy, 4.5);
        } else {
          // Staub am Ziel
          const k = (ph - 0.5) / 0.5;
          c.fillStyle = 'rgba(190,170,140,' + (0.45 * (1 - k)).toFixed(3) + ')';
          c.beginPath(); c.arc(x1 + (hash(u.id, n) - 0.5) * 14, y1 + (hash(n, u.id) - 0.5) * 10, 3 + k * 6, 0, Math.PI * 2); c.fill();
        }
      }
    }
  };

  /** Vernichtete Einheiten: große Explosion, danach brennendes Wrack mit Rauchsäule */
  FX.events = function (c, G, now) {
    if (G._fx && G._fx.length) {
      for (const e of G._fx) FX.booms.push({ x: e.x, y: e.y, t: now, type: e.type });
      G._fx.length = 0;
      if (FX.booms.length > 40) FX.booms.splice(0, FX.booms.length - 40);
    }
    const LIFE = 26000;
    for (let i = FX.booms.length - 1; i >= 0; i--) {
      const b = FX.booms[i], age = now - b.t;
      if (age > LIFE) { FX.booms.splice(i, 1); continue; }
      const [x, y] = R.gToScreen(b.x, b.y);
      if (x < -80 || y < -120 || x > R.cw + 80 || y > R.ch + 80) continue;
      const fade = 1 - age / LIFE;
      // Brandfleck
      c.fillStyle = 'rgba(30,24,20,' + (0.45 * fade).toFixed(3) + ')';
      c.beginPath(); c.ellipse(x, y + 4, 15, 7, 0, 0, Math.PI * 2); c.fill();
      // Rauchsäule
      for (let k = 0; k < 6; k++) {
        const ph = ((now / 2400) + k / 6) % 1;
        c.fillStyle = 'rgba(60,56,52,' + (0.35 * (1 - ph) * fade).toFixed(3) + ')';
        c.beginPath(); c.arc(x + Math.sin(ph * 5 + k) * 4 + ph * 10, y - 4 - ph * 55, 4 + ph * 12, 0, Math.PI * 2); c.fill();
      }
      // Flammen am Wrack
      if (age < LIFE * 0.6) {
        const fl = 0.6 + 0.4 * Math.sin(now / 90 + b.x);
        c.fillStyle = 'rgba(255,150,40,' + (0.7 * fl * fade).toFixed(3) + ')';
        c.beginPath(); c.arc(x, y, 3 + fl * 2.5, 0, Math.PI * 2); c.fill();
      }
      // große Explosion zu Beginn
      if (age < 1400) boom(c, x, y, age / 1400, 30);
    }
  };

  // ---------------- Frontlinien ----------------
  let front = null;
  function frontSegs(G) {
    const wars = Object.keys(G.mil.wars).join(',');
    const key = wars + '|' + (G._occChange || 0) + '|' + G.gx0 + ',' + G.gy0 + ',' + G.W + ',' + G.H;
    const now = performance.now();
    if (front && (front.key === key || now - front.t < 700)) return front;
    const home = World.homeIdx, W = G.W, H = G.H, o = G.t.owner;
    const enemy = (v) => v !== home && v && (v === 65535 || G.mil.wars[v]);
    const segs = [];
    if (wars) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, a = o[i];
        if (x + 1 < W) { const b = o[i + 1]; if ((a === home && enemy(b)) || (b === home && enemy(a))) segs.push(x + 1, y, x + 1, y + 1); }
        if (y + 1 < H) { const b = o[i + W]; if ((a === home && enemy(b)) || (b === home && enemy(a))) segs.push(x, y + 1, x + 1, y + 1); }
      }
    }
    const p = new Path2D();
    for (let i = 0; i < segs.length; i += 4) { p.moveTo(segs[i], segs[i + 1]); p.lineTo(segs[i + 2], segs[i + 3]); }
    front = { key, t: now, path: p, n: segs.length };
    return front;
  }

  /** Front zwischen dir und Kriegsgegnern: glühende, wandernde Linie */
  FX.front = function (c, G, z, dpr, ppt, T) {
    if (!G.mil || ppt < 1.2) return;
    const f = frontSegs(G);
    if (!f.n) return;
    const TS = S.TS, cam = R.cam, s = z * TS;
    c.save();
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (R.cw / 2 - cam.x * z), dpr * (R.ch / 2 - cam.y * z));
    c.lineCap = 'round'; c.lineJoin = 'round';
    const a = S.clamp((ppt - 1.2) / 2, 0, 1) * R.flatA;
    c.globalAlpha = a * (0.55 + 0.15 * Math.sin(T * 3));
    c.strokeStyle = 'rgba(230,50,30,0.35)'; c.lineWidth = 9 / s;
    c.stroke(f.path);
    c.globalAlpha = a;
    c.strokeStyle = 'rgba(255,90,50,0.95)'; c.lineWidth = 2.4 / s;
    c.setLineDash([7 / s, 5 / s]); c.lineDashOffset = -T * 14 / s;
    c.stroke(f.path);
    c.restore();
  };

  // ---------------- Wolken ----------------
  const sprites = {};
  function cloudSprite(dark) {
    const key = dark ? 'd' : 'w';
    if (sprites[key]) return sprites[key];
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 160;
    const c = cv.getContext('2d');
    const rnd = S.rng(11), col = dark ? '20,30,40' : '255,255,255';
    for (let i = 0; i < 16; i++) {
      const x = 50 + rnd() * 156, y = 55 + rnd() * 50, r = 22 + rnd() * 30;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col + ',0.75)'); g.addColorStop(0.6, 'rgba(' + col + ',0.35)'); g.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    sprites[key] = cv;
    return cv;
  }

  /** Wolken mit Schatten über der Weltkarte; sie ziehen langsam nach Osten und verschwinden beim Hineinzoomen */
  FX.clouds = function (c, G, z, dpr, ppt, T) {
    const a = S.clamp((8 - ppt) / 5, 0, 1) * 0.55 * R.flatA;
    if (a <= 0.01 || R.reduceMotion) return;
    const TS = S.TS, WT = World.WT, cam = R.cam;
    const cell = WT / 24;                       // Wolkenraster in Feldern
    const drift = T * cell / 260;               // ganz langsam ostwärts
    const [vx0, vy0] = R.screenToWorld(-200, -200), [vx1, vy1] = R.screenToWorld(R.cw + 200, R.ch + 200);
    const gx0 = vx0 / TS + G.gx0 - drift, gx1 = vx1 / TS + G.gx0 - drift, gy0 = vy0 / TS + G.gy0, gy1 = vy1 / TS + G.gy0;
    const cs = cloudSprite(), sh = cloudSprite(true);
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let cy = Math.floor(gy0 / cell); cy <= Math.floor(gy1 / cell); cy++) {
      for (let cx = Math.floor(gx0 / cell); cx <= Math.floor(gx1 / cell); cx++) {
        const wcx = ((cx % 24) + 24) % 24;
        const h = hash(wcx, cy);
        if (h > 0.42) continue;
        const gx = (cx + hash(cy, wcx)) * cell + drift, gy = (cy + hash(wcx + 7, cy)) * cell;
        const [sx, sy] = R.worldToScreen((gx - G.gx0) * TS, (gy - G.gy0) * TS);
        const w = cell * TS * z * (1.1 + h * 1.6), hh = w * 0.62;
        if (sx + w < 0 || sx - w > R.cw || sy + hh < 0 || sy - hh > R.ch) continue;
        // Schatten versetzt, dann Wolke
        c.globalAlpha = a * 0.35;
        c.drawImage(sh, sx - w / 2 + w * 0.12, sy - hh / 2 + hh * 0.22, w, hh);
        c.globalAlpha = a * 0.85;
        c.drawImage(cs, sx - w / 2, sy - hh / 2, w, hh);
      }
    }
    c.restore();
  };

  /** Wolken auf dem Globus */
  FX.globeClouds = function (c, g, T) {
    if (R.reduceMotion) return;
    const cs = cloudSprite();
    const Rg = g.baseR * g.zoom;
    for (let i = 0; i < 70; i++) {
      const lon = ((hash(i, 1) * 360 + T * 0.6) % 360) - 180, lat = (hash(i, 2) - 0.5) * 140;
      const p = g.project(lon, lat);
      if (p[2] < 0.08) continue;
      const w = Rg * (0.1 + hash(i, 3) * 0.14) * (0.4 + 0.6 * p[2]), h = w * 0.6;
      c.globalAlpha = 0.55 * Math.min(1, p[2] * 2);
      c.drawImage(cs, p[0] - w / 2, p[1] - h / 2, w, h);
    }
    c.globalAlpha = 1;
  };

  // ---------------- Abzeichen der Einheiten ----------------
  function star(c, x, y, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill(); c.stroke();
  }

  /** Erfahrung (Sterne), Stellung (Sandsäcke), Nachschub (Warnung), Rückzug (Pfeil) */
  FX.unitDeco = function (c, u, x, y, w, h, T) {
    // Sandsäcke, wenn eingegraben
    if ((u.dig || 0) > 0.4) {
      const n = 7, a = Math.min(1, (u.dig - 0.4) / 0.4);
      c.fillStyle = 'rgba(176,150,104,' + a.toFixed(2) + ')'; c.strokeStyle = 'rgba(70,55,35,' + a.toFixed(2) + ')'; c.lineWidth = 0.8;
      for (let i = 0; i < n; i++) {
        const t = Math.PI * (0.08 + 0.84 * i / (n - 1));
        const sx = x + Math.cos(t) * (w / 2 + 3), sy = y + h / 2 - 3 + Math.sin(t) * 7;
        c.beginPath(); c.ellipse(sx, sy, 3.6, 2.2, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      }
    }
    // Sterne
    const st = S.Mil.stars(u);
    if (st) {
      c.fillStyle = '#ffd75e'; c.strokeStyle = '#5a4210'; c.lineWidth = 0.8;
      for (let i = 0; i < st; i++) star(c, x + w / 2 - 4 - i * 7.5, y - h / 2 - 1, 3.6);
    }
    // ohne Nachschub
    if (u.sup === false) {
      const p = 0.75 + 0.25 * Math.sin(T * 5);
      c.fillStyle = 'rgba(220,50,40,' + p.toFixed(2) + ')';
      c.beginPath(); c.arc(x - w / 2, y - h / 2, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = '800 9px "Public Sans", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', x - w / 2, y - h / 2 + 0.5);
    }
    // Rückzug
    if (u.retreat) {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(x - w / 2 - 2, y + 2); c.lineTo(x - w / 2 - 8, y - 2); c.lineTo(x - w / 2 - 2, y - 6); c.stroke();
    }
  };
})(S);
