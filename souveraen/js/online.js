/* Souverän – gemeinsame Welt: jede Spielerin, jeder Spieler besitzt eine Stadt */
'use strict';
(function (S) {
  const O = S.Online = {
    ready: false,      // Datenbank erreichbar
    canWrite: null,    // null = noch unbekannt
    me: null,          // eigene Kennung (nur im Artefakt)
    cities: [],        // [{id, name, lat, lon, pop, style, ts}]
    names: {},         // id -> Anzeigename der Gründerin / des Gründers
    listeners: []
  };
  let db = null, user = null, last = null, lastTs = 0, writing = false, queued = null;

  const clean = (d, id) => {
    const lat = +d.lat, lon = +d.lon;
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return {
      id, lat, lon,
      name: String(d.name || 'Stadt').slice(0, 32),
      pop: Math.max(0, Math.round(+d.pop || 0)),
      style: S.STYLES[d.style] ? d.style : 'historisch',
      ts: +d.ts || 0
    };
  };
  const emit = () => { for (const f of O.listeners) { try { f(O.cities); } catch (e) { console.error(e); } } };
  O.onChange = (f) => { O.listeners.push(f); f(O.cities); };

  async function resolveNames() {
    if (!user || !O.cities.length) return;
    try {
      const ps = await user.profiles(O.cities.map(c => c.id));
      let changed = false;
      for (const c of O.cities) {
        const n = (ps && ps[c.id] && ps[c.id].name) || '';
        if (O.names[c.id] !== n) { O.names[c.id] = n; changed = true; }
      }
      if (changed) emit();
    } catch (e) { /* Namen sind nur Beiwerk */ }
  }

  O.init = async function () {
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') return;
    try {
      [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
    } catch (e) { db = null; }
    if (!db) return;
    try { O.me = user ? await user.id() : null; } catch (e) { O.me = null; }
    try {
      if (user && user.can) { const w = await user.can('data.write'); if (w === false) O.canWrite = false; }
    } catch (e) { /* unbekannt lassen */ }
    O.ready = true;
    db.collection('cities').onSnapshot((snap) => {
      O.cities = snap.docs.map(d => clean(d.data() || {}, d.id)).filter(Boolean);
      emit();
      resolveNames();
    }, () => { O.ready = false; emit(); });
    if (queued) { const g = queued; queued = null; O.publish(g, true); }
  };

  /** Eigene Stadt in der gemeinsamen Welt eintragen – nur bei echten Änderungen */
  O.publish = function (G, force) {
    if (!G || G.mode !== 'city') return;
    if (!O.ready) { queued = G; return; }
    if (!O.me || O.canWrite === false) return;
    const body = {
      name: G.meta.name, lat: +G.meta.lat.toFixed(5), lon: +G.meta.lon.toFixed(5),
      pop: Math.round(G.cities.reduce((s, c) => s + c.pop, 0) * (G.popScale || 1)), style: (G.cities[0] && G.cities[0].style) || 'historisch',
      month: G.month || 0, ts: Date.now()
    };
    if (!force && last) {
      const same = last.name === body.name && last.lat === body.lat && last.lon === body.lon && last.style === body.style;
      const dPop = Math.abs(body.pop - last.pop) / Math.max(200, last.pop);
      if (same && (dPop < 0.03 || Date.now() - lastTs < 60000)) return;
    }
    if (writing) { queued = G; return; }
    writing = true;
    db.doc('cities/' + O.me).set(body).then(() => {
      last = body; lastTs = Date.now(); O.canWrite = true;
    }, (e) => {
      // z. B. nur Leserechte: dann bleibt die Stadt lokal
      if (!e || e.code !== 'unavailable') O.canWrite = false;
    }).finally(() => {
      writing = false;
      if (queued && O.canWrite !== false) { const g = queued; queued = null; O.publish(g, true); }
    });
  };

  /** Andere Städte in der Nähe (km) */
  O.near = function (lat, lon, km) {
    const out = [];
    for (const c of O.cities) {
      if (c.id === O.me) continue;
      const d = S.distKm(lat, lon, c.lat, c.lon);
      if (d < km) out.push({ c, d });
    }
    return out.sort((a, b) => a.d - b.d);
  };
  O.label = function (c) {
    const who = O.names[c.id];
    return c.id === O.me ? c.name + ' (du)' : who ? c.name + ' · ' + who : c.name;
  };

  S.distKm = function (lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180;
    const a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(a)));
  };
})(S);
