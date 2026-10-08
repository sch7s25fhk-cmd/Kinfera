/* Souverän – erzeugt aus den echten Landesgrenzen eine spielbare Karte */
'use strict';
(function (S) {
  const B = S.B;

  function decodeRing(r) {
    const pts = new Array(r.length / 2);
    for (let i = 0; i < r.length; i += 2) pts[i / 2] = [r[i] / 100, r[i + 1] / 100];
    return pts;
  }
  S.decodeRing = decodeRing;

  function ringBox(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x0, y0, x1, y1 };
  }
  S.ringBox = ringBox;

  function ringArea(pts) {
    let s = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    return Math.abs(s) / 2;
  }

  function pointInRing(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  const boxArea = (b, k) => Math.max(0.01, (b.x1 - b.x0) * k) * Math.max(0.01, b.y1 - b.y0);
  const unionBox = (a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

  /** Wählt das Kerngebiet: größte Landmasse plus nahe, bedeutende Teile (Inseln) */
  S.selectRings = function (country) {
    const rings = country.r.map(decodeRing).map(p => {
      const box = ringBox(p);
      const k = Math.cos(((box.y0 + box.y1) / 2) * Math.PI / 180);
      return { p, box, area: ringArea(p) * k };
    });
    rings.sort((a, b) => b.area - a.area);
    // Kernland ist der Teil mit der Hauptstadt (sonst der größte)
    const cap = (country.pl || []).find(p => p[4]);
    if (cap) {
      const hit = rings.findIndex(r => r.area > rings[0].area * 0.15 && pointInRing(r.p, cap[1], cap[2]));
      if (hit > 0) rings.unshift(rings.splice(hit, 1)[0]);
    }
    const main = rings[0];
    const k = Math.cos(((main.box.y0 + main.box.y1) / 2) * Math.PI / 180);
    let cur = main.box;
    const sel = [main];
    const dims = (bx) => Math.max((bx.x1 - bx.x0) * k, bx.y1 - bx.y0);
    const gapOf = (a, bx) => Math.hypot(Math.max(0, bx.x0 - a.x1, a.x0 - bx.x1) * k, Math.max(0, bx.y0 - a.y1, a.y0 - bx.y1));
    const rest = rings.slice(1);
    // mehrere Durchgänge: Inselketten werden nach und nach angeschlossen, ferne Gebiete nicht
    for (let pass = 0, changed = true; changed && pass < 6; pass++) {
      changed = false;
      for (let i = 0; i < rest.length; i++) {
        const r = rest[i];
        if (!r) continue;
        const frac = r.area / main.area;
        let ok;
        if (frac < 0.05) {
          const m = dims(cur) * 0.12;
          ok = r.box.x0 >= cur.x0 - m / k && r.box.x1 <= cur.x1 + m / k && r.box.y0 >= cur.y0 - m && r.box.y1 <= cur.y1 + m;
        } else {
          const u = unionBox(cur, r.box);
          ok = gapOf(cur, r.box) <= dims(cur) * (0.3 + 0.4 * Math.min(1, frac)) && boxArea(u, k) / boxArea(cur, k) <= Math.max(1.35, 1 + 3.5 * frac);
        }
        if (ok) { sel.push(r); cur = unionBox(cur, r.box); rest[i] = null; changed = true; }
      }
    }
    return { rings: sel, box: cur };
  };

  /** Füllt einen Ring zeilenweise (Scanline) in das Raster */
  function fillRing(pts, grid, W, H, lon0, lon1, lat0, lat1, val) {
    const dx = (lon1 - lon0) / W, dy = (lat1 - lat0) / H;
    const n = pts.length;
    const xs = [];
    for (let j = 0; j < H; j++) {
      const lat = lat1 - (j + 0.5) * dy;
      xs.length = 0;
      for (let i = 0, k = n - 1; i < n; k = i++) {
        const [xa, ya] = pts[k], [xb, yb] = pts[i];
        if ((ya > lat) !== (yb > lat)) xs.push(xa + (lat - ya) / (yb - ya) * (xb - xa));
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) {
        let i0 = Math.ceil((xs[q] - lon0) / dx - 0.5), i1 = Math.floor((xs[q + 1] - lon0) / dx - 0.5);
        if (i0 < 0) i0 = 0; if (i1 >= W) i1 = W - 1;
        for (let i = i0; i <= i1; i++) grid[j * W + i] = val;
      }
    }
  }

  /** Breitensuche: Abstand jeder Kachel zur nächsten Kachel, für die pred gilt */
  function distField(W, H, pred) {
    const N = W * H, d = new Float32Array(N).fill(1e9), q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (pred(i)) { d[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], x = i % W, y = (i / W) | 0;
      for (const [ox, oy] of S.N4) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (d[j] > d[i] + 1) { d[j] = d[i] + 1; q[qt++] = j; }
      }
    }
    return d;
  }

  S.newTiles = function (N) {
    return {
      region: new Uint8Array(N),   // 0 = offenes Meer, 1 = eigenes Land, 2 = Ausland
      elev: new Float32Array(N), moist: new Float32Array(N), temp: new Float32Array(N),
      forest: new Uint8Array(N), river: new Uint8Array(N), rdir: new Int8Array(N).fill(-1), flow: new Uint16Array(N),
      irrig: new Uint8Array(N), res: new Uint8Array(N), road: new Uint8Array(N),
      bld: new Uint8Array(N), lvl: new Uint8Array(N), city: new Uint16Array(N), zone: new Uint8Array(N),
      poll: new Float32Array(N), biome: new Uint8Array(N)
    };
  };
  S.TILE_TYPES = { region: Uint8Array, elev: Float32Array, moist: Float32Array, temp: Float32Array, forest: Uint8Array,
    river: Uint8Array, rdir: Int8Array, flow: Uint16Array, irrig: Uint8Array, res: Uint8Array, road: Uint8Array,
    bld: Uint8Array, lvl: Uint8Array, city: Uint16Array, zone: Uint8Array, poll: Float32Array, biome: Uint8Array, owner: Uint16Array };

  S.updateBiome = function (G, i) {
    const t = G.t;
    t.biome[i] = S.biomeOf(t.elev[i], t.moist[i], t.temp[i], t.forest[i], t.irrig[i]);
  };

  /** Hauptfunktion: erzeugt den kompletten Spielzustand für ein Land */
  S.generateCountry = function (country, opts) {
    opts = opts || {};
    const seed = S.hashStr(country.id + ':' + (opts.seed || 1));
    const rnd = S.rng(seed);
    const { rings, box } = S.selectRings(country);
    const midLat = (box.y0 + box.y1) / 2;
    const k = Math.cos(midLat * Math.PI / 180);
    const wDeg0 = box.x1 - box.x0, hDeg0 = box.y1 - box.y0;
    const pad = Math.max(0.12, Math.max(wDeg0 * k, hDeg0) * 0.07);
    const lon0 = box.x0 - pad / k, lon1 = box.x1 + pad / k, lat0 = Math.max(-84, box.y0 - pad), lat1 = Math.min(84, box.y1 + pad);
    const areaDeg = rings.reduce((s, r) => s + r.area, 0);
    const longest = Math.round(S.clamp(100 + Math.sqrt(areaDeg) * 9, 120, 192));
    // Weltauflösung so wählen, dass das Kernland etwa `longest` Felder misst (Mercator: quadratische Felder)
    const spanX = (lon1 - lon0) / 360, spanY = (S.World.mercY(lat1) - S.World.mercY(lat0)) / (2 * Math.PI);
    const WT = Math.round(longest / Math.max(spanX, spanY));
    const kmMid = 40075 * k / WT;
    const sc = S.clamp(kmMid / 260, 0.055, 0.16);
    S.World.setup({ WT, seed, sc, home: country.id });
    const gx0 = Math.floor(S.World.gxOf(lon0)), gx1 = Math.ceil(S.World.gxOf(lon1));
    const gy0 = Math.floor(S.World.gyOf(lat1)), gy1 = Math.ceil(S.World.gyOf(lat0));
    const W = gx1 - gx0, H = gy1 - gy0;
    const N = W * H;
    const kmPerTile = kmMid;

    // 1) Gelände, Klima, Wald, Rohstoffe und Grenzen aus der Weltfunktion
    const t = S.World.tileBlock(gx0, gy0, W, H);
    let homeCount = 0;
    for (let i = 0; i < N; i++) if (t.region[i] === 1) homeCount++;
    if (homeCount < 30) throw new Error('Land zu klein');
    const isLand = (i) => t.region[i] !== 0;
    const dSea = distField(W, H, i => !isLand(i));

    // 4) Flüsse: von Quellen im Bergland bergab bis ins Meer
    const isW = (id) => t.elev[id] < 0;
    const sources = [];
    for (let id = 0; id < N; id++) if (isLand(id) && t.elev[id] > 0.4 && t.moist[id] > 0.42 && !isW(id)) sources.push(id);
    sources.sort(() => rnd() - 0.5);
    const nRivers = Math.max(2, Math.round(homeCount / 380));
    let made = 0;
    for (const src of sources) {
      if (made >= nRivers) break;
      if (t.river[src]) continue;
      const path = [src];
      const seen = new Set(path);
      let cur = src, ok = false;
      for (let step = 0; step < 400; step++) {
        const x = cur % W, y = (cur / W) | 0;
        let best = -1, be = 1e9;
        for (const [ox, oy] of S.N4) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nid = ny * W + nx;
          if (seen.has(nid)) continue;
          // bergab, im Flachland Richtung Meer
          const e = t.elev[nid] + Math.min(dSea[nid], 60) * 0.006 + S.hash2(nx, ny, seed + step) * 0.012;
          if (e < be) { be = e; best = nid; }
        }
        if (best < 0) break;
        if (isW(best) || t.river[best]) { path.push(best); ok = true; break; }
        if (t.elev[best] > t.elev[cur]) t.elev[best] = t.elev[cur] - 0.002; // Tal graben
        if (t.elev[best] < 0.03) t.elev[best] = 0.03;
        path.push(best); seen.add(best); cur = best;
      }
      if (!ok || path.length < 6) continue;
      made++;
      for (let q = 0; q < path.length - 1; q++) {
        const a = path[q], b = path[q + 1];
        if (isW(a)) break;
        t.river[a] = 1;
        const dxv = (b % W) - (a % W), dyv = ((b / W) | 0) - ((a / W) | 0);
        t.rdir[a] = dxv === 1 ? 0 : dxv === -1 ? 1 : dyv === 1 ? 2 : 3;
      }
    }
    // Abflussmenge für die Flussbreite
    for (let id = 0; id < N; id++) if (t.river[id] && t.flow[id] === 0) {
      let cur = id, n = 1, guard = 0;
      while (cur >= 0 && t.river[cur] && guard++ < 600) {
        t.flow[cur] = Math.max(t.flow[cur], n++);
        const d = t.rdir[cur];
        if (d < 0) break;
        const [ox, oy] = S.N4[d];
        cur = cur + ox + oy * W;
      }
    }
    const dRiver = distField(W, H, i => t.river[i] === 1);
    for (let id = 0; id < N; id++) if (dRiver[id] <= 2) t.moist[id] = Math.min(1, t.moist[id] + 0.12 - dRiver[id] * 0.04);

    // 5) Landschaft nach den Flüssen neu bestimmen
    for (let id = 0; id < N; id++) S.updateBiome({ t }, id);

    const G = {
      v: 1,
      meta: {
        id: country.id, name: country.n, en: country.en, inc: country.inc || 3, realPop: country.pop || 1e6,
        gdp: country.gdp, cont: country.cont, gov: opts.gov || 'demokratie', ruler: opts.ruler || '', seed
      },
      W, H, gx0, gy0, world: { WT, seed, sc, home: country.id }, kmPerTile, t,
      cities: [], blds: [],
      eco: null, stats: [], log: [], month: 0, mods: [], ach: {},
      flags: { over: false, sandbox: false }, popScale: 1, cam: null, homeCount
    };
    seedCities(G, country, rnd);
    return G;
  };

  S.latOf = (G, j) => S.World.latOfGy(G.gy0 + j + 0.5);
  S.lonOf = (G, i) => S.World.lonOfGx(G.gx0 + i + 0.5);

  S.tileOfLonLat = function (G, lon, lat) {
    let gx = S.World.gxOf(lon) - G.gx0;
    const WT = S.World.WT;
    while (gx < -WT / 2) gx += WT; while (gx > WT / 2 + G.W) gx -= WT;
    return [Math.floor(gx), Math.floor(S.World.gyOf(lat) - G.gy0)];
  };

  S.isBuildableLand = function (G, id) {
    const t = G.t;
    return t.region[id] === 1 && t.elev[id] >= 0 && t.elev[id] < S.MOUNTAIN_E && !t.bld[id] && !t.road[id];
  };

  function seedCities(G, country, rnd) {
    const { W, H, t } = G;
    const places = (country.pl || []).slice();
    const chosen = [];
    const near = (x, y, d) => chosen.some(c => Math.abs(c.x - x) + Math.abs(c.y - y) < d);
    for (const p of places) {
      if (chosen.length >= 8) break;
      let [x, y] = S.tileOfLonLat(G, p[1], p[2]);
      let best = null, bd = 1e9;
      for (let oy = -6; oy <= 6; oy++) for (let ox = -6; ox <= 6; ox++) {
        const nx = x + ox, ny = y + oy;
        if (nx < 2 || ny < 2 || nx >= W - 2 || ny >= H - 2) continue;
        const id = ny * W + nx;
        if (t.region[id] !== 1 || t.elev[id] < 0 || t.elev[id] >= S.MOUNTAIN_E) continue;
        const d = ox * ox + oy * oy + t.elev[id] * 8;
        if (d < bd) { bd = d; best = [nx, ny]; }
      }
      if (!best || near(best[0], best[1], 7)) continue;
      chosen.push({ name: p[0], x: best[0], y: best[1], pop: p[3], capital: !!p[4] });
    }
    if (!chosen.some(c => c.capital)) {
      if (chosen.length) chosen[0].capital = true;
      else {
        // Hauptstadt an einem guten Ort in der Mitte gründen
        let sx = 0, sy = 0, n = 0;
        for (let id = 0; id < W * H; id++) if (t.region[id] === 1) { sx += id % W; sy += (id / W) | 0; n++; }
        const cx = sx / n, cy = sy / n;
        let best = null, bs = -1e9;
        for (let id = 0; id < W * H; id++) {
          if (t.region[id] !== 1 || t.elev[id] < 0 || t.elev[id] >= S.HILL_E) continue;
          const x = id % W, y = (id / W) | 0;
          const s = -Math.hypot(x - cx, y - cy) - t.elev[id] * 10 + (t.river[id] ? 3 : 0);
          if (s > bs) { bs = s; best = [x, y]; }
        }
        chosen.push({ name: country.n.split(' ')[0] + '-Stadt', x: best[0], y: best[1], pop: 200000, capital: true });
      }
    }
    chosen.sort((a, b) => (b.capital - a.capital) || (b.pop - a.pop));

    const hot = (x, y) => t.temp[y * W + x] > 0.68 && t.moist[y * W + x] < 0.5;
    const inc = G.meta.inc;
    for (const c of chosen) {
      let style = hot(c.x, c.y) ? 'mediterran' : 'historisch';
      if (c.pop > 3e6 && inc <= 3) style = 'modern';
      if (c.pop > 6e6) style = 'modern';
      const city = S.foundCity(G, c.x, c.y, c.name, style, c.capital ? 'radial' : 'organisch', true);
      city.capital = c.capital;
      city.realPop = c.pop;
      let target = Math.round(S.clamp(3 + Math.sqrt(c.pop / 50000) * 1.2, 4, 30));
      target = Math.max(target, Math.round(c.capital ? Math.min(16, G.homeCount / 300) : Math.min(6, G.homeCount / 900)));
      S.growCityInstant(G, city, target, rnd);
    }

    // Straßennetz: minimaler Spannbaum zwischen den Städten
    const cs = G.cities;
    const inTree = [0];
    const edges = [];
    while (inTree.length < cs.length) {
      let best = null, bd = 1e9;
      for (const a of inTree) for (let b = 0; b < cs.length; b++) {
        if (inTree.includes(b)) continue;
        const d = Math.hypot(cs[a].x - cs[b].x, cs[a].y - cs[b].y);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      inTree.push(best[1]); edges.push(best);
    }
    for (const [a, b] of edges) {
      const path = S.findPath(G, cs[a].x, cs[a].y, cs[b].x, cs[b].y);
      if (path) for (const id of path) if (!t.bld[id]) t.road[id] |= 1;
    }

    // Startwirtschaft: Höfe, Kraftwerke, Minen, Fabriken, Dienste
    const place = (bid, cx, cy, rMin, rMax, scoreFn) => {
      let best = -1, bs = -1e9;
      for (let oy = -rMax; oy <= rMax; oy++) for (let ox = -rMax; ox <= rMax; ox++) {
        const d = Math.abs(ox) + Math.abs(oy);
        if (d < rMin || d > rMax) continue;
        const x = cx + ox, y = cy + oy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const id = y * W + x;
        if (!S.canPlace(G, bid, x, y).ok) continue;
        const s = scoreFn(id, x, y) - d * 0.15 + rnd() * 0.3;
        if (s > bs) { bs = s; best = id; }
      }
      if (best >= 0) { S.placeBuilding(G, bid, best % W, (best / W) | 0, true); return true; }
      return false;
    };
    const fert = (id) => S.tileFertility(G, id);
    for (const c of cs) {
      const n = Math.max(2, Math.ceil(c.tiles / 5));
      for (let q = 0; q < n; q++) place(10, c.x, c.y, 3, 9, fert);
      if (c.tiles > 6 || c.capital) {
        const green = c.tiles < 12 || (inc <= 2 && rnd() < 0.6);
        const e = green ? (S.isCoastal(G, c.x, c.y, 8) ? 22 : 21) : 20;
        if (!place(e, c.x, c.y, 3, 9, () => 0)) place(20, c.x, c.y, 3, 12, () => 0);
      }
      place(13, c.x, c.y, 2, 12, (id) => t.res[id] === S.RES.ORE || t.res[id] === S.RES.COAL ? 3 : -5);
      place(14, c.x, c.y, 2, 14, () => 0);
      if (c.tiles >= 8) place(15, c.x, c.y, 2, 6, () => 0);
      if (c.capital) {
        place(30, c.x, c.y, 2, 10, () => 0);
        place(31, c.x, c.y, 2, 10, () => 0);
        place(16, c.x, c.y, 1, 10, () => 0);
      } else if (c.tiles >= 12) {
        place(31, c.x, c.y, 2, 8, () => 0);
      }
    }
    for (const b of G.blds) S.connectBuildingRoad(G, b.x, b.y);

    // Startbevölkerung: Städte sind zu 85 % gefüllt
    S.recalcCities(G);
    let gamePop = 0;
    for (const c of cs) { c.pop = c.cap * 0.85; gamePop += c.pop; }
    G.popScale = Math.max(1, G.meta.realPop * 0.75 / Math.max(1, gamePop));
    const I = S.INCOME[inc];
    G.eco = {
      money: I.money, debt: 0, taxInc: 0.2, taxCorp: 0.18,
      budget: { edu: 1, health: 1, security: 1, infra: 1 },
      eduLevel: I.edu, approval: 60, lowMonths: 0, lastElection: 0,
      last: null, history: []
    };
  }

  S.isCoastal = function (G, x, y, r) {
    const { W, H, t } = G;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (t.elev[ny * W + nx] < 0 && t.region[ny * W + nx] !== 1) return true;
    }
    return false;
  };

  /** A*-Wegsuche für Straßen (nur über eigenes Land, Brücken teuer) */
  S.findPath = function (G, x0, y0, x1, y1) {
    const { W, H, t } = G;
    const N = W * H;
    const g = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1);
    const open = [];
    const start = y0 * W + x0, goal = y1 * W + x1;
    const h = (id) => Math.abs((id % W) - x1) + Math.abs(((id / W) | 0) - y1);
    g[start] = 0;
    open.push([h(start), start]);
    const cost = (id) => {
      if (t.region[id] !== 1) return 1e9;
      if (t.road[id]) return 0.35;
      if (t.bld[id] && t.bld[id] !== S.U.HALL && t.bld[id] < 10) return 0.8;
      if (t.bld[id]) return 1e9;
      const e = t.elev[id];
      if (e < 0) return e < -0.15 ? 1e9 : 9;
      if (e >= S.MOUNTAIN_E) return 9;
      return 1 + (e > S.HILL_E ? 2.5 : 0) + (t.forest[id] ? 0.6 : 0) + (t.river[id] ? 2 : 0);
    };
    let iter = 0;
    while (open.length && iter++ < 250000) {
      // einfache Prioritätswarteschlange (binärer Heap)
      const [, cur] = heapPop(open);
      if (cur === goal) break;
      const x = cur % W, y = (cur / W) | 0;
      for (const [ox, oy] of S.N4) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nid = ny * W + nx;
        const c = nid === goal ? 1 : cost(nid);
        if (c >= 1e9) continue;
        const ng = g[cur] + c;
        if (ng < g[nid]) { g[nid] = ng; came[nid] = cur; heapPush(open, [ng + h(nid), nid]); }
      }
    }
    if (came[goal] < 0) return null;
    const path = [];
    for (let c = goal; c >= 0 && c !== start; c = came[c]) path.push(c);
    return path;
  };

  function heapPush(h, v) {
    h.push(v);
    let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; }
  }
  function heapPop(h) {
    const top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] < h[m][0]) m = l;
        if (r < h.length && h[r][0] < h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]]; i = m;
      }
    }
    return top;
  }
})(S);
