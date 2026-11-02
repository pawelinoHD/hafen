// Gesundheit: zeigt in einem Satz, ob der Hafen funktioniert, und was als Nächstes zu tun ist
const H = window.Hafen;
const { h, api, toast, icon, go, relTime } = H;
Object.assign(H.icons, {
  geHerz: '<path d="M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>',
  geOk: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>', geWarn: '<path d="M12 3 2 21h20zM12 10v5M12 18h.01"/>', geInfo: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  gePruef: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M8 15h8"/>',
});
const SYMBOL = { ok: 'geOk', warn: 'geWarn', error: 'geWarn', info: 'geInfo' };
H.css(`
.ge-pille{position:fixed;top:18px;left:22px;z-index:45;display:flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:22px;background:rgba(22,28,32,.7);border:1px solid var(--line-2);backdrop-filter:blur(24px);box-shadow:0 8px 24px #0003;color:var(--text);font:600 13px var(--font);cursor:pointer}
body:has(.win-wrap) .ge-pille,body.blur .ge-pille{display:none}.ge-pille i{width:9px;height:9px;border-radius:50%;background:var(--text-3)}.ge-pille.ok i{background:var(--ok)}.ge-pille.warn i{background:var(--warn)}.ge-pille.error i{background:var(--bad)}.ge-pille:focus-visible{outline:2px solid var(--brand-hi);outline-offset:3px}
.ge-fenster{max-width:820px;margin:auto}.ge-kopf{padding:22px;border-radius:20px;border:1px solid var(--line-2);margin-bottom:18px;background:linear-gradient(135deg,rgba(70,200,140,.14),rgba(255,255,255,.02))}.ge-kopf.warn{background:linear-gradient(135deg,rgba(255,190,70,.14),rgba(255,255,255,.02))}.ge-kopf.error{background:linear-gradient(135deg,rgba(240,80,80,.16),rgba(255,255,255,.02))}
.ge-kopf h3{font-size:19px}.ge-kopf p{color:var(--text-2);font-size:13px;margin:6px 0 14px}
.ge-liste{display:flex;flex-direction:column;gap:8px}.ge-punkt{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.025)}
.ge-punkt>svg,.ge-stufe svg{width:20px;height:20px;flex:none}.ge-stufe{flex:none;padding-top:1px}.ge-s-ok{color:var(--ok)}.ge-s-warn{color:var(--warn)}.ge-s-error{color:var(--bad)}.ge-s-info{color:var(--brand-hi)}
.ge-text{flex:1;min-width:0;overflow-wrap:anywhere}.ge-text b{font-size:13.5px;display:block}.ge-text p{font-size:12.5px;color:var(--text-2);margin-top:3px;line-height:1.5}.ge-knopfe{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.ge-reihe{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 0;border-top:1px solid var(--line);font-size:13px}.ge-reihe:first-of-type{border-top:0}.ge-reihe small{display:block;color:var(--text-2);margin-top:2px;line-height:1.45}
.pf-liste{margin-top:10px;max-height:420px;overflow:auto}.pf-zeile{display:flex;align-items:center;gap:10px;padding:8px 2px;border-top:1px solid var(--line);font-size:13px}.pf-zeile b{flex:1;min-width:0}.pf-zeile span{color:var(--text-2);font-size:12px}
.pf-log{white-space:pre-wrap;font:11px/1.45 var(--mono);color:var(--text-2);padding:6px 0 10px;overflow-wrap:anywhere}
@media(max-width:760px){.ge-pille{left:16px;height:36px;padding:0 12px;font-size:12px}}
`);

let daten = null, fehler = '', zuletzt = 0, pille = null, pruef = null;
const offen = (n) => location.hash.split('/')[1] === n;
const wichtig = () => (daten?.punkte || []).filter((p) => p.stufe === 'error' || p.stufe === 'warn');
function satz() {
  if (!daten) return ['', 'Wird geprüft …'];
  const f = daten.punkte.filter((p) => p.stufe === 'error').length, w = wichtig().length;
  if (f) return ['error', f === 1 ? '1 Problem' : `${f} Probleme`];
  if (w) return ['warn', w === 1 ? '1 Hinweis' : `${w} Hinweise`];
  return ['ok', 'Alles in Ordnung'];
}
function pilleZeichnen() {
  if (!pille) return;
  const [k, t] = satz();
  pille.className = `ge-pille ${k}`; pille.replaceChildren(h('i'), t);
  pille.setAttribute('aria-label', `Gesundheit: ${t}`);
}
async function laden(neu) {
  try { daten = neu ? await api('/api/gesundheit/pruefen', {}).then(async () => api('/api/gesundheit')) : await api('/api/gesundheit'); fehler = ''; } catch (e) { fehler = e.message; }
  zuletzt = Date.now(); pilleZeichnen(); H.update();
}
async function aktion(route, body) { try { await api(route, body); await laden(); } catch (e) { toast(e.message, true); } }
function punkt(p) {
  return h('div', { class: 'ge-punkt' }, h('span', { class: `ge-stufe ge-s-${p.stufe}` }, icon(SYMBOL[p.stufe])),
    h('div', { class: 'ge-text' }, h('b', {}, p.titel), h('p', {}, p.text),
      (p.hash || p.aktion || p.quittierbar) && h('div', { class: 'ge-knopfe' },
        p.hash && h('button', { class: 'btn small', onclick: () => go(p.hash) }, 'Ansehen'),
        p.aktion && h('button', { class: 'btn small', onclick: () => aktion(p.aktion.route, p.aktion.body) }, p.aktion.label),
        p.quittierbar && h('button', { class: 'btn small ghost', onclick: () => aktion('/api/gesundheit/quittieren', { id: p.id }) }, 'Erledigt'))));
}
function schalter(label, an, route) {
  return h('button', { class: 'switch' + (an ? ' on' : ''), role: 'switch', 'aria-checked': String(an), 'aria-label': label, onclick: () => aktion(route, { an: !an }) }, h('i'));
}
function fenster() {
  if (!daten) return h('div', { class: 'win-body ge-fenster' }, h('h2', { class: 'win-title' }, 'Gesundheit'), h('p', { class: 'muted' }, fehler || 'Wird geprüft …'));
  const [k, t] = satz(), e = daten.einstellungen;
  return h('div', { class: 'win-body ge-fenster' }, h('h2', { class: 'win-title' }, 'Gesundheit'),
    h('section', { class: `ge-kopf ${k}` }, h('h3', {}, t),
      h('p', {}, `Zuletzt geprüft ${relTime(daten.zeit).replace(/\.$/, '')}. Hafen prüft alle fünf Minuten von selbst.`),
      h('button', { class: 'btn small ghost', onclick: async () => { toast('Prüfung läuft'); await laden(true); } }, 'Jetzt prüfen')),
    h('div', { class: 'ge-liste' }, daten.punkte.map(punkt)),
    h('section', { class: 'box', style: 'margin-top:18px' }, h('h4', {}, 'Automatik'),
      h('div', { class: 'ge-reihe' }, h('div', {}, 'Apps selbst neu starten', h('small', {}, 'Antwortet eine App dreimal in Folge nicht, startet Hafen sie neu, höchstens einmal pro Stunde.')), schalter('Apps selbst neu starten', e.selbstheilung, '/api/gesundheit/selbstheilung')),
      daten.mac && h('div', { class: 'ge-reihe' }, h('div', {}, 'Mac wach halten', h('small', {}, 'Verhindert am Netzteil den Ruhezustand, solange Hafen läuft. Der Bildschirm darf ausgehen.')), schalter('Mac wach halten', e.wach, '/api/gesundheit/wach')),
      h('div', { class: 'ge-reihe' }, h('div', {}, 'Prüfstand', h('small', {}, 'Testet Store-Apps in echtem Docker auf diesem Rechner.')), h('button', { class: 'btn small ghost', onclick: () => go('#/pruefstand') }, 'Öffnen'))));
}
H.registerWindow('gesundheit', { title: 'Gesundheit', hidden: true, render: fenster, onOpen: () => laden() });
H.addSettingsItem(() => { const [k, t] = satz(); return { tab: 'system', ic: 'geHerz', title: 'Gesundheit', desc: 'Prüft regelmäßig, ob alles läuft', onclick: () => go('#/gesundheit'),
  right: h('span', { class: 'row', style: 'gap:7px;font-size:13px' }, h('i', { class: 'dot ' + (k === 'ok' ? 'running' : 'exited') }), t) }; });
H.addOverlay(() => { pille = h('button', { class: 'ge-pille', 'data-keep': 'gesundheit', onclick: () => go('#/gesundheit') }); pilleZeichnen(); return pille; });
H.onPoll(() => { if (H.state.status?.loggedIn && Date.now() - zuletzt > 60000) void laden(); });

// ---------- Prüfstand ----------
async function pruefLaden() {
  try { pruef = await api('/api/pruefstand'); } catch (e) { fehler = e.message; }
  H.update();
  if (offen('pruefstand')) setTimeout(pruefLaden, pruef?.lauf ? 3000 : 20000);
}
async function pruefStart(ids) {
  try { await api('/api/pruefstand/start', { ids }); toast('Prüfstand gestartet'); await pruefLaden(); } catch (e) { toast(e.message, true); }
}
function bericht() {
  const zeilen = Object.entries(pruef.ergebnisse).filter(([, r]) => !r.gebacken).map(([id, r]) => `${r.ok ? 'OK ' : 'FEHLER'} ${id} (${Math.round((r.dauer || 0) / 1000)} s): ${r.text}${r.log ? `\n${r.log}` : ''}`);
  navigator.clipboard?.writeText(zeilen.join('\n')).then(() => toast('Bericht kopiert'), () => toast('Kopieren geht hier nicht', true));
}
function pruefFenster() {
  if (!pruef) return h('div', { class: 'win-body ge-fenster' }, h('h2', { class: 'win-title' }, 'Prüfstand'), h('p', { class: 'muted' }, 'Wird geladen …'));
  const eintraege = Object.entries(pruef.ergebnisse), ok = eintraege.filter(([, r]) => r.ok).length, offenIds = pruef.pruefbar.filter((a) => !pruef.ergebnisse[a.id]);
  const l = pruef.lauf;
  return h('div', { class: 'win-body ge-fenster' }, h('h2', { class: 'win-title' }, 'Prüfstand'),
    h('p', { class: 'muted', style: 'line-height:1.55' }, 'Installiert Apps nacheinander in echtem Docker, wartet bis zu vier Minuten auf eine Antwort, entfernt sie wieder samt Image und notiert das Ergebnis. Deine installierten Apps bleiben unberührt. Das lädt mehrere GB aus dem Netz und läuft ohne dich weiter.'),
    h('section', { class: 'box', style: 'margin-top:16px' },
      l ? [h('div', { class: 'zl-lauf', role: 'status' }, h('i', { class: 'zl-rad' }), `${l.app || 'Vorbereiten'} (${l.fertig + 1} von ${l.gesamt})`),
        h('button', { class: 'btn small ghost', onclick: () => api('/api/pruefstand/stopp', {}).then(pruefLaden) }, 'Nach dieser App stoppen')]
        : h('div', { class: 'ge-knopfe', style: 'margin-top:0' },
          h('button', { class: 'btn', disabled: !offenIds.length || !pruef.docker, onclick: () => pruefStart(offenIds.map((a) => a.id)) }, `Alle ungeprüften (${offenIds.length})`),
          h('button', { class: 'btn ghost', disabled: !pruef.docker || !eintraege.some(([, r]) => !r.ok), onclick: () => pruefStart(eintraege.filter(([, r]) => !r.ok).map(([id]) => id)) }, 'Fehlgeschlagene wiederholen'),
          h('button', { class: 'btn ghost', disabled: !eintraege.length, onclick: bericht }, 'Bericht kopieren'))),
    eintraege.length > 0 && h('section', { class: 'box', style: 'margin-top:16px' }, h('h4', {}, `${ok} von ${eintraege.length} Apps haben geantwortet`),
      h('div', { class: 'pf-liste' }, eintraege.sort(([, a], [, b]) => Number(a.ok) - Number(b.ok)).map(([id, r]) => [
        h('div', { class: 'pf-zeile' }, h('span', { class: `ge-stufe ge-s-${r.ok ? 'ok' : 'error'}` }, icon(r.ok ? 'geOk' : 'geWarn')), h('b', {}, H.state.apps.find((a) => a.id === id)?.name || id), h('span', {}, r.text)),
        r.log && h('div', { class: 'pf-log' }, r.log)]))));
}
H.registerWindow('pruefstand', { title: 'Prüfstand', hidden: true, render: pruefFenster, onOpen: pruefLaden });
let geprueftGeladen = false;
H.onPoll(() => { if (!geprueftGeladen && H.state.status?.loggedIn) { geprueftGeladen = true; void api('/api/pruefstand').then((d) => { pruef = d; H.update(); }).catch(() => { }); } });
H.addAppInfo((app) => {
  const r = pruef?.ergebnisse?.[app.id];
  if (!r) return [h('dt', {}, 'Prüfstand'), h('dd', {}, 'Noch nicht getestet')];
  return [h('dt', {}, 'Prüfstand'), h('dd', {}, r.ok ? 'Läuft (getestet)' : `Fehlgeschlagen: ${r.text}`)];
});
