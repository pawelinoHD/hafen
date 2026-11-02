// Ziele: „Was soll dein Hafen tun?“ – führt von der Absicht bis zum eingerichteten Handy
import { qrSvg } from '/qr.js';
const H = window.Hafen;
const { h, api, toast, icon, go, connectHosts } = H;

Object.assign(H.icons, {
  zlFotos: '<rect x="3" y="5" width="18" height="15" rx="3"/><circle cx="9" cy="11" r="2"/><path d="m21 16-5-5-9 9"/>',
  zlFilme: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  zlDateien: '<path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 11a3.5 3.5 0 0 1 0 7z"/>',
  zlDokumente: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6"/>',
  zlWerbung: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6zM9 9l6 6M15 9l-6 6"/>',
  zlPasswoerter: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2"/>',
  zlKochen: '<path d="M7 3v8a2 2 0 0 0 4 0V3M9 3v18M17 3c-2 2-3 5-3 8h3v10"/>',
  zlKi: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="4"/>',
  zlFernzugriff: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9c-3-3-4-6-4-9s1-6 4-9z"/>',
  zlSicherung: '<path d="M4 7c0-2 16-2 16 0v10c0 2-16 2-16 0zM4 7c0 2 16 2 16 0M4 12c0 2 16 2 16 0"/>',
  zlHaken: '<path d="m6 12 4 4 8-8"/>', zlPfeil: '<path d="M9 6l6 6-6 6"/>',
});
const ICON = { fotos: 'zlFotos', filme: 'zlFilme', dateien: 'zlDateien', dokumente: 'zlDokumente', werbung: 'zlWerbung', passwoerter: 'zlPasswoerter', kochen: 'zlKochen', ki: 'zlKi', fernzugriff: 'zlFernzugriff', sicherung: 'zlSicherung' };

H.css(`
.zl-fenster{max-width:980px;margin:auto}.zl-kopf{margin-bottom:22px}.zl-kopf p{color:var(--text-2);margin-top:6px;line-height:1.55;max-width:620px}
.zl-raster{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px}
.zl-karte{display:flex;flex-direction:column;gap:9px;text-align:left;padding:18px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--text);font:inherit;cursor:pointer;transition:background .15s,border-color .15s}
.zl-karte:hover{background:rgba(255,255,255,.06);border-color:var(--line-2)}.zl-karte:focus-visible{outline:2px solid var(--brand-hi);outline-offset:2px}
.zl-karte.fertig{border-color:rgba(70,200,140,.4)}
.zl-symbol{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:rgba(19,168,178,.16);color:var(--brand-hi)}.zl-symbol svg{width:22px;height:22px}
.zl-karte b{font-size:15px}.zl-karte p{font-size:13px;color:var(--text-2);line-height:1.5;flex:1}.zl-karte small{font-size:11.5px;color:var(--text-3)}
.zl-stand{font-size:12px;font-weight:600;color:var(--text-2)}.zl-stand.ok{color:var(--ok)}.zl-stand.an{color:var(--brand-hi)}
.zl-zurueck{display:inline-flex;align-items:center;gap:4px;background:none;border:0;color:var(--text-2);font:inherit;font-size:13px;cursor:pointer;padding:0;margin-bottom:16px}.zl-zurueck svg{width:15px;height:15px;transform:rotate(180deg)}
.zl-titel{display:flex;gap:14px;align-items:center;margin-bottom:8px}.zl-titel h2{font-size:24px}
.zl-hinweis{padding:12px 14px;border-radius:13px;font-size:13px;line-height:1.5;margin:12px 0;overflow-wrap:anywhere;background:rgba(255,190,70,.1);color:var(--warn)}.zl-hinweis.error{background:rgba(240,80,80,.1);color:var(--bad)}.zl-hinweis.info{background:rgba(19,168,178,.1);color:var(--text-2)}
.zl-lauf{display:flex;align-items:center;gap:12px;padding:14px;border-radius:14px;background:rgba(19,168,178,.1);margin:14px 0;font-size:13.5px;line-height:1.5}
.zl-rad{flex:none;width:18px;height:18px;border-radius:50%;border:2.5px solid var(--line-2);border-top-color:var(--brand-hi);animation:zl-dreh .9s linear infinite}@keyframes zl-dreh{to{transform:rotate(360deg)}}
.zl-schritte{display:flex;flex-direction:column;gap:9px;margin-top:18px}.zl-schritt{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.025)}
.zl-haken{flex:none;width:24px;height:24px;margin-top:1px;border-radius:8px;border:1.5px solid var(--line-2);background:none;color:#fff;cursor:pointer;display:grid;place-items:center;padding:0}.zl-haken svg{width:16px;height:16px;opacity:0}.zl-haken[aria-checked=true]{background:var(--ok);border-color:var(--ok)}.zl-haken[aria-checked=true] svg{opacity:1}
.zl-schritt>div{flex:1;min-width:0;font-size:13.5px;line-height:1.55;overflow-wrap:anywhere}.zl-schritt.fertig>div>span{color:var(--text-3)}.zl-schritt .btn{margin-top:9px}
.zl-qr{display:flex;gap:14px;align-items:center;margin-top:11px}.zl-qr-bild{flex:none;width:128px;height:128px;border-radius:10px;overflow:hidden;background:#fff}.zl-qr-bild svg{display:block;width:100%;height:100%}.zl-qr code{font-size:12.5px;overflow-wrap:anywhere}
.zl-mehr{margin-top:24px;font-size:13px;color:var(--text-2);text-align:center}.zl-mehr button{background:none;border:0;color:var(--brand-hi);font:inherit;cursor:pointer;padding:0;text-decoration:underline}
@media(max-width:760px){.zl-titel h2{font-size:20px}}
@media(prefers-reduced-motion:reduce){.zl-rad{animation-duration:3s}}
`);

let daten = null, fehler = '', timer = null, laedt = false, nochmal = false, begruessung = false;
const offen = () => location.hash.split('/')[1] === 'ziele';
async function laden() {
  // Läuft schon eine Abfrage, wäre ihr Ergebnis nach einem Klick veraltet: dann gleich noch eine
  if (laedt) { nochmal = true; return; }
  laedt = true;
  try { daten = await api('/api/ziele'); fehler = ''; } catch (e) { fehler = e.message; }
  finally {
    laedt = false;
    if (nochmal) { nochmal = false; void laden(); } else { H.update(); planen(); }
  }
}
function planen() {
  clearTimeout(timer);
  if (offen()) timer = setTimeout(laden, daten?.ziele.some((z) => z.lauf && !z.lauf.fehler) ? 2000 : 15000);
}
window.addEventListener('hashchange', () => { if (offen()) void laden(); });

const adresse = (a) => `http://${connectHosts()[0]}:${a.port}${a.path || ''}`;
const oeffneApp = (a) => window.open(`${location.protocol}//${location.hostname}:${a.port}${a.path || ''}`, '_blank', 'noopener');
const appVon = (ziel, id) => ziel.appDaten.find((a) => a.id === id);

function stand(z) {
  if (z.lauf && !z.lauf.fehler) return h('span', { class: 'zl-stand an' }, 'Wird eingerichtet …');
  if (z.fertig) return h('span', { class: 'zl-stand ok' }, 'Fertig');
  if (z.eingerichtet) return h('span', { class: 'zl-stand an' }, `${z.erledigt} von ${z.schritte.length} Schritten`);
  return h('span', { class: 'zl-stand' }, z.apps.length ? 'Einrichten' : 'Anleitung ansehen');
}
function uebersicht() {
  return h('div', { class: 'win-body zl-fenster' },
    h('div', { class: 'zl-kopf' }, h('h2', { class: 'win-title' }, 'Was soll dein Hafen tun?'),
      h('p', {}, 'Wähle ein Ziel. Hafen richtet die passende App ein, prüft, ob sie läuft, und führt dich bis zu deinem Handy.')),
    fehler && h('div', { class: 'zl-hinweis error' }, fehler),
    !daten ? h('p', { class: 'muted' }, 'Ziele werden geladen …') : h('div', { class: 'zl-raster' }, daten.ziele.map((z) => h('button', { class: 'zl-karte' + (z.fertig ? ' fertig' : ''), onclick: () => go(`#/ziele/${z.id}`) },
      h('span', { class: 'zl-symbol' }, icon(ICON[z.id])), h('b', {}, z.titel), h('p', {}, z.nutzen), h('small', {}, `Statt: ${z.ersetzt}`), stand(z)))),
    h('p', { class: 'zl-mehr' }, 'Etwas Bestimmtes im Sinn? ', h('button', { onclick: () => go('#/store') }, 'Alle Apps im Store ansehen')));
}
async function haken(z, s, wert) {
  z.haken[s.id] = wert; z.erledigt += wert ? 1 : -1; H.update();
  try { await api('/api/ziele/schritt', { ziel: z.id, schritt: s.id, fertig: wert }); await laden(); } catch (e) { toast(e.message, true); await laden(); }
}
async function starten(z) {
  try { await api('/api/ziele/start', { id: z.id }); await laden(); } catch (e) { toast(e.message, true); await laden(); }
}
function schritt(z, s) {
  const app = (s.app || s.qr) && appVon(z, s.app || s.qr), an = !!z.haken[s.id], url = app && adresse(app);
  return h('div', { class: 'zl-schritt' + (an ? ' fertig' : '') },
    h('button', { class: 'zl-haken', role: 'checkbox', 'aria-checked': String(an), 'aria-label': `Erledigt: ${s.text}`, onclick: () => haken(z, s, !an) }, icon('zlHaken')),
    h('div', {}, h('span', {}, s.text),
      s.app && app?.installed && h('div', {}, h('button', { class: 'btn small', onclick: () => oeffneApp(app) }, `${app.name} öffnen`)),
      s.hash && h('div', {}, h('button', { class: 'btn small ghost', onclick: () => go(s.hash) }, 'Dorthin wechseln')),
      s.qr && app?.installed && h('div', { class: 'zl-qr', 'data-keep': `zl-qr-${url}` },
        h('span', { class: 'zl-qr-bild', html: qrSvg(url) }), h('div', {}, h('code', {}, url), h('p', { class: 'muted', style: 'margin-top:6px;font-size:12px' }, 'Mit der Handy-Kamera scannen. Das Handy muss im selben WLAN sein.')))));
}
function detail(id) {
  const z = daten?.ziele.find((x) => x.id === id);
  if (!z) return h('div', { class: 'win-body zl-fenster' }, h('p', { class: 'muted' }, daten ? 'Dieses Ziel gibt es nicht.' : 'Wird geladen …'));
  const benoetigt = z.braucht && daten.ziele.find((x) => x.id === z.braucht);
  const laeuft = z.lauf && !z.lauf.fehler;
  const hart = z.hinweise.some((x) => x.stufe === 'error');
  return h('div', { class: 'win-body zl-fenster' },
    h('button', { class: 'zl-zurueck', onclick: () => go('#/ziele') }, icon('zlPfeil'), 'Alle Ziele'),
    h('div', { class: 'zl-titel' }, h('span', { class: 'zl-symbol' }, icon(ICON[z.id])), h('h2', {}, z.titel)),
    h('p', { class: 'muted', style: 'line-height:1.55' }, z.nutzen),
    benoetigt && !benoetigt.eingerichtet && h('div', { class: 'zl-hinweis info' }, `Das braucht zuerst „${benoetigt.titel}“. `, h('button', { class: 'btn small ghost', onclick: () => go(`#/ziele/${benoetigt.id}`) }, 'Dorthin wechseln')),
    !z.eingerichtet && z.hinweise.map((x) => h('div', { class: `zl-hinweis ${x.stufe}` }, x.text)),
    z.lauf?.fehler && h('div', { class: 'zl-hinweis error' }, z.lauf.fehler),
    laeuft && h('div', { class: 'zl-lauf', role: 'status' }, h('i', { class: 'zl-rad' }), z.lauf.schritt),
    z.apps.length > 0 && !z.eingerichtet && !laeuft && h('button', { class: 'btn big', style: 'margin-top:12px', disabled: hart || !H.state.docker, onclick: () => starten(z) }, z.lauf?.fehler ? 'Erneut versuchen' : 'Jetzt einrichten'),
    z.apps.length > 0 && !z.eingerichtet && !laeuft && !H.state.docker && h('p', { class: 'muted', style: 'margin-top:8px' }, 'Docker läuft gerade nicht.'),
    !laeuft && (z.eingerichtet || !z.apps.length) && h('div', { class: 'zl-schritte' }, z.schritte.map((s) => schritt(z, s))),
    z.fertig && h('div', { class: 'zl-hinweis info', style: 'margin-top:16px' }, 'Geschafft. Hafen prüft ab jetzt regelmäßig, ob alles läuft.'));
}
H.registerWindow('ziele', { title: 'Ziele', onOpen: laden, render: (args) => (args?.[0] ? detail(args[0]) : uebersicht()),
  dockSvg: '<svg viewBox="0 0 52 52"><defs><linearGradient id="zl-dock" x2="1" y2="1"><stop stop-color="#ffb347"/><stop offset="1" stop-color="#e8590c"/></linearGradient></defs><rect width="52" height="52" rx="13" fill="url(#zl-dock)"/><g fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="26" cy="26" r="14"/><path d="m32 20-3.5 8.5L20 32l3.5-8.5z" fill="white"/></g></svg>' });
H.addSettingsItem(() => ({ tab: 'system', ic: 'zlFernzugriff', title: 'Ziele', desc: 'Was dein Hafen für dich tun soll', onclick: () => go('#/ziele') }));

// Beim allerersten Besuch ohne Apps direkt mit der Frage beginnen statt mit einem leeren Tisch
H.onPoll(() => {
  if (begruessung || !H.state.status?.loggedIn) return;
  begruessung = true;
  void api('/api/ziele').then((d) => {
    daten = d;
    if (!d.begruesst) { void api('/api/ziele/begruesst', {}); if (!d.appsInstalliert && !H.route()[0]) go('#/ziele'); }
  }).catch(() => { });
});
