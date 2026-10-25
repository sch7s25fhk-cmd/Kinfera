/* Souverän – Start, Spielschleife, Speichern */
'use strict';
(function (S) {
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'souveraen.save.v4'; // v4: eine eigene Stadt an echten Koordinaten
  // Spielmonate pro echter Sekunde: Echtzeit (1 Monat = 1 Tag), schnell (1 Monat = 1 Stunde), Zeitraffer (1 Monat = 2 Minuten)
  const RATE = [0, 1 / 86400, 1 / 3600, 1 / 120];
  const MAX_CATCHUP_MONTHS = 12;
  const FLAGS = ['#c0392b', '#1f6fb2', '#2e8b57', '#d4a017', '#7d3c98', '#d35400', '#16a085', '#b03a2e'];
  S.WORLD = window.WORLD_DATA;
  let G = null, pick = null, style = 'historisch', replaceArmed = false;

  // ======================= Speichern =======================
  function serialize(G) {
    const o = {};
    for (const k in G) {
      if (k === 't' || k.startsWith('_')) continue;
      o[k] = G[k];
    }
    o.t = {};
    for (const k in G.t) o.t[k] = S.toB64(G.t[k]);
    return JSON.stringify(o, (key, v) => (key === 'pendingEvent' ? undefined : v));
  }
  function deserialize(str) {
    const o = JSON.parse(str);
    const t = {};
    for (const k in S.TILE_TYPES) t[k] = o.t[k] ? S.fromB64(o.t[k], S.TILE_TYPES[k]) : new S.TILE_TYPES[k](o.W * o.H);
    o.t = t;
    o._netDirty = true;
    o.pendingEvent = null;
    return o;
  }
  S.save = function (G) {
    G.realTs = Date.now();
    G.savedSpeed = S.UI.speed;
    if (S.R.G === G) G.cam = { x: S.R.cam.x, y: S.R.cam.y, z: S.R.cam.z };
    try { localStorage.setItem(SAVE_KEY, serialize(G)); return true; } catch (e) { return false; }
  };
  function loadSave() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? deserialize(s) : null; } catch (e) { return null; }
  }
  function saveInfo() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (!s) return null;
      const m = s.match(/"name":"([^"]+)"/), mm = s.match(/"month":(\d+)/);
      return m ? { name: m[1], month: mm ? +mm[1] : 0 } : null;
    } catch (e) { return null; }
  }

  // ======================= Startbildschirm =======================
  /** Globus in den freien Raum zwischen Kopfzeile und Gründungskarte setzen */
  function fitGlobe() {
    const sc = $('screen-world').getBoundingClientRect();
    if (!sc.height) return;
    const top = $('worldHead').getBoundingClientRect().bottom - sc.top;
    const bot = $('foundCard').getBoundingClientRect().top - sc.top;
    S.WM.area = bot - top > 160 ? [top + 4, bot - 4] : null;
  }
  function showWorld() {
    $('screen-game').hidden = true;
    $('screen-world').hidden = false;
    S.WM.resize();
    fitGlobe();
    const info = saveInfo();
    const btn = $('btnContinue');
    if (info) { btn.hidden = false; btn.textContent = 'Weiter in ' + info.name + ' · ' + S.dateStr(info.month); }
    else btn.hidden = true;
    replaceArmed = false;
    updateFound();
    updateMarks();
  }
  S.toWorld = function () { G = null; S.UI.G = null; S.R.G = null; showWorld(); };

  /** „48.137, 11.575“, „48,137 11,575“, „48°08'13"N 11°34'30"E“, „33.87 S 151.21 O“ -> {lat, lon} */
  S.parseCoords = function (str) {
    const s = String(str || '').toUpperCase().replace(/[′’´`]/g, "'").replace(/[″“”]/g, '"').replace(/''/g, '"').trim();
    if (!s) return null;
    const vals = [];
    // Grad, Minuten, Sekunden mit Himmelsrichtung
    const dms = /([-+]?\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*'\s*)?(?:(\d+(?:[.,]\d+)?)\s*"\s*)?([NSOEW])?/g;
    let m;
    if (s.includes('°')) {
      while ((m = dms.exec(s)) && vals.length < 2) {
        const n = (x) => (x ? parseFloat(x.replace(',', '.')) : 0);
        let v = Math.abs(n(m[1])) + n(m[2]) / 60 + n(m[3]) / 3600;
        if (m[1].startsWith('-') || m[4] === 'S' || m[4] === 'W') v = -v;
        vals.push({ v, h: m[4] || '' });
      }
    } else {
      const dec = /([-+]?\d+(?:[.,]\d+)?)\s*([NSOEW])?/g;
      while ((m = dec.exec(s)) && vals.length < 2) {
        let v = parseFloat(m[1].replace(',', '.'));
        if (m[2] === 'S' || m[2] === 'W') v = -Math.abs(v);
        vals.push({ v, h: m[2] || '' });
      }
    }
    if (vals.length < 2) return null;
    let [a, b] = vals;
    // „11.5 O 48.1 N“: Reihenfolge nach Himmelsrichtung tauschen
    if ('OEW'.includes(a.h) && a.h && 'NS'.includes(b.h) && b.h) [a, b] = [b, a];
    const lat = a.v, lon = b.v;
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  };
  S.fmtCoords = function (lat, lon) {
    const f = (v) => Math.abs(v).toFixed(4).replace('.', ',');
    return f(lat) + '° ' + (lat >= 0 ? 'N' : 'S') + ' · ' + f(lon) + '° ' + (lon >= 0 ? 'O' : 'W');
  };

  function setMsg(text, kind) { const el = $('coordMsg'); el.textContent = text; el.className = 'coord-msg' + (kind ? ' ' + kind : ''); }

  function choose(lat, lon, fly) {
    replaceArmed = false;
    if (Math.abs(lat) > 80) { pick = null; setMsg('So nah an den Polen kann keine Stadt stehen (höchstens 80° Breite).', 'bad'); updateFound(); updateMarks(); return; }
    pick = { lat, lon, ok: S.landAt(lon, lat) };
    if (!pick.ok) setMsg(S.fmtCoords(lat, lon) + ' – hier ist Wasser. Wähle einen Ort an Land.', 'bad');
    else {
      const near = S.Online.near(lat, lon, 1.5);
      if (near.length) { pick.ok = false; setMsg('Hier steht schon ' + near[0].c.name + '. Wähle einen Ort etwas weiter weg.', 'bad'); }
      else {
        const close = S.Online.near(lat, lon, 40);
        setMsg(S.fmtCoords(lat, lon) + (close.length ? ' · Nachbarstadt: ' + close[0].c.name + ' (' + Math.round(close[0].d) + ' km)' : ' · Bauland ✓'), 'ok');
      }
    }
    if (fly) S.WM.flyTo(lon, lat, Math.max(S.WM.zoom, 7), 1400);
    updateFound(); updateMarks();
  }

  function updateFound() {
    const name = $('cityName').value.trim();
    const btn = $('btnFound');
    btn.disabled = !(pick && pick.ok && name);
    if (!replaceArmed) btn.textContent = !pick ? 'Erst einen Ort wählen' : !pick.ok ? 'Hier geht es nicht' : !name ? 'Gib deiner Stadt einen Namen' : name + ' gründen';
  }

  function updateMarks() {
    const marks = S.Online.cities.map(c => ({ lon: c.lon, lat: c.lat, label: S.Online.label(c), kind: c.id === S.Online.me ? 'own' : 'other' }));
    if (pick) marks.push({ lon: pick.lon, lat: pick.lat, label: $('cityName').value.trim() || '', kind: 'pick' });
    S.WM.marks = marks;
    // die eigene Stadt und die der anderen auch im Spiel auf dem Globus zeigen
    if (S.R.globe) S.R.globe.marks = S.Online.cities.map(c => ({ lon: c.lon, lat: c.lat, label: S.Online.label(c), kind: c.id === S.Online.me ? 'own' : 'other' }));
    const n = S.Online.cities.length, wb = $('btnWorldList');
    wb.hidden = !n;
    wb.textContent = n === 1 ? '1 Stadt in der Welt' : n + ' Städte in der Welt';
    const list = $('worldList');
    if (!list.hidden) renderWorldList();
  }

  function renderWorldList() {
    const list = $('worldList');
    const cs = S.Online.cities.slice().sort((a, b) => b.pop - a.pop);
    list.innerHTML = '';
    for (const c of cs) {
      const li = document.createElement('li');
      if (c.id === S.Online.me) li.className = 'me';
      const b = document.createElement('b'); b.textContent = S.Online.label(c);
      const sp = document.createElement('span'); sp.textContent = S.fmtPop(c.pop) + ' Einw.';
      li.append(b, sp);
      li.addEventListener('click', () => { list.hidden = true; S.WM.flyTo(c.lon, c.lat, Math.max(S.WM.zoom, 6), 1400); });
      list.appendChild(li);
    }
  }

  function buildStyles() {
    const box = $('styleChoices');
    box.innerHTML = '';
    for (const k of S.STYLE_KEYS) {
      const b = document.createElement('button');
      b.textContent = S.STYLES[k].short; b.title = S.STYLES[k].desc;
      b.setAttribute('aria-pressed', k === style);
      b.addEventListener('click', () => { style = k; box.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b)); });
      box.appendChild(b);
    }
  }

  function bindWorldUI() {
    buildStyles();
    const input = $('coordInput');
    const show = () => {
      const c = S.parseCoords(input.value);
      if (!c) { setMsg('Das verstehe ich nicht. Beispiel: 48.137, 11.575 oder 48°08\'N 11°34\'O', 'bad'); return; }
      choose(c.lat, c.lon, true);
    };
    $('btnCoordShow').addEventListener('click', show);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); show(); input.blur(); } });
    S.WM.onTap = (lon, lat) => {
      input.value = lat.toFixed(5) + ', ' + lon.toFixed(5);
      choose(lat, lon, false);
    };
    $('cityName').addEventListener('input', () => { replaceArmed = false; updateFound(); updateMarks(); });
    $('btnFound').addEventListener('click', () => foundCity());
    $('btnContinue').addEventListener('click', () => { const g = loadSave(); if (g) enterGame(g, false); });
    $('btnWorldList').addEventListener('click', () => { const l = $('worldList'); l.hidden = !l.hidden; if (!l.hidden) renderWorldList(); });
    S.Online.onChange(() => updateMarks());
  }

  // ======================= Spiel starten =======================
  function foundCity() {
    const name = $('cityName').value.trim();
    if (!pick || !pick.ok || !name) return;
    const info = saveInfo();
    const btn = $('btnFound');
    if (info && !replaceArmed) {
      replaceArmed = true;
      btn.textContent = 'Nochmal tippen: ' + info.name + ' wird ersetzt';
      return;
    }
    replaceArmed = false;
    btn.disabled = true;
    btn.textContent = 'Land wird vermessen …';
    setTimeout(() => {
      try {
        const g = S.generateCity({ lat: pick.lat, lon: pick.lon, name, style });
        S.calibrate(g);
        g.continuous = true; g.frac = 0;
        enterGame(g, true);
        S.Online.publish(g, true);
      } catch (e) {
        console.error(e);
        setMsg(/Land/.test(e.message) ? 'Hier ist zu wenig Land für eine Stadt. Wähle einen Ort weiter im Landesinneren.' : 'Die Stadt konnte nicht gegründet werden.', 'bad');
      } finally {
        updateFound();
      }
    }, 30);
  }

  function enterGame(g, fresh) {
    G = g;
    $('screen-world').hidden = true;
    $('screen-game').hidden = false;
    const country = S.WORLD.find(c => c.id === G.meta.id);
    S.R.flagColor = FLAGS[((country && country.c) || 1) % FLAGS.length];
    S.R.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    S.onDirty = (x0, y0, x1, y1) => S.R.markDirty(x0, y0, x1, y1);
    S.onLog = (text, kind) => { if (kind !== 'info') S.UI.toast(text, kind, 5200); };
    S.onDirtyGlobal = (gx, gy) => S.R.markDirtyGlobal(gx, gy);
    S.onGridGrown = (dx, dy) => { if (S.R.G === G) { S.R.gridGrown(dx, dy); S.UI.gridGrown(dx, dy); } };
    S.onAnnex = () => { if (S.R.G === G) S.R.annexed(); };
    S.World.setup(G.world);
    if (!G.mil && G.mode !== 'city') S.Mil.init(G);
    G.continuous = true;
    S.UI.RATE = RATE;
    const away = fresh ? null : catchUp(G);
    if (!fresh && G.mil) S.Mil.ensureGrid(G);
    requestAnimationFrame(() => {
      S.R.init(G, $('mapCanvas'));
      updateMarks();
      S.UI.initGame(G);
      if (!fresh && G.savedSpeed !== undefined) S.UI.setSpeed(G.savedSpeed);
      if (away) S.UI.openAwayReport(G, away);
      if (G.cam && !fresh) { Object.assign(S.R.cam, G.cam); S.R.clampCam(); }
      else {
        // Anflug aus dem All auf das eigene Land
        S.R.cam.x = G.W * S.TS / 2; S.R.cam.y = G.H * S.TS / 2;
        S.R.cam.z = S.R.zForGlobeR(Math.min(S.R.cw, S.R.ch) * 0.9);
        S.R.flyTo(S.R.cam.x, S.R.cam.y, S.R.fitZoom(), 3000);
      }
      if (fresh) { S.save(G); setTimeout(() => { if (S.UI.G === G) S.UI.openBriefing(G); }, 3100); }
    });
  }

  // ======================= Schleife =======================
  let last = performance.now(), acc = 0, saveAcc = 0;

  /** Spielzeit um dM Monate fortschreiben: Geld fließt laufend, Militär in Spielstunden, Monatsabschluss bei vollem Monat */
  function advance(G, dM, onTick) {
    G.frac = (G.frac || 0) + dM;
    if (G.eco.last) G.eco.money += G.eco.last.net * dM;
    if (G.mil) S.Mil.advance(G, dM * 720);
    // Städte wachsen jeden Spieltag ein Stück
    G.dayAcc = (G.dayAcc || 0) + dM;
    while (G.dayAcc >= 1 / 30) { G.dayAcc -= 1 / 30; S.growCities(G, 1 / 30); }
    while (G.frac >= 1) {
      G.frac -= 1;
      S.tick(G);
      if (onTick) onTick();
      if (G.mode === 'city') S.Online.publish(G);
      if (G.pendingEvent) break;
    }
  }

  /** Was ist passiert, während die App geschlossen war? */
  function catchUp(G) {
    if (!G.realTs || !G.savedSpeed) return null;
    const sec = (Date.now() - G.realTs) / 1000;
    if (sec < 60) return null;
    const months = Math.min(MAX_CATCHUP_MONTHS, sec * RATE[G.savedSpeed]);
    if (months < 0.003) return null;
    const logBefore = G.log.length ? G.log[0] : null;
    const m0 = G.month + (G.frac || 0), money0 = G.eco.money;
    const onLog = S.onLog; S.onLog = null;
    let left = months;
    while (left > 0) {
      const step = Math.min(1 / 720, left);   // eine Spielstunde
      advance(G, step);
      left -= step;
      if (G.pendingEvent) {
        // Entscheidungen in Abwesenheit: die vorsichtige Wahl
        const ev = G.pendingEvent, i = ev.auto !== undefined ? ev.auto : ev.choices.length - 1;
        ev.choices[i].fx(G);
        S.log(G, 'In deiner Abwesenheit: ' + ev.title + ' – ' + ev.choices[i].label, 'info');
        G.pendingEvent = null;
      }
    }
    S.onLog = onLog;
    const news = [];
    for (const l of G.log) { if (l === logBefore) break; news.push(l); }
    return { sec, months: G.month + G.frac - m0, money: G.eco.money - money0, news, capped: months >= MAX_CATCHUP_MONTHS };
  }
  function loop(now) {
    const dt = Math.min(250, now - last);
    last = now;
    if (!$('screen-world').hidden) S.WM.draw(now);
    else if (G && S.R.G === G) {
      const speed = S.UI.speed;
      if (speed > 0 && !G.pendingEvent && !S.UI.modalOpen) {
        advance(G, dt / 1000 * RATE[speed], () => { S.UI.refresh(false); });
        if (G.pendingEvent) S.UI.showEvent(G.pendingEvent);
      }
      acc += dt;
      if (acc > 1500) {
        acc = 0;
        // erobertes Land bebaubar machen, sobald gerade niemand die Karte bewegt
        if (G._growReq && G.mil && !G.pendingEvent && !S.UI.modalOpen && !S.UI.busy()) {
          if (S.Mil.ensureGrid(G) && !G.flags.grewHint) { G.flags.grewHint = true; S.UI.toast('Erobertes Land gehört jetzt zu deinem Staatsgebiet: Du kannst dort bauen und Städte gründen.', 'good', 5200); }
        }
        S.UI.refresh(false);
      }
      saveAcc += dt;
      if (saveAcc > 20000) {
        saveAcc = 0;
        if (!S.save(G) && !G._saveWarned) { G._saveWarned = true; S.UI.toast('Spielstand konnte nicht gespeichert werden (Speicher voll).', 'bad', 6000); }
      }
      S.UI.frame(dt);
      S.R.draw(now);
    }
    requestAnimationFrame(loop);
  }

  function boot() {
    S.WM.init($('worldCanvas'), () => {});
    bindWorldUI();
    $('gZoomIn').addEventListener('click', () => S.WM.zoomBy(1.6));
    $('gZoomOut').addEventListener('click', () => S.WM.zoomBy(1 / 1.6));
    window.addEventListener('resize', () => {
      S.WM.resize(); fitGlobe();
      if (G && S.R.G === G) { S.R.resize(); S.R.clampCam(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G) S.save(G); });
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => (G ? { save: serialize(G) } : {}));
    const start = (data) => {
      showWorld();
      if (data && data.save) { try { enterGame(deserialize(data.save), false); } catch (e) { /* neu starten */ } }
      requestAnimationFrame(loop);
    };
    if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
    S.Online.init();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(S);
