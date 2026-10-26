// Krümel – ein Pixel-Haustier, das unten über die Startseite läuft und auf Hafen reagiert
const Hafen = window.Hafen;
const { h, state, fmtBytes } = Hafen;
Hafen.icons.hsTier = '<path d="M5 9h14v8H5zM3 12h2v3H3zM19 12h2v3h-2zM7 17v3M10 17v3M14 17v3M17 17v3M9 12v1M15 12v1"/>';
Hafen.css(`
.hs-wurzel{pointer-events:none}body:has(.win-wrap) .hs-wurzel,body.blur .hs-wurzel,.hs-wurzel[hidden]{display:none}
.hs-tier{position:fixed;z-index:65;left:0;bottom:8px;width:calc(var(--u)*15);--u:4px;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;transform:translateX(-50%)}
.hs-tier.hs-zieht{cursor:grabbing}
.hs-figur{display:block;width:100%;height:calc(var(--u)*9);transform-origin:50% 100%}.hs-figur svg{display:block;width:100%;height:100%;overflow:visible;shape-rendering:crispEdges}
.hs-schatten{height:var(--u);margin:0 calc(var(--u)*3);background:#0006;border-radius:1px;transition:opacity .2s,transform .2s}
.hs-zieht .hs-schatten,.hs-faellt .hs-schatten{opacity:0}
.hs-koerper{fill:#e08b6d}.hs-auge{fill:#111}.hs-figur g,.hs-figur rect{transform-box:fill-box}
.hs-links .hs-figur svg{transform:scaleX(-1)}
.hs-augen{transform-origin:50% 50%;animation:hs-blinzeln 5.5s infinite}.hs-zu{display:none}
.hs-schlaeft .hs-augen{display:none}.hs-schlaeft .hs-zu{display:inline}
.hs-geht .hs-blick{transform:translateX(.6px)}
.hs-geht .hs-bein-a,.hs-zieht .hs-bein-a{animation:hs-schritt .34s steps(1) infinite}.hs-geht .hs-bein-b,.hs-zieht .hs-bein-b{animation:hs-schritt .34s steps(1) -.17s infinite}
.hs-geht .hs-figur{animation:hs-wippen .34s steps(1) infinite}
.hs-ruht .hs-figur{animation:hs-atmen 2.4s ease-in-out infinite}
.hs-schlaeft .hs-figur{animation:hs-atmen 4s ease-in-out infinite}
.hs-zieht .hs-arm{animation:hs-flattern .2s steps(1) infinite}
.hs-froh .hs-arm{animation:hs-flattern .25s steps(1) 4}
.hs-springt .hs-figur{animation:hs-sprung .55s cubic-bezier(.3,0,.3,1)}
.hs-landet .hs-figur{animation:hs-landen .35s ease-out}
.hs-schwitzt .hs-tropfen{display:inline;animation:hs-tropfen 1.4s ease-in infinite}.hs-tropfen{display:none;fill:#8fd3ff}
@keyframes hs-blinzeln{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}
@keyframes hs-schritt{0%{transform:translateY(0)}50%{transform:translateY(-.7px)}}
@keyframes hs-wippen{0%{transform:translateY(0)}50%{transform:translateY(calc(var(--u)*-.5))}}
@keyframes hs-atmen{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.95)}}
@keyframes hs-flattern{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes hs-sprung{0%{transform:scale(1.1,.85)}40%{transform:translateY(calc(var(--u)*-9)) scale(.92,1.1)}75%{transform:translateY(0) scale(1)}88%{transform:scale(1.12,.86)}100%{transform:scale(1)}}
@keyframes hs-landen{0%{transform:scale(1.25,.7)}60%{transform:scale(.95,1.06)}100%{transform:scale(1)}}
@keyframes hs-tropfen{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(3px);opacity:0}}
.hs-blase{position:fixed;z-index:75;left:0;bottom:0;transform:translateX(calc(-50% + var(--dx,0px)));width:max-content;max-width:min(240px,calc(100vw - 32px));padding:8px 12px;border-radius:13px;background:rgba(20,25,29,.94);border:1px solid var(--line-2);color:var(--text);font:500 12.5px/1.45 var(--font);box-shadow:0 10px 30px #0005;backdrop-filter:blur(20px);pointer-events:none;opacity:0;transition:opacity .2s,transform .2s}
.hs-blase.an{opacity:1}.hs-blase::after{content:"";position:absolute;left:calc(50% - var(--dx,0px));top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:rgba(20,25,29,.94)}
.hs-zzz{position:absolute;right:-4px;bottom:calc(var(--u)*8);font:700 12px var(--mono);color:var(--text-2);pointer-events:none;display:none}
.hs-schlaeft .hs-zzz{display:block}.hs-zzz i{position:absolute;font-style:normal;opacity:0;animation:hs-zzz 3s linear infinite}.hs-zzz i:nth-child(2){animation-delay:1s}.hs-zzz i:nth-child(3){animation-delay:2s}
@keyframes hs-zzz{0%{transform:translate(0,0) scale(.7);opacity:0}20%{opacity:1}100%{transform:translate(14px,-30px) scale(1.2);opacity:0}}
.hs-herz{position:absolute;left:50%;bottom:calc(var(--u)*9);width:16px;height:14px;margin-left:-8px;pointer-events:none;animation:hs-herz 1.1s ease-out forwards}.hs-herz svg{width:100%;height:100%;shape-rendering:crispEdges}
@keyframes hs-herz{0%{transform:translate(0,0) scale(.5);opacity:0}20%{opacity:1;transform:translate(var(--hx),-12px) scale(1)}100%{transform:translate(calc(var(--hx)*2),-46px) scale(.9);opacity:0}}
.hs-tier:focus-visible{outline:2px solid var(--brand-hi);outline-offset:4px;border-radius:4px}
@media(max-width:760px){.hs-tier{--u:3px}}
`);

const SPEICHER = 'hafen-haustier';
const lesen = (k, w) => { try { return localStorage.getItem(k) ?? w; } catch { return w; } };
const schreiben = (k, w) => { try { localStorage.setItem(k, w); } catch { } };
let an = lesen(SPEICHER, 'an') !== 'aus';
const ruhig = () => document.body.classList.contains('no-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const zufall = (a, b) => a + Math.random() * (b - a);
const eins = (liste) => liste[Math.floor(Math.random() * liste.length)];

// Raster 15 × 9 wie im Vorbild: Körper 11 × 7, Ärmchen, zwei Augen, vier Beine
const FIGUR = `<svg viewBox="0 0 15 9" aria-hidden="true">
<g class="hs-arm"><rect class="hs-koerper" x="0" y="3" width="2" height="2"/><rect class="hs-koerper" x="13" y="3" width="2" height="2"/></g>
<g class="hs-bein-a"><rect class="hs-koerper" x="3" y="6.5" width="1" height="2.5"/><rect class="hs-koerper" x="9" y="6.5" width="1" height="2.5"/></g>
<g class="hs-bein-b"><rect class="hs-koerper" x="5" y="6.5" width="1" height="2.5"/><rect class="hs-koerper" x="11" y="6.5" width="1" height="2.5"/></g>
<rect class="hs-koerper" x="2" y="0" width="11" height="7"/>
<g class="hs-blick"><g class="hs-augen"><rect class="hs-auge" x="4" y="2" width="1" height="2"/><rect class="hs-auge" x="10" y="2" width="1" height="2"/></g></g>
<g class="hs-zu"><rect class="hs-auge" x="3.6" y="3.3" width="1.6" height=".5"/><rect class="hs-auge" x="9.8" y="3.3" width="1.6" height=".5"/></g>
<rect class="hs-tropfen" x="12.2" y="-.8" width=".8" height="1.2"/>
</svg>`;
const HERZ = '<svg viewBox="0 0 7 6"><path fill="#ff6b8b" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/></svg>';

let wurzel, tier, blase, x = null, richtung = 1, modus = 'ruht', zug = null, timer = 0, blasenTimer = 0, landTimer = 0;
let letzteAktion = Date.now(), letzteSprache = 0, cpuHoch = 0, cpuGesagt = 0;
const jobs = new Map();

function klassen() {
  if (!tier) return;
  for (const m of ['ruht', 'geht', 'schlaeft', 'zieht', 'faellt']) tier.classList.toggle('hs-' + m, modus === m);
  tier.classList.toggle('hs-links', richtung < 0);
}
const boden = () => window.innerWidth;
function setzeX(neu, dauer = 0) {
  const rand = 40;
  x = Math.min(boden() - rand, Math.max(rand, neu));
  tier.style.transition = dauer ? `left ${dauer}s linear` : 'none';
  tier.style.left = x + 'px';
}
function aktuellesX() { const r = tier.getBoundingClientRect(); return r.left + r.width / 2; }

function sagen(text, ms = 4200) {
  if (!blase?.isConnected) return;
  letzteSprache = Date.now();
  blase.textContent = text;
  blase.style.setProperty('--dx', '0px');
  blase.classList.add('an');
  clearTimeout(blasenTimer);
  blasenTimer = setTimeout(() => blase.classList.remove('an'), ms);
  folgen();
}
// Die Blase liegt über dem Dock (eigene Ebene) und folgt Krümel, solange sie zu sehen ist
function folgen() {
  if (!blase?.isConnected || !blase.classList.contains('an')) return;
  const r = tier.getBoundingClientRect(), b = blase.getBoundingClientRect(), mitte = r.left + r.width / 2;
  const halb = b.width / 2, dx = mitte - halb < 12 ? 12 - (mitte - halb) : mitte + halb > window.innerWidth - 12 ? window.innerWidth - 12 - (mitte + halb) : 0;
  blase.style.left = mitte + 'px';
  blase.style.bottom = (window.innerHeight - r.top + 10) + 'px';
  blase.style.setProperty('--dx', dx + 'px');
  requestAnimationFrame(folgen);
}
function einmal(klasse, ms) {
  if (ruhig()) return;
  tier.classList.remove(klasse); void tier.offsetWidth; tier.classList.add(klasse);
  setTimeout(() => tier?.classList.remove(klasse), ms);
}
function herz() {
  if (ruhig()) return;
  const el = h('span', { class: 'hs-herz', html: HERZ, style: `--hx:${Math.round(zufall(-10, 10))}px` });
  tier.append(el); setTimeout(() => el.remove(), 1200);
}
function springen() { einmal('hs-springt', 560); einmal('hs-froh', 1000); }

function gruss() {
  const name = state.status?.name || '';
  const std = new Date().getHours();
  return std < 5 ? `Psst, ${name} … eigentlich schlafe ich schon.` : std < 11 ? `Guten Morgen, ${name}!` : std < 14 ? `Mahlzeit, ${name}!`
    : std < 18 ? `Hallo ${name}!` : std < 23 ? `Guten Abend, ${name}!` : `Noch wach, ${name}?`;
}
function plaudern() {
  const sys = state.system, apps = state.apps || [];
  const da = apps.filter((a) => a.installed), laufen = da.filter((a) => a.state === 'running');
  const zeilen = [
    gruss(),
    'Ich pass auf Deinen Hafen auf.',
    'Zieh mich ruhig herum – ich fall weich.',
    `${navigator.platform.includes('Mac') ? '⌘K' : 'Strg+K'} öffnet die Suche. Nur so als Tipp.`,
    'Hast Du heute schon ein Backup gemacht?',
    da.length ? `${laufen.length} von ${da.length} Apps laufen gerade.` : `Noch keine Apps? Im App Store warten ${apps.length} Stück.`,
  ];
  if (sys?.mem) zeilen.push(`CPU ${Math.round(sys.cpu)} %, RAM ${fmtBytes(sys.mem.used)}. Alles im grünen Bereich.`);
  if (sys?.uptime > 86400 * 2) zeilen.push(`Der Server läuft seit ${Math.floor(sys.uptime / 86400)} Tagen am Stück. Respekt.`);
  if (laufen.length) zeilen.push(`Ich mag ${eins(laufen).name}.`);
  return eins(zeilen);
}

function wecken() { if (modus === 'schlaeft') { modus = 'ruht'; klassen(); } }
function planen(ms = zufall(2500, 7000)) { clearTimeout(timer); timer = setTimeout(handeln, ms); }
// Entscheidet, was Krümel als Nächstes tut
function handeln() {
  if (!tier?.isConnected || modus === 'zieht' || modus === 'faellt') return planen();
  const versteckt = document.hidden || document.body.matches(':has(.win-wrap)');
  const std = new Date().getHours();
  const muede = Date.now() - letzteAktion > 4 * 60_000 || std >= 23 || std < 6;
  if (modus === 'schlaeft') return planen(zufall(8000, 15000));
  if (muede && Math.random() < .5) { modus = 'schlaeft'; klassen(); return planen(20000); }
  if (versteckt || ruhig() || Math.random() < .4) {
    modus = 'ruht'; klassen();
    if (!versteckt && Math.random() < .25) richtung = -richtung, klassen();
    return planen();
  }
  const ziel = zufall(60, boden() - 60);
  if (Math.abs(ziel - x) < 40) return planen(1000);
  richtung = ziel > x ? 1 : -1; modus = 'geht'; klassen();
  const dauer = Math.abs(ziel - x) / 42;
  setzeX(ziel, dauer);
  clearTimeout(timer);
  timer = setTimeout(() => { if (modus === 'geht') { modus = 'ruht'; klassen(); } planen(); }, dauer * 1000 + 50);
}

function fallen() {
  modus = 'faellt'; klassen();
  const hoehe = parseFloat(tier.style.bottom) - 8;
  const dauer = Math.min(.7, Math.max(.15, Math.sqrt(Math.max(0, hoehe) / 2000)));
  tier.style.transition = ruhig() ? 'none' : `bottom ${dauer}s cubic-bezier(.55,0,1,.45)`;
  tier.style.bottom = '8px';
  clearTimeout(landTimer);
  landTimer = setTimeout(() => {
    tier.style.transition = 'none'; tier.style.bottom = '';
    modus = 'ruht'; klassen(); einmal('hs-landet', 360);
    if (hoehe > 150) sagen(eins(['Uff!', 'Gelandet!', 'Nochmal!', 'Hui!']), 1800);
    planen(zufall(1500, 3000));
  }, ruhig() ? 0 : dauer * 1000);
}
function anfassen(e) {
  if (e.button > 0) return;
  e.preventDefault();
  tier.setPointerCapture(e.pointerId);
  const r = tier.getBoundingClientRect();
  zug = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - (r.left + r.width / 2), dy: window.innerHeight - e.clientY - (window.innerHeight - r.bottom), bewegt: false };
}
function ziehen(e) {
  if (!zug || e.pointerId !== zug.id) return;
  if (!zug.bewegt && Math.hypot(e.clientX - zug.sx, e.clientY - zug.sy) < 5) return;
  if (!zug.bewegt) {
    zug.bewegt = true; clearTimeout(timer); clearTimeout(landTimer);
    x = aktuellesX(); modus = 'zieht'; klassen();
    sagen(eins(['Huch!', 'Wohin geht’s?', 'Nicht so hoch!', 'Hihi, das kitzelt.']), 2000);
  }
  const nx = e.clientX - zug.dx;
  if (nx !== x) richtung = nx > x ? 1 : -1;
  setzeX(nx);
  tier.style.bottom = Math.max(8, window.innerHeight - e.clientY - zug.dy) + 'px';
  klassen();
}
function loslassen(e) {
  if (!zug || e.pointerId !== zug.id) return;
  const bewegt = zug.bewegt; zug = null;
  letzteAktion = Date.now();
  if (bewegt) return fallen();
  // Einfacher Klick: aufwachen, hüpfen, etwas sagen
  if (modus === 'schlaeft') { wecken(); sagen(eins(['Hm? Ich bin wach!', '*gähn* … ja?', 'Ich hab nur kurz die Augen ausgeruht.']), 2600); return planen(); }
  x = aktuellesX(); setzeX(x); modus = 'ruht'; klassen();
  springen(); herz(); sagen(plaudern());
  planen(zufall(3000, 6000));
}

// Reaktionen auf Hafen: fertige App-Aktionen und hohe CPU-Last
const VERB = { install: 'installiert', uninstall: 'entfernt', update: 'aktualisiert', stop: 'gestoppt', start: 'gestartet', restart: 'neu gestartet', configure: 'neu eingerichtet' };
Hafen.onPoll(() => {
  if (!an || !tier?.isConnected) return;
  for (const app of state.apps || []) {
    const lief = jobs.get(app.id), laeuft = !!app.job?.running;
    if (laeuft && !lief) { wecken(); if (app.job.action === 'install') sagen(`${app.name} wird installiert … ich schau zu.`); }
    if (lief && !laeuft) {
      wecken();
      if (app.job?.error) sagen(`Oh nein, ${app.name} hat nicht geklappt. Schau ins Protokoll.`, 6000);
      else { springen(); herz(); sagen(`${app.name} ist ${VERB[app.job?.action] || 'fertig'}!`); }
    }
    jobs.set(app.id, laeuft);
  }
  const cpu = state.system?.cpu ?? 0;
  cpuHoch = cpu > 85 ? cpuHoch + 1 : 0;
  tier.classList.toggle('hs-schwitzt', cpuHoch >= 3);
  if (cpuHoch === 3 && Date.now() - cpuGesagt > 5 * 60_000) { cpuGesagt = Date.now(); wecken(); sagen(`Puh, die CPU ist bei ${Math.round(cpu)} %!`); }
  // Ab und zu von sich aus etwas sagen, aber nicht ständig
  if (modus === 'ruht' && Date.now() - letzteSprache > 3 * 60_000 && Date.now() - letzteAktion < 10 * 60_000 && Math.random() < .02) sagen(plaudern());
});

Hafen.addSettingsItem(() => ({ tab: 'system', ic: 'hsTier', title: 'Haustier', desc: 'Krümel läuft über Deine Startseite. Klick ihn an oder trag ihn herum.',
  right: h('button', { class: 'switch' + (an ? ' on' : ''), role: 'switch', 'aria-checked': an ? 'true' : 'false', 'aria-label': 'Haustier',
    onclick: (e) => {
      an = !an; schreiben(SPEICHER, an ? 'an' : 'aus');
      e.currentTarget.classList.toggle('on', an); e.currentTarget.setAttribute('aria-checked', an);
      if (wurzel) wurzel.hidden = !an;
      if (an) { x = null; planen(500); }
    } }, h('i')) }));

Hafen.addOverlay(() => {
  blase = h('div', { class: 'hs-blase', role: 'status' });
  tier = h('div', { class: 'hs-tier', tabindex: 0, role: 'button', 'aria-label': 'Krümel, Dein Haustier',
    onpointerdown: anfassen, onpointermove: ziehen, onpointerup: loslassen, onpointercancel: loslassen,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); letzteAktion = Date.now(); wecken(); springen(); herz(); sagen(plaudern()); } } },
  h('span', { class: 'hs-zzz', 'aria-hidden': 'true' }, h('i', {}, 'z'), h('i', {}, 'z'), h('i', {}, 'Z')),
  h('span', { class: 'hs-figur', html: FIGUR }), h('div', { class: 'hs-schatten' }));
  wurzel = h('div', { class: 'hs-wurzel', 'data-keep': 'haustier', hidden: !an }, tier, blase);
  if (modus === 'zieht' || modus === 'faellt') modus = 'ruht';
  queueMicrotask(() => {
    setzeX(x ?? zufall(80, Math.max(120, boden() * .3)));
    klassen();
    if (an) planen(1500);
  });
  return wurzel;
});
window.addEventListener('resize', () => { if (tier?.isConnected && x !== null) setzeX(x); });
