/* Souverän – Militär in Echtzeit: Einheiten, Fronten, Eroberung, KI-Gegner, Kriegsfolgen
   Zeit: Das Militär rechnet in Spielstunden (1 Monat = 720 Spielstunden). Positionen sind globale
   Feldkoordinaten (Fließkomma) im Weltraster; Geschwindigkeiten und Reichweiten in Kilometern. */
'use strict';
(function (S) {
  const M = S.Mil = {};
  const H_MONTH = 720;

  M.TYPES = {
    inf: { name: 'Infanterie', cost: 60, upkeep: 1.5, men: 6000, atk: 1.0, def: 1.45, km: 110, rangeKm: 0, hours: 10, desc: 'Günstig und zäh in der Verteidigung, besonders in Städten, Wäldern und Bergen.' },
    tank: { name: 'Panzer', cost: 170, upkeep: 4, men: 1500, atk: 2.2, def: 1.0, km: 240, rangeKm: 0, hours: 20, desc: 'Schnell und schlagkräftig im Angriff. Ideal für Durchbrüche.' },
    art: { name: 'Artillerie', cost: 120, upkeep: 2.5, men: 2500, atk: 1.7, def: 0.5, km: 90, rangeKm: 45, hours: 16, desc: 'Beschießt Gegner aus der Entfernung. Braucht Schutz durch andere Truppen.' }
  };
  M.TYPE_KEYS = Object.keys(M.TYPES);

  const W = () => S.World;
  const rnd = Math.random;

  // ======================= Grundlagen =======================
  M.init = function (G) {
    if (G.mil) return;
    G.mil = { units: [], wars: {}, truce: {}, occ: {}, caps: {}, nextId: 1, hours: 0, aiAcc: 0, lastAiWar: -99, aggr: 0, lossMen: 0, reports: [] };
    // Startarmee nach Landesgröße
    const pop = G.meta.realPop;
    const nInf = S.clamp(Math.round(2 + Math.log10(Math.max(1, pop / 1e6)) * 2.5), 2, 9);
    const nTank = S.clamp(Math.round(nInf / 3), 1, 4), nArt = S.clamp(Math.round(nInf / 4), 1, 3);
    const homes = G.cities.slice().sort((a, b) => (b.capital - a.capital) || b.pop - a.pop);
    let k = 0;
    const put = (type) => {
      const c = homes[k++ % homes.length];
      const a = rnd() * Math.PI * 2, r = 0.8 + rnd() * 1.4;
      M.spawn(G, W().homeIdx, type, c.x + G.gx0 + 0.5 + Math.cos(a) * r, c.y + G.gy0 + 0.5 + Math.sin(a) * r);
    };
    for (let i = 0; i < nInf; i++) put('inf');
    for (let i = 0; i < nTank; i++) put('tank');
    for (let i = 0; i < nArt; i++) put('art');
  };

  M.spawn = function (G, o, type, x, y, opts) {
    const u = Object.assign({ id: G.mil.nextId++, o, type, x, y, hp: 100, path: null, fight: 0, ready: 0, capAcc: 0 }, opts || {});
    G.mil.units.push(u);
    return u;
  };

  M.home = () => W().homeIdx;
  M.key = (gx, gy) => W().wrapGx(Math.floor(gx)) + ',' + Math.floor(gy);
  M.kmAt = (gy) => Math.max(0.05, W().kmPerTile(W().latOfGy(gy)));
  M.countryName = (o) => (S.WORLD[o - 1] ? S.WORLD[o - 1].n : 'Rebellen');

  /** lokale Koordinate im eigenen Raster (Umlauf beachtet) */
  function local(G, gx, gy) {
    const WT = W().WT;
    let lx = Math.floor(gx) - G.gx0;
    while (lx < -WT / 2) lx += WT; while (lx > WT / 2) lx -= WT;
    return [lx, Math.floor(gy) - G.gy0];
  }
  M.local = local;

  const memo = new Map();
  function baseOwner(gx, gy) {
    const k = M.key(gx, gy);
    let v = memo.get(k);
    if (v === undefined) {
      v = W().ownerAt(Math.floor(gx), Math.floor(gy));
      if (memo.size > 300000) memo.clear();
      memo.set(k, v);
    }
    return v;
  }
  M.baseOwner = baseOwner;
  M.resetCache = () => { memo.clear(); if (typeof tmemo !== 'undefined') tmemo.clear(); };

  /** Grundbesitz nach Annexionen: ein annektiertes Land gehört ganz dem Spieler */
  M.mapAnnex = (G, o) => (o && G.mil && G.mil.annexed && G.mil.annexed[o] !== undefined ? M.home() : o);
  /** Besitz ohne Kriegsgewinne (ursprüngliche Grenzen plus Annexionen) */
  M.defOwner = (G, gx, gy) => M.mapAnnex(G, baseOwner(gx, gy));

  /** aktuelle Landeszugehörigkeit eines Feldes */
  M.owner = function (G, gx, gy) {
    const [lx, ly] = local(G, gx, gy);
    if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H) return G.t.owner[ly * G.W + lx];
    const o = G.mil.occ[M.key(gx, gy)];
    return o !== undefined ? o : M.defOwner(G, gx, gy);
  };

  M.setOwner = function (G, gx, gy, o) {
    const k = M.key(gx, gy);
    const [lx, ly] = local(G, gx, gy);
    const base = M.defOwner(G, gx, gy);
    if (o === base) delete G.mil.occ[k]; else G.mil.occ[k] = o;
    G._occChange = (G._occChange || 0) + 1;
    if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H) {
      const i = ly * G.W + lx;
      G.t.owner[i] = o;
      G.t.region[i] = o === 0 ? 0 : o === M.home() ? 1 : 2;
      G._netDirty = true;
    } else if (o === M.home()) G._growReq = true;
    if (S.onDirtyGlobal) S.onDirtyGlobal(Math.floor(gx), Math.floor(gy));
  };

  /**
   * Erobertes Land außerhalb des verwalteten Rasters einbeziehen, damit dort gebaut werden kann.
   * near: optional ein Feld (global), das unbedingt hinein soll. Gibt [dx, dy] zurück, wenn das Raster gewachsen ist.
   */
  M.ensureGrid = function (G, near) {
    G._growReq = false;
    const home = M.home();
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const add = (gx, gy) => {
      const [lx, ly] = local(G, gx, gy);
      if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H) return;
      x0 = Math.min(x0, lx); y0 = Math.min(y0, ly); x1 = Math.max(x1, lx); y1 = Math.max(y1, ly);
    };
    if (near) add(near[0], near[1]);
    for (const k in G.mil.occ) {
      if (G.mil.occ[k] !== home) continue;
      const p = k.indexOf(',');
      add(+k.slice(0, p), +k.slice(p + 1));
    }
    if (x0 > x1) return null;
    const pad = 6;
    return S.growGrid(G, x0 - pad, y0 - pad, x1 + pad, y1 + pad);
  };

  const tmemo = new Map();
  /** Geländebonus für die Verteidigung */
  function terrainDef(G, gx, gy) {
    const [lx, ly] = local(G, gx, gy);
    let biome, urban = false;
    if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H) {
      const i = ly * G.W + lx;
      biome = G.t.biome[i]; urban = S.isUrban(G.t.bld[i]);
      if (G.t.bld[i] === 19) return 1.9;
    } else {
      const k = M.key(gx, gy);
      biome = tmemo.get(k);
      if (biome === undefined) {
        biome = W().tileBlock(Math.floor(gx), Math.floor(gy), 1, 1).biome[0];
        if (tmemo.size > 50000) tmemo.clear();
        tmemo.set(k, biome);
      }
      urban = !!cityAt(gx, gy);
    }
    const B = S.B;
    let d = 1;
    if (biome === B.MOUNTAIN || biome === B.SNOW) d = 1.7;
    else if (biome === B.HILLS) d = 1.4;
    else if (biome === B.FOREST || biome === B.JUNGLE || biome === B.TAIGA) d = 1.25;
    else if (biome === B.SWAMP) d = 1.2;
    return d * (urban ? 1.3 : 1);
  }
  M.terrainDef = terrainDef;

  function cityAt(gx, gy) {
    const near = W().citiesNear(Math.floor(gx) - 2, Math.floor(gy) - 2, 4, 4);
    for (const n of near) if (Math.hypot(gx - n.gx, gy - n.gy) <= n.c.r) return n.c;
    return null;
  }

  // ======================= Kriegszustand =======================
  M.atWar = function (G, a, b) {
    const h = M.home();
    if (a === b) return false;
    if (a === -1 || b === -1) return a === h || b === h; // Rebellen
    if (a === h) return !!G.mil.wars[b];
    if (b === h) return !!G.mil.wars[a];
    return false;
  };
  const hostileUnits = (G, a, b) => M.atWar(G, a.o, b.o);

  M.declareWar = function (G, e, aggressor) {
    const mil = G.mil;
    if (mil.wars[e]) return;
    const c = S.WORLD[e - 1];
    const strength = M.potential(e);
    mil.wars[e] = { since: mil.hours, score: 0, aggressor, ownLoss: 0, enemyLoss: 0, lastSpawn: mil.hours, max: Math.round(strength * 1.5), mode: aggressor === 'ai' ? 'attack' : 'defend', modeAt: mil.hours, peaceAsk: mil.hours };
    // Hauptstadtgarnison
    const capC = W().cities.find(c => c.ci === e && c.capital);
    if (capC) for (let i = 0; i < (strength > 4 ? 2 : 1); i++) M.spawn(G, e, 'inf', capC.gx + (rnd() - 0.5) * 1.2, capC.gy + (rnd() - 0.5) * 1.2, { role: 'cap', dig: 1 });
    // Gegner stellt sich an den Städten nahe der Grenze auf
    const cities = enemyCities(G, e);
    for (let i = 0; i < strength; i++) {
      const city = cities[i % Math.max(1, Math.min(4, cities.length))];
      if (!city) break;
      const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 1.8;
      const type = i % 5 === 3 ? 'tank' : i % 7 === 5 ? 'art' : 'inf';
      M.spawn(G, e, type, city.gx + Math.cos(a) * r, city.gy + Math.sin(a) * r, { role: rnd() < 0.35 ? 'def' : 'atk' });
    }
    if (aggressor === 'player') {
      mil.aggr = G.month;
      G.mods.push({ key: 'sanction', val: 1, months: 18 }, { key: 'happy', val: -4, months: 4 });
      S.log(G, 'Du hast ' + c.n + ' den Krieg erklärt. Die Welt verhängt Sanktionen.', 'bad');
    } else {
      G.mods.push({ key: 'happy', val: 4, months: 3 });
      S.log(G, c.n + ' hat dir den Krieg erklärt! Seine Armeen marschieren.', 'bad');
    }
  };

  /** Städte eines Gegners, die er noch hält – die nächsten zuerst */
  function enemyCities(G, e) {
    const cap = G.cities.find(c => c.capital) || G.cities[0];
    const hx = cap.x + G.gx0, hy = cap.y + G.gy0, WT = W().WT;
    return W().cities.filter(c => c.ci === e && M.owner(G, c.gx, c.gy) === e).map(c => {
      let dx = c.gx - hx; while (dx > WT / 2) dx -= WT; while (dx < -WT / 2) dx += WT;
      return { c, gx: hx + dx, gy: c.gy, d: Math.hypot(dx, c.gy - hy) };
    }).sort((a, b) => a.d - b.d).map(x => ({ gx: x.gx, gy: x.gy, c: x.c }));
  }

  M.makePeace = function (G, e, text) {
    const mil = G.mil, war = mil.wars[e];
    if (!war) return;
    delete mil.wars[e];
    mil.truce[e] = G.month + 24;
    mil.units = mil.units.filter(u => u.o !== e);
    S.log(G, text || ('Frieden mit ' + M.countryName(e) + '. Die eroberten Gebiete bleiben in deiner Hand.'), 'good');
  };

  /** Spieler bietet Frieden an */
  M.offerPeace = function (G, e) {
    const war = G.mil.wars[e];
    if (!war) return false;
    const days = (G.mil.hours - war.since) / 24;
    const ok = war.score > 12 || (war.score > -12 && days > 5 && rnd() < 0.5) || (days > 40 && rnd() < 0.4);
    if (ok) M.makePeace(G, e);
    else S.log(G, M.countryName(e) + ' lehnt dein Friedensangebot ab.', 'warn');
    return ok;
  };

  // ======================= Befehle =======================
  /** Prüft einen Marsch: Landweg? Welche Länder ohne Krieg werden betreten? */
  M.checkPath = function (G, u, tx, ty) {
    const dx = tx - u.x, dy = ty - u.y, len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len * 2));
    const crossed = new Set();
    for (let i = 1; i <= steps; i++) {
      const x = u.x + dx * i / steps, y = u.y + dy * i / steps;
      const o = M.owner(G, x, y);
      if (!o) return { ok: false, reason: 'Kein Landweg – Truppen können nicht übers Meer.' };
      if (o !== u.o && !M.atWar(G, u.o, o)) crossed.add(o);
    }
    return { ok: true, crossed: [...crossed], len };
  };

  M.order = function (G, ids, tx, ty, auto) {
    const units = G.mil.units.filter(u => ids.includes(u.id));
    // Verband: alle marschieren im Tempo der langsamsten Einheit und kommen gemeinsam an
    const convoy = units.length > 1 ? Math.min(...units.map(u => M.TYPES[u.type].km)) : 0;
    units.forEach((u, i) => {
      u.convoy = convoy;
      if (!auto) u.manual = G.mil.hours + 96;   // eigener Befehl: das Oberkommando hält sich vier Spieltage heraus
      const a = i * 2.4, r = i ? 0.5 + i * 0.12 : 0;
      u.path = [[tx + Math.cos(a) * r, ty + Math.sin(a) * r]];
    });
  };

  M.etaHours = function (G, u, tx, ty) {
    const km = Math.hypot(tx - u.x, ty - u.y) * M.kmAt(u.y);
    return km / (M.TYPES[u.type].km / 24);
  };

  // ======================= Personal und Moral =======================
  /** Soldaten im Dienst (eigene Einheiten, auch in Ausbildung) */
  M.inService = (G) => G.mil ? G.mil.units.filter(u => u.o === M.home()).reduce((s, u) => s + M.TYPES[u.type].men, 0) : 0;

  /**
   * Wehrfähige: wie viele Menschen das Land unter Waffen stellen kann. Hängt vom Wehrdienstgesetz,
   * von Zustimmung, Gesundheit, Bedrohung und Propaganda ab.
   */
  M.manpower = function (G) {
    const popReal = G.cities.reduce((s, c) => s + c.pop, 0) * (G.popScale || 1);
    const share = S.lawv(G, 'conscription', 'share', 0.005);
    const approval = G.eco ? G.eco.approval : 55;
    const defending = Object.values(G.mil.wars).some(w => w.aggressor === 'ai');
    // Bereitschaft: Zustimmung, Bedrohung, Propaganda, Fürsorge – Pflichtsysteme hängen weniger davon ab
    let will = 0.55 + (approval - 50) / 60 + (defending ? 0.25 : 0) + S.lawSum(G, 'will') - M.weariness(G) / 40;
    will = S.clamp(will, 0.25, 1.5);
    const forced = S.lawv(G, 'conscription', 'will', 0);
    const willEff = forced ? S.clamp(will * (1 - forced) + forced * 1.1, 0.4, 1.5) : will;
    let health = 0.6;
    if (G.cities.length) health = G.cities.reduce((s, c) => s + (c.health || 0.6) * c.pop, 0) / Math.max(1, G.cities.reduce((s, c) => s + c.pop, 0));
    const potential = popReal * share * willEff * (0.85 + 0.15 * health);
    const inService = M.inService(G);
    return { potential, inService, available: Math.max(0, potential - inService), will: willEff };
  };

  /** Moral der eigenen Truppen 0,4–1,2: Zustimmung, Fürsorge, Propaganda, Kriegsmüdigkeit */
  M.morale = function (G) {
    const approval = G.eco ? G.eco.approval : 55;
    const defending = Object.values(G.mil.wars).some(w => w.aggressor === 'ai');
    return S.clamp(0.5 + approval / 200 + S.lawv(G, 'care', 'morale', 0) + (S.lawOpt(G, 'propaganda').key === 'an' ? 0.08 : 0) + (defending ? 0.1 : 0) - M.weariness(G) / 60, 0.4, 1.2);
  };
  /** Kampfkraft eigener Einheiten aus Ausrüstung, Ausbildung und Moral */
  M.power = (G) => S.lawv(G, 'milbudget', 'power', 1) * S.lawv(G, 'training', 'power', 1) * (0.72 + 0.35 * M.morale(G));

  M.recruit = function (G, type, bld) {
    const T = M.TYPES[type];
    if (!bld) return { ok: false, reason: 'Du brauchst zuerst eine Kaserne.' };
    if (G.eco.money < T.cost) return { ok: false, reason: 'Nicht genug Geld' };
    const mp = M.manpower(G);
    if (mp.available < T.men) return { ok: false, reason: 'Zu wenige Wehrfähige: ' + S.fmtPop(mp.available) + ' verfügbar, ' + S.fmtPop(T.men) + ' nötig. Wehrdienst, Zustimmung und Fürsorge bestimmen, wie viele dienen.' };
    G.eco.money -= T.cost;
    const hours = T.hours * S.lawv(G, 'training', 'time', 1);
    const u = M.spawn(G, M.home(), type, bld.x + G.gx0 + 0.5 + (rnd() - 0.5), bld.y + G.gy0 + 0.5 + (rnd() - 0.5), { ready: G.mil.hours + hours, xp: S.lawv(G, 'training', 'xp', 0.1) });
    return { ok: true, unit: u, hours };
  };

  // ======================= Simulation =======================
  const xpMul = (u) => 1 + 0.25 * Math.min(1, u.xp || 0);
  /** Erfahrungssterne 0–3 */
  M.stars = (u) => { const x = u.xp || 0; return x >= 1 ? 3 : x >= 0.6 ? 2 : x >= 0.25 ? 1 : 0; };
  /** Ereignis für die Darstellung (Explosionen); wird nicht gespeichert */
  function fx(G, e) {
    const l = G._fx || (G._fx = []);
    l.push(e);
    if (l.length > 60) l.shift();
  }
  /** Versorgt: eigenes Gebiet in etwa 40 km Umkreis */
  function supplied(G, u) {
    if (u.o === -1) return true;
    const mine = u.o;
    if (M.owner(G, u.x, u.y) === mine) return true;
    const R = S.clamp(40 / M.kmAt(u.y), 2, 14);
    for (const f of [0.5, 1]) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      if (M.owner(G, u.x + Math.cos(a) * R * f, u.y + Math.sin(a) * R * f) === mine) return true;
    }
    return false;
  }
  M.supplied = supplied;
  const capMemo = new Map();
  function nearCapital(u) {
    let c = capMemo.get(u.o);
    if (c === undefined) { c = W().cities.find(x => x.ci === u.o && x.capital) || null; capMemo.set(u.o, c); }
    return !!c && Math.hypot(u.x - c.gx, u.y - c.gy) < 3;
  }
  function nearestHomeCity(G, u) {
    const home = M.home();
    let best = null, bd = 1e9;
    for (const c of G.cities) {
      if (G.t.owner[c.y * G.W + c.x] !== home) continue;
      const gx = c.x + G.gx0 + 0.5, gy = c.y + G.gy0 + 0.5, d = Math.hypot(gx - u.x, gy - u.y);
      if (d < bd) { bd = d; best = [gx, gy]; }
    }
    return best;
  }

  /** Militär um `hours` Spielstunden fortschreiben (in Schritten von höchstens 1 Stunde) */
  M.advance = function (G, hours) {
    if (!G.mil) return;
    while (hours > 0) {
      const h = Math.min(1, hours);
      step(G, h);
      hours -= h;
    }
  };

  function step(G, h) {
    const mil = G.mil, units = mil.units, home = M.home();
    mil.hours += h;
    const now = mil.hours;
    // 0) Versorgung: eigenes Gebiet in Reichweite?
    mil.supAcc = (mil.supAcc || 0) + h;
    if (mil.supAcc >= 2) { mil.supAcc = 0; for (const u of units) u.sup = supplied(G, u); }
    // 1) Kontakt: Ziele wählen
    for (const u of units) { u.fight = 0; u.under = 0; }
    const hits = [];
    for (const u of units) {
      if (u.ready > now || u.hp <= 0) continue;
      const km = M.kmAt(u.y), T = M.TYPES[u.type];
      const contact = Math.max(1.2, 12 / km), range = T.rangeKm ? Math.max(contact, T.rangeKm / km) : contact;
      let best = null, bd = 1e9;
      for (const v of units) {
        if (v === u || v.ready > now || !hostileUnits(G, u, v)) continue;
        const d = Math.hypot(v.x - u.x, v.y - u.y);
        // angeschlagene Ziele bevorzugen (leichter Abzug auf die Entfernung)
        const score = d * (0.75 + 0.25 * Math.max(0, v.hp) / 100);
        if (d <= range && score < bd) { bd = score; best = v; }
      }
      if (!best) continue;
      u.fight = best.id;
      best.under++;
      hits.push([u, best]);
    }
    // 2) Schaden: Gelände, Eingraben, Erfahrung, Versorgung, Einheitentyp, Flanke – eigene Truppen nach Ausrüstung und Moral
    const homePower = hits.length ? M.power(G) : 1;
    for (const [u, best] of hits) {
      const T = M.TYPES[u.type], tgtT = M.TYPES[best.type];
      const terr = terrainDef(G, best.x, best.y);
      let def = tgtT.def * terr;
      if (M.owner(G, best.x, best.y) === (best.o === -1 ? best.orig : best.o)) def *= 1.1; // Heimvorteil
      if (best.o !== home && best.o > 0 && nearCapital(best)) def *= 1.12;                // verbissene Verteidigung der Hauptstadt
      def *= 1 + 0.35 * (best.dig || 0) * (u.type === 'art' ? 0.4 : 1);                 // Artillerie bricht Stellungen
      def *= xpMul(best);
      if (best.o === home) def *= homePower;
      def = Math.pow(def, 0.8); // Boni wirken, ohne Angriffe aussichtslos zu machen
      let atk = T.atk * xpMul(u) * (u.o === home ? homePower : 1);
      if (u.type === 'tank') atk *= terr >= 1.2 ? 0.75 : best.type === 'tank' ? 1 : 1.25; // Panzer: stark im Offenen
      if (u.type === 'inf' && best.type === 'tank' && terr >= 1.2) atk *= 1.2;          // Hinterhalt im Wald, in Bergen, Städten
      if (u.type === 'art' && (terr >= 1.2 || (best.dig || 0) > 0.5)) atk *= 1.35;       // Artillerie zermürbt Städte und Stellungen
      if (u.sup === false) atk *= 0.75;
      const flank = Math.min(1.45, 1 + 0.15 * (best.under - 1));
      const dmg = atk * Math.pow(Math.max(0, u.hp) / 100, 0.7) * 7.5 * h * (0.7 + rnd() * 0.6) * flank / def;
      best.hp -= dmg;
      u.xp = Math.min(1, (u.xp || 0) + 0.012 * h);
      best.xp = Math.min(1, (best.xp || 0) + 0.006 * h);
      const men = dmg / 100 * tgtT.men;
      if (best.o === home) { mil.lossMen += men; const w = mil.wars[u.o]; if (w) w.ownLoss += men; }
      else { const w = mil.wars[best.o]; if (w) w.enemyLoss += men; }
    }
    // 3) Verluste
    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      if (u.hp > 0) continue;
      units.splice(i, 1);
      fx(G, { k: 'boom', x: u.x, y: u.y, o: u.o, type: u.type });
      for (const v of units) if (v.fight === u.id) v.xp = Math.min(1, (v.xp || 0) + 0.12);
      if (u.o === home) S.log(G, M.TYPES[u.type].name + ' wurde vernichtet.', 'bad');
      else { const w = mil.wars[u.o]; if (w) { w.score += 4; } }
      if (u.o === home) for (const [e, w] of Object.entries(mil.wars)) if (units.some(v => v.o === +e && v.fight === u.id)) w.score -= 4;
    }
    // 4) Bewegung (nicht im Gefecht), Erholung, Eingraben, Rückzug
    const healMul = S.lawv(G, 'care', 'heal', 1);
    for (const u of units) {
      if (u.ready > now) continue;
      const T = M.TYPES[u.type];
      const engaged = u.fight || u.under;
      const o = M.owner(G, u.x, u.y);
      if (!engaged) {
        if (u.sup === false) u.hp = Math.max(20, u.hp - 0.35 * h);                    // ohne Nachschub zehrt die Truppe aus
        else u.hp = Math.min(100, u.hp + (o === u.o ? 1.6 : 0.4) * h * (u.o === home ? healMul : 1));
      }
      // eigene Einheiten ziehen sich bei schweren Verlusten selbst zurück
      if (u.o === home && u.hp < 22 && !u.retreat && mil.autoRetreat !== false) {
        const c = nearestHomeCity(G, u);
        if (c && Math.hypot(c[0] - u.x, c[1] - u.y) > 1.5) {
          u.path = [c]; u.retreat = true;
          S.log(G, M.TYPES[u.type].name + ' zieht sich schwer angeschlagen zurück.', 'warn');
        }
      }
      if ((engaged && !u.retreat) || !u.path || !u.path.length) { u.dig = Math.min(1, (u.dig || 0) + h / 12); continue; }
      const [tx, ty] = u.path[0];
      const speed = (u.convoy && !u.retreat ? Math.min(T.km, u.convoy) : T.km) / 24 / M.kmAt(u.y) * (u.retreat ? 0.8 : 1) * (u.sup === false ? 0.85 : 1);
      const d = Math.hypot(tx - u.x, ty - u.y);
      const stepLen = speed * h;
      let nx, ny;
      if (d <= stepLen) { nx = tx; ny = ty; u.path.shift(); if (!u.path.length) { u.path = null; u.retreat = false; u.convoy = 0; } }
      else { nx = u.x + (tx - u.x) / d * stepLen; ny = u.y + (ty - u.y) / d * stepLen; }
      const no = M.owner(G, nx, ny);
      if (!no) { u.path = null; continue; } // Küste
      if (no !== u.o && !M.atWar(G, u.o, no)) { u.path = null; continue; } // Grenze zu neutralem Land
      u.x = nx; u.y = ny;
      u.dig = 0;
    }
    // 5) Gebietsgewinn – nur Infanterie nimmt Land ein (sobald sie sich bewegt oder regelmäßig im Stand)
    for (const u of units) {
      if (u.ready > now || u.type !== 'inf') continue;
      u.capAcc += h;
      const moved = u.lcx === undefined || Math.hypot(u.x - u.lcx, u.y - u.lcy) >= 0.35;
      if (!moved && u.capAcc < 0.25) continue;
      u.capAcc = 0; u.lcx = u.x; u.lcy = u.y;
      capture(G, u);
    }
    // 5b) eingeschlossene Gebiete fallen an den, der sie umschließt
    mil.pocketAcc = (mil.pocketAcc || 0) + h;
    if (mil.pocketAcc >= 3 && G._occChange !== mil._pocketSeen) { mil.pocketAcc = 0; mil._pocketSeen = G._occChange; closePockets(G); }
    // 6) KI und Oberkommando
    mil.aiAcc += h;
    if (mil.aiAcc >= 1) { mil.aiAcc = 0; ai(G); }
    mil.cmdAcc = (mil.cmdAcc || 0) + h;
    if (mil.cmdAcc >= 2) { mil.cmdAcc = 0; if (mil.command !== false) command(G); }
  }

  /** Kontrollradius einer Infanterie in Feldern (etwa 15 km) */
  M.captureRadius = (u) => S.clamp(15 / M.kmAt(u.y), 1, 6);

  /** Alles feindliche Land im Radius der Einheit einnehmen – außer Feldern, die näher an einem Gegner liegen (Frontlinie) */
  function capture(G, u) {
    const home = M.home(), mil = G.mil, now = mil.hours;
    const mine = u.o === -1 ? u.orig : u.o;
    const R = M.captureRadius(u), Ri = Math.ceil(R);
    const foes = mil.units.filter(v => v.ready <= now && M.atWar(G, u.o, v.o) && Math.abs(v.x - u.x) < R * 2 + 2 && Math.abs(v.y - u.y) < R * 2 + 2);
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    const gained = {};
    // Stadtgebiete fallen nur über ihren Mittelpunkt (cityCapture)
    const cityList = W().citiesNear(cx - Ri - 3, cy - Ri - 3, 2 * Ri + 7, 2 * Ri + 7);
    const inCity = (gx, gy, o) => {
      const [lx, ly] = local(G, gx, gy);
      if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H && G.t.city[ly * G.W + lx] && S.isUrban(G.t.bld[ly * G.W + lx])) return true;
      return cityList.some(n => n.c.ci === o && Math.hypot(gx + 0.5 - n.gx, gy + 0.5 - n.gy) <= n.c.r + 0.5);
    };
    for (let oy = -Ri; oy <= Ri; oy++) for (let ox = -Ri; ox <= Ri; ox++) {
      const gx = cx + ox, gy = cy + oy;
      const d = Math.hypot(gx + 0.5 - u.x, gy + 0.5 - u.y);
      if (d > R) continue;
      const o = M.owner(G, gx, gy);
      if (!o || o === mine || !M.atWar(G, u.o, o)) continue;
      if (foes.some(v => Math.hypot(gx + 0.5 - v.x, gy + 0.5 - v.y) < d)) continue;
      if (inCity(gx, gy, o)) continue;
      M.setOwner(G, gx, gy, mine);
      gained[o] = (gained[o] || 0) + 1;
    }
    for (const o in gained) {
      const war = mil.wars[u.o === home ? o : u.o];
      if (war) war.score += (u.o === home ? 1 : -1) * gained[o] * 0.04;
    }
    cityCapture(G, u);
  }

  /**
   * Kessel schließen: Ein Stück Land eines Kriegsgegners, das vollständig vom anderen Kriegsteilnehmer
   * (und Meer) umschlossen ist, fällt an diesen – sofern dort keine Truppen des Eigentümers stehen
   * und kein Stadtmittelpunkt liegt (Städte fallen nur durch Infanterie).
   */
  function closePockets(G) {
    const home = M.home(), mil = G.mil;
    for (const e of Object.keys(mil.wars).map(Number)) {
      // Bereich: alle Felder, die in diesem Krieg den Besitzer gewechselt haben
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
      for (const k in mil.occ) {
        const v = mil.occ[k];
        if (v !== home && v !== e) continue;
        const p = k.indexOf(','), gx = +k.slice(0, p), gy = +k.slice(p + 1);
        const b = baseOwner(gx, gy);
        if (!((v === home && b === e) || (v === e && b === home))) continue;
        const [lx] = local(G, gx, gy);
        const ux = lx + G.gx0;   // nicht umgebrochene Länge nahe dem eigenen Raster
        x0 = Math.min(x0, ux); x1 = Math.max(x1, ux); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy); n++;
      }
      if (!n) continue;
      const pad = 6;
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (w * h > 160000) continue;
      const own = W().ownerBlock(x0, y0, w, h);
      if (mil.annexed) for (let i = 0; i < own.length; i++) own[i] = M.mapAnnex(G, own[i]);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const gx = x0 + i, gy = y0 + j;
        const [lx, ly] = local(G, gx, gy);
        if (lx >= 0 && ly >= 0 && lx < G.W && ly < G.H) { own[j * w + i] = G.t.owner[ly * G.W + lx]; continue; }
        const v = mil.occ[M.key(gx, gy)];
        if (v !== undefined) own[j * w + i] = v < 0 ? 65535 : v;
      }
      // Truppen verhindern den Kessel, Stadtgebiete bleiben ausgespart
      const block = new Uint8Array(w * h), city = new Uint8Array(w * h);
      const markCity = (gx, gy, r) => {
        for (let j = Math.floor(gy - r) - y0; j <= Math.ceil(gy + r) - y0; j++) for (let i = Math.floor(gx - r) - x0; i <= Math.ceil(gx + r) - x0; i++) {
          if (i >= 0 && j >= 0 && i < w && j < h && Math.hypot(x0 + i + 0.5 - gx, y0 + j + 0.5 - gy) <= r) city[j * w + i] = 1;
        }
      };
      for (const u of mil.units) {
        let [lx] = local(G, u.x, u.y); const i = lx + G.gx0 - x0, j = Math.floor(u.y) - y0;
        if (i >= 0 && j >= 0 && i < w && j < h) block[j * w + i] = 1;
      }
      for (const n of W().citiesNear(x0, y0, w, h)) markCity(n.gx, n.gy, n.c.r + 0.8);
      for (const c of G.cities) markCity(c.x + G.gx0 + 0.5, c.y + G.gy0 + 0.5, Math.sqrt(Math.max(4, c.tiles) / Math.PI) + 1);
      const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
      let gainHome = 0, gainFoe = 0;
      for (const [a, b] of [[e, home], [home, e]]) {
        for (let s0 = 0; s0 < w * h; s0++) {
          if (seen[s0] || own[s0] !== a) continue;
          // Zusammenhängendes Gebiet von a einsammeln
          let qh = 0, qt = 0, open = false, blocked = false;
          q[qt++] = s0; seen[s0] = 1;
          while (qh < qt) {
            const i = q[qh++], x = i % w, y = (i / w) | 0;
            if (block[i]) blocked = true;
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) open = true;
            for (const [ox, oy] of S.N4) {
              const nx = x + ox, ny = y + oy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              const ni = ny * w + nx, o = own[ni];
              if (o === a) { if (!seen[ni]) { seen[ni] = 1; q[qt++] = ni; } }
              else if (o !== b && o !== 0) open = true;   // grenzt an ein drittes Land
            }
          }
          if (open || blocked || qt > 2500) continue;
          let got = 0;
          for (let k = 0; k < qt; k++) {
            const i = q[k];
            if (city[i]) continue;
            M.setOwner(G, x0 + (i % w) + 0.5, y0 + ((i / w) | 0) + 0.5, b);
            got++;
          }
          if (b === home) gainHome += got; else gainFoe += got;
        }
      }
      if (gainHome || gainFoe) {
        const war = mil.wars[e];
        if (war) war.score += (gainHome - gainFoe) * 0.04;
        if (gainHome >= 20) S.log(G, 'Eingeschlossenes Gebiet von ' + M.countryName(e) + ' übernommen (' + gainHome + ' Felder).', 'good');
        if (gainFoe >= 20) S.log(G, M.countryName(e) + ' hat eingeschlossenes Gebiet übernommen (' + gainFoe + ' Felder).', 'bad');
      }
    }
  }
  M.closePockets = closePockets;

  /** Stadt einnehmen: Infanterie hat den Stadtmittelpunkt erreicht */
  function cityCapture(G, u) {
    const home = M.home(), mil = G.mil;
    // fremde Städte
    const near = W().citiesNear(Math.floor(u.x) - 3, Math.floor(u.y) - 3, 6, 6);
    for (const n of near) {
      if (Math.floor(u.x) !== Math.floor(n.gx) || Math.floor(u.y) !== Math.floor(n.gy)) {
        if (Math.hypot(u.x - n.gx, u.y - n.gy) > 0.8) continue;
      }
      // Städte des eigenen Landes laufen über G.cities (unten)
      if (n.c.cid === G.meta.id && G.cities.some(c => Math.hypot(c.x + G.gx0 + 0.5 - n.gx, c.y + G.gy0 + 0.5 - n.gy) < 4)) continue;
      const cur = M.owner(G, n.gx, n.gy);
      const mine = u.o === -1 ? u.orig : u.o;
      if (cur === mine || !cur) continue;
      if (!M.atWar(G, u.o, cur)) continue;
      const R = Math.ceil(n.c.r + 1);
      // Stadt und Umland (soweit dort keine feindlichen Truppen näher stehen)
      const RU = n.c.r + 3.5, Ri = Math.ceil(RU);
      const foes = mil.units.filter(v => v.o === cur && Math.abs(v.x - n.gx) < RU + 4 && Math.abs(v.y - n.gy) < RU + 4);
      for (let oy = -Ri; oy <= Ri; oy++) for (let ox = -Ri; ox <= Ri; ox++) {
        const gx = Math.floor(n.gx) + ox, gy = Math.floor(n.gy) + oy;
        const d = Math.hypot(gx + 0.5 - n.gx, gy + 0.5 - n.gy);
        if (d > RU || M.owner(G, gx, gy) !== cur) continue;
        if (d > n.c.r + 0.8 && foes.some(v => Math.hypot(gx + 0.5 - v.x, gy + 0.5 - v.y) < d)) continue;
        M.setOwner(G, gx, gy, mine);
      }
      const key = n.c.cid + ':' + n.c.name;
      mil.caps[key] = { o: mine, since: G.month, res: 0.3 };
      if (u.o === home) {
        const w = mil.wars[cur]; if (w) w.score += 12;
        G.mods.push({ key: 'happy', val: 2, months: 3 });
        S.log(G, n.c.name + ' wurde erobert!', 'good');
      } else {
        const w = mil.wars[u.o]; if (w) w.score -= 12;
        S.log(G, M.countryName(u.o) + ' hat ' + n.c.name + ' eingenommen.', 'bad');
      }
    }
    // eigene Städte
    for (const c of G.cities) {
      const gx = c.x + G.gx0 + 0.5, gy = c.y + G.gy0 + 0.5;
      // nur wer das Rathaus erreicht, nimmt die Stadt
      if (Math.hypot(u.x - gx, u.y - gy) > 0.8) continue;
      if (u.o === home) {
        // Rückeroberung
        if (G.t.owner[c.y * G.W + c.x] !== home) {
          retakeCity(G, c);
          S.log(G, c.name + ' ist befreit!', 'good');
          G.mods.push({ key: 'happy', val: 5, months: 4 });
        }
        continue;
      }
      if (G.t.owner[c.y * G.W + c.x] !== home) continue;
      // Stadt fällt
      const R = Math.ceil(Math.sqrt(c.tiles + 1) * 0.9) + 2;
      for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
        const x = c.x + ox, y = c.y + oy;
        if (!S.inb(G, x, y)) continue;
        const i = y * G.W + x;
        if (G.t.city[i] === c.id + 1 && G.t.owner[i] === home) M.setOwner(G, x + G.gx0, y + G.gy0, u.o === -1 ? u.orig : u.o);
      }
      const w = mil.wars[u.o]; if (w) w.score -= 15;
      G.mods.push({ key: 'happy', val: -10, months: 6 });
      S.log(G, c.name + ' ist an ' + M.countryName(u.o) + ' gefallen!', 'bad');
      if (c.capital && !G.flags.over && S.gameOver) S.gameOver(G, 'Kapitulation', 'Feindliche Truppen haben ' + c.name + ' eingenommen. Die Regierung hat kapituliert.');
    }
  }

  function retakeCity(G, c) {
    const home = M.home();
    const R = Math.ceil(Math.sqrt(c.tiles + 1) * 0.9) + 2;
    for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
      const x = c.x + ox, y = c.y + oy;
      if (!S.inb(G, x, y)) continue;
      const i = y * G.W + x;
      if (G.t.city[i] === c.id + 1 && G.t.owner[i] !== home) M.setOwner(G, x + G.gx0, y + G.gy0, home);
    }
  }

  // ======================= KI =======================
  function ai(G) {
    const mil = G.mil, home = M.home(), now = mil.hours;
    const mine = mil.units.filter(u => u.o === home && u.ready <= now);
    for (const [eKey, war] of Object.entries(mil.wars)) {
      const e = +eKey;
      const theirs = mil.units.filter(u => u.o === e);
      // Nachschub – schneller und an der Hauptstadt, wenn sie bedroht ist
      const capC = W().cities.find(c => c.ci === e && c.capital && M.owner(G, c.gx, c.gy) === e);
      const capThreat = capC && mine.some(v => Math.hypot(v.x - capC.gx, v.y - capC.gy) < 15);
      if (theirs.length < war.max + (capThreat ? 2 : 0) && now - war.lastSpawn > (capThreat ? 30 : 48)) {
        war.lastSpawn = now;
        const cities = enemyCities(G, e);
        const city = capThreat ? { gx: capC.gx, gy: capC.gy } : cities[Math.floor(rnd() * Math.min(3, cities.length))];
        if (city) M.spawn(G, e, rnd() < 0.25 ? 'tank' : rnd() < 0.15 ? 'art' : 'inf', city.gx + (rnd() - 0.5) * 2, city.gy + (rnd() - 0.5) * 2, { role: rnd() < 0.35 ? 'def' : 'atk' });
      }
      // Kapitulation: Hauptstadt verloren oder kaum noch Städte
      if (checkCapitulation(G, e, war)) continue;
      // Haltung wechseln
      if (now - war.modeAt > 48) {
        war.modeAt = now;
        const nearMine = mine.length;
        war.mode = theirs.length >= nearMine * 0.8 || war.aggressor === 'ai' && rnd() < 0.6 ? 'attack' : 'defend';
      }
      // Friedensangebot, wenn die KI verliert
      if (now - war.peaceAsk > 72 && war.score > 30 && rnd() < 0.35 && !G.pendingEvent) {
        war.peaceAsk = now;
        const pay = Math.round(50 + war.score * 6);
        G.pendingEvent = {
          title: M.countryName(e) + ' bittet um Frieden', auto: 0,
          text: 'Nach schweren Verlusten bietet ' + M.countryName(e) + ' einen Waffenstillstand an und zahlt ' + S.fmtMoney(pay) + ' Reparationen. Eroberte Gebiete bleiben bei dir.',
          choices: [
            { label: 'Frieden schließen (+' + S.fmtMoney(pay) + ')', fx: (G) => { G.eco.money += pay; M.makePeace(G, e); } },
            { label: 'Weiterkämpfen', fx: () => {} }
          ]
        };
      }
      // Einheiten führen
      for (const u of theirs) {
        if (u.ready > now || u.fight) continue;
        if (u.role === 'cap' && capC) {
          // Garnison bleibt in der Hauptstadt und stellt nur nahe Angreifer
          const thr = mine.find(v => Math.hypot(v.x - capC.gx, v.y - capC.gy) < 5);
          if (thr) setPath(G, u, thr.x, thr.y);
          else if (Math.hypot(u.x - capC.gx, u.y - capC.gy) > 1.5) setPath(G, u, capC.gx, capC.gy);
          continue;
        }
        if (u.hp < 30 && !u.retreat) {
          const city = nearestOwnCity(G, u);
          if (city) { u.path = [[city.gx, city.gy]]; u.retreat = true; }
          continue;
        }
        if (u.path && u.path.length && rnd() > 0.15) continue;
        // Bedrohung in der Nähe? (Verteidiger reagieren nur auf nahe Gegner)
        let best = null, bd = u.role === 'def' ? 9 : 18;
        for (const v of mine) {
          const d = Math.hypot(v.x - u.x, v.y - u.y);
          if (d < bd && (M.owner(G, v.x, v.y) === e || d < 8)) { bd = d; best = v; }
        }
        if (best) { setPath(G, u, best.x, best.y); continue; }
        if (u.role === 'def') continue;
        // Mobilmachung: die ersten anderthalb Tage wird nur aufmarschiert
        if (war.mode === 'attack' && now - war.since > 36) {
          const tgt = playerTarget(G, u);
          if (tgt) setPath(G, u, tgt[0], tgt[1]);
        } else if (!u.path) {
          // an die Grenze vorrücken und halten
          if (rnd() < 0.05) { const tgt = playerTarget(G, u); if (tgt) setPath(G, u, u.x + (tgt[0] - u.x) * 0.35, u.y + (tgt[1] - u.y) * 0.35); }
        }
      }
    }
    // Aufständische in besetzten Städten
    for (const u of mil.units.filter(v => v.o === -1)) {
      if (u.fight || u.path) continue;
      let best = null, bd = 12;
      for (const v of mine) { const d = Math.hypot(v.x - u.x, v.y - u.y); if (d < bd) { bd = d; best = v; } }
      if (best) setPath(G, u, best.x, best.y);
    }
  }

  // ======================= Oberkommando =======================
  M.STANCES = { verteidigen: 'Verteidigen', halten: 'Front halten', angreifen: 'Angreifen' };
  M.stanceOf = (war) => war.stance || (war.aggressor === 'player' ? 'angreifen' : 'verteidigen');

  /**
   * Führt eigene Truppen ohne eigenen Befehl nach der Haltung je Krieg:
   * verteidigen – bedrohte Städte besetzen und Eindringlinge stellen;
   * halten – stehen bleiben, eingraben, nur nahe Gegner angreifen;
   * angreifen – an der Grenze sammeln und gemeinsam auf die nächste feindliche Stadt vorrücken.
   * Ein Teil der Truppen bleibt immer zur Verteidigung zurück.
   */
  function command(G) {
    const mil = G.mil, home = M.home(), now = mil.hours;
    const wars = Object.entries(mil.wars);
    const foes = mil.units.filter(u => u.o !== home && u.ready <= now && M.atWar(G, home, u.o));
    if (!wars.length && !foes.length) return;
    const mine = mil.units.filter(u => u.o === home && u.ready <= now);
    const free = mine.filter(u => !(u.manual > now) && !u.retreat && !u.fight && u.hp > 40);
    if (!free.length) return;
    const cities = G.cities.filter(c => G.t.owner[c.y * G.W + c.x] === home).map(c => ({ c, gx: c.x + G.gx0 + 0.5, gy: c.y + G.gy0 + 0.5 }));
    if (!cities.length) return;
    // Bedrohung je Stadt: Nähe feindlicher Truppen
    for (const ct of cities) {
      let d = 1e9;
      for (const f of foes) d = Math.min(d, Math.hypot(f.x - ct.gx, f.y - ct.gy));
      ct.threat = d < 1e8 ? 1 / Math.max(2, d) : 0;
      ct.defenders = mine.filter(u => Math.hypot(u.x - ct.gx, u.y - ct.gy) < 3).length;
    }
    const go = (u, x, y) => { if (!u.path || Math.hypot(u.path[u.path.length - 1][0] - x, u.path[u.path.length - 1][1] - y) > 1.5) { const chk = M.checkPath(G, u, x, y); if (chk.ok && !chk.crossed.length) { u.path = [[x, y]]; u.convoy = 0; } } };
    // Reserve: etwa ein Fünftel bleibt in den bedrohtesten Städten
    const reserveN = Math.ceil(free.length * 0.2);
    const byThreat = cities.slice().sort((a, b) => b.threat - a.threat || (b.c.capital - a.c.capital));
    free.sort((a, b) => a.id - b.id);
    free.forEach((u, i) => { u.cmdRole = i < reserveN ? 'reserve' : 'field'; });
    // Kampfgruppen je Krieg (nächster Gegner)
    const stage = {};
    for (const u of free) {
      // 1) Gegner in der Nähe stellen (auf eigenem Boden oder dicht dran)
      let near = null, nd = 1e9;
      for (const f of foes) {
        const d = Math.hypot(f.x - u.x, f.y - u.y);
        if (d < nd && (d < 6 || (d < 12 && M.owner(G, f.x, f.y) === home))) { nd = d; near = f; }
      }
      if (near) { go(u, near.x, near.y); continue; }
      if (u.cmdRole === 'reserve' || !wars.length) {
        // Reserve: in die bedrohteste Stadt mit den wenigsten Verteidigern
        const ct = byThreat.slice(0, 3).sort((a, b) => a.defenders - b.defenders)[0] || byThreat[0];
        if (Math.hypot(u.x - ct.gx, u.y - ct.gy) > 2.5) { go(u, ct.gx + Math.cos(u.id) * 0.8, ct.gy + Math.sin(u.id) * 0.8); ct.defenders++; }
        continue;
      }
      // nächster Kriegsgegner und seine Haltung
      let best = null, bd = 1e9;
      for (const [eKey, war] of wars) {
        for (const c of enemyCities(G, +eKey)) { const d = Math.hypot(c.gx - u.x, c.gy - u.y); if (d < bd) { bd = d; best = { e: +eKey, war, c }; } }
      }
      if (!best) continue;
      const stance = M.stanceOf(best.war);
      if (stance === 'halten') continue;          // eingraben, wo sie stehen
      if (stance === 'verteidigen') {
        const ct = byThreat.slice(0, 4).sort((a, b) => a.defenders - b.defenders)[0];
        if (ct && Math.hypot(u.x - ct.gx, u.y - ct.gy) > 2.5) { go(u, ct.gx + Math.cos(u.id * 1.7) * 1.2, ct.gy + Math.sin(u.id * 1.7) * 1.2); ct.defenders++; }
        continue;
      }
      // angreifen: Sammelpunkt ist die eigene Stadt, die dem Ziel am nächsten liegt
      const key = best.e + ':' + best.c.c.name;
      let st = stage[key];
      if (!st) {
        let sc = null, sd = 1e9;
        for (const ct of cities) { const d = Math.hypot(ct.gx - best.c.gx, ct.gy - best.c.gy); if (d < sd) { sd = d; sc = ct; } }
        st = stage[key] = { x: sc.gx, y: sc.gy, tgt: best.c, units: [] };
      }
      st.units.push(u);
    }
    // Sammeln, dann gemeinsam los; wer schon am Ziel ist, stürmt weiter
    for (const st of Object.values(stage)) {
      const tx = st.tgt.gx, ty = st.tgt.gy;
      const atTarget = st.units.filter(u => Math.hypot(u.x - tx, u.y - ty) < 7);
      for (const u of atTarget) {
        // Infantrie ins Zentrum (nur sie nimmt die Stadt), die anderen dicht daneben
        const ox = u.type === 'inf' ? 0 : Math.cos(u.id) * 1.2, oy = u.type === 'inf' ? 0 : Math.sin(u.id) * 1.2;
        if (!u.path || Math.hypot(u.path[u.path.length - 1][0] - tx - ox, u.path[u.path.length - 1][1] - ty - oy) > 0.3) { u.path = [[tx + ox, ty + oy]]; u.convoy = 0; }
      }
      const rest = st.units.filter(u => !atTarget.includes(u));
      const marching = rest.filter(u => u.path && Math.hypot(u.path[u.path.length - 1][0] - tx, u.path[u.path.length - 1][1] - ty) < 3);
      const waiting = rest.filter(u => !marching.includes(u));
      if (!waiting.length) continue;
      // gemeinsam losschlagen: wenn der Großteil bereitsteht oder lange genug gewartet wurde
      const since = G.mil.stageSince = G.mil.stageSince || {};
      const key = st.tgt.c.name;
      if (since[key] === undefined) since[key] = now;
      const ready = waiting.filter(u => Math.hypot(u.x - st.x, u.y - st.y) < 4);
      const need = Math.max(Math.min(3, waiting.length), Math.ceil(waiting.length * 0.7));
      if (ready.length >= need || now - since[key] > 72 || (marching.length + atTarget.length && ready.length)) {
        delete since[key];
        if (ready.length) M.order(G, ready.map(u => u.id), tx, ty, true);
        for (const u of waiting) if (!ready.includes(u)) go(u, st.x, st.y);
      } else {
        for (const u of waiting) if (Math.hypot(u.x - st.x, u.y - st.y) >= 2) go(u, st.x + Math.cos(u.id) * 1.2, st.y + Math.sin(u.id) * 1.2);
      }
    }
  }
  M.command = command;

  /** Lage eines Gegners: Städte gesamt, gehalten, Hauptstadt */
  M.enemyState = function (G, e) {
    const all = W().cities.filter(c => c.ci === e);
    const held = all.filter(c => M.owner(G, c.gx, c.gy) === e);
    const cap = all.find(c => c.capital);
    return { all: all.length, held: held.length, capital: cap ? cap.name : null, capitalLost: !!cap && M.owner(G, cap.gx, cap.gy) !== e };
  };

  /** Bietet der Gegner die Kapitulation an? */
  function checkCapitulation(G, e, war) {
    if (G.pendingEvent || G.mil.hours - (war.capAsk || -999) < 48) return false;
    const st = M.enemyState(G, e);
    const broken = !st.held || (st.capitalLost && war.score > 10) || (st.all >= 3 && st.held <= st.all * 0.3 && war.score > 20);
    if (!broken) return false;
    war.capAsk = G.mil.hours;
    offerCapitulation(G, e, st);
    return true;
  }

  function offerCapitulation(G, e, st) {
    const name = M.countryName(e), war = G.mil.wars[e];
    const pay = Math.round(120 + Math.max(0, war.score) * 8);
    G.pendingEvent = {
      title: name + ' kapituliert', auto: 1,
      text: (st.capitalLost ? 'Die Hauptstadt ' + st.capital + ' ist gefallen. ' : '') + name + ' hält nur noch ' + st.held + ' von ' + st.all + ' Städten und bietet die Kapitulation an. Du kannst das ganze Land annektieren – es wird Teil deines Staatsgebiets, verlangt aber Besatzung gegen Widerstand und verlängert die Sanktionen – oder Frieden schließen, die eroberten Gebiete behalten und Reparationen kassieren.',
      choices: [
        { label: 'Ganzes Land annektieren', fx: (G) => M.annex(G, e) },
        { label: 'Frieden, Gebiete behalten (+' + S.fmtMoney(pay) + ')', fx: (G) => { G.eco.money += pay; M.makePeace(G, e, name + ' hat kapituliert. Die eroberten Gebiete bleiben bei dir, dazu ' + S.fmtMoney(pay) + ' Reparationen.'); } },
        { label: 'Weiterkämpfen', fx: () => {} }
      ]
    };
  }

  /** Spieler fordert die Kapitulation */
  M.demandCapitulation = function (G, e) {
    const war = G.mil.wars[e];
    if (!war) return false;
    const st = M.enemyState(G, e);
    const ok = !st.held || st.capitalLost || (st.held <= st.all * 0.5 && war.score > 15) || war.score > 45;
    if (!ok) { S.log(G, M.countryName(e) + ' denkt nicht an Kapitulation: Es hält noch ' + st.held + ' von ' + st.all + ' Städten.', 'warn'); return false; }
    war.capAsk = G.mil.hours;
    offerCapitulation(G, e, st);
    return true;
  };

  /** Ein Land vollständig eingliedern */
  M.annex = function (G, e) {
    const mil = G.mil, home = M.home(), name = M.countryName(e);
    mil.annexed = mil.annexed || {};
    mil.annexed[e] = G.month;
    // Kriegszustand beenden, feindliche Truppen lösen sich auf
    delete mil.wars[e];
    mil.truce[e] = 1e9;
    mil.units = mil.units.filter(u => u.o !== e);
    // eigenes Raster: das ganze Land gehört jetzt dir
    for (let i = 0; i < G.W * G.H; i++) {
      if (G.t.owner[i] === e) { G.t.owner[i] = home; G.t.region[i] = 1; }
    }
    // Besetzungen aufräumen: Gewinne des Annektierten gehen mit über, was dem Grundbesitz entspricht, entfällt
    for (const k in mil.occ) {
      const p = k.indexOf(','), def = M.defOwner(G, +k.slice(0, p), +k.slice(p + 1));
      if (mil.occ[k] === e) { if (def === home) delete mil.occ[k]; else mil.occ[k] = home; }
      else if (mil.occ[k] === def) delete mil.occ[k];
    }
    // Städte unter Besatzung: Abgaben, aber Widerstand
    for (const c of W().cities.filter(c => c.ci === e)) {
      const key = c.cid + ':' + c.name;
      if (!mil.caps[key]) mil.caps[key] = { o: home, since: G.month, res: 0.4 };
    }
    G._neigh = null; G._netDirty = true;
    G._occChange = (G._occChange || 0) + 1;
    G.mods.push({ key: 'sanction', val: 1, months: 24 }, { key: 'happy', val: 5, months: 4 });
    S.log(G, name + ' wurde annektiert und ist jetzt Teil deines Staatsgebiets.', 'good');
    if (S.onAnnex) S.onAnnex(e);
  };

  function setPath(G, u, tx, ty) {
    const chk = M.checkPath(G, u, tx, ty);
    if (chk.ok && !chk.crossed.length) u.path = [[tx, ty]];
  }

  function nearestOwnCity(G, u) {
    const list = enemyCities(G, u.o);
    let best = null, bd = 1e9;
    for (const c of list) { const d = Math.hypot(c.gx - u.x, c.gy - u.y); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  /** nächste Stadt oder Grenzfläche des Spielers als Angriffsziel */
  function playerTarget(G, u) {
    const home = M.home();
    let best = null, bd = 1e9;
    for (const c of G.cities) {
      if (G.t.owner[c.y * G.W + c.x] !== home) continue;
      const gx = c.x + G.gx0 + 0.5, gy = c.y + G.gy0 + 0.5;
      const d = Math.hypot(gx - u.x, gy - u.y) * (c.capital ? 0.8 : 1);
      if (d < bd) { bd = d; best = [gx, gy]; }
    }
    return best;
  }

  // ======================= Monatliche Folgen =======================
  M.upkeep = (G) => G.mil ? G.mil.units.filter(u => u.o === M.home()).reduce((s, u) => s + M.TYPES[u.type].upkeep, 0) * S.lawv(G, 'milbudget', 'upkeep', 1) * S.lawv(G, 'care', 'upkeep', 1) : 0;

  /** Abgaben besetzter fremder Städte (abzüglich Widerstand) */
  M.tribute = function (G) {
    if (!G.mil) return 0;
    let sum = 0;
    for (const [k, cap] of Object.entries(G.mil.caps)) {
      if (cap.o !== M.home()) continue;
      const name = k.slice(k.indexOf(':') + 1), cid = k.slice(0, k.indexOf(':'));
      const c = W().cities.find(x => x.cid === cid && x.name === name);
      if (!c) continue;
      if (M.owner(G, c.gx, c.gy) !== M.home()) { delete G.mil.caps[k]; continue; }
      sum += Math.min(60, c.pop / 1e5 * 0.7) * (1 - cap.res);
    }
    return sum;
  };

  /** Kriegsmüdigkeit für die Zufriedenheit */
  M.weariness = function (G) {
    if (!G.mil) return 0;
    let w = 0;
    for (const war of Object.values(G.mil.wars)) {
      const months = (G.mil.hours - war.since) / H_MONTH;
      w += Math.min(18, 2 + months * 0.8 + war.ownLoss / 25000);
    }
    const occ = Object.values(G.mil.caps).filter(c => c.o === M.home()).length;
    w += Math.min(6, occ * 0.8);
    return w * (G.meta.gov === 'demokratie' ? 1.3 : 1) * S.lawv(G, 'propaganda', 'weary', 1);
  };

  M.monthly = function (G) {
    const mil = G.mil, home = M.home();
    if (!mil) return;
    // Gefallene und Eingezogene fehlen der Bevölkerung
    if (mil.lossMen > 0) {
      const tot = G.cities.reduce((s, c) => s + c.pop, 0) || 1;
      const lossGame = mil.lossMen / (G.popScale || 1);
      for (const c of G.cities) c.pop = Math.max(50, c.pop - lossGame * c.pop / tot);
      mil.lossMen = 0;
    }
    // Widerstand in besetzten Städten
    for (const [k, cap] of Object.entries(mil.caps)) {
      if (cap.o !== home) continue;
      const name = k.slice(k.indexOf(':') + 1), cid = k.slice(0, k.indexOf(':'));
      const c = W().cities.find(x => x.cid === cid && x.name === name);
      if (!c) continue;
      const garrison = mil.units.some(u => u.o === home && Math.hypot(u.x - c.gx, u.y - c.gy) < 3);
      cap.res = S.clamp(cap.res + (garrison ? -0.08 : 0.06), 0, 0.9);
      if (!garrison && rnd() < cap.res * 0.35) {
        M.spawn(G, -1, 'inf', c.gx + (rnd() - 0.5), c.gy + (rnd() - 0.5), { orig: c.ci, hp: 60 });
        S.log(G, 'Aufstand in ' + c.name + '! Partisanen greifen zu den Waffen.', 'bad');
      }
    }
    // Gegner erklärt den Krieg?
    if (G.month > 6 && !G.flags.over && G.month - mil.lastAiWar > 8 && !G.pendingEvent) {
      const neigh = M.neighbours(G).filter(e => !mil.wars[e] && !(mil.truce[e] > G.month));
      const myStr = mil.units.filter(u => u.o === home).length;
      for (const e of neigh) {
        const c = S.WORLD[e - 1];
        const theirStr = M.potential(e);
        let p = 0.006 + Math.max(0, 1 - myStr / theirStr) * 0.03;
        if (G.month - mil.aggr < 24) p += 0.025;
        if (rnd() < p) {
          mil.lastAiWar = G.month;
          M.declareWar(G, e, 'ai');
          G.pendingEvent = {
            title: 'Krieg!', auto: 0,
            text: c.n + ' hat dir den Krieg erklärt. Feindliche Armeen sammeln sich an der Grenze. Ziehe deine Truppen zusammen und verteidige deine Städte.',
            choices: [{ label: 'Zu den Waffen', fx: () => {} }]
          };
          break;
        }
      }
    }
  };

  /** Nachbarländer: Länder im eigenen Raster */
  M.neighbours = function (G) {
    if (G._neigh) return G._neigh;
    // nur Länder mit gemeinsamer Landgrenze (Truppen können nicht übers Meer)
    const set = new Set(), h = M.home(), Wd = G.W;
    for (let i = 0; i < G.W * G.H; i++) {
      if (G.t.owner[i] !== h) continue;
      const x = i % Wd, y = (i / Wd) | 0;
      for (const [ox, oy] of S.N4) {
        if (!S.inb(G, x + ox, y + oy)) continue;
        const o = G.t.owner[i + ox + oy * Wd];
        if (o && o !== h) set.add(o);
      }
    }
    G._neigh = [...set];
    return G._neigh;
  };

  /** Armeegröße, die ein Land gegen dich ins Feld führt (wie die eigene Startarmee, etwas kleiner) */
  M.potential = function (e) {
    const c = S.WORLD[e - 1];
    const inf = S.clamp(Math.round(2 + Math.log10(Math.max(1, c.pop / 1e6)) * 2.5), 2, 9);
    return S.clamp(Math.round((inf + inf / 3 + inf / 4) * 0.75 + (c.inc <= 2 ? 1 : 0)), 2, 14);
  };

  M.armyStats = function (G) {
    const mine = G.mil ? G.mil.units.filter(u => u.o === M.home()) : [];
    const men = mine.reduce((s, u) => s + M.TYPES[u.type].men * u.hp / 100, 0);
    return { count: mine.length, men };
  };
})(S);
