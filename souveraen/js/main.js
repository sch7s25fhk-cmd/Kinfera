/* Souverän – Start, Spielschleife, Speichern */
'use strict';
(function (S) {
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'souveraen.save.v1';
  const MS_PER_MONTH = [0, 6000, 3000, 1300]; // ein Monat: 6 s, 3 s oder 1,3 s
  const FLAGS = ['#c0392b', '#1f6fb2', '#2e8b57', '#d4a017', '#7d3c98', '#d35400', '#16a085', '#b03a2e'];
  S.WORLD = window.WORLD_DATA;
  let G = null, selected = null, gov = 'demokratie';

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

  // ======================= Weltkarte =======================
  function showWorld() {
    $('screen-game').hidden = true;
    $('screen-world').hidden = false;
    S.WM.resize();
    const info = saveInfo();
    const btn = $('btnContinue');
    if (info) { btn.hidden = false; btn.textContent = 'Weiterspielen: ' + info.name + ', ' + S.dateStr(info.month); }
    else btn.hidden = true;
  }
  S.toWorld = function () { if (S.UI.globeMode) S.UI.exitGlobe(true); G = null; S.UI.G = null; S.R.G = null; showWorld(); };

  function selectCountry(item) {
    selected = item;
    S.WM.sel = item;
    const c = item.c;
    const I = S.INCOME[c.inc] || S.INCOME[3];
    const cap = (c.pl || []).find(p => p[4]) || (c.pl || [])[0];
    $('ccName').textContent = c.n;
    $('ccCont').textContent = ({ Europe: 'Europa', Asia: 'Asien', Africa: 'Afrika', 'North America': 'Nordamerika', 'South America': 'Südamerika', Oceania: 'Ozeanien', 'Seven seas (open ocean)': 'Inselstaat', Antarctica: 'Antarktis' })[c.cont] || c.cont;
    $('ccCap').textContent = cap ? 'Hauptstadt: ' + cap[0] : 'Hauptstadt wird neu gegründet';
    const sel = S.selectRings(c);
    const km2 = sel.rings.reduce((s, r) => s + r.area, 0) * 111 * 111;
    $('ccFacts').innerHTML =
      '<div><dt>Einwohner</dt><dd>' + S.fmtPop(c.pop) + '</dd></div>' +
      '<div><dt>Wirtschaft</dt><dd>' + (c.gdp ? S.fmt(c.gdp / 1000) + ' Mrd. $' : '–') + '</dd></div>' +
      '<div><dt>Fläche (Kernland)</dt><dd>' + S.fmtPop(km2) + ' km²</dd></div>' +
      '<div><dt>Städte zum Start</dt><dd>' + Math.min(8, Math.max(1, (c.pl || []).length)) + '</dd></div>';
    $('ccDiff').innerHTML = '<b>' + I.name + '.</b> ' + ({
      Anspruchsvoll: 'Reiche Länder starten mit voller Kasse, aber die Menschen erwarten viel.',
      Ausgewogen: 'Solide Ausgangslage mit Luft nach oben.',
      Aufbauspiel: 'Wenig Geld, genügsame Menschen und viel Raum für Aufbau.',
      'Großes Potenzial': 'Knappe Mittel und niedrige Bildung – aber jede Verbesserung wird gefeiert.'
    })[I.diff];
    $('countryCard').hidden = false;
    requestAnimationFrame(() => S.WM.shapePreview($('ccShape'), item));
  }

  function buildSetup() {
    const box = $('govChoices');
    box.innerHTML = Object.entries(S.GOVS).map(([k, g]) => '<button class="opt" data-gov="' + k + '" aria-pressed="' + (k === gov) + '"><span><b>' + g.name + '</b><small>' + g.desc + '</small></span></button>').join('');
    box.querySelectorAll('[data-gov]').forEach(b => b.addEventListener('click', () => {
      gov = b.dataset.gov;
      box.querySelectorAll('[data-gov]').forEach(o => o.setAttribute('aria-pressed', o === b));
    }));
  }

  function bindWorldUI() {
    const input = $('countrySearch'), list = $('searchList');
    let hits = [], on = 0;
    const render = () => {
      list.innerHTML = hits.map((it, i) => '<li data-i="' + i + '" class="' + (i === on ? 'on' : '') + '">' + S.esc(it.c.n) + '<span>' + S.fmtPop(it.c.pop) + '</span></li>').join('');
      list.hidden = !hits.length;
    };
    const pick = (it) => { input.value = it.c.n; list.hidden = true; S.WM.focus(it); selectCountry(it); };
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      hits = q ? S.WM.items.filter(it => it.c.n.toLowerCase().includes(q) || it.c.en.toLowerCase().includes(q))
        .sort((a, b) => (a.c.n.toLowerCase().startsWith(q) ? 0 : 1) - (b.c.n.toLowerCase().startsWith(q) ? 0 : 1) || b.c.pop - a.c.pop).slice(0, 8) : [];
      on = 0; render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { on = Math.min(hits.length - 1, on + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { on = Math.max(0, on - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter' && hits[on]) pick(hits[on]);
      else if (e.key === 'Escape') list.hidden = true;
    });
    list.addEventListener('pointerdown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(hits[+li.dataset.i]); } });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $(b.dataset.close).hidden = true; if (b.dataset.close === 'countryCard') S.WM.sel = null; }));
    $('btnRule').addEventListener('click', () => { buildSetup(); $('setup').hidden = false; });
    $('btnStart').addEventListener('click', () => startNew());
    $('btnContinue').addEventListener('click', () => { const g = loadSave(); if (g) enterGame(g, false); });
  }

  // ======================= Spiel starten =======================
  function startNew() {
    if (!selected) return;
    const btn = $('btnStart');
    btn.disabled = true;
    btn.textContent = 'Land wird vermessen …';
    setTimeout(() => {
      try {
        const g = S.generateCountry(selected.c, { gov, ruler: $('rulerName').value.trim() });
        S.calibrate(g);
        $('setup').hidden = true;
        $('countryCard').hidden = true;
        enterGame(g, true);
      } catch (e) {
        console.error(e);
        btn.textContent = 'Dieses Land ist zu klein für eine Karte';
        setTimeout(() => { btn.textContent = 'Amt übernehmen'; }, 2500);
      } finally {
        btn.disabled = false;
        if (btn.textContent === 'Land wird vermessen …') btn.textContent = 'Amt übernehmen';
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
    requestAnimationFrame(() => {
      S.R.init(G, $('mapCanvas'));
      if (G.cam) { Object.assign(S.R.cam, G.cam); S.R.clampCam(); }
      else {
        const cap = G.cities.find(c => c.capital) || G.cities[0];
        S.R.fit();
        if (cap && S.R.cam.z < 0.7) S.R.centerOn(cap.x, cap.y, 0.85);
      }
      S.UI.initGame(G);
      if (fresh) { S.UI.openBriefing(G); S.save(G); }
    });
  }

  // ======================= Schleife =======================
  let last = performance.now(), acc = 0;
  function loop(now) {
    const dt = Math.min(250, now - last);
    last = now;
    if (!$('screen-world').hidden) S.WM.draw(now);
    else if (G && S.R.G === G) {
      const speed = S.UI.speed;
      if (speed > 0 && !G.pendingEvent && !S.UI.modalOpen) {
        acc += dt;
        if (acc >= MS_PER_MONTH[speed]) {
          acc = 0;
          S.tick(G);
          G.cam = { x: S.R.cam.x, y: S.R.cam.y, z: S.R.cam.z };
          if (G.month % 12 === 0) S.save(G);
          S.UI.refresh(false);
          if (G.pendingEvent) S.UI.showEvent(G.pendingEvent);
        }
      }
      if (S.UI.globeMode) S.UI.globe.draw(now);
      else { S.UI.frame(dt); S.R.draw(now); }
    }
    requestAnimationFrame(loop);
  }

  function boot() {
    S.WM.init($('worldCanvas'), selectCountry);
    bindWorldUI();
    $('gZoomIn').addEventListener('click', () => S.WM.zoomBy(1.6));
    $('gZoomOut').addEventListener('click', () => S.WM.zoomBy(1 / 1.6));
    window.addEventListener('resize', () => {
      S.WM.resize();
      if (G && S.R.G === G) { S.R.resize(); S.R.clampCam(); if (S.UI.globe) S.UI.globe.resize(); }
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(S);
