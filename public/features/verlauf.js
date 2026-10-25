const { h, api, state, css, addUsageSection, onPoll } = window.Hafen;
css(`
.verlauf { margin-top:18px; min-width:0 }
.verlauf-kopf,.verlauf-schalter { display:flex; align-items:center; flex-wrap:wrap; gap:10px }
.verlauf-kopf { justify-content:space-between; margin-bottom:16px }
.verlauf h3 { font-size:18px }
.verlauf select { width:auto; max-width:100%; min-width:120px }
.verlauf .seg { flex-wrap:wrap }
.verlauf-diagramm { position:relative; height:220px; touch-action:pan-y; outline-offset:4px }
.verlauf-diagramm svg { display:block; width:100%; height:100%; overflow:visible }
.verlauf-tooltip { position:absolute; top:6px; max-width:85%; padding:8px 12px; border:1px solid var(--line-2); border-radius:12px; background:rgba(16,20,24,.96); pointer-events:none; font-size:12px; white-space:pre-line; z-index:1 }
.verlauf-zahlen { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:14px }
.verlauf-zahlen div { padding:10px; border-radius:12px; background:var(--card); overflow-wrap:anywhere }
.verlauf-zahlen span,.verlauf-legende,.verlauf-status { font-size:12px; color:var(--text-2) }
.verlauf-zahlen b { display:block; margin-top:4px; font-variant-numeric:tabular-nums; font-size:14px }
.verlauf-legende { margin-bottom:10px }
.verlauf-status { margin:8px 0 }
@media(max-width:600px) { .verlauf { padding:16px 12px } .verlauf-diagramm { height:185px } .verlauf-zahlen { gap:5px } .verlauf-zahlen div { padding:8px } .verlauf-zahlen b { font-size:12px } }
`);
const svg = (tag, attrs = {}, text) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
};
let karte, bereich = '1h', messung = 'cpu', app = '', daten, geladen = 0, lauf = 0;
let diagramm, zahlen, status, legende, auswahl, beobachter, timer, index = -1, appSignatur = '';
const format = v => v === null || v === undefined ? '—' : messung === 'cpu'
  ? `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
  : messung === 'ram' ? `${(v / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`
    : `${(v / (v >= 1024 ** 2 ? 1024 ** 2 : 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} ${v >= 1024 ** 2 ? 'MB/s' : 'KB/s'}`;
const zeit = t => new Date(t).toLocaleString('de-DE', { ...(bereich === '7d' ? { weekday: 'short' } : {}), hour: '2-digit', minute: '2-digit' });
function zeichnen() {
  if (!diagramm || !karte.isConnected) return;
  diagramm.replaceChildren(); zahlen.replaceChildren();
  diagramm.onpointermove = diagramm.onpointerdown = diagramm.onpointerleave = diagramm.onkeydown = null;
  const ps = daten?.punkte || [], keys = messung === 'netz' ? ['rx', 'tx'] : [messung];
  legende.textContent = messung === 'netz' ? '● Empfangen (Petrol)   ● Gesendet (Gold)' : messung === 'cpu' ? 'Petrol: Durchschnitt · Helle Linie: CPU-Spitzen' : '';
  if (!ps.some(p => keys.some(k => p[k] !== null && p[k] !== undefined))) {
    diagramm.append(h('div', { class: 'empty' }, app && messung === 'netz' ? 'Netzwerkwerte sind nur für das System verfügbar.' : 'Hafen sammelt gerade die ersten Messwerte – nach ein paar Minuten erscheint hier der Verlauf.'));
    return;
  }
  const w = Math.max(240, diagramm.clientWidth), ht = diagramm.clientHeight, links = 65, rechts = w - 12, oben = 12, unten = ht - 30;
  const farben = ['var(--brand-hi)', 'var(--warn)'];
  const werte = ps.flatMap(p => [...keys.map(k => p[k]), ...(messung === 'cpu' ? [p.cpuMax] : [])]).filter(v => Number.isFinite(v));
  const max = Math.max(messung === 'cpu' ? 100 : 1, ...werte) * (messung === 'cpu' ? 1 : 1.1);
  const x = t => links + (t - daten.von) / (daten.bis - daten.von) * (rechts - links), y = v => unten - v / max * (unten - oben);
  const bild = svg('svg', { viewBox: `0 0 ${w} ${ht}`, 'aria-hidden': 'true' });
  const defs = svg('defs'), verlauf = svg('linearGradient', { id: 'verlauf-flaeche', x1: '0', y1: '0', x2: '0', y2: '1' });
  verlauf.append(svg('stop', { offset: '0%', 'stop-color': 'var(--brand-hi)', 'stop-opacity': '.3' }), svg('stop', { offset: '100%', 'stop-color': 'var(--brand-hi)', 'stop-opacity': '.02' }));
  defs.append(verlauf); bild.append(defs);
  for (let i = 0; i < 4; i++) {
    const v = max * i / 3, yy = y(v);
    bild.append(svg('line', { x1: links, x2: rechts, y1: yy, y2: yy, stroke: 'var(--line-2)' }),
      svg('text', { x: links - 7, y: yy + 4, 'text-anchor': 'end', fill: 'var(--text-2)', 'font-size': 10 }, format(v)));
  }
  const ticks = w < 480 ? 4 : 6;
  for (let i = 0; i < ticks; i++) {
    const t = daten.von + i / (ticks - 1) * (daten.bis - daten.von);
    bild.append(svg('text', { x: x(t), y: ht - 6, 'text-anchor': i === 0 ? 'start' : i === ticks - 1 ? 'end' : 'middle', fill: 'var(--text-2)', 'font-size': 10 }, zeit(t)));
  }
  function linie(key, farbe, flaeche, duenn = false) {
    let segment = [];
    const fertig = () => {
      if (!segment.length) return;
      const pfad = segment.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)},${y(p[key])}`).join(' ');
      if (flaeche) bild.append(svg('path', { d: `${pfad} L${x(segment.at(-1).t)},${unten} L${x(segment[0].t)},${unten} Z`, fill: 'url(#verlauf-flaeche)' }));
      bild.append(svg('path', { d: pfad, fill: 'none', stroke: farbe, 'stroke-width': duenn ? 1 : 2, 'stroke-linejoin': 'round' }));
      if (segment.length === 1) bild.append(svg('circle', { cx: x(segment[0].t), cy: y(segment[0][key]), r: 2, fill: farbe }));
      segment = [];
    };
    ps.forEach(p => { if (Number.isFinite(p[key])) segment.push(p); else fertig(); }); fertig();
  }
  keys.forEach((k, i) => linie(k, farben[i], i === 0));
  if (messung === 'cpu') linie('cpuMax', 'var(--text-2)', false, true);
  const zeiger = svg('g'), tooltip = h('div', { class: 'verlauf-tooltip', role: 'status', hidden: true });
  bild.append(zeiger); diagramm.append(bild, tooltip);
  function zeigen(i) {
    index = Math.max(0, Math.min(ps.length - 1, i));
    const p = ps[index], xx = x(p.t);
    zeiger.replaceChildren(svg('line', { x1: xx, x2: xx, y1: oben, y2: unten, stroke: 'var(--text-2)', 'stroke-dasharray': '3 3' }));
    keys.forEach((k, n) => { if (Number.isFinite(p[k])) zeiger.append(svg('circle', { cx: xx, cy: y(p[k]), r: 4, fill: farben[n] })); });
    tooltip.hidden = false;
    tooltip.textContent = `${zeit(p.t)}\n${messung === 'netz' ? `Empfangen: ${format(p.rx)}\nGesendet: ${format(p.tx)}` : `${format(p[messung])}${messung === 'cpu' ? ` · Spitze: ${format(p.cpuMax)}` : ''}`}`;
    tooltip.style.left = `${Math.max(0, Math.min(w - tooltip.offsetWidth, xx + 10))}px`;
  }
  diagramm.onpointermove = e => {
    const pos = (e.clientX - diagramm.getBoundingClientRect().left - links) / (rechts - links);
    zeigen(Math.round(pos * ps.length - .5));
  };
  diagramm.onpointerdown = diagramm.onpointermove;
  diagramm.onpointerleave = () => { zeiger.replaceChildren(); tooltip.hidden = true; };
  diagramm.onkeydown = e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); zeigen(index < 0 ? ps.length - 1 : index + (e.key === 'ArrowRight' ? 1 : -1));
  };
  const stats = keys.map(k => {
    const vs = ps.map(p => p[k]).filter(Number.isFinite);
    const spitzen = ps.map(p => messung === 'cpu' ? p.cpuMax : p[k]).filter(Number.isFinite);
    return [vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null, spitzen.length ? Math.max(...spitzen) : null, ps.at(-1)?.[k]];
  });
  ['Durchschnitt', 'Höchstwert', 'Aktueller Wert'].forEach((label, i) => zahlen.append(h('div', {}, h('span', {}, label),
    h('b', {}, stats.map(s => format(s[i])).join(' / ')))));
}
async function laden() {
  if (!karte?.isConnected) return;
  const nr = ++lauf; geladen = Date.now();
  status.textContent = 'Verlauf wird geladen …';
  try {
    const result = await api(`/api/verlauf?bereich=${bereich}${app ? `&app=${encodeURIComponent(app)}` : ''}`);
    if (nr !== lauf || !karte.isConnected) return;
    daten = result; status.textContent = app && messung === 'cpu' ? 'App-CPU: 100 % entsprechen einem vollständig genutzten Kern.' : 'Messung jede Minute. Kennzahlen beziehen sich auf die dargestellten Zeitfenster.';
    zeichnen();
  } catch (e) { if (nr === lauf) { daten = null; zeichnen(); status.textContent = `Verlauf konnte nicht geladen werden: ${e.message}`; } }
}
function optionen() {
  const apps = state.apps.filter(a => a.installed), signatur = JSON.stringify(apps.map(a => [a.id, a.name]));
  if (signatur === appSignatur) return;
  appSignatur = signatur;
  auswahl.replaceChildren(h('option', { value: '' }, 'System'), ...apps.map(a => h('option', { value: a.id }, a.name)));
  if (app && !apps.some(a => a.id === app)) { app = ''; void laden(); }
  auswahl.value = app;
}
function aktivieren() {
  if (!karte?.isConnected) return;
  optionen();
  if (!beobachter) { beobachter = new ResizeObserver(zeichnen); beobachter.observe(diagramm); }
  if (!timer) timer = setInterval(() => {
    if (!karte.isConnected) { clearInterval(timer); timer = null; beobachter?.disconnect(); beobachter = null; return; }
    void laden();
  }, 60000);
  if (Date.now() - geladen >= 60000) void laden();
}
addUsageSection(() => {
  // Beim DOM-Abgleich einen Platzhalter zurückgeben, damit der echte Knoten nicht verschoben wird.
  if (karte?.isConnected) return h('section', { 'data-keep': 'verlauf' });
  if (!karte) {
    const schalter = (titel, items, get, set) => h('div', { class: 'seg', role: 'group', 'aria-label': titel }, items.map(([wert, label]) => h('button', {
      type: 'button', class: get() === wert ? 'on' : '', 'aria-pressed': String(get() === wert), onclick: e => {
        set(wert); for (const b of e.currentTarget.parentElement.children) { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }
        index = -1; daten = null; zeichnen(); void laden();
      }
    }, label)));
    auswahl = h('select', { class: 'input', 'aria-label': 'System oder App', onchange: () => { app = auswahl.value; daten = null; index = -1; zeichnen(); void laden(); } });
    diagramm = h('div', { class: 'verlauf-diagramm', tabindex: '0', role: 'group', 'aria-label': 'Nutzungsverlauf. Mit den Pfeiltasten bewegst du den Zeiger.' });
    zahlen = h('div', { class: 'verlauf-zahlen' }); status = h('p', { class: 'verlauf-status', role: 'status' }); legende = h('div', { class: 'verlauf-legende' });
    karte = h('section', { class: 'ucard verlauf', 'data-keep': 'verlauf' }, h('div', { class: 'verlauf-kopf' }, h('h3', {}, 'Verlauf'),
      h('div', { class: 'verlauf-schalter' }, schalter('Zeitraum', [['1h', '1 Std.'], ['24h', '24 Std.'], ['7d', '7 Tage']], () => bereich, v => { bereich = v; }),
        schalter('Messgröße', [['cpu', 'CPU'], ['ram', 'RAM'], ['netz', 'Netzwerk']], () => messung, v => { messung = v; }), auswahl)), legende, diagramm, zahlen, status);
  }
  geladen = 0; requestAnimationFrame(aktivieren);
  return karte;
});
onPoll(() => {
  if (karte?.isConnected) aktivieren();
  else { clearInterval(timer); timer = null; beobachter?.disconnect(); beobachter = null; }
});
