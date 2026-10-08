// Testlauf ohne Browser: node tools/simtest.js [ISO ...] [--months=N]
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Intl, Date, btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (b) => Buffer.from(b, 'base64').toString('binary') };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['data/world.js', 'util.js', 'defs.js', 'generate.js', 'world.js', 'sim.js', 'military.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const S = ctx.S; S.WORLD = ctx.WORLD_DATA;
const args = process.argv.slice(2);
const months = +((args.find(a => a.startsWith('--months=')) || '--months=120').split('=')[1]);
const isos = args.filter(a => !a.startsWith('--'));
for (const iso of (isos.length ? isos : ['DEU', 'EGY', 'LUX', 'RUS', 'IDN', 'USA', 'BRA', 'NOR', 'JPN', 'MLT'])) {
  const c = S.WORLD.find(x => x.id === iso);
  const t0 = Date.now();
  const G = S.generateCountry(c, { gov: 'demokratie' });
  const tg = Date.now() - t0;
  const bc = {}; for (let i = 0; i < G.W * G.H; i++) if (G.t.region[i] === 1) bc[S.BIOME_NAMES[G.t.biome[i]]] = (bc[S.BIOME_NAMES[G.t.biome[i]]] || 0) + 1;
  console.log(`\n== ${c.n} ${G.W}x${G.H} km/Kachel=${G.kmPerTile.toFixed(1)} gen=${tg}ms Städte=${G.cities.map(x => x.name + '(' + x.tiles + ')').join(', ')} Gebäude=${G.blds.length} popScale=${G.popScale.toFixed(0)}`);
  console.log('   Biome:', JSON.stringify(bc));
  S.calibrate(G);
  console.log('   baseRate', G.eco.baseRate.toFixed(3));
  G.pendingEvent = null;
  const t1 = Date.now();
  for (let m = 0; m < months; m++) {
    S.tick(G);
    if (G.pendingEvent) { const ch = G.pendingEvent.choices; ch[ch.length - 1].fx(G); G.pendingEvent = null; }
    if (m % 24 === 0 || m === months - 1) {
      const L = G.eco.last;
      console.log(`   ${S.dateStr(G.month)} Kasse=${G.eco.money.toFixed(0)} netto=${L.net.toFixed(1)} [ESt ${L.incomeTax.toFixed(0)} KSt ${L.corpTax.toFixed(0)} Exp ${L.exports.toFixed(0)} Tour ${L.tourism.toFixed(0)} Sonst ${L.other.toFixed(0)} | Rente ${L.pensions.toFixed(0)} Dienste ${(L.services.edu+L.services.health+L.services.security+L.services.infra).toFixed(0)} Unterh ${L.upkeep.toFixed(0)} Imp ${L.imports.toFixed(0)}] Pop=${S.fmtPop(L.pop * G.popScale)} Jobs/AK=${(L.jobs/L.workforce).toFixed(2)} Strom=${L.eProd.toFixed(0)}/${L.eDem.toFixed(0)} Nahrung=${L.food.toFixed(0)}/${L.foodNeed.toFixed(0)} Roh=${L.raw.toFixed(0)}/${L.rawUse.toFixed(0)} Güter=${L.goods.toFixed(0)}/${L.goodsNeed.toFixed(0)} Zust=${G.eco.approval.toFixed(0)} Kacheln=${G.cities.reduce((s,c)=>s+c.tiles,0)}`);
    }
  }
  console.log('   sim ms/Monat', ((Date.now() - t1) / months).toFixed(1), G.flags.over ? 'GAME OVER' : '', Object.keys(G.ach).join(','));
}
