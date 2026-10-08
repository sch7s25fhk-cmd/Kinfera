// Test: erobertes Land wird ins Raster übernommen und ist bebaubar. node tools/growtest.js [ISO] [Feind-ISO] [Tage]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Intl, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/world.js', 'util.js', 'defs.js', 'generate.js', 'world.js', 'sim.js', 'military.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const S = ctx.S; S.WORLD = ctx.WORLD_DATA;
const [iso = 'DEU', foe = 'FRA', days = '25'] = process.argv.slice(2);
const G = S.generateCountry(S.WORLD.find(c => c.id === iso), {});
S.Mil.init(G); S.calibrate(G); G.continuous = true;
const home = S.World.homeIdx, e = S.World.countryIndex[foe];
S.Mil.declareWar(G, e, 'player');
const tgt = S.World.cities.filter(c => c.cid === foe).map(c => {
  const cap = G.cities.find(x => x.capital); return { c, d: Math.hypot(c.gx - (cap.x + G.gx0), c.gy - (cap.y + G.gy0)) };
}).sort((a, b) => a.d - b.d)[0].c;
for (const u of G.mil.units.filter(u => u.o === home)) if (S.Mil.checkPath(G, u, tgt.gx, tgt.gy).ok) u.path = [[tgt.gx, tgt.gy]];
for (let d = 0; d < +days; d++) {
  S.Mil.advance(G, 24);
  if (G.pendingEvent) { G.pendingEvent.choices[G.pendingEvent.auto || 0].fx(G); G.pendingEvent = null; }
}
const fail = (m) => { console.log('FEHLER:', m); process.exitCode = 1; };
const outside = () => Object.keys(G.mil.occ).filter(k => {
  if (G.mil.occ[k] !== home) return false;
  const [gx, gy] = k.split(',').map(Number); const [lx, ly] = S.Mil.local(G, gx, gy);
  return lx < 0 || ly < 0 || lx >= G.W || ly >= G.H;
}).length;
const conquered = Object.keys(G.mil.occ).filter(k => G.mil.occ[k] === home).length;
console.log('Erobert', conquered, 'Felder, davon außerhalb des Rasters', outside(), 'Raster', G.W + 'x' + G.H, 'Wachstum angefordert', !!G._growReq);
if (!outside()) {
  // Gebietsgewinn außerhalb erzwingen: ein Streifen jenseits des westlichen Rasterrands
  let n = 0;
  for (let gy = G.gy0 + Math.floor(G.H * 0.55); gy < G.gy0 + Math.floor(G.H * 0.55) + 24; gy++)
    for (let gx = G.gx0 - 30; gx < G.gx0; gx++) if (S.Mil.owner(G, gx, gy) === e) { S.Mil.setOwner(G, gx, gy, home); n++; }
  console.log('Erzwungen', n, 'Felder außerhalb; Wachstum angefordert', !!G._growReq);
}
const halls = G.cities.map(c => G.t.bld[c.y * G.W + c.x]);
const bl0 = G.blds.map(b => G.t.bld[b.y * G.W + b.x]);
const money = G.eco.money;
const r = S.Mil.ensureGrid(G);
console.log('Verschiebung', r, 'Raster jetzt', G.W + 'x' + G.H, '=', G.W * G.H, 'Felder; außerhalb', outside());
if (G.cities.some((c, i) => G.t.bld[c.y * G.W + c.x] !== halls[i])) fail('Rathäuser verrutscht');
if (G.blds.some((b, i) => G.t.bld[b.y * G.W + b.x] !== bl0[i])) fail('Gebäude verrutscht');
// alle eroberten Felder im Raster müssen eigenes Land sein
let bad = 0, inside = 0;
for (const k in G.mil.occ) {
  const [gx, gy] = k.split(',').map(Number); const [lx, ly] = S.Mil.local(G, gx, gy);
  if (lx < 0 || ly < 0 || lx >= G.W || ly >= G.H) continue;
  inside++;
  const i = ly * G.W + lx;
  if (G.t.owner[i] !== G.mil.occ[k] || (G.mil.occ[k] === home) !== (G.t.region[i] === 1)) bad++;
}
console.log('Besetzte Felder im Raster', inside, 'davon falsch', bad);
if (bad) fail('Besitz nicht übernommen');
// Stadt auf erobertem Land gründen
let spot = null; const r0x = r ? r[0] : G.W;
for (const k in G.mil.occ) {
  if (G.mil.occ[k] !== home) continue;
  const [gx, gy] = k.split(',').map(Number); const [lx, ly] = S.Mil.local(G, gx, gy);
  if (S.inb(G, lx, ly) && lx < r0x && S.canFoundCity(G, lx, ly).ok) { spot = [lx, ly]; break; }
}
if (!spot) fail('kein Bauplatz auf erobertem Land'); else {
  const c = S.foundCity(G, spot[0], spot[1], 'Neustadt', 'modern', 'raster', false);
  G.eco.money = money;
  for (let m = 0; m < 6; m++) S.tick(G);
  console.log('Neustadt auf', S.World.countryIndex && S.WORLD[S.Mil.baseOwner(spot[0] + G.gx0, spot[1] + G.gy0) - 1].id, '-Boden: Felder', c.tiles, 'Einwohner', Math.round(c.pop));
  // Vergleich: Neugründung im Kernland
  let ref = null;
  for (let i = 0; i < G.W * G.H && !ref; i += 37) { const x = i % G.W, y = (i / G.W) | 0; if (S.Mil.baseOwner(x + G.gx0, y + G.gy0) === home && S.canFoundCity(G, x, y).ok) ref = [x, y]; }
  const c2 = S.foundCity(G, ref[0], ref[1], 'Kernstadt', 'modern', 'raster', false);
  for (let m = 0; m < 6; m++) S.tick(G);
  console.log('Neustadt nach 12 Monaten', c.tiles, 'Felder,', Math.round(c.pop), 'Einw.; Kernstadt nach 6 Monaten', c2.tiles, 'Felder,', Math.round(c2.pop), 'Einw.');
  if (G.t.bld[c.y * G.W + c.x] !== S.U.HALL || c.pop <= 120) fail('Neustadt lebt nicht');
}
// Strasbourg selbst: zu nah
const near = S.Mil.local(G, tgt.gx, tgt.gy);
console.log('Gründung neben', tgt.name + ':', S.inb(G, near[0], near[1]) ? S.canFoundCity(G, near[0] + 2, near[1]).reason : 'außerhalb');
console.log(process.exitCode ? 'NICHT OK' : 'OK');
