// Kriegstest ohne Browser: node tools/wartest.js [ISO] [Feind-ISO] [Tage]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Intl, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/world.js', 'util.js', 'defs.js', 'generate.js', 'world.js', 'sim.js', 'military.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const S = ctx.S; S.WORLD = ctx.WORLD_DATA;
const [iso = 'DEU', foe = 'FRA', days = '20'] = process.argv.slice(2);
const G = S.generateCountry(S.WORLD.find(c => c.id === iso), {});
S.Mil.init(G); S.calibrate(G); G.continuous = true;
S.onLog = (t, k) => console.log('   [' + k + '] ' + t);
const e = S.World.countryIndex[foe];
console.log(G.meta.name, 'Einheiten', G.mil.units.length, 'Nachbarn', S.Mil.neighbours(G).map(i => S.WORLD[i - 1].id).join(','));
S.Mil.declareWar(G, e, 'player');
// alle eigenen Einheiten auf die nächste feindliche Stadt
const tgt = S.World.cities.filter(c => c.cid === foe).map(c => {
  const cap = G.cities.find(x => x.capital); const d = Math.hypot(c.gx - (cap.x + G.gx0), c.gy - (cap.y + G.gy0)); return { c, d };
}).sort((a, b) => a.d - b.d)[0].c;
console.log('Ziel', tgt.name, 'Feindeinheiten', G.mil.units.filter(u => u.o === e).length);
const mine = G.mil.units.filter(u => u.o === S.World.homeIdx);
for (const u of mine) { const chk = S.Mil.checkPath(G, u, tgt.gx, tgt.gy); if (chk.ok) u.path = [[tgt.gx, tgt.gy]]; else console.log('   kein Weg für', u.id, chk.reason, chk.crossed); }
const t0 = Date.now();
for (let d = 0; d < +days; d++) {
  S.Mil.advance(G, 24);
  if (d % 30 === 29) S.tick(G);
  const w = G.mil.wars[e];
  if (d % 4 === 0 || d === +days - 1) console.log('Tag', d + 1, 'eigene', G.mil.units.filter(u => u.o === S.World.homeIdx).length, 'feind', G.mil.units.filter(u => u.o === e).length, 'Score', w ? w.score.toFixed(1) : 'Frieden', 'besetzte Felder', Object.keys(G.mil.occ).length, 'Städte', Object.keys(G.mil.caps).length);
  if (G.pendingEvent) { console.log('   EVENT', G.pendingEvent.title); G.pendingEvent.choices[G.pendingEvent.auto || 0].fx(G); G.pendingEvent = null; }
}
console.log('Laufzeit', Date.now() - t0, 'ms');
S.tick(G);
console.log('Militär-Unterhalt', G.eco.last.military.toFixed(1), 'Abgaben', G.eco.last.tribute.toFixed(1), 'Kriegsmüdigkeit', S.Mil.weariness(G).toFixed(1), 'Zustimmung', G.eco.approval.toFixed(0), 'Netto', G.eco.last.net.toFixed(1));
console.log('Besetzte Städte', JSON.stringify(G.mil.caps), 'Einheiten:', G.mil.units.map(u => u.o + ':' + u.type + ':' + Math.round(u.hp)).join(' '));
