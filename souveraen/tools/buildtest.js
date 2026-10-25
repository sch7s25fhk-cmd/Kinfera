// Test: alle Gebäude der Erweiterung bauen und ihre Wirkung prüfen. node tools/buildtest.js [Breite,Länge]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Intl, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/world.js', 'util.js', 'defs.js', 'generate.js', 'world.js', 'sim.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const S = ctx.S; S.WORLD = ctx.WORLD_DATA;
const [lat, lon] = (process.argv[2] || '48.137,11.575').split(',').map(Number);
const G = S.generateCity({ lat, lon, name: 'Prüfstadt', style: 'historisch' });
S.calibrate(G); G.continuous = true; G.eco.money = 1e5;
const c = G.cities[0];
const fail = (m) => { console.log('FEHLER:', m); process.exitCode = 1; };
const NEW = [25, 26, 27, 35, 36, 37, 38, 39, 40, 41, 42, 43, 46, 47, 48, 49];
// Bahnstrecke für den Bahnhof: ein Stück neben dem Zentrum
const railIds = [];
for (let dx = 4; dx <= 10; dx++) { const x = c.x + dx, y = c.y + 6; if (S.inb(G, x, y) && !G.t.bld[S.idx(G, x, y)] && G.t.elev[S.idx(G, x, y)] >= 0) railIds.push(S.idx(G, x, y)); }
S.buildRoad(G, railIds, 'rail');
const before = { happy: c.happy, tour: 0 };
S.tick(G); const h0 = Object.assign({}, c.hc), tour0 = c.tourism, edu0 = c.edu, e0 = G.eco.last.eProd;
const placed = {};
for (const bid of NEW) {
  let done = false;
  for (let r = 2; r < 40 && !done; r++) for (let k = 0; k < 8 * r && !done; k++) {
    const a = k / (8 * r) * Math.PI * 2, x = Math.round(c.x + Math.cos(a) * r), y = Math.round(c.y + Math.sin(a) * r);
    if (!S.inb(G, x, y) || !S.canPlace(G, bid, x, y).ok) continue;
    S.placeBuilding(G, bid, x, y); S.connectBuildingRoad(G, x, y); placed[bid] = [x, y, r]; done = true;
  }
  if (!done) console.log('nicht platzierbar hier:', S.BLD[bid].name, '(' + (bid === 26 ? 'braucht Hügel' : bid === 46 ? 'braucht Wasser' : '?') + ')');
}
for (let m = 0; m < 3; m++) S.tick(G);
const L = G.eco.last;
console.log('gebaut:', Object.keys(placed).map(b => S.BLD[b].name).join(', '));
console.log('Strom vorher/nachher', Math.round(e0), '/', Math.round(L.eProd), '| Tourismus', tour0.toFixed(1), '->', c.tourism.toFixed(1), '| Bildung', edu0.toFixed(2), '->', c.edu.toFixed(2));
console.log('Dienste der Stadt', JSON.stringify(c.svc));
for (const k of ['Sicherheit', 'Freizeit', 'Verkehrsanbindung', 'Luftverschmutzung']) console.log(' ', k, (h0[k] || 0).toFixed(1), '->', c.hc[k].toFixed(1));
for (const bid of NEW) {
  if (!placed[bid]) continue;
  const o = S.buildingOutput(G, { x: placed[bid][0], y: placed[bid][1], b: bid });
  const out = Object.entries(o).filter(([, v]) => v).map(([k, v]) => k + '=' + (+v).toFixed(1)).join(' ');
  if (out) console.log('  ', S.BLD[bid].name, out);
}
if (!(L.eProd > e0 + 150)) fail('neue Kraftwerke liefern keinen Strom');
if (!(c.tourism > tour0)) fail('Museum/Hotel bringen keinen Tourismus');
if (!(c.edu > edu0)) fail('Schule hebt die Bildung nicht');
if (!(c.hc.Freizeit > 0)) fail('kein Freizeitwert');
if (!(c.hc.Sicherheit > (h0.Sicherheit || 0))) fail('Polizei/Feuerwehr wirken nicht');
if (!process.exitCode) console.log('OK');
