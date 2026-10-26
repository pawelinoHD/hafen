// Haustiere – Pixel-Wesen, die unten über die Startseite laufen und auf Hafen reagieren
const Hafen = window.Hafen;
const { h, state, fmtBytes, dialog } = Hafen;
Hafen.icons.hsTier = '<path d="M5 9h14v8H5zM3 12h2v3H3zM19 12h2v3h-2zM7 17v3M10 17v3M14 17v3M17 17v3M9 12v1M15 12v1"/>';
Hafen.css(`
.hs-wurzel{pointer-events:none}body:has(.win-wrap) .hs-wurzel,body.blur .hs-wurzel,.hs-wurzel[hidden]{display:none}
.hs-tier{position:fixed;z-index:65;left:0;bottom:var(--boden,8px);width:calc(var(--u)*var(--w));--u:4px;pointer-events:auto;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;transform:translateX(-50%)}
.hs-tier.hs-zieht{cursor:grabbing}
.hs-figur{display:block;width:100%;height:calc(var(--u)*var(--hh));transform-origin:50% 100%}.hs-figur svg{display:block;width:100%;height:100%;overflow:visible;shape-rendering:crispEdges}
.hs-schatten{height:var(--u);margin:0 calc(var(--u)*var(--w)*.2);background:#0006;border-radius:1px;transition:opacity .2s,transform .2s}
.hs-schwebend .hs-schatten{position:absolute;left:0;right:0;top:calc(100% + var(--boden) - 8px - var(--u));opacity:.45;border-radius:50%}
.hs-zieht .hs-schatten,.hs-faellt .hs-schatten{opacity:0}
.hs-auge{fill:#111}.hs-figur g,.hs-figur rect{transform-box:fill-box}
.hs-links .hs-figur svg{transform:scaleX(-1)}
.hs-augen{transform-origin:50% 50%;animation:hs-blinzeln 5.5s infinite}.hs-zu{display:none}
.hs-schlaeft .hs-augen{display:none}.hs-schlaeft .hs-zu{display:inline}
.hs-geht .hs-blick{transform:translateX(.6px)}
.hs-geht .hs-bein-a,.hs-zieht .hs-bein-a{animation:hs-schritt .34s steps(1) infinite}.hs-geht .hs-bein-b,.hs-zieht .hs-bein-b{animation:hs-schritt .34s steps(1) -.17s infinite}
.hs-schwanz{transform-origin:100% 100%;animation:hs-wedeln 1.6s ease-in-out infinite}.hs-froh .hs-schwanz,.hs-geht .hs-schwanz{animation-duration:.3s}.hs-schlaeft .hs-schwanz{animation:none}
.hs-geht .hs-figur{animation:hs-wippen .34s steps(1) infinite}
.hs-ruht .hs-figur{animation:hs-atmen 2.4s ease-in-out infinite}
.hs-schlaeft .hs-figur{animation:hs-atmen 4s ease-in-out infinite}
.hs-schwebend .hs-figur{animation:hs-schweben 2.8s ease-in-out infinite}.hs-schwebend.hs-geht .hs-figur{animation-duration:1.6s}
.hs-schwebend .hs-koerper,.hs-schwebend .hs-arm,.hs-schwebend [class^=hs-bein]{opacity:.9}
.hs-zieht .hs-arm{animation:hs-flattern .2s steps(1) infinite}
.hs-froh .hs-arm{animation:hs-flattern .25s steps(1) 4}
.hs-hopst .hs-figur{animation:hs-hopser .44s cubic-bezier(.3,0,.4,1)}
.hs-springt .hs-figur{animation:hs-sprung .55s cubic-bezier(.3,0,.3,1)}
.hs-landet .hs-figur{animation:hs-landen .35s ease-out}
.hs-schwitzt .hs-tropfen{display:inline;animation:hs-tropfen 1.4s ease-in infinite}.hs-tropfen{display:none;fill:#8fd3ff}
@keyframes hs-blinzeln{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}
@keyframes hs-schritt{0%{transform:translateY(0)}50%{transform:translateY(-.7px)}}
@keyframes hs-wedeln{0%,100%{transform:rotate(0)}50%{transform:rotate(-14deg)}}
@keyframes hs-wippen{0%{transform:translateY(0)}50%{transform:translateY(calc(var(--u)*-.5))}}
@keyframes hs-atmen{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.95)}}
@keyframes hs-schweben{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--u)*-2))}}
@keyframes hs-flattern{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes hs-hopser{0%{transform:scale(1.12,.84)}20%{transform:scale(.94,1.08)}50%{transform:translateY(calc(var(--u)*-5)) scale(.96,1.05)}85%{transform:translateY(0) scale(1)}93%{transform:scale(1.1,.88)}100%{transform:scale(1)}}
@keyframes hs-sprung{0%{transform:scale(1.1,.85)}40%{transform:translateY(calc(var(--u)*-9)) scale(.92,1.1)}75%{transform:translateY(0) scale(1)}88%{transform:scale(1.12,.86)}100%{transform:scale(1)}}
@keyframes hs-landen{0%{transform:scale(1.25,.7)}60%{transform:scale(.95,1.06)}100%{transform:scale(1)}}
@keyframes hs-tropfen{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(3px);opacity:0}}
.hs-blase{position:fixed;z-index:75;left:0;bottom:0;transform:translateX(calc(-50% + var(--dx,0px)));width:max-content;max-width:min(240px,calc(100vw - 32px));padding:8px 12px;border-radius:13px;background:rgba(20,25,29,.94);border:1px solid var(--line-2);color:var(--text);font:500 12.5px/1.45 var(--font);box-shadow:0 10px 30px #0005;backdrop-filter:blur(20px);pointer-events:none;opacity:0;transition:opacity .2s,transform .2s}
.hs-blase.an{opacity:1}.hs-blase::after{content:"";position:absolute;left:calc(50% - var(--dx,0px));top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:rgba(20,25,29,.94)}
.hs-blase b{color:var(--text-2);font-weight:600;margin-right:4px}
.hs-zzz{position:absolute;right:-4px;bottom:calc(var(--u)*var(--hh));font:700 12px var(--mono);color:var(--text-2);pointer-events:none;display:none}
.hs-schlaeft .hs-zzz{display:block}.hs-zzz i{position:absolute;font-style:normal;opacity:0;animation:hs-zzz 3s linear infinite}.hs-zzz i:nth-child(2){animation-delay:1s}.hs-zzz i:nth-child(3){animation-delay:2s}
@keyframes hs-zzz{0%{transform:translate(0,0) scale(.7);opacity:0}20%{opacity:1}100%{transform:translate(14px,-30px) scale(1.2);opacity:0}}
.hs-herz{position:absolute;left:50%;bottom:calc(var(--u)*var(--hh));width:16px;height:14px;margin-left:-8px;pointer-events:none;animation:hs-herz 1.1s ease-out forwards}.hs-herz svg{width:100%;height:100%;shape-rendering:crispEdges}
@keyframes hs-herz{0%{transform:translate(0,0) scale(.5);opacity:0}20%{opacity:1;transform:translate(var(--hx),-12px) scale(1)}100%{transform:translate(calc(var(--hx)*2),-46px) scale(.9);opacity:0}}
.hs-tier:focus-visible{outline:2px solid var(--brand-hi);outline-offset:4px;border-radius:4px}
.hs-auswahl{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px;margin-top:6px}
.hs-karte{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px 11px;border-radius:15px;border:1px solid var(--line-2);background:rgba(255,255,255,.03);color:var(--text);font:inherit;cursor:pointer;position:relative;transition:border-color .15s,background .15s}
.hs-karte:hover{background:rgba(255,255,255,.06)}.hs-karte.on{border-color:var(--brand-hi);background:rgba(19,168,178,.12)}
.hs-karte.on::after{content:"✓";position:absolute;top:7px;right:9px;font-size:12px;font-weight:700;color:var(--brand-hi)}
.hs-vorschau{display:grid;place-items:end center;height:52px}.hs-vorschau svg{display:block;width:calc(var(--w)*3.4px);height:calc(var(--hh)*3.4px);overflow:visible;shape-rendering:crispEdges}
.hs-karte b{font-size:13px}.hs-karte small{font-size:11px;color:var(--text-3)}
@media(max-width:760px){.hs-tier{--u:3px}}
`);

const lesen = (k, w) => { try { return localStorage.getItem(k) ?? w; } catch { return w; } };
const schreiben = (k, w) => { try { localStorage.setItem(k, w); } catch { } };
const ruhig = () => document.body.classList.contains('no-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const zufall = (a, b) => a + Math.random() * (b - a);
const eins = (liste) => liste[Math.floor(Math.random() * liste.length)];

// Jede Art: Pixel-Raster (ein Zeichen = ein Pixel, „.“ = leer) und Farbtafel { Zeichen: [Farbe, Gruppe] }.
// Gruppen: arm (flattert), a/b (Beine im Wechselschritt), schwanz (wedelt), auge (blinzelt, schließt sich im Schlaf)
const ARTEN = {
  kruemel: { name: 'Krümel', art: 'Pixelwesen', gang: 'laufen', tempo: 42,
    raster: [
      '..KKKKKKKKKKK..',
      '..KKKKKKKKKKK..',
      '..KKEKKKKKEKK..',
      'RRKKEKKKKKEKKRR',
      'RRKKKKKKKKKKKRR',
      '..KKKKKKKKKKK..',
      '..KKKKKKKKKKK..',
      '...A.B...A.B...',
      '...A.B...A.B...'],
    farben: { K: ['#e08b6d'], R: ['#e08b6d', 'arm'], A: ['#e08b6d', 'a'], B: ['#e08b6d', 'b'], E: ['#111', 'auge'] },
    laute: ['Bip!', 'Ich bin Krümel.', 'Hmm-hmm.'] },
  katze: { name: 'Mia', art: 'Katze', gang: 'laufen', tempo: 50,
    raster: [
      '...........G...G',
      '...........GGGGG',
      'S..........GEGEG',
      'S..........GGNGG',
      'S.GGgGGgGGGGGGG.',
      '.SGGgGGgGGGGGW..',
      '..GGGGGGGGGGGW..',
      '..GGGGGGGGGGGG..',
      '..A.B......A.B..',
      '..A.B......A.B..'],
    farben: { G: ['#a3acb6'], g: ['#7b858f'], W: ['#e6e9ec'], N: ['#ff9db0'], E: ['#2f6b2a', 'auge'], S: ['#a3acb6', 'schwanz'], A: ['#a3acb6', 'a'], B: ['#a3acb6', 'b'] },
    laute: ['Miau.', 'Schnurrrr …', 'Mrrp?', 'Hast Du Thunfisch?'] },
  hund: { name: 'Bello', art: 'Hund', gang: 'laufen', tempo: 58,
    raster: [
      '..........HHHH..',
      '.........OHHHHH.',
      'T........OHHEHHH',
      'T........OHHHHHN',
      '.T.HHHHHHHHHHHH.',
      '..HHHHHHHHHHWW..',
      '..HHHHHHHHHHWW..',
      '..HHHHHHHHHHH...',
      '..A.B.....A.B...',
      '..A.B.....A.B...'],
    farben: { H: ['#c98b4f'], O: ['#7d4f27'], W: ['#f0e2cf'], N: ['#222'], E: ['#111', 'auge'], T: ['#c98b4f', 'schwanz'], A: ['#c98b4f', 'a'], B: ['#c98b4f', 'b'] },
    laute: ['Wuff!', 'Wuff wuff!', 'Gassi?', 'Ich hab einen Container vergraben.'] },
  frosch: { name: 'Quaxi', art: 'Frosch', gang: 'huepfen', tempo: 36,
    raster: [
      '..FFF.....FFF..',
      '.FWWEF...FEWWF.',
      '.FFFFFFFFFFFFF.',
      'FFFFFFFFFFFFFFF',
      'FFFMMMMMMMMMFFF',
      'FFFFFFFFFFFFFFF',
      '.FFLLLLLLLLLFF.',
      'AAA.........BBB'],
    farben: { F: ['#5cb85c'], L: ['#b8e07a'], M: ['#2e6b2e'], W: ['#fff', 'auge'], E: ['#111', 'auge'], A: ['#4a9a4a', 'a'], B: ['#4a9a4a', 'b'] },
    laute: ['Quak.', 'Quaak!', 'Fliegen gibt’s hier keine, oder?', '*hüpf*'] },
  geist: { name: 'Buh', art: 'Geist', gang: 'schweben', tempo: 26, boden: 22,
    raster: [
      '....GGGGG....',
      '..GGGGGGGGG..',
      '.GGGGGGGGGGG.',
      '.GGEGGGGGEGG.',
      '.GGEGGGGGEGG.',
      'RGGGGGMMGGGGR',
      '.GGGGGMMGGGG.',
      '.GGGGGGGGGGG.',
      '.GGGGGGGGGGG.',
      '.AA.BB.AA.BB.',
      '.A...B..A..B.'],
    farben: { G: ['#eef2f8'], M: ['#2a2f45'], E: ['#2a2f45', 'auge'], R: ['#eef2f8', 'arm'], A: ['#eef2f8', 'a'], B: ['#eef2f8', 'b'] },
    laute: ['Buuuh!', 'Hab ich Dich erschreckt?', 'Ich spuke nur im Hintergrund.', 'Wuuuhuuu …'] },
  krabbe: { name: 'Kalle', art: 'Hafenkrabbe', gang: 'laufen', tempo: 48, seitwaerts: true,
    raster: [
      'CC.............CC',
      'C.C...E...E...C.C',
      'CCC...S...S...CCC',
      '.C..KKKKKKKKK..C.',
      '..CKKKKKKKKKKKC..',
      '...KKKKKKKKKKK...',
      '...KKKKKKKKKKK...',
      '..A.B.A...A.B.A..',
      '.A..B..A.A..B..A.'],
    farben: { K: ['#e0533d'], S: ['#e0533d'], C: ['#e0533d', 'arm'], E: ['#111', 'auge'], A: ['#c2412d', 'a'], B: ['#c2412d', 'b'] },
    laute: ['Schnipp schnapp!', 'Willkommen im Hafen!', 'Ahoi!', 'Ich lauf lieber seitwärts.'] },
  schleim: { name: 'Glibber', art: 'Schleim', gang: 'huepfen', tempo: 28,
    raster: [
      '....SSSSS....',
      '..SSSSSSSSS..',
      '.SSHSSSSSSSS.',
      'SSHSESSSESSSS',
      'SSSSESSSESSSS',
      'SSSSSSSSSSSSS',
      'SSSSSSSSSSSSS',
      '.SSSSSSSSSSS.'],
    farben: { S: ['#38c3b5'], H: ['#c9fff7'], E: ['#0d3b3a', 'auge'] },
    laute: ['Blubb.', '*glibber*', 'Ich bin zu 98 % Wasser.', 'Plopp!'] },
};
const GRUPPE = { arm: 'hs-arm', a: 'hs-bein-a', b: 'hs-bein-b', schwanz: 'hs-schwanz' };

// Baut das SVG: gleiche Zeichen nebeneinander werden zu einem Rechteck zusammengefasst
function figurSvg(art) {
  const gruppen = { '': [], arm: [], a: [], b: [], schwanz: [], auge: [], zu: [] };
  art.raster.forEach((zeile, y) => {
    for (let x = 0; x < zeile.length;) {
      const z = zeile[x];
      let n = 1; while (zeile[x + n] === z) n++;
      if (z !== '.') {
        const [farbe, gruppe = ''] = art.farben[z];
        gruppen[gruppe].push(`<rect x="${x}" y="${y}" width="${n}" height="1" fill="${farbe}"${gruppe ? '' : ' class="hs-koerper"'}/>`);
      }
      x += n;
    }
  });
  const w = art.raster[0].length;
  // Geschlossene Augen: Augenlöcher in Hautfarbe füllen, unten ein dunkler Strich
  const haut = art.farben[eineHaut(art)][0];
  for (let x = 0; x < w; x++) {
    const ys = art.raster.map((r, y) => art.farben[r[x]]?.[1] === 'auge' ? y : -1).filter((y) => y >= 0);
    if (!ys.length) continue;
    const oben = Math.min(...ys), unten = Math.max(...ys);
    gruppen.zu.push(`<rect x="${x}" y="${oben}" width="1" height="${unten - oben + 1}" fill="${haut}"/>`, `<rect x="${x - .15}" y="${unten + .3}" width="1.3" height=".45" fill="#111"/>`);
  }
  return `<svg viewBox="0 0 ${w} ${art.raster.length}" aria-hidden="true">${gruppen[''].join('')}`
    + Object.entries(GRUPPE).map(([k, kl]) => gruppen[k].length ? `<g class="${kl}">${gruppen[k].join('')}</g>` : '').join('')
    + `<g class="hs-blick"><g class="hs-augen">${gruppen.auge.join('')}</g></g><g class="hs-zu">${gruppen.zu.join('')}</g>`
    + `<rect class="hs-tropfen" x="${w - 3}" y="-.8" width=".8" height="1.2"/></svg>`;
}
// Häufigste Körperfarbe – damit werden geschlossene Augen überdeckt
function eineHaut(art) {
  const zahl = {};
  for (const r of art.raster) for (const z of r) if (z !== '.' && !art.farben[z][1]) zahl[z] = (zahl[z] || 0) + 1;
  return Object.entries(zahl).sort((a, b) => b[1] - a[1])[0][0];
}
const HERZ = '<svg viewBox="0 0 7 6"><path fill="#ff6b8b" d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/></svg>';

// Auswahl: welche Tiere wohnen auf der Startseite (früher ein einzelner Schalter „hafen-haustier“)
let aktiv;
try { aktiv = JSON.parse(lesen('hafen-haustiere', 'null')); } catch { }
if (!Array.isArray(aktiv)) aktiv = lesen('hafen-haustier', 'an') === 'aus' ? [] : ['kruemel'];
aktiv = aktiv.filter((id) => ARTEN[id]);

let wurzel = null, letzteAktion = Date.now(), cpuHoch = 0, cpuGesagt = 0, letztesTreffen = 0;
const tiere = new Map();
const jobs = new Map();
const VERB = { install: 'installiert', uninstall: 'entfernt', update: 'aktualisiert', stop: 'gestoppt', start: 'gestartet', restart: 'neu gestartet', configure: 'neu eingerichtet' };

class Tier {
  constructor(id) {
    this.id = id; this.art = ARTEN[id];
    this.x = null; this.richtung = 1; this.modus = 'ruht'; this.zug = null;
    this.timer = 0; this.blasenTimer = 0; this.landTimer = 0; this.letzteSprache = 0;
  }
  bauen() {
    const a = this.art;
    this.blase = h('div', { class: 'hs-blase', role: 'status' });
    this.el = h('div', { class: 'hs-tier' + (a.gang === 'schweben' ? ' hs-schwebend' : ''), tabindex: 0, role: 'button', 'aria-label': `${a.name}, Dein Haustier`,
      style: `--w:${a.raster[0].length};--hh:${a.raster.length};--boden:${a.boden || 8}px`,
      onpointerdown: (e) => this.anfassen(e), onpointermove: (e) => this.ziehen(e), onpointerup: (e) => this.loslassen(e), onpointercancel: (e) => this.loslassen(e),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); letzteAktion = Date.now(); this.wecken(); this.freuen(); this.sagen(this.plaudern()); } } },
    h('span', { class: 'hs-zzz', 'aria-hidden': 'true' }, h('i', {}, 'z'), h('i', {}, 'z'), h('i', {}, 'Z')),
    h('span', { class: 'hs-figur', html: figurSvg(a) }), h('div', { class: 'hs-schatten' }));
    if (this.modus === 'zieht' || this.modus === 'faellt') this.modus = 'ruht';
    this.setzeX(this.x ?? zufall(80, Math.max(120, window.innerWidth - 80)));
    this.klassen();
    this.planen(zufall(800, 2500));
    return [this.el, this.blase];
  }
  weg() {
    clearTimeout(this.timer); clearTimeout(this.blasenTimer); clearTimeout(this.landTimer);
    this.el?.remove(); this.blase?.remove();
  }
  klassen() {
    if (!this.el) return;
    for (const m of ['ruht', 'geht', 'schlaeft', 'zieht', 'faellt']) this.el.classList.toggle('hs-' + m, this.modus === m);
    this.el.classList.toggle('hs-links', this.richtung < 0 && !this.art.seitwaerts);
  }
  setzeX(neu, dauer = 0, kurve = 'linear') {
    this.x = Math.min(window.innerWidth - 40, Math.max(40, neu));
    this.el.style.transition = dauer ? `left ${dauer}s ${kurve}` : 'none';
    this.el.style.left = this.x + 'px';
  }
  aktuellesX() { const r = this.el.getBoundingClientRect(); return r.left + r.width / 2; }
  get boden() { return this.art.boden || 8; }

  sagen(text, ms = 4200) {
    if (!this.blase?.isConnected) return;
    this.letzteSprache = Date.now();
    this.blase.replaceChildren(h('b', {}, this.art.name), text);
    this.blase.classList.add('an');
    clearTimeout(this.blasenTimer);
    this.blasenTimer = setTimeout(() => this.blase.classList.remove('an'), ms);
    this.folgen();
  }
  // Die Blase liegt über dem Dock (eigene Ebene) und folgt dem Tier, solange sie zu sehen ist
  folgen() {
    const b = this.blase;
    if (!b?.isConnected || !b.classList.contains('an')) return;
    const r = this.el.getBoundingClientRect(), br = b.getBoundingClientRect(), mitte = r.left + r.width / 2, halb = br.width / 2;
    const dx = mitte - halb < 12 ? 12 - (mitte - halb) : mitte + halb > window.innerWidth - 12 ? window.innerWidth - 12 - (mitte + halb) : 0;
    b.style.left = mitte + 'px';
    b.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    b.style.setProperty('--dx', dx + 'px');
    requestAnimationFrame(() => this.folgen());
  }
  einmal(klasse, ms) {
    if (ruhig()) return;
    this.el.classList.remove(klasse); void this.el.offsetWidth; this.el.classList.add(klasse);
    setTimeout(() => this.el?.classList.remove(klasse), ms);
  }
  herz() {
    if (ruhig()) return;
    const el = h('span', { class: 'hs-herz', html: HERZ, style: `--hx:${Math.round(zufall(-10, 10))}px` });
    this.el.append(el); setTimeout(() => el.remove(), 1200);
  }
  freuen() { this.einmal('hs-springt', 560); this.einmal('hs-froh', 1000); this.herz(); }
  wecken() { if (this.modus === 'schlaeft') { this.modus = 'ruht'; this.klassen(); } }

  plaudern() {
    const sys = state.system, apps = state.apps || [], name = state.status?.name || '';
    const da = apps.filter((a) => a.installed), laufen = da.filter((a) => a.state === 'running');
    const std = new Date().getHours();
    const zeilen = [
      std < 5 ? `Psst, ${name} … eigentlich schlafe ich schon.` : std < 11 ? `Guten Morgen, ${name}!` : std < 14 ? `Mahlzeit, ${name}!`
        : std < 18 ? `Hallo ${name}!` : std < 23 ? `Guten Abend, ${name}!` : `Noch wach, ${name}?`,
      'Ich pass auf Deinen Hafen auf.',
      'Zieh mich ruhig herum – ich fall weich.',
      `${navigator.platform.includes('Mac') ? '⌘K' : 'Strg+K'} öffnet die Suche. Nur so als Tipp.`,
      'Hast Du heute schon ein Backup gemacht?',
      da.length ? `${laufen.length} von ${da.length} Apps laufen gerade.` : `Noch keine Apps? Im App Store warten ${apps.length} Stück.`,
    ];
    if (sys?.mem) zeilen.push(`CPU ${Math.round(sys.cpu)} %, RAM ${fmtBytes(sys.mem.used)}. Alles im grünen Bereich.`);
    if (sys?.uptime > 86400 * 2) zeilen.push(`Der Server läuft seit ${Math.floor(sys.uptime / 86400)} Tagen am Stück. Respekt.`);
    if (laufen.length) zeilen.push(`Ich mag ${eins(laufen).name}.`);
    return Math.random() < .35 ? eins(this.art.laute) : eins(zeilen);
  }

  planen(ms = zufall(2500, 7000)) { clearTimeout(this.timer); this.timer = setTimeout(() => this.handeln(), ms); }
  // Entscheidet, was das Tier als Nächstes tut
  handeln() {
    if (!this.el?.isConnected) return;
    if (this.modus === 'zieht' || this.modus === 'faellt') return this.planen();
    const versteckt = document.hidden || document.body.matches(':has(.win-wrap)');
    const std = new Date().getHours();
    const muede = Date.now() - letzteAktion > 4 * 60_000 || std >= 23 || std < 6;
    if (this.modus === 'schlaeft') return this.planen(zufall(8000, 15000));
    if (muede && Math.random() < .5) { this.modus = 'schlaeft'; this.klassen(); return this.planen(20000); }
    if (versteckt || ruhig() || Math.random() < .4) {
      this.modus = 'ruht';
      if (!versteckt && Math.random() < .25) this.richtung = -this.richtung;
      this.klassen();
      return this.planen();
    }
    const ziel = zufall(60, window.innerWidth - 60);
    if (Math.abs(ziel - this.x) < 40) return this.planen(1000);
    this.richtung = ziel > this.x ? 1 : -1;
    if (this.art.gang === 'huepfen') return this.hopsen(ziel);
    this.modus = 'geht'; this.klassen();
    const dauer = Math.abs(ziel - this.x) / this.art.tempo;
    this.setzeX(ziel, dauer);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.modus === 'geht') { this.modus = 'ruht'; this.klassen(); } this.planen(); }, dauer * 1000 + 50);
  }
  // Frosch und Schleim kommen Sprung für Sprung voran
  hopsen(ziel) {
    if (!this.el?.isConnected || this.modus === 'zieht' || this.modus === 'faellt' || this.modus === 'schlaeft') return;
    this.modus = 'ruht'; this.klassen();
    const rest = ziel - this.x;
    if (Math.abs(rest) < 8 || document.body.matches(':has(.win-wrap)')) return this.planen();
    this.setzeX(this.x + Math.sign(rest) * Math.min(this.art.tempo, Math.abs(rest)), .4, 'cubic-bezier(.3,0,.5,1)');
    this.einmal('hs-hopst', 450);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hopsen(ziel), 450 + zufall(60, 500));
  }

  fallen() {
    this.modus = 'faellt'; this.klassen();
    const hoehe = parseFloat(this.el.style.bottom) - this.boden;
    const schweben = this.art.gang === 'schweben';
    const dauer = schweben ? Math.min(2.2, Math.max(.4, hoehe / 300)) : Math.min(.7, Math.max(.15, Math.sqrt(Math.max(0, hoehe) / 2000)));
    this.el.style.transition = ruhig() ? 'none' : `bottom ${dauer}s ${schweben ? 'ease-in-out' : 'cubic-bezier(.55,0,1,.45)'}`;
    this.el.style.bottom = this.boden + 'px';
    clearTimeout(this.landTimer);
    this.landTimer = setTimeout(() => {
      this.el.style.transition = 'none'; this.el.style.bottom = '';
      this.modus = 'ruht'; this.klassen();
      if (!schweben) this.einmal('hs-landet', 360);
      if (hoehe > 150) this.sagen(schweben ? eins(['Wuuusch.', 'Schwerkraft? Nie gehört.']) : eins(['Uff!', 'Gelandet!', 'Nochmal!', 'Hui!']), 1800);
      this.planen(zufall(1500, 3000));
    }, ruhig() ? 0 : dauer * 1000);
  }
  anfassen(e) {
    if (e.button > 0) return;
    e.preventDefault();
    this.el.setPointerCapture(e.pointerId);
    const r = this.el.getBoundingClientRect();
    this.zug = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: e.clientX - (r.left + r.width / 2), dy: r.bottom - e.clientY, bewegt: false };
  }
  ziehen(e) {
    const zug = this.zug;
    if (!zug || e.pointerId !== zug.id) return;
    if (!zug.bewegt && Math.hypot(e.clientX - zug.sx, e.clientY - zug.sy) < 5) return;
    if (!zug.bewegt) {
      zug.bewegt = true; clearTimeout(this.timer); clearTimeout(this.landTimer);
      this.x = this.aktuellesX(); this.modus = 'zieht'; this.klassen();
      this.sagen(eins(['Huch!', 'Wohin geht’s?', 'Nicht so hoch!', 'Hihi, das kitzelt.', this.art.laute[0]]), 2000);
    }
    const nx = e.clientX - zug.dx;
    if (nx !== this.x) this.richtung = nx > this.x ? 1 : -1;
    this.setzeX(nx);
    this.el.style.bottom = Math.max(this.boden, window.innerHeight - e.clientY - zug.dy) + 'px';
    this.klassen();
  }
  loslassen(e) {
    if (!this.zug || e.pointerId !== this.zug.id) return;
    const bewegt = this.zug.bewegt; this.zug = null;
    letzteAktion = Date.now();
    if (bewegt) return this.fallen();
    // Einfacher Klick: aufwachen, hüpfen, etwas sagen
    if (this.modus === 'schlaeft') { this.wecken(); this.sagen(eins(['Hm? Ich bin wach!', '*gähn* … ja?', 'Ich hab nur kurz die Augen ausgeruht.']), 2600); return this.planen(); }
    this.setzeX(this.aktuellesX()); this.modus = 'ruht'; this.klassen();
    this.freuen(); this.sagen(this.plaudern());
    this.planen(zufall(3000, 6000));
  }
}

// Gleicht die Tiere auf der Startseite mit der Auswahl ab, ohne die übrigen neu aufzubauen
function abgleichen() {
  for (const [id, t] of tiere) if (!aktiv.includes(id)) { t.weg(); tiere.delete(id); }
  if (!wurzel) return;
  wurzel.hidden = !aktiv.length;
  for (const id of aktiv) {
    let t = tiere.get(id);
    if (!t) tiere.set(id, t = new Tier(id));
    if (!t.el?.isConnected) wurzel.append(...t.bauen());
  }
}
const wach = () => [...tiere.values()].filter((t) => t.el?.isConnected);
// Einem zufälligen wachen Tier etwas in den Mund legen
const einTier = () => { const da = wach(); return da.length ? eins(da) : null; };

// Reaktionen auf Hafen: fertige App-Aktionen, hohe CPU-Last – und Tiere, die sich begegnen
Hafen.onPoll(() => {
  const da = wach();
  if (!da.length) return;
  for (const app of state.apps || []) {
    const lief = jobs.get(app.id), laeuft = !!app.job?.running;
    if (laeuft && !lief && app.job.action === 'install') { const t = einTier(); t.wecken(); t.sagen(`${app.name} wird installiert … ich schau zu.`); }
    if (lief && !laeuft) {
      for (const t of da) t.wecken();
      if (app.job?.error) einTier().sagen(`Oh nein, ${app.name} hat nicht geklappt. Schau ins Protokoll.`, 6000);
      else { for (const t of da) t.freuen(); einTier().sagen(`${app.name} ist ${VERB[app.job?.action] || 'fertig'}!`); }
    }
    jobs.set(app.id, laeuft);
  }
  const cpu = state.system?.cpu ?? 0;
  cpuHoch = cpu > 85 ? cpuHoch + 1 : 0;
  for (const t of da) t.el.classList.toggle('hs-schwitzt', cpuHoch >= 3);
  if (cpuHoch === 3 && Date.now() - cpuGesagt > 5 * 60_000) { cpuGesagt = Date.now(); const t = einTier(); t.wecken(); t.sagen(`Puh, die CPU ist bei ${Math.round(cpu)} %!`); }
  const jetzt = Date.now();
  if (da.length > 1 && jetzt - letztesTreffen > 45_000) {
    for (const a of da) for (const b of da) {
      if (a === b || a.modus === 'schlaeft' || b.modus === 'schlaeft' || Math.abs(a.aktuellesX() - b.aktuellesX()) > 50) continue;
      letztesTreffen = jetzt;
      a.sagen(eins([`Hallo ${b.art.name}!`, `Na, ${b.art.name}?`, `Oh, ${b.art.name}!`]), 2600);
      setTimeout(() => { b.sagen(eins(b.art.laute), 2600); if (Math.random() < .5) b.einmal('hs-springt', 560); }, 1400);
      return;
    }
  }
  // Ab und zu von sich aus etwas sagen, aber nicht ständig
  const t = einTier();
  if (t.modus === 'ruht' && jetzt - Math.max(...da.map((d) => d.letzteSprache)) > 3 * 60_000 && jetzt - letzteAktion < 10 * 60_000 && Math.random() < .02) t.sagen(t.plaudern());
});

function auswahl() {
  const karten = Object.entries(ARTEN).map(([id, art]) => {
    const karte = h('button', { class: 'hs-karte' + (aktiv.includes(id) ? ' on' : ''), 'aria-pressed': aktiv.includes(id) ? 'true' : 'false',
      onclick: () => {
        aktiv = aktiv.includes(id) ? aktiv.filter((x) => x !== id) : [...aktiv, id];
        schreiben('hafen-haustiere', JSON.stringify(aktiv));
        karte.classList.toggle('on', aktiv.includes(id)); karte.setAttribute('aria-pressed', aktiv.includes(id));
        abgleichen(); Hafen.update();
      } },
    h('span', { class: 'hs-vorschau', style: `--w:${art.raster[0].length};--hh:${art.raster.length}`, html: figurSvg(art) }),
    h('b', {}, art.name), h('small', {}, art.art));
    return karte;
  });
  dialog('Haustiere', 'Wähle, wer auf Deiner Startseite wohnt – auch mehrere gleichzeitig. Klick sie an, trag sie herum oder lass sie schlafen.', {
    extra: h('div', { class: 'hs-auswahl' }, karten), wide: true,
  });
}
Hafen.addSettingsItem(() => ({ tab: 'system', ic: 'hsTier', title: 'Haustiere', onclick: auswahl,
  desc: aktiv.length ? `${aktiv.map((id) => ARTEN[id].name).join(', ')} ${aktiv.length === 1 ? 'wohnt' : 'wohnen'} auf Deiner Startseite` : 'Gerade wohnt niemand auf Deiner Startseite' }));

Hafen.addOverlay(() => {
  for (const t of tiere.values()) t.weg();
  wurzel = h('div', { class: 'hs-wurzel', 'data-keep': 'haustiere' });
  queueMicrotask(abgleichen);
  return wurzel;
});
window.addEventListener('resize', () => { for (const t of wach()) if (t.x !== null) t.setzeX(t.x); });
