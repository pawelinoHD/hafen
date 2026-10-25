const Hafen = window.Hafen;
const { h, api, icon, toast, dialog, field, state, appIcon, relTime } = Hafen;
Hafen.icons.mtGlocke = '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>';
Hafen.icons.mtWarn = '<path d="M12 3 2 21h20L12 3zM12 9v5M12 17h.01"/>';
Hafen.icons.mtOk = '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>';
Hafen.css(`
.mt-wurzel{position:fixed;top:18px;right:22px;z-index:45;font-family:var(--font)}body:has(.win-wrap) .mt-wurzel{display:none}
.mt-glocke{position:relative;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;cursor:pointer;color:var(--text);background:rgba(22,28,32,.7);border:1px solid var(--line-2);backdrop-filter:blur(24px);box-shadow:0 8px 24px #0003}
.mt-glocke svg{width:21px;height:21px}.mt-zahl{position:absolute;right:-5px;top:-4px;min-width:19px;height:19px;padding:0 4px;border-radius:20px;background:var(--bad,#ef5350);color:white;font-size:10px;font-weight:700;display:grid;place-items:center}
.mt-panel{position:absolute;top:54px;right:0;width:min(420px,calc(100vw - 32px));border-radius:22px;background:rgba(20,25,29,.96);border:1px solid var(--line-2);backdrop-filter:blur(32px);box-shadow:0 24px 70px #0007;overflow:hidden}
.mt-kopf{padding:16px 16px 10px}.mt-kopf b{font-size:17px}.mt-aktionen{display:flex;align-items:center;gap:6px;margin-top:12px}.mt-aktionen .icon-btn{margin-left:auto}.mt-aktionen svg{width:18px;height:18px}
.mt-liste{max-height:min(58vh,560px);overflow:auto;overscroll-behavior:contain;padding:0 10px 12px}.mt-gruppe{font-size:11px;font-weight:600;color:var(--text-3);padding:14px 10px 6px}
.mt-eintrag{display:flex;align-items:flex-start;gap:10px;padding:12px 10px;border-radius:13px}.mt-neu{background:rgba(19,168,178,.09)}.mt-stufe{flex:none;padding-top:1px}.mt-stufe svg{width:19px;height:19px}.mt-info{color:var(--brand-hi)}.mt-ok{color:var(--ok)}.mt-warn{color:var(--warn)}.mt-error{color:var(--bad)}
.mt-inhalt{min-width:0;flex:1;overflow-wrap:anywhere}.mt-inhalt b{font-size:13px;line-height:1.4;display:block}.mt-inhalt p{font-size:12px;color:var(--text-2);white-space:pre-wrap;margin:4px 0;line-height:1.5}.mt-inhalt time{font-size:11px;color:var(--text-3)}.mt-eintrag .ic{flex:none;--s:26px;border-radius:7px;box-shadow:none}.mt-leer{padding:34px 20px;text-align:center;color:var(--text-2);font-size:13px;line-height:1.6}.mt-leer b{display:block;color:var(--text)}
.mt-wackeln svg{animation:mt-wackeln .65s ease-in-out;transform-origin:50% 15%}@keyframes mt-wackeln{20%{transform:rotate(18deg)}40%{transform:rotate(-15deg)}65%{transform:rotate(9deg)}85%{transform:rotate(-4deg)}}
.mt-status{font-size:12px;color:var(--text-2);min-height:1.4em}.mt-wurzel [hidden]{display:none}.mt-wurzel button:focus-visible{outline:2px solid var(--brand-hi);outline-offset:3px}
@media(max-width:760px){.mt-wurzel{right:16px}.mt-glocke{width:36px;height:36px}.mt-glocke svg{width:18px;height:18px}.mt-panel{top:46px}}
@media(prefers-reduced-motion:reduce){.mt-wackeln svg{animation:none}}body.no-motion .mt-wackeln svg{animation:none}
`);

let wurzel, glocke, panel, inhalt, zaehler, offen = false, liste = [], geladen = false;
let zuletzt = 0, laedt = false, markiert = false;
const gesehen = new Set();
const versuch = (fn) => async () => { try { await fn(); } catch (e) { toast(e.message, true); } };

function schliessen(fokus = false) {
  offen = false;
  if (panel) panel.hidden = true;
  glocke?.setAttribute('aria-expanded', 'false');
  if (fokus) glocke?.focus();
}
document.addEventListener('pointerdown', (e) => { if (offen && !wurzel?.contains(e.target)) schliessen(); });
document.addEventListener('keydown', (e) => { if (offen && e.key === 'Escape') schliessen(true); });
window.addEventListener('hashchange', () => schliessen());

function zeichnen() {
  if (!wurzel?.isConnected) return;
  const anzahl = liste.filter((m) => !m.gelesen).length;
  zaehler.textContent = anzahl > 99 ? '99+' : String(anzahl);
  zaehler.hidden = !anzahl;
  glocke.setAttribute('aria-label', `Mitteilungen, ${anzahl} ungelesen`);
  const scroll = inhalt.scrollTop;
  const jetzt = new Date(), gestern = new Date(); gestern.setDate(gestern.getDate() - 1);
  const gruppen = { Heute: [], Gestern: [], Früher: [] };
  for (const m of liste) {
    const tag = new Date(m.zeit).toDateString();
    gruppen[tag === jetzt.toDateString() ? 'Heute' : tag === gestern.toDateString() ? 'Gestern' : 'Früher'].push(m);
  }
  inhalt.replaceChildren(...Object.entries(gruppen).flatMap(([titel, gruppe]) => gruppe.length ? [
    h('div', { class: 'mt-gruppe' }, titel), ...gruppe.map((m) => {
      const app = state.apps.find((a) => a.id === m.app);
      return h('article', { class: `mt-eintrag${m.gelesen ? '' : ' mt-neu'}`, 'data-mt-id': m.id },
        h('span', { class: `mt-stufe mt-${m.stufe}`, 'aria-label': { info: 'Information', ok: 'Erfolg', warn: 'Warnung', error: 'Fehler' }[m.stufe] },
          icon(m.stufe === 'ok' ? 'mtOk' : ['warn', 'error'].includes(m.stufe) ? 'mtWarn' : 'info')),
        h('div', { class: 'mt-inhalt' }, h('b', {}, m.titel), m.text && h('p', {}, m.text),
          h('time', { datetime: new Date(m.zeit).toISOString(), title: new Date(m.zeit).toLocaleString('de-DE') }, relTime(m.zeit))),
        app && appIcon(app, 26));
    }),
  ] : []));
  if (!liste.length) inhalt.append(h('div', { class: 'mt-leer' }, h('b', {}, geladen ? 'Alles ruhig in Deinem Hafen' : 'Mitteilungen werden geladen …'),
    geladen && 'Wenn etwas passiert, erfährst Du es hier.'));
  inhalt.scrollTop = scroll;
}
async function sichtbareLesen() {
  if (!offen || !panel?.isConnected || markiert || document.hidden || document.body.classList.contains('blur')) return;
  const rand = inhalt.getBoundingClientRect();
  const ids = [...inhalt.querySelectorAll('[data-mt-id]')].filter((el) => {
    const r = el.getBoundingClientRect(); return r.bottom > rand.top && r.top < rand.bottom;
  }).map((el) => el.dataset.mtId).filter((id) => liste.some((m) => m.id === id && !m.gelesen));
  if (!ids.length) return;
  markiert = true;
  try {
    await api('/api/mitteilungen/gelesen', { ids });
    for (const m of liste) if (ids.includes(m.id)) m.gelesen = true;
    zeichnen();
  } catch (e) { toast(e.message, true); } finally { markiert = false; }
}
async function laden() {
  if (laedt || !state.status?.loggedIn) return;
  laedt = true; zuletzt = Date.now();
  try {
    const daten = await api('/api/mitteilungen');
    const neue = daten.liste.filter((m) => !m.gelesen && !gesehen.has(m.id));
    if (geladen && neue.length) {
      toast(neue[0].titel);
      if (glocke && !document.body.classList.contains('no-motion') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        glocke.classList.remove('mt-wackeln'); void glocke.offsetWidth; glocke.classList.add('mt-wackeln');
      }
    }
    for (const m of daten.liste) gesehen.add(m.id);
    if (gesehen.size > 1000) { gesehen.clear(); for (const m of daten.liste) gesehen.add(m.id); }
    liste = daten.liste; geladen = true; zeichnen(); await sichtbareLesen();
  } catch { /* Die nächste Abfrage versucht es erneut. */ }
  finally { laedt = false; }
}

async function einstellungen() {
  schliessen();
  const s = await api('/api/mitteilungen/einstellungen');
  const adresse = h('input', { class: 'input', type: 'url', value: s.ntfyUrl, placeholder: s.vorschlagUrl, maxlength: 2048 });
  const thema = h('input', { class: 'input', value: s.thema || s.vorschlagThema, maxlength: 128, autocomplete: 'off', spellcheck: 'false' });
  const stufe = h('select', { class: 'input' }, [['info', 'Alle Mitteilungen'], ['ok', 'Ab Erfolg'], ['warn', 'Ab Warnung'], ['error', 'Nur Fehler']]
    .map(([wert, text]) => h('option', { value: wert, selected: s.abStufe === wert }, text)));
  const status = h('div', { class: 'mt-status', role: 'status' });
  let beschaeftigt = false;
  async function speichern(test) {
    if (beschaeftigt) return;
    beschaeftigt = true; speichernKnopf.disabled = testKnopf.disabled = true;
    try {
      await api('/api/mitteilungen/einstellungen', { ntfyUrl: adresse.value, thema: thema.value, abStufe: stufe.value });
      if (test) { await api('/api/mitteilungen/test', {}); status.textContent = 'Test ausgelöst. Push-Fehler findest Du im Hafen-Protokoll.'; await laden(); }
      else status.textContent = 'Deine Einstellungen sind gespeichert.';
    } catch (e) { status.textContent = e.message; }
    finally { beschaeftigt = false; speichernKnopf.disabled = testKnopf.disabled = false; }
  }
  const speichernKnopf = h('button', { class: 'btn', onclick: () => speichern(false) }, 'Speichern');
  const testKnopf = h('button', { class: 'btn ghost', onclick: () => speichern(true) }, 'Test senden');
  dialog('Mitteilungen', 'Installiere die kostenlose ntfy-App aus Deinem App Store. Abonniere dort dasselbe Thema mit derselben Server-Adresse. Halte das Thema geheim: Wer es kennt, kann Mitteilungen mitlesen oder senden.', {
    extra: h('div', { class: 'wform' }, field('ntfy-Adresse', adresse, `Leer lassen, um Push auszuschalten. Vorschlag: ${s.vorschlagUrl}. localhost funktioniert nur auf dem Hafen-Server; auf Deinem Handy brauchst Du dessen erreichbare Adresse.`),
      field('Thema', thema), field('Push senden', stufe), h('p', {}, '„Test senden“ speichert Deine Eingaben und testet Push unabhängig von der gewählten Stufe.'),
      h('div', { class: 'mt-aktionen' }, testKnopf, speichernKnopf), status),
  });
}
Hafen.addSettingsItem(() => ({ tab: 'system', ic: 'mtGlocke', title: 'Mitteilungen', desc: 'Ereignisse und Push aufs Handy', onclick: versuch(einstellungen) }));
Hafen.addOverlay(() => {
  offen = false;
  zaehler = h('span', { class: 'mt-zahl', hidden: true });
  glocke = h('button', { class: 'mt-glocke', 'aria-label': 'Mitteilungen', 'aria-expanded': 'false', 'aria-controls': 'mt-panel', onclick: versuch(async () => {
    if (offen) return schliessen();
    offen = true; panel.hidden = false; glocke.setAttribute('aria-expanded', 'true'); zeichnen();
    await laden(); await sichtbareLesen();
  }) }, icon('mtGlocke'), zaehler);
  inhalt = h('div', { class: 'mt-liste', onscroll: () => void sichtbareLesen() });
  panel = h('section', { class: 'mt-panel', id: 'mt-panel', hidden: true, 'aria-label': 'Mitteilungen' },
    h('div', { class: 'mt-kopf' }, h('b', {}, 'Mitteilungen'), h('div', { class: 'mt-aktionen' },
      h('button', { class: 'btn ghost small', onclick: versuch(async () => { await api('/api/mitteilungen/gelesen', {}); await laden(); }) }, 'Alle gelesen'),
      h('button', { class: 'btn ghost small', onclick: () => dialog('Mitteilungen leeren', 'Möchtest Du alle Mitteilungen löschen?', {
        confirm: 'Leeren', danger: true, onConfirm: versuch(async () => { await api('/api/mitteilungen/loeschen', {}); await laden(); }),
      }) }, 'Leeren'),
      h('button', { class: 'icon-btn', 'aria-label': 'Mitteilungseinstellungen', onclick: versuch(einstellungen) }, icon('sliders')))), inhalt);
  wurzel = h('div', { class: 'mt-wurzel', 'data-keep': 'mitteilungen' }, glocke, panel);
  queueMicrotask(() => { zeichnen(); if (!geladen) void laden(); });
  return wurzel;
});
Hafen.onPoll(() => { if (Date.now() - zuletzt >= 10000) void laden(); else void sichtbareLesen(); });
