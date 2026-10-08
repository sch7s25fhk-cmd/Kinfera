/* Souverän – Bedienoberfläche im Spiel */
'use strict';
(function (S) {
  const UI = S.UI = { tool: 'inspect', cat: null, tab: 'lage', speed: 1, sel: null };
  const $ = (id) => document.getElementById(id);
  const esc = S.esc;
  const R = S.R;

  const TABS = [['lage', 'Lage'], ['auswahl', 'Auswahl'], ['haushalt', 'Haushalt'], ['staedte', 'Städte'], ['chronik', 'Chronik']];
  const VIEWS = [['none', 'Gelände'], ['pop', 'Wohndichte'], ['happy', 'Zufriedenheit'], ['poll', 'Verschmutzung'], ['fert', 'Fruchtbarkeit'], ['res', 'Rohstoffe'], ['net', 'Verkehrsnetz']];

  // ======================= Aufbau =======================
  UI.initGame = function (G) {
    UI.G = G;
    UI.tool = 'inspect'; UI.cat = null; UI.sel = null; R.sel = null; R.selCity = null;
    $('tbName').textContent = G.meta.name;
    const gov = S.GOVS[G.meta.gov];
    $('tbRuler').textContent = G.meta.ruler ? gov.title + ' ' + G.meta.ruler : gov.name;
    buildToolbar();
    buildViews();
    buildTabs();
    if (!UI.bound) { bindMap(); bindGlobal(); bindActionBar(); UI.bound = true; }
    UI.setSpeed(1);
    UI.refresh(true);
  };

  function buildToolbar() {
    const tb = $('toolbar');
    tb.innerHTML = '';
    for (const cat of S.TOOL_CATS) {
      const b = document.createElement('button');
      b.className = 'tcat';
      b.dataset.cat = cat.key;
      const first = cat.key === 'landschaft' ? cat.tools[3] : cat.key === 'staedte' ? cat.tools[0] : cat.tools[0];
      const ic = R.toolIcon(first, 32);
      b.appendChild(ic);
      const l = document.createElement('span');
      l.textContent = cat.short || cat.name;
      b.appendChild(l);
      b.title = cat.name;
      b.addEventListener('click', () => {
        if (cat.key === 'inspect') { UI.selectTool('inspect'); closeFlyout(); return; }
        if (UI.cat === cat.key && !$('flyout').hidden) { closeFlyout(); return; }
        openFlyout(cat);
      });
      tb.appendChild(b);
    }
    markToolbar();
  }

  function openFlyout(cat) {
    UI.cat = cat.key;
    closePanelMobile();
    const f = $('flyout');
    f.innerHTML = '<h3>' + esc(cat.name) + '</h3><div class="toolgrid"></div>';
    const grid = f.querySelector('.toolgrid');
    for (const t of cat.tools) {
      const b = document.createElement('button');
      b.className = 'tool' + (UI.tool === t.id ? ' on' : '');
      b.appendChild(R.toolIcon(t, 44));
      const d = document.createElement('span');
      const per = t.kind === 'road' || t.kind === 'rail' || t.kind === 'zone' || t.kind === 'terra';
      d.innerHTML = '<b>' + esc(t.name) + '</b><span class="cost">' + (t.cost ? (per ? t.cost + ' / Feld' : S.fmt(t.cost) + ' Mio. T') : '') + '</span><small>' + esc(t.desc || '') + '</small>';
      b.appendChild(d);
      b.addEventListener('click', () => { UI.selectTool(t.id); closeFlyout(); });
      grid.appendChild(b);
    }
    f.hidden = false;
    markToolbar();
  }
  function closeFlyout() { $('flyout').hidden = true; UI.cat = null; markToolbar(); }

  function markToolbar() {
    const curCat = S.TOOLS[UI.tool].cat;
    for (const b of $('toolbar').children) b.classList.toggle('on', b.dataset.cat === (UI.cat || curCat));
  }

  UI.selectTool = function (id) {
    UI.tool = id;
    UI.pending = null;
    R.preview = null;
    markToolbar();
    if (id !== 'inspect') closePanelMobile();
    UI.syncPreview();
  };

  function buildViews() {
    const v = $('views');
    v.innerHTML = '';
    for (const [k, n] of VIEWS) {
      const b = document.createElement('button');
      b.textContent = n;
      b.className = R.view === k ? 'on' : '';
      b.addEventListener('click', () => {
        R.view = k;
        for (const x of v.children) x.classList.toggle('on', x === b);
      });
      v.appendChild(b);
    }
  }

  function buildTabs() {
    const t = $('tabs');
    t.innerHTML = '';
    for (const [k, n] of TABS) {
      const b = document.createElement('button');
      b.textContent = n; b.dataset.tab = k; b.setAttribute('role', 'tab');
      b.addEventListener('click', () => UI.showTab(k));
      t.appendChild(b);
    }
    UI.showTab(UI.tab);
  }

  UI.showTab = function (k) {
    UI.tab = k;
    for (const b of $('tabs').children) { b.classList.toggle('on', b.dataset.tab === k); b.setAttribute('aria-selected', b.dataset.tab === k); }
    UI.renderPanel(true);
  };

  UI.setSpeed = function (s) {
    UI.speed = s;
    for (const b of document.querySelectorAll('.speed button')) b.classList.toggle('on', +b.dataset.speed === s);
  };

  // ======================= Kopfzeile =======================
  UI.refresh = function (full) {
    const G = UI.G;
    if (!G) return;
    $('tbDate').textContent = S.dateStr(G.month);
    const L = G.eco.last || {};
    const eco = G.eco;
    const net = L.net || 0;
    const stats = [];
    stats.push(['Staatskasse', S.fmtMoney(eco.money), '<i class="' + (net >= 0 ? 'up' : 'down') + '">' + S.fmtMoney(net, true).replace(' Mio. T', '') + '</i>', eco.money < 0 ? 'bad' : net < 0 ? 'warn' : '']);
    stats.push(['Bevölkerung', S.fmtPop((L.pop || 0) * G.popScale), '', '']);
    const ap = Math.round(eco.approval);
    stats.push(['Zustimmung', ap + ' %', '<div class="meter"><span style="width:' + ap + '%;background:' + (ap >= 55 ? 'var(--good)' : ap >= 45 ? 'var(--warn)' : 'var(--bad)') + '"></span></div>', ap < 45 ? 'bad' : ap < 52 ? 'warn' : 'good']);
    const er = L.eDem ? L.eProd / L.eDem : 1;
    stats.push(['Strom', Math.round(L.eProd || 0) + '/' + Math.round(L.eDem || 0) + ' MW', '', er < 1 ? 'bad' : er < 1.1 ? 'warn' : '']);
    const fr = L.foodNeed ? L.food / L.foodNeed : 1;
    stats.push(['Nahrung', Math.round((fr) * 100) + ' %', '', fr < 1 ? 'bad' : fr < 1.15 ? 'warn' : '']);
    stats.push(['Arbeitslos', S.fmt1((1 - (L.employment || 1)) * 100) + ' %', '', (1 - (L.employment || 1)) > 0.1 ? 'bad' : (1 - (L.employment || 1)) > 0.06 ? 'warn' : '']);
    if (UI.tool !== 'inspect' && UI.pending) UI.syncPreview();
    $('tbStats').innerHTML = stats.map(s => '<div class="stat ' + s[3] + '"><small>' + s[0] + '</small><b>' + s[1] + '</b>' + s[2] + '</div>').join('');
    UI.renderPanel(full);
  };

  // ======================= Panel =======================
  UI.renderPanel = function (full) {
    const body = $('panelBody');
    const G = UI.G;
    if (!G) return;
    const fn = PANELS[UI.tab];
    if (full || !fn.update) { body.innerHTML = fn.build(G); if (fn.bind) fn.bind(G, body); }
    else fn.update(G, body);
  };

  const pct = (v) => Math.round(v * 100) + ' %';

  function alerts(G) {
    const L = G.eco.last, out = [];
    if (!L) return out;
    if (L.eProd < L.eDem) out.push(['bad', 'Stromknappheit: ' + Math.round(L.eProd) + ' von ' + Math.round(L.eDem) + ' MW. Baue Kraftwerke, sonst stockt die Industrie und die Städte wachsen nicht in die Höhe.']);
    else if (L.eProd < L.eDem * 1.1) out.push(['warn', 'Das Stromnetz läuft am Limit (' + Math.round(L.eProd) + '/' + Math.round(L.eDem) + ' MW).']);
    if (L.food < L.foodNeed) out.push(['bad', 'Nahrungsmangel! Das Land muss teuer importieren. Baue Bauernhöfe oder Fischereien.']);
    if (L.employment < 0.92) out.push(['warn', S.fmt1((1 - L.employment) * 100) + ' % Arbeitslosigkeit. Gewerbe- und Industriezonen, Fabriken und Minen schaffen Jobs.']);
    if (L.laborRatio < 0.9) out.push(['warn', 'Es fehlen Arbeitskräfte – Betriebe arbeiten nur mit ' + pct(L.laborRatio) + '. Wohnzonen lassen Städte wachsen.']);
    if (L.net < 0) out.push([G.eco.money < 500 ? 'bad' : 'warn', 'Der Haushalt macht ' + S.fmtMoney(-L.net) + ' Verlust pro Monat.']);
    if (G.eco.approval < 45) out.push(['bad', 'Die Zustimmung ist auf ' + Math.round(G.eco.approval) + ' % gefallen. Schau unter „Städte“, woran es liegt.']);
    const unc = G.blds.filter(b => b.conn === false).length;
    if (unc) out.push(['warn', unc + ' Gebäude ohne Straßenanschluss arbeiten nur mit 40 %. Sie sind auf der Karte rot markiert.']);
    const discon = G.cities.filter(c => !c.connected);
    if (discon.length) out.push(['warn', discon.map(c => c.name).join(', ') + ' ' + (discon.length > 1 ? 'sind' : 'ist') + ' nicht mit der Hauptstadt verbunden.']);
    if (L.imports > 25) out.push(['warn', 'Importe kosten ' + S.fmtMoney(L.imports) + ' im Monat. ' + (L.raw < L.rawUse ? 'Rohstoffe fehlen – Bergwerke, Sägewerke oder Ölpumpen helfen. ' : '') + (L.goods < L.goodsNeed ? 'Güter fehlen – Fabriken bauen.' : '')]);
    if (G.meta.gov === 'demokratie' && !G.flags.over) {
      const left = 48 - (G.month - G.eco.lastElection);
      if (left <= 12) out.push([G.eco.approval < 50 ? 'bad' : 'good', 'Wahl in ' + left + ' Monaten. Du brauchst mindestens 50 % Zustimmung.']);
    }
    if (!out.length) out.push(['good', 'Das Land ist stabil. Zeit, Neues zu bauen.']);
    return out;
  }

  function spark(G, key, color) {
    return '<canvas class="spark" data-spark="' + key + '" data-color="' + color + '"></canvas>';
  }
  function drawSparks(G, root) {
    for (const cv of root.querySelectorAll('canvas[data-spark]')) {
      const key = cv.dataset.spark, col = cv.dataset.color;
      const data = G.stats.slice(-120).map(s => s[key]);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 300, h = cv.clientHeight || 64;
      cv.width = w * dpr; cv.height = h * dpr;
      const c = cv.getContext('2d');
      c.scale(dpr, dpr);
      c.strokeStyle = 'rgba(156,173,189,0.18)'; c.lineWidth = 1;
      for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(0, k * h / 4); c.lineTo(w, k * h / 4); c.stroke(); }
      if (data.length < 2) { c.fillStyle = '#9cadbd'; c.font = '11px system-ui'; c.fillText('Daten sammeln sich mit der Zeit …', 4, h / 2); continue; }
      let mn = Math.min(...data), mx = Math.max(...data);
      if (key === 'app') { mn = 0; mx = 100; }
      if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
      const X = (i) => 2 + i / (data.length - 1) * (w - 40), Y = (v) => h - 4 - (v - mn) / (mx - mn) * (h - 10);
      if (key === 'app') { c.strokeStyle = 'rgba(229,87,78,0.5)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(0, Y(50)); c.lineTo(w, Y(50)); c.stroke(); c.setLineDash([]); }
      c.beginPath();
      data.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
      c.strokeStyle = col; c.lineWidth = 2; c.stroke();
      c.lineTo(X(data.length - 1), h); c.lineTo(X(0), h); c.closePath();
      c.fillStyle = col + '22'; c.fill();
      const lv = data[data.length - 1];
      c.fillStyle = col; c.beginPath(); c.arc(X(data.length - 1), Y(lv), 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f1eadb'; c.font = '500 10.5px "IBM Plex Mono", monospace'; c.textAlign = 'right';
      c.fillText(key === 'pop' ? S.fmtPop(lv) : key === 'app' ? Math.round(lv) + '%' : S.fmt(lv), w, 10);
    }
  }

  function happyBars(hc) {
    const rows = Object.entries(hc).filter(([k, v]) => k !== 'Grundstimmung' && Math.abs(v) >= 0.5).sort((a, b) => a[1] - b[1]);
    return '<div class="bars">' + rows.map(([k, v]) => {
      const w = Math.min(50, Math.abs(v) * 2.5);
      const style = v >= 0 ? 'left:50%;width:' + w + '%;background:var(--good)' : 'right:50%;width:' + w + '%;background:var(--bad)';
      return '<div class="bar"><span>' + esc(k) + '</span><span class="track"><i style="' + style + '"></i></span><span>' + (v > 0 ? '+' : '') + Math.round(v) + '</span></div>';
    }).join('') + '</div>';
  }

  const PANELS = {
    lage: {
      build(G) {
        const L = G.eco.last;
        if (!L) return '<p class="muted">Der erste Monatsbericht folgt in Kürze.</p>';
        const a = alerts(G);
        return '<section><h3>Lagebericht · ' + S.dateStr(G.month) + '</h3><div class="alerts">' +
          a.map(x => '<div class="alert ' + x[0] + '">' + esc(x[1]) + '</div>').join('') + '</div></section>' +
          '<section><h4>Staatskasse</h4>' + spark(G, 'money', '#e3ad3c') + '</section>' +
          '<section><h4>Zustimmung</h4>' + spark(G, 'app', '#5fbf7f') + '</section>' +
          '<section><h4>Bevölkerung</h4>' + spark(G, 'pop', '#7fb3d6') + '</section>' +
          '<section><h4>Versorgung (pro Monat)</h4><div class="kv">' +
          '<span>Strom erzeugt / benötigt</span><span>' + Math.round(L.eProd) + ' / ' + Math.round(L.eDem) + ' MW</span>' +
          '<span>Nahrung</span><span>' + Math.round(L.food) + ' / ' + Math.round(L.foodNeed) + '</span>' +
          '<span>Rohstoffe</span><span>' + Math.round(L.raw) + ' / ' + Math.round(L.rawUse) + '</span>' +
          '<span>Güter</span><span>' + Math.round(L.goods) + ' / ' + Math.round(L.goodsNeed) + '</span>' +
          '<span>Arbeitsplätze / Arbeitskräfte</span><span>' + S.fmtPop(L.jobs * G.popScale) + ' / ' + S.fmtPop(L.workforce * G.popScale) + '</span>' +
          '<span>Bildungsniveau</span><span>' + pct(G.eco.eduLevel) + '</span>' +
          '<span>Wirtschaftsleistung</span><span>' + S.fmtMoney(L.gdp) + '/J.</span>' +
          '</div></section>';
      },
      bind(G, root) { drawSparks(G, root); }
    },
    auswahl: {
      build(G) {
        const s = UI.sel;
        if (!s) return '<section><h3>Nichts ausgewählt</h3><p class="muted">Wähle das Werkzeug „Ansehen“ und tippe auf eine Stadt, ein Gebäude oder ein Stück Land. Bei Städten kannst du hier Stil, Straßennetz und Bauhöhe bestimmen.</p></section>';
        if (s.city !== undefined) return cityBuild(G, G.cities[s.city]);
        return tileBuild(G, s.x, s.y);
      },
      bind(G, root) {
        const s = UI.sel;
        if (s && s.city !== undefined) cityBind(G, G.cities[s.city], root);
        else if (s) tileBind(G, s.x, s.y, root);
      },
      update(G, root) {
        const s = UI.sel;
        if (s && s.city !== undefined) { const el = root.querySelector('#cityStats'); if (el) el.innerHTML = cityStats(G, G.cities[s.city]); }
        else if (s) { const el = root.querySelector('#tileStats'); if (el) el.innerHTML = tileStats(G, s.x, s.y); }
      }
    },
    haushalt: {
      build(G) {
        const e = G.eco, b = e.budget;
        const sl = (id, label, val, min, max, hint) => '<div class="slider"><label for="' + id + '">' + label + '</label><output id="' + id + 'Out">' + Math.round(val * 100) + ' %</output><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="1" value="' + Math.round(val * 100) + '"><small>' + hint + '</small></div>';
        return '<section><h3>Staatshaushalt</h3>' +
          sl('taxInc', 'Einkommensteuer', e.taxInc, 0, 50, 'Über 15 % sinkt die Zufriedenheit spürbar.') +
          sl('taxCorp', 'Unternehmensteuer', e.taxCorp, 0, 50, 'Besteuert die Wertschöpfung aller Betriebe. Über 22 % murren die Menschen.') +
          '</section><section><h4>Ausgaben für Staatsaufgaben</h4>' +
          sl('bEdu', 'Bildung', b.edu, 0, 150, 'Steigert langsam das Bildungsniveau und damit Löhne und Erträge.') +
          sl('bHealth', 'Gesundheit', b.health, 0, 150, 'Mehr Geburten, zufriedenere Menschen.') +
          sl('bSec', 'Sicherheit', b.security, 0, 150, 'Zufriedenheit und Tourismus.') +
          sl('bInfra', 'Infrastruktur', b.infra, 0, 150, 'Pflege von Straßen und Netzen. Unter 100 % steigen die Unterhaltskosten nicht, aber die Leute merken es.') +
          '</section><section><h4>Kredite</h4><div class="kv" id="debtKv"></div><div class="chips">' +
          '<button class="chip" data-loan="500">+500 leihen</button><button class="chip" data-loan="2000">+2.000 leihen</button><button class="chip" data-repay="500">500 tilgen</button><button class="chip" data-repay="all">Alles tilgen</button>' +
          '</div></section><section><h4>Letzter Monat</h4><div class="kv" id="hhKv"></div></section>';
      },
      bind(G, root) {
        const e = G.eco;
        const map = { taxInc: v => e.taxInc = v, taxCorp: v => e.taxCorp = v, bEdu: v => e.budget.edu = v, bHealth: v => e.budget.health = v, bSec: v => e.budget.security = v, bInfra: v => e.budget.infra = v };
        for (const id in map) {
          const inp = root.querySelector('#' + id);
          inp.addEventListener('input', () => { map[id](inp.value / 100); root.querySelector('#' + id + 'Out').textContent = inp.value + ' %'; });
        }
        root.querySelectorAll('[data-loan]').forEach(b => b.addEventListener('click', () => { S.takeLoan(G, +b.dataset.loan); UI.refresh(); }));
        root.querySelectorAll('[data-repay]').forEach(b => b.addEventListener('click', () => {
          const ok = S.repayLoan(G, b.dataset.repay === 'all' ? Infinity : 500);
          if (!ok) UI.toast('Nichts zu tilgen oder zu wenig Geld in der Kasse.', 'warn');
          UI.refresh();
        }));
        PANELS.haushalt.update(G, root);
      },
      update(G, root) {
        const L = G.eco.last, e = G.eco;
        root.querySelector('#debtKv').innerHTML = '<span>Schulden</span><span>' + S.fmtMoney(e.debt) + '</span><span>Zinssatz</span><span>' + S.fmt1((e.rate || 0.04) * 100) + ' %</span>';
        if (!L) return;
        const r = (k, v, cls) => '<span' + (cls ? ' class="' + cls + '"' : '') + '>' + k + '</span><span' + (cls ? ' class="' + cls + '"' : '') + '>' + S.fmtMoney(v) + '</span>';
        let h = r('Einkommensteuer', L.incomeTax) + r('Unternehmensteuer', L.corpTax) + r('Exporte', L.exports) + r('Tourismus', L.tourism);
        if (L.other > 0.5) h += r('Übrige Wirtschaft', L.other);
        h += r('Einnahmen', L.income, 'sum');
        h += r('Bildung', L.services.edu) + r('Gesundheit', L.services.health) + r('Sicherheit', L.services.security) + r('Infrastruktur', L.services.infra);
        h += r('Unterhalt Bauten & Straßen', L.upkeep) + r('Importe', L.imports);
        if (L.pensions > 0.5) h += r('Renten & Altlasten', L.pensions);
        if (L.interest > 0.1) h += r('Zinsen', L.interest);
        h += r('Ausgaben', L.expense, 'sum') + r('Saldo', L.net, 'sum');
        root.querySelector('#hhKv').innerHTML = h;
      }
    },
    staedte: {
      build(G) {
        const cs = G.cities.slice().sort((a, b) => b.pop - a.pop);
        return '<section><h3>Städte</h3><p class="muted">Tippe eine Stadt an, um sie auf der Karte zu zeigen und ihr Aussehen zu bestimmen.</p><div class="citylist">' +
          cs.map(c => {
            const st = S.STYLES[c.style];
            const h = Math.round(c.happy);
            return '<button class="cityrow" data-city="' + c.id + '"><span class="dot" style="background:' + st.roof + '"></span><span><b>' + esc(c.name) + (c.capital ? ' ★' : '') + '</b><small>' + st.short + ' · ' + S.LAYOUTS[c.layout].name + (c.connected ? '' : ' · ohne Anbindung') + '</small></span><span class="mono">' + S.fmtPop(c.pop * S.cityScale(G)) + '<br><span class="' + (h >= 55 ? 'up' : h < 45 ? 'down' : '') + '">' + h + ' % zufrieden</span></span></button>';
          }).join('') + '</div></section>';
      },
      bind(G, root) {
        root.querySelectorAll('[data-city]').forEach(b => b.addEventListener('click', () => {
          const c = G.cities[+b.dataset.city];
          UI.selectCity(c, true);
        }));
      }
    },
    chronik: {
      build(G) {
        return '<section><h3>Erfolge</h3><div class="achs">' + S.ACHIEVEMENTS.map(a => '<div class="ach' + (G.ach[a.id] !== undefined ? ' on' : '') + '"><b>' + esc(a.name) + '</b><small>' + esc(a.desc) + '</small></div>').join('') + '</div></section>' +
          '<section><h3>Chronik</h3><ul class="log">' + (G.log.length ? G.log.map(l => '<li class="' + l.kind + '"><time>' + S.dateStr(l.m) + '</time><span>' + esc(l.text) + '</span></li>').join('') : '<li><time></time><span class="muted">Noch keine Ereignisse.</span></li>') + '</ul></section>';
      }
    }
  };

  // ---------- Stadt-Panel ----------
  function cityStats(G, c) {
    const L = G.eco.last;
    let h = '<div class="kv">' +
      '<span>Einwohner</span><span>' + S.fmtPop(c.pop * S.cityScale(G)) + '</span>' +
      '<span>Wohnraum</span><span>' + S.fmtPop(c.cap * S.cityScale(G)) + '</span>' +
      '<span>Arbeitsplätze in der Stadt</span><span>' + S.fmtPop(c.jobs * S.cityScale(G)) + '</span>' +
      '<span>Stadtfläche</span><span>' + (c.tiles + 1) + ' Felder</span>' +
      '<span>Wohnen / Gewerbe / Industrie</span><span>' + c.nR + ' / ' + c.nC + ' / ' + c.nI + '</span>' +
      '<span>Bildung · Gesundheit</span><span>' + pct(c.edu) + ' · ' + pct(c.health) + '</span>' +
      '<span>Luftverschmutzung</span><span>' + pct(c.poll) + '</span>' +
      '<span>Tourismus</span><span>' + S.fmtMoney(c.tourism || 0) + '</span>' +
      '<span>Anbindung</span><span>' + (c.capital ? 'Hauptstadt' : c.connected ? (c.rail ? 'Straße + Bahn' : 'Straße') : 'keine') + '</span>' +
      '</div>';
    if (c.hc) h += '<h4>Zufriedenheit: ' + Math.round(c.happy) + ' %</h4>' + happyBars(c.hc);
    if (c.hist.length > 2) {
      const g = c.hist.length >= 13 ? (c.hist[c.hist.length - 1] / c.hist[c.hist.length - 13] - 1) * 100 : null;
      if (g !== null) h += '<p class="muted">Wachstum im letzten Jahr: ' + (g >= 0 ? '+' : '') + S.fmt1(g) + ' %</p>';
    }
    return h;
  }

  function cityBuild(G, c) {
    const st = S.STYLES[c.style];
    const restyle = Math.round((c.tiles + 1) * 4);
    return '<section><p class="eyebrow">' + (c.capital ? 'Hauptstadt' : c.isNew ? 'Gegründet ' + S.dateStr(c.founded) : 'Stadt') + '</p>' +
      '<label class="sr" for="cityName">Name der Stadt</label><input class="namefield" id="cityName" maxlength="32" value="' + esc(c.name) + '"></section>' +
      '<section><h4>Stadtcharakter</h4><div class="opts">' +
      S.STYLE_KEYS.map(k => {
        const s = S.STYLES[k];
        return '<button class="opt" data-style="' + k + '" aria-pressed="' + (k === c.style) + '"><span class="swatch" style="background:linear-gradient(135deg,' + s.roof + ' 0 50%,' + s.wall + ' 50%)"></span><span><b>' + s.name + '</b><small>' + s.desc + '</small></span></button>';
      }).join('') + '</div><p class="muted">Umbau der bestehenden Stadt: ' + S.fmtMoney(restyle) + '. Neue Viertel folgen sofort dem neuen Stil.</p></section>' +
      '<section><h4>Straßennetz neuer Viertel</h4><div class="chips">' +
      Object.entries(S.LAYOUTS).map(([k, l]) => '<button class="chip" data-layout="' + k + '" aria-pressed="' + (k === c.layout) + '" title="' + l.desc + '">' + l.name + '</button>').join('') + '</div>' +
      '<p class="muted">' + S.LAYOUTS[c.layout].desc + '</p></section>' +
      '<section><div class="slider"><label for="cityMax">Höhenbegrenzung</label><output id="cityMaxOut">' + lvlName(c.maxLvl) + '</output><input type="range" id="cityMax" min="1" max="' + st.maxLvl + '" value="' + c.maxLvl + '"><small>Begrenzt, wie hoch neue Gebäude werden. Niedrige Städte wachsen in die Breite.</small></div></section>' +
      '<section><div class="chips"><button class="chip" id="btnGoCity">Auf der Karte zeigen</button><button class="chip" id="btnZoneCity">Wohnzone ringsum anlegen</button></div></section>' +
      '<section id="cityStats">' + cityStats(G, c) + '</section>';
  }
  const lvlName = (l) => ['', 'Häuser', 'Reihenhäuser', 'Wohnblöcke', 'Hochhäuser', 'Wolkenkratzer'][l];

  function cityBind(G, c, root) {
    const name = root.querySelector('#cityName');
    name.addEventListener('change', () => { const v = name.value.trim(); if (v) { c.name = v; UI.toast('Die Stadt heißt jetzt ' + v + '.', 'good'); } });
    root.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.style;
      if (k === c.style) return;
      const cost = Math.round((c.tiles + 1) * 4);
      if (G.eco.money < cost) { UI.toast('Für den Umbau fehlen ' + S.fmtMoney(cost - G.eco.money) + '.', 'bad'); return; }
      G.eco.money -= cost;
      c.style = k;
      c.maxLvl = S.STYLES[k].maxLvl;
      const t = G.t;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 0; i < G.W * G.H; i++) if (t.city[i] === c.id + 1) {
        if (t.lvl[i] > c.maxLvl) t.lvl[i] = c.maxLvl;
        const x = i % G.W, y = (i / G.W) | 0;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      S.markDirty(G, x0, y0, x1, y1);
      UI.toast(c.name + ' wird zur ' + S.STYLES[k].name + ' umgebaut.', 'good');
      UI.refresh(true);
    }));
    root.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => { c.layout = b.dataset.layout; UI.renderPanel(true); }));
    const mx = root.querySelector('#cityMax');
    mx.addEventListener('input', () => { c.maxLvl = +mx.value; root.querySelector('#cityMaxOut').textContent = lvlName(c.maxLvl); });
    root.querySelector('#btnGoCity').addEventListener('click', () => { R.centerOn(c.x, c.y, Math.max(R.cam.z, 1.2)); closePanelMobile(); });
    root.querySelector('#btnZoneCity').addEventListener('click', () => {
      const t = G.t;
      const r = Math.ceil(Math.sqrt(c.tiles + 1) * 0.9) + 3;
      let n = 0;
      for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) {
        if (!S.inb(G, x, y) || Math.hypot(x - c.x, y - c.y) > r) continue;
        const id = S.idx(G, x, y);
        if (t.zone[id] || t.forest[id]) continue;
        if (S.paintZone(G, x, y, 1).ok) n++;
      }
      UI.toast(n ? n + ' Felder als Wohnzone ausgewiesen.' : 'Rund um ' + c.name + ' ist kein freies Land mehr.', n ? 'good' : 'warn');
      UI.refresh();
    });
  }

  // ---------- Kachel-Panel ----------
  function tileFacts(G, x, y) {
    const t = G.t, id = S.idx(G, x, y);
    const lat = S.latOf(G, y), lon = S.lonOf(G, x);
    const e = t.elev[id];
    const tt = t.temp[id] - Math.max(0, e - 0.4) * 0.5;
    return {
      coord: S.fmt1(Math.abs(lat)) + '° ' + (lat >= 0 ? 'N' : 'S') + ' · ' + S.fmt1(Math.abs(lon)) + '° ' + (lon >= 0 ? 'O' : 'W'),
      height: e < 0 ? 'Tiefe ' + S.fmt(-e * 500) + ' m' : S.fmt(e * 2600) + ' m',
      temp: S.fmt1(tt * 42 - 12) + ' °C',
      rain: S.fmt(60 + Math.pow(t.moist[id] + t.irrig[id] * 0.4, 1.5) * 2000) + ' mm',
      fert: e >= 0 ? pct(Math.min(1.5, S.tileFertility(G, id)) / 1.3) : '–'
    };
  }

  function tileStats(G, x, y) {
    const t = G.t, id = S.idx(G, x, y);
    const f = tileFacts(G, x, y);
    let h = '<div class="kv"><span>Höhe</span><span>' + f.height + '</span><span>Jahresmittel</span><span>' + f.temp + '</span><span>Niederschlag</span><span>' + f.rain + '</span>' +
      '<span>Fruchtbarkeit</span><span>' + f.fert + '</span><span>Bodenschätze</span><span>' + S.RES_NAMES[t.res[id]] + '</span>' +
      '<span>Luftverschmutzung</span><span>' + pct(t.poll[id]) + '</span>' +
      (t.zone[id] ? '<span>Zone</span><span>' + S.ZONES[t.zone[id]].name + '</span>' : '') +
      (t.river[id] ? '<span>Fluss</span><span>ja</span>' : '') + (t.irrig[id] ? '<span>Bewässert</span><span>ja</span>' : '') +
      '</div>';
    const b = t.bld[id];
    if (b >= 10) {
      const def = S.BLD[b];
      const rec = G.blds.find(q => q.x === x && q.y === y);
      const o = rec ? S.buildingOutput(G, rec) : {};
      const parts = [];
      if (o.food) parts.push(S.fmt1(o.food) + ' Nahrung');
      if (o.raw) parts.push(S.fmt1(o.raw) + ' Rohstoffe');
      if (o.goods) parts.push(S.fmt1(o.goods) + ' Güter');
      if (o.energy) parts.push(Math.round(o.energy) + ' MW');
      h += '<h4>' + esc(def.name) + '</h4><p class="muted">' + esc(def.desc) + '</p><div class="kv">' +
        (parts.length ? '<span>Leistung (voll besetzt)</span><span>' + parts.join(', ') + '</span>' : '') +
        (o.rawUse ? '<span>Verbrauch</span><span>' + S.fmt1(o.rawUse) + ' Rohstoffe</span>' : '') +
        '<span>Arbeitsplätze</span><span>' + S.fmtPop(def.jobs * G.popScale) + '</span>' +
        (def.energy ? '<span>Strombedarf</span><span>' + def.energy + ' MW</span>' : '') +
        '<span>Unterhalt</span><span>' + S.fmtMoney(def.upkeep) + '/Mon.</span>' +
        '<span>Straßenanschluss</span><span class="' + (rec && rec.conn === false ? 'down' : 'up') + '">' + (rec && rec.conn === false ? 'fehlt' : 'ja') + '</span>' +
        '</div>';
      if (rec && rec.conn === false) h += '<p class="muted">Baue eine Straße bis auf zwei Felder an das Gebäude heran, die mit einer Stadt verbunden ist.</p>';
    } else if (S.isUrban(b)) {
      const c = G.cities[t.city[id] - 1];
      h += '<h4>' + S.URBAN_NAMES[b] + (b !== S.U.HALL ? ' · ' + lvlName(t.lvl[id]) : '') + '</h4><p class="muted">Gehört zu ' + esc(c ? c.name : '?') + '.</p>';
    }
    return h;
  }

  function tileBuild(G, x, y) {
    const t = G.t, id = S.idx(G, x, y);
    const f = tileFacts(G, x, y);
    const region = t.region[id] === 1 ? S.BIOME_NAMES[t.biome[id]] : t.region[id] === 2 ? 'Ausland' : 'Internationale Gewässer';
    const canDemolish = t.region[id] === 1 && (t.bld[id] && t.bld[id] !== S.U.HALL || t.road[id] || t.zone[id]);
    return '<section><p class="eyebrow">' + f.coord + '</p><h3>' + esc(region) + '</h3></section><section id="tileStats">' + tileStats(G, x, y) + '</section>' +
      (canDemolish ? '<section><div class="chips"><button class="chip" id="btnDemolish">Abreißen</button></div></section>' : '');
  }
  function tileBind(G, x, y, root) {
    const b = root.querySelector('#btnDemolish');
    if (b) b.addEventListener('click', () => {
      const r = S.bulldoze(G, x, y);
      if (!r.ok) UI.toast(r.reason, 'warn'); else UI.toast('Abgerissen (' + S.fmtMoney(r.cost) + ').', 'info');
      UI.refresh(true);
    });
  }

  UI.selectCity = function (c, center) {
    UI.sel = { city: c.id };
    R.selCity = c.id;
    R.sel = [c.x, c.y];
    if (center) R.centerOn(c.x, c.y, Math.max(R.cam.z, 1.1));
    UI.showTab('auswahl');
  };

  // ======================= Karte bedienen (Touch zuerst) =======================
  // Ein Finger verschiebt immer (außer bei Pinsel-Werkzeugen), zwei Finger zoomen.
  // Antippen wählt einen Bauplatz, gebaut wird erst über „Bauen“ in der Aktionsleiste.
  const PAINT = (t) => t.kind === 'zone' || t.kind === 'terra';
  UI.pending = null;

  function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* egal */ } }

  function bindMap() {
    const cv = $('mapCanvas');
    const ptrs = new Map();
    let mode = null; // pan | pinch | paint | tap
    let st = null, lastTap = null;
    const tileAt = (x, y) => R.screenToTile(x, y);

    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      if (!UI.G) return;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetische Zeiger */ }
      ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      closeFlyout();
      R.vel = null;
      R.zoomAnim = null;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        mode = 'pinch';
        st = { d: Math.hypot(a.x - b.x, a.y - b.y), z: R.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        return;
      }
      if (ptrs.size > 2) return;
      const tool = S.TOOLS[UI.tool];
      const [tx, ty] = tileAt(e.offsetX, e.offsetY);
      st = { x: e.offsetX, y: e.offsetY, lx: e.offsetX, ly: e.offsetY, lt: performance.now(), vx: 0, vy: 0, tx, ty, moved: false };
      if (e.button === 1 || e.button === 2) { mode = 'pan'; return; }
      if (PAINT(tool)) { mode = 'paint'; paintDone.clear(); paintAt(tx, ty); }
      else mode = 'tap';
    });
    cv.addEventListener('pointermove', (e) => {
      if (!UI.G) return;
      const p = ptrs.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') hoverAt(e); return; }
      p.x = e.offsetX; p.y = e.offsetY;
      if (mode === 'pinch' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        // Weltpunkt unter der alten Fingermitte festhalten, dann neue Mitte folgen lassen
        const [wx, wy] = R.screenToWorld(st.mx, st.my);
        R.cam.z = S.clamp(st.z * d / st.d, 0.02, R.MAX_Z);
        R.clampCam();
        R.cam.x = wx - (mx - R.cw / 2) / R.cam.z;
        R.cam.y = wy - (my - R.ch / 2) / R.cam.z;
        st.mx = mx; st.my = my; st.z = R.cam.z; st.d = d;
        R.clampCam();
        return;
      }
      if (mode === 'paint') { const [tx, ty] = tileAt(e.offsetX, e.offsetY); paintAt(tx, ty); return; }
      if (mode === 'pan' || mode === 'tap') {
        const dx = e.offsetX - st.x, dy = e.offsetY - st.y;
        if (!st.moved && Math.abs(dx) + Math.abs(dy) > 8) { st.moved = true; mode = 'pan'; }
        if (st.moved) {
          const now = performance.now(), dt = Math.max(8, now - st.lt);
          const mx = e.offsetX - st.lx, my = e.offsetY - st.ly;
          R.cam.x -= mx / R.cam.z; R.cam.y -= my / R.cam.z;
          st.vx = st.vx * 0.5 + (mx / dt) * 0.5; st.vy = st.vy * 0.5 + (my / dt) * 0.5;
          st.lx = e.offsetX; st.ly = e.offsetY; st.lt = now;
          R.clampCam();
        }
      }
    });
    const end = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (mode === 'pinch') {
        if (ptrs.size === 1) {
          const [q] = [...ptrs.values()];
          mode = 'pan';
          st = { x: q.x, y: q.y, lx: q.x, ly: q.y, lt: performance.now(), vx: 0, vy: 0, moved: true };
        } else if (ptrs.size === 0) mode = null;
        return;
      }
      if (ptrs.size) return;
      if (mode === 'pan' && st.moved && performance.now() - st.lt < 90) {
        R.vel = { x: -st.vx / R.cam.z, y: -st.vy / R.cam.z };
      }
      if (mode === 'tap' && !st.moved) {
        const [tx, ty] = tileAt(e.offsetX, e.offsetY);
        const now = performance.now();
        if (UI.tool === 'inspect' && lastTap && now - lastTap.t < 320 && Math.hypot(e.offsetX - lastTap.x, e.offsetY - lastTap.y) < 30) {
          zoomAt(e.offsetX, e.offsetY, 2);
          lastTap = null;
        } else {
          lastTap = { t: now, x: e.offsetX, y: e.offsetY };
          tapAt(tx, ty);
        }
      } else if (mode === 'paint') UI.refresh();
      mode = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (!ptrs.size) mode = null; });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !mode) { R.hover = null; hideTip(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [wx, wy] = R.screenToWorld(e.offsetX, e.offsetY);
      R.cam.z *= Math.exp(-e.deltaY * 0.0015);
      R.clampCam();
      R.cam.x = wx - (e.offsetX - R.cw / 2) / R.cam.z;
      R.cam.y = wy - (e.offsetY - R.ch / 2) / R.cam.z;
      R.clampCam();
    }, { passive: false });
    $('zoomIn').addEventListener('click', () => zoomAt(R.cw / 2, R.ch / 2, 1.8));
    $('zoomOut').addEventListener('click', () => zoomAt(R.cw / 2, R.ch / 2, 1 / 1.8));
  }

  /** Weiches Zoomen um einen Bildschirmpunkt */
  function zoomAt(sx, sy, f) {
    const [wx, wy] = R.screenToWorld(sx, sy);
    const z1 = S.clamp(R.cam.z * f, 0.02, R.MAX_Z);
    R.zoomAnim = { z0: R.cam.z, z1, wx, wy, sx, sy, t: 0 };
  }

  /** Pro Bild: Schwung beim Verschieben und Zoom-Animation */
  UI.frame = function (dt) {
    if (R.zoomAnim) {
      const a = R.zoomAnim;
      a.t = Math.min(1, a.t + dt / 260);
      const e = 1 - Math.pow(1 - a.t, 3);
      R.cam.z = Math.exp(Math.log(a.z0) + (Math.log(a.z1) - Math.log(a.z0)) * e);
      R.cam.x = a.wx - (a.sx - R.cw / 2) / R.cam.z;
      R.cam.y = a.wy - (a.sy - R.ch / 2) / R.cam.z;
      R.clampCam();
      if (a.t >= 1) R.zoomAnim = null;
    } else if (R.vel) {
      R.cam.x += R.vel.x * dt; R.cam.y += R.vel.y * dt;
      const f = Math.pow(0.92, dt / 16);
      R.vel.x *= f; R.vel.y *= f;
      R.clampCam();
      if (Math.abs(R.vel.x) + Math.abs(R.vel.y) < 0.01) R.vel = null;
    }
  };

  // --- Linien (Straße, Bahn)
  function linePath(x0, y0, x1, y1) {
    const out = [];
    const hFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
    let x = x0, y = y0;
    const push = () => { if (S.inb(UI.G, x, y)) out.push([x, y]); };
    push();
    if (hFirst) { while (x !== x1) { x += Math.sign(x1 - x); push(); } while (y !== y1) { y += Math.sign(y1 - y); push(); } }
    else { while (y !== y1) { y += Math.sign(y1 - y); push(); } while (x !== x1) { x += Math.sign(x1 - x); push(); } }
    return out;
  }
  function linePreview(sx, sy, tx, ty) {
    const G = UI.G, kind = S.TOOLS[UI.tool].kind, bit = kind === 'rail' ? 2 : 1;
    let cost = 0;
    const tiles = linePath(sx, sy, tx, ty).map(([x, y]) => {
      const id = S.idx(G, x, y);
      const ok = S.canRoad(G, id);
      if (ok && !(G.t.road[id] & bit)) cost += S.roadCost(G, id, kind);
      return { x, y, ok };
    });
    return { tiles, cost };
  }
  function commitLine() {
    const G = UI.G, p = UI.pending, kind = S.TOOLS[UI.tool].kind;
    if (!p || !p.path) return;
    const ids = p.path.tiles.filter(t => t.ok).map(t => S.idx(G, t.x, t.y));
    const r = S.buildRoad(G, ids, kind);
    if (r.n) { UI.toast((kind === 'rail' ? 'Bahnstrecke' : 'Straße') + ': ' + r.n + ' Felder für ' + S.fmtMoney(r.cost) + '.', 'info', 1800); vibrate(12); }
    else UI.toast(G.eco.money < 2 ? 'Nicht genug Geld.' : 'Hier liegt schon alles.', 'warn');
    // weiterbauen: das Ende wird der neue Anfang
    UI.pending = { start: [p.end[0], p.end[1]] };
    syncPreview();
    UI.refresh();
  }

  // --- Malen (Zonen, Landschaft)
  let lastErr = 0;
  const paintDone = new Set();
  function err(msg) { const n = performance.now(); if (n - lastErr > 1500) { UI.toast(msg, 'warn'); lastErr = n; } }
  function paintAt(tx, ty) {
    const G = UI.G, tool = S.TOOLS[UI.tool];
    const key = tx + ',' + ty;
    if (!S.inb(G, tx, ty) || paintDone.has(key)) return;
    paintDone.add(key);
    const r = tool.kind === 'zone' ? S.paintZone(G, tx, ty, tool.zone) : S.terraform(G, tool.op, tx, ty);
    if (!r.ok && r.reason && tool.kind !== 'zone') err(r.reason);
    if (r.ok) UI.refreshTopOnly();
  }

  // --- Antippen
  function tapAt(tx, ty) {
    const G = UI.G, tool = S.TOOLS[UI.tool];
    if (!S.inb(G, tx, ty)) return;
    if (tool.kind === 'inspect') {
      const id = S.idx(G, tx, ty);
      const cid = G.t.city[id];
      if (cid && (S.isUrban(G.t.bld[id]) || G.t.road[id])) UI.selectCity(G.cities[cid - 1]);
      else { UI.sel = { x: tx, y: ty }; R.sel = [tx, ty]; R.selCity = null; UI.showTab('auswahl'); }
      openPanelMobile();
      return;
    }
    if (tool.kind === 'road' || tool.kind === 'rail') {
      const p = UI.pending;
      if (!p || !p.start) UI.pending = { start: [tx, ty] };
      else if (p.start[0] === tx && p.start[1] === ty) UI.pending = { start: [tx, ty] };
      else UI.pending = { start: p.start, end: [tx, ty], path: linePreview(p.start[0], p.start[1], tx, ty) };
    } else UI.pending = { at: [tx, ty] };
    vibrate(6);
    syncPreview();
  }

  /** Vorschau auf der Karte und Aktionsleiste aus UI.pending ableiten */
  function syncPreview() {
    const G = UI.G, tool = S.TOOLS[UI.tool], p = UI.pending;
    const bar = $('actionBar');
    if (tool.kind === 'inspect') { bar.hidden = true; R.preview = null; return; }
    bar.hidden = false;
    let info = '', okBtn = null, okEnabled = false, extra = '';
    R.preview = null;
    if (PAINT(tool)) {
      info = (tool.kind === 'zone' ? 'Mit einem Finger über die Karte malen.' : 'Mit einem Finger malen (Pinsel 3×3), ' + tool.cost + ' Mio. T pro Feld.') + ' Zwei Finger verschieben.';
    } else if (tool.kind === 'road' || tool.kind === 'rail') {
      if (!p || !p.start) info = 'Tippe auf den Startpunkt. Ziehen verschiebt die Karte.';
      else if (!p.path) { info = 'Start gesetzt. Tippe jetzt auf das Ziel.'; R.preview = { tiles: [{ x: p.start[0], y: p.start[1], ok: true }] }; }
      else {
        const bad = p.path.tiles.filter(t => !t.ok).length;
        info = '<b>' + p.path.tiles.length + ' Felder · ' + S.fmtMoney(p.path.cost) + '</b>' + (bad ? '<br><span class="err">' + bad + ' Felder nicht bebaubar</span>' : '') + (p.path.cost > G.eco.money ? '<br><span class="err">Nicht genug Geld</span>' : '');
        R.preview = { tiles: p.path.tiles };
        okBtn = 'Bauen'; okEnabled = p.path.cost > 0 && p.path.tiles.some(t => t.ok);
        extra = '<button class="btn btn-small" data-act="restart">Neu ansetzen</button>';
      }
    } else if (!p || !p.at) {
      info = tool.kind === 'bulldoze' ? 'Tippe auf das, was weg soll.' : 'Tippe auf die Karte, um den Bauplatz zu wählen.';
    } else {
      const [x, y] = p.at;
      if (tool.kind === 'build') {
        const r = S.canPlace(G, tool.bld, x, y);
        const radius = tool.bld === 30 || tool.bld === 31 ? S.SERVICE_RADIUS : tool.bld === 33 || tool.bld === 34 ? 10 : 0;
        R.preview = { tiles: [{ x, y, ok: r.ok }], radius };
        if (r.ok) {
          const o = S.buildingOutput(G, { x, y, b: tool.bld });
          const parts = [];
          if (o.food) parts.push(S.fmt1(o.food) + ' Nahrung');
          if (o.raw) parts.push(S.fmt1(o.raw) + ' Rohstoffe');
          if (o.goods) parts.push(S.fmt1(o.goods) + ' Güter');
          if (o.energy) parts.push(Math.round(o.energy) + ' MW');
          const road = S.countAround(G, x, y, 2, n => G.t.road[n] || S.isUrban(G.t.bld[n]));
          info = '<b>' + S.fmtMoney(tool.cost) + '</b>' + (parts.length ? ' · Ertrag hier: ' + parts.join(', ') : '') + (road ? '' : '<br><span class="warn">Keine Straße in der Nähe – nur 40 % Leistung</span>');
          okBtn = 'Bauen'; okEnabled = G.eco.money >= tool.cost;
          if (!okEnabled) info += '<br><span class="err">Nicht genug Geld</span>';
        } else info = '<span class="err">' + esc(r.reason) + '</span>';
      } else if (tool.kind === 'city') {
        const r = S.canFoundCity(G, x, y);
        R.preview = { tiles: [{ x, y, ok: r.ok }], radius: 6 };
        info = r.ok ? '<b>500 Mio. T</b> · Hier entsteht deine neue Stadt.' : '<span class="err">' + esc(r.reason) + '</span>';
        okBtn = 'Gründen'; okEnabled = r.ok;
      } else if (tool.kind === 'bulldoze') {
        const t = G.t, id = S.idx(G, x, y), b = t.bld[id];
        const what = b >= 10 ? S.BLD[b].name : S.isUrban(b) ? S.URBAN_NAMES[b] : t.road[id] ? ((t.road[id] & 2) ? 'Bahnstrecke' : 'Straße') : t.zone[id] ? S.ZONES[t.zone[id]].name : null;
        const ok = t.region[id] === 1 && what && b !== S.U.HALL;
        R.preview = { tiles: [{ x, y, ok }] };
        info = ok ? 'Abreißen: <b>' + esc(what) + '</b>' : '<span class="err">' + (b === S.U.HALL ? 'Das Rathaus bleibt stehen' : 'Hier gibt es nichts abzureißen') + '</span>';
        okBtn = 'Abreißen'; okEnabled = !!ok;
      }
    }
    $('abIcon').innerHTML = '';
    $('abIcon').appendChild(R.toolIcon(tool, 34));
    $('abName').textContent = tool.name;
    $('abInfo').innerHTML = info;
    $('abExtra').innerHTML = extra;
    const ok = $('abOk');
    ok.hidden = !okBtn;
    if (okBtn) { ok.textContent = okBtn; ok.disabled = !okEnabled; }
  }
  UI.syncPreview = syncPreview;

  function confirmAction() {
    const G = UI.G, tool = S.TOOLS[UI.tool], p = UI.pending;
    if (!p) return;
    if (tool.kind === 'road' || tool.kind === 'rail') return commitLine();
    const [x, y] = p.at;
    if (tool.kind === 'build') {
      const r = S.placeBuilding(G, tool.bld, x, y);
      if (!r.ok) { UI.toast(r.reason, 'warn'); return; }
      UI.toast(S.BLD[tool.bld].name + ' gebaut (' + S.fmtMoney(r.cost) + ').', 'good', 1800);
      vibrate(15);
    } else if (tool.kind === 'city') {
      const r = S.canFoundCity(G, x, y);
      if (!r.ok) { UI.toast(r.reason, 'warn'); return; }
      openFoundCity(x, y);
    } else if (tool.kind === 'bulldoze') {
      const r = S.bulldoze(G, x, y);
      if (!r.ok) { UI.toast(r.reason, 'warn'); return; }
      UI.toast('Abgerissen (' + S.fmtMoney(r.cost) + ').', 'info', 1600);
      vibrate(12);
    }
    UI.pending = null;
    syncPreview();
    UI.refresh();
  }

  function bindActionBar() {
    $('abOk').addEventListener('click', confirmAction);
    $('abDone').addEventListener('click', () => UI.selectTool('inspect'));
    $('abExtra').addEventListener('click', (e) => {
      if (e.target.dataset.act === 'restart') { UI.pending = null; syncPreview(); }
    });
  }

  // --- Maus: Vorschau beim Überfahren (nur am Computer)
  function hoverAt(e) {
    const G = UI.G;
    const [tx, ty] = R.screenToTile(e.offsetX, e.offsetY);
    if (!S.inb(G, tx, ty)) { R.hover = null; hideTip(); return; }
    R.hover = [tx, ty];
    if (UI.tool !== 'inspect') { hideTip(); return; }
    const t = G.t, id = S.idx(G, tx, ty);
    const cid = t.city[id];
    let txt = t.region[id] === 1 ? S.BIOME_NAMES[t.biome[id]] : t.region[id] === 2 ? 'Ausland' : 'Meer';
    if (cid) { const c = G.cities[cid - 1]; txt = '<b>' + esc(c.name) + '</b> · ' + S.fmtPop(c.pop * S.cityScale(G)) + '<br>' + txt; }
    else if (t.bld[id] >= 10) txt = '<b>' + S.BLD[t.bld[id]].name + '</b><br>' + txt;
    if (t.res[id]) txt += ' · ' + S.RES_NAMES[t.res[id]];
    showTip(e, txt);
  }

  function showTip(e, html) {
    const tip = $('tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    const w = $('mapWrap').clientWidth;
    let x = e.offsetX + 16, y = e.offsetY + 14;
    if (x + 240 > w) x = e.offsetX - 250;
    tip.style.left = Math.max(4, x) + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { $('tooltip').hidden = true; }

  UI.refreshTopOnly = function () {
    const G = UI.G;
    const el = $('tbStats').firstElementChild;
    if (el) el.querySelector('b').textContent = S.fmtMoney(G.eco.money);
  };

  // ======================= Dialoge =======================
  function openModal(html, onBind, opts) {
    const m = $('modal'), box = $('modalBox');
    box.innerHTML = html;
    m.hidden = false;
    UI.modalOpen = true;
    UI._prevSpeed = UI._prevSpeed ?? UI.speed;
    if (!opts || !opts.keepRunning) UI.setSpeed(0);
    if (onBind) onBind(box);
    const first = box.querySelector('button, input');
    if (first) first.focus({ preventScroll: true });
  }
  UI.openModal = openModal;
  function closeModal(resume) {
    $('modal').hidden = true;
    UI.modalOpen = false;
    if (resume !== false && UI._prevSpeed !== undefined) UI.setSpeed(UI._prevSpeed || 1);
    UI._prevSpeed = undefined;
  }
  UI.closeModal = closeModal;

  UI.showEvent = function (ev) {
    const G = UI.G;
    if (ev.focus) R.centerOn(ev.focus[0], ev.focus[1], Math.max(R.cam.z, 1));
    openModal('<p class="eyebrow">' + S.dateStr(G.month) + (ev.over ? ' · Ende der Amtszeit' : ' · Ereignis') + '</p><h2>' + esc(ev.title) + '</h2><p class="lead">' + esc(ev.text) + '</p><div class="choices">' +
      ev.choices.map((c, i) => '<button class="btn' + (i === 0 ? ' btn-primary' : '') + '" data-i="' + i + '">' + esc(c.label) + '</button>').join('') + '</div>', (box) => {
      box.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
        ev.choices[+b.dataset.i].fx(G);
        G.pendingEvent = null;
        G._netDirty = true;
        closeModal();
        UI.refresh(true);
      }));
    });
  };

  const PRE = ['Neu', 'Hohen', 'Grün', 'Sonnen', 'Weiß', 'Stein', 'Wald', 'See', 'Berg', 'Lichten', 'Frei', 'Gold', 'Silber', 'Rosen', 'Linden', 'Eichen', 'Falken', 'Morgen', 'Abend', 'Sternen'];
  const SUF = ['burg', 'feld', 'hafen', 'stadt', 'au', 'tal', 'heim', 'dorf', 'furt', 'brück', 'hausen', 'walde', 'berg', 'see', 'wiesen'];
  function suggestName(G) {
    for (let k = 0; k < 50; k++) {
      const n = PRE[Math.floor(Math.random() * PRE.length)] + SUF[Math.floor(Math.random() * SUF.length)];
      if (!G.cities.some(c => c.name === n)) return n;
    }
    return 'Neustadt ' + G.cities.length;
  }

  function openFoundCity(x, y) {
    const G = UI.G;
    const id = S.idx(G, x, y);
    const hot = G.t.temp[id] > 0.68 && G.t.moist[id] < 0.5;
    let style = hot ? 'mediterran' : 'garten', layout = 'organisch';
    const html = () => '<p class="eyebrow">Neue Stadt · ' + S.fmt1(Math.abs(S.latOf(G, y))) + '° ' + (S.latOf(G, y) >= 0 ? 'N' : 'S') + '</p><h2>Stadt gründen</h2>' +
      '<label class="field" for="newCityName">Name</label><input id="newCityName" type="text" maxlength="32" value="' + esc(suggestName(G)) + '">' +
      '<label class="field">Stadtcharakter</label><div class="opts grid2">' + S.STYLE_KEYS.map(k => '<button class="opt" data-style="' + k + '" aria-pressed="' + (k === style) + '"><span class="swatch" style="background:linear-gradient(135deg,' + S.STYLES[k].roof + ' 0 50%,' + S.STYLES[k].wall + ' 50%)"></span><span><b>' + S.STYLES[k].short + '</b><small>' + S.STYLES[k].desc + '</small></span></button>').join('') + '</div>' +
      '<label class="field">Straßennetz</label><div class="chips">' + Object.entries(S.LAYOUTS).map(([k, l]) => '<button class="chip" data-layout="' + k + '" aria-pressed="' + (k === layout) + '">' + l.name + '</button>').join('') + '</div>' +
      '<p class="muted">Neue Städte ziehen in den ersten vier Jahren viele Menschen an. Verbinde sie per Straße mit dem Netz und gib ihnen Arbeit.</p>' +
      '<div class="row-end"><button class="btn btn-ghost" id="ncCancel">Abbrechen</button><button class="btn btn-primary" id="ncOk">Gründen · 500 Mio. T</button></div>';
    const bind = (box) => {
      box.querySelectorAll('[data-style]').forEach(b => b.addEventListener('click', () => { style = b.dataset.style; box.querySelectorAll('[data-style]').forEach(o => o.setAttribute('aria-pressed', o === b)); }));
      box.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => { layout = b.dataset.layout; box.querySelectorAll('[data-layout]').forEach(o => o.setAttribute('aria-pressed', o === b)); }));
      box.querySelector('#ncCancel').addEventListener('click', () => closeModal());
      box.querySelector('#ncOk').addEventListener('click', () => {
        const name = box.querySelector('#newCityName').value.trim() || suggestName(G);
        const chk = S.canFoundCity(G, x, y);
        if (!chk.ok) { UI.toast(chk.reason, 'warn'); closeModal(); return; }
        G.eco.money -= S.TOOLS.city.cost;
        const c = S.foundCity(G, x, y, name, style, layout, false);
        S.log(G, name + ' wurde gegründet.', 'good');
        closeModal();
        UI.selectCity(c);
        UI.selectTool('inspect');
        UI.refresh(true);
      });
    };
    openModal(html(), bind);
  }

  UI.openMenu = function () {
    openModal('<p class="eyebrow">Staatskanzlei</p><h2>Menü</h2><div class="choices">' +
      '<button class="btn" id="mResume">Weiterregieren</button>' +
      '<button class="btn" id="mSave">Spiel speichern</button>' +
      '<button class="btn" id="mHelp">Spielanleitung</button>' +
      '<button class="btn" id="mWorld">Anderes Land wählen</button>' +
      '</div><p class="muted">Das Spiel speichert auch automatisch einmal im Jahr in diesem Browser.</p>', (box) => {
      box.querySelector('#mResume').addEventListener('click', () => closeModal());
      box.querySelector('#mSave').addEventListener('click', () => { const ok = S.save(UI.G); UI.toast(ok ? 'Gespeichert.' : 'Speichern ist in diesem Browser nicht möglich.', ok ? 'good' : 'bad'); closeModal(); });
      box.querySelector('#mHelp').addEventListener('click', () => UI.openHelp());
      box.querySelector('#mWorld').addEventListener('click', () => {
        openModal('<h2>Land verlassen?</h2><p class="lead">Dein aktuelles Spiel wird vorher gespeichert und kann über „Weiterspielen“ fortgesetzt werden.</p><div class="row-end"><button class="btn btn-ghost" id="nNo">Bleiben</button><button class="btn btn-primary" id="nYes">Zur Weltkarte</button></div>', (b2) => {
          b2.querySelector('#nNo').addEventListener('click', () => closeModal());
          b2.querySelector('#nYes').addEventListener('click', () => { S.save(UI.G); closeModal(false); S.toWorld(); });
        });
      });
    });
  };

  UI.openHelp = function () {
    openModal('<p class="eyebrow">Spielanleitung</p><h2>So regierst du</h2><div class="helpgrid">' +
      '<p><b>Ziel.</b> Halte dein Volk zufrieden und die Kasse gefüllt. In der Demokratie wird alle vier Jahre gewählt – unter 50 % Zustimmung ist deine Amtszeit vorbei.</p>' +
      '<p><b>Wirtschaft.</b> Bauernhöfe und Fischereien liefern Nahrung, Bergwerke, Sägewerke und Ölpumpen Rohstoffe, Fabriken machen daraus Güter. Überschüsse werden exportiert, Mängel teuer importiert.</p>' +
      '<p><b>Strom.</b> Ohne genug Kraftwerke stockt die Industrie und Städte wachsen nicht in die Höhe.</p>' +
      '<p><b>Anschluss.</b> Gebäude brauchen eine Straße in höchstens zwei Feldern Abstand, die zu einer Stadt führt. Städte ohne Verbindung zur Hauptstadt sind unzufrieden.</p>' +
      '<p><b>Städte formen.</b> Städte wachsen von selbst, wenn die Menschen zufrieden sind und es Arbeit gibt. Mit Zonen lenkst du, wo Wohnungen, Gewerbe und Industrie entstehen, mit dem Grüngürtel hältst du Flächen frei. Im Stadtpanel bestimmst du Stil, Straßennetz und Bauhöhe.</p>' +
      '<p><b>Landschaft.</b> Hebe Land aus dem Meer, grabe Seen, forste auf oder bewässere Wüsten, damit Felder dort gedeihen.</p>' +
      '<p><b>Steuerung.</b> Ein Finger verschiebt die Karte, zwei Finger zoomen, doppelt tippen zoomt hinein. Wähle unten ein Werkzeug, tippe auf den Bauplatz und bestätige mit „Bauen“. Straßen: Start antippen, Ziel antippen, bauen – das Ziel ist gleich der nächste Start. Zonen und Gelände malst du mit einem Finger, verschoben wird dann mit zwei.</p>' +
      '<p><b>Zeit.</b> Ein Monat dauert 6 Sekunden, schneller geht es mit den Pfeilen oben. Pause hält alles an.</p>' +
      '</div><div class="row-end"><button class="btn btn-primary" id="hOk">Verstanden</button></div>', (box) => {
      box.querySelector('#hOk').addEventListener('click', () => closeModal());
    });
  };

  UI.openBriefing = function (G) {
    const I = S.INCOME[G.meta.inc], gov = S.GOVS[G.meta.gov];
    const cap = G.cities.find(c => c.capital) || G.cities[0];
    openModal('<p class="eyebrow">Amtsantritt · ' + S.dateStr(G.month) + '</p><h2>' + esc(G.meta.name) + '</h2>' +
      '<p class="lead">' + (G.meta.ruler ? esc(gov.title + ' ' + G.meta.ruler) + ', das' : 'Das') + ' Land gehört dir. ' + S.fmtPop(G.eco.last.pop * G.popScale) + ' Menschen in ' + G.cities.length + ' großen Städten erwarten, dass du es voranbringst. Regierungssitz ist ' + esc(cap.name) + '.</p>' +
      '<div class="kv"><span>Regierungsform</span><span>' + gov.name + '</span><span>Wirtschaftslage</span><span>' + I.name + '</span><span>Staatskasse</span><span>' + S.fmtMoney(G.eco.money) + '</span><span>Fläche je Feld</span><span>≈ ' + S.fmt(G.kmPerTile) + ' km</span></div>' +
      '<p class="muted">Ein Finger verschiebt die Karte, zwei Finger zoomen. Zum Bauen ein Werkzeug unten wählen, Platz antippen, „Bauen“ drücken. Erste Schritte: Lagebericht lesen, für Strom sorgen, Gebäude per Straße anschließen und Wohnzonen ausweisen.</p>' +
      '<div class="row-end"><button class="btn btn-ghost" id="bHelp">Anleitung</button><button class="btn btn-primary" id="bGo">Regieren</button></div>', (box) => {
      box.querySelector('#bGo').addEventListener('click', () => closeModal());
      box.querySelector('#bHelp').addEventListener('click', () => UI.openHelp());
    });
  };

  // ======================= Meldungen =======================
  UI.toast = function (text, kind, ms) {
    const box = $('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = text;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => el.remove(), ms || 4200);
  };

  function openPanelMobile() { $('panel').classList.add('open'); $('flyout').hidden = true; }
  function closePanelMobile() { $('panel').classList.remove('open'); }

  function bindGlobal() {
    document.querySelectorAll('.speed button').forEach(b => b.addEventListener('click', () => UI.setSpeed(+b.dataset.speed)));
    $('btnMenu').addEventListener('click', () => UI.openMenu());
    $('btnPanel').addEventListener('click', () => { $('flyout').hidden = true; $('panel').classList.toggle('open'); });
    $('btnPanelClose').addEventListener('click', closePanelMobile);
    document.addEventListener('keydown', (e) => {
      if (!UI.G || $('screen-game').hidden) return;
      if (e.target.matches('input, textarea')) return;
      if (UI.modalOpen) { if (e.key === 'Escape' && !UI.G.pendingEvent) closeModal(); return; }
      const k = e.key;
      const step = 60 / R.cam.z;
      if (k === ' ') { e.preventDefault(); UI.setSpeed(UI.speed ? 0 : (UI._lastSpeed || 1)); if (UI.speed) UI._lastSpeed = UI.speed; }
      else if (k === '1' || k === '2' || k === '3') { UI.setSpeed(+k); UI._lastSpeed = +k; }
      else if (k === 'Escape') { UI.selectTool('inspect'); closeFlyout(); }
      else if (k === 'ArrowLeft' || k === 'a') R.cam.x -= step;
      else if (k === 'ArrowRight' || k === 'd') R.cam.x += step;
      else if (k === 'ArrowUp' || k === 'w') R.cam.y -= step;
      else if (k === 'ArrowDown' || k === 's') R.cam.y += step;
      else if (k === '+' || k === '=') R.cam.z *= 1.2;
      else if (k === '-') R.cam.z /= 1.2;
      else return;
      R.clampCam();
    });
  }
})(S);
