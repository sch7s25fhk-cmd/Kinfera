// Test: Stadt an echten Koordinaten gründen und zwei Jahre wachsen lassen. node tools/citytest.js [Breite,Länge]
const fs = require('fs'), vm = require('vm');
const root = require('path').join(__dirname, '..', 'js') + '/';
const ctx = { console, Math, Intl, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/world.js', 'util.js', 'defs.js', 'generate.js', 'world.js', 'sim.js', 'military.js']) vm.runInContext(fs.readFileSync(root + f, 'utf8'), ctx, { filename: f });
const S = ctx.S; S.WORLD = ctx.WORLD_DATA;
const [lat, lon] = (process.argv[2] || '48.137,11.575').split(',').map(Number);
let t0 = Date.now();
console.log('Land an', lat, lon, S.landAt(lon, lat), (Date.now() - t0) + ' ms');
t0 = Date.now();
const G = S.generateCity({ lat, lon, name: 'Neustadt', style: 'historisch' });
console.log('erzeugt in', Date.now() - t0, 'ms; Raster', G.W, 'x', G.H, 'Land', G.homeCount, 'WT', G.world.WT, 'km/Feld', S.World.kmPerTile(lat).toFixed(3));
S.calibrate(G); G.continuous = true;
const c = G.cities[0];
const ll = [S.lonOf(G, c.x), S.latOf(G, c.y)];
const off = Math.hypot((ll[0] - lon) * Math.cos(lat * Math.PI / 180), ll[1] - lat) * 111;
console.log('Stadt', c.name, 'bei', ll[1].toFixed(4), ll[0].toFixed(4), 'Abweichung km', off.toFixed(2));
const pop0 = c.pop;
console.log('Start: Einwohner', Math.round(c.pop * G.popScale), 'Felder', c.tiles, 'Gebäude', G.blds.map(b => b.b).join(','), 'Kasse', Math.round(G.eco.money), 'netto', G.eco.last.net.toFixed(1));
for (let m = 1; m <= 24; m++) {
  for (let d = 0; d < 30; d++) S.growCities(G, 1 / 30);
  G.eco.money += G.eco.last.net;
  S.tick(G);
  if (G.pendingEvent) { G.pendingEvent.choices[G.pendingEvent.auto || 0].fx(G); G.pendingEvent = null; }
  if (m % 6 === 0) console.log('Monat', m, 'Einwohner', Math.round(c.pop), 'Felder', c.tiles, 'Kasse', Math.round(G.eco.money), 'netto', G.eco.last.net.toFixed(1), 'Zufr.', Math.round(G.eco.approval), 'Strom', Math.round(G.eco.last.eProd) + '/' + Math.round(G.eco.last.eDem));
}
const fail = (m) => { console.log('FEHLER:', m); process.exitCode = 1; };
if (off > 1) fail('Stadt liegt ' + off.toFixed(2) + ' km neben den Koordinaten');
if (c.pop < pop0 * 1.5) fail('Stadt wächst nicht: ' + Math.round(pop0) + ' -> ' + Math.round(c.pop));
if (S.World.cities.length) fail('fremde Städte vorhanden');
let threw = false;
try { S.generateCity({ lat: 40, lon: -40, name: 'Atlantis', style: 'modern' }); } catch (e) { threw = true; }
if (!threw) fail('Stadt mitten im Atlantik gegründet');
if (!process.exitCode) console.log('OK');
