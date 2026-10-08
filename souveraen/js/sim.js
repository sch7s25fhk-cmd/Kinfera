/* Souverän – Simulation: Städte, Wirtschaft, Zufriedenheit, Ereignisse */
'use strict';
(function (S) {
  const B = S.B, U = S.U;

  // ======================= Hilfen =======================
  S.idx = (G, x, y) => y * G.W + x;
  S.inb = (G, x, y) => x >= 0 && y >= 0 && x < G.W && y < G.H;
  const isUrban = (b) => b >= 1 && b <= 4;
  S.isUrban = isUrban;

  S.tileFertility = function (G, id) {
    const t = G.t;
    let f = S.FERTILITY[t.biome[id]];
    if (t.forest[id]) f = Math.max(f, 0.6);
    if (t.irrig[id]) f = Math.max(f + 0.35, 0.75);
    const x = id % G.W, y = (id / G.W) | 0;
    let river = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      if (!S.inb(G, x + ox, y + oy)) continue;
      if (t.river[S.idx(G, x + ox, y + oy)]) river = 1;
    }
    return Math.min(1.5, f * (river ? 1.3 : 1));
  };

  function countAround(G, x, y, r, pred) {
    let n = 0;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      if (!ox && !oy) continue;
      const nx = x + ox, ny = y + oy;
      if (S.inb(G, nx, ny) && pred(S.idx(G, nx, ny))) n++;
    }
    return n;
  }
  S.countAround = countAround;

  S.cityScale = (G) => G.cityScale || G.popScale;
  S.mod = (G, key) => G.mods.reduce((s, m) => s + (m.key === key ? m.val : 0), 0);

  S.log = function (G, text, kind) {
    G.log.unshift({ m: G.month, text, kind: kind || 'info' });
    if (G.log.length > 80) G.log.length = 80;
    if (S.onLog) S.onLog(text, kind || 'info');
  };

  const markDirty = (G, x0, y0, x1, y1) => { if (S.onDirty) S.onDirty(x0, y0, x1, y1); };
  S.markDirty = markDirty;

  // ======================= Städte =======================
  S.foundCity = function (G, x, y, name, style, layout, initial) {
    const t = G.t;
    const city = {
      id: G.cities.length, name, x, y, style, layout, maxLvl: S.STYLES[style].maxLvl,
      pop: initial ? 0 : 120, cap: 0, happy: 62, founded: G.month, capital: false, isNew: !initial,
      tiles: 0, nR: 0, nC: 0, nI: 0, jobs: 0, connected: true, rail: false,
      edu: 0.6, health: 0.6, nature: 0, poll: 0, tourism: 0, hist: []
    };
    G.cities.push(city);
    const id = S.idx(G, x, y);
    claim(G, city, id, U.HALL, 1);
    t.road[id] = 0;
    if (!initial) {
      // zwei erste Häuser
      for (let k = 0; k < 2; k++) S.growStep(G, city, Math.random, 'R');
      city.pop = 120;
    }
    G._netDirty = true;
    return city;
  };

  function claim(G, city, id, type, lvl) {
    const t = G.t;
    t.bld[id] = type; t.lvl[id] = lvl; t.city[id] = city.id + 1;
    t.forest[id] = 0; t.zone[id] = 0;
    S.updateBiome(G, id);
    const x = id % G.W, y = (id / G.W) | 0;
    markDirty(G, x, y, x, y);
  }

  /** Ist die Kachel laut Straßenplan der Stadt eine Straße? */
  S.isRoadLine = function (G, city, x, y) {
    const dx = x - city.x, dy = y - city.y;
    if (!dx && !dy) return false;
    if (city.layout === 'raster') {
      const m = (v) => ((v % 4) + 4) % 4;
      return m(dx) === 0 || m(dy) === 0;
    }
    if (city.layout === 'radial') {
      if (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy)) return true;
      const r = Math.round(Math.hypot(dx, dy));
      return r % 5 === 0;
    }
    // organisch: Höhenlinien zweier Rauschfelder ergeben gewundene Gassen
    const sd = city.id * 131 + 7;
    const n1 = S.fbm(S.noiseCache(sd), x * 0.22, y * 0.22, 2);
    const n2 = S.fbm(S.noiseCache(sd + 1), x * 0.18, y * 0.18, 2);
    return Math.abs(n1 - 0.5) < 0.045 || Math.abs(n2 - 0.5) < 0.04;
  };
  const noises = {};
  S.noiseCache = (s) => noises[s] || (noises[s] = S.makeNoise(s));

  /** Maximale Bauhöhe einer Kachel: im Zentrum am höchsten */
  function lvlCapAt(G, city, x, y) {
    const d = Math.hypot(x - city.x, y - city.y);
    const r = Math.sqrt(Math.max(4, city.tiles) / Math.PI) + 1;
    const ring = Math.floor(d / Math.max(1.5, r * 0.4));
    return S.clamp(city.maxLvl - ring, 1, city.maxLvl);
  }

  function canGrowInto(G, id, cityId) {
    const t = G.t;
    if (t.region[id] !== 1 || t.elev[id] < 0 || t.elev[id] >= S.MOUNTAIN_E) return false;
    if (t.bld[id] || t.zone[id] === 4 || t.river[id]) return false;
    if (t.road[id] && t.city[id] !== cityId) return false;
    if (t.city[id] && t.city[id] !== cityId) return false;
    return true;
  }

  /** Ein Wachstumsschritt: verdichten oder neue Kachel erschließen */
  S.growStep = function (G, city, rnd, forceType) {
    const t = G.t, W = G.W, cid = city.id + 1;
    const st = S.STYLES[city.style];
    const energyOk = !G.eco || !G.eco.last || G.eco.last.energyRatio > 0.85;
    const L = G.eco && G.eco.last;
    const labourShort = !!L && L.jobs > L.workforce * 1.02;
    const jobless = !!L && L.jobs < L.workforce * 0.95;
    // Verdichten?
    let dens = st.dens + (city.tiles > 40 ? 0.2 : 0);
    if (!forceType && rnd() < dens) {
      let best = -1, bs = -1e9;
      const R = Math.ceil(Math.sqrt(city.tiles) * 1.3) + 3;
      for (let y = city.y - R; y <= city.y + R; y++) for (let x = city.x - R; x <= city.x + R; x++) {
        if (!S.inb(G, x, y)) continue;
        const id = y * W + x;
        if (t.city[id] !== cid) continue;
        const b = t.bld[id];
        if (b !== U.R && b !== U.C) continue;
        if (labourShort && b === U.C) continue;
        const cap = lvlCapAt(G, city, x, y);
        if (t.lvl[id] >= cap) continue;
        if (t.lvl[id] >= 2 && !energyOk) continue;
        const s = -Math.hypot(x - city.x, y - city.y) - t.poll[id] * 6 + rnd() * 1.5 - t.lvl[id] * 0.6 + (jobless && b === U.C ? 3 : 0);
        if (s > bs) { bs = s; best = id; }
      }
      if (best >= 0) {
        t.lvl[best]++;
        const x = best % W, y = (best / W) | 0;
        markDirty(G, x, y, x, y);
        return true;
      }
    }
    // Erschließen
    const R = Math.ceil(Math.sqrt(city.tiles + 4) * 1.4) + 3;
    // gewünschter Nutzungstyp
    let want = forceType || 'R';
    if (!forceType && !labourShort) {
      if (city.nC < city.nR * 0.24) want = 'C';
      else if (city.nI < city.nR * st.ind) want = 'I';
      else if (jobless) want = rnd() < 0.6 ? 'C' : 'I';
    }
    let best = -1, bs = -1e9, bestType = want;
    for (let y = city.y - R; y <= city.y + R; y++) for (let x = city.x - R; x <= city.x + R; x++) {
      if (!S.inb(G, x, y)) continue;
      const id = y * W + x;
      if (!canGrowInto(G, id, cid)) continue;
      if (t.road[id]) continue;
      // angrenzend an die Stadt?
      let adj = 0, roadAdj = 0;
      for (const [ox, oy] of S.N4) {
        const nx = x + ox, ny = y + oy;
        if (!S.inb(G, nx, ny)) continue;
        const n = ny * W + nx;
        if (t.city[n] === cid) adj++;
        if (t.road[n]) roadAdj++;
      }
      if (!adj) continue;
      const z = t.zone[id];
      let type = want;
      if (z === 1) type = 'R'; else if (z === 2) type = 'C'; else if (z === 3) type = 'I';
      const d = Math.hypot(x - city.x, y - city.y);
      let s = -d * (type === 'I' ? -0.3 : 1) + adj * 0.8 + roadAdj * 1.5;
      if (z && z < 4) s += 6 + (type === want ? 2 : 0);
      if (t.forest[id]) s -= 2;
      if (t.elev[id] > S.HILL_E) s -= 3;
      if (t.river[id]) s -= 1.5; else if (countAround(G, x, y, 1, n => t.elev[n] < 0 || t.river[n])) s += 1;
      s += rnd() * (city.layout === 'organisch' ? 2.5 : 0.8);
      if (s > bs) { bs = s; best = id; bestType = type; }
    }
    if (best < 0) return false;
    const x = best % W, y = (best / W) | 0;
    if (S.isRoadLine(G, city, x, y) && !t.river[best]) {
      t.road[best] |= 1; t.city[best] = cid; t.forest[best] = 0; t.zone[best] = 0;
      S.updateBiome(G, best);
      markDirty(G, x, y, x, y);
      G._netDirty = true;
      return S.growStep(G, city, rnd, forceType || bestType);
    }
    claim(G, city, best, bestType === 'C' ? U.C : bestType === 'I' ? U.I : U.R, 1);
    city.tiles++;
    if (bestType === 'C') city.nC++; else if (bestType === 'I') city.nI++; else city.nR++;
    G._netDirty = true;
    return true;
  };

  /** Startstädte sofort auf ihre Größe bringen */
  S.growCityInstant = function (G, city, target, rnd) {
    let guard = 0;
    while (city.tiles < target && guard++ < target * 6) S.growStep(G, city, rnd, rnd() < 0.24 ? 'C' : rnd() < 0.15 ? 'I' : 'R');
    const t = G.t, W = G.W, cid = city.id + 1;
    const size = S.clamp(target / 26, 0.3, 1);
    const r = Math.sqrt(target / Math.PI) + 1.5;
    for (let y = city.y - 12; y <= city.y + 12; y++) for (let x = city.x - 12; x <= city.x + 12; x++) {
      if (!S.inb(G, x, y)) continue;
      const id = y * W + x;
      if (t.city[id] !== cid || !(t.bld[id] === U.R || t.bld[id] === U.C || t.bld[id] === U.I)) continue;
      const d = Math.hypot(x - city.x, y - city.y);
      const l = 1 + Math.round((city.maxLvl - 1) * Math.max(0, 1 - d / r) * size + rnd() * 0.6);
      t.lvl[id] = S.clamp(l, 1, Math.min(city.maxLvl, t.bld[id] === U.I ? 3 : 5));
    }
  };

  // ======================= Bauen =======================
  S.canPlace = function (G, bid, x, y) {
    const t = G.t;
    if (!S.inb(G, x, y)) return { ok: false, reason: 'Außerhalb der Karte' };
    const id = S.idx(G, x, y);
    if (t.region[id] !== 1) return { ok: false, reason: t.region[id] === 2 ? 'Fremdes Staatsgebiet' : 'Internationale Gewässer' };
    if (t.bld[id]) return { ok: false, reason: 'Bereits bebaut' };
    if (t.road[id] && bid !== 23) return { ok: false, reason: 'Hier verläuft eine Straße' };
    const e = t.elev[id];
    const water = (n) => t.elev[n] < 0;
    if (bid === 23) {
      if (!t.river[id]) return { ok: false, reason: 'Nur auf einem Fluss' };
      return { ok: true };
    }
    if (e < 0) return { ok: false, reason: 'Wasser' };
    if (bid === 13) {
      if (e < S.HILL_E && t.res[id] !== S.RES.ORE && t.res[id] !== S.RES.COAL) return { ok: false, reason: 'Braucht Hügel, Berge oder Erz-/Kohlevorkommen' };
      return { ok: true };
    }
    if (e >= S.MOUNTAIN_E) return { ok: false, reason: 'Zu steil (Gebirge)' };
    if (t.river[id]) return { ok: false, reason: 'Fluss im Weg' };
    switch (bid) {
      case 10: if (S.tileFertility(G, id) < 0.2) return { ok: false, reason: 'Boden zu karg – erst bewässern' }; break;
      case 11: if (countAround(G, x, y, 1, water) < 2) return { ok: false, reason: 'Muss am Wasser liegen' }; break;
      case 12: if (countAround(G, x, y, 1, n => t.forest[n] === 1) < 2) return { ok: false, reason: 'Braucht Wald in der Nähe' }; break;
      case 14: if (t.res[id] !== S.RES.OIL) return { ok: false, reason: 'Nur auf Erdölvorkommen' }; break;
      case 16: if (countAround(G, x, y, 1, n => water(n) && t.elev[n] < -0.02) < 2 || !S.isCoastal(G, x, y, 2)) return { ok: false, reason: 'Nur direkt an der Meeresküste' }; break;
      case 17: if (e >= S.HILL_E) return { ok: false, reason: 'Braucht flaches Land' }; break;
      case 24: if (!countAround(G, x, y, 2, n => water(n) || t.river[n])) return { ok: false, reason: 'Braucht Kühlwasser (Fluss/See/Meer)' }; break;
    }
    return { ok: true };
  };

  S.nearestCity = function (G, x, y, maxD) {
    let best = null, bd = maxD || 1e9;
    for (const c of G.cities) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  S.placeBuilding = function (G, bid, x, y, free) {
    const def = S.BLD[bid];
    const chk = S.canPlace(G, bid, x, y);
    if (!chk.ok) return chk;
    if (!free) {
      if (G.eco.money < def.cost) return { ok: false, reason: 'Nicht genug Geld' };
      G.eco.money -= def.cost;
    }
    const t = G.t, id = S.idx(G, x, y);
    t.bld[id] = bid; t.lvl[id] = 1; t.forest[id] = 0; t.zone[id] = 0;
    if (bid === 23) t.road[id] = 0;
    S.updateBiome(G, id);
    const c = S.nearestCity(G, x, y);
    G.blds.push({ x, y, b: bid, c: c ? c.id : -1, built: G.month });
    G._netDirty = true;
    markDirty(G, x, y, x, y);
    return { ok: true, cost: free ? 0 : def.cost };
  };

  /** Verbindet ein Gebäude per Straße mit der nächsten Stadt (nur beim Erzeugen) */
  S.connectBuildingRoad = function (G, x, y) {
    const t = G.t;
    if (countAround(G, x, y, 1, n => t.road[n] || isUrban(t.bld[n]))) return;
    const c = S.nearestCity(G, x, y);
    if (!c) return;
    const p = S.findPath(G, x, y, c.x, c.y);
    if (!p) return;
    p.reverse(); // vom Gebäude aus bis zum ersten Stück Netz
    for (const id of p) {
      if (t.road[id] || isUrban(t.bld[id])) break;
      if (!t.bld[id]) t.road[id] |= 1;
    }
  };

  S.roadCost = function (G, id, kind) {
    const base = kind === 'rail' ? 6 : 2;
    const t = G.t;
    let m = 1;
    if (t.elev[id] < 0 || t.river[id]) m = 5;
    else if (t.elev[id] >= S.MOUNTAIN_E) m = 4;
    else if (t.elev[id] >= S.HILL_E) m = 2;
    if (t.forest[id]) m += 0.5;
    return base * m;
  };

  S.canRoad = function (G, id) {
    const t = G.t;
    if (t.region[id] !== 1) return false;
    if (t.bld[id] && t.bld[id] !== 23) return false;
    if (t.elev[id] < -0.2) return false;
    return true;
  };

  S.buildRoad = function (G, ids, kind) {
    const t = G.t, bit = kind === 'rail' ? 2 : 1;
    let cost = 0, n = 0;
    for (const id of ids) {
      if (!S.canRoad(G, id) || (t.road[id] & bit)) continue;
      const c = S.roadCost(G, id, kind);
      if (G.eco.money < cost + c) break;
      cost += c; n++;
      t.road[id] |= bit; t.forest[id] = 0; t.zone[id] = 0;
      S.updateBiome(G, id);
      const x = id % G.W, y = (id / G.W) | 0;
      markDirty(G, x, y, x, y);
    }
    G.eco.money -= cost;
    G._netDirty = true;
    return { n, cost };
  };

  S.bulldoze = function (G, x, y) {
    const t = G.t, id = S.idx(G, x, y);
    if (t.region[id] !== 1) return { ok: false, reason: 'Nicht dein Land' };
    const b = t.bld[id];
    let cost = 1;
    if (b === U.HALL) return { ok: false, reason: 'Das Rathaus bleibt stehen' };
    if (b) {
      if (isUrban(b)) {
        cost = 2 + t.lvl[id] * 3;
        const c = G.cities[t.city[id] - 1];
        if (c) { c.tiles--; if (b === U.R) c.nR--; else if (b === U.C) c.nC--; else c.nI--; }
      } else {
        cost = Math.round(S.BLD[b].cost * 0.1);
        G.blds = G.blds.filter(q => !(q.x === x && q.y === y));
      }
      t.bld[id] = 0; t.lvl[id] = 0; t.city[id] = 0;
    } else if (t.road[id]) {
      t.road[id] = 0; t.city[id] = 0;
    } else if (t.zone[id]) {
      t.zone[id] = 0; cost = 0;
    } else return { ok: false, reason: 'Nichts abzureißen' };
    if (G.eco.money < cost) return { ok: false, reason: 'Nicht genug Geld' };
    G.eco.money -= cost;
    G._netDirty = true;
    markDirty(G, x, y, x, y);
    return { ok: true, cost };
  };

  S.paintZone = function (G, x, y, z) {
    const t = G.t, id = S.idx(G, x, y);
    if (t.region[id] !== 1 || t.elev[id] < 0 || t.elev[id] >= S.MOUNTAIN_E || t.bld[id] || t.road[id]) return { ok: false };
    if (t.zone[id] === z) return { ok: false };
    if (G.eco.money < 1) return { ok: false, reason: 'Nicht genug Geld' };
    t.zone[id] = z; G.eco.money -= 1;
    markDirty(G, x, y, x, y);
    return { ok: true, cost: 1 };
  };

  /** Landschaft formen; Pinsel 3×3 mit weicher Kante */
  S.terraform = function (G, op, cx, cy) {
    const t = G.t;
    const tool = S.TOOLS['t_' + op];
    let cost = 0, changed = 0, waterChange = false;
    const avg = (x, y) => {
      let s = 0, n = 0;
      for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
        if (!S.inb(G, x + ox, y + oy)) continue;
        s += t.elev[S.idx(G, x + ox, y + oy)]; n++;
      }
      return s / n;
    };
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const x = cx + ox, y = cy + oy;
      if (!S.inb(G, x, y)) continue;
      const id = S.idx(G, x, y);
      const w = (ox || oy) ? 0.5 : 1;
      if (t.region[id] === 2) continue;
      if (t.region[id] === 0 && op !== 'raise') continue;
      if (t.region[id] === 0 && countAround(G, x, y, 1, n => t.region[n] === 1) === 0) continue;
      if (G.eco.money < cost + tool.cost * w) break;
      const wasWater = t.elev[id] < 0;
      if (op === 'raise' || op === 'lower' || op === 'flat') {
        if (t.bld[id]) continue;
        let e = t.elev[id];
        if (op === 'raise') e += 0.1 * w;
        else if (op === 'lower') e -= 0.1 * w;
        else e = S.lerp(e, avg(x, y), 0.6 * w);
        e = S.clamp(e, -0.4, 1.3);
        if (Math.abs(e - t.elev[id]) < 0.002) continue;
        t.elev[id] = e;
        if (e >= 0 && t.region[id] === 0) t.region[id] = 1; // Landgewinnung
        if (e < 0) { t.forest[id] = 0; t.zone[id] = 0; if (t.road[id] && e < -0.2) t.road[id] = 0; }
      } else if (op === 'forest') {
        if (t.bld[id] || t.road[id] || t.elev[id] < 0 || t.elev[id] >= S.MOUNTAIN_E || t.forest[id]) continue;
        t.forest[id] = 1; t.zone[id] = 0;
        G.planted = (G.planted || 0) + 1;
      } else if (op === 'clear') {
        if (!t.forest[id]) continue;
        t.forest[id] = 0;
      } else if (op === 'irrig') {
        if (t.elev[id] < 0 || t.irrig[id] || t.elev[id] >= S.MOUNTAIN_E) continue;
        if (ox && oy) continue;
        t.irrig[id] = 1;
      }
      cost += tool.cost * w; changed++;
      if (wasWater !== (t.elev[id] < 0)) waterChange = true;
      S.updateBiome(G, id);
    }
    if (!changed) return { ok: false, reason: G.eco.money < tool.cost ? 'Nicht genug Geld' : 'Hier gibt es nichts zu verändern' };
    G.eco.money -= cost;
    if (waterChange) G._netDirty = true;
    markDirty(G, cx - 2, cy - 2, cx + 2, cy + 2);
    return { ok: true, cost };
  };

  S.canFoundCity = function (G, x, y) {
    if (!S.inb(G, x, y)) return { ok: false, reason: 'Außerhalb' };
    const t = G.t, id = S.idx(G, x, y);
    if (t.region[id] !== 1) return { ok: false, reason: 'Nicht dein Land' };
    if (t.elev[id] < 0 || t.elev[id] >= S.MOUNTAIN_E) return { ok: false, reason: 'Ungeeignetes Gelände' };
    if (t.bld[id] || t.road[id] || t.river[id]) return { ok: false, reason: 'Bauplatz belegt' };
    for (const c of G.cities) if (Math.hypot(c.x - x, c.y - y) < 6) return { ok: false, reason: 'Zu nah an ' + c.name };
    if (G.eco.money < S.TOOLS.city.cost) return { ok: false, reason: 'Nicht genug Geld (500 Mio. T)' };
    return { ok: true };
  };

  // ======================= Netze =======================
  /** Straßen-/Bahnnetz: Komponenten, Anbindung der Städte und Gebäude */
  S.computeNetwork = function (G) {
    const { W, H, t } = G, N = W * H;
    const comp = new Int32Array(N).fill(-1);
    const node = (i) => t.road[i] || isUrban(t.bld[i]);
    const q = new Int32Array(N);
    let nc = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] >= 0 || !node(s)) continue;
      let qh = 0, qt = 0; q[qt++] = s; comp[s] = nc;
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i / W) | 0;
        for (const [ox, oy] of S.N8) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (comp[j] < 0 && node(j)) { comp[j] = nc; q[qt++] = j; }
        }
      }
      nc++;
    }
    const cap = G.cities.find(c => c.capital) || G.cities[0];
    const capComp = cap ? comp[S.idx(G, cap.x, cap.y)] : -1;
    const cityComps = new Set();
    for (const c of G.cities) {
      const cc = comp[S.idx(G, c.x, c.y)];
      cityComps.add(cc);
      c.connected = cc === capComp;
    }
    // Bahn: nur Gleise und Stadtkacheln
    const rail = new Uint8Array(N);
    if (cap) {
      let qh = 0, qt = 0; const s = S.idx(G, cap.x, cap.y); q[qt++] = s; rail[s] = 1;
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i / W) | 0;
        for (const [ox, oy] of S.N8) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (!rail[j] && ((t.road[j] & 2) || isUrban(t.bld[j]))) { rail[j] = 1; q[qt++] = j; }
        }
      }
    }
    let railTiles = 0;
    for (let i = 0; i < N; i++) if (t.road[i] & 2) railTiles++;
    for (const c of G.cities) c.rail = !c.capital && railTiles > 0 && rail[S.idx(G, c.x, c.y)] === 1;
    for (const b of G.blds) {
      b.conn = false;
      for (let oy = -2; oy <= 2 && !b.conn; oy++) for (let ox = -2; ox <= 2; ox++) {
        const nx = b.x + ox, ny = b.y + oy;
        if (!S.inb(G, nx, ny)) continue;
        const cc = comp[S.idx(G, nx, ny)];
        if (cc >= 0 && cityComps.has(cc)) { b.conn = true; break; }
      }
    }
    G._comp = comp;
    G._netDirty = false;
  };

  // ======================= Verschmutzung =======================
  function computePollution(G) {
    const { W, H, t } = G, N = W * H;
    const p = new Float32Array(N);
    const add = (x, y, v, r) => {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const d = Math.hypot(ox, oy);
        if (d > r + 0.5) continue;
        p[ny * W + nx] += v * (1 - d / (r + 1));
      }
    };
    for (let i = 0; i < N; i++) {
      const b = t.bld[i];
      if (!b) continue;
      const x = i % W, y = (i / W) | 0;
      if (b === U.I) {
        const c = G.cities[t.city[i] - 1];
        add(x, y, 0.06 * t.lvl[i] * (c ? S.STYLES[c.style].poll : 1), 2);
      } else if (b === U.C && t.lvl[i] >= 3) add(x, y, 0.012 * t.lvl[i], 1);
      else if (b >= 10) {
        const v = S.BLD[b].poll * (1 - S.mod(G, 'clean'));
        if (v) add(x, y, v, v > 0.3 ? 3 : 2);
      }
    }
    for (let i = 0; i < N; i++) {
      if (!t.forest[i]) continue;
      const x = i % W, y = (i / W) | 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        p[ny * W + nx] -= 0.025;
      }
    }
    for (let i = 0; i < N; i++) t.poll[i] = S.clamp(t.poll[i] * 0.6 + S.clamp(p[i], 0, 1) * 0.4, 0, 1);
  }

  // ======================= Städte auswerten =======================
  S.recalcCities = function (G) {
    const { W, t } = G;
    for (const c of G.cities) {
      c.tiles = 0; c.nR = 0; c.nC = 0; c.nI = 0; c.cap = 0; c.jobs = 0; c.energy = 0; c.pollSum = 0;
      c.parks = 0; c.natureN = 0; c.goodsProd = 0; c.rawNeed = 0; c.goodsNeed = 0; c.commerce = 0;
    }
    for (let i = 0; i < W * G.H; i++) {
      const cid = t.city[i];
      if (!cid) continue;
      const c = G.cities[cid - 1];
      const b = t.bld[i], l = t.lvl[i];
      if (!b || !c) continue;
      const st = S.STYLES[c.style];
      if (b === U.R) { c.nR++; c.cap += S.CAP_R[l] * st.capMul; c.energy += l * 0.6; }
      else if (b === U.C) { c.nC++; c.jobs += S.JOBS_C[l]; c.energy += l * 1.3; c.goodsNeed += l * 1.2; c.commerce += S.JOBS_C[l]; }
      else if (b === U.I) { c.nI++; c.jobs += S.JOBS_I[l]; c.energy += l * 2; c.goodsProd += l * 3.2; c.rawNeed += l * 2.2; }
      else if (b === U.HALL) { c.cap += 300; c.jobs += 60; c.energy += 1; }
      if (b !== U.HALL) c.tiles++;
      c.pollSum += t.poll[i];
    }
    for (const c of G.cities) {
      const all = c.tiles + 1;
      c.poll = c.pollSum / all;
      // Natur und Parks im Umkreis
      let nat = 0;
      const r = Math.ceil(Math.sqrt(all) * 0.9) + 3;
      for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
        if (!S.inb(G, x, y)) continue;
        const i = y * W + x;
        if (t.forest[i] || t.zone[i] === 4) nat++;
        else if (t.elev[i] < 0 || t.river[i]) nat += 0.7;
        if (t.bld[i] === 32) { c.parks++; nat += 2; }
      }
      c.nature = Math.min(1, nat / (12 + all * 0.6));
    }
  };

  function servicesFor(G) {
    const R = S.SERVICE_RADIUS;
    for (const c of G.cities) { c.uni = 0; c.hosp = 0; c.stad = 0; c.monu = 0; c.airport = 0; }
    for (const b of G.blds) {
      if (![30, 31, 33, 34, 17].includes(b.b)) continue;
      const near = G.cities.filter(c => Math.hypot(c.x - b.x, c.y - b.y) <= (b.b === 33 || b.b === 34 ? 10 : R));
      const tot = near.reduce((s, c) => s + Math.max(1, c.pop), 0);
      const eff = b.conn ? 1 : 0.4;
      for (const c of near) {
        const share = Math.max(1, c.pop) / tot * eff;
        if (b.b === 30) c.uni += share; else if (b.b === 31) c.hosp += share;
        else if (b.b === 33) c.stad += eff; else if (b.b === 34) c.monu += eff; else c.airport += eff;
      }
    }
  }

  // ======================= Produktion =======================
  S.buildingOutput = function (G, b) {
    const t = G.t, id = S.idx(G, b.x, b.y);
    const out = { food: 0, raw: 0, goods: 0, energy: 0, rawUse: 0 };
    const tech = 1 + S.mod(G, 'renew');
    const drought = 1 - S.mod(G, 'drought');
    switch (b.b) {
      case 10: out.food = 7 * S.tileFertility(G, id) * drought * (0.8 + G.eco.eduLevel * 0.3); break;
      case 11: out.food = 4 + 1.2 * countAround(G, b.x, b.y, 1, n => t.elev[n] < 0); break;
      case 12: out.raw = 1.4 * countAround(G, b.x, b.y, 1, n => t.forest[n] === 1); break;
      case 13: {
        const r = t.res[id];
        out.raw = (t.elev[id] >= S.MOUNTAIN_E ? 7 : t.elev[id] >= S.HILL_E ? 5 : 2) + (r === S.RES.ORE ? 9 : r === S.RES.COAL ? 7 : 0);
        break;
      }
      case 14: out.raw = 20; break;
      case 15: out.goods = 11; out.rawUse = 7; break;
      case 20: out.energy = 120; out.rawUse = 4; break;
      case 21: {
        const sun = S.clamp(t.temp[id] * 1.1 - t.moist[id] * 0.35, 0.15, 1);
        out.energy = (18 + 48 * sun) * tech; break;
      }
      case 22: {
        const coast = S.isCoastal(G, b.x, b.y, 2) ? 1 : 0;
        out.energy = (24 + 26 * coast + (t.elev[id] >= S.HILL_E ? 18 : 0)) * tech; break;
      }
      case 23: out.energy = 90; break;
      case 24: out.energy = 400; break;
    }
    return out;
  };

  // ======================= Monatstick =======================
  S.tick = function (G) {
    const t = G.t, eco = G.eco, I = S.INCOME[G.meta.inc], gov = S.GOVS[G.meta.gov];
    if (G._netDirty || !G._comp) S.computeNetwork(G);
    computePollution(G);
    S.recalcCities(G);
    servicesFor(G);
    const last = eco.last || { laborRatio: 1, energyRatio: 1, rawRatio: 1 };

    // --- Arbeit
    let pop = 0, jobs = 0;
    for (const c of G.cities) { pop += c.pop; jobs += c.jobs; }
    for (const b of G.blds) jobs += S.BLD[b.b].jobs;
    const workforce = pop * 0.5;
    const laborRatio = Math.min(1, workforce / Math.max(1, jobs));
    const employment = Math.min(1, jobs / Math.max(1, workforce));
    const strike = 1 - S.mod(G, 'strike');

    // --- Energie
    let eProd = 0, eDem = 0;
    for (const c of G.cities) eDem += c.energy;
    const outs = G.blds.map(b => {
      const o = S.buildingOutput(G, b);
      const eff = (b.conn ? 1 : 0.4) * laborRatio * strike * gov.prod;
      eDem += S.BLD[b.b].energy;
      eProd += o.energy * (b.conn ? 1 : 0.4);
      return { o, eff, b };
    });
    const energyRatio = eDem > 0 ? Math.min(1, eProd / eDem) : 1;

    // --- Rohstoffe, Nahrung, Güter
    let food = 0, raw = 0, goods = 0, rawUse = 0, prodValue = 0;
    for (const { o, eff, b } of outs) {
      const en = (b.b >= 13 && b.b <= 17) ? (0.3 + 0.7 * last.energyRatio) : 1;
      food += o.food * eff; raw += o.raw * eff * en;
      goods += o.goods * eff * en * last.rawRatio;
      rawUse += o.rawUse * (o.goods ? eff * en : 1);
    }
    let cityGoods = 0, cityRawNeed = 0, goodsNeed = 0, commerce = 0;
    for (const c of G.cities) {
      cityGoods += c.goodsProd * laborRatio * strike * (0.3 + 0.7 * last.energyRatio) * S.STYLES[c.style].gdp;
      cityRawNeed += c.rawNeed; goodsNeed += c.goodsNeed;
      commerce += c.commerce * laborRatio * 0.006 * S.STYLES[c.style].gdp;
    }
    rawUse += cityRawNeed;
    const rawRatio = Math.min(1, (raw + 0.0001) / Math.max(0.0001, rawUse) + 0.5); // fehlendes wird teils importiert
    goods += cityGoods * last.rawRatio;
    const foodNeed = pop / 1000;
    goodsNeed += pop / 1000 * 0.6;

    // --- Handel
    const harbors = Math.min(3, G.blds.filter(b => b.b === 16 && b.conn).length);
    const tradeMul = (1 + harbors * 0.12 + S.mod(G, 'trade')) * (1 + S.mod(G, 'prices'));
    const P = S.PRICES;
    const bal = { food: food - foodNeed, raw: raw - rawUse, goods: goods - goodsNeed };
    let exports = 0, imports = 0;
    for (const k of ['food', 'raw', 'goods']) {
      if (bal[k] >= 0) exports += bal[k] * P[k] * tradeMul * 0.75;
      else imports += -bal[k] * P[k] * 1.3 * (1 - S.mod(G, 'importcut'));
    }
    const foodShort = foodNeed > 0 ? Math.max(0, -bal.food / foodNeed) : 0;

    // --- Einnahmen
    const prod = (0.7 + 0.6 * eco.eduLevel) * I.wage;
    const incomeTax = pop * employment * 0.0082 * prod * eco.taxInc;
    prodValue = food * P.food + raw * P.raw + goods * P.goods + commerce;
    const corpTax = prodValue * eco.taxCorp * 0.6;
    let tourism = 0;
    const airports = Math.min(3, G.blds.filter(b => b.b === 17 && b.conn).length);
    for (const c of G.cities) {
      const st = S.STYLES[c.style];
      const sec = 0.7 + 0.3 * eco.budget.security;
      c.tourism = (c.pop / 1000 * 0.22 * st.tourism * (1 + c.nature * 0.6) + Math.min(2, c.monu) * 9 * (G.meta.gov === 'monarchie' ? 1.5 : 1)) * sec;
      tourism += c.tourism;
    }
    tourism *= (1 + airports * 0.25) * (1 + S.mod(G, 'tourism'));

    // --- Ausgaben
    const k = pop / 1000 * (0.45 + 0.55 * I.wage);
    const bu = eco.budget;
    const services = {
      edu: k * 0.55 * bu.edu, health: k * 0.6 * bu.health, security: k * 0.38 * bu.security, infra: k * 0.3 * bu.infra
    };
    let upkeep = 0;
    for (const b of G.blds) upkeep += S.BLD[b.b].upkeep;
    let roadTiles = 0, railTiles = 0;
    for (let i = 0; i < G.W * G.H; i++) { if (t.road[i] & 1) roadTiles++; if (t.road[i] & 2) railTiles++; }
    upkeep += roadTiles * 0.04 + railTiles * 0.1;
    upkeep *= (0.8 + 0.2 * bu.infra) / 1;
    const interest = eco.debt * (eco.rate || 0.04) / 12;
    const servicesSum = services.edu + services.health + services.security + services.infra;
    const base = (eco.baseRate || 0) * pop / 1000;
    const other = Math.max(0, base), pensions = Math.max(0, -base);
    const income = incomeTax + corpTax + exports + tourism + other;
    const expense = servicesSum + upkeep + imports + interest + pensions;
    const net = income - expense;
    eco.money += net;
    if (eco.money < -200) {
      // Notkredit
      const amt = 1000;
      eco.debt += amt; eco.money += amt;
      eco.rate = Math.min(0.15, (eco.rate || 0.04) + 0.01);
      S.log(G, 'Die Staatskasse war leer: Notkredit über 1.000 Mio. T aufgenommen. Der Zins steigt.', 'bad');
    }

    // --- Bildung entwickelt sich langsam
    let eduT = 0, wpop = 0;
    for (const c of G.cities) {
      c.edu = S.clamp(0.6 * bu.edu + 0.5 * Math.min(1, c.uni * 25000 / Math.max(1500, c.pop)), 0, 1.3);
      c.health = S.clamp(0.6 * bu.health + 0.5 * Math.min(1, c.hosp * 20000 / Math.max(1500, c.pop)), 0, 1.3);
      eduT += c.edu * c.pop; wpop += c.pop;
    }
    const eduTarget = wpop ? eduT / wpop : 0.5;
    eco.eduLevel += (eduTarget - eco.eduLevel) * (G.meta.gov === 'technokratie' ? 0.012 : 0.006);

    // --- Zufriedenheit
    const unemp = 1 - employment;
    let happySum = 0;
    for (const c of G.cities) {
      const st = S.STYLES[c.style];
      const mon = G.meta.gov === 'monarchie' ? 1.5 : 1;
      const hc = {
        'Grundstimmung': 61 + I.expect,
        'Regierungsform': gov.happy,
        'Stadtstil': st.happy,
        'Bildung': (c.edu - 0.7) * 14,
        'Gesundheit': (c.health - 0.7) * 20,
        'Sicherheit': (bu.security - 1) * 8,
        'Infrastruktur': (bu.infra - 1) * 6,
        'Steuern': -(Math.max(0, eco.taxInc - 0.15) * 110 + Math.max(0, eco.taxCorp - 0.22) * 25),
        'Arbeitslosigkeit': -unemp * 55,
        'Luftverschmutzung': -c.poll * 45,
        'Stromausfälle': -(1 - energyRatio) * 35,
        'Nahrungsmangel': -Math.min(1, foodShort) * 45,
        'Natur & Parks': c.nature * 8 + Math.min(6, c.parks * 1.5),
        'Stadion & Wahrzeichen': Math.min(10, c.stad * 6 + c.monu * 4 * mon),
        'Verkehrsanbindung': (c.connected ? 0 : -6) + (c.rail ? 2 : 0),
        'Wohnungsnot': -Math.max(0, c.pop / Math.max(1, c.cap) - 1) * 60,
        'Ereignisse': S.mod(G, 'happy')
      };
      let h = 0;
      for (const k in hc) h += hc[k];
      c.hc = hc;
      c.happyTarget = S.clamp(h, 0, 100);
      c.happy = c.happy * 0.75 + c.happyTarget * 0.25;
      happySum += c.happy * c.pop;
    }
    const approvalT = pop > 0 ? happySum / pop : 50;
    eco.approval = eco.approval * 0.7 + approvalT * 0.3;

    // --- Bevölkerung und Wachstum
    const rnd = Math.random;
    for (const c of G.cities) {
      const attract = (c.happy - 55) / 45 + (employment - 0.92) * 3 + (c.connected ? 0.1 : -0.4) + (c.rail ? 0.15 : 0) + Math.min(1, c.airport) * 0.15;
      const natural = 0.0009 + 0.0009 * c.health - Math.min(1, foodShort) * 0.01;
      const young = c.isNew && G.month - c.founded < 48 && c.happy > 40 ? 0.06 : 0;
      const migr = 0.0028 * S.clamp(attract, -1.5, 1.5) + S.mod(G, 'immig') + young;
      c.pop = Math.max(50, c.pop * (1 + natural + migr));
      if (c.pop > c.cap * 1.06) c.pop = c.pop * 0.97 + c.cap * 1.06 * 0.03;
      const free = c.cap * 0.88 - c.pop;
      if (free < 0 && c.happy > 25) {
        const avgCap = c.cap / Math.max(1, c.nR) || 300;
        const steps = S.clamp(Math.ceil(-free / avgCap), 1, 3);
        for (let s = 0; s < steps; s++) S.growStep(G, c, rnd);
      }
      c.hist.push(Math.round(c.pop));
      if (c.hist.length > 120) c.hist.shift();
    }

    // --- Merken
    const gdp = (prodValue + tourism + servicesSum) * 12;
    eco.last = {
      pop, jobs, workforce, employment, laborRatio, energyRatio, eProd, eDem,
      food, foodNeed, raw, rawUse, goods, goodsNeed, rawRatio: Math.min(1, rawRatio),
      exports, imports, incomeTax, corpTax, tourism, other, pensions, services, upkeep, interest, income, expense, net,
      tradeMul, gdp, foodShort, harbors, airports, roadTiles, railTiles
    };
    G.stats.push({ m: G.month, money: Math.round(eco.money), pop: Math.round(pop * G.popScale), app: Math.round(eco.approval), net: Math.round(net), gdp: Math.round(gdp) });
    if (G.stats.length > 600) G.stats.shift();

    // --- Ereignisse, Wahlen, Erfolge
    G.mods = G.mods.filter(m => (m.months === undefined) || --m.months > 0);
    G.month++;
    politics(G);
    S.checkAchievements(G);
    if (!G.pendingEvent && G.month > 4 && Math.random() < 0.07) S.rollEvent(G);
  };

  /** Bringt den Startzustand ins Gleichgewicht: Strom, Arbeitsplätze und Haushalt */
  S.calibrate = function (G) {
    const eco = G.eco, m0 = eco.money, t = G.t;
    const rnd = S.rng(G.meta.seed + 3);
    const capital = G.cities.find(c => c.capital) || G.cities[0];
    const placeNear = (bid, c) => {
      for (let r = 2; r < 14; r++) for (let k = 0; k < 30; k++) {
        const x = c.x + Math.round((rnd() * 2 - 1) * r), y = c.y + Math.round((rnd() * 2 - 1) * r);
        if (S.canPlace(G, bid, x, y).ok) { S.placeBuilding(G, bid, x, y, true); S.connectBuildingRoad(G, x, y); return true; }
      }
      return false;
    };
    for (let pass = 0; pass < 6; pass++) {
      S.tick(G);
      const L = eco.last;
      let changed = false;
      // Strom
      let guard = 0;
      let deficit = L.eDem * 1.1 - L.eProd;
      while (deficit > 0 && guard++ < 12) {
        const c = G.cities[guard % G.cities.length];
        const bid = G.meta.inc <= 2 ? (S.isCoastal(G, c.x, c.y, 6) ? 22 : 21) : 20;
        if (placeNear(bid, c) || placeNear(20, c)) { deficit -= bid === 20 ? 120 : 45; changed = true; }
      }
      // Arbeitsplätze
      if (L.employment < 0.93) {
        let need = (L.workforce * 0.95 - L.jobs);
        for (let i = 0; i < G.W * G.H && need > 0; i++) {
          if (t.bld[i] !== S.U.R || rnd() > 0.35) continue;
          t.bld[i] = S.U.C; need -= S.JOBS_C[t.lvl[i]] + S.CAP_R[t.lvl[i]] * 0.5; changed = true;
        }
      } else if (L.laborRatio < 0.9) {
        for (const c of G.cities) for (let k = 0; k < 3; k++) S.growStep(G, c, rnd, 'R');
        changed = true;
      }
      if (changed) {
        S.recalcCities(G);
        for (const c of G.cities) c.pop = Math.max(c.pop, c.cap * 0.85);
      }
      if (!changed && pass >= 2) break;
    }
    S.tick(G);
    S.tick(G);
    const target = 30 + G.meta.inc * 3;
    eco.baseRate = (target - eco.last.net) / Math.max(1, eco.last.pop / 1000);
    let gamePop = 0;
    for (const c of G.cities) { gamePop += c.pop; c.hist = []; c.happy = c.happyTarget; }
    G.popScale = Math.max(1, G.meta.realPop * 0.75 / Math.max(1, gamePop));
    const realCity = G.cities.reduce((sum, c) => sum + (c.realPop || 0), 0);
    G.cityScale = S.clamp(realCity * 1.3 / Math.max(1, gamePop), 1, G.popScale);
    eco.money = m0; eco.approval = 60; G.month = 0; G.stats = []; G.log = []; G.mods = [];
    G.pendingEvent = null; G.ach = {};
    S.tick(G);
    eco.money = m0; eco.approval = eco.approval * 0.5 + 30; G.month = 0; G.stats = []; G.log = [];
    G.pendingEvent = null; G.ach = {};
  };

  // ======================= Politik =======================
  function politics(G) {
    const eco = G.eco, gov = G.meta.gov;
    if (G.flags.over) return;
    if (gov === 'demokratie') {
      if (G.month - eco.lastElection >= 48) {
        eco.lastElection = G.month;
        const share = S.clamp(eco.approval + (Math.random() - 0.5) * 8, 0, 100);
        if (share >= 50) {
          S.log(G, 'Wahlsieg! Du wirst mit ' + S.fmt1(share) + ' % im Amt bestätigt.', 'good');
          G.pendingEvent = { title: 'Wiedergewählt', text: 'Das Volk hat gesprochen: ' + S.fmt1(share) + ' % der Stimmen. Vier weitere Jahre, um dein Land zu formen.', choices: [{ label: 'Weiter regieren', fx: () => {} }] };
        } else gameOver(G, 'Abgewählt', 'Nur ' + S.fmt1(share) + ' % der Stimmen. Die Opposition übernimmt die Regierung.');
      } else if (G.month - eco.lastElection === 42) S.log(G, 'In sechs Monaten wird gewählt. Aktuelle Zustimmung: ' + Math.round(eco.approval) + ' %.', 'warn');
    } else {
      const limit = gov === 'monarchie' ? 25 : 20;
      if (eco.approval < limit) {
        eco.lowMonths++;
        if (eco.lowMonths === 3) S.log(G, 'Unruhen auf den Straßen! Die Zustimmung muss schnell steigen.', 'bad');
        if (eco.lowMonths >= 8) gameOver(G, gov === 'monarchie' ? 'Revolution' : 'Putsch', 'Nach monatelangen Protesten wurdest du gestürzt.');
      } else eco.lowMonths = 0;
    }
  }

  function gameOver(G, title, text) {
    G.flags.over = true;
    S.log(G, title + ': ' + text, 'bad');
    G.pendingEvent = {
      title, text: text + ' Du kannst trotzdem im freien Modus weiterbauen.', over: true,
      choices: [{ label: 'Im freien Modus weiterspielen', fx: (G) => { G.flags.sandbox = true; } }]
    };
  }

  // ======================= Ereignisse =======================
  const randomOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const homeTiles = (G, pred) => {
    const out = [];
    for (let i = 0; i < G.W * G.H; i++) if (G.t.region[i] === 1 && pred(i)) out.push(i);
    return out;
  };

  S.EVENTS = [
    {
      key: 'drought', w: 1, cond: (G) => G.blds.some(b => b.b === 10),
      make: (G) => ({
        title: 'Dürresommer', text: 'Seit Wochen kein Regen. Die Ernte wird um 40 % einbrechen.',
        choices: [
          { label: 'Hilfsfonds für Bauern (150 Mio. T)', fx: (G) => { G.eco.money -= 150; G.mods.push({ key: 'drought', val: 0.2, months: 6 }); } },
          { label: 'Nichts tun', fx: (G) => { G.mods.push({ key: 'drought', val: 0.4, months: 6 }, { key: 'happy', val: -4, months: 6 }); } }
        ]
      })
    },
    {
      key: 'oil', w: 0.7, cond: () => true,
      make: (G) => {
        const cand = homeTiles(G, i => G.t.elev[i] >= 0 && G.t.elev[i] < S.HILL_E && !G.t.bld[i] && !G.t.road[i] && !G.t.res[i]);
        if (!cand.length) return null;
        const id = randomOf(cand), x = id % G.W, y = (id / G.W) | 0;
        return {
          title: 'Ölfund!', text: 'Geologen haben ein Erdölvorkommen entdeckt. Es ist jetzt auf der Karte markiert.', focus: [x, y],
          choices: [
            { label: 'Fördern: Ölpumpe sofort bauen', fx: (G) => { G.t.res[id] = S.RES.OIL; S.placeBuilding(G, 14, x, y, true); } },
            { label: 'Vorkommen nur markieren', fx: (G) => { G.t.res[id] = S.RES.OIL; S.markDirty(G, x, y, x, y); } },
            { label: 'Unter Naturschutz stellen (+Zustimmung)', fx: (G) => { G.mods.push({ key: 'happy', val: 3, months: 24 }); } }
          ]
        };
      }
    },
    {
      key: 'investor', w: 1, cond: (G) => G.cities.length > 0,
      make: (G) => {
        const c = randomOf(G.cities);
        return {
          title: 'Ein Konzern klopft an', text: 'Ein internationaler Konzern möchte bei ' + c.name + ' ein Werk errichten – auf eigene Kosten. Umweltschützer protestieren.',
          choices: [
            { label: 'Zusagen: kostenlose Fabrik', fx: (G) => {
              for (let r = 2; r < 9; r++) for (let k = 0; k < 40; k++) {
                const x = c.x + Math.round((Math.random() * 2 - 1) * r), y = c.y + Math.round((Math.random() * 2 - 1) * r);
                if (S.canPlace(G, 15, x, y).ok) { S.placeBuilding(G, 15, x, y, true); S.connectBuildingRoad(G, x, y); G._netDirty = true; return; }
              }
            } },
            { label: 'Ablehnen (+Zustimmung)', fx: (G) => { G.mods.push({ key: 'happy', val: 2, months: 12 }); } }
          ]
        };
      }
    },
    {
      key: 'flood', w: 0.8, cond: (G) => G.cities.some(c => S.countAround(G, c.x, c.y, 4, n => G.t.river[n]) > 0),
      make: (G) => {
        const c = randomOf(G.cities.filter(c => S.countAround(G, c.x, c.y, 4, n => G.t.river[n]) > 0));
        return {
          title: 'Hochwasser in ' + c.name, text: 'Der Fluss ist über die Ufer getreten. Viele Häuser stehen unter Wasser.', focus: [c.x, c.y],
          choices: [
            { label: 'Wiederaufbau finanzieren (250 Mio. T)', fx: (G) => { G.eco.money -= 250; G.mods.push({ key: 'happy', val: 2, months: 12 }); } },
            { label: 'Die Menschen müssen selbst zurechtkommen', fx: (G) => { c.pop *= 0.94; G.mods.push({ key: 'happy', val: -8, months: 12 }); } }
          ]
        };
      }
    },
    {
      key: 'boom', w: 0.8, cond: () => true,
      make: () => ({
        title: 'Weltwirtschaft im Aufschwung', text: 'Die Rohstoff- und Güterpreise steigen weltweit. Exporte bringen ein Jahr lang 30 % mehr.',
        choices: [{ label: 'Hervorragend', fx: (G) => { G.mods.push({ key: 'prices', val: 0.3, months: 12 }); } }]
      })
    },
    {
      key: 'recession', w: 0.7, cond: (G) => G.month > 24,
      make: () => ({
        title: 'Weltweite Rezession', text: 'Die Märkte brechen ein. Exporte bringen ein Jahr lang 25 % weniger.',
        choices: [
          { label: 'Konjunkturpaket (400 Mio. T, +Zustimmung)', fx: (G) => { G.eco.money -= 400; G.mods.push({ key: 'prices', val: -0.12, months: 12 }, { key: 'happy', val: 3, months: 12 }); } },
          { label: 'Sparkurs fahren', fx: (G) => { G.mods.push({ key: 'prices', val: -0.25, months: 12 }, { key: 'happy', val: -3, months: 12 }); } }
        ]
      })
    },
    {
      key: 'strike', w: 1, cond: (G) => G.eco.last && (G.eco.taxInc > 0.25 || G.eco.last.employment < 0.88 || G.eco.approval < 45),
      make: () => ({
        title: 'Generalstreik', text: 'Die Gewerkschaften fordern höhere Löhne und legen das Land lahm.',
        choices: [
          { label: 'Lohnerhöhung im öffentlichen Dienst (200 Mio. T)', fx: (G) => { G.eco.money -= 200; G.mods.push({ key: 'happy', val: 4, months: 6 }); } },
          { label: 'Hart bleiben', fx: (G) => { G.mods.push({ key: 'strike', val: 0.25, months: 3 }, { key: 'happy', val: -6, months: 6 }); } }
        ]
      })
    },
    {
      key: 'migrants', w: 0.8, cond: (G) => G.eco.approval > 45,
      make: () => ({
        title: 'Menschen wollen einwandern', text: 'Dein Land gilt als attraktiv. Tausende möchten hier leben und arbeiten.',
        choices: [
          { label: 'Willkommen heißen (+Bevölkerung)', fx: (G) => { G.mods.push({ key: 'immig', val: 0.004, months: 12 }, { key: 'happy', val: -2, months: 6 }); } },
          { label: 'Grenzen schließen', fx: (G) => { G.mods.push({ key: 'happy', val: 1, months: 6 }); } }
        ]
      })
    },
    {
      key: 'olympia', w: 0.5, cond: (G) => G.blds.some(b => b.b === 33) && G.eco.money > 1500,
      make: () => ({
        title: 'Olympische Spiele?', text: 'Das Komitee bietet dir die Ausrichtung an. Teuer, aber die Welt würde zuschauen.',
        choices: [
          { label: 'Ausrichten (1.500 Mio. T)', fx: (G) => { G.eco.money -= 1500; G.mods.push({ key: 'tourism', val: 0.6, months: 36 }, { key: 'happy', val: 10, months: 24 }); } },
          { label: 'Ablehnen', fx: () => {} }
        ]
      })
    },
    {
      key: 'tech', w: 0.5, cond: (G) => G.blds.some(b => b.b === 21 || b.b === 22) && S.mod(G, 'renew') < 0.5,
      make: () => ({
        title: 'Durchbruch in der Forschung', text: 'Neue Modulgenerationen: Solar- und Windparks liefern dauerhaft 25 % mehr Strom.',
        choices: [{ label: 'Großartig', fx: (G) => { G.mods.push({ key: 'renew', val: 0.25 }); } }]
      })
    },
    {
      key: 'quake', w: 0.4, cond: (G) => G.cities.some(c => S.countAround(G, c.x, c.y, 8, n => G.t.elev[n] >= S.HILL_E) > 10),
      make: (G) => {
        const c = randomOf(G.cities.filter(c => S.countAround(G, c.x, c.y, 8, n => G.t.elev[n] >= S.HILL_E) > 10));
        return {
          title: 'Erdbeben bei ' + c.name, text: 'Die Erde hat gebebt. Mehrere Hochhäuser sind beschädigt.', focus: [c.x, c.y],
          choices: [{ label: 'Wiederaufbau (180 Mio. T)', fx: (G) => { G.eco.money -= 180; } },
            { label: 'Beschädigte Häuser abreißen', fx: (G) => {
              const t = G.t;
              for (let y = c.y - 4; y <= c.y + 4; y++) for (let x = c.x - 4; x <= c.x + 4; x++) {
                if (!S.inb(G, x, y)) continue;
                const i = S.idx(G, x, y);
                if (t.city[i] === c.id + 1 && t.lvl[i] > 2 && Math.random() < 0.4) { t.lvl[i]--; S.markDirty(G, x, y, x, y); }
              }
              G.mods.push({ key: 'happy', val: -4, months: 6 });
            } }]
        };
      }
    },
    {
      key: 'fire', w: 0.5, cond: (G) => homeTiles(G, i => G.t.forest[i] && G.t.moist[i] < 0.5).length > 20,
      make: (G) => {
        const cand = homeTiles(G, i => G.t.forest[i] && G.t.moist[i] < 0.5);
        const id = randomOf(cand), x0 = id % G.W, y0 = (id / G.W) | 0;
        return {
          title: 'Waldbrand', text: 'Ein großer Waldbrand wütet. Mehrere Quadratkilometer Wald sind verloren.', focus: [x0, y0],
          choices: [{ label: 'Löschflugzeuge einsetzen (80 Mio. T)', fx: (G) => { G.eco.money -= 80; burn(G, x0, y0, 1); } },
            { label: 'Ausbrennen lassen', fx: (G) => burn(G, x0, y0, 3) }]
        };
      }
    },
    {
      key: 'trade', w: 0.6, cond: (G) => G.blds.some(b => b.b === 16),
      make: () => ({
        title: 'Handelsabkommen', text: 'Ein großer Handelspartner bietet ein Freihandelsabkommen an. Heimische Bauern fürchten Konkurrenz.',
        choices: [
          { label: 'Unterzeichnen (+15 % Exporterlöse)', fx: (G) => { G.mods.push({ key: 'trade', val: 0.15 }, { key: 'happy', val: -3, months: 12 }); } },
          { label: 'Ablehnen', fx: () => {} }
        ]
      })
    },
    {
      key: 'green', w: 0.5, cond: (G) => G.eco.last && G.cities.some(c => c.poll > 0.25),
      make: () => ({
        title: 'Proteste für saubere Luft', text: 'Junge Menschen demonstrieren gegen die Luftverschmutzung in deinen Städten.',
        choices: [
          { label: 'Filter-Programm für die Industrie (300 Mio. T, −30 % Abgase)', fx: (G) => { G.eco.money -= 300; G.mods.push({ key: 'clean', val: 0.3 }); } },
          { label: 'Arbeitsplätze gehen vor', fx: (G) => { G.mods.push({ key: 'happy', val: -4, months: 12 }); } }
        ]
      })
    }
  ];

  function burn(G, x0, y0, r) {
    const t = G.t;
    for (let y = y0 - r - 1; y <= y0 + r + 1; y++) for (let x = x0 - r - 1; x <= x0 + r + 1; x++) {
      if (!S.inb(G, x, y)) continue;
      const i = S.idx(G, x, y);
      if (t.forest[i] && Math.hypot(x - x0, y - y0) <= r + Math.random()) { t.forest[i] = 0; S.updateBiome(G, i); }
    }
    S.markDirty(G, x0 - r - 2, y0 - r - 2, x0 + r + 2, y0 + r + 2);
  }

  S.rollEvent = function (G) {
    if (G.flags.over) return;
    const pool = S.EVENTS.filter(e => e.cond(G) && G.lastEventKey !== e.key);
    if (!pool.length) return;
    let sum = pool.reduce((s, e) => s + e.w, 0), r = Math.random() * sum;
    let ev = pool[0];
    for (const e of pool) { r -= e.w; if (r <= 0) { ev = e; break; } }
    const made = ev.make(G);
    if (!made) return;
    G.lastEventKey = ev.key;
    G.pendingEvent = made;
  };

  // ======================= Erfolge =======================
  S.ACHIEVEMENTS = [
    { id: 'boomtown', name: 'Boomtown', desc: 'Eine selbst gegründete Stadt erreicht 1 Mio. Einwohner', check: (G) => G.cities.some(c => c.isNew && c.pop * S.cityScale(G) >= 1e6) },
    { id: 'founder', name: 'Stadtgründer·in', desc: 'Drei neue Städte gegründet', check: (G) => G.cities.filter(c => c.isNew).length >= 3 },
    { id: 'green', name: 'Energiewende', desc: 'Mindestens 100 MW Strom und kein Kohlekraftwerk', check: (G) => G.eco.last && G.eco.last.eProd >= 100 && !G.blds.some(b => b.b === 20) },
    { id: 'rich', name: 'Volle Schatzkammer', desc: '10.000 Mio. T in der Staatskasse', check: (G) => G.eco.money >= 10000 },
    { id: 'debtfree', name: 'Schuldenfrei', desc: 'Alle Kredite zurückgezahlt nach mindestens einem Kredit', check: (G) => G.eco.hadDebt && G.eco.debt <= 0 },
    { id: 'beloved', name: 'Landesmutter, Landesvater', desc: 'Zustimmung über 80 %', check: (G) => G.eco.approval >= 80 },
    { id: 'desert', name: 'Die Wüste lebt', desc: '25 Kacheln bewässert', check: (G) => { let n = 0; for (let i = 0; i < G.W * G.H; i++) n += G.t.irrig[i]; return n >= 25; } },
    { id: 'forest', name: 'Waldmacher·in', desc: '100 Kacheln Wald gepflanzt', check: (G) => (G.planted || 0) >= 100 },
    { id: 'skyline', name: 'Skyline', desc: '10 Wolkenkratzer (Stufe 5)', check: (G) => { let n = 0; for (let i = 0; i < G.W * G.H; i++) if (G.t.lvl[i] === 5 && S.isUrban(G.t.bld[i])) n++; return n >= 10; } },
    { id: 'rail', name: 'Schienennetz', desc: 'Drei Städte per Bahn mit der Hauptstadt verbunden', check: (G) => G.cities.filter(c => c.rail).length >= 3 },
    { id: 'tourism', name: 'Sehnsuchtsort', desc: '150 Mio. T Tourismuseinnahmen im Monat', check: (G) => G.eco.last && G.eco.last.tourism >= 150 },
    { id: 'term', name: 'Zweite Amtszeit', desc: 'Eine Wahl gewonnen oder 8 Jahre regiert', check: (G) => G.month >= 96 || (G.meta.gov === 'demokratie' && G.eco.lastElection > 0 && !G.flags.over) }
  ];

  S.checkAchievements = function (G) {
    if (G.eco.debt > 0) G.eco.hadDebt = true;
    for (const a of S.ACHIEVEMENTS) {
      if (G.ach[a.id]) continue;
      try {
        if (a.check(G)) { G.ach[a.id] = G.month; S.log(G, 'Erfolg freigeschaltet: ' + a.name + ' – ' + a.desc, 'ach'); }
      } catch (e) { /* ignorieren */ }
    }
  };

  // ======================= Kredite =======================
  S.takeLoan = function (G, amt) {
    const eco = G.eco;
    const gdp = (eco.last && eco.last.gdp) || 5000;
    const ratio = (eco.debt + amt) / gdp;
    eco.rate = S.clamp(0.025 + ratio * 0.05, 0.025, 0.16);
    eco.debt += amt; eco.money += amt;
    S.log(G, 'Kredit über ' + S.fmtMoney(amt) + ' aufgenommen (Zins ' + S.fmt1(eco.rate * 100) + ' %).', 'info');
  };
  S.repayLoan = function (G, amt) {
    const eco = G.eco;
    amt = Math.min(amt, eco.debt, Math.max(0, eco.money));
    if (amt <= 0) return false;
    eco.debt -= amt; eco.money -= amt;
    if (eco.debt <= 0) { eco.debt = 0; eco.rate = 0.04; }
    return true;
  };
})(S);
