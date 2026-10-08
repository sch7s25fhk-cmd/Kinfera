// Annexion ohne Browser: node tools/annextest.js [ISO] [Feind-ISO] [Tage]
const fs = require('fs'), vm = require('vm');
const root = require('path').join(__dirname, '..', 'js') + '/';
const ctx = { console, Math, Intl, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/world.js', 'util.js', 'defs.js', 'generate.js', 'world.js', 'sim.js', 'military.js']) vm.runInContext(fs.readFileSync(root + f, 'utf8'), ctx, { filename: f });
const S = ctx.S; S.WORLD = ctx.WORLD_DATA;
const [iso = 'DEU', foe = 'LUX', days = '15'] = process.argv.slice(2);
const G = S.generateCountry(S.WORLD.find(c => c.id === iso), {});
S.Mil.init(G); S.calibrate(G); G.continuous = true;
S.onLog = (t, k) => { if (k !== 'info') console.log('   [' + k + '] ' + t); };
const W = S.World, home = W.homeIdx, e = W.countryIndex[foe];
S.Mil.declareWar(G, e, 'player');
const cap = W.cities.filter(c => c.ci === e).sort((a, b) => b.capital - a.capital)[0];
console.log('Ziel', cap.name, 'Städte', S.Mil.enemyState(G, e));
// alle eigenen Einheiten erst sammeln: direkt nahe der Grenze aufstellen
const mine = G.mil.units.filter(u => u.o === home);
for (const u of mine) { u.path = [[cap.gx + (Math.random() - .5), cap.gy + (Math.random() - .5)]]; }
let annexed = false;
for (let d = 0; d < +days && !annexed; d++) {
  for (let hh = 0; hh < 24; hh++) {
    S.Mil.advance(G, 1);
    if (G.pendingEvent) {
      const ev = G.pendingEvent; console.log('   EVENT', ev.title, '|', ev.choices.map(c => c.label).join(' / '));
      const i = ev.title.includes('kapituliert') ? 0 : (ev.auto || 0);
      ev.choices[i].fx(G); G.pendingEvent = null;
      if (i === 0 && ev.title.includes('kapituliert')) { annexed = true; break; }
    }
  }
  const st = S.Mil.enemyState(G, e);
  console.log('Tag', d + 1, 'eigene', G.mil.units.filter(u => u.o === home).length, 'feind', G.mil.units.filter(u => u.o === e).length, 'Städte gehalten', st.held + '/' + st.all, 'Hauptstadt verloren', st.capitalLost, 'Score', G.mil.wars[e] ? G.mil.wars[e].score.toFixed(1) : '-');
}
console.log('annektiert', JSON.stringify(G.mil.annexed || {}), 'Krieg', !!G.mil.wars[e]);
// Prüfen: Gebiet gehört jetzt dir
let n = 0, mineN = 0;
for (let gy = Math.floor(cap.gy) - 12; gy < cap.gy + 12; gy++) for (let gx = Math.floor(cap.gx) - 12; gx < cap.gx + 12; gx++) {
  if (S.Mil.baseOwner(gx, gy) !== e) continue; n++; if (S.Mil.owner(G, gx + .5, gy + .5) === home) mineN++;
}
console.log('Felder des Landes', n, 'davon jetzt eigen', mineN, 'occ-Einträge', Object.keys(G.mil.occ).length, 'Abgaben/Monat', S.Mil.tribute(G).toFixed(1));
const grown = S.Mil.ensureGrid(G, [cap.gx, cap.gy]);
console.log('Raster erweitert', grown, 'Stadtgründung möglich nahe', cap.name + ':', (() => { for (let r = 7; r < 14; r++) for (let a = 0; a < 6.3; a += 0.5) { const [lx, ly] = S.Mil.local(G, cap.gx + Math.cos(a) * r, cap.gy + Math.sin(a) * r); if (S.inb(G, lx, ly) && S.canFoundCity(G, lx, ly).ok) return 'ja'; } return 'nein'; })());
